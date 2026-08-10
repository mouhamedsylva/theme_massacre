/**
 * Coins : design en COUVERTURE + édition au double-clic.
 *
 * Même comportement que les patchs et les drapeaux :
 *   - à l'upload, le motif REMPLIT la zone frappée et déborde (le surplus est
 *     rogné par le disque) au lieu d'y tenir en entier avec du vide autour ;
 *   - le glisser recadre ;
 *   - le double-clic révèle l'image entière, estompée hors zone, et active
 *     les 4 poignées d'angle pour l'agrandir.
 *
 * EXCLU : le mode « découpé à la forme » (.shape-decoupe). La pièce y épouse
 * le contour du design, il n'y a plus de disque ni de zone à couvrir —
 * forcer un cadrage plein y détruirait le détourage.
 *
 * Le rognage est posé en PIXELS : la taille du disque suit la largeur
 * disponible (clamp), un cadre en % serait faux.
 */
(function () {
  'use strict';

  var FACES = ['recto', 'verso'];

  function discOf(face) { return document.getElementById('coin-disc-' + face); }
  function logoOf(face) { return document.getElementById('coin-logo-' + face); }

  /** @returns {boolean} la pièce épouse-t-elle le contour du design ? */
  function isDecoupe(disc) {
    return !!(disc && disc.classList.contains('shape-decoupe'));
  }

  /* Reprise quand le DOM n'est pas encore mesurable. Bornée : au-delà, c'est
     que la pièce n'est pas affichée (autre produit) et réessayer sans fin
     ferait tourner un minuteur pour rien. */
  var retries = {};
  function retryLater(face) {
    if ((retries[face] || 0) >= 20) return;
    retries[face] = (retries[face] || 0) + 1;
    setTimeout(function () { syncCoinCrop(face); }, 100);
  }

  /**
   * Place le cadre de rognage sur la zone frappée et y déplace le logo.
   *
   * Les marges sont celles de `.coin-safe-zone` (conf-patches.css) : le cadre
   * de rognage et le repère de zone frappée décrivent le même cercle, ils ne
   * doivent pas diverger.
   */
  function syncCoinCrop(face) {
    var faces = face ? [face] : FACES;
    faces.forEach(function (f) {
      var disc = discOf(f);
      var logo = logoOf(f);
      if (!disc || !logo) return;

      // Découpe : pas de zone frappée, on défait un éventuel cadrage.
      if (isDecoupe(disc)) {
        logo.classList.remove('is-cover');
        if (logo.parentElement !== disc) disc.appendChild(logo);
        return;
      }

      /* Le disque n'est pas encore mesurable (canvas fraîchement reconstruit,
         images non décodées) : on repasse au prochain rendu plutôt que de
         renoncer. Sans cette reprise, le retour depuis un autre produit
         laissait le motif en petite vignette — le cadre n'était jamais posé,
         et rien ne relançait la synchronisation. */
      var img = disc.querySelector('.coin-base-img');
      if (!img || !disc.offsetWidth) {
        retryLater(f);
        return;
      }

      // Le DOM est prêt : le quota de reprises repart de zéro pour le
      // prochain changement de produit.
      retries[f] = 0;

      var crop = disc.querySelector('.coin-crop[data-face="' + f + '"]');
      if (!crop) {
        crop = document.createElement('div');
        crop.className = 'coin-crop';
        crop.setAttribute('data-face', f);
        disc.appendChild(crop);
      }

      /* Le cadre doit épouser la ZONE FRAPPÉE, pas l'image du coin : le
         disque n'occupe qu'une partie de celle-ci, le pourtour est
         transparent. Le calcul précédent posait le cadre à
         (100 - 2 x COIN_INSET) = 98 % de l'IMAGE, soit ~125 % du disque — le
         motif était mis à l'échelle d'un cercle bien plus grand que la pièce
         et débordait de tous côtés au lieu d'y être rogné.

         Valeurs en % de l'image, reprises TELLES QUELLES de `.coin-safe-zone`
         (conf-patches.css) : ce cercle est le contour réel de la frappe, donc
         la seule référence juste. Elles intègrent déjà COIN_INSET et
         COIN_OFFSET_Y — les recalculer depuis ces constantes redonnait un
         cadre trop haut de ~1,5 point, la marge verticale du CSS (11,8) ne se
         déduisant pas de la formule qui l'accompagne. Si la zone bouge, ces
         quatre nombres doivent bouger avec elle. */
      var Z_LEFT = 11.5, Z_RIGHT = 11.5, Z_TOP = 13.3, Z_BOTTOM = 10.3;
      var W = disc.offsetWidth, H = disc.offsetHeight;

      crop.style.left = (W * Z_LEFT / 100) + 'px';
      crop.style.top = (H * Z_TOP / 100) + 'px';
      crop.style.width = (W * (100 - Z_LEFT - Z_RIGHT) / 100) + 'px';
      crop.style.height = (H * (100 - Z_TOP - Z_BOTTOM) / 100) + 'px';

      // Le logo vit DANS le cadre : ses % deviennent relatifs à la zone
      // frappée, ce qui rend le recadrage prévisible.
      if (logo.parentElement !== crop) crop.appendChild(logo);

      /* Restauration : la géométrie sauvegardée est déjà posée, mais pas la
         classe qui bascule l'image en « cover » — sans elle, le motif
         reviendrait en « contain » après un rechargement. */
      if (logo.style.display !== 'none') {
        logo.classList.add('is-cover');
        /* Une largeur sous 100 % vient d'une session antérieure au mode
           couverture (44 % par défaut) : le motif ne couvrirait pas la pièce
           et resterait une petite vignette centrée. On repose le cadrage
           plein — c'est le minimum garanti par le mode. */
        var w = parseFloat(logo.style.width);
        if (!w || w < 100) {
          logo.style.left = '0%';
          logo.style.top = '0%';
          logo.style.width = '100%';
        }
        /* applyUploadGeo() ne restaure pas la hauteur (elle vaut `auto` pour
           les logos ordinaires) : sans elle, l'image ne remplit que sa
           largeur. La zone frappée étant carrée, on l'aligne sur la largeur. */
        if (!logo.style.height || logo.style.height === 'auto') {
          logo.style.height = logo.style.width || '100%';
        }
      }

      syncPreview(f);
    });
  }
  window.syncCoinCrop = syncCoinCrop;

  /** Passe le motif d'une face en couverture (appelé à l'upload). */
  function setCoinCover(face) {
    var disc = discOf(face), logo = logoOf(face);
    if (!disc || !logo || isDecoupe(disc)) return;
    logo.classList.add('is-cover');
    logo.style.left = '0%';
    logo.style.top = '0%';
    logo.style.width = '100%';
    logo.style.height = '100%';
    syncCoinCrop(face);
  }
  window.setCoinCover = setCoinCover;

  /* ── Édition ─────────────────────────────────────────────────────────── */

  /** Doublure rognée : restitue la zone frappée en pleine opacité. */
  function buildPreview(face) {
    var disc = discOf(face);
    var crop = disc && disc.querySelector('.coin-crop[data-face="' + face + '"]');
    var logo = logoOf(face);
    var img = logo && logo.querySelector('img');
    if (!disc || !crop || !img || !img.getAttribute('src')) return;
    if (disc.querySelector('.coin-crop-preview[data-face="' + face + '"]')) return;

    var prev = document.createElement('div');
    prev.className = 'coin-crop-preview';
    prev.setAttribute('data-face', face);
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
    disc.appendChild(prev);
  }

  /** Réaligne la doublure sur le motif (pendant le geste, ou au resize). */
  function syncPreview(face) {
    var faces = face ? [face] : FACES;
    faces.forEach(function (f) {
      var disc = discOf(f);
      var prev = disc && disc.querySelector('.coin-crop-preview[data-face="' + f + '"]');
      var crop = disc && disc.querySelector('.coin-crop[data-face="' + f + '"]');
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
  window.syncCoinCropPreview = syncPreview;

  function openEdit(face) {
    var disc = discOf(face), logo = logoOf(face);
    if (!disc || !logo || logo.style.display === 'none') return;
    if (isDecoupe(disc)) return;          // rien à recadrer sans disque
    closeEdit();                          // une seule face à la fois
    disc.classList.add('coin-editing');
    buildPreview(face);
  }

  function closeEdit() {
    var wasEditing = !!document.querySelector('.coin-disc.coin-editing');
    document.querySelectorAll('.coin-disc.coin-editing')
      .forEach(function (d) { d.classList.remove('coin-editing'); });
    document.querySelectorAll('.coin-crop-preview')
      .forEach(function (p) { p.remove(); });
    /* L'observateur de taille reste muet pendant l'édition (voir plus bas) :
       on rattrape ici, une fois `overflow: hidden` rétabli, un éventuel
       changement de boîte survenu entre-temps. */
    if (wasEditing) syncCoinCrop();
  }
  window.closeCoinEdit = closeEdit;

  function openEditFrom(target) {
    var logo = target && target.closest && target.closest('.coin-logo');
    if (!logo) return false;
    var face = (logo.id || '').replace('coin-logo-', '');
    if (!face) return false;
    openEdit(face);
    return true;
  }

  document.addEventListener('dblclick', function (e) {
    openEditFrom(e.target);
  });

  /* ── Double-TAP tactile ───────────────────────────────────────────────
     `dblclick` n'arrive jamais au doigt sur ces éléments : .coin-logo porte
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
    var logo = e.target.closest && e.target.closest('.coin-logo');
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
    if (!document.querySelector('.coin-disc.coin-editing')) return;
    if (e.target.closest('.coin-disc')) return;   // geste dans la pièce
    closeEdit();
  }

  document.addEventListener('mousedown', closeIfOutside);
  /* Tactile : sans cet écouteur, l'édition ouverte au double-tap ne se
     refermait qu'à la touche Échap — absente d'un clavier de téléphone. */
  document.addEventListener('touchstart', closeIfOutside, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeEdit();
  });

  /* La taille du disque suit la largeur de la fenêtre, et la finition
     recharge son image : le rognage doit suivre. */
  window.addEventListener('resize', function () { syncCoinCrop(); });

  /* ── Le disque change de taille SANS resize de fenêtre ────────────────
     Le cadre de rognage est posé en PIXELS (la taille du disque est un
     clamp(), un cadre en % serait faux). Il doit donc être recalculé à
     chaque fois que le disque change de dimensions.

     En mobile, `.coin-disc` vaut `min(88%, calc(100vh - var(--nav-h) - 200px))`
     (conf-mobile.css) : sa taille dépend de --nav-h, que conf-mobile.js
     mesure APRÈS coup, et de la bascule Recto/Verso qui refait la mise en
     page. Le disque grandissait donc après que syncCoinCrop() ait figé son
     cadre — l'image débordait alors du cercle au lieu d'y être rognée, ce
     qu'aucun `resize` ne venait corriger.

     Un ResizeObserver suit la taille réelle, quelle qu'en soit la cause.
     Repli sur l'existant si l'API manque (navigateurs anciens) : le
     comportement reste celui d'avant, pas une régression. */
  if (typeof ResizeObserver === 'function') {
    var ro = new ResizeObserver(function (entries) {
      /* NE PAS resynchroniser tant qu'une édition est ouverte : `.coin-crop`
         y passe en `overflow: visible`, le motif agrandi déborde et pourrait
         faire varier la boîte observée — reposer le cadre en pixels le
         rapetissait alors à chaque geste. La zone frappée est fixe de toute
         façon : seul le motif bouge pendant un recadrage, et la fermeture de
         l'édition resynchronise ce qu'on a ignoré ici. */
      if (document.querySelector('.coin-disc.coin-editing')) return;
      if (document.querySelector('.coin-logo.dragging, .coin-logo.resizing')) return;
      entries.forEach(function (entry) {
        var face = (entry.target.id || '').replace('coin-disc-', '');
        if (face) syncCoinCrop(face);
      });
    });
    /* Nœuds actuellement observés. Sans cette trace, `ro` gardait une référence
       FORTE sur chaque disque observé : le canvas étant réécrit par `innerHTML`
       à chaque bascule de produit (conf-dynamic-layout.js:286, :552, :852), les
       disques détachés n'étaient jamais collectés — avec leur sous-arbre, dont
       les logos en base64 (jusqu'à 12 Mo avant compression). Quelques allers et
       retours entre familles de produits suffisaient à retenir des dizaines
       de Mo. */
    var observes = [];

    var watchDiscs = function () {
      /* Libérer d'abord ce qui a été détaché du document. `isConnected` est le
         test exact : un nœud remplacé par innerHTML devient déconnecté. */
      for (var i = observes.length - 1; i >= 0; i--) {
        if (!observes[i].isConnected) {
          ro.unobserve(observes[i]);
          observes.splice(i, 1);
        }
      }
      FACES.forEach(function (f) {
        var disc = discOf(f);
        /* Marqueur : cette fonction est rejouée au changement de produit
           (le canvas est reconstruit), et observer deux fois le même nœud
           rappellerait le callback en double. */
        if (disc && disc.dataset.cropWatched !== '1') {
          disc.dataset.cropWatched = '1';
          ro.observe(disc);
          observes.push(disc);
        }
      });
    };
    watchDiscs();

    /* Le canvas des coins est réécrit par conf-dynamic-layout.js : les
       disques observés sont détruits et remplacés par des neufs.

       Portée volontairement RESTREINTE à `.cv-canvas-row` — c'est le conteneur
       stable (écrit en dur dans sections/configurateur.liquid) dont tout le
       contenu est régénéré. Observer `document.documentElement` faisait rappeler
       ce callback à CHAQUE ajout ou retrait de nœud n'importe où dans la page,
       y compris sur les écrans textiles où aucun coin n'existe : poignées de
       logo (conf-logo-drag.js:347), chaque toast (conf-alert.js:163), chaque
       clic +/- de quantité (conf-size-quantity-modal.js:140).

       Repli sur documentElement si la ligne de canvas n'est pas encore là :
       ce script peut s'exécuter avant que le DOM soit complet. */
    var cible = document.querySelector('.cv-canvas-row') || document.documentElement;
    new MutationObserver(watchDiscs).observe(cible, {
      childList: true,
      subtree: true,
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    syncCoinCrop();
    document.querySelectorAll('.coin-base-img').forEach(function (im) {
      im.addEventListener('load', function () { syncCoinCrop(); });
    });
  });
})();
