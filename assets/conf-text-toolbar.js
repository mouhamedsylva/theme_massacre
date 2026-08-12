/**
 * Barre d'outils TEXTE horizontale, placée au-dessus de l'aperçu produit.
 *
 * Remplace le basculement de la sidebar (qui désorientait le client) : la
 * personnalisation se fait ici, sans jamais masquer la liste des options ni
 * l'aperçu du produit.
 *
 * Sections : Police | B I U ≡ | Taille (curseur) | Couleur | Dupliquer Supprimer
 *
 * Tout est injecté par ce script (le template Liquid est proche de la limite
 * Shopify de 256 Ko). S'appuie sur les hooks existants de conf-text-editor.js :
 *   window.getTextState / setTextProp / removeText / duplicateText
 */
(function () {
  var BAR_ID = 'txt-toolbar';
  var curZone = null;          // zone du texte en cours d'édition

  var FONTS = [
    { name: 'Arial',            css: 'Arial, sans-serif' },
    { name: 'Impact',           css: "'Anton', Impact, sans-serif" },
    { name: 'Bebas Neue',       css: "'Bebas Neue', sans-serif" },
    { name: 'Oswald',           css: "'Oswald', sans-serif" },
    { name: 'Teko',             css: "'Teko', sans-serif" },
    { name: 'Montserrat',       css: "'Montserrat', sans-serif" },
    { name: 'Poppins',          css: "'Poppins', sans-serif" },
    { name: 'Righteous',        css: "'Righteous', cursive" },
    { name: 'Fredoka',          css: "'Fredoka One', cursive" },
    { name: 'Bangers',          css: "'Bangers', cursive" },
    { name: 'Luckiest Guy',     css: "'Luckiest Guy', cursive" },
    { name: 'Shrikhand',        css: "'Shrikhand', cursive" },
    { name: 'Lobster',          css: "'Lobster', cursive" },
    { name: 'Pacifico',         css: "'Pacifico', cursive" },
    { name: 'Dancing Script',   css: "'Dancing Script', cursive" },
    { name: 'Great Vibes',      css: "'Great Vibes', cursive" },
    { name: 'Sacramento',       css: "'Sacramento', cursive" },
    { name: 'Satisfy',          css: "'Satisfy', cursive" },
    { name: 'Yellowtail',       css: "'Yellowtail', cursive" },
    { name: 'Caveat',           css: "'Caveat', cursive" },
    { name: 'Permanent Marker', css: "'Permanent Marker', cursive" },
    { name: 'Rock Salt',        css: "'Rock Salt', cursive" },
    { name: 'Special Elite',    css: "'Special Elite', monospace" },
    // Polices supplémentaires populaires
    { name: 'Roboto',           css: "'Roboto', sans-serif" },
    { name: 'Open Sans',        css: "'Open Sans', sans-serif" },
    { name: 'Lato',             css: "'Lato', sans-serif" },
    { name: 'Raleway',          css: "'Raleway', sans-serif" },
    { name: 'Ubuntu',           css: "'Ubuntu', sans-serif" },
    { name: 'Nunito',           css: "'Nunito', sans-serif" },
    { name: 'Playfair Display', css: "'Playfair Display', serif" },
    { name: 'Merriweather',     css: "'Merriweather', serif" },
    { name: 'Lora',             css: "'Lora', serif" },
    { name: 'PT Serif',         css: "'PT Serif', serif" },
    { name: 'Crimson Text',     css: "'Crimson Text', serif" },
    { name: 'Libre Baskerville',css: "'Libre Baskerville', serif" },
    { name: 'Anton',            css: "'Anton', sans-serif" },
    { name: 'Archivo Black',    css: "'Archivo Black', sans-serif" },
    { name: 'Alfa Slab One',    css: "'Alfa Slab One', cursive" },
    { name: 'Black Ops One',    css: "'Black Ops One', cursive" },
    { name: 'Russo One',        css: "'Russo One', sans-serif" },
    { name: 'Passion One',      css: "'Passion One', cursive" },
    { name: 'Fjalla One',       css: "'Fjalla One', sans-serif" },
    { name: 'Bebas',            css: "'Bebas', sans-serif" },
    { name: 'Monoton',          css: "'Monoton', cursive" },
    { name: 'Press Start 2P',   css: "'Press Start 2P', cursive" },
    { name: 'Creepster',        css: "'Creepster', cursive" },
    { name: 'Bungee',           css: "'Bungee', cursive" },
    { name: 'Acme',             css: "'Acme', sans-serif" },
    { name: 'Patua One',        css: "'Patua One', cursive" },
    { name: 'Cinzel',           css: "'Cinzel', serif" },
    { name: 'Courgette',        css: "'Courgette', cursive" },
    { name: 'Indie Flower',     css: "'Indie Flower', cursive" },
    { name: 'Shadows Into Light',css: "'Shadows Into Light', cursive" },
    { name: 'Amatic SC',        css: "'Amatic SC', cursive" },
    { name: 'Kalam',            css: "'Kalam', cursive" },
    { name: 'Architects Daughter',css: "'Architects Daughter', cursive" },
    { name: 'Cookie',           css: "'Cookie', cursive" },
    { name: 'Allura',           css: "'Allura', cursive" },
    { name: 'Tangerine',        css: "'Tangerine', cursive" },
    { name: 'Pinyon Script',    css: "'Pinyon Script', cursive" },
    { name: 'Monoton',          css: "'Monoton', cursive" },
    { name: 'Courier New',      css: "'Courier New', monospace" },
    { name: 'Courier',          css: "'Courier', monospace" },
    { name: 'Times New Roman',  css: "'Times New Roman', serif" },
    { name: 'Georgia',          css: "'Georgia', serif" },
    { name: 'Verdana',          css: "'Verdana', sans-serif" },
    { name: 'Tahoma',           css: "'Tahoma', sans-serif" }
  ];
  var COLORS = ['#ffffff','#000000','#f5f2ed','#9aa0a6','#4a4a4a','#3f7d8c',
                '#14366b','#3fb6e3','#1f7a4d','#f2c1d1','#e8558f','#c0392b',
                '#e07b1a','#efd23c','#8e5fd0','#7a4a2a'];

  /* ── Construction de la barre ─────────────────────────────────────────── */
  function buildBar() {
    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'txt-tb';
    bar.style.display = 'none';
    bar.innerHTML =
      // Police
      '<div class="txt-tb-grp txt-tb-font">' +
        /* Chevron : sans lui, rien n'indique que « Police » ouvre une liste —
           le bouton se lit comme un simple libellé. */
        '<button type="button" class="txt-tb-btn txt-tb-label" data-act="font">' +
          '<span class="txt-tb-fname">Police</span>' +
          '<svg class="txt-tb-caret" viewBox="0 0 24 24" width="12" height="12" ' +
            'fill="none" stroke="currentColor" stroke-width="2.5" ' +
            'stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="6 9 12 15 18 9"/></svg>' +
        '</button>' +
        '<div class="txt-tb-pop" data-pop="font"></div>' +
      '</div>' +
      // Styles
      '<div class="txt-tb-grp">' +
        '<button type="button" class="txt-tb-btn" data-act="bold" title="Gras"><b>B</b></button>' +
        '<button type="button" class="txt-tb-btn" data-act="italic" title="Italique"><i>I</i></button>' +
        '<button type="button" class="txt-tb-btn" data-act="underline" title="Souligné"><u>U</u></button>' +
      '</div>' +
      // Taille
      '<div class="txt-tb-grp txt-tb-size">' +
        '<span class="txt-tb-cap">Taille</span>' +
        /* Bornes calées sur celles réellement appliquées par
           clampTextToZone() : plancher 8px, plafond MAX_TEXT_SIZE (28,
           imposé par l'atelier). Un curseur qui irait au-delà donnerait
           l'impression de ne rien faire — c'est ce qui se passait avant. */
        /* max=200 : valeur de construction, réécrite depuis window.MAX_TEXT_SIZE
           à l'ouverture de la barre (voir plus bas). Alignée pour éviter un
           curseur qui saute de 28 à 200 au premier affichage. */
        '<input type="range" class="txt-tb-range" data-act="size" min="8" max="200" step="1" value="20">' +
        '<span class="txt-tb-size-val">20</span>' +
      '</div>' +
      // Couleur
      '<div class="txt-tb-grp txt-tb-color">' +
        '<button type="button" class="txt-tb-btn txt-tb-label" data-act="color">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:4px">' +
            '<circle cx="12" cy="12" r="10" fill="url(#colorGradient)"/>' +
            '<defs>' +
              '<linearGradient id="colorGradient" x1="0%" y1="0%" x2="100%" y2="100%">' +
                '<stop offset="0%" style="stop-color:#ff0000"/>' +
                '<stop offset="25%" style="stop-color:#ffff00"/>' +
                '<stop offset="50%" style="stop-color:#00ff00"/>' +
                '<stop offset="75%" style="stop-color:#00ffff"/>' +
                '<stop offset="100%" style="stop-color:#0000ff"/>' +
              '</linearGradient>' +
            '</defs>' +
          '</svg>' +
          'Couleur' +
        '</button>' +
        '<div class="txt-tb-pop" data-pop="color"></div>' +
      '</div>' +
      // Actions
      '<div class="txt-tb-grp">' +
        '<button type="button" class="txt-tb-btn txt-tb-del" data-act="del" title="Supprimer">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6"/></svg>' +
        '</button>' +
      '</div>';

    // Menu polices avec scroll
    var fp = bar.querySelector('[data-pop="font"]');
    fp.innerHTML = '<div class="txt-tb-font-scroll">' + 
      FONTS.map(function (f) {
        return '<button type="button" class="txt-tb-fitem" data-font="' + f.css + '" ' +
               'style="font-family:' + f.css + '">' + f.name + '</button>';
      }).join('') +
      '</div>';

    // Nuancier
    var cp = bar.querySelector('[data-pop="color"]');
    /* Les pastilles vivent dans leur propre grille : sans ce conteneur, le
       bloc « Couleur personnalisée » comptait comme une case du nuancier. */
    cp.innerHTML =
      '<div class="txt-tb-sw-grid">' +
      COLORS.map(function (c) {
        var b = (c === '#ffffff' || c === '#f5f2ed') ? ';border:1px solid #ddd' : '';
        return '<button type="button" class="txt-tb-sw" data-color="' + c + '" ' +
               'aria-pressed="false" title="' + c + '" ' +
               'style="background:' + c + b + '"></button>';
      }).join('') +
      '</div>' +
      '<div class="txt-tb-custom-color">' +
        '<label class="txt-tb-custom-label">' +
          '<svg viewBox="0 0 32 32" width="32" height="32" class="txt-tb-custom-icon">' +
            '<circle cx="16" cy="16" r="14" fill="url(#customColorGradient)" stroke="#ddd" stroke-width="2"/>' +
            '<defs>' +
              '<linearGradient id="customColorGradient" x1="0%" y1="0%" x2="100%" y2="100%">' +
                '<stop offset="0%" style="stop-color:#ff0000"/>' +
                '<stop offset="25%" style="stop-color:#ffff00"/>' +
                '<stop offset="50%" style="stop-color:#00ff00"/>' +
                '<stop offset="75%" style="stop-color:#00ffff"/>' +
                '<stop offset="100%" style="stop-color:#0000ff"/>' +
              '</linearGradient>' +
            '</defs>' +
          '</svg>' +
          '<input type="color" class="txt-tb-custom-input" id="txt-tb-custom-color-input" value="#ffffff">' +
          '<span>Couleur personnalisée</span>' +
        '</label>' +
      '</div>';
    
    // Ajouter l'événement pour le color picker après l'injection
    var tbColorInput = cp.querySelector('#txt-tb-custom-color-input');
    if (tbColorInput) {
      // Clic sur le label (ou le cercle SVG) déclenche l'input
      var tbLabel = cp.querySelector('.txt-tb-custom-label');
      if (tbLabel) {
        tbLabel.addEventListener('click', function() {
          tbColorInput.click();
        });
      }
      
      tbColorInput.addEventListener('input', function(e) {
        var c = e.target.value;
        applyProp('color', c);
      });
    }

    /* TACTILE : le `click` n'arrivait pas toujours sur mobile — le tap
       pouvait être consommé par la sélection de texte du navigateur (le
       libellé « Police » se surlignait en bleu au lieu d'ouvrir la liste).

       On traite donc `touchend` comme un clic. `touchend` et non
       `touchstart` : l'utilisateur doit pouvoir amorcer un défilement de la
       barre sans déclencher le bouton sous son doigt.

       Le drapeau neutralise le `click` synthétique que le navigateur émet
       ensuite — sans lui, togglePop() basculerait deux fois et le menu se
       refermerait aussitôt. Ce filtre est posé en CAPTURE et AVANT
       l'écouteur `click` normal, sinon celui-ci s'exécuterait quand même. */
    var touchHandled = false;

    bar.addEventListener('click', function (e) {
      if (touchHandled) e.stopImmediatePropagation();
    }, true);

    bar.addEventListener('touchend', function (e) {
      // Un seul doigt, et pas sur le curseur de taille (qui gère son geste).
      if (e.changedTouches && e.changedTouches.length > 1) return;
      var t = e.target;
      if (t && t.closest && t.closest('input[type="range"]')) return;
      touchHandled = true;
      setTimeout(function () { touchHandled = false; }, 400);
      onBarClick(e);
      /* `passive: false` : onBarClick() appelle preventDefault(), qui serait
         ignoré (et signalé en console) sur un écouteur passif. */
    }, { passive: false });

    bar.addEventListener('click', onBarClick);
    bar.addEventListener('input', onBarInput);
    return bar;
  }

  /* Sort les menus de la barre et les rattache au <body>.

     POURQUOI : la barre est montée dans `.cv-wrap`, qui porte
     `overflow: hidden` — un menu resté à l'intérieur se fait rogner et
     n'apparaît jamais. C'est vrai sur desktop comme sur mobile.

     POURQUOI ICI, et pas à l'ouverture : déplacer un nœud PENDANT que le clic
     se propage à travers lui interrompt cette propagation. Le menu recevait
     bien sa classe, mais l'événement se perdait en route et il se refermait
     dans la foulée. On déplace donc une fois pour toutes, à froid.

     Les menus gardent leur propre écouteur : sortis de la barre, ils ne
     bénéficient plus de la délégation posée sur elle. */
  function detachPops(bar) {
    bar.querySelectorAll('.txt-tb-pop').forEach(function (pop) {
      pop.style.display = 'none';   // état initial garanti, sans dépendre du CSS
      pop.addEventListener('click', onBarClick);
      document.body.appendChild(pop);
    });
  }

  /* Insère la barre DANS .cv-wrap, en position absolue (hors du flux) : elle
     flotte au-dessus de l'aperçu sans jamais le rétrécir — comme .side-toggle,
     déjà ancré de cette façon dans ce conteneur. */
  function mountBar() {
    if (document.getElementById(BAR_ID)) return document.getElementById(BAR_ID);
    var host = document.querySelector('.cv-wrap');
    if (!host) return null;
    var bar = buildBar();
    host.appendChild(bar);
    detachPops(bar);   // avant tout clic : voir detachPops()
    return bar;
  }

  /* ── Lecture / écriture de l'état du texte ────────────────────────────── */
  function textEl(zone) { return document.getElementById('text-' + zone); }

  function applyProp(prop, value) {
    if (!curZone) return;
    /* Voie normale : l'éditeur applique ET persiste. On ne sort que s'il a
       réellement traité la demande — il renvoie false quand la zone n'a pas
       d'état sauvegardé, cas où le repli DOM ci-dessous reste utile.

       Le plafond du curseur est resynchronisé AVANT de sortir : c'est le
       chemin emprunté en usage normal, et l'oublier ici laissait la plage du
       curseur figée sur l'ancien texte. */
    if (typeof window.setTextProp === 'function') {
      if (window.setTextProp(curZone, prop, value)) { refreshSizeMax(); return; }
    }
    // Repli : applique directement sur l'élément (sans persistance).
    var el = textEl(curZone);
    if (!el) return;
    if (prop === 'font') el.style.fontFamily = value;
    else if (prop === 'color') el.style.color = value;
    else if (prop === 'size') {
      el.style.fontSize = value + 'px';
      /* data-wanted-size = taille SOUHAITÉE. clampTextToZone() s'en sert
         comme cible pour regrossir le texte quand la zone le permet : sans
         cette mise à jour, il ramenait aussitôt la police à l'ancienne
         valeur et le curseur semblait bloqué dès qu'on descendait.
         Même contrat que conf-text-editor.js et conf-logo-drag.js. */
      el.setAttribute('data-wanted-size', value);
    }
    else if (prop === 'bold') el.style.fontWeight = value ? '700' : '400';
    else if (prop === 'italic') el.style.fontStyle = value ? 'italic' : 'normal';
    else if (prop === 'underline') el.style.textDecoration = value ? 'underline' : 'none';
    if (typeof window.clampTextToZone === 'function') window.clampTextToZone(curZone);
    refreshSizeMax();
  }

  /**
   * Resynchronise le plafond du curseur après une modification du texte.
   *
   * Le plafond tenable change avec le contenu et la police : « Didi » tient
   * plus gros que vingt lettres, et le gras réduit encore la marge. Appelé
   * sur les DEUX voies d'applyProp (éditeur et repli DOM).
   */
  function refreshSizeMax() {
    var bar = document.getElementById(BAR_ID);
    if (!bar) return;
    syncSizeMax(bar.querySelector('[data-act="size"]'), textEl(curZone));
  }

  /**
   * Aligne le plafond du curseur sur la taille maximale que la zone accepte.
   *
   * clampTextToZone() écrit cette mesure dans data-max-fit. On la relit ici
   * plutôt que de la recalculer : elle dépend du texte saisi et de la police,
   * et le clamp est déjà le passage obligé de toute modification.
   *
   * Plancher à 8 pour rester cohérent avec le clamp, et repli sur
   * MAX_TEXT_SIZE tant qu'aucun clamp n'a encore tourné.
   */
  function syncSizeMax(range, el) {
    if (!range || !el) return;
    var fit = parseFloat(el.getAttribute('data-max-fit'));
    if (isNaN(fit)) return;
    range.max = Math.max(8, fit);
    /* Le curseur ne doit pas rester au-delà du nouveau plafond : un texte
       rallongé réduit la taille tenable, et une poignée restée à droite
       laisserait croire à une marge qui n'existe plus. */
    if (parseFloat(range.value) > range.max) {
      range.value = range.max;
      showSizeVal(range.value);
    }
  }

  /** `rgb(r, g, b)` (ce que renvoie getComputedStyle) → `#rrggbb`. */
  function toHex(color) {
    if (!color) return '';
    if (color.charAt(0) === '#') return color.toLowerCase();
    var m = color.match(/\d+/g);
    if (!m || m.length < 3) return '';
    return '#' + m.slice(0, 3).map(function (n) {
      return ('0' + parseInt(n, 10).toString(16)).slice(-2);
    }).join('');
  }

  /** Marque la pastille correspondant à la couleur active (anneau sombre). */
  function markActiveSwatch(color) {
    var want = String(color || '').toLowerCase();
    document.querySelectorAll('.txt-tb-sw').forEach(function (sw) {
      var mine = (sw.getAttribute('data-color') || '').toLowerCase();
      sw.setAttribute('aria-pressed', mine === want ? 'true' : 'false');
    });
  }

  function onBarClick(e) {
    var btn = e.target.closest('[data-act], [data-font], [data-color]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    // Choix d'une police / couleur dans un menu.
    if (btn.hasAttribute('data-font')) {
      applyProp('font', btn.getAttribute('data-font'));
      closePops();
      var lbl = document.querySelector('#' + BAR_ID + ' .txt-tb-font .txt-tb-label');
      if (lbl) lbl.style.fontFamily = btn.getAttribute('data-font');
      return;
    }
    if (btn.hasAttribute('data-color')) {
      var c = btn.getAttribute('data-color');
      applyProp('color', c);
      markActiveSwatch(c);
      closePops();
      return;
    }

    var act = btn.getAttribute('data-act');
    if (act === 'font' || act === 'color') { togglePop(act); return; }
    if (act === 'bold' || act === 'italic' || act === 'underline') {
      btn.classList.toggle('on');
      applyProp(act, btn.classList.contains('on'));
      return;
    }
    if (act === 'del') {
      if (typeof window.removeText === 'function') window.removeText(curZone);
      hide();
      // Force le retrait de la sélection
      if (typeof window.clearDesignTextSelection === 'function') {
        window.clearDesignTextSelection();
      }
      return;
    }
  }

  /** Reflète la valeur du curseur à côté de lui. */
  function showSizeVal(v) {
    var out = document.querySelector('#' + BAR_ID + ' .txt-tb-size-val');
    if (out) out.textContent = v;
  }

  function onBarInput(e) {
    var r = e.target.closest('[data-act="size"]');
    if (r) {
      var v = parseInt(r.value, 10) || 20;
      applyProp('size', v);
      showSizeVal(v);
      return;
    }
  }

  /* Les menus vivent dans <body>, pas dans la barre.

     La barre est montée dans `.cv-wrap`, qui porte `overflow: hidden`. Un menu
     ouvert en `position: absolute` déborde sous la barre et s'y fait rogner —
     sur desktop comme sur mobile. Le déplacer dans <body> le met hors de portée
     de tout ancêtre rogneur ; en contrepartie il faut le positionner nous-mêmes
     (plus d'ancêtre positionné de référence), d'où placePop(). */
  function popEl(kind) {
    return document.querySelector('.txt-tb-pop[data-pop="' + kind + '"]');
  }

  /** Aligne le menu sous son bouton, en le gardant dans l'écran. */
  function placePop(pop, kind) {
    var btn = document.querySelector('#' + BAR_ID + ' [data-act="' + kind + '"]');
    if (!btn) return;
    var b = btn.getBoundingClientRect();

    pop.style.position = 'fixed';
    pop.style.top = Math.round(b.bottom + 8) + 'px';
    pop.style.left = '0px';
    pop.style.transform = 'none';   // neutralise le translateX(-50%) du CSS

    // Centré sous le bouton, puis ramené dans l'écran s'il dépasse.
    var w = pop.offsetWidth;
    var x = b.left + b.width / 2 - w / 2;
    var max = document.documentElement.clientWidth - w - 8;
    pop.style.left = Math.round(Math.max(8, Math.min(x, max))) + 'px';
  }

  function togglePop(kind) {
    var pop = popEl(kind);
    if (!pop) return;
    var isOpen = pop.classList.contains('on');
    closePops();
    if (!isOpen) {
      pop.classList.add('on');
      pop.style.display = 'block';   // <-- forcé, indépendant du CSS
      pop.style.zIndex = '99999';    // <-- au cas où un élément du thème passe devant
      placePop(pop, kind);
    }
  }

  function closePops() {
    document.querySelectorAll('.txt-tb-pop.on')
      .forEach(function (p) {
        p.classList.remove('on');
        p.style.display = 'none';    // <-- forcé aussi à la fermeture
      });
  }

  /* ── API publique ─────────────────────────────────────────────────────── */
  /** Affiche la barre pour la zone donnée et synchronise ses contrôles. */
  window.showTextToolbar = function (zone) {
    var bar = mountBar();
    if (!bar) return;
    curZone = zone;
    var el = textEl(zone);
    var cs = el ? window.getComputedStyle(el) : null;

    // Synchronise les contrôles sur l'état réel du texte.
    var range = bar.querySelector('[data-act="size"]');
    if (range && cs) {
      /* Le plafond suit MAX_TEXT_SIZE (exposé par le template) au lieu d'être
         figé : si l'atelier change sa contrainte, le curseur reste honnête.
         Lu ici et non à la construction — la barre est montée avant que le
         template n'ait exposé la valeur. */
      if (window.MAX_TEXT_SIZE) range.max = window.MAX_TEXT_SIZE;
      /* Plafond effectif : la plus grande police qui tienne dans la zone,
         mesurée par clampTextToZone(). Le curseur s'arrête donc là où le
         texte remplit son gabarit — au lieu d'offrir une course morte
         jusqu'à MAX_TEXT_SIZE, qui donnait un curseur à 45 pour un texte
         rendu à 22. */
      syncSizeMax(range, el);
      range.value = Math.round(parseFloat(cs.fontSize) || 20);
      showSizeVal(range.value);
    }
    
    /* Le nuancier vit dans <body> (voir detachPops) : on interroge le
       document, et non la barre, sinon l'input reste introuvable. */
    var customColorInput = document.getElementById('txt-tb-custom-color-input');
    if (customColorInput && cs) {
      // `value` d'un input[type=color] n'accepte que du #rrggbb.
      customColorInput.value = toHex(cs.color) || '#ffffff';
    }
    if (cs) markActiveSwatch(toHex(cs.color));

    var fl = bar.querySelector('.txt-tb-font .txt-tb-label');
    if (fl && cs) fl.style.fontFamily = cs.fontFamily || '';
    if (cs) {
      var setOn = function (act, isOn) {
        var b = bar.querySelector('[data-act="' + act + '"]');
        if (b) b.classList.toggle('on', !!isOn);
      };
      setOn('bold', parseInt(cs.fontWeight, 10) >= 600);
      setOn('italic', cs.fontStyle === 'italic');
      setOn('underline', (cs.textDecorationLine || cs.textDecoration || '').indexOf('underline') !== -1);
    }
    closePops();
    bar.style.display = 'flex';
  };

  /** Masque la barre. */
  function hide() {
    var bar = document.getElementById(BAR_ID);
    if (bar) { bar.style.display = 'none'; closePops(); }
    curZone = null;
  }
  window.hideTextToolbar = hide;

  // Clic hors barre et hors texte -> ferme les menus (garde la barre visible
  // tant qu'un texte est sélectionné ; c'est la désélection qui la masque).
  document.addEventListener('mousedown', function (e) {
    if (e.target.closest('#' + BAR_ID)) return;
    /* Les menus sont déplacés dans <body> (voir togglePop) : tester la seule
       barre les considérait comme « hors barre » et les fermait sur le
       mousedown qui précède le click d'ouverture — ils se refermaient donc
       aussitôt ouverts, et paraissaient ne jamais s'afficher. */
    if (e.target.closest('.txt-tb-pop')) return;
    closePops();
  });
})();
