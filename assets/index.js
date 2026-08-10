/* ============================================================
   POPOTE WAR — Cloud Functions (Firebase)
   ------------------------------------------------------------
   Règlement SÉCURISÉ des mises 1v1 (anti-triche) : c'est le serveur,
   et lui seul, qui débite les mises et paie le pot. Le client ne peut
   pas s'auto-créditer (cf. règles "production-strict" dans firestore.rules).
   ------------------------------------------------------------
   Déploiement (nécessite le plan Blaze) :
     firebase deploy --only functions
   ============================================================ */
// API v1 explicite : `runWith` et `https.onCall` sont l'API 1re génération.
// Depuis firebase-functions v5, l'import racine n'expose plus toujours ces
// helpers — on cible donc /v1 pour un déploiement fiable.
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

/* ============================================================
   ÉCONOMIE SERVEUR (miroir de popote-war.js — GARDER SYNCHRONISÉ)
   ------------------------------------------------------------
   Ces constantes/formules DOIVENT rester identiques à celles du client
   (popote-war.js). Le client s'en sert pour l'AFFICHAGE ; le serveur, lui,
   fait AUTORITÉ sur les coins (et le niveau/xp/prestige, qui conditionnent
   des gains de coins). Le client ne peut plus écrire aucun de ces champs
   (cf. firestore.rules) : toute variation passe par une Cloud Function.
   ============================================================ */
