/* ============================================================
   POPOTE WAR — configuration Firebase — VERSION EUROPE (popotewar-eu)
   ------------------------------------------------------------
   C'est LE fichier de la BASCULE. Quand tu remplaces le contenu de
   `firebase-config.js` (dans les assets du thème Shopify) par celui-ci,
   TOUS les joueurs passent sur le serveur Europe (~20 ms au lieu de ~150).

   POUR TESTER AVANT (sans impacter le site) : mets ce contenu dans le
   `firebase-config.js` de ton thème BROUILLON (« COPIE DE MASSACRE EN
   BLANC ») et prévisualise-le. Le jeu en direct reste sur l'ancien serveur.

   POUR BASCULER : remplace `firebase-config.js` du thème PUBLIÉ par ce contenu.
   POUR REVENIR EN ARRIÈRE : remets l'ancien `firebase-config.js` (projet popotewar).
   ============================================================ */
window.PW_FIREBASE = {
  enabled: true,

  config: {
    apiKey: "AIzaSyCJacuyCN6QSTOZXdgCw4_C42K-05rvCE4",
    authDomain: "popotewar-eu.firebaseapp.com",
    projectId: "popotewar-eu",
    storageBucket: "popotewar-eu.firebasestorage.app",
    messagingSenderId: "254278762880",
    appId: "1:254278762880:web:5541d845003e0d36e40165",
    measurementId: "G-FJ857FSRQJ",
  },

  // Fonctions déployées en Europe -> la région DOIT être europe-west1.
  region: "europe-west1",

  useFunctions: true,
};
