/**
 * Drapeaux - Layout et fonctions spécifiques
 */

/* ── Ancienne sidebar « Drapeaux » : GABARIT SUPPRIMÉ (2026-08-05) ────────
   219 lignes de HTML (~10 Ko) livrées à chaque client sans jamais être
   injectées — marqué « OBSOLÈTE, conservé pour référence ». Aucun code ne
   référençait DRAPEAUX_SIDEBAR_TEMPLATE.

   Ces réglages vivent désormais dans le panneau « Options Drapeau » du sidebar
   moderne (snippets/sidebar-modern.liquid), et les zones d'upload dans la vue
   #upload-view-flag. loadDrapeauxSidebar() (conf-dynamic-layout.js) vide le
   conteneur au lieu d'injecter un gabarit.

   NE PAS le réintroduire : il redéclarerait les IDs du panneau statique
   (#uf-recto, #uf-verso, #flag-remove-recto…) dans une sidebar masquée, et
   getElementById les résoudrait sur cette copie invisible.
   Contenu récupérable dans l'historique Git. */

// ========================================
// Fonctions pour les interactions Drapeaux
// ========================================

// Sélection du type d'impression
function selectFlagType(element) {
  document.querySelectorAll('.flag-type-card').forEach(card => {
    card.classList.remove('active');
  });
  element.classList.add('active');

  const type = element.getAttribute('data-type');
  confLog('📄 Type d\'impression:', type);

  const simple = (type !== 'recto-verso');

  // Ancienne sidebar : zone d'upload complète (avec son libellé).
  const versoZone = document.querySelector('.flag-upload-zone:nth-child(2)');
  if (versoZone) {
    versoZone.style.display = simple ? 'none' : 'flex';
  }

  /* Sidebar moderne : la vue d'upload n'a qu'une rangée de deux boutons.
     On masque celui du verso, son libellé et son bouton « Supprimer » ;
     single-face fait passer la rangée sur une seule colonne. */
  const versoBtn = document.getElementById('flag-upload-btn-verso');
  if (versoBtn) versoBtn.style.display = simple ? 'none' : '';
  const versoLbl = document.getElementById('flag-upload-label-verso');
  if (versoLbl) versoLbl.style.display = simple ? 'none' : '';
  const flagView = document.getElementById('upload-view-flag');
  if (flagView) flagView.classList.toggle('single-face', simple);

  // En recto simple, un verso déjà chargé n'a plus lieu d'être : son aperçu
  // disparaît avec la zone d'upload correspondante.
  if (simple) {
    const versoPreview = document.getElementById('flag-preview-verso');
    if (versoPreview) versoPreview.style.display = 'none';
  }

  // Afficher/masquer le mock VERSO dans le canvas
  const versoMock = document.getElementById('flag-verso');
  if (versoMock) {
    versoMock.style.display = type === 'recto-verso' ? '' : 'none';
  }

  // Mettre à jour le récap
  const recapType = document.getElementById('flag-recap-type');
  if (recapType) {
    recapType.textContent = type === 'recto-verso' ? 'Recto verso' : 'Recto simple';
  }
}

// Sélection de l'orientation
function selectFlagOrientation(element) {
  document.querySelectorAll('.flag-orientation-card').forEach(card => {
    card.classList.remove('active');
  });
  element.classList.add('active');

  const orientation = element.getAttribute('data-orientation');
  window.__flagOrientation = orientation;
  changeFlagOrientation(orientation);

  // Échange les images du drapeau (paysage <-> portrait).
  refreshFlagImages();

  // Mettre à jour le récap
  const recapOri = document.getElementById('flag-recap-orientation');
  if (recapOri) {
    recapOri.textContent = orientation === 'portrait' ? 'Portrait' : 'Paysage';
  }

  confLog('🔄 Orientation:', orientation);
  // La géométrie du drapeau change : recale la zone imprimable après repaint.
  setTimeout(function () {
    if (window.syncFlagSafeZones) window.syncFlagSafeZones();
    if (window.clampFlagLogo) window.clampFlagLogo();
  }, 60);
}

/* Couleur (hex du bouton) -> slug utilisé dans le nom de fichier.
   Doit rester aligné sur les pastilles du sidebar et sur IMAGES-DRAPEAUX.md. */
