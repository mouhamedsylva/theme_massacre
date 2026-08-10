/**
 * Barre d'outils horizontale du LOGO sur un coin.
 *
 * Apparaît sous la pièce dès qu'un logo est sélectionné dans le canvas et
 * regroupe les actions de cadrage : couvrir, ajuster, remplir la largeur,
 * recentrer, pivoter, retourner, réinitialiser.
 *
 * Modelée sur conf-text-toolbar.js (même cycle show/hide, même fermeture au
 * clic extérieur) pour que les deux barres se comportent identiquement.
 *
 * Géométrie : les logos sont positionnés en POURCENTAGE du disque parent
 * (left/top/width), convention posée par clampCoinLogo() dans
 * configurateur.liquid. On la respecte ici — travailler en pixels casserait
 * le rendu au redimensionnement de la fenêtre.
 */
(function () {
  'use strict';

  var BAR_ID = 'coin-toolbar';

  /* Emprise réelle du disque dans l'image du coin : le PNG comporte un bord
     transparent, donc 100 % de l'image ≠ 100 % de la pièce. Mêmes valeurs que
     clampCoinLogo(), dont cette barre est le pendant interactif. */
  var DISC = 79.4;

  /** @returns {number} marge transparente de chaque côté, en % de l'image. */
  function margin() {
    return (100 - DISC) / 2;
  }

  /**
   * Zone utile d'une face, en pourcentage de l'image du disque.
   * @param {HTMLElement} logo - Le logo déplaçable.
   * @returns {{lo:number, hi:number, loY:number, hiY:number, size:number}}
   */
  function zoneOf(logo) {
    var inset = (window.COIN_INSET != null ? window.COIN_INSET : 1);
    var offY = (window.COIN_OFFSET_Y != null ? window.COIN_OFFSET_Y : 3);
    var m = margin();
    var lo = m + (DISC * inset / 100);
    var hi = 100 - lo;
    var loY = lo + offY;
    var hiY = hi + offY;

    // Verso numéroté : le bas de la pièce est réservé au numéro gravé.
    var disc = logo.closest('.coin-disc');
    if (disc && disc.classList.contains('has-number')) {
      var reserve = (window.COIN_NUMBER_RESERVE != null ? window.COIN_NUMBER_RESERVE : 22);
      hiY = Math.min(hiY, 100 - reserve);
    }
    return { lo: lo, hi: hi, loY: loY, hiY: hiY, size: hi - lo };
  }

  /* Dernier logo pour lequel la barre a été affichée. Sert de repli quand la
     sélection est perdue juste avant le clic (voir onBarClick). */
  var lastLogo = null;

  /**
   * @returns {HTMLElement|null} le logo de coin sélectionné ET visible.
   *
   * La visibilité est vérifiée : removeCoinLogo() masque le logo en
   * display:none sans retirer .is-selected, et le canvas est reconstruit sans
   * logo au changement de produit. Sans ce test, la barre resterait affichée
   * au-dessus d'une pièce vide.
   */
  function currentLogo() {
    var el = document.querySelector('.coin-logo.is-selected');
    if (!el || !el.isConnected) return null;
    if (el.style.display === 'none' || !el.offsetParent) return null;
    // Un logo sans image n'est pas manipulable.
    var img = el.querySelector('img');
    if (!img || !img.getAttribute('src')) return null;
    return el;
  }

  /** @returns {string} 'recto' | 'verso' — la face portant ce logo. */
  function faceOf(logo) {
    return (logo && logo.id === 'coin-logo-verso') ? 'verso' : 'recto';
  }

  /**
   * Hauteur actuelle du logo, en % du disque.
   * Mesurée sur le rendu : elle dépend du ratio de l'image, inconnu a priori.
   */
  function heightPct(logo) {
    var disc = logo.closest('.coin-disc');
    if (!disc || !disc.offsetHeight) return 0;
    return (logo.offsetHeight / disc.offsetHeight) * 100;
  }

  /**
   * Répercute le changement sur la vue de côté et la vignette du récap.
   * La tranche reprend l'échelle du recto : sans cela elle garderait
   * la taille du visuel précédent.
   */
  function syncAfterChange(logo) {
    if (faceOf(logo) === 'recto' && typeof window.syncCoinCote === 'function') {
      window.syncCoinCote(logo);
    }
    if (typeof window.updateCoinRecapThumb === 'function') {
      window.updateCoinRecapThumb();
    }
    persist(logo);
  }

  /**
   * Enregistre la géométrie pour qu'elle survive au rechargement.
   * saveUploadGeo() est exposée par configurateur.liquid.
   */
  function persist(logo) {
    if (typeof window.saveUploadGeo !== 'function') return;
    var zone = logo.getAttribute('data-zone');
    if (!zone) return;
    window.saveUploadGeo(zone, {
      left: parseFloat(logo.style.left) || 0,
      top: parseFloat(logo.style.top) || 0,
      width: parseFloat(logo.style.width) || 44
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ACTIONS DE CADRAGE
     ═══════════════════════════════════════════════════════════ */

  /**
   * COUVRIR — l'image occupe toute la pièce, quitte à déborder (rognée par le
   * disque). C'est le `background-size: cover` du web : on prend la plus GRANDE
   * des deux dimensions pour qu'aucun vide ne subsiste.
   */
  function actionCover(logo) {
    var z = zoneOf(logo);

    // Largeur de référence, puis mesure de la hauteur obtenue.
    logo.style.width = z.size + '%';
    var h = heightPct(logo);
    if (h > 0 && h < z.size) {
      // Image plus large que haute : on agrandit jusqu'à combler la hauteur.
      logo.style.width = (z.size * (z.size / h)) + '%';
    }

    center(logo);
    syncAfterChange(logo);
  }

  /**
   * AJUSTER — l'image entière est visible dans la pièce (`contain`).
   * Délègue à clampCoinLogo(face, true), qui fait déjà exactement cela.
   */
  function actionFit(logo) {
    if (typeof window.clampCoinLogo === 'function') {
      window.clampCoinLogo(faceOf(logo), true);
    }
    syncAfterChange(logo);
  }

  /** REMPLIR LA LARGEUR — l'image occupe toute la largeur, hauteur libre. */
  function actionFillWidth(logo) {
    var z = zoneOf(logo);
    logo.style.width = z.size + '%';
    center(logo);
    syncAfterChange(logo);
  }

  /** Centre le logo dans la zone utile, sans changer sa taille. */
  function center(logo) {
    var z = zoneOf(logo);
    var w = parseFloat(logo.style.width) || 44;
    var h = heightPct(logo);
    logo.style.left = (z.lo + (z.size - w) / 2) + '%';
    logo.style.top = (z.loY + (z.size - h) / 2) + '%';
  }

  /** RECENTRER — repositionne au centre en conservant la taille. */
  function actionCenter(logo) {
    center(logo);
    syncAfterChange(logo);
  }

  /**
   * Applique une transformation CSS à l'image du logo.
   * Rotation et miroir sont cumulables : on stocke l'état sur l'élément et on
   * recompose la chaîne complète à chaque fois.
   */
  function applyTransform(logo) {
    var img = logo.querySelector('img');
    if (!img) return;
    var rot = parseInt(logo.getAttribute('data-rot') || '0', 10);
    var flipH = logo.getAttribute('data-fliph') === '1' ? -1 : 1;
    var flipV = logo.getAttribute('data-flipv') === '1' ? -1 : 1;
    img.style.transform = 'rotate(' + rot + 'deg) scale(' + flipH + ',' + flipV + ')';
    img.style.transformOrigin = 'center center';
  }

  /** PIVOTER — quart de tour horaire. */
  function actionRotate(logo) {
    var rot = (parseInt(logo.getAttribute('data-rot') || '0', 10) + 90) % 360;
    logo.setAttribute('data-rot', String(rot));
    applyTransform(logo);
    syncAfterChange(logo);
  }

  /** MIROIR HORIZONTAL. */
  function actionFlipH(logo) {
    var on = logo.getAttribute('data-fliph') === '1';
    logo.setAttribute('data-fliph', on ? '0' : '1');
    applyTransform(logo);
    syncAfterChange(logo);
  }

  /** RÉINITIALISER — taille et position par défaut, sans transformation. */
  function actionReset(logo) {
    logo.setAttribute('data-rot', '0');
    logo.setAttribute('data-fliph', '0');
    logo.setAttribute('data-flipv', '0');
    applyTransform(logo);
    logo.style.width = '44%';
    logo.style.left = '28%';
    logo.style.top = '28%';
    if (typeof window.clampCoinLogo === 'function') {
      window.clampCoinLogo(faceOf(logo), false);
    }
    syncAfterChange(logo);
  }

  /* Table des actions : le data-act du bouton pointe ici. */
  var ACTIONS = {
    cover: actionCover,
    fit: actionFit,
    fillw: actionFillWidth,
    center: actionCenter,
    rotate: actionRotate,
    fliph: actionFlipH,
    reset: actionReset
  };

  /* ═══════════════════════════════════════════════════════════
     CONSTRUCTION DE LA BARRE
     ═══════════════════════════════════════════════════════════ */

  var BUTTONS = [
    {
      act: 'cover', label: 'Couvrir', title: 'L’image couvre toute la pièce',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<circle cx="12" cy="12" r="9"/><rect x="4" y="4" width="16" height="16" rx="1"/></svg>'
    },
    {
      act: 'fit', label: 'Ajuster', title: 'L’image entière tient dans la pièce',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<circle cx="12" cy="12" r="9"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>'
    },
    {
      act: 'fillw', label: 'Largeur', title: 'Occuper toute la largeur',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>'
    },
    { sep: true },
    {
      act: 'center', label: 'Centrer', title: 'Recentrer sur la pièce',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>'
    },
    {
      act: 'rotate', label: 'Pivoter', title: 'Pivoter d’un quart de tour',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>'
    },
    {
      act: 'fliph', label: 'Miroir', title: 'Retourner horizontalement',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<path d="M12 3v18"/><path d="M9 7L4 12l5 5z"/><path d="M15 7l5 5-5 5z"/></svg>'
    },
    { sep: true },
    {
      act: 'reset', label: 'Réinit.', title: 'Revenir au cadrage par défaut',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>'
    }
    /* Pas de « Supprimer » ici : la suppression passe par le bouton « × » du
       logo dans le canvas et par le panneau Upload. Deux points d'entrée
       suffisent, et la barre ne sert qu'au cadrage. */
  ];

  /** Construit la barre (une seule fois) et l'insère dans le document. */
  function buildBar() {
    var bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'coin-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Options de l’image');

    bar.innerHTML = BUTTONS.map(function (b) {
      if (b.sep) return '<span class="coin-tb-sep"></span>';
      return '<button type="button" class="coin-tb-btn' +
             (b.danger ? ' is-danger' : '') + '" data-act="' + b.act +
             '" title="' + b.title + '">' + b.icon +
             '<span>' + b.label + '</span></button>';
    }).join('');

    // Un seul écouteur délégué : les boutons ne changent jamais.
    bar.addEventListener('click', onBarClick);

    /* La barre pilote le logo sélectionné : un appui dedans ne doit ni lui
       voler le focus, ni remonter jusqu'aux handlers de document qui
       désélectionnent au clic extérieur. stopPropagation est indispensable —
       preventDefault seul laisse l'événement remonter, le logo est
       désélectionné dès le mousedown et le click n'atteint jamais la barre.
       Le tactile suit le même chemin. */
    ['mousedown', 'touchstart', 'pointerdown'].forEach(function (type) {
      bar.addEventListener(type, function (e) {
        e.stopPropagation();
        e.preventDefault();
      }, { passive: false });
    });

    /* Montée dans .conf-app-root, pas dans <body> : ce conteneur est lui-même
       en position:fixed avec z-index:9999 (conf-styles.css). Une barre posée
       sur le body resterait DERRIÈRE l'application, donc invisible. */
    var host = document.querySelector('.conf-app-root') || document.body;
    host.appendChild(bar);
    return bar;
  }

  /** Exécute l'action du bouton cliqué sur le logo sélectionné. */
  function onBarClick(e) {
    var btn = e.target.closest('.coin-tb-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    /* Repli sur le dernier logo piloté : si un handler extérieur a retiré
       .is-selected entre l'affichage de la barre et le clic, l'action doit
       tout de même s'appliquer à l'image que l'utilisateur visait. Le repli
       n'est retenu que s'il est toujours affiché — un logo supprimé entre
       temps ne doit rien recevoir. */
    var logo = currentLogo();
    if (!logo && lastLogo && lastLogo.isConnected &&
        lastLogo.style.display !== 'none') {
      logo = lastLogo;
    }
    if (!logo) return;

    // La sélection est rétablie : la barre reste visible après l'action.
    if (!logo.classList.contains('is-selected') &&
        typeof window.selectDesignLogo === 'function') {
      window.selectDesignLogo(logo);
    }

    var fn = ACTIONS[btn.getAttribute('data-act')];
    if (fn) {
      fn(logo);
      // La barre suit le logo : ses dimensions viennent de changer.
      position(logo);
    }
  }

  /**
   * Place la barre AU-DESSUS de l'image, centrée sur elle.
   *
   * L'ancrage se fait sur le logo lui-même (et non sur le disque) : c'est
   * l'image que l'on manipule, la barre doit la surmonter directement, y
   * compris après un déplacement du logo dans la pièce.
   *
   * Position fixed : elle échappe ainsi à l'overflow du canvas.
   */
  function position(logo) {
    var bar = document.getElementById(BAR_ID);
    if (!bar || !logo) return;
    var r = logo.getBoundingClientRect();
    var bw = bar.offsetWidth;
    var bh = bar.offsetHeight;
    /* 22 px : le bouton « × » de suppression déborde de 13 px au-dessus du
       logo (.logo-ctrl-del, conf-styles.css). Un écart plus faible ferait
       passer la barre par-dessus et le rendrait incliquable. */
    var GAP = 22;

    /* Bornes horizontales : la zone du canvas, pas la fenêtre. Une barre
       centrée sur une image proche du bord déborderait sinon sur la sidebar
       ou le récapitulatif, et masquerait leurs contrôles. */
    var stage = logo.closest('.coin-canvas-container') ||
                logo.closest('.cv-wrap');
    var minX = 8;
    var maxX = window.innerWidth - bw - 8;
    if (stage) {
      var sr = stage.getBoundingClientRect();
      minX = Math.max(minX, sr.left + 4);
      maxX = Math.min(maxX, sr.right - bw - 4);
    }

    var left = r.left + (r.width - bw) / 2;
    // maxX peut passer sous minX si la barre est plus large que le canvas :
    // on privilégie alors le bord gauche plutôt qu'une valeur incohérente.
    left = (maxX < minX) ? minX : Math.max(minX, Math.min(left, maxX));

    // Au-dessus de l'image par défaut.
    var top = r.top - bh - GAP;
    // Trop haut pour tenir (image collée au bord supérieur) : on bascule
    // dessous plutôt que de sortir de l'écran.
    if (top < 8) top = r.bottom + GAP;

    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }

  /* ═══════════════════════════════════════════════════════════
     CYCLE DE VIE
     ═══════════════════════════════════════════════════════════ */

  /**
   * Affiche la barre pour un logo de coin.
   * @param {HTMLElement} logo - Le logo sélectionné.
   */
  function show(logo) {
    if (!logo || !logo.classList.contains('coin-logo')) return;
    lastLogo = logo;
    var bar = buildBar();
    bar.classList.add('on');
    // La largeur doit être connue avant de centrer : on positionne après
    // que le navigateur a calculé la mise en page.
    requestAnimationFrame(function () { position(logo); });
  }
  window.showCoinToolbar = show;

  /** Masque la barre. */
  function hide() {
    var bar = document.getElementById(BAR_ID);
    if (bar) bar.classList.remove('on');
  }
  window.hideCoinToolbar = hide;

  /* Garde-fou de réentrance : show() écrit dans le style de la barre, ce que
     l'observateur du document voit comme une mutation — sans ce drapeau, il
     se rappellerait lui-même en boucle. */
  var syncing = false;

  /** Aligne la barre sur l'état courant de la sélection. */
  function sync() {
    if (syncing) return;
    syncing = true;
    try {
      var logo = currentLogo();
      if (logo) show(logo);
      else hide();
    } finally {
      // Rendu à la fin du tour de boucle : les mutations déclenchées par
      // show() sont livrées de façon asynchrone par le MutationObserver.
      setTimeout(function () { syncing = false; }, 0);
    }
  }

  /* Suit la sélection.
     conf-logo-drag.js pose/retire .is-selected sans émettre d'événement : il
     n'y a rien à écouter, on observe donc le DOM.
     L'observation porte sur le DOCUMENT entier, et non sur les .coin-logo :
     au chargement, le canvas des coins n'existe pas encore (il est construit
     par loadPatchesCanvas() à la sélection du produit), et il est reconstruit
     à chaque changement de produit. Observer les logos directement ne
     visait donc rien, ou des éléments déjà détruits.
     subtree + childList couvre aussi l'apparition du canvas lui-même. */
  function init() {
    new MutationObserver(sync).observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true
    });

    sync();
    confLog('🪙 Barre d’outils coin prête');

    // La barre est ancrée en coordonnées écran : elle doit suivre.
    window.addEventListener('resize', function () {
      var logo = currentLogo();
      if (logo) position(logo);
    });
    window.addEventListener('scroll', function () {
      var logo = currentLogo();
      if (logo) position(logo);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
