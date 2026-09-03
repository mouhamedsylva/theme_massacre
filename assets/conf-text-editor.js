/**
 * conf-text-editor.js — Éditeur de texte façon CustomInk (textiles).
 *
 * Flux :
 *  1) Bouton « Ajouter un texte » -> champ inline (Insérer / Annuler).
 *  2) « Insérer » -> le sidebar est masqué et le PANNEAU d'édition s'ouvre
 *     (police avec aperçu, couleur, forme de texte). « Enregistrer » -> ferme.
 *  3) Le texte s'affiche dans la zone pointillée (horizontale) et NE PEUT PAS
 *     en sortir (clamp). Formes courbes rendues en SVG.
 *
 * Zones : 'f' (face), 'b' (dos). En face, texte et logo cœur sont exclusifs.
 */
(function () {
  "use strict";

  // ── Catalogue de polices (Google Fonts + quelques system) ──
  var FONTS = [
    { name: "Arial", css: "Arial, sans-serif" },
    { name: "Impact", css: "'Anton', Impact, sans-serif" },
    { name: "Bebas Neue", css: "'Bebas Neue', sans-serif" },
    { name: "Oswald", css: "'Oswald', sans-serif" },
    { name: "Teko", css: "'Teko', sans-serif" },
    { name: "Montserrat", css: "'Montserrat', sans-serif" },
    { name: "Poppins", css: "'Poppins', sans-serif" },
    { name: "Righteous", css: "'Righteous', cursive" },
    { name: "Fredoka", css: "'Fredoka One', cursive" },
    { name: "Bangers", css: "'Bangers', cursive" },
    { name: "Luckiest Guy", css: "'Luckiest Guy', cursive" },
    { name: "Shrikhand", css: "'Shrikhand', cursive" },
    { name: "Lobster", css: "'Lobster', cursive" },
    { name: "Pacifico", css: "'Pacifico', cursive" },
    { name: "Dancing Script", css: "'Dancing Script', cursive" },
    { name: "Great Vibes", css: "'Great Vibes', cursive" },
    { name: "Sacramento", css: "'Sacramento', cursive" },
    { name: "Satisfy", css: "'Satisfy', cursive" },
    { name: "Yellowtail", css: "'Yellowtail', cursive" },
    { name: "Caveat", css: "'Caveat', cursive" },
    { name: "Permanent Marker", css: "'Permanent Marker', cursive" },
    { name: "Rock Salt", css: "'Rock Salt', cursive" },
    { name: "Special Elite", css: "'Special Elite', monospace" },
    // Polices supplémentaires populaires
    { name: "Roboto", css: "'Roboto', sans-serif" },
    { name: "Open Sans", css: "'Open Sans', sans-serif" },
    { name: "Lato", css: "'Lato', sans-serif" },
    { name: "Raleway", css: "'Raleway', sans-serif" },
    { name: "Ubuntu", css: "'Ubuntu', sans-serif" },
    { name: "Nunito", css: "'Nunito', sans-serif" },
    { name: "Playfair Display", css: "'Playfair Display', serif" },
    { name: "Merriweather", css: "'Merriweather', serif" },
    { name: "Lora", css: "'Lora', serif" },
    { name: "PT Serif", css: "'PT Serif', serif" },
    { name: "Crimson Text", css: "'Crimson Text', serif" },
    { name: "Libre Baskerville", css: "'Libre Baskerville', serif" },
    { name: "Anton", css: "'Anton', sans-serif" },
    { name: "Archivo Black", css: "'Archivo Black', sans-serif" },
    { name: "Alfa Slab One", css: "'Alfa Slab One', cursive" },
    { name: "Black Ops One", css: "'Black Ops One', cursive" },
    { name: "Russo One", css: "'Russo One', sans-serif" },
    { name: "Passion One", css: "'Passion One', cursive" },
    { name: "Fjalla One", css: "'Fjalla One', sans-serif" },
    { name: "Bebas", css: "'Bebas', sans-serif" },
    { name: "Monoton", css: "'Monoton', cursive" },
    { name: "Press Start 2P", css: "'Press Start 2P', cursive" },
    { name: "Creepster", css: "'Creepster', cursive" },
    { name: "Bungee", css: "'Bungee', cursive" },
    { name: "Acme", css: "'Acme', sans-serif" },
    { name: "Patua One", css: "'Patua One', cursive" },
    { name: "Cinzel", css: "'Cinzel', serif" },
    { name: "Courgette", css: "'Courgette', cursive" },
    { name: "Indie Flower", css: "'Indie Flower', cursive" },
    { name: "Shadows Into Light", css: "'Shadows Into Light', cursive" },
    { name: "Amatic SC", css: "'Amatic SC', cursive" },
    { name: "Kalam", css: "'Kalam', cursive" },
    { name: "Architects Daughter", css: "'Architects Daughter', cursive" },
    { name: "Cookie", css: "'Cookie', cursive" },
    { name: "Allura", css: "'Allura', cursive" },
    { name: "Tangerine", css: "'Tangerine', cursive" },
    { name: "Pinyon Script", css: "'Pinyon Script', cursive" },
    { name: "Monoton", css: "'Monoton', cursive" },
    { name: "Courier New", css: "'Courier New', monospace" },
    { name: "Courier", css: "'Courier', monospace" },
    { name: "Times New Roman", css: "'Times New Roman', serif" },
    { name: "Georgia", css: "'Georgia', serif" },
    { name: "Verdana", css: "'Verdana', sans-serif" },
    { name: "Tahoma", css: "'Tahoma', sans-serif" },
  ];

  // ── Palette de couleurs (mêmes 16 que patchs/drapeaux) ──
  var COLORS = [
    "#ffffff",
    "#000000",
    "#f5f2ed",
    "#9e9e9e",
    "#555555",
    "#607d8b",
    "#1e3a5f",
    "#5bb8e8",
    "#2e6b45",
    "#f0c8d8",
    "#e8729a",
    "#c0392b",
    "#e8842a",
    "#f5c842",
    "#9b6bb5",
    "#7d4e2d",
  ];

  // ── Formes de texte (SVG path pour les courbes) ──
  // 'normal' = pas de courbe. Les autres définissent une trajectoire.
  var SHAPES = [
    { id: "normal", name: "Normal" },
    { id: "curve", name: "Curve" },
    { id: "arch", name: "Arch" },
    { id: "bridge", name: "Bridge" },
    { id: "valley", name: "Valley" },
  ];

  // État courant de l'édition.
  var state = {
    zone: null, // 'f' | 'b'
    text: "",
    font: "Arial, sans-serif",
    fontName: "Arial",
    color: "#ffffff",
    shape: "normal",
  };

  // ─────────────────────── Persistance ───────────────────────
  function store() {
    try {
      return JSON.parse(sessionStorage.getItem("conf_texts")) || {};
    } catch (e) {
      return {};
    }
  }
  function productKey() {
    return window.currentProductType || "sweatshirt";
  }
  function getState(zone) {
    var all = store();
    return (all[productKey()] || {})[zone] || null;
  }
  function saveState(zone, data) {
    var all = store();
    if (!all[productKey()]) all[productKey()] = {};
    all[productKey()][zone] = data;
    try {
      sessionStorage.setItem("conf_texts", JSON.stringify(all));
    } catch (e) {}
  }
  function clearState(zone) {
    var all = store();
    if (all[productKey()]) delete all[productKey()][zone];
    try {
      sessionStorage.setItem("conf_texts", JSON.stringify(all));
    } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  /* ─────────────────── Mise en forme PAR CARACTÈRE ───────────────────
     Un texte peut porter une mise en forme locale : le « N » de « Nike » en
     rouge et gras, le reste normal. Elle est stockée dans `segments` :

       segments: [ { text: 'N', color: '#e11', bold: true },
                   { text: 'ike' } ]

     `text` reste TOUJOURS maintenu comme concaténation des segments : il
     alimente le nom floqué, les propriétés de commande, l'aperçu de groupe et
     le compteur de caractères. `segments` est donc un ENRICHISSEMENT, jamais
     un remplacement — les sessions créées avant cette fonctionnalité n'ont que
     `text` et continuent de fonctionner sans conversion (migration ascendante).

     Les attributs par segment sont volontairement limités à couleur / gras /
     italique / souligné. Taille et police restent globales : elles changeraient
     la hauteur de ligne et la métrique, ce qui casserait la limite de largeur
     (20 cm en face) et le calage dans la zone imprimable. */

  /** @returns {boolean} true si au moins un segment porte une mise en forme */
  function aDesSegments(data) {
    if (!data || !Array.isArray(data.segments) || !data.segments.length) return false;
    // Un seul segment sans attribut = équivalent au texte plat : on ignore.
    return data.segments.some(function (s) {
      return s && (s.color || s.bold || s.italic || s.underline);
    });
  }

  /** Texte brut d'une liste de segments (source de vérité pour `text`). */
  function texteDesSegments(segments) {
    if (!Array.isArray(segments)) return "";
    return segments.map(function (s) { return (s && s.text) || ""; }).join("");
  }

  /* Fusionne les segments voisins de mise en forme identique, et retire les
     vides. Sans cela, taper lettre à lettre produirait un segment par frappe :
     le DOM enflerait, et la rasterisation ferait un appel canvas par caractère
     au lieu d'un par style. */
  function normaliserSegments(segments) {
    if (!Array.isArray(segments)) return [];
    var out = [];
    segments.forEach(function (s) {
      if (!s || !s.text) return;
      var prec = out[out.length - 1];
      var memeStyle = prec &&
        (prec.color || "") === (s.color || "") &&
        !!prec.bold === !!s.bold &&
        !!prec.italic === !!s.italic &&
        !!prec.underline === !!s.underline;
      if (memeStyle) prec.text += s.text;
      else out.push({
        text: s.text,
        color: s.color || "",
        bold: !!s.bold,
        italic: !!s.italic,
        underline: !!s.underline,
      });
    });
    return out;
  }

  // ─────────────── Champ inline (bouton -> saisie) ───────────────
  /* Zone visée par la saisie en cours. Renseignée par startTextInline() quand
     l'appelant la précise (boutons « texte gauche / droite » en vue de face) ;
     null = on retombe sur la déduction par la vue courante. */
  var pendingZone = null;

  /* Sélection de l'emplacement dans le panneau de saisie. */
  window.setTextZoneChoice = function (btn) {
    pendingZone = btn.getAttribute("data-zone");
    var wrap = document.getElementById("txt-where");
    if (wrap) {
      wrap.querySelectorAll(".txt-where-opt").forEach(function (b) {
        b.classList.toggle("on", b === btn);
      });
    }
  };

  window.startTextInline = function (zone) {
    // Emplacement par défaut : celui de la vue affichée, pour que le choix
    // proposé corresponde à ce que le client regarde.
    var layer = document.getElementById("logo-layer");
    var view = layer ? layer.getAttribute("data-view") : "face";
    pendingZone = zone || (view === "dos" ? "b" : "f");
    var wrap = document.getElementById("txt-where");
    if (wrap) {
      wrap.querySelectorAll(".txt-where-opt").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-zone") === pendingZone);
      });
    }
    var addBtns = document.getElementById("txt-add-btns");
    if (addBtns) addBtns.style.display = "none";
    var single = document.getElementById("txt-add-btn");
    if (single) single.style.display = "none";
    var box = document.getElementById("txt-inline");
    box.style.display = "block";
    var input = document.getElementById("txt-inline-input");
    input.value = "";
    setTimeout(function () {
      input.focus();
    }, 30);
    input.onkeydown = function (e) {
      if (e.key === "Enter") window.confirmTextInline();
    };
  };
  window.cancelTextInline = function () {
    /* Ces éléments vivent dans #sidebar-content, que DynamicLayoutManager vide
       (innerHTML = '') au passage sur un coin, un drapeau ou un patch : ils
       peuvent donc être absents. Les lignes voisines gardaient déjà leur accès
       — l'oubli portait sur celui-ci. */
    var inline = document.getElementById("txt-inline");
    if (inline) inline.style.display = "none";
    var addBtns = document.getElementById("txt-add-btns");
    if (addBtns) addBtns.style.display = "";
    var single = document.getElementById("txt-add-btn");
    if (single) single.style.display = "";
    pendingZone = null;
  };
  window.confirmTextInline = function () {
    var inlineInput = document.getElementById("txt-inline-input");
    var text = ((inlineInput && inlineInput.value) || "").trim();
    if (!text) {
      window.cancelTextInline();
      return;
    }
    // Zone explicite (bouton gauche/droite) sinon déduite de la vue courante.
    var zone = pendingZone;
    if (!zone) {
      var layer = document.getElementById("logo-layer");
      var view = layer ? layer.getAttribute("data-view") : "face";
      zone = view === "dos" ? "b" : "f";
    }
    /* Réciproque de conf-share.js : poser un texte NE RETIRE PLUS le logo de
       la zone. Logo et texte coexistent sur la poitrine, le client les place
       librement dans le bandeau. Supprimer son upload sans avertissement était
       une perte de travail, pas une contrainte d'impression. */
    // Prépare l'état et ouvre le panneau d'édition.
    var prev = getState(zone);
    state.zone = zone;
    state.text = text;
    state.font = prev ? prev.font : "Arial, sans-serif";
    state.fontName = prev ? prev.fontName : "Arial";
    state.color = prev ? prev.color : "#ffffff";
    state.shape = prev ? prev.shape : "normal";
    state.bold = prev ? !!prev.bold : false;
    state.italic = prev ? !!prev.italic : false;
    state.underline = prev ? !!prev.underline : false;
    state.size = Math.min(prev && prev.size ? prev.size : 20, maxSize());

    /* GÉOMÉTRIE : reprise de l'état précédent, sinon elle est perdue.

       Défaut corrigé le 2026-08-08 : après avoir déplacé son texte puis l'avoir
       ré-édité, le client le retrouvait à sa position d'origine au rechargement.

       Cause : ce bloc reconstruit `state` champ par champ depuis `prev` — mais
       ne reprenait QUE la mise en forme (font, color, shape, size…). `saveState`
       écrase ensuite l'entrée par affectation directe
       (`all[produit][zone] = data`), donc `left`, `top`, `width` et `fontSize`,
       écrits par `saveTextGeo()` lors du glisser, disparaissaient.

       `saveTextGeo` fait l'inverse et sert de modèle : il LIT l'état existant et
       ne modifie que ce qu'il connaît. Ici on ne peut pas fusionner en bloc — le
       texte et la mise en forme viennent bien du panneau — mais les quatre
       champs de géométrie doivent traverser intacts.

       `delete` plutôt que `undefined` : `JSON.stringify` omet les clés
       `undefined`, mais `state` est un objet PARTAGÉ entre éditions. Y laisser
       une clé morte la ferait ressurgir sur le texte suivant, qui hériterait de
       la position du précédent. */
    ["left", "top", "width", "fontSize"].forEach(function (k) {
      if (prev && prev[k] !== undefined) state[k] = prev[k];
      else delete state[k];
    });

    window.cancelTextInline();
    /* Plus de basculement de sidebar : on rend le texte, on le SÉLECTIONNE
       automatiquement et on ouvre la barre d'outils au-dessus de l'aperçu.
       Repli sur l'ancien panneau si la barre n'est pas chargée. */
    if (typeof window.showTextToolbar === "function") {
      saveState(zone, state);
      renderTextOnCanvas(zone, state);
      if (typeof window.setTextZoneMode === "function")
        window.setTextZoneMode(zone, true);
      var el = document.getElementById("text-" + zone);
      if (el && typeof window.selectDesignText === "function")
        window.selectDesignText(el);
      window.showTextToolbar(zone);
      if (typeof window.refreshTextButton === "function")
        window.refreshTextButton();
    } else {
      openPanel();
    }
  };

  // Édition d'un texte existant (depuis un chip).
  window.editText = function (zone) {
    var st = getState(zone);
    if (!st) return;
    state.zone = zone;
    state.text = st.text;
    state.font = st.font;
    state.fontName = st.fontName || "Police";
    state.color = st.color;
    state.shape = st.shape || "normal";
    state.bold = !!st.bold;
    state.italic = !!st.italic;
    state.underline = !!st.underline;
    // Borne aussi à la réouverture : un design sauvegardé avant l'ajout du
    // plafond peut porter une taille supérieure.
    state.size = Math.min(st.size || 20, maxSize());
    openPanel();
  };

  // Suppression.
  window.removeText = function (zone) {
    renderTextOnCanvas(zone, null);
    var chip = document.getElementById("txt-chip-" + zone);
    if (chip) chip.style.display = "none";
    clearState(zone);
    if (zone === "f" && typeof window.refreshTextButton === "function")
      window.refreshTextButton();
    if (typeof window.setTextZoneMode === "function")
      window.setTextZoneMode(zone, false);

    // Retire la sélection visuelle et masque la barre d'outils
    if (typeof window.clearDesignTextSelection === "function") {
      window.clearDesignTextSelection();
    }

    // Masque explicitement l'élément text-{zone}
    var textEl = document.getElementById("text-" + zone);
    if (textEl) {
      textEl.style.display = "none";
      textEl.classList.remove("is-selected");
    }

    /* Une place se libère : le panneau Texte doit rouvrir son champ, grisé
       tant que le plafond de 2 textes était atteint. */
    if (window.modernSidebar &&
        typeof window.modernSidebar.refreshTextForm === "function") {
      window.modernSidebar.refreshTextForm();
    }
  };

  // Duplication : crée une copie du texte dans une autre zone disponible.
  window.duplicateText = function (sourceZone) {
    var source = getState(sourceZone);
    if (!source) return;

    // Zones disponibles pour la duplication selon la zone source
    var availableZones = {
      f: ["fr", "b"], // depuis face centre -> face droite ou dos
      fr: ["f", "b"], // depuis face droite -> face centre ou dos
      b: ["f", "fr"], // depuis dos -> face centre ou face droite
    };

    var targets = availableZones[sourceZone] || [];

    // Trouve la première zone vide
    var targetZone = null;
    for (var i = 0; i < targets.length; i++) {
      if (!getState(targets[i])) {
        targetZone = targets[i];
        break;
      }
    }

    if (!targetZone) {
      // Toutes les zones sont occupées
      if (typeof window.confAlert === "function") {
        window.confAlert("Toutes les zones de texte sont déjà utilisées.", {
          icon: "info",
        });
      } else {
        /* confAlert : modale cohérente avec le reste de l'interface. Le repli
           sur alert() natif reste au cas où conf-alert.js n'aurait pas chargé
           — un alert() bloque le fil d'exécution et rompt le parcours d'achat. */
        var msgZones = "Toutes les zones de texte sont déjà utilisées.";
        if (typeof window.confAlert === "function") {
          window.confAlert(msgZones, { title: "Zones de texte" });
        } else {
          alert(msgZones);
        }
      }
      return;
    }

    // Copie l'état du texte source vers la zone cible
    var duplicate = {
      text: source.text,
      font: source.font,
      fontName: source.fontName,
      color: source.color,
      shape: source.shape,
      bold: source.bold,
      italic: source.italic,
      underline: source.underline,
      size: source.size,
      // Note : on ne copie PAS left/top/width/fontSize pour que le texte
      // dupliqué apparaisse à sa position par défaut dans la nouvelle zone
    };

    saveState(targetZone, duplicate);
    renderTextOnCanvas(targetZone, duplicate);

    // Met à jour le chip de la zone cible
    var chip = document.getElementById("txt-chip-" + targetZone);
    var val = document.getElementById("txt-chip-val-" + targetZone);
    if (chip && val) {
      val.textContent = duplicate.text;
      val.style.fontFamily = duplicate.font;
      chip.style.display = "flex";
    }

    if (typeof window.setTextZoneMode === "function") {
      window.setTextZoneMode(targetZone, true);
    }

    // Bascule vers la vue de la zone cible et sélectionne le texte dupliqué
    var view = targetZone === "b" ? "dos" : "face";
    var vb = document.querySelector('.vt[onclick*="' + view + '"]');
    if (vb && typeof window.selView === "function") {
      window.selView(vb, view);
    }

    // Sélectionne le texte dupliqué
    setTimeout(function () {
      var el = document.getElementById("text-" + targetZone);
      if (el && typeof window.selectDesignText === "function") {
        window.selectDesignText(el);
      }
      if (typeof window.showTextToolbar === "function") {
        window.showTextToolbar(targetZone);
      }
    }, 150);

    // Message de confirmation
    var zoneNames = { f: "Face (centre)", fr: "Face (droite)", b: "Dos" };
    if (typeof window.confAlert === "function") {
      window.confAlert(
        "Texte copié vers : " + (zoneNames[targetZone] || targetZone),
        {
          icon: "success",
          timer: 2000,
        },
      );
    }
  };

  // ─────────────── Panneau d'édition (remplace sidebar) ───────────────
  function openPanel() {
    var panel = document.getElementById("txt-panel");
    var sbInner = document.getElementById("sidebar-content");
    if (sbInner) sbInner.style.display = "none";
    /* Sans panneau, rien à synchroniser : on sort plutôt que de lever une
       TypeError sur la première ligne, ce qui laissait la sidebar masquée
       (elle vient d'être cachée juste au-dessus) et l'écran vide. */
    if (!panel) return;
    panel.style.display = "flex";

    var panelInput = document.getElementById("txt-panel-input");
    if (panelInput) panelInput.value = state.text;

    var fontVal = document.getElementById("txt-panel-font-val");
    if (fontVal) {
      fontVal.textContent = state.fontName;
      fontVal.style.fontFamily = state.font;
    }

    var shapeVal = document.getElementById("txt-panel-shape-val");
    if (shapeVal) {
      shapeVal.textContent = (
        SHAPES.filter(function (s) {
          return s.id === state.shape;
        })[0] || SHAPES[0]
      ).name;
    }

    // Compteur, taille, et boutons de style (reflètent l'état courant).
    syncTextCount();
    var range = document.getElementById("txt-size-range");
    if (range) range.value = state.size;
    var sizeVal = document.getElementById("txt-size-val");
    if (sizeVal) sizeVal.textContent = state.size;
    syncStyleButtons();

    buildColorSwatches();
    buildFontList();
    buildShapeGrid();
    hideFontPicker();
    hideShapePicker();

    // Bascule vers la vue concernée + zone horizontale + rendu live.
    // Seul le dos est en vue « dos » : 'f' ET 'fr' sont deux emplacements de
    // la vue de face (un test sur 'f' seul envoyait 'fr' vers le dos).
    var view = state.zone === "b" ? "dos" : "face";
    var vb = document.querySelector('.vt[onclick*="' + view + '"]');
    if (vb && typeof window.selView === "function") window.selView(vb, view);
    if (typeof window.setTextZoneMode === "function")
      window.setTextZoneMode(state.zone, true);
    renderLive();
  }

  // Ferme le panneau. save=true -> conserve, false -> annule les modifs.
  window.closeTextPanel = function (save) {
    var panel = document.getElementById("txt-panel");
    var sbInner = document.getElementById("sidebar-content");
    panel.style.display = "none";
    if (sbInner) sbInner.style.display = "";

    if (save) {
      /* GÉOMÉTRIE PRÉSERVÉE — même défaut que celui corrigé dans addText()
         (:319-342), qui n'avait jamais été reporté ici.

         `saveState` écrase l'entrée par affectation directe
         (`all[produit][zone] = data`). Écrire un objet littéral neuf, sans
         `left`/`top`/`width`/`fontSize`, effaçait donc la position enregistrée
         par saveTextGeo() au glisser : le client déplaçait son texte, rouvrait
         le panneau pour changer une couleur, validait — et retrouvait son texte
         à sa position d'origine au rechargement.

         On relit l'état existant et on ne remplace que ce que le panneau
         connaît. Même contrat que saveTextGeo() (:1121) et setTextProp(),
         qui fusionnent tous deux au lieu d'écraser.

         Les SEGMENTS ne sont volontairement pas repris : ce panneau pose une
         couleur et une graisse GLOBALES, et la règle établie dans setTextProp
         (:1213) veut qu'un style global efface la mise en forme par caractère —
         sinon les segments continueraient de la masquer et la couleur choisie
         resterait invisible. */
      var precedent = getState(state.zone) || {};
      var aEnregistrer = {
        text: state.text,
        font: state.font,
        fontName: state.fontName,
        color: state.color,
        shape: state.shape,
        bold: state.bold,
        italic: state.italic,
        underline: state.underline,
        size: state.size,
      };
      ["left", "top", "width", "fontSize"].forEach(function (k) {
        if (precedent[k] !== undefined) aEnregistrer[k] = precedent[k];
      });
      saveState(state.zone, aEnregistrer);

      /* POSITION MÉMORISÉE DÈS LA CRÉATION, PAS SEULEMENT AU DÉPLACEMENT.

         `saveTextGeo` était le seul écrivain de `left`/`top`/`width`, et il
         n'est appelé qu'au glisser. Un texte jamais déplacé n'avait donc
         AUCUNE position enregistrée : à la réouverture depuis le panier, les
         trois `if` de renderTextOnCanvas étaient sautés et l'élément gardait
         la position par défaut de sa zone — le centre. Le logo restauré sans
         géométrie y atterrissant aussi, les deux se superposaient.

         On relève donc la position réelle du DOM après le rendu, quand elle
         n'est pas déjà connue. Différé d'un tour de boucle : les styles
         viennent d'être posés, le navigateur doit les avoir appliqués pour que
         la lecture ait un sens.

         Ne touche RIEN si une position existe déjà : le déplacement du client
         reste prioritaire. */
      if (precedent.left === undefined || precedent.top === undefined) {
        (function (zone) {
          requestAnimationFrame(function () {
            var el = document.getElementById("text-" + zone);
            if (!el) return;
            var st = getState(zone);
            if (!st || st.left !== undefined) return;   // déjà connue entre-temps
            var g = {};
            if (el.style.left) g.left = el.style.left;
            if (el.style.top) g.top = el.style.top;
            if (el.style.width) g.width = el.style.width;
            if (g.left || g.top) window.saveTextGeo(zone, g);
          });
        })(state.zone);
      }
      // Chip récap dans le sidebar.
      var chip = document.getElementById("txt-chip-" + state.zone);
      var val = document.getElementById("txt-chip-val-" + state.zone);
      if (chip && val) {
        val.textContent = state.text;
        val.style.fontFamily = state.font;
        chip.style.display = "flex";
      }
      if (state.zone === "f" && typeof window.refreshTextButton === "function")
        window.refreshTextButton();
    } else {
      // Annulé : on restaure l'état sauvegardé (ou on retire si aucun).
      var prev = getState(state.zone);
      if (prev) {
        renderTextOnCanvas(state.zone, prev);
      } else {
        renderTextOnCanvas(state.zone, null);
        if (typeof window.setTextZoneMode === "function")
          window.setTextZoneMode(state.zone, false);
      }
    }
  };

  window.onPanelTextChange = function () {
    var panelInput = document.getElementById("txt-panel-input");
    if (!panelInput) return;
    state.text = panelInput.value;
    syncTextCount();
    buildFontList(); // les aperçus suivent le texte
    renderLive();
  };

  // Compteur de caractères (limite pour éviter le débordement du vêtement).
  function syncTextCount() {
    var input = document.getElementById("txt-panel-input");
    var out = document.getElementById("txt-panel-count");
    if (input && out) out.textContent = (input.value || "").length;
  }

  // ── Style : gras / italique / souligné ──
  window.toggleTextStyle = function (kind) {
    if (kind === "bold") state.bold = !state.bold;
    else if (kind === "italic") state.italic = !state.italic;
    else if (kind === "underline") state.underline = !state.underline;
    syncStyleButtons();
    renderLive();
  };
  function syncStyleButtons() {
    var b = document.getElementById("txt-style-b");
    var i = document.getElementById("txt-style-i");
    var u = document.getElementById("txt-style-u");
    if (b) b.classList.toggle("on", !!state.bold);
    if (i) i.classList.toggle("on", !!state.italic);
    if (u) u.classList.toggle("on", !!state.underline);
  }

  /* Plafond de taille (px). Défini par configurateur.liquid ; la valeur ici
     n'est qu'un repli si le script est chargé hors du configurateur. */
  function maxSize() {
    return window.MAX_TEXT_SIZE || 200;
  }

  // ── Taille du texte ──
  window.onTextSizeChange = function () {
    var range = document.getElementById("txt-size-range");
    if (!range) return;
    state.size = Math.min(parseInt(range.value, 10) || 20, maxSize());
    // La taille choisie au panneau prime : on efface une taille figée par un
    // ancien redimensionnement manuel, sinon le slider n'aurait aucun effet.
    state.fontSize = null;
    var out = document.getElementById("txt-size-val");
    if (out) out.textContent = state.size;
    renderLive();
  };

  // ── Couleurs ──
  function buildColorSwatches() {
    var wrap = document.getElementById("txt-color-swatches");
    wrap.innerHTML =
      COLORS.map(function (c) {
        var active =
          c.toLowerCase() === state.color.toLowerCase() ? " active" : "";
        var border =
          c === "#ffffff" || c === "#f5f2ed" ? ";border:1px solid #ddd" : "";
        return (
          '<button type="button" class="txt-color-sw' +
          active +
          '" style="background:' +
          c +
          border +
          '" ' +
          "onclick=\"pickTextColor('" +
          c +
          "')\"></button>"
        );
      }).join("") +
      '<div class="txt-custom-color">' +
      '<label class="txt-custom-label">' +
      '<svg viewBox="0 0 40 40" width="40" height="40" class="txt-custom-icon">' +
      '<circle cx="20" cy="20" r="18" fill="url(#panelColorGradient)" stroke="#ddd" stroke-width="2"/>' +
      "<defs>" +
      '<linearGradient id="panelColorGradient" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" style="stop-color:#ff0000"/>' +
      '<stop offset="25%" style="stop-color:#ffff00"/>' +
      '<stop offset="50%" style="stop-color:#00ff00"/>' +
      '<stop offset="75%" style="stop-color:#00ffff"/>' +
      '<stop offset="100%" style="stop-color:#0000ff"/>' +
      "</linearGradient>" +
      "</defs>" +
      "</svg>" +
      '<input type="color" class="txt-custom-input" id="txt-custom-color-input" ' +
      'value="' +
      (state.color || "#ffffff") +
      '">' +
      "<span>Couleur personnalisée</span>" +
      "</label>" +
      "</div>";

    // Ajouter l'événement après l'injection du HTML
    setTimeout(function () {
      var colorInput = document.getElementById("txt-custom-color-input");
      if (colorInput) {
        // Clic sur le label (ou le cercle SVG) déclenche l'input
        var label = document.querySelector(".txt-custom-label");
        if (label) {
          label.addEventListener("click", function () {
            colorInput.click();
          });
        }

        colorInput.addEventListener("input", function (e) {
          pickTextColor(e.target.value);
        });
      }
    }, 10);
  }
  window.pickTextColor = function (c) {
    state.color = c;
    buildColorSwatches();
    buildFontList();
    renderLive();
  };

  // ── Polices (liste avec aperçu du texte saisi) ──
  function buildFontList() {
    var scroll = document.getElementById("txt-font-scroll");
    if (!scroll) return;
    var search = document.getElementById("txt-font-search");
    var q = ((search && search.value) || "").toLowerCase();
    var sample = state.text || "Votre texte";
    scroll.innerHTML = FONTS.filter(function (f) {
      return !q || f.name.toLowerCase().indexOf(q) !== -1;
    })
      .map(function (f) {
        var active = f.css === state.font ? " active" : "";
        return (
          '<div class="txt-font-item' +
          active +
          '" onclick="pickTextFont(\'' +
          esc(f.name) +
          "','" +
          f.css.replace(/'/g, "\\x27").replace(/"/g, "&quot;") +
          "')\">" +
          '<div class="txt-font-sample" style="font-family:' +
          f.css.replace(/"/g, "&quot;") +
          '">' +
          esc(sample) +
          "</div>" +
          '<div class="txt-font-nm">' +
          esc(f.name) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }
  window.filterFonts = function () {
    buildFontList();
  };
  window.pickTextFont = function (name, css) {
    state.font = css;
    state.fontName = name;
    var fontVal = document.getElementById("txt-panel-font-val");
    if (fontVal) {
      fontVal.textContent = name;
      fontVal.style.fontFamily = css;
    }
    buildFontList();
    renderLive();
    hideFontPicker();
  };
  window.toggleFontPicker = function () {
    var p = document.getElementById("txt-font-picker");
    var open = p.style.display !== "none";
    hideShapePicker();
    p.style.display = open ? "none" : "block";
    if (!open) {
      buildFontList();
      var search = document.getElementById("txt-font-search");
      if (search) search.focus();
    }
  };
  function hideFontPicker() {
    var picker = document.getElementById("txt-font-picker");
    if (picker) picker.style.display = "none";
  }

  // ── Formes ──
  function buildShapeGrid() {
    var grid = document.getElementById("txt-shape-grid");
    grid.innerHTML = SHAPES.map(function (s) {
      var active = s.id === state.shape ? " active" : "";
      return (
        '<div class="txt-shape-cell' +
        active +
        '" onclick="pickTextShape(\'' +
        s.id +
        "')\">" +
        shapeThumb(s.id) +
        "<span>" +
        s.name +
        "</span></div>"
      );
    }).join("");
  }
  // Petit aperçu SVG de la forme.
  function shapeThumb(id) {
    var path = shapePath(id, 80, 34);
    if (id === "normal") {
      return '<svg viewBox="0 0 80 34" width="72" height="30"><text x="40" y="24" font-size="15" font-weight="700" text-anchor="middle" fill="#333">Abc</text></svg>';
    }
    return (
      '<svg viewBox="0 0 80 34" width="72" height="30"><defs><path id="tp-' +
      id +
      '" d="' +
      path +
      '"/></defs>' +
      '<text font-size="14" font-weight="700" fill="#333"><textPath href="#tp-' +
      id +
      '" startOffset="50%" text-anchor="middle">Abc</textPath></text></svg>'
    );
  }
  window.pickTextShape = function (id) {
    state.shape = id;
    var shapeVal = document.getElementById("txt-panel-shape-val");
    if (shapeVal) {
      shapeVal.textContent = (
        SHAPES.filter(function (s) {
          return s.id === id;
        })[0] || SHAPES[0]
      ).name;
    }
    buildShapeGrid();
    renderLive();
    hideShapePicker();
  };
  window.toggleShapePicker = function () {
    var p = document.getElementById("txt-shape-picker");
    var open = p.style.display !== "none";
    hideFontPicker();
    p.style.display = open ? "none" : "block";
    if (!open) buildShapeGrid();
  };
  function hideShapePicker() {
    var picker = document.getElementById("txt-shape-picker");
    if (picker) picker.style.display = "none";
  }

  // Trajectoire SVG d'une forme, dans une boîte WxH.
  function shapePath(id, W, H) {
    var m = 6; // marge
    var midY = H / 2;
    switch (id) {
      case "curve": // léger sourire
        return (
          "M " +
          m +
          " " +
          (midY + 4) +
          " Q " +
          W / 2 +
          " " +
          (H + 4) +
          " " +
          (W - m) +
          " " +
          (midY + 4)
        );
      case "arch": // arc vers le haut
        return (
          "M " +
          m +
          " " +
          (H - m) +
          " Q " +
          W / 2 +
          " " +
          -m +
          " " +
          (W - m) +
          " " +
          (H - m)
        );
      case "bridge": // haut plat, bords qui descendent
        return (
          "M " +
          m +
          " " +
          midY +
          " Q " +
          W / 2 +
          " " +
          m +
          " " +
          (W - m) +
          " " +
          midY
        );
      case "valley": // creux (frown)
        return (
          "M " +
          m +
          " " +
          (m + 2) +
          " Q " +
          W / 2 +
          " " +
          (H - 2) +
          " " +
          (W - m) +
          " " +
          (m + 2)
        );
      default:
        return "M " + m + " " + midY + " L " + (W - m) + " " + midY;
    }
  }

  // ─────────────── Rendu du texte dans le canvas ───────────────
  // Rendu live pendant l'édition (utilise `state`).
  function renderLive() {
    renderTextOnCanvas(state.zone, state);
  }

  // Rend (ou masque si data=null) le texte de la zone dans son élément canvas.
  // Le contenu va dans .dt-content (la poignée de resize reste intacte).
  function renderTextOnCanvas(zone, data) {
    var el = document.getElementById("text-" + zone);
    if (!el) return;
    var content = el.querySelector(".dt-content");
    if (!content) {
      content = document.createElement("span");
      content.className = "dt-content";
      el.insertBefore(content, el.firstChild);
    }
    if (!data || !data.text) {
      el.style.display = "none";
      content.innerHTML = "";
      el.classList.remove("is-shaped");
      if (typeof window.refreshZoneGuides === "function")
        window.refreshZoneGuides();
      /* Le RÉCAPITULATIF doit suivre la suppression. Ce `return` court-circuitait
         l'appel à updateTextRecap() posé en fin de fonction : la ligne du texte
         restait affichée avec son ancienne vignette alors que le vêtement était
         vide. majLigneTexte() gère déjà ce cas — elle masque la ligne et vide la
         source quand la zone n'a plus de texte ; encore fallait-il l'appeler. */
      if (typeof window.updateTextRecap === "function")
        window.updateTextRecap(zone);
      return;
    }
    el.style.display = "block";
    el.style.color = data.color;
    el.style.fontFamily = data.font;
    // Style : gras / italique / souligné.
    el.style.fontWeight = data.bold ? "800" : "400";
    el.style.fontStyle = data.italic ? "italic" : "normal";
    el.style.textDecoration = data.underline ? "underline" : "none";
    // Taille : priorité à une géométrie mémorisée (drag/resize), sinon la
    // taille choisie au panneau (data.size, en px).
    // data-wanted-size = taille SOUHAITÉE : clampTextToZone réduit si le texte
    // déborde, puis regrossit jusqu'à cette valeur si la place le permet.
    if (data.fontSize) {
      el.style.fontSize = data.fontSize;
      el.setAttribute("data-wanted-size", parseFloat(data.fontSize) || 20);
    } else if (data.size) {
      el.style.fontSize = data.size + "px";
      el.setAttribute("data-wanted-size", data.size);
    }
    // Autres géométries mémorisées (largeur/position).
    if (data.width) el.style.width = data.width;
    if (data.left) el.style.left = data.left;
    if (data.top) el.style.top = data.top;

    if (data.shape && data.shape !== "normal") {
      content.innerHTML = buildShapeSVG(data);
      el.classList.add("is-shaped");
    } else {
      el.classList.remove("is-shaped");
      /* Mise en forme par caractère : un <span> par segment. Sans segments, on
         reste sur textContent — plus sûr (aucune interprétation de balisage) et
         c'est le cas de l'immense majorité des textes.

         Les attributs de zone (police, taille) restent sur .design-text ; seuls
         couleur, graisse, style et souligné descendent sur les segments. */
      if (aDesSegments(data)) {
        content.innerHTML = normaliserSegments(data.segments)
          .map(function (s) {
            var st = [];
            if (s.color) st.push("color:" + s.color);
            if (s.bold) st.push("font-weight:800");
            if (s.italic) st.push("font-style:italic");
            if (s.underline) st.push("text-decoration:underline");
            return '<span class="dt-seg" style="' + esc(st.join(";")) + '">' +
                   esc(s.text) + "</span>";
          })
          .join("");
      } else {
        content.textContent = data.text;
      }
    }
    /* Contrainte : rester dans la zone.
       Rejouée après le chargement de la police : la première mesure se fait
       sur la police de repli (les Google Fonts arrivent en différé), donc sur
       des dimensions fausses — le texte pouvait déborder une fois la vraie
       police appliquée. */
    if (typeof window.clampTextToZone === "function") {
      window.clampTextToZone(zone);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          window.clampTextToZone(zone);
        });
      }
      setTimeout(function () {
        window.clampTextToZone(zone);
      }, 120);

      /* Rejeu à l'arrivée de l'IMAGE PRODUIT — contrepartie de la garde posée
         dans clampTextToZone (conf-text-clamp.js) : tant que l'image n'est pas
         décodée, le clamp sort sans rien borner. Sans ce rejeu, un texte plus
         large que sa zone resterait débordant après un chargement à froid.
         Les rejeux ci-dessus n'attendent que les POLICES, pas l'image. */
      var imgRef = document.querySelector(".product-img-single.on") ||
                   document.getElementById("view-face");
      if (imgRef && imgRef.tagName === "IMG" && !imgRef.complete) {
        imgRef.addEventListener("load", function () {
          window.clampTextToZone(zone);
        }, { once: true });
      }
    }
    if (typeof window.refreshZoneGuides === "function")
      window.refreshZoneGuides();

    /* Point de passage UNIQUE de toute création ou modification de texte
       (saisie, police, couleur, taille, forme, gras/italique/souligné, et
       `data = null` pour un masquage) : c'est donc ici qu'on tient la ligne du
       récapitulatif à jour, plutôt qu'à chacun des ~12 appelants. */
    if (typeof window.updateTextRecap === "function")
      window.updateTextRecap(zone);
  }

  // Construit le SVG d'un texte courbé qui remplit la largeur de l'élément.
  function buildShapeSVG(data) {
    var W = 300,
      H = 90;
    var path = shapePath(data.shape, W, H);
    var id = "shp-" + Math.abs(hash(data.text + data.shape));
    var weight = data.bold ? "800" : "700";
    var fstyle = data.italic ? "italic" : "normal";
    var deco = data.underline ? "underline" : "none";
    return (
      '<svg viewBox="0 0 ' +
      W +
      " " +
      H +
      '" width="100%" style="overflow:visible">' +
      '<defs><path id="' +
      id +
      '" d="' +
      path +
      '"/></defs>' +
      '<text font-size="42" font-weight="' +
      weight +
      '" fill="' +
      /* esc() : `data.color` vient de conf_texts (sessionStorage), donc de
         l'utilisateur. C'était la SEULE interpolation non échappée de ce
         gabarit — `data.text` et `data.font` le sont juste en dessous. Une
         valeur comme `#111" onload="…` s'échappait de l'attribut `fill`.
         Self-XSS seulement (conf_texts n'est pas transmis par le lien de
         partage), mais l'incohérence n'avait pas de raison d'être. */
      esc(data.color) +
      '" ' +
      'font-style="' +
      fstyle +
      '" text-decoration="' +
      deco +
      '" ' +
      'style="font-family:' +
      esc(data.font) +
      '">' +
      '<textPath href="#' +
      id +
      '" startOffset="50%" text-anchor="middle">' +
      esc(data.text) +
      "</textPath></text></svg>"
    );
  }
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  }

  // ─────────────── Restauration (reload / switch produit) ───────────────
  window.restoreTexts = function () {
    ["f", "fr", "b"].forEach(function (zone) {
      var st = getState(zone);
      var chip = document.getElementById("txt-chip-" + zone);
      var val = document.getElementById("txt-chip-val-" + zone);
      if (st) {
        renderTextOnCanvas(zone, st);
        if (chip && val) {
          val.textContent = st.text;
          val.style.fontFamily = st.font;
          chip.style.display = "flex";
        }
        if (typeof window.setTextZoneMode === "function")
          window.setTextZoneMode(zone, true);
      } else if (!window.__ouvertureDepuisPanier) {
        /* La branche « aucun texte » est DESTRUCTIVE : renderTextOnCanvas(null)
           pose display:none et vide le contenu (voir :971-973).

           On la saute pendant l'ouverture d'un article du panier. La clé de
           lecture est `window.currentProductType`, qui n'est posé qu'au milieu
           de selProd : tout appel antérieur lit l'ANCIEN produit, ne trouve
           rien, et efface les trois zones — y compris celles que la session
           porte bien pour le produit qu'on est en train d'ouvrir.

           Ne rien faire est sans risque : la passe suivante, une fois le
           produit aligné, rendra le texte s'il existe. Même principe que le
           garde de conf-logo-store.js. */
        renderTextOnCanvas(zone, null);
        if (chip) chip.style.display = "none";
        if (typeof window.setTextZoneMode === "function")
          window.setTextZoneMode(zone, false);
      }
    });
    if (typeof window.refreshTextButton === "function")
      window.refreshTextButton();
  };

  // Sauvegarde la géométrie (position/taille) après un drag/resize du texte.
  window.saveTextGeo = function (zone, geo) {
    var st = getState(zone);
    if (!st) return;
    if (geo.left) st.left = geo.left;
    if (geo.top) st.top = geo.top;
    if (geo.width) st.width = geo.width;
    if (geo.fontSize) st.fontSize = geo.fontSize;
    saveState(zone, st);

    /* Seul chemin de mutation qui ne repasse PAS par renderTextOnCanvas : un
       redimensionnement change la taille de police, donc l'aspect de la
       vignette. Le déplacement seul ne la change pas, mais l'anti-rebond rend
       ce rappel supplémentaire indolore. */
    if (typeof window.updateTextRecap === "function")
      window.updateTextRecap(zone);
  };

  // Expose l'accès à l'état sauvegardé (utilisé par le clamp / autres modules).
  window.getSavedText = getState;

  /**
   * Modifie UNE propriété de mise en forme d'un texte posé, et la PERSISTE.
   *
   * La barre d'outils flottante (conf-text-toolbar.js) appelait déjà cette
   * fonction — mais elle n'existait pas : son garde `typeof === 'function'`
   * échouait en silence et l'on tombait dans un repli qui écrivait sur le DOM
   * SANS RIEN ENREGISTRER. Couleur, police et style étaient donc perdus au
   * moindre rechargement ou changement de produit.
   *
   * @param {string} zone  - 'f' | 'fr' | 'b'
   * @param {string} prop  - 'font' | 'color' | 'size' | 'bold' | 'italic' | 'underline'
   * @param {*}      value - nouvelle valeur
   */
  /**
   * Redessine un texte depuis son état PERSISTÉ, en écartant tout ce que le DOM
   * peut porter de transitoire.
   *
   * Sert à annuler une saisie (Échap pendant l'édition sur place) : le texte
   * tapé disparaît, mais la mise en forme par caractère — déjà enregistrée dans
   * `conf_texts` — est conservée. Restaurer un instantané du DOM pris à
   * l'ouverture l'aurait au contraire effacée.
   *
   * @param {string} zone - 'f' | 'fr' | 'b'
   */
  window.rerenderText = function (zone) {
    var st = getState(zone);
    if (st) renderTextOnCanvas(zone, st);
  };

  window.setTextProp = function (zone, prop, value) {
    var st = getState(zone);
    if (!st) return false;                 // aucun texte sur cette zone

    if (prop === 'font') st.font = value;
    else if (prop === 'color') st.color = value;
    else if (prop === 'size') {
      st.size = value;
      /* fontSize prime sur size au rendu (géométrie issue d'un resize) : on
         l'aligne, sinon la taille choisie ici serait ignorée au retour. */
      st.fontSize = value + 'px';
    }
    else if (prop === 'bold') st.bold = !!value;
    else if (prop === 'italic') st.italic = !!value;
    else if (prop === 'underline') st.underline = !!value;
    else return false;                     // propriété inconnue : on n'écrit pas

    /* Un style GLOBAL efface la mise en forme par caractère : sinon les
       segments continueraient de la masquer, et cliquer « tout en rouge »
       laisserait le « N » de « Nike » dans son ancienne couleur sans que rien
       ne l'explique. Le geste global l'emporte, ce qui le rend aussi le moyen
       de repartir d'un texte propre. */
    if (prop === 'color' || prop === 'bold' || prop === 'italic' || prop === 'underline') {
      delete st.segments;
    }

    saveState(zone, st);
    renderTextOnCanvas(zone, st);
    return true;
  };

  /**
   * Applique une mise en forme à une PARTIE du texte seulement (le « N » de
   * « Nike » en rouge et gras). Découpe le texte en segments selon les bornes
   * de la sélection, applique l'attribut au segment central, puis persiste.
   *
   * @param {string} zone   - 'f' | 'fr' | 'b'
   * @param {string} prop   - 'color' | 'bold' | 'italic' | 'underline'
   * @param {*} value       - couleur (string) ou booléen
   * @param {Range} range   - la sélection, DANS le .dt-content de cette zone
   * @returns {boolean} false si la demande n'a pas pu être traitée
   */
  window.setTextPropSelection = function (zone, prop, value, range) {
    var st = getState(zone);
    if (!st || !range) return false;
    // Texte courbé : son contenu est un tracé SVG, pas du texte de flux.
    if (st.shape && st.shape !== "normal") return false;

    var el = document.getElementById("text-" + zone);
    var content = el && el.querySelector(".dt-content");
    if (!content) return false;

    /* Bornes en OFFSETS DE CARACTÈRES dans le texte complet.

       `range` est normalement un objet { debut, fin } fourni par
       conf-text-dblclick.js — des entiers, qui survivent au redessin du texte
       (un Range, lui, pointe sur des nœuds que renderTextOnCanvas détruit).
       La forme Range reste acceptée pour un appel direct. */
    var debut, fin;
    if (typeof range.debut === "number" && typeof range.fin === "number") {
      debut = range.debut;
      fin = range.fin;
    } else if (typeof range.cloneRange === "function") {
      var avant = range.cloneRange();
      avant.selectNodeContents(content);
      avant.setEnd(range.startContainer, range.startOffset);
      debut = avant.toString().length;
      fin = debut + range.toString().length;
    } else {
      return false;
    }
    if (fin <= debut || debut < 0) return false;

    var texte = content.textContent || "";
    if (!texte || fin > texte.length) return false;

    /* Segments actuels, ou un segment unique portant le style de la zone :
       un texte jamais enrichi doit conserver son apparence hors sélection. */
    var base = aDesSegments(st) ? normaliserSegments(st.segments) : [{
      text: texte,
      color: st.color || "",
      bold: !!st.bold,
      italic: !!st.italic,
      underline: !!st.underline,
    }];

    /* Redécoupage caractère par caractère : simple et sûr, quel que soit le
       découpage précédent. normaliserSegments() refusionne ensuite les voisins
       de même style, donc on ne garde pas un segment par lettre. */
    var lettres = [];
    base.forEach(function (s) {
      for (var i = 0; i < s.text.length; i++) {
        lettres.push({
          text: s.text.charAt(i),
          color: s.color || "",
          bold: !!s.bold,
          italic: !!s.italic,
          underline: !!s.underline,
        });
      }
    });

    for (var j = debut; j < fin && j < lettres.length; j++) {
      if (prop === "color") lettres[j].color = value || "";
      else if (prop === "bold") lettres[j].bold = !!value;
      else if (prop === "italic") lettres[j].italic = !!value;
      else if (prop === "underline") lettres[j].underline = !!value;
      else return false;
    }

    st.segments = normaliserSegments(lettres);
    st.text = texteDesSegments(st.segments);   // `text` reste la source brute
    saveState(zone, st);

    var etaitEnEdition = content.classList.contains("is-editing");
    renderTextOnCanvas(zone, st);

    /* Le redessin a remplacé le contenu de .dt-content : sans cette
       restauration, l'édition s'arrêtait silencieusement au premier clic et
       enchaîner deux styles sur la même lettre (gras PUIS rouge) était
       impossible. On repose l'édition ET la sélection, aux mêmes offsets. */
    if (etaitEnEdition) {
      var neuf = document.getElementById("text-" + zone);
      var cNeuf = neuf && neuf.querySelector(".dt-content");
      if (cNeuf) {
        cNeuf.setAttribute("contenteditable", "true");
        cNeuf.classList.add("is-editing");
        neuf.classList.add("is-editing");
        cNeuf.focus();
        if (typeof window.selectionnerOffsets === "function") {
          window.selectionnerOffsets(cNeuf, debut, fin);
        }
      }
    }
    return true;
  };

  /**
   * Change le CONTENU d'un texte déjà posé, sans toucher à sa mise en forme
   * (police, couleur, taille, forme) ni à sa position.
   *
   * Utilisé par l'édition en double-clic (conf-text-dblclick.js) : corriger une
   * faute ne doit pas obliger à supprimer puis retaper avec tous ses réglages.
   *
   * @param {string} zone - 'f' | 'fr' | 'b'
   * @param {string} text - nouveau contenu
   */
  window.updateTextContent = function (zone, text) {
    var st = getState(zone);
    if (!st) return;                       // aucun texte sur cette zone

    var value = String(text || '').trim();
    if (!value || value === st.text) return;

    /* Mise en forme par caractère et texte réécrit : les segments portent des
       positions, pas des lettres. On les conserve quand la LONGUEUR est
       inchangée (correction d'une faute : « Nkie » -> « Nike », chaque position
       garde son style) et on les abandonne sinon — remapper des styles sur un
       texte de longueur différente donnerait un résultat arbitraire, plus
       déroutant qu'un retour au style global. */
    if (aDesSegments(st)) {
      if (value.length === String(st.text || '').length) {
        var i = 0;
        st.segments = normaliserSegments(
          normaliserSegments(st.segments).map(function (s) {
            var morceau = value.substr(i, s.text.length);
            i += s.text.length;
            return {
              text: morceau, color: s.color,
              bold: s.bold, italic: s.italic, underline: s.underline,
            };
          })
        );
      } else {
        delete st.segments;
      }
    }

    st.text = value;
    saveState(zone, st);
    renderTextOnCanvas(zone, st);

    /* La longueur a changé : le texte peut déborder de sa zone imprimable.
       clampTextToZone réduit la police et borne la position. */
    if (typeof window.clampTextToZone === 'function') {
      window.clampTextToZone(zone);
    }
    // La vignette du récap suit le contenu affiché.
    if (typeof window.updateRecapThumbLogo === 'function') {
      window.updateRecapThumbLogo();
    }
  };

  /* ── LIGNES « TEXTE » DU RÉCAPITULATIF ──────────────────────────────────
     Le panneau de droite listait le produit et les logos, jamais les textes.
     On leur donne le même traitement : une ligne par zone, avec vignette,
     actualisée en direct.

     La vignette est rastérisée par window.textAssetDataUrl (conf-main-inline.js
     :2317) — le même rendu que les visuels envoyés à l'atelier, donc fidèle à
     la police, la couleur, le gras/italique/souligné et le texte courbé.

     NB : updateRecapThumbLogo(), appelée juste au-dessus, ne lit que #logo-f et
     ignore le texte — son commentaire d'origine (« la vignette du récap suit le
     contenu affiché ») laissait croire l'inverse. */
  var ZONES_RECAP = ['f', 'fr', 'b'];

  function majLigneTexte(zone) {
    var ligne = document.getElementById('rc-text-' + zone);
    var img = document.getElementById('rc-img-text-' + zone);
    /* Garde indispensable : `.recap` voit son innerHTML REMPLACÉ pour les
       coins, drapeaux et patchs (conf-dynamic-layout.js) — ces éléments
       n'existent alors plus. */
    if (!ligne || !img) return;

    if (typeof window.textAssetDataUrl !== 'function') return;

    /* Retour hybride (string ou Promise) : Promise.resolve normalise les deux. */
    Promise.resolve(window.textAssetDataUrl(zone)).then(function (src) {
      if (src) {
        img.src = src;
        ligne.style.display = 'flex';
      } else {
        /* Pas de texte dans cette zone : on masque ET on vide la source, sinon
           l'ancienne vignette réapparaîtrait au prochain affichage. */
        img.removeAttribute('src');
        ligne.style.display = 'none';
      }
    }).catch(function () { /* rastérisation impossible : on laisse en l'état */ });
  }

  /* Anti-rebond PAR ZONE : la rastérisation dessine sur un canvas, et
     conf-mobile.js observe `.recap` avec un MutationObserver. Sans anti-rebond,
     chaque frappe au clavier déclencherait un rendu complet du récapitulatif.

     Le minuteur était UNIQUE et partagé par les trois zones. Au rechargement,
     restoreTexts les traite en boucle rapide : chaque appel annulait le
     précédent par `clearTimeout`, et seule la DERNIÈRE zone survivait — le dos,
     traité en dernier et généralement vide, effaçait donc les lignes des textes
     de face. D'où un récapitulatif vide après F5 alors que les textes étaient
     bien présents sur le vêtement.

     Une entrée par zone : chaque zone ne s'annule plus qu'elle-même, ce qui
     conserve l'anti-rebond pour la frappe sans perdre les autres lignes. */
  var minuteursRecap = {};
  window.updateTextRecap = function (zone) {
    var zones = zone ? [zone] : ZONES_RECAP;
    zones.forEach(function (z) {
      clearTimeout(minuteursRecap[z]);
      minuteursRecap[z] = setTimeout(function () {
        majLigneTexte(z);
      }, 200);
    });
  };
})();

