/* ═══════════════════════════════════════════════════════════════════════════
   RENDU DES PASTILLES DE COULEUR

   Les pastilles étaient quarante `<div class="cs">` figés dans le Liquid,
   partagés par les trois textiles. Le sweatshirt ayant sa propre palette, elles
   sont désormais DESSINÉES à partir de `PRODUCT_COLORS` (conf-palettes.js) et
   redessinées à chaque changement de produit.

   Le balisage produit est IDENTIQUE à celui d'avant — même classe `.cs`, même
   `title`, même `onclick="selColor(...)"`. C'est ce qui permet à tout
   l'existant de continuer à fonctionner sans y toucher :

     • le menu au-dessus du canvas CLONE ce bloc (conf-canvas-options.js) et
       hérite des `onclick` inline ;
     • `applyColorForProduct` et `restoreColor` retrouvent une pastille par son
       `title` ;
     • `grpColors()` (commandes de groupe) agrège les `.cs` du document.

   ── LE PIÈGE DU CLONE ──────────────────────────────────────────────────────
   Le menu du canvas garde une COPIE du bloc. La redessiner sans invalider la
   copie laisserait l'ancienne palette accessible : `grpColors()` ratisse tout
   le document, clones compris, et ferait resurgir les couleurs retirées dans
   les commandes de groupe. D'où l'appel à `resetCanvasOptionClones()`.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /**
   * Dessine les pastilles du produit dans le bloc `.cg`.
   *
   * @param {string} produit - clé `data-product` (sweatshirt, tshirt, …)
   * @param {string} [nomActif] - couleur à marquer sélectionnée.
   * @returns {boolean} false si le bloc est absent (produit non textile).
   */
  function renduPastilles(produit, nomActif) {
    /* Le bloc peut avoir été remplacé par la sidebar d'un coin ou d'un
       drapeau : on le retrouve par sa classe autant que par son identifiant. */
    var cg = document.getElementById('cg-couleurs') ||
             document.querySelector('.sidebar .cg') ||
             document.querySelector('#sidebar-content .cg');
    if (!cg) return false;

    var palette = (typeof window.paletteProduit === 'function')
      ? window.paletteProduit(produit) : null;
    if (!palette || !palette.length) return false;

    var html = '';
    for (var i = 0; i < palette.length; i++) {
      var c = palette[i];
      /* Les teintes très claires disparaîtraient sur le fond blanc du panneau :
         une bordure les matérialise. Le seuil suit la luminance perçue, plus
         fidèle à l'œil qu'une moyenne des composantes. */
      var bordure = c.bordure || luminance(c.hex) > 0.82
        ? ';border:1.5px solid #ddd' : '';
      var actif = (c.nom === nomActif) ? ' on' : '';
      html += '<div class="cs' + actif + '" style="background:' + c.hex +
              bordure + '" title="' + echapper(c.nom) +
              '" onclick="selColor(this,\'' + c.hex + '\',\'' +
              echapperJs(c.nom) + '\')"></div>';
    }
    cg.innerHTML = html;
    cg.id = 'cg-couleurs';   // conservé même après réinjection de la sidebar

    /* La copie du menu du canvas est devenue fausse : elle sera reconstruite
       à sa prochaine ouverture. */
    if (typeof window.resetCanvasOptionClones === 'function') {
      window.resetCanvasOptionClones();
    }
    /* Le clone DÉJÀ posé dans le menu doit disparaître : `resetClones` ne fait
       qu'autoriser sa reconstruction, il ne retire pas l'ancien du document —
       et `grpColors()` le lirait encore. */
    var vieux = document.querySelectorAll('.cv-opt-clone');
    for (var k = 0; k < vieux.length; k++) {
      if (vieux[k].parentNode) vieux[k].parentNode.removeChild(vieux[k]);
    }
    return true;
  }

  /** Luminance perçue, 0 (noir) à 1 (blanc). */
  function luminance(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length !== 6) return 0;
    var r = parseInt(h.slice(0, 2), 16) / 255;
    var g = parseInt(h.slice(2, 4), 16) / 255;
    var b = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /* Les noms viennent d'un fichier que nous maîtrisons, mais ils entrent dans
     un attribut HTML et dans une chaîne JavaScript : une apostrophe suffirait à
     casser le balisage. « Rose pâle » passe, « L'Or » casserait. */
  function echapper(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function echapperJs(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  window.renduPastilles = renduPastilles;

  /* PREMIER RENDU — le bloc livré par le Liquid est vide.

     Il a lieu avant que `selProd` n'ait tourné : on lit donc le produit
     mémorisé, avec le sweatshirt en repli puisque c'est celui qui ouvre le
     configurateur. La couleur active, elle, sera posée par
     `applyColorForProduct`. */
  function premierRendu() {
    var produit = null;
    try { produit = sessionStorage.getItem('conf_current_product'); } catch (e) {}
    produit = produit || window.currentProductType || 'sweatshirt';

    var nom = null;
    try {
      var all = JSON.parse(sessionStorage.getItem('conf_current_color') || '{}');
      if (all && all[produit] && all[produit].name) nom = all[produit].name;
    } catch (e) {}
    if (!nom && typeof window.couleurParDefaut === 'function') {
      nom = window.couleurParDefaut(produit).nom;
    }
    renduPastilles(produit, nom);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', premierRendu);
  } else {
    premierRendu();
  }
})();