var FLAG_COLOR_SLUGS = {
  '#ffffff': 'blanc',
  '#1a1a1a': 'noir',
  '#c0392b': 'rouge',
  '#1e3a5f': 'bleu-marine'
};

/** Slug de la couleur de drapeau courante (par défaut : blanc). */
function currentFlagColorSlug() {
  var hex = String(window.__flagColor || '#ffffff').toLowerCase();
  return FLAG_COLOR_SLUGS[hex] || 'blanc';
}

/* Précharge en arrière-plan les images des AUTRES couleurs, pour la variante
   courante (anneaux + orientation). Le changement de couleur devient alors
   instantané : l'image est déjà en cache quand l'utilisateur clique.
   Lancé en tâche de fond, sans bloquer l'affichage. */
/* Finition courante -> préfixe de fichier.
   '0' = sans anneaux (défaut), '2' = 2 anneaux, '4' = 4 anneaux.
   Fichiers attendus : flag-{0an|2an|4an}-{couleur}-{face}-{orientation}.png */
function flagRingsKey() {
  var v = String(window.__flagAnneaux == null ? '0' : window.__flagAnneaux);
  return (v === '4') ? '4an' : (v === '2') ? '2an' : '0an';
}
window.flagRingsKey = flagRingsKey;

var _flagPreloaded = {};
function preloadFlagColors() {
  var URLS = window.FLAG_IMAGE_URLS || {};
  var anneaux = flagRingsKey();
  var orient = (window.__flagOrientation === 'portrait') ? 'portrait' : 'paysage';

  Object.keys(FLAG_COLOR_SLUGS).forEach(function (hex) {
    var color = FLAG_COLOR_SLUGS[hex];
    ['recto', 'verso'].forEach(function (face) {
      var key = anneaux + '-' + color + '-' + face + '-' + orient;
      var url = URLS[key];
      if (!url || _flagPreloaded[key]) return;
      _flagPreloaded[key] = true;
      var img = new Image();
      img.src = url;                       // le navigateur met en cache
    });
  });
}

/* Choisit et applique les images recto/verso du drapeau selon l'état courant :
   COULEUR + anneaux (2/4) + orientation (paysage/portrait).
   Chaque combinaison a sa propre image : flag-{2an|4an}-{couleur}-{face}-{orientation}.png
   Repli sur le drapeau blanc si l'image de la couleur n'existe pas encore. */
function refreshFlagImages() {
  var A = window.ASSET_URLS || {};
  var URLS = window.FLAG_IMAGE_URLS || {};

  var anneaux = flagRingsKey();
  var orient = (window.__flagOrientation === 'portrait') ? 'portrait' : 'paysage';
  var color = currentFlagColorSlug();

  // URL de la face demandée, avec repli sur le blanc puis sur l'image générique.
  function pick(face) {
    var key = anneaux + '-' + color + '-' + face + '-' + orient;
    if (URLS[key]) return URLS[key];

    // Repli 1 : même variante en blanc.
    var white = anneaux + '-blanc-' + face + '-' + orient;
    if (URLS[white]) return URLS[white];

    // Repli 2 : les images « sans anneaux » (0an) ne sont pas encore fournies
    // pour toutes les couleurs — on retombe sur la finition 2 anneaux plutôt
    // que sur un drapeau blanc générique, qui perdrait la couleur choisie.
    // À retirer quand la série flag-0an-*.png sera complète.
    if (anneaux === '0an') {
      var alt = '2an-' + color + '-' + face + '-' + orient;
      if (URLS[alt]) return URLS[alt];
      var altWhite = '2an-blanc-' + face + '-' + orient;
      if (URLS[altWhite]) return URLS[altWhite];
    }

    // Repli 2 : anciennes images génériques (sécurité).
    var is4 = (anneaux === '4an');
    var isPortrait = (orient === 'portrait');
    if (face === 'recto') {
      return isPortrait
        ? (is4 ? A.flag4anRectoPortrait : A.flagRectoPortrait) || A.flagRecto
        : (is4 ? A.flag4anRecto : A.flagRecto);
    }
    return isPortrait
      ? (is4 ? A.flag4anVersoPortrait : A.flagVersoPortrait) || A.flagVerso
      : (is4 ? A.flag4anVerso : A.flagVerso);
  }

  var recto = pick('recto');
  var verso = pick('verso');

  var baseRecto = document.getElementById('flag-base-recto');
  var baseVerso = document.getElementById('flag-base-verso');
  if (baseRecto && recto) swapFlagImage(baseRecto, recto);
  if (baseVerso && verso) swapFlagImage(baseVerso, verso);

  // Réapplique le format (proportions) après le changement d'image.
  if (typeof applyFlagSizeToImages === 'function') {
    setTimeout(applyFlagSizeToImages, 60);
  }
  // Met à jour la vignette du récap (fond recto + logo).
  if (typeof window.updateFlagRecapThumb === 'function') {
    setTimeout(window.updateFlagRecapThumb, 80);
  }
  // Précharge les autres couleurs en tâche de fond : le prochain clic sur une
  // pastille affichera l'image instantanément (déjà en cache).
  setTimeout(preloadFlagColors, 400);
}