const MAX_LEVEL = 55;
const PRESTIGE_MAX = 10;
const xpForLevel = (lvl) => 100 + (lvl - 1) * 22;
function prestigeCoinMult(p) { return 1 + Math.min(PRESTIGE_MAX, p || 0) * 0.04; }
function levelReward(lvl) {
  if (lvl >= MAX_LEVEL) return { coins: 4000, item: null };
  if (lvl % 10 === 0) return { coins: 1000, item: "fusil" };
  if (lvl % 5 === 0)  return { coins: 400, item: lvl % 15 === 0 ? "montre" : "casque" };
  return { coins: 90 + Math.floor(lvl / 5) * 25, item: null };
}
// Applique un gain d'XP à {coins, coinsEarned, level, xp}, muté en place. Ne
// touche PAS aux objets : ils restent gérés côté client (aucune valeur
// monétaire), qui les octroie en comparant le niveau avant/après.
function applyXp(p, amt) {
  if ((p.level || 1) >= MAX_LEVEL) { p.xp = 0; return; }
  p.xp = (p.xp || 0) + amt;
  while ((p.level || 1) < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level += 1;
    const c = levelReward(p.level).coins;
    p.coins += c; p.coinsEarned += c;
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
}
// Roue (miroir de WHEEL) et calendrier (miroir de WEEK_REWARDS).
const WHEEL = [
  { type: "coins", val: 50, w: 24 }, { type: "item", key: "fusil", w: 12 },
  { type: "coins", val: 100, w: 18 }, { type: "none", w: 12 },
  { type: "coins", val: 250, w: 10 }, { type: "item", key: "casque", w: 10 },
  { type: "coins", val: 500, w: 4 }, { type: "item", key: "montre", w: 10 },
];
const WEEK_REWARDS = [
  { kind: "coins", val: 100 }, { kind: "coins", val: 200 }, { kind: "item", item: "montre" },
  { kind: "coins", val: 350 }, { kind: "item", item: "casque" }, { kind: "coins", val: 500 },
  { kind: "jackpot", val: 1000, item: "fusil" },
];
// Coûts des objets d'arsenal (miroir des lignes `type:"item"` de SHOP).
const ITEM_COSTS = { montre: 300, ration: 400, casque: 500, jumelles: 550, fusil: 700, fumigene: 750, grenade: 900 };
function pickWeighted(arr) {
  const tot = arr.reduce((a, s) => a + s.w, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < arr.length; i++) { r -= arr[i].w; if (r <= 0) return i; }
  return 0;
}
// Jour calendaire SERVEUR (UTC) : infalsifiable, contrairement à l'heure du client.
function serverDayStamp() { const d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
function daysBetweenStamp(a, b) {
  const p = (s) => Date.UTC(Math.floor(s / 10000), Math.floor(s / 100) % 100 - 1, s % 100);
  return Math.round((p(b) - p(a)) / 86400000);
}

/* Règle "8 Ball Pool" : chaque joueur a misé `stake`.
   Gagnant -> rafle 2x la mise ; perdant -> perd sa mise ; égalité -> remboursé.
   ------------------------------------------------------------
   AUTORITÉ SERVEUR. C'est ici, et NULLE PART ailleurs, que les coins d'un match
   bougent : escrow (retrait de la mise), paiement du pot, coins de palier. Le
   client ne peut plus se créditer lui-même. Le vainqueur, lui, reste décidé par
   le déroulé de la partie inscrit dans le salon (manches + points, effets
   d'objets compris) — ça, deux vrais joueurs doivent le produire ensemble.
   Renvoie l'état à jour de l'APPELANT pour rafraîchir son écran. */
exports.settleMatch = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const roomId = String(data && data.roomId || "");
  if (!roomId) throw new functions.https.HttpsError("invalid-argument", "roomId manquant.");
  const uid = context.auth.uid;
  const roomRef = db.collection("rooms").doc(roomId);

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new functions.https.HttpsError("not-found", "Salon introuvable.");
    const room = roomSnap.data();
    const { hostUid, guestUid } = room;
    if (!hostUid || !guestUid) throw new functions.https.HttpsError("failed-precondition", "Salon incomplet.");
    if (uid !== hostUid && uid !== guestUid) throw new functions.https.HttpsError("permission-denied", "Pas un participant.");

    const hostRef = db.collection("profiles").doc(hostUid);
    const guestRef = db.collection("profiles").doc(guestUid);
    const hostSnap = await tx.get(hostRef);
    const guestSnap = await tx.get(guestRef);
    const hp = hostSnap.data() || {}, gp = guestSnap.data() || {};

    const meState = (p) => ({ coins: p.coins || 0, coinsEarned: p.coinsEarned || 0, level: p.level || 1, xp: p.xp || 0 });

    // Déjà réglé : idempotent — on renvoie juste l'état courant de l'appelant.
    if (room.settled) {
      return { ok: true, already: true, winner: room.winner || null, you: meState(uid === hostUid ? hp : gp) };
    }

    const winner = room.winner || null; // hostUid | guestUid | null (égalité)
    // Mise EFFECTIVE bornée au solde des deux joueurs : personne ne passe sous
    // zéro et le pot n'excède jamais ce que les deux ont réellement misé (pas de
    // création de coins à partir de rien).
    const stake = Math.max(0, Math.min(room.stake || 0, hp.coins || 0, gp.coins || 0));

    const H = meState(hp), G = meState(gp);
    H.coins -= stake; G.coins -= stake;
    if (winner === hostUid) {
      const bonus = Math.round(stake * (prestigeCoinMult(hp.prestige) - 1));
      H.coins += stake * 2 + bonus; H.coinsEarned += stake + bonus;
    } else if (winner === guestUid) {
      const bonus = Math.round(stake * (prestigeCoinMult(gp.prestige) - 1));
      G.coins += stake * 2 + bonus; G.coinsEarned += stake + bonus;
    } else { H.coins += stake; G.coins += stake; } // égalité : remboursé

    // XP / niveaux / coins de palier (mêmes formules que le client).
    applyXp(H, winner === hostUid ? 50 : 20);
    applyXp(G, winner === guestUid ? 50 : 20);

    tx.update(hostRef, { coins: H.coins, coinsEarned: H.coinsEarned, level: H.level, xp: H.xp });
    tx.update(guestRef, { coins: G.coins, coinsEarned: G.coinsEarned, level: G.level, xp: G.xp });
    tx.update(roomRef, { settled: true, status: "done", winner: winner, settledAt: admin.firestore.FieldValue.serverTimestamp() });
    return { ok: true, winner, you: uid === hostUid ? H : G };
  });
});

