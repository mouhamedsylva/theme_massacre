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
      if (el) {
        /* Largeur : on NE bride PAS la boîte à une demi-zone — sinon
           clampTextToZone rapetisse le texte en boucle et le curseur de
           taille semble sans effet. La boîte occupe ~60 % de la zone, ancrée
           du bon côté ; le texte peut donc grandir jusqu'au plafond atelier. */
        var pad = h.width * 0.04;
        var tW = h.width * 0.6;
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
