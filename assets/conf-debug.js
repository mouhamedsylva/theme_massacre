/**
 * conf-debug.js — Journalisation de développement, silencieuse en production.
 *
 * API (globale) :
 *   confLog(...args)   -> console.log, uniquement si le mode debug est actif
 *
 * Remplace les `console.log` de trace qui s'affichaient chez tous les clients :
 * bruit dans la console et fuite de détails d'implémentation (noms de fonctions,
 * catégories internes, identifiants de variants…).
 *
 * `console.warn` et `console.error` ne passent PAS par ici : une panne réelle
 * doit rester visible en production, y compris dans les rapports d'erreur.
 *
 * ── Activer les traces ────────────────────────────────────────────────────
 *   • ?debug=1 dans l'URL                     (le choix est mémorisé)
 *   • window.CONF_DEBUG = true en console     (effet immédiat, non mémorisé)
 *   • ?debug=0 pour désactiver et oublier le choix
 *
 * Chargé en SYNCHRONE et en premier : les scripts `defer` qui appellent
 * confLog() au niveau racine doivent la trouver déjà définie.
 */
(function () {
  if (window.confLog) return;   // évite une double définition

  var KEY = 'conf_debug';

  /* Le drapeau est lu une fois au chargement, puis relu à chaque appel via
     window.CONF_DEBUG : on peut donc l'activer depuis la console sans recharger. */
  try {
    var qs = String(window.location.search || '');
    if (/[?&]debug=1\b/.test(qs)) {
      window.CONF_DEBUG = true;
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    } else if (/[?&]debug=0\b/.test(qs)) {
      window.CONF_DEBUG = false;
      try { sessionStorage.removeItem(KEY); } catch (e) {}
    } else {
      try { window.CONF_DEBUG = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
    }
  } catch (e) {
    /* URL illisible (contexte exotique) : on reste silencieux, comme en prod. */
  }

  window.confLog = function () {
    if (!window.CONF_DEBUG) return;
    try {
      console.log.apply(console, arguments);
    } catch (e) {
      /* Console indisponible : une trace de debug ne doit jamais casser l'appelant. */
    }
  };
})();
