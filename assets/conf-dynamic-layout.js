/**
 * Dynamic Layout - Change l'interface selon le type de produit
 */

/* Bouton « Vue d'ensemble » des canvas NON textiles.
   Ces canvas remplacent tout le conteneur (canvasParent.innerHTML) : le bouton
   du markup Liquid — qui vit dans la barre d'onglets des textiles — disparaît
   avec le reste. On le réinjecte donc dans chaque en-tête reconstruit.
   Même id que l'original : un seul est présent à la fois. */
/* Le libellé est enveloppé dans .vt-txt, comme dans le markup Liquid : le
   mobile masque le texte des onglets de vue pour n'en garder que l'icône, et
   ce bouton doit suivre la même mécanique. Sans le span, il resterait le seul
   à afficher son libellé. */
const OVERVIEW_BTN = `
  <button type="button" class="vt vt-overview" id="overview-btn" onclick="showOverview()" aria-label="Vue d'ensemble">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
    <span class="vt-txt">Vue d'ensemble</span>
  </button>`;

// Configuration des layouts pour chaque catégorie de produit
const PRODUCT_LAYOUTS = {
  // Textiles (Sweatshirt, T-shirt, T-shirt polyester)
  textile: {
    sidebar: "textile",
    showProductTypeSelector: true,
    canvasShape: "default",
  },

  // Coins/Médailles
  coins: {
    sidebar: "coins",
    showProductTypeSelector: true, // ← Garde la section Type de produit
    canvasShape: "circle",
  },

  // Drapeaux
  drapeaux: {
    sidebar: "drapeaux",
    showProductTypeSelector: true, // ← Garde la section Type de produit
    canvasShape: "flag",
  },

  // Patches
  patches: {
    sidebar: "patches",
    showProductTypeSelector: true, // ← Garde la section Type de produit
    canvasShape: "circle",
  },
};

/* ── Ancienne sidebar patchs (COINS_SIDEBAR_TEMPLATE) : SUPPRIMÉE (2026-08-05)
   201 lignes de HTML (~9 Ko) livrées à chaque client sans jamais être
   injectées — le gabarit était marqué « OBSOLÈTE, conservé pour référence ».

   Nom trompeur, à cause du mapping inversé de categoryMap : la catégorie
   'coins' affiche le contenu PATCHS (voir handleProductChange).

   Ces réglages vivent désormais dans le panneau « Options Patch » du sidebar
   moderne (snippets/sidebar-modern.liquid), et la zone d'upload dans la vue
   #upload-view-patch. loadCoinsSidebar() vide simplement le conteneur.

   NE PAS le réintroduire : il redéclarerait les IDs du panneau statique
   (#uc, #fab-sublime, #pc/#ic/#lc…) dans une sidebar masquée, que
   getElementById résoudrait en priorité. Contenu dans l'historique Git. */

class DynamicLayoutManager {
  constructor() {
    this.currentCategory = "textile";
    // HTML d'origine du récap TEXTILE : les récaps coins/drapeaux/patchs
    // remplacent recap.innerHTML, ce qui efface le récap textile (et son bouton
    // « Commander pour un groupe »). On le mémorise pour le restaurer au retour.
    this.textileRecapHTML = null;
    /* HTML d'origine du CANVAS textile. Les canvas coins/drapeaux/patchs
       remplacent tout le conteneur ; sans cette copie, revenir à un textile
       imposait un location.reload() — la page restait alors figée sur le
       canvas précédent le temps du rechargement. */
    this.textileCanvasHTML = null;
    /* HTML d'origine de la SIDEBAR textile (#sidebar-content).
       loadCoinsSidebar() la vide (innerHTML = '') au passage sur un coin, un
       drapeau ou un patch. Or elle contient .cg et .sg — les listes de
       couleurs et de tailles qui servent de SOURCE aux menus Couleur/Taille
       de l'aperçu (voir conf-canvas-options.js, buildBody()).

       Sans cette copie, revenir à un textile laissait ces menus vides : le
       clonage était bien relancé, mais il n'avait plus rien à cloner. Seul
       un rechargement de page les rétablissait. */
    this.textileSidebarHTML = null;
    this.init();
  }

  init() {
    confLog("🎨 DynamicLayoutManager initialisé");
    // Sauvegarde le récap et le canvas textiles d'origine dès que le DOM est prêt.
    var self = this;
    var save = function () {
      var recap = document.querySelector(".recap");
      if (recap && self.textileRecapHTML == null) {
        self.textileRecapHTML = recap.innerHTML;
      }
      var cvWrap = document.querySelector(".cv-wrap");
      var canvasParent = cvWrap && cvWrap.parentElement;
      if (canvasParent && self.textileCanvasHTML == null) {
        self.textileCanvasHTML = canvasParent.innerHTML;
      }
      var sidebar = document.getElementById("sidebar-content");
      if (sidebar && self.textileSidebarHTML == null) {
        self.textileSidebarHTML = sidebar.innerHTML;
      }
    };
    if (document.readyState !== "loading") save();
    else document.addEventListener("DOMContentLoaded", save);
    this.restorePendingProduct();
  }

  // La resélection du produit au rechargement est désormais gérée par
  // restoreProductThenUploads() (dans configurateur.liquid), via la clé
  // conf_current_product. On se contente ici de consommer l'ancienne clé
  // pendingProduct pour éviter tout double basculement de produit.
  restorePendingProduct() {
    try {
      sessionStorage.removeItem("pendingProduct");
    } catch (e) {}
  }

  handleProductChange(productType) {
    confLog("🔄 Changement vers:", productType);

    // Déterminer la catégorie
    let category = "textile";

    // Mapping des produits vers catégories
    const categoryMap = {
      sweatshirt: "textile",
      tshirt: "textile",
      tshirt_polyester: "textile",
      coins: "patches", // ← Coins affiche désormais le contenu Patchs (pièce métallique)
      drapeaux: "drapeaux",
      patches: "coins", // ← Patchs affiche désormais l'ancien contenu Coins
    };

    category = categoryMap[productType] || "textile";

    confLog("📂 Catégorie:", category);

    if (category !== this.currentCategory) {
      this.currentCategory = category;
      this.switchLayout(category, productType);
    }
  }

