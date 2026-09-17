/* VISITE GUIDÉE DU CONFIGURATEUR
   ══════════════════════════════════════════════════════════════════════════

   Des bulles ancrées aux commandes, avec Précédent / Suivant / Passer.

   POURQUOI : le configurateur porte des fonctions qui ne se devinent pas —
   « Répartir par tailles », les vues manches, le changement de mode, la Vue
   d'ensemble. Un client qui arrive pour la première fois ne sait pas ce qu'il
   peut faire, et rien ne le lui disait.

   SANS DÉPENDANCE, comme conf-alert.js — qui remplace SweetAlert à la main
   pour la même raison : cette page a bataillé pour son premier affichage, et
   une bibliothèque de visite guidée pèse 20 à 40 Ko pour un composant que l'on
   écrit en un fichier.

   BUREAU SEULEMENT (> 767 px). Sur téléphone, conf-mobile.js DÉPLACE les nœuds
   réels : #main-add-to-cart, .rp-tq et .rp-multi-btn quittent le
   récapitulatif — lui-même masqué — pour la barre d'action ou la feuille
   montante. Une visite écrite pour la disposition de bureau y désignerait des
   éléments absents. Le parcours mobile aura sa propre visite, avec ses cibles.

   Le CSS est injecté ici plutôt que déclaré dans conf-styles.css : un seul
   fichier à déployer pour toute évolution, et la feuille partagée de 170 Ko
   n'est pas touchée. Même choix que conf-alert.js. */
