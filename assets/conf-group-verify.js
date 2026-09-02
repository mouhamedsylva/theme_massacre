/**
 * ÉTAPE 3 « VÉRIFIER » du parcours de commande groupe.
 *
 * Affiche une carte par ligne du tableau : le vêtement rendu à SA couleur,
 * portant SON nom floqué, avec sa taille et sa quantité.
 *
 * ── POURQUOI CE FICHIER PLUTÔT QU'UN CLONE DU CANVAS ────────────────────────
 * Les positions des calques sont exprimées en pourcentages du #logo-layer, pas
 * de l'image du vêtement : les deux boîtes ne coïncident pas (padding, image
 * centrée avec bandes vides). Reproduire ces % ailleurs ne peut pas être
 * fidèle — c'est documenté dans conf-group-preview.js:97-118.
 *
 * On réutilise donc window.captureAllViews(), qui renvoie des positions en
 * FRACTIONS DE L'IMAGE, et le patron .ov-stage de la « Vue d'ensemble ».
 *
 * ── LES DEUX PIÈGES ─────────────────────────────────────────────────────────
 * 1. captureAllViews() MESURE LE DOM LIVE. Sur un canvas masqué, les mesures
 *    valent zéro. On capture donc pendant que le canvas est encore visible,
 *    avant que le navigateur n'applique le masquage de l'étape.
 *
 * 2. Chaque capture RASTERISE le texte en PNG (opération synchrone, 15-40 ms).
 *    En rendre trente-six d'affilée fige l'onglet près d'une seconde. Deux
 *    parades : une seule capture par NOM DISTINCT (le rendu ne dépend que du
 *    nom — la couleur, elle, est substituée après coup), et une pagination.
 */
