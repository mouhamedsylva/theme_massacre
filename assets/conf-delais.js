/**
 * DÉLAIS DE PRODUCTION — source unique de vérité côté thème.
 *
 * Quatre écrans annoncent ce délai : le récapitulatif du configurateur, la
 * barre mobile, le tiroir du panier et la page Récapitulatif. Tous passent par
 * delaiProduction / delaiCommande ci-dessous.
 *
 * DEPUIS LE 17/11/2026, LE BARÈME SE RÈGLE DANS LE DASHBOARD
 * (Paramètres → Délais de production). Il arrive avec les prix
 * (GET /api/pricing → `delais`) et s'applique via applyDelaisFromBackend().
 * La table ci-dessous n'est plus qu'un REPLI si le backend ne répond pas.
 *
 * Par produit : { delai, seuil, grand } — au-delà de `seuil` pièces (strictement
 * supérieur : « jusqu'à 10 » inclut 10), c'est `grand` qui s'affiche.
 *
 * On annonce une DURÉE, jamais une date : la livraison dépend aussi du
 * transport et de la validation de la maquette, que ce code ne connaît pas.
 */
(function () {
  'use strict';

  var TEXTILES = ['sweatshirt', 'tshirt', 'tshirt_polyester'];

  function regle(delai, seuil, grand) { return { delai: delai, seuil: seuil, grand: grand }; }

  /* Repli = barème historique (identique aux valeurs par défaut du backend). */
  var DELAIS = {
    sweatshirt:       regle('2-3 semaines', 10, '3-4 semaines'),
    tshirt:           regle('2-3 semaines', 10, '3-4 semaines'),
    tshirt_polyester: regle('2-3 semaines', 10, '3-4 semaines'),
    patches:          regle('5 à 7 semaines', null, null),
    coins:            regle('5 à 7 semaines', null, null),
    drapeaux:         regle('5 à 7 semaines', null, null)
  };
  /* Produit inconnu : délai atelier, le plus prudent. */
  var DEFAUT = 'patches';

  function estTextile(productType) {
    return TEXTILES.indexOf(String(productType || '')) !== -1;
  }
  window.estTextile = estTextile;

  /**
   * Délai de production d'UN article.
   * @param {string} productType
   * @param {number} qty  quantité de CET article
   * @returns {string} une durée lisible, jamais vide
   */
  function delaiProduction(productType, qty) {
    var r = DELAIS[String(productType || '')] || DELAIS[DEFAUT];
    var n = parseInt(qty, 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (r.seuil && r.grand && n > r.seuil) return r.grand;
    return r.delai;
  }
  window.delaiProduction = delaiProduction;

  /* Poids d'un délai = son PLUS GRAND nombre, en semaines (« 5 à 7 semaines »
     → 7 ; « 10 jours » → 10/7). Le texte étant libre dans le dashboard, une
     table figée de poids ne suffit plus. Sans nombre : poids 0. */
  function poids(d) {
    var nombres = String(d || '').match(/\d+(?:[.,]\d+)?/g);
    if (!nombres) return 0;
    var max = Math.max.apply(null, nombres.map(function (x) { return parseFloat(x.replace(',', '.')); }));
    return /jour/i.test(d) ? max / 7 : max;
  }

  /**
   * Délai d'une commande entière : le plus long de ses articles. La quantité
   * prise en compte est le TOTAL par produit (une répartition par tailles
   * crée une ligne par pièce : 50 sweats = 50 lignes de 1).
   * @param {Array} items  lignes du panier ({ productType, qty })
   * @returns {string} la durée, ou '' si le panier est vide
   */
  function delaiCommande(items) {
    if (!items || !items.length) return '';
    var totaux = {};
    items.forEach(function (it) {
      if (!it) return;
      var t = String(it.productType || '');
      totaux[t] = (totaux[t] || 0) + (parseInt(it.qty, 10) || 1);
    });
    var pire = '', poidsPire = -1;
    Object.keys(totaux).forEach(function (t) {
      var d = delaiProduction(t, totaux[t]);
      var p = poids(d);
      if (p > poidsPire) { poidsPire = p; pire = d; }
    });
    return pire;
  }
  window.delaiCommande = delaiCommande;

  /** Textes fixes du type <b class="js-delai" data-type="patches"> : mis à jour. */
  function rafraichirDelais() {
    document.querySelectorAll('.js-delai[data-type]').forEach(function (el) {
      el.textContent = delaiProduction(el.getAttribute('data-type'), 1);
    });
  }
  window.rafraichirDelais = rafraichirDelais;

  /**
   * Applique le barème du dashboard. Chaque règle est validée : une règle
   * invalide laisse la précédente en place plutôt que d'afficher un délai vide.
   */
  window.applyDelaisFromBackend = function (d) {
    if (!d || typeof d !== 'object') return false;
    var texte = function (v) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null; };
    var applique = false;
    Object.keys(DELAIS).forEach(function (p) {
      var r = d[p];
      if (!r || !texte(r.delai)) return;
      var seuil = parseInt(r.seuil, 10);
      var grand = texte(r.grand);
      DELAIS[p] = (isFinite(seuil) && seuil >= 1 && grand)
        ? regle(texte(r.delai), seuil, grand)
        : regle(texte(r.delai), null, null);
      applique = true;
    });
    if (applique) rafraichirDelais();
    return applique;
  };
})();
