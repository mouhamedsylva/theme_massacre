/**
 * setTextZoneMode() — bascule une zone en mode TEXTE.
 *
 * Le mode texte grise l'upload logo du même côté (zone poitrine unifiée : pas
 * de logo ET de texte au même endroit) et, en sortie, réaligne la zone guide
 * sur LOGO_ZONES.
 *
 * Déporté ici : configurateur.liquid atteint la limite Shopify de 256 Ko.
 * Dépend de window.setUploadEnabled, window.TEXT_ZONE_HORIZ,
 * window.LOGO_ZONES et window.refreshZoneGuides — exposés par le template,
 * ne pas retirer ces assignations.
 */
(function () {
  'use strict';

  function setTextZoneMode(zone, on) {
    /* L'upload n'est PLUS grisé quand un texte occupe la zone : logo et texte
       coexistent sur la poitrine, le client les place librement dans le
       bandeau. Le grisage venait de l'ancienne règle « un seul élément par
       emplacement », qui supprimait aussi le contenu existant. */


    // Le devant partage une seule zone guide (zone-chest) ; le dos a zone-b.
    var zid = (zone === 'f' || zone === 'fr') ? 'zone-chest'
            : (zone === 'b') ? 'zone-b' : null;
    if (!zid) return;
    var zoneEl = document.getElementById(zid);
    if (!zoneEl) return;
    if (on) {
      /* Plus de capture dans _zoneOrigStyle : la zone n'étant plus modifiée,
         il n'y a rien à restaurer. La branche 'off' la réaligne de toute
         façon sur window.LOGO_ZONES, source de vérité. */
      var h = window.TEXT_ZONE_HORIZ[zone];
      /* La zone guide n'est PLUS redimensionnée pour le texte.
         Elle était réécrite ici (left/top/width/height) : le gabarit affiché
         épousait le bandeau de texte au lieu de montrer la zone imprimable,
         et paraissait donc ne pas respecter les dimensions réglées dans
         buildZones(). Le texte s'adapte à la zone — pas l'inverse. Seule la
         classe .text-mode change, pour le style pointillé. */
      zoneEl.classList.add('text-mode');
      /* Place le texte DIRECTEMENT du bon côté, sans que le client ait à le
         déplacer. Même convention que les logos (vue de face) :
           • 'f'  = Cœur (gauche du porteur)   -> moitié DROITE de l'image
           • 'fr' = Poitrine droite            -> moitié GAUCHE de l'image
           • 'b'  = Dos, centré sur toute la zone.
         Les demi-zones laissent une petite marge intérieure. */
      var el = document.getElementById('text-' + zone);

      /* PLACEMENT AUTOMATIQUE : seulement à la CRÉATION du texte.

         Ce bloc recalcule left/top/width depuis la géométrie de zone, sans
         consulter la position enregistrée. Or restoreTexts() l'appelle juste
         APRÈS renderTextOnCanvas (conf-text-editor.js:1138 puis :1145) : la
         position que le client avait choisie était donc appliquée, puis
         écrasée six lignes plus loin. Deux textes déplacés côte à côte
         revenaient ainsi tous deux à leur ancrage de départ et se
         superposaient au rechargement.

         Le témoin est le même que pour les logos, dont la position survit
         justement parce que rien ne les replace après restauration : une
         géométrie mémorisée signifie « l'utilisateur a choisi », et on n'y
         touche plus. Sans géométrie, le placement ci-dessous reste légitime —
         c'est son rôle : poser le texte du bon côté sans que le client ait à
         le déplacer. */
      var dejaPlace = false;
      if (typeof window.getSavedText === 'function') {
        var etat = window.getSavedText(zone);
        dejaPlace = !!(etat && etat.left);
      }

      if (el && !dejaPlace) {
        /* Largeur : on NE bride PAS la boîte à une demi-zone — sinon
           clampTextToZone rapetisse le texte en boucle et le curseur de
           taille semble sans effet.

           46 % et non 60 % : à 60 %, les deux demi-zones de poitrine faisaient
           14,4 points de large pour seulement 7,7 points d'écart entre leurs
           ancrages — elles se recouvraient donc de 6,7 points, soit plus d'un
           quart de la zone, même correctement placées. À 46 % elles deviennent
           contiguës (39,0-50,0 et 50,0-61,0) sans jamais se chevaucher, tout
           en gardant la largeur maximale possible. Le dos, centré sur la zone
           entière, n'est pas concerné. */
        var pad = h.width * 0.04;
        var tW = h.width * 0.46;
        var tLeft = h.left, tAlign = 'center';
        if (zone === 'f') {            // cœur -> ancré à DROITE de la zone
          tLeft = h.left + h.width - tW - pad;
        } else if (zone === 'fr') {    // poitrine droite -> ancré à GAUCHE
          tLeft = h.left + pad;
        } else {                       // dos : centré
          tW = h.width; tLeft = h.left;
        }
        el.style.left = tLeft + '%';
        el.style.top = (h.top + 1) + '%';
        el.style.width = tW + '%';
        el.style.textAlign = tAlign;
      }
    } else {
      /* Réaligne la zone sur window.LOGO_ZONES (source de vérité). Conservé même si
         le mode 'on' ne la modifie plus : cette branche répare aussi les
         géométries écrites par une version antérieure (session en cours,
         page pas encore rechargée). */
      var zk = (zone === 'fr') ? 'fr' : (zone === 'b') ? 'b' : 'f';
      var cz = (typeof window.LOGO_ZONES !== 'undefined') ? window.LOGO_ZONES[zk] : null;
      if (cz) {
        zoneEl.style.left = cz.left + '%'; zoneEl.style.top = cz.top + '%';
        zoneEl.style.width = cz.width + '%'; zoneEl.style.height = cz.height + '%';
      }
      zoneEl.classList.remove('text-mode');
    }
    if (typeof window.refreshZoneGuides === 'function') window.refreshZoneGuides();
  }

  window.setTextZoneMode = setTextZoneMode;
})();
