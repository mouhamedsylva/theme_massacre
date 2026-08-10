/**
 * conf-canvas-options.js — Boutons « Couleur » et « Taille » au-dessus de
 * l'aperçu, chacun dépliant son menu juste en dessous.
 *
 * Principe : AUCUNE liste n'est recopiée ici. Les pastilles et les boutons de
 * taille sont CLONÉS depuis les blocs `.cg` et `.sg` de l'ancienne sidebar
 * (masquée), qui restent la source unique. Ajouter une couleur là-bas la fait
 * apparaître ici sans autre modification.
 *
 * Les clones gardent leurs `onclick="selColor(...)"` / `onclick="selSize(...)"`,
 * et ces fonctions ciblent `.cs` / `.sb` globalement : l'état « sélectionné »
 * reste donc synchronisé entre la sidebar d'origine et le menu.
 */
(function () {
  "use strict";

  /** Menu ouvert ('color' | 'size'), ou null. */
  var openKind = null;

  /** Le clonage n'a lieu qu'une fois, au premier affichage de chaque menu. */
  var cloned = { color: false, size: false };

  /**
   * Réinitialise l'état de clonage.
   *
   * Le canvas est RECONSTRUIT au changement de produit (conf-dynamic-layout.js
   * remplace tout le conteneur, y compris .cv-opts et les menus). Les anciens
   * #cv-color-body / #cv-size-body disparaissent alors, mais `cloned` restait à
   * true : buildBody() sortait immédiatement et les menus ne se remplissaient
   * jamais — d'où des sélecteurs Couleur/Taille vides après un aller-retour
   * vers un coin, un drapeau ou un patch.
   */
  function resetClones() {
    cloned.color = false;
    cloned.size = false;
  }
  window.resetCanvasOptionClones = resetClones;

  function el(id) {
    return document.getElementById(id);
  }

  /**
   * Recopie le contenu de la sidebar d'origine dans le menu déroulant.
   * @param {string} kind - 'color' ou 'size'.
   */
  function buildBody(kind) {
    var dest = el(kind === "color" ? "cv-color-body" : "cv-size-body");
    if (!dest) return;

    /* Ne pas se fier au seul drapeau : le canvas peut avoir été reconstruit
       sans que resetClones() ait été appelé (retour de session, changement de
       produit par un autre chemin…). On vérifie donc que le contenu est
       RÉELLEMENT là — c'est ce qui compte pour l'utilisateur. */
    if (cloned[kind] && dest.querySelector(".cv-opt-clone")) return;

    var src = document.querySelector(kind === "color" ? ".cg" : ".sg");
    /* Source absente : la sidebar textile a été vidée (passage sur un coin,
       un drapeau ou un patch). On NE marque PAS comme cloné, sinon le menu
       resterait vide définitivement — il sera rerempli au prochain appel,
       une fois la sidebar restaurée par conf-dynamic-layout.js. */
    if (!src) return;

    // cloneNode(true) conserve les attributs onclick inline : les clones
    // appellent donc selColor/selSize exactement comme les originaux.
    dest.innerHTML = "";
    var copy = src.cloneNode(true);
    copy.classList.add("cv-opt-clone");
    dest.appendChild(copy);
    cloned[kind] = true;
  }

  /** Ferme les deux menus. */
  function closeAll() {
    ["color", "size"].forEach(function (k) {
      var pop = el("cv-" + k + "-pop");
      var btn = el("cv-" + k + "-btn");
      if (pop) pop.classList.remove("open");
      if (btn) {
        btn.classList.remove("on");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    openKind = null;
  }
  window.closeCanvasOpts = closeAll;

  /**
   * Ouvre/ferme un menu. Un seul menu ouvert à la fois.
   * @param {string} kind - 'color' ou 'size'.
   */
  window.toggleCanvasOpt = function (kind) {
    var wasOpen = openKind === kind;
    closeAll();
    if (wasOpen) return;

    buildBody(kind);
    var pop = el("cv-" + kind + "-pop");
    var btn = el("cv-" + kind + "-btn");
    if (pop) pop.classList.add("open");
    if (btn) {
      btn.classList.add("on");
      btn.setAttribute("aria-expanded", "true");
    }
    openKind = kind;
  };

  /**
   * Met à jour les libellés des boutons (couleur courante + taille courante)
   * en lisant l'état réel des sélections `.cs.on` / `.sb.on`.
   */
  function syncLabels() {
    var dot = document.querySelector(".cg .cs.on");
    if (dot) {
      var name = dot.getAttribute("title") || "";
      var val = el("cv-color-val");
      var sw = el("cv-color-swatch");
      if (val) val.textContent = name;
      // La pastille du bouton reprend le fond réel (gère aussi le blanc, qui
      // porte une bordure dans le markup d'origine).
      if (sw) sw.style.background = dot.style.background || "";
    }

    // `.sb-group` est le bouton « Pour Groupe » : ce n'est pas une taille.
    var size = document.querySelector(".sg .sb.on:not(.sb-group)");
    var sizeVal = el("cv-size-val");
    if (size && sizeVal) sizeVal.textContent = size.textContent.trim();
  }
  window.syncCanvasOptLabels = syncLabels;

  /* Un clic sur une pastille/taille (dans le menu comme dans la sidebar)
     rafraîchit les libellés, puis referme le menu : le choix est fait. */
  document.addEventListener("click", function (e) {
    var hit = e.target.closest(".cs, .sb");
    if (hit) {
      // Après les handlers inline, donc après application du choix.
      setTimeout(function () {
        syncLabels();
        // « Pour Groupe » ouvre une modale : la refermer serait redondant,
        // mais laisser le menu ouvert derrière elle est pire.
        closeAll();
      }, 0);
      return;
    }
    // Clic hors des menus -> fermeture.
    if (!e.target.closest("#cv-opts")) closeAll();
  });

  // Échap ferme le menu ouvert.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openKind) closeAll();
  });

  /**
   * Couleur et taille ne concernent que les textiles : un coin ou un drapeau
   * n'a ni l'une ni l'autre. On masque le bloc pour les autres produits.
   * @param {string} productType
   */
  window.refreshCanvasOpts = function (productType) {
    var wrap = el("cv-opts");
    if (!wrap) return;
    var textiles = ["sweatshirt", "tshirt", "tshirt_polyester"];
    var show = textiles.indexOf(productType) !== -1;
    wrap.style.display = show ? "" : "none";
    if (!show) closeAll();
    else syncLabels();
  };

  // Libellés initiaux (le markup d'origine porte déjà Black / M sélectionnés).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncLabels);
  } else {
    syncLabels();
  }
})();
