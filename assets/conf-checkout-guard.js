/**
 * GARDE-FOU AVANT PAIEMENT — aucun article du configurateur sans design.
 *
 * Les produits du configurateur restent vendables (le récapitulatif les ajoute
 * au panier), donc un client peut en mettre un au panier SANS passer par le
 * configurateur : lien direct, « Acheter à nouveau », ancien panier… La
 * commande arrivait alors à l'atelier sans aucun design (ex. #21695).
 *
 * Le configurateur pose TOUJOURS des propriétés sur ses lignes (Détails,
 * Taille, _Aperçu, Article/Manches…). Une ligne d'un de ces produits SANS
 * AUCUNE propriété ne vient donc pas de lui : on bloque le paiement et on
 * propose de la retirer ou d'ouvrir le configurateur.
 *
 * Chargé par layout/theme.liquid (pages de la boutique). Le récapitulatif du
 * configurateur passe au paiement par son propre chemin, avec des lignes qui
 * portent toujours des propriétés : il n'est jamais bloqué.
 */
(function () {
  'use strict';

  /* Mêmes IDs que CONFIGURATOR_PRODUCT_IDS (backend, pricing.service.ts),
     plus le supplément manche polyester. */
  var PRODUITS_CONF = [
    15982847033678, // textile-sweatshirt
    15982848246094, // textile-t-shirt-coton
    15982849130830, // textile-t-shirt-polyester
    15982850572622, // drapeau-personnalise
    15982850801998, // patch-personnalise
    15982850998606, // coin-metal-personnalise
    15982845854030, // personnalisation-manche
    15996670869838  // personnalisation-manche-polyester
  ];

  function lignesSansDesign(panier) {
    return ((panier && panier.items) || []).filter(function (l) {
      var props = l.properties || {};
      return PRODUITS_CONF.indexOf(Number(l.product_id)) !== -1 &&
             Object.keys(props).length === 0;
    });
  }

  function lirePanier() {
    return fetch('/cart.js', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* Boutons de paiement accéléré (Shop Pay, Google Pay…) : impossibles à
     intercepter, ils sont masqués tant qu'une ligne fautive est au panier. */
  function majBoutonsAcceleres(fautives) {
    var bloque = fautives.length > 0;
    document.querySelectorAll('.additional-checkout-buttons, .shopify-payment-button')
      .forEach(function (el) { el.style.display = bloque ? 'none' : ''; });
  }

  function verifier() {
    return lirePanier().then(function (p) {
      var f = lignesSansDesign(p);
      majBoutonsAcceleres(f);
      return f;
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fermer(fond) { if (fond && fond.parentNode) fond.parentNode.removeChild(fond); }

  function afficherBlocage(fautives) {
    var noms = fautives.map(function (l) { return l.product_title || l.title; })
      .filter(function (n, i, a) { return a.indexOf(n) === i; });
    var fond = document.createElement('div');
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px';
    fond.innerHTML =
      '<div style="background:#fff;color:#1c1f24;max-width:440px;width:100%;border-radius:12px;' +
      'padding:24px;font-family:inherit;box-shadow:0 10px 40px rgba(0,0,0,.25)">' +
        '<h2 style="margin:0 0 10px;font-size:18px">Article à personnaliser</h2>' +
        '<p style="margin:0 0 8px;font-size:14px;line-height:1.5">' +
          'Ces articles se personnalisent dans notre configurateur et ne peuvent pas être ' +
          'commandés sans design :</p>' +
        '<p style="margin:0 0 18px;font-size:14px;font-weight:600">' + esc(noms.join(', ')) + '</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<a href="/pages/configurateur" style="flex:1;min-width:150px;text-align:center;' +
            'background:#1c1f24;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px">' +
            'Ouvrir le configurateur</a>' +
          '<button type="button" data-retirer style="flex:1;min-width:150px;background:#fff;' +
            'border:1px solid #c8cdd3;padding:12px;border-radius:8px;cursor:pointer;font-size:14px">' +
            'Retirer ces articles</button>' +
        '</div>' +
      '</div>';
    fond.addEventListener('click', function (e) { if (e.target === fond) fermer(fond); });
    fond.querySelector('[data-retirer]').addEventListener('click', function () {
      var maj = {};
      fautives.forEach(function (l) { maj[l.key] = 0; });
      fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ updates: maj })
      }).finally(function () { window.location.reload(); });
    });
    document.body.appendChild(fond);
  }

  /* Clic sur un bouton de paiement : capture, AVANT le formulaire Horizon. */
  var enCours = false;
  document.addEventListener('click', function (e) {
    var cible = e.target && e.target.closest &&
      e.target.closest('button[name="checkout"], input[name="checkout"], a[href^="/checkout"]');
    if (!cible) return;
    if (cible.__confVerifie) { cible.__confVerifie = false; return; }   // 2e passage : autorisé
    e.preventDefault();
    e.stopPropagation();
    if (enCours) return;
    enCours = true;
    verifier().then(function (fautives) {
      enCours = false;
      if (fautives.length) { afficherBlocage(fautives); return; }
      // Panier sain : on rejoue le clic d'origine (formulaire Horizon intact).
      cible.__confVerifie = true;
      cible.click();
    });
  }, true);

  // État des boutons accélérés : au chargement et à chaque mise à jour du panier.
  document.addEventListener('DOMContentLoaded', verifier);
  document.addEventListener('cart:update', function () { setTimeout(verifier, 300); });
})();
