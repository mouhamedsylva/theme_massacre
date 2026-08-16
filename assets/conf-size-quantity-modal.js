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

    if (fromSizeModal) {
      saved.forEach(r => {
        if (r.size && sizeQuantities.hasOwnProperty(r.size)) {
          sizeQuantities[r.size] += (parseInt(r.qty, 10) || 1);
        }
      });
      return;
    }

    /* Sinon : 1 sur la taille actuellement sélectionnée. On vise le bloc
       SOURCE — le clone du menu canvas peut porter un état « on » différent
       (il n'est recopié qu'une fois, à la première ouverture). */
    const sgSrc = document.querySelector('.sg:not(.cv-opt-clone)');
    const selectedBtn = (sgSrc || document).querySelector('.sb.on:not(.sb-group)');
    if (selectedBtn) {
      const selectedSize = selectedBtn.textContent.trim();
      if (sizeQuantities.hasOwnProperty(selectedSize)) {
        sizeQuantities[selectedSize] = 1;
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
    /* Re-rendu complet : il rafraîchit aussi l'état désactivé du bouton −, le
       total et le résumé — exactement ce que fait le chemin des boutons. */
    renderSizeList();
  };

  window.changeSizeQuantity = function(sizeName, delta) {
    const currentQty = sizeQuantities[sizeName] || 0;
    const newQty = Math.max(0, currentQty + delta);
    
    sizeQuantities[sizeName] = newQty;
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

    initSizeQuantities();
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
          color: currentColor.name || 'Black',
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
  function getCurrentColor() {
    const selectedBtn = document.querySelector('.cb.on');
    if (selectedBtn) {
      return {
        name: selectedBtn.getAttribute('data-color') || selectedBtn.getAttribute('title') || 'Black',
        hex: selectedBtn.style.background || '#000000'
      };
    }
    return { name: 'Black', hex: '#000000' };
  }

  // Initialisation
  confLog('✅ Modal Quantités par Taille initialisé');
  confLog('✅ Fonction window.openSizeQuantityModal disponible:', typeof window.openSizeQuantityModal);

})();
