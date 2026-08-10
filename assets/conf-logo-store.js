/**
 * Mémoire des logos PAR PRODUIT (sweat, t-shirt coton, t-shirt polyester).
 *
 * Chaque textile garde ses propres visuels : basculer de l'un à l'autre ne doit
 * ni mélanger les designs, ni les perdre.
 *
 * Deux sources, dans cet ordre :
 *   1. LOGO_STORE — instantané EN MÉMOIRE, rempli au changement de produit.
 *      Rapide, mais vidé par tout rechargement de page.
 *   2. conf_uploads — stockage de session indexé par produit. C'est le repli
 *      après un F5 ou un retour depuis le récapitulatif, cas où LOGO_STORE est
 *      vide alors que les designs existent bel et bien.
 *
 * Déporté du template : configurateur.liquid atteint la limite Shopify
 * de 256 Ko. Dépend de window.LOGO_STORE et window.readUploadStore, exposés
 * par le template — ne pas retirer ces assignations.
 */
(function () {
  'use strict';

  /** @returns {object} l'instantané mémoire (créé à la volée si absent). */
  function store() {
    if (!window.LOGO_STORE) window.LOGO_STORE = {};
    return window.LOGO_STORE;
  }

  function saveLogosForProduct(productKey) {
    const zones = ['f', 'fr', 'b', 'sl', 'sr'];
    store()[productKey] = {};
    zones.forEach(zone => {
      const img = document.getElementById('i' + zone);
      // img.src vaut l'URL absolue de la page quand il est vide — on filtre ça
      const src = img ? img.getAttribute('src') : null;
      store()[productKey][zone] = (src && src !== '' && src.startsWith('data:')) ? src : null;
    });
  }
  
  
  function restoreLogosForProduct(productKey) {
    const zones = ['f', 'fr', 'b', 'sl', 'sr'];
    /* LOGO_STORE ne vit QU'EN MÉMOIRE : il est vide après un rechargement
       (retour depuis le récapitulatif, F5). On retombe alors sur
       conf_uploads, désormais indexé par produit — sans quoi le canvas
       restait vierge alors que les designs étaient bien enregistrés.
       saveLogosForProduct() ne retient que les images `data:` ; le
       stockage persisté couvre aussi les URLs distantes. */
    let saved = store()[productKey];
    if (!saved) {
      saved = {};
      try {
        const persisted = window.readUploadStore ? window.readUploadStore().byProduct[productKey] || {} : {};
        Object.keys(persisted).forEach(function (z) {
          const e = persisted[z];
          const src = (typeof e === 'string') ? e : (e && e.src);
          if (src) saved[z] = src;
        });
      } catch (e) { saved = {}; }
    }
  
    zones.forEach(zone => {
      const src = saved[zone] || null;
  
      // Sidebar preview
      const prev = document.getElementById('p' + zone);
      const img  = document.getElementById('i' + zone);
      const lbl  = document.getElementById('l' + zone);
      const input = document.getElementById('u' + zone);
  
      if (src) {
        if (img)  img.src = src;
        if (prev) prev.style.display = 'block';
        if (lbl)  lbl.style.display = 'flex';
      } else {
        if (img)  img.src = '';
        if (prev) prev.style.display = 'none';
        if (lbl)  lbl.style.display = 'none';
        if (input) input.value = '';
      }
  
      // Logo draggable sur le canvas
      const logoEl = document.getElementById('logo-' + zone);
      if (logoEl) {
        const limg = logoEl.querySelector('img');
        if (src) {
          if (limg) limg.src = src;
          logoEl.style.display = 'block';
        } else {
          if (limg) limg.src = '';
          logoEl.style.display = 'none';
        }
      }
    });
  
    // Recap rows
    const savedF  = saved['f']  || null;
    const savedB  = saved['b']  || null;
    const savedSl = saved['sl'] || null;
    const savedSr = saved['sr'] || null;
  
    const rcFront   = document.getElementById('rc-front');
    const rcBack    = document.getElementById('rc-back');
    const rcSleeves = document.getElementById('rc-sleeves');
    const rcImgF    = document.getElementById('rc-img-f');
    const rcImgB    = document.getElementById('rc-img-b');
  
    if (rcFront)   rcFront.style.display   = savedF  ? 'flex' : 'none';
    if (rcBack)    rcBack.style.display    = savedB  ? 'flex' : 'none';
    if (rcImgF && savedF)  rcImgF.src = savedF;
    if (rcImgB && savedB)  rcImgB.src = savedB;
    if (rcSleeves) rcSleeves.style.display = (savedSl || savedSr) ? 'flex' : 'none';
  
    // Réaligne l'aperçu logo de la vignette récap pour ce produit.
    if (typeof window.updateRecapThumbLogo === 'function') window.updateRecapThumbLogo();
  }

  window.saveLogosForProduct = saveLogosForProduct;
  window.restoreLogosForProduct = restoreLogosForProduct;
})();