/* ============================================================
   VRAIS CODES PROMO SHOPIFY
   ------------------------------------------------------------
   ⚠️ NOUVEAU SYSTÈME SHOPIFY (2026). Depuis janvier 2026, Shopify ne fournit
   PLUS de jeton statique "shpat_" pour les apps personnalisées : on obtient un
   ID CLIENT + un SECRET (via le "Dev Dashboard"), qu'on échange contre un jeton
   d'accès à la volée avec le "Client Credentials Grant" (CCG). Le code ci-dessous
   fait cet échange tout seul — le jeton n'est jamais stocké, il est demandé au
   besoin.

   Config à faire AVANT déploiement (une seule fois) :

   1) Fichier  functions/.env  :
        SHOPIFY_STORE=kaonisweat
      (= le préfixe .myshopify.com de la boutique)

   2) Enregistrer l'ID client ET le secret de l'app en secrets Firebase
      (jamais écrits sur le disque) :
        firebase functions:secrets:set SHOPIFY_CLIENT_ID
        firebase functions:secrets:set SHOPIFY_CLIENT_SECRET
      Ces deux valeurs sont dans le Dev Dashboard de l'app > Paramètres >
      Identifiants (ID client + Secret).

   3) L'app doit déclarer les permissions "réductions" (write_discounts,
      read_discounts, write_price_rules) dans sa configuration, puis publier une
      nouvelle version (Shopify CLI). Sans ça, le jeton CCG n'aura pas le droit
      de créer des codes. Voir le guide fourni.

   Node 20 : fetch() natif, pas besoin de node-fetch.
   ============================================================ */