(function () {
  'use strict';

  /* Douze cartes par page : au-delà, le temps de calcul devient perceptible.
     Quatre rangées de trois sur un écran large. */
  var PAR_PAGE = 12;

  /* AUCUN COEFFICIENT D'ÉCHELLE : les cartes rendent la géométrie EXACTE de la
     capture, comme la « Vue d'ensemble ».

     Deux coefficients ont existé ici — l'un grossissait le texte pour
     compenser une marge d'image, corrigée depuis à la source
     (conf-share.js) ; l'autre agrandissait les logos pour les rendre lisibles
     dans une carte étroite. Ce second faisait diverger deux écrans qui
     montrent le même design, et que le client compare avant de payer.

     La lisibilité vient de la taille des cartes (conf-styles.css). */

  var pageCourante = 0;
  var lignesCourantes = [];
  /* Cache des captures, par nom floqué. Le rendu d'un nom ne dépend QUE de ce
     nom : deux personnes portant « ame » partagent la même géométrie et le
     même PNG de texte, seule leur couleur de fond diffère. */
  var cacheCaptures = null;
  var jeton = 0;

  function esc(s) {
    if (typeof window.grpEsc === 'function') return window.grpEsc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeSrc(u) {
    if (typeof window.safeImgSrc === 'function') return window.safeImgSrc(u);
    return String(u == null ? '' : u).replace(/"/g, '&quot;');
  }

  /** @returns {string} hex de la couleur nommée, pour la pastille. */
  function hexDeCouleur(nom) {
    var liste = (typeof window.grpColors === 'function') ? window.grpColors() : [];
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].name === nom) {
        var m = String(liste[i].hex || '').match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i);
        return m ? m[0] : '#ccc';
      }
    }
    return '#ccc';
  }

  /**
   * URL du vêtement pour une couleur DONNÉE — pas celle affichée à l'écran.
   *
   * captureAllViews() renvoie un `background` calé sur la couleur du canvas :
   * toutes les cartes seraient identiques. On le remplace donc, exactement
   * comme le fait l'aperçu de ligne (conf-group-preview.js:175).
   */
  function fondPourCouleur(nomCouleur) {
    if (!nomCouleur) return '';
    var key = window.currentProductKey || window.currentProductType || 'sweatshirt';
    var slug = (window.COLOR_SLUGS_MAP && window.COLOR_SLUGS_MAP[nomCouleur]) ||
               (window.COLOR_SLUGS && window.COLOR_SLUGS[nomCouleur]);
    var prefix = window.PRODUCT_SLUGS && window.PRODUCT_SLUGS[key];
    if (!prefix || !slug || typeof window.colorImageCandidates !== 'function') return '';
    var cands = window.colorImageCandidates(prefix, slug, 'face') || [];
    var url = cands[0] || '';
    /* `colorImageCandidates` peut renvoyer une URL protocole-relative (`//…`),
       que la liste blanche d'images rejette. */
    return (url && typeof window.absUrl === 'function') ? window.absUrl(url) : url;
  }

  /** Laisse le navigateur peindre entre deux lots, pour ne pas figer l'onglet. */
  function respirer() {
    return new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
  }

  /* ═══ BOÎTE DU CANVAS RÉEL ═══════════════════════════════════════════════

     La capture a besoin d'un canvas MESURABLE, mais il est masqué aux étapes
     « Configurer » et « Vérifier ». On lui fabrique donc une boîte — et ses
     dimensions étaient jusqu'ici ESTIMÉES : 85 % de la hauteur d'écran, une
     largeur déduite de constantes codées en dur.

     Or l'image du vêtement vise 60 % de la hauteur. Dans une boîte de 85 %,
     elle était mesurée plus petite que dans le canvas réel, et les logos —
     rapportés à elle — sortaient 1,8 fois trop gros.

     Trois estimations successives ont déplacé l'écart sans le fermer : le
     défaut n'était pas dans les valeurs choisies, mais dans le fait de les
     choisir. On MESURE donc le canvas tant qu'il est visible, et on rejoue
     cette boîte à l'identique. */
  var boiteCanvas = null;
  var captureEnCours = false;

  /** Relève les dimensions du canvas si elles sont exploitables. */
  function memoriserBoiteCanvas() {
    /* Jamais pendant une capture : celle-ci force ses propres dimensions sur
       `.cv-wrap`, et les relever reviendrait à mémoriser la boîte qu'on vient
       d'inventer — la mesure se figerait sur elle-même. */
    if (captureEnCours) return;
    var wrap = document.querySelector('.cv-wrap');
    if (!wrap) return;
    var r = wrap.getBoundingClientRect();
    /* Seuil de 200 px : sous cette taille le canvas est en cours de masquage
       ou de mise en page, sa boîte ne représente rien. */
    if (r.width > 200 && r.height > 200) {
      boiteCanvas = { w: Math.round(r.width), h: Math.round(r.height) };
    }
  }

  /* La mesure suit le canvas tant qu'il vit : redimensionnement de la fenêtre,
     ouverture d'un panneau, changement de produit. Un intervalle plutôt qu'un
     observateur — la boîte dépend de la MISE EN PAGE, qu'aucun événement DOM
     ne signale de façon fiable. Deux fois par seconde suffit et ne coûte rien
     (une lecture de dimensions). */
  setInterval(memoriserBoiteCanvas, 500);
  document.addEventListener('DOMContentLoaded', memoriserBoiteCanvas);

  /**
   * Attend le décodage des logos posés sur le vêtement.
   *
   * La capture mesure la boîte de chaque calque. Or `.design-logo img` est en
   * `height: auto` : tant que l'image n'est pas décodée, sa hauteur vaut ZÉRO
   * et le calque se réduit à un point — le logo sortait en pastille noire
   * minuscule sur les cartes.
   *
   * Le décodage est en général déjà fait ; cette attente ne coûte donc rien
   * dans le cas courant. Le délai de sécurité évite qu'une image cassée ne
   * bloque indéfiniment le rendu de l'écran.
   */
  function attendreLogos() {
    var imgs = document.querySelectorAll('#logo-layer .design-logo img');
    var attentes = [];

    /* CALQUES NON MESURABLES → on attend une frame de plus.

       Au rechargement, restoreUploads() (conf-main-inline.js:6212) pose la
       source puis la géométrie dans la foulée, mais le navigateur n'a pas
       encore calculé la mise en page : `offsetWidth` vaut zéro et la capture
       lit une position par défaut — le logo sortait à gauche du texte au lieu
       de sa vraie place.

       On laisse donc passer deux rendus avant de mesurer : le premier applique
       les styles, le second les met en page. */
    var pasEncorePlace = false;
    Array.prototype.forEach.call(imgs, function (im) {
      var calque = im.parentElement;
      if (calque && im.getAttribute('src') && !calque.offsetWidth) pasEncorePlace = true;
    });
    if (pasEncorePlace) {
      attentes.push(new Promise(function (res) {
        requestAnimationFrame(function () { requestAnimationFrame(res); });
      }));
    }

    /* forEach plutôt qu'une boucle `var` : chaque écouteur doit capturer SON
       image. Avec `var`, toutes les fonctions partageraient la dernière. */
    Array.prototype.forEach.call(imgs, function (im) {
      if (!im.getAttribute('src') || (im.complete && im.naturalWidth)) return;
      attentes.push(new Promise(function (res) {
        var fini = false;
        function ok() { if (!fini) { fini = true; res(); } }
        im.addEventListener('load', ok, { once: true });
        im.addEventListener('error', ok, { once: true });
        setTimeout(ok, 3000);
      }));
    });

    if (!attentes.length) return Promise.resolve();
    return Promise.all(attentes);
  }

  /**
   * Capture la vue de FACE avec un nom substitué au texte du canvas.
   *
   * Le bloc de substitution/restauration est repris de
   * conf-group-preview.js:126-156 : la capture lit le DOM live, on y pose donc
   * le nom le temps du calcul, puis on remet l'état d'origine.
   */
  function capturerPourNom(nom) {
    var zone = (typeof window.grpTextZone === 'function') ? window.grpTextZone() : 'f';
    var el = document.getElementById('text-' + zone);
    var contenu = el ? el.querySelector('.dt-content') : null;
    var ancien = null, styleAncien = null, donneesAnciennes = null;

    /* TEXTE COURBÉ : rendu en SVG, son textContent est vide — la substitution
       est impossible. Même garde que les trois autres chemins du projet. */
    var substituable = nom && el && contenu && !el.classList.contains('is-shaped');

    /* Attributs que clampTextToZone recalcule en même temps que le style. */
    var ATTRS = ['data-w', 'data-wanted-size', 'data-max-fit'];

    if (substituable) {
      /* SAUVEGARDE COMPLÈTE DU STYLE, et non des seules propriétés qu'on
         s'apprête à changer.

         clampTextToZone est une transformation AVEC PERTE : elle recalcule
         `fontSize`, `left`, `top`, `maxWidth` et les `data-*` à partir du
         contenu courant, sans conserver les anciennes valeurs. Ne remettre que
         le texte et la visibilité laissait donc le canvas avec la géométrie du
         DERNIER NOM capturé — et le texte du client sortait du cadre.

         On comptait sur clampTextToZone pour recalculer le reste à la
         restauration. Ce recalcul n'a jamais lieu : la capture est asynchrone,
         le canvas est masqué entre-temps, et la garde `!el.offsetWidth`
         (conf-text-clamp.js:32) fait sortir la fonction aussitôt.

         Restituer le style tel quel rend la restauration INDÉPENDANTE DE TOUTE
         MESURE : elle réussit que le canvas soit visible ou non. */
      ancien = contenu.textContent;
      styleAncien = el.getAttribute('style');
      donneesAnciennes = ATTRS.map(function (a) { return el.getAttribute(a); });

      contenu.textContent = nom;
      if (el.style.display === 'none') el.style.display = '';
      /* Le nom peut être plus long que le texte commun : la police doit être
         re-calée dans la zone imprimable avant la mesure. */
      if (typeof window.clampTextToZone === 'function') window.clampTextToZone(zone);
    }

    function restaurer() {
      if (ancien === null || !contenu) return;
      contenu.textContent = ancien;

      /* Le style d'origine est REPOSÉ TEL QUEL — aucun recalcul, donc aucune
         dépendance à une mesure du DOM. `removeAttribute` couvre le cas d'un
         élément qui n'avait aucun style inline au départ. */
      if (styleAncien === null) el.removeAttribute('style');
      else el.setAttribute('style', styleAncien);

      for (var i = 0; i < ATTRS.length; i++) {
        if (donneesAnciennes[i] === null) el.removeAttribute(ATTRS[i]);
        else el.setAttribute(ATTRS[i], donneesAnciennes[i]);
      }
    }

    /* ═══ CANVAS MESURABLE — À CHAQUE CAPTURE, PAS SEULEMENT LA PREMIÈRE ═══

       captureAllViews MESURE le canvas. Or on arrive ici depuis « Configurer »
       ou « Vérifier », où le produit a cédé la place au tableau ou aux cartes :
       `.cv-wrap` est masqué, les mesures valent zéro, et la capture retombe sur
       les pourcentages bruts du calque — logos deux à trois fois trop petits.

       L'appelant révélait bien le canvas, mais le remasquait après la PREMIÈRE
       capture. Comme `respirer()` cède la main entre chaque nom, les suivantes
       retrouvaient un canvas caché : la première carte sortait juste, les
       autres fausses. C'est exactement ce qu'on observait.

       La révélation vit donc ICI, au plus près de la mesure : elle couvre
       chaque capture, quel que soit l'appelant.

       LA CAPTURE NE TOUCHE PAS À L'ÉTAPE. Elle retirait l'attribut
       `data-etape-groupe` puis le rétablissait — mais elle le mémorisait au
       DÉMARRAGE, quand il valait encore « configurer ». En le reposant à la
       fin, elle écrasait le passage à « valider » : l'étape Vérifier affichait
       le tableau au lieu des cartes.

       On force donc la visibilité du canvas par un STYLE DIRECT, plus fort
       que la règle CSS de l'étape, sans jamais changer l'étape elle-même. */
    var wrap = document.querySelector('.cv-wrap');
    var styleAvantWrap = wrap ? wrap.getAttribute('style') : null;
    /* Suspend la mesure périodique : le canvas va porter des dimensions
       forcées, les relever fausserait la référence. */
    captureEnCours = true;

    if (wrap) {
      /* UNE BOÎTE EXPLICITE, HORS DU FLUX.

         La hauteur du canvas vient de `flex: 1` (conf-styles.css:846) : elle
         dépend de ses FRÈRES dans la colonne. À cette étape, les cartes
         occupent tout l'espace — le canvas simplement révélé n'obtiendrait
         presque aucune hauteur, et les calques sortiraient démesurés.

         `position: fixed` le soustrait donc à la mise en page des cartes, et
         `visibility` le garde invisible tout en le laissant mesurable. */
      /* DIMENSIONS DÉRIVÉES DE LA FENÊTRE, jamais du canvas.

         Mesurer `.canvas` rendait la boîte dépendante de l'ÉTAPE COURANTE :
         « Configurer » garde le rail d'icônes (65 px) et le récapitulatif
         (252 px), « Vérifier » les masque et referme leur colonne
         (conf-styles.css:2946-2950). Le canvas y gagne plus de 300 px.

         Or la capture démarre AVANT le basculement d'étape et cède la main
         entre chaque nom : la première mesurait un canvas étroit, les suivantes
         un canvas large. L'image du vêtement étant bornée par la largeur
         disponible (conf-canvas-single.css:267), sa taille changeait — et
         celle des logos avec elle. D'où trois cartes à trois échelles.

         On reconstruit donc la géométrie de l'étape « DESIGNER », celle où le
         client compose : c'est ce qu'il a vu que les cartes doivent
         reproduire. Aucune mesure du DOM, donc aucune dépendance à l'état de
         la page — un futur changement de mise en page ne rouvrira pas ce
         défaut. */
      /* Dernière mesure du canvas VISIBLE — celle de l'étape « Designer », où
         le client a composé son design. Le vêtement y retrouve exactement la
         taille qu'il avait sous ses yeux, donc les logos leur proportion. */
      var boite = boiteCanvas;

      var RAIL = 65;      /* conf-sidebar-modern.css : largeur du rail d'icônes */
      var RECAP = 252;    /* conf-styles.css : --recap-w */
      var PADDING = 40;   /* marges horizontales du canvas */

      /* Repli sur une estimation : le canvas n'a jamais été mesurable — arrivée
         directe sur « Vérifier » après un rechargement. Approximatif, mais
         préférable à une boîte nulle. */
      var largeur = boite
        ? boite.w
        : Math.max(320, window.innerWidth - RAIL - RECAP - PADDING);

      var hauteur = boite ? boite.h : Math.round(window.innerHeight * 0.85);

      wrap.style.cssText =
        'display:flex;align-items:center;justify-content:center;' +
        'position:fixed;left:0;top:0;' +
        'width:' + largeur + 'px;height:' + hauteur + 'px;' +
        'visibility:hidden;opacity:0;pointer-events:none;z-index:-1;';
    }

    /** Rend au canvas son état d'origine. L'étape n'est jamais touchée. */
    function remasquer() {
      /* Levé AVANT la sortie anticipée : sans cela, un canvas absent laisserait
         la mesure suspendue pour toute la session. */
      captureEnCours = false;
      if (!wrap) return;
      /* L'attribut ENTIER est restauré : le canvas n'avait le plus souvent
         aucun style propre, sa mise en page venant du CSS. Remettre des
         propriétés une à une y laisserait des valeurs vides mais présentes. */
      if (styleAvantWrap === null) wrap.removeAttribute('style');
      else wrap.setAttribute('style', styleAvantWrap);
    }

    return attendreLogos().then(function () {
      return Promise.resolve(
        typeof window.captureAllViews === 'function' ? window.captureAllViews() : null
      );
    }).then(function (views) {
      restaurer();
      remasquer();
      var face = (views || []).filter(function (v) { return v.label === 'FACE'; })[0];
      return face || null;
    }).catch(function () {
      restaurer();
      remasquer();
      return null;
    });
  }

  /** Construit le HTML d'une carte. */
  function carteHTML(ligne, face) {
    var nom = ligne.flock || ligne.name || '';
    var fond = fondPourCouleur(ligne.color) ||
               (face && face.background) || '';


    var calques = (face && face.logos ? face.logos : []).map(function (g) {
      var w = g.w, x = g.x;

      /* AUCUNE DÉFORMATION — le rendu est celui de la « Vue d'ensemble ».

         Les logos étaient agrandis de 50 % pour rester lisibles dans une
         carte étroite. Deux écrans montraient alors le même design à deux
         échelles différentes, sur un parcours où le client compare l'un et
         l'autre avant de payer.

         Les positions et largeurs viennent de la capture ; elles font foi. La
         lisibilité passe désormais par la TAILLE DES CARTES (quatre par ligne,
         sans largeur maximale — conf-styles.css), pas par une déformation du
         design. */
      return '<img class="ov-layer" src="' + safeSrc(g.src) + '" alt="" ' +
             'style="left:' + (x * 100) + '%;top:' + (g.y * 100) + '%;' +
             'width:' + (w * 100) + '%">';
    }).join('');

    /* `max-width/height:none` : conf-styles.css impose max-height:60vh à toute
       image du configurateur, ce qui rognerait le fond DANS la carte et
       désaccorderait les % des calques. */
    var scene = fond
      ? '<div class="ov-stage">' +
          '<img class="ov-bg" src="' + safeSrc(fond) + '" alt="" ' +
               'style="max-width:none;max-height:none;">' +
          '<div class="ov-layers">' + calques + '</div>' +
        '</div>'
      : '<div class="gv-vide">Aperçu indisponible</div>';

    var qte = parseInt(ligne.qty, 10) || 1;

    return '<article class="gv-card">' +
        (nom ? '<span class="gv-tag">' + esc(nom) + '</span>' : '') +
        '<div class="gv-scene">' + scene + '</div>' +
        '<div class="gv-info">' +
          '<h3 class="gv-produit">' + esc(nomProduit()) + '</h3>' +
          '<p class="gv-meta">' +
            '<span class="gv-dot" style="background:' + hexDeCouleur(ligne.color) + '"></span>' +
            esc(ligne.color || '') +
            '<span class="gv-sep">·</span>Taille ' + esc(ligne.size || '') +
            (qte > 1 ? '<span class="gv-sep">·</span>×' + qte : '') +
          '</p>' +
          /* Le bloc « Texte personnalisé » a été RETIRÉ : le nom figure déjà
             sur le vêtement et sur l'étiquette de la carte. Le répéter une
             troisième fois allongeait la carte sans rien apprendre. */
        '</div>' +
      '</article>';
  }

  /** Libellé du produit courant, tel qu'affiché dans le récapitulatif. */
  function nomProduit() {
    var el = document.querySelector('.recap-prod-name, .rp-nom');
    if (el && el.textContent.trim()) return el.textContent.trim();
    var t = window.currentProductType || '';
    if (t === 'sweatshirt') return 'Sweatshirt';
    if (t === 'tshirt') return 'T-shirt coton';
    if (t === 'tshirt_polyester') return 'T-shirt polyester';
    return 'Article personnalisé';
  }

  /** Barre de pagination. Rien à afficher en dessous d'une page. */
  function rendrePages(total) {
    var nav = document.getElementById('grp-verif-pages');
    if (!nav) return;
    var nbPages = Math.ceil(total / PAR_PAGE);
    if (nbPages <= 1) { nav.innerHTML = ''; return; }

    var h = '<button type="button" class="gv-page gv-page-nav"' +
            (pageCourante === 0 ? ' disabled' : '') +
            ' onclick="grpVerifPage(' + (pageCourante - 1) + ')" aria-label="Page précédente">‹</button>';

    for (var i = 0; i < nbPages; i++) {
      /* Au-delà de sept pages, on n'affiche que le début, la fin et les
         voisines de la page courante : une barre de vingt boutons serait
         illisible. */
      var proche = Math.abs(i - pageCourante) <= 1;
      var extreme = i === 0 || i === nbPages - 1;
      if (nbPages > 7 && !proche && !extreme) {
        if (i === 1 || i === nbPages - 2) h += '<span class="gv-page-gap">…</span>';
        continue;
      }
      h += '<button type="button" class="gv-page' + (i === pageCourante ? ' is-on' : '') +
           '" onclick="grpVerifPage(' + i + ')">' + (i + 1) + '</button>';
    }

    h += '<button type="button" class="gv-page gv-page-nav"' +
         (pageCourante >= nbPages - 1 ? ' disabled' : '') +
         ' onclick="grpVerifPage(' + (pageCourante + 1) + ')" aria-label="Page suivante">›</button>';

    nav.innerHTML = h;
  }

  /** Total en haut de l'écran : nombre de pièces et prix. */
  function rendreTotal(lignes) {
    var pieces = 0;
    for (var i = 0; i < lignes.length; i++) pieces += parseInt(lignes[i].qty, 10) || 1;

    var cnt = document.getElementById('grp-verif-count');
    if (cnt) cnt.textContent = 'Total (' + pieces + (pieces > 1 ? ' articles)' : ' article)');

    /* PRIX DÉGRESSIF, comme à l'étape « Configurer ».

       Cette fonction utilisait `prixUnitaire` — le tarif PLEIN, sans remise —
       alors que le résumé de l'étape précédente applique le palier atteint.
       Le client voyait donc son total AUGMENTER en avançant d'une étape à
       l'autre, sans que rien ne l'explique.

       `tierUnitPrice` renvoie `null` quand aucune grille n'existe pour ce
       produit : on retombe alors sur le prix de base, comme avant. */
    var unit = null;
    if (typeof window.tierUnitPrice === 'function') {
      unit = window.tierUnitPrice(window.currentProductType, pieces);
    }
    if (unit == null && typeof window.prixUnitaire === 'function') {
      unit = window.prixUnitaire(window.currentProductType);
    }
    unit = Number(unit) || 0;

    var prix = document.getElementById('grp-verif-price');
    if (prix) {
      prix.innerHTML = unit
        ? (pieces * unit).toFixed(2).replace('.', ',') + ' €<span class="gv-ttc">TTC</span>'
        : '';
    }
  }

  /**
   * Capture les noms d'une page, un par un, puis peint la grille.
   * @param {Array} page - lignes à rendre
   * @param {number} mien - jeton de génération
   */
  function capturerPuisPeindre(page, mien) {
    var grille = document.getElementById('grp-verif-grid');
    if (!grille) return Promise.resolve();

    /* Une capture par NOM DISTINCT : deux personnes portant le même nom
       partagent géométrie et PNG de texte — seule leur couleur de fond
       diffère, et elle est substituée après coup. */

    var noms = [];
    for (var i = 0; i < page.length; i++) {
      var n = page[i].flock || page[i].name || '';
      if (noms.indexOf(n) === -1) noms.push(n);
    }

    var suite = Promise.resolve();
    noms.forEach(function (n) {
      suite = suite.then(function () {
        if (mien !== jeton) return;
        if (cacheCaptures.hasOwnProperty(n)) return;
        return capturerPourNom(n).then(function (face) {
          cacheCaptures[n] = face;
          /* On rend la main au navigateur entre deux rasterisations : douze
             captures d'affilée figeraient l'onglet près d'une seconde. */
          return respirer();
        });
      });
    });

    return suite.then(function () {
      if (mien !== jeton) return;
      var html = page.map(function (l) {
        return carteHTML(l, cacheCaptures[l.flock || l.name || '']);
      }).join('');
      grille.innerHTML = html || '<p class="gv-attente">Aucune personne dans la liste.</p>';
    });
  }

  /** Rend la page demandée. */
  function rendrePage() {
    var grille = document.getElementById('grp-verif-grid');
    if (!grille) return;

    var mien = ++jeton;
    var debut = pageCourante * PAR_PAGE;
    var page = lignesCourantes.slice(debut, debut + PAR_PAGE);

    grille.innerHTML = '<p class="gv-attente">Préparation des aperçus…</p>';
    rendrePages(lignesCourantes.length);
    capturerPuisPeindre(page, mien);
  }

  /** Change de page. Appelée depuis les boutons de pagination. */
  function grpVerifPage(i) {
    var nbPages = Math.ceil(lignesCourantes.length / PAR_PAGE);
    if (i < 0 || i >= nbPages) return;
    pageCourante = i;
    rendrePage();
    var v = document.getElementById('grp-verif');
    if (v) v.scrollTop = 0;
  }
  window.grpVerifPage = grpVerifPage;

  /**
   * PRÉPARATION — appelée AVANT que l'étape ne masque le canvas.
   *
   * C'est le seul moment où les mesures sont justes : la capture lit le DOM
   * live, et un canvas masqué mesure zéro. On amorce donc ici les captures de
   * la première page ; le dessin, lui, peut attendre.
   *
   * Le cache est vidé à chaque entrée : le design commun a pu changer depuis
   * le dernier passage sur cet écran.
   */
  function grpPreparerVerification() {
    /* On lit le TABLEAU À L'ÉCRAN, pas la liste validée : celle-ci n'est
       remplie qu'à la validation et porterait encore l'état précédent — d'où
       des cartes sans taille ni couleur, toutes au coloris du canvas. */
    var lignes = (typeof window.grpCollectRows === 'function')
      ? (window.grpCollectRows() || [])
      : ((typeof window.getGroupOrderRows === 'function')
          ? (window.getGroupOrderRows() || []) : []);

    lignesCourantes = lignes;
    cacheCaptures = {};
    pageCourante = 0;

    if (!lignes.length) return;
    capturerPuisPeindre(lignes.slice(0, PAR_PAGE), ++jeton);
  }
  window.grpPreparerVerification = grpPreparerVerification;

  /**
   * Point d'entrée du rendu : appelée par allerEtapeGroupe('valider'), une
   * fois l'écran en place. Les captures sont déjà lancées par
   * grpPreparerVerification() — on ne fait ici que l'affichage.
   */
  function grpRendreVerification() {
    rendreTotal(lignesCourantes);
    rendrePages(lignesCourantes.length);

    var grille = document.getElementById('grp-verif-grid');
    if (!lignesCourantes.length) {
      if (grille) grille.innerHTML = '<p class="gv-attente">Aucune personne dans la liste.</p>';
      return;
    }
    if (grille && !grille.innerHTML.trim()) {
      grille.innerHTML = '<p class="gv-attente">Préparation des aperçus…</p>';
    }
  }
  window.grpRendreVerification = grpRendreVerification;
})();
