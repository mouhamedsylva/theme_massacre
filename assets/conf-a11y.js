/**
 * conf-a11y.js — Rend utilisables au clavier les éléments interactifs
 * construits avec des <div onclick> (~101 dans le configurateur).
 *
 * Le problème : `<div onclick="…">` n'est ni focusable au clavier ni activable
 * par Entrée/Espace, et son état sélectionné n'est porté que par une classe CSS
 * (`.on`, `.active`, `.selected`) — invisible pour un lecteur d'écran.
 * L'interface était donc inutilisable sans souris : choix de couleur, de taille,
 * de forme, de finition, zones d'upload…
 *
 * L'approche : plutôt que de convertir 101 balises en <button> — ce qui
 * casserait la mise en page (un <button> n'hérite ni des marges, ni du
 * `display`, ni des styles de fond des div, et `.cs` est un carré de couleur
 * dessiné par sa classe) — on complète chaque élément à l'exécution :
 *
 *   • tabindex="0"        -> focusable dans l'ordre du document
 *   • role="button"       -> annoncé comme un bouton
 *   • Entrée / Espace     -> déclenchent le même clic que la souris
 *   • aria-pressed        -> reflète la classe d'état, et la suit
 *   • aria-label          -> repris de `title` quand l'élément n'a pas de texte
 *                            (cas des pastilles de couleur, vides par nature)
 *
 * Les éléments sont injectés dynamiquement (changement de produit, panneaux) :
 * un MutationObserver reprend donc le travail sur tout nouveau nœud.
 *
 * Aucun style n'est modifié ici. Le contour de focus par défaut du navigateur
 * suffit ; conf-a11y.css l'affine seulement pour qu'il reste visible sur les
 * pastilles sombres.
 */
(function () {
  'use strict';

  /* Classes qui marquent l'état « sélectionné » selon les familles de
     composants du thème. La première trouvée fait foi. */
  var STATE_CLASSES = ['on', 'active', 'selected'];

  /* Un élément est « interactif » s'il porte un onclick et n'est pas déjà un
     contrôle natif. On s'appuie sur l'attribut plutôt que sur une liste de
     classes : la liste dériverait au fil des ajouts, pas l'attribut. */
  function isUpgradable(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' ||
        tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL') return false;
    if (!el.hasAttribute('onclick')) return false;
    return true;
  }

  /** Classe d'état présente sur l'élément, ou null. */
  function stateClass(el) {
    for (var i = 0; i < STATE_CLASSES.length; i++) {
      if (el.classList.contains(STATE_CLASSES[i])) return STATE_CLASSES[i];
    }
    return null;
  }

  /* Un élément est « à bascule » s'il appartient à un groupe où l'un des
     membres porte une classe d'état : inutile d'annoncer aria-pressed sur un
     bouton d'action simple (ouvrir un panneau, supprimer une ligne). */
  function looksSelectable(el) {
    if (stateClass(el)) return true;
    var parent = el.parentElement;
    if (!parent) return false;
    var sameClass = el.className && String(el.className).split(' ')[0];
    /* Comparaison directe des classes plutôt qu'un sélecteur : évite
       CSS.escape (absent des navigateurs anciens) et tout risque d'injection
       si une classe contenait un caractère spécial. */
    if (!sameClass) return false;
    var siblings = parent.children;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].classList.contains(sameClass) && stateClass(siblings[i])) return true;
    }
    return false;
  }

  function upgrade(el) {
    if (!isUpgradable(el)) return;
    if (el.dataset.a11yReady === '1') return;      // déjà traité
    el.dataset.a11yReady = '1';

    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');

    /* Les pastilles de couleur n'ont aucun texte : sans libellé, un lecteur
       d'écran annonce « bouton » sans plus. `title` porte déjà le nom. */
    if (!el.hasAttribute('aria-label')) {
      var text = (el.textContent || '').trim();
      var title = el.getAttribute('title');
      if (!text && title) el.setAttribute('aria-label', title);
    }

    if (looksSelectable(el)) {
      el.setAttribute('aria-pressed', stateClass(el) ? 'true' : 'false');
    }
  }

  /** Resynchronise aria-pressed après un changement de classe. */
  function syncPressed(el) {
    if (!el.hasAttribute('aria-pressed')) return;
    el.setAttribute('aria-pressed', stateClass(el) ? 'true' : 'false');
  }

  function upgradeTree(root) {
    if (!root || root.nodeType !== 1) return;
    if (isUpgradable(root)) upgrade(root);
    var nodes = root.querySelectorAll('[onclick]');
    for (var i = 0; i < nodes.length; i++) upgrade(nodes[i]);
  }

  /* Entrée / Espace = clic. En délégation sur le document : fonctionne aussi
     pour les éléments injectés plus tard, sans réattacher d'écouteurs. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = e.target;
    if (!el || el.dataset == null || el.dataset.a11yReady !== '1') return;
    /* Espace fait défiler la page par défaut : on l'en empêche puisqu'on
       l'utilise comme activation, à l'image d'un <button> natif. */
    e.preventDefault();
    el.click();
  });

  /* Les classes d'état changent par JS (classList.add('on')…) : sans
     observation, aria-pressed resterait figé sur sa valeur initiale. */
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'attributes') {
        syncPressed(r.target);
      } else {
        for (var j = 0; j < r.addedNodes.length; j++) upgradeTree(r.addedNodes[j]);
      }
    }
  });

  function start() {
    upgradeTree(document.body);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* Exposé pour les tests et pour un rappel manuel après une reconstruction
     massive du DOM. */
  window.confA11yUpgrade = upgradeTree;
})();