// `runWith({ secrets: [...] })` injecte ces secrets dans process.env à
// l'exécution. On a maintenant besoin de l'ID client ET du secret (CCG).
const SHOPIFY_RUNTIME = { secrets: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"] };

/* Échange ID client + secret -> jeton d'accès Admin, via Client Credentials
   Grant. Le jeton est mis en cache le temps de sa validité pour ne pas le
   redemander à chaque code créé. */
let _tokenCache = { token: null, exp: 0 };
async function getAdminToken() {
  if (_tokenCache.token && _tokenCache.exp > Date.now() + 60000) return _tokenCache.token;
  // .trim() INDISPENSABLE : un `secrets:set` colle facilement un espace ou un
  // retour à la ligne à la fin de la valeur. Un client_id « a25...\n » n'est
  // alors pas reconnu par Shopify -> erreur « application_cannot_be_found ».
  const store = (process.env.SHOPIFY_STORE || "").trim();
  const id = (process.env.SHOPIFY_CLIENT_ID || "").trim();
  const secret = (process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (!store || !id || !secret) {
    throw new functions.https.HttpsError("failed-precondition",
      "Shopify non configuré : vérifie functions/.env (SHOPIFY_STORE) et les secrets " +
      "SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET.");
  }
  // IMPORTANT : Shopify exige application/x-www-form-urlencoded pour cet
  // échange (PAS du JSON — le JSON fait renvoyer une page d'erreur HTML).
  const form = new URLSearchParams({
    client_id: id, client_secret: secret, grant_type: "client_credentials",
  });
  const res = await fetch(`https://${store}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new functions.https.HttpsError("internal", "Shopify (échange de jeton CCG) : " + (await res.text()));
  }
  const j = await res.json();
  _tokenCache = { token: j.access_token, exp: Date.now() + ((j.expires_in || 3600) * 1000) };
  return _tokenCache.token;
}

// Définitions SERVEUR des récompenses. La valeur de la réduction est fixée
// ICI, jamais confiée au client — sinon n'importe qui pourrait s'auto-attribuer
// un code -100 %.
const SHOP_REWARDS = {
  shop5:     { title: "CODE -5 %",          cost: 2500,  kind: "percent",  value: 5 },
  shop10:    { title: "CODE -10 %",         cost: 5000,  kind: "percent",  value: 10 },
  freeship:  { title: "LIVRAISON OFFERTE",  cost: 4500,  kind: "shipping" },
  shop15:    { title: "CODE -15 %",         cost: 10000, kind: "percent",  value: 15, minSubtotal: 40 },
  // PATCH OFFERT : 100 % de réduction limitée à la collection Patch (id ci-dessous),
  // un seul article (allocation_limit: 1). La collection doit contenir des patchs
  // pour que le code serve. Si tu changes de collection, remplace collectionId.
  shoppatch: { title: "PATCH OFFERT", cost: 12000, kind: "collection_free", collectionId: 687307293006 },
  shop20:    { title: "CODE -20 %",         cost: 18000, kind: "percent",  value: 20, minSubtotal: 60 },
};
const WHEEL_REWARDS = {
  wheel5:    { title: "CODE -5 %",         kind: "percent",  value: 5 },
  wheel10:   { title: "CODE -10 %",        kind: "percent",  value: 10 },
  wheelship: { title: "LIVRAISON OFFERTE", kind: "shipping" },
};
const FLASH_REWARD = { title: "OFFRE ÉCLAIR -15 %", kind: "percent", value: 15, usageLimit: 1, expiresMinutes: 10 };

function genCode() {
  return "MSCR-" + Math.random().toString(16).slice(2, 6).toUpperCase() + Math.random().toString(16).slice(2, 4).toUpperCase();
}

async function createShopifyDiscount(def, code) {
  const store = process.env.SHOPIFY_STORE;
  const token = await getAdminToken(); // jeton obtenu à la volée (CCG)
  const base = `https://${store}.myshopify.com/admin/api/2024-10`;
  const headers = { "Content-Type": "application/json", "X-Shopify-Access-Token": token };

  const pr = {
    title: `POPOTE WAR — ${code}`,
    value_type: "percentage",
    customer_selection: "all",
    starts_at: new Date().toISOString(),
    // USAGE UNIQUE : usage_limit 1 = le code ne peut être utilisé qu'UNE fois
    // au total (première commande qui l'emploie = épuisé). once_per_customer
    // ajoute une ceinture : jamais deux fois par le même compte client.
    usage_limit: def.usageLimit || 1,
    once_per_customer: true,
  };
  if (def.kind === "shipping") {
    // Livraison offerte : 100 % sur les frais de port.
    pr.target_type = "shipping_line";
    pr.target_selection = "all";
    pr.allocation_method = "each";
    pr.value = "-100.0";
  } else if (def.kind === "collection_free") {
    // Patch offert : 100 % de réduction, UNIQUEMENT sur la collection visée,
    // limitée à UN article (allocation_limit) — donc un seul patch gratuit.
    pr.target_type = "line_item";
    pr.target_selection = "entitled";
    pr.entitled_collection_ids = [def.collectionId];
    pr.allocation_method = "each";
    pr.allocation_limit = 1;
    pr.value = "-100.0";
  } else {
    // Réduction en pourcentage sur toute la commande.
    pr.target_type = "line_item";
    pr.target_selection = "all";
    pr.allocation_method = "across";
    pr.value = `-${def.value || 100}.0`;
  }
  if (def.minSubtotal) pr.prerequisite_subtotal_range = { greater_than_or_equal_to: String(def.minSubtotal) };
  if (def.expiresMinutes) pr.ends_at = new Date(Date.now() + def.expiresMinutes * 60000).toISOString();
  const priceRule = { price_rule: pr };
  const prRes = await fetch(`${base}/price_rules.json`, { method: "POST", headers, body: JSON.stringify(priceRule) });
  if (!prRes.ok) throw new functions.https.HttpsError("internal", "Erreur Shopify (price_rule) : " + (await prRes.text()));
  const priceRuleId = (await prRes.json()).price_rule.id;

  const dcRes = await fetch(`${base}/price_rules/${priceRuleId}/discount_codes.json`, {
    method: "POST", headers, body: JSON.stringify({ discount_code: { code } }),
  });
  if (!dcRes.ok) throw new functions.https.HttpsError("internal", "Erreur Shopify (discount_code) : " + (await dcRes.text()));
  return code;
}

/* Achat en boutique (INTENDANCE) : débite les coins puis crée un vrai code Shopify.
   Remboursé automatiquement si Shopify échoue après le débit. */
exports.redeemShopCode = functions.runWith(SHOPIFY_RUNTIME).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const key = String((data && data.key) || "");
  const def = SHOP_REWARDS[key];
  if (!def) throw new functions.https.HttpsError("invalid-argument", "Objet boutique inconnu.");

  const ref = db.collection("profiles").doc(context.auth.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
    const coins = (snap.data().coins || 0);
    if (coins < def.cost) throw new functions.https.HttpsError("failed-precondition", "Pas assez de coins.");
    tx.update(ref, { coins: coins - def.cost });
  });

  let code;
  try { code = await createShopifyDiscount(def, genCode()); }
  catch (e) { await ref.update({ coins: admin.firestore.FieldValue.increment(def.cost) }); throw e; }

  await ref.update({ codes: admin.firestore.FieldValue.arrayUnion({ code, title: def.title }) });
  return { code, title: def.title };
});

