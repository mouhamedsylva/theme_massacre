/**
 * Logo Drag & Resize - Déplacer et redimensionner les logos sur le produit.
 * Positions et tailles en % du canvas (.cv-single-view) pour rester cohérent
 * quel que soit le zoom ou la taille de l'écran. Le logo ne peut pas sortir du canvas.
 */
(function () {
  let mode = null;       // 'drag' ou 'resize'
  let grip = null;       // poignée saisie : 'nw','n','ne','e','se','s','sw','w'
  let active = null;     // logo manipulé
  let moved = false;     // true dès un déplacement réel (distingue clic / drag)
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0, startW = 0, startH = 0;
  let startFont = 0;     // taille de police au début d'un resize de texte
  let bounds = null;
  /* Identifiant du doigt qui pilote le geste (tactile uniquement, null en
     souris). `e.touches[0]` désigne le PREMIER doigt posé sur l'écran, pas
     celui qui bouge : un pouce appuyé sur un bord détournait le geste. On
     retrouve donc le doigt d'origine par son identifiant, stable de
     touchstart à touchend. */
  let touchId = null;

  /* Point actif d'un événement souris ou tactile.
     En tactile on cherche `touchId` dans changedTouches (les doigts qui ont
     bougé) puis dans touches ; renvoie null si ce doigt n'est pas concerné,
     pour ignorer les mouvements d'un autre doigt. */
  function getPoint(e) {
    if (!e.changedTouches && !e.touches) return e;      // souris
    const lists = [e.changedTouches, e.touches];
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      if (!list) continue;
      for (let j = 0; j < list.length; j++) {
        if (list[j].identifier === touchId) return list[j];
      }
    }
    return null;
  }

  /* Doigt à retenir au début d'un geste : le premier de changedTouches. */
  function startPoint(e) {
    if (e.changedTouches && e.changedTouches.length) {
      touchId = e.changedTouches[0].identifier;
      return e.changedTouches[0];
    }
    if (e.touches && e.touches.length) {
      touchId = e.touches[0].identifier;
      return e.touches[0];
    }
    touchId = null;
    return e;   // souris
  }

  const MIN_W = 4;       // largeur min du logo en % du canvas
  const MAX_W = 100;     // largeur max
  /* Marge de la zone imprimable des drapeaux, en % de la largeur.
     0 = la zone couvre tout le drapeau, bord à bord : le design peut être
     placé sur toute la surface, mais ne peut plus en sortir (avant, le logo
     n'était borné par rien et débordait de l'aperçu).
     Relever cette valeur réserverait une marge pour l'ourlet et les œillets ;
     garder alors `.flag-safe-zone { inset }` (conf-drapeaux.css) identique. */
  const FLAG_INSET = 4;
  window.FLAG_INSET = FLAG_INSET;
  /* Marge VERTICALE, plus généreuse : le haut et le bas du drapeau portent
     l'ourlet de fixation, et l'aperçu y montre l'ondulation du tissu — un
     visuel qui s'en approche paraît déborder. */
  const FLAG_INSET_Y = 9;
  window.FLAG_INSET_Y = FLAG_INSET_Y;
  /* Mêmes marges pour l'orientation PORTRAIT. Elles diffèrent parce que les
     fichiers n'ont pas le même cadrage — mesuré sur les PNG :
       paysage  (612x408) : toile à 2,6 % du bord gauche, 6,4 % du haut
       portrait (408x612) : toile à 5,4 % du bord gauche, 4,6 % du haut
     Avec les valeurs du paysage, le cadre sortait de la toile à gauche et
     tombait trop bas en haut. Consommées par syncFlagSafeZones()
     (conf-drapeaux.js) et par la contrainte de déplacement ci-dessous. */
  const FLAG_INSET_PORTRAIT = 7;
  window.FLAG_INSET_PORTRAIT = FLAG_INSET_PORTRAIT;
  const FLAG_INSET_Y_PORTRAIT = 6;
  window.FLAG_INSET_Y_PORTRAIT = FLAG_INSET_Y_PORTRAIT;
  /* Marge des pièces (coins), en % du disque. Le pourtour est occupé par le
     listel — bord relevé de la frappe — où le motif ne s'imprime pas.
     Garder égal à `.coin-safe-zone { inset }` (conf-patches.css).
     Ramené de 3 % à 1 % : le repère laissait un anneau blanc visible entre
     le pointillé et le bord de la pièce, alors qu'il doit en épouser le
     contour. 1 % couvre le listel, sans plus. */
  const COIN_INSET = 1;
  window.COIN_INSET = COIN_INSET;
  /* Décalage vertical de la zone, en % du disque. Positif = vers le bas.
     La pièce est centrée dans son image, mais le rendu 3D lui donne une
     épaisseur visible en partie basse : sans ce décalage, le motif paraît
     trop haut sur la frappe.
     Garder égal au `top`/`bottom` de `.coin-safe-zone` (conf-patches.css). */
  const COIN_OFFSET_Y = 1.5;
  window.COIN_OFFSET_Y = COIN_OFFSET_Y;
  /* Hauteur réservée au numéro en bas du verso, en % du disque. Le logo ne
     descend pas plus bas quand la numérotation est active, sinon il le
     recouvrirait. Doit couvrir le `bottom` de .coin-verso-number + sa hauteur. */
  const COIN_NUMBER_RESERVE = 22;
  window.COIN_NUMBER_RESERVE = COIN_NUMBER_RESERVE;
  /* Marge de la zone imprimable des patchs, en % du canvas. L'image du patch
     porte déjà un padding de 13% (.patch-shape-img) : la zone doit donc
     commencer plus bas, sinon elle tomberait hors du visuel.
     Garder égal à  (conf-coins.css). */
  const PATCH_INSET = 14;
  window.PATCH_INSET = PATCH_INSET;
  /* Rectangle : plus large que haut -> bornes verticales plus serrées. */
  /* Amplitude de recadrage du design d'un patch, en % de la forme. Le visuel
     la remplit et déborde (object-fit: cover) : ce décalage choisit la partie
     visible. Volontairement modeste — au-delà, un bord de l'image entrerait
     dans la forme et laisserait un vide. */
  const PATCH_PAN = 20;

  /* Zoom maximal du design d'un patch, en % de la forme. 300 % laisse cadrer
     serré sur un détail ; au-delà, l'image imprimée serait pixelisée. */
  const PATCH_MAX_ZOOM = 300;

  const PATCH_INSET_RECT_Y = 27;
  window.PATCH_INSET_RECT_Y = PATCH_INSET_RECT_Y;

  // Conteneur de référence selon le type de logo :
  //  - .coin-disc  pour les coins
  //  - .flag-img-3d pour les drapeaux
  //  - .logo-layer  pour les textiles (repli : .cv-single-view)
  function getCanvas(logo) {
    if (logo) {
      /* Design en COUVERTURE : le logo vit dans un cadre de rognage
         (.coin-crop / .flag-crop) et ses % y sont relatifs. Ce cadre est donc
         la référence — prendre le disque ou le drapeau entier fausserait
         déplacement et redimensionnement. */
      const crop = logo.closest('.coin-crop, .flag-crop');
      if (crop) return crop;
      const coinDisc = logo.closest('.coin-disc');
      if (coinDisc) return coinDisc;
      const flagWrap = logo.closest('.flag-img-3d');
      if (flagWrap) return flagWrap;
      // Patch : le logo est positionné DIRECTEMENT dans #coins-canvas (l'image
      // du patch). Ses % sont relatifs à ce conteneur, et il est borné à la
      // zone imprimable de la forme choisie (voir onPointerMove).
      const patchCanvas = logo.closest('#coins-canvas');
      if (patchCanvas) return patchCanvas;
      const patchStage = logo.closest('.patch-stage');
      if (patchStage) return patchStage;

      /* TEXTILE : le logo est positionné en % de .logo-layer, son parent réel.

         En mobile, conf-mobile.js cale cette couche sur l'IMAGE du vêtement
         (syncLayerToImage) — elle est donc nettement plus petite que
         .cv-single-view, qui couvre toute la zone d'aperçu. Retomber sur
         cette dernière faisait calculer le déplacement dans un référentiel
         plus grand que celui du positionnement : le logo bougeait d'une
         fraction du geste, au point de sembler figé.

         Le repli sur .cv-single-view reste utile si la couche est absente. */
      const logoLayer = logo.closest('.logo-layer');
      if (logoLayer) return logoLayer;
    }
    return document.querySelector('.cv-single-view');
  }

  // Largeur/hauteur actuelles du logo en % du canvas
  function logoSizePct(logo) {
    const wPct = parseFloat(logo.style.width) || 18;
    const r = logo.getBoundingClientRect();
    const b = bounds || getCanvas(logo).getBoundingClientRect();
    const hPct = b.height ? (r.height / b.height) * 100 : wPct;
    return { wPct, hPct };
  }

  // Paires de logos manches à synchroniser en miroir (vue de face)
  const MIRROR_PAIRS = {
    'logo-sl-face': 'logo-sr-face',
    'logo-sr-face': 'logo-sl-face'
  };

  // Le logo de la vue de côté suit la taille du logo recto de la pièce
  function syncCoinCote(logo) {
    if (!logo || logo.id !== 'coin-logo-recto') return;
    const cote = document.getElementById('coin-cote-logo');
    if (!cote) return;
    const width = parseFloat(logo.style.width) || 44;
    // largeur recto par défaut = 44% -> scale 1 ; proportionnel ensuite
    const scale = width / 44;
    cote.style.setProperty('--coin-logo-scale', scale.toFixed(3));
  }
  // Exposé : clampCoinLogo() doit resynchroniser la tranche après un upload,
  // sinon la vue de côté garde l'échelle du visuel précédent.
  window.syncCoinCote = syncCoinCote;

  // Applique la position/taille miroir (par rapport au centre horizontal 50%)
  function mirrorSleeve(logo) {
    const twinId = MIRROR_PAIRS[logo.id];
    if (!twinId) return;
    const twin = document.getElementById(twinId);
    if (!twin) return;

    const left = parseFloat(logo.style.left) || 0;
    const top = parseFloat(logo.style.top) || 0;
    const width = parseFloat(logo.style.width) || 8;

    // Miroir horizontal : le bord droit du jumeau = symétrique du bord gauche
    twin.style.left = (100 - left - width) + '%';
    twin.style.top = top + '%';      // même hauteur
    twin.style.width = width + '%';  // même taille
  }

  function onPointerDown(e) {
    const handle = e.target.closest('.logo-resize');
    // Le texte déplaçable se comporte comme un logo (drag simple).
    const logo = e.target.closest('.design-logo') || e.target.closest('.design-text');
    if (!logo) return;

    const canvas = getCanvas(logo);
    if (!canvas) return;

    active = logo;
    bounds = canvas.getBoundingClientRect();
    const point = startPoint(e);
    startX = point.clientX;
    startY = point.clientY;
    startLeft = parseFloat(logo.style.left) || 0;
    startTop = parseFloat(logo.style.top) || 0;
    startW = parseFloat(logo.style.width) || 18;
    // Hauteur en % du canvas (height:auto -> on la mesure), pour que les poignées
    // du HAUT puissent garder le bord bas en place.
    startH = bounds.height
      ? (logo.getBoundingClientRect().height / bounds.height) * 100
      : startW;
    startFont = parseFloat(logo.style.fontSize) || parseFloat(getComputedStyle(logo).fontSize) || 20;

    moved = false;   // devient true dès un déplacement réel (distingue clic/drag)

    if (handle) {
      mode = 'resize';
      // Quelle poignée ? 'se' par défaut (ancien comportement : coin bas-droit).
      grip = handle.getAttribute('data-pos') || 'se';
      logo.classList.add('resizing');
    } else {
      mode = 'drag';
      grip = null;
      logo.classList.add('dragging');
    }
    setManipulating(true);
    e.preventDefault();
  }

  /* Affiche les zones pointillées le temps d'une manipulation.
     Une zone déjà remplie est masquée au repos (.filled) ; pendant un geste
     elle redevient un guide. Les quatre familles de produits ont leur propre
     conteneur de scène, d'où cette liste. */
  var STAGE_SELECTOR =
    '.logo-layer, .coin-stage, .flag-stage, .patch-stage';

  function setManipulating(on) {
    /* Drapeau lu par les scripts qui REPLACENT les logos (conf-mobile.js :
       applyMobileZones -> reflowLogos -> placeLogoInZone, qui recentre).
       Leurs observateurs réagissent aux changements de style, y compris ceux
       qu'écrit un glisser-déposer : sans ce verrou, le logo était recentré
       en plein geste et ne suivait plus le doigt. */
    window.__logoManipulating = !!on;
    document.querySelectorAll(STAGE_SELECTOR).forEach(function (stage) {
      stage.classList.toggle('is-manipulating', !!on);
    });
  }
  window.setZonesManipulating = setManipulating;

  /* Sélection visuelle d'un texte : cadre + 2 contrôles (style CustomInk).
     Un seul texte sélectionné à la fois. */
  const ICON_DEL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const ICON_SIZE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13,6V11H18V7.75L22.25,12L18,16.25V13H13V18H16.25L12,22.25L7.75,18H11V13H6V16.25L1.75,12L6,7.75V11H11V6H7.75L12,1.75L16.25,6H13Z"/></svg>';

  /* Boutons de contrôle pour les LOGOS (similaire aux textes) */
  function ensureLogoControls(el) {
    if (!el || el.querySelector('.logo-ctrl')) return;
    
    // Bouton supprimer
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'logo-ctrl logo-ctrl-del';
    del.title = 'Supprimer le logo';
    del.innerHTML = ICON_DEL;
    del.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    /* Suppression, factorisée : le tactile ne passe pas par `click`.
       Sur mobile, un tap émet d'abord `touchstart`, que le gestionnaire de
       glisser-déposer intercepte — le `click` qui aurait suivi n'est jamais
       émis, et la croix restait sans effet (un visuel uploadé devenait donc
       impossible à retirer au doigt). */
    function doDeleteLogo(e) {
      e.stopPropagation(); e.preventDefault();

      // Extraire la zone depuis l'ID du logo (ex: "logo-f" -> "f", "logo-sl-face" -> "sl")
      var logoId = el.id || '';
      var zone = null;
      
      // Map des IDs de logo vers leurs zones
      if (logoId === 'logo-f') zone = 'f';
      else if (logoId === 'logo-fr') zone = 'fr';
      else if (logoId === 'logo-b') zone = 'b';
      else if (logoId === 'logo-sl' || logoId === 'logo-sl-face') zone = 'sl';
      else if (logoId === 'logo-sr' || logoId === 'logo-sr-face') zone = 'sr';
      else if (logoId === 'patch-logo') zone = 'c';
      else if (logoId === 'coin-logo-recto') zone = 'coin-recto';
      else if (logoId === 'coin-logo-verso') zone = 'coin-verso';
      else if (logoId === 'flag-logo-recto') zone = 'flag-recto';
      else if (logoId === 'flag-logo-verso') zone = 'flag-verso';
      else {
        // Fallback: essaie data-zone
        zone = el.getAttribute('data-zone');
      }
      
      confLog('🗑️ Suppression logo:', logoId, '→ zone:', zone);
      
      if (zone) {
        // Appelle rmUp qui gère la suppression complète (UI + persistence)
        if (typeof window.rmUp === 'function') {
          window.rmUp(zone);
        } else if (typeof window.removeUpload === 'function') {
          window.removeUpload(zone);
        }
      }
      el.classList.remove('is-selected');
      /* Le logo n'existe plus : sa barre d'outils (coins) doit suivre.
         Elle se masque déjà seule via son observateur, mais on le fait
         explicitement pour qu'elle disparaisse dans le même rendu. */
      if (typeof window.hideCoinToolbar === 'function') window.hideCoinToolbar();
    }

    del.addEventListener('click', doDeleteLogo);
    // `passive: false` : preventDefault() doit pouvoir bloquer le clic
    // fantôme que le navigateur émettrait ensuite.
    del.addEventListener('touchstart', doDeleteLogo, { passive: false });

    // Bouton redimensionner (coin inférieur droit)
    var resize = document.createElement('button');
    resize.type = 'button';
    resize.className = 'logo-ctrl logo-ctrl-resize';
    resize.title = 'Redimensionner';
    resize.innerHTML = ICON_SIZE;
    resize.addEventListener('mousedown', function (e) {
      e.stopPropagation(); e.preventDefault();
      startManualResize(el, e);
    });
    resize.addEventListener('touchstart', function (e) {
      e.stopPropagation(); e.preventDefault();
      startManualResize(el, e);
    }, { passive: false });

    el.appendChild(del);
    el.appendChild(resize);
  }

  /* startManualResize() est défini plus bas, en un seul exemplaire : cette
     copie faisait doublon et était de toute façon écrasée par le hoisting
     de la seconde. Les boutons ⤢ des logos comme des textes l'utilisent. */

  /* Sélection d'un logo */
  function selectDesignLogo(el) {
    document.querySelectorAll('.design-logo.is-selected')
      .forEach(function (l) { if (l !== el) l.classList.remove('is-selected'); });
    if (el) { ensureLogoControls(el); el.classList.add('is-selected'); }
  }
  window.selectDesignLogo = selectDesignLogo;

  /* Retire la sélection logo */
  window.clearDesignLogoSelection = function () {
    document.querySelectorAll('.design-logo.is-selected')
      .forEach(function (l) { l.classList.remove('is-selected'); });
  };

  function ensureTextControls(el) {
    if (!el || el.querySelector('.dt-ctrl')) return;
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'dt-ctrl dt-ctrl-del';
    del.title = 'Supprimer le texte';
    del.innerHTML = ICON_DEL;
    del.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    /* Suppression, factorisée : le tactile ne passe pas par `click`.

       Sur mobile, un tap émet d'abord `touchstart`, que le gestionnaire de
       glisser-déposer intercepte — le `click` qui aurait suivi n'est jamais
       émis, et la croix restait sans effet. Le bouton de déplacement, juste
       à côté, écoute déjà `touchstart` pour la même raison. */
    function doDelete(e) {
      e.stopPropagation();
      e.preventDefault();
      var z = (el.id || '').indexOf('text-') === 0 ? el.id.slice(5) : null;
      if (z && typeof window.removeText === 'function') window.removeText(z);
      el.classList.remove('is-selected');
      // Ferme aussi le panneau latéral d'édition : le texte n'existe plus.
      if (typeof window.closeTextPanel === 'function') window.closeTextPanel(false);
      // Retire la barre d'outils, qui vise un texte désormais supprimé.
      if (typeof window.clearDesignTextSelection === 'function') {
        window.clearDesignTextSelection();
      }
    }

    del.addEventListener('click', doDelete);
    // `passive: false` : preventDefault() doit pouvoir bloquer le clic
    // fantôme que le navigateur émettrait ensuite.
    del.addEventListener('touchstart', doDelete, { passive: false });

    /* Bouton de déplacement. Volontairement SANS la classe .logo-resize :
       ensureGrips() supprime toutes les .logo-resize existantes et le ferait
       disparaître. On déclenche donc le resize à la main (même code que les
       poignées : mode 'resize', poignée 'se'). */
    var size = document.createElement('button');
    size.type = 'button';
    size.className = 'dt-ctrl dt-ctrl-size';
    size.title = 'Déplacer';
    size.innerHTML = ICON_SIZE;
    size.addEventListener('mousedown', function (e) {
      e.stopPropagation(); e.preventDefault();
      startManualResize(el, e);
    });
    size.addEventListener('touchstart', function (e) {
      e.stopPropagation(); e.preventDefault();
      startManualResize(el, e);
    }, { passive: false });

    el.appendChild(del);
    el.appendChild(size);
  }

  /* Démarre un redimensionnement depuis le bouton ⤢ (équivalent poignée 'se'). */
  function startManualResize(el, e) {
    const canvas = getCanvas(el);
    if (!canvas) return;
    active = el;
    bounds = canvas.getBoundingClientRect();
    const point = startPoint(e);
    startX = point.clientX;
    startY = point.clientY;
    startLeft = parseFloat(el.style.left) || 0;
    startTop = parseFloat(el.style.top) || 0;
    startW = parseFloat(el.style.width) || 18;
    startH = bounds.height
      ? (el.getBoundingClientRect().height / bounds.height) * 100
      : startW;
    startFont = parseFloat(el.style.fontSize) ||
                parseFloat(getComputedStyle(el).fontSize) || 20;
    moved = false;
    mode = 'resize';
    grip = 'se';
    el.classList.add('resizing');
    setManipulating(true);
  }

  function selectDesignText(el) {
    document.querySelectorAll('.design-text.is-selected')
      .forEach(function (t) { if (t !== el) t.classList.remove('is-selected'); });
    if (el) { ensureTextControls(el); el.classList.add('is-selected'); }
  }
  window.selectDesignText = selectDesignText;
  /* Retire la sélection (clic ailleurs, fermeture du panneau) + masque la barre. */
  window.clearDesignTextSelection = function () {
    document.querySelectorAll('.design-text.is-selected')
      .forEach(function (t) { t.classList.remove('is-selected'); });
    if (typeof window.hideTextToolbar === 'function') window.hideTextToolbar();
  };

  function onPointerMove(e) {
    if (!active || !bounds) return;
    const point = getPoint(e);
    if (!point) return;        // mouvement d'un AUTRE doigt : on l'ignore
    /* preventDefault() AVANT les calculs. Placé en fin de fonction, il était
       sauté par les retours anticipés ci-dessus : le navigateur interprétait
       alors le geste comme un défilement de page, émettait `touchcancel` et
       n'envoyait plus aucun touchmove — le logo se figeait jusqu'au tap
       suivant. Le geste sur un logo ne défile jamais la page. */
    if (e.cancelable) e.preventDefault();
    const dx = point.clientX - startX;
    const dy = point.clientY - startY;
    // Au-delà de 4px, c'est un vrai déplacement (et non un clic de sélection).
    if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;

    // PATCH : le logo reste dans la zone imprimable, comme les autres pièces.
    // Les marges suivent la forme choisie : le rectangle est plus large que
    // haut, ses bornes verticales sont donc plus serrées (cf. .patch-safe-zone
    // dans conf-coins.css — garder les deux jeux de valeurs alignés).
    const isPatchLogo = active && active.id === 'patch-logo';
    let pX0 = PATCH_INSET, pX1 = 100 - PATCH_INSET;
    let pY0 = PATCH_INSET, pY1 = 100 - PATCH_INSET;
    if (isPatchLogo && active.closest('.shape-rectangle')) {
      pY0 = PATCH_INSET_RECT_Y;
      pY1 = 100 - PATCH_INSET_RECT_Y;
    }

    /* Le design du patch REMPLIT la forme (width:100%, object-fit:cover) et
       déborde par conception : le glisser sert à RECADRER, comme une photo
       dans un cadre. Les bornes d'un logo posé dans une zone n'ont donc pas
       de sens ici — avec une largeur de 100 %, maxPos() devenait négatif et
       tout déplacement était refusé.
       On autorise un décalage de ±PATCH_PAN dans chaque direction : assez
       pour choisir la partie visible, pas assez pour sortir un bord de la
       forme et laisser du vide. */
    if (isPatchLogo) {
      /* Bornes SYMÉTRIQUES autour du débordement réel. maxPos() soustrait la
         largeur du logo : borner par un simple ±pan donnait une marge de
         -220 % à +20 % sur un design zoomé à 300 %, rendant le recadrage vers
         le haut-gauche impossible. On ajoute donc le dépassement à la borne
         haute pour que les deux côtés s'équivalent. */
      var curW = parseFloat(active.style.width) || 100;
      var over = Math.max(0, curW - 100);      // ce qui dépasse de la forme
      pX0 = -PATCH_PAN - over;
      pX1 = 100 + PATCH_PAN + over + over;     // +over compense maxPos()
      pY0 = pX0;
      pY1 = pX1;
    }

    // DRAPEAUX : le logo est positionné en % de .flag-img-3d, un conteneur
    // flex PLUS LARGE que le drapeau (l'image y est centrée). Se borner à
    // 0..100 % laissait donc le visuel sortir de l'image. On calcule les
    // bornes réelles de l'image dans son conteneur, puis on y ajoute la marge
    // de sécurité (ourlet de couture + œillets).
    const isFlagLogo = active && /^flag-logo-/.test(active.id || '');
    // Bornes par axe : en portrait l'image est contrainte par la HAUTEUR, donc
    // ses marges horizontales et verticales diffèrent — un jeu de bornes unique
    // serait faux sur l'un des deux axes.
    let fX0 = 0, fX1 = 100, fY0 = 0, fY1 = 100, flagMaxW = MAX_W;
    /* Design en COUVERTURE : le logo vit dans .flag-crop, dont la boîte EST
       déjà la zone imprimable. Ses % y sont donc directement relatifs — plus
       de conversion depuis .flag-img-3d. Le glisser sert à recadrer, d'où des
       bornes symétriques autour du débordement, comme pour les patchs. */
    const isFlagCover = isFlagLogo && active.classList.contains('is-cover');
    if (isFlagCover) {
      const curFW = parseFloat(active.style.width) || 100;
      const fOver = Math.max(0, curFW - 100);
      fX0 = -PATCH_PAN - fOver;
      fX1 = 100 + PATCH_PAN + fOver + fOver;   // compense maxPos()
      /* Débordement VERTICAL mesuré sur la hauteur, et non recopié de l'axe X.

         `.flag-crop` est le seul cadre de rognage NON CARRÉ du projet : sa
         boîte épouse l'image (syncFlagCrop, conf-flag-cover.js:83-86), soit un
         ratio d'environ 1,7 en paysage. `.coin-disc` porte `aspect-ratio: 1/1`
         et #coins-canvas est carré : pour eux, recopier l'axe X était juste,
         ce qui explique que seul le drapeau ait montré le défaut.

         Sur un cadre rectangulaire, un débordement horizontal de N points ne
         vaut pas N points à la verticale. Les bornes verticales étaient donc
         fausses, et le design remontait vers `fY0` à chaque frame d'étirement.

         `style.height` est écrit à la même valeur que la largeur pendant le
         resize en couverture ; à défaut, on retombe sur la largeur. */
      const curFH = parseFloat(active.style.height) || curFW;
      const fOverY = Math.max(0, curFH - 100);
      fY0 = -PATCH_PAN - fOverY;
      fY1 = 100 + PATCH_PAN + fOverY + fOverY;
      flagMaxW = PATCH_MAX_ZOOM;
    } else if (isFlagLogo) {
      /* Marges propres à l'orientation : les fichiers paysage et portrait
         n'ont pas le même cadrage (voir FLAG_INSET_PORTRAIT). Le logo doit
         être borné EXACTEMENT comme le cadre affiché par
         syncFlagSafeZones(), sinon il pourrait sortir du pointillé. */
      const fPortrait = window.__flagOrientation === 'portrait';
      const fIns  = fPortrait ? FLAG_INSET_PORTRAIT : FLAG_INSET;
      const fInsY = fPortrait ? FLAG_INSET_Y_PORTRAIT : FLAG_INSET_Y;

      const img = active.closest('.flag-img-3d')?.querySelector('.flag-base-img');
      if (img && bounds.width && bounds.height && img.offsetWidth && img.offsetHeight) {
        const xPct = (img.offsetLeft / bounds.width) * 100;
        const wPctImg = (img.offsetWidth / bounds.width) * 100;
        const yPct = (img.offsetTop / bounds.height) * 100;
        const hPctImg = (img.offsetHeight / bounds.height) * 100;
        fX0 = xPct + fIns;
        fX1 = xPct + wPctImg - fIns;
        fY0 = yPct + fInsY;
        fY1 = yPct + hPctImg - fInsY;
        flagMaxW = wPctImg - 2 * fIns;
      } else {
        fX0 = fIns;   fX1 = 100 - fIns;
        fY0 = fInsY;  fY1 = 100 - fInsY;
        flagMaxW = 100 - 2 * fIns;
      }
    }

    // PIÈCES (coins) : le motif reste dans la zone frappée, le pourtour étant
    // occupé par le listel. Le disque est carré, la marge est donc symétrique.
    const isCoinLogo = active && /^coin-logo-/.test(active.id || '');
    /* Motif en COUVERTURE : le logo vit dans .coin-crop, dont la boîte EST
       la zone frappée. Ses % y sont donc directement relatifs, et le glisser
       sert à recadrer — d'où des bornes symétriques autour du débordement,
       comme pour les patchs et les drapeaux. */
    const isCoinCover = isCoinLogo && active.classList.contains('is-cover');
    const coinMin = COIN_INSET;
    const coinMax = 100 - COIN_INSET;
    // Bornes verticales décalées vers le bas (voir COIN_OFFSET_Y).
    const coinMinY = COIN_INSET + COIN_OFFSET_Y;
    // Verso numéroté : le bas est réservé au numéro.
    const coinHasNumber = isCoinLogo &&
      !!active.closest('.coin-disc.has-number');
    const coinMaxY = coinHasNumber
      ? Math.min(100 - COIN_INSET + COIN_OFFSET_Y, 100 - COIN_NUMBER_RESERVE)
      : (100 - COIN_INSET + COIN_OFFSET_Y);

    /* Coin en couverture : mêmes bornes symétriques que patch/drapeau, le
       cadre .coin-crop étant déjà la zone frappée. */
    let cX0 = coinMin, cX1 = coinMax, cY0 = coinMinY, cY1 = coinMaxY;
    if (isCoinCover) {
      const curCW = parseFloat(active.style.width) || 100;
      const cOver = Math.max(0, curCW - 100);
      cX0 = -PATCH_PAN - cOver;
      cX1 = 100 + PATCH_PAN + cOver + cOver;   // compense maxPos()
      cY0 = cX0;
      cY1 = cX1;
    }

    const MIN_POS = isPatchLogo ? pX0
      : (isFlagLogo ? fX0 : (isCoinLogo ? cX0 : 0));
    const MIN_POS_Y = isPatchLogo ? pY0
      : (isFlagLogo ? fY0 : (isCoinLogo ? cY0 : 0));
    const maxPos = (sizePct) =>
      isPatchLogo ? (pX1 - sizePct)
        : (isFlagLogo ? (fX1 - sizePct) : ((isCoinLogo ? cX1 : 100) - sizePct));
    const maxPosY = (sizePct) =>
      isPatchLogo ? (pY1 - sizePct)
        : (isFlagLogo ? (fY1 - sizePct) : ((isCoinLogo ? cY1 : 100) - sizePct));
    // Le logo ne peut pas être plus large que la zone imprimable.
    /* Patch : le design part à 100 % (il couvre la forme) et peut être zoomé
       jusqu'à PATCH_MAX_ZOOM. Il ne descend jamais sous 100 % (voir minW),
       sans quoi il laisserait un vide dans la silhouette. */
    const maxW = isFlagLogo ? flagMaxW
      : (isCoinCover ? PATCH_MAX_ZOOM
        : (isCoinLogo ? (coinMax - coinMin) : (isPatchLogo ? PATCH_MAX_ZOOM : MAX_W)));

    if (mode === 'resize') {
      /* Redimensionnement depuis les 8 poignées (4 coins + 4 côtés).
         Le logo garde son ratio (height:auto) : c'est donc la LARGEUR qui pilote.
         - poignées est (e, ne, se)  : tirer à droite agrandit  -> +dx
         - poignées ouest (w, nw, sw): tirer à gauche agrandit  -> -dx
         - poignée sud (s)           : tirer vers le bas agrandit -> +dy
         - poignée nord (n)          : tirer vers le haut agrandit -> -dy
         Les poignées ouest/nord déplacent aussi le logo, sinon son bord opposé
         « fuirait » au lieu de rester en place. */
      var g = grip || 'se';
      var delta;
      if (g === 'n' || g === 's') {
        // Côtés haut/bas : le geste vertical pilote la taille.
        delta = (g === 's' ? dy : -dy) / bounds.height * 100 * (bounds.height / bounds.width);
      } else {
        // Coins et côtés gauche/droite : le geste horizontal pilote la taille.
        delta = (g.indexOf('w') !== -1 ? -dx : dx) / bounds.width * 100;
      }

      let newW = startW + delta;
      /* Patch : le design peut être AGRANDI (zoom sur une partie du visuel)
         mais jamais réduit sous 100 % — en dessous, il cesserait de couvrir
         la forme et laisserait un vide. Le plancher générique (MIN_W = 4 %)
         autoriserait une vignette perdue au milieu du patch. */
      var minW = (isPatchLogo || isFlagCover || isCoinCover) ? 100 : MIN_W;
      newW = Math.max(minW, Math.min(maxW, newW));

      // Bord opposé fixe : on compense le décalage de largeur/hauteur.
      var grown = newW - startW;                       // variation en % de largeur
      if (g.indexOf('w') !== -1) {
        active.style.left = (startLeft - grown) + '%';  // le bord droit ne bouge pas
      }
      if (g === 'n' || g === 'nw' || g === 'ne') {
        // Hauteur en % du canvas : la largeur % est relative à la LARGEUR du canvas.
        var ratioH = (startH || 0) / (startW || 1);     // hauteur/largeur du logo
        active.style.top = (startTop - grown * ratioH) + '%'; // le bord bas ne bouge pas
      }

      active.style.width = newW + '%';
      /* Design en COUVERTURE : la boîte doit grandir sur les DEUX axes, sinon
         `object-fit: cover` recadre dans une boîte aplatie et l'image cesse de
         remplir la zone. Les logos ordinaires gardent `height: auto` (ratio
         naturel préservé). */
      if (isCoinCover || isFlagCover) active.style.height = newW + '%';

      /* DRAPEAUX : maxW ne borne que la LARGEUR. Un visuel très haut (ou tiré
         depuis une poignée nord/ouest, qui déplace aussi le logo) sortait donc
         encore de la zone en hauteur ou par un bord. On revérifie ici les trois
         dimensions — largeur, hauteur et position — après application. */
      if (isFlagLogo || isCoinLogo || isPatchLogo) {
        /* Bornes de la zone selon la pièce en cours. En COUVERTURE, ce sont
           les bornes de recadrage (cX0…) et non celles d'un logo posé dans
           une zone : utiliser coinMin/coinMax ici annulait tout
           agrandissement — la hauteur dépassait aussitôt la « zone », et la
           largeur était réduite d'autant. */
        var zX0 = isFlagLogo ? fX0 : (isPatchLogo ? pX0 : cX0);
        var zX1 = isFlagLogo ? fX1 : (isPatchLogo ? pX1 : cX1);
        var zY0 = isFlagLogo ? fY0 : (isPatchLogo ? pY0 : cY0);
        var zY1 = isFlagLogo ? fY1 : (isPatchLogo ? pY1 : cY1);

        var wNow = parseFloat(active.style.width) || newW;
        var hNow = (active.offsetHeight / bounds.height) * 100;
        var zoneH = zY1 - zY0;
        /* Le rattrapage de hauteur ne vaut que pour un logo posé DANS une
           zone. En couverture, le design déborde par conception : le brider
           le ferait rétrécir à chaque geste. */
        var coverMode = isPatchLogo || isFlagCover || isCoinCover;
        if (!coverMode && hNow > zoneH && hNow > 0) {
          // Trop haut : on réduit la largeur d'autant, ratio conservé.
          wNow = wNow * (zoneH / hNow);
          active.style.width = wNow + '%';
          hNow = (active.offsetHeight / bounds.height) * 100;
        }
        /* Le clamp de POSITION suit la même règle que celui de la hauteur
           ci-dessus : en couverture, le design déborde par conception, il n'y
           a rien à borner pendant qu'on l'étire.

           Le garde `coverMode` s'arrêtait à la largeur. La position, elle,
           restait bornée — et sur le DRAPEAU, dont le cadre de rognage n'est
           pas carré (voir les bornes verticales plus haut), `zY1 - hNow`
           repoussait `top` vers la borne haute à chaque frame. Le design
           dérivait hors du .flag-crop-preview, qui porte `overflow: hidden`,
           et la zone imprimée se vidait à mesure de l'agrandissement.

           Aucune contrainte n'est perdue : en couverture, le DÉPLACEMENT
           applique déjà ses propres bornes (fX0/fX1, fY0/fY1 plus haut), qui
           autorisent volontairement le débordement — c'est ce qui rend le
           recadrage possible. Ce clamp-ci ne servait qu'aux logos posés DANS
           une zone, et il continue de s'y appliquer. */
        if (!coverMode) {
          var lNow = parseFloat(active.style.left);
          var tNow = parseFloat(active.style.top);
          if (isNaN(lNow)) lNow = zX0;
          if (isNaN(tNow)) tNow = zY0;
          active.style.left = Math.max(zX0, Math.min(zX1 - wNow, lNow)) + '%';
          active.style.top = Math.max(zY0, Math.min(zY1 - hNow, tNow)) + '%';
        }
      }

      // Pour un TEXTE simple : la taille de police suit la largeur (proportionnel).
      if (active.classList.contains('design-text') && !active.classList.contains('is-shaped')) {
        var ratio = newW / (startW || newW);
        if (!startFont) startFont = parseFloat(getComputedStyle(active).fontSize) || 20;
        /* PLAFOND LU SUR window.MAX_TEXT_SIZE, et non codé en dur.

           120 était écrit ici : l'étirement contournait donc la limite que la
           jauge respecte (conf-text-toolbar.js:594). Deux chemins, deux
           plafonds — le client pouvait dépasser à la poignée ce que le curseur
           lui refusait. */
        var plafondTx = window.MAX_TEXT_SIZE || 120;
        var newFont = Math.max(8, Math.min(plafondTx, startFont * ratio));
        active.style.fontSize = newFont + 'px';
        // La taille visée par l'utilisateur = ce qu'il tire ; clampTextToZone
        // la respecte tant qu'elle tient dans la zone, sinon la borne.
        active.setAttribute('data-wanted-size', newFont);
        /* `fr` — poitrine droite — MANQUAIT : son texte n'était donc jamais
           borné après un étirement, ni en taille ni en position. */
        var tz = active.id === 'text-f' ? 'f'
               : (active.id === 'text-fr' ? 'fr'
               : (active.id === 'text-b' ? 'b' : null));
        if (tz && typeof window.clampTextToZone === 'function') window.clampTextToZone(tz);
      }
    } else {
      // Déplacement
      let newLeft = startLeft + (dx / bounds.width) * 100;
      let newTop = startTop + (dy / bounds.height) * 100;

      const { wPct, hPct } = logoSizePct(active);
      newLeft = Math.max(MIN_POS, Math.min(maxPos(wPct), newLeft));
      newTop = Math.max(MIN_POS_Y, Math.min(maxPosY(hPct), newTop));

      active.style.left = newLeft + '%';
      active.style.top = newTop + '%';
    }

    /* Patch en cours d'édition : la doublure « zone imprimée » suit le design
       en direct, sinon elle resterait figée pendant le geste. */
    if (active.id === 'patch-logo' && typeof window.syncPatchCropPreview === 'function') {
      window.syncPatchCropPreview();
    }
    // Idem pour un drapeau en couverture.
    if (isFlagCover && typeof window.syncFlagCropPreview === 'function') {
      window.syncFlagCropPreview((active.id || '').replace('flag-logo-', ''));
    }
    // Idem pour une pièce en couverture.
    if (isCoinCover && typeof window.syncCoinCropPreview === 'function') {
      window.syncCoinCropPreview((active.id || '').replace('coin-logo-', ''));
    }
    // Synchronise le logo manche opposé en miroir (si applicable)
    mirrorSleeve(active);
    // Synchronise le logo de la vue de côté avec la taille du recto (coins)
    syncCoinCote(active);
    // Aperçu temps réel de la vignette récap (logo cœur déplacé/redimensionné)
    if (active.id === 'logo-f' && typeof window.updateRecapThumbLogo === 'function') {
      window.updateRecapThumbLogo();
    }
    // Contrainte : le logo textile reste DANS sa zone pointillée.
    // Calque -> zone de contrainte. Toute zone absente d'ici n'est PAS bornée :
    // son logo peut sortir du gabarit d'impression.
    var TEXTILE_ZONE = {
      'logo-f': 'f', 'logo-fr': 'fr', 'logo-b': 'b',
      'logo-sl': 'sl', 'logo-sr': 'sr'
    };
    if (TEXTILE_ZONE[active.id] && typeof window.clampLogoToZone === 'function') {
      window.clampLogoToZone(TEXTILE_ZONE[active.id]);
    }
    // Le texte reste DANS sa zone horizontale (pas de sortie).
    if (active.classList.contains('design-text') && typeof window.clampTextToZone === 'function') {
      // id « text-<zone> » -> zone ; couvre f, fr et b sans énumération.
      var tz = (active.id || '').indexOf('text-') === 0 ? active.id.slice(5) : null;
      if (tz) window.clampTextToZone(tz);
    }

    // Idem pour le drapeau recto (vignette récap drapeau)
    if (active.id === 'flag-logo-recto' && typeof window.updateFlagRecapThumb === 'function') {
      window.updateFlagRecapThumb();
    }
    // Idem pour le patch (vignette récap patch)
    if (active.id === 'patch-logo' && typeof window.updatePatchRecapThumb === 'function') {
      window.updatePatchRecapThumb();
    }
    // Idem pour le coin recto (vignette récap coin)
    if (active.id === 'coin-logo-recto' && typeof window.updateCoinRecapThumb === 'function') {
      window.updateCoinRecapThumb();
    }
    // preventDefault() est appelé en ENTRÉE de fonction (voir plus haut).
  }

  // Map l'id d'un logo -> sa zone de persistance (pour sauvegarder taille/position)
  const LOGO_ZONE = {
    'logo-f': 'f',
    'logo-fr': 'fr',
    'logo-b': 'b',
    'logo-sl': 'sl', 'logo-sl-face': 'sl',
    'logo-sr': 'sr', 'logo-sr-face': 'sr',
    'patch-logo': 'c',
    'coin-logo-recto': 'coin-recto',
    'coin-logo-verso': 'coin-verso',
    'flag-logo-recto': 'flag-recto',
    'flag-logo-verso': 'flag-verso'
  };

  function onPointerUp(e) {
    /* Fin de geste tactile : ne conclure que si c'est bien NOTRE doigt qui
       se lève. Un second doigt relâché ailleurs terminait sinon le
       déplacement en cours. `touchcancel` (plage vide) passe toujours. */
    if (e && e.changedTouches && touchId !== null && e.type !== 'touchcancel') {
      let mine = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) { mine = true; break; }
      }
      if (!mine) return;
    }
    if (active) {
      // CLIC (sans déplacement) sur un TEXTE -> sélection + ouverture directe du
      // panneau « Modifier le texte ». Un vrai drag (>4px) ne déclenche rien.
      if (active.classList.contains('design-text') && mode === 'drag' && !moved) {
        var czone = (active.id || '').indexOf('text-') === 0 ? active.id.slice(5) : null;
        selectDesignText(active);
        // Barre d'outils au-dessus de l'aperçu (pas de basculement de sidebar).
        if (czone && typeof window.showTextToolbar === 'function') {
          window.showTextToolbar(czone);
        } else if (czone && typeof window.editText === 'function') {
          window.editText(czone);   // repli si la barre n'est pas chargée
        }
      }
      
      // CLIC (sans déplacement) sur un LOGO -> sélection avec boutons de contrôle
      if (active.classList.contains('design-logo') && mode === 'drag' && !moved) {
        selectDesignLogo(active);
      }

      // Texte déplaçable : sauvegarder position + taille via le hook dédié.
      if (active.classList.contains('design-text') && typeof window.saveTextGeo === 'function') {
        // id « text-<zone> » -> zone ; couvre f, fr et b sans énumération.
        var tzone = (active.id || '').indexOf('text-') === 0 ? active.id.slice(5) : null;
        /* Largeur : fitTextBox() la déplace de `width` vers `max-width` (la
           boîte épouse alors le texte) et laisse `style.width` VIDE. Lire
           style.width seul renvoyait donc '' — saveTextGeo ignore les valeurs
           vides, et la largeur enregistrée restait celle d'avant le geste.
           Au retour, le texte était repositionné sur une largeur périmée,
           donc décalé. data-w porte la valeur de référence. */
        if (tzone) window.saveTextGeo(tzone, {
          left: active.style.left, top: active.style.top,
          width: active.style.width || active.getAttribute('data-w') || active.style.maxWidth,
          fontSize: active.style.fontSize
        });
      } else {
        // Sauvegarder la taille/position pour la retrouver après un rechargement
        const zone = LOGO_ZONE[active.id];
        if (zone && typeof window.saveUploadGeo === 'function') {
          window.saveUploadGeo(zone, {
            left: active.style.left,
            top: active.style.top,
            width: active.style.width,
            /* Hauteur persistée uniquement en mode couverture : elle y porte
               le zoom au même titre que la largeur. Les logos ordinaires
               gardent `auto` — l'enregistrer figerait leur ratio. */
            height: active.style.height || undefined
          });
        }
      }
      active.classList.remove('dragging', 'resizing');
      active = null;
      mode = null;
    }
    touchId = null;
    // Geste terminé : les zones repassent en retrait.
    setManipulating(false);
  }

  /* ── Poignées : 4 coins + 4 côtés ──────────────────────────────────────
     Les templates ne posent qu'UNE poignée (coin bas-droit historique). On
     complète ici pour tous les éléments manipulables, y compris ceux injectés
     dynamiquement (voir l'observateur plus bas). */
  const GRIPS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  function ensureGrips(el) {
    if (!el) return;
    const existing = el.querySelectorAll('.logo-resize');
    // Déjà complété ? (on marque l'élément pour ne pas repasser dessus)
    if (el.dataset.gripsReady === '1') return;

    // Récupère le data-resize d'origine (utilisé ailleurs dans le code).
    const zone =
      (existing[0] && existing[0].getAttribute('data-resize')) ||
      el.getAttribute('data-zone') ||
      '';

    existing.forEach((h) => h.remove());
    GRIPS.forEach((pos) => {
      const h = document.createElement('span');
      h.className = 'logo-resize pos-' + pos;
      h.setAttribute('data-pos', pos);
      if (zone) h.setAttribute('data-resize', zone);
      el.appendChild(h);
    });
    el.dataset.gripsReady = '1';
  }

  function refreshGrips() {
    document
      .querySelectorAll('.design-logo, .design-text')
      .forEach(ensureGrips);
  }

  // Au chargement, puis à chaque injection de layout (produit, vue, upload…).
  document.addEventListener('DOMContentLoaded', refreshGrips);
  refreshGrips();
  new MutationObserver(function () {
    refreshGrips();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Souris
  document.addEventListener('mousedown', onPointerDown);
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup', onPointerUp);

  /* Clic HORS d'un texte et hors du panneau d'édition -> désélectionne.
     Évite qu'un cadre noir reste affiché après avoir cliqué ailleurs. */
  document.addEventListener('mousedown', function (e) {
    if (e.target.closest('.design-text')) return;          // clic sur un texte
    if (e.target.closest('#txt-toolbar')) return;          // barre d'outils texte
    /* Menus « Police » / couleur : déplacés dans <body> par conf-text-toolbar.js,
       ils ne sont plus dans #txt-toolbar. Sans cette garde, choisir une police
       désélectionnait le texte avant que le click ne l'applique. */
    if (e.target.closest('.txt-tb-pop')) return;
    if (e.target.closest('#txt-panel, .txt-panel, #txt-inline')) return; // panneau
    // Panneau Texte de la sidebar moderne : le mousedown sur « Ajouter au
    // design » précède son click. Sans cette garde, la sélection posée par
    // l'insertion était effacée dans la foulée et la barre se refermait.
    if (e.target.closest('#panel-text')) return;
    if (typeof window.clearDesignTextSelection === 'function') {
      window.clearDesignTextSelection();
    }
  });

  /* Clic HORS d'un logo -> désélectionne le logo */
  document.addEventListener('mousedown', function (e) {
    if (e.target.closest('.design-logo')) return;          // clic sur un logo
    if (e.target.closest('.logo-ctrl')) return;            // clic sur un bouton contrôle
    /* La barre d'outils du coin PILOTE le logo sélectionné : cliquer dedans
       ne doit pas le désélectionner, sinon la barre se referme au mousedown
       et l'action n'est jamais exécutée (le click n'arrive plus). */
    if (e.target.closest('#coin-toolbar')) return;
    if (typeof window.clearDesignLogoSelection === 'function') {
      window.clearDesignLogoSelection();
    }
  });

  // Tactile
  document.addEventListener('touchstart', onPointerDown, { passive: false });
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp);
  /* touchcancel : émis quand le navigateur reprend la main sur le geste
     (appel entrant, bascule d'onglet, defilement requalifie). Sans cet
     écouteur, `active` restait posé et plus rien ne bougeait ensuite. */
  document.addEventListener('touchcancel', onPointerUp);

  confLog('🎯 Logo drag & resize initialisé');
})();