/* La couleur vient désormais des IMAGES elles-mêmes : plus de teinte CSS.
   Conservée (neutralisée) car appelée depuis d'autres modules. */
function applyFlagColorToLayers() {
  document.querySelectorAll('.flag-color-layer').forEach(function (layer) {
    layer.style.background = 'transparent';
    layer.style.webkitMaskImage = '';
    layer.style.maskImage = '';
  });
}

// Sélection de la couleur de fond du drapeau
function selFlagColor(element, hex) {
  /* L'état actif suit la COULEUR, pas le bouton cliqué : si un jour un second
     jeu de swatches coexiste (barre du canvas + panneau), les deux restent
     cohérents. Le repli sur `element` couvre les boutons sans data-color. */
  var target = String(hex || '').toLowerCase();
  var matched = false;
  document.querySelectorAll('.flag-color-swatch').forEach(function (s) {
    var val = (s.getAttribute('data-color') || '').toLowerCase();
    var on = val && val === target;
    s.classList.toggle('active', on);
    if (on) matched = true;
  });
  if (!matched && element) element.classList.add('active');

  window.__flagColor = hex;
  // Nom lisible de la couleur (title du bouton) : sert au récap et à la commande.
  var colorName = (element && element.getAttribute('title')) || 'Blanc';
  window.__flagColorName = colorName;

  // La couleur = une IMAGE dédiée. On recharge donc les images du drapeau.
  refreshFlagImages();

  // Récap : affiche le nom de la couleur (repris dans les propriétés de commande).
  var recapColor = document.getElementById('flag-recap-color');
  if (recapColor) recapColor.textContent = colorName;

  // Persistance (récupérée au rechargement / partage).
  try {
    sessionStorage.setItem('conf_flag_color', hex);
    sessionStorage.setItem('conf_flag_color_name', colorName);
  } catch (e) {}

  confLog('🎨 Couleur drapeau:', colorName, '->', currentFlagColorSlug());
}

// Changer l'orientation des drapeaux du canvas
function changeFlagOrientation(orientation) {
  document.querySelectorAll('.flag-wave').forEach(wave => {
    wave.classList.remove('orientation-paysage', 'orientation-portrait');
    wave.classList.add('orientation-' + orientation);
  });
  // Marque aussi la SCÈNE 3D pour contraindre l'image réelle (portrait = hauteur
  // limitée, sinon l'image verticale déborde et se coupe en bas).
  var stage = document.querySelector('.flag-stage');
  if (stage) {
    stage.classList.remove('orientation-paysage', 'orientation-portrait');
    stage.classList.add('orientation-' + orientation);
  }
}

// Sélection de la taille
function selectFlagSize(element) {
  document.querySelectorAll('.flag-size-card').forEach(card => {
    card.classList.remove('active');
  });
  element.classList.add('active');

  const size = element.getAttribute('data-size');
  const sizeLabels = {
    '90x150': '90 x 150 cm',
    '100x100': '1 x 1 m',
    'custom': 'Sur mesure'
  };
  const recapSize = document.getElementById('flag-recap-size');
  if (recapSize) {
    recapSize.textContent = sizeLabels[size] || size;
  }

  // Appliquer le format au canvas (change le ratio des drapeaux)
  changeFlagSize(size);

  confLog('📏 Taille:', size);
  // La géométrie du drapeau change : recale la zone imprimable après repaint.
  setTimeout(function () {
    if (window.syncFlagSafeZones) window.syncFlagSafeZones();
    if (window.clampFlagLogo) window.clampFlagLogo();
  }, 60);
}