/* Roue quotidienne : le contrôle "1x/24h" se fait dans claimDailySpin() (appelée
   pour CHAQUE spin, quel que soit le lot). Ici on ne fait QUE créer le code Shopify
   quand le lot tiré est un code — pas de re-check lastSpin (déjà validé juste avant
   par claimDailySpin, sinon ça créerait une course avec l'écriture optimiste du client). */
exports.redeemWheelCode = functions.runWith(SHOPIFY_RUNTIME).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const key = String((data && data.key) || "");
  const def = WHEEL_REWARDS[key];
  if (!def) throw new functions.https.HttpsError("invalid-argument", "Lot de roue inconnu.");

  const ref = db.collection("profiles").doc(context.auth.uid);

  /* JETON DE TIRAGE À USAGE UNIQUE.
     Cette fonction ne coûtait RIEN et ne vérifiait RIEN : il suffisait
     d'appeler redeemWheelCode({key:"wheel10"}) en boucle depuis la console
     pour générer autant de vrais codes Shopify que voulu. Elle s'appuyait sur
     le fait que le client appelle claimDailySpin juste avant — ce que rien
     n'imposait techniquement.
     claimDailySpin pose désormais `spinToken` ; on le consomme ici, dans une
     transaction, ce qui garantit UN code par tirage réellement gagné. */
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
    if (!snap.data().spinToken) {
      throw new functions.https.HttpsError("failed-precondition", "Aucun tirage en attente.");
    }
    tx.update(ref, { spinToken: admin.firestore.FieldValue.delete() });
  });

  const code = await createShopifyDiscount(def, genCode());
  await ref.update({ codes: admin.firestore.FieldValue.arrayUnion({ code, title: def.title }) });
  return { code, title: def.title };
});

/* Valide + avance 'lastSpin' CÔTÉ SERVEUR (infalsifiable), pour CHAQUE spin de la
   roue quotidienne — quel que soit le lot tiré (coins, rien, ou code). Le client
   appelle cette fonction avant de lancer l'animation ; si elle échoue (déjà spin
   aujourd'hui), on n'anime pas la roue. */
exports.claimDailySpin = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const ref = db.collection("profiles").doc(context.auth.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
    const p = snap.data();
    const last = p.lastSpin || 0;
    if (Date.now() - last < 86400000) throw new functions.https.HttpsError("failed-precondition", "Roue déjà utilisée aujourd'hui.");
    // TIRAGE CÔTÉ SERVEUR : le lot (donc les coins) n'est jamais choisi par le
    // client. Il n'a plus qu'à animer la roue jusqu'au segment renvoyé.
    const seg = pickWeighted(WHEEL);
    const w = WHEEL[seg];
    const patch = { lastSpin: Date.now() };
    let coins = p.coins || 0;
    if (w.type === "coins") {
      coins += w.val;
      patch.coins = coins;
      patch.coinsEarned = (p.coinsEarned || 0) + w.val;
    }
    tx.update(ref, patch);
    // `key` : pour un segment "objet", le client octroie l'objet lui-même
    // (aucune valeur monétaire). `coins` : nouveau solde pour rafraîchir le HUD.
    return { ok: true, seg, type: w.type, val: w.val || 0, key: w.key || null, coins };
  });
});

/* Offre éclair post-victoire : gratuite, cooldown anti-spam minimal côté serveur. */
exports.redeemFlashCode = functions.runWith(SHOPIFY_RUNTIME).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const ref = db.collection("profiles").doc(context.auth.uid);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
  /* Un délai de 120 s laissait générer 720 codes -15 % RÉELS par jour et par
     compte, comptes créables à volonté : c'était une porte ouverte sur la
     marge de la boutique. On passe à un code par tranche de 12 h. */
  const last = snap.data().lastFlash || 0;
  if (Date.now() - last < 12 * 3600 * 1000) {
    const h = Math.ceil((12 * 3600 * 1000 - (Date.now() - last)) / 3600000);
    throw new functions.https.HttpsError("failed-precondition",
      "Offre éclair déjà utilisée — reviens dans ~" + h + " h.");
  }
  await ref.update({ lastFlash: Date.now() });

  const code = await createShopifyDiscount(FLASH_REWARD, genCode());
  await ref.update({ codes: admin.firestore.FieldValue.arrayUnion({ code, title: FLASH_REWARD.title }) });
  return { code, title: FLASH_REWARD.title };
});

