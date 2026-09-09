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

    /* MODE « DÉCOUPÉ À LA FORME » : la pièce EST le visuel.

       Le disque métallique s'efface (`opacity: 0`, conf-patches.css:498) et le
       motif détouré devient la pièce elle-même. La vignette montrait pourtant
       les deux — le disque au fond, l'image carrée posée dessus — soit
       exactement ce que le canevas ne montre pas.

       Le rognage rond n'a pas lieu d'être non plus : il n'y a plus de disque
       auquel rogner. */
    var disc = document.getElementById('coin-disc-recto');
    var decoupe = !!(disc && disc.classList.contains('shape-decoupe'));

    var logoEl = document.getElementById('coin-logo-recto');
    var logoImg = logoEl ? logoEl.querySelector('img') : null;
    var logoSrc = (logoImg && logoEl.style.display !== 'none')
      ? safeSrc(logoImg.getAttribute('src')) : '';
    /* ═══ UNE POSITION À ZÉRO EST UNE POSITION VALIDE ════════════════════

       Ces trois valeurs se lisaient `parseFloat(...) || 28`. Or **zéro est
       falsy** : un motif à `left: 0%` recevait donc le repli 28, et se
       retrouvait posé à 28 % / 28 % dans une boîte ronde de 78 %. Il en sortait
       par le bas et par la droite, et le rognage n'en laissait qu'un carré au
       centre du disque — le défaut observé.

       Ce n'est pas un cas limite : `left: 0%, top: 0%, width: 100%` est
       exactement l'état d'un motif en COUVERTURE (conf-coin-cover.js:156-159),
       c'est-à-dire le cas le plus courant.

       Le repli doit couvrir la valeur ABSENTE, jamais la valeur nulle.
       `isFinite` fait cette distinction : `0` est un nombre, `NaN` — ce que
       rend `parseFloat('')` — n'en est pas un. */
    var pct = function (valeur, defaut) {
      var n = parseFloat(valeur);
      return isFinite(n) ? n : defaut;
    };

    var left  = logoEl ? pct(logoEl.style.left,  28) : 28;
    var top   = logoEl ? pct(logoEl.style.top,   28) : 28;
    var width = logoEl ? pct(logoEl.style.width, 44) : 44;
  
    /* Le logo est positionné en % de l'IMAGE du coin, or le disque n'y
       occupe que ~79 % (le reste est transparent). Sur la petite vignette,
       cet écart se voit : le design paraît flotter dans un anneau vide.
       On agrandit donc l'ensemble (image + logo) du même facteur, pour que
       le DISQUE remplisse la vignette comme il remplit le canevas. */
    /* 80 : emprise du disque dans l'image, désormais EXACTE et non plus
       mesurée sur un visuel approximatif. Les PNG ont été recadrés pour que
       le disque occupe 80,0 % et soit centré à 50,00 % sur les deux axes
       (vérifié au pixel). La valeur précédente, 79,4, venait d'une mesure sur
       l'ancienne image et faisait dessiner la zone plus grande que la pièce. */
    var DISC_FILL = 100 / 80;     // emprise du disque dans l'image
    var html = '<div style="position:relative;width:100%;aspect-ratio:1;margin:auto;' +
      'overflow:hidden;"><div style="position:absolute;inset:0;' +
      'transform:scale(' + DISC_FILL.toFixed(3) + ');">' +
      /* Le disque s'efface en mode découpé, comme sur le canevas — il reste
         dans le balisage pour ne pas déstructurer le cadre, mais transparent. */
      '<img src="' + bgSrc + '" alt="Coin" style="position:absolute;inset:0;' +
      'width:100%;height:100%;object-fit:contain;display:block;' +
      (decoupe ? 'opacity:0;' : '') + '">';
    if (logoSrc) {
      /* ═══ LA VIGNETTE SUIT LA FORME DE LA PIÈCE ═══════════════════════

         Elle ne rognait qu'en mode COUVERTURE ; tout autre motif passait par
         une branche qui le posait NU — image carrée par-dessus le disque
         métallique, débordant de la pièce. Le canevas, lui, ne montre jamais
         cela : `.coin-crop` (conf-patches.css:592) rogne au cercle, et le mode
         découpé efface le disque.

         C'est précisément la vignette que le client regarde au moment
         d'ajouter au panier : elle ne peut pas contredire l'aperçu.

         Trois cas, et un seul de plus qu'avant :
           • DÉCOUPÉ    — pas de disque, pas de rognage : le visuel est la pièce
           • COUVERTURE — rogné au cercle, image étirée pour couvrir la frappe
           • LIBRE      — rogné au cercle, image à sa taille et à sa place */
      var cover = logoEl && logoEl.classList.contains('is-cover');

      if (decoupe) {
        /* DÉCOUPÉ : le visuel EST la pièce, sans cadre ni rognage. Il occupe
           toute la vignette, comme il occupe le canevas une fois le disque
           effacé. Ses % ne sont plus ceux d'une zone frappée — le cadre a été
           défait (conf-coin-cover.js:62-66) et le logo est revenu sur le
           disque. */
        html += '<img src="' + logoSrc + '" alt="" style="position:absolute;' +
                'inset:0;width:100%;height:100%;object-fit:contain;' +
                'pointer-events:none;z-index:2;">';
      } else {
        /* ═══ LE CADRE ÉPOUSE LA ZONE FRAPPÉE, PAS L'IMAGE ════════════════

           Il était posé depuis `COIN_INSET`, qui vaut 1 : le cercle de rognage
           faisait donc 98 % de l'IMAGE — soit environ 125 % du disque. Un
           cadre plus grand que la pièce ne rogne rien : le motif débordait de
           tous côtés et s'affichait carré par-dessus le coin.

           C'est exactement le défaut que `syncCoinCrop` (conf-coin-cover.js:91-96)
           a corrigé pour le CANVAS. La vignette, elle, était restée sur
           l'ancien calcul — d'où deux rendus qui se contredisaient.

           On reprend donc SA constante : 10,8 %, la marge réelle de la zone
           frappée. Le disque occupe 80 % de l'image et son centre tombe à
           50 % sur les deux axes ; la marge vaut (100 − 80) / 2 + 80 × 1/100.
           Si la zone bouge, ces deux fichiers doivent bouger ensemble. */
        var ZONE = 10.8;

        /* Hauteur : imposée en couverture (l'image doit remplir sa boîte),
           libre sinon — le motif garde ses proportions comme sur le canevas. */
        var hauteur = cover ? (width + '%') : 'auto';
        /* Un design RÉDUIT se contient, même en couverture : sous 100 % il n'a
           plus rien à déborder, et le rognage y découperait un carré. La
           vignette doit montrer ce que montre le canvas. */
        var reduitVig = logoEl && logoEl.classList.contains('is-reduced');
        var ajustement = (cover && !reduitVig) ? 'cover' : 'contain';

        html += '<div style="position:absolute;left:' + ZONE + '%;top:' + ZONE +
                '%;width:' + (100 - 2 * ZONE) + '%;height:' + (100 - 2 * ZONE) +
                '%;overflow:hidden;border-radius:50%;z-index:2;">' +
                '<img src="' + logoSrc + '" alt="" style="position:absolute;left:' + left +
                '%;top:' + top + '%;width:' + width + '%;height:' + hauteur +
                ';object-fit:' + ajustement + ';display:block;"></div>';
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

      /* MÊME AJUSTEMENT QUE LE CSS, y compris réduit.

         `Math.max` reproduit `object-fit: cover`. Mais sous 100 % l'écran passe
         en `contain` (`is-reduced`, conf-patches.css) : garder `cover` ici
         ferait diverger la planche et le panier de ce que le client voit —
         un carré découpé au lieu de son visuel entier.

         `Math.min` est exactement `contain`. Le centrage qui suit vaut pour
         les deux. */
      var reduit = logo.classList.contains('is-reduced');
      var sc = reduit
        ? Math.min(dw / img.naturalWidth, dh / img.naturalHeight)
        : Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      var iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
      ctx.drawImage(img, dx + (dw - iw) / 2, dy + (dh - ih) / 2, iw, ih);
      ctx.restore();

      return c.toDataURL('image/png');
    } catch (e) {
      /* Canvas taint (CORS) : on laisse l'appelant retomber sur l'image brute.

         L'ERREUR EST DÉSORMAIS TRACÉE. Ce `catch` était muet, et c'est ce
         silence qui a rendu le défaut invisible : les logos manquaient de
         `crossorigin` (conf-dynamic-layout.js:980), toDataURL levait une
         SecurityError à chaque appel, et la vue d'ensemble affichait l'image
         brute non rognée — sans que rien ne l'explique. */
      console.warn('Mise à plat du coin impossible — repli sur l\'image brute :', e);
      return '';
    }
  }
  window.coinCoverDataUrl = coinCoverDataUrl;
})();