// Changer le format/ratio des drapeaux du canvas
function changeFlagSize(size) {
  window.__flagSize = size;
  document.querySelectorAll('.flag-wave').forEach(wave => {
    wave.classList.remove('size-90x150', 'size-100x100', 'size-custom');
    wave.classList.add('size-' + size);
  });
  // Applique aussi le format à l'image 3D (change ses proportions).
  applyFlagSizeToImages();
}

/* Ajuste la TAILLE (échelle uniforme) de l'image du drapeau selon le format
   choisi. Scale uniforme -> pas de déformation de l'image réelle. Chaque format
   a son facteur : 1x1m plus compact, 90x150 standard, custom plus grand. */
function applyFlagSizeToImages() {
  var size = window.__flagSize || '90x150';
  // Facteur d'échelle par format (uniforme, sans déformer).
  var scales = { '90x150': 1.0, '100x100': 0.88, 'custom': 1.12 };
  var scale = scales[size] || 1.0;

  document.querySelectorAll('.flag-base-img').forEach(function (img) {
    img.style.transform = 'scale(' + scale.toFixed(3) + ')';
    img.style.transformOrigin = 'top left';
    img.style.transition = 'transform .25s ease';
  });
}

// Bouton contact taille personnalisée
function contactForCustomSize() {
  var msg = 'Email : contact@exemple.com\nTél : 01 XX XX XX XX';
  if (window.confAlert) window.confAlert(msg, { icon: 'info', title: 'Taille personnalisée' });
  else alert('Contactez-nous pour une taille personnalisée.\n' + msg);
}

// Sélection des anneaux
function selectAnneaux(element) {
  document.querySelectorAll('.flag-option-item').forEach(item => {
    item.classList.remove('active');
  });
  element.classList.add('active');

  const anneaux = element.getAttribute('data-anneaux');
  window.__flagAnneaux = anneaux;
  confLog('⭕ Anneaux:', anneaux);

  // Afficher 2 ou 4 anneaux sur les drapeaux codés (vue 2D)
  document.querySelectorAll('.flag-wave').forEach(wave => {
    wave.classList.toggle('grommets-4', anneaux === '4');
    // Sans anneaux : aucun œillet dessiné sur le drapeau codé (vue 2D).
    wave.classList.toggle('grommets-0', anneaux === '0');
  });

  // Échanger les images réelles selon anneaux + orientation courante.
  refreshFlagImages();

  // Mettre à jour le récap
  const recapAnneaux = document.getElementById('flag-recap-anneaux');
  if (recapAnneaux) {
    // '0 anneaux' n'aurait aucun sens pour le client.
    recapAnneaux.textContent = (anneaux === '0') ? 'Sans anneaux' : (anneaux + ' anneaux');
  }
}

// Change l'image d'un drapeau avec une transition (fondu + zoom)
/* Remplace l'image du drapeau par un CROSSFADE : l'ancienne image reste en place
   et s'efface pendant que la nouvelle apparaît par-dessus. Le changement de
   couleur devient imperceptible — aucun clignotement, aucun déplacement.
   La nouvelle image est préchargée avant tout affichage. */
function swapFlagImage(imgEl, newSrc) {
  if (!imgEl || !newSrc) return;

  // Déjà la bonne image : ne rien faire.
  if (imgEl.src && imgEl.src.indexOf(newSrc) !== -1) return;

  // Première image (pas encore de src) : on l'affiche directement.
  if (!imgEl.getAttribute('src')) {
    imgEl.src = newSrc;
    return;
  }

  var preload = new Image();
  if (imgEl.crossOrigin) preload.crossOrigin = imgEl.crossOrigin;

  preload.onload = function () {
    var parent = imgEl.parentElement;
    if (!parent) { imgEl.src = newSrc; return; }

    // Calque de transition : copie exacte de l'image, superposée à l'originale.
    var ghost = imgEl.cloneNode(false);
    ghost.removeAttribute('id');
    ghost.classList.add('flag-fade-in');
    ghost.src = newSrc;

    // Se cale précisément sur l'image d'origine.
    var cs = window.getComputedStyle(imgEl);
    ghost.style.position = 'absolute';
    ghost.style.top = imgEl.offsetTop + 'px';
    ghost.style.left = imgEl.offsetLeft + 'px';
    ghost.style.width = cs.width;
    ghost.style.height = cs.height;
    ghost.style.opacity = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '1';

    parent.appendChild(ghost);

    // Fondu entrant du calque.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { ghost.style.opacity = '1'; });
    });

    // Une fois le fondu terminé : l'image d'origine prend la nouvelle source,
    // et le calque disparaît. Le rendu final est identique — sans coupure.
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      imgEl.src = newSrc;
      requestAnimationFrame(function () {
        if (ghost.parentElement) ghost.parentElement.removeChild(ghost);
      });
    };
    ghost.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 400);   // filet de sécurité si transitionend ne part pas
  };

  // Image indisponible : on bascule sans effet plutôt que de rester bloqué.
  preload.onerror = function () { imgEl.src = newSrc; };
  preload.src = newSrc;
}