(function () {
  'use strict';

  /* Garde d'injection unique, comme conf-alert.js et conf-debug.js : le script
     pourrait être inclus deux fois (layout + section) sans qu'on s'en aperçoive,
     et deux moteurs concurrents poseraient deux voiles. */
  if (window.confTour) return;

  var log = window.confLog || function () {};

  /* Même seuil que conf-mobile.js, au pixel près. Deux seuils voisins mais
     distincts créeraient une bande de largeurs où la visite se lancerait sur
     une interface déjà réorganisée. */
  var MQ_MOBILE = window.matchMedia('(max-width: 767px)');

  var CLE_VU = 'conf_tour_vu_v1';

  var MARGE = 12;   // écart entre la bulle et sa cible (laisse vivre la flèche)
  var BORD  = 10;   // marge minimale au bord de la fenêtre

  /* ────────────────────────────────────────────────────────────────────────
     STYLE

     Reprend les jetons de conf-alert.js : même arrondi, même ombre, même
     courbe d'entrée. Les deux composants doivent se reconnaître — ce sont les
     deux seules surfaces flottantes que le client rencontre.

     z-index juste SOUS conf-alert (2147483000) : si une vraie alerte survient
     pendant une visite — une erreur réseau, un panier plein — elle doit passer
     devant. Une explication n'a jamais la priorité sur un incident.
     ──────────────────────────────────────────────────────────────────────── */
  var CSS = ''
    /* Le voile n'est PAS un élément : c'est l'ombre portée du « trou »
       (voir .ct-trou). Un élément de plus aurait doublé la surface à repeindre
       à chaque déplacement. */
    + '.ct-trou{position:fixed;z-index:2147482998;pointer-events:none;border-radius:10px;'
    /* PLUS SOMBRE QUE conf-alert.js (.55) — à dessein.

       Une alerte est un carré au centre d'un écran figé : le voile n'a qu'à
       signaler que l'arrière-plan attend. Ici, le client doit repérer UN
       élément parmi des dizaines, sur une interface dense. À .55 le
       configurateur restait trop lisible et la cible ne ressortait pas
       franchement du lot.

       .72 fait reculer le fond sans l'effacer : le client garde ses repères —
       il voit où se trouve la commande expliquée — mais son œil va d'abord au
       trou. */
    /* Deux ombres en une : le liseré clair détache la cible du voile, comme
       un passe-partout autour d'une photo. Sans lui, un élément sombre —
       un bouton noir, un sweat noir — se fondait dans l'ombre et le trou ne
       se voyait plus. */
    + 'box-shadow:0 0 0 3px rgba(255,255,255,.92),0 0 0 9999px rgba(20,20,25,.72);'
    + 'transition:top .22s cubic-bezier(.34,1.56,.64,1),left .22s cubic-bezier(.34,1.56,.64,1),'
    + 'width .22s cubic-bezier(.34,1.56,.64,1),height .22s cubic-bezier(.34,1.56,.64,1);}'

    /* Bulle centrée : aucune cible (accueil, clôture). Le voile est alors plein,
       sans percement — d'où un trou de taille nulle posé hors écran. */
    /* Bulle centrée (accueil, clôture) : pas de cible, donc pas de trou — mais
       le voile doit rester. On centre un rectangle de taille nulle plutôt que
       de l'exiler hors écran : à -9999px, l'ombre de 9999px ne couvrait plus
       le côté opposé et une bande de l'interface restait en clair.
       Sans liseré ici : il dessinerait un point blanc au milieu de l'écran. */
    + '.ct-trou.ct-trou-vide{top:50%;left:50%;width:0;height:0;'
    + 'box-shadow:0 0 0 9999px rgba(20,20,25,.72);}'

    /* LA BULLE.

       Un peu plus large que la modale d'alerte (340 contre 328) et surtout
       plus aérée : une alerte tient en une phrase, une explication en trois ou
       quatre lignes. L'arrondi monte à 18 px — sur une surface de cette taille,
       16 px paraissait sec.

       L'ombre est DOUBLE : une ombre portée large pour le relief, plus un
       liseré très fin pour détacher le blanc du voile sombre. Sans ce liseré,
       le bord de la bulle se dissolvait dans le gris. */
    + '.ct-bulle{position:fixed;z-index:2147482999;box-sizing:border-box;'
    + 'width:340px;max-width:calc(100vw - 20px);background:#fff;border-radius:18px;'
    + 'box-shadow:0 1px 0 rgba(255,255,255,.6) inset,0 20px 56px rgba(0,0,0,.34),'
    + '0 0 0 1px rgba(0,0,0,.06);'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
    + 'opacity:0;transform:scale(.96) translateY(6px);'
    + 'transition:opacity .16s ease,transform .24s cubic-bezier(.34,1.56,.64,1);}'
    + '.ct-bulle.ct-show{opacity:1;transform:scale(1) translateY(0);}'
    + '.ct-bulle:focus{outline:none;}'

    /* Carré pivoté : la pointe est la moitié d'un losange, le reste passe sous
       la bulle. Le liseré de la bulle est repris sur deux côtés seulement —
       ceux qui dépassent — sans quoi une diagonale traverserait la pointe. */
    + '.ct-fleche{position:absolute;width:14px;height:14px;background:#fff;'
    + 'transform:rotate(45deg);border-radius:3px;z-index:-1;}'
    + '.ct-bulle.ct-centree .ct-fleche{display:none;}'

    /* ── En-tête : progression à gauche, sortie à droite ──
       Les deux sont de même nature — des repères, pas des actions sur le
       contenu — et tiennent donc sur une seule ligne, au-dessus du titre. */
    + '.ct-tete{display:flex;align-items:center;justify-content:space-between;'
    + 'gap:12px;padding:16px 18px 0;}'

    /* PROGRESSION EN POINTS plutôt qu'en chiffres.

       « Étape 3 sur 11 » se lit, se compte, et décourage : le client évalue ce
       qui lui reste avant d'avoir commencé. Des points se perçoivent d'un coup
       d'œil, sans arithmétique — il voit qu'il avance, c'est tout ce qui
       importe. Le libellé chiffré reste porté par `aria-label`, pour les
       lecteurs d'écran qui, eux, ne voient pas les points. */
    + '.ct-points{display:flex;align-items:center;gap:5px;}'
    + '.ct-point{width:6px;height:6px;border-radius:50%;background:#dcdcdc;'
    + 'transition:background .2s ease,width .2s ease;}'
    + '.ct-point.on{background:#1a1a1a;}'
    /* Le point courant s'allonge en pilule : la position se lit sans compter. */
    + '.ct-point.ct-point-actif{width:18px;border-radius:3px;background:#1a1a1a;}'

    /* Croix de sortie, en haut à droite — la place qu'on lui cherche
       d'instinct. Elle remplace le « Passer » textuel qui occupait la barre
       d'actions et pesait autant que « Suivant ». */
    + '.ct-fermer{border:none;background:none;cursor:pointer;padding:4px;'
    + 'margin:-4px -4px -4px 0;line-height:0;color:#b0b0b0;border-radius:8px;'
    + 'transition:color .15s,background .15s;}'
    + '.ct-fermer:hover{color:#1a1a1a;background:#f2f2f2;}'
    + '.ct-fermer svg{width:15px;height:15px;display:block;}'

    + '.ct-corps{padding:10px 18px 0;}'
    + '.ct-titre{font-size:17px;font-weight:800;color:#111;margin:0 0 7px;'
    + 'line-height:1.28;letter-spacing:-.01em;}'
    + '.ct-texte{font-size:13.5px;color:#5a5a5a;line-height:1.55;margin:0;}'

    /* ── Pied : séparé du texte par un filet, comme le récapitulatif sépare
       le prix du reste. La barre d'actions devient une zone à part entière,
       et le regard ne confond plus le texte avec les commandes. ── */
    + '.ct-actions{display:flex;align-items:center;gap:8px;'
    + 'margin-top:16px;padding:13px 18px;border-top:1px solid #f0f0f0;}'
    + '.ct-btn{border:none;border-radius:10px;font-size:13px;font-weight:700;'
    + 'cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;'
    + 'gap:6px;transition:background .15s,color .15s,opacity .15s;}'
    + '.ct-btn:active{transform:scale(.97);}'
    + '.ct-primaire{background:#1a1a1a;color:#fff;margin-left:auto;padding:10px 18px;}'
    + '.ct-primaire:hover{background:#333;}'
    + '.ct-primaire svg{width:13px;height:13px;}'
    /* « Précédent » est une flèche seule : le mot n'apprend rien que la forme
       ne dise, et la barre respire. Son intitulé vit dans `aria-label`. */
    + '.ct-prec{background:#f4f4f4;color:#555;padding:10px 11px;}'
    + '.ct-prec:hover{background:#e8e8e8;color:#1a1a1a;}'
    + '.ct-prec svg{width:14px;height:14px;}'
    + '.ct-btn[disabled]{opacity:.35;cursor:default;pointer-events:none;}'

    /* ── PASTILLE D'AIDE FLOTTANTE, en bas à gauche ──

       Elle a quitté l'en-tête, où elle disputait la place au panier et à
       « Réinitialiser » dans une barre déjà dense. Sa nature est différente :
       ce n'est pas une action sur la commande, c'est un recours — disponible
       en permanence, sans jamais réclamer l'attention.

       En BAS À GAUCHE : le coin le plus calme de l'écran. À droite vivent le
       récapitulatif et le prix ; en bas à droite, la bulle de chat des autres
       pages. Ici, elle ne recouvre rien.

       z-index sous la visite elle-même : quand le voile tombe, la pastille
       doit passer derrière comme le reste de l'interface, sinon elle
       flotterait au-dessus d'une explication qui la désigne peut-être. */
    /* TOUT À GAUCHE, au pied du rail d'icônes.

       Le rail fait 76 px de large et ses onglets s'arrêtent en haut : le bas
       de cette colonne est vide, c'est l'endroit le plus calme de l'écran.
       La pastille s'y loge sans rien recouvrir, à l'aplomb des onglets — donc
       là où le regard cherche déjà les commandes de navigation.

       `left: 17px` centre la pastille de 42 px dans les 76 px du rail. */
    + '.ct-aide{position:fixed;left:17px;bottom:18px;z-index:2147482990;'
    + 'display:flex;align-items:center;gap:0;overflow:hidden;'
    + 'height:42px;padding:0;border:none;border-radius:21px;cursor:pointer;'
    + 'background:#1a1a1a;color:#fff;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
    + 'font-size:13px;font-weight:700;'
    + 'box-shadow:0 4px 16px rgba(0,0,0,.22);'
    + 'transition:box-shadow .2s ease,transform .2s ease,background .2s ease;}'
    + '.ct-aide:hover{background:#000;box-shadow:0 7px 22px rgba(0,0,0,.3);'
    + 'transform:translateY(-1px);}'
    + '.ct-aide:active{transform:translateY(0);}'
    /* L'icône occupe un carré fixe : c'est elle qui donne à la pastille sa
       forme ronde au repos. */
    + '.ct-aide-ico{flex:0 0 42px;height:42px;display:flex;align-items:center;'
    + 'justify-content:center;}'
    + '.ct-aide-ico svg{width:17px;height:17px;display:block;}'
    /* LE LIBELLÉ SE DÉPLIE AU SURVOL.

       Au repos, une simple pastille ronde — discrète, elle ne dispute rien à
       l'interface. Au survol, le mot apparaît : le client sait ce qu'il
       déclenche avant de cliquer, ce qu'une icône seule ne garantit jamais.
       `max-width` plutôt que `display` : seule une valeur animable donne le
       glissement, un `display` changerait d'un coup. */
    + '.ct-aide-txt{max-width:0;opacity:0;white-space:nowrap;'
    + 'transition:max-width .26s cubic-bezier(.34,1.3,.64,1),opacity .18s ease,'
    + 'padding-right .26s cubic-bezier(.34,1.3,.64,1);}'
    + '.ct-aide:hover .ct-aide-txt,.ct-aide:focus-visible .ct-aide-txt'
    + '{max-width:140px;opacity:1;padding-right:16px;}'
    /* Masquée pendant la visite : elle la relancerait depuis le début. */
    + '.ct-aide.ct-aide-off{opacity:0;pointer-events:none;transform:translateY(8px);}'

    /* Le bouton d'aide n'a pas de sens sur téléphone : la visite ne s'y lance
       pas, et un bouton sans effet serait trompeur. Masqué ici plutôt que dans
       conf-mobile.css (132 Ko, très sollicité) — le composant reste autonome. */
    + '@media (max-width:767px){.ct-aide{display:none !important;}}'

    /* En tablette le rail se resserre à 58 px (conf-tablet.css) : la pastille
       se recentre dessus, sinon elle mordrait d'un pixel sur le panneau. */
    + '@media (min-width:768px) and (max-width:1023px){.ct-aide{left:8px;}}'

    /* Le mouvement est un confort, pas un message : qui l'a désactivé au niveau
       du système ne doit pas le subir ici. */
    + '@media (prefers-reduced-motion:reduce){'
    + '.ct-bulle,.ct-trou{transition:none !important;}}';

  function injecterCSS() {
    if (document.getElementById('ct-style')) return;
    var s = document.createElement('style');
    s.id = 'ct-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ────────────────────────────────────────────────────────────────────────
     CONTEXTE — de quoi décider si une étape a du sens
     ──────────────────────────────────────────────────────────────────────── */
  function contexte() {
    var racine = document.querySelector('.conf-app-root');

    /* LA SOURCE VIVANTE D'ABORD, LA SESSION EN REPLI.

       On ne lisait que `sessionStorage`. Or cette clé n'est écrite qu'au
       CHANGEMENT de produit : un client arrivé directement sur les coins, ou
       dont la session a été vidée, y trouvait « sweatshirt » — et toutes les
       étapes d'options étaient écartées au filtrage, sans que rien ne le
       signale.

       `window.currentProductType` est la variable que le configurateur tient à
       jour en permanence (conf-main-inline.js). La session reste en repli : elle
       survit à un rechargement, là où la variable repart de zéro. */
    var produit = '';
    if (typeof window.currentProductType === 'string' && window.currentProductType) {
      produit = window.currentProductType;
    } else {
      try { produit = sessionStorage.getItem('conf_current_product') || 'sweatshirt'; }
      catch (e) { produit = 'sweatshirt'; }
    }

    return {
      produit: produit,
      /* Le textile est la seule famille qui porte des tailles : la répartition
         et les vues face/dos/manches n'ont de sens que là. */
      textile: produit === 'sweatshirt' || produit === 'tshirt' ||
               produit === 'tshirt_polyester',
      mode: racine ? (racine.getAttribute('data-mode') || '') : ''
    };
  }

  /* ────────────────────────────────────────────────────────────────────────
     LES ÉTAPES

     `cible` est une CHAÎNE, jamais un élément : `.recap` est réécrit en entier
     pour les coins, drapeaux et patchs (DynamicLayoutManager), et une
     référence capturée à la définition pointerait un nœud détaché. On résout
     au dernier moment, à chaque affichage.

     `si` dit la PERTINENCE (cette étape a-t-elle un sens pour ce produit ?),
     `avant` prépare l'écran pour rendre la cible VISIBLE. Deux choses
     distinctes : une étape peut être pertinente et demander une préparation.
     ──────────────────────────────────────────────────────────────────────── */
  function cliquerRail(panneau) {
    /* On SIMULE LE CLIC plutôt que d'appeler openPanel, qui n'est pas exposée
       (conf-sidebar-modern.js). Passer par le geste du client emprunte le
       chemin normal du code — mémorisation du panneau, bascule de l'item
       actif, mise au point du champ texte — au lieu d'en réimplémenter une
       partie, qui divergerait au premier correctif. */
    var item = document.querySelector('.icon-nav-item[data-panel="' + panneau + '"]');
    if (item && !item.classList.contains('active')) item.click();
    /* 260 ms : la largeur du panneau est animée (conf-sidebar-modern.css). Une
       bulle placée pendant la transition atterrit à côté de sa cible. */
    return 260;
  }

  var ETAPES = [
    {
      id: 'accueil',
      cible: null,
      titre: 'Bienvenue dans votre atelier',
      texte: 'Quelques secondes pour découvrir l’essentiel. ' +
             'Vous pouvez passer cette visite à tout moment, et la revoir ' +
             'plus tard avec le bouton « Aide ».'
    },
    {
      id: 'produits',
      cible: '.product-card.selected, .product-card',
      cote: 'droite',
      titre: 'Choisissez votre produit',
      texte: 'Sweatshirt, t-shirt, coins, drapeaux ou patchs. ' +
             'Chaque produit a ses propres options et son propre tarif.',
      avant: function () { return cliquerRail('panel-product'); }
    },
    {
      id: 'upload',
      cible: '.icon-nav-item[data-panel="panel-upload"]',
      cote: 'droite',
      titre: 'Votre design',
      texte: 'Importez votre visuel ici. Vous pourrez ensuite le déplacer et ' +
             'le redimensionner directement sur l’aperçu.'
    },
    {
      id: 'texte',
      cible: '#text-nav-item',
      cote: 'droite',
      titre: 'Ajouter du texte',
      texte: 'Police, couleur, taille : composez un texte et posez-le où vous ' +
             'le souhaitez sur le produit.'
    },
    {
      id: 'vues',
      cible: '.vtabs',
      cote: 'bas',
      titre: 'Face, dos et manches',
      texte: 'Chaque face se personnalise séparément. Un point orange signale ' +
             'les faces qui portent déjà un design.',
      si: function (c) { return c.textile; }
    },
    /* ── OPTIONS PROPRES À CHAQUE PRODUIT ──────────────────────────────────

       Ce sont les réglages qui ne se devinent pas — la finition d'un coin, les
       anneaux d'un drapeau, le type de fabrication d'un patch — et ils vivent
       dans un panneau que le client n'ouvre pas forcément de lui-même. D'où
       `avant`, qui l'ouvre pour lui.

       Chaque étape est liée à SON produit : les autres sont écartées au
       filtrage, sans laisser de trou dans la visite. */
    {
      id: 'coin-type',
      cible: '[data-tour="coin-type"]',
      cote: 'droite',
      titre: 'Une face ou deux ?',
      texte: 'Un coin peut être personnalisé au recto seul, ou sur ses deux ' +
             'faces. Vous pouvez aussi numéroter chaque pièce.',
      si: function (c) { return c.produit === 'coins'; },
      avant: function () { return cliquerRail('panel-coin'); }
    },
    {
      id: 'coin-finition',
      cible: '[data-tour="coin-finition"]',
      cote: 'droite',
      titre: 'La finition du métal',
      texte: 'Or, argent, bronze ou noir : c’est elle qui donne son caractère ' +
             'au coin. L’aperçu se met à jour à chaque choix.',
      si: function (c) { return c.produit === 'coins'; },
      /* Même panneau que l'étape précédente : ouvrir n'a d'effet que s'il
         est fermé, et le filtrage juge chaque étape isolément. */
      avant: function () { return cliquerRail('panel-coin'); }
    },
    {
      id: 'flag-impression',
      cible: '[data-tour="flag-impression"]',
      cote: 'droite',
      titre: 'Recto seul ou recto verso',
      texte: 'En recto verso, le design du dos est imprimé séparément — vous ' +
             'pouvez y mettre un visuel différent.',
      si: function (c) { return c.produit === 'drapeaux'; },
      avant: function () { return cliquerRail('panel-flag'); }
    },
    {
      id: 'flag-orientation',
      cible: '[data-tour="flag-orientation"]',
      cote: 'droite',
      titre: 'Paysage ou portrait',
      texte: 'L’orientation change la forme du drapeau et la zone imprimable. ' +
             'Choisissez-la avant d’importer votre visuel.',
      si: function (c) { return c.produit === 'drapeaux'; },
      /* Même panneau que l'étape précédente : ouvrir n'a d'effet que s'il
         est fermé, et le filtrage juge chaque étape isolément. */
      avant: function () { return cliquerRail('panel-flag'); }
    },
    {
      id: 'flag-anneaux',
      cible: '[data-tour="flag-anneaux"]',
      cote: 'droite',
      titre: 'La finition des bords',
      texte: 'Les anneaux servent à accrocher le drapeau. Sans eux, le bord ' +
             'reste simplement ourlé.',
      si: function (c) { return c.produit === 'drapeaux'; },
      /* Même panneau que l'étape précédente : ouvrir n'a d'effet que s'il
         est fermé, et le filtrage juge chaque étape isolément. */
      avant: function () { return cliquerRail('panel-flag'); }
    },
    {
      id: 'patch-forme',
      cible: '[data-tour="patch-forme"]',
      cote: 'droite',
      titre: 'La forme du patch',
      texte: 'Rond, carré, rectangle ou blason. Les tailles proposées suivent ' +
             'la forme choisie.',
      si: function (c) { return c.produit === 'patches'; },
      avant: function () { return cliquerRail('panel-patch'); }
    },
    {
      id: 'patch-fabrication',
      cible: '[data-tour="patch-fabrication"]',
      cote: 'droite',
      titre: 'Comment il est fabriqué',
      texte: 'Sublimé ou brodé, avec ou sans velcro : ces options décident du ' +
             'rendu final et du prix.',
      si: function (c) { return c.produit === 'patches'; },
      /* Même panneau que l'étape précédente : ouvrir n'a d'effet que s'il
         est fermé, et le filtrage juge chaque étape isolément. */
      avant: function () { return cliquerRail('panel-patch'); }
    },
    {
      id: 'apercu',
      cible: '#overview-btn',
      cote: 'bas',
      titre: 'Vue d’ensemble',
      texte: 'Toutes vos faces côte à côte, en grand. C’est ici que vous ' +
             'vérifiez votre création avant de commander.'
    },
    {
      id: 'couleur',
      cible: '#cv-color-btn',
      cote: 'bas',
      titre: 'Couleur et taille',
      texte: 'Changez la teinte du produit et la taille de référence sans ' +
             'quitter l’aperçu.'
    },
    {
      id: 'quantite',
      cible: '#rp-qty-textile',
      cote: 'gauche',
      titre: 'Votre quantité',
      texte: 'Réglez la taille et le nombre de pièces. Le prix unitaire baisse ' +
             'automatiquement à partir d’un certain volume.',
      si: function (c) { return c.textile; }
    },
    {
      id: 'repartition',
      cible: '.rp-multi-btn',
      cote: 'gauche',
      titre: 'Plusieurs tailles, une commande',
      texte: 'Besoin de 2 S, 5 M et 3 XL ? Répartissez vos pièces entre ' +
             'plusieurs tailles — le design, lui, reste le même.',
      si: function (c) { return c.textile; }
    },
    {
      id: 'panier',
      cible: '#main-add-to-cart',
      cote: 'gauche',
      titre: 'Ajouter au panier',
      texte: 'Votre article rejoint le panier. Vous pouvez en composer ' +
             'plusieurs avant de passer commande.'
    },
    {
      id: 'fin',
      cible: null,
      titre: 'À vous de jouer',
      texte: 'Vous savez l’essentiel. Cette visite reste accessible à tout ' +
             'moment avec le bouton « Aide », en haut de l’écran.'
    }
  ];

  /* ────────────────────────────────────────────────────────────────────────
     GARDE DE VISIBILITÉ
     ──────────────────────────────────────────────────────────────────────── */

  /* Une cible est utilisable si elle existe, occupe une surface, et n'est
     masquée ni par elle-même ni par un ancêtre.

     `offsetParent === null` attrape `display:none` à n'importe quel niveau —
     le test le plus large pour le moins cher. Il ne suffit pourtant pas : un
     élément en `visibility:hidden` garde un offsetParent, et les panneaux
     latéraux se ferment par une LARGEUR NULLE, pas par `display`.

     `position:fixed` fait exception — un tel élément n'a pas d'offsetParent
     tout en étant parfaitement visible. D'où le test conditionnel. */
  function cibleUtilisable(el) {
    if (!el) return false;
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (parseFloat(st.opacity) === 0) return false;
    if (st.position !== 'fixed' && el.offsetParent === null) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function resoudre(etape) {
    if (!etape.cible) return null;             // bulle centrée : pas de cible
    return document.querySelector(etape.cible);
  }

  /* ────────────────────────────────────────────────────────────────────────
     PLACEMENT

     Le patron de grpTogglePicker (conf-main-inline.js) étendu aux QUATRE
     côtés, avec ce qui lui manquait : le clamp dans la fenêtre.
     ──────────────────────────────────────────────────────────────────────── */
  function placer(bulle, r, prefere) {
    /* On mesure APRÈS avoir rendu la bulle mesurable mais avant de la montrer :
       un élément masqué a des dimensions nulles et tous les tests de place
       seraient faussés. C'est la précaution déjà prise par grpTogglePicker. */
    bulle.style.visibility = 'hidden';
    bulle.style.left = '0px';
    bulle.style.top = '0px';

    var bw = bulle.offsetWidth, bh = bulle.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;

    var place  = { bas: vh - r.bottom, haut: r.top, droite: vw - r.right, gauche: r.left };
    var besoin = { bas: bh, haut: bh, droite: bw, gauche: bw };

    /* La préférence de l'étape d'abord, puis les autres côtés par place
       décroissante. On ne prend pas « le premier qui rentre » : si aucun ne
       rentre, le plus spacieux donne le moins mauvais résultat. */
    var ordre = [prefere].concat(
      ['bas', 'haut', 'droite', 'gauche']
        .filter(function (c) { return c !== prefere; })
        .sort(function (a, b) { return place[b] - place[a]; })
    );

    var cote = ordre[0];
    for (var i = 0; i < ordre.length; i++) {
      if (place[ordre[i]] >= besoin[ordre[i]] + MARGE + BORD) { cote = ordre[i]; break; }
    }

    var x, y;
    if (cote === 'bas')         { y = r.bottom + MARGE;  x = r.left + r.width / 2 - bw / 2; }
    else if (cote === 'haut')   { y = r.top - bh - MARGE; x = r.left + r.width / 2 - bw / 2; }
    else if (cote === 'droite') { x = r.right + MARGE;   y = r.top + r.height / 2 - bh / 2; }
    else                        { x = r.left - bw - MARGE; y = r.top + r.height / 2 - bh / 2; }

    /* CLAMP — ce qui manquait à grpTogglePicker. Une cible collée au bord (le
       rail à gauche, le panier en haut à droite) poussait la bulle à moitié
       hors de la fenêtre, texte coupé. On la ramène dans le cadre ; la flèche,
       elle, reste sur la cible — voir placerFleche. */
    x = Math.max(BORD, Math.min(x, vw - bw - BORD));
    y = Math.max(BORD, Math.min(y, vh - bh - BORD));

    bulle.style.left = Math.round(x) + 'px';
    bulle.style.top  = Math.round(y) + 'px';
    bulle.style.visibility = '';

    return { cote: cote, x: x, y: y, bw: bw, bh: bh };
  }

  /* La flèche vise le CENTRE DE LA CIBLE, pas celui de la bulle : après un
     clamp les deux ne coïncident plus, et une flèche centrée sur la bulle
     désignerait l'élément voisin. Bornée à 16 px des extrémités pour rester
     sur le bord droit et non sur l'arrondi (border-radius: 16px). */
  function placerFleche(fleche, pos, r) {
    var vertical = (pos.cote === 'haut' || pos.cote === 'bas');
    if (vertical) {
      var cx = r.left + r.width / 2 - pos.x;
      cx = Math.max(16, Math.min(cx, pos.bw - 16));
      fleche.style.left = (cx - 7) + 'px';
      fleche.style.top  = (pos.cote === 'bas') ? '-6px' : (pos.bh - 8) + 'px';
    } else {
      var cy = r.top + r.height / 2 - pos.y;
      cy = Math.max(16, Math.min(cy, pos.bh - 16));
      fleche.style.top  = (cy - 7) + 'px';
      fleche.style.left = (pos.cote === 'droite') ? '-6px' : (pos.bw - 8) + 'px';
    }
  }

  /* Ramène la cible dans son conteneur défilant.

     Le configurateur n'a AUCUN défilement de page : `.conf-app-root` est en
     `overflow:hidden` et chaque colonne défile pour son compte (.recap,
     .side-panel). Une cible peut donc être hors vue alors même que
     `offsetParent` est non nul et que son rectangle a une largeur — la bulle
     se poserait au bon endroit, sur un élément que le client ne voit pas.

     `behavior:'auto'` : on évite d'attendre une animation dont la durée n'est
     pas connue. La boucle de suivi rattrape de toute façon. */
  function amenerEnVue(el) {
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); }
    catch (e) { try { el.scrollIntoView(false); } catch (e2) {} }
  }

  /* ────────────────────────────────────────────────────────────────────────
     ÉTAT ET MOTEUR
     ──────────────────────────────────────────────────────────────────────── */
  var etat = {
    actif: false,
    etapes: [],
    index: 0,
    bulle: null,
    trou: null,
    fleche: null,
    nettoyage: [],     // fonctions à rappeler à l'arrêt (voir stop)
    rafId: 0,
    dernierRect: '',
    focusAvant: null,
    panneauAvant: null,
    defilements: []    // {el, top} — restaurés à l'arrêt
  };

  function construire() {
    var trou = document.createElement('div');
    trou.className = 'ct-trou ct-trou-vide';

    var bulle = document.createElement('div');
    bulle.className = 'ct-bulle';
    bulle.setAttribute('role', 'dialog');
    bulle.setAttribute('aria-modal', 'true');
    bulle.setAttribute('aria-labelledby', 'ct-titre');
    bulle.setAttribute('aria-describedby', 'ct-texte');
    bulle.tabIndex = -1;

    /* Construit par createElement et non par innerHTML : les textes des étapes
       sont écrits ici, mais un jour ils viendront peut-être d'ailleurs, et un
       gabarit HTML aurait alors ouvert une porte pour rien.

       Aucun `onclick` dans le balisage : conf-a11y.js parcourt le DOM à la
       recherche des `[onclick]` pour les rendre accessibles au clavier. Nos
       boutons sont natifs et leurs gestionnaires posés par addEventListener —
       il n'a rien à y faire. */
    var fleche = document.createElement('div');
    fleche.className = 'ct-fleche';

    /* ── En-tête : progression à gauche, sortie à droite ── */
    var tete = document.createElement('div');
    tete.className = 'ct-tete';

    var points = document.createElement('div');
    points.className = 'ct-points';
    /* Les points portent la progression pour l'œil ; `aria-label`, réécrit à
       chaque étape, la porte pour les lecteurs d'écran — qui ne voient pas les
       points et liraient sinon une rangée de div vides. */
    points.setAttribute('role', 'img');

    var bFermer = document.createElement('button');
    bFermer.type = 'button';
    bFermer.className = 'ct-fermer';
    bFermer.setAttribute('aria-label', 'Quitter la visite guidée');
    bFermer.appendChild(svg('M18 6 6 18M6 6l12 12', 2.2));

    tete.appendChild(points);
    tete.appendChild(bFermer);

    /* ── Corps ── */
    var corps = document.createElement('div');
    corps.className = 'ct-corps';

    var titre = document.createElement('h2');
    titre.className = 'ct-titre';
    titre.id = 'ct-titre';

    var texte = document.createElement('p');
    texte.className = 'ct-texte';
    texte.id = 'ct-texte';

    corps.appendChild(titre);
    corps.appendChild(texte);

    /* ── Pied ── */
    var actions = document.createElement('div');
    actions.className = 'ct-actions';

    var bPrec = document.createElement('button');
    bPrec.type = 'button';
    bPrec.className = 'ct-btn ct-prec';
    bPrec.setAttribute('aria-label', 'Étape précédente');
    bPrec.appendChild(svg('M15 18l-6-6 6-6', 2.4));

    var bSuiv = document.createElement('button');
    bSuiv.type = 'button';
    bSuiv.className = 'ct-btn ct-primaire';
    var libSuiv = document.createElement('span');
    bSuiv.appendChild(libSuiv);
    bSuiv.appendChild(svg('M9 18l6-6-6-6', 2.4));

    actions.appendChild(bPrec);
    actions.appendChild(bSuiv);

    bulle.appendChild(fleche);
    bulle.appendChild(tete);
    bulle.appendChild(corps);
    bulle.appendChild(actions);

    document.body.appendChild(trou);
    document.body.appendChild(bulle);

    bFermer.addEventListener('click', function () { stop(); });
    bPrec.addEventListener('click', function () { aller(etat.index - 1); });
    bSuiv.addEventListener('click', function () { aller(etat.index + 1); });

    etat.trou = trou;
    etat.bulle = bulle;
    etat.fleche = fleche;
    etat.els = { points: points, titre: titre, texte: texte,
                 prec: bPrec, suiv: bSuiv, libSuiv: libSuiv };
  }

  /* Fabrique une icône au trait, au format des SVG du projet. Le tracé et
     l'épaisseur suffisent à les distinguer — tout le reste est commun. */
  function svg(d, epaisseur) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', String(epaisseur || 2));
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }

  /* Redessine la rangée de points. Reconstruite à chaque étape plutôt que
     mémorisée : le nombre d'étapes ne change pas en cours de visite, mais le
     coût est nul et cela évite un second état à tenir d'accord. */
  function rendrePoints(i, total) {
    var hote = etat.els.points;
    hote.textContent = '';
    for (var n = 0; n < total; n++) {
      var pt = document.createElement('span');
      pt.className = 'ct-point' + (n < i ? ' on' : '') + (n === i ? ' ct-point-actif' : '');
      hote.appendChild(pt);
    }
    hote.setAttribute('aria-label', 'Étape ' + (i + 1) + ' sur ' + total);
  }

  /* Affiche l'étape `i`. `sens` (+1 / -1) sert à continuer dans la même
     direction quand une cible a disparu entre le filtrage et l'affichage. */
  function aller(i, sens) {
    if (!etat.actif) return;
    sens = sens || (i >= etat.index ? 1 : -1);

    if (i < 0) return;
    if (i >= etat.etapes.length) { stop(); return; }

    var etape = etat.etapes[i];
    var el = resoudre(etape);

    /* FILTRAGE TARDIF. Entre le filtrage initial et cet instant, quelques
       secondes ont passé : un panneau s'est fermé, `.recap` a été réécrit. On
       revérifie, et on continue dans le même sens plutôt que d'abandonner —
       abandonner laisserait le client devant un voile sans explication. */
    if (etape.cible && !cibleUtilisable(el)) {
      log('[tour] étape « ' + etape.id + ' » écartée : cible absente');
      aller(i + sens, sens);
      return;
    }

    etat.index = i;

    /* Préparation de l'écran (ouvrir un panneau). Elle rend une attente : la
       largeur du panneau est animée, mesurer trop tôt placerait la bulle sur
       la position d'avant l'ouverture. */
    var attente = 0;
    if (typeof etape.avant === 'function') {
      try { attente = etape.avant() || 0; } catch (e) { attente = 0; }
    }

    setTimeout(function () {
      if (!etat.actif) return;
      rendre(etape, i);
    }, attente);
  }

  function rendre(etape, i) {
    var e = etat.els;
    rendrePoints(i, etat.etapes.length);
    e.titre.textContent = etape.titre;
    e.texte.textContent = etape.texte;

    e.prec.disabled = (i === 0);
    e.libSuiv.textContent = (i === etat.etapes.length - 1) ? 'Terminer' : 'Suivant';

    var el = resoudre(etape);
    if (el) amenerEnVue(el);

    etat.bulle.classList.toggle('ct-centree', !el);
    positionner(etape);

    etat.bulle.classList.add('ct-show');
    /* Le focus va sur la bulle à chaque étape : elle porte `role="dialog"`,
       un lecteur d'écran l'annonce donc entièrement — titre et texte compris.
       Un `aria-live` en plus provoquerait une double lecture. */
    etat.bulle.focus();
  }

  /* Pose le trou et la bulle d'après la géométrie du moment. Appelée au rendu
     puis par la boucle de suivi. */
  function positionner(etape) {
    var el = resoudre(etape);

    if (!el) {
      /* Bulle centrée : le voile reste plein, sans percement.

         Les styles INLINE posés par l'étape précédente sont effacés, sinon ils
         l'emporteraient sur la classe `ct-trou-vide` — revenir en arrière
         jusqu'à l'accueil laisserait un trou béant sur la dernière cible
         visitée. */
      etat.trou.className = 'ct-trou ct-trou-vide';
      etat.trou.style.left = '';
      etat.trou.style.top = '';
      etat.trou.style.width = '';
      etat.trou.style.height = '';
      var bw = etat.bulle.offsetWidth, bh = etat.bulle.offsetHeight;
      etat.bulle.style.left = Math.round((window.innerWidth - bw) / 2) + 'px';
      etat.bulle.style.top  = Math.round((window.innerHeight - bh) / 2) + 'px';
      return;
    }

    var r = el.getBoundingClientRect();
    var pad = 6;   // le halo respire un peu autour de la cible

    etat.trou.className = 'ct-trou';
    etat.trou.style.left   = (r.left - pad) + 'px';
    etat.trou.style.top    = (r.top - pad) + 'px';
    etat.trou.style.width  = (r.width + pad * 2) + 'px';
    etat.trou.style.height = (r.height + pad * 2) + 'px';

    var pos = placer(etat.bulle, r, etape.cote || 'bas');
    placerFleche(etat.fleche, pos, r);
  }

  /* Suivi continu de la cible.

     Le rectangle bouge sans qu'aucun événement ne le dise : `.recap` est
     réécrit pour les coins/drapeaux/patchs, les panneaux s'ouvrent avec une
     transition de largeur, les images du produit arrivent et redimensionnent
     l'aperçu. Plutôt que d'écouter dix signaux différents — et d'en oublier au
     prochain ajout — on compare le rectangle à chaque frame et on ne
     repositionne qu'en cas de changement réel. */
  function suivre() {
    if (!etat.actif) return;
    var etape = etat.etapes[etat.index];
    if (etape) {
      var el = resoudre(etape);
      var cle = el ? JSON.stringify(el.getBoundingClientRect()) : 'centree';
      if (cle !== etat.dernierRect) {
        etat.dernierRect = cle;
        positionner(etape);
      }
    }
    etat.rafId = requestAnimationFrame(suivre);
  }

  /* ────────────────────────────────────────────────────────────────────────
     CLAVIER

     Le focus est PIÉGÉ dans la bulle : sans cela, la tabulation continuerait
     dans l'interface derrière le voile, et un lecteur d'écran annoncerait des
     commandes que le client ne peut pas actionner — le voile intercepte tout.

     Piège maison plutôt que `inert` sur le reste de la page : il faudrait le
     poser sur tous les frères puis le retirer exactement, et une erreur
     laisserait une partie du configurateur définitivement inutilisable. Ici il
     n'y a rien à restaurer.
     ──────────────────────────────────────────────────────────────────────── */
  function surTouche(ev) {
    if (!etat.actif) return;

    if (ev.key === 'Escape') { ev.preventDefault(); stop(); return; }

    /* Les QUATRE flèches avancent ou reculent : la bulle change de côté d'une
       étape à l'autre selon la place disponible, « suivant » n'a donc pas
       d'orientation naturelle. */
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
      ev.preventDefault(); aller(etat.index + 1); return;
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
      ev.preventDefault(); aller(etat.index - 1); return;
    }

    if (ev.key === 'Tab') {
      var focusables = etat.bulle.querySelectorAll('button:not([disabled])');
      if (!focusables.length) return;
      var premier = focusables[0];
      var dernier = focusables[focusables.length - 1];
      var actif = document.activeElement;

      if (ev.shiftKey && (actif === premier || actif === etat.bulle)) {
        ev.preventDefault(); dernier.focus();
      } else if (!ev.shiftKey && actif === dernier) {
        ev.preventDefault(); premier.focus();
      } else if (actif === etat.bulle) {
        ev.preventDefault(); premier.focus();
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
     DÉMARRAGE ET ARRÊT
     ──────────────────────────────────────────────────────────────────────── */
  function start(opts) {
    opts = opts || {};

    /* BUREAU SEULEMENT — décision explicite, pas un oubli. Voir l'en-tête. */
    if (MQ_MOBILE.matches) {
      log('[tour] non lancé : écran mobile');
      return;
    }

    /* Cliquer sur « Aide » pendant une visite la reprend au début plutôt que
       de ne rien faire : c'est le geste d'un client perdu, le silence
       confirmerait qu'il l'est. */
    if (etat.actif) { aller(0); return; }

    var ctx = contexte();

    /* FILTRAGE EN AMONT, avant d'afficher quoi que ce soit : on veut savoir
       tout de suite si la visite vaut la peine d'être lancée. */
    var retenues = ETAPES.filter(function (etape) {
      if (typeof etape.si === 'function' && !etape.si(ctx)) return false;
      if (!etape.cible) return true;                  // accueil / clôture

      /* UNE ÉTAPE QUI SAIT S'OUVRIR SON ÉCRAN N'EST PAS JUGÉE SUR L'INSTANT.

         Le filtrage vérifie que la cible est visible. C'est juste pour une
         commande posée à demeure — le rail, les onglets de vue — mais faux
         pour une section qui vit dans un panneau latéral fermé : elle était
         écartée AVANT que `avant` ait pu l'ouvrir.

         Toutes les étapes d'options tombaient ainsi, et la visite ne parlait
         jamais des réglages propres au coin, au drapeau ou au patch — ceux-là
         mêmes qui ne se devinent pas.

         Leur présence dans le DOM suffit donc ici. La garde de visibilité
         reste appliquée au moment de l'affichage (`aller`), une fois le
         panneau ouvert : une étape dont la cible manque vraiment est alors
         sautée sans laisser de trou. */
      var el = document.querySelector(etape.cible);
      if (typeof etape.avant === 'function') return !!el;

      return cibleUtilisable(el);
    });

    /* Une visite de deux bulles n'apprend rien et donne l'impression d'un
       défaut. Les cibles manquantes signalent le plus souvent un DOM pas
       encore bâti, pas une configuration légitime : mieux vaut ne pas lancer
       et retenter à la visite suivante.

       On n'écrit donc PAS la marque « déjà vue » dans ce cas — sans quoi un
       démarrage prématuré brûlerait définitivement la visite du client. */
    if (retenues.length < 3) {
      log('[tour] abandon : ' + retenues.length + ' étape(s) retenue(s)');
      return;
    }

    injecterCSS();

    etat.actif = true;
    etat.etapes = retenues;
    etat.index = 0;
    etat.dernierRect = '';

    /* Mémorisé pour être rendu à l'arrêt : la visite ne doit laisser aucune
       trace. Le panneau ouvert au départ, le focus, les défilements. */
    etat.focusAvant = document.activeElement;
    var ouvert = document.querySelector('.icon-nav-item.active');
    etat.panneauAvant = ouvert ? ouvert.getAttribute('data-panel') : null;
    etat.defilements = [];
    document.querySelectorAll('.recap, .side-panel.open').forEach(function (c) {
      etat.defilements.push({ el: c, top: c.scrollTop });
    });

    construire();
    aideVisible(false);

    document.addEventListener('keydown', surTouche, true);
    etat.nettoyage.push(function () {
      document.removeEventListener('keydown', surTouche, true);
    });

    /* `scroll` en CAPTURE : les événements de défilement ne bouillonnent pas,
       seule la capture voit ceux des conteneurs internes — et c'est là que
       défilent le récapitulatif et les panneaux. */
    var surBouge = function () { etat.dernierRect = ''; };
    document.addEventListener('scroll', surBouge, { capture: true, passive: true });
    window.addEventListener('resize', surBouge);
    etat.nettoyage.push(function () {
      document.removeEventListener('scroll', surBouge, true);
      window.removeEventListener('resize', surBouge);
    });

    /* La fenêtre passe sous 768 px : conf-mobile.js y redéplace les nœuds, la
       bulle pointerait le vide. On arrête plutôt que de montrer faux. */
    var surMQ = function (e) { if (e.matches) { log('[tour] arrêt : passage en mobile'); stop(); } };
    if (MQ_MOBILE.addEventListener) MQ_MOBILE.addEventListener('change', surMQ);
    else if (MQ_MOBILE.addListener) MQ_MOBILE.addListener(surMQ);
    etat.nettoyage.push(function () {
      if (MQ_MOBILE.removeEventListener) MQ_MOBILE.removeEventListener('change', surMQ);
      else if (MQ_MOBILE.removeListener) MQ_MOBILE.removeListener(surMQ);
    });

    /* La marque est posée DÈS LA PREMIÈRE BULLE, pas à la fin : un client qui
       ferme l'onglet au milieu n'en veut manifestement pas, et la relancer à
       chaque visite serait du harcèlement. Le bouton « Aide » reste là pour
       la reprendre. Un lancement manuel n'écrit rien — la marque y est déjà. */
    if (!opts.manuel) marquerVu();

    /* Reflow forcé avant d'ajouter la classe d'entrée, sans quoi la transition
       ne se joue pas — le navigateur regrouperait les deux styles. Même
       mécanique que conf-alert.js. */
    void etat.bulle.offsetWidth;

    aller(0);
    etat.rafId = requestAnimationFrame(suivre);

    log('[tour] démarré, ' + retenues.length + ' étapes');
  }

  function stop() {
    if (!etat.actif) return;
    etat.actif = false;

    if (etat.rafId) cancelAnimationFrame(etat.rafId);
    etat.rafId = 0;

    /* Tous les écouteurs partent ensemble. Un écouteur clavier survivant ferait
       réagir Échap et les flèches dans le configurateur, longtemps après. */
    etat.nettoyage.forEach(function (f) { try { f(); } catch (e) {} });
    etat.nettoyage = [];

    var bulle = etat.bulle, trou = etat.trou;
    if (bulle) bulle.classList.remove('ct-show');
    /* Retrait différé : la disparition est animée, arracher le nœud tout de
       suite la couperait net. Même délai que conf-alert.js. */
    setTimeout(function () {
      if (bulle && bulle.parentNode) bulle.parentNode.removeChild(bulle);
      if (trou && trou.parentNode) trou.parentNode.removeChild(trou);
    }, 200);
    etat.bulle = etat.trou = etat.fleche = null;

    aideVisible(true);

    /* AUCUNE TRACE — on rend l'écran tel qu'on l'a trouvé. */
    etat.defilements.forEach(function (d) {
      try { if (d.el && d.el.isConnected) d.el.scrollTop = d.top; } catch (e) {}
    });
    etat.defilements = [];

    if (etat.panneauAvant) {
      var item = document.querySelector('.icon-nav-item[data-panel="' + etat.panneauAvant + '"]');
      if (item && !item.classList.contains('active')) item.click();
      etat.panneauAvant = null;
    }

    /* Le focus retombe sur <body> si on ne le replace pas, et la navigation
       clavier repart de zéro pour le client. */
    try {
      if (etat.focusAvant && etat.focusAvant.isConnected &&
          typeof etat.focusAvant.focus === 'function') {
        etat.focusAvant.focus();
      }
    } catch (e) {}
    etat.focusAvant = null;

    log('[tour] arrêté');
  }

  /* ────────────────────────────────────────────────────────────────────────
     PERSISTANCE

     localStorage et non sessionStorage : une visite qui se relance à chaque
     nouvel onglet serait une nuisance.

     C'est la première clé réellement DURABLE du projet — localStorage n'y
     portait jusqu'ici que des jetons éphémères. Et c'est aussi ce qui la
     protège : la réinitialisation du configurateur ne balaie que
     sessionStorage, la marque y échappe donc naturellement. Ce qui est juste :
     « Réinitialiser » efface un DESIGN, pas le souvenir des explications lues.

     Le suffixe `_v1` permettra de tout rejouer après une refonte des étapes —
     remettre l'ancienne clé à zéro demanderait sinon de l'effacer chez chaque
     client.

     try/catch : le stockage lève en navigation privée sur certains
     navigateurs, et le projet l'entoure partout. Un échec de lecture vaut
     « jamais vue » — au pire la visite se lance deux fois, plutôt que jamais.
     ──────────────────────────────────────────────────────────────────────── */
  function dejaVu() {
    try { return localStorage.getItem(CLE_VU) === '1'; } catch (e) { return false; }
  }
  function marquerVu() {
    try { localStorage.setItem(CLE_VU, '1'); } catch (e) {}
  }
  function oublier() {
    try { localStorage.removeItem(CLE_VU); } catch (e) {}
  }

  /* ────────────────────────────────────────────────────────────────────────
     DÉMARRAGE AUTOMATIQUE
     ──────────────────────────────────────────────────────────────────────── */

  /* L'interface est prête quand les repères structurels du parcours sont là :
     le rail à gauche, l'aperçu au centre, le récapitulatif à droite. Trois
     éléments, trois colonnes — si les trois répondent, le squelette est monté. */
  function interfacePrete() {
    return !!(document.querySelector('.icon-nav .icon-nav-item') &&
              document.querySelector('.recap') &&
              document.querySelector('.product-card'));
  }

  /* Un overlay déjà ouvert interdit le démarrage : la visite s'afficherait
     par-dessus une modale que le client vient d'ouvrir, en décrivant une
     interface qu'il ne voit plus. On repassera au sondage suivant. */
  function overlayOuvert() {
    return !!document.querySelector(
      '.size-qty-overlay.open, .ov-overlay.open, #cart-drawer.open, .ca-overlay'
    );
  }

  /* QUAND LANCER — un délai fixe n'aurait pas tenu.

     Le DOM est bâti par une quarantaine de scripts `defer`, puis par
     conf-main-inline.js, chargé plus tard encore depuis la section : c'est lui
     qui pose le mode et restaure le produit. conf-sidebar-modern.js ouvre
     ensuite le panneau Produit. Aucun de ces travaux n'émet de signal de fin —
     le seul événement personnalisé du projet, `conf:prices-loaded`, concerne
     la grille tarifaire et peut ne JAMAIS arriver si l'API est injoignable.
     S'y accrocher condamnerait la visite un jour de panne réseau.

     On attend donc ce qui nous intéresse vraiment : que les cibles soient là.
     Sondage toutes les 150 ms, plancher de 600 ms — le temps que l'ouverture
     animée du panneau latéral se pose, une bulle placée pendant une transition
     atterrissant à côté — et abandon au bout de 8 s. */
  function attendreInterface(cb) {
    var debut = Date.now();
    (function sonder() {
      var ecoule = Date.now() - debut;
      if (ecoule > 8000) { log('[tour] interface non stabilisée en 8 s, abandon'); return; }
      if (ecoule >= 600 && interfacePrete() && !overlayOuvert()) {
        /* Deux rAF : le premier laisse appliquer les styles posés à l'instant,
           le second garantit qu'ils sont peints. Mesurer entre les deux
           donnerait des rectangles d'avant mise en page. */
        requestAnimationFrame(function () { requestAnimationFrame(cb); });
        return;
      }
      setTimeout(sonder, 150);
    })();
  }

  /* ÉCRAN DE CHOIX : on patiente.

     `data-etape="choix"` est posé dès le rendu serveur et retiré dès qu'un
     mode est mémorisé. Tant qu'il est là, le configurateur est entièrement
     recouvert : une visite lancée à cet instant décrirait des commandes
     invisibles.

     Aucun événement n'annonce le choix du mode — `choisirMode` se contente de
     manipuler l'attribut. On l'observe donc, à l'image de conf-mobile.js et
     conf-a11y.js. L'observateur se débranche dès qu'il a servi. */
  function quandEcranPret(cb) {
    var racine = document.querySelector('.conf-app-root');
    if (!racine) return;

    if (racine.getAttribute('data-etape') !== 'choix') { cb(); return; }

    var obs = new MutationObserver(function () {
      if (racine.getAttribute('data-etape') !== 'choix') {
        obs.disconnect();
        /* Choisir un mode reconstruit une partie de l'interface : on lui laisse
           un tour d'horloge avant de mesurer quoi que ce soit. */
        setTimeout(cb, 800);
      }
    });
    obs.observe(racine, { attributes: true, attributeFilter: ['data-etape'] });
  }

  /* ────────────────────────────────────────────────────────────────────────
     LA PASTILLE D'AIDE

     Créée ici et non dans le gabarit : le bouton et la visite vivent dans le
     même fichier, et le jour où l'un disparaît l'autre le suit. Un bouton
     orphelin dans configurateur.liquid, pointant une fonction absente, serait
     cliquable sans effet.
     ──────────────────────────────────────────────────────────────────────── */
  function poserAide() {
    if (MQ_MOBILE.matches) return;              // la visite ne s'y lance pas
    if (document.getElementById('ct-aide')) return;
    if (!document.querySelector('.conf-app-root')) return;

    injecterCSS();

    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'ct-aide';
    b.className = 'ct-aide';
    b.setAttribute('aria-label', 'Revoir la visite guidée du configurateur');

    var ico = document.createElement('span');
    ico.className = 'ct-aide-ico';
    /* Point d'interrogation au trait, du même jeu que les autres icônes :
       un cercle, la courbe, le point. */
    ico.appendChild(svg('M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01', 2.2));

    var txt = document.createElement('span');
    txt.className = 'ct-aide-txt';
    txt.textContent = 'Visite guidée';

    b.appendChild(ico);
    b.appendChild(txt);
    b.addEventListener('click', function () { start({ manuel: true }); });

    document.body.appendChild(b);
    etat.aide = b;
  }

  /* La pastille s'efface pendant la visite : laissée visible, elle flotterait
     au-dessus du voile — et un clic dessus relancerait depuis le début une
     visite déjà en cours. */
  function aideVisible(oui) {
    var b = etat.aide || document.getElementById('ct-aide');
    if (b) b.classList.toggle('ct-aide-off', !oui);
  }

  function demarrageAuto() {
    /* Bureau seulement — la garde est aussi dans `start`, mais sortir ici
       évite un sondage inutile pendant huit secondes sur chaque téléphone. */
    if (MQ_MOBILE.matches) return;

    /* `?tour=1` force, `?tour=0` neutralise : indispensable pour la recette,
       où il faudrait sinon vider le stockage entre chaque essai. Même esprit
       que `?debug=1`, déjà en place (conf-debug.js). */
    var force = false;
    try {
      var p = new URLSearchParams(window.location.search).get('tour');
      if (p === '0') { log('[tour] neutralisé par ?tour=0'); return; }
      if (p === '1') force = true;
    } catch (e) {}

    if (!force && dejaVu()) { log('[tour] déjà vue, pas de relance'); return; }

    quandEcranPret(function () {
      attendreInterface(function () {
        start({ manuel: force });   // forcée : on ne réécrit pas la marque
      });
    });
  }

  function auChargement() {
    /* La pastille est posée dans TOUS les cas — même quand la visite a déjà
       été vue, et c'est justement là qu'elle sert. Elle ne dépend donc pas du
       démarrage automatique, qui lui renonce dans ce cas.

       `DOMContentLoaded` suffirait pour elle seule, mais l'attacher ici évite
       un second point d'entrée : elle est en position fixe, rien ne la
       décale. */
    poserAide();
    demarrageAuto();
  }

  /* `load` plutôt que `DOMContentLoaded` : les images du produit dictent la
     hauteur de l'aperçu, et une bulle ancrée à cette zone se décalerait si
     elle était posée avant leur arrivée. Si la page est déjà chargée — script
     injecté tardivement — on enchaîne directement. */
  if (document.readyState === 'complete') auChargement();
  else window.addEventListener('load', auChargement);

  /* ────────────────────────────────────────────────────────────────────────
     EXPOSITION
     ──────────────────────────────────────────────────────────────────────── */
  window.confTour = {
    start: start,
    stop: stop,
    next: function () { aller(etat.index + 1); },
    prev: function () { aller(etat.index - 1); },
    estActif: function () { return etat.actif; },
    dejaVu: dejaVu,
    oublier: oublier      // pour la recette : confTour.oublier() puis recharger
  };

  log('[tour] moteur chargé');
})();