  switchLayout(category, productType) {
    confLog("🎨 Switch layout vers:", category);

    const layout = PRODUCT_LAYOUTS[category];

    // La Type Bar reste toujours visible maintenant
    const typeBar = document.querySelector(".type-bar");
    if (typeBar) {
      typeBar.style.display = "flex";
    }

    // Mettre à jour le header global
    this.updateGlobalHeader(category);

    // Changer la sidebar selon la catégorie
    if (category === "coins") {
      this.loadCoinsSidebar();
      this.loadCoinsCanvas();
      this.loadCoinsRecap();
      // Initialise l'image du patch (forme + couleur par défaut) après injection.
      setTimeout(function () {
        if (typeof window.updatePatchShapeImg === "function")
          window.updatePatchShapeImg();
        if (typeof window.updatePatchRecapThumb === "function")
          window.updatePatchRecapThumb();
      }, 0);
    } else if (category === "drapeaux") {
      this.loadDrapeauxSidebar();
      this.loadDrapeauxCanvas();
      this.loadDrapeauxRecap();
    } else if (category === "patches") {
      this.loadPatchesSidebar();
      this.loadPatchesCanvas();
      this.loadPatchesRecap();
      // Filet de sécurité : si ce canvas contient l'image patch, l'initialiser.
      // (Sans effet si l'élément n'existe pas — la fonction sort d'elle-même.)
      setTimeout(function () {
        if (typeof window.updatePatchShapeImg === "function")
          window.updatePatchShapeImg();
        if (typeof window.updatePatchRecapThumb === "function")
          window.updatePatchRecapThumb();
      }, 0);
    } else if (category === "textile") {
      this.loadTextileSidebar(productType);
      // Restaure le récap textile si un produit non-textile l'avait remplacé.
      var recap = document.querySelector(".recap");
      if (
        recap &&
        this.textileRecapHTML != null &&
        !recap.querySelector("#main-add-to-cart")
      ) {
        recap.innerHTML = this.textileRecapHTML;
      }
      // Le bouton « groupe » n'est visible que pour les textiles : on l'affiche
      // (selProd le gère aussi, mais on s'assure de l'état après restauration).
      var grpBtn = document.getElementById("btn-group-order");
      if (grpBtn) grpBtn.style.display = "";
    }

    // Restaurer les designs sauvegardés pour cette catégorie (après chargement du DOM)
    if (category !== "textile") {
      setTimeout(function () {
        if (typeof restoreColor === "function") restoreColor(); // couleur patch / finition coin
        if (typeof restoreUploads === "function") restoreUploads(); // logos + positions
        /* Repères de zone : le canvas vient d'être reconstruit, et les
           designs restaurés juste au-dessus. On aligne l'état des pointillés
           sur ce qui est réellement présent — sinon une face restaurée
           afficherait encore son repère. */
        if (typeof window.updateCoinZoneGuides === "function")
          window.updateCoinZoneGuides();
        if (typeof window.updateFlagZoneGuides === "function")
          window.updateFlagZoneGuides();
        if (typeof window.updatePatchZoneGuide === "function")
          window.updatePatchZoneGuide();
        /* Le canvas vient d'être reconstruit : le cadre de rognage du mode
           « couverture » a disparu avec l'ancien DOM. restoreUploads() a bien
           reposé la géométrie, mais sans ce cadre le motif redevient une
           petite image centrée au lieu de remplir la pièce. */
        if (typeof window.syncCoinCrop === "function") window.syncCoinCrop();
        if (typeof window.syncFlagCrop === "function") window.syncFlagCrop();
      }, 250);
    }
  }

  updateGlobalHeader(category) {
    const brandName = document.querySelector(".hdr-name");
    const brandSub = document.querySelector(".hdr-sub");
    const brandIcon = document.querySelector(".hdr-icon");

    if (!brandName || !brandSub || !brandIcon) return;

    if (category === "coins") {
      brandName.textContent = "PERSONNALISATION PATCHES";
      brandSub.textContent = "Créez votre patch personnalisé";
      brandIcon.innerHTML = `
        <img src="${(window.ASSET_URLS && window.ASSET_URLS.logoMassacre) || ""}" alt="Logo personnalisé">
      `;
    } else if (category === "drapeaux") {
      brandName.textContent = "DRAPEAUX PERSONNALISÉS";
      brandSub.textContent = "Créez votre drapeau personnalisé";
      brandIcon.innerHTML = `
        <img src="${(window.ASSET_URLS && window.ASSET_URLS.logoMassacre) || ""}" alt="Logo personnalisé">
      `;
    } else if (category === "patches") {
      brandName.textContent = "COINS PERSONNALISÉS";
      brandSub.textContent = "Créez votre pièce unique";
      brandIcon.innerHTML = `
        <img src="${(window.ASSET_URLS && window.ASSET_URLS.logoMassacre) || ""}" alt="Logo personnalisé">
      `;
    } else {
      // Textile par défaut
      brandName.textContent = "TEXTILE PERSONNALISÉ";
      brandSub.textContent = "Créez votre style";
      brandIcon.innerHTML = `
        <img src="${(window.ASSET_URLS && window.ASSET_URLS.logoMassacre) || ""}" alt="Logo personnalisé">
      `;
    }
  }

  /* Attention au mapping inversé : cette méthode sert la catégorie 'coins',
     qui affiche le contenu PATCHS (voir categoryMap). Les réglages vivent
     désormais dans le panneau « Options Patch » du sidebar moderne ; on vide
     donc le conteneur au lieu d'y injecter un gabarit.
     L'ancien COINS_SIDEBAR_TEMPLATE a été supprimé (voir l'en-tête du
     fichier) : ses IDs (#uc, #fab-sublime…) doublonnaient ceux du panneau
     statique, et getElementById aurait résolu sur la copie masquée. */
  loadCoinsSidebar() {
    const sidebarContent = document.getElementById("sidebar-content");
    if (sidebarContent) sidebarContent.innerHTML = "";

    if (
      window.modernSidebar &&
      typeof window.modernSidebar.refreshCategoryUI === "function"
    ) {
      window.modernSidebar.refreshCategoryUI("patches");
      confLog("✅ Panneau Options Patch activé");
    }
  }

  loadCoinsCanvas() {
    const cvWrap = document.querySelector(".cv-wrap");
    if (!cvWrap) return;

    // Remplacer tout le contenu du canvas
    const canvasParent = cvWrap.parentElement;

    canvasParent.innerHTML = `
      <div class="cv-hdr cv-hdr-row">
        <div>
          <h2 class="cv-title">Aperçu de votre patch</h2>
          <p class="cv-sub">Visualisez votre patch personnalisé</p>
        </div>
        ${OVERVIEW_BTN}
      </div>
      
      <div class="cv-wrap">
        <!-- Même structure que le textile : image + colonne de zoom côte à côte,
             centrées dans la zone grise (.cv-canvas-row + .cv-ctrl). -->
        <div class="cv-canvas-row">
          <div class="patch-stage" id="patch-stage">
            <div class="coins-canvas-circle shape-rond size-8cm" id="coins-canvas">
              <!-- Corps du patch : forme VECTORIELLE (plus d'image PNG).
                   Porte le fond ET rogne le design à la silhouette : tout ce qui
                   dépasse est coupé, comme une photo dans un cadre. -->
              <div class="patch-body" id="patch-body">
                <!-- Logo : remplit toute la forme, rogné par .patch-body. -->
                <div class="design-logo patch-logo" id="patch-logo" data-zone="c" style="display:none; left:0%; top:0%; width:100%;">
                  <img id="coins-preview-img" src="" alt="Aperçu" draggable="false">
                  <span class="logo-resize" data-resize="c"></span>
                </div>
              </div>
              <!-- Zone imprimable : contour de la forme (voir .patch-safe-zone). -->
              <div class="patch-safe-zone"></div>
              <div class="coins-placeholder">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="#ccc">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                <p>Téléchargez votre logo<br>pour voir l'aperçu</p>
              </div>
            </div>
          </div>

          <!-- Colonne de zoom (identique au textile : .cv-ctrl). -->
          <div class="cv-ctrl">
            <button type="button" class="cbtn" onclick="zoom(-10)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
            </button>
            <span class="zlvl" id="zlvl">100%</span>
            <button type="button" class="cbtn" onclick="zoom(10)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <div class="cdiv"></div>
            <button type="button" class="cbtn" onclick="resetZoom()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            </button>
          </div>
        </div>

        <div class="cv-info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#999"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          Le rendu est une approximation. Les couleurs et proportions peuvent légèrement varier sur le produit final.
        </div>
      </div>
    `;

    confLog("✅ Canvas Coins chargé");
  }