/* ══════════════════════════════════════════════════════════════════════
   Boîte de texte ajustée au contenu.

   Le cadre de sélection entourait une boîte large comme la zone imprimable,
   très au large des lettres. On veut qu'il colle au texte, SANS perdre la
   largeur en % : l'export la relit (style.width) pour reprojeter le texte sur
   la planche de production, et clampTextToZone s'en sert de plafond.

   La valeur est donc DÉPLACÉE de `width` vers `max-width` :
     - l'affichage suit `width:max-content` (CSS) => la boîte épouse le texte ;
     - le plafond de zone est conservé ;
     - data-w garde la valeur d'origine pour les lecteurs qui l'attendent.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function fitTextBox(el) {
    if (!el) return;
    var w = el.style.width;
    // Déjà converti, ou pas de largeur en % : rien à faire.
    if (!w || w.indexOf('%') === -1) return;
    el.setAttribute('data-w', w);
    el.style.maxWidth = w;
    el.style.width = '';        // laisse max-content s'appliquer
  }
  window.fitTextBox = fitTextBox;

  /** Applique l'ajustement à tous les textes présents. */
  function fitAllTextBoxes() {
    document.querySelectorAll('.design-text').forEach(fitTextBox);
  }
  window.fitAllTextBoxes = fitAllTextBoxes;

  /* Les textes sont créés/modifiés par plusieurs chemins (ajout, restauration,
     clamp, changement de produit). Plutôt que de brancher chacun, on observe
     les écritures de style sur la couche des logos. */
  function watch() {
    fitAllTextBoxes();
    var layer = document.getElementById('logo-layer');
    if (!layer || !window.MutationObserver) return;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (t && t.classList && t.classList.contains('design-text')) fitTextBox(t);
        // Nouveau texte inséré dans la couche.
        if (muts[i].addedNodes) {
          Array.prototype.forEach.call(muts[i].addedNodes, function (n) {
            if (n.nodeType === 1 && n.classList && n.classList.contains('design-text')) {
              fitTextBox(n);
            }
          });
        }
      }
    }).observe(layer, {
      attributes: true, attributeFilter: ['style'],
      childList: true, subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch);
  } else {
    watch();
  }
})();
