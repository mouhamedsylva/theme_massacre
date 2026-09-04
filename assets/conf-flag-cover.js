/**
 * Drapeaux : design en COUVERTURE + édition au double-clic.
 *
 * Même comportement que les patchs :
 *   - à l'upload, le design REMPLIT la zone imprimable et déborde (le surplus
 *     est rogné) au lieu d'y tenir en entier avec du vide autour ;
 *   - le glisser recadre ;
 *   - le double-clic révèle l'image entière, estompée hors zone, et active
 *     les 4 poignées d'angle pour l'agrandir.
 *
 * Le rognage est posé en PIXELS : la boîte du drapeau change avec
 * l'orientation (paysage/portrait) et la largeur disponible, donc un cadre
 * en % serait faux. syncFlagCrop() le recalcule à chaque changement.
 */
(function () {
  'use strict';

  var FACES = ['recto', 'verso'];

  function wrapOf(face) {
    return document.querySelector('.flag-img-3d[data-face="' + face + '"]');
  }
  function logoOf(face) {
    return document.getElementById('flag-logo-' + face);
  }

  /* Reprise quand le DOM n'est pas encore mesurable. Bornée : au-delà, c'est
     que le drapeau n'est pas affiché (autre produit). */
  var retries = {};
  function retryLater(face) {
    if ((retries[face] || 0) >= 20) return;
    retries[face] = (retries[face] || 0) + 1;
    setTimeout(function () { syncFlagCrop(face); }, 100);
  }

  /* REMISE À ZÉRO du quota, pour un CONTEXTE NEUF.

     Le quota ne se réarme qu'après un succès (plus bas, `retries[f] = 0`).
     Épuisé une fois — canvas non encore mis en page, produit absent — il le
     restait pour toute la vie de la page : toute tentative ultérieure sortait
     en silence, et le cadre n'était plus jamais posé.

     C'est ce qui rendait la panne définitive au lieu de se résorber. Ouvrir un
     article du panier reconstruit le canvas : le budget doit repartir de zéro,
     comme au chargement de la page. */
  window.resetFlagCropRetries = function () { retries = {}; };

  /**
   * Place le conteneur de rognage sur la zone imprimable, et y déplace le
   * logo s'il n'y est pas encore.
   *
   * Les bornes sont celles de .flag-safe-zone (ourlet + œillets), déjà
   * calculées par syncFlagSafeZones() : on les relit plutôt que de les
   * recalculer, pour que les deux ne divergent jamais.
   */
  function syncFlagCrop(face) {
    var faces = face ? [face] : FACES;
    faces.forEach(function (f) {
      var wrap = wrapOf(f);
      var logo = logoOf(f);
      if (!wrap || !logo) return;

      /* Image pas encore mesurable (canvas reconstruit, image non décodée) :
         on repasse au prochain rendu. Sans cette reprise, revenir depuis un
         autre produit laissait le design en petite vignette — le cadre de
         rognage n'était jamais posé. */
      /* GARDE ALIGNÉE SUR CELLE DES COINS (conf-coin-cover.js:68).

         Elle mesurait l'IMAGE elle-même : `offsetWidth` vaut 0 tant que le
         bitmap n'est pas décodé. Or loadDrapeauxCanvas recrée cette balise avec
         un `src` neuf à chaque changement de produit — la fonction sortait donc
         avant d'avoir posé le cadre, et le logo n'était ni reparenté dans
         `.flag-crop`, ni marqué `is-cover`, ni redimensionné. Sans `is-cover`
         le CSS retombe sur `contain` et les pourcentages se rapportent au
         mauvais parent : le design existait mais s'affichait hors cadre — d'où
         « le design est perdu » au retour depuis le panier.

         Le coin, lui, mesure son conteneur — une div dimensionnée par CSS, non
         nulle dès l'insertion. C'est ce qui le fait réussir du premier coup.

         On attend donc que le WRAPPER soit mesurable (immédiat), puis que
         l'image le soit à son tour. Cette seconde attente reste nécessaire :
         le calcul des marges ci-dessous lit `img.offsetWidth`. La différence
         est que l'écouteur `load` posé plus bas garantit désormais une reprise,
         là où le seul réessai temporisé pouvait épuiser son quota. */
      var img = wrap.querySelector('.flag-base-img');
      if (!img || !wrap.offsetWidth || !wrap.offsetHeight) {
        retryLater(f);
        return;
      }
      if (!img.offsetWidth || !img.offsetHeight) {
        /* Image pas encore décodée : on se replanifie sur son chargement plutôt
           que sur un simple délai — l'événement arrive toujours, le quota de
           réessais non. */
        img.addEventListener('load', function () { syncFlagCrop(f); }, { once: true });
        retryLater(f);
        return;
      }
      retries[f] = 0;   // DOM prêt : quota réarmé

      var crop = wrap.querySelector('.flag-crop[data-face="' + f + '"]');
      if (!crop) {
        crop = document.createElement('div');
        crop.className = 'flag-crop';
        crop.setAttribute('data-face', f);
        wrap.appendChild(crop);
      }

      /* Marges de sécurité, mêmes constantes que la contrainte de drag —
         propres à l'orientation : les fichiers paysage et portrait n'ont pas
         le même cadrage (voir FLAG_INSET_PORTRAIT dans conf-logo-drag.js). */
      var isPortrait = window.__flagOrientation === 'portrait';
      var ix = (isPortrait
        ? (window.FLAG_INSET_PORTRAIT != null ? window.FLAG_INSET_PORTRAIT : 7)
        : (window.FLAG_INSET != null ? window.FLAG_INSET : 4)) / 100;
      var iy = (isPortrait
        ? (window.FLAG_INSET_Y_PORTRAIT != null ? window.FLAG_INSET_Y_PORTRAIT : 6)
        : (window.FLAG_INSET_Y != null ? window.FLAG_INSET_Y : 9)) / 100;
      var mx = img.offsetWidth * ix;
      var my = img.offsetHeight * iy;

      crop.style.left = (img.offsetLeft + mx) + 'px';
      crop.style.top = (img.offsetTop + my) + 'px';
      crop.style.width = (img.offsetWidth - 2 * mx) + 'px';
      crop.style.height = (img.offsetHeight - 2 * my) + 'px';

      // Le logo vit DANS le cadre de rognage : ses % deviennent relatifs à la
      // zone imprimable, ce qui rend le recadrage prévisible.
      if (logo.parentElement !== crop) crop.appendChild(logo);

      /* Restauration : la géométrie sauvegardée est déjà posée, mais la
         classe qui fait basculer l'image en « cover » ne l'est pas — sans
         elle, le design reviendrait en « contain » après un rechargement. */
      if (logo.style.display !== 'none') {
        logo.classList.add('is-cover');
        /* Largeur sous 100 % = session antérieure au mode couverture (44 %
           par défaut) : le design ne couvrirait pas la zone. On repose le
           cadrage plein, minimum garanti par le mode. */
        var w = parseFloat(logo.style.width);
        if (!w || w < 100) {
          logo.style.left = '0%';
          logo.style.top = '0%';
          logo.style.width = '100%';
        }
        /* applyUploadGeo() ne restaure pas la hauteur (elle vaut `auto` pour
           les logos ordinaires) : sans elle, le design ne remplit que sa
           largeur et redevient une vignette au retour sur le drapeau. */
        if (!logo.style.height || logo.style.height === 'auto') {
          logo.style.height = '100%';
        }
      }

      syncPreview(f);
    });
  }
  window.syncFlagCrop = syncFlagCrop;

  /** Passe le design d'une face en couverture (appelé à l'upload). */
  function setFlagCover(face) {
    var logo = logoOf(face);
    if (!logo) return;
    logo.classList.add('is-cover');
    // Couvre la zone imprimable : origine en haut à gauche, pleine taille.
    logo.style.left = '0%';
    logo.style.top = '0%';
    logo.style.width = '100%';
    logo.style.height = '100%';
    syncFlagCrop(face);
  }
  window.setFlagCover = setFlagCover;

  /* ── Édition ─────────────────────────────────────────────────────────── */

  function isEditing(face) {
    var w = wrapOf(face);
    return !!(w && w.classList.contains('flag-editing'));
  }

  /** Doublure rognée : restitue la zone imprimée en pleine opacité. */
  function buildPreview(face) {
    var wrap = wrapOf(face);
    var crop = wrap && wrap.querySelector('.flag-crop[data-face="' + face + '"]');
    var logo = logoOf(face);
    var img = logo && logo.querySelector('img');
    if (!wrap || !crop || !img || !img.getAttribute('src')) return;
    if (wrap.querySelector('.flag-crop-preview[data-face="' + face + '"]')) return;

    var prev = document.createElement('div');
    prev.className = 'flag-crop-preview';
    prev.setAttribute('data-face', face);
    // Même boîte que le rognage : la doublure montre EXACTEMENT la zone
    // imprimée, bords compris.
    prev.style.left = crop.style.left;
    prev.style.top = crop.style.top;
    prev.style.width = crop.style.width;
    prev.style.height = crop.style.height;

    var inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;left:' + (logo.style.left || '0%') +
      ';top:' + (logo.style.top || '0%') +
      ';width:' + (logo.style.width || '100%') +
      ';height:' + (logo.style.height || '100%') + ';';

    var ci = document.createElement('img');
    ci.src = img.getAttribute('src');
    inner.appendChild(ci);
    prev.appendChild(inner);
    wrap.appendChild(prev);
  }

  /** Réaligne la doublure sur le design (pendant le geste, ou au resize). */
  function syncPreview(face) {
    var faces = face ? [face] : FACES;
    faces.forEach(function (f) {
      var wrap = wrapOf(f);
      var prev = wrap && wrap.querySelector('.flag-crop-preview[data-face="' + f + '"]');
      var crop = wrap && wrap.querySelector('.flag-crop[data-face="' + f + '"]');
      var logo = logoOf(f);
      if (!prev || !crop || !logo) return;

      prev.style.left = crop.style.left;
      prev.style.top = crop.style.top;
      prev.style.width = crop.style.width;
      prev.style.height = crop.style.height;

      var inner = prev.firstElementChild;
      if (!inner) return;
      inner.style.left = logo.style.left || '0%';
      inner.style.top = logo.style.top || '0%';
      inner.style.width = logo.style.width || '100%';
      inner.style.height = logo.style.height || '100%';
    });
  }
  window.syncFlagCropPreview = syncPreview;

  function openEdit(face) {
    var wrap = wrapOf(face), logo = logoOf(face);
    if (!wrap || !logo || logo.style.display === 'none') return;
    closeEdit();                    // une seule face à la fois
    wrap.classList.add('flag-editing');
    buildPreview(face);
  }

  function closeEdit() {
    var wasEditing = !!document.querySelector('.flag-img-3d.flag-editing');
    document.querySelectorAll('.flag-img-3d.flag-editing')
      .forEach(function (w) { w.classList.remove('flag-editing'); });
    document.querySelectorAll('.flag-crop-preview')
      .forEach(function (p) { p.remove(); });
    /* L'observateur de taille reste muet pendant l'édition (voir plus bas) :
       on rattrape ici, une fois `overflow: hidden` rétabli, un éventuel
       changement de boîte survenu entre-temps. */
    if (wasEditing) syncFlagCrop();
  }
  window.closeFlagEdit = closeEdit;

  function openEditFrom(target) {
    var logo = target && target.closest && target.closest('.flag-logo');
    if (!logo) return false;
    var face = (logo.id || '').replace('flag-logo-', '');
    if (!face) return false;
    openEdit(face);
    return true;
  }

  document.addEventListener('dblclick', function (e) {
    openEditFrom(e.target);
  });

  /* ── Double-TAP tactile ───────────────────────────────────────────────
     `dblclick` n'arrive jamais au doigt sur ces éléments : .flag-logo porte
     aussi .design-logo, et conf-logo-drag.js appelle preventDefault() sur
     son touchstart pour piloter le glisser. Cela supprime la séquence de
     clics synthétiques dont dblclick dérive — et sur iOS le double-tap est
     de toute façon capté par le zoom natif du navigateur.

     On reconstitue donc le geste : deux `touchend` sur le MÊME logo, à
     moins de 300 ms et de 30 px d'écart. Le seuil de distance distingue un
     double-tap d'un enchaînement de deux petits déplacements — sans lui, un
     recadrage en deux touches ouvrait l'édition par surprise. */
  var LAST_TAP = { t: 0, x: 0, y: 0, id: null };
  var TAP_DELAY = 300;   // ms entre les deux touches
  var TAP_DIST = 30;     // px de tolérance

  document.addEventListener('touchend', function (e) {
    var touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    var logo = e.target.closest && e.target.closest('.flag-logo');
    if (!logo) { LAST_TAP.id = null; return; }

    var now = e.timeStamp || 0;
    var dt = now - LAST_TAP.t;
    var dx = touch.clientX - LAST_TAP.x;
    var dy = touch.clientY - LAST_TAP.y;

    if (LAST_TAP.id === logo.id && dt > 0 && dt < TAP_DELAY &&
        Math.abs(dx) < TAP_DIST && Math.abs(dy) < TAP_DIST) {
      LAST_TAP.id = null;              // consommé : pas de triple déclenchement
      if (openEditFrom(e.target)) e.preventDefault();
      return;
    }

    LAST_TAP.t = now;
    LAST_TAP.x = touch.clientX;
    LAST_TAP.y = touch.clientY;
    LAST_TAP.id = logo.id;
  }, { passive: false });

  function closeIfOutside(e) {
    if (!document.querySelector('.flag-img-3d.flag-editing')) return;
    // Un geste dans le drapeau fait partie de l'édition.
    if (e.target.closest('.flag-img-3d')) return;
    closeEdit();
  }

  document.addEventListener('mousedown', closeIfOutside);
  /* Tactile : sans cet écouteur, l'édition ouverte au double-tap ne se
     refermait qu'à la touche Échap — absente d'un clavier de téléphone. */
  document.addEventListener('touchstart', closeIfOutside, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeEdit();
  });

  /* La boîte du drapeau change avec l'orientation, la couleur (image
     rechargée) et la largeur de la fenêtre : le rognage doit suivre. */
  window.addEventListener('resize', function () { syncFlagCrop(); });

  /* ── La boîte change SANS resize de fenêtre ───────────────────────────
     Le cadre est posé en PIXELS, mesurés sur `.flag-base-img`. Il doit donc
     être recalculé chaque fois que cette image change de dimensions — ce qui
     arrive sans qu'aucun `resize` ne survienne : en mobile la hauteur
     disponible dépend de --nav-h (mesurée après coup par conf-mobile.js), et
     la bascule d'orientation ou de couleur refait la mise en page. Le cadre
     restait alors figé sur l'ancienne taille et le design débordait.

     Repli sur l'existant si l'API manque (navigateurs anciens) : le
     comportement reste celui d'avant, pas une régression. */
  if (typeof ResizeObserver === 'function') {
    var ro = new ResizeObserver(function (entries) {
      /* NE PAS resynchroniser tant qu'une édition est ouverte. `.flag-crop`
         y passe en `overflow: visible` : le design agrandi déborde et peut
         faire varier la boîte mesurée. Réagir ici reposait le cadre en
         pixels, donc rapetissait le design — qui débordait alors
         différemment, relançant l'observateur. L'image rétrécissait à chaque
         geste jusqu'à disparaître.

         Le cadre n'a de toute façon pas à bouger pendant un recadrage : la
         zone imprimable est fixe, c'est le design qu'on déplace dedans. La
         fermeture de l'édition resynchronise ce qu'on a ignoré ici. */
      if (document.querySelector('.flag-img-3d.flag-editing')) return;
      if (document.querySelector('.flag-logo.dragging, .flag-logo.resizing')) return;
      entries.forEach(function (entry) {
        var wrap = entry.target.closest('.flag-img-3d');
        var face = wrap && wrap.getAttribute('data-face');
        if (face) syncFlagCrop(face);
      });
    });
    /* Nœuds actuellement observés — même raison que dans conf-coin-cover.js :
       `ro` garde une référence FORTE sur chaque image observée. Le canvas étant
       réécrit par `innerHTML` à chaque bascule de produit
       (conf-dynamic-layout.js:590, :637), les images détachées n'étaient jamais
       collectées, avec leur sous-arbre et les designs en base64. */
    var observes = [];

    var watchFlags = function () {
      // Libérer ce qui a été détaché du document avant d'observer du neuf.
      for (var i = observes.length - 1; i >= 0; i--) {
        if (!observes[i].isConnected) {
          ro.unobserve(observes[i]);
          observes.splice(i, 1);
        }
      }
      document.querySelectorAll('.flag-img-3d .flag-base-img').forEach(function (im) {
        /* Marqueur : cette fonction est rejouée au changement de produit (le
           canvas est reconstruit), et observer deux fois le même nœud
           rappellerait le callback en double. */
        if (im.dataset.cropWatched !== '1') {
          im.dataset.cropWatched = '1';
          ro.observe(im);
          observes.push(im);
        }
      });
    };
    watchFlags();

    /* Le canvas des drapeaux est réécrit par conf-dynamic-layout.js : les
       images observées sont détruites et remplacées par des neuves.

       Portée RESTREINTE à `.cv-canvas-row`, le conteneur stable dont le contenu
       est régénéré. Sur `document.documentElement`, ce callback — qui fait un
       `querySelectorAll` complet — était rappelé à chaque mutation de la page,
       même sur les écrans textiles sans aucun drapeau. */
    var cible = document.querySelector('.cv-canvas-row') || document.documentElement;
    new MutationObserver(watchFlags).observe(cible, {
      childList: true,
      subtree: true,
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    syncFlagCrop();
    document.querySelectorAll('.flag-base-img').forEach(function (im) {
      im.addEventListener('load', function () { syncFlagCrop(); });
    });
  });

  /**
   * Aplatit le design d'une face en une image DÉJÀ ROGNÉE, calée sur la zone
   * imprimable du drapeau.
   *
   * Pourquoi : à l'écran, le rendu repose sur deux mécanismes purement CSS —
   * `object-fit: cover` sur l'image et `overflow: hidden` sur .flag-crop. Le
   * serveur de composition ne connaît ni l'un ni l'autre : il reçoit l'image
   * entière et la pose telle quelle, d'où un design décalé et débordant dans la
   * vignette du panier comme dans la vue d'ensemble.
   *
   * On reproduit donc le rognage dans un canvas avant l'envoi. C'est
   * exactement ce que font déjà les COINS (coinCoverDataUrl,
   * conf-coin-thumb.js:114) ; seule la forme du masque diffère — un rectangle
   * ici, un disque là-bas.
   *
   * @param {string} face - 'recto' | 'verso'
   * @returns {string} data-URL PNG, ou '' si l'aplatissement est impossible
   *          (l'appelant retombe alors sur l'image brute).
   */
  function flagCoverDataUrl(face) {
    var logo = document.getElementById('flag-logo-' + face);
    if (!logo || !logo.classList.contains('is-cover')) return '';
    var img = logo.querySelector('img');
    if (!img || !img.naturalWidth) return '';

    var crop = logo.closest('.flag-crop');
    if (!crop) return '';

    try {
      var cb = crop.getBoundingClientRect();
      var lb = logo.getBoundingClientRect();
      if (!cb.width || !cb.height) return '';

      /* Résolution proportionnelle au cadre : un drapeau est rectangulaire,
         un canvas carré déformerait le design. 1200 px de large suffisent —
         le serveur normalise ensuite à 1500. */
      var W = 1200;
      var H = Math.max(1, Math.round(W * (cb.height / cb.width)));
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var ctx = c.getContext('2d');

      /* Boîte du design rapportée au cadre de rognage : les deux sont mesurés
         à l'écran, donc directement comparables. */
      var dx = (lb.left - cb.left) / cb.width * W;
      var dy = (lb.top - cb.top) / cb.height * H;
      var dw = lb.width / cb.width * W;
      var dh = lb.height / cb.height * H;

      // « cover » dans cette boîte, comme le CSS.
      var sc = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      var iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
      ctx.drawImage(img, dx + (dw - iw) / 2, dy + (dh - ih) / 2, iw, ih);

      return c.toDataURL('image/png');
    } catch (e) {
      /* Canvas teinté (CORS) : l'appelant retombe sur l'image brute.
         Tracé désormais — même défaut et même silence que sur les coins
         (conf-coin-thumb.js). */
      console.warn('Mise à plat du drapeau impossible — repli sur l\'image brute :', e);
      return '';
    }
  }
  window.flagCoverDataUrl = flagCoverDataUrl;
})();
