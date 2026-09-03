/* ═══════════════════════════════════════════════════════════════════════════
   PALETTES DE COULEURS — UNE PAR PRODUIT

   La palette vivait autrefois à trois endroits qui s'ignoraient : quarante
   `<div class="cs">` figés dans configurateur.liquid, une table `COLOR_SLUGS`
   dans conf-main-inline.js, et une liste CSV dans layout/configurateur.liquid
   qui engendrait les URLs d'images. Trois listes, un seul jeu de couleurs pour
   les trois textiles — et rien pour donner au sweatshirt les siennes.

   Ce fichier devient LA source. Les pastilles en sont rendues, les slugs de
   fichiers en dérivent, et les URLs d'images s'y accordent.

   ── FORME D'UNE COULEUR ────────────────────────────────────────────────────
     nom    Ce que voit le client, et la clé de jointure de tout le projet :
            l'attribut `title` des pastilles, la couleur mémorisée en session,
            le libellé du récapitulatif, et le nom du variant Shopify.
            En changer un revient à changer de couleur.
     hex    La teinte de la pastille. Elle ne teinte PAS le vêtement : celui-ci
            vient d'une photographie par couleur (voir `slug`).
     slug   Le nom de fichier : `sweatshirt-<slug>-face.png`, `-dos`, `-cote`.
     numero La référence fournisseur. Portée pour la commande et l'atelier ;
            le code ne s'en sert pas pour retrouver une image.

   ── UNE COULEUR SANS IMAGE NE LÈVE AUCUNE ERREUR ───────────────────────────
   `loadFirstAvailable` (conf-main-inline.js) essaie le slug, puis un slug
   français hérité, puis l'image générique du produit. Une teinte dont le
   fichier manque affiche donc un vêtement NU, silencieusement. C'est voulu et
   documenté : COULEURS-SWEATSHIRT.md liste les fichiers encore à produire.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── SWEATSHIRT — palette fournisseur, 30 teintes ────────────────────────
     Elle REMPLACE les quarante couleurs d'origine. Les slugs sont dérivés des
     noms (accents retirés, espaces en tirets) : « Vert sapin » → `vert-sapin`
     → `sweatshirt-vert-sapin-face.png`.

     ATTENTION aux slugs déjà pris par l'ancienne palette française —
     `bleu-ciel`, `bleu-marine`, `gris-ardoise`, `blanc-casse`, `noir`, `rose`
     existent en fichiers. Les teintes ci-dessous qui les réutilisent héritent
     donc d'une image, mais d'une image dont la TEINTE peut différer : le
     rapport dit laquelle est fidèle et laquelle reste à refaire. */
  var SWEATSHIRT = [
    { numero: '01',  nom: 'Blanc / Transparent', hex: '#f0ecec', slug: 'blanc-transparent' },
    { numero: '132', nom: 'Blanc rosé',          hex: '#f0e6e5', slug: 'blanc-rose' },
    { numero: '177', nom: 'Blanc cassé',         hex: '#ededed', slug: 'blanc-casse' },
    { numero: '07',  nom: 'Camel',               hex: '#c09f80', slug: 'camel' },
    { numero: '08',  nom: 'Taupe',               hex: '#b7a298', slug: 'taupe' },
    { numero: '229', nom: 'Taupe rosé',          hex: '#e0cbc0', slug: 'taupe-rose' },
    { numero: '03',  nom: 'Jaune vif',           hex: '#fee400', slug: 'jaune-vif' },
    { numero: '172', nom: 'Caramel',             hex: '#bc7a2c', slug: 'caramel' },
    { numero: '31',  nom: 'Orange vif',          hex: '#f08927', slug: 'orange-vif' },
    { numero: '60',  nom: 'Rouge cerise',        hex: '#d3315c', slug: 'rouge-cerise' },
    { numero: '120', nom: 'Corail',              hex: '#fb8b89', slug: 'corail' },
    { numero: '168', nom: 'Mauve foncé',         hex: '#a4767e', slug: 'mauve-fonce' },
    { numero: '169', nom: 'Prune',               hex: '#875560', slug: 'prune' },
    { numero: '57',  nom: 'Bordeaux',            hex: '#8d1713', slug: 'bordeaux' },
    { numero: '78',  nom: 'Rose fuchsia',        hex: '#d93280', slug: 'rose-fuchsia' },
    { numero: '48',  nom: 'Rose pâle',           hex: '#f7d7db', slug: 'rose-pale' },
    { numero: '05',  nom: 'Bleu ciel',           hex: '#4987bc', slug: 'bleu-ciel' },
    { numero: '12',  nom: 'Bleu azur',           hex: '#50b0d9', slug: 'bleu-azur' },
    { numero: '55',  nom: 'Bleu marine',         hex: '#3f516c', slug: 'bleu-marine' },
    { numero: '263', nom: 'Bleu gris',           hex: '#a0a9bd', slug: 'bleu-gris' },
    { numero: '170', nom: 'Gris ardoise',        hex: '#587283', slug: 'gris-ardoise' },
    { numero: '430', nom: 'Gris bleuté',         hex: '#6d7880', slug: 'gris-bleute' },
    { numero: '58',  nom: 'Gris clair',          hex: '#cececd', slug: 'gris-clair' },
    { numero: '108', nom: 'Gris perle',          hex: '#b4afab', slug: 'gris-perle' },
    { numero: '231', nom: 'Gris anthracite',     hex: '#5e5c68', slug: 'gris-anthracite' },
    { numero: '264', nom: 'Vert amande',         hex: '#d4dcc4', slug: 'vert-amande' },
    { numero: '56',  nom: 'Vert sapin',          hex: '#004238', slug: 'vert-sapin' },
    { numero: '275', nom: 'Vert kaki',           hex: '#7f8783', slug: 'vert-kaki' },
    { numero: '152', nom: 'Kaki foncé',          hex: '#535f49', slug: 'kaki-fonce' },
    /* NOIR COMMUN AUX TROIS TEXTILES — #020204.

       Chaque nuancier fournisseur donnait le sien (#2e2622 ici, #020204 sur le
       coton, #010001 sur le polyester). L'écart était visible d'un produit à
       l'autre pour une couleur portant le même nom, sans que rien ne le
       justifie côté client. Une seule valeur, franche et sans dérive brune.

       Les images ne bougent pas : chaque produit garde son propre
       `<produit>-noir-*.png`, photographié sur son tissu. */
    { numero: '02',  nom: 'Noir',                hex: '#020204', slug: 'noir' }
  ];

  /* ── T-SHIRT COTON — palette fournisseur, 32 teintes ─────────────────────
     Elle REMPLACE les quarante couleurs historiques pour ce produit.

     ONZE NOMS SONT COMMUNS AVEC LE SWEATSHIRT, et huit d'entre eux portent une
     teinte DIFFÉRENTE — « Noir » vaut ici #020204 contre #2e2622 sur le
     sweatshirt, « Vert sapin » #014138 contre #004238. Ce n'est pas une erreur
     à corriger : ce sont deux textiles, deux tissus, deux nuanciers.

     Rien ne les confond, car tout ce qui dépend de la teinte passe par la
     palette DU PRODUIT : `couleurDansPalette` et `couleurParDefaut` prennent le
     produit en argument, et `applyColorForProduct` relit le hex depuis la
     palette plutôt que depuis la session. Les images, elles, sont préfixées par
     produit — `tshirt-noir-face.png` face à `sweatshirt-noir-face.png`.

     La seule table réellement globale est nom → slug ; les noms partagés y
     donnent le même slug, elle reste donc cohérente. */
  var TSHIRT = [
    { numero: '01',  nom: 'Blanc',              hex: '#fefefd', slug: 'blanc', bordure: true },
    { numero: '07',  nom: 'Camel',              hex: '#bf9f7f', slug: 'camel' },
    { numero: '229', nom: 'Rose taupe',         hex: '#d9b8a7', slug: 'rose-taupe' },
    { numero: '67',  nom: 'Vert olive',         hex: '#766e4a', slug: 'vert-olive' },
    { numero: '87',  nom: 'Marron chocolat',    hex: '#683d2f', slug: 'marron-chocolat' },
    { numero: '03',  nom: 'Jaune vif',          hex: '#fee403', slug: 'jaune-vif' },
    { numero: '31',  nom: 'Orange vif',         hex: '#f08b2c', slug: 'orange-vif' },
    { numero: '60',  nom: 'Rouge écarlate',     hex: '#dc0431', slug: 'rouge-ecarlate' },
    { numero: '57',  nom: 'Bordeaux',           hex: '#8d1713', slug: 'bordeaux' },
    { numero: '78',  nom: 'Rose fuchsia',       hex: '#db036b', slug: 'rose-fuchsia' },
    { numero: '48',  nom: 'Rose pâle',          hex: '#f9cdd5', slug: 'rose-pale' },
    { numero: '71',  nom: 'Violet aubergine',   hex: '#760e67', slug: 'violet-aubergine' },
    { numero: '230', nom: 'Mauve orchidée',     hex: '#c57bb0', slug: 'mauve-orchidee' },
    { numero: '05',  nom: 'Bleu roi',           hex: '#0461ab', slug: 'bleu-roi' },
    { numero: '10',  nom: 'Bleu ciel pâle',     hex: '#c6def1', slug: 'bleu-ciel-pale' },
    { numero: '12',  nom: 'Bleu turquoise',     hex: '#04a1d2', slug: 'bleu-turquoise' },
    { numero: '100', nom: 'Bleu cyan',          hex: '#0291c1', slug: 'bleu-cyan' },
    { numero: '86',  nom: 'Bleu ardoise',       hex: '#4d6884', slug: 'bleu-ardoise' },
    { numero: '55',  nom: 'Bleu marine foncé',  hex: '#021f44', slug: 'bleu-marine-fonce' },
    { numero: '118', nom: 'Jaune citron',       hex: '#ebe567', slug: 'jaune-citron' },
    { numero: '114', nom: 'Vert anis clair',    hex: '#c2d786', slug: 'vert-anis-clair' },
    { numero: '24',  nom: 'Vert pomme',         hex: '#80b95b', slug: 'vert-pomme' },
    { numero: '83',  nom: 'Vert prairie',       hex: '#559f2a', slug: 'vert-prairie' },
    { numero: '216', nom: 'Vert émeraude',      hex: '#078d19', slug: 'vert-emeraude' },
    { numero: '56',  nom: 'Vert sapin',         hex: '#014138', slug: 'vert-sapin' },
    { numero: '15',  nom: 'Kaki doré',          hex: '#938e50', slug: 'kaki-dore' },
    { numero: '152', nom: 'Kaki foncé',         hex: '#535f49', slug: 'kaki-fonce' },
    { numero: '58',  nom: 'Gris clair',         hex: '#c4c4c4', slug: 'gris-clair' },
    { numero: '108', nom: 'Gris perle',         hex: '#b4afab', slug: 'gris-perle' },
    { numero: '231', nom: 'Gris ardoise foncé', hex: '#374047', slug: 'gris-ardoise-fonce' },
    { numero: '46',  nom: 'Vert militaire',     hex: '#484e42', slug: 'vert-militaire' },
    { numero: '02',  nom: 'Noir',               hex: '#020204', slug: 'noir' }
  ];

  /* ── T-SHIRT POLYESTER — palette fournisseur, 17 teintes ─────────────────
     Le dernier des trois textiles à recevoir la sienne. Comme pour le t-shirt
     coton, plusieurs noms sont communs aux autres palettes avec des teintes
     légèrement différentes (« Noir » #010001 ici, #020204 sur le coton,
     #2e2622 sur le sweatshirt) : trois tissus, trois nuanciers. Le préfixe
     produit sépare les fichiers, rien ne se confond. */
  var POLYESTER = [
    { numero: '01',  nom: 'Blanc',             hex: '#fdfcfa', slug: 'blanc', bordure: true },
    { numero: '219', nom: 'Beige taupe',       hex: '#9a8a70', slug: 'beige-taupe' },
    { numero: '03',  nom: 'Jaune vif',         hex: '#fce614', slug: 'jaune-vif' },
    { numero: '221', nom: 'Jaune citron',      hex: '#e9e66b', slug: 'jaune-citron' },
    { numero: '223', nom: 'Orange vif',        hex: '#ee8237', slug: 'orange-vif' },
    { numero: '234', nom: 'Corail',            hex: '#fb7272', slug: 'corail' },
    { numero: '60',  nom: 'Rouge écarlate',    hex: '#dd0636', slug: 'rouge-ecarlate' },
    { numero: '78',  nom: 'Rose fuchsia',      hex: '#d90b6c', slug: 'rose-fuchsia' },
    { numero: '63',  nom: 'Violet indigo',     hex: '#49378a', slug: 'violet-indigo' },
    { numero: '05',  nom: 'Bleu roi',          hex: '#0862a9', slug: 'bleu-roi' },
    { numero: '12',  nom: 'Bleu turquoise',    hex: '#10a2ce', slug: 'bleu-turquoise' },
    { numero: '55',  nom: 'Bleu marine foncé', hex: '#091f46', slug: 'bleu-marine-fonce' },
    { numero: '226', nom: 'Vert émeraude',     hex: '#079a45', slug: 'vert-emeraude' },
    { numero: '225', nom: 'Vert anis',         hex: '#9abf11', slug: 'vert-anis' },
    { numero: '15',  nom: 'Kaki doré',         hex: '#948d50', slug: 'kaki-dore' },
    { numero: '46',  nom: 'Vert militaire',    hex: '#4a4f44', slug: 'vert-militaire' },
    /* Même noir que les deux autres textiles — voir SWEATSHIRT. */
    { numero: '02',  nom: 'Noir',              hex: '#020204', slug: 'noir' }
  ];

  /* ── PALETTE HISTORIQUE — conservée comme FILET DE SÉCURITÉ ──────────────
     Les trois textiles ont désormais la leur ; celle-ci ne sert plus qu'à
     `paletteProduit`, qui s'y replie pour un produit inconnu. Un sélecteur
     vide passerait pour une panne, mieux vaut des couleurs inattendues.

     Ses slugs sont anglais, hérités de `COLOR_SLUGS`. */
  var TEXTILE_HISTORIQUE = [
    { nom: 'Apricot',          hex: '#f5a623', slug: 'apricot' },
    { nom: 'Ash',              hex: '#eff1f0', slug: 'ash',   bordure: true },
    { nom: 'Atoll',            hex: '#3bb9e0', slug: 'atoll' },
    { nom: 'Black',            hex: '#0a0a0a', slug: 'black' },
    { nom: 'Bottle Green',     hex: '#143f2e', slug: 'bottle-green' },
    { nom: 'Brown',            hex: '#3a3130', slug: 'brown' },
    { nom: 'Burgundy',         hex: '#3d1f35', slug: 'burgundy' },
    { nom: 'Chocolate',        hex: '#4a3830', slug: 'chocolate' },
    { nom: 'Cobalt Blue',      hex: '#1e32e6', slug: 'cobalt-blue' },
    { nom: 'Dark Grey',        hex: '#2e3944', slug: 'dark-grey' },
    { nom: 'Diva Blue',        hex: '#1e6b78', slug: 'diva-blue' },
    { nom: 'Fire Red',         hex: '#e01e1e', slug: 'fire-red' },
    { nom: 'Gold',             hex: '#f5c518', slug: 'gold' },
    { nom: 'Kelly Green',      hex: '#2fa84f', slug: 'kelly-green' },
    { nom: 'Millennial Lilac', hex: '#6e7bd8', slug: 'millennial-lilac' },
    { nom: 'Millennial Mint',  hex: '#9ee5c4', slug: 'millennial-mint' },
    { nom: 'Natural',          hex: '#e8e2d0', slug: 'natural', bordure: true },
    { nom: 'Navy',             hex: '#1a2438', slug: 'navy' },
    { nom: 'Navy Blue',        hex: '#1b2a5b', slug: 'navy-blue' },
    { nom: 'Orange',           hex: '#f0500a', slug: 'orange' },
    { nom: 'Orchid Green',     hex: '#7de01e', slug: 'orchid-green' },
    { nom: 'Orchid Pink',      hex: '#f5c8dc', slug: 'orchid-pink' },
    { nom: 'Pacific Grey',     hex: '#8a8d91', slug: 'pacific-grey' },
    { nom: 'Pixel Lime',       hex: '#a8e020', slug: 'pixel-lime' },
    { nom: 'Radiant Purple',   hex: '#3a1e9e', slug: 'radiant-purple' },
    { nom: 'Red',              hex: '#a81e32', slug: 'red' },
    { nom: 'Royal Blue',       hex: '#1e4be0', slug: 'royal-blue' },
    { nom: 'Sand',             hex: '#c4b49a', slug: 'sand' },
    { nom: 'Sky',              hex: '#9ed8f0', slug: 'sky' },
    { nom: 'Solar Yellow',     hex: '#f5e518', slug: 'solar-yellow' },
    { nom: 'Sorbet',           hex: '#b01e78', slug: 'sorbet' },
    { nom: 'Sport Grey',       hex: '#8a9499', slug: 'sport-grey' },
    { nom: 'Stone Blue',       hex: '#3e6b85', slug: 'stone-blue' },
    { nom: 'Sunset Orange',    hex: '#f5455e', slug: 'sunset-orange' },
    { nom: 'Swimming Pool',    hex: '#5ed0c4', slug: 'swimming-pool' },
    { nom: 'Urban Khaki',      hex: '#3a4130', slug: 'urban-khaki' },
    { nom: 'Urban Orange',     hex: '#c43418', slug: 'urban-orange' },
    { nom: 'Urban Purple',     hex: '#1e1e6e', slug: 'urban-purple' },
    { nom: 'Used Black',       hex: '#2e3438', slug: 'used-black' },
    { nom: 'White',            hex: '#ffffff', slug: 'white', bordure: true }
  ];

  /* Clés = `data-product` des cartes produit, celles de PRODUCT_SLUGS. */
  window.PRODUCT_COLORS = {
    sweatshirt:        SWEATSHIRT,
    tshirt:            TSHIRT,
    tshirt_polyester:  POLYESTER
  };

  /**
   * @returns {Array} La palette d'un produit, jamais null.
   *
   * Repli sur la palette historique : un produit inconnu vaut mieux avec des
   * couleurs qu'avec un sélecteur vide, qui passerait pour une panne.
   */
  window.paletteProduit = function (produit) {
    return (window.PRODUCT_COLORS && window.PRODUCT_COLORS[produit]) ||
           TEXTILE_HISTORIQUE;
  };

  /**
   * @returns {object|null} La couleur portant ce nom dans la palette du
   * produit, ou null si elle n'y est pas.
   *
   * C'est le test qui manquait : une couleur mémorisée pour un produit peut
   * ne plus exister dans un autre. Sans lui, `applyColorForProduct` cherchait
   * une pastille absente, n'en trouvait aucune, et laissait à l'écran le
   * libellé du produit précédent — sans la moindre erreur.
   */
  window.couleurDansPalette = function (produit, nom) {
    if (!nom) return null;
    var pal = window.paletteProduit(produit);
    for (var i = 0; i < pal.length; i++) {
      if (pal[i].nom === nom) return pal[i];
    }
    return null;
  };

  /* Couleur d'ouverture, par produit.

     Prendre la première de la palette semblait naturel, mais donnait
     « Blanc / Transparent » au sweatshirt — une teinte dont l'image n'est pas
     encore livrée : le configurateur se serait ouvert sur un vêtement nu, ce
     qui passe pour une panne. On désigne donc une couleur DONT L'IMAGE EXISTE,
     et le noir était déjà le défaut historique. */
  var DEFAUTS = {
    sweatshirt: 'Noir',
    tshirt: 'Noir',
    tshirt_polyester: 'Noir'
  };

  /**
   * @returns {object} La couleur par défaut d'un produit.
   *
   * `applyColorForProduct` forçait « Black » pour tous les textiles. Le
   * sweatshirt n'a plus de couleur de ce nom : le défaut doit suivre la
   * palette, pas une constante.
   */
  window.couleurParDefaut = function (produit) {
    var pal = window.paletteProduit(produit);
    var vise = DEFAUTS[produit];
    if (vise) {
      for (var i = 0; i < pal.length; i++) {
        if (pal[i].nom === vise) return pal[i];
      }
    }
    /* Le défaut nommé n'est pas dans la palette : la première vaut mieux que
       rien — un sélecteur sans couleur active passerait pour une panne. */
    return pal[0] || { nom: 'Black', hex: '#0a0a0a', slug: 'black' };
  };

  /* TABLE NOM → SLUG, reconstruite depuis les palettes.

     `COLOR_SLUGS` était une quarantaine de lignes recopiées à la main, à tenir
     synchronisées avec les pastilles. Elle se déduit maintenant des palettes :
     une couleur ajoutée quelque part ne peut plus manquer ici.

     Un nom partagé par plusieurs palettes y donne le MÊME slug — vérifié : les
     teintes diffèrent d'un tissu à l'autre, jamais les slugs. Les fichiers,
     eux, sont séparés par le préfixe produit.

     LA PALETTE HISTORIQUE EN FAIT PARTIE, bien qu'aucun produit ne l'utilise
     plus. Des articles ajoutés au panier AVANT ce changement portent encore
     « Black », « Navy », « Sand »… : sans leur slug, leur vignette ne
     retrouverait plus d'image et la ligne rouvrirait un vêtement nu. Une
     quarantaine d'entrées inertes coûtent moins qu'un panier cassé. */
  var slugs = {};
  var sources = [];
  Object.keys(window.PRODUCT_COLORS).forEach(function (p) {
    sources.push(window.PRODUCT_COLORS[p]);
  });
  sources.push(TEXTILE_HISTORIQUE);
  sources.forEach(function (pal) {
    pal.forEach(function (c) { if (!slugs[c.nom]) slugs[c.nom] = c.slug; });
  });
  window.COLOR_SLUGS_PALETTES = slugs;
})();
