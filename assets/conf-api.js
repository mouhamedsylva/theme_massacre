/**
 * Client API - appels vers le backend NestJS (customizer-backend)
 * L'URL de base est définie par window.API_BASE (voir configurateur.liquid).
 */
window.ConfAPI = (function () {
  function base() {
    return (window.API_BASE || '').replace(/\/$/, '');
  }

  
  // Requête JSON générique
  async function jsonRequest(path, method, body) {
    const res = await fetch(base() + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || ('Erreur ' + res.status);
      throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    return data;
  }

  return {
    // Créer une commande
    createOrder(payload) {
      return jsonRequest('/orders', 'POST', payload);
    },
    // Lister les commandes
    listOrders() {
      return jsonRequest('/orders', 'GET');
    },
    // Envoyer une demande de devis (coins)
    createQuote(payload) {
      return jsonRequest('/quotes', 'POST', payload);
    },
    // Upload d'un logo (fichier) -> renvoie { url, publicId, ... }
    async uploadLogo(file) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(base() + '/uploads/logo', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.message) || 'Échec upload');
      return data;
    },
    // Upload d'un aperçu (Blob/File) -> renvoie { url, publicId, ... }
    // Optimisé côté serveur puis stocké dans le dossier previews Cloudinary.
    async uploadPreview(blob, filename) {
      const form = new FormData();
      form.append('file', blob, filename || 'preview.png');
      const res = await fetch(base() + '/uploads/preview', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.message) || 'Échec upload aperçu');
      return data;
    },
    // Partager un design -> { shareId, shareUrl }
    shareDesign(designData) {
      return jsonRequest('/export/share', 'POST', { designData: designData });
    },
    // Récupère un design partagé par son id -> designData
    getSharedDesign(shareId) {
      return jsonRequest('/export/share/' + encodeURIComponent(shareId), 'GET');
    },
    // Composer une image du design (fond + logos) -> { url } Cloudinary
    createPreviewImage(background, logos) {
      return jsonRequest('/export/preview-image', 'POST', {
        background: background,
        logos: logos || []
      });
    },
    // Composer une image multi-vues (face + dos + côté) -> { url } Cloudinary
    // views: [{ label, background, logos: [{ src, x, y, w }] }, ...]
    createMultiViewImage(views) {
      return jsonRequest('/export/preview-multi', 'POST', { views: views || [] });
    },
    // Vérifier la disponibilité du backend
    health() {
      return jsonRequest('/health', 'GET');
    }
  };
})();
