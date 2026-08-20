/**
 * openCartItemDesign() — revenir au design d'un article du panier.
 *
 * Cliquer la miniature dans le drawer ramène le configurateur sur le produit
 * de cette ligne (et sa couleur / sa taille), puis referme le drawer.
 *
 * Ce que ça NE fait PAS : recharger les logos et textes de la ligne. Le panier
 * ne conserve que des URLs d'images composées (item.img / item.sheet) et la
 * liste des assets — pas la géométrie des calques (position, échelle, police,
 * rotation par zone). Reconstituer un design à partir de ces seules données
 * donnerait un résultat approximatif, donc faux. On ramène donc l'utilisateur
 * sur le bon produit ; son travail en cours reste intact.
 *
 * Déporté du template : configurateur.liquid frôle la limite Shopify de 256 Ko.
 */
(function () {
  'use strict';

  /**
   * @returns {object|null} l'article du panier portant cet id.
   *
   * La source est `window.getCartItems()` — le tableau VIVANT du template.
   *
   * Ce code lisait `window.cartItems`, qui n'existe pas : rien ne l'assigne
   * nulle part. Il retombait donc toujours sur sessionStorage, et c'était
   * nuisible. persistCartSafe() y écrit une version ALLÉGÉE des lignes : les
   * data-URLs trop lourdes sont retirées de `img` et de `design.uploads` pour
   * ne pas saturer le quota. Le tiroir affichait donc la version riche (en
   * mémoire) pendant que l'ouverture lisait la version pauvre (en session) —
   * un article rouvrait alors le design du précédent, faute du sien.
   *
   * sessionStorage reste le repli, pour la page Récapitulatif : elle vit hors
   * du template et n'a pas accès au tableau en mémoire.
   */
  function findItem(id) {
    var cart = (typeof window.getCartItems === 'function') ? window.getCartItems() : null;
    if (!Array.isArray(cart)) {
      try { cart = JSON.parse(sessionStorage.getItem('conf_cart') || '[]'); }
      catch (e) { return null; }
    }
    for (var i = 0; i < cart.length; i++) {
      // == et non === : l'id vient d'un attribut HTML (chaîne) côté appelant.
      if (cart[i] && cart[i].id == id) return cart[i];
    }
    return null;
  }

  /** Applique la couleur mémorisée sur la ligne, si elle existe encore. */
  /** @returns {boolean} true si la pastille a été trouvée et cliquée. */
  function applyColor(label) {
    if (!label) return false;
    /* Le libellé stocké est « Couleur : Black » ou « Black » selon le chemin
       d'ajout (commande de groupe vs unitaire) : on ne garde que la valeur. */
    var name = String(label).replace(/^.*:\s*/, '').trim();
    if (!name) return false;

    /* Le nom de la couleur vit dans `title` (pas de data-color sur .cs), et
       `.cg` est cloné dans la barre du canvas : on vise la source, un clic
       sur le clone ne porterait pas le onclick d'origine. */
    var list = document.querySelectorAll('.cg:not(.cv-opt-clone) .cs');
    for (var i = 0; i < list.length; i++) {
      if ((list[i].getAttribute('title') || '').trim() === name) {
        list[i].click();
        return true;
      }
    }
    /* Aucune pastille de ce nom : produit non textile (patch, coin), dont le
       libellé est une suite de détails (« Type : Recto verso · Couleur : … »).
       L'appelant retombe alors sur restoreColor(), qui sait les traiter. */
    return false;
  }

  /** Applique la taille mémorisée, si le bouton existe encore. */
  function applySize(size) {
    if (!size) return;
    var val = String(size).replace(/^.*:\s*/, '').trim();
    if (!val) return;

    /* `.sb` existe en double dans le DOM (original + clone du canvas) : on
       vise l'original, sinon le clic porterait sur une copie inerte. */
    var btns = document.querySelectorAll('.sg:not(.cv-opt-clone) .sb');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === val) { btns[i].click(); return; }
    }
  }

  /**
   * Réinjecte en session le design MÉMORISÉ par la ligne de panier.
   *
   * C'est ce qui rend l'article autonome : son design ne dépend plus de l'état
   * du canvas. Supprimer un logo, réinitialiser ou changer de produit efface la
   * mémoire de travail (`conf_uploads` / `conf_texts`) — la ligne, elle, porte
   * sa propre copie depuis son ajout.
   *
   * Même mécanisme que la restauration d'un design PARTAGÉ
   * (loadSharedDesignThenRestore, conf-main-inline.js) : on repose l'état en
   * session, puis le chemin de restauration habituel le retrouve. On réutilise
   * ses deux normaliseurs plutôt que d'en écrire d'autres.
   *
   * @param {object} item - la ligne de panier
   * @returns {boolean} true si un design a été reposé
   */
  /**
   * @returns {boolean} true si le magasin porte AU MOINS UNE image.
   *
   * Un magasin peut exister sans rien contenir : capturerEtatDesign construit
   * toujours `{_v:2, byProduct:{<produit>:{}}}`, même quand tous ses filtres
   * ont tout écarté. Distinguer « vide » de « absent » est indispensable —
   * l'écrire en session effacerait le design réel.
   */
  function aDesImages(store) {
    if (!store || !store.byProduct) return false;
    return Object.keys(store.byProduct).some(function (p) {
      var zones = store.byProduct[p];
      if (!zones || typeof zones !== 'object') return false;
      return Object.keys(zones).some(function (z) {
        var e = zones[z];
        var src = (typeof e === 'string') ? e : (e && e.src);
        return !!src;
      });
    });
  }

  /**
   * Applique au canvas les zones retenues par reposerEtatDesign, SANS passer
   * par la session.
   *
   * `restoreUploads` relit `conf_uploads` — inaccessible quand l'écriture a
   * dépassé le quota. On repose donc ici le même état depuis la mémoire, avec
   * les fonctions qu'elle emploie elle-même (applyUpload, applyUploadGeo).
   *
   * Idempotent : appelée à chaque passe, elle repose le même état. Sans effet
   * si les zones appartiennent à un autre produit que celui affiché.
   */
  function appliquerUploadsDirect() {
    var u = window.__uploadsAAppliquer;
    if (!u || !u.byProduct) return;
    if (typeof window.applyUpload !== 'function') return;

    var produit = null;
    try { produit = sessionStorage.getItem('conf_current_product'); } catch (e) {}
    var zones = (produit && u.byProduct[produit]) || null;

    /* Produit inconnu : on prend l'unique entrée s'il n'y en a qu'une — le
       design d'une ligne de panier ne concerne qu'un seul produit. */
    if (!zones) {
      var cles = Object.keys(u.byProduct);
      if (cles.length === 1) zones = u.byProduct[cles[0]];
    }
    if (!zones) return;

    Object.keys(zones).forEach(function (zone) {
      var e = zones[zone];
      var src = (typeof e === 'string') ? e : (e && e.src);
      if (!src) return;

      /* Même drapeau que restoreUploads : il indique aux fonctions d'affichage
         qu'il s'agit d'une RESTAURATION, donc qu'elles doivent respecter la
         géométrie enregistrée au lieu de recentrer le motif. */
      window.__restoringUploads = true;
      var geo = (e && typeof e === 'object') ? e.geo : null;
      try {
        window.applyUpload(zone, src);
        if (geo && typeof window.applyUploadGeo === 'function') {
          window.applyUploadGeo(zone, geo);
        }
      } catch (err) {
        console.warn('Zone non appliquée (' + zone + ') :', err);
      } finally {
        window.__restoringUploads = false;
      }

      /* REPRISE AU CHARGEMENT DE L'IMAGE — la géométrie doit avoir le dernier mot.

         placeLogoInZone s'AUTO-REPLANIFIE quand le logo n'est pas encore
         mesurable : elle pose un écouteur `load` qui la rappellera
         (conf-main-inline.js:1626). Cet écouteur se déclenche PLUS TARD, une
         fois `__restoringUploads` retombé — elle recalcule alors la position
         depuis les valeurs de départ de la zone, et la PERSISTE (:1654).

         D'où le défaut observé : le logo apparaissait à la bonne place, puis
         sautait une fraction de seconde plus tard.

         Ce chemin est atteint parce que restoreUploads (:6045) lit la SESSION :
         quand le quota l'a laissée vide, il n'y trouve pas de géométrie et
         appelle placeLogoInZone, qui pose l'écouteur.

         On repose donc la géométrie sur le MÊME événement. Notre écouteur est
         enregistré APRÈS le sien, donc exécuté après : c'est la nôtre qui
         reste. Idempotent — reposer la même valeur est sans effet.

         Rien de partagé avec le bureau n'est modifié : le replacement différé
         garde son rôle légitime au premier dépôt d'un logo. */
      if (!geo || typeof window.applyUploadGeo !== 'function') return;

      /* Les identifiants ne suivent pas tous `logo-<zone>` : le patch est
         `patch-logo`, les coins et drapeaux `coin-logo-recto`,
         `flag-logo-verso`… Même table que applyUploadGeo (conf-share.js:736),
         pour que les deux ne divergent pas. */
      var ID_LOGO = {
        'f': 'logo-f', 'fr': 'logo-fr', 'b': 'logo-b',
        'sl': 'logo-sl', 'sr': 'logo-sr',
        'c': 'patch-logo',
        'coin-recto': 'coin-logo-recto', 'coin-verso': 'coin-logo-verso',
        'flag-recto': 'flag-logo-recto', 'flag-verso': 'flag-logo-verso'
      };
      var el = document.getElementById(ID_LOGO[zone] || ('logo-' + zone));
      var img = el && el.querySelector('img');
      if (!img) return;

      /* GÉOMÉTRIE CIBLE PUBLIÉE — lue par le gardien de conf-mobile.js.

         Elle seule fait foi pendant l'ouverture, quel que soit l'écrivain.
         Sans effet hors mobile : le gardien est son unique lecteur. */
      window.__geoOuverture = window.__geoOuverture || {};
      window.__geoOuverture[zone] = {
        id: el.id, left: geo.left, top: geo.top, width: geo.width
      };

      var reposerGeo = function () {
        var g = window.__geoOuverture && window.__geoOuverture[zone];
        if (!g) return;
        window.__restoringUploads = true;
        try { window.applyUploadGeo(zone, g); }
        finally { window.__restoringUploads = false; }
      };

      /* IMAGE DÉJÀ DÉCODÉE : aucun `load` ne viendra.

         L'ancienne garde sortait ici — or c'est le cas de la SECONDE passe :
         applyUpload y réassigne le même `src`, servi depuis le cache. Plus
         rien ne reposait donc la géométrie, alors que restoreUploads venait
         d'appeler placeLogoInZone, cette fois jusqu'au bout.

         On repose au tour suivant, après ce placement synchrone. */
      if (img.complete && img.naturalWidth > 0) {
        requestAnimationFrame(reposerGeo);
        return;
      }

      /* Écouteur posé UNE SEULE FOIS par image, mais SANS `once` : un même
         `src` peut être rechargé à chaque passe, et l'écouteur doit survivre.
         Le marqueur évite l'empilement — addEventListener ne dédoublonne pas
         deux fonctions distinctes. */
      if (img.dataset.geoPanier !== '1') {
        img.dataset.geoPanier = '1';
        img.addEventListener('load', reposerGeo);
      }
    });
  }

  function reposerEtatDesign(item) {
    /* PURGE de la ligne précédente : sans elle, un article dont le design ne
       peut être lu rouvrirait celui de l'article ouvert juste avant. */
    window.__uploadsAAppliquer = null;
    /* Registre de géométrie purgé avec elle : une ligne précédente ne doit pas
       imposer sa position au design qu'on ouvre. */
    window.__geoOuverture = null;

    /* RÉSERVE MÉMOIRE d'abord, champ persisté ensuite.

       `item.design` ne porte que les images DÉJÀ HÉBERGÉES : les data-URL en
       sont filtrées pour ne pas saturer le quota de session (un drapeau
       recto/verso pèse à lui seul plus que les 5 Mo disponibles). Un client
       qui ajoute au panier avant la fin de l'envoi Cloudinary — quelques
       centaines de millisecondes, le cas courant — voyait donc son design
       capturé vide.

       La réserve comble ce trou : elle vit en MÉMOIRE VIVE, hors de
       sessionStorage, et garde le design complet, data-URL comprises. Le quota
       n'est pas touché. Elle ne survit pas à un rechargement — le champ
       persisté prend alors le relais. */
    var reserve = window.__designsPanier && item && window.__designsPanier[item.id];
    var d = (reserve && aDesImages(reserve.uploads)) ? reserve : (item && item.design);
    if (!d) return false;   // article ajouté avant cette mémorisation

    try {
      if (d.product) sessionStorage.setItem('conf_current_product', d.product);
      if (d.color) sessionStorage.setItem('conf_current_color', JSON.stringify(d.color));
      if (d.patchColor) sessionStorage.setItem('conf_patch_color', JSON.stringify(d.patchColor));
      if (d.coinFinish) sessionStorage.setItem('conf_coin_finish', d.coinFinish);

      /* RÉGLAGES DU DRAPEAU — fond et orientation.

         L'orientation est reposée AVANT la reconstruction du canvas : le
         gabarit du drapeau et le calcul du cadre de rognage
         (conf-flag-cover.js:100) la lisent tous deux sur window. Reposée après,
         un drapeau portrait serait bâti puis recadré comme un paysage. */
      if (d.flagColor) sessionStorage.setItem('conf_flag_color', d.flagColor);
      if (d.flagColorName) sessionStorage.setItem('conf_flag_color_name', d.flagColorName);
      if (d.flagOrientation) window.__flagOrientation = d.flagOrientation;

      /* CONTENU RÉEL exigé — un magasin VIDE ne doit rien écraser.

         `if (d.uploads)` ne suffisait pas : capturerEtatDesign ne renvoie
         jamais null mais `{_v:2, byProduct:{"tshirt":{}}}` quand aucune image
         n'est encore hébergée (upload Cloudinary en cours ou en échec). Or un
         objet vide est truthy : la branche s'exécutait et écrasait
         `conf_uploads`, qui portait pourtant les images du client.

         Le clic DÉTRUISAIT donc le design au lieu de le restaurer —
         restoreUploads relisait un magasin vidé et, purement additive, ne
         reposait rien. */
      if (aDesImages(d.uploads)) {
        /* `d.product` fait foi : le design appartient au produit de la LIGNE,
           pas à celui affiché à l'écran. Les deux normaliseurs sont ceux du
           chemin de partage — migrateUploadStore range un ancien format plat
           sous son produit, sanitizeUploadSrcs filtre les sources. */
        var u = d.uploads;
        if (typeof window.migrateUploadStore === 'function') {
          u = window.migrateUploadStore(u, d.product);
        }
        if (typeof window.sanitizeUploadSrcs === 'function') {
          u = window.sanitizeUploadSrcs(u);
        }

        /* Retenu pour l'APPLICATION DIRECTE au canvas (voir plus bas) : elle
           ne dépend pas de la session, et c'est elle qui fait foi. */
        window.__uploadsAAppliquer = u;

        /* ÉCRITURE VIA writeUploadStore, et son échec n'est plus fatal.

           `setItem` en direct levait une QuotaExceededError sur un design
           lourd — deux images de coin en pleine résolution dépassent à elles
           seules les ~5 Mo de la session. L'exception sortait du `try`, et
           PLUS RIEN n'était reposé : ni les textes, ni le reste.

           writeUploadStore (conf-main-inline.js:5734) sait libérer de la place
           en évinçant les designs des autres produits, puis réessayer.

           Son échec reste toléré : la session ne sert qu'à survivre à un
           rechargement. L'affichage, lui, passe par l'application directe. */
        var ecrit = false;
        if (typeof window.writeUploadStore === 'function') {
          ecrit = window.writeUploadStore(u);
        } else {
          try { sessionStorage.setItem('conf_uploads', JSON.stringify(u)); ecrit = true; }
          catch (e) { ecrit = false; }
        }
        if (!ecrit) {
          console.warn('Design trop lourd pour la session : il sera appliqué ' +
                       'directement au canvas, mais ne survivra pas à un rechargement.');
        }
      }
      if (d.texts) sessionStorage.setItem('conf_texts', JSON.stringify(d.texts));
      return true;
    } catch (e) {
      /* Session illisible ou saturée : on n'interrompt pas l'ouverture. Le
         design ne sera pas rétabli, mais la couleur et la taille le seront —
         mieux vaut un canvas incomplet qu'un clic sans effet. */
      console.warn('Design de la ligne de panier non reposé :', e);
      return false;
    }
  }

  window.openCartItemDesign = function (id) {
    var item = findItem(id);
    if (!item) return;

    if (typeof window.closeCartDrawer === 'function') window.closeCartDrawer();

    /* AVANT toute bascule : la session doit porter le design de cette ligne
       quand selProd et les restaurateurs iront le chercher. */
    reposerEtatDesign(item);

    /* Bascule sur le produit de la ligne en CLIQUANT sa carte : le sidebar
       moderne (.product-card) passe par modernSidebar.selectProduct, qui
       met à jour l'état visuel du panneau AVANT d'appeler selProd(). Appeler
       selProd() directement laisserait la carte précédente cochée.
       `.pt` (ancienne barre de types, masquée) sert de repli. */
    var card = item.productType &&
      (document.querySelector('.product-card[data-product="' + item.productType + '"]') ||
       document.querySelector('.pt[data-product="' + item.productType + '"]'));
    /* NON TEXTILES : le canvas DOIT être reconstruit.

       Coins, drapeaux et patchs voient leur canvas entièrement réécrit
       (conf-dynamic-layout.js:300, :586, :891), et c'est cette réécriture —
       switchLayout — qui rappelle ensuite restoreColor, restoreUploads, les
       repères de zone et les cadres de rognage (:214-235). Elle seule.

       Or elle est gardée par `category !== this.currentCategory` (:148). Le cas
       courant y échappait : le client est déjà sur « Drapeaux » et clique la
       vignette d'un AUTRE drapeau — la catégorie ne change pas, le canvas garde
       le DOM de l'article précédent, et rien n'est restauré.

       Les textiles n'ont pas ce défaut : selProd possède pour eux une branche
       inconditionnelle (conf-main-inline.js:2163) qui rejoue tout à chaque
       appel. Ces trois familles n'ont aucun équivalent — d'où l'asymétrie.

       Remettre la catégorie à null fait voir un changement à la garde. On
       DÉCLENCHE ainsi le restaurateur existant plutôt que d'en écrire un
       second, qui divergerait au premier ajustement. */
    var estTextile = ['sweatshirt', 'tshirt', 'tshirt_polyester']
                       .indexOf(item.productType) !== -1;
    if (!estTextile && window.dynamicLayoutManager) {
      window.dynamicLayoutManager.currentCategory = null;

      /* BUDGET DE REPRISES REMIS À NEUF avant la reconstruction.

         syncCoinCrop et syncFlagCrop se replanifient tant que le canvas n'est
         pas mesurable, mais au plus 20 fois — et ce compteur ne se réarme
         qu'après un succès. Épuisé lors d'un passage antérieur (produit absent,
         canvas pas encore en page), il restait bloqué pour toute la vie de la
         page : le cadre n'était alors plus JAMAIS posé, et le design
         s'affichait hors cadre.

         Le canvas va être reconstruit : le budget doit repartir de zéro, comme
         au chargement de la page. */
      if (typeof window.resetCoinCropRetries === 'function') window.resetCoinCropRetries();
      if (typeof window.resetFlagCropRetries === 'function') window.resetFlagCropRetries();
    }

    var switched = false;
    if (card) {
      /* Signale à l'élagage par produit (conf-main-inline.js) qu'il ne s'agit
         pas d'un changement d'avis : purger les autres produits effacerait les
         designs des autres lignes du panier, que le client peut rouvrir. */
      window.__ouvertureDepuisPanier = true;
      card.click();
      /* Le drapeau N'EST PAS baissé ici : il doit couvrir toute l'ouverture,
         pas seulement le clic. selProd déclenche des travaux DIFFÉRÉS (rendu
         du canvas, restaurations à +60 ms) qui, une fois le drapeau retombé,
         effaçaient le design que les passes ci-dessous venaient reposer.
         Il est levé à la fin de la dernière passe (voir plus bas). */
      switched = true;
    }

    /* Couleur et taille APRÈS le changement de produit : selProd() reconstruit
       ces listes, un clic antérieur serait perdu. Le délai laisse ce rendu se
       terminer — les deux dépendent du produit courant. */
    setTimeout(function () {
      /* Couleur : celle de LA LIGNE DE PANIER, pas celle affichée à l'écran.

         `restoreColor()` était appelée en premier : elle lit conf_current_color,
         soit la DERNIÈRE couleur consultée pour ce produit. Un client qui
         ajoutait un sweat « Natural » au panier puis passait l'écran en
         « Fire Red » retrouvait donc le rouge en cliquant sur sa vignette —
         alors que le panier affichait bien « Natural » à côté.

         Le commentaire précédent justifiait ce choix par le fait que
         `item.color` pouvait diverger du design réellement associé. Cette
         prémisse ne tient plus : depuis la fusion des lignes de panier, un
         article ne peut plus porter qu'une seule couleur, et c'est celle-là
         qui a été commandée.

         `restoreColor()` reste le repli — elle couvre les cas qu'`applyColor`
         ne sait pas traiter (patchs, coins), dont le libellé n'est pas un nom
         de pastille textile. */
      if (!applyColor(item.color) && typeof window.restoreColor === 'function') {
        window.restoreColor();
      }
      applySize(item.size);

      /* Designs de CE produit : logos, positions, textes et leur mise en
         forme (police, couleur, taille). Ils vivent dans conf_uploads /
         conf_texts, tous deux indexés par produit — changer de produit ne
         suffit pas, il faut les réappliquer.
         Même ordre que restoreProductThenUploads() au rechargement de page :
         couleur, puis uploads, puis textes. Différé, car selColor() recharge
         les images du vêtement — un design posé avant serait effacé. */
      /* @param {boolean} premiere - vrai pour la première passe seulement. */
      var reposerDesign = function (premiere) {
        /* COULEUR ET FINITION REJOUÉES à chaque passe.

           `restoreColor` repose conf_patch_color (pastilles du patch et du
           coin) et conf_coin_finish (la finition). Elle n'était appelée qu'une
           fois, plus haut, et seulement en REPLI quand applyColor échouait —
           donc jamais rejouée. Un coin rouvert gardait la finition du
           précédent, et le canvas non textile, reconstruit entre-temps,
           écrasait ce qu'elle avait posé.

           Le chemin du rechargement de page l'appelle deux fois, avant
           restoreUploads (conf-dynamic-layout.js:216). On s'aligne. */
        /* UNE SEULE FOIS — la seconde passe ne la rejoue pas.

           Pour un coin, restoreColor rétablit la finition, ce qui RÉÉCRIT le
           `src` des images du disque (selectCoinFinish, conf-patches.js:350) et
           relance leur chargement. Rejouée à la seconde passe, elle rendait le
           disque non mesurable au moment précis où le cadre allait être posé —
           la restauration se sabotait elle-même.

           Une passe suffit : la couleur et la finition ne sont pas effacées
           entre-temps, contrairement aux logos que les images du vêtement
           peuvent recouvrir. */
        if (premiere && typeof window.restoreColor === 'function') window.restoreColor();

        if (typeof window.restoreUploads === 'function') window.restoreUploads();

        /* APPLICATION DIRECTE — le canvas ne dépend plus de la session.

           restoreUploads lit `conf_uploads`. Or l'écriture y échoue pour un
           design lourd (quota ~5 Mo), et le canvas restait alors vide : c'est
           ce qui vidait les disques du coin, dont les deux images en pleine
           résolution dépassent à elles seules la capacité disponible.

           Le design complet vit en mémoire, dans la réserve de la ligne. Le
           faire transiter par un stockage limité pour l'AFFICHER n'a pas lieu
           d'être : on l'applique ici directement, avec les mêmes fonctions que
           restoreUploads emploie. Aucune limite de taille ne s'y applique.

           Le drapeau échappait au défaut par chance : ses images étaient déjà
           hébergées, donc réduites à des URL de quelques centaines d'octets. */
        appliquerUploadsDirect();

        if (typeof window.restoreTexts === 'function') window.restoreTexts();

        /* CADRES DE ROGNAGE — appel DIRECT, sans attente extérieure.

           Ces deux fonctions savent déjà attendre : elles gardent sur
           `offsetWidth` (l'élément est-il MIS EN PAGE), écoutent le
           chargement de l'image, et se replanifient
           (conf-flag-cover.js:74-87).

           Une attente ajoutée par-dessus les a cassées. Elle testait
           `naturalWidth` — l'image est-elle DÉCODÉE — ce qui n'est pas la même
           chose : la taille du drapeau est appliquée 60 ms plus tard
           (conf-drapeaux.js:201), via des classes CSS posées après
           l'injection. L'image était donc décodée mais pas encore dimensionnée.

           Résultat : un appel unique, trop tôt, sans reprise. La garde interne
           échouait, demandait un nouvel essai, et le quota était déjà épuisé —
           d'où un abandon silencieux et un design affiché hors cadre.

           NE PAS réintroduire d'attente ici : celle de ces fonctions est plus
           fine, et c'est le chemin qu'emprunte déjà le rechargement de page
           (conf-dynamic-layout.js:232-233), qui fonctionne. */
        /* MOBILE — LES DEUX FACES DOIVENT ÊTRE MESURABLES.

           Sur téléphone, une seule face est affichée : l'autre est masquée en
           CSS par `data-face-active` (conf-mobile.css:590-593). Un élément
           masqué n'a pas de boîte — `offsetWidth` vaut 0 — et les fonctions de
           cadrage sortent alors sur leur garde (conf-coin-cover.js:74,
           conf-flag-cover.js:87) en consommant un jeton de leur quota de 20
           reprises, qui ne se réarme qu'après un SUCCÈS.

           La face masquée n'obtenait donc jamais son cadre : son logo n'était
           ni reparenté, ni mis en couverture, ni dimensionné en hauteur. Le CSS
           le rabattait sur une petite vignette hors du disque — ce que le
           client lit comme un logo disparu.

           On lève l'attribut le temps de la mesure, exactement comme le fait
           déjà la CAPTURE (conf-main-inline.js:4001 et :4245). C'est le
           décalque de ce comportement éprouvé, qui manquait côté restauration.

           `void offsetHeight` force le recalcul de mise en page : retirer
           l'attribut ne suffit pas, le navigateur ne remesure qu'au rendu
           suivant. L'ensemble est SYNCHRONE — aucun affichage intermédiaire
           n'est peint, l'écran ne change pas.

           Le quota est réarmé ICI, et non à l'ouverture : il y est déjà
           consommé par la restauration de switchLayout (+250 ms) et par les
           rappels de l'observateur du canvas. */
        var demasquer = function (selecteur, reset, sync) {
          var scene = document.querySelector(selecteur + '[data-face-active]');
          var face = scene ? scene.getAttribute('data-face-active') : null;
          if (scene) { scene.removeAttribute('data-face-active'); void scene.offsetHeight; }
          try {
            if (typeof reset === 'function') reset();
            if (typeof sync === 'function') sync();
          } finally {
            /* L'attribut DOIT revenir, même si la synchronisation échoue :
               resté levé, il laisserait les deux faces visibles côte à côte
               sur un écran de téléphone — un défaut permanent. */
            if (scene && face) scene.setAttribute('data-face-active', face);
          }
        };

        demasquer('.coin-stage', window.resetCoinCropRetries, window.syncCoinCrop);
        demasquer('.flag-stage', window.resetFlagCropRetries, window.syncFlagCrop);
        /* PATCH : il n'a pas de cadre de rognage, donc pas de fonction de
           synchronisation. Son seul recours est clampPatchLogo, et uniquement
           quand aucune géométrie n'a été enregistrée — sans quoi on écraserait
           le recadrage du client. La condition est la même que dans
           conf-share.js : ni `left` ni `top` posés. */
        var pl = document.getElementById('patch-logo');
        if (pl && pl.style.display !== 'none' && !pl.style.left && !pl.style.top &&
            typeof window.clampPatchLogo === 'function') {
          window.clampPatchLogo(true);
        }
        /* FORME ET COULEUR DU PATCH : le canvas reconstruit repart du gabarit
           par défaut. Sans cet appel, un patch rouvert perd sa forme et sa
           teinte, même si son logo est bien restauré. */
        if (typeof window.updatePatchShapeImg === 'function') window.updatePatchShapeImg();

        /* Repères de zone : alignés sur ce qui est réellement posé.
           `refreshZoneGuides` ne couvre que les TEXTILES — les trois familles
           non textiles ont chacune la leur (conf-dynamic-layout.js:222-227).
           Sans elles, une face restaurée gardait ses pointillés « zone vide »
           par-dessus le design. */
        if (typeof window.refreshZoneGuides === 'function') window.refreshZoneGuides();
        if (typeof window.updateCoinZoneGuides === 'function') window.updateCoinZoneGuides();
        if (typeof window.updateFlagZoneGuides === 'function') window.updateFlagZoneGuides();
        if (typeof window.updatePatchZoneGuide === 'function') window.updatePatchZoneGuide();
      };

      /* Le design est reposé DEUX FOIS, à 260 ms puis à 700 ms.

         Changer de couleur recharge les images du vêtement
         (updateProductImages), de façon ASYNCHRONE — `new Image().onload`. Le
         délai unique de 260 ms était donc un pari : sur un cache vide ou une
         connexion lente, les images arrivaient APRÈS la restauration et
         effaçaient logos et textes. Le client retrouvait la bonne couleur,
         mais un vêtement nu.

         Le second passage rattrape ce cas. Il est sans effet quand le premier
         a suffi : restoreUploads et restoreTexts relisent la session et
         reposent le même état — ils sont idempotents. */
      /* NON TEXTILES : les deux passes sont DÉCALÉES.

         Leur canvas est réinjecté par switchLayout, qui lance sa propre
         restauration 250 ms APRÈS l'injection. Nos passes partent, elles, du
         clic sur la carte : à 260 ms elles arrivaient pendant ou avant celle-ci
         et se faisaient écraser. Pire, syncFlagCrop sortait sur son garde
         `!wrap.offsetWidth` (conf-flag-cover.js:75) — le canvas n'existait pas
         encore — en épuisant ses réessais sans jamais aboutir.

         On passe donc APRÈS switchLayout, en gardant deux passes : la première
         pose le design, la seconde rattrape les images arrivées entre-temps. */
      setTimeout(function () { reposerDesign(true); }, estTextile ? 260 : 560);
      setTimeout(function () {
        /* `finally` : le drapeau DOIT retomber, même si une passe échoue.
           Resté levé, il neutraliserait durablement restoreLogosForProduct et
           la branche d'effacement des textes — le configurateur cesserait de
           nettoyer le canvas d'un produit à l'autre.

           Il est baissé APRÈS la dernière passe : sans cela, les restaurateurs
           destructifs reprenaient la main entre deux passes et vidaient le
           canvas que celles-ci venaient de repeupler. */
        /* Le drapeau ne retombe PAS dans le même instant que la dernière passe.

           Les observateurs de conf-mobile.js livrent leurs notifications de
           façon DIFFÉRÉE — même mécanique que celle déjà documentée pour le
           verrou de geste (conf-mobile.js:738-742). Les modifications produites
           par cette passe leur parvenaient donc APRÈS elle, drapeau déjà
           retombé : la garde de reflowLogos les laissait passer, et le logo
           était replacé.

           La marge est volontairement large : ce drapeau n'empêche que des
           replacements automatiques, jamais une action du client. */
        try { reposerDesign(false); }
        finally {
          setTimeout(function () { window.__ouvertureDepuisPanier = false; }, 400);
        }
      }, estTextile ? 700 : 1000);
    }, switched ? 220 : 0);
  };
})();
