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

    /* IMAGE PRODUIT PAS ENCORE CHARGÉE : on ne borne pas.

       Le garde ci-dessus couvre la mesure NULLE, pas la mesure FAUSSE. Au
       chargement (F5, cache vide) et au changement de produit, `#logo-layer` a
       déjà sa taille — elle vient du CSS — et le texte est visible : les deux
       gardes passent. Mais l'image du vêtement n'est pas décodée, donc le
       cadrage n'est pas définitif, et la position bornée ici serait rabattue
       sur le bord de zone. Comme rien ne re-persiste la valeur corrigée, le
       DOM divergeait alors silencieusement de la session : le texte revenait
       ailleurs qu'où le client l'avait posé.

       Le clamp est de toute façon rejoué — par renderTextOnCanvas (3 fois,
       dont document.fonts.ready) et par applyZonesForProduct. Sortir ici ne
       fait donc rien perdre : cela évite un passage sur des dimensions non
       définitives. */
    var imgRef = document.querySelector('.product-img-single.on') ||
                 document.getElementById('view-face');
    if (imgRef && imgRef.tagName === 'IMG' && !imgRef.complete) return;
  
    /* zoneW borne la LARGEUR DU TEXTE : `maxWidth` quand la zone en déclare un
       (20 cm en face), sinon la zone entière (le dos, dont les 30 cm sont déjà
       la contrainte atelier).

       À ne pas confondre avec la zone de DÉPLACEMENT, qui reste `h.width` et
       sert plus bas à borner la position (:150). Les confondre figeait le
       texte au centre d'un couloir étroit, alors que le client doit pouvoir le
       poser où il veut sur le buste. */
    var zoneW = ((h.maxWidth != null ? h.maxWidth : h.width) / 100) * lb.width;
    var zoneH = (h.height / 100) * lb.height;
  
    /* La BOÎTE du texte est bornée à la largeur de la zone. Sans cela, la
       largeur inline du markup (héritée des anciennes zones, ex. 22 %)
       restait appliquée alors que la zone n'en fait plus que 7,3 % : le
       texte était bien réduit en police, mais son conteneur — donc le
       centrage et le débordement — dépassait toujours le gabarit.
       La largeur vit dans max-width depuis fitTextBox() (la boîte épouse le
       texte pour que le cadre de sélection lui colle) : on écrit donc le
       plafond là, et data-w garde la valeur pour l'export. */
    /* Plafond de la boîte = `maxWidth` s'il existe, sinon la zone entière.
       C'est CE plafond, et non la largeur de déplacement, qui limite la
       largeur du texte. */
    var plafondW = (h.maxWidth != null) ? h.maxWidth : h.width;
    var curW = parseFloat(el.getAttribute('data-w') || el.style.maxWidth || el.style.width);
    if (isNaN(curW) || curW > plafondW) {
      el.setAttribute('data-w', plafondW + '%');
      el.style.maxWidth = plafondW + '%';
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
    /* Réduction jusqu'à ce que TOUT le texte tienne — aucune lettre ne doit
       être cachée.

       Deux limites levées ici :

       • Le plancher de 8px arrêtait la boucle même si le texte débordait
         encore. Comme `.dt-content` porte `overflow: hidden`, la fin du mot
         était alors COUPÉE en silence : le client voyait « MODOU BABAC » et
         croyait avoir saisi un nom complet. Le plancher descend à 4px — en
         pratique jamais atteint, la zone de 12,5 cm accueillant un nom usuel
         bien au-dessus de cette taille.

       • Le garde de 40 tours pouvait s'épuiser AVANT convergence pour un texte
         parti d'une grande police (200px max) : la boucle sortait alors sur un
         texte encore trop large. Porté à 240, soit plus que l'amplitude
         complète (200 -> 4), la sortie se fait donc toujours sur la condition
         de tenue, jamais sur le compteur. */
    /* On mesure la largeur RÉELLE DU TEXTE (scrollWidth du contenu), pas la
       boîte.

       C'est la cause du texte tronqué : `el` porte un `max-width` égal au
       plafond, donc sa largeur mesurée ne le dépasse JAMAIS — la condition
       `eb.width <= zoneW` était toujours vraie, la boucle sortait au premier
       tour et la police ne se réduisait pas d'un pixel. Le texte débordait
       alors À L'INTÉRIEUR de la boîte, où `.dt-content { overflow: hidden }`
       le coupait sans bruit (« Papa » -> « pap »).

       `scrollWidth` mesure le contenu même quand il dépasse la boîte : c'est
       la seule grandeur qui révèle le débordement. */
    var contenu = el.querySelector('.dt-content');
    function largeurTexte() {
      /* +1 px de tolérance : scrollWidth est arrondi à l'entier, un texte
         tenant tout juste sortirait sinon en boucle d'un pixel. */
      return contenu ? contenu.scrollWidth : el.getBoundingClientRect().width;
    }

    /* Place réellement OFFERTE AU TEXTE, bordure et padding déduits.

       `.design-text` est en `box-sizing: border-box` avec `border: 1px` et
       `padding: 0 2px` (conf-styles.css:384-389) : la boîte de `zoneW` pixels
       n'en laisse que `zoneW - 6` au contenu. Comparer `scrollWidth` (le
       contenu) à `zoneW` (la boîte entière) laissait donc la dernière lettre
       passer sous la bordure — le « a » de « Papa ».

       On mesure la marge sur l'élément plutôt que de la coder en dur : elle
       reste juste si le CSS change. */
    function margeInterne() {
      var cs = window.getComputedStyle(el);
      return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
             (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    }
    var texteW = Math.max(0, zoneW - margeInterne());
    while (guard++ < 240) {
      var eb = el.getBoundingClientRect();
      var tw = largeurTexte();
      if ((tw <= texteW + 1 && eb.height <= zoneH) || cur <= 4) break;
      cur = Math.max(4, cur - 1);
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
      /* Même mesure qu'à la réduction : la boîte est plafonnée par max-width,
         seul scrollWidth révèle le débordement du texte. */
      if (largeurTexte() > texteW + 1 || eb2.height > zoneH) { el.style.fontSize = cur + 'px'; break; }
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
      if (largeurTexte() > texteW + 1 || eb3.height > zoneH) break;
      fits += 1;
    }
    el.style.fontSize = cur + 'px';
    el.setAttribute('data-max-fit', fits);

    /* 2) Borne la position dans la zone de DÉPLACEMENT (h.width), et non dans
       le plafond de largeur : le texte doit rester librement déplaçable sur
       tout le buste, même si sa largeur propre est limitée. */
    var ebf = el.getBoundingClientRect();
    var wPct = (ebf.width / lb.width) * 100;
    var hPct = (ebf.height / lb.height) * 100;
    /* Repli sur `startLeft` et non sur `h.left` : les zones de poitrine gauche
       et droite partagent le même rectangle, donc le même `left`. Retomber
       dessus superposait deux textes jamais déplacés. `startLeft` distingue les
       deux, comme il le fait déjà pour les logos. */
    var left = parseFloat(el.style.left);
    if (isNaN(left)) left = (h.startLeft != null) ? h.startLeft : h.left;
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
