/**
 * Patchs / Coins métalliques - Layout et fonctions spécifiques
 * Interface "CUSTOM COINS" : pièce métallique avec 3 vues (recto / verso / côté)
 */

/* ── Ancienne sidebar « Patchs » : GABARIT SUPPRIMÉ (2026-08-05) ──────────
   Un littéral HTML de 196 lignes (~9 Ko) était embarqué chez chaque client
   sans jamais être injecté : il était marqué « OBSOLÈTE, conservé pour
   référence » depuis le passage au sidebar moderne.

   Ces réglages vivent maintenant dans le panneau « Options Coin »
   (snippets/sidebar-modern.liquid) et les zones d'upload dans #upload-view-coin.
   loadPatchesSidebar() (conf-dynamic-layout.js) vide simplement le conteneur.

   NE PAS le réintroduire : il redéclarerait les IDs du panneau statique
   (#coin-num-qty-input, #coin-remove-recto, #uc-recto…) dans une sidebar
   masquée, et getElementById résoudrait alors sur cette copie invisible.
   L'historique Git en conserve le contenu si besoin. */

// ========================================
// Fonctions d'interaction
// ========================================

// Type de personnalisation
function selectCoinType(el) {
  document.querySelectorAll('.coin-type-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  const type = el.getAttribute('data-type');
  window.__coinType = type;

  // Numérotation visible uniquement pour "recto verso numéroté"
  const numSec = document.getElementById('coin-numbering-sec');
  if (numSec) numSec.style.display = (type === 'recto-verso-num') ? 'block' : 'none';

  // Logo verso visible sauf en "recto simple".
  const simple = (type === 'recto-simple');

  // Ancienne sidebar (zone complète avec son libellé).
  const versoUpload = document.getElementById('coin-upload-verso');
  if (versoUpload) versoUpload.style.display = simple ? 'none' : 'flex';

  /* Sidebar moderne : la vue d'upload n'a qu'une rangée de deux boutons.
     On masque celui du verso, son libellé, et son bouton « Supprimer » ;
     la classe single-face fait passer la rangée sur une seule colonne. */
  const versoBtn = document.getElementById('coin-upload-btn-verso');
  if (versoBtn) versoBtn.style.display = simple ? 'none' : '';
  const versoLbl = document.getElementById('coin-upload-label-verso');
  if (versoLbl) versoLbl.style.display = simple ? 'none' : '';
  const coinView = document.getElementById('upload-view-coin');
  if (coinView) coinView.classList.toggle('single-face', simple);

  // En recto simple, un verso déjà chargé n'a plus lieu d'être : son aperçu
  // disparaît avec la zone d'upload correspondante.
  if (simple) {
    const versoPreview = document.getElementById('coin-preview-verso');
    if (versoPreview) versoPreview.style.display = 'none';
  }

  // Vue verso/côté dans le canvas selon le type
  const versoView = document.querySelector('.coin-view[data-view="verso"]');
  if (versoView) versoView.style.display = (type === 'recto-simple') ? 'none' : 'flex';

  // Numéro sur le verso : visible uniquement en "recto verso numéroté"
  updateCoinNumber();

  // Récap
  const recapType = document.getElementById('coin-recap-type');
  if (recapType) {
    const labels = {
      'recto-verso': 'Recto verso',
      'recto-simple': 'Recto simple',
      'recto-verso-num': 'Recto verso numéroté'
    };
    recapType.textContent = labels[type] || 'Recto verso';
  }
}

// Affiche/masque et met à jour le numéro gravé sur le VERSO du coin.
function updateCoinNumber() {
  const numEl = document.getElementById('coin-verso-number');
  if (!numEl) return;
  const type = window.__coinType || 'recto-verso';
  const input = document.getElementById('coin-num-start');
  const val = input ? String(input.value || '').trim() : '';

  const on = (type === 'recto-verso-num' && !!val);
  if (on) {
    numEl.textContent = val;
    numEl.style.display = 'block';
  } else {
    numEl.style.display = 'none';
  }

  // Marque le disque verso : la zone du logo y est raccourcie pour laisser la
  // place au numéro (voir .coin-disc.has-number dans conf-patches.css), sinon
  // un design descendant bas le recouvrirait.
  const versoDisc = document.getElementById('coin-disc-verso');
  if (versoDisc) versoDisc.classList.toggle('has-number', on);
  // Recontraint le logo verso à la nouvelle zone.
  if (typeof window.clampCoinLogo === 'function') window.clampCoinLogo('verso');
}

// Met à jour le numéro en temps réel quand on modifie le champ "Numéro de départ".
document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'coin-num-start') updateCoinNumber();
});

