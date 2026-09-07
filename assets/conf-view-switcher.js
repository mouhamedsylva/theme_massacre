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

  /* LA VUE EST AUSSI PUBLIÉE SUR LA RACINE.

     `#logo-layer` vit DANS le canvas ; le rail d'onglets vit dans la barre
     latérale. Aucun sélecteur descendant ne peut donc aller de l'un à l'autre —
     et le mode groupe a besoin que ses onglets suivent la vue : « Mon Équipe »
     en face, « Ajout Texte » au dos.

     La racine porte déjà `data-mode` et `data-etape-groupe`, lus par des dizaines
     de règles. On y ajoute la vue, sur le même modèle, plutôt que de recourir à
     `:has()` — que ce projet évite, sa prise en charge restant inégale sur les
     navigateurs mobiles encore en circulation. */
  const racine = document.querySelector('.conf-app-root');
  if (racine) racine.setAttribute('data-view', viewName);

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

  /* LES LOGOS DE CETTE VUE VIENNENT DE DEVENIR MESURABLES.

     Le même contrat que les textes ci-dessus, qui leur manquait entièrement :
     un logo masqué par sa vue a une boîte nulle, et toute géométrie calculée
     sur cette boîte est fausse. `placeLogoInZone` sort désormais dans ce cas —
     mais si personne ne la rappelait, un logo déposé dans une vue non affichée
     ne serait jamais placé.

     DEUX GESTES DISTINCTS, et ne pas les confondre :

       • un placement REPORTÉ (drapeau `placementDiffere`) s'exécute enfin,
         drapeau consommé pour qu'il ne rejoue pas à chaque bascule ;

       • les autres sont seulement BORNÉS. `clampLogoToZone` lit la géométrie
         courante et se contente de la contraindre : elle est idempotente.

     Appeler `placeLogoInZone` sans condition serait une régression connue :
     elle IGNORE la position et la taille courantes et les recalcule depuis les
     valeurs de départ — le déplacement du client serait annulé à chaque
     changement de vue (voir conf-mobile.js:1897-1913).

     Les manches sont incluses : `.for-cote` subit le même masquage. */
  requestAnimationFrame(function () {
    ['f', 'fr', 'b', 'sl', 'sr'].forEach(function (z) {
      var el = document.getElementById('logo-' + z);

      if (el && el.dataset && el.dataset.placementDiffere === '1' &&
          typeof window.placeLogoInZone === 'function') {
        delete el.dataset.placementDiffere;
        window.placeLogoInZone(z);
        return;
      }
      if (typeof window.clampLogoToZone === 'function') window.clampLogoToZone(z);
    });
  });

  // La bascule gauche/droite n'a de sens qu'en vue de côté.
  if (typeof window.syncSideToggle === 'function') window.syncSideToggle(viewName);

  // Réévalue le bouton « Ajouter un texte » selon la vue (face/dos/côté).
  if (typeof refreshTextButton === 'function') refreshTextButton();

  // Synchroniser le panneau Upload de la sidebar moderne avec la vue du canvas
  if (window.modernSidebar && typeof window.modernSidebar.switchView === 'function') {
    window.modernSidebar.switchView(viewName);
  }

  /* LES ONGLETS SUIVENT LA VUE (mode groupe).

     En face, le client saisit ses surnoms — l'onglet « Mon Équipe ». Au dos, il
     pose un texte libre commun à toute la commande — l'onglet « Ajout Texte ».
     Les deux ne coexistent jamais : chaque vue a son outil.

     « Mon Équipe » se règle en CSS, sur `data-view` posé plus haut. « Ajout
     Texte », lui, est piloté par un `style` inline que `refreshCategoryUI`
     écrit — et un style inline bat toute règle CSS. Il faut donc la rappeler.

     Elle ne l'était qu'au changement de PRODUIT ou de MODE : sans cette ligne,
     basculer en vue de dos ne changeait rien au rail. */
  if (window.modernSidebar &&
      typeof window.modernSidebar.refreshCategoryUI === 'function') {
    try {
      window.modernSidebar.refreshCategoryUI(window.currentProductType);
    } catch (e) {}
  }

  /* La liste des surnoms se redessine : elle porte l'aperçu du nom essayé, et
     `eqRendreNoms` est son point de passage unique. Elle relit l'état réel et
     ne peut donc rien détruire. */
  if (typeof window.eqRendreNoms === 'function') {
    try { window.eqRendreNoms(); } catch (e) {}
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
