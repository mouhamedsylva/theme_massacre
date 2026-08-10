/**
 * Product Images Switcher - Change les images selon le produit sélectionné
 */

// Configuration des images pour chaque produit
const PRODUCT_IMAGES = {
  sweatshirt: {
    face: 'sweatshirt-face.png',
    dos: 'sweatshirt-dos.png',
    // 'sweatshirt-t-cote.png' n'existe pas (coquille) : la vue « côté » du
    // sweatshirt restait cassée. Le fichier réel est sweatshirt-cote.png,
    // déjà utilisé correctement par l'entrée `extra` plus bas.
    cote: 'sweatshirt-cote.png'
  },
  tshirt: {
    face: 'tshirt-face.png',
    dos: 'tshirt-dos.png',
    cote: 'tshirt-cote.png'
  },
  tshirt_polyester: {
    face: 'tshirt-polyester-face.png',
    dos: 'tshirt-polyester-dos.png',
    cote: 'tshirt-polyester-cote.png'
  },
  extra: {
    face: 'sweatshirt-face.png',
    dos: 'sweatshirt-dos.png',
    cote: 'sweatshirt-cote.png'
  },
  drapeaux: {
    face: 'sweatshirt-face.png',
    dos: 'sweatshirt-dos.png',
    cote: 'sweatshirt-cote.png'
  },
  patches: {
    face: 'sweatshirt-face.png',
    dos: 'sweatshirt-dos.png',
    cote: 'sweatshirt-cote.png'
  }
};

class ProductImageSwitcher {
  constructor() {
    this.currentProduct = 'sweatshirt';
    this.currentView = 'face';
    this.init();
  }
  
  init() {
    confLog('🖼️ ProductImageSwitcher initialisé');
    this.bindProductCards();
  }
  
  bindProductCards() {
    // Écouter les clics sur les cartes de produit
    document.querySelectorAll('[data-product]').forEach(card => {
      card.addEventListener('click', (e) => {
        const productType = e.currentTarget.dataset.product;
        this.switchProduct(productType);
      });
    });
  }
  
  switchProduct(productType) {
    confLog('🔄 Changement de produit vers:', productType);
    
    // Mettre à jour le produit actuel
    this.currentProduct = productType;
    
    // Mettre à jour l'UI (carte active)
    document.querySelectorAll('[data-product]').forEach(card => {
      card.classList.remove('active');
    });
    document.querySelector(`[data-product="${productType}"]`)?.classList.add('active');

    // NOTE : le chargement des images textile (avec couleur) est désormais géré
    // par selProd()/updateProductImages() dans la page. On ne touche plus aux src ici
    // pour ne pas écraser la couleur sélectionnée.

    // Dispatch event pour autres composants
    document.dispatchEvent(new CustomEvent('product:changed', {
      detail: { productType }
    }));
  }
  
  updateImages(productType) {
    const images = PRODUCT_IMAGES[productType];

    if (!images) {
      console.warn('⚠️ Images non trouvées pour:', productType);
      return;
    }

    // Mettre à jour les 3 vues
    const viewFace = document.getElementById('view-face');
    const viewDos = document.getElementById('view-dos');
    const viewCote = document.getElementById('view-cote');

    if (viewFace && viewDos && viewCote) {
      // Utiliser le même pattern que les images actuelles
      const currentSrc = viewFace.src;
      const basePath = currentSrc.substring(0, currentSrc.lastIndexOf('/') + 1);

      // Construire les nouvelles URLs
      viewFace.src = basePath + images.face;
      viewDos.src = basePath + images.dos;
      viewCote.src = basePath + images.cote;

      confLog('✅ Images mises à jour:');
      confLog('  Face:', viewFace.src);
      confLog('  Dos:', viewDos.src);
      confLog('  Côté:', viewCote.src);
    } else {
      console.error('❌ Éléments d\'image non trouvés');
    }
  }
  
  changeView(viewName) {
    this.currentView = viewName;
  }
}

// Initialisation au chargement
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.productImageSwitcher = new ProductImageSwitcher();
  });
} else {
  window.productImageSwitcher = new ProductImageSwitcher();
}
