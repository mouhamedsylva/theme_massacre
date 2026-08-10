/**
 * Devis depuis le PANIER (drawer) + bascule du bouton de checkout.
 * Déporté du template configurateur.liquid (proche de la limite Shopify 256 Ko).
 *
 * Dépendances exposées par le template sur window :
 *   window.getCartItems()   -> tableau des articles du panier (cartItems)
 *   window.openQuoteModal(data)
 *   window.closeCartDrawer()
 *   window.goToRecap()
 *   window.countCartFamilies() reste ici (autonome).
 *
 * Règles de bascule « Continuer » -> « Faire une demande de devis » :
 *   1) PATCHS ≥ 100 pièces (prix « sur demande »).
 *   2) Panier ≥ 3 FAMILLES de produits différentes (commande multi-produits).
 */
(function () {
  function cart() {
    return (typeof window.getCartItems === 'function') ? (window.getCartItems() || []) : [];
  }

  /* Famille visible client d'un article. Regroupe coton+polyester = « tshirt ».
     Identifie patch/coin par le NOM (nommage interne inversé). */
  function cartFamily(item) {
    var n = (item.name || '').toLowerCase();
    var pt = item.productType || '';
    if (/patch/.test(n)) return 'patch';
    if (/coin/.test(n)) return 'coin';
    if (pt === 'sweatshirt' || /sweat/.test(n)) return 'sweatshirt';
    if (pt === 'tshirt' || pt === 'tshirt_polyester' || /t-?shirt/.test(n)) return 'tshirt';
    if (pt === 'drapeaux' || /drapeau/.test(n)) return 'drapeau';
    return pt || 'autre';
  }
  function countCartFamilies() {
    var fams = {};
    cart().forEach(function (i) { fams[cartFamily(i)] = true; });
    return Object.keys(fams).length;
  }
  window.countCartFamilies = countCartFamilies;

  /* Quantité totale de PATCHS (ciblés par nom « Patch… »). */
  function patchQtyInCart() {
    return cart().reduce(function (s, i) {
      return s + (/patch/i.test(i.name || '') ? (i.qty || 0) : 0);
    }, 0);
  }

  /* Le panier contient-il au moins un COIN (« Coin métal ») ? Ciblé par nom
     (nommage interne inversé). */
  function hasCoinInCart() {
    return cart().some(function (i) { return /coin/i.test(i.name || ''); });
  }

  /* Le panier doit-il passer en devis plutôt qu'au paiement ? Devis si :
     - un COIN est présent (seul ou couplé à n'importe quel produit) ;
     - OU patchs ≥ 100 pièces ;
     - OU ≥ 3 familles de produits différentes. */
  function cartNeedsQuote() {
    return hasCoinInCart() || patchQtyInCart() >= 100 || countCartFamilies() >= 3;
  }
  window.cartNeedsQuote = cartNeedsQuote;

  /* Bascule le bouton bas de drawer entre checkout et demande de devis. */
  window.updateDrawerCheckoutBtn = function (isQuote) {
    var btn = document.getElementById('cd-checkout-btn');
    if (!btn) return;
    if (isQuote) {
      btn.setAttribute('onclick', 'requestCartQuote()');
      btn.innerHTML = 'Faire une demande de devis' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
    } else {
      btn.setAttribute('onclick', 'goToRecap()');
      btn.innerHTML = 'Continuer' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>';
    }
  };

  /* Routeur : ≥ 3 familles -> devis multi-produits ; sinon -> devis patchs. */
  window.requestCartQuote = function () {
    // Coin présent OU panier multi-familles -> devis global de tout le panier.
    // Sinon (patchs ≥ 100 seuls) -> devis patchs.
    if (hasCoinInCart() || countCartFamilies() >= 3) return window.requestMultiProductQuote();
    return window.requestPatchQuoteFromCart();
  };

  /* Devis PATCHS seuls (≥ 100 pièces, prix « sur demande »). */
  window.requestPatchQuoteFromCart = function () {
    if (typeof window.closeCartDrawer === 'function') window.closeCartDrawer();
    var patchs = cart().filter(function (i) { return /patch/i.test(i.name || ''); });
    if (!patchs.length) { if (window.goToRecap) window.goToRecap(); return; }
    var totalQty = patchs.reduce(function (s, i) { return s + (i.qty || 0); }, 0);
    var details = patchs.map(function (i) {
      return (i.qty || 1) + '× ' + (i.name || 'Patch') +
             (i.size ? ' — ' + i.size : '') + (i.color ? ' — ' + i.color : '');
    });
    details.unshift('Total : ' + totalQty + ' patchs (prix sur demande au-delà de 100)');
    var previews = patchs.filter(function (i) {
      return typeof i.img === 'string' && /^https?:\/\//i.test(i.img);
    }).map(function (i, idx) { return { label: 'Patch ' + (idx + 1), base: i.img }; });
    window.openQuoteModal({
      name: 'Commande de patchs (' + totalQty + ' pièces)',
      subtitle: 'Recevez un devis pour votre commande de ' + totalQty + ' patchs.',
      details: details, qty: totalQty, previews: previews
    });
  };

  /* Devis MULTI-PRODUITS : panier mêlant ≥ 3 familles -> devis global. */
  window.requestMultiProductQuote = function () {
    if (typeof window.closeCartDrawer === 'function') window.closeCartDrawer();
    var items = cart();
    if (!items.length) { if (window.goToRecap) window.goToRecap(); return; }
    var totalQty = items.reduce(function (s, i) { return s + (i.qty || 0); }, 0);
    var details = items.map(function (i) {
      return (i.qty || 1) + '× ' + (i.name || 'Article') +
             (i.color ? ' — ' + i.color : '') + (i.size ? ' — ' + i.size : '');
    });
    var nFam = countCartFamilies();
    details.unshift('Commande sur devis : ' + nFam + ' famille(s), ' +
      items.length + ' ligne(s), ' + totalQty + ' pièce(s).');
    var previews = items.filter(function (i) {
      return typeof i.img === 'string' && /^https?:\/\//i.test(i.img);
    }).map(function (i) { return { label: (i.name || 'Article'), base: i.img }; });
    // Sous-titre adapté : coin (toujours sur devis) vs simple mix multi-produits.
    var sub = hasCoinInCart()
      ? 'Les pièces (coins) sont chiffrées sur devis : recevez un devis global ' +
        'pour l’ensemble de votre commande.'
      : 'Votre panier mélange plusieurs types de produits : recevez un devis ' +
        'global pour l’ensemble de votre commande.';
    window.openQuoteModal({
      name: 'Commande sur devis (' + items.length + ' articles)',
      subtitle: sub,
      details: details, qty: totalQty, previews: previews
    });
  };
})();
