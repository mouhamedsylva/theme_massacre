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
   * La source est sessionStorage : `cartItems` est un `let` dans la portée
   * fermée du template, invisible d'ici. persistCart() y réécrit le panier à
   * chaque ajout, suppression et changement de quantité, donc la valeur lue
   * est à jour.
   */
  function findItem(id) {
    var cart = window.cartItems;
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
  function reposerEtatDesign(item) {
    var d = item && item.design;
    if (!d) return false;   // article ajouté avant cette mémorisation

    try {
      if (d.product) sessionStorage.setItem('conf_current_product', d.product);
      if (d.color) sessionStorage.setItem('conf_current_color', JSON.stringify(d.color));
      if (d.patchColor) sessionStorage.setItem('conf_patch_color', JSON.stringify(d.patchColor));
      if (d.coinFinish) sessionStorage.setItem('conf_coin_finish', d.coinFinish);

      if (d.uploads) {
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
        sessionStorage.setItem('conf_uploads', JSON.stringify(u));
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
      var reposerDesign = function () {

        if (typeof window.restoreUploads === 'function') window.restoreUploads();
        if (typeof window.restoreTexts === 'function') window.restoreTexts();
        // Cadres de rognage des modes « couverture » (coins, drapeaux).
        if (typeof window.syncCoinCrop === 'function') window.syncCoinCrop();
        if (typeof window.syncFlagCrop === 'function') window.syncFlagCrop();
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
        // Repères de zone : alignés sur ce qui est réellement posé.
        if (typeof window.refreshZoneGuides === 'function') window.refreshZoneGuides();
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
      setTimeout(reposerDesign, 260);
      setTimeout(function () {
        /* `finally` : le drapeau DOIT retomber, même si une passe échoue.
           Resté levé, il neutraliserait durablement restoreLogosForProduct et
           la branche d'effacement des textes — le configurateur cesserait de
           nettoyer le canvas d'un produit à l'autre.

           Il est baissé APRÈS la dernière passe : sans cela, les restaurateurs
           destructifs reprenaient la main entre deux passes et vidaient le
           canvas que celles-ci venaient de repeupler. */
        try { reposerDesign(); }
        finally { window.__ouvertureDepuisPanier = false; }
      }, 700);
    }, switched ? 220 : 0);
  };
})();