// Forme
/* L'image a-t-elle un fond transparent ?
   On échantillonne les 4 coins et les milieux de bords : un visuel détouré y
   est transparent. Suffisant et instantané — inutile de parcourir tous les
   pixels pour répondre à « le fond est-il opaque ? ». */
function hasAlphaBackground(src) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        var n = 40;                       // miniature : l'échantillon suffit
        c.width = n; c.height = n;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, n, n);
        var pts = [[0,0],[n-1,0],[0,n-1],[n-1,n-1],
                   [(n>>1),0],[(n>>1),n-1],[0,(n>>1)],[n-1,(n>>1)]];
        var transparent = 0;
        pts.forEach(function (p) {
          if (ctx.getImageData(p[0], p[1], 1, 1).data[3] < 24) transparent++;
        });
        // Majorité des bords transparents -> l'image est détourée.
        resolve(transparent >= 5);
      } catch (e) {
        // Canvas « tainted » (image cross-origin sans CORS) : on n'insiste pas.
        resolve(true);
      }
    };
    img.onerror = function () { resolve(true); };
    img.src = src;
  });
}

/* Passe la pièce en mode « découpé à la forme » : le disque s'efface et le
   visuel détouré devient la pièce. Si le fond n'est pas transparent, propose
   le détourage automatique (outil déjà présent : conf-bgremoval2.js). */
async function applyDecoupeShape() {
  /* Produit propriétaire, capturé AVANT les `await` (test d'alpha, puis modale
     de détourage). saveUpload() relit sinon `currentProductType` à l'appel : un
     changement de produit pendant le détourage rangeait l'image détourée sous
     le nouveau produit. Voir A3 dans AUDIT-PASSE-4.md. */
  var owner = window.currentProductType;

  var faces = ['recto', 'verso'];
  for (var i = 0; i < faces.length; i++) {
    var f = faces[i];
    var logo = document.getElementById('coin-logo-' + f);
    var img = logo && logo.querySelector('img');
    var src = img && img.getAttribute('src');
    if (!src || logo.style.display === 'none') continue;

    var ok = await hasAlphaBackground(src);
    if (ok) continue;

    // Fond opaque : sans détourage, la « découpe » serait un rectangle.
    if (window.ConfBgRemoval && typeof window.ConfBgRemoval.ask === 'function') {
      var cleaned = await window.ConfBgRemoval.ask(src);
      if (cleaned && cleaned !== src) {
        img.src = cleaned;
        if (typeof window.saveUpload === 'function') window.saveUpload('coin-' + f, cleaned, owner);
        if (f === 'recto') {
          var cote = document.getElementById('coin-cote-logo');
          if (cote) cote.src = cleaned;
        }
      }
    } else if (typeof confAlert === 'function') {
      confAlert(
        'Le design ' + f + ' a un fond opaque : la découpe suivra son rectangle. ' +
        'Utilisez un PNG ou SVG à fond transparent pour un détourage net.',
        { icon: 'info', title: 'Fond non transparent' }
      );
    }
  }
}
window.applyDecoupeShape = applyDecoupeShape;

