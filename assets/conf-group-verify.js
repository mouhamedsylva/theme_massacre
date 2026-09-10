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
  /**
   * @param {string} nomCouleur
   * @param {string} [vueNom] - 'face' (défaut) ou 'dos'.
   *
   *   La vue était FIGÉE sur « face ». Depuis que les surnoms peuvent se poser
   *   au dos, ce fond — PRIORITAIRE sur celui de la vue capturée (voir plus
   *   bas) — écrasait le dos par une silhouette de face : le nom, peint aux
   *   coordonnées du dos, tombait hors du vêtement. Le client vérifiait donc un
   *   article apparemment vierge avant de commander.
   *
   *   L'aperçu de ligne (conf-group-preview.js) a reçu ce correctif ; ce module
   *   avait été oublié.
   */
  function fondPourCouleur(nomCouleur, vueNom) {
    if (!nomCouleur) return '';
    var key = window.currentProductKey || window.currentProductType || 'sweatshirt';
    var slug = (window.COLOR_SLUGS_MAP && window.COLOR_SLUGS_MAP[nomCouleur]) ||
               (window.COLOR_SLUGS && window.COLOR_SLUGS[nomCouleur]);
    var prefix = window.PRODUCT_SLUGS && window.PRODUCT_SLUGS[key];
    if (!prefix || !slug || typeof window.colorImageCandidates !== 'function') return '';
    var cands = window.colorImageCandidates(prefix, slug, vueNom || 'face') || [];
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

  /* EXPOSÉ : l'ajout au panier doit savoir attendre.

     `capturerPourNom` masque des calques de logos et force ses propres
     dimensions sur `.cv-wrap` le temps de photographier chaque carte. Or
     l'ajout au panier compose ses vignettes en LISANT ces mêmes calques : il
     ignore toute zone dont le style porte `display:none`.

     Ajouter pendant cette fenêtre donnait donc un tableau de logos vide, aucune
     composition, et la ligne retombait sur le vêtement nu — sans le moindre
     signal.

     Une fonction plutôt qu'un booléen recopié : l'état reste ici, à un seul
     endroit, et ne peut pas se désynchroniser. */
  window.grpCaptureEnCours = function () { return captureEnCours; };

  /**
   * @returns {{w:number,h:number}} la boîte à imposer au canvas pour le rendre
   * mesurable hors du flux.
   *
   * POURQUOI ELLE EST EXPOSÉE
   * -------------------------
   * L'ajout au panier compose ses vignettes en MESURANT le canvas, exactement
   * comme les cartes de cette étape. Mais il se contentait de lever le
   * `display:none` : or `.cv-wrap` est en `flex: 1` et FRÈRE des cartes dans la
   * même colonne. Révélé alors qu'elles occupent tout l'espace, il obtenait une
   * hauteur quasi NULLE — les logos sortaient démesurés, ou la mesure échouait
   * et la vignette partait nue.
   *
   * C'est le problème que `capturerPourNom` résout depuis toujours en imposant
   * une boîte explicite. On partage donc ce calcul plutôt que de le dupliquer :
   * les deux chemins mesurent la même géométrie, donc produisent le même rendu.
   */
  window.grpBoiteCanvas = function () {
    var RAIL = 65;      /* conf-sidebar-modern.css : largeur du rail d'icônes */
    var RECAP = 252;    /* conf-styles.css : --recap-w */
    var PADDING = 40;   /* marges horizontales du canvas */

    /* Repli identique à celui de la capture : le canvas n'a jamais été
       mesurable — arrivée directe sur « Vérifier » après un rechargement. */
    return {
      w: boiteCanvas ? boiteCanvas.w
                     : Math.max(320, window.innerWidth - RAIL - RECAP - PADDING),
      h: boiteCanvas ? boiteCanvas.h
                     : Math.round(window.innerHeight * 0.85)
    };
  };

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
   * Le côté d'une ligne — `'f'` ou `'b'`.
   *
   * Délègue à `grpZoneDeLigne` (conf-group-textzone.js), seule autorité sur ce
   * point, pour que la vérification, l'aperçu et le panier répondent tous la
   * même chose. Le repli couvre un chargement partiel des scripts.
   */
  function zoneDeLigne(l) {
    if (typeof window.grpZoneDeLigne === 'function') return window.grpZoneDeLigne(l);
    if (l && (l.zone === 'f' || l.zone === 'b')) return l.zone;
    return 'f';
  }

  /**
   * Capture le vêtement, du côté de cette personne, son nom substitué au texte.
   *
   * Le bloc de substitution/restauration est repris de
   * conf-group-preview.js:126-156 : la capture lit le DOM live, on y pose donc
   * le nom le temps du calcul, puis on remet l'état d'origine.
   */
  function capturerPourNom(nom, zoneDemandee) {
    /* LA ZONE VIENT DE LA LIGNE, pas de l'état global du canvas.

       `grpTextZone()` décrit LE CANVAS — la zone garnie, ou à défaut la vue
       affichée. Elle répond donc la même chose pour tout le monde. Depuis que
       chaque personne porte son côté, interroger le canvas reviendrait à
       substituer le nom de Marie dans la zone de Jean : une carte fausse, avec
       le bon nom au mauvais endroit.

       Repli sur `grpTextZone()` quand l'appelant ne précise rien — les lignes
       d'avant ce champ se comportent comme avant. */
    var zone = (zoneDemandee === 'f' || zoneDemandee === 'b' || zoneDemandee === 'fr')
      ? zoneDemandee
      : ((typeof window.grpTextZone === 'function') ? window.grpTextZone() : 'f');
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
      /* LA VUE CAPTURÉE SUIT LE CÔTÉ DE CETTE PERSONNE.

         Elle était figée sur FACE. Depuis que le client peut placer ses
         surnoms au DOS, cette carte lui aurait montré un vêtement vierge —
         sans le nom qu'elle est précisément censée lui faire vérifier avant
         commande.

         AUCUN REPLI SUR LA FACE. Il en existait un, posé quand tous les
         surnoms partageaient une zone : la face était alors la seule carte
         possible, et la montrer valait mieux que rien.

         Avec un côté par personne, ce repli devient un piège. La carte de
         Marie, dont le nom est au dos, afficherait la face — donc le nom de
         QUELQU'UN D'AUTRE. Le client validerait une planche fausse et
         l'atelier floquerait le mauvais côté, sans que rien ne signale
         l'erreur : la carte serait plausible.

         On retourne donc `null`. `carteHTML` affiche alors « Aperçu
         indisponible », visible et sans ambiguïté. Une carte manquante se
         remarque et se signale ; une carte fausse se commande.

         TOUTES LES VUES SONT CONSERVÉES, PLUS SEULEMENT CELLE DU CÔTÉ.

         On n'en gardait qu'une et on jetait les trois autres — alors que la
         capture les avait toutes produites, au même coût. Un logo posé au dos
         ou sur une manche restait donc invisible sur l'écran où le client
         valide avant de payer.

         `captureAllViews` n'a publié que les vues RÉELLEMENT personnalisées
         (conf-main-inline.js : `if (!logos.length) continue`) : ce tableau ne
         contient jamais de vêtement nu.

         La garde ci-dessus n'en est pas affaiblie : c'est `carteHTML` qui exige
         la vue du côté de la personne pour dessiner la carte, et les autres
         vues n'y sont qu'un complément — jamais un substitut. */
      return (views && views.length) ? views : null;
    }).catch(function () {
      restaurer();
      remasquer();
      return null;
    });
  }

  /** Construit le HTML d'une carte.
   *
   * @param {object} ligne  la personne (nom floqué, couleur, taille, quantité)
   * @param {Array|null} vues  les vues capturées pour elle — toutes celles qui
   *   portent réellement un design. La vue de SON côté fait la scène
   *   principale ; les autres deviennent des vignettes sous elle.
   */
  function carteHTML(ligne, vues) {
    var nom = ligne.flock || ligne.name || '';
    var toutes = (vues && vues.length) ? vues : [];

    /* Le CÔTÉ ANNONCÉ vient de la ligne, pas de la capture.

       La ligne sait toujours où le surnom est floqué ; la capture, elle, peut
       manquer. Se fier à elle ferait dire « Devant » à la carte de Marie alors
       que son nom est au dos. */
    var coteLigne = (zoneDeLigne(ligne) === 'b') ? 'dos' : 'face';

    /* LA VUE PRINCIPALE EST CELLE DU CÔTÉ DE CETTE PERSONNE — SANS REPLI.

       C'est la garde décrite plus haut (capturerPourNom) : afficher la face à
       la place d'un dos manquant montrerait le nom de QUELQU'UN D'AUTRE, et le
       client validerait une planche fausse. On cherche donc ce côté-là et rien
       d'autre ; absent, la carte le dira.

       Les autres vues ne sont qu'un complément : elles ne peuvent jamais
       prendre cette place. */
    var libellePrincipal = (coteLigne === 'dos') ? 'DOS' : 'FACE';
    var face = toutes.filter(function (v) {
      return v && v.label === libellePrincipal;
    })[0] || null;

    var vueNom = (coteLigne === 'dos') ? 'dos' : 'face';

    /* PAS DE CAPTURE, PAS DE CARTE.

       `fondPourCouleur` sait produire un vêtement vierge à partir de la seule
       couleur, sans rien devoir à la capture. Le conserver ici rouvrait, par un
       autre chemin, le repli qu'on vient de retirer : capture manquante, la
       carte s'affichait quand même — vêtement plausible, aucun nom dessus, et
       le côté deviné plutôt que constaté. Le client n'avait alors rien vérifié
       tout en croyant l'avoir fait.

       On exige donc la capture. `fondPourCouleur` garde son rôle : donner à la
       carte la BONNE COULEUR, la capture n'en portant qu'une. */
    var fond = face
      ? (fondPourCouleur(ligne.color, vueNom) || face.background || '')
      : '';


    /* AUCUNE DÉFORMATION — le rendu est celui de la « Vue d'ensemble ».

       Les logos étaient agrandis de 50 % pour rester lisibles dans une carte
       étroite. Deux écrans montraient alors le même design à deux échelles
       différentes, sur un parcours où le client compare l'un et l'autre avant
       de payer.

       Les positions et largeurs viennent de la capture ; elles font foi. La
       lisibilité passe par la TAILLE DES CARTES (conf-styles.css), pas par une
       déformation du design. */
    function calquesDe(vue) {
      return (vue && vue.logos ? vue.logos : []).map(function (g) {
        return '<img class="ov-layer" src="' + safeSrc(g.src) + '" alt="" ' +
               'style="left:' + (g.x * 100) + '%;top:' + (g.y * 100) + '%;' +
               'width:' + (g.w * 100) + '%">';
      }).join('');
    }

    /* Image produit correspondant à une vue. Les DEUX manches partagent le
       visuel « cote » — elles ne diffèrent que par le miroir. */
    function imageDe(v) {
      if (!v) return 'face';
      if (v.label === 'DOS') return 'dos';
      if (v.label === 'FACE') return 'face';
      return 'cote';
    }

    /* Le fond d'une vue, À LA COULEUR DE CETTE LIGNE.

       La capture ne porte qu'une teinte — celle du canvas au moment où elle a
       été prise. `fondPourCouleur` la remplace par celle de la personne, sans
       recapturer. */
    function fondDe(v) {
      return fondPourCouleur(ligne.color, imageDe(v)) || (v && v.background) || '';
    }

    /* Une scène = un vêtement et ses calques.

       `max-width/height:none` : conf-styles.css impose max-height:60vh à toute
       image du configurateur, ce qui rognerait le fond DANS la carte et
       désaccorderait les % des calques.

       MANCHE DROITE : le FOND est retourné, jamais les calques. Leurs
       coordonnées sont DÉJÀ converties dans le repère miroir par la capture
       (conf-main-inline.js) — sans cette classe, le logo se poserait du mauvais
       côté de la manche. */
    function sceneDe(v, actif) {
      var bg = fondDe(v);
      if (!bg) return '';
      return '<div class="ov-stage gv-stage' + (v.mirror ? ' is-mirror' : '') + '"' +
                  ' data-vue="' + esc(v.label || '') + '"' +
                  (actif ? '' : ' hidden') + '>' +
               '<img class="ov-bg" src="' + safeSrc(bg) + '" alt="" ' +
                    'style="max-width:none;max-height:none;">' +
               '<div class="ov-layers">' + calquesDe(v) + '</div>' +
             '</div>';
    }

    /* LES VUES, DANS UN ORDRE FIXE.

       On suit l'ordre du vêtement — face, dos, puis les manches — et non celui
       de la capture : deux cartes voisines doivent présenter leurs boutons dans
       le même ordre, sinon l'œil ne peut plus les comparer.

       SEULES LES VUES DESSINÉES SONT LÀ : `captureAllViews` n'a publié que
       celles qui portent une impression (conf-main-inline.js). Il n'y a donc
       rien à deviner ici — la liste EST la réponse. */
    var ORDRE = ['FACE', 'DOS', 'MANCHE GAUCHE', 'MANCHE DROITE'];
    var ordonnees = ORDRE.map(function (lbl) {
      return toutes.filter(function (v) { return v && v.label === lbl; })[0];
    }).filter(function (v) { return v && fondDe(v); });

    /* La FACE ouvre la carte : c'est elle qui porte le surnom à vérifier
       (conf-group-textzone.js — les surnoms sont en face, et nulle part
       ailleurs). Sans elle, pas de carte. */
    var scenes = face
      ? ordonnees.map(function (v) { return sceneDe(v, v === face); }).join('')
      : '';

    /* Les boutons : une miniature par vue, la vue affichée étant marquée.

       AUCUN BOUTON POUR UNE VUE UNIQUE — une commande qui n'offre aucun choix
       n'est pas une commande, et la carte retrouve exactement son allure
       d'avant.

       `data-vue` relie le bouton à sa scène ; l'écouteur délégué (posé sur la
       grille) n'a rien d'autre à savoir. */
    var boutons = (face && ordonnees.length > 1)
      ? '<div class="gv-vues">' + ordonnees.map(function (v) {
          var lbl = v.label || '';
          return '<button type="button" class="gv-vue-btn' +
                        (v === face ? ' on' : '') + '"' +
                      ' data-vue="' + esc(lbl) + '"' +
                      ' aria-pressed="' + (v === face ? 'true' : 'false') + '">' +
                   '<span class="gv-vue-mini' + (v.mirror ? ' is-mirror' : '') + '">' +
                     '<img src="' + safeSrc(fondDe(v)) + '" alt="" ' +
                          'style="max-width:none;max-height:none;">' +
                   '</span>' +
                   '<span class="gv-vue-lbl">' + esc(lbl) + '</span>' +
                 '</button>';
        }).join('') + '</div>'
      : '';

    /* Le message NOMME la cause. « Aperçu indisponible » seul se lit comme un
       défaut d'affichage passager, et le client valide en haussant les épaules.
       Dire que c'est la face qui n'a pas pu être rendue le renvoie vers l'étape
       Designer, seul endroit où il peut le corriger. */
    var scene = scenes
      ? '<div class="gv-vue-zone">' + scenes + '</div>' + boutons
      : '<div class="gv-vide">Aperçu de la face' +
        ' indisponible<br><small>Vérifiez ce côté à l\'étape Designer.</small></div>';


    var qte = parseInt(ligne.qty, 10) || 1;

    /* LE CÔTÉ EST ÉCRIT SUR LA CARTE.

       Un vêtement de dos ressemble beaucoup à un vêtement de face : sans
       mention, le client compte sur le seul emplacement du nom pour distinguer
       les deux — indice ténu, et absent quand l'aperçu manque. C'est justement
       cette planche qui engage la production. */
    var coteLisible = (coteLigne === 'dos') ? 'Au dos' : 'Devant';

    return '<article class="gv-card">' +
        (nom ? '<span class="gv-tag">' + esc(nom) + '</span>' : '') +
        '<div class="gv-scene">' + scene + '</div>' +
        '<div class="gv-info">' +
          '<h3 class="gv-produit">' + esc(nomProduit()) + '</h3>' +
          '<p class="gv-meta">' +
            '<span class="gv-dot" style="background:' + hexDeCouleur(ligne.color) + '"></span>' +
            esc(ligne.color || '') +
            '<span class="gv-sep">·</span>Taille ' + esc(ligne.size || '') +
            '<span class="gv-sep">·</span>' + coteLisible +
            (qte > 1 ? '<span class="gv-sep">·</span>×' + qte : '') +
          '</p>' +
          /* Le bloc « Texte personnalisé » a été RETIRÉ : le nom figure déjà
             sur le vêtement et sur l'étiquette de la carte. Le répéter une
             troisième fois allongeait la carte sans rien apprendre. */
        '</div>' +
      '</article>';
  }

  /* Libellé affichable d'un type de produit — SOURCE UNIQUE du projet.

     Le nom des lignes de panier était recopié du DOM (`#rc-prod`), dont le
     markup porte « Sweatshirt » en dur. Quand sa mise à jour échouait, un
     t-shirt polyester partait au panier sous le nom « Sweatshirt ».

     Le type de produit, lui, est toujours juste : c'est de lui que le nom
     dérive désormais. Exposée sur `window` pour que conf-main-inline.js s'en
     serve plutôt que d'écrire une seconde table qui divergerait.

     Les deux sélecteurs consultés ici auparavant — `.recap-prod-name`,
     `.rp-nom` — n'existent NULLE PART dans le projet : la fonction retombait
     de toute façon toujours sur cette liste. On ne lit donc plus le DOM. */
  function nomProduit(type) {
    var t = type || window.currentProductType || '';
    if (t === 'sweatshirt') return 'Sweatshirt';
    if (t === 'tshirt') return 'T-shirt coton';
    if (t === 'tshirt_polyester') return 'T-shirt polyester';
    if (t === 'coins') return 'Coin métal';
    if (t === 'drapeaux') return 'Drapeau personnalisé';
    if (t === 'patches') return 'Patch personnalisé';
    return 'Article personnalisé';
  }
  window.nomProduit = nomProduit;

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

    /* Une capture par NOM ET CÔTÉ : deux personnes portant le même nom DU MÊME
       CÔTÉ partagent géométrie et PNG de texte — seule leur couleur de fond
       diffère, et elle est substituée après coup.

       LE CÔTÉ FAIT PARTIE DE LA CLÉ. Sans lui, deux « Jean » — l'un en face,
       l'autre au dos — se confondraient : le premier capturé servirait aux
       deux, et l'un des deux verrait sa carte montrer le mauvais côté. Le cas
       n'a rien d'exotique dans une équipe : les homonymes sont fréquents, et
       c'est précisément là que la vérification doit être irréprochable. */
    function cleDe(l) {
      return (l.flock || l.name || '') + '|' + zoneDeLigne(l);
    }

    /* On parcourt toutes les lignes : le cache écarte lui-même les doublons,
       une pré-déduplication ferait le même travail deux fois. */
    var suite = Promise.resolve();
    page.forEach(function (l) {
      var cle = cleDe(l);
      suite = suite.then(function () {
        if (mien !== jeton) return;
        if (cacheCaptures.hasOwnProperty(cle)) return;
        /* Le cache porte TOUTES les vues personnalisées de cette personne, pas
           seulement celle de son côté : `carteHTML` y choisit sa scène
           principale et fait des autres des vignettes. */
        return capturerPourNom(l.flock || l.name || '', zoneDeLigne(l)).then(function (vues) {
          cacheCaptures[cle] = vues;
          /* On rend la main au navigateur entre deux rasterisations : douze
             captures d'affilée figeraient l'onglet près d'une seconde. */
          return respirer();
        });
      });
    });

    return suite.then(function () {
      if (mien !== jeton) return;
      var html = page.map(function (l) {
        return carteHTML(l, cacheCaptures[cleDe(l)]);
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

  /* BASCULE DE VUE — UN SEUL ÉCOUTEUR, DÉLÉGUÉ SUR LE DOCUMENT.

     Les cartes sont réécrites (`innerHTML`) à chaque page et à chaque retour
     sur l'étape : un écouteur posé sur un bouton ne survivrait pas au premier
     re-rendu, et la grille elle-même n'existe pas encore au chargement de ce
     script. La délégation règle les deux — elle ne dépend d'aucun nœud.

     Rien à mémoriser : re-rendre une carte la ramène sur la face, ce qui est
     l'état voulu quand on revient sur cet écran. */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.gv-vue-btn');
    if (!btn) return;

    var carte = btn.closest('.gv-card');
    if (!carte) return;

    var vue = btn.getAttribute('data-vue');

    /* Portée à LA CARTE cliquée : sans ce point d'ancrage, la bascule
       s'appliquerait aux trois cartes de la ligne à la fois. */
    carte.querySelectorAll('.gv-stage').forEach(function (s) {
      s.hidden = (s.getAttribute('data-vue') !== vue);
    });
    carte.querySelectorAll('.gv-vue-btn').forEach(function (b) {
      var actif = (b === btn);
      b.classList.toggle('on', actif);
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
    });
  });

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
