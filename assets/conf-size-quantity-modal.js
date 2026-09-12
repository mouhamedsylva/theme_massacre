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

       La nouvelle quantité S'AJOUTE donc à l'existant, sur la taille
       sélectionnée dans le panneau — c'est le sens du geste : « j'ajoute douze
       XL à ce que j'ai déjà ». */
    if (fromSizeModal) {
      saved.forEach(r => {
        if (r.size && sizeQuantities.hasOwnProperty(r.size)) {
          sizeQuantities[r.size] += (parseInt(r.qty, 10) || 1);
        }
      });

      /* La quantité du panneau a-t-elle changé depuis la confirmation ?
         Si oui, le client vient de la régler : on la reporte sur sa taille
         courante, EN PLUS de la répartition rechargée ci-dessus. */
      if (qteAuMomentDeLaConfirmation !== null) {
        const champ = document.getElementById('textile-qty-input');
        const qteActuelle = champ ? (parseInt(champ.value, 10) || 0) : 0;

        if (qteActuelle !== qteAuMomentDeLaConfirmation && qteActuelle > 0) {
          const sgSrcMaj = document.querySelector('.sg:not(.cv-opt-clone)');
          const btnMaj = (sgSrcMaj || document).querySelector('.sb.on:not(.sb-group)');
          const tailleMaj = btnMaj ? btnMaj.textContent.trim() : '';
          if (tailleMaj && sizeQuantities.hasOwnProperty(tailleMaj)) {
            sizeQuantities[tailleMaj] += qteActuelle;
          }
          /* Le repère avance : sans cela, la même quantité serait ré-ajoutée à
             chaque ouverture de la modale, et le total gonflerait tout seul. */
          qteAuMomentDeLaConfirmation = qteActuelle;

          /* L'APPORT N'EST PAS ENCORE DANS LA LISTE VALIDÉE — il ne le sera
             qu'à la confirmation. Sans ce drapeau, la réouverture SUIVANTE
             recalculerait tout depuis cette liste et les pièces ajoutées
             disparaîtraient : le client les voyait, fermait, rouvrait, et
             elles n'étaient plus là.

             `saisieEnCours` fige l'état en mémoire, exactement comme une
             saisie manuelle aux compteurs. */
          saisieEnCours = true;
        }
      }
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

       Le repère de confirmation part, lui : la répartition validée n'a plus
       cours. */
    saisieEnCours = true;
    qteAuMomentDeLaConfirmation = null;
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

    /* On retient la quantité affichée dans le panneau à cet instant : c'est
       elle qui servira de point de comparaison à la prochaine ouverture, pour
       savoir si le client l'a modifiée entre-temps (voir
       `initSizeQuantities`). */
    var champQteApres = document.getElementById('textile-qty-input');
    qteAuMomentDeLaConfirmation = champQteApres
      ? (parseInt(champQteApres.value, 10) || 0)
      : 0;

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

  // Initialisation
  confLog('✅ Modal Quantités par Taille initialisé');
  confLog('✅ Fonction window.openSizeQuantityModal disponible:', typeof window.openSizeQuantityModal);

})();
