/**
 * Sidebar Moderne - Gestion de la navigation par icônes
 * et des panneaux latéraux slide-in
 */

(function () {
  "use strict";

  let currentPanel = null;

  /* Clé de session mémorisant l'onglet ouvert, pour le rouvrir au
     rechargement — l'utilisateur retrouve l'écran qu'il consultait. */
  const PANEL_KEY = "conf_active_panel";

  /**
   * Mémorise l'onglet courant (ou son absence si tous sont fermés).
   * @param {string|null} panelId - Panneau ouvert, ou null.
   */
  function rememberPanel(panelId) {
    try {
      if (panelId) sessionStorage.setItem(PANEL_KEY, panelId);
      else sessionStorage.removeItem(PANEL_KEY);
    } catch (e) {}
  }

  /** @returns {string|null} l'onglet mémorisé, s'il existe encore. */
  function recallPanel() {
    let saved = null;
    try {
      saved = sessionStorage.getItem(PANEL_KEY);
    } catch (e) {}
    // Un panneau masqué (onglet propre à une autre catégorie) n'est pas
    // restaurable : l'appelant retombera sur « Type de produit ».
    if (!saved || !document.getElementById(saved)) return null;
    return saved;
  }

  /**
   * Ouvre un panneau latéral
   * @param {string} panelId - ID du panneau à ouvrir
   */
  function openPanel(panelId) {
    // Fermer TOUS les panneaux d'abord
    document.querySelectorAll(".side-panel").forEach((p) => {
      p.classList.remove("open");
    });

    // Ouvrir le panneau demandé
    const panel = document.getElementById(panelId);
    const navItem = document.querySelector(`[data-panel="${panelId}"]`);

    if (panel) {
      panel.classList.add("open");
      currentPanel = panelId;
      rememberPanel(panelId);
    }

    if (navItem) {
      // Retirer 'active' de tous les items
      document.querySelectorAll(".icon-nav-item").forEach((item) => {
        item.classList.remove("active");
      });
      // Ajouter 'active' à l'item cliqué
      navItem.classList.add("active");
    }

    // Panneau Texte : le curseur va droit dans le champ, l'utilisateur peut
    // taper sans clic supplémentaire.
    if (panelId === "panel-text") {
      const input = document.getElementById("mtxt-input");
      if (input) setTimeout(() => input.focus(), 120);
      refreshTextForm();
    }
  }

  /**
   * Ferme un panneau latéral
   * @param {string} panelId - ID du panneau à fermer
   */
  function closePanel(panelId) {
    const panel = document.getElementById(panelId);
    const navItem = document.querySelector(`[data-panel="${panelId}"]`);

    if (panel) {
      panel.classList.remove("open");
    }

    if (navItem) {
      navItem.classList.remove("active");
    }

    if (currentPanel === panelId) {
      currentPanel = null;
      // Panneau refermé volontairement : on ne le rouvrira pas au reload.
      rememberPanel(null);
    }
  }

  /**
   * Toggle un panneau (ouvre s'il est fermé, ferme s'il est ouvert)
   * @param {string} panelId - ID du panneau à toggle
   */
  /**
   * Sélectionne un panneau. Ne le referme JAMAIS.
   *
   * Le comportement « toggle » d'origine fermait le panneau quand on
   * recliquait son onglet : la sidebar disparaissait et le canvas changeait de
   * largeur (ce qui déformait au passage les zones, exprimées en % du layer).
   * Les panneaux sont désormais permanents — on passe de l'un à l'autre, sans
   * jamais se retrouver sans contenu.
   */
  function togglePanel(panelId) {
    openPanel(panelId);
  }

  /**
   * Initialise les événements de la sidebar
   */
  function initSidebar() {
    /* Le JS prend la main : le CSS laisse alors .open piloter la largeur.
       Avant cet attribut, #panel-product est affiché d'office (voir
       conf-sidebar-modern.css) pour que la sidebar ne soit jamais vide. */
    document.documentElement.setAttribute("data-sidebar-ready", "1");

    // Gérer les clics sur les icônes de navigation (sauf texte)
    document.querySelectorAll(".icon-nav-item[data-panel]").forEach((item) => {
      item.addEventListener("click", function () {
        const panelId = this.getAttribute("data-panel");
        togglePanel(panelId);
      });
    });

    /* Onglet Texte : pas de second écouteur ici. Il porte déjà data-panel,
       donc la boucle ci-dessus le gère. Un handler supplémentaire faisait
       « toggle puis open » sur le même clic — le panneau ne se fermait plus. */

    // Gestion de la touche Échap pour fermer les modales
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        // Fermer la modale couleurs si ouverte
        const colorModal = document.getElementById("color-modal-overlay");
        if (colorModal && colorModal.style.display === "flex") {
          closeColorModal();
        }

        // Fermer la modale tailles si ouverte
        const sizeModal = document.getElementById("size-modal-overlay");
        if (sizeModal && sizeModal.style.display === "flex") {
          closeSizeModal();
        }
      }
    });
  }

  /**
   * Sélectionne un produit dans la grille
   * @param {HTMLElement} card - Carte produit cliquée
   * @param {string} productType - Type de produit
   */
  function selectProduct(card, productType) {
    // Retirer la sélection des autres cartes
    const grid = card.closest(".product-grid");
    if (grid) {
      grid.querySelectorAll(".product-card").forEach((c) => {
        c.classList.remove("selected");
      });
    }

    // Sélectionner la carte cliquée
    card.classList.add("selected");

    // Mettre à jour la visibilité des options textiles
    updateTextileOptions(productType);

    // Bascule l'interface entre textile et coin.
    refreshCategoryUI(productType);

    // Appeler la fonction de sélection du produit (existante) - utilise selProd au lieu de selProduct
    if (typeof window.selProd === "function") {
      window.selProd(card);
    }

    /* Le canvas des coins est (re)construit par conf-dynamic-layout.js à la
       suite de selProd(). Ses réglages vivent maintenant dans le panneau
       « Options Coin » : on réapplique l'état choisi une fois le DOM en place,
       sans quoi la pièce resterait au neutre (cf. capture « 3 disques vides »). */
    if (productType === "coins") {
      setTimeout(syncCoinPanelToCanvas, 300);
    } else if (productType === "drapeaux") {
      setTimeout(syncFlagPanelToCanvas, 300);
    } else if (productType === "patches") {
      setTimeout(syncPatchPanelToCanvas, 300);
    }

    /* PRODUIT NON TEXTILE : on saute l'écran de choix du mode.

       Coins, drapeaux et patchs ne portent pas de surnom floqué — la
       personnalisation de groupe n'a donc aucun sens pour eux. Poser la
       question reviendrait à proposer un choix dont une branche est un
       cul-de-sac.

       Seulement depuis l'ÉCRAN DE CHOIX (`data-etape="choix"`) : changer de
       produit en cours de parcours ne doit pas basculer le client de mode. */
    const racine = document.querySelector(".conf-app-root");
    const surEcranChoix = racine && racine.getAttribute("data-etape") === "choix";
    const sansSurnom = ["coins", "drapeaux", "patches"].indexOf(productType) !== -1;

    if (surEcranChoix && sansSurnom && typeof window.choisirMode === "function") {
      /* `true` = REPRISE DE SESSION : l'écran de choix est retiré EN PLACE,
         sans rechargement de page.

         Sans ce second argument, choisirMode traite l'appel comme un
         changement volontaire de mode et passe par
         basculerModeAvecRechargement (conf-main-inline.js:7421), dont la garde
         `sortant && sortant === entrant` ne couvre pas le cas présent :
         l'écran de choix a effacé le mode de la session, `sortant` vaut donc
         null. La page se rechargeait, et l'écran de choix réapparaissait une
         seconde fois — le clignotement observé.

         La reprise est ici légitime : aucun mode n'est encore choisi, il n'y a
         donc ni design à ranger ni état mémoire à isoler. */

      /* MODE IMPOSÉ, PAS CHOISI — on le note.

         Sans cette marque, le mode libre s'enregistre comme une décision du
         client. Il reste alors dedans même en reprenant un sweatshirt, sans
         jamais avoir choisi ni su qu'une alternative existait.

         La barre « Mode actuel » lit ce drapeau pour expliquer POURQUOI
         (conf-main-inline.js). Il est levé dès que le client change de mode
         lui-même : le mode redevient un choix, le message n'a plus lieu
         d'être. */
      try {
        sessionStorage.setItem("conf_mode_impose", productType);
      } catch (e) {}

      window.choisirMode("individuelle", true);
    }
  }

  /**
   * Réapplique au canvas les réglages du panneau « Options Patch ».
   * Même rôle que ses équivalents coin/drapeau.
   */
  function syncPatchPanelToCanvas() {
    const active = (sel) => document.querySelector(sel + ".active");

    const shape = active("#panel-patch .coins-shape-card");
    if (shape && typeof window.selectShape === "function") {
      window.selectShape(shape);
    }

    const size = active("#panel-patch .coins-size-card");
    if (size && typeof window.selectCoinSize === "function") {
      window.selectCoinSize(size);
    }

    const fab = active("#panel-patch .conf-fabrication-option");
    if (fab && typeof window.selectFabrication === "function") {
      window.selectFabrication(fab);
    }
  }

  /**
   * Réapplique au canvas les réglages affichés dans le panneau « Options
   * Drapeau ». Même rôle que syncCoinPanelToCanvas() : le canvas est
   * reconstruit à chaque changement de produit, le panneau non.
   */
  function syncFlagPanelToCanvas() {
    const active = (sel) => document.querySelector(sel + ".active");

    const type = active("#panel-flag .flag-type-card");
    if (type && typeof window.selectFlagType === "function") {
      window.selectFlagType(type);
    }

    const ori = active("#panel-flag .flag-orientation-card");
    if (ori && typeof window.selectFlagOrientation === "function") {
      window.selectFlagOrientation(ori);
    }

    const size = active("#panel-flag .flag-size-card");
    if (size && typeof window.selectFlagSize === "function") {
      window.selectFlagSize(size);
    }

    const rings = active("#panel-flag .flag-option-item");
    if (rings && typeof window.selectAnneaux === "function") {
      window.selectAnneaux(rings);
    }

    /* Couleur du fond : les swatches vivent dans la barre du canvas, qui vient
       d'être reconstruite — l'état actif y est donc déjà celui par défaut.
       On réapplique la couleur mémorisée pour que l'image du drapeau
       corresponde à la sélection affichée. */
    const swatch = active("#flag-cv-colors .flag-color-swatch");
    if (swatch && typeof window.selFlagColor === "function") {
      let saved = null;
      try {
        saved = sessionStorage.getItem("conf_flag_color");
      } catch (e) {}
      const target = saved
        ? document.querySelector(
            '#flag-cv-colors .flag-color-swatch[data-color="' + saved + '"]',
          )
        : null;
      const el = target || swatch;
      window.selFlagColor(el, el.getAttribute("data-color") || "#ffffff");
    }
  }

  /**
   * Réapplique au canvas les réglages affichés dans le panneau « Options Coin ».
   *
   * Le canvas est régénéré à chaque changement de produit alors que le panneau,
   * lui, est statique : sans cette synchronisation, la sélection visible dans la
   * sidebar (type, taille, finition…) ne correspondrait plus à la pièce affichée.
   */
  function syncCoinPanelToCanvas() {
    const active = (sel) => document.querySelector(sel + ".active");

    const type = active("#panel-coin .coin-type-card");
    if (type && typeof window.selectCoinType === "function") {
      window.selectCoinType(type);
    }

    const shape = active("#panel-coin .coin-shape-card");
    if (shape && typeof window.selectCoinShape === "function") {
      window.selectCoinShape(shape);
    }

    const size = active("#panel-coin .coin-size-card");
    if (size && typeof window.selectCoinSize === "function") {
      window.selectCoinSize(size);
    }

    /* Finition : aucune n'est active au départ (le récap affiche « À choisir »).
       On restaure celle retenue lors d'une session précédente, si elle existe. */
    let finish = active("#panel-coin .coin-finish-card");
    if (!finish) {
      let saved = null;
      try {
        saved = sessionStorage.getItem("conf_coin_finish");
      } catch (e) {}
      if (saved) {
        finish = document.querySelector(
          '#panel-coin .coin-finish-card[data-finish="' + saved + '"]',
        );
      }
    }
    if (finish && typeof window.selectCoinFinish === "function") {
      window.selectCoinFinish(finish);
    }
  }

  /**
   * Sélectionne une couleur
   * @param {HTMLElement} swatch - Échantillon de couleur cliqué
   * @param {string} hex - Code hexadécimal de la couleur
   * @param {string} name - Nom de la couleur
   */
  function selectColor(swatch, hex, name) {
    // Retirer la sélection des autres swatches
    const grid = swatch.closest(".color-grid");
    if (grid) {
      grid.querySelectorAll(".color-swatch").forEach((s) => {
        s.classList.remove("selected");
      });
    }

    // Sélectionner le swatch cliqué
    swatch.classList.add("selected");

    // Appeler la fonction de sélection de couleur (existante)
    if (typeof window.selColor === "function") {
      window.selColor(swatch, hex, name);
    }
  }

  /**
   * Sélectionne une taille
   * @param {HTMLElement} btn - Bouton de taille cliqué
   * @param {string} size - Taille sélectionnée
   */
  function selectSize(btn, size) {
    // Retirer la sélection des autres boutons
    const grid = btn.closest(".size-grid");
    if (grid) {
      grid.querySelectorAll(".size-btn").forEach((b) => {
        b.classList.remove("selected");
      });
    }

    // Sélectionner le bouton cliqué
    btn.classList.add("selected");

    // Appeler la fonction de sélection de taille (existante)
    if (typeof window.selSize === "function") {
      window.selSize(btn);
    }
  }

  /**
   * Change la vue dans le panneau Upload
   * @param {string} view - Vue à afficher (face, dos, cote)
   */
  function switchView(view) {
    // Retirer 'active' de tous les onglets
    document.querySelectorAll(".view-tab").forEach((tab) => {
      tab.classList.remove("active");
    });

    // Retirer 'active' de toutes les vues
    document.querySelectorAll(".upload-view").forEach((v) => {
      v.classList.remove("active");
    });

    // Activer l'onglet cliqué
    const activeTab = document.querySelector(`.view-tab[data-view="${view}"]`);
    if (activeTab) {
      activeTab.classList.add("active");
    }

    // Activer la vue correspondante
    const activeView = document.getElementById(`upload-view-${view}`);
    if (activeView) {
      activeView.classList.add("active");
    }

    // Mettre à jour l'état du bouton manches
    updateSleeveOptionButton();

    // Vues non textiles : rien de ce qui suit (manches, texte poitrine/dos)
    // ne s'y applique.
    if (view === "coin" || view === "flag" || view === "patch") return;

    // Le panneau Texte suit la vue : le choix gauche/droite disparaît au dos.
    refreshTextForm();
  }

  /**
   * Met à jour l'affichage du bouton d'option manches
   * Active/désactive le toggle selon l'état de l'option
   */
  function updateSleeveOptionButton() {
    const sleeveOptionFace = document.getElementById(
      "upload-sleeve-option-face",
    );
    const sleeveOptionDos = document.getElementById("upload-sleeve-option-dos");
    const sleeveOptionCote = document.getElementById(
      "upload-sleeve-option-cote",
    );

    // Vérifier si l'option manches est activée
    // La fonction sleeveOptOn() existe déjà dans configurateur.liquid
    const isSleeveEnabled =
      typeof window.sleeveOptOn === "function" && window.sleeveOptOn();

    // Mettre à jour l'état visuel du toggle (pas cacher le bouton)
    if (sleeveOptionFace) {
      if (isSleeveEnabled) {
        sleeveOptionFace.classList.add("active");
      } else {
        sleeveOptionFace.classList.remove("active");
      }
    }

    if (sleeveOptionDos) {
      if (isSleeveEnabled) {
        sleeveOptionDos.classList.add("active");
      } else {
        sleeveOptionDos.classList.remove("active");
      }
    }

    if (sleeveOptionCote) {
      if (isSleeveEnabled) {
        sleeveOptionCote.classList.add("active");
      } else {
        sleeveOptionCote.classList.remove("active");
      }
    }
  }

  /**
   * Gestionnaire personnalisé pour le toggle manches
   * Redirige vers la vue de face si l'option est désactivée depuis la vue de côté
   */
  function handleSleeveToggle() {
    // Vérifier l'état actuel AVANT le toggle
    const wasEnabled =
      typeof window.sleeveOptOn === "function" && window.sleeveOptOn();

    // Appeler la fonction de toggle existante
    if (typeof window.toggleSleeveOption === "function") {
      window.toggleSleeveOption();
    }

    /* ACTIVATION : on bascule aussi la vue vers le côté.

       Le cas symétrique — désactiver puis revenir en face — était traité juste
       en dessous, mais pas celui-ci. Sur ordinateur cela ne se voyait pas : le
       client cliquait ensuite un onglet de manche, qui appelle selView() et
       synchronise le panneau. Sur mobile ces onglets sont dans le rail, DERRIÈRE
       la feuille montante — inatteignables tant qu'elle est ouverte. Le panneau
       restait donc sur les zones de face (« GAUCHE (CŒUR) / DROITE (POITRINE) »),
       et le bouton « Ajouter un drapeau FR », qui vit dans #upload-view-cote,
       n'apparaissait jamais.

       Le délai laisse le toggle s'animer, comme pour la désactivation. */
    if (!wasEnabled) {
      const coteBtn = document.getElementById("cote-view-btn");
      if (coteBtn && typeof window.selView === "function") {
        setTimeout(() => {
          /* selView refuse un bouton désactivé. L'onglet reste `disabled` tant
             que l'option n'est pas prise en compte : on lève le verrou le temps
             de l'appel, comme le fait déjà conf-sleeve-side.js:92-96. */
          const wasDisabled = coteBtn.disabled;
          coteBtn.disabled = false;
          window.selView(coteBtn, "cote");
          coteBtn.disabled = wasDisabled;
        }, 100);
      }
    }

    // Si on vient de désactiver l'option (était ON, maintenant OFF)
    if (wasEnabled) {
      // Vérifier si on est actuellement en vue de côté
      const logoLayer = document.getElementById("logo-layer");
      const currentView = logoLayer
        ? logoLayer.getAttribute("data-view")
        : null;

      if (currentView === "cote") {
        // Rediriger vers la vue de face
        const faceBtn = document.querySelector('.vt[onclick*="face"]');
        if (faceBtn && typeof window.selView === "function") {
          setTimeout(() => {
            window.selView(faceBtn, "face");
          }, 100); // Petit délai pour laisser le toggle s'animer
        }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PANNEAU TEXTE (saisie directe, façon CustomInk)
     ═══════════════════════════════════════════════════════════ */

  /** Emplacement choisi dans le panneau : 'f' (gauche/cœur) ou 'fr' (droite). */
  let textPlacement = "f";

  /* Nombre maximum de textes sur le vêtement, toutes vues confondues.
     Trois zones existent (poitrine gauche, poitrine droite, dos) mais deux
     textes suffisent : au-delà, l'atelier facture une pose supplémentaire. */
  const MAX_TEXTS = 2;
  const TEXT_ZONES = ["f", "fr", "b"];

  /**
   * Compte les textes RÉELLEMENT posés sur le vêtement.
   *
   * Un élément vide ou masqué ne compte pas : les trois conteneurs existent
   * toujours dans le DOM, seul leur contenu dit si la zone est occupée.
   * On teste aussi la présence d'un <svg> — un texte courbé n'a pas de
   * textContent.
   *
   * @returns {number} 0 à 3
   */
  function countTexts() {
    return TEXT_ZONES.filter(hasText).length;
  }

  /** @returns {boolean} la zone porte-t-elle un texte ? */
  function hasText(zone) {
    const el = document.getElementById("text-" + zone);
    if (!el || el.style.display === "none") return false;
    return !!(el.textContent.trim() || el.querySelector("svg"));
  }

  /**
   * Première zone de poitrine LIBRE ('f' puis 'fr'), ou null si les deux sont
   * occupées.
   *
   * Le sélecteur d'emplacement ayant été retiré, l'attribution est automatique :
   * le premier texte va à gauche, le second à droite. Le client les déplace
   * ensuite où il veut — les deux partagent le même bandeau (zone-chest).
   *
   * @returns {string|null}
   */
  function freeChestZone() {
    if (!hasText("f")) return "f";
    if (!hasText("fr")) return "fr";
    return null;
  }

  /**
   * Sélectionne l'emplacement du futur texte (poitrine gauche / droite).
   * @param {HTMLElement} btn - Le bouton cliqué.
   */
  function setTextPlacement(btn) {
    textPlacement = btn.getAttribute("data-zone") || "f";
    document.querySelectorAll("#mtxt-where .mtxt-where-opt").forEach((b) => {
      b.classList.toggle("on", b === btn);
    });
  }

  /**
   * Synchronise le formulaire avec l'état courant :
   *  - bouton actif seulement si le champ contient quelque chose ;
   *  - choix gauche/droite masqué en vue de dos, où il n'a pas de sens
   *    (le dos porte un seul emplacement, centré) ;
   *  - encart d'information adapté à la vue affichée.
   */
  function refreshTextForm() {
    const layer = document.getElementById("logo-layer");
    const view = layer ? layer.getAttribute("data-view") : "face";
    const isBack = view === "dos";
    // Les manches ne reçoivent que des logos : pas de texte en vue de côté.
    const isSleeve = view === "cote";

    /* Deux limites distinctes :
       - `capped` : plafond global de 2 textes sur le vêtement ;
       - `viewFull` : plus de place sur la VUE affichée (les deux emplacements
         de poitrine sont pris, ou le dos est déjà occupé). Le client peut
         alors encore écrire, mais sur l'autre vue. */
    const capped = countTexts() >= MAX_TEXTS;
    const viewFull = isBack ? hasText("b") : !freeChestZone();
    const blocked = capped || viewFull;

    /* Champ et bouton neutralisés sur les manches et une fois bloqué :
       l'interface le dit AVANT le clic plutôt qu'après. */
    const input = document.getElementById("mtxt-input");
    const btn = document.getElementById("mtxt-add-btn");
    if (input) {
      input.disabled = isSleeve || blocked;
      input.placeholder = isSleeve
        ? "Texte indisponible sur les manches"
        : capped
          ? "Maximum de 2 textes atteint"
          : viewFull
            ? (isBack ? "Le dos porte déjà un texte" : "Les 2 emplacements sont pris")
            : "Saisissez votre texte ici";
    }
    /* UN TEXTE EXISTE DÉJÀ SUR LA VUE : le bouton devient « Modifier » et
       reste ACTIF, champ vide ou non.

       Le panneau s'ouvrait sinon inerte dès qu'un texte occupait la vue : le
       champ était grisé, le bouton désactivé, et rien n'indiquait comment
       corriger une faute. Le clic ouvre désormais le panneau d'ÉDITION
       complet — police, couleur, taille — via `editText`.

       Le texte n'est pas recopié dans ce champ : le retaper dans une case
       étroite serait plus laborieux que de l'éditer sur le vêtement. */
    var vueCourante = isBack ? "b" : (hasText("f") ? "f" : (hasText("fr") ? "fr" : null));
    var texteSurLaVue = !isSleeve && vueCourante && hasText(vueCourante);

    if (btn) {
      btn.disabled = isSleeve || (!texteSurLaVue && (blocked || !input || !input.value.trim()));
      btn.textContent = texteSurLaVue && !(input && input.value.trim())
        ? "Modifier le texte"
        : "Ajouter au design";
    }
    /* Le champ reste utilisable pour AJOUTER un second texte quand une zone
       est encore libre — le plafond seul le grise. */

    // Emplacement poitrine : sans objet au dos comme sur les manches.
    const where = document.getElementById("mtxt-where");
    const whereLabel = document.querySelector("#panel-text .mtxt-where-label");
    const hideWhere = isBack || isSleeve;
    if (where) where.style.display = hideWhere ? "none" : "";
    if (whereLabel) whereLabel.style.display = hideWhere ? "none" : "";

    /* Le texte est posé sur la VUE AFFICHÉE : on dit donc où l'on écrit
       actuellement, et comment atteindre une vue qui accepte du texte. */
    const info = document.getElementById("mtxt-view-info");
    const infoText = document.getElementById("mtxt-view-info-text");
    // L'encart passe en avertissement sur les manches ET au plafond.
    if (info) info.classList.toggle("is-warning", isSleeve || blocked);
    if (infoText) {
      if (capped) {
        /* Prioritaire : expliquer où écrire n'a plus de sens quand on ne peut
           plus rien ajouter nulle part. */
        infoText.innerHTML =
          "<strong>Maximum de 2 textes atteint.</strong> Supprimez un texte " +
          "existant pour en ajouter un autre.";
      } else if (viewFull) {
        /* Le plafond n'est pas atteint : il reste de la place, mais sur
           l'AUTRE vue. On dit où aller. */
        infoText.innerHTML = isBack
          ? "Le dos porte déjà un texte. Basculez vers la <strong>Vue de face</strong> " +
            "pour en ajouter un autre."
          : "Les 2 emplacements de la poitrine sont pris. Basculez vers la " +
            "<strong>Vue de dos</strong> pour ajouter un autre texte.";
      } else if (isSleeve) {
        infoText.innerHTML =
          "Le texte n'est pas disponible sur les manches. Basculez vers la " +
          "<strong>Vue de face</strong> ou la <strong>Vue de dos</strong> pour en ajouter.";
      } else if (isBack) {
        infoText.innerHTML =
          "Le texte sera ajouté <strong>au dos</strong>. Pour écrire sur la " +
          "poitrine, basculez vers la <strong>Vue de face</strong> dans le canvas";
      } else {
        infoText.innerHTML =
          "Pour ajouter du texte au dos, basculez vers la " +
          "<strong>Vue de dos</strong> dans le canvas";
      }
    }

    const hint = document.getElementById("mtxt-hint");
    if (hint) {
      // Sans objet au plafond : rien ne sera ajouté.
      hint.style.display = (isSleeve || blocked) ? "none" : "";
      hint.textContent = isBack
        ? "Le texte sera placé au dos, dans la zone pointillée. Vous pourrez le déplacer et le mettre en forme une fois ajouté."
        : "Le texte reste dans la zone pointillée et pourra être déplacé et mis en forme une fois ajouté.";
    }
  }

  /**
   * Insère le texte saisi sur le produit.
   *
   * On ne simule PAS de clics sur l'ancien formulaire inline : on renseigne
   * directement son champ puis on appelle confirmTextInline(), qui fait déjà
   * tout le travail utile (exclusivité logo/texte sur la zone, clamp dans la
   * zone pointillée, rendu, sélection, ouverture de la barre d'outils).
   */
  function addTextToDesign() {
    const input = document.getElementById("mtxt-input");
    const text = input ? input.value.trim() : "";
    /* MODIFICATION D'UN TEXTE EXISTANT — testée AVANT la garde sur le champ
       vide, qui sortait sinon immédiatement.

       Champ vide + texte sur la vue affichée = le client veut CORRIGER, pas
       ajouter. On ouvre alors le panneau d'édition complet. Corriger une faute
       était jusqu'ici impossible dès que le plafond de deux textes était
       atteint : la fonction refusait tout. */
    var layerMod = document.getElementById("logo-layer");
    var vueMod = layerMod ? layerMod.getAttribute("data-view") : "face";
    var zoneMod = (vueMod === "dos") ? "b" : (hasText("f") ? "f" : "fr");
    var elMod = document.getElementById("text-" + zoneMod);
    var contenuMod = elMod ? elMod.querySelector(".dt-content") : null;
    var texteExistant = (contenuMod && elMod.style.display !== "none" &&
                         !elMod.classList.contains("is-shaped"))
      ? (contenuMod.textContent || "").trim()
      : "";

    /* Le champ est VIDE : le clic veut dire « modifier ce qui est là », pas
       « ajouter ». S'il porte une saisie, on poursuit vers l'ajout normal. */
    var champVide = !(input && input.value.trim());

    if (champVide && texteExistant && typeof window.editText === "function") {
      /* On délègue à `editText`, le chemin prévu du projet : il charge l'état
         complet du texte — police, couleur, taille, style — et ouvre le
         panneau d'édition. Manipuler le contenu à la main ici aurait contourné
         la persistance et perdu la modification au rechargement. */
      window.editText(zoneMod);
      return;
    }

    /* Aucun texte à modifier : il faut une saisie pour poser un texte neuf. */
    if (!text) return;

    /* Garde-fou : le champ est déjà grisé, mais la fonction reste appelable
       (touche Entrée, appel direct). On refuse plutôt que de poser un 3e texte
       ou d'écraser un texte existant faute de zone libre. */
    if (countTexts() >= MAX_TEXTS) {
      refreshTextForm();
      return;
    }

    if (
      typeof window.startTextInline !== "function" ||
      typeof window.confirmTextInline !== "function"
    ) {
      console.warn("⚠️ conf-text-editor.js pas encore chargé.");
      return;
    }

    // En vue de dos, le texte va au dos quel que soit l'emplacement choisi
    // ci-dessus : les deux options poitrine n'existent qu'à l'avant.
    const layer = document.getElementById("logo-layer");
    const view = layer ? layer.getAttribute("data-view") : "face";

    /* Manches : pas de texte, seulement des logos. On refuse au lieu de
       basculer d'office sur la face — déplacer l'utilisateur sans qu'il l'ait
       demandé poserait le texte sur une vue qu'il ne regardait pas. */
    if (view === "cote") {
      refreshTextForm();
      return;
    }

    /* Choix de la zone.
       Le sélecteur gauche/droite a été retiré : le client place son texte
       librement une fois posé. On prend donc la première zone LIBRE de la vue
       — sans quoi textPlacement restait sur 'f' et un second texte de face
       écrasait le premier.
       Vue de dos : une seule zone ('b'). */
    const zone = view === "dos" ? "b" : freeChestZone();

    // Aucune zone libre sur cette vue : on refuse plutôt que d'écraser.
    if (!zone || hasText(zone)) {
      refreshTextForm();
      return;
    }

    /* On RESTE sur le panneau Texte : le client vient d'écrire, il enchaîne
       souvent sur un second texte ou sur la mise en forme. Basculer vers
       « Type de produit » l'éloignait de ce qu'il était en train de faire.
       Le champ est vidé et le formulaire réévalué (il se grise au plafond de
       2 textes). */
    input.value = "";
    refreshTextForm();

    // startTextInline() affiche le formulaire inline et fixe la zone visée ;
    // on y recopie le texte, puis confirmTextInline() le referme et insère.
    // C'est lui qui SÉLECTIONNE le texte et OUVRE la barre horizontale.
    window.startTextInline(zone);
    const inlineInput = document.getElementById("txt-inline-input");
    if (!inlineInput) {
      console.warn("⚠️ Champ txt-inline-input introuvable.");
      return;
    }
    inlineInput.value = text;
    window.confirmTextInline();

    /* Filet de sécurité : si un handler global a désélectionné entre-temps
       (la barre se referme alors aussitôt), on rétablit sélection + barre au
       tour de boucle suivant. Idempotent si tout s'est bien passé. */
    setTimeout(() => {
      const el = document.getElementById("text-" + zone);
      if (!el) return;
      if (typeof window.selectDesignText === "function")
        window.selectDesignText(el);
      if (typeof window.showTextToolbar === "function")
        window.showTextToolbar(zone);
    }, 0);
  }

  /**
   * Ouvrait la modale « plusieurs surnoms » depuis le panneau Texte.
   *
   * NEUTRALISÉE : ce bouton a été retiré (snippets/sidebar-modern.liquid). Il
   * basculait en mode groupe SANS passer par l'écran de choix, ce qui en
   * faisait le seul chemin où le design devait être conservé plutôt que
   * permuté — une exception permanente à maintenir.
   *
   * La fonction reste exportée : elle figure dans l'objet public du module
   * (:1021) et la retirer casserait toute référence extérieure subsistante.
   */
  function openMultiNames() {}

  /**
   * Réglait la visibilité du bouton « Ajouter plusieurs surnoms ».
   *
   * Sans effet depuis son retrait : la garde ci-dessous sort d'elle-même,
   * l'élément n'existant plus. Conservée pour ses appelants
   * (conf-main-inline.js:960, :2257 et :993 ici même).
   */
  function refreshMultiNameBtn(productType) {
    const btn = document.getElementById("mtxt-multi-btn");
    if (!btn) return;
    const textiles = ["sweatshirt", "tshirt", "tshirt_polyester"];
    btn.style.display = textiles.includes(productType) ? "" : "none";
  }

  /**
   * Ouvre la modale des couleurs
   */
  function openColorModal() {
    const modal = document.getElementById("color-modal-overlay");
    if (modal) {
      modal.style.display = "flex";
      // Empêcher le scroll du body
      document.body.style.overflow = "hidden";
    }
  }

  /**
   * Ferme la modale des couleurs
   */
  function closeColorModal() {
    const modal = document.getElementById("color-modal-overlay");
    if (modal) {
      modal.style.display = "none";
      // Restaurer le scroll du body
      document.body.style.overflow = "";
    }
  }

  /**
   * Sélectionne une couleur dans la modale
   * @param {HTMLElement} swatch - Échantillon de couleur cliqué
   * @param {string} hex - Code hexadécimal de la couleur
   * @param {string} name - Nom de la couleur
   */
  function selectModalColor(swatch, hex, name) {
    // Retirer la sélection des autres swatches
    document.querySelectorAll(".color-swatch-modal").forEach((s) => {
      s.classList.remove("selected");
    });

    // Sélectionner le swatch cliqué
    swatch.classList.add("selected");

    // Appeler la fonction de sélection de couleur existante
    if (typeof window.selColor === "function") {
      // Créer un élément temporaire pour compatibilité
      const tempSwatch = document.createElement("div");
      tempSwatch.style.background = hex;
      tempSwatch.setAttribute("data-color", name);
      window.selColor(tempSwatch, hex, name);
    }

    // Fermer la modale après sélection
    setTimeout(() => {
      closeColorModal();
    }, 300);
  }

  /**
   * Ouvre la modale des tailles
   */
  function openSizeModal() {
    const modal = document.getElementById("size-modal-overlay");
    if (modal) {
      modal.style.display = "flex";
      // Empêcher le scroll du body
      document.body.style.overflow = "hidden";
    }
  }

  /**
   * Ferme la modale des tailles
   */
  function closeSizeModal() {
    const modal = document.getElementById("size-modal-overlay");
    if (modal) {
      modal.style.display = "none";
      // Restaurer le scroll du body
      document.body.style.overflow = "";
    }
  }

  /**
   * Sélectionne une taille dans la modale
   * @param {HTMLElement} btn - Bouton de taille cliqué
   * @param {string} size - Taille sélectionnée
   */
  function selectModalSize(btn, size) {
    // Retirer la sélection des autres boutons
    document.querySelectorAll(".size-btn-modal").forEach((b) => {
      b.classList.remove("selected");
    });

    // Sélectionner le bouton cliqué
    btn.classList.add("selected");

    // Appeler la fonction de sélection de taille existante
    if (typeof window.selSize === "function") {
      // Créer un élément temporaire pour compatibilité
      const tempBtn = document.createElement("button");
      tempBtn.textContent = size;
      tempBtn.setAttribute("data-size", size);
      window.selSize(tempBtn);
    }

    // Fermer la modale après sélection
    setTimeout(() => {
      closeSizeModal();
    }, 300);
  }

  /* ═══════════════════════════════════════════════════════════
     CATÉGORIE COINS
     Une pièce métallique n'a ni dos, ni manches, ni couleur de
     textile : l'interface textile est masquée et remplacée par la
     vue recto/verso + le panneau « Options Coin ».
     ═══════════════════════════════════════════════════════════ */

  /** Produit courant, pour que switchView() sache quelle vue afficher. */
  let currentProduct = "sweatshirt";

  /** @returns {boolean} true si le produit courant est un coin métallique. */
  function isCoinProduct() {
    return currentProduct === "coins";
  }

  /** @returns {boolean} true si le produit courant est un drapeau. */
  function isFlagProduct() {
    return currentProduct === "drapeaux";
  }

  /** @returns {boolean} true si le produit courant est un patch brodé. */
  function isPatchProduct() {
    return currentProduct === "patches";
  }

  /**
   * Produits non textiles : personnalisés par faces (ou face unique pour un
   * patch), sans dos ni manches. Sert à masquer tout l'appareillage textile
   * (vues face/dos/côté, options manches, onglet Texte).
   * @returns {boolean}
   */
  function isNonTextileProduct() {
    return isCoinProduct() || isFlagProduct() || isPatchProduct();
  }

  /**
   * Adapte toute la sidebar au produit courant.
   *
   * Coins : onglet « Options Coin » affiché, vue d'upload recto/verso
   * active, options textiles (couleurs/tailles, manches, surnoms) masquées.
   * Autres produits : retour à l'interface textile d'origine.
   *
   * @param {string} productType - Type de produit sélectionné.
   */
  function refreshCategoryUI(productType) {
    currentProduct = productType || currentProduct;
    const isCoin = isCoinProduct();
    const isFlag = isFlagProduct();
    const isPatch = isPatchProduct();
    const twoFaced = isNonTextileProduct();

    // Onglets d'options : un seul est pertinent à la fois.
    const coinNav = document.getElementById("coin-nav-item");
    if (coinNav) coinNav.style.display = isCoin ? "" : "none";
    const flagNav = document.getElementById("flag-nav-item");
    if (flagNav) flagNav.style.display = isFlag ? "" : "none";
    const patchNav = document.getElementById("patch-nav-item");
    if (patchNav) patchNav.style.display = isPatch ? "" : "none";

    /* Onglet Texte : réservé aux textiles. Le texte est posé dans les zones
       pointillées du vêtement (poitrine, dos) ; ni un coin ni un drapeau
       n'en possède. */
    const textNav = document.getElementById("text-nav-item");
    if (textNav) textNav.style.display = twoFaced ? "none" : "";

    // Sous-titre du panneau Upload : « la vue » n'a de sens qu'en textile.
    const uploadSub = document.querySelector(
      "#panel-upload .side-panel-subtitle",
    );
    if (uploadSub) {
      uploadSub.textContent = twoFaced
        ? "Choisissez la face"
        : "Choisissez la vue";
    }

    // Options manches : payantes et propres au textile.
    ["face", "dos", "cote"].forEach((v) => {
      const opt = document.getElementById("upload-sleeve-option-" + v);
      if (opt) opt.style.display = twoFaced ? "none" : "";
    });

    /* On ferme les panneaux devenus hors sujet plutôt que de les laisser
       ouverts sur un contenu masqué. Si l'un d'eux était affiché, on replie
       sur « Type de produit » — sans quoi la barre d'icônes n'aurait plus
       aucun onglet actif et le panneau resterait vide à l'écran. */
    const keep = isCoin
      ? "panel-coin"
      : isFlag
        ? "panel-flag"
        : isPatch
          ? "panel-patch"
          : "panel-text";
    let closedActive = false;
    ["panel-coin", "panel-flag", "panel-patch", "panel-text"].forEach((id) => {
      if (id === keep) return;
      if (currentPanel === id) closedActive = true;
      closePanel(id);
    });
    /* Un panneau doit TOUJOURS rester ouvert : la sidebar est permanente, et
       une largeur qui varie déforme les zones (exprimées en % du layer).
       On replie donc sur « Type de produit » si l'onglet actif vient d'être
       fermé, ou si plus rien n'est ouvert. */
    if (closedActive || !currentPanel) openPanel("panel-product");

    // Bascule la vue d'upload selon la famille de produit.
    switchView(
      isCoin ? "coin" : isFlag ? "flag" : isPatch ? "patch" : "face",
    );
  }

  /**
   * Met à jour la visibilité des boutons Couleurs et Tailles
   * selon le type de produit sélectionné
   * @param {string} productType - Type de produit (sweatshirt, tshirt, etc.)
   */
  function updateTextileOptions(productType) {
    // « Plusieurs surnoms » suit le même critère : textiles uniquement.
    refreshMultiNameBtn(productType);

    const textileOptions = document.getElementById("textile-options");
    if (textileOptions) {
      // Produits textiles qui ont besoin des options couleurs/tailles
      const textileProducts = ["sweatshirt", "tshirt", "tshirt_polyester"];

      if (textileProducts.includes(productType)) {
        textileOptions.style.display = "block";
      } else {
        textileOptions.style.display = "none";
      }
    }
  }

  // Exposer les fonctions globalement
  window.modernSidebar = {
    openPanel,
    closePanel,
    togglePanel,
    selectProduct,
    selectColor,
    selectSize,
    switchView,
    updateSleeveOptionButton,
    setTextPlacement,
    refreshTextForm,
    addTextToDesign,
    openMultiNames,
    refreshMultiNameBtn,
    openColorModal,
    closeColorModal,
    selectModalColor,
    openSizeModal,
    closeSizeModal,
    selectModalSize,
    updateTextileOptions,
    refreshCategoryUI,
    syncCoinPanelToCanvas,
    syncFlagPanelToCanvas,
    syncPatchPanelToCanvas,
  };

  // Exposer handleSleeveToggle globalement pour les boutons HTML
  window.handleSleeveToggle = handleSleeveToggle;

  /**
   * Démarrage : restaure l'interface du produit réellement sélectionné.
   *
   * Après un rechargement, le produit courant est restauré depuis la session
   * (conf_current_product). Repartir systématiquement sur le textile
   * réafficherait manches et vues face/dos par-dessus un coin.
   */
  function bootstrap() {
    initSidebar();

    /* Onglet mémorisé, lu AVANT toute ouverture : openPanel() et
       refreshCategoryUI() écrivent dans la même clé, et écraseraient la
       valeur du rechargement précédent avant qu'on ait pu la lire. */
    const savedPanel = recallPanel();

    openPanel("panel-product");
    updateSleeveOptionButton();

    let product = "sweatshirt";
    try {
      product = sessionStorage.getItem("conf_current_product") || product;
    } catch (e) {}

    updateTextileOptions(product);
    refreshCategoryUI(product);

    // Marque la bonne carte produit comme sélectionnée.
    const card = document.querySelector(
      '.product-card[data-product="' + product + '"]',
    );
    if (card) {
      document
        .querySelectorAll(".product-card")
        .forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
    }

    /* Rouvre l'onglet consulté avant le rechargement. Après
       refreshCategoryUI(), qui vient de fixer quels onglets sont pertinents
       pour ce produit : un onglet masqué (options d'une autre catégorie) est
       ignoré, et « Type de produit » reste affiché. */
    if (savedPanel && savedPanel !== "panel-product") {
      const navItem = document.querySelector(
        '[data-panel="' + savedPanel + '"]',
      );
      const hidden = !navItem || navItem.style.display === "none";
      if (!hidden) openPanel(savedPanel);
    }

    // Le canvas est reconstruit de façon asynchrone au retour de session :
    // on réapplique les réglages une fois qu'il existe.
    if (product === "coins") setTimeout(syncCoinPanelToCanvas, 600);
    else if (product === "drapeaux") setTimeout(syncFlagPanelToCanvas, 600);
    else if (product === "patches") setTimeout(syncPatchPanelToCanvas, 600);
  }

  // Initialiser au chargement
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

  confLog("🎨 Sidebar moderne initialisée");
})();
