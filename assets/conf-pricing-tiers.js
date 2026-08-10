/**
 * Prix DÉGRESSIF par quantité, PAR PRODUIT (TTC sauf mention).
 * Source de vérité unique, partagée par le configurateur ET le récapitulatif
 * (évite la duplication et libère de la marge dans les templates Liquid, proches
 * de la limite Shopify de 256 Ko).
 *
 * Table : { productType: [ {min, price}, … ] }, paliers du plus grand min au
 * plus petit. Seuls les produits listés sont dégressifs ; les autres gardent
 * leur prix unitaire fixe (window.PRICES).
 *
 * ┌─ PAIEMENT (à faire dans Shopify, PAS dans le code) ──────────────────────┐
 * │ Ceci est un AFFICHAGE. Le panier natif facture le prix du variant. Pour  │
 * │ que le CLIENT PAIE ces paliers, créer des réductions automatiques        │
 * │ « montant fixe par article », ciblées par produit, conditionnées sur la  │
 * │ quantité. Si une grille change ici, mettre à jour les remises Shopify.    │
 * │                                                                          │
 * │ SWEATSHIRT (base 60 €) :   ≥5 −3,50   ≥15 −6,10   ≥40 −8,00              │
 * │ T-SHIRT coton & polyester (base 29,50 €) :                               │
 * │        ≥5 −0,60   ≥10 −3,00   ≥20 −3,60   ≥50 −5,00                       │
 * │ PATCHS : prix unitaires du tableau atelier (voir grille ci-dessous).     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
(function () {
  /* REPLI uniquement. La source de vérité est le dashboard admin
     (GET /api/pricing -> `tiers`), qui écrase cette table dès sa réponse.
     Le `||` garantit qu'un chargement tardif de ce fichier n'efface pas des
     grilles déjà reçues du backend. */
  /* TOTAL NON MONOTONE AUX FRONTIÈRES — comportement VOULU, ne pas « corriger ».

     Les grilles sont en prix unitaire par palier, sans lissage. Le total peut
     donc BAISSER quand la quantité augmente d'une unité :

         49 t-shirts x 25,90 = 1 269,10 €
         50 t-shirts x 24,50 = 1 225,00 €   <- 44,10 € de MOINS pour 1 de plus

     Seule cette marche (25,90 -> 24,50 à 50 pièces) est assez large pour
     inverser ; les autres bornes (4->5, 9->10, 19->20) restent croissantes.

     Décision du commerçant : les prix s'affichent TELS QUELS. Ni bornage du
     total au palier suivant, ni ajustement de la grille — c'est la tarification
     atelier qui fait foi. Un client attentif peut donc arrondir sa commande au
     palier, ce qui est le principe même d'un tarif dégressif.

     Si cette règle change un jour, elle se traite ICI (la grille), pas dans le
     calcul d'affichage : celui-ci doit rester le reflet fidèle de la table. */
  window.QTY_TIERS = window.QTY_TIERS || {
    sweatshirt: [
      { min: 40, price: 52.00 },
      { min: 15, price: 53.90 },
      { min: 5,  price: 56.50 },
      { min: 1,  price: 60.00 }
    ],
    // T-shirt coton ET polyester : même grille tarifaire (TTC).
    // 1-4 → 29,50 €, 5-9 → 28,90 €, 10-19 → 26,50 €, 20-49 → 25,90 €, 50+ → 24,50 €.
    tshirt: [
      { min: 50, price: 24.50 },
      { min: 20, price: 25.90 },
      { min: 10, price: 26.50 },
      { min: 5,  price: 28.90 },
      { min: 1,  price: 29.50 }
    ],
    tshirt_polyester: [
      { min: 50, price: 24.50 },
      { min: 20, price: 25.90 },
      { min: 10, price: 26.50 },
      { min: 5,  price: 28.90 },
      { min: 1,  price: 29.50 }
    ],
    /* PATCHS : prix unitaire TTC selon la quantité (grille atelier).
       10 → 20 €, 20 → 12,50 €, 30 → 9 €, 50 → 5 €, 100 → 3,50 €.
       Au-delà de 100 : « sur demande » (bascule en devis, géré côté UI).

       Rangée sous `coins` : les noms sont INVERSÉS (cf. CONF_VARIANTS), c'est
       cette clé qui porte les patchs. Elle était sous `patches` — donc sous les
       coins métal, qui n'ont pas de grille — si bien que la grille du backend
       (elle aussi sous `coins` désormais) ne pouvait jamais remplacer ce repli
       pour le bon produit. */
    coins: [
      { min: 100, price: 3.50 },
      { min: 50,  price: 5.00 },
      { min: 30,  price: 9.00 },
      { min: 20,  price: 12.50 },
      { min: 10,  price: 20.00 }
    ]
    // patches (= COINS métal) : pas de grille, prix chiffré à la main sur devis.
  };

  /**
   * Prix unitaire dégressif d'un produit pour une quantité totale.
   * @returns {number|null} prix du palier, ou null si le produit n'est pas
   *          dégressif OU si la quantité est sous le plus petit palier.
   *
   * TRI OBLIGATOIRE : on cherche le palier le PLUS ÉLEVÉ que la quantité
   * atteint, donc le parcours doit aller du plus grand `min` au plus petit.
   * La table locale ci-dessus respecte cet ordre, mais elle n'est qu'un repli :
   * `window.QTY_TIERS` est ÉCRASÉ par la réponse de GET /api/pricing
   * (voir configurateur.liquid), dont rien ne garantit l'ordre. Une grille
   * saisie en ordre croissant faisait sinon réussir `q >= tiers[0].min` dès le
   * premier tour et renvoyait le prix plein à toutes les quantités : toutes les
   * remises disparaissaient silencieusement. On trie donc à chaque appel plutôt
   * que de faire confiance à la source.
   */
  window.tierUnitPrice = function (productType, totalQty) {
    var tiers = (window.QTY_TIERS || {})[productType];
    if (!tiers || !tiers.length) return null;
    var q = Math.max(0, parseInt(totalQty, 10) || 0);

    /* Copie triée par `min` décroissant. Les entrées dont `min` ou `price`
       n'est pas un nombre (grille admin malformée) sont écartées plutôt que
       traitées comme 0, ce qui aurait appliqué leur prix à toutes les
       quantités. Test strict volontaire : isFinite(null) vaut `true` (null est
       converti en 0), donc le contrôle laxiste laisserait justement passer le
       cas qu'on veut exclure. */
    var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
    /* Le contrôle de TYPE ne suffit pas : il faut aussi le DOMAINE.
       `isFinite(0)` et `isFinite(-50)` valent `true`, donc une grille
       renvoyant `price: 0` ou `price: -50` passait le filtre et s'affichait
       telle quelle (`formatPrix` ne protège pas non plus : -50 → « -50,00 € »).
       Un prix nul fait valider un panier gratuit, un prix négatif réduit le
       sous-total — sans rien changer à ce que Shopify facture.
       `min` doit être ≥ 1 : un palier `min: 0` ou négatif s'appliquerait à une
       quantité nulle, ce qui n'a pas de sens pour une commande. */
    var validTier = function (t) {
      return t && isNum(t.min) && isNum(t.price) && t.price > 0 && t.min >= 1;
    };
    var sorted = tiers
      .filter(validTier)
      .sort(function (a, b) { return b.min - a.min; });
    if (!sorted.length) return null;

    for (var i = 0; i < sorted.length; i++) {
      if (q >= sorted[i].min) return sorted[i].price;
    }

    /* Sous le plus petit palier : PAS de prix dégressif. On renvoyait avant le
       dernier palier du tableau, ce qui accordait la remise « 10 articles » à
       une commande d'un seul. effectiveUnitPrice retombe sur le prix de la
       ligne, et l'interface doit bloquer sous tierMinQty(). */
    return null;
  };

  /**
   * Prix unitaire effectif d'un article selon la quantité totale de son type.
   * @param item          { productType, price, … }
   * @param totalsByType  { productType: quantité totale }
   * Produit dégressif → prix du palier ; sinon → prix stocké de la ligne.
   */
  window.effectiveUnitPrice = function (item, totalsByType) {
    if (!item) return 0;
    var tier = window.tierUnitPrice(item.productType, (totalsByType || {})[item.productType] || 0);
    return tier != null ? tier : (Number(item.price) || 0);
  };

  /** Quantité minimale de commande d'un produit dégressif (plus petit palier).
      Même filtrage que tierUnitPrice : une entrée malformée dans la grille
      admin ne doit pas faire tomber le minimum à 0 (donc à 1 via le `|| 1`),
      ce qui autoriserait une commande sous le seuil de l'atelier. */
  window.tierMinQty = function (productType) {
    var tiers = (window.QTY_TIERS || {})[productType];
    if (!tiers || !tiers.length) return 1;
    /* MÊME filtre que tierUnitPrice, `price` compris : un palier écarté là-bas
       ne doit pas fixer le minimum de commande ici, sinon l'interface annonce
       « minimum 10 » pour un palier dont le prix a justement été rejeté. */
    var mins = tiers
      .filter(function (t) {
        return t && typeof t.min === 'number' && isFinite(t.min) && t.min >= 1 &&
               typeof t.price === 'number' && isFinite(t.price) && t.price > 0;
      })
      .map(function (t) { return t.min; });
    if (!mins.length) return 1;
    return Math.min.apply(null, mins) || 1;
  };

  /**
   * Applique une grille reçue du backend, en refusant ce qui est invalide.
   *
   * `window.QTY_TIERS = d.tiers` était fait sans regarder le CONTENU (seul
   * `typeof === 'object'` était testé). Une grille contenant des prix nuls ou
   * négatifs écrasait donc la table de repli, et l'interface affichait
   * « 0,00 € » ou « -50,00 € ». tierUnitPrice() écarte désormais ces entrées,
   * mais mieux vaut ne pas remplacer une grille saine par une grille cassée :
   * un produit dont TOUS les paliers sont refusés cesserait d'être dégressif
   * sans que personne le sache.
   *
   * On fusionne donc produit par produit : une grille valide remplace la
   * précédente, une grille entièrement invalide la laisse en place et
   * journalise. Un produit ABSENT de la réponse garde aussi sa grille — le
   * backend peut n'envoyer qu'un sous-ensemble.
   *
   * @returns {boolean} true si au moins un produit a été mis à jour.
   */
  window.applyTiersFromBackend = function (tiers) {
    if (!tiers || typeof tiers !== 'object') return false;

    var valid = function (t) {
      return t && typeof t.min === 'number' && isFinite(t.min) && t.min >= 1 &&
             typeof t.price === 'number' && isFinite(t.price) && t.price > 0;
    };

    var current = window.QTY_TIERS || {};
    var applied = 0;

    Object.keys(tiers).forEach(function (product) {
      var grid = tiers[product];
      if (!Array.isArray(grid)) {
        console.warn('Grille tarifaire ignorée (pas un tableau) : ' + product);
        return;
      }
      var kept = grid.filter(valid);
      if (!kept.length) {
        console.warn('Grille tarifaire ignorée (aucun palier valide) : ' + product +
                     ' — la grille précédente est conservée.');
        return;
      }
      if (kept.length !== grid.length) {
        console.warn('Grille ' + product + ' : ' + (grid.length - kept.length) +
                     ' palier(s) invalide(s) écarté(s) (prix ≤ 0 ou min < 1).');
      }
      current[product] = kept;
      applied++;
    });

    window.QTY_TIERS = current;
    return applied > 0;
  };

  /* ──────────────────────────────────────────────────────────────────────
     Plafond de quantité, partagé par TOUS les écrans produit.

     Les champs `#coin-qty-input`, `#flag-qty-input` et `#coin-recap-qty-input`
     n'avaient qu'un `min`, jamais de `max` : un client pouvait saisir
     999999999, l'article partait au panier et le backend répondait 400 au
     checkout sans explication utile.

     La valeur reprend `GRP_MAX_PIECES` de conf-main-inline.js (le plafond de la
     commande de groupe) : une commande directe ne doit pas pouvoir dépasser ce
     qu'un import CSV autorise. Déclarée ICI parce que ce fichier est chargé de
     façon SYNCHRONE (layout/configurateur.liquid:74), donc disponible avant
     conf-dynamic-layout.js, conf-drapeaux.js et conf-patches.js (tous `defer`).

     `clampQty` borne des deux côtés et renvoie toujours un entier utilisable :
     une saisie vide, négative, décimale ou non numérique retombe sur `min`. */
  window.QTY_MAX = 50000;

  /**
   * Borne une quantité saisie dans [min, QTY_MAX].
   * @param {*} valeur   ce que contient le champ (chaîne, nombre, vide…)
   * @param {number} min plancher propre au produit (10 coins, 1 drapeau, 50…)
   * @returns {number}   entier borné
   */
  window.clampQty = function (valeur, min) {
    var plancher = parseInt(min, 10);
    if (!isFinite(plancher) || plancher < 1) plancher = 1;

    var n = parseInt(valeur, 10);
    if (!isFinite(n)) return plancher;
    if (n < plancher) return plancher;
    if (n > window.QTY_MAX) return window.QTY_MAX;
    return n;
  };
})();