/* ============================================================
   AUTRES SOURCES DE COINS — toutes côté serveur
   ------------------------------------------------------------
   Depuis que le client ne peut plus écrire `coins` (cf. firestore.rules),
   CHAQUE gain (ou dépense) de coins doit passer par une Cloud Function. Les
   objets d'arsenal, eux, restent gérés par le client (aucune valeur monétaire).
   ============================================================ */

/* Bonus de calendrier (présence quotidienne). Le jour réclamable et la série
   sont recalculés ICI, avec l'horloge SERVEUR (UTC) — infalsifiable. */
exports.claimDailyBonus = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const ref = db.collection("profiles").doc(context.auth.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
    const p = snap.data();
    const today = serverDayStamp();
    const last = p.lastClaimDay || 0;
    const streak = p.weekStreak || 0;
    let next;
    if (!last) { next = 1; }
    else {
      const gap = daysBetweenStamp(last, today);
      if (gap <= 0) throw new functions.https.HttpsError("failed-precondition", "Récompense du jour déjà réclamée.");
      next = (gap === 1) ? (streak >= 7 ? 1 : streak + 1) : 1; // jour sauté -> on repart au 1
    }
    const r = WEEK_REWARDS[next - 1];
    const patch = { lastClaimDay: today, weekStreak: next };
    let coins = p.coins || 0;
    if (r.kind === "coins" || r.kind === "jackpot") {
      coins += r.val;
      patch.coins = coins;
      patch.coinsEarned = (p.coinsEarned || 0) + r.val;
    }
    tx.update(ref, patch);
    // `item` : octroyé par le client (calendrier jours 3/5/7).
    return { ok: true, day: next, kind: r.kind, val: r.val || 0, item: r.item || null, coins };
  });
});

/* Passage au prestige : +2500 coins, réservé au niveau MAX. Le niveau étant
   propriété serveur, l'éligibilité ne peut pas être falsifiée. */
exports.doPrestige = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const ref = db.collection("profiles").doc(context.auth.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
    const p = snap.data();
    const level = p.level || 1, prestige = p.prestige || 0;
    if (level < MAX_LEVEL || prestige >= PRESTIGE_MAX) {
      throw new functions.https.HttpsError("failed-precondition", "Prestige indisponible.");
    }
    const coins = (p.coins || 0) + 2500;
    const coinsEarned = (p.coinsEarned || 0) + 2500;
    tx.update(ref, { prestige: prestige + 1, level: 1, xp: 0, coins, coinsEarned });
    // Les 3 objets offerts sont ajoutés par le client (non monétaires).
    return { ok: true, prestige: prestige + 1, coins };
  });
});

/* Achat d'un objet d'arsenal : débit des coins côté serveur. L'objet lui-même
   est ajouté par le client (aucune valeur monétaire). */
exports.buyItem = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const key = String((data && data.key) || "");
  const cost = ITEM_COSTS[key];
  if (!cost) throw new functions.https.HttpsError("invalid-argument", "Objet inconnu.");
  const ref = db.collection("profiles").doc(context.auth.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
    const coins = snap.data().coins || 0;
    if (coins < cost) throw new functions.https.HttpsError("failed-precondition", "Pas assez de coins.");
    tx.update(ref, { coins: coins - cost });
    return { ok: true, coins: coins - cost };
  });
});

/* Bonus de dépannage "+200 coins" (1×/24 h), proposé quand le joueur est à sec. */
exports.claimDailyCoins = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connecte-toi.");
  const ref = db.collection("profiles").doc(context.auth.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil introuvable.");
    const p = snap.data();
    if (Date.now() - (p.lastDaily || 0) < 86400000) {
      throw new functions.https.HttpsError("failed-precondition", "Bonus du jour déjà pris.");
    }
    const coins = (p.coins || 0) + 200;
    tx.update(ref, { lastDaily: Date.now(), coins, coinsEarned: (p.coinsEarned || 0) + 200 });
    return { ok: true, coins };
  });
});
