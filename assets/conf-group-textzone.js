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

  /* `ZONES` et `zonesActives()` ont été RETIRÉS avec le sélecteur qu'ils
     servaient : ils inventoriaient les zones garnies pour départager laquelle
     porterait les surnoms. La réponse est désormais constante — la face — et
     cet inventaire n'avait plus de lecteur. */

  /* La variable `choisie` a disparu avec le sélecteur : elle mémorisait la zone
     retenue par le client, un choix qui n'existe plus. */

  /* AUCUNE PERSISTANCE : la zone se DÉDUIT de l'état réel — une zone déjà
     garnie, sinon la vue affichée. Rien à mémoriser, donc rien qui puisse
     diverger de ce que le client voit. */

  /* LA VUE AFFICHÉE DÉSIGNE LA ZONE — pas de commande dédiée.

     Un sélecteur « Face / Dos » a d'abord été ajouté dans « Mon Équipe ». Il
     faisait doublon avec les onglets « Vue de face » / « Vue de dos » situés
     juste au-dessus du canvas : deux commandes pour le même geste, à quelques
     centimètres l'une de l'autre. Le client change de vue pour VOIR le dos ;
     c'est évidemment là qu'il veut son surnom.

     `logo-layer` porte `data-view`, posé par selView (conf-view-switcher.js:35).
     C'est le repère le plus fiable : il suit la vue réellement affichée, quel
     que soit le chemin emprunté pour y arriver. */
  function vueAffichee() {
    var couche = document.getElementById('logo-layer');
    var v = couche && couche.getAttribute('data-view');
    return (v === 'dos') ? 'b' : 'f';
  }
  /* Exposée : la saisie d'un surnom (conf-main-inline.js) doit connaître le
     côté affiché pour le mémoriser sur la ligne. */
  window.grpVueAffichee = vueAffichee;

  /**
   * Le côté d'UNE ligne — par opposition à `grpTextZone()`, qui décrit la zone
   * du canvas.
   *
   * Repli sur `grpTextZone()` : les listes composées avant ce champ, et les
   * lignes importées par CSV, n'en portent pas. Elles se comportent alors
   * comme avant.
   *
   * @param {Object} row - une ligne de `groupOrderRows`
   */
  window.grpZoneDeLigne = function (row) {
    /* ═══ LES SURNOMS SONT EN FACE, ET NULLE PART AILLEURS ═══════════════

       Cette fonction rendait le côté propre à chaque personne (`row.zone`),
       pour que Jean porte son nom devant et Marie derrière.

       Ce n'est plus la règle : le dos est désormais réservé à un TEXTE LIBRE,
       commun à toute la commande — un nom d'équipe, un slogan — saisi par
       l'onglet « Ajout Texte » qui apparaît en vue de dos.

       On force donc ici, en UN SEUL POINT. Tous ses consommateurs — le grisage
       de la liste, l'essayage d'un surnom, les planches d'atelier, les cartes
       de vérification, le renommage au double-clic — reçoivent mécaniquement
       la bonne réponse, sans avoir à les corriger un par un.

       `row.zone` continue d'exister et de voyager : le retirer traverserait le
       panier, l'instantané, le tableau « Configurer » et la propriété
       « Emplacement » du checkout, pour aucun gain visible. Sa valeur est
       simplement toujours 'f'. */
    return 'f';
  };

  /** Zone à substituer par le surnom. Lue par l'aperçu et l'ajout au panier. */
  window.grpTextZone = function () {
    /* ═══ LA FACE, TOUJOURS — ET C'EST UNE GARDE DE SÛRETÉ ═══════════════

       Cette fonction désigne la zone que les surnoms SUBSTITUENT : celle dont
       le texte est remplacé, personne par personne, à l'aperçu comme à l'ajout
       au panier.

       Elle retombait sur la vue affichée quand aucune zone n'était garnie. Or
       le dos accueille désormais un TEXTE LIBRE — un client qui le pose AVANT
       son premier surnom obtenait donc 'b' ici, et ses surnoms venaient écraser
       ce texte, un par vêtement.

       C'est exactement le défaut que le masquage de l'onglet « Ajout Texte »
       prévenait, et la raison pour laquelle il pouvait être démasqué : les deux
       zones sont désormais DISJOINTES. Ce forçage n'est pas une simple mise en
       cohérence — il est ce qui rend le texte du dos intouchable.

       La zone `fr` (poitrine droite) reste hors sujet : elle est capturée dans
       la même vue que la face et n'a jamais porté de surnom. */
    return 'f';
  };

  /** Construit le sélecteur, ou le masque s'il n'y a rien à départager. */
  window.grpRefreshTextZonePicker = function () {
    var bloc = document.getElementById('grp-textzone');
    if (!bloc) return;

    /* ═══ PLUS RIEN À DÉPARTAGER ═════════════════════════════════════════

       Ce sélecteur existait pour trancher quand plusieurs zones portaient du
       texte : lequel devient le surnom ? La question n'a plus lieu d'être, la
       réponse étant toujours la face.

       Le laisser vivre serait pire qu'inutile : le texte libre du dos garnit
       désormais une seconde zone, donc le sélecteur APPARAÎTRAIT — et
       proposerait au client de floquer ses surnoms au dos, l'inverse exact de
       la règle qu'on installe.

       On le masque toujours. La fonction reste en place et exposée : ses
       appelants (ouverture de la modale, changement de zone) n'ont pas à savoir
       qu'elle n'a plus rien à faire. */
    bloc.style.display = 'none';
  };

  /* L'échappement HTML et l'écouteur du <select> ont été RETIRÉS avec le
     sélecteur : le premier ne servait qu'à composer ses options, le second à
     réagir à un choix qui ne se fait plus. Le bloc reste masqué en permanence,
     personne ne peut donc en émettre l'événement. */
})();