  loadCoinsRecap() {
    // Modifier le contenu du récap complètement
    const recap = document.querySelector(".recap");
    if (!recap) return;

    recap.innerHTML = `
      <div class="rp-section">
        <div class="rp-section-title">RÉCAPITULATIF</div>
        
        <div class="rp-patch-preview">
          <div class="rp-patch-thumb" id="coins-recap-thumb">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="#ccc">
              <circle cx="12" cy="12" r="10" fill="none" stroke="#ccc" stroke-width="2"/>
              <path d="M12 8v8M8 12h8" stroke="#ccc" stroke-width="2"/>
            </svg>
          </div>
          <div class="rp-patch-info">
            <h3 class="rp-patch-title">Patch personnalisé</h3>
            <div class="rp-patch-details">
              <p>Face : Une seule face (sublimé)</p>
              <p>Taille : <span id="coins-recap-size">8 cm</span></p>
              <p>Format : <span id="coins-recap-shape">Rond</span></p>
              <p>Type : <span id="coins-recap-type">Sublimé</span></p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="rp-section">
        <div class="rp-qty-section">
          <div class="rp-qty-title">QUANTITÉ</div>
          <div class="rp-qty-subtitle">Minimum de commande : 10 unités</div>
          <div class="rp-qty-controls">
            <button type="button" class="rp-qty-btn" onclick="changeQty(-1)">−</button>
            <input type="number" id="coin-qty-input" class="rp-qty-input" value="10" min="10" max="50000" onchange="handleQtyInput()">
            <button type="button" class="rp-qty-btn" onclick="changeQty(1)">+</button>
          </div>
        </div>
      </div>
      
      <div class="rp-section">
        <div class="rp-unit-title">PRIX</div>
        <!-- Prix unitaire DÉGRESSIF selon la quantité (grille patchs) : injecté
             par updateCoinPrice() dans #coins-unit-price. Pas de prix total
             affiché, comme pour les textiles. -->
        <div class="rp-unit-price-big" id="coins-unit-price">${window.tierUnitPrice && window.formatPrix ? window.formatPrix(window.tierUnitPrice("patches", 10)) : "20,00 €"} <span class="rp-unit-ht">TTC</span></div>
        <div class="rp-total-subtitle" id="coins-qty-display">Par unité</div>
      </div>

      <div class="rp-actions-coins">
        <button type="button" class="rp-btn-primary" onclick="addCustomToCart(this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM2.73 5.15L4 12h12.55c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21 3H5.21l-.94-2H1v2h2l3.6 7.59z"/></svg>
          AJOUTER AU PANIER
        </button>
        <button type="button" class="rp-btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
          CONTACTEZ-NOUS
        </button>
      </div>
      
      <div class="rp-trust-coins">
        <div class="rp-trust-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
          <div>
            <strong>Fabrication de qualité</strong>
            <p>Matériaux durables et finitions soignées</p>
          </div>
        </div>
        <div class="rp-trust-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          <div>
            <strong>Service client réactif</strong>
            <p>Notre équipe est à votre écoute</p>
          </div>
        </div>
      </div>
    `;

    // Réinsère la poignée/écouteurs du panneau récap mobile (innerHTML les a effacés).
    if (typeof window.setupRecapPanel === "function") window.setupRecapPanel();

    /* Prix initial calculé sur la quantité RÉELLEMENT injectée dans le champ,
       pas sur une constante.

       Le code passait 20 alors que le champ vaut `value="10" min="10"` : le
       palier affiché était celui de 20 pièces (12,50 €) au lieu de celui de 10
       (20,00 €), soit 7,50 €/u de moins — 75 € sur la commande minimale, au
       détriment du commerçant. Et visible par DÉFAUT, puisque 10 est déjà le
       minimum : il fallait toucher au champ pour que handleQtyInput() rétablisse
       le bon prix.

       Lire le champ garantit que les deux ne peuvent plus diverger si la
       quantité par défaut ou le `min` changent. */
    if (window.updateCoinPrice) {
      var qtyEl = document.getElementById("coin-qty-input");
      var initQty = qtyEl ? parseInt(qtyEl.value, 10) || 0 : 0;
      if (initQty < 1) initQty = 10; // repli = minimum de commande
      window.updateCoinPrice(initQty);
    }

    confLog("✅ Récap Coins mis à jour");
  }

  /**
   * Retour vers un textile depuis une catégorie spéciale.
   *
   * On restaure le canvas d'origine mémorisé au démarrage, au lieu de
   * recharger la page : le rechargement laissait le canvas précédent
   * (les disques du coin, par exemple) affiché sous un titre déjà textile,
   * le temps que la page reparte. Le repli sur location.reload() ne sert
   * que si la copie n'a pas pu être prise.
   *
   * @param {string} productType - Textile sélectionné.
   */
  loadTextileSidebar(productType) {
    var p = productType || "sweatshirt";
    try {
      sessionStorage.setItem("conf_current_product", p);
    } catch (e) {}

    var cvWrap = document.querySelector(".cv-wrap");
    var canvasParent = cvWrap && cvWrap.parentElement;

    if (!canvasParent || this.textileCanvasHTML == null) {
      // Sans copie du canvas d'origine, le rechargement reste le seul recours.
      try {
        sessionStorage.setItem("pendingProduct", p);
      } catch (e) {}
      location.reload();
      return;
    }

    canvasParent.innerHTML = this.textileCanvasHTML;
    confLog("✅ Canvas textile restauré");

    /* Restaure AUSSI la sidebar textile, vidée par loadCoinsSidebar().
       Elle porte .cg et .sg, la source des menus Couleur/Taille : sans elle,
       le clonage relancé juste après n'aurait rien à cloner et les deux
       sélecteurs resteraient vides jusqu'au prochain rechargement.
       À faire AVANT resetCanvasOptionClones(), pour que la source existe. */
    var sidebarContent = document.getElementById("sidebar-content");
    if (
      sidebarContent &&
      this.textileSidebarHTML != null &&
      !sidebarContent.querySelector(".cg")
    ) {
      sidebarContent.innerHTML = this.textileSidebarHTML;
      confLog("✅ Sidebar textile restaurée");
    }

    /* Les menus Couleur/Taille sont clonés depuis la sidebar au premier
       affichage, avec un drapeau « déjà cloné ». Le canvas venant d'être
       reconstruit, ces menus sont vides : sans cette remise à zéro, le clonage
       ne se refait jamais et les deux sélecteurs restent inertes. */
    if (typeof window.resetCanvasOptionClones === "function") {
      window.resetCanvasOptionClones();
    }
    /* Réaffiche les sélecteurs et resynchronise leurs libellés (Black / M…)
       sur le DOM neuf : ils portaient l'état du canvas précédent. */
    if (typeof window.refreshCanvasOpts === "function") {
      window.refreshCanvasOpts(p);
    }

    /* Le canvas est neuf : il faut y réappliquer le produit choisi (images,
       couleur, taille) puis les designs uploadés. selProd() s'en charge pour
       la partie produit ; on le rappelle sur la carte correspondante.

       selProd() rappelle handleProductChange(), mais celui-ci ne relance
       switchLayout() que si la CATÉGORIE change — elle vaut déjà 'textile'
       ici, donc pas de récursion. Le drapeau ci-dessous rend cette garantie
       explicite plutôt que dépendante de l'ordre des affectations. */
    var card = document.querySelector(
      '.product-card[data-product="' + p + '"]',
    );
    if (
      card &&
      typeof window.selProd === "function" &&
      !this.__restoringTextile
    ) {
      this.__restoringTextile = true;
      try {
        window.selProd(card);
      } finally {
        this.__restoringTextile = false;
      }
    }

    setTimeout(function () {
      if (typeof window.restoreColor === "function") window.restoreColor();
      if (typeof window.restoreUploads === "function") window.restoreUploads();
      /* Les TEXTES suivent les logos. Ce bloc les omettait : les logos étaient
         donc restaurés une seconde fois ici, 60 ms après selProd(), pendant que
         les textes restaient sur l'état laissé par le passage précédent — d'où
         un décalage entre les deux au retour sur un produit. Même appariement
         que conf-cart-open-design.js:116-117, qui restaure toujours les deux. */
      if (typeof window.restoreTexts === "function") window.restoreTexts();
      if (typeof window.refreshZoneGuides === "function")
        window.refreshZoneGuides();
    }, 60);
  }

