/**
 * clampTextToZone() — contraint un texte DANS sa zone imprimable.
 *
 *  1. RÉDUIT la police tant que le texte est plus large/haut que la zone : il
 *     ne déborde donc jamais (comportement CustomInk) ;
 *  2. le regrossit si de la place s'est libérée, sans dépasser le plafond
 *     atelier (MAX_TEXT_SIZE) ;
 *  3. BORNE enfin la position dans la zone.
 *
 * Déporté ici : configurateur.liquid atteint la limite Shopify de 256 Ko.
 * Dépend de window.TEXT_ZONE_HORIZ et window.MAX_TEXT_SIZE, exposés par le
 * template — ne pas retirer ces assignations.
 */
(function () {
  'use strict';

  function clampTextToZone(zone) {
    var h = window.TEXT_ZONE_HORIZ[zone];
    var el = document.getElementById('text-' + zone);
    var layer = document.getElementById('logo-layer');
    if (!h || !el || !layer) return;
  
    var lb = layer.getBoundingClientRect();
    if (!lb.width || !lb.height) return;

    /* Texte NON RENDU : masqué par sa vue (un texte de dos n'existe à l'écran
       qu'en vue de dos) ou pas encore affiché. Sa boîte mesure alors 0, et
       borner une position sur des dimensions nulles la décale — c'est ce qui
       déplaçait le texte au retour depuis le récapitulatif.
       On sort : la position sauvegardée reste intacte, et le clamp sera
       rejoué quand la vue deviendra visible. */
    if (!el.offsetWidth || !el.offsetHeight) return;
  
    // Dimensions de la zone en pixels écran.
    var zoneW = (h.width / 100) * lb.width;
    var zoneH = (h.height / 100) * lb.height;
  
    /* La BOÎTE du texte est bornée à la largeur de la zone. Sans cela, la
       largeur inline du markup (héritée des anciennes zones, ex. 22 %)
       restait appliquée alors que la zone n'en fait plus que 7,3 % : le
       texte était bien réduit en police, mais son conteneur — donc le
       centrage et le débordement — dépassait toujours le gabarit.
       La largeur vit dans max-width depuis fitTextBox() (la boîte épouse le
       texte pour que le cadre de sélection lui colle) : on écrit donc le
       plafond là, et data-w garde la valeur pour l'export. */
    var curW = parseFloat(el.getAttribute('data-w') || el.style.maxWidth || el.style.width);
    if (isNaN(curW) || curW > h.width) {
      el.setAttribute('data-w', h.width + '%');
      el.style.maxWidth = h.width + '%';
      el.style.width = '';
    }

    /* La boîte doit SUIVRE le texte quand il rétrécit.

       .dt-content porte `white-space: nowrap` + `overflow: hidden`, et fait
       100 % de cette boîte. Si une largeur FIXE reste posée en inline alors
       que la police diminue, le texte ne peut ni revenir à la ligne ni se
       réduire : il est rogné, et les lettres disparaissent une à une.

       On efface donc toute largeur inline : le CSS reprend la main avec
       `width: max-content` (.design-text), qui laisse la boîte épouser le
       texte. `max-width`, posé juste au-dessus, reste le plafond. */
    if (el.style.width) el.style.width = '';
  
    // 1) Ajuste la taille de police pour tenir dans la zone (largeur ET
    //    hauteur). On part de la taille demandée et on réduit si nécessaire.
    var cur = parseFloat(window.getComputedStyle(el).fontSize) || 20;
    var guard = 0;
    // Réduction : tant que le texte déborde, on rapetisse (min 8px).
    while (guard++ < 40) {
      var eb = el.getBoundingClientRect();
      if ((eb.width <= zoneW && eb.height <= zoneH) || cur <= 8) break;
      cur = Math.max(8, cur - 1);
      el.style.fontSize = cur + 'px';
    }
    // Plafond atelier : quelle que soit la place disponible dans la zone, la
    // police ne dépasse pas window.MAX_TEXT_SIZE. Appliqué ici car cette fonction
    // est le passage obligé du panneau ET du redimensionnement à la souris —
    // borner le seul curseur laisserait la poignée de resize le contourner.
    if (cur > window.MAX_TEXT_SIZE) {
      cur = window.MAX_TEXT_SIZE;
      el.style.fontSize = cur + 'px';
    }
  
    // Agrandissement : si on avait trop réduit et qu'il reste de la place,
    // on regrossit jusqu'à la taille voulue (sans jamais déborder).
    var wanted = Math.min(
      parseFloat(el.getAttribute('data-wanted-size')) || cur,
      window.MAX_TEXT_SIZE
    );
    while (guard++ < 80 && cur < wanted) {
      el.style.fontSize = (cur + 1) + 'px';
      var eb2 = el.getBoundingClientRect();
      if (eb2.width > zoneW || eb2.height > zoneH) { el.style.fontSize = cur + 'px'; break; }
      cur += 1;
    }

    /* PLAFOND RÉEL DE CETTE ZONE, pour ce texte et cette police.

       On cherche la plus grande police qui tienne encore : on continue de
       monter au-delà de `wanted` jusqu'au débordement, on note la dernière
       valeur qui passait, puis on restaure la taille effective.

       Sans cela le curseur affichait une plage (8 → MAX_TEXT_SIZE) que la
       zone n'honore pas : il montrait 45 alors que le texte plafonnait à 22,
       et le pousser plus haut ne changeait plus rien à l'écran.

       Le résultat dépend du texte saisi (« Didi » tient plus gros que vingt
       lettres) et de la police : il est donc recalculé à chaque clamp, et non
       mis en cache. */
    var fits = cur;
    while (guard++ < 200 && fits < window.MAX_TEXT_SIZE) {
      el.style.fontSize = (fits + 1) + 'px';
      var eb3 = el.getBoundingClientRect();
      if (eb3.width > zoneW || eb3.height > zoneH) break;
      fits += 1;
    }
    el.style.fontSize = cur + 'px';
    el.setAttribute('data-max-fit', fits);

    // 2) Borne la position dans la zone.
    var ebf = el.getBoundingClientRect();
    var wPct = (ebf.width / lb.width) * 100;
    var hPct = (ebf.height / lb.height) * 100;
    var left = parseFloat(el.style.left); if (isNaN(left)) left = h.left;
    var top = parseFloat(el.style.top); if (isNaN(top)) top = h.top;
    var minL = h.left, maxL = h.left + h.width - wPct;
    var minT = h.top, maxT = h.top + h.height - hPct;
    if (maxL < minL) maxL = minL;
    if (maxT < minT) maxT = minT;
    el.style.left = Math.max(minL, Math.min(maxL, left)) + '%';
    el.style.top = Math.max(minT, Math.min(maxT, top)) + '%';
  }

  window.clampTextToZone = clampTextToZone;
})();
