/**
 * Édition d'un texte SUR PLACE, par double-clic.
 *
 * Le texte devient directement modifiable là où il est, sur le vêtement :
 * police, couleur et taille restent celles du rendu, le client voit donc
 * exactement le résultat pendant qu'il tape. Un champ flottant posé au-dessus
 * imposait au contraire une police d'interface, sans rapport avec le rendu.
 *
 * Entrée valide, Échap annule, un clic à l'extérieur valide aussi.
 *
 * Seul le CONTENU change : la mise en forme et la position sont préservées.
 * L'écriture passe par window.updateTextContent (conf-text-editor.js).
 */
(function () {
  'use strict';

  /** Élément .dt-content en cours d'édition, ou null. */
  var editing = null;
  /** Valeur avant édition : sert à annuler (Échap) et à détecter un changement. */
  var before = '';
  /** Point du dernier double-clic / double-tap : y place le curseur à l'ouverture. */
  var lastPoint = null;

  /* Dernière sélection connue, en OFFSETS DE CARACTÈRES { debut, fin }.

     Pourquoi des entiers et non un objet Range : appliquer un style redessine
     le texte (renderTextOnCanvas réécrit .dt-content), ce qui détruit les nœuds
     auxquels un Range est attaché — il devient inutilisable. Des offsets, eux,
     survivent à n'importe quelle réécriture. C'est ce qui permet d'enchaîner
     deux mises en forme sur la même lettre (gras PUIS rouge).

     Sert aussi au sélecteur de couleur du système : sa fenêtre prend le focus
     du document et vide la sélection, sans recours possible autrement. */
  var lastSel = null;

  /**
   * Repose une sélection depuis des offsets de caractères. Traverse les nœuds
   * texte, car le contenu est découpé en <span> dès qu'une lettre porte sa
   * propre mise en forme : les offsets sont globaux, pas relatifs à un nœud.
   *
   * @param {HTMLElement} content - le .dt-content
   * @param {number} debut
   * @param {number} fin
   */
  window.selectionnerOffsets = function (content, debut, fin) {
    if (!content) return;
    var marcheur = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
    var vus = 0, noeud;
    var d = null, f = null;
    while ((noeud = marcheur.nextNode())) {
      var len = noeud.nodeValue.length;
      /* `>` et non `>=` pour le DÉBUT : à la frontière de deux segments, `>=`
         plaçait l'ancre à la FIN du nœud précédent. Le point est le même dans
         le texte, mais l'ancre appartient alors au mauvais <span> — ce qui
         fausse la mise en forme dès que les deux segments diffèrent. La FIN,
         elle, garde `>=` : elle doit pouvoir se poser en fin de nœud. */
      if (d === null && vus + len > debut) d = { n: noeud, o: debut - vus };
      if (f === null && vus + len >= fin) { f = { n: noeud, o: fin - vus }; break; }
      vus += len;
    }
    if (!d || !f) return;
    try {
      var r = document.createRange();
      r.setStart(d.n, d.o);
      r.setEnd(f.n, f.o);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      lastSel = { debut: debut, fin: fin };
    } catch (e) { /* offsets hors bornes : on laisse la sélection en l'état */ }
  };

  /** Offsets de la sélection courante dans un .dt-content, ou null. */
  function offsetsDansContenu(content) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    if (!content.contains(range.commonAncestorContainer)) return null;
    var avant = range.cloneRange();
    avant.selectNodeContents(content);
    avant.setEnd(range.startContainer, range.startOffset);
    var debut = avant.toString().length;
    return { debut: debut, fin: debut + range.toString().length };
  }

  /* Mémorisation continue : le geste de sélection se termine bien avant le clic
     sur la barre, et tout ce qui suit peut l'effacer. On la capte donc à la
     source, au moment où l'utilisateur la fait. */
  document.addEventListener('selectionchange', function () {
    if (!editing) return;
    var o = offsetsDansContenu(editing);
    if (o && o.fin > o.debut) lastSel = o;
  });

  /**
   * Dernière sélection partielle connue dans le texte en cours d'édition.
   * @returns {{debut:number, fin:number}|null} null si tout est sélectionné,
   *          si rien ne l'est, ou si aucune édition n'est en cours.
   */
  window.getEditingSelection = function () {
    if (!editing) return null;
    // Sélection vivante si elle existe encore, sinon la dernière mémorisée.
    var o = offsetsDansContenu(editing);
    if (!o || o.fin <= o.debut) o = lastSel;
    if (!o || o.fin <= o.debut) return null;
    // Tout le texte : autant appliquer globalement, le résultat est identique.
    if (o.debut === 0 && o.fin >= (editing.textContent || '').length) return null;
    return o;
  };

  /** @returns {string} zone ('f' | 'fr' | 'b') d'un élément .design-text */
  function zoneOf(el) {
    return (el.id || '').replace(/^text-/, '');
  }

  /** Referme l'édition. @param {boolean} apply - true : valide, false : annule */
  function close(apply) {
    if (!editing) return;

    var content = editing;
    var host = content.closest('.design-text');
    var zone = host ? zoneOf(host) : '';
    var value = content.textContent.trim();

    editing = null;
    content.removeAttribute('contenteditable');
    content.classList.remove('is-editing');
    if (host) host.classList.remove('is-editing');

    if (!apply || !value || value === before) {
      /* Contenu inchangé (ou saisie annulée / vidée) : il n'y a RIEN à écrire.

         On ne restaure pas non plus l'affichage. Ce fut longtemps le cas
         (`content.textContent = before`, puis `innerHTML = beforeHtml`), mais
         les deux reposaient sur une prémisse devenue fausse : que le DOM
         d'avant l'ouverture était l'état de référence. Or la mise en forme par
         caractère est appliquée PENDANT l'édition et persistée aussitôt dans
         `conf_texts` — restaurer l'instantané d'ouverture effaçait donc le
         « N » rouge de « Nike » dès qu'on cliquait ailleurs.

         Le DOM courant est déjà juste : il a été redessiné par
         renderTextOnCanvas à chaque changement de style. Ne rien faire est
         donc la bonne action. Vider le champ ne supprime PAS le texte — le
         bouton « ✕ » est là pour ça, et une saisie effacée par erreur ne doit
         rien détruire ; c'est pourquoi on sort sans écrire.

         Reste le cas de l'ANNULATION par Échap après une frappe : le texte
         tapé doit disparaître. On le rétablit depuis l'état persisté, seule
         source de vérité — jamais depuis un instantané du DOM. */
      if (value !== before && typeof window.rerenderText === 'function') {
        window.rerenderText(zone);
      }
      return;
    }

    if (typeof window.updateTextContent === 'function') {
      window.updateTextContent(zone, value);
    }
  }

  /**
   * Rend le texte modifiable en place.
   * @param {HTMLElement} host - l'élément .design-text double-cliqué
   */
  function openEditor(host) {
    close(false);

    var content = host.querySelector('.dt-content');
    if (!content) return;

    /* Texte courbé (SVG) : il n'est pas éditable en place — son contenu est
       un tracé, pas du texte de flux. On laisse le panneau latéral s'en
       charger plutôt que de casser la forme. */
    if (host.classList.contains('is-shaped') || content.querySelector('svg')) {
      return;
    }

    editing = content;
    before = content.textContent.trim();
    lastSel = null;        // la sélection du texte précédent ne vaut plus rien

    /* `true` et non `plaintext-only` : ce dernier fait APLATIR tout balisage
       interne par le navigateur, donc les <span class="dt-seg"> porteurs de la
       mise en forme par caractère disparaissaient dès l'ouverture de l'édition.

       plaintext-only avait été choisi pour empêcher l'insertion de HTML au
       collage ; cette protection est déjà assurée par les deux écouteurs
       `paste` plus bas, qui forcent du texte brut sur une seule ligne. */
    content.setAttribute('contenteditable', 'true');
    content.classList.add('is-editing');
    host.classList.add('is-editing');
    content.focus();

    /* Curseur AU POINT CLIQUÉ, sans rien sélectionner. Auparavant tout le texte
       était sélectionné (« on tape par-dessus ») : pour mettre en forme une
       seule lettre, il fallait d'abord désélectionner — et cliquer un bouton
       de la barre appliquait le style au mot entier, puisque tout était pris. */
    var sel = window.getSelection();
    var range = null;
    if (typeof document.caretRangeFromPoint === 'function' && lastPoint) {
      range = document.caretRangeFromPoint(lastPoint.x, lastPoint.y);
    }
    // Repli (point hors du texte, ou API absente) : curseur en fin de texte.
    if (!range || !content.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* Collage : on force du texte BRUT, sur une seule ligne. Sans cela, un
     copier-coller depuis une page web injecterait son balisage (et ses
     styles) dans le flocage. Nécessaire là où plaintext-only n'existe pas. */
  document.addEventListener('paste', function (e) {
    if (!editing || e.target.closest('.dt-content') !== editing) return;
    e.preventDefault();
    var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
    txt = txt.replace(/\s+/g, ' ').trim();
    document.execCommand('insertText', false, txt);
  }, true);

  /* Collage : on force du TEXTE BRUT, sur une seule ligne.
     Nécessaire là où plaintext-only n'existe pas (Firefox), et de toute façon
     plus sûr — un collage depuis un traitement de texte apporterait du HTML
     et des sauts de ligne que le flocage ne sait pas rendre. */
  document.addEventListener('paste', function (e) {
    if (!editing || e.target.closest('.dt-content') !== editing) return;
    e.preventDefault();
    var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
    txt = txt.replace(/\s+/g, ' ').trim().slice(0, 40);   // même plafond que le panneau
    document.execCommand('insertText', false, txt);
  }, true);

  /* Écouteur délégué : les textes sont créés et recréés dynamiquement
     (ajout, restauration de session, changement de produit). */
  document.addEventListener('dblclick', function (e) {
    var host = e.target.closest('.design-text');
    if (!host) return;
    e.preventDefault();
    lastPoint = { x: e.clientX, y: e.clientY };
    openEditor(host);
  });

  /* ── Double-tap tactile ────────────────────────────────────────────────────
     Sur mobile, `dblclick` ci-dessus n'est JAMAIS émis : conf-logo-drag.js
     appelle preventDefault() sur `touchstart` (:471, pour que le geste ne
     défile pas la page), ce qui supprime la synthèse des événements souris.
     On reconstitue donc le double-tap à partir des événements tactiles.

     Deux taps comptent comme un double-tap s'ils sont proches dans le TEMPS
     (500 ms — au-delà, c'est une seconde intention) et dans l'ESPACE (30 px —
     sinon deux taps sur des lettres opposées d'un long texte déclencheraient
     l'édition par erreur). Le seuil d'espace est plus large que les 4 px du
     drag : le doigt est moins précis que la souris. */
  var TAP_DELAI = 500;
  var TAP_RAYON = 30;
  var dernierTap = 0;
  var dernierX = 0;
  var dernierY = 0;
  var dernierHost = null;

  document.addEventListener('touchend', function (e) {
    var host = e.target.closest('.design-text');
    if (!host) { dernierHost = null; return; }

    /* Un seul doigt : un pincement à deux doigts (redimensionnement) ne doit
       pas ouvrir l'éditeur en se relevant. */
    if (e.changedTouches.length !== 1) { dernierHost = null; return; }

    var t = e.changedTouches[0];
    /* `e.timeStamp` est relatif au chargement de la page et peut valoir moins
       de 500 ms sur un premier tap très précoce — d'où la comparaison sur
       `dernierHost`, non nul seulement après un vrai premier tap. */
    var maintenant = e.timeStamp || 0;
    var proche = dernierHost === host &&
                 (maintenant - dernierTap) < TAP_DELAI &&
                 Math.abs(t.clientX - dernierX) < TAP_RAYON &&
                 Math.abs(t.clientY - dernierY) < TAP_RAYON;

    if (proche) {
      dernierHost = null;              // évite qu'un 3e tap ré-ouvre aussitôt
      lastPoint = { x: t.clientX, y: t.clientY };
      openEditor(host);

      /* La barre d'outils RESTE VISIBLE pendant l'édition. Elle était masquée
         ici pour ne pas recouvrir le texte en cours de frappe — mais c'est le
         seul endroit où l'on peut mettre une lettre en gras ou en couleur : la
         masquer rendait la mise en forme par caractère inaccessible au doigt,
         et pas seulement incommode. Le texte reste lisible sur le vêtement,
         la barre flottant au-dessus de l'aperçu. */
      return;
    }

    dernierTap = maintenant;
    dernierX = t.clientX;
    dernierY = t.clientY;
    dernierHost = host;
  }, true);

  /* Un déplacement annule le double-tap en cours : faire glisser le texte puis
     le tapoter une fois n'est pas une demande d'édition. */
  document.addEventListener('touchmove', function () {
    dernierHost = null;
  }, true);

  /* Fermeture au doigt. Les deux gestionnaires plus bas n'écoutent que
     `mousedown`, absent sur mobile : sans ceci, l'édition ouverte ne se
     validerait qu'à la touche Entrée du clavier virtuel. */
  document.addEventListener('touchstart', function (e) {
    if (!editing) return;
    if (e.target.closest('.dt-content') === editing) {
      /* Toucher le texte en cours d'édition place le curseur ; cela ne doit
         pas démarrer un déplacement sous le doigt. */
      e.stopPropagation();
      return;
    }
    // Barre d'outils : même raison qu'au mousedown ci-dessus.
    if (e.target.closest('#txt-toolbar')) return;
    if (e.target.closest('.txt-tb-pop')) return;
    close(true);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!editing) return;

    /* Plafond de 40 caractères, comme le champ du panneau latéral. On laisse
       passer les touches de contrôle (effacement, flèches, raccourcis) et on
       n'intervient que si rien n'est sélectionné — taper par-dessus une
       sélection ne rallonge pas le texte. */
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      var sel = window.getSelection();
      var hasSelection = sel && !sel.isCollapsed;
      if (!hasSelection && editing.textContent.length >= 40) {
        e.preventDefault();
        return;
      }
    }

    if (e.key === 'Enter') {
      // Un texte de flocage tient sur une ligne : Entrée valide, pas de saut.
      e.preventDefault();
      close(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(false);
    }
    /* Les autres touches ne doivent pas atteindre les raccourcis du canvas
       (suppression, déplacement au clavier…). */
    e.stopPropagation();
  }, true);

  /* Clic hors du texte édité : on valide, comme la sortie d'un champ.
     En capture, pour passer avant les handlers qui désélectionnent. */
  document.addEventListener('mousedown', function (e) {
    if (!editing) return;
    if (e.target.closest('.dt-content') === editing) return;
    /* La BARRE D'OUTILS ne ferme pas l'édition. `mousedown` précède toujours
       `click` : sans ces gardes, cliquer « Couleur » ou « B » fermait l'édition
       — donc vidait la sélection — AVANT que le bouton n'applique quoi que ce
       soit. La mise en forme d'une seule lettre était alors impossible : elle
       retombait systématiquement sur le texte entier.

       Mêmes gardes que conf-logo-drag.js:903-907, où ce défaut a déjà été
       corrigé pour la désélection du cadre. Les menus « Police » et couleur
       sont déplacés dans <body> par conf-text-toolbar.js : ils ne sont donc
       plus dans #txt-toolbar et demandent leur propre garde. */
    if (e.target.closest('#txt-toolbar')) return;
    if (e.target.closest('.txt-tb-pop')) return;
    close(true);
  }, true);

  /* Pendant l'édition, le texte ne doit pas se déplacer sous le curseur :
     conf-logo-drag.js démarre un drag au mousedown sur .design-text. */
  document.addEventListener('mousedown', function (e) {
    if (editing && e.target.closest('.dt-content') === editing) {
      e.stopPropagation();
    }
  }, true);
})();
