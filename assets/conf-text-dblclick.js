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
      /* Annulation, champ vidé ou valeur inchangée : on remet l'affichage
         d'origine. Vider ne supprime PAS le texte — le bouton « ✕ » est là
         pour ça, et une saisie effacée par erreur ne doit rien détruire. */
      content.textContent = before;
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

    /* plaintext-only empêche l'insertion de HTML au collage. Firefox ne le
       supporte pas et retombe alors sur `false` (non éditable) : on vérifie
       et on bascule sur `true`, avec un nettoyage du collage plus bas. */
    content.setAttribute('contenteditable', 'plaintext-only');
    if (content.contentEditable !== 'plaintext-only') {
      content.setAttribute('contenteditable', 'true');
    }
    content.classList.add('is-editing');
    host.classList.add('is-editing');
    content.focus();

    // Sélectionne tout : on tape par-dessus, comme dans un champ classique.
    var range = document.createRange();
    range.selectNodeContents(content);
    var sel = window.getSelection();
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
      openEditor(host);

      /* La barre d'outils est refermée APRÈS, en différé. Ce gestionnaire est
         en capture, donc il précède onPointerUp (conf-logo-drag.js:933, en
         bulle) qui rouvre la barre sur un tap sans déplacement (:797) : la
         fermer maintenant serait aussitôt annulé. L'édition se fait sur le
         vêtement, la barre masquerait le texte en cours de frappe. */
      setTimeout(function () {
        if (editing && typeof window.hideTextToolbar === 'function') {
          window.hideTextToolbar();
        }
      }, 0);
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
