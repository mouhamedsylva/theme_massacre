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
  function applyColor(label) {
    if (!label) return;
    /* Le libellé stocké est « Couleur : Black » ou « Black » selon le chemin
       d'ajout (commande de groupe vs unitaire) : on ne garde que la valeur. */
    var name = String(label).replace(/^.*:\s*/, '').trim();
    if (!name) return;

    /* Le nom de la couleur vit dans `title` (pas de data-color sur .cs), et
       `.cg` est cloné dans la barre du canvas : on vise la source, un clic
       sur le clone ne porterait pas le onclick d'origine. */
    var list = document.querySelectorAll('.cg:not(.cv-opt-clone) .cs');
    for (var i = 0; i < list.length; i++) {
      if ((list[i].getAttribute('title') || '').trim() === name) {
        list[i].click();
        return;
      }
    }
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

  window.openCartItemDesign = function (id) {
    var item = findItem(id);
    if (!item) return;

    if (typeof window.closeCartDrawer === 'function') window.closeCartDrawer();

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
      card.click();
      switched = true;
    }

    /* Couleur et taille APRÈS le changement de produit : selProd() reconstruit
       ces listes, un clic antérieur serait perdu. Le délai laisse ce rendu se
       terminer — les deux dépendent du produit courant. */
    setTimeout(function () {
      /* Couleur : on rejoue restoreColor(), qui lit conf_current_color — la
         couleur mémorisée POUR CE PRODUIT. C'est la même source que le
         rechargement de page, et elle gère aussi patchs et coins.
         item.color (figé dans la ligne de panier) servait auparavant : il
         pouvait diverger de la couleur réellement associée au design, qui est
         indexé par produit et non par ligne. */
      if (typeof window.restoreColor === 'function') window.restoreColor();
      else applyColor(item.color);
      applySize(item.size);

      /* Designs de CE produit : logos, positions, textes et leur mise en
         forme (police, couleur, taille). Ils vivent dans conf_uploads /
         conf_texts, tous deux indexés par produit — changer de produit ne
         suffit pas, il faut les réappliquer.
         Même ordre que restoreProductThenUploads() au rechargement de page :
         couleur, puis uploads, puis textes. Différé, car selColor() recharge
         les images du vêtement — un design posé avant serait effacé. */
      setTimeout(function () {
        if (typeof window.restoreUploads === 'function') window.restoreUploads();
        if (typeof window.restoreTexts === 'function') window.restoreTexts();
        // Cadres de rognage des modes « couverture » (coins, drapeaux).
        if (typeof window.syncCoinCrop === 'function') window.syncCoinCrop();
        if (typeof window.syncFlagCrop === 'function') window.syncFlagCrop();
        // Repères de zone : alignés sur ce qui est réellement posé.
        if (typeof window.refreshZoneGuides === 'function') window.refreshZoneGuides();
      }, 260);
    }, switched ? 220 : 0);
  };
})();
