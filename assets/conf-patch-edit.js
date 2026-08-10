/**
 * Mode ÉDITION du design d'un patch (double-clic).
 *
 * Le design couvre la forme et déborde : hors de la silhouette, il est rogné
 * donc invisible. Recadrer ou zoomer revient alors à travailler à l'aveugle —
 * on ne sait pas ce qu'on coupe.
 *
 * Au double-clic, le débordement réapparaît en transparence : l'image ENTIÈRE
 * est visible, la partie réellement imprimée reste en pleine opacité, et les
 * quatre coins deviennent saisissables pour l'agrandir.
 *
 * Un clic hors du patch, ou Échap, referme le mode.
 */
(function () {
  'use strict';

  var CLS = 'patch-editing';

  function canvasEl() { return document.getElementById('coins-canvas'); }
  function logoEl() { return document.getElementById('patch-logo'); }

  function isEditing() {
    var c = canvasEl();
    return !!(c && c.classList.contains(CLS));
  }

  /**
   * Doublure rognée à la forme, superposée à l'image estompée.
   *
   * En édition, .patch-body cesse de rogner : tout le design passe à 28 %
   * d'opacité, y compris la partie imprimée. Cette copie — elle, rognée —
   * restitue la zone imprimée en pleine opacité. On voit donc d'un coup
   * d'œil ce qui sera imprimé ET ce qui sera coupé.
   */
  function buildPreview() {
    var body = document.getElementById('patch-body');
    var logo = logoEl();
    var img = logo && logo.querySelector('img');
    if (!body || !logo || !img || !img.getAttribute('src')) return;
    if (body.querySelector('.patch-crop-preview')) return;

    var prev = document.createElement('div');
    prev.className = 'patch-crop-preview';

    /* La copie reprend la géométrie inline du design (position et zoom) :
       sans cela, la zone « imprimée » ne correspondrait pas au recadrage
       en cours. */
    var clone = document.createElement('div');
    clone.style.cssText = 'position:absolute;left:' + (logo.style.left || '0%') +
      ';top:' + (logo.style.top || '0%') +
      ';width:' + (logo.style.width || '100%') +
      ';aspect-ratio:1;min-height:100%;';

    var ci = document.createElement('img');
    ci.src = img.getAttribute('src');
    ci.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
      'object-fit:cover;display:block;';
    clone.appendChild(ci);
    prev.appendChild(clone);
    body.appendChild(prev);
  }

  /** Réaligne la doublure sur le design pendant le geste. */
  function syncPreview() {
    var prev = document.querySelector('.patch-crop-preview > div');
    var logo = logoEl();
    if (!prev || !logo) return;
    prev.style.left = logo.style.left || '0%';
    prev.style.top = logo.style.top || '0%';
    prev.style.width = logo.style.width || '100%';
  }
  window.syncPatchCropPreview = syncPreview;

  function removePreview() {
    var p = document.querySelector('.patch-crop-preview');
    if (p) p.remove();
  }

  function open() {
    var c = canvasEl(), logo = logoEl();
    // Rien à éditer tant qu'aucun visuel n'a été envoyé.
    if (!c || !logo || logo.style.display === 'none') return;
    c.classList.add(CLS);
    buildPreview();
  }

  function close() {
    var c = canvasEl();
    if (c) c.classList.remove(CLS);
    removePreview();
  }
  window.closePatchEdit = close;

  document.addEventListener('dblclick', function (e) {
    var logo = e.target.closest && e.target.closest('#patch-logo');
    if (logo) { open(); return; }
    // Double-clic ailleurs : on referme, comme un clic simple.
    if (isEditing() && !e.target.closest('#coins-canvas')) close();
  });

  document.addEventListener('mousedown', function (e) {
    if (!isEditing()) return;
    /* Le geste sur le design ou une poignée fait partie de l'édition : on ne
       referme que sur un clic RÉELLEMENT extérieur au patch. */
    if (e.target.closest('#coins-canvas')) return;
    close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isEditing()) close();
  });

  /* La mise à jour pendant le geste est déclenchée par conf-logo-drag.js, qui
     appelle window.syncPatchCropPreview à chaque déplacement : plus fiable
     qu'une écoute globale de mousemove, et sans coût quand rien ne bouge. */
})();