  /* Comme pour les coins : les réglages du drapeau vivent désormais dans le
     panneau « Options Drapeau » du sidebar moderne. Réinjecter le template
     ici dupliquerait ses IDs (#uf-recto, #flag-remove-recto…) dans une
     sidebar masquée, que getElementById résoudrait en priorité. */
  loadDrapeauxSidebar() {
    const sidebarContent = document.getElementById("sidebar-content");
    if (sidebarContent) sidebarContent.innerHTML = "";

    if (
      window.modernSidebar &&
      typeof window.modernSidebar.refreshCategoryUI === "function"
    ) {
      window.modernSidebar.refreshCategoryUI("drapeaux");
      confLog("✅ Panneau Options Drapeau activé");
    }
  }

  loadDrapeauxCanvas() {
    const cvWrap = document.querySelector(".cv-wrap");
    if (!cvWrap) return;

    const canvasParent = cvWrap.parentElement;

    canvasParent.innerHTML = `
      <div class="cv-hdr flag-cv-hdr">
        <div class="flag-cv-titles">
          <h2 class="cv-title">Visualisez votre drapeau</h2>
          <p class="cv-sub">Aperçu 3D interactif de votre design</p>
          ${OVERVIEW_BTN}
        </div>

        <!-- Couleur du fond : au-dessus de l'aperçu plutôt que dans le
             panneau latéral. Le changement se voit immédiatement sur les
             deux faces, sans quitter le canvas des yeux.
             Ce sont les MÊMES .flag-color-swatch que le panneau : selFlagColor()
             synchronise les deux jeux (voir conf-drapeaux.js). -->
        <div class="flag-cv-colors" id="flag-cv-colors">
          <span class="flag-cv-colors-label">Couleur du fond</span>
          <div class="flag-color-grid">
            <button type="button" class="flag-color-swatch active" title="Blanc" data-color="#ffffff"
                    style="background:#ffffff;border:1.5px solid #ddd" onclick="selFlagColor(this,'#ffffff')"></button>
            <button type="button" class="flag-color-swatch" title="Noir" data-color="#1a1a1a"
                    style="background:#1a1a1a" onclick="selFlagColor(this,'#1a1a1a')"></button>
            <button type="button" class="flag-color-swatch" title="Rouge" data-color="#c0392b"
                    style="background:#c0392b" onclick="selFlagColor(this,'#c0392b')"></button>
            <button type="button" class="flag-color-swatch" title="Bleu" data-color="#1e3a5f"
                    style="background:#1e3a5f" onclick="selFlagColor(this,'#1e3a5f')"></button>
          </div>
        </div>
      </div>

      <div class="cv-wrap">
        <div class="flag-canvas-container">
          <div class="flag-stage" id="flag-stage">

            <!-- RECTO -->
            <figure class="flag-mock" id="flag-recto">
              <figcaption class="flag-face-label">RECTO</figcaption>

              <!-- Vue 3D : image réelle du drapeau -->
              <div class="flag-img-3d" data-face="recto">
                <img class="flag-base-img" id="flag-base-recto" crossorigin="anonymous" src="${(window.ASSET_URLS && window.ASSET_URLS.flagRecto) || ""}" alt="Drapeau recto">
                <div class="flag-color-layer" data-face="recto"></div>
                <!-- Zone imprimable nette : marge de securite (ourlet + oeillets).
                     Bornes alignees sur FLAG_INSET (conf-logo-drag.js). -->
                <div class="flag-safe-zone" data-face="recto"></div>
                <div class="flag-canvas-placeholder flag-ph-recto">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="#dfe3ea">
                    <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
                  </svg>
                  <p>Téléchargez votre design<br>pour voir l'aperçu</p>
                </div>
                <div class="design-logo flag-logo" id="flag-logo-recto" data-zone="flag-recto" style="display:none; left:28%; top:32%; width:44%;">
                  <img class="flag-design-img" id="flag-recto-img" src="" alt="Design recto" draggable="false">
                  <span class="logo-resize" data-resize="flag-recto"></span>
                </div>
              </div>

              <!-- Vue 2D : drapeau codé à plat -->
              <div class="flag-mock-inner">
                <div class="flag-pole"></div>
                <div class="flag-wave orientation-paysage size-90x150" data-face="recto">
                  <div class="flag-design">
                    <div class="flag-color-layer" data-face="recto"></div>
                    <div class="flag-canvas-placeholder">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="#dfe3ea">
                        <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
                      </svg>
                      <p>Téléchargez votre design<br>pour voir l'aperçu</p>
                    </div>
                    <img class="flag-design-img" id="flag-recto-img-2d" style="display:none;" alt="Design recto">
                  </div>
                  <span class="flag-grommet g2 top"></span>
                  <span class="flag-grommet g2 bottom"></span>
                  <span class="flag-grommet g4 tl"></span>
                  <span class="flag-grommet g4 tr"></span>
                  <span class="flag-grommet g4 bl"></span>
                  <span class="flag-grommet g4 br"></span>
                </div>
              </div>
            </figure>

            <!-- VERSO -->
            <figure class="flag-mock" id="flag-verso">
              <figcaption class="flag-face-label">VERSO</figcaption>

              <!-- Vue 3D : image réelle du drapeau -->
              <div class="flag-img-3d" data-face="verso">
                <img class="flag-base-img" id="flag-base-verso" crossorigin="anonymous" src="${(window.ASSET_URLS && window.ASSET_URLS.flagVerso) || ""}" alt="Drapeau verso">
                <div class="flag-color-layer" data-face="verso"></div>
                <!-- Zone imprimable nette : marge de securite (ourlet + oeillets).
                     Bornes alignees sur FLAG_INSET (conf-logo-drag.js). -->
                <div class="flag-safe-zone" data-face="verso"></div>
                <div class="flag-canvas-placeholder flag-ph-verso">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="#dfe3ea">
                    <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
                  </svg>
                  <p>Téléchargez votre design verso<br>pour voir l'aperçu</p>
                </div>
                <div class="design-logo flag-logo" id="flag-logo-verso" data-zone="flag-verso" style="display:none; left:28%; top:32%; width:44%;">
                  <img class="flag-design-img" id="flag-verso-img" src="" alt="Design verso" draggable="false">
                  <span class="logo-resize" data-resize="flag-verso"></span>
                </div>
              </div>

              <!-- Vue 2D : drapeau codé à plat -->
              <div class="flag-mock-inner">
                <div class="flag-pole"></div>
                <div class="flag-wave orientation-paysage size-90x150" data-face="verso">
                  <div class="flag-design">
                    <div class="flag-color-layer" data-face="verso"></div>
                    <div class="flag-canvas-placeholder">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="#dfe3ea">
                        <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
                      </svg>
                      <p>Téléchargez votre design verso<br>pour voir l'aperçu</p>
                    </div>
                    <img class="flag-design-img" id="flag-verso-img-2d" style="display:none;" alt="Design verso">
                  </div>
                  <span class="flag-grommet g2 top"></span>
                  <span class="flag-grommet g2 bottom"></span>
                  <span class="flag-grommet g4 tl"></span>
                  <span class="flag-grommet g4 tr"></span>
                  <span class="flag-grommet g4 bl"></span>
                  <span class="flag-grommet g4 br"></span>
                </div>
              </div>
            </figure>

          </div>

          <div class="coins-canvas-controls">
            <button type="button" class="cbtn" onclick="zoom(-10)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
            </button>
            <span class="zlvl" id="zlvl">100%</span>
            <button type="button" class="cbtn" onclick="zoom(10)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <div class="cdiv"></div>
            <button type="button" class="cbtn" onclick="resetZoom()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            </button>
          </div>

          <div class="cv-info">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#999"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            Le rendu 3D est une approximation. Le rendu final peut présenter de légères variations de couleurs et de positionnement.
          </div>
        </div>
      </div>
    `;

    // Initialise l'état par défaut + applique les images/taille au chargement.
    window.__flagOrientation = window.__flagOrientation || "paysage";
    window.__flagAnneaux = window.__flagAnneaux || "0"; // sans anneaux par défaut
    window.__flagSize = window.__flagSize || "90x150";
    // Restaure la couleur de fond mémorisée (sinon blanc).
    try {
      var savedFlagColor = sessionStorage.getItem("conf_flag_color");
      if (savedFlagColor) window.__flagColor = savedFlagColor;
      var savedFlagColorName = sessionStorage.getItem("conf_flag_color_name");
      if (savedFlagColorName) window.__flagColorName = savedFlagColorName;
    } catch (e) {}
    setTimeout(function () {
      if (typeof refreshFlagImages === "function") refreshFlagImages();
      if (typeof applyFlagSizeToImages === "function") applyFlagSizeToImages();
      if (typeof applyFlagColorToLayers === "function")
        applyFlagColorToLayers();
      // Marque la pastille couleur active dans le sidebar + met à jour le récap.
      var fc = window.__flagColor || "#ffffff";
      var activeName = null;
      document.querySelectorAll(".flag-color-swatch").forEach(function (s) {
        /* data-color d'abord (porté par les swatches de la barre du canvas),
           style inline en repli pour tout swatch qui n'en aurait pas. */
        var val = s.getAttribute("data-color");
        if (!val) {
          var bg = (s.getAttribute("style") || "").match(
            /background:\s*(#[0-9a-fA-F]{3,6})/,
          );
          val = bg && bg[1];
        }
        var isActive = !!val && val.toLowerCase() === fc.toLowerCase();
        s.classList.toggle("active", isActive);
        if (isActive) activeName = s.getAttribute("title");
      });
      var name = window.__flagColorName || activeName || "Blanc";
      window.__flagColorName = name;
      var recapColor = document.getElementById("flag-recap-color");
      if (recapColor) recapColor.textContent = name;
    }, 120);

    confLog("✅ Canvas Drapeaux chargé");
  }

  loadDrapeauxRecap() {
    const recap = document.querySelector(".recap");
    if (!recap) return;

    recap.innerHTML = `
      <div class="rp-section">
        <div class="rp-section-title">RÉCAPITULATIF</div>
        
        <div class="rp-patch-preview">
          <div class="rp-patch-thumb" style="border-radius:4px;" id="flag-recap-thumb">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#ccc">
              <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
            </svg>
          </div>
          <div class="rp-patch-info">
            <h3 class="rp-patch-title">Drapeau sublimé</h3>
            <div class="rp-patch-details">
              <p>Type : <span id="flag-recap-type">Recto verso</span></p>
              <p>Couleur : <span id="flag-recap-color">Blanc</span></p>
              <p>Taille : <span id="flag-recap-size">90 x 150 cm</span></p>
              <p>Orientation : <span id="flag-recap-orientation">Paysage</span></p>
              <p>Matière : <span>Polyester 110g/m²</span></p>
              <p>Finition : <span id="flag-recap-anneaux">2 anneaux</span></p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="rp-section">
        <div class="rp-qty-section">
          <div class="rp-qty-title">QUANTITÉ</div>
          <div class="rp-qty-subtitle">Minimum de commande : 1 unité</div>
          <div class="rp-qty-controls">
            <button type="button" class="rp-qty-btn" onclick="changeFlagQty(-1)">−</button>
            <input type="number" id="flag-qty-input" class="rp-qty-input" value="1" min="1" max="50000" onchange="handleFlagQtyInput()">
            <button type="button" class="rp-qty-btn" onclick="changeFlagQty(1)">+</button>
          </div>
        </div>
      </div>
      
      <div class="rp-section">
        <div class="rp-unit-title">PRIX UNITAIRE</div>
        <!-- Prix défini par l'admin : injecté par window.prixUnitaire('drapeaux'). -->
        <div class="rp-unit-price-big" id="flags-unit-price">${window.formatPrix && window.prixUnitaire ? window.formatPrix(window.prixUnitaire("drapeaux")) : "19,90 €"} <span class="rp-unit-ht">TTC</span></div>
      </div>

      <div class="rp-actions-coins">
        <button type="button" class="rp-btn-primary" onclick="addCustomToCart(this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM2.73 5.15L4 12h12.55c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21 3H5.21l-.94-2H1v2h2l3.6 7.59z"/></svg>
          AJOUTER AU PANIER
        </button>
        <button type="button" class="rp-btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
          CONTACTEZ-NOUS
        </button>
      </div>
      
      <div class="rp-section rp-payment-section">
        <div class="rp-section-title">PAIEMENT SÉCURISÉ</div>
        <p class="rp-payment-sub">Vos paiements sont 100% sécurisés</p>
        <div class="rp-payment-logos">
          <img src="${(window.ASSET_URLS && window.ASSET_URLS.visa) || ""}" alt="Visa">
          <img src="${(window.ASSET_URLS && window.ASSET_URLS.mastercard) || ""}" alt="Mastercard">
          <img src="${(window.ASSET_URLS && window.ASSET_URLS.applepay) || ""}" alt="Apple Pay">
          <img src="${(window.ASSET_URLS && window.ASSET_URLS.paypal) || ""}" alt="PayPal">
        </div>
      </div>

      <div class="rp-trust-coins">
        <div class="rp-trust-item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
          <div>
            <strong>Impression de qualité</strong>
            <p>Sublimation haute définition</p>
          </div>
        </div>
      </div>
    `;

    if (typeof window.setupRecapPanel === "function") window.setupRecapPanel();
    confLog("✅ Récap Drapeaux chargé");
  }

  // ========================================
  // PATCHS / COINS métalliques (CUSTOM COINS)
  // ========================================
  /* Les réglages du coin vivent désormais dans le panneau « Options Coin »
     du sidebar moderne (snippets/sidebar-modern.liquid), statique et visible.
     On vide donc le conteneur au lieu de le remplir.
     L'ancien PATCHES_SIDEBAR_TEMPLATE (conf-patches.js) a été supprimé :
     l'ancienne sidebar est masquée (display:none), et y réinjecter le gabarit
     dupliquait les IDs (#coin-num-qty-input, #uc-recto…) que getElementById
     aurait alors résolus sur la copie invisible. */
  loadPatchesSidebar() {
    const sidebarContent = document.getElementById("sidebar-content");
    if (sidebarContent) sidebarContent.innerHTML = "";

    if (
      window.modernSidebar &&
      typeof window.modernSidebar.refreshCategoryUI === "function"
    ) {
      window.modernSidebar.refreshCategoryUI("coins");
      confLog("✅ Panneau Options Coin activé");
    }
  }

  loadPatchesCanvas() {
    const cvWrap = document.querySelector(".cv-wrap");
    if (!cvWrap) return;
    const canvasParent = cvWrap.parentElement;

    const A = window.ASSET_URLS || {};

    canvasParent.innerHTML = `
      <div class="cv-hdr cv-hdr-row">
        <div>
          <h2 class="cv-title">Visualisez votre coin</h2>
          <p class="cv-sub">Aperçu 3D interactif de votre design</p>
        </div>
        ${OVERVIEW_BTN}
      </div>

      <div class="cv-wrap">
        <div class="coin-canvas-container">
          <!-- is-coin : ce canvas sert le produit « Coins » (mapping inverse
               de categoryMap). Marqueur utilise par le CSS pour masquer la vue
               de cote, qui ne rend pas fidelement le motif rogne. -->
          <div class="coin-stage is-coin" id="coin-stage">

            <!-- RECTO -->
            <div class="coin-view" data-view="recto">
              <div class="coin-view-label">RECTO</div>
              <div class="coin-disc" id="coin-disc-recto">
                <img class="coin-base-img" id="coin-base-recto" src="${A.patchRecto || ""}" alt="Pièce recto">
                <!-- Zone imprimable : repère de placement du design. -->
                <div class="coin-safe-zone" data-face="recto"></div>
                <div class="design-logo coin-logo" id="coin-logo-recto" data-zone="coin-recto" style="display:none; left:28%; top:28%; width:44%;">
                  <img src="" alt="Logo recto" draggable="false">
                  <span class="logo-resize" data-resize="coin-recto"></span>
                </div>
              </div>
            </div>

            <!-- VERSO -->
            <div class="coin-view" data-view="verso">
              <div class="coin-view-label">VERSO</div>
              <div class="coin-disc" id="coin-disc-verso">
                <img class="coin-base-img" id="coin-base-verso" src="${A.patchVerso || ""}" alt="Pièce verso">
                <!-- Zone imprimable : repère de placement du design. -->
                <div class="coin-safe-zone" data-face="verso"></div>
                <div class="design-logo coin-logo" id="coin-logo-verso" data-zone="coin-verso" style="display:none; left:28%; top:28%; width:44%;">
                  <img src="" alt="Logo verso" draggable="false">
                  <span class="logo-resize" data-resize="coin-verso"></span>
                </div>
                <!-- Numéro (type "recto verso numéroté") -->
                <div class="coin-verso-number" id="coin-verso-number" style="display:none;"></div>
              </div>
            </div>

            <!-- VUE DE CÔTÉ (affiche le logo recto en aperçu, non déplaçable) -->
            <div class="coin-view" data-view="cote">
              <div class="coin-view-label">VUE DE CÔTÉ</div>
              <div class="coin-edge" id="coin-disc-edge">
                <img class="coin-base-img" id="coin-base-cote" src="${A.patchCote || ""}" alt="Pièce côté">
                <img class="coin-cote-logo" id="coin-cote-logo" style="display:none;" alt="Logo côté">
              </div>
            </div>

          </div>

          <div class="coins-canvas-controls">
            <button type="button" class="cbtn" onclick="zoom(-10)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
            </button>
            <span class="zlvl" id="zlvl">100%</span>
            <button type="button" class="cbtn" onclick="zoom(10)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <div class="cdiv"></div>
            <button type="button" class="cbtn" onclick="resetZoom()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            </button>
          </div>

          <div class="cv-info">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#999898"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            Attention, ceci est juste un aperçu, notre équipe reviendra vers vous avec une maquette finale et un devis.
          </div>
        </div>
      </div>
    `;

    confLog("✅ Canvas Patchs chargé");
  }

  loadPatchesRecap() {
    const recap = document.querySelector(".recap");
    if (!recap) return;

    const coinThumb = `
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#9a9ea3" stroke-width="1.2">
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="4"/>
      </svg>`;

    recap.innerHTML = `
      <div class="rp-section">
        <div class="rp-section-title">RÉCAPITULATIF</div>

        <div class="rp-patch-preview">
          <div class="rp-patch-thumb coin-thumb" id="coin-recap-thumb-main">${coinThumb}</div>
          <div class="rp-patch-info">
            <h3 class="rp-patch-title">Coin métal</h3>
            <div class="rp-patch-details">
              <p>Type : <span id="coin-recap-type">Recto verso</span></p>
              <p>Forme : <span id="coin-recap-shape">Rond</span></p>
              <p>Taille : <span id="coin-recap-size">30 mm</span></p>
              <p>Finition : <span id="coin-recap-finish">À choisir</span></p>
            </div>
          </div>
        </div>
      </div>

      <div class="rp-section">
        <div class="rp-qty-section">
          <div class="rp-qty-title">QUANTITÉ</div>
          <div class="rp-qty-subtitle">Minimum de commande : 50 unités</div>
          <div class="rp-qty-controls">
            <button type="button" class="rp-qty-btn" onclick="changeCoinRecapQty(-10)">−</button>
            <input type="number" id="coin-recap-qty-input" class="rp-qty-input" value="50" min="50" max="50000" onchange="handleCoinRecapQtyInput()">
            <button type="button" class="rp-qty-btn" onclick="changeCoinRecapQty(10)">+</button>
          </div>
        </div>
      </div>

      <div class="rp-actions-coins">
        <!-- COINS (productType='patches') : AJOUT AU PANIER, puis devis.

             Changé le 2026-08-08. Ce bouton forçait « DEMANDER UN DEVIS » au
             motif que les coins n'ont pas de variant Shopify et que le checkout
             les refuse. C'était contourner un mécanisme qui existe déjà.

             Le parcours réellement prévu : le client ajoute son coin au panier
             comme n'importe quel produit, et c'est le TIROIR DU PANIER qui
             bascule son bouton de « Continuer » vers « Faire une demande de
             devis » — voir cartNeedsQuote() dans conf-cart-quote.js:58, dont la
             première règle est justement hasCoinInCart().

             La bascule opère donc dès qu'un coin est présent, seul ou mêlé à
             d'autres produits. Forcer le devis ici privait le client de la
             possibilité de composer un panier mixte (un coin + un textile) :
             il partait en devis avant d'avoir pu ajouter le reste.

             La clé patches reste volontairement absente de CONF_VARIANTS
             (recapitulatif.liquid) : c'est cette absence qui empêche un coin de
             partir au paiement à un prix non validé. Les deux mécanismes sont
             complémentaires, pas redondants.

             NB : pas de backtick dans ce commentaire — il vit à l'intérieur d'un
             template literal, et le moindre backtick le terminerait. -->
        <button type="button" class="rp-btn-primary" onclick="addCustomToCart(this)">
          <!-- Même icône que le bouton textile (#main-add-to-cart, écrit en dur
               dans sections/configurateur.liquid:846) : caddie au tracé plein,
               en 14px. Le gabarit portait une AUTRE variante de panier, en 16px
               et au tracé différent — deux icônes pour la même action. -->
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM2.73 5.15L4 12h12.55c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21 3H5.21l-.94-2H1v2h2l3.6 7.59z"/></svg>
          AJOUTER AU PANIER
        </button>
        <!-- Le bouton secondaire « DEMANDER UN DEVIS » a été RETIRÉ le
             2026-08-08 : il faisait doublon avec la bascule du tiroir.

             Le devis reste accessible par le parcours normal — le client ajoute
             son coin au panier, et le tiroir bascule son bouton de bas de page
             sur « Faire une demande de devis » (cartNeedsQuote(), première règle
             hasCoinInCart(), dans conf-cart-quote.js:58).

             Vérifié avant retrait : ce bouton était le SEUL appel direct à
             requestCoinQuote() dans tout le thème. La fonction reste utilisée
             par le tiroir, qui appelle openQuoteModal() par ses propres chemins
             (conf-cart-quote.js:99 et :128) — le devis n'est donc pas devenu
             inatteignable. -->
      </div>

      <div class="rp-trust-coins">
        <div class="rp-trust-item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          <div>
            <strong>Paiement sécurisé</strong>
            <p>Transactions 100% sécurisées</p>
          </div>
        </div>
        <div class="rp-trust-item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h2v-8H5v-2a7 7 0 0 1 14 0v2h-3v8h2c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/></svg>
          <div>
            <strong>Service client</strong>
            <p>À votre écoute 7j/7</p>
          </div>
        </div>
        <div class="rp-trust-item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
          <div>
            <strong>Fabrication de qualité</strong>
            <p>Finitions haut de gamme</p>
          </div>
        </div>
      </div>
    `;

    if (typeof window.setupRecapPanel === "function") window.setupRecapPanel();
    confLog("✅ Récap Patchs chargé");
  }
}

// ========================================
// Fonctions globales pour les interactions Coins
// ========================================

// Sélection de forme
function selectShape(element) {
  // Retirer l'active des autres
  document.querySelectorAll(".coins-shape-card").forEach((card) => {
    card.classList.remove("active");
  });

  // Ajouter active à celle cliquée
  element.classList.add("active");

  // Récupérer la forme sélectionnée
  const shape = element.getAttribute("data-shape");

  // Changer la forme du canvas
  changeCanvasShape(shape);

  // Les bornes de la zone imprimable dependent de la forme : on recontraint
  // le logo, sinon il resterait hors de la nouvelle silhouette.
  setTimeout(function () {
    if (typeof window.clampPatchLogo === "function")
      window.clampPatchLogo(true);
  }, 60);

  // Mettre à jour le récap
  updateCoinsRecapShape(shape);
}

// Changer la forme du canvas
function changeCanvasShape(shape) {
  const canvas = document.getElementById("coins-canvas");
  if (!canvas) return;

  // Retirer toutes les classes de forme
  canvas.classList.remove(
    "shape-rond",
    "shape-carre",
    "shape-rectangle",
    "shape-blason",
  );

  // Ajouter la nouvelle classe
  canvas.classList.add("shape-" + shape);

  // Charger l'IMAGE PNG correspondant à la nouvelle forme (+ couleur courante) et
  // appliquer son aspect-ratio. Sans cet appel, l'image du patch ne changeait pas
  // quand on cliquait sur Carré / Rectangle / Blason.
  if (typeof window.updatePatchShapeImg === "function") {
    window.updatePatchShapeImg();
  }

  // La vignette du récap doit suivre la nouvelle forme.
  if (typeof window.updatePatchRecapThumb === "function") {
    window.updatePatchRecapThumb();
  }

  confLog("🔷 Forme changée:", shape);
}

// Mettre à jour la forme dans le récap
function updateCoinsRecapShape(shape) {
  const recapShape = document.getElementById("coins-recap-shape");
  if (recapShape) {
    const shapeNames = {
      rond: "Rond",
      carre: "Carré",
      rectangle: "Rectangle",
      blason: "Blason",
    };
    recapShape.textContent = shapeNames[shape] || "Rond";
  }
}

/* selectCoinSize() / changeCanvasSize() SUPPRIMÉES (collision de portée).

   Une `function` déclarée à la racine d'un script classique devient une
   propriété de window : cette version-ci écrasait — ou était écrasée par —
   les deux autres définitions du même nom, et le comportement dépendait
   alors du chemin d'appel (`onclick=` via la portée globale, ou
   `window.selectCoinSize(...)` depuis conf-sidebar-modern.js).

   L'implémentation unique vit désormais dans conf-patches.js, qui gère les
   tailles en mm (coins) ET en cm (patchs) et applique la classe de taille au
   canvas — ce que faisait changeCanvasSize(), devenue inutile et retirée avec.
   Son seul appelant était la fonction supprimée ci-dessus. */

// Sélection du type de fabrication
function selectFabrication(element) {
  // Retirer l'active des autres
  document.querySelectorAll(".conf-fabrication-option").forEach((option) => {
    option.classList.remove("active");
  });

  // Ajouter active à celle cliquée
  element.classList.add("active");

  // Cocher le radio
  const radio = element.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;

  // Récupérer le type
  const fabrication = element.getAttribute("data-fabrication");

  // Mettre à jour le récap
  const recapType = document.getElementById("coins-recap-type");
  if (recapType) {
    const fabricationNames = {
      sublime: "Sublimé",
      pvc: "PVC",
      tissu: "Tissé",
    };
    recapType.textContent = fabricationNames[fabrication] || "Sublimé";
  }

  confLog("🎨 Fabrication changée:", fabrication);
}

// Bouton contact
function contactForCustom() {
  var msg = "Email : contact@exemple.com\nTél : 01 XX XX XX XX";
  if (window.confAlert)
    window.confAlert(msg, { icon: "info", title: "Options PVC et Tissé" });
  else alert("Contactez-nous pour les options PVC et Tissé.\n" + msg);
}

/* Quantité — minimum LU sur l'attribut `min` du champ.
   Ces fonctions écrasent celles de configurateur.liquid (ce fichier est chargé
   après) : coder le minimum en dur ici rendait sans effet la valeur déclarée
   dans le markup, et le champ repassait à 20 malgré un min="10". */
function coinMinQty() {
  const input = document.getElementById("coin-qty-input");
  const m = input ? parseInt(input.getAttribute("min"), 10) : NaN;
  return isNaN(m) || m < 1 ? 1 : m;
}

// Changement de quantité
/* `clampQty` (conf-pricing-tiers.js, chargé en synchrone) borne des DEUX côtés.
   Sans plafond, une saisie de 999999999 partait au panier et le backend
   répondait 400 au checkout. Repli local si le fichier manque : le plancher
   seul, comportement d'avant le correctif plutôt qu'une exception. */
function clampQtyLocal(valeur, min) {
  if (typeof window.clampQty === "function")
    return window.clampQty(valeur, min);
  var n = parseInt(valeur, 10);
  return isFinite(n) && n >= min ? n : min;
}

function changeQty(delta) {
  const input = document.getElementById("coin-qty-input");
  if (!input) return;

  const min = coinMinQty();
  const qty = clampQtyLocal((parseInt(input.value, 10) || min) + delta, min);

  input.value = qty;
  updateCoinPrice(qty);
}

// Gestion de l'input quantité
function handleQtyInput() {
  const input = document.getElementById("coin-qty-input");
  if (!input) return;

  const min = coinMinQty();
  const qty = clampQtyLocal(input.value, min);
  /* Toujours réécrire : le champ doit refléter la valeur retenue, sinon
     l'utilisateur voit 999999999 alors que 50000 est utilisé. */
  if (String(input.value) !== String(qty)) input.value = qty;

  updateCoinPrice(qty);
}

// Mise à jour du prix
function updateCoinPrice(qty) {
  // NB : cette fonction sert le produit réel PATCHS (écran "Patch personnalisé",
  // productType='coins' — nommage interne inversé). Prix unitaire TTC DÉGRESSIF
  // selon la quantité (grille patchs de window.QTY_TIERS), repli sur le prix
  // admin fixe si l'asset des paliers n'a pas chargé.
  const q = Math.max(0, parseInt(qty, 10) || 0);
  let unitPrice = null;
  /* Clé `coins` : cette fonction alimente #coins-unit-price, donc l'écran
     « Coins » — qui affiche les PATCHS (noms inversés, cf. CONF_VARIANTS).
     La grille et le prix de base des patchs sont rangés sous `coins` côté
     backend. La clé `patches` porte les coins métal vendus sur devis : sans
     grille ni prix fixe, la lire renvoyait le tarif d'un autre produit.
     Repli à 20 € = 1er palier de la grille (10 pièces), et non 2,45 €. */
  if (typeof window.tierUnitPrice === "function") {
    unitPrice = window.tierUnitPrice("patches", q); // prix TTC du palier
  }
  if (unitPrice == null) {
    unitPrice = window.prixUnitaire ? window.prixUnitaire("patches") : 20.0;
  }
  // Affichage : prix UNITAIRE du palier atteint + rappel de quantité.
  // Pas de prix total (retiré, comme pour les textiles).
  const unitEl = document.getElementById("coins-unit-price");
  const qtyDisplayEl = document.getElementById("coins-qty-display");
  /* « / unité » explicite : le montant affiché est un PRIX UNITAIRE, pas le
     total de la commande. Sans cette mention, « 20,00 € » pouvait se lire
     comme le prix des 10 patchs. */
  if (unitEl)
    unitEl.innerHTML =
      (window.formatPrix
        ? window.formatPrix(unitPrice)
        : unitPrice.toFixed(2).replace(".", ",") + " €") +
      ' <span class="rp-unit-ht">TTC / unité</span>';
  /* Texte FIXE, sans `q` : la variable porte la quantité COURANTE, pas le
     seuil. L'interpoler ici aurait affiché « Commande minimum 50 unités » dès
     qu'un client saisit 50 — un minimum qui changerait de valeur à chaque
     saisie. Le vrai minimum des patchs est 10 (voir la carte QUANTITÉ, l. 379).

     La dégressivité reste active (grille `patches` dans conf-pricing-tiers.js)
     et le montant ci-dessus suit déjà le palier atteint : à 100 pièces il
     affichera 3,50 € / unité. */
  if (qtyDisplayEl) qtyDisplayEl.textContent = "Commande minimum 10 unités";
}

// Changement de vue (2D/3D)
function switchCoinsView(view) {
  document.querySelectorAll(".vt").forEach((btn) => btn.classList.remove("on"));
  event.target.classList.add("on");
  confLog("👁️ Vue changée:", view);
}

// Initialisation
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.dynamicLayoutManager = new DynamicLayoutManager();
  });
} else {
  window.dynamicLayoutManager = new DynamicLayoutManager();
}

