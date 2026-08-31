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

  /* ÉCHELLE DU TEXTE DANS LES CARTES — GROSSISSEMENT VOLONTAIRE.

     La capture renvoie une géométrie exacte : à 1.0, le nom occupe la même
     fraction du vêtement qu'à l'impression. Mais la zone de floquage ne fait
     que 22 % de la poitrine (configurateur.liquid:878) : à la taille d'une
     carte, le nom devenait illisible.

     ATTENTION — ce coefficient rend l'aperçu VOLONTAIREMENT INFIDÈLE : le
     client voit un nom plus grand que celui qui sera réellement floqué. C'est
     un choix assumé de lisibilité pour cet écran ; le canvas, lui, reste la
     référence du rendu de production.

     Pour rendre l'aperçu fidèle à nouveau, ramener cette valeur à 1 — et
     élargir plutôt la zone de texte du canvas. */
  var ECHELLE_TEXTE = 1.25;

  var pageCourante = 0;
  var lignesCourantes = [];
  /* Cache des captures, par nom floqué. Le rendu d'un nom ne dépend QUE de ce
     nom : deux personnes portant « ame » partagent la même géométrie et le
     même PNG de texte, seule leur couleur de fond diffère. */
  var cacheCaptures = null;
  var jeton = 0;
  /* Centre de la zone de texte, mesuré avant toute substitution de nom. */
  var centreTexteCourant = null;

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
    var ancien = null, afficheAncien = null;

    /* TEXTE COURBÉ : rendu en SVG, son textContent est vide — la substitution
       est impossible. Même garde que les trois autres chemins du projet. */
    var substituable = nom && el && contenu && !el.classList.contains('is-shaped');

    if (substituable) {
      ancien = contenu.textContent;
      afficheAncien = el.style.display;
      contenu.textContent = nom;
      if (afficheAncien === 'none') el.style.display = '';
      /* Le nom peut être plus long que le texte commun : la police doit être
         re-calée dans la zone imprimable avant la mesure. */
      if (typeof window.clampTextToZone === 'function') window.clampTextToZone(zone);
    }

    function restaurer() {
      if (ancien === null || !contenu) return;
      contenu.textContent = ancien;
      if (afficheAncien !== null) el.style.display = afficheAncien;
      if (typeof window.clampTextToZone === 'function') window.clampTextToZone(zone);
    }

    return attendreLogos().then(function () {
      return Promise.resolve(
        typeof window.captureAllViews === 'function' ? window.captureAllViews() : null
      );
    }).then(function (views) {
      restaurer();
      var face = (views || []).filter(function (v) { return v.label === 'FACE'; })[0];
      return face || null;
    }).catch(function () {
      restaurer();
      return null;
    });
  }

  /**
   * Centre horizontal de la zone de texte, en fraction de l'IMAGE produit.
   *
   * POURQUOI. La boîte du texte épouse son contenu (`width: max-content`,
   * conf-styles.css:461) et reste ancrée par sa GAUCHE. Un nom court occupe
   * donc moins de large qu'un nom long, mais démarre au même point : dans les
   * cartes, « Modou Ngom » glissait vers la gauche par rapport au « SURNOM »
   * du canvas, jusqu'à toucher le logo.
   *
   * On mesure donc le centre RÉEL du texte à l'écran, avant toute
   * substitution, et on y recentre ensuite chaque nom.
   *
   * Mesure directe plutôt que lecture des `%` inline : ceux-ci sont relatifs
   * au #logo-layer, pas à l'image — les deux boîtes ne coïncident pas
   * (conf-group-preview.js:97-118).
   *
   * @returns {number|null} fraction 0..1, ou null si non mesurable.
   */
  function centreZoneTexte() {
    var zone = typeof window.grpTextZone === 'function' ? window.grpTextZone() : 'f';
    var el = document.getElementById('text-' + zone);
    var img = document.querySelector('.product-img-single.on');
    if (!el || !img) return null;

    var r = el.getBoundingClientRect();
    var ri = img.getBoundingClientRect();
    if (!r.width || !ri.width) return null;

    return ((r.left + r.width / 2) - ri.left) / ri.width;
  }

  /** Construit le HTML d'une carte. */
  function carteHTML(ligne, face) {
    var nom = ligne.flock || ligne.name || '';
    var fond = fondPourCouleur(ligne.color) ||
               (face && face.background) || '';

    /* CENTRE DE LA ZONE DE TEXTE, mesuré AVANT toute substitution.

       La boîte du texte épouse son contenu (`width: max-content`,
       conf-styles.css:461) et reste ancrée par sa GAUCHE. Un nom court occupe
       donc moins de large qu'un nom long, mais démarre au même point : dans
       l'aperçu, « Modou Ngom » glissait vers la gauche par rapport au
       « SURNOM » du canvas, jusqu'à toucher le logo.

       On garde le centre de la zone telle qu'elle est sur le canvas, et on y
       recentre chaque nom : tous les membres du groupe voient alors leur texte
       au même endroit, quelle que soit la longueur du leur. */
    /* Mesuré UNE FOIS par page, avant les substitutions (voir
       capturerPuisPeindre) : après elles, le texte du canvas a repris sa
       valeur d'origine et sa largeur ne correspond plus au nom rendu. */
    var centreTexte = centreTexteCourant;

    var calques = (face && face.logos ? face.logos : []).map(function (g) {
      var w = g.w, x = g.x;

      /* AGRANDISSEMENT PAR TRANSFORMATION, et non par largeur.

         Il ne vaut QUE pour le texte, marqué à la source par `isText`
         (conf-share.js) : les images uploadées gardent leur taille réelle.

         Modifier `width` faisait grandir le calque vers le bas et la droite
         (`height: auto`, origine en haut à gauche) : agrandi ainsi, le texte
         descendait et se détachait du logo. Corriger le décalage exigeait de
         connaître le ratio du PNG, inconnu ici.

         `transform: scale()` avec origine au CENTRE agrandit dans les quatre
         directions à la fois : la position du milieu du texte ne bouge pas,
         quel que soit le ratio de l'image. */
      var transf = g.isText
        ? 'transform:scale(' + ECHELLE_TEXTE + ');transform-origin:center center;'
        : '';

      /* Le nom est recentré sur la zone : sans cela, sa position dépendrait de
         sa longueur (voir le commentaire de `centreTexte`). */
      if (g.isText && centreTexte !== null) x = centreTexte - g.w / 2;

      return '<img class="ov-layer" src="' + safeSrc(g.src) + '" alt="" ' +
             'style="left:' + (x * 100) + '%;top:' + (g.y * 100) + '%;' +
             'width:' + (w * 100) + '%;' + transf + '">';
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

    var unit = (typeof window.prixUnitaire === 'function')
      ? window.prixUnitaire(window.currentProductType) : 0;
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
    /* AVANT toute substitution : le canvas porte encore son texte d'origine,
       seul état où sa largeur — et donc son centre — est celle que le client
       a composée. */
    if (centreTexteCourant === null) centreTexteCourant = centreZoneTexte();

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
    /* Remesuré à chaque entrée : le client a pu déplacer son texte depuis. */
    centreTexteCourant = null;

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
