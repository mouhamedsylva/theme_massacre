/* ─────────────────────────────────────────────────────────────────────────
   Bascule manche gauche / manche droite (vue de côté, textiles).

   Il n'existe qu'UNE image de profil par couleur : le côté droit est le côté
   gauche retourné en miroir (le vêtement est symétrique). L'image seule est
   retournée — pas la couche des logos, sinon le design du client apparaîtrait
   inversé. La zone de la manche droite est donc placée en miroir dans le
   liquid (46% = 100 - 48 - 6).

   Deux entrées :
     - setSleeveSide('l' | 'r')  : clic sur la bascule
     - showSleeve('sl' | 'sr')   : appelé à l'upload, fait pivoter vers la
                                   bonne manche automatiquement.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var current = 'l';

  function layer() { return document.getElementById('logo-layer'); }
  function stage() { return document.querySelector('.cv-single-view'); }

  /** Affiche le côté demandé, avec l'animation de rotation. */
  function setSide(side, animate) {
    side = (side === 'r') ? 'r' : 'l';

    var lay = layer();
    var st = stage();
    if (!lay || !st) return;

    var changed = (side !== current);
    current = side;

    // Les zones/logos du côté masqué disparaissent (CSS [data-side]).
    lay.setAttribute('data-side', side);
    st.classList.toggle('side-r', side === 'r');
    // scaleX de destination, pour que l'animation parte du bon état.
    st.style.setProperty('--flip', side === 'r' ? -1 : 1);

    // Boutons de la bascule flottante (conservée, masquée quand les onglets
    // dédiés « Manche gauche / droite » sont affichés).
    var bl = document.getElementById('st-l');
    var br = document.getElementById('st-r');
    if (bl) bl.classList.toggle('on', side === 'l');
    if (br) br.classList.toggle('on', side === 'r');

    /* Onglets dédiés : ils remplacent « Vue de côté » quand l'option manches
       est active. Leur état actif suit le côté affiché. */
    var tl = document.getElementById('sleeve-l-btn');
    var tr = document.getElementById('sleeve-r-btn');
    if (tl || tr) {
      var inCote = lay.getAttribute('data-view') === 'cote';
      if (tl) tl.classList.toggle('on', inCote && side === 'l');
      if (tr) tr.classList.toggle('on', inCote && side === 'r');
    }

    // Rotation : uniquement si le côté change vraiment.
    if (changed && animate !== false) {
      st.classList.remove('flipping');
      void st.offsetWidth;            // relance l'animation
      st.classList.add('flipping');
      setTimeout(function () { st.classList.remove('flipping'); }, 600);
    }

    // Les pointillés dépendent du contenu de la zone affichée.
    if (typeof window.refreshZoneGuides === 'function') {
      window.refreshZoneGuides();
    }
  }

  /** Clic sur la bascule. */
  window.setSleeveSide = function (side) { setSide(side, true); };

  /**
   * Bascule vers la manche concernée par un upload, en passant d'abord en vue
   * de côté si nécessaire. C'est ce qui donne l'effet « le vêtement tourne
   * tout seul pour montrer la manche qu'on vient de personnaliser ».
   */
  window.showSleeve = function (zone) {
    if (zone !== 'sl' && zone !== 'sr') return;

    var side = (zone === 'sr') ? 'r' : 'l';
    var lay = layer();
    var alreadyCote = lay && lay.getAttribute('data-view') === 'cote';

    if (!alreadyCote) {
      /* Passe en vue de côté. On cible le bouton par SON ID : l'index dans
         .vt (tabs[2]) n'est plus fiable depuis l'ajout des onglets
         « Manche gauche / droite ». Le verrou disabled est levé le temps de
         l'appel — l'option est forcément active si un upload manche a lieu. */
      var coteTab = document.getElementById('cote-view-btn');
      if (coteTab && typeof window.selView === 'function') {
        var wasDisabled = coteTab.disabled;
        coteTab.disabled = false;
        window.selView(coteTab, 'cote');
        coteTab.disabled = wasDisabled;
      }
      // Laisse la vue s'afficher avant de pivoter, sinon les deux animations
      // se télescopent.
      setTimeout(function () {
        setSide(side, true);
        applySleeveZoom();
      }, 60);
      return;
    }
    setSide(side, true);
    applySleeveZoom();
  };

  /**
   * Clic sur un onglet « Manche gauche » / « Manche droite ».
   *
   * Passe en vue de côté si besoin, pivote vers la bonne manche, puis zoome :
   * une manche n'occupe qu'une petite part du visuel, un cadrage large ne
   * montre pas le flocage (même approche que CustomInk).
   *
   * @param {'l'|'r'} side
   */
  window.selectSleeveView = function (side) {
    var lay = layer();
    var inCote = lay && lay.getAttribute('data-view') === 'cote';

    if (!inCote) {
      var coteTab = document.getElementById('cote-view-btn');
      if (coteTab && typeof window.selView === 'function') {
        /* selView refuse un bouton disabled. L'onglet d'origine l'est tant que
           l'option manches est inactive : ici elle l'est forcément (ces onglets
           ne s'affichent qu'avec elle), on lève donc le verrou le temps de
           l'appel. */
        var wasDisabled = coteTab.disabled;
        coteTab.disabled = false;
        window.selView(coteTab, 'cote');
        coteTab.disabled = wasDisabled;
      }
      // Laisse la vue s'afficher avant de pivoter (animations sinon confondues).
      setTimeout(function () { setSide(side, true); applySleeveZoom(); }, 60);
      return;
    }
    setSide(side, true);
    applySleeveZoom();
  };

  /* Largeur au-delà de laquelle on n'est plus sur un téléphone. Même seuil
     que conf-mobile.js (MQ) : les deux doivent rester alignés. */
  var MOBILE_MQ = '(max-width: 767px)';

  /** Rapproche la vue sur la manche (sans écraser un réglage manuel).
   *
   * PAS en mobile : l'aperçu y occupe déjà presque toute la largeur de
   * l'écran, et le zoom à 200 % poussait la manche hors du cadre visible —
   * on ne voyait plus ni le flocage ni les repères de zone. Sur desktop
   * l'aperçu est petit au milieu de la page, s'en approcher a du sens. */
  function applySleeveZoom() {
    if (window.matchMedia(MOBILE_MQ).matches) return;
    if (typeof window.autoZoomTo === 'function') window.autoZoomTo(200);
  }

  /**
   * Affichage des sélecteurs selon la vue.
   *
   * La bascule flottante Gauche/Droite ne sert QUE si les onglets dédiés sont
   * absents (option manches inactive) : afficher les deux ferait doublon.
   */
  window.syncSideToggle = function (view) {
    var box = document.getElementById('side-toggle');
    var tabsShown = (function () {
      var tl = document.getElementById('sleeve-l-btn');
      return tl && tl.style.display !== 'none';
    })();
    if (box) {
      box.style.display = (view === 'cote' && !tabsShown) ? 'inline-flex' : 'none';
    }
    // Quitter la vue de côté désactive l'état actif des onglets manche.
    if (view !== 'cote') {
      ['sleeve-l-btn', 'sleeve-r-btn'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.classList.remove('on');
      });
    }
  };

  /** Côté actuellement affiché (utilisé à la capture des vues). */
  window.currentSleeveSide = function () { return current; };
})();
