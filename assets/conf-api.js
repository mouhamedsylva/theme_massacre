/**
 * Client API - appels vers le backend NestJS (customizer-backend)
 * L'URL de base est définie par window.API_BASE (voir configurateur.liquid).
 */
window.ConfAPI = (function () {
  function base() {
    return (window.API_BASE || '').replace(/\/$/, '');
  }

  
  /* LIMITE DE DÉBIT (429) : on patiente et on réessaie, au lieu d'abandonner.
     Une commande de groupe enchaîne un appel par personne ; un refus
     ponctuel faisait perdre une fiche de production ou un fichier de
     découpe, sans autre trace qu'un message dans la console. Le délai vient
     de l'en-tête Retry-After (exposé par le backend), borné à 20 s. */
  function attente(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function fetchAvecReessai(url, init) {
    for (let essai = 0; ; essai++) {
      const res = await fetch(url, init);
      if (res.status !== 429 || essai >= 3) return res;
      const s = Number(res.headers.get('Retry-After'));
      await attente(Math.min(isFinite(s) && s > 0 ? s * 1000 : 5000 * (essai + 1), 20000));
    }
  }

  /* Message lisible par le client, en français, selon le statut HTTP. Le
     détail technique (souvent en anglais : validation, throttler) reste dans
     la console pour le diagnostic. */
  function messageErreur(res, data, defaut) {
    const brut = (data && (data.message || data.error)) || '';
    if (brut) console.warn('API ' + res.status + ' :', brut);
    if (res.status === 429) return 'Trop de demandes en peu de temps : patientez une minute puis réessayez.';
    if (res.status === 413) return 'Fichier ou demande trop volumineux.';
    if (res.status === 400 && brut) {
      const txt = Array.isArray(brut) ? brut.join(', ') : String(brut);
      // Messages métier du backend (en français) : affichés tels quels.
      return /[éèàùç]|fichier|devis|prix|quantit/i.test(txt) ? txt : 'Certaines informations sont invalides.';
    }
    if (res.status >= 500) return defaut || 'Le serveur est momentanément indisponible. Réessayez dans un instant.';
    return (Array.isArray(brut) ? brut.join(', ') : brut) || defaut || ('Erreur ' + res.status);
  }

  // Requête JSON générique
  async function jsonRequest(path, method, body) {
    const res = await fetchAvecReessai(base() + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(messageErreur(res, data));
    return data;
  }

  // Envoi multipart (fichier) avec les mêmes réessais et messages.
  async function envoyerFichier(path, form, defaut) {
    const res = await fetchAvecReessai(base() + path, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(messageErreur(res, data, defaut));
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
      return envoyerFichier('/uploads/logo', form, 'Échec de l’envoi du logo.');
    },
    // Upload d'un aperçu (Blob/File) -> renvoie { url, publicId, ... }
    // Optimisé côté serveur puis stocké dans le dossier previews Cloudinary.
    async uploadPreview(blob, filename) {
      const form = new FormData();
      form.append('file', blob, filename || 'preview.png');
      return envoyerFichier('/uploads/preview', form, 'Échec de l’envoi de l’aperçu.');
    },
      /* Piece jointe d'une demande de devis (image OU PDF).

         Route distincte de /uploads/logo : ce dernier fait passer le buffer par
         sharp cote serveur, qui echoue sur un PDF. /uploads/piece-jointe envoie
         le fichier tel quel (Cloudinary resource_type auto). */
      async uploadPieceJointe(file) {
        const form = new FormData();
        form.append('file', file, (file && file.name) ? file.name : 'piece-jointe');
        return envoyerFichier('/uploads/piece-jointe', form, 'Échec de l’envoi du fichier.');
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
