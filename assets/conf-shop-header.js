/**
 * Réserve la hauteur du menu de la boutique au-dessus du configurateur.
 *
 * Le configurateur est une application plein écran : `.conf-app-root` fait
 * `calc(100vh - var(--shop-header-h))` (conf-styles.css). Sans cette variable,
 * il occupait 100vh et repoussait le menu — ajouté par
 * layout/configurateur.liquid — hors de la zone visible.
 *
 * La hauteur ne peut PAS être écrite en dur : elle dépend de la bannière
 * d'annonce, du nombre de lignes du menu et de la largeur d'écran (le menu
 * passe en burger sur mobile). On la mesure donc, et on la re-mesure au
 * redimensionnement ainsi qu'aux changements du header (bannière fermée,
 * sous-menu déplié).
 */
(function () {
  'use strict';

  /* Le header de la boutique est le <header> injecté par `{% sections
     'header-group' %}` : Shopify lui donne un id `shopify-section-…header…`.
     On ne cible pas `.hdr` — c'est l'en-tête PROPRE au configurateur, qui vit
     dans le flux normal et ne doit rien réserver. */
  function shopHeader() {
    return document.querySelector('header[id^="shopify-section"][id*="header"]');
  }

  function mesurer() {
    var h = shopHeader();
    var px = h ? Math.ceil(h.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--shop-header-h', px + 'px');
  }

  /* Première mesure dès que le DOM est prêt, puis une seconde après le
     chargement complet : polices et images du menu peuvent en changer la
     hauteur une fois arrivées. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mesurer);
  } else {
    mesurer();
  }
  window.addEventListener('load', mesurer);
  window.addEventListener('resize', mesurer);

  /* Le header bouge sans que la fenêtre change : fermeture de la bannière,
     ouverture du menu mobile. ResizeObserver capte ces cas ; il est absent de
     très vieux navigateurs, d'où le garde. */
  if (typeof ResizeObserver === 'function') {
    var cible = shopHeader();
    if (cible) new ResizeObserver(mesurer).observe(cible);
  }
})();