// Changement de vue Aperçu 3D / Aperçu 2D
function switchFlagView(view) {
  document.querySelectorAll('.flag-view-btn').forEach(btn => btn.classList.remove('active'));
  if (typeof event !== 'undefined' && event.target) {
    event.target.classList.add('active');
  }

  const stage = document.getElementById('flag-stage');
  if (stage) {
    stage.classList.toggle('view-2d', view === '2d');
  }

  confLog('👁️ Vue:', view);
}


// Changement de quantité
/* Borne une quantite dans [min, QTY_MAX]. Sans plafond, une saisie de
   999999999 partait au panier et le backend repondait 400 au checkout.
   `window.clampQty` vient de conf-pricing-tiers.js (charge en synchrone). */
function clampQtyFlag(valeur, min) {
  if (typeof window.clampQty === 'function') return window.clampQty(valeur, min);
  var n = parseInt(valeur, 10);
  return isFinite(n) && n >= min ? n : min;
}

function changeFlagQty(delta) {
  const input = document.getElementById('flag-qty-input');
  if (!input) return;
  
  // Bornée des deux côtés : minimum 1, plafond window.QTY_MAX.
  const qty = clampQtyFlag((parseInt(input.value, 10) || 1) + delta, 1);

  input.value = qty;
  confLog('📦 Quantité:', qty);
}

// Gestion de l'input quantité
function handleFlagQtyInput() {
  const input = document.getElementById('flag-qty-input');
  if (!input) return;

  const qty = clampQtyFlag(input.value, 1);
  /* Toujours réécrire : le champ doit refléter la valeur retenue, sinon
     l'utilisateur voit 999999999 alors que le plafond est utilisé. */
  if (String(input.value) !== String(qty)) input.value = qty;

  confLog('📦 Quantité:', qty);
}

