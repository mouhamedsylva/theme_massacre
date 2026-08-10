/* ═══════════════════════════════════════════════════════════════════════
   COMPORTEMENT MOBILE — 0 à 767 px
   ═══════════════════════════════════════════════════════════════════════

   Complète conf-mobile.css. La mise en page est faite en CSS ; ce fichier
   n'ajoute que ce que le CSS ne peut pas faire :

     1. Une poignée pour REFERMER la feuille montante.
        En desktop, un panneau reste toujours ouvert (choix assumé, voir
        togglePanel() dans conf-sidebar-modern.js). En mobile la feuille
        couvre le produit : il FAUT pouvoir la fermer.

     2. Un voile qui ferme au tap, et le glissement vers le bas.

     3. Empêcher l'ouverture automatique au chargement : conf-sidebar-modern.js
        appelle openPanel("panel-product") au boot, ce qui masquerait le
        produit dès l'arrivée sur la page.

   PRINCIPE : on ne modifie AUCUNE fonction existante. On observe la classe
   .open et on ajoute nos propres éléments. Le desktop n'est jamais touché
   (toutes les actions sont derrière isMobile()).
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var MQ = "(max-width: 767px)";

  function isMobile() {
    return window.matchMedia(MQ).matches;
  }

  /* ── Ouverture automatique au boot ──────────────────────────────────
     conf-sidebar-modern.js ouvre « Type de produit » au chargement. Sur
     mobile, cela recouvrirait le produit avant même la première action.
     On referme donc la feuille tant que l'utilisateur n'a rien demandé.

     `userOpened` bascule au premier clic sur un bouton du rail : à partir
     de là, les ouvertures sont volontaires et on ne les contrarie plus.  */
  var userOpened = false;

  function closeAllPanels() {
    document.querySelectorAll(".side-panel.open").forEach(function (p) {
      p.classList.remove("open");
    });
    document.querySelectorAll(".icon-nav-item.active").forEach(function (i) {
      i.classList.remove("active");
    });
  }

  /* ── Voile ────────────────────────────────────────────────────────── */

  function getScrim() {
    var s = document.getElementById("sheet-scrim");
    if (!s) {
      s = document.createElement("div");
      s.id = "sheet-scrim";
      s.className = "sheet-scrim";
      s.addEventListener("click", closeSheet);
      document.body.appendChild(s);
    }
    return s;
  }

  function showScrim(on) {
    var s = getScrim();
    // Force un reflow pour que la transition d'opacité démarre bien.
    if (on) {
      s.offsetHeight;
      s.classList.add("show");
    } else {
      s.classList.remove("show");
    }
  }

  /* ── Fermeture ────────────────────────────────────────────────────── */

  function closeSheet() {
    if (!isMobile()) return;
    closeAllPanels();
    showScrim(false);
  }

  /* ── Poignée : injectée en haut de chaque panneau ──────────────────
     Placée en premier enfant pour rester au-dessus du contenu qui défile. */

  function addHandle(panel) {
    if (panel.querySelector(".sheet-handle")) return;

    var h = document.createElement("div");
    h.className = "sheet-handle";
    h.setAttribute("role", "button");
    h.setAttribute("aria-label", "Fermer le panneau");
    h.addEventListener("click", closeSheet);

    attachDrag(h, panel);
    panel.insertBefore(h, panel.firstChild);
  }

  /* ── Glissement vers le bas pour fermer ────────────────────────────
     Sous ~90 px on repose le panneau, au-delà on ferme. Le seuil évite
     qu'un simple appui maladroit referme la feuille.                    */

  function attachDrag(handle, panel) {
    var startY = 0;
    var delta = 0;
    var dragging = false;

    handle.addEventListener(
      "touchstart",
      function (e) {
        if (!isMobile()) return;
        dragging = true;
        delta = 0;
        startY = e.touches[0].clientY;
        panel.style.transition = "none";
      },
      { passive: true },
    );

    handle.addEventListener(
      "touchmove",
      function (e) {
        if (!dragging) return;
        delta = e.touches[0].clientY - startY;
        // Vers le haut : rien. La feuille a une hauteur fixe.
        if (delta < 0) delta = 0;
        panel.style.transform = "translateY(" + delta + "px)";
      },
      { passive: true },
    );

    function end() {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = "";
      panel.style.transform = "";
      if (delta > 90) closeSheet();
    }

    handle.addEventListener("touchend", end);
    handle.addEventListener("touchcancel", end);
  }

  /* ── Synchronisation du voile avec l'état des panneaux ─────────────
     openPanel()/closePanel() de conf-sidebar-modern.js posent ou retirent
     .open sans rien nous signaler. Plutôt que de les remplacer (risque de
     casser le desktop), on OBSERVE la classe : le comportement d'origine
     reste seul maître de l'ouverture.                                    */

  function syncScrim() {
    if (!isMobile()) {
      showScrim(false);
      return;
    }
    var open = document.querySelector(".side-panel.open");

    // Ouverture non sollicitée au chargement : on la referme.
    if (open && !userOpened) {
      closeAllPanels();
      showScrim(false);
      return;
    }
    showScrim(!!open);
  }

  function observePanels() {
    var obs = new MutationObserver(syncScrim);
    document.querySelectorAll(".side-panel").forEach(function (p) {
      obs.observe(p, { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* ── Fermeture au clic à l'extérieur ────────────────────────────────
     Le voile suffirait en théorie, mais il ne couvre pas les éléments qui
     lui passent devant (barre d'action, rail, colonne de vues) et dépend de
     l'ordre d'exécution des scripts. On écoute donc le document : tout clic
     hors de la feuille la referme.

     En phase de CAPTURE, sinon un `stopPropagation()` d'un autre handler
     nous priverait de l'événement.

     Exceptions — ne PAS fermer si le clic vise :
       • la feuille elle-même,
       • le rail (c'est lui qui ouvre : fermer ici annulerait l'ouverture au
         même clic),
       • une modale ou un menu ouvert par-dessus (couleur, taille, guide…),
         sinon on refermerait la feuille sous les pieds de l'utilisateur.  */

  function onDocPointerDown(e) {
    if (!isMobile()) return;
    if (!document.querySelector(".side-panel.open")) return;

    var t = e.target;
    if (!t || !t.closest) return;

    if (
      t.closest(".side-panel") ||
      t.closest(".icon-nav") ||
      t.closest(".cv-opt-pop") ||
      t.closest(".cv-opts") ||
      t.closest(".modal-overlay") ||
      t.closest(".sg-modal-overlay") ||
      t.closest(".size-qty-overlay") ||
      t.closest(".simple-grp-overlay") ||
      t.closest(".grp-overlay") ||
      t.closest(".grp-preview-overlay") ||
      t.closest(".qm-overlay") ||
      t.closest(".cart-overlay") ||
      t.closest(".ov-overlay")
    ) {
      return;
    }

    closeSheet();
  }

  /* ── Barre d'action : prix + « Ajouter au panier » ──────────────────
     Le récap est masqué en mobile (voir conf-mobile.css §6) : sans cette
     barre, plus aucun moyen de commander.

     On DÉPLACE les nœuds réels au lieu de les cloner. Un clone aurait exigé
     de dupliquer la mise à jour du prix et le onclick ; en déplaçant, tout
     le code existant (addToCart, refreshPrice…) continue de viser les mêmes
     éléments, par leurs mêmes IDs.

     Les produits coins/drapeaux/patchs réécrivent .recap.innerHTML en
     entier : nos nœuds y sont alors recréés (donc de nouveau à l'intérieur
     du récap masqué). D'où la réinstallation après chaque réécriture, via
     l'observateur ci-dessous.                                            */

  /* Hauteur de la barre d'options (.icon-nav, ancrée en bas). Elle varie :
     libellés sur une ou deux lignes, 3 boutons ou 4 selon la catégorie.
     Le canvas s'en sert pour réserver la place (--nav-h) et la barre elle-
     même est collée au bord bas de l'écran. */
  function measureNav() {
    var nav = document.querySelector(".icon-nav");
    if (!nav) return;
    if (!isMobile()) {
      document.documentElement.style.removeProperty("--nav-h");
      return;
    }
    var h = nav.getBoundingClientRect().height;
    if (h) {
      document.documentElement.style.setProperty(
        "--nav-h",
        Math.round(h) + "px",
      );
    }
  }

  /* Prix et bouton d'ajout reportés dans le HEADER : le bas de l'écran est
     pris par le menu d'options, et le récap est masqué. Sans ce report, il
     n'y aurait plus aucun moyen de commander depuis le mobile.

     On DÉPLACE les nœuds réels — pas de clone : le code existant
     (addToCart, mise à jour du prix) vise les mêmes IDs et continue donc
     d'opérer tel quel. */
  /* ── Garde de réentrance ────────────────────────────────────────────────
     `fillActionBar` ÉCRIT dans `.recap` : elle y rend `#main-add-to-cart` à son
     hôte `.rp-acts` (voir la purge des éléments déjà déplacés, plus bas). Or
     `observeRecap()` observe `.recap` en `childList + subtree`. Sans garde, le
     cycle est : fillActionBar → appendChild dans .recap → mutation → observer →
     fillActionBar → … L'onglet meurt en quelques secondes.

     Mesuré avant correctif : 3004 mutations en 3 s, puis « Target crashed ».
     C'est ce qui produisait l'écran noir et le rechargement sans fin (le
     navigateur relance l'onglet planté).

     Le verrou est posé sur LA FONCTION, pas sur l'observer : quatre endroits
     l'appellent (`observeRecap`, l'observer du canvas, `init`, `onChange`), et
     un garde par appelant serait oublié au prochain ajout.

     Même motif que `syncing` dans conf-coin-toolbar.js:436. */
  var _fabEnCours = false;

  /* Horodatage de la dernière écriture. Le verrou synchrone ci-dessus ne suffit
     pas : les MutationObserver sont notifiés en MICROTÂCHE, donc APRÈS que
     `_fabEnCours` soit repassé à false. Il faut aussi que l'observer sache
     ignorer les mutations que nous venons de provoquer. */
  var _fabDerniereEcriture = 0;

  function fillActionBar() {
    if (_fabEnCours) return;
    _fabEnCours = true;
    try {
      fillActionBarInterne();
    } finally {
      /* `finally` obligatoire : une exception dans le corps ne doit pas laisser
         le verrou fermé — la barre ne se reconstruirait plus jamais. */
      _fabEnCours = false;
      _fabDerniereEcriture = Date.now();
    }
  }

  function fillActionBarInterne() {
    if (!isMobile()) return;

    /* Ancrés dans .canvas (et non dans le header) : le prix se pose en bas
       à gauche de l'aperçu, le bouton d'ajout en pastille flottante en bas
       à droite. Le header ne garde que le panier — lequel a sa propre
       logique et ne s'affiche qu'une fois un article ajouté. */
    var canvas = document.querySelector(".canvas");
    if (!canvas) return;

    /* Prix et bouton du produit COURANT.

       Chaque récap expose des éléments DIFFÉRENTS : les gabarits injectés par
       conf-dynamic-layout.js utilisent `.rp-unit-price-big` et
       `.rp-btn-primary`, là où le textile a `#rp-price-val` et
       `#main-add-to-cart`. `.recap` étant masqué en mobile, ces éléments sont
       DÉPLACÉS ici, dans `.canvas`.

       On les cherche DANS `.recap`, jamais dans `.canvas` ni dans le document
       entier : un élément déjà déplacé n'est plus enfant du récap, donc
       `recap.innerHTML = …` (reconstruction au changement de produit) ne le
       supprime pas. Il survivrait indéfiniment et masquerait celui du produit
       courant — c'est ce qui empêchait la modale de devis des coins de
       s'ouvrir : le tap atteignait le bouton textile resté en place. */
    var recapNow = document.querySelector(".recap");

    /* Purge des éléments déjà déplacés : on les REND à leur hôte d'origine, on
       ne les détruit JAMAIS.

       Le défaut corrigé : cette boucle ne rendait que `#main-add-to-cart`,
       reconnu par son `id`. Tous les autres boutons partaient par la branche
       `else` — donc `canvas.removeChild()`. Mesuré :

         textile   fab=1  « Ajouter au panier »
         coins     fab=0  ← DÉTRUIT « DEMANDER UN DEVIS »
         patches   fab=0  ← DÉTRUIT « AJOUTER AU PANIER »

       Pourquoi la destruction est fatale : `fillActionBar` cherche le bouton
       DANS `.recap`. Le premier appel l'en retire pour le poser dans `.canvas` ;
       l'observer du canvas rappelle la fonction 60 ms plus tard (4 appels par
       bascule, mesuré), la purge le détruit, et la recherche qui suit ne trouve
       plus rien — ni dans `.recap`, ni ailleurs. Aucun bouton.

       Le textile échappait au défaut UNIQUEMENT parce que son bouton a un `id`
       traité en cas particulier.

       Correctif : mémoriser l'hôte au moment du déplacement (`data-fabHome`),
       et le rendre à cet hôte ici. La fonction devient idempotente — la
       rappeler ne détruit plus ce qu'elle a placé. Si le gabarit a changé et
       que l'hôte n'existe plus, on retombe sur la destruction : le nœud
       appartient alors à un produit qui n'est plus affiché. */
    var stale = canvas.querySelectorAll(".mobile-fab");
    for (var s = 0; s < stale.length; s++) {
      var old = stale[s];
      old.classList.remove("mobile-fab", "mobile-fab-solo");

      /* SEUL `#main-add-to-cart` est rendu à son hôte : il est écrit en dur dans
         le template (sections/configurateur.liquid:846) et n'est JAMAIS
         régénéré. Le détruire le ferait disparaître définitivement.

         Les autres boutons viennent de gabarits que le layout dynamique
         RÉÉCRIT à chaque bascule : un exemplaire neuf existe déjà dans `.recap`,
         donc les rendre est non seulement inutile, mais NUISIBLE.

         Pourquoi nuisible — défaut mesuré : les trois gabarits (coins, drapeaux,
         patchs) utilisent le MÊME nom d'hôte `.rp-actions-coins`. Rendre un
         ancien bouton à ce nom le faisait cohabiter avec le nouveau, et
         `querySelector` prend le PREMIER — donc l'ancien. Sur l'écran Patchs on
         obtenait « AJOUTER AU PANIER » avec `onclick="addCustomToCart(this)"`
         au lieu de « DEMANDER UN DEVIS » : le tap ajoutait au panier un article
         vendu sur devis, ou ne faisait rien.

         Le prix, lui, n'a pas besoin de ce mécanisme : il est retrouvé par la
         recherche à deux endroits (`.recap` PUIS `#mobile-price`, voir plus
         bas), ce qui rend la fonction idempotente sans rien déplacer en
         arrière. */
      /* Ne détruire QUE si `.recap` contient déjà un remplaçant.

         La purge s'exécute AVANT la recherche du bouton (plus bas). Détruire
         sans condition rendait donc le bouton introuvable ensuite : il n'était
         plus ni dans `.recap` (retiré au 1ᵉʳ appel) ni dans `.canvas` (détruit
         ici). Mesuré : fab=0 sur coins, drapeaux ET patchs.

         Le test « un remplaçant existe-t-il ? » tranche les deux cas :
           - changement de PRODUIT : le layout a réécrit `.recap`, un bouton neuf
             y est présent → l'ancien est obsolète, on le détruit ;
           - simple rappel de la fonction : `.recap` est vide de bouton (il a été
             déplacé) → on garde celui-ci, la recherche le retrouvera.

         C'est ce qui remplace le `data-fabHome` d'une version précédente : celui-ci
         rendait l'ancien bouton à son hôte, mais les trois gabarits partagent le
         nom `.rp-actions-coins` — l'ancien et le nouveau cohabitaient, et
         `querySelector` prenait le premier. Sur l'écran Patchs on obtenait ainsi
         « AJOUTER AU PANIER » avec `onclick="addCustomToCart(this)"` au lieu du
         bouton attendu. */
      var remplacant = recapNow && (
        recapNow.querySelector(".rp-actions-coins .rp-btn-primary") ||
        recapNow.querySelector(".rp-btn-primary") ||
        recapNow.querySelector(".rp-acts #main-add-to-cart") ||
        recapNow.querySelector(".rp-acts .btn-cart")
      );

      if (old.id === "main-add-to-cart") {
        /* Écrit en dur dans le template, jamais régénéré : on le REND à son hôte
           plutôt que de le détruire (sections/configurateur.liquid:846). */
        var hote = recapNow ? recapNow.querySelector(".rp-acts") : null;
        if (hote) hote.appendChild(old);
      } else if (remplacant && old.parentNode === canvas) {
        canvas.removeChild(old);
      }
    }

    /* Le prix du produit courant, cherché dans DEUX endroits.

       Pourquoi deux : `fillActionBar` DÉPLACE le prix de `.recap` vers
       `#mobile-price`. Ne chercher que dans `.recap` rendait la fonction non
       idempotente — or l'observer du canvas la rappelle en boucle (22 appels
       pour une seule bascule de produit, mesuré).

       Le défaut que cela provoquait : appel 1 déplace `#flags-unit-price` hors
       de `.recap` ; appel 2 ne le trouve plus, donc `price` est null et la
       branche `else` supprime le bloc — emportant le prix. Trace de
       l'instrumentation :

         « bloc prix supprimé, contenait : Total19,90 € TTC »
         #flags-unit-price final : false  ← DÉTRUIT

       Le prix des drapeaux disparaissait ainsi définitivement, et celui des
       patchs alternait entre présent et absent.

       En regardant aussi dans `#mobile-price`, un prix déjà déplacé est reconnu
       comme le prix courant : la fonction devient idempotente. Le `.recap` reste
       prioritaire, pour qu'un changement de produit prenne bien le nouveau
       gabarit ; le bloc n'est consulté qu'en second, comme mémoire de ce qu'on a
       déjà posé. */
    var boxNow = document.getElementById("mobile-price");
    var chercher = function (sel) {
      return (recapNow && recapNow.querySelector(sel))
        || (boxNow && boxNow.querySelector(sel))
        || null;
    };

    var price =
      chercher("#coins-unit-price") ||   // écran « Coins » = PATCHS
      chercher("#flags-unit-price") ||   // drapeaux
      chercher(".rp-unit-price-big") ||
      chercher(".rp-total-price") ||
      chercher("#rp-price-val");         // textile, en dernier

    var box = document.getElementById("mobile-price");

    if (price) {
      if (!box) {
        box = document.createElement("div");
        box.id = "mobile-price";
        box.className = "mobile-price";
        box.innerHTML = '<span class="mp-lbl">Total</span>';
        canvas.appendChild(box);
      } else if (box.parentNode !== canvas) {
        canvas.appendChild(box);
      }
      box.appendChild(price);
    } else if (box) {
      /* Produit SANS prix (les coins sont sur devis) : le bloc doit DISPARAÎTRE.
         Sans ce retrait il conservait l'étiquette « Total » et le montant du
         produit précédent — mesuré : 19,90 € du drapeau restait affiché sur
         l'écran coins, un prix sur un article non chiffré. */
      box.remove();
    }

    /* Bouton : produit courant d'abord, textile en dernier.

       Cherché dans `.recap` PUIS dans `.canvas`, exactement comme le prix
       ci-dessus et pour la même raison : `fillActionBar` DÉPLACE le bouton hors
       de `.recap`, et l'observer du canvas la rappelle en boucle (22 appels par
       bascule, mesuré). Ne regarder que `.recap` la rendait non idempotente — au
       2ᵉ appel le bouton n'était plus trouvable, et la purge le détruisait.

       Mesuré avant correctif :
         textile   fab=1  « Ajouter au panier »
         coins     fab=0  ← DÉTRUIT
         drapeaux  fab=0  ← DÉTRUIT
         patches   fab=0  ← DÉTRUIT

       Le textile y échappait parce que son bouton (`#main-add-to-cart`) est
       rendu à `.rp-acts` par la purge, étant écrit en dur dans le template.

       `.recap` reste PRIORITAIRE : au changement de produit, le layout y écrit
       un gabarit neuf, et c'est ce bouton-là qu'il faut prendre. `.canvas` n'est
       consulté qu'ensuite, comme mémoire de ce qui a déjà été posé. */
    var chercherBtn = function (sel) {
      return (recapNow && recapNow.querySelector(sel))
        || canvas.querySelector(sel)
        || null;
    };

    var btn =
      chercherBtn(".rp-actions-coins .rp-btn-primary") ||
      chercherBtn(".rp-btn-primary") ||
      chercherBtn(".rp-acts #main-add-to-cart") ||
      chercherBtn(".rp-acts .btn-cart") ||
      /* Déjà déplacé, le bouton textile a perdu son parent `.rp-acts` : on le
         retrouve par son id seul. Sans ce dernier recours il disparaîtrait de
         l'écran textile au 2ᵉ appel. */
      canvas.querySelector("#main-add-to-cart");

    if (btn) {
      btn.classList.add("mobile-fab");
      /* Sans bloc prix (coins, sur devis), le bouton prend toute la largeur :
         réserver la place d'un montant absent laisserait un vide à gauche. */
      btn.classList.toggle("mobile-fab-solo", !price);
      canvas.appendChild(btn);
    }

    measureNav();
    measurePrice();
    watchPrice();
  }

  /* Largeur du bloc prix, posé PAR-DESSUS le bouton d'ajout (les deux sont
     ancrés à gauche). Le bouton s'en sert comme marge pour que son libellé
     ne passe pas dessous.

     Mesurée plutôt que codée en dur : « 9,90 € » et « 1 250,00 € »
     n'occupent pas la même place, et le montant change à chaque option. */
  function measurePrice() {
    var box = document.getElementById("mobile-price");
    if (!box) return;
    if (!isMobile()) {
      document.documentElement.style.removeProperty("--mp-w");
      return;
    }
    var w = box.getBoundingClientRect().width;
    if (w) {
      document.documentElement.style.setProperty(
        "--mp-w",
        Math.ceil(w) + "px",
      );
    }
  }

  /* Le montant change à chaque option (couleur, taille, manches, quantité) :
     sa largeur aussi. On remesure pour que la marge du bouton suive. */
  function watchPrice() {
    var box = document.getElementById("mobile-price");
    if (!box || box.dataset.widthWatched === "1") return;

    box.dataset.widthWatched = "1";
    new MutationObserver(function () {
      requestAnimationFrame(measurePrice);
    }).observe(box, { childList: true, characterData: true, subtree: true });

    window.addEventListener("resize", measurePrice);
  }

  /* Le récap est réécrit par le layout dynamique : on replace nos nœuds
     dès que son contenu change. */
  function observeRecap() {
    var recap = document.querySelector(".recap");
    if (!recap) return;
    var obs = new MutationObserver(function () {
      /* Ignorer NOS PROPRES écritures. `fillActionBar` rend `#main-add-to-cart`
         à `.rp-acts`, donc dans `.recap` — le nœud même qu'on observe ici.

         Le verrou `_fabEnCours` ne suffit pas : les MutationObserver sont
         notifiés en microtâche, donc après que le verrou soit relâché. Sans ce
         filtre, chaque exécution se redéclenche et l'onglet plante (mesuré :
         3004 mutations en 3 s).

         250 ms couvre le lot de mutations d'un même appel — `fillActionBar`
         déplace 2 ou 3 nœuds, tout est livré dans la même tâche. Une vraie
         réécriture du récap par le layout dynamique arrive sur action
         utilisateur (changement de produit, de quantité), jamais dans les
         250 ms qui suivent notre propre écriture : elle n'est donc pas
         masquée. */
      if (Date.now() - _fabDerniereEcriture < 250) return;
      if (isMobile()) fillActionBar();
    });
    obs.observe(recap, { childList: true, subtree: true });
  }

  /* Retour en desktop : le prix et le bouton doivent regagner le récap,
     sinon ils resteraient coincés dans le header — où le CSS desktop ne
     les attend pas (et où le récap, redevenu visible, les afficherait en
     double s'ils avaient été clonés ; ils ne le sont pas, ils manqueraient
     donc simplement à leur place). */
  function removeActionBar() {
    var recap = document.querySelector(".recap");
    if (!recap) return;

    /* On récupère les éléments DÉPLACÉS, pas ceux du textile : fillActionBar
       sort le prix et le bouton du produit courant, qui peut être un patch, un
       drapeau ou un coin. Ne chercher que #rp-price-val / #main-add-to-cart
       laissait ces trois-là coincés hors du récap au retour en desktop. */
    var canvasNow = document.querySelector(".canvas");
    var price = document.getElementById("mobile-price");
    price = price ? price.querySelector(".rp-unit-price-big, #rp-price-val, [id$='-unit-price']") : null;
    var btn = canvasNow ? canvasNow.querySelector(".mobile-fab") : null;

    var priceHost = recap.querySelector(".rp-price, .rp-total-section, .rp-section");
    var actsHost = recap.querySelector(".rp-acts, .rp-actions-coins");

    if (price && priceHost && price.parentNode !== priceHost) {
      priceHost.appendChild(price);
    }
    if (btn && actsHost && btn.parentNode !== actsHost) {
      // Ces classes portent toute la mise en forme flottante : elles doivent partir.
      btn.classList.remove("mobile-fab", "mobile-fab-solo");
      actsHost.appendChild(btn);
    }

    // L'étiquette « Total » n'a plus d'objet une fois le prix reparti.
    var box = document.getElementById("mobile-price");
    if (box) box.remove();

    document.documentElement.style.removeProperty("--nav-h");
    document.documentElement.style.removeProperty("--mp-w");
  }

  /* ── Zones : aucune intervention JS ─────────────────────────────────
     Le mobile reproduit la géométrie desktop en CSS — image en `height`
     viewport + `width: auto`, layer en `inset: 0` sur le conteneur — donc
     les zones de buildZones() tombent au même endroit des deux côtés.

     Cette fonction ne fait plus qu'EFFACER les styles inline qu'écrivaient
     les versions antérieures : plus prioritaires que le CSS, ils
     maintiendraient sinon l'ancien calage sur l'image dessinée.

     Elle reste appelée depuis watchImages() : point d'accroche si un
     recalage redevient nécessaire. */
  /* Cale #logo-layer sur l'IMAGE RÉELLEMENT DESSINÉE.

     C'est le référentiel le plus stable : il ne dépend ni de la taille de
     la fenêtre, ni du padding du conteneur. Une zone à 50 % y signifie
     toujours « la moitié de la largeur de l'image », sur tout écran.

     Le desktop, lui, laisse le layer couvrir le conteneur (inset: 0) où
     l'image flotte avec des marges variables. Les deux référentiels sont
     donc différents, et les zones mobile ont leurs PROPRES valeurs (voir
     CHEST_MOBILE / BACK_MOBILE) — aucune conversion entre les deux : les
     tentatives précédentes de faire coïncider les pourcentages ont toutes
     échoué, parce que le rapport image/conteneur du desktop n'est pas une
     constante. */
  function syncLayerToImage() {
    var layer = document.getElementById("logo-layer");
    if (!layer) return;

    /* Hors mobile : on rend la main au CSS — mais SEULEMENT si c'est nous
       qui avions posé le calage.

       conf-tablet.js fait le même travail sur le même élément, et ses
       observateurs comme les nôtres tournent en permanence. Sans ce
       marqueur, chacun effacerait les styles de l'autre. */
    if (!isMobile()) {
      if (layer.dataset.layerOwner === "mobile") {
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

    /* Dimensions de MISE EN PAGE (offset*), et non getBoundingClientRect().

       Le zoom (autoZoomTo, conf-main-inline.js) pose un `transform: scale()`
       sur .cv-single-view. getBoundingClientRect() renvoie la boîte APRÈS
       transformation : à 200 %, l'image était mesurée deux fois trop grande.
       Or #logo-layer est ENFANT de .cv-single-view — il subit déjà ce même
       scale. Écrire ces pixels agrandis le rendait donc doublement zoomé, et
       les zones (manches en particulier) étaient projetées hors du visuel :
       elles disparaissaient de l'écran dès que la vue se rapprochait.

       offsetWidth/offsetHeight ignorent les transforms : ils décrivent la
       géométrie non zoomée, exactement le référentiel dans lequel le layer
       est positionné. Le zoom s'applique ensuite aux deux de la même façon,
       et le calage reste juste à tout niveau. */
    var hostW = host.offsetWidth;
    var hostH = host.offsetHeight;
    var imgW = img.offsetWidth;
    var imgH = img.offsetHeight;
    if (!hostW || !hostH || !imgW || !imgH) return;

    /* Rectangle du PIXEL VISIBLE : `object-fit: contain` conserve le ratio,
       le reste de la boîte <img> est du vide. */
    var scale = Math.min(imgW / img.naturalWidth, imgH / img.naturalHeight);
    var drawnW = img.naturalWidth * scale;
    var drawnH = img.naturalHeight * scale;

    /* Position de l'image dans le conteneur, elle aussi hors transform :
       offsetLeft/offsetTop sont relatifs au parent positionné (.cv-single-view). */
    layer.dataset.layerOwner = "mobile";   // voir la branche hors-mobile

    var next = {
      left: Math.round(img.offsetLeft + (imgW - drawnW) / 2) + "px",
      top: Math.round(img.offsetTop + (imgH - drawnH) / 2) + "px",
      width: Math.round(drawnW) + "px",
      height: Math.round(drawnH) + "px",
    };

    /* N'écrire QUE si la valeur change. #logo-layer est dans le sous-arbre
       observé par watchImages(), et l'attribut `style` en fait partie : une
       réécriture — même à l'identique — déclenche une mutation, donc un
       nouveau syncLayerToImage. La boucle était amortie par
       requestAnimationFrame (une passe par frame, jamais infinie) mais
       tournait en continu à 60 fps sans rien changer. */
    Object.keys(next).forEach(function (k) {
      if (layer.style[k] !== next[k]) layer.style[k] = next[k];
    });

    /* Les zones sont recalculées même sans changement de géométrie : un
       changement de VUE (data-view / data-side) ne déplace pas le calque
       mais change les zones à afficher. */
    applyMobileZones();
  }
  // Exposée : utile au débogage et si un autre script change de vue.
  window.syncLayerToImage = syncLayerToImage;

  /* Le recalage doit suivre TOUS les changements d'image : changement de
     vue (face/dos/côté), de produit, de couleur — chacun remplace le src ou
     bascule la classe .on. On observe donc les <img> plutôt que d'essayer
     de se brancher sur chaque fonction appelante. */
  function watchImages() {
    var host = document.querySelector(".cv-single-view");
    if (!host) return;

    var obs = new MutationObserver(function () {
      // L'image change : on attend qu'elle soit décodée pour mesurer.
      requestAnimationFrame(syncLayerToImage);
    });
    /* `data-view` / `data-side` sont indispensables : le changement de VUE
       (face/dos/côté) et la bascule manche gauche/droite ne passent que par
       ces attributs, posés sur #logo-layer par conf-view-switcher.js et
       conf-sleeve-side.js. Sans eux, syncLayerToImage() — et donc
       applyMobileZones(), qui recalcule les zones — n'était jamais rejouée
       au passage sur une manche : les zones gardaient les valeurs de la vue
       précédente et tombaient hors du visuel. */
    obs.observe(host, {
      attributes: true,
      attributeFilter: ["class", "src", "style", "data-view", "data-side"],
      subtree: true,
    });

    // Un src fraîchement posé n'a ses dimensions qu'au load.
    document.querySelectorAll(".product-img-single").forEach(function (im) {
      im.addEventListener("load", syncLayerToImage);
    });

    window.addEventListener("resize", function () {
      measureNav();
      syncLayerToImage();
    });
    window.addEventListener("orientationchange", function () {
      setTimeout(function () {
        measureNav();
        syncLayerToImage();
      }, 250);
    });
  }

  /* La barre d'options change de hauteur quand une catégorie ajoute son
     bouton (Options Coin / Drapeau / Patch) : refreshCategoryUI() bascule
     leur `display`. On remesure alors, et on recale les zones — la place
     disponible pour le produit vient de changer. */
  function watchNav() {
    var nav = document.querySelector(".icon-nav");
    if (!nav) return;
    var obs = new MutationObserver(function () {
      measureNav();
      requestAnimationFrame(syncLayerToImage);
    });
    obs.observe(nav, {
      attributes: true,
      attributeFilter: ["style", "class"],
      subtree: true,
    });
  }

  /* ── Fermeture après le choix d'un produit ──────────────────────────
     Le choix fait, la feuille n'a plus de raison de masquer l'aperçu : on
     la referme pour montrer le résultat.

     Écouté ici plutôt que dans selectProduct() — cette fonction est
     partagée avec le desktop, où la sidebar doit au contraire rester
     ouverte en permanence.

     En BULLE (pas en capture) : le handler d'origine s'exécute d'abord,
     le produit est donc déjà changé quand on ferme. Le petit délai laisse
     voir la coche de sélection avant que la feuille ne descende.         */

  function onPanelSelect(e) {
    if (!isMobile()) return;
    var t = e.target;
    if (!t || !t.closest) return;

    // Uniquement depuis une feuille ouverte.
    if (!t.closest(".side-panel.open")) return;

    // Le choix d'un PRODUIT ferme la feuille : c'est une action terminale.
    // Couleur et taille ne la ferment pas — on en essaie souvent plusieurs
    // à la suite, et le résultat se voit derrière la feuille.
    if (t.closest(".product-card")) {
      setTimeout(closeSheet, 180);
      return;
    }

    /* « Ajouter au design » (texte) : action terminale elle aussi. En
       desktop le panneau reste ouvert volontairement — le client enchaîne
       souvent sur un second texte (voir addTextToDesign) — mais en mobile
       la feuille COUVRE le produit : sans fermeture, il ne voit pas ce
       qu'il vient de poser.

       Le délai laisse le texte s'insérer avant que la feuille ne descende ;
       le zoom suit, pour que le résultat soit lisible sur petit écran. */
    if (t.closest("#mtxt-add-btn")) {
      setTimeout(function () {
        closeSheet();
        /* PAS de zoom automatique ici : il applique un `transform: scale()`
           animé sur .cv-single-view, et toute mesure prise pendant
           l'animation (clampTextToZone) place le texte à côté de sa zone.
           Le client zoome lui-même s'il le souhaite.
           On replace le texte une fois la feuille refermée. */
        setTimeout(reflowTexts, 260);
      }, 200);
    }
  }

  /* Upload d'image : la feuille se referme dès qu'un fichier est retenu.

     On écoute le `change` des <input type="file"> plutôt que le clic sur le
     bouton : le client peut ouvrir le sélecteur puis annuler, auquel cas
     rien ne doit bouger. Le zoom est déjà déclenché par doUpload().

     Le délai couvre la fenêtre de suppression d'arrière-plan, qui s'ouvre
     par-dessus : fermer avant elle la ferait disparaître avec la feuille. */
  function watchUploads() {
    document
      .querySelectorAll('#conf-app-root input[type="file"], input[type="file"]')
      .forEach(function (inp) {
        inp.addEventListener("change", function () {
          if (!isMobile()) return;
          if (!inp.files || !inp.files.length) return;
          setTimeout(closeSheet, 400);
        });
      });
  }

  /* ── Bascule RECTO / VERSO (drapeaux, coins, patchs) ────────────────
     Ces produits posent leurs deux faces côte à côte. Sur une largeur de
     téléphone, chacune devient minuscule et déborde. On n'en montre donc
     qu'une, sélectionnée par une bascule placée en haut de l'aperçu.

     Le masquage est fait en CSS, piloté par l'attribut `data-face-active`
     sur la scène — aucun style inline sur les faces, donc rien n'entre en
     conflit avec le code produit qui les manipule déjà.                  */

  /* ── Nature du canvas courant ───────────────────────────────────────
     .cv-canvas-row héberge deux structures incompatibles : le textile (une
     image en absolu qui couvre la ligne) et les autres produits (une scène
     enfant flex). Le CSS a besoin de les distinguer ; on le lui dit via un
     attribut plutôt que par :has(), dont on ne veut pas dépendre.         */

  function tagCanvasRow() {
    var row = document.querySelector(".cv-canvas-row");
    if (!row) return;
    row.setAttribute(
      "data-canvas",
      row.querySelector(".cv-single-view") ? "single" : "stage",
    );
  }

  /* ── « Vue d'ensemble » hors de la colonne des vues ─────────────────
     Ce bouton n'est pas une vue de plus : c'est une synthèse, et il ouvre
     une modale. Il doit se poser en haut à droite, sous le header.

     Le CSS seul n'y suffit pas : .vtabs est `position: absolute`, donc un
     enfant en `absolute` s'ancre sur ELLE et reste collé à la colonne. On
     le sort donc du DOM de .vtabs pour le rattacher à .canvas, qui couvre
     tout l'aperçu.

     Le nœud est DÉPLACÉ, pas recréé : son `onclick="showOverview()"` et son
     id restent intacts.                                                   */

  function moveOverviewBtn() {
    var btn = document.getElementById("overview-btn");
    var canvas = document.querySelector(".canvas");
    if (!btn || !canvas) return;

    if (isMobile()) {
      /* Placé DANS .cv-opts, à côté des pastilles Couleur/Taille : les trois
         deviennent des enfants du même conteneur flex, donc alignés par
         construction.

         Auparavant le bouton était posé en absolu dans .canvas, avec le même
         `top: 8px` que .cv-opts — mais les deux ne partagent pas exactement
         la même origine (les pastilles vivent dans .cv-hdr, dans le flux),
         et il retombait quelques pixels plus haut. */
      /* #cv-opts (pastilles Couleur/Taille) n'existe QUE pour le textile :
         conf-dynamic-layout.js réécrit le canvas des coins / drapeaux /
         patchs avec un header `.cv-hdr-row` qui n'en contient pas. Le repli
         sur .canvas posait alors le bouton en bas de l'aperçu, très loin de
         la bascule Recto/Verso avec laquelle il doit s'aligner.

         Pour ces produits on vise donc .cv-wrap — le référent positionné de
         l'aperçu, celui-là même où buildFaceSwitch() ancre la bascule. Les
         deux partagent ainsi la même origine et le même `top`, sans avoir à
         mesurer quoi que ce soit. */
      var opts = document.getElementById("cv-opts");
      var host = opts || document.querySelector(".cv-wrap") || canvas;
      if (btn.parentNode !== host) host.appendChild(btn);
      /* Marqueur lu par le CSS : dans .cv-wrap le bouton se pose en absolu
         au coin haut droit, alors que dans .cv-opts il reste un enfant flex
         de la rangée d'actions. */
      btn.classList.toggle("ov-in-wrap", host !== opts);
    } else {
      /* Desktop : le bouton retourne dans la colonne des vues, à sa place
         d'origine (dernier de .vtabs). Le marqueur mobile doit tomber, sinon
         un simple élargissement de fenêtre le laisserait en absolu. */
      btn.classList.remove("ov-in-wrap");
      var tabs = document.querySelector(".vtabs");
      if (tabs && btn.parentNode !== tabs) tabs.appendChild(btn);
    }
  }

  /* Recale les repères de zone imprimable de la face visible.

     syncFlagSafeZones() mesure l'image affichée pour poser le cadre dessus.
     Tant qu'une face est masquée (`display:none`), ses dimensions valent 0
     et la fonction sort sans rien poser — la zone du verso restait donc
     fausse jusqu'à un resize. On la rejoue après chaque bascule.

     Le double appel différé couvre la transition CSS : la première passe
     agit dès que la face est dans le flux, la seconde une fois la mise en
     page stabilisée.

     Les coins n'ont pas d'équivalent (leur repère est en CSS pur, donc
     indépendant de toute mesure) : rien à rejouer de ce côté.             */

  function refreshFaceZones() {
    var run = function () {
      if (typeof window.syncFlagSafeZones === "function") {
        window.syncFlagSafeZones();
      }
      /* Un design déjà déposé doit rester dans les nouvelles bornes. */
      if (typeof window.clampFlagLogo === "function") {
        window.clampFlagLogo();
      }
    };
    requestAnimationFrame(run);
    setTimeout(run, 260);
  }

  function buildFaceSwitch() {
    if (!isMobile()) return;

    var stage = document.querySelector(".flag-stage, .coin-stage");
    var wrap = document.querySelector(".cv-wrap");
    if (!stage || !wrap) {
      // Produit textile (ou canvas pas encore construit) : pas de bascule.
      var old = document.getElementById("face-switch");
      if (old) old.remove();
      return;
    }

    /* Les faces réellement AFFICHABLES. Les patchs n'ont qu'un recto, et la
       vue « côté » des coins est masquée par conf-patches.css : on ne
       propose donc la bascule QUE s'il y a bien deux faces à départager.

       Le test porte sur la DISPONIBILITÉ, pas sur la simple présence dans
       le DOM : en « recto simple », selectCoinType() (conf-patches.js)
       laisse la vue verso en place avec `display: none`. La chercher au
       sélecteur seul la comptait comme disponible, et la bascule
       Recto/Verso restait affichée alors qu'il n'y a qu'une face à voir.

       On lit le style INLINE, et non la visibilité calculée : la bascule
       elle-même masque la face inactive en CSS (`data-face-active`), donc
       tester le rendu ferait disparaître la bascule dès le premier clic —
       la face qu'elle vient de cacher serait comptée comme absente.
       `style.display` n'est écrit que par selectCoinType(), qui exprime bien
       le choix du client. */
    function available(el) {
      return !!el && el.style.display !== "none";
    }

    var faces = [];
    if (
      available(stage.querySelector("#flag-recto")) ||
      available(stage.querySelector('.coin-view[data-view="recto"]'))
    ) {
      faces.push("recto");
    }
    if (
      available(stage.querySelector("#flag-verso")) ||
      available(stage.querySelector('.coin-view[data-view="verso"]'))
    ) {
      faces.push("verso");
    }

    var existing = document.getElementById("face-switch");
    if (faces.length < 2) {
      if (existing) existing.remove();
      stage.removeAttribute("data-face-active");
      return;
    }

    // Face courante conservée d'un rafraîchissement à l'autre.
    var current = stage.getAttribute("data-face-active");
    if (faces.indexOf(current) === -1) current = "recto";
    stage.setAttribute("data-face-active", current);

    /* Déjà en place et rattachée au bon aperçu : on n'y touche pas.
       Important — cette fonction écrit dans .canvas, que watchStage()
       observe : reconstruire à chaque appel relancerait l'observateur en
       boucle. Sortir tôt rend l'opération idempotente. */
    if (existing && existing.parentNode === wrap) {
      var btns = existing.querySelectorAll(".face-switch-btn");
      if (btns.length === faces.length) {
        /* Rien à reconstruire, mais la géométrie a pu changer (canvas
           réécrit, image rechargée) : les zones, elles, sont à recaler. */
        refreshFaceZones();
        return;
      }
    }

    var box = existing;
    if (!box || box.parentNode !== wrap) {
      if (box) box.remove();
      box = document.createElement("div");
      box.id = "face-switch";
      box.className = "face-switch";
      // Dans .cv-wrap, qui est le référent positionné de l'aperçu.
      wrap.appendChild(box);
    }

    box.innerHTML = "";
    faces.forEach(function (f) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "face-switch-btn" + (f === current ? " active" : "");
      b.textContent = f === "recto" ? "Recto" : "Verso";
      b.addEventListener("click", function () {
        // Reclic sur la face déjà affichée : rien à retourner.
        if (stage.getAttribute("data-face-active") === f) return;

        stage.setAttribute("data-face-active", f);
        box.querySelectorAll(".face-switch-btn").forEach(function (o) {
          o.classList.remove("active");
        });
        b.classList.add("active");

        /* Retournement de la pièce (voir .coin-flipping, conf-mobile.css).
           La classe est retirée à la FIN réelle de l'animation plutôt
           qu'après un délai deviné ; le repli au timer couvre le cas où
           l'événement ne vient pas (animation désactivée par
           prefers-reduced-motion, onglet en arrière-plan). */
        stage.classList.remove("coin-flipping");
        void stage.offsetWidth;           // relance l'animation
        stage.classList.add("coin-flipping");

        var done = function () {
          stage.classList.remove("coin-flipping");
          clearTimeout(timer);
        };
        var timer = setTimeout(done, 600);
        stage.addEventListener("animationend", done, { once: true });

        /* La face qu'on vient d'afficher était en `display:none` : ses
           dimensions valaient 0, donc syncFlagSafeZones() (drapeaux) et
           syncCoinSafeZones() (coins) s'étaient interrompus sans poser sa
           zone imprimable — d'où un cadre faux sur le verso.
           On les rejoue maintenant que la face a une géométrie réelle. */
        refreshFaceZones();
      });
      box.appendChild(b);
    });

    /* Première pose : le verso est masqué d'emblée, sa zone n'a donc jamais
       été calculée non plus. */
    refreshFaceZones();
  }

  /* Le canvas est reconstruit à chaque changement de produit
     (conf-dynamic-layout.js réécrit .cv-wrap) : la bascule disparaît avec
     lui. On la reconstruit dès que le conteneur change. */
  function watchStage() {
    var host = document.querySelector(".canvas");
    if (!host) return;

    var pending = false;
    var obs = new MutationObserver(function () {
      // Le canvas se réécrit en plusieurs mutations : on ne rebâtit qu'une
      // fois, à la fin du lot.
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        tagCanvasRow();
        buildFaceSwitch();
        /* conf-dynamic-layout.js réécrit .canvas en entier au changement de
           produit : le prix, le bouton flottant et « Vue d'ensemble », qui y
           sont ancrés, sont détruits avec. On les réinstalle. */
        moveOverviewBtn();
        fillActionBar();
        syncLayerToImage();
        watchZoomEnd();   // .cv-single-view est neuf : réinstaller l'écouteur
      }, 60);
    });
    /* `attributes: style` en plus de childList : passer le coin en « recto
       simple » ne reconstruit rien — selectCoinType() se contente de poser
       `display: none` sur la vue verso. Sans cette surveillance, la bascule
       Recto/Verso restait affichée pour une face qui n'existe plus.
       Le lot de 60 ms absorbe les écritures multiples de selectCoinType. */
    obs.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  }

  /* ── Zones (poitrine, dos) : identiques au desktop ──────────────────
     Le mobile ne redéfinit RIEN. buildZones() (conf-main-inline.js) écrit
     les zones dans window.LOGO_ZONES en % de l'image du produit, et
     syncLayerToImage() cale #logo-layer sur cette même image telle
     qu'affichée : les pourcentages du layer sont donc DÉJÀ ceux du
     desktop, sans conversion.

     Une version antérieure divisait les zones par --img-fill, en croyant
     compenser un écart de cadrage. C'était faux : --img-fill agrandit
     l'image ET le layer dans les mêmes proportions, la division rendait
     donc les zones plus petites qu'en desktop.

     Ces deux fonctions sont conservées (elles sont appelées depuis
     syncLayerToImage() et init()) mais ne font plus rien : les supprimer
     imposerait de toucher à ces appels sans bénéfice. */

  /* ── Zones MOBILE ───────────────────────────────────────────────────
     Valeurs PROPRES au mobile, en % de l'IMAGE (le layer y est calé, voir
     syncLayerToImage). Elles n'ont pas à égaler celles du desktop, qui
     s'expriment dans un autre référentiel (le conteneur) — ce qui compte
     est qu'elles délimitent la même surface sur le vêtement.

     Repère : le vêtement occupe ~68,6 % de la largeur de l'image (mesuré
     dans les PNG). Une zone de 50 % de l'image couvre donc environ 73 % du
     torse, soit d'une couture d'épaule à l'autre.

     Ces valeurs se calent visuellement, par ajustements successifs. */
  /* Hauteur portée de 9 % à 14 %.

     Le calque mobile est calé sur les pixels DESSINÉS de l'image (carrée,
     500x500 — voir syncLayerToImage), alors que le desktop l'étale sur le
     conteneur, plus large que haut. À largeur égale en %, un logo occupe
     donc une part de HAUTEUR bien plus grande en mobile : un visuel carré à
     9 % de large y fait déjà 9 % de haut, et le moindre agrandissement — ou
     tout visuel plus haut que large — dépassait les 9 % de la zone.

     La plage verticale de clampLogoToZone() devenait alors vide et le logo
     se retrouvait replaqué sur le bord haut à chaque touchmove : il ne
     suivait plus le doigt. 14 % laisse passer un logo carré agrandi comme
     un visuel portrait, sans que le bandeau morde sur les coutures.

     Le `top` est remonté de 31 % à 29 % pour que le bandeau reste centré sur
     la poitrine malgré ces 5 points de hauteur supplémentaires. */
  var CHEST_MOBILE = { top: 29, width: 38, height: 14 };
  var BACK_MOBILE = { top: 22, width: 34, height: 46 };

  /* ── MANCHES (vue de côté) ──────────────────────────────────────────
     Ces zones n'étaient PAS traitées ici : elles gardaient les valeurs du
     template, exprimées en % du CONTENEUR (référentiel desktop), alors que
     le calque mobile est calé sur l'IMAGE dessinée. Le conteneur mobile
     étant nettement plus haut que l'image carrée, l'axe vertical était
     décalé — la zone tombait à côté de la manche, hors du visuel, et
     n'apparaissait donc pas à l'écran.

     Converties dans le référentiel de l'image : un `top` de 34 % du
     conteneur équivaut à ~26 % de l'image, et une hauteur de 29 % à ~43 %.
     Comme pour la poitrine et le dos, ces valeurs se calent visuellement.

     `left` est inchangé : le conteneur et l'image ont la même largeur en
     portrait (l'image est contrainte par la largeur), donc l'axe horizontal
     ne subit aucune conversion. */
  var SLEEVE_MOBILE = {
    sweat:  { left: 46.5, top: 26, width: 9, height: 43 },
    tshirt: { left: 47.5, top: 20, width: 9, height: 19 },
  };

  /* Produit courant : les silhouettes diffèrent (manche longue / courte),
     comme dans buildZones(). Même test que applyZonesForProduct()
     (conf-main-inline.js) pour que les deux ne divergent pas. Le sweat est
     le produit affiché au chargement, d'où le repli. */
  function isSweatProduct() {
    var t = window.currentProductType;
    if (t == null) return true;
    return String(t).indexOf("sweat") === 0;
  }

  /* Applique les zones mobile à window.LOGO_ZONES — la source de vérité,
     lue aussi par conf-text-zone.js et par la contrainte de déplacement.
     Écrire seulement le rectangle guide élargirait le cadre à l'écran sans
     libérer le logo, qui resterait borné aux valeurs du desktop. */
  function applyMobileZones() {
    if (!isMobile()) return;
    /* Pas de verrou `__logoManipulating` ICI : cette fonction est appelée en
       fin de syncLayerToImage(), donc à chaque changement de vue. La bloquer
       pendant un geste laissait le calque calé sur la vue précédente et les
       zones (manches notamment) ne se recalculaient plus.
       Le verrou est posé dans reflowLogos(), seul endroit qui REPLACE les
       logos et qui doive donc s'effacer devant un geste en cours. */
    var Z = window.LOGO_ZONES;
    if (!Z) return;

    /* ── POITRINE ── */
    var cw = CHEST_MOBILE.width;
    var cl = 50 - cw / 2;

    ["f", "fr"].forEach(function (k) {
      var z = Z[k];
      if (!z || z.zoneId !== "zone-chest") return;
      z.left = cl;
      z.top = CHEST_MOBILE.top;
      z.width = cw;
      z.height = CHEST_MOBILE.height;

      /* Position de départ d'un logo fraîchement posé : « cœur » à droite
         du bandeau (le cœur du porteur), « poitrine droite » à gauche. */
      var pad = cw * 0.06;
      var lw = z.maxW || 7.5;
      z.startLeft = k === "f" ? cl + cw - lw - pad : cl + pad;
    });

    var el = document.getElementById("zone-chest");
    if (el) {
      el.style.left = cl + "%";
      el.style.top = CHEST_MOBILE.top + "%";
      el.style.width = cw + "%";
      el.style.height = CHEST_MOBILE.height + "%";
    }

    /* ── DOS ── */
    var bw = BACK_MOBILE.width;
    var bl = 50 - bw / 2;
    var zb = Z["b"];
    if (zb) {
      zb.left = bl;
      zb.top = BACK_MOBILE.top;
      zb.width = bw;
      zb.height = BACK_MOBILE.height;
      // maxW borne la largeur d'un logo : il doit suivre la zone.
      zb.maxW = bw;
    }

    var elb = document.getElementById("zone-b");
    if (elb) {
      elb.style.left = bl + "%";
      elb.style.top = BACK_MOBILE.top + "%";
      elb.style.width = bw + "%";
      elb.style.height = BACK_MOBILE.height + "%";
    }

    /* ── MANCHES ──
       La zone droite est le MIROIR de la gauche : il n'existe qu'une image
       de profil, retournée en scaleX pour le côté droit (voir
       conf-sleeve-side.js). D'où left = 100 - left - width, comme dans
       buildZones() et dans le template. */
    var SLV = isSweatProduct() ? SLEEVE_MOBILE.sweat : SLEEVE_MOBILE.tshirt;
    var sides = {
      sl: { zoneId: "zone-sl", left: SLV.left },
      sr: { zoneId: "zone-sr", left: 100 - SLV.left - SLV.width },
    };

    Object.keys(sides).forEach(function (k) {
      var cfg = sides[k];
      var z = Z[k];
      if (z) {
        z.left = cfg.left;
        z.top = SLV.top;
        z.width = SLV.width;
        z.height = SLV.height;
        // maxW borne la largeur d'un logo : il doit suivre la zone.
        z.maxW = SLV.width;
      }
      var els = document.getElementById(cfg.zoneId);
      if (els) {
        els.style.left = cfg.left + "%";
        els.style.top = SLV.top + "%";
        els.style.width = SLV.width + "%";
        els.style.height = SLV.height + "%";
      }
    });

    reflowLogos();
  }

  /* Replace les logos DÉJÀ posés dans les zones qu'on vient de redéfinir.

     Sans cela, un visuel uploadé garde la position calculée sur les zones
     du desktop : placeLogoInZone() a tourné AVANT applyMobileZones(), donc
     sur d'autres bornes. Le logo apparaissait hors de son cadre — surtout
     visible au dos, où l'écart de largeur est le plus grand.

     Seulement pour les zones RENSEIGNÉES : replacer un calque vide n'a pas
     de sens.

     applyMobileZones() ne tourne qu'au changement d'image (vue, produit,
     couleur) — pas pendant un glisser-déposer : une position réglée à la
     main n'est donc pas écrasée en cours de manipulation. */
  function reflowLogos() {
    if (typeof window.placeLogoInZone !== "function") return;
    /* Geste en cours : placeLogoInZone() RECENTRE le logo dans sa zone. Le
       rejouer pendant un glisser-déposer annulait le déplacement à chaque
       mouvement. Le commentaire ci-dessus supposait que cette fonction ne
       tourne jamais pendant un drag — c'est faux : ses observateurs
       réagissent aux styles qu'écrit le drag lui-même. */
    if (window.__logoManipulating) return;
    var Z = window.LOGO_ZONES;
    if (!Z) return;

    // Manches incluses : leurs zones sont désormais recalculées pour le
    // mobile (voir SLEEVE_MOBILE), un logo posé doit suivre.
    ["f", "fr", "b", "sl", "sr"].forEach(function (k) {
      var z = Z[k];
      if (!z) return;
      var logo = document.getElementById(z.logoId);
      if (!logo || logo.style.display === "none") return;
      var im = logo.querySelector("img");
      if (!im || !im.getAttribute("src")) return;
      window.placeLogoInZone(k);
    });

    reflowTexts();
  }

  /* Même problème pour les TEXTES : clampTextToZone() les positionne à la
     création, avec les zones alors en vigueur (celles du desktop). Nos
     valeurs mobile arrivent après — le texte restait donc calé sur les
     anciennes bornes, souvent très loin de son cadre.

     clampTextToZone() lit TEXT_ZONE_HORIZ, dérivé dynamiquement de
     LOGO_ZONES : le rejouer suffit à replacer le texte, sans dupliquer le
     moindre calcul. */
  function reflowTexts() {
    if (typeof window.clampTextToZone !== "function") return;

    ["f", "fr", "b"].forEach(function (k) {
      var el = document.getElementById("text-" + k);
      if (!el || el.style.display === "none") return;
      window.clampTextToZone(k);
    });
  }

  /* Un texte AJOUTÉ après coup n'est pas couvert par reflowTexts() : la
     dernière application de zones a eu lieu avant sa création.

     Les éléments .design-text existent dès le HTML (masqués) et passent en
     `display: block` à l'ajout : on observe donc leur style. Le clamp est
     rejoué une fois la police chargée, sans quoi la mesure porterait sur la
     police de repli. */
  /* Le zoom automatique (upload comme ajout de texte) anime `transform` sur
     .cv-single-view pendant 0,2 s. Toute mesure prise pendant ce laps —
     clampTextToZone, placeLogoInZone — porte sur une géométrie
     intermédiaire, et pose l'élément à côté de sa zone.

     On écoute donc la FIN réelle de la transition plutôt que de deviner un
     délai, et on replace tout ce qui est posé. */
  function watchZoomEnd() {
    var view = document.querySelector(".cv-single-view");
    if (!view || view.dataset.zoomWatched === "1") return;

    // Marqué : le canvas est reconstruit au changement de produit, et cette
    // fonction est rejouée — sans le drapeau, les écouteurs s'empileraient.
    view.dataset.zoomWatched = "1";
    view.addEventListener("transitionend", function (e) {
      if (e.propertyName !== "transform") return;
      if (!isMobile()) return;
      /* Recale le calque avant de replacer quoi que ce soit : la vue a pu
         changer pendant l'animation, et les zones se recalculent dans la
         foulée (applyMobileZones est appelée en fin de syncLayerToImage). */
      syncLayerToImage();
      reflowTexts();
      reflowLogos();
    });
  }

  /* Les menus « Police » / couleur sont gérés dans conf-text-toolbar.js :
     déplacés dans <body> à l'ouverture, puis positionnés sous leur bouton.
     Le rognage venait de `overflow: hidden` sur .cv-wrap, commun au desktop
     et au mobile — le corriger ici seulement laissait le desktop cassé. */

  function watchTexts() {
    ["f", "fr", "b"].forEach(function (k) {
      var el = document.getElementById("text-" + k);
      if (!el) return;

      /* clampTextToZone() écrit lui-même dans `style` : sans ce verrou,
         l'observateur se rappellerait en boucle. Le drapeau est levé le
         temps du clamp, puis retombé au tour de boucle suivant. */
      var busy = false;

      new MutationObserver(function () {
        if (busy) return;
        if (!isMobile()) return;
        // Geste en cours : le clamp différé écraserait la position réglée.
        if (window.__logoManipulating) return;
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

  /* applyZonesForProduct() reconstruit LOGO_ZONES au changement de produit
     et réécrit les rectangles guides : nos valeurs seraient perdues. On les
     réapplique dès que le rectangle change.

     Le test de largeur évite la boucle : applyMobileZones() écrit elle-même
     ce style, ce que l'observateur détecterait aussitôt. */
  function watchChestZone() {
    var chest = document.getElementById("zone-chest");
    /* Les MANCHES sont surveillées aussi : applyZonesForProduct() réécrit
       leurs rectangles avec les valeurs desktop, qui ne valent pas dans le
       référentiel mobile. Sans cet observateur, elles restaient décalées
       jusqu'au prochain changement d'image. */
    var sleeve = document.getElementById("zone-sl");
    if (!chest && !sleeve) return;

    /* Le test d'écart évite la boucle : applyMobileZones() écrit elle-même
       ces styles, ce que l'observateur détecterait aussitôt. */
    function stale() {
      if (chest && parseFloat(chest.style.width) !== CHEST_MOBILE.width) return true;
      if (sleeve) {
        var SLV = isSweatProduct() ? SLEEVE_MOBILE.sweat : SLEEVE_MOBILE.tshirt;
        if (parseFloat(sleeve.style.top) !== SLV.top) return true;
        if (parseFloat(sleeve.style.height) !== SLV.height) return true;
      }
      return false;
    }

    var obs = new MutationObserver(function () {
      if (!isMobile()) return;
      if (window.__logoManipulating) return;   // geste en cours : ne pas replacer
      if (stale()) applyMobileZones();
    });
    [chest, sleeve].forEach(function (el) {
      if (el) obs.observe(el, { attributes: true, attributeFilter: ["style"] });
    });
  }

  // Conservée : appelée depuis init(). Les zones passent par applyMobileZones().
  function widenChestZone() {
    applyMobileZones();
  }

  /* ── Init ─────────────────────────────────────────────────────────── */

  function init() {
    var panels = document.querySelectorAll(".side-panel");
    if (!panels.length) return;

    panels.forEach(addHandle);
    observePanels();
    watchUploads();
    watchTexts();
    watchZoomEnd();



    /* Premier clic sur le rail = ouverture volontaire. En capture, donc
       avant le handler de conf-sidebar-modern.js qui ouvre le panneau. */
    document.querySelectorAll(".icon-nav-item[data-panel]").forEach(function (item) {
      item.addEventListener(
        "click",
        function () {
          userOpened = true;
        },
        true,
      );
    });

    syncScrim();
    fillActionBar();
    observeRecap();
    watchImages();
    watchNav();
    measureNav();
    syncLayerToImage();

    /* Zone poitrine : window.LOGO_ZONES est publié par conf-main-inline.js,
       lui aussi en `defer`. Il est donc prêt ici — mais applyZonesForProduct()
       peut encore le reconstruire juste après (restauration de session), d'où
       le second passage différé en plus de l'observateur. */
    widenChestZone();
    watchChestZone();
    setTimeout(widenChestZone, 800);

    /* Bascule recto/verso : le canvas des drapeaux/coins est construit
       après coup par conf-dynamic-layout.js, d'où l'observateur. */
    tagCanvasRow();
    buildFaceSwitch();
    moveOverviewBtn();
    watchStage();

    /* Rotation / redimensionnement : en repassant en desktop le voile doit
       disparaître, et les panneaux retrouver le comportement permanent. */
    var mq = window.matchMedia(MQ);
    var onChange = function () {
      if (!isMobile()) {
        removeActionBar();
        showScrim(false);
        document.querySelectorAll(".side-panel").forEach(function (p) {
          p.style.transform = "";
          p.style.transition = "";
        });
        // Desktop : la sidebar ne reste jamais vide.
        if (!document.querySelector(".side-panel.open")) {
          var el = document.getElementById("panel-product");
          var nav = document.querySelector('[data-panel="panel-product"]');
          if (el) el.classList.add("open");
          if (nav) nav.classList.add("active");
        }
        /* Desktop : la bascule n'a plus lieu d'être, et l'attribut doit
           partir avec elle — sinon une des deux faces resterait masquée
           alors que l'écran a la place de montrer les deux. */
        var fs = document.getElementById("face-switch");
        if (fs) fs.remove();
        document
          .querySelectorAll(".flag-stage, .coin-stage")
          .forEach(function (s) {
            s.removeAttribute("data-face-active");
          });
      } else {
        syncScrim();
        fillActionBar();
        buildFaceSwitch();
      }
      moveOverviewBtn();    // remet le bouton dans le bon conteneur
      measureNav();         // desktop : retire --nav-h ; mobile : (re)mesure
      syncLayerToImage();   // dans les deux sens : pose ou retire le calage
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);

    /* Clic / tap à l'extérieur : ferme la feuille. En capture (voir
       onDocPointerDown). pointerdown couvre souris et tactile. */
    document.addEventListener("pointerdown", onDocPointerDown, true);

    /* Choix d'un produit dans la feuille : elle se referme (en bulle, donc
       après le handler d'origine). */
    document.addEventListener("click", onPanelSelect, false);

    /* Échap ferme la feuille (clavier physique / tablette). */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isMobile()) closeSheet();
    });
  }

  /* Les panneaux existent dès le HTML, mais conf-sidebar-modern.js pose
     .open au boot : on s'initialise après lui pour observer dès le départ. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(init, 0);
    });
  } else {
    setTimeout(init, 0);
  }
})();
