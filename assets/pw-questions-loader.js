/* ============================================================
   POPOTE WAR — CHARGEUR DE QUESTIONS (Firestore)
   ------------------------------------------------------------
   Remplace l'ancien pw-questions.js, qui embarquait 560 Ko de
   questions dans CHAQUE chargement de page.

   Principe :
     • les questions vivent dans Firestore, découpées en lots ;
     • on ne télécharge QUE l'armée sélectionnée, et une seule fois ;
     • le résultat est mis en cache dans localStorage, versionné —
       les visites suivantes ne déclenchent aucune lecture réseau ;
     • si Firestore est indisponible, le jeu reste jouable avec les
       questions « maison » embarquées dans popote-war.js.

   Structure côté Firestore :
     questions/index        -> { v: 2, armies: { terre: 2, air: 2, marine: 2 } }
     questions/terre_0      -> { json: "[ …300 questions… ]" }
     questions/terre_1      -> { json: "[ … ]" }
     …

   Le contenu est stocké en CHAÎNE JSON et non en tableau d'objets :
   Firestore n'indexe pas les chaînes longues de la même façon, on
   évite ainsi de gonfler les index pour des données qu'on ne requête
   jamais champ par champ. Une lecture = un lot entier.
   ============================================================ */
(() => {
  "use strict";

  const CACHE_PREFIX = "pw_qbank_";
  const CACHE_VER_KEY = "pw_qbank_ver";

  // Liste unique des armées : « tout » développe vers celle-ci, et c'est
  // aussi elle qu'on purge du cache. Ajouter une armée = une seule ligne.
  const ALL_ARMIES = ["terre", "air", "marine", "gendarmerie", "police", "pompier"];

  const state = {
    ready: false,        // l'index a-t-il été lu ?
    version: 0,
    parts: {},           // { terre: 2, air: 2, marine: 2 }
    counts: {},          // { terre: 1039, air: 744, marine: 687 }
    loaded: {},          // armées déjà injectées dans QUESTIONS
    pending: {},         // promesses en cours, pour ne pas charger deux fois
  };

  function db() {
    return (window.firebase && window.PW_FIREBASE && window.PW_FIREBASE.enabled)
      ? firebase.firestore() : null;
  }

  /* ---------- cache local ---------- */
  function cacheGet(army) {
    try {
      if (String(localStorage.getItem(CACHE_VER_KEY)) !== String(state.version)) return null;
      const raw = localStorage.getItem(CACHE_PREFIX + army);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function cacheSet(army, arr) {
    // Les DONNÉES d'abord, la VERSION seulement si l'écriture a réussi.
    // Dans l'ordre inverse, un dépassement de quota sur les données laissait
    // une version enregistrée sans contenu : cacheGet renvoyait toujours null
    // et le jeu retéléchargeait tout, à chaque visite, silencieusement.
    const payload = JSON.stringify(arr);
    try {
      localStorage.setItem(CACHE_PREFIX + army, payload);
      localStorage.setItem(CACHE_VER_KEY, String(state.version));
    } catch (e) {
      // Quota dépassé : on sacrifie les autres armées pour garder celle-ci.
      try {
        ALL_ARMIES.forEach((a) => { if (a !== army) localStorage.removeItem(CACHE_PREFIX + a); });
        localStorage.setItem(CACHE_PREFIX + army, payload);
        localStorage.setItem(CACHE_VER_KEY, String(state.version));
      } catch (e2) {
        // Vraiment pas de place : on repart propre plutôt que de laisser un
        // cache à moitié écrit qui ne servirait jamais.
        cacheClear();
      }
    }
  }
  function cacheClear() {
    try {
      ALL_ARMIES.forEach((a) => localStorage.removeItem(CACHE_PREFIX + a));
      localStorage.removeItem(CACHE_VER_KEY);
    } catch (e) {}
  }

  /* ---------- lecture de l'index ---------- */
  let indexFailAt = 0;   // horodatage du dernier échec

  async function readIndex() {
    if (state.ready) return true;
    // Après un échec (hors ligne, règles non déployées), on ne retente pas
    // avant 30 s : sinon chaque lancement de partie relançait une lecture
    // lente et rallumait la barre de chargement pour rien.
    if (indexFailAt && Date.now() - indexFailAt < 30000) return false;
    const d = db(); if (!d) return false;
    try {
      const snap = await d.collection("questions").doc("index").get();
      if (!snap.exists) {
        console.warn("[PWQ] index absent — lance admin-questions.html une fois.");
        indexFailAt = Date.now();
        return false;
      }
      const data = snap.data();
      const v = data.v | 0;
      // Nouvelle version publiée : le cache local est périmé.
      if (String(localStorage.getItem(CACHE_VER_KEY)) !== String(v)) cacheClear();
      state.version = v;
      state.parts = data.armies || {};
      state.counts = data.counts || {};   // effectifs réels, sans téléchargement
      state.ready = true;
      indexFailAt = 0;
      return true;
    } catch (e) {
      console.warn("[PWQ] lecture de l'index impossible", e);
      indexFailAt = Date.now();
      return false;
    }
  }

  /* ---------- chargement d'une armée ---------- */
  async function fetchArmy(army) {
    const cached = cacheGet(army);
    if (cached) return cached;

    const d = db(); if (!d) return [];
    const n = state.parts[army] | 0;
    if (!n) return [];

    const reads = [];
    for (let i = 0; i < n; i++) reads.push(d.collection("questions").doc(army + "_" + i).get());
    const snaps = await Promise.all(reads);

    let out = [];
    snaps.forEach((s) => {
      if (!s.exists) return;
      try { out = out.concat(JSON.parse(s.data().json || "[]")); }
      catch (e) { console.warn("[PWQ] lot illisible", s.id, e); }
    });
    if (out.length) cacheSet(army, out);
    return out;
  }

  /* ---------- API publique ---------- */
  const API = {
    /* Garantit que les questions de cette armée sont disponibles dans
       window.PW_QUESTIONS_BANK. « tout » charge les trois armées.
       Idempotent, et jamais deux chargements simultanés pour la même armée. */
    async ensure(armyId) {
      const list = (!armyId || armyId === "tout") ? ALL_ARMIES.slice() : [armyId];
      const todo = list.filter((a) => !state.loaded[a]);
      if (!todo.length) return true;

      if (!(await readIndex())) return false;

      await Promise.all(todo.map((a) => {
        if (state.pending[a]) return state.pending[a];
        state.pending[a] = fetchArmy(a).then((arr) => {
          if (arr.length && !state.loaded[a]) {
            state.loaded[a] = true;
            window.PW_QUESTIONS_BANK.push(...arr);
            if (typeof window.PW_ON_QUESTIONS === "function") window.PW_ON_QUESTIONS(a, arr.length);
          }
          state.pending[a] = null;
          return arr;
        }).catch((e) => {
          console.warn("[PWQ] chargement " + a, e);
          state.pending[a] = null;
          return [];
        });
        return state.pending[a];
      }));
      return true;
    },

    isLoaded(armyId) {
      const list = (!armyId || armyId === "tout") ? ALL_ARMIES.slice() : [armyId];
      return list.every((a) => state.loaded[a]);
    },
    count() { return window.PW_QUESTIONS_BANK.length; },

    /* Effectif TOTAL d'une armée dans la banque, qu'elle soit chargée ou non.
       Renvoie null tant que l'index n'a pas été lu : l'appelant sait alors
       qu'il doit se rabattre sur ce qu'il a en mémoire. */
    total(armyId) {
      if (!state.ready || !state.counts) return null;
      const list = (!armyId || armyId === "tout") ? ALL_ARMIES.slice() : [armyId];
      return list.reduce((a, k) => a + (state.counts[k] || 0), 0);
    },
    // Déclenche la lecture de l'index sans rien télécharger d'autre.
    warm() { return readIndex(); },
    version() { return state.version; },
    clearCache() { cacheClear(); },
  };

  // Le tableau existe DÈS LE DÉPART, vide : popote-war.js le fusionne au
  // démarrage sans avoir à attendre, et le jeu reste jouable avec ses
  // questions maison le temps que le réseau réponde.
  window.PW_QUESTIONS_BANK = [];
  window.PWQuestions = API;
})();
