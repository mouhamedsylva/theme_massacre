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
    /* `//domaine/…` (protocole-relatif) : forme produite par `asset_url`, donc
       celle des images produit. À GARDER SYNCHRONISÉ avec la liste blanche de
       safeImgSrc (conf-main-inline.js:141-146), dont ceci est le repli. */
    var ok = /^data:image\//i.test(s) || /^https?:\/\//i.test(s) ||
             /^\/\/[^\/]/.test(s) ||
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
  
    /* Image de face à la bonne couleur (mêmes candidats que le configurateur).

       `window.colorImageCandidates` et NON `colorImageCandidates` : la fonction
       est définie dans la portée d'une IIFE de conf-main-inline.js (:1082) et
       n'est visible de l'extérieur que par l'export `window.` (:1111). Écrite
       sans préfixe, la référence était introuvable depuis CE module — elle
       levait une ReferenceError, que grpSafe() avalait pour renvoyer un tableau
       vide. L'aperçu s'ouvrait donc, mais sans image. */
    var candidates = grpSafe(function () {
      return window.colorImageCandidates(prefix, slug, 'face');
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
    /* Titre volontairement nu : couleur, taille et nom flocué sont déjà
       lisibles sur la ligne du tableau et dans le rendu lui-même. Les répéter
       ici produisait un titre si long qu'il débordait de la modale. */
    if (title) title.textContent = 'Aperçu';
  
    /* ── RENDU FIDÈLE ─────────────────────────────────────────────────────
       On délègue à window.captureAllViews() (conf-main-inline.js:3390) au lieu
       de reconstruire la scène en HTML.

       POURQUOI. Les `left`/`top`/`width` en % des calques sont relatifs au
       #logo-layer, PAS à l'image du vêtement. Les deux boîtes ne coïncident
       pas : `.cv-single-view` porte `padding: 20px` et le layer est en
       `inset: 0` (donc padding compris), tandis que l'image est en
       `height: 60vh; width: auto; object-fit: contain` — centrée, avec des
       bandes vides sur les côtés. Sur mobile, syncLayerToImage() recale le
       layer sur l'image : la géométrie diffère donc AUSSI entre plateformes.

       Reproduire ces % dans un bloc où l'image remplit 100 % × 100 % ne peut
       pas être fidèle, quelle que soit la valeur d'aspect-ratio choisie : la
       conversion dépend de mesures faites à l'exécution. captureAllViews()
       fait précisément ce calcul (project(), imgBoxWithinLayer()) et renvoie
       des positions en FRACTIONS DE L'IMAGE.

       Bénéfices immédiats : le logo poitrine DROITE (#logo-fr) et le second
       texte, jusqu'ici ignorés, apparaissent ; le texte courbé est rendu ; et
       l'aperçu devient identique à la « Vue d'ensemble » et à la planche
       envoyée à l'atelier — une seule source de vérité. */
    var stage = document.getElementById('grp-preview-stage');
    if (!stage) return;

    var ovOpen = document.getElementById('grp-preview-overlay');
    if (ovOpen) ovOpen.classList.add('open');
    stage.innerHTML = '<div style="color:#999;font-size:12px;padding:24px;">Preparation de l apercu...</div>';

    /* Le surnom de CETTE ligne remplace le texte commun le temps de la
       capture : c'est tout l'intérêt de cet aperçu, chacun doit voir SON nom.
       On restaure ensuite l'état d'origine — la capture lit le DOM live. */
    /* Zone à substituer : celle CHOISIE par le client quand le vêtement porte
       plusieurs textes (sélecteur de la modale, conf-group-textzone.js). Repli
       sur 'f' — le comportement d'avant ce choix. */
    var zoneTexte = (typeof window.grpTextZone === 'function')
      ? window.grpTextZone() : 'f';

    var txtEl = document.getElementById('text-' + zoneTexte);
    var txtContent = txtEl ? txtEl.querySelector('.dt-content') : null;
    var txtAncien = null;
    var txtAfficheAncien = null;

    if (flock && txtEl && txtContent && !txtEl.classList.contains('is-shaped')) {
      txtAncien = txtContent.textContent;
      txtAfficheAncien = txtEl.style.display;
      txtContent.textContent = flock;
      /* Zone vide jusqu'ici : on la révèle, sinon captureAllViews l'ignore. */
      if (txtAfficheAncien === 'none') txtEl.style.display = '';
      /* Le surnom peut être plus long que le texte commun : la police doit
         être re-calée dans la zone imprimable avant la capture. */
      if (typeof window.clampTextToZone === 'function') window.clampTextToZone(zoneTexte);
    }

    function restaurerTexte() {
      if (txtAncien === null || !txtContent) return;
      txtContent.textContent = txtAncien;
      if (txtAfficheAncien !== null) txtEl.style.display = txtAfficheAncien;
      if (typeof window.clampTextToZone === 'function') window.clampTextToZone(zoneTexte);
    }

    Promise.resolve(
      typeof window.captureAllViews === 'function' ? window.captureAllViews() : null
    ).then(function (views) {
      restaurerTexte();

      var face = (views || []).filter(function (v) { return v.label === 'FACE'; })[0];

      /* Repli : produit non textile, ou capture impossible. On garde l'ancien
         message plutôt qu'une scène vide. */
      if (!face || !baseUrl) {
        stage.innerHTML = '<div style="color:#999;font-size:12px;padding:24px;text-align:center;">' +
          'Apercu indisponible pour ' + esc(colorName) + '. Le rendu reel sera fourni au devis.</div>';
        return;
      }

      /* La couleur de la LIGNE remplace celle affichée à l'écran : c'est la
         seule substitution nécessaire, les positions restant valides. */
      var fond = baseUrl;

      var layers = (face.logos || []).map(function (g) {
        return '<img class="ov-layer" src="' + safeSrc(g.src) + '" alt="" ' +
               'style="left:' + (g.x * 100) + '%;top:' + (g.y * 100) + '%;' +
               'width:' + (g.w * 100) + '%">';
      }).join('');

      /* Markup et classes de la « Vue d'ensemble » (conf-overview.js:113-119,
         CSS conf-canvas-options.css:332-342). C'est le patron correct : l'image
         de fond, en flux normal `width:100%;height:auto`, DÉFINIT la boîte, et
         `.ov-layers` en `inset: 0` coïncide donc exactement avec elle — sans
         ratio deviné ni letterboxing.

         `max-width/height:none` sur le fond : conf-styles.css:1152 impose
         `max-height:60vh` à toute image de cette scène, ce qui la rognerait
         DANS le stage et rouvrirait l'écart entre les % et le vêtement. */
      stage.innerHTML =
        '<div class="ov-stage" style="width:100%;max-width:520px;margin:0 auto;">' +
          '<img class="ov-bg" src="' + safeSrc(fond) + '" alt="" ' +
               'style="max-width:none;max-height:none;">' +
          '<div class="ov-layers">' + layers + '</div>' +
        '</div>' +
        (fallbackUsed
          ? '<p style="margin:10px 0 0;font-size:11px;color:#b42318;text-align:center;">' +
            'Visuel generique : la teinte ' + esc(colorName) + ' n a pas d image dediee.</p>'
          : '');
    }).catch(function () {
      restaurerTexte();
      stage.innerHTML = '<div style="color:#999;font-size:12px;padding:24px;text-align:center;">' +
        'Apercu indisponible. Le rendu reel sera fourni au devis.</div>';
    });
    /* La modale est ouverte plus haut, AVANT la capture : celle-ci est
       asynchrone, et attendre sa fin laisserait un temps mort après le clic.
       Le stage affiche « Préparation… » puis se remplit. */
  }
  function closeGroupPreview() {
    var ov = document.getElementById('grp-preview-overlay');
    if (ov) ov.classList.remove('open');
  }

  window.grpPreviewRow = grpPreviewRow;
  window.closeGroupPreview = closeGroupPreview;
})();
