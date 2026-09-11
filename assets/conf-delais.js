/**
 * DÉLAIS DE PRODUCTION — source unique de vérité.
 *
 * Quatre écrans annoncent ce délai : le récapitulatif du configurateur, la
 * barre mobile, le tiroir du panier et la page Récapitulatif. La règle est
 * écrite ICI et nulle part ailleurs : répétée quatre fois, elle divergerait au
 * premier changement de barème.
 *
 * Barème :
 *   • patchs, coins, drapeaux ......... 4 à 6 semaines (quelle que soit la qté)
 *   • textiles jusqu'à 10 unités ...... 3 semaines
 *   • textiles 10 unités et plus ...... 4 semaines
 *
 * NOMMAGE INVERSÉ : `productType` ne désigne pas la même chose partout dans ce
 * projet ('coins' vaut tantôt les coins, tantôt les patchs). On ne s'y fie donc
 * PAS pour distinguer coin/patch/drapeau — inutile ici, les trois partagent le
 * même délai. Seule compte la frontière textile / non-textile, et les trois
 * types textiles, eux, sont sans ambiguïté.
 *
 * On annonce une DURÉE, jamais une date : la livraison dépend aussi du
 * transport et de la validation de la maquette, que ce code ne connaît pas.
 */
(function () {
  'use strict';

  /* Les trois textiles, seule liste dont ce module a besoin. Tout ce qui n'y
     figure pas (coins, drapeaux, patchs) relève du délai atelier. */
  var TEXTILES = ['sweatshirt', 'tshirt', 'tshirt_polyester'];

  var DELAI_ATELIER = '4 à 6 semaines';
  var DELAI_TEXTILE_PETIT = '3 semaines';
  var DELAI_TEXTILE_GRAND = '4 semaines';

  /* Au-delà de ce nombre de pièces, la production passe à la semaine
     supérieure. « Jusqu'à 10 unités » inclut 10 : c'est à 11 que le délai
     s'allonge. */
  var SEUIL_TEXTILE = 10;

  function estTextile(productType) {
    return TEXTILES.indexOf(String(productType || '')) !== -1;
  }
  window.estTextile = estTextile;

  /**
   * Délai de production d'UN article.
   *
   * @param {string} productType  type du produit
   * @param {number} qty          quantité de CET article (le panier n'entre
   *   pas en compte : le client doit pouvoir relier le délai affiché à ce
   *   qu'il a sous les yeux)
   * @returns {string} une durée lisible, jamais vide
   */
  function delaiProduction(productType, qty) {
    if (!estTextile(productType)) return DELAI_ATELIER;
    var n = parseInt(qty, 10);
    if (!isFinite(n) || n < 1) n = 1;
    return (n > SEUIL_TEXTILE) ? DELAI_TEXTILE_GRAND : DELAI_TEXTILE_PETIT;
  }
  window.delaiProduction = delaiProduction;

  /* Poids d'un délai, pour comparer deux articles. Une commande part quand son
     article le plus lent est prêt : c'est donc le MAXIMUM qui vaut délai de
     commande, jamais une moyenne ni le premier trouvé. */
  var POIDS = {};
  POIDS[DELAI_TEXTILE_PETIT] = 3;
  POIDS[DELAI_TEXTILE_GRAND] = 4;
  POIDS[DELAI_ATELIER] = 6;

  /**
   * Délai d'une commande entière : le plus long de ses articles.
   *
   * @param {Array} items  lignes du panier ({ productType, qty })
   * @returns {string} la durée, ou '' si le panier est vide — l'appelant
   *   masque alors son encart plutôt que d'annoncer un délai pour rien.
   */
  function delaiCommande(items) {
    if (!items || !items.length) return '';
    var pire = '', poidsPire = -1;
    items.forEach(function (it) {
      if (!it) return;
      var d = delaiProduction(it.productType, it.qty);
      var p = POIDS[d] || 0;
      if (p > poidsPire) { poidsPire = p; pire = d; }
    });
    return pire;
  }
  window.delaiCommande = delaiCommande;
})();