function selectCoinShape(el) {
  document.querySelectorAll('.coin-shape-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  const shape = el.getAttribute('data-shape');
  const isDecoupe = (shape === 'decoupe');
  document.querySelectorAll('.coin-disc').forEach(d => {
    d.classList.toggle('shape-decoupe', isDecoupe);
  });
  // Marque la scène : la vue de côté (tranche d'un disque rond) est masquée
  // en mode découpé — voir .coin-stage.shape-decoupe dans conf-patches.css.
  document.querySelectorAll('.coin-stage').forEach(s => {
    s.classList.toggle('shape-decoupe', isDecoupe);
  });

  // En mode découpé, le visuel EST la pièce : il doit l'occuper entièrement.
  if (isDecoupe && typeof window.clampCoinLogo === 'function') {
    window.clampCoinLogo(null, true);
  }
  if (isDecoupe) applyDecoupeShape();

  const recapShape = document.getElementById('coin-recap-shape');
  if (recapShape) recapShape.textContent = isDecoupe ? 'Découpé à la forme' : 'Rond';
}

/* Taille — gère COINS (.coin-size-card, mm) ET PATCHS (.coins-size-card, cm).

   IMPLÉMENTATION UNIQUE. Trois versions de cette fonction coexistaient au
   niveau racine (ici, conf-dynamic-layout.js et conf-main-inline.js). En script
   classique, chaque `function` racine devient une propriété de window et écrase
   la précédente : `onclick="selectCoinSize(this)"` exécutait donc la version de
   conf-main-inline.js (chargé en dernier) tandis que
   `window.selectCoinSize(...)` — appelé par conf-sidebar-modern.js pour
   resynchroniser le panneau — exécutait celle-ci. Deux comportements
   différents selon le chemin d'appel, notamment sur l'échelle du coin.
   Les deux autres définitions ont été supprimées ; celle-ci reprend ce
   qu'elles faisaient de plus (libellé du récap, ids alternatifs). */
function selectCoinSize(el) {
  if (!el) return;
  // Retire l'active des DEUX familles de cartes.
  document.querySelectorAll('.coin-size-card, .coins-size-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  /* Libellé : <p> si présent (cartes cm), sinon le texte du bouton (cartes mm).
     Repli sur data-size si la carte n'a aucun texte. */
  var pEl = el.querySelector('p');
  var label = ((pEl ? pEl.textContent : el.textContent) || '').trim();
  const size = el.getAttribute('data-size') || label;

  /* ── L'APERÇU NE CHANGE PLUS DE TAILLE (2026-08-08) ──────────────────────

     Avant, choisir une taille redimensionnait l'aperçu : `transform: scale()`
     pour les coins (0,72 à 1,25) et une classe `size-*cm` pour les patchs
     (240 à 400 px). Le visuel sautait à chaque clic, sans rien apporter — un
     coin de 25 mm et un de 50 mm se ressemblent à l'écran, seule la mention
     chiffrée informe vraiment.

     La taille reste une INFORMATION, transmise de deux façons :
       - affichée dans le récapitulatif (`#coin-recap-size` / `#coins-recap-size`) ;
       - envoyée avec la commande, car `addCustomToCart` collecte
         `.rp-patch-details p` (conf-main-inline.js:2202) — le paragraphe
         « Taille : 30 mm » en fait partie.

     Rien d'autre à ajouter donc : la donnée circulait déjà. */

  // PATCH : taille en cm (ex. "6cm", "8x6cm").
  if (/cm$/.test(size)) {
    var recapPatch = document.getElementById('coins-recap-size');
    if (recapPatch) recapPatch.textContent = label || size.replace('cm', ' cm');

    /* La classe de taille est FIGÉE sur une référence, pas retirée.

       Sans aucune classe `size-*`, `.coins-canvas-circle` retombe sur son
       `max-width: 520px` (conf-coins.css:233) — l'aperçu deviendrait plus grand
       que toutes les tailles proposées. On garde donc une classe, toujours la
       même : `size-8cm` (320 px), la valeur médiane des cinq.

       Les formats RECTANGULAIRES gardent la leur : leur classe ne porte pas
       seulement une taille mais aussi un `max-width` distinct (420 px contre
       320), sans lequel la forme déborderait en largeur. Le rapport
       largeur/hauteur doit rester juste. */
    var canvas = document.getElementById('coins-canvas');
    if (canvas) {
      canvas.classList.remove('size-6cm','size-7cm','size-8cm','size-9cm','size-10cm','size-8x6cm','size-10x7-5cm');
      var rectangulaire = /x/.test(size);
      canvas.classList.add(rectangulaire ? 'size-' + size.replace(/\./g, '-') : 'size-8cm');
    }
    return;
  }

  // COIN : taille en mm.
  const mm = parseInt(String(size).replace('mm', ''), 10) || 30;
  /* Les deux ids coexistent selon le layout monté (#coin-recap-size sur
     l'écran Coins, #coins-recap-size sur celui des patchs). */
  const recapSize = document.getElementById('coin-recap-size')
                 || document.getElementById('coins-recap-size');
  if (recapSize) recapSize.textContent = mm + ' mm';

  /* Échelle NEUTRE : le disque garde sa taille de référence quel que soit le
     diamètre choisi. On appelle quand même la fonction plutôt que de ne rien
     faire — elle remet `scale(1)`, ce qui efface une échelle laissée par un
     ancien état (design partagé, retour de session). */
  applyCoinDiameterScale();
}
/* (l'export window.selectCoinSize se trouve plus bas, avec les autres) */

/* Remet l'aperçu du coin à sa taille de RÉFÉRENCE.

   Cette fonction appliquait une échelle proportionnelle au diamètre choisi
   (`mm / 38`, bornée de 0,72 à 1,25). Retiré le 2026-08-08 : le visuel sautait
   à chaque clic sur une taille, sans rien apprendre au client — un coin de
   25 mm et un de 50 mm se ressemblent à l'écran. Seule la mention chiffrée
   informe, et elle figure déjà dans le récapitulatif comme dans les détails
   envoyés avec la commande.

   Pourquoi ne pas simplement supprimer l'appel : un `transform` posé lors d'une
   session précédente (design partagé par lien, retour de navigation) resterait
   en place et l'aperçu s'afficherait à la mauvaise échelle, sans plus rien pour
   le corriger. Cette fonction remet donc explicitement `scale(1)`.

   Le paramètre `mm` est accepté mais ignoré : les appelants existants le
   passent, et le retirer de la signature obligerait à les modifier tous pour
   aucun gain. */
function applyCoinDiameterScale() {
  var sel = '.coin-disc, .coin-edge, #coins-canvas, .coins-canvas-circle';
  document.querySelectorAll(sel).forEach(function (elm) {
    elm.style.transform = 'scale(1)';
    elm.style.transformOrigin = 'center center';
    /* Pas de `transition` : il n'y a plus de changement à animer, et la laisser
       ferait glisser l'aperçu au premier rendu. */
    elm.style.removeProperty('transition');
  });
}

// Mapping finition → slug d'image
const FINISH_IMAGE_SLUGS = {
  'or':     'or',
  'argent': 'argent',
  'nickel': 'nickel',
  'bronze': 'bronze',
  'cuivre': 'cuivre'
};

// Finition métallique
function selectCoinFinish(el) {
  document.querySelectorAll('.coin-finish-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  const finish = el.getAttribute('data-finish');

  const labels = {
    'or': 'Or brillant', 'argent': 'Argent brillant', 'nickel': 'Nickel noir',
    'bronze': 'Bronze antique', 'cuivre': 'Cuivre antique'
  };

  // Swap des images pour les 3 vues
  ['recto', 'verso', 'cote'].forEach(view => {
    const imgEl = document.getElementById('coin-base-' + view);
    if (!imgEl) return;

    const key = 'patch-' + view + '-' + finish;
    const url = window.COIN_IMAGE_URLS?.[key];

    if (url) {
      imgEl.src = url;
    } else {
      console.warn('Image introuvable pour la clé :', key);
    }
  });

  // Mise à jour du récap
  const recapFinish = document.getElementById('coin-recap-finish');
  if (recapFinish) recapFinish.textContent = labels[finish] || finish;

  // Persiste la finition : restaurée au reload.
  try { sessionStorage.setItem('conf_coin_finish', finish); } catch (e) {}

  // Vignette du récap (disque + logo) : la finition change l'image du disque.
  if (typeof window.updateCoinRecapThumb === 'function') window.updateCoinRecapThumb();
}

// Surface
function selectCoinSurface(el) {
  document.querySelectorAll('.coin-surface-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

// Quantité (numérotation)
/* Borne une quantite dans [min, QTY_MAX]. Sans plafond, une saisie de
   999999999 partait au panier et le backend repondait 400 au checkout.
   `window.clampQty` vient de conf-pricing-tiers.js (charge en synchrone) ;
   le repli garde le comportement d'avant le correctif si le fichier manque. */
function clampQtyPatch(valeur, min) {
  if (typeof window.clampQty === 'function') return window.clampQty(valeur, min);
  var n = parseInt(valeur, 10);
  return isFinite(n) && n >= min ? n : min;
}

function changeCoinQty(delta) {
  const input = document.getElementById('coin-num-qty-input');
  if (!input) return;
  const qty = clampQtyPatch((parseInt(input.value, 10) || 50) + delta, 50);
  input.value = qty;
  syncCoinRecapQty(qty);
}

function handleCoinQtyInput() {
  const input = document.getElementById('coin-num-qty-input');
  if (!input) return;
  const qty = clampQtyPatch(input.value, 50);
  /* Toujours reecrire : le champ doit refleter la valeur retenue. */
  if (String(input.value) !== String(qty)) input.value = qty;
  syncCoinRecapQty(qty);
}

// Synchronise la quantité avec le récap à droite
function syncCoinRecapQty(qty) {
  const recapQty = document.getElementById('coin-recap-qty-input');
  if (recapQty) recapQty.value = qty;
}

/* Synchronisation TEMPS RÉEL des deux champs quantité (numérotation <-> récap).
   Écouteur délégué (survit au rechargement dynamique de la sidebar/récap) : dès
   qu'on tape dans l'un, l'autre se met à jour immédiatement. */
document.addEventListener('input', function (e) {
  if (!e.target) return;
  var id = e.target.id;
  if (id !== 'coin-num-qty-input' && id !== 'coin-recap-qty-input') return;

  var val = parseInt(e.target.value, 10);
  if (isNaN(val)) return;               // laisse l'utilisateur effacer avant de retaper
  val = clampQtyPatch(val, 50);
  /* Le champ SAISI est corrige lui aussi : sans cela il affiche 999999999
     tandis que les deux autres montrent le plafond. */
  if (String(e.target.value) !== String(val)) e.target.value = val;

  var side = document.getElementById('coin-num-qty-input');
  var recap = document.getElementById('coin-recap-qty-input');
  if (side && side !== e.target) side.value = val;
  if (recap && recap !== e.target) recap.value = val;
});

// Quantité côté récap
function changeCoinRecapQty(delta) {
  const input = document.getElementById('coin-recap-qty-input');
  if (!input) return;
  const qty = clampQtyPatch((parseInt(input.value, 10) || 50) + delta, 50);
  input.value = qty;
  const sideQty = document.getElementById('coin-num-qty-input');
  if (sideQty) sideQty.value = qty;
}

function handleCoinRecapQtyInput() {
  const input = document.getElementById('coin-recap-qty-input');
  if (!input) return;
  const qty = clampQtyPatch(input.value, 50);
  if (String(input.value) !== String(qty)) input.value = qty;
  const sideQty = document.getElementById('coin-num-qty-input');
  if (sideQty) sideQty.value = qty;
}

// Changement de vue 3D / 2D
function switchCoinView(view) {
  document.querySelectorAll('.coin-view-btn').forEach(b => b.classList.remove('active'));
  if (typeof event !== 'undefined' && event.target) event.target.classList.add('active');

  const stage = document.getElementById('coin-stage');
  if (stage) stage.classList.toggle('view-2d', view === '2d');
}


// ← AJOUT : initialise les images du canvas avec les neutres au chargement
function initCoinBaseImages() {
  const neutrals = {
    'recto': window.ASSET_URLS?.patchRecto,
    'verso': window.ASSET_URLS?.patchVerso,
    'cote':  window.ASSET_URLS?.patchCote
  };
  ['recto', 'verso', 'cote'].forEach(view => {
    const imgEl = document.getElementById('coin-base-' + view);
    if (imgEl && neutrals[view]) imgEl.src = neutrals[view];
  });
}

document.addEventListener('DOMContentLoaded', initCoinBaseImages);

/* Exposition explicite sur window.
   Ces fonctions sont appelées depuis conf-sidebar-modern.js (panneau
   « Options Coin ») pour réappliquer les réglages après reconstruction du
   canvas. Les attributs onclick du HTML les résolvent déjà via la portée
   globale ; l'assignation ci-dessous rend l'accès window.* fiable. */
window.selectCoinType = selectCoinType;
window.selectCoinShape = selectCoinShape;
window.selectCoinSize = selectCoinSize;
window.selectCoinFinish = selectCoinFinish;
window.selectCoinSurface = selectCoinSurface;
window.updateCoinNumber = updateCoinNumber;

// Supprime le logo uploadé d'une face du coin (recto / verso)
function removeCoinLogo(face) {
  // Retirer de la persistance
  if (typeof removeUpload === 'function') removeUpload('coin-' + face);

  // Cacher le logo déplaçable sur la pièce
  const logo = document.getElementById('coin-logo-' + face);
  if (logo) {
    const limg = logo.querySelector('img');
    if (limg) limg.src = '';
    logo.style.display = 'none';
    // réinitialiser position/taille par défaut
    logo.style.left = '28%';
    logo.style.top = '28%';
    logo.style.width = '44%';
  }

  // Si recto : retirer aussi le logo de la vue de côté
  if (face === 'recto') {
    const coteLogo = document.getElementById('coin-cote-logo');
    if (coteLogo) { coteLogo.src = ''; coteLogo.style.display = 'none'; }
  }

  // Réinitialiser l'input fichier + masquer l'aperçu du panneau Upload
  const input = document.getElementById('uc-' + face);
  if (input) input.value = '';
  if (typeof window.hideUpPreview === 'function') {
    window.hideUpPreview('coin-preview-' + face, 'coin-preview-img-' + face);
  }

  // Face redevenue vide : son repère de zone réapparaît.
  if (typeof window.updateCoinZoneGuides === 'function') {
    window.updateCoinZoneGuides();
  }

  // Réinitialiser la miniature du récap
  const neutralThumb = `
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#9a9ea3" stroke-width="1.2">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>`;
  const thumbFace = document.getElementById('coin-recap-thumb-' + face);
  if (thumbFace) thumbFace.innerHTML = neutralThumb;
  if (face === 'recto') {
    const thumbMain = document.getElementById('coin-recap-thumb-main');
    if (thumbMain) thumbMain.innerHTML = neutralThumb;
  }
}
/* Exposée : appelée par conf-coin-toolbar.js (bouton « Supprimer » de la barre
   d'outils) et par les onclick du panneau Upload. */
window.removeCoinLogo = removeCoinLogo;

/* ══════════════════════════════════════════════════════════════════
   Repères de zone imprimable (coins)
   Même règle que les textiles : le pointillé reste visible tant que la
   face est vide, s'efface dès qu'un design l'occupe, et réapparaît le
   temps d'un déplacement (voir .coin-safe-zone dans conf-patches.css).
   ══════════════════════════════════════════════════════════════════ */
function updateCoinZoneGuides() {
  ['recto', 'verso'].forEach(function (face) {
    var disc = document.getElementById('coin-disc-' + face);
    if (!disc) return;
    var logo = document.getElementById('coin-logo-' + face);
    var img = logo && logo.querySelector('img');
    var filled = !!(logo && logo.style.display !== 'none' &&
                    img && img.getAttribute('src'));
    disc.classList.toggle('filled', filled);
  });
}
window.updateCoinZoneGuides = updateCoinZoneGuides;

/* ══════════════════════════════════════════════════════════════════
   clampCoinLogo() — contraint un logo DANS la zone imprimable du coin.
   Déplacée depuis configurateur.liquid (limite Shopify de 256 Ko par
   template). Ne dépend que du DOM et de constantes déjà sur window
   (COIN_INSET, COIN_OFFSET_Y, COIN_NUMBER_RESERVE).

   fill=true : le visuel remplit la zone (upload / bouton « Ajuster »).
   fill=false : on borne seulement la position (fin de drag, restauration).
   ══════════════════════════════════════════════════════════════════ */
function clampCoinLogo(face, fill) {
  var faces = face ? [face] : ['recto', 'verso'];
  var inset = (window.COIN_INSET != null ? window.COIN_INSET : 1);
  /* Le disque n'occupe que ~79 % de l'image du coin (le reste est
     transparent). Un logo dimensionné en % de l'IMAGE paraît donc bien
     plus petit que le disque : on ramène la zone à l'emprise réelle. */
  var DISC = 79.4;
  faces.forEach(function (f) {
    var logo = document.getElementById('coin-logo-' + f);
    if (!logo || logo.style.display === 'none') return;
    var disc = logo.closest('.coin-disc');
    if (!disc || !disc.offsetWidth || !disc.offsetHeight) return;

    var offY = (window.COIN_OFFSET_Y != null ? window.COIN_OFFSET_Y : 3);
    var margin = (100 - DISC) / 2;          // bord transparent de l'image
    var lo = margin + (DISC * inset / 100);
    var hi = 100 - lo;
    var zone = hi - lo;
    // Bornes verticales décalées vers le bas (voir COIN_OFFSET_Y).
    var loY = lo + offY, hiY = hi + offY;
    // Verso numéroté : on réserve le bas de la pièce au numéro, sinon un
    // design descendant bas le recouvrirait.
    if (disc.classList.contains('has-number')) {
      // window.* : la constante est déclarée dans l'IIFE de
      // conf-logo-drag.js ; y accéder directement levait une ReferenceError
      // qui interrompait tout le remplissage.
      var reserve = (window.COIN_NUMBER_RESERVE != null ? window.COIN_NUMBER_RESERVE : 22);
      hiY = Math.min(hiY, 100 - reserve);
    }

    var w = parseFloat(logo.style.width) || 44;
    if (fill) {
      // Occupe toute la largeur de la zone ; la hauteur suit le ratio et
      // sera réduite juste après si l'image est plus haute que large.
      w = zone;
    }
    w = Math.min(w, zone);
    logo.style.width = w + '%';

    // Hauteur réelle après application de la largeur (ratio de l'image).
    var h = (logo.offsetHeight / disc.offsetHeight) * 100;
    if (h > zone && h > 0) {
      // Image plus haute que large : c'est la HAUTEUR qui borne (contain).
      w = w * (zone / h);
      logo.style.width = w + '%';
      h = (logo.offsetHeight / disc.offsetHeight) * 100;
    }

    // La vue de côté reprend l'échelle du logo recto : sans cette synchro,
    // la tranche resterait à la taille du visuel précédent.
    if (f === 'recto' && typeof window.syncCoinCote === 'function') {
      window.syncCoinCote(logo);
    }

    if (fill) {
      // Centré dans la zone.
      logo.style.left = (lo + (zone - w) / 2) + '%';
      logo.style.top = (loY + (zone - h) / 2) + '%';
      return;
    }

    var l = parseFloat(logo.style.left);
    var t = parseFloat(logo.style.top);
    if (isNaN(l)) l = lo;
    if (isNaN(t)) t = loY;
    logo.style.left = Math.max(lo, Math.min(hi - w, l)) + '%';
    logo.style.top = Math.max(loY, Math.min(hiY - h, t)) + '%';
  });
}
window.clampCoinLogo = clampCoinLogo;