/* Exposition explicite sur window.
   Appelées par conf-sidebar-modern.js (panneau « Options Patch ») pour
   réappliquer les réglages après reconstruction du canvas.

   selectCoinSize n'est pas exposée ici parce qu'elle n'est plus définie dans
   ce fichier : son implémentation unique vit dans conf-patches.js (voir le
   commentaire à l'emplacement de la fonction supprimée, plus haut).

   Ne pas régler ce type de conflit par l'ordre de chargement : ces fichiers
   sont des scripts classiques, où toute `function` racine atterrit sur window
   et écrase silencieusement l'homonyme précédente. Une seule définition, et
   un export explicite. */
window.selectShape = selectShape;
window.selectFabrication = selectFabrication;
/* contactPatchStyle() est définie dans configurateur.liquid (portée globale) :
   l'onclick du bouton la résout directement, rien à exposer ici. */

/* ══════════════════════════════════════════════════════════════════
   Repère de zone imprimable (patch)
   Même règle que les textiles : visible tant que le patch est vide,
   effacé dès qu'un design l'occupe, réaffiché pendant un déplacement
   (voir .patch-safe-zone dans conf-coins.css).
   ══════════════════════════════════════════════════════════════════ */
function updatePatchZoneGuide() {
  var canvas = document.getElementById("coins-canvas");
  if (!canvas) return;
  var logo = document.getElementById("patch-logo");
  var img = logo && logo.querySelector("img");
  var filled = !!(
    logo &&
    logo.style.display !== "none" &&
    img &&
    img.getAttribute("src")
  );
  canvas.classList.toggle("filled", filled);
}
window.updatePatchZoneGuide = updatePatchZoneGuide;
