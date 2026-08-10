/**
 * View Switcher - Gestion du changement de vue (face/dos/côté)
 */

function selView(btn, viewName) {
  // Empêcher le changement de vue si le bouton est désactivé
  if (btn.disabled) {
    return;
  }
  
  // Retirer la classe 'on' de tous les boutons
  document.querySelectorAll('.vt').forEach(b => b.classList.remove('on'));
  
  // Ajouter 'on' au bouton cliqué
  btn.classList.add('on');
  
  // Retirer 'on' de toutes les images
  document.querySelectorAll('.product-img-single').forEach(img => {
    img.classList.remove('on');
  });

  // Afficher l'image correspondante
  const imageId = 'view-' + viewName;
  const targetImage = document.getElementById(imageId);

  if (targetImage) {
    targetImage.classList.add('on');
    confLog('✅ Vue changée vers:', viewName);
  } else {
    console.warn('⚠️ Image non trouvée:', imageId);
  }

  // Mettre à jour la couche des logos (n'affiche que les logos de la vue active)
  const logoLayer = document.getElementById('logo-layer');
  if (logoLayer) logoLayer.setAttribute('data-view', viewName);

  /* Les textes de CETTE vue viennent de devenir mesurables. clampTextToZone()
     sort sans rien faire tant qu'un texte est masqué (sa boîte vaut 0) : sans
     ce rappel, un texte restauré alors qu'une autre vue était active resterait
     non contraint — et pouvait déborder de sa zone. Différé d'une frame, le
     temps que le navigateur applique le changement de vue. */
  if (typeof window.clampTextToZone === 'function') {
    requestAnimationFrame(function () {
      ['f', 'fr', 'b'].forEach(function (z) { window.clampTextToZone(z); });
    });
  }

  // La bascule gauche/droite n'a de sens qu'en vue de côté.
  if (typeof window.syncSideToggle === 'function') window.syncSideToggle(viewName);

  // Réévalue le bouton « Ajouter un texte » selon la vue (face/dos/côté).
  if (typeof refreshTextButton === 'function') refreshTextButton();

  // Synchroniser le panneau Upload de la sidebar moderne avec la vue du canvas
  if (window.modernSidebar && typeof window.modernSidebar.switchView === 'function') {
    window.modernSidebar.switchView(viewName);
  }
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  confLog('🖼️ View Switcher initialisé');
  
  // S'assurer que la vue de face est affichée par défaut
  const faceView = document.getElementById('view-face');
  if (faceView) {
    faceView.classList.add('on');
  }
});
