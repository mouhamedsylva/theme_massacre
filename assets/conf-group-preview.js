/**
 * Aperçu d'une ligne de la commande de groupe (modale « plusieurs surnoms »).
 *
 * Le bouton qui appelait grpPreviewRow est actuellement COMMENTÉ dans le
 * tableau (voir grpAddRow) : le code est conservé pour pouvoir le réactiver,
 * mais aucun chemin ne l'atteint aujourd'hui.
 *
 * Déporté ici : configurateur.liquid atteint la limite Shopify de 256 Ko.
 * Les accès aux données du template (currentProductKey, COLOR_SLUGS,
 * PRODUCT_SLUGS…) passent par window et sont déjà protégés par grpSafe(),
 * qui renvoie une valeur de repli si la variable manque.
 */
(function () {
  'use strict';

  /* Échappement HTML — délègue à window.grpEsc (conf-main-inline.js) avec un
     repli identique, ce fichier pouvant être chargé seul.

     Le bouton qui appelle grpPreviewRow est commenté aujourd'hui, mais
     `colorName` vient du tableau de groupe (donc d'une saisie ou d'un CSV
     importé) : la sécurité doit être en place AVANT une éventuelle
     réactivation, pas après. */
  function esc(s) {
    if (typeof window.grpEsc === 'function') return window.grpEsc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* URL d'image sûre — même rôle que window.safeImgSrc, avec repli local.
     `getAttribute('src')` relit la valeur BRUTE posée par applyUpload, qui peut
     venir d'un design partagé. */
  function safeSrc(u) {
    if (typeof window.safeImgSrc === 'function') return window.safeImgSrc(u);
    var s = String(u == null ? '' : u).trim();
    var ok = /^data:image\//i.test(s) || /^https?:\/\//i.test(s) ||
             /^\/[^\/]/.test(s) ||
             /^[\w.\-]+\.(png|jpe?g|webp|svg|gif)(\?.*)?$/i.test(s);
    return ok ? esc(s) : '';
  }

  function grpPreviewRow(btn) {
    var tr = btn.closest('tr');
    if (!tr) return;
    var colorName = window.grpVal(tr, 'grp-f-color');
    var size = window.grpVal(tr, 'grp-f-size');
    var flock = String(window.grpVal(tr, 'grp-f-flock')).trim();
    var name = flock;   // le nom floqué identifie la ligne (plus de colonne nom)
  
    // Ces variables sont déclarées plus bas dans le script (let/const) : on y
    // accède via try/catch, sinon la « temporal dead zone » lève une
    // ReferenceError qui interromprait tout l'aperçu.
    function grpSafe(fn, fallback) {
      try { var v = fn(); return (v === undefined || v === null) ? fallback : v; }
      catch (e) { return fallback; }
    }
  
    var key  = grpSafe(function () { return window.currentProductKey; }, '') ||
               grpSafe(function () { return window.currentProductType; }, 'sweatshirt');
    var slug = grpSafe(function () { return window.COLOR_SLUGS_MAP[colorName]; }, '') ||
               grpSafe(function () { return window.COLOR_SLUGS[colorName]; }, '');
    var prefix = grpSafe(function () { return window.PRODUCT_SLUGS[key]; }, '');
  
    // Image de face à la bonne couleur (mêmes candidats que le configurateur).
    var candidates = grpSafe(function () {
      return colorImageCandidates(prefix, slug, 'face');
    }, []) || [];
  
    // Repli : l'image de face actuellement affichée dans le configurateur.
    // Sa couleur est celle sélectionnée à l'écran, pas celle de la ligne, mais
    // cela vaut mieux qu'un aperçu vide.
    var baseUrl = candidates[0] || '';
    var fallbackUsed = false;
    if (!baseUrl) {
      var liveImg = document.getElementById('view-face');
      if (liveImg && liveImg.src) { baseUrl = liveImg.src; fallbackUsed = true; }
    }
  
    var stage = document.getElementById('grp-preview-stage');
    var title = document.getElementById('grp-preview-title');
    if (title) {
      title.textContent = 'Aperçu — ' + (name ? name + ' · ' : '') +
                          colorName + ' · ' + size + (flock ? ' · « ' + flock + ' »' : '');
    }
  
    // Logo cœur (design commun) : on réutilise sa position/taille du canvas.
    var logoEl = document.getElementById('logo-f');
    var logoImg = logoEl ? logoEl.querySelector('img') : null;
    var logoSrc = (logoImg && logoEl.style.display !== 'none') ? logoImg.getAttribute('src') : '';
    var lLeft = logoEl ? (parseFloat(logoEl.style.left) || 38) : 38;
    var lTop  = logoEl ? (parseFloat(logoEl.style.top)  || 34) : 34;
    var lW    = logoEl ? (parseFloat(logoEl.style.width) || 18) : 18;
  
    var html = '';
    html += '<div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">';
    if (baseUrl) {
      html += '<img src="' + safeSrc(baseUrl) + '" alt="" style="max-width:100%;max-height:340px;object-fit:contain;">';
      // Overlay logo, calé en % (mêmes repères que le canvas face).
      if (logoSrc) {
        html += '<img src="' + safeSrc(logoSrc) + '" alt="" style="position:absolute;left:' + lLeft +
                '%;top:' + lTop + '%;width:' + lW + '%;object-fit:contain;pointer-events:none;">';
      }
    } else {
      html += '<div style="color:#999;font-size:12px;padding:24px;text-align:center;">' +
              'Image indisponible pour « ' + esc(colorName) +' ». Le rendu réel sera fourni au devis.</div>';
    }
    html += '</div>';
    if (fallbackUsed) {
      html += '<p style="margin:10px 0 0;font-size:11px;color:#b42318;text-align:center;">' +
              'Visuel générique : la teinte « ' + esc(colorName) + ' » n\'a pas d\'image dédiée.</p>';
    }
    if (stage) stage.innerHTML = html;
  
    var ov = document.getElementById('grp-preview-overlay');
    if (ov) ov.classList.add('open');
  }
  function closeGroupPreview() {
    var ov = document.getElementById('grp-preview-overlay');
    if (ov) ov.classList.remove('open');
  }

  window.grpPreviewRow = grpPreviewRow;
  window.closeGroupPreview = closeGroupPreview;
})();
