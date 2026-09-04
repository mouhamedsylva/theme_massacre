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
   *
   * @param {string} [produit] - N'examiner QUE ce produit.
   *
   * Sans lui, la garde répondait « oui » dès qu'un produit QUELCONQUE portait
   * une image. Or une ligne de panier embarque le magasin ENTIER, tous
   * produits confondus (capturerEtatDesign recopie `conf_uploads` tel quel).
   * Un t-shirt dont les images avaient été filtrées passait donc la garde
   * grâce au sweatshirt resté dedans : on écrivait un magasin où le produit
   * de la ligne était ABSENT. restoreUploads, purement additive, ne reposait
   * alors rien — et l'écriture avait au passage écrasé le design en cours.
   */
  function aDesImages(store, produit) {
    if (!store || !store.byProduct) return false;
    var aDesSrc = function (zones) {
      if (!zones || typeof zones !== 'object') return false;
      return Object.keys(zones).some(function (z) {
        var e = zones[z];
        var src = (typeof e === 'string') ? e : (e && e.src);
        return !!src;
      });
    };
    if (produit) return aDesSrc(store.byProduct[produit]);
    return Object.keys(store.byProduct).some(function (p) {
      return aDesSrc(store.byProduct[p]);
    });
  }

  /**
   * Restreint un magasin au seul produit voulu, puis le FUSIONNE dans celui
   * déjà en session.
   *
   * Deux raisons de ne pas écrire le magasin de la ligne tel quel :
   *   • il porte les designs des AUTRES produits, figés au moment de l'ajout —
   *     les reposer ferait resurgir un travail que le client a peut-être
   *     modifié ou abandonné depuis ;
   *   • l'écriture écrasait le magasin de travail, donc le design en cours sur
   *     les produits que cette ligne ne concerne pas.
   *
   * @returns {object|null} le magasin fusionné, ou null si rien à reposer.
   */
  function fusionnerPourProduit(store, produit, lireExistant) {
    if (!store || !store.byProduct || !produit) return null;
    var zones = store.byProduct[produit];
    if (!zones || !Object.keys(zones).length) return null;

    var existant = null;
    try { existant = lireExistant(); } catch (e) { existant = null; }
    if (!existant || typeof existant !== 'object') existant = {};

    var fusion = { _v: 2, byProduct: {} };
    var source = (existant.byProduct && typeof existant.byProduct === 'object')
      ? existant.byProduct : {};
    Object.keys(source).forEach(function (p) { fusion.byProduct[p] = source[p]; });
    fusion.byProduct[produit] = zones;   // la ligne fait foi POUR SON produit
    return fusion;
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

    /* TRACE TEMPORAIRE — à retirer une fois la position confirmée.
       Dit si la géométrie parvient jusqu'ici, et sous quelle forme. */
    try {
      var diag = '(aucun upload en mémoire)';
      if (u && u.byProduct) {
        diag = Object.keys(u.byProduct).map(function (p) {
          var zs = u.byProduct[p] || {};
          return p + '{' + Object.keys(zs).map(function (z) {
            var e = zs[z];
            var g = (e && typeof e === 'object') ? e.geo : null;
            return z + ':' + (g ? ('geo ' + g.left + '/' + g.top + '/' + g.width) : 'SANS-GEO');
          }).join(', ') + '}';
        }).join(' | ');
      }
      console.log('[ouverture] ' + diag);
    } catch (e) {}

    if (!u || !u.byProduct) return;
    if (typeof window.applyUpload !== 'function') return;

    var produit = null;
    try { produit = sessionStorage.getItem('conf_current_product'); } catch (e) {}
    var zones = (produit && u.byProduct[produit]) || null;

    /* Produit de la LIGNE d'abord — mémorisé par reposerEtatDesign.

       Le repli ne jouait que si le magasin comptait UNE seule entrée, sur la
       foi d'un commentaire qui affirmait qu'« une ligne de panier ne concerne
       qu'un seul produit ». C'est faux : capturerEtatDesign recopie le magasin
       entier, tous produits confondus. Dès que le client avait travaillé sur
       deux produits, le repli abandonnait et rien n'était posé. */
    if (!zones && window.__produitOuverture) {
      zones = u.byProduct[window.__produitOuverture] || null;
    }

    /* PLUS DE REPLI SUR « L'UNIQUE ENTRÉE ».

       Il prenait les zones du seul produit présent quand aucune ne
       correspondait — au motif qu'une ligne de panier ne concerne qu'un
       produit. Mais le magasin est fusionné et le produit courant pouvait être
       faux : ce repli posait alors l'image d'une AUTRE ligne, sans rien
       signaler.

       Le produit de la ligne vient maintenant de `item.productType`, fiable.
       Ne rien poser est le bon comportement quand il n'y a rien pour ce
       produit — deviner ne peut plus qu'afficher le mauvais design. */
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

  /* Table partagée des identifiants de calque. Les zones ne suivent pas
     toutes `logo-<zone>` : le patch est `patch-logo`, les coins et drapeaux
     `coin-logo-recto`… Même table qu'applyUploadGeo (conf-share.js:736), pour
     que les deux ne divergent pas. Déclarée AVANT ses lecteurs. */
  var ID_LOGO_ZONES = {
    'f': 'logo-f', 'fr': 'logo-fr', 'b': 'logo-b',
    'sl': 'logo-sl', 'sr': 'logo-sr',
    'c': 'patch-logo',
    'coin-recto': 'coin-logo-recto', 'coin-verso': 'coin-logo-verso',
    'flag-recto': 'flag-logo-recto', 'flag-verso': 'flag-logo-verso'
  };

  /* ══════════════════════════════════════════════════════════════════════
     LECTURE DE L'INSTANTANÉ DE LIGNE — la source unique.

     Remplace `reposerEtatDesign` et ses trois heuristiques (`aDesImages`,
     `fusionnerPourProduit`, `trouverProduitPorteur`), conservées plus bas
     uniquement pour les lignes ajoutées AVANT l'existence de l'instantané.

     Toutes les questions difficiles — quel produit, quel design, quelles
     zones — ont été tranchées À L'AJOUT, une fois, avec l'information
     complète (capturerSnapshot, conf-main-inline.js). Ici on ne choisit
     plus rien : on lit et on applique.
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * Renvoie l'instantané d'une ligne, ou null si elle n'en a pas.
   *
   * UN OU LOGIQUE, PAS UN ARBITRAGE. La mémoire vive et le miroir persisté
   * ont la MÊME FORME au filtre `srcHeberge` près (alegerSnapshot) : le
   * premier trouvé est donc le meilleur disponible par construction. On ne
   * compare jamais leurs contenus — c'est cette comparaison qui produisait
   * les incohérences.
   */
  function lireSnapshot(item) {
    if (!item) return null;
    var snap = (window.__snapshotsPanier || {})[item.id] || item.snapshot || null;
    if (!snap || snap.v !== 3) return null;   // ligne antérieure à l'instantané
    return snap;
  }

  /**
   * Applique un instantané au canvas, sans passer par la session.
   *
   * Même rôle qu'appliquerUploadsDirect, mais sur une source PLATE et
   * MONO-PRODUIT : plus de `byProduct`, plus de produit à deviner, plus de
   * repli sur « l'unique entrée ».
   *
   * Idempotente : appelée à chaque passe, elle repose le même état.
   */
  function appliquerSnapshotDirect() {
    var snap = window.__snapshotOuverture;
    if (!snap || !snap.zones) return;
    if (typeof window.applyUpload !== 'function') return;

    /* Le produit affiché doit être celui de l'instantané : sinon les zones
       viseraient des calques qui n'existent pas encore (bascule en cours). */
    var produitEcran = null;
    try { produitEcran = sessionStorage.getItem('conf_current_product'); } catch (e) {}
    if (produitEcran && snap.produit && produitEcran !== snap.produit) return;

    /* ── PURGE APRÈS BASCULE, UNE SEULE FOIS ────────────────────────────────

       Elle complète celle de `poserSnapshot`, qui s'abstient quand le produit
       affiché n'est pas celui de la ligne. Ici la bascule a eu lieu :
       `currentProductType` vaut celui de l'instantané, et `rmUp` opère donc
       sur les bonnes zones.

       C'est aussi la SEULE purge qui agit pour les coins, drapeaux et patchs :
       leurs calques sont injectés par switchLayout, donc inexistants avant la
       bascule — `rmUp` n'y trouvait rien à retirer.

       UNE SEULE FOIS PAR OUVERTURE : cette fonction est appelée à chaque
       passe (deux au minimum). Purger à chaque tour effacerait les zones que
       la passe précédente vient de poser.

       Le drapeau vit sur `window`, PAS sur l'instantané : celui-ci est
       l'objet conservé dans `__snapshotsPanier`, réutilisé à chaque
       réouverture de la ligne. L'y poser aurait empêché toute purge dès la
       deuxième ouverture du même article. Il est remis à false par
       `poserSnapshot`, au début de chaque ouverture. */
    if (!window.__purgeFaite) {
      window.__purgeFaite = true;
      if (typeof window.purgerZonesHorsInstantane === 'function') {
        window.purgerZonesHorsInstantane(snap.zones);
      }
      /* Les lignes de TEXTE du récapitulatif suivent la même clôture : `rmUp`
         ne les connaît pas, elles n'étaient purgées par personne. */
      if (typeof window.purgerLignesTexteRecap === 'function') {
        window.purgerLignesTexteRecap(
          (snap.textes && snap.produit && snap.textes[snap.produit]) || {}
        );
      }
    }

    Object.keys(snap.zones).forEach(function (zone) {
      var e = snap.zones[zone];
      var src = e && e.src;
      if (!src) return;
      var geo = e.geo || null;

      /* Même drapeau que restoreUploads : il signale aux fonctions
         d'affichage qu'il s'agit d'une RESTAURATION, donc qu'elles doivent
         respecter la géométrie enregistrée au lieu de recentrer le motif. */
      window.__restoringUploads = true;
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

      /* ── REPRISE AU CHARGEMENT — mécanisme REPRIS TEL QUEL ──────────────
         Voir appliquerUploadsDirect pour le détail : placeLogoInZone
         s'auto-replanifie sur `load` et repose une géométrie recalculée.
         On repose la nôtre sur le MÊME événement, enregistrée après la
         sienne, donc exécutée après. Durement acquis, ne pas simplifier. */
      if (!geo || typeof window.applyUploadGeo !== 'function') return;

      var el = document.getElementById(ID_LOGO_ZONES[zone] || ('logo-' + zone));
      var img = el && el.querySelector('img');
      if (!img) return;

      /* Géométrie cible publiée — lue par le gardien de conf-mobile.js. */
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

      if (img.complete && img.naturalWidth > 0) {
        requestAnimationFrame(reposerGeo);
        return;
      }
      if (img.dataset.geoPanier !== '1') {
        img.dataset.geoPanier = '1';
        img.addEventListener('load', reposerGeo);
      }
    });
  }

  /**
   * Prépare l'ouverture d'une ligne depuis son instantané.
   *
   * @returns {boolean} true si l'instantané a été posé, false s'il n'y en a
   *   pas (la ligne est alors traitée par `reposerEtatDesign`, en repli).
   */
  function poserSnapshot(item) {
    var snap = lireSnapshot(item);
    if (!snap) return false;

    /* PURGE de la ligne précédente — mêmes raisons qu'en tête de
       reposerEtatDesign : laissées en place, ces variables feraient lire
       l'entrée d'un article ouvert juste avant. */
    window.__snapshotOuverture = null;
    window.__geoOuverture = null;
    /* La purge d'après-bascule doit rejouer à CHAQUE ouverture, y compris à
       la deuxième ouverture du même article. */
    window.__purgeFaite = false;

    try {
      /* ═══ CLÔTURE — LES ZONES DE L'INSTANTANÉ, ET RIEN D'AUTRE ══════════

         Sans cela, la restauration est purement ADDITIVE : elle pose les
         zones de la ligne par-dessus ce qui traîne, sans jamais rien retirer.
         Deux t-shirts, l'un avec un dos, l'autre sans → rouvrir celui sans
         dos affichait le dos de l'autre.

         La source du résidu est `conf_cloud_urls` (conf-main-inline.js:7689),
         que `restoreUploads` ajoute à ses zones et qui n'est PAS indexé par
         ligne. `rmUp` l'efface pour les zones purgées — c'est voulu.

         ⚠️ VARIANTE PRUDENTE — on ne purge QUE si le produit affiché est
         celui de la ligne.

         `rmUp` opère sur `currentProductType`, la variable JS, pas sur la
         session. À cet instant elle désigne encore le produit AFFICHÉ. Purger
         un autre produit détruirait un design de travail que le client n'a
         pas commandé et n'a aucun moyen de récupérer.

         Quand les produits diffèrent, la purge d'après-bascule (dans
         `appliquerSnapshotDirect`) fait le travail : à ce moment
         `currentProductType` vaut bien celui de la ligne. */
      if (typeof window.purgerZonesHorsInstantane === 'function' &&
          snap.produit && window.currentProductType === snap.produit) {
        window.purgerZonesHorsInstantane(snap.zones);
      }

      /* Le produit de l'instantané pilote TOUS les restaurateurs. Il vient de
         `item.productType`, posé à l'ajout : il ne peut plus diverger. */
      if (snap.produit) sessionStorage.setItem('conf_current_product', snap.produit);

      /* ═══ LA COULEUR DE LA LIGNE PRIME SUR CELLE DE L'INSTANTANÉ ═══════

         Seule valeur où la ligne bat l'instantané, et c'est délibéré.

         `snap.couleur` recopie `conf_current_color` — la couleur de l'ÉCRAN
         au moment de l'ajout. Pour une commande de GROUPE, elle ne porte que
         la teinte commune, alors que chaque ligne a la sienne. La poser
         ferait rouvrir en rose un t-shirt violet.

         Le repli sur l'instantané sert aux articles dont le libellé n'est pas
         un nom de pastille — patchs, coins, drapeaux. */
      if (!(item && item.color) && snap.couleur) {
        sessionStorage.setItem('conf_current_color', JSON.stringify(snap.couleur));
      }
      if (snap.patchColor) sessionStorage.setItem('conf_patch_color', JSON.stringify(snap.patchColor));
      if (snap.coinFinish) sessionStorage.setItem('conf_coin_finish', snap.coinFinish);
      if (snap.flagColor) sessionStorage.setItem('conf_flag_color', snap.flagColor);
      if (snap.flagColorName) sessionStorage.setItem('conf_flag_color_name', snap.flagColorName);

      /* ⚠️ L'ORIENTATION DU DRAPEAU DOIT ÊTRE POSÉE ICI, avant `card.click()`.

         Le gabarit du drapeau ET le calcul du cadre de rognage
         (conf-flag-cover.js:100) la lisent sur `window` au moment où
         switchLayout construit le canvas. Déplacée dans une passe différée,
         un drapeau portrait serait bâti puis recadré comme un paysage. */
      if (snap.flagOrientation) window.__flagOrientation = snap.flagOrientation;

      /* Retenu pour l'application directe au canvas : elle ne dépend pas de
         la session, et c'est elle qui fait foi si le quota a refusé l'écriture. */
      window.__snapshotOuverture = snap;

      /* ── SESSION : l'instantané y est recopié pour survivre à un F5 ─────
         Les zones de l'instantané SEULES — ni union avec conf_cloud_urls, ni
         fusion multi-produits. Son échec n'est pas fatal : l'affichage passe
         par l'application directe. */
      if (snap.produit && Object.keys(snap.zones || {}).length) {
        var u = { _v: 2, byProduct: {} };
        u.byProduct[snap.produit] = snap.zones;
        var ecrit = false;
        if (typeof window.writeUploadStore === 'function') {
          ecrit = window.writeUploadStore(u);
        } else {
          try { sessionStorage.setItem('conf_uploads', JSON.stringify(u)); ecrit = true; }
          catch (e) { ecrit = false; }
        }
        if (!ecrit) {
          console.warn('Design trop lourd pour la session : appliqué directement ' +
                       'au canvas, mais il ne survivra pas à un rechargement.');
        }
      }

      /* ── TEXTES ── « absent » doit devenir « effacé », mais POUR CE PRODUIT
         SEULEMENT : les autres gardent leur texte de travail. Sans cette
         branche, une commande sans texte rouvrait celui d'une autre. */
      var tCourant = {};
      try { tCourant = JSON.parse(sessionStorage.getItem('conf_texts') || '{}'); }
      catch (e) { tCourant = {}; }
      if (!tCourant || typeof tCourant !== 'object') tCourant = {};

      var tLigne = snap.textes && snap.produit ? snap.textes[snap.produit] : null;
      if (tLigne && Object.keys(tLigne).length) {
        tCourant[snap.produit] = tLigne;
      } else if (snap.produit && tCourant[snap.produit]) {
        delete tCourant[snap.produit];
      }
      try { sessionStorage.setItem('conf_texts', JSON.stringify(tCourant)); }
      catch (e) {
        console.warn('Textes de la ligne non mémorisés (session saturée).', e);
      }

      /* ── LA LISTE DES PERSONNES (commandes de groupe) ────────────────────

         Elle n'était jamais reposée, et le panneau « Mon Équipe » restait vide
         alors que la session portait bien les noms.

         DEUX DÉFAUTS SE CUMULAIENT :

           1. `relireGroupRows()` (conf-main-inline.js:666) n'est appelée qu'AU
              CHARGEMENT du module. La variable `groupOrderRows` pouvait donc
              diverger de `conf_group_rows` — et c'est la VARIABLE que lisent
              refreshGroupBadge, eqRendreNoms et deplacerTableauGroupe.

           2. `allerEtapeGroupe('designer')` ne redessine rien :
              `deplacerTableauGroupe(false)` est un no-op (:9734).

         On passe par `setGroupOrderRows` et JAMAIS par un setItem direct :
         seule cette fonction met la variable à jour, puis enchaîne
         `saveGroupRows()` et `refreshGroupBadge()`.

         ICI, AVANT `choisirMode` : celle-ci planifie `eqRendreNoms` en
         requestAnimationFrame (:9099). La liste posée avant, le panneau se
         peuple de lui-même.

         L'instantané fait foi ; la session n'est qu'un repli pour les lignes
         antérieures à cette capture. Elle ne porte qu'UNE liste à la fois :
         avec deux groupes distincts elle donnerait celle du dernier ajouté. */
      if (typeof window.setGroupOrderRows === 'function') {
        var rowsLigne = snap.groupRows || null;
        if (!rowsLigne) {
          try {
            var brutRows = sessionStorage.getItem('conf_group_rows');
            rowsLigne = brutRows ? (JSON.parse(brutRows) || null) : null;
          } catch (e) { rowsLigne = null; }
        }
        /* Une ligne SANS liste ne doit pas effacer celle en place : la ligne
           libre qu'on vient d'ouvrir n'a rien à dire du groupe. */
        if (rowsLigne && rowsLigne.length) {
          try { window.setGroupOrderRows(rowsLigne); } catch (e) {}
        }
      }

      return true;
    } catch (e) {
      /* Session illisible ou saturée : on n'interrompt pas l'ouverture. */
      console.warn('Instantané de la ligne non posé :', e);
      return false;
    }
  }

  /* ═══ REPLI POUR LES LIGNES ANTÉRIEURES À L'INSTANTANÉ ═══════════════════

     Conservée INTACTE, appelée uniquement quand `lireSnapshot` rend null —
     c'est-à-dire pour les paniers déjà constitués au moment du déploiement.
     Aucun client ne perd son design ce jour-là.

     Code mort assumé et daté : à supprimer quand les paniers auront tourné. */
  function reposerEtatDesign(item) {
    /* PURGE de la ligne précédente : sans elle, un article dont le design ne
       peut être lu rouvrirait celui de l'article ouvert juste avant. */
    window.__uploadsAAppliquer = null;
    /* Le produit de la ligne suit le même cycle que le magasin qu'il désigne :
       laissé en place, il ferait lire l'entrée d'un article précédent. */
    window.__produitOuverture = null;
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

    /* ═══ LE PRODUIT DE L'ARTICLE FAIT FOI, PAS CELUI DU DESIGN ═══════════

       `d.product` semblait la source naturelle. Elle ne l'est pas :
       capturerEtatDesign le lit dans `conf_current_product`
       (conf-main-inline.js), c'est-à-dire le produit AFFICHÉ À L'ÉCRAN au
       moment de l'ajout — pas celui de l'article ajouté.

       Or `conf_current_product` n'est pas effacé entre deux commandes,
       contrairement aux clés de design. Une commande ajoutée sans changer de
       produit héritait donc du produit de la PRÉCÉDENTE.

       Ce produit décide sous quelle clé chercher les images et écrire les
       textes. Faux, il faisait lire et écrire au mauvais endroit : une ligne
       rouvrait l'image d'une autre, ou n'en trouvait aucune.

       `item.productType` vient de l'article commandé (conf-main-inline.js,
       `productType: currentProductType` au moment de construire la ligne). Il
       est fiable, et présent sur les lignes DÉJÀ au panier — corriger ici les
       répare toutes, sans avoir à vider le panier.

       `d.product` reste en dernier repli, pour une ligne trop ancienne pour
       porter `productType`. */
    var prodLigne = (item && item.productType) ||
                    (reserve && reserve.product) || null;

    /* ═══ LA CLÉ D'ÉCRITURE ET CELLE DE LECTURE PEUVENT DIVERGER ═════════

       Le magasin est ÉCRIT sous `conf_current_product` — le produit affiché à
       l'écran au moment de l'ajout (capturerEtatDesign, conf-main-inline.js).
       Il est RELU sous `item.productType`, le produit de l'article.

       Les deux coïncident sur une commande libre, ajoutée depuis l'écran qui
       affiche le produit. Mais le parcours de GROUPE traverse trois étapes
       avant l'ajout : `conf_current_product` a le temps de diverger. La
       recherche échouait alors sous la clé demandée, la réserve était rejetée,
       et l'on retombait sur un `item.design` filtré — souvent vide. Le
       vêtement revenait à sa seule couleur, posée par un autre chemin.

       Une ligne de panier ne porte QU'UN design : s'il n'est pas sous la clé
       attendue, il est sous une autre. On la retrouve plutôt que d'abandonner.

       `aDesImages` sans produit balaie déjà tout le magasin — on réutilise ce
       comportement au lieu d'en écrire un autre. */
    var trouverProduitPorteur = function (store) {
      if (!store || !store.byProduct) return null;
      var cles = Object.keys(store.byProduct);
      for (var i = 0; i < cles.length; i++) {
        if (aDesImages(store, cles[i])) return cles[i];
      }
      return null;
    };

    var d = null;
    if (reserve && aDesImages(reserve.uploads, prodLigne)) {
      d = reserve;                       // cas nominal : la clé attendue porte le design
    } else if (reserve && aDesImages(reserve.uploads)) {
      /* Le design existe, sous une AUTRE clé produit. On la retient : c'est
         elle qui pilotera les restaurateurs. */
      var porteur = trouverProduitPorteur(reserve.uploads);
      if (porteur) {
        console.warn('Design de la ligne rangé sous « ' + porteur + '  » et non « ' +
                     prodLigne + ' » : lecture corrigée.');
        prodLigne = porteur;
        d = reserve;
      }
    }
    if (!d) d = (item && item.design);
    if (!d) return false;   // article ajouté avant cette mémorisation

    if (!prodLigne) prodLigne = d.product || null;

    /* Dernier recours : le design persisté peut lui aussi être rangé ailleurs. */
    if (d && d.uploads && !aDesImages(d.uploads, prodLigne) && aDesImages(d.uploads)) {
      var porteur2 = trouverProduitPorteur(d.uploads);
      if (porteur2) prodLigne = porteur2;
    }

    try {
      /* `prodLigne`, pas `d.product` : cette clé pilote TOUS les restaurateurs
         (restoreUploads, restoreTexts, appliquerUploadsDirect lisent le produit
         courant). Y écrire le produit de l'écran d'un ajout précédent les
         envoyait chercher le design au mauvais endroit. */
      if (prodLigne) sessionStorage.setItem('conf_current_product', prodLigne);

      /* LA COULEUR DE LA LIGNE PRIME SUR CELLE DU DESIGN.

         `d.color` n'est pas « la couleur de cet article » : c'est le
         dictionnaire des couleurs de l'ÉCRAN au moment de l'ajout, tel que
         capturerEtatDesign l'a lu. Pour une commande de groupe, il ne porte
         qu'une seule teinte — commune aux trois personnes — alors que chaque
         ligne a la sienne.

         Le poser ici contaminait la session : `restoreColor()`, rejouée plus
         bas, la relit et reposait donc la couleur du GROUPE sur un article
         individuel. C'est ce qui faisait rouvrir en rose un t-shirt violet.

         Quand la ligne porte sa propre couleur, elle fait foi : elle est ce que
         montre la vignette et ce qui a été commandé. `applyColor` s'en charge
         quelques instants plus tard.

         Le repli sur `d.color` reste utile aux articles dont le libellé n'est
         pas un nom de pastille — patchs, coins, drapeaux. */
      if (!(item && item.color) && d.color) {
        sessionStorage.setItem('conf_current_color', JSON.stringify(d.color));
      }
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
      /* ÉCHEC SIGNALÉ. Une ligne qui portait un design et n'en retrouve aucun
         est une anomalie : sans ce message, le vêtement revenait simplement à
         sa couleur, sans que rien n'indique ce qui manquait. */
      if (d.uploads && !aDesImages(d.uploads)) {
        console.warn('Aucune image trouvée dans le design de cette ligne : ' +
                     'le vêtement reviendra sans son visuel.');
      }

      if (aDesImages(d.uploads, prodLigne)) {
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

        /* RESTREINT AU PRODUIT DE LA LIGNE, PUIS FUSIONNÉ.

           Le magasin de la ligne porte aussi les designs des autres produits,
           figés au moment de l'ajout. Les reposer ferait resurgir un travail
           que le client a pu modifier ou abandonner depuis — et l'écriture
           écrasait son magasin courant.

           Repli sur `u` si la fusion échoue : mieux vaut l'ancien comportement
           qu'une réouverture sans images. */
        var uFusion = fusionnerPourProduit(u, prodLigne, function () {
          if (typeof window.readUploadStore === 'function') {
            return window.readUploadStore();
          }
          return JSON.parse(sessionStorage.getItem('conf_uploads') || 'null');
        });
        if (uFusion) u = uFusion;

        /* Retenu pour l'APPLICATION DIRECTE au canvas (voir plus bas) : elle
           ne dépend pas de la session, et c'est elle qui fait foi. */
        window.__uploadsAAppliquer = u;
        /* Le produit de la ligne accompagne le magasin : l'application directe
           doit savoir quelle entrée lire, même à plusieurs produits. */
        window.__produitOuverture = prodLigne;

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
      /* TEXTES — même traitement que les images, et pour les mêmes raisons.

         Cette ligne écrivait `d.texts` TEL QUEL : le magasin entier, tous
         produits confondus, sans la moindre garde. Deux dégâts :

           • le design textuel des autres produits, figé à l'ajout, écrasait
             celui en cours ;
           • si l'entrée du produit de la ligne était absente, restoreTexts —
             qui lit `conf_texts[currentProductType]` — ne trouvait rien. La
             garde `__ouvertureDepuisPanier` retenait l'effacement PENDANT
             l'ouverture, mais dès qu'elle retombait, les trois zones étaient
             vidées. D'où des textes qui s'affichent puis disparaissent.

         Le magasin des textes est PLAT (indexé par produit directement), sans
         le `byProduct` des uploads : sa fusion s'écrit donc ici plutôt que par
         `fusionnerPourProduit`.

         Rien n'est écrit si l'entrée du produit est vide : « absent » ne doit
         jamais devenir « effacé ». */
      if (d.texts && prodLigne && d.texts[prodLigne] &&
          Object.keys(d.texts[prodLigne]).length) {
        var tCourant = {};
        try { tCourant = JSON.parse(sessionStorage.getItem('conf_texts') || '{}'); }
        catch (e) { tCourant = {}; }
        if (!tCourant || typeof tCourant !== 'object') tCourant = {};
        tCourant[prodLigne] = d.texts[prodLigne];   // la ligne fait foi
        try { sessionStorage.setItem('conf_texts', JSON.stringify(tCourant)); }
        catch (e) {
          console.warn('Textes de la ligne non mémorisés (session saturée).', e);
        }
      } else if (prodLigne) {
        /* LA LIGNE N'A PAS DE TEXTE : IL FAUT L'EFFACER, PAS L'IGNORER.

           Ce cas n'avait aucune branche. `conf_texts` restait donc intact —
           avec l'entrée laissée par la ligne ouverte JUSTE AVANT. restoreTexts
           la relisait et l'affichait : une commande sans texte rouvrait celui
           d'une autre.

           « Absent » doit devenir « effacé », mais POUR CE PRODUIT SEULEMENT :
           les autres produits gardent leur texte de travail, que cette ligne
           ne concerne pas. */
        try {
          var tPurge = JSON.parse(sessionStorage.getItem('conf_texts') || '{}');
          if (tPurge && typeof tPurge === 'object' && tPurge[prodLigne]) {
            delete tPurge[prodLigne];
            sessionStorage.setItem('conf_texts', JSON.stringify(tPurge));
          }
        } catch (e) {}
      }
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

    /* GARDE-FOU LEVÉ EN PREMIER, ET HORS DE TOUTE BRANCHE.

       Il empêche `rangerDesignMode` de ranger l'état sous la clé du mode
       courant pendant une réouverture — l'article rouvert n'appartient pas
       forcément au mode affiché, et le paquet de l'autre mode serait écrasé.

       Il était levé plus bas, et seulement si la carte produit avait été
       trouvée : la ligne suivante écrivait donc en session sans protection, et
       un article dont la carte manquait n'en avait jamais. Le baisser reste du
       ressort de la fin de restauration, déjà indépendante de cette carte. */
    window.__ouvertureDepuisPanier = true;

    /* AVANT toute bascule : la session doit porter le design de cette ligne
       quand selProd et les restaurateurs iront le chercher.

       L'INSTANTANÉ D'ABORD. `poserSnapshot` rend false pour une ligne
       antérieure à sa mise en place — on retombe alors sur l'ancien chemin,
       conservé pour que les paniers déjà constitués ne perdent rien. */
    if (!poserSnapshot(item)) reposerEtatDesign(item);

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
      /* Le drapeau `__ouvertureDepuisPanier` est désormais levé au tout début
         de cette fonction, avant la première écriture en session. Il signale à
         l'élagage par produit (conf-main-inline.js) qu'il ne s'agit pas d'un
         changement d'avis : purger les autres produits effacerait les designs
         des autres lignes du panier, que le client peut rouvrir. */

      /* SORTIE DE L'ÉCRAN DE CHOIX.

         Après un ajout de commande de groupe, le configurateur y revient de
         lui-même (conf-main-inline.js). Le canvas y est masqué : le design se
         reposait donc correctement, mais sur un écran invisible — le client
         voyait « Choisissez votre mode » et croyait que rien ne s'était passé.

         Le mode se déduit de l'article : groupe s'il porte un libellé de
         groupe, individuel sinon. Le drapeau ci-dessus empêche le rechargement
         de page qu'un changement de mode déclencherait autrement. */
      /* ── LE MODE SUIT LA LIGNE, OÙ QUE L'ON SE TROUVE ────────────────────

         La bascule était conditionnée à `data-etape === 'choix'`. Or cet
         attribut n'a que DEUX états : « choix », ou ABSENT — il est retiré dès
         qu'un mode est retenu (conf-main-inline.js:8956). Cliquer une vignette
         depuis le configurateur rendait donc la condition fausse, et une ligne
         de GROUPE rouvrait son design en « Personnalisation libre ».

         Ce bloc n'avait jamais été écrit pour corriger le mode : il servait à
         sortir de l'écran de choix après un ajout de commande de groupe, où le
         canvas est masqué. Le mode n'était corrigé que par effet de bord.

         ── POURQUOI C'EST SANS DANGER ──────────────────────────────────────

         Changer de mode déclenche normalement un RECHARGEMENT DE PAGE
         (conf-main-inline.js:8852) et une PERMUTATION DES PAQUETS de design —
         poserDesignModeEnSession écrase et supprime les onze clés de session,
         dont `conf_uploads`, `conf_texts` et `conf_current_product` que
         `poserSnapshot` vient d'écrire. La restauration serait anéantie.

         Mais la PREMIÈRE ligne de basculerModeAvecRechargement (:8822) est
         `if (window.__ouvertureDepuisPanier) return false;`. Ce retour
         anticipé coupe le rechargement ET la permutation. Le drapeau est levé
         dès l'entrée dans cette fonction (:916) et ne retombe qu'après la
         dernière passe : toute la réouverture est couverte.

         `choisirMode` se borne alors à poser le mode, `data-mode`, le bandeau
         et l'étape. `reprise = true` est conservé : même si le drapeau
         retombait tôt, aucun rechargement ne serait possible.

         PLACE INCHANGÉE, avant `card.click()` : en mode groupe,
         `data-etape-groupe` change la grille CSS, et mesurer les zones avant
         ce changement les calerait sur une mise en page périmée. */
      var estGroupe = !!(item.groupIndex || item.groupLabel);

      if (typeof window.choisirMode === 'function') {
        window.choisirMode(estGroupe ? 'groupe' : 'individuelle', true);
      }

      /* ÉTAPE FORCÉE À « DESIGNER ».

         `choisirMode` en reprise vise `rappelerEtapeGroupe() || 'designer'`.
         Si l'étape mémorisée vaut « valider », son entrée est différée de
         900 ms (conf-main-inline.js:8991) et déposerait le client sur l'écran
         de vérification — canvas masqué, design restauré invisible.

         Rouvrir une vignette, c'est vouloir VOIR le design. */
      if (estGroupe && typeof window.allerEtapeGroupe === 'function') {
        try { window.allerEtapeGroupe('designer'); } catch (e) {}

        /* LE PANNEAU DES SURNOMS EST REDESSINÉ EXPLICITEMENT.

           `allerEtapeGroupe('designer')` ne le fait PAS : son seul chemin de
           rendu passe par `deplacerTableauGroupe(true)`, réservé à l'étape
           « configurer » — avec `false`, la fonction ne fait rien (:9734).

           `choisirMode` a bien planifié un `eqRendreNoms` en rAF (:9099), mais
           cet appel-ci est la ceinture : la liste vient d'être posée juste
           au-dessus, et rien ne garantit l'ordre des deux.

           Idempotente et sans risque — son propre commentaire le dit : « La
           fonction lit l'état réel, elle ne peut donc rien détruire. » Elle
           rafraîchit aussi le blocage du bouton « Continuer » (:9883). */
        if (typeof window.eqRendreNoms === 'function') {
          try { window.eqRendreNoms(); } catch (e) {}
        }
      }
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
      /* Résultat MÉMORISÉ : `reposerDesign` rejoue `restoreColor` un peu plus
         bas, et doit savoir si la couleur textile a déjà été posée par la
         ligne. Sans cela, elle la remplacerait par celle de la session. */
      var couleurLignePosee = applyColor(item.color);
      if (!couleurLignePosee && typeof window.restoreColor === 'function') {
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
        /* PARTIE TEXTILE NEUTRALISÉE quand la ligne a déjà posé sa couleur.

           `restoreColor` relit `conf_current_color` — la couleur de la SESSION,
           pas celle de l'article. Rejouée ici sans condition, elle défaisait le
           travail d'`applyColor` : un t-shirt individuel violet repartait avec
           la couleur d'une ligne du groupe.

           `sauterTextile` ne coupe que les pastilles de vêtement. Tout ce pour
           quoi cet appel existe — la couleur des patchs et coins, la finition —
           continue d'être reposé. */
        if (premiere && typeof window.restoreColor === 'function') {
          window.restoreColor(couleurLignePosee ? { sauterTextile: true } : undefined);
        }

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
        /* L'instantané fait foi quand il existe ; l'ancien chemin ne sert
           qu'aux lignes qui n'en ont pas. */
        if (window.__snapshotOuverture) appliquerSnapshotDirect();
        else appliquerUploadsDirect();

        if (typeof window.restoreTexts === 'function') window.restoreTexts();

        /* SURNOM DE LA LIGNE — reposé APRÈS les textes, qu'il remplace.

           Il n'est nulle part dans le design enregistré : eqEssayerNom l'écrit
           directement sur le vêtement, sans passer par la session, et la boucle
           d'ajout au panier ne le substitue plus (la vignette est mutualisée
           par couleur). Le magasin des textes ne porte donc que le texte
           COMMUN.

           Mais la donnée existe, fiable, sur la ligne : `personName` est ce qui
           part en commande sous « Personne ». On la repose ici, comme le fait
           déjà l'aperçu de ligne (conf-group-preview.js:126).

           Le client retrouve ainsi ce qu'il a commandé pour CETTE personne, et
           non le texte générique. */
        /* L'INSTANTANÉ PORTE DÉJÀ LE NOM : plus rien à reconstituer.

           La substitution ci-dessous répare l'absence du nom dans le design
           enregistré. Depuis que `capturerSnapshot` l'inscrit dans les textes
           de la ligne (conf-main-inline.js, `pushToCart`), `restoreTexts` le
           repose lui-même — à SA position, celle de cette ligne.

           La rejouer ici serait au mieux redondant, au pire nuisible : elle
           écrit dans l'élément du DOM tel qu'il est à cet instant, ce qui
           était précisément la source du défaut — le texte d'une ligne
           héritait de la position d'une autre.

           Elle reste en place pour les lignes ANTÉRIEURES à l'instantané,
           même logique de repli que `reposerEtatDesign`. */
        var snapNom = window.__snapshotOuverture;
        var nomDejaPose = !!(snapNom && snapNom.personName &&
                             snapNom.personName === item.personName);

        if (item.personName && !nomDejaPose) {
          var zoneNom = (typeof window.grpTextZone === 'function')
            ? window.grpTextZone() : 'f';
          var elNom = document.getElementById('text-' + zoneNom);
          var contenuNom = elNom ? elNom.querySelector('.dt-content') : null;

          /* TEXTE COURBÉ : rendu en image, son contenu est vide — la
             substitution y est impossible. Même garde que les trois autres
             chemins du projet. */
          /* TEXTE JAMAIS RENDU = RIEN À SUBSTITUER.

             La révélation était inconditionnelle : sur une ligne dont le texte
             n'avait pas été restauré, elle affichait un élément que
             renderTextOnCanvas n'avait jamais stylé — ni couleur, ni police,
             ni taille. Le surnom apparaissait en blanc par défaut, ce qui
             passait pour « la couleur n'est pas restaurée ».

             `dt-seg` ou un contenu non vide signalent un rendu réel. */
          var dejaRendu = contenuNom &&
            (contenuNom.querySelector('.dt-seg') ||
             (contenuNom.textContent || '').trim() !== '');

          if (contenuNom && dejaRendu && !elNom.classList.contains('is-shaped')) {
            /* LE STYLE DU TEXTE EST PRÉSERVÉ.

               `textContent =` remplaçait tous les nœuds enfants par un nœud
               texte nu : les `<span class="dt-seg">` porteurs de la couleur,
               de la graisse et du soulignement disparaissaient avec lui. Le
               surnom perdait donc la mise en forme du texte qu'il remplace.

               On réécrit le seul contenu textuel du PREMIER segment et on
               retire les suivants : un surnom est un texte d'un seul tenant,
               il hérite ainsi du style du texte qu'il remplace. Sans segment,
               le style vit sur le conteneur et `textContent` ne détruit
               rien. */
            var segs = contenuNom.querySelectorAll('.dt-seg');
            if (segs.length) {
              segs[0].textContent = item.personName;
              for (var iS = segs.length - 1; iS >= 1; iS--) {
                if (segs[iS].parentNode) segs[iS].parentNode.removeChild(segs[iS]);
              }
            } else {
              contenuNom.textContent = item.personName;
            }
            if (elNom.style.display === 'none') elNom.style.display = '';
            /* Le surnom peut être plus long que le texte commun : la police
               doit être re-calée dans sa zone imprimable. */
            if (typeof window.clampTextToZone === 'function') {
              window.clampTextToZone(zoneNom);
            }
          }
        }

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
      /* ── NON TEXTILES : ON ATTEND UN SIGNAL, PLUS UNE DURÉE ──────────────

         Les 560 ms étaient calibrées pour tomber après la restauration que
         switchLayout lance à +250 ms (conf-dynamic-layout.js:214). Mais ces
         250 ms comptent à partir de l'INJECTION du DOM, pas du clic : sur un
         appareil lent, loadDrapeauxCanvas et consorts repoussent l'injection,
         et le callback de switchLayout arrivait APRÈS notre passe pour lui
         reprendre la main — le motif en couverture redevenait une petite
         image centrée.

         `conf:layout-restored` (émis en fin de ce callback) dit exactement ce
         que le délai supposait. Le setTimeout reste en FILET : si le signal
         n'arrive pas — catégorie textile, canvas déjà en place, événement
         manqué — le comportement d'origine s'applique.

         `lancee` garantit une exécution unique : signal et filet peuvent
         arriver tous les deux. */
      var lancee = false;
      var premierePasse = function () {
        if (lancee) return;
        lancee = true;
        reposerDesign(true);
      };

      if (!estTextile) {
        var surLayout = function () {
          document.removeEventListener('conf:layout-restored', surLayout);
          premierePasse();
        };
        document.addEventListener('conf:layout-restored', surLayout);
        /* Filet : l'écouteur est retiré s'il n'a pas servi, pour qu'une
           reconstruction ultérieure ne déclenche pas une passe orpheline. */
        setTimeout(function () {
          document.removeEventListener('conf:layout-restored', surLayout);
          premierePasse();
        }, 560);
      } else {
        setTimeout(premierePasse, 260);
      }

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
        /* ORDRE GARANTI : la seconde passe ne peut pas devancer la première.

           Le signal `conf:layout-restored` peut tarder au-delà de 1000 ms sur
           un appareil très lent. Sans cette ligne, la passe de rattrapage
           s'exécuterait avant celle qui pose le design — elle n'aurait rien à
           rattraper, et la première écrirait ensuite sans que personne ne
           reprenne les images arrivées entre-temps. */
        premierePasse();

        try { reposerDesign(false); }
        finally {
          /* ── LE RÉCAPITULATIF EST REPEINT DEPUIS L'ÉTAT FINAL ────────────

             Il est peint par selProd au tout début de l'ouverture, AVANT les
             deux passes de restauration — et plus rien ne le rafraîchissait
             ensuite. Il montrait donc durablement un instant révolu : une
             vignette de l'article précédent, une ligne « Texte » restée
             allumée. C'est le désordre que le client voit croître avec le
             nombre d'articles au panier.

             Le récap n'écrit dans aucun magasin : le repeindre est sans
             risque pour le design. Il ne fait que rattraper la vérité.

             `updateTextRecap` est anti-rebondie à 200 ms
             (conf-text-editor.js:1495) : sa rastérisation lira donc l'état
             du canvas à ~200 ms d'ici, soit bien après la dernière passe. */
          try {
            /* Sans argument, elle traite les trois zones (conf-text-editor.js:1526)
               avec son anti-rebond PAR ZONE — les lignes ne s'annulent plus
               entre elles. */
            if (typeof window.updateTextRecap === 'function') {
              window.updateTextRecap();
            }
            if (typeof window.updateRecapThumbLogo === 'function') {
              window.updateRecapThumbLogo();
            }
          } catch (e) {
            console.warn('Récapitulatif non rafraîchi :', e);
          }

          setTimeout(function () { window.__ouvertureDepuisPanier = false; }, 400);
        }
      }, estTextile ? 700 : 1000);
    }, switched ? 220 : 0);
  };
})();
