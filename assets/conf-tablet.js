/* ═══════════════════════════════════════════════════════════════════════
   COMPORTEMENT TABLETTE — 768 à 1023 px
   ═══════════════════════════════════════════════════════════════════════

   Complète conf-tablet.css. La mise en page est faite en CSS ; ce fichier
   n'ajoute que ce que le CSS ne peut pas faire :

     1. Le tiroir du récapitulatif (ouverture, voile, fermeture).
     2. La barre d'action permanente (prix + Ajouter au panier), pour que
        l'achat reste possible tiroir fermé.

   Comme en mobile, on ne modifie AUCUNE fonction existante : les nœuds
   réels sont DÉPLACÉS, jamais clonés, donc le code d'origine
   (addToCart, mise à jour du prix) continue de viser les mêmes IDs.

   Ne pas confondre avec #cart-drawer : c'est un autre tiroir, celui du
   panier, ouvert par l'icône du header (openCartDrawer). On n'y touche pas.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* Mêmes bornes que conf-tablet.css — les deux doivent rester alignés,
     sinon la barre d'action ne s'installerait pas sur les écrans que le CSS
     traite pourtant en tablette.

     Le second terme couvre les tablettes en PORTRAIT au-delà de 1023px :
     l'iPad Pro 12,9" fait 1024px de large en portrait. */
  var MQ =
    "(min-width: 768px) and (max-width: 1023px)," +
    "(min-width: 1024px) and (max-width: 1366px) and (orientation: portrait)";
  var MQ_PORTRAIT =
    "(min-width: 768px) and (max-width: 1366px) and (orientation: portrait)";

  function isTablet() {
    return window.matchMedia(MQ).matches;
  }

  function isPortrait() {
    return window.matchMedia(MQ_PORTRAIT).matches;
  }

  /* ── Portrait : refermer le bandeau d'options ───────────────────────
     En portrait, le panneau est un bandeau SOUS le produit : le refermer
     rend sa hauteur à l'aperçu. Le comportement d'origine ne le permet
     pas (togglePanel() n'ouvre que, choix assumé pour le desktop où la
     sidebar ne doit jamais être vide) — on l'ajoute donc ici, sans
     toucher à cette fonction.

     Un second clic sur l'onglet DÉJÀ actif referme le bandeau.
     En capture, avant le handler d'origine qui rouvrirait le panneau.  */

  function onRailClick(e) {
    if (!isPortrait()) return;

    var item = e.target.closest && e.target.closest(".icon-nav-item[data-panel]");
    if (!item) return;

    var id = item.getAttribute("data-panel");
    var panel = document.getElementById(id);
    if (!panel) return;

    // Onglet actif recliqué et bandeau ouvert : on referme.
    if (panel.classList.contains("open") && item.classList.contains("active")) {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.remove("open");
      item.classList.remove("active");
    }
  }

  /* Le tiroir du récapitulatif a été retiré : il n'avait qu'un point
     d'entrée, le bouton « Voir le détail », lui-même supprimé de la barre
     d'action. Le récapitulatif complet reste l'étape 2 du parcours
     (/pages/recapitulatif), atteignable par le stepper du header.
     Le panneau .recap est simplement masqué (voir conf-tablet.css). */

  /* ── Barre d'action : prix + Ajouter au panier ──
     Le récap étant masqué, sans cette barre il n'y aurait aucun moyen de
     commander. Elle est posée en bas de l'aperçu. */

  function buildActionBar() {
    if (!isTablet()) return;

    var canvas = document.querySelector(".canvas");
    if (!canvas) return;

    var bar = document.getElementById("tablet-actbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "tablet-actbar";
      bar.className = "tablet-actbar";
      /* Pas de bouton « Voir le détail » : le récapitulatif complet est
         l'étape 2 du parcours (/pages/recapitulatif), atteignable par le
         stepper du header. Un second point d'entrée juste à côté de
         « Ajouter au panier » ne faisait que diluer l'action principale. */
      bar.innerHTML =
        '<div class="tab-price"><span class="tab-lbl">Total</span></div>';

      canvas.appendChild(bar);
    } else if (bar.parentNode !== canvas) {
      canvas.appendChild(bar);
    }

    var priceBox = bar.querySelector(".tab-price");

    /* Prix : #rp-price-val (textile) ou .rp-total-section (autres). */
    var price =
      document.getElementById("rp-price-val") ||
      document.querySelector(".rp-total-section .rp-pval");
    if (price && priceBox && price.parentNode !== priceBox) {
      priceBox.appendChild(price);
    }

    /* Bouton d'ajout : seule action de la barre, il occupe toute la
       largeur restante à droite du prix. */
    var btn =
      document.getElementById("main-add-to-cart") ||
      document.querySelector(".rp-actions-coins .btn-cart") ||
      document.querySelector(".rp-acts .btn-cart");
    if (btn && btn.parentNode !== bar) bar.appendChild(btn);
  }

  /* Retour hors tablette : les nœuds regagnent le récap, sinon ils
     resteraient coincés dans une barre que le CSS n'affiche plus. */
  function teardown() {
    var recap = document.querySelector(".recap");
    if (recap) {
      var priceHost = recap.querySelector(".rp-price");
      var actsHost = recap.querySelector(".rp-acts, .rp-actions-coins");
      var price = document.getElementById("rp-price-val");
      var btn = document.getElementById("main-add-to-cart");

      if (price && priceHost && price.parentNode !== priceHost) {
        priceHost.appendChild(price);
      }
      if (btn && actsHost && btn.parentNode !== actsHost) {
        actsHost.appendChild(btn);
      }

      recap.classList.remove("open");
    }

    var bar = document.getElementById("tablet-actbar");
    if (bar) bar.remove();
  }

  /* ── Suivi des reconstructions ──────────────────────────────────────
     conf-dynamic-layout.js réécrit .canvas ET .recap en entier au
     changement de produit : nos ajouts sont détruits avec. */

  function watch() {
    var pending = false;
    var rebuild = function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        if (!isTablet()) return;
        buildActionBar();
        watchZoomEnd();   // .cv-single-view est neuf : réinstaller l'écouteur
      }, 60);
    };

    var canvas = document.querySelector(".canvas");
    if (canvas) {
      new MutationObserver(rebuild).observe(canvas, {
        childList: true,
        subtree: true,
      });
    }

    var recap = document.querySelector(".recap");
    if (recap) {
      new MutationObserver(rebuild).observe(recap, {
        childList: true,
        subtree: true,
      });
    }
  }

  /* ── Zones TABLETTE ─────────────────────────────────────────────────
     Même principe qu'en mobile : la tablette a ses PROPRES valeurs, sans
     conversion vers le desktop.

     Le layer est calé sur l'IMAGE dessinée (syncLayerToImage ci-dessous),
     référentiel stable qui ne dépend ni de la fenêtre ni du padding. Le
     desktop, lui, laisse le layer couvrir le conteneur — deux référentiels
     distincts, donc deux jeux de valeurs.

     Repère : le vêtement occupe ~68,6 % de la largeur de l'image (mesuré
     dans les PNG). Une zone de 38 % de l'image couvre donc ~55 % du torse.
     Valeurs de départ alignées sur le mobile ; à ajuster visuellement. */
  var CHEST_TABLET = { top: 31, width: 38, height: 9 };
  /* Dos réduit comme en mobile et en desktop (voir BACK_MOBILE,
     conf-mobile.js) : la surface floquable annoncée doit être la même sur les
     trois affichages. Sans cette reprise, le dos serait resté plus grand entre
     768 et 1023 px.

     Jeu SWEAT distinct, pour la même raison qu'en mobile : sa capuche occupe le
     haut du panneau dos et la zone mordait dessus. */
  var BACK_TABLET = { top: 22, width: 30.6, height: 40.6 };
  var BACK_TABLET_SWEAT = { top: 27.4, width: 33, height: 35.2 };

  /* Le produit courant est exposé par conf-main-inline.js. Repli sur `true` :
     le sweat est le produit affiché par défaut au chargement. */
  function isSweatProduct() {
    var t = window.currentProductType;
    if (t == null) return true;
    return String(t).indexOf("sweat") === 0;
  }

  /* Cale #logo-layer sur l'image réellement dessinée. */
  function syncLayerToImage() {
    var layer = document.getElementById("logo-layer");
    if (!layer) return;

    /* Hors tablette : on rend la main au CSS — mais SEULEMENT si c'est nous
       qui avions posé le calage.

       conf-mobile.js fait le même travail sur le même élément, et ses
       observateurs comme les nôtres tournent en permanence. Sans ce
       marqueur, notre branche « hors tablette » effaçait les styles que le
       mobile venait d'écrire : la zone disparaissait, réduite à un point. */
    if (!isTablet()) {
      if (layer.dataset.layerOwner === "tablet") {
        layer.style.left = "";
        layer.style.top = "";
        layer.style.width = "";
        layer.style.height = "";
        delete layer.dataset.layerOwner;
      }
      return;
    }

    var img = document.querySelector(".product-img-single.on");
    var host = document.querySelector(".cv-single-view");
    if (!img || !host) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    var hostR = host.getBoundingClientRect();
    var imgR = img.getBoundingClientRect();
    if (!hostR.width || !hostR.height || !imgR.width || !imgR.height) return;

    /* Rectangle du pixel VISIBLE : `object-fit: contain` garde le ratio, le
       reste de la boîte <img> est du vide. */
    var scale = Math.min(
      imgR.width / img.naturalWidth,
      imgR.height / img.naturalHeight,
    );
    var drawnW = img.naturalWidth * scale;
    var drawnH = img.naturalHeight * scale;

    layer.dataset.layerOwner = "tablet";   // voir la branche hors-tablette
    layer.style.left =
      Math.round(imgR.left - hostR.left + (imgR.width - drawnW) / 2) + "px";
    layer.style.top =
      Math.round(imgR.top - hostR.top + (imgR.height - drawnH) / 2) + "px";
    layer.style.width = Math.round(drawnW) + "px";
    layer.style.height = Math.round(drawnH) + "px";

    applyTabletZones();
  }

  /* Applique les zones tablette à window.LOGO_ZONES — la source de vérité,
     lue aussi par conf-text-zone.js et la contrainte de déplacement. Écrire
     seulement le rectangle guide élargirait le cadre sans libérer le logo. */
  function applyTabletZones() {
    if (!isTablet()) return;
    var Z = window.LOGO_ZONES;
    if (!Z) return;

    /* ── POITRINE ── */
    var cw = CHEST_TABLET.width;
    var cl = 50 - cw / 2;

    ["f", "fr"].forEach(function (k) {
      var z = Z[k];
      if (!z || z.zoneId !== "zone-chest") return;
      z.left = cl;
      z.top = CHEST_TABLET.top;
      z.width = cw;
      z.height = CHEST_TABLET.height;

      /* Départ d'un logo fraîchement posé : « cœur » à droite du bandeau
         (le cœur du porteur), « poitrine droite » à gauche. */
      var pad = cw * 0.06;
      var lw = z.maxW || 7.5;
      z.startLeft = k === "f" ? cl + cw - lw - pad : cl + pad;
    });

    var el = document.getElementById("zone-chest");
    if (el) {
      el.style.left = cl + "%";
      el.style.top = CHEST_TABLET.top + "%";
      el.style.width = cw + "%";
      el.style.height = CHEST_TABLET.height + "%";
    }

    /* ── DOS ──
       Jeu propre au SWEAT (capuche), comme en mobile et en desktop. */
    var BK = isSweatProduct() ? BACK_TABLET_SWEAT : BACK_TABLET;
    var bw = BK.width;
    var bl = 50 - bw / 2;
    var zb = Z["b"];
    if (zb) {
      zb.left = bl;
      zb.top = BK.top;
      zb.width = bw;
      zb.height = BK.height;
      zb.maxW = bw;               // borne la largeur du logo sur la zone
    }

    var elb = document.getElementById("zone-b");
    if (elb) {
      elb.style.left = bl + "%";
      elb.style.top = BK.top + "%";
      elb.style.width = bw + "%";
      elb.style.height = BK.height + "%";
    }

    reflowLogos();
  }

  /* Replace les logos DÉJÀ posés dans les zones qu'on vient de redéfinir.

     Sans cela, un visuel uploadé garde la position calculée sur les zones
     du desktop : placeLogoInZone() a tourné AVANT applyTabletZones(), donc
     sur d'autres bornes — le logo apparaissait hors de son cadre. */
  function reflowLogos() {
    if (typeof window.placeLogoInZone !== "function") return;
    var Z = window.LOGO_ZONES;
    if (!Z) return;

    /* Geste en cours : ne rien replacer. Ce garde manquait ici alors que la
       version mobile l a — le meme defaut existait donc entre 768 et 1023 px. */
    if (window.__logoManipulating) return;

    /* Geometrie deja enregistree ? Lue une seule fois pour tout le lot. */
    var store = (typeof window.readUploadStore === "function")
      ? window.readUploadStore()
      : null;
    var parProduit = (store && store.byProduct &&
                      store.byProduct[window.currentProductType]) || {};

    ["f", "fr", "b"].forEach(function (k) {
      var z = Z[k];
      if (!z) return;
      var logo = document.getElementById(z.logoId);
      if (!logo || logo.style.display === "none") return;
      var im = logo.querySelector("img");
      if (!im || !im.getAttribute("src")) return;
      /* BORNER plutot que REPLACER quand le client a deja regle ce logo :
         placeLogoInZone() recalcule position et taille depuis startW/startLeft
         et annulerait son geste. Meme raisonnement qu en mobile. */
      var dejaRegle = parProduit[k] && parProduit[k].geo;
      if (dejaRegle && typeof window.clampLogoToZone === "function") {
        window.clampLogoToZone(k);
      } else {
        window.placeLogoInZone(k);
      }
    });

    reflowTexts();
  }

  /* Même problème pour les TEXTES : clampTextToZone() les positionne à la
     création, avec les zones alors en vigueur (celles du desktop). Nos
     valeurs tablette arrivent après — le texte restait calé sur les
     anciennes bornes. Rejouer le clamp suffit à le replacer. */
  function reflowTexts() {
    if (typeof window.clampTextToZone !== "function") return;

    ["f", "fr", "b"].forEach(function (k) {
      var el = document.getElementById("text-" + k);
      if (!el || el.style.display === "none") return;
      window.clampTextToZone(k);
    });
  }

  /* Un texte AJOUTÉ après coup n'est pas couvert par reflowTexts() : la
     dernière application de zones a eu lieu avant sa création. Les éléments
     .design-text existent dès le HTML (masqués) et passent en
     `display: block` à l'ajout — on observe donc leur style. */
  /* Le zoom automatique anime `transform` sur .cv-single-view pendant 0,2 s.
     Toute mesure prise pendant ce laps porte sur une géométrie intermédiaire
     et pose l'élément à côté de sa zone. On attend la fin réelle de la
     transition plutôt que de deviner un délai. */
  function watchZoomEnd() {
    var view = document.querySelector(".cv-single-view");
    if (!view || view.dataset.zoomWatchedTab === "1") return;

    view.dataset.zoomWatchedTab = "1";
    view.addEventListener("transitionend", function (e) {
      if (e.propertyName !== "transform") return;
      if (!isTablet()) return;
      reflowTexts();
      reflowLogos();
    });
  }

  function watchTexts() {
    ["f", "fr", "b"].forEach(function (k) {
      var el = document.getElementById("text-" + k);
      if (!el) return;

      // Verrou : clampTextToZone() écrit dans `style`, ce qui rappellerait
      // l'observateur en boucle.
      var busy = false;

      new MutationObserver(function () {
        if (busy) return;
        if (!isTablet()) return;
        if (el.style.display === "none") return;
        if (typeof window.clampTextToZone !== "function") return;

        busy = true;
        requestAnimationFrame(function () {
          window.clampTextToZone(k);
          setTimeout(function () { busy = false; }, 0);
        });
      }).observe(el, { attributes: true, attributeFilter: ["style"] });
    });
  }

  /* Le recalage doit suivre tous les changements d'image : vue, produit,
     couleur — chacun remplace le src ou bascule la classe .on. */
  function watchImages() {
    var host = document.querySelector(".cv-single-view");
    if (!host) return;

    new MutationObserver(function () {
      requestAnimationFrame(syncLayerToImage);
    }).observe(host, {
      attributes: true,
      attributeFilter: ["class", "src", "style"],
      subtree: true,
    });

    // Un src fraîchement posé n'a ses dimensions qu'au load.
    document.querySelectorAll(".product-img-single").forEach(function (im) {
      im.addEventListener("load", syncLayerToImage);
    });

    window.addEventListener("resize", syncLayerToImage);
    window.addEventListener("orientationchange", function () {
      setTimeout(syncLayerToImage, 250);
    });
  }

  /* applyZonesForProduct() reconstruit LOGO_ZONES au changement de produit
     et réécrit les rectangles guides : nos valeurs seraient perdues.
     Le test de largeur évite la boucle — applyTabletZones() écrit elle-même
     ce style, ce que l'observateur détecterait aussitôt. */
  function watchZones() {
    var el = document.getElementById("zone-chest");
    if (!el) return;

    new MutationObserver(function () {
      if (!isTablet()) return;
      if (parseFloat(el.style.width) !== CHEST_TABLET.width) applyTabletZones();
    }).observe(el, { attributes: true, attributeFilter: ["style"] });
  }

  /* ── Init ───────────────────────────────────────────────────────── */

  function init() {
    if (isTablet()) buildActionBar();
    watch();

    watchImages();
    watchZones();
    watchTexts();
    watchZoomEnd();
    syncLayerToImage();
    setTimeout(syncLayerToImage, 800);   // après restauration de session

    /* Portrait : reclic sur l'onglet actif = referme le bandeau. */
    document.addEventListener("click", onRailClick, true);

    var mq = window.matchMedia(MQ);
    var onChange = function () {
      if (isTablet()) {
        buildActionBar();
      } else {
        teardown();
      }
      // Pose le calage en tablette, le retire ailleurs.
      syncLayerToImage();
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* Après conf-sidebar-modern.js et conf-dynamic-layout.js (tous en
     `defer`, donc dans l'ordre du document). */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(init, 0);
    });
  } else {
    setTimeout(init, 0);
  }
})();
