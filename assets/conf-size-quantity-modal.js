/**
 * ══════════════════════════════════════════════════════════════
 * MODAL SÉLECTION QUANTITÉS PAR TAILLE
 * Permet de sélectionner plusieurs tailles avec quantités
 * ══════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  confLog('🚀 Chargement du modal quantités par taille...');

  let sizeQuantities = {};

  /* Le client a-t-il touché aux compteurs depuis la dernière ouverture « à
     neuf » ? Tant que c'est vrai, rouvrir la modale RETROUVE sa saisie au lieu
     de la recalculer — fermer par la croix ou « Annuler » ne la perd plus.

     Remis à false quand la répartition est confirmée (elle devient alors la
     liste validée, que `initSizeQuantities` sait recharger) et quand le client
     réinitialise lui-même. */
  let saisieEnCours = false;

  /* Quantité affichée dans le panneau AU MOMENT de la dernière confirmation.

     Sert à savoir si le client a touché au champ « Qté » depuis : sans ce
     repère, la répartition validée l'emportait toujours, et régler 20 dans le
     panneau après avoir confirmé 18 pièces n'était jamais repris par la
     modale — elle rouvrait sur son ancienne répartition, sourde au changement.

     `null` = aucune confirmation dans cette session. */
  let qteAuMomentDeLaConfirmation = null;

  /* Taille sélectionnée dans le panneau AU MOMENT de la dernière confirmation.

     Le repère de quantité seul ne suffisait pas : changer de TAILLE sans
     toucher au nombre — passer « M · 4 » à « XL · 4 » — laissait la quantité
     identique, donc aucun changement détecté. La modale rouvrait sur sa liste
     validée et ignorait le XL que le client venait de désigner.

     Avec les deux repères, le panneau reste lu comme un couple : « telle
     quantité, sur telle taille ». */
  let tailleAuMomentDeLaConfirmation = null;

  /**
   * Récupère les tailles disponibles depuis la sidebar
   */
  function getAvailableSizes() {
    /* Les boutons de taille existent en PLUSIEURS exemplaires dans le DOM :
       ceux de la sidebar d'origine, et la copie clonée dans le menu déroulant
       du canvas (conf-canvas-options.js). Sans filtrage, la modale listait donc
       chaque taille deux fois, dans un ordre incohérent.
       On ne lit que le premier bloc .sg — la source, jamais le clone
       (.cv-opt-clone). */
    const src = document.querySelector('.sg:not(.cv-opt-clone)');
    const sizeButtons = src
      ? src.querySelectorAll('.sb:not(.sb-group)')
      : document.querySelectorAll('.sb:not(.sb-group)');

    const sizes = [];
    const seen = new Set();   // filet : jamais deux fois la même taille

    sizeButtons.forEach(btn => {
      const size = btn.textContent.trim();
      const disabled = btn.disabled || btn.classList.contains('disabled');

      if (size && !seen.has(size)) {
        seen.add(size);
        sizes.push({
          name: size,
          available: !disabled
        });
      }
    });

    // Fallback si aucune taille trouvée
    if (sizes.length === 0) {
      return ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'].map(s => ({ name: s, available: true }));
    }

    /* Tri explicite : on ne dépend plus de l'ordre du DOM, qui variait selon
       le bloc lu. Une taille hors barème est reléguée à la fin plutôt que
       d'être écartée. */
    const ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
    sizes.sort((a, b) => {
      const ia = ORDER.indexOf(a.name);
      const ib = ORDER.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return sizes;
  }

  /**
   * Initialise les quantités à 0
   */
  /**
   * Reporte sur la répartition ce que le client a réglé dans le PANNEAU depuis
   * la dernière confirmation.
   *
   * LE PANNEAU EST UN COUPLE : une quantité SUR une taille. Les deux comptent —
   * passer « M · 4 » à « XL · 4 » est un changement, même à quantité égale.
   *
   * ⚠️ APPELÉE À CHAQUE OUVERTURE, y compris quand une saisie est en cours.
   *
   * Elle vivait auparavant dans `initSizeQuantities`, qui ne tourne QUE si
   * `saisieEnCours` est faux. Un premier geste au panneau levant ce drapeau, le
   * second n'était plus jamais détecté : le client passait XXL de 4 à 6 (repris,
   * car le drapeau était encore bas), puis changeait XXL en XS — et rien ne
   * bougeait.
   *
   * Sortie de cette fonction, elle s'applique quel que soit l'état de la
   * saisie : le panneau vaut toujours consigne, comme avant toute confirmation.
   */
  function appliquerConsigneDuPanneau() {
    if (qteAuMomentDeLaConfirmation === null) return;

    const champ = document.getElementById('textile-qty-input');
    const qteActuelle = champ ? (parseInt(champ.value, 10) || 0) : 0;
    if (qteActuelle <= 0) return;

    const sgSrc = document.querySelector('.sg:not(.cv-opt-clone)');
    const btn = (sgSrc || document).querySelector('.sb.on:not(.sb-group)');
    const taille = btn ? btn.textContent.trim() : '';

    const tailleChangee = taille && taille !== tailleAuMomentDeLaConfirmation;
    const qteChangee = qteActuelle !== qteAuMomentDeLaConfirmation;
    if (!qteChangee && !tailleChangee) return;

    if (taille && sizeQuantities.hasOwnProperty(taille)) {
      sizeQuantities[taille] = qteActuelle;
    }

    /* Les repères avancent : sans cela, la même consigne serait réappliquée à
       chaque ouverture de la modale. */
    qteAuMomentDeLaConfirmation = qteActuelle;
    tailleAuMomentDeLaConfirmation = taille || tailleAuMomentDeLaConfirmation;

    /* L'APPORT N'EST PAS ENCORE DANS LA LISTE VALIDÉE — il ne le sera qu'à la
       confirmation. Sans ce drapeau, la réouverture SUIVANTE recalculerait tout
       depuis cette liste et les pièces ajoutées disparaîtraient : le client les
       voyait, fermait, rouvrait, et elles n'étaient plus là. */
    saisieEnCours = true;
  }

  function initSizeQuantities() {
    const sizes = getAvailableSizes();
    sizeQuantities = {};

    sizes.forEach(size => {
      sizeQuantities[size.name] = 0;
    });

    /* Liste DÉJÀ validée par cette modale : on la recharge pour que le client
       corrige ses quantités sans tout ressaisir (réouverture par le badge).
       Ces lignes portent _sizeGroupSummary — celles de la modale « surnoms »
       ne l'ont pas, on ne les reprend donc pas ici. */
    const saved = (typeof window.getGroupOrderRows === 'function')
      ? window.getGroupOrderRows()
      : null;
    const fromSizeModal = saved && saved.length &&
      saved.every(r => r && r._sizeGroupSummary);

    /* LA RÉPARTITION VALIDÉE EST TOUJOURS RECHARGÉE — elle n'est jamais
       écrasée.

       Une version antérieure repartait du panneau seul dès que la quantité y
       changeait : le client qui avait réparti 9 S + 5 L + 3 XXL, puis réglait
       12 dans le panneau, rouvrait la modale et trouvait TOUT à zéro sauf sa
       taille courante. Sa répartition était perdue.

       On repart donc toujours de la liste validée. Une quantité réglée dans le
       panneau depuis la confirmation vient ensuite REMPLACER celle de sa seule
       taille (voir plus bas) : le champ porte désormais la quantité de la
       taille sélectionnée, pas un apport à cumuler. */
    if (fromSizeModal) {
      saved.forEach(r => {
        if (r.size && sizeQuantities.hasOwnProperty(r.size)) {
          sizeQuantities[r.size] += (parseInt(r.qty, 10) || 1);
        }
      });

      /* La quantité du panneau a-t-elle changé depuis la confirmation ?
         Si oui, le client vient de la régler : elle REMPLACE celle de sa
         taille courante.

         ⚠️ REMPLACER, ET NON AJOUTER.

         Ce champ additionnait autrefois, et c'était juste : il portait alors
         une quantité NEUVE, sans rapport avec la répartition — « j'ajoute
         douze XL à ce que j'ai déjà ».

         Il a changé de sens depuis : la confirmation y écrit la quantité DE LA
         TAILLE SÉLECTIONNÉE, puisqu'il forme un couple avec le menu « Taille »
         posé à sa gauche. Le client qui avait 5 M et tapait 8 dans ce champ
         désignait donc huit M — et en retrouvait treize, 5 + 8. Sa correction
         était traitée comme un ajout.

         Le geste est le même des deux côtés : régler la quantité de cette
         taille. Les deux affichages doivent donc dire la même chose. */
      appliquerConsigneDuPanneau();
      return;
    }

    /* Sinon : la taille ET LA QUANTITÉ actuellement renseignées. On vise le
       bloc SOURCE — le clone du menu canvas peut porter un état « on »
       différent (il n'est recopié qu'une fois, à la première ouverture). */
    const sgSrc = document.querySelector('.sg:not(.cv-opt-clone)');
    const selectedBtn = (sgSrc || document).querySelector('.sb.on:not(.sb-group)');
    if (selectedBtn) {
      const selectedSize = selectedBtn.textContent.trim();
      if (sizeQuantities.hasOwnProperty(selectedSize)) {
        /* LA QUANTITÉ VIENT DU CHAMP, elle n'est plus figée à 1.

           La taille était bien reprise, mais la quantité valait 1 en dur : un
           client qui avait réglé « M · 6 » puis ouvrait cette modale y trouvait
           « M × 1 » et devait ressaisir son nombre.

           L'écart existait déjà, mais ne se voyait pas tant que la quantité
           vivait ailleurs. Elle est désormais affichée juste au-dessus du
           bouton qui ouvre cette modale : les deux doivent s'accorder.

           Plancher à 1 : répartir zéro article n'a pas de sens, et c'est déjà
           le minimum du champ lui-même. Pas de plafond — il n'en existe aucun
           par taille (voir `changeSizeQuantity`), en poser un ici créerait une
           règle que les boutons + ne connaissent pas. */
        const champQte = document.getElementById('textile-qty-input');
        const qteSaisie = champQte ? (parseInt(champQte.value, 10) || 1) : 1;
        sizeQuantities[selectedSize] = Math.max(1, qteSaisie);
      }
    }
  }

  /**
   * Rend les lignes de tailles dans le modal
   */
  function renderSizeList() {
    const list = document.getElementById('size-qty-list');
    if (!list) return;

    const sizes = getAvailableSizes();
    list.innerHTML = '';

    sizes.forEach(size => {
      const qty = sizeQuantities[size.name] || 0;
      const hasQty = qty > 0;

      const row = document.createElement('div');
      row.className = 'size-qty-row' + (hasQty ? ' has-qty' : '');
      row.innerHTML = `
        <div class="size-qty-size">${size.name}</div>
        ${!size.available ? '<div class="size-qty-stock-info">Rupture de stock</div>' : ''}
        <div class="size-qty-counter">
          <button type="button" class="size-qty-btn" 
                  onclick="changeSizeQuantity('${size.name}', -1)"
                  ${qty === 0 || !size.available ? 'disabled' : ''}>−</button>
          <input type="number" class="size-qty-value" value="${qty}"
                 min="0" inputmode="numeric" pattern="[0-9]*"
                 aria-label="Quantité pour la taille ${size.name}"
                 ${!size.available ? 'disabled' : ''}
                 onchange="saisirSizeQuantity('${size.name}', this.value)"
                 onfocus="this.select()">
          <button type="button" class="size-qty-btn" 
                  onclick="changeSizeQuantity('${size.name}', 1)"
                  ${!size.available ? 'disabled' : ''}>+</button>
        </div>
      `;

      list.appendChild(row);
    });
  }

  /**
   * Change la quantité d'une taille
   */
  /* SAISIE DIRECTE de la quantité.

     Les boutons +/− seuls imposaient un appui par unité : commander 40 pièces
     d'une taille demandait 40 appuis sur mobile. Le champ accepte donc une
     valeur au clavier, tout en gardant les boutons pour les petits ajustements.

     `inputmode="numeric"` fait apparaître le pavé numérique sur téléphone —
     `type="number"` seul ne le garantit pas sur iOS. */
  window.saisirSizeQuantity = function(sizeName, valeur) {
    /* parseInt tolère « 12abc » ; NaN (champ vidé) retombe à 0, comme le
       ferait le bouton −. Jamais de négatif : la borne est la même que celle
       de changeSizeQuantity. */
    var n = Math.max(0, parseInt(valeur, 10) || 0);
    sizeQuantities[sizeName] = n;
    saisieEnCours = true;   // la répartition survivra à une fermeture sans confirmer
    /* Re-rendu complet : il rafraîchit aussi l'état désactivé du bouton −, le
       total et le résumé — exactement ce que fait le chemin des boutons. */
    renderSizeList();
  };

  window.changeSizeQuantity = function(sizeName, delta) {
    const currentQty = sizeQuantities[sizeName] || 0;
    const newQty = Math.max(0, currentQty + delta);

    sizeQuantities[sizeName] = newQty;
    saisieEnCours = true;   // idem : voir saisirSizeQuantity
    renderSizeList();
  };

  /**
   * Remet toutes les tailles à zéro.
   *
   * Appelée par le bouton « Réinitialiser » de l'en-tête. On repart d'une
   * ardoise vraiment vierge — pas de `initSizeQuantities()`, qui reprendrait la
   * taille et la quantité affichées et laisserait donc une ligne garnie.
   */
  window.resetSizeQuantities = function() {
    Object.keys(sizeQuantities).forEach(function (size) {
      sizeQuantities[size] = 0;
    });

    /* RETOUR À L'ÉTAT DE DÉPART, PAS À UNE GRILLE VIDE.

       Tout à zéro n'est pas un état que le configurateur sait produire : une
       commande porte toujours au moins une pièce, et « Confirmer » refuse une
       répartition vide. Le client se retrouvait donc dans une impasse, obligé
       de recliquer un « + » pour sortir.

       On revient à ce qu'affiche le configurateur au premier chargement — la
       taille par défaut à 1 pièce. `M` est cette taille (configurateur.liquid,
       et le repli de `applySizeQtyFor`) ; le repli sur la première taille
       disponible couvre un produit dont la grille ne la proposerait pas. */
    var tailleDefaut = sizeQuantities.hasOwnProperty('M')
      ? 'M'
      : Object.keys(sizeQuantities)[0];
    if (tailleDefaut) sizeQuantities[tailleDefaut] = 1;
    /* La modale redevient « à neuf » : si le client ferme maintenant sans
       confirmer, la prochaine ouverture repartira de sa sélection courante,
       comme au premier jour. */
    /* `saisieEnCours` reste VRAI — c'est ce qui fait tenir la remise à zéro.

       Le passer à false laissait la répartition VALIDÉE reprendre la main à la
       réouverture : le client réinitialisait, fermait, rouvrait, et retrouvait
       ses huit tailles. Une ardoise vierge est un état voulu, au même titre
       qu'une saisie — elle doit survivre à la fermeture.

       Les repères de confirmation partent, eux : la répartition validée n'a
       plus cours. Les DEUX, sinon la taille mémorisée survivrait seule et
       fausserait la prochaine comparaison. */
    saisieEnCours = true;
    qteAuMomentDeLaConfirmation = null;
    tailleAuMomentDeLaConfirmation = null;
    renderSizeList();
  };

  /**
   * Met à jour le résumé des tailles sélectionnées
   */
  function updateSizeSummary() {
    const selectedEl = document.getElementById('size-qty-selected');
    if (!selectedEl) return;

    const selectedSizes = [];
    
    Object.keys(sizeQuantities).forEach(size => {
      const qty = sizeQuantities[size];
      if (qty > 0) {
        selectedSizes.push(size);
      }
    });

    if (selectedSizes.length === 0) {
      selectedEl.textContent = 'Aucune sélection';
    } else if (selectedSizes.length === 1) {
      selectedEl.textContent = selectedSizes[0];
    } else {
      selectedEl.textContent = selectedSizes.join(', ');
    }
  }

  /* Ordre du VÊTEMENT, pas ordre alphabétique ni ordre de rencontre.
     Le regroupement ci-dessous rend les tailles dans l'ordre où les lignes
     arrivent : correct à la validation, mais rien ne le garantit après une
     restauration de session. On retrie, pour que « XS × 1, M × 5 » ne devienne
     jamais « M × 5, XS × 1 ». */
  const ORDRE_TAILLES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

  /**
   * Écrit sous le bouton « Répartir par tailles » le détail de la répartition
   * VALIDÉE, suivi du total de pièces.
   *
   * On lit la liste validée (`getGroupOrderRows`) et NON `sizeQuantities` :
   * ce dernier porte la saisie en cours, y compris celle que le client vient
   * d'abandonner par « Annuler ». Le panneau ne doit annoncer que ce qui part
   * réellement au panier.
   *
   * Une liste de SURNOMS (mode groupe) n'a pas de `_sizeGroupSummary` : elle
   * est ignorée ici, elle a déjà son propre badge.
   */
  function majResumeRepartition() {
    var hote = document.getElementById('rp-repartition');
    if (!hote) return;   // gabarit sans tailles : coin, drapeau, patch

    var lignes = (typeof window.getGroupOrderRows === 'function')
      ? window.getGroupOrderRows()
      : null;

    var vientDesTailles = lignes && lignes.length &&
      lignes.every(function (r) { return r && r._sizeGroupSummary; });

    if (!vientDesTailles) {
      hote.style.display = 'none';
      hote.textContent = '';
      return;
    }

    /* Chaque ligne vaut UNE pièce (voir confirmSizeQuantities) : on les
       recompte par taille plutôt que de relire `_sizeGroupSummary`, dont le
       format « 5×M » est destiné à l'atelier et non au client. */
    var parTaille = {};
    var total = 0;
    lignes.forEach(function (r) {
      if (!r.size) return;
      var n = parseInt(r.qty, 10) || 1;
      parTaille[r.size] = (parTaille[r.size] || 0) + n;
      total += n;
    });

    var tailles = Object.keys(parTaille).sort(function (a, b) {
      var ia = ORDRE_TAILLES.indexOf(a), ib = ORDRE_TAILLES.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    if (!tailles.length) { hote.style.display = 'none'; return; }

    /* createElement plutot qu innerHTML : les noms de tailles viennent de la
       liste validee, mais rien ne justifie d interpreter du HTML la ou seul
       du texte est attendu. */
    /* UNE LIGNE PAR TAILLE, comme le tiroir du panier : le nom à gauche, la
       quantité à droite (.cd-grp-taille, conf-main-inline.js).

       La version précédente entassait tout sur une seule ligne dans un encadré
       vert. Sur huit tailles, elle se repliait en un pavé difficile à
       parcourir, et ne ressemblait à rien d'autre dans l'interface. Le client
       vérifie la même chose aux deux endroits : les deux doivent se lire
       pareil. */
    hote.textContent = '';

    tailles.forEach(function (t) {
      var ligne = document.createElement('div');
      ligne.className = 'rp-rep-ligne';

      var nom = document.createElement('span');
      nom.className = 'rp-rep-taille';
      nom.textContent = t;

      var qte = document.createElement('span');
      qte.className = 'rp-rep-qte';
      qte.textContent = '×' + parTaille[t];

      ligne.appendChild(nom);
      ligne.appendChild(qte);
      hote.appendChild(ligne);
    });

    var ligneTotal = document.createElement('div');
    ligneTotal.className = 'rp-rep-total';
    var totalLbl = document.createElement('span');
    totalLbl.textContent = 'Total';
    var totalVal = document.createElement('span');
    totalVal.textContent = total + ' pièce' + (total > 1 ? 's' : '');
    ligneTotal.appendChild(totalLbl);
    ligneTotal.appendChild(totalVal);
    hote.appendChild(ligneTotal);
    hote.style.display = '';
  }
  window.majResumeRepartition = majResumeRepartition;

  /**
   * Ouvre le modal
   */
  window.openSizeQuantityModal = function() {
    confLog('📂 Ouverture du modal quantités par taille');
    
    const overlay = document.getElementById('size-qty-overlay');
    if (!overlay) {
      console.error('❌ Élément size-qty-overlay non trouvé !');
      return;
    }

    /* LA SAISIE EN COURS SURVIT À UNE FERMETURE SANS CONFIRMATION.

       `initSizeQuantities` recalcule tout depuis la liste VALIDÉE, ou à défaut
       depuis la taille et la quantité affichées. Appelée à chaque ouverture,
       elle écrasait donc une répartition que le client venait de composer puis
       de fermer par la croix ou « Annuler » — huit tailles à ressaisir.

       On ne réinitialise que si rien n'a encore été saisi dans cette session de
       modale. Une répartition CONFIRMÉE continue d'être rechargée par
       `initSizeQuantities` : elle est alors devenue la liste validée, et
       `saisieEnCours` a été remis à plat au même moment. */
    if (!saisieEnCours) {
      initSizeQuantities();
    } else {
      /* SAISIE EN COURS : on ne recalcule pas, mais on écoute quand même le
         panneau. Sans cet appel, un second réglage y était perdu — le premier
         ayant levé `saisieEnCours`, plus rien ne lisait la taille ni la
         quantité affichées. */
      appliquerConsigneDuPanneau();
    }
    renderSizeList();

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    confLog('✅ Modal quantités ouvert');
  };

  /**
   * Ferme le modal
   */
  window.closeSizeQuantityModal = function() {
    const overlay = document.getElementById('size-qty-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  /**
   * Récupère les quantités sélectionnées
   */
  window.getSizeQuantities = function() {
    return { ...sizeQuantities };
  };

  /**
   * Confirme les quantités et crée les lignes dans le système de commande groupe
   */
  window.confirmSizeQuantities = function() {
    confLog('✅ Confirmation des quantités par taille');
    
    const quantities = getSizeQuantities();
    
    // Filtrer les tailles avec quantité > 0
    const selectedSizes = Object.entries(quantities)
      .filter(([size, qty]) => qty > 0);
    
    if (selectedSizes.length === 0) {
      // confAlert : modale cohérente ; alert() natif en repli seulement.
      var msgEmpty = 'Veuillez sélectionner au moins une taille.';
      if (typeof window.confAlert === 'function') {
        window.confAlert(msgEmpty, { icon: 'warning', title: 'Aucune taille' });
      } else {
        alert(msgEmpty);
      }
      return;
    }
    
    // Calculer le total de pièces
    const totalQty = selectedSizes.reduce((sum, [_, qty]) => sum + qty, 0);
    
    // 🆕 Créer le résumé pour l'admin (format: "2×M, 3×L, 1×XL")
    const sizeGroupSummary = selectedSizes
      .map(([size, qty]) => `${qty}×${size}`)
      .join(', ');
    
    confLog(`📦 ${selectedSizes.length} tailles sélectionnées, ${totalQty} pièces au total`);
    confLog(`📊 Résumé groupe: ${sizeGroupSummary}`);
    
    // Récupérer la couleur actuellement sélectionnée
    const currentColor = getCurrentColor();
    
    // Créer les lignes pour groupOrderRows (utilisé par addToCart)
    const rows = [];
    selectedSizes.forEach(([size, qty]) => {
      // Créer qty lignes (une par pièce)
      for (let i = 0; i < qty; i++) {
        rows.push({
          name: '',  // Pas de nom floqué pour les commandes par tailles
          size: size,
          /* Repli « Noir » et non « Black » : c'est le nom de la palette du
             configurateur, celui que les images de produit attendent. Un nom
             anglais ici ne correspondrait à aucune teinte et la vignette
             retomberait sur une couleur générique. */
          color: currentColor.name || 'Noir',
          qty: 1, // Toujours 1 par ligne
          _sizeGroupSummary: sizeGroupSummary  // 🆕 Résumé pour l'admin
        });
      }
    });
    
    /* Enregistrement via setGroupOrderRows : elle mémorise la liste, la persiste
       en session et rafraîchit le badge.
       L'ancien code écrivait dans window.groupOrderRows, qui n'a jamais été
       exposé — sa garde `typeof !== 'undefined'` était fausse et la liste se
       perdait sans erreur visible. */
    if (typeof window.setGroupOrderRows === 'function') {
      window.setGroupOrderRows(rows);
    } else {
      console.warn('setGroupOrderRows indisponible : liste de tailles non enregistrée.');
    }
    
    /* La répartition est VALIDÉE : elle vit désormais dans la liste de groupe,
       que `initSizeQuantities` sait recharger. Le drapeau retombe donc — sans
       quoi une modification ultérieure de la taille ou de la quantité à
       l'écran ne serait plus jamais reprise. */
    saisieEnCours = false;

    /* ═══ LE PANNEAU REFLÈTE ENFIN LA RÉPARTITION ═══════════════════════════

       La confirmation enregistrait la liste, puis se taisait : le bloc
       QUANTITÉ affichait toujours « 1 » et le PRIX TOTAL le tarif d'une seule
       pièce, alors que dix partaient au panier. Le client voyait 60,00 € pour
       une commande qui en valait dix fois plus, sans aucun moyen de vérifier
       sa saisie autrement qu'en rouvrant cette modale.

       CE CHAMP EST LA QUANTITÉ DE LA TAILLE CHOISIE, PAS LE TOTAL.

       Il forme un couple avec le menu « Taille » posé juste à sa gauche :
       « M · 3 » se lit comme un tout. Y écrire le total (10) le mettait en
       contradiction avec son propre libellé — le client lisait « Taille M,
       Qté 10 » alors qu'il n'avait commandé que trois M.

       Le total, lui, a désormais sa place : le résumé juste sous le bouton,
       et le PRIX TOTAL, qui somme bien les dix pièces (voir `textileQty`
       dans conf-main-inline.js, qui lit la répartition quand elle existe).

       ⚠️ AVANT le relevé de `qteAuMomentDeLaConfirmation` ci-dessous, et c'est
       essentiel : ce repère sert à détecter que LE CLIENT a changé la quantité
       depuis. S'il retenait l'ancienne valeur, la réouverture prendrait notre
       propre écriture pour un geste du client et RÉ-AJOUTERAIT ces pièces une
       seconde fois (voir `initSizeQuantities`). */
    var champQte = document.getElementById('textile-qty-input');
    if (champQte) {
      /* Quantité de la taille ACTUELLEMENT sélectionnée dans le panneau. Si
         elle n'a rien reçu dans la répartition (0 pièce), on retombe sur la
         première taille servie : un « Qté 0 » sous un menu « Taille L »
         donnerait l'impression d'une commande vide. */
      var tailleCourante = '';
      var sgSel = document.querySelector('.sg:not(.cv-opt-clone)');
      var btnSel = (sgSel || document).querySelector('.sb.on:not(.sb-group)');
      if (btnSel) tailleCourante = btnSel.textContent.trim();

      var qteTaille = quantities[tailleCourante] || 0;
      if (!qteTaille) qteTaille = selectedSizes[0][1];

      champQte.value = qteTaille;

      /* Le prix suit, et le délai avec lui : `updateTotalPrice` appelle
         `majDelaiProduction` en première instruction. Tous deux comptent les
         pièces RÉELLES de la répartition, pas ce champ. */
      if (typeof window.updateTotalPrice === 'function') {
        window.updateTotalPrice();
      }

      /* La pastille « Taille & quantité » du téléphone se rafraîchit sur les
         événements `input` / `change` du champ. Une écriture par script n'en
         déclenche AUCUN : sans cet appel, elle annoncerait encore « M · 1 »
         sous une répartition de douze pièces.

         On appelle la fonction plutôt que de simuler un événement — un
         `dispatchEvent` réveillerait aussi tous les autres abonnés du
         document, effets de bord compris. */
      if (typeof window.majBoutonTailleQte === 'function') {
        window.majBoutonTailleQte();
      }

      /* Persistance explicite : les deux seuls chemins qui la déclenchaient
         sont les gestionnaires du champ, que cette écriture court-circuite.
         Sans cela, le rechargement restaurait « 1 » face à une répartition de
         douze pièces toujours mémorisée en session. */
      if (typeof window.persisterTailleQte === 'function') {
        window.persisterTailleQte();
      }
    }

    /* On retient le COUPLE affiché dans le panneau à cet instant — quantité ET
       taille : ce sont eux qui serviront de points de comparaison à la
       prochaine ouverture, pour savoir si le client y a touché entre-temps
       (voir `initSizeQuantities`).

       La taille compte autant que le nombre : passer de « M · 4 » à « XL · 4 »
       est un changement, même si la quantité ne bouge pas. */
    var champQteApres = document.getElementById('textile-qty-input');
    qteAuMomentDeLaConfirmation = champQteApres
      ? (parseInt(champQteApres.value, 10) || 0)
      : 0;

    var sgApres = document.querySelector('.sg:not(.cv-opt-clone)');
    var btnApres = (sgApres || document).querySelector('.sb.on:not(.sb-group)');
    tailleAuMomentDeLaConfirmation = btnApres ? btnApres.textContent.trim() : null;

    // Fermer le modal
    closeSizeQuantityModal();
    
    // Afficher un message de confirmation
    if (typeof window.confAlert === 'function') {
      window.confAlert(
        selectedSizes.map(([size, qty]) => `${qty}× ${size}`).join(', ') + 
        ` — Total : ${totalQty} pièce${totalQty > 1 ? 's' : ''}. Terminez votre design, puis « Ajouter au panier ».`,
        { icon: 'success', title: 'Quantités enregistrées' }
      );
    } else {
      alert(`✅ Quantités enregistrées :\n${selectedSizes.map(([size, qty]) => `${qty}× ${size}`).join('\n')}\n\nTotal : ${totalQty} pièces`);
    }
    
    confLog('✅ Quantités enregistrées dans groupOrderRows:', rows);
  };

  /**
   * Récupère la couleur actuellement sélectionnée
   */
  /**
   * Couleur actuellement choisie par le client.
   *
   * ═══ LE SÉLECTEUR PRÉCÉDENT N'EXISTAIT PAS ═══════════════════════════════
   *
   * Cette fonction cherchait `.cb.on` — une classe absente de tout le projet.
   * `querySelector` rendait donc toujours `null`, et la fonction retombait
   * SYSTÉMATIQUEMENT sur son repli « Black ».
   *
   * Le défaut ne s'arrêtait pas à l'affichage : cette couleur est écrite dans
   * chaque ligne de la répartition, et `r.color` sert ensuite à composer la
   * vignette du panier ET LA PLANCHE ENVOYÉE À L'ATELIER (conf-main-inline.js).
   * Dix-sept sweatshirts corail partaient en production sous la consigne
   * « noir ».
   *
   * On lit désormais la même source que le mode groupe : `currentColorName`,
   * tenue à jour par `selColor` à chaque changement de teinte, exposée via
   * `grpCurrentColor`. Une seule vérité pour les deux chemins de commande.
   */
  function getCurrentColor() {
    var nom = (typeof window.grpCurrentColor === 'function')
      ? window.grpCurrentColor()
      : null;

    /* Seul `name` est consommé (voir la création des lignes plus haut) : le
       `hex` retourné auparavant n'était lu nulle part. On ne le fabrique donc
       plus — une valeur inutilisée et fausse ne sert qu'à égarer la lecture.

       Repli sur « Noir », la valeur par défaut du configurateur lui-même
       (conf-main-inline.js), et non sur une couleur arbitraire. */
    return { name: nom || 'Noir' };
  }

  /* Liste restaurée depuis la session au chargement : le résumé doit
     reparaître, sinon une répartition mémorisée resterait invisible dans le
     panneau — elle serait pourtant bien commandée.

     `refreshGroupBadge` couvre déjà ce cas, mais l'ordre de chargement des
     deux fichiers n'est garanti par rien. Cet appel est idempotent et ne coûte
     qu'une lecture. */
  document.addEventListener('DOMContentLoaded', majResumeRepartition);

  // Initialisation
  confLog('✅ Modal Quantités par Taille initialisé');
  confLog('✅ Fonction window.openSizeQuantityModal disponible:', typeof window.openSizeQuantityModal);

})();
