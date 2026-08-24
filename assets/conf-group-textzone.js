/* ─────────────────────────────────────────────────────────────────────────
   Quelle zone de texte porte le NOM FLOQUÉ d'une commande de groupe ?

   Le vêtement peut porter plusieurs textes — par exemple « Modou » en cœur et
   « Samba » en poitrine droite. Lorsque le client passe une commande de
   groupe, un seul de ces textes doit devenir le nom de chaque personne ;
   l'autre reste identique pour tous. Rien ne le disait : le code substituait
   #text-f en silence.

   Ce module expose ce choix, MAIS SEULEMENT QUAND IL EXISTE : le sélecteur
   reste masqué tant qu'une seule zone porte du texte. Un écran qui pose une
   question sans enjeu est une friction, pas une aide.

   Le choix vaut pour toute la liste — cohérent avec la promesse de la modale,
   « même design pour tous » : seule la valeur du texte change d'une personne à
   l'autre, pas son emplacement.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* Ordre d'affichage = ordre de lecture du vêtement. Les libellés reprennent
     ceux du récapitulatif, pour que le client reconnaisse la même zone d'un
     écran à l'autre. */
  var ZONES = [
    { z: 'f',  label: 'Texte cœur' },
    { z: 'fr', label: 'Texte poitrine droite' },
    { z: 'b',  label: 'Texte dos' }
  ];

  /** Zones portant réellement un texte visible, avec leur contenu. */
  function zonesActives() {
    var out = [];
    ZONES.forEach(function (def) {
      var el = document.getElementById('text-' + def.z);
      if (!el || el.style.display === 'none') return;

      var c = el.querySelector('.dt-content');
      /* Texte courbé : le contenu est un SVG, `textContent` est vide. On lit
         alors l'état sauvegardé, seule source fiable dans ce cas. */
      var txt = c ? (c.textContent || '').trim() : '';
      if (!txt && typeof window.getSavedText === 'function') {
        var st = window.getSavedText(def.z);
        txt = (st && st.text) ? String(st.text).trim() : '';
      }
      if (!txt) return;

      out.push({ zone: def.z, label: def.label, texte: txt });
    });
    return out;
  }

  /* Zone retenue. Par défaut la PREMIÈRE zone active — donc `f` dans le cas
     courant, ce qui préserve le comportement d'avant ce module. */
  var choisie = null;

  /** Zone à substituer par le surnom. Lue par l'aperçu et l'ajout au panier. */
  window.grpTextZone = function () {
    var actives = zonesActives();
    if (!actives.length) return 'f';

    /* Le choix mémorisé n'est plus valide si le client a supprimé ce texte
       entre-temps : on retombe alors sur la première zone active. */
    var encoreLa = actives.some(function (a) { return a.zone === choisie; });
    return encoreLa ? choisie : actives[0].zone;
  };

  /** Construit le sélecteur, ou le masque s'il n'y a rien à départager. */
  window.grpRefreshTextZonePicker = function () {
    var bloc = document.getElementById('grp-textzone');
    var sel = document.getElementById('grp-textzone-sel');
    if (!bloc || !sel) return;

    var actives = zonesActives();

    /* 0 ou 1 texte : aucune ambiguïté à lever. */
    if (actives.length < 2) {
      bloc.style.display = 'none';
      choisie = actives.length ? actives[0].zone : null;
      return;
    }

    /* On rappelle le CONTENU de chaque texte, pas seulement l'emplacement :
       « Texte cœur » seul obligerait le client à se souvenir duquel il s'agit,
       alors que « Texte cœur (« Modou ») » se reconnaît d'un coup d'œil. */
    sel.innerHTML = actives.map(function (a) {
      var court = a.texte.length > 24 ? a.texte.slice(0, 24) + '…' : a.texte;
      return '<option value="' + a.zone + '">' +
             esc(a.label) + ' (« ' + esc(court) + ' »)</option>';
    }).join('');

    var courante = window.grpTextZone();
    sel.value = courante;
    choisie = courante;

    bloc.style.display = 'flex';
  };

  /* Échappement : le contenu vient d'une saisie libre du client. */
  function esc(s) {
    if (typeof window.grpEsc === 'function') return window.grpEsc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Délégation : le <select> existe dès le rendu de la section, mais on reste
     robuste si la modale était reconstruite un jour. */
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'grp-textzone-sel') {
      choisie = e.target.value;
      /* La zone visée change : la nouvelle n'est pas forcément courbée comme
         l'ancienne. On rejoue le contrôle, sans quoi la validation resterait
         bloquée — ou le serait à tort. */
      if (typeof window.grpRefreshCurveWarning === 'function') {
        window.grpRefreshCurveWarning();
      }
    }
  });
})();
