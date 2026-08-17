/**
 * Réserve la hauteur de la BANDE D'ANNONCE au-dessus du configurateur, sur
 * téléphone uniquement.
 *
 * Pourquoi un fichier à part plutôt qu'un ajout dans conf-shop-header.js :
 * celui-ci mesure le <header> de la boutique et alimente --shop-header-h, une
 * variable lue par le desktop comme par le mobile. Le besoin traité ici lui est
 * étranger — sur téléphone le menu est masqué (.header-section, conf-mobile.css)
 * et --shop-header-h retombe donc à 0, alors que la bande, elle, reste affichée.
 *
 * La bande est injectée par une APPLICATION TIERCE (BSS Banner), en dehors de
 * #header-group : aucun fichier du thème ne la rend, sa hauteur ne peut donc
 * être connue qu'à l'exécution.
 *
 * Expose --conf-banner-h, consommée par .conf-app-root dans conf-mobile.css.
 */
(function () {
  'use strict';

  /* Même seuil que conf-mobile.css : au-delà, le desktop garde son propre
     mécanisme (--shop-header-h) et cette mesure n'a pas lieu d'être. */
  function estMobile() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  /* Sélecteurs par ordre de précision. La bande venant d'une app, son balisage
     n'est pas garanti : on accepte plusieurs formes plutôt que d'en figer une.
     `.announcement-bar` est la classe du thème, les deux suivantes couvrent les
     variantes d'application. */
  var SELECTEURS = [
    '.announcement-bar',
    '[class*="announcement-bar"]',
    '[id*="bss-banner"], [class*="bss-banner"]'
  ].join(', ');

  function bande() {
    var els = document.querySelectorAll(SELECTEURS);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      /* Un élément à hauteur nulle est masqué ou pas encore rendu ; un élément
         DANS le configurateur n'est pas la bande de la boutique. */
      if (el.closest('.conf-app-root')) continue;
      if (el.getBoundingClientRect().height > 0) return el;
    }
    return null;
  }

  function mesurer() {
    var px = 0;
    if (estMobile()) {
      var el = bande();
      if (el) {
        var r = el.getBoundingClientRect();
        /* On mesure le BAS et non la hauteur : si la bande n'est pas collée au
           sommet de la page, sa seule hauteur laisserait un décalage. */
        px = Math.max(0, Math.ceil(r.bottom));
      }
    }
    document.documentElement.style.setProperty('--conf-banner-h', px + 'px');
  }

  /* Deux mesures : à l'arrivée du DOM, puis au chargement complet — la bande
     est posée par un script d'application, souvent après DOMContentLoaded. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mesurer);
  } else {
    mesurer();
  }
  window.addEventListener('load', mesurer);
  window.addEventListener('resize', mesurer);
  window.addEventListener('orientationchange', mesurer);

  /* La bande apparaît TARDIVEMENT (injection par l'app) et peut disparaître
     (fermeture par le client, rotation du carrousel). Un observateur sur <body>
     capte les deux, là où un simple délai raterait l'un ou l'autre. */
  if (typeof MutationObserver === 'function') {
    var enAttente = false;
    var obs = new MutationObserver(function () {
      /* Regroupé sur une frame : l'app peut faire plusieurs écritures d'affilée,
         et `mesurer` écrit une variable CSS — donc déclencherait l'observateur
         en boucle sans ce garde. */
      if (enAttente) return;
      enAttente = true;
      requestAnimationFrame(function () {
        enAttente = false;
        mesurer();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
})();
