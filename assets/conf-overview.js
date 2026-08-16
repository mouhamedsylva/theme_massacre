/**
 * Vue d'ensemble — toutes les vues personnalisées d'un textile, côte à côte.
 *
 * Réutilise captureAllViews() (configurateur.liquid), qui reprojette déjà les
 * logos ET les textes sur chaque image produit pour la planche de production :
 * ce que le client voit ici est donc exactement ce que l'atelier recevra.
 *
 * Une vue sans impression est omise par captureAllViews() — la modale ne
 * montre que ce qui a réellement été personnalisé.
 *
 * Déporté dans un asset : configurateur.liquid est à la limite Shopify
 * de 256 Ko.
 */
(function () {
  'use strict';

  var TEXTILES = ['sweatshirt', 'tshirt', 'tshirt_polyester'];

  function el(id) { return document.getElementById(id); }

  /** @returns {boolean} le produit courant est-il un textile ? */
  function isTextile() {
    return TEXTILES.indexOf(window.currentProductType) !== -1;
  }

  /**
   * Fonction de capture du produit courant.
   *
   * Toutes renvoient la même forme — [{ label, background, logos }] — d'où un
   * rendu commun quel que soit le produit. Les coins et drapeaux sont
   * synchrones, les patchs et textiles asynchrones : l'appelant fait `await`,
   * ce qui couvre les deux cas.
   *
   * @returns {Function|null}
   */
  function captureFn() {
    var t = window.currentProductType;
    if (isTextile()) return window.captureAllViews;
    if (t === 'coins') return window.captureCoinDesign;
    if (t === 'drapeaux') return window.captureFlagDesign;
    if (t === 'patches') return window.capturePatchDesign;
    return null;
  }

  /** L'onglet n'a de sens que si le produit courant sait se capturer. */
  function refreshOverviewTab() {
    var btn = el('overview-btn');
    if (btn) btn.style.display = typeof captureFn() === 'function' ? '' : 'none';
  }
  window.refreshOverviewTab = refreshOverviewTab;

  /** Ouvre la modale et compose les vues. */
  async function showOverview() {
    var modal = el('ov-modal');
    var overlay = el('ov-overlay');
    var body = el('ov-body');
    if (!modal || !body) return;

    /* La capture AVANT l'ouverture : toutes ces fonctions mesurent le DOM
       (getBoundingClientRect) pour positionner les calques. Ouvrir la modale
       d'abord posait overflow:hidden sur le body et recouvrait le canvas —
       les mesures retombaient à zéro et aucun logo n'était retenu, d'où une
       modale vide alors que le design existait bien. */
    var fn = captureFn();
    var views = null;
    if (typeof fn === 'function') {
      try {
        var raw = await fn();
        /* Normalisation : capturePatchDesign() renvoie UNE vue (objet), les
           autres un TABLEAU de vues. Sans ce test, views.length valait
           undefined sur un patch et la modale s'affichait vide. */
        if (raw && !Array.isArray(raw)) raw = [raw];
        views = raw;
      } catch (e) {
        console.warn('Vue d’ensemble : capture échouée —', e);
        views = null;
      }
    } else {
      console.warn('Vue d’ensemble : aucune fonction de capture pour',
                   window.currentProductType);
    }

    overlay.classList.add('open');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (typeof fn !== 'function') {
      body.innerHTML = '<p class="ov-empty">Aperçu indisponible pour ce produit.</p>';
      return;
    }

    if (!views || !views.length) {
      body.innerHTML =
        '<p class="ov-empty">Aucune personnalisation pour le moment.<br>' +
        'Ajoutez un logo ou un texte, puis revenez ici.</p>';
      return;
    }

    /* Chaque vue est un composite : image du vêtement + calques positionnés en
       fraction de l'image (x/y/w), tels que renvoyés par captureAllViews. Le
       positionnement en % reproduit donc fidèlement le canvas. */
    body.innerHTML = views.map(function (v) {
      var layers = (v.logos || []).map(function (g) {
        return '<img class="ov-layer" src="' + g.src + '" alt="" ' +
               'style="left:' + (g.x * 100) + '%;top:' + (g.y * 100) + '%;' +
               'width:' + (g.w * 100) + '%">';
      }).join('');

      // capturePatchDesign() ne renvoie pas de label (vue unique) : on le
      // nomme plutôt que d'afficher une légende vide.
      var label = v.label || 'APERÇU';

      return '<figure class="ov-card">' +
               '<div class="ov-stage' + (v.mirror ? ' is-mirror' : '') + '">' +
                 '<img class="ov-bg" src="' + v.background + '" alt="' + label + '">' +
                 '<div class="ov-layers">' + layers + '</div>' +
               '</div>' +
               '<figcaption>' + label + '</figcaption>' +
             '</figure>';
    }).join('');
  }
  window.showOverview = showOverview;

  /** Ferme la modale. */
  function closeOverview() {
    var modal = el('ov-modal');
    var overlay = el('ov-overlay');
    if (modal) modal.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  window.closeOverview = closeOverview;

  // Échap ferme la modale, comme les autres overlays du configurateur.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeOverview();
  });

  /* Décision d'affichage rejouée à plusieurs moments, à dessein.

     captureFn() dépend de window.currentProductType et des fonctions de
     capture, toutes posées par conf-main-inline.js — chargé APRÈS ce fichier
     (il vit dans le <body> de la section, celui-ci dans le <head> du layout,
     et les scripts `defer` s'exécutent dans l'ordre du document). Au premier
     passage, ces valeurs n'existent donc pas encore : le bouton était masqué et
     ne réapparaissait qu'au changement de produit.

     conf-main-inline.js rappelle désormais refreshOverviewTab() dès qu'il a
     posé la variable (:730-750). Le rappel sur `load` ci-dessous reste un
     filet : il garantit une décision juste même si l'ordre de chargement
     change, sans dépendre d'un appelant particulier. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshOverviewTab);
  } else {
    refreshOverviewTab();
  }
  window.addEventListener('load', refreshOverviewTab);
})();