// Supprime le design uploadé d'une face du drapeau (recto / verso)
function removeFlagDesign(face) {
  // Retirer de la persistance
  if (typeof removeUpload === 'function') removeUpload('flag-' + face);

  const wrap = document.getElementById('flag-' + face);
  if (wrap) {
    // Vider les images design (3D + 2D) et réafficher les placeholders
    wrap.querySelectorAll('.flag-design-img').forEach(img => { img.src = ''; img.style.display = 'none'; });
    wrap.querySelectorAll('.flag-canvas-placeholder').forEach(ph => ph.style.display = '');
  }

  // Cacher + réinitialiser le logo déplaçable (vue 3D)
  const dragLogo = document.getElementById('flag-logo-' + face);
  if (dragLogo) {
    dragLogo.style.display = 'none';
    dragLogo.style.left = '28%';
    dragLogo.style.top = '32%';
    dragLogo.style.width = '44%';
  }

  // Réinitialiser l'input fichier + masquer l'aperçu du panneau Upload
  const input = document.getElementById('uf-' + face);
  if (input) input.value = '';
  if (typeof window.hideUpPreview === 'function') {
    window.hideUpPreview('flag-preview-' + face, 'flag-preview-img-' + face);
  }

  // Face redevenue vide : son repère de zone réapparaît.
  if (typeof window.updateFlagZoneGuides === 'function') {
    window.updateFlagZoneGuides();
  }

  // Réinitialiser la miniature du récap (recto uniquement)
  if (face === 'recto') {
    const recapThumb = document.getElementById('flag-recap-thumb');
    if (recapThumb) {
      recapThumb.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="#ccc">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
        </svg>`;
    }
  }
}

/* ── Zone imprimable : calage sur l'image réelle ────────────────────────────
   .flag-img-3d est un conteneur flex plus large que le drapeau (l'image y est
   centrée, et en portrait elle est contrainte par la hauteur). Un cadre en
   inset:0 serait donc plus grand que le drapeau. On mesure l'image affichée et
   on pose la zone exactement dessus — juste dans les trois formats (paysage,
   portrait, carré) et à tout niveau de zoom. */
function syncFlagSafeZones() {
  document.querySelectorAll('.flag-img-3d').forEach(function (wrap) {
    var zone = wrap.querySelector('.flag-safe-zone');
    var img = wrap.querySelector('.flag-base-img');
    if (!zone || !img) return;
    // Image pas encore chargée : on repassera au load (voir écouteurs plus bas).
    if (!img.offsetWidth || !img.offsetHeight) return;
    /* Marges de sécurité, en % de l'image. Doivent rester égales à
       FLAG_INSET / FLAG_INSET_Y (conf-logo-drag.js) : le cadre affiché et la
       contrainte appliquée au logo sont deux expressions de la même limite.

       Elles DIFFÈRENT selon l'orientation, parce que les fichiers n'ont pas
       le même cadrage — mesuré sur les PNG :
         paysage  (612x408) : toile à 2,6 % du bord gauche, 6,4 % du haut
         portrait (408x612) : toile à 5,4 % du bord gauche, 4,6 % du haut
       Appliquer les valeurs du paysage au portrait plaçait le cadre HORS de
       la toile à gauche, et trop bas en haut. */
    var portrait = window.__flagOrientation === 'portrait';
    var insetX = portrait
      ? (window.FLAG_INSET_PORTRAIT != null ? window.FLAG_INSET_PORTRAIT : 7)
      : (window.FLAG_INSET != null ? window.FLAG_INSET : 4);
    var insetYp = portrait
      ? (window.FLAG_INSET_Y_PORTRAIT != null ? window.FLAG_INSET_Y_PORTRAIT : 6)
      : (window.FLAG_INSET_Y != null ? window.FLAG_INSET_Y : 9);
    insetX = insetX / 100;
    insetYp = insetYp / 100;
    var mx = img.offsetWidth * insetX;
    var my = img.offsetHeight * insetYp;
    zone.style.left = (img.offsetLeft + mx) + 'px';
    zone.style.top = (img.offsetTop + my) + 'px';
    zone.style.width = (img.offsetWidth - 2 * mx) + 'px';
    zone.style.height = (img.offsetHeight - 2 * my) + 'px';
  });
}
window.syncFlagSafeZones = syncFlagSafeZones;

/* Ramène un logo de drapeau DANS sa zone imprimable.
   La contrainte de conf-logo-drag.js ne joue qu'au déplacement : un visuel
   fraîchement uploadé garde sa position/taille par défaut et peut donc déborder.
   Appelée après chaque upload et à chaque changement de format. */
function clampFlagLogo(face) {
  var faces = face ? [face] : ['recto', 'verso'];
  faces.forEach(function (f) {
    var logo = document.getElementById('flag-logo-' + f);
    if (!logo || logo.style.display === 'none') return;

    /* DESIGN EN COUVERTURE : rien à borner ici.

       Cette fonction ramène la largeur à celle de la zone imprimable (~92 %,
       voir `w = Math.min(w, x1 - x0)` plus bas). En couverture, le design
       remplit sa boîte et DÉBORDE par conception — sa largeur va de 100 % à
       PATCH_MAX_ZOOM (300 %). L'appliquer rabotait donc le visuel à chaque
       passage, et le rattrapage de hauteur qui suit le réduisait encore.

       Le chemin mobile appelle clampFlagLogo après chaque recalcul de zones
       (conf-mobile.js:1001), d'où un design qui « disparaissait » à mesure
       qu'on l'agrandissait — sur téléphone seulement.

       Même garde que le ResizeObserver de conf-flag-cover.js:312-313, dont le
       commentaire décrit déjà ce symptôme : la protection y avait été posée,
       mais jamais reportée ici. On y ajoute `is-cover`, qui vaut aussi hors
       geste : une largeur supérieure à la zone est alors légitime. */
    if (logo.classList.contains('is-cover')) return;
    if (document.querySelector('.flag-img-3d.flag-editing')) return;
    if (logo.classList.contains('dragging') || logo.classList.contains('resizing')) return;

    var wrap = logo.closest('.flag-img-3d');
    var img = wrap && wrap.querySelector('.flag-base-img');
    if (!img || !img.offsetWidth || !img.offsetHeight) return;

    var cw = wrap.offsetWidth, ch = wrap.offsetHeight;
    if (!cw || !ch) return;

    // Marges propres à l'orientation (voir syncFlagSafeZones ci-dessus).
    var isPortrait = window.__flagOrientation === 'portrait';
    var inset = isPortrait
      ? (window.FLAG_INSET_PORTRAIT != null ? window.FLAG_INSET_PORTRAIT : 7)
      : (window.FLAG_INSET != null ? window.FLAG_INSET : 4);
    var insetY = isPortrait
      ? (window.FLAG_INSET_Y_PORTRAIT != null ? window.FLAG_INSET_Y_PORTRAIT : 6)
      : (window.FLAG_INSET_Y != null ? window.FLAG_INSET_Y : 9);
    // Emprise de l'image dans le conteneur, en % — mêmes bornes que le drag.
    var x0 = (img.offsetLeft / cw) * 100 + inset;
    var x1 = ((img.offsetLeft + img.offsetWidth) / cw) * 100 - inset;
    var y0 = (img.offsetTop / ch) * 100 + insetY;
    var y1 = ((img.offsetTop + img.offsetHeight) / ch) * 100 - insetY;

    // Largeur : bornée à la zone.
    var w = parseFloat(logo.style.width) || 44;
    w = Math.min(w, x1 - x0);
    logo.style.width = w + '%';

    // Hauteur réelle après application de la largeur (ratio de l'image).
    var h = (logo.offsetHeight / ch) * 100;
    if (h > y1 - y0) {
      // Trop haut pour la zone : on réduit la largeur d'autant (ratio conservé).
      w = w * ((y1 - y0) / h);
      logo.style.width = w + '%';
      h = (logo.offsetHeight / ch) * 100;
    }

    var l = parseFloat(logo.style.left);
    var t = parseFloat(logo.style.top);
    if (isNaN(l)) l = x0;
    if (isNaN(t)) t = y0;
    logo.style.left = Math.max(x0, Math.min(x1 - w, l)) + '%';
    logo.style.top = Math.max(y0, Math.min(y1 - h, t)) + '%';
  });
}
window.clampFlagLogo = clampFlagLogo;

/* Recale la zone à chaque événement qui change la géométrie du drapeau :
   chargement d'image, changement d'orientation/taille/couleur, resize. */
document.addEventListener('DOMContentLoaded', syncFlagSafeZones);
window.addEventListener('resize', syncFlagSafeZones);
window.addEventListener('load', syncFlagSafeZones);
document.addEventListener('load', function (e) {
  if (e.target && e.target.classList && e.target.classList.contains('flag-base-img')) {
    syncFlagSafeZones();
  }
}, true);   // capture : l'événement load des <img> ne remonte pas

/* Exposition explicite sur window.
   Appelées depuis conf-sidebar-modern.js (panneau « Options Drapeau ») pour
   réappliquer les réglages après reconstruction du canvas. Les onclick du
   HTML les résolvent déjà via la portée globale ; cette assignation rend
   l'accès window.* fiable. */
window.selectFlagType = selectFlagType;
window.selectFlagOrientation = selectFlagOrientation;
window.selectFlagSize = selectFlagSize;
window.selFlagColor = selFlagColor;
window.selectAnneaux = selectAnneaux;
window.removeFlagDesign = removeFlagDesign;
window.contactForCustomSize = contactForCustomSize;

/* ══════════════════════════════════════════════════════════════════
   Repères de zone imprimable (drapeaux)
   Même règle que les textiles : visible tant que la face est vide,
   effacé dès qu'un design l'occupe, réaffiché pendant un déplacement
   (voir .flag-safe-zone dans conf-drapeaux.css).
   ══════════════════════════════════════════════════════════════════ */
function updateFlagZoneGuides() {
  ['recto', 'verso'].forEach(function (face) {
    var wrap = document.querySelector('.flag-img-3d[data-face="' + face + '"]');
    if (!wrap) return;
    var logo = document.getElementById('flag-logo-' + face);
    var img = logo && logo.querySelector('img');
    var filled = !!(logo && logo.style.display !== 'none' &&
                    img && img.getAttribute('src'));
    wrap.classList.toggle('filled', filled);
  });
}
window.updateFlagZoneGuides = updateFlagZoneGuides;
