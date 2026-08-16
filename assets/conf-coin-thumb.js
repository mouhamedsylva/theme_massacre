/**
 * Miniature du récapitulatif pour les COINS (vue recto).
 *
 * Elle doit montrer EXACTEMENT ce que le canevas affiche : disque métallique
 * + motif, ce dernier rogné au disque quand il est en couverture. Une
 * miniature qui diverge du canevas fait douter le client de ce qu'il commande.
 *
 * Déporté du template : configurateur.liquid atteint la limite Shopify
 * de 256 Ko. Dépend de window.COIN_INSET / COIN_OFFSET_Y (conf-logo-drag.js).
 */
(function () {
  'use strict';

  /* URL d'image sûre pour une concaténation en innerHTML.

     `getAttribute('src')` relit l'attribut de contenu BRUT, guillemets
     compris : applyUpload() y écrit la valeur telle quelle (`limg.src = src`),
     et cette valeur peut provenir d'un design partagé (?design=) ou de
     conf_uploads en session — donc hors de notre contrôle. Concaténée plus
     bas, une valeur du genre `/a.png" onerror="…` s'échappait de l'attribut.
     (Le getter `.src` aurait encodé le guillemet ; getAttribute non.)

     Délègue à window.safeImgSrc (conf-main-inline.js) et embarque un repli
     identique : ce fichier est une IIFE distincte, chargée séparément, et
     doit rester sûr même si l'autre n'a pas encore été évalué. */
  function safeSrc(u) {
    if (typeof window.safeImgSrc === 'function') return window.safeImgSrc(u);
    var s = String(u == null ? '' : u).trim();
    /* `//domaine/…` (protocole-relatif) : forme produite par `asset_url`. Le
       fond de coin vient d'un `getAttribute('src')`, il garde donc cette forme
       brute — sans ce motif, la vignette restait muette (le code sort
       silencieusement quand l'URL est vide). À GARDER SYNCHRONISÉ avec
       safeImgSrc (conf-main-inline.js:141-146). */
    var ok = /^data:image\//i.test(s) ||
             /^https?:\/\//i.test(s) ||
             /^\/\/[^\/]/.test(s) ||
             /^\/[^\/]/.test(s) ||
             /^[\w.\-]+\.(png|jpe?g|webp|svg|gif)(\?.*)?$/i.test(s);
    return ok ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                 .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                 .replace(/'/g, '&#39;') : '';
  }

  function updateCoinRecapThumb() {
    var thumb = document.getElementById('coin-recap-thumb-main');
    if (!thumb) return;

    var baseImg = document.getElementById('coin-base-recto');
    var bgSrc = baseImg ? safeSrc(baseImg.getAttribute('src')) : '';
    if (!bgSrc) return;

    var logoEl = document.getElementById('coin-logo-recto');
    var logoImg = logoEl ? logoEl.querySelector('img') : null;
    var logoSrc = (logoImg && logoEl.style.display !== 'none')
      ? safeSrc(logoImg.getAttribute('src')) : '';
    var left = logoEl ? (parseFloat(logoEl.style.left) || 28) : 28;
    var top  = logoEl ? (parseFloat(logoEl.style.top)  || 28) : 28;
    var width = logoEl ? (parseFloat(logoEl.style.width) || 44) : 44;
  
    /* Le logo est positionné en % de l'IMAGE du coin, or le disque n'y
       occupe que ~79 % (le reste est transparent). Sur la petite vignette,
       cet écart se voit : le design paraît flotter dans un anneau vide.
       On agrandit donc l'ensemble (image + logo) du même facteur, pour que
       le DISQUE remplisse la vignette comme il remplit le canevas. */
    var DISC_FILL = 100 / 79.4;   // emprise du disque dans l'image (mesurée)
    var html = '<div style="position:relative;width:100%;aspect-ratio:1;margin:auto;' +
      'overflow:hidden;"><div style="position:absolute;inset:0;' +
      'transform:scale(' + DISC_FILL.toFixed(3) + ');">' +
      '<img src="' + bgSrc + '" alt="Coin" style="position:absolute;inset:0;' +
      'width:100%;height:100%;object-fit:contain;display:block;">';
    if (logoSrc) {
      /* Motif en COUVERTURE : ses % sont relatifs à .coin-crop (la zone
         frappée), pas à l'image entière, et il déborde — le disque le rogne.
         La vignette rejoue donc cette structure : cadre rond aux mêmes
         marges, image en `cover` dedans. Sans cela elle montrait le visuel
         entier, non rogné, et ne correspondait plus au canevas. */
      var cover = logoEl && logoEl.classList.contains('is-cover');
      if (cover) {
        var ins = (window.COIN_INSET != null ? window.COIN_INSET : 1);
        var offY = (window.COIN_OFFSET_Y != null ? window.COIN_OFFSET_Y : 1.5);
        html += '<div style="position:absolute;left:' + ins + '%;top:' + (ins + offY) +
                '%;width:' + (100 - 2 * ins) + '%;height:' + (100 - 2 * ins) +
                '%;overflow:hidden;border-radius:50%;z-index:2;">' +
                '<img src="' + logoSrc + '" alt="" style="position:absolute;left:' + left +
                '%;top:' + top + '%;width:' + width + '%;height:' + width +
                '%;object-fit:cover;display:block;"></div>';
      } else {
        html += '<img src="' + logoSrc + '" alt="" style="position:absolute;left:' + left + '%;top:' + top +
                '%;width:' + width + '%;height:auto;object-fit:contain;pointer-events:none;z-index:2;">';
      }
    }
    html += '</div></div>';
    thumb.innerHTML = html;
    thumb.style.overflow = 'hidden';
    thumb.style.display = 'flex';
    thumb.style.alignItems = 'center';
  }

  window.updateCoinRecapThumb = updateCoinRecapThumb;

  /**
   * Aplatit le motif d'une face en une image DÉJÀ ROGNÉE au disque.
   *
   * Le motif en couverture déborde de la zone frappée, et le rognage n'existe
   * qu'en CSS. Envoyé tel quel au backend, il serait recomposé en entier —
   * d'où une vignette de panier qui déborde alors que le canevas est net.
   *
   * Synchrone : les images sont déjà décodées à l'écran, donc directement
   * dessinables. captureCoinDesign() reste ainsi synchrone, et ses appelants
   * n'ont pas à changer.
   *
   * @returns {string} dataURL du motif rogné, ou '' si non applicable.
   */
  function coinCoverDataUrl(face) {
    var disc = document.getElementById('coin-disc-' + face);
    var logo = document.getElementById('coin-logo-' + face);
    if (!disc || !logo || !logo.classList.contains('is-cover')) return '';
    var img = logo.querySelector('img');
    if (!img || !img.naturalWidth) return '';

    var crop = logo.closest('.coin-crop');
    if (!crop) return '';

    try {
      // Résolution confortable : la vignette peut être agrandie côté serveur.
      var S = 800;
      var c = document.createElement('canvas');
      c.width = S; c.height = S;
      var ctx = c.getContext('2d');

      // Disque de rognage, plein cadre.
      ctx.save();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      ctx.clip();

      /* Boîte du motif rapportée au cadre de rognage : les deux sont mesurés
         à l'écran, donc directement comparables. */
      var cb = crop.getBoundingClientRect();
      var lb = logo.getBoundingClientRect();
      if (!cb.width || !cb.height) { ctx.restore(); return ''; }

      var dx = (lb.left - cb.left) / cb.width * S;
      var dy = (lb.top - cb.top) / cb.height * S;
      var dw = lb.width / cb.width * S;
      var dh = lb.height / cb.height * S;

      // « cover » dans cette boîte, comme le CSS.
      var sc = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      var iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
      ctx.drawImage(img, dx + (dw - iw) / 2, dy + (dh - ih) / 2, iw, ih);
      ctx.restore();

      return c.toDataURL('image/png');
    } catch (e) {
      // Canvas taint (CORS) : on laisse l'appelant retomber sur l'image brute.
      return '';
    }
  }
  window.coinCoverDataUrl = coinCoverDataUrl;
})();
