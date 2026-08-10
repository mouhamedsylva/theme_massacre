/* ============================================================
   MASSACRE — POPOTE WAR
   Prototype jouable (comptes + sauvegarde locaux, localStorage).
   ------------------------------------------------------------
   Système type 8 Ball Pool : on MISE des coins, le gagnant rafle
   le pot (double sa mise), le perdant la laisse sur la table.
   ------------------------------------------------------------
   Backend Firebase OPTIONNEL : si firebase-config.js + pw-firebase.js
   sont chargés et activés (window.PWFirebase), l'auth et la sauvegarde
   passent en ligne. Sinon, tout reste en LOCAL (comportement identique).
   ============================================================ */

(() => {
"use strict";

/* ---------- utils ---------- */
const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hex4 = () => Math.random().toString(16).slice(2, 6).toUpperCase();
const genRoom = () => "MSCR-" + hex4();
const genPromo = () => "PW-" + hex4() + hex4().slice(0, 2);
/* Échappement HTML.
   On échappe aussi l'apostrophe et le backtick : sans eux, la fonction est
   sûre uniquement dans un attribut délimité par des guillemets doubles, ce qui
   est un piège pour toute modification future. Ici, sûre partout. */
const esc = (s) => String(s).replace(/[&<>"'`]/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;",
}[c]));

/* ------------------------------------------------------------
   ASSAINISSEMENT DES DONNÉES DISTANTES
   ------------------------------------------------------------
   Tout ce qui vient de Firestore a été écrit par un AUTRE joueur.
   Les règles de sécurité ne peuvent pas tout valider, et le code
   d'affichage construit du HTML : on normalise donc à la source,
   au moment de la réception, plutôt que d'espérer que chaque point
   d'affichage pense à échapper.

   `num` force un entier borné, `str` coupe et échappe, `pick`
   n'accepte qu'une valeur d'une liste blanche.
   ------------------------------------------------------------ */
function sNum(v, min, max, def) {
  const n = Math.floor(Number(v));
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function sStr(v, max) {
  return String(v == null ? "" : v).slice(0, max || 40);
}
function sPick(v, allowed, def) {
  return allowed.includes(v) ? v : def;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAY = 86400000;

/* ---------- icônes (coin MASSACRE + objets d'intendance) ----------
   Dépose les 4 visuels dans /assets avec exactement ces noms.
   Tant qu'un fichier est absent, l'emoji de secours s'affiche à la place
   (onerror), donc le jeu reste fonctionnel sans interruption. */
/* Résolution des images.
   Sur le site MASSACRE les fichiers sont dans /assets. Sur Shopify, ils sont
   servis depuis un CDN avec une URL signée : le thème injecte alors
   `window.PW_ASSETS` (voir sections/popote-war.liquid) et on l'utilise.
   Sans ce drapeau, rien ne change — le jeu reste utilisable tel quel. */
const asset = (file) => (window.PW_ASSETS && window.PW_ASSETS[file]) || ("assets/" + file);

const COIN_IMG = asset("coin-massacre.png");
const ITEM_ICONS = { fusil: asset("item-fusil.png"), casque: asset("item-casque.png"), montre: asset("item-montre.png") };
// Les 4 nouveaux objets n'ont pas encore de visuel : l'emoji de secours
// s'affiche tant que tu n'as pas déposé assets/item-<clé>.png.
const ITEM_FALLBACK = {
  fusil: "🔫", casque: "🪖", montre: "⌚",
  jumelles: "🔭", ration: "🥫", fumigene: "💨", grenade: "💣",
};
// Liste de référence : sert aux inventaires, aux compteurs et aux sauvegardes.
const ITEM_KEYS = ["fusil", "casque", "montre", "jumelles", "ration", "fumigene", "grenade"];
const ITEM_NAMES = {
  fusil: "Fusil", casque: "Casque", montre: "Montre",
  jumelles: "Jumelles", ration: "Ration double", fumigene: "Fumigène", grenade: "Grenade",
};
function coinIcon(cls) { return `<img src="${COIN_IMG}" class="${cls || "pw-coin-ico"}" alt="coin" onerror="this.outerHTML='🪙'">`; }
/* Si l'objet n'a pas de visuel dédié, on affiche DIRECTEMENT l'emoji au lieu
   de tenter une image inexistante : ça évitait une requête 404 par icône et
   une console polluée à chaque rendu de la boutique. */
function itemIcon(key, cls) {
  const src = ITEM_ICONS[key];
  if (!src) return `<span class="${cls || "pw-item-ico"} pw-item-emo">${ITEM_FALLBACK[key] || "🎒"}</span>`;
  return `<img src="${src}" class="${cls || "pw-item-ico"}" alt="${key}" onerror="this.outerHTML='${ITEM_FALLBACK[key]}'">`;
}

/* ---------- braises (canvas) ----------
   Optimisé pour la batterie et la fluidité mobile :
   - respecte prefers-reduced-motion (aucune animation si demandé) ;
   - se met EN PAUSE quand l'onglet passe en arrière-plan (visibilitychange)
     ou quand le canvas sort de l'écran (masqué pendant un match) — via
     IntersectionObserver ;
   - plus de `shadowBlur` (l'opération canvas la plus coûteuse) : le halo est
     rendu à moindre coût par un léger empilement d'alpha. */
function startEmbers(canvas, density = 45) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let particles = [], w, h, raf = 0, onScreen = true;
  function resize() { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; }
  resize(); window.addEventListener("resize", resize);
  function spawn() { return { x: Math.random() * w, y: h + Math.random() * 40, r: Math.random() * 2.4 + .7, vy: Math.random() * 1.3 + .4, vx: (Math.random() - .5) * .6, life: Math.random() * .6 + .4, hue: 18 + Math.random() * 30 }; }
  for (let i = 0; i < density; i++) { const p = spawn(); p.y = Math.random() * h; particles.push(p); }
  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.y -= p.vy; p.x += p.vx; p.life -= .004;
      if (p.y < -10 || p.life <= 0) Object.assign(p, spawn());
      const a = clamp(p.life, 0, 1);
      // Halo bon marché : un disque plus large très transparent, puis le cœur.
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},100%,58%,${a * 0.18})`; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},100%,62%,${a})`; ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  function shouldRun() { return !reduce && !document.hidden && onScreen; }
  function sync() {
    if (shouldRun() && !raf) raf = requestAnimationFrame(frame);
    else if (!shouldRun() && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  document.addEventListener("visibilitychange", sync);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; sync(); }, { threshold: 0 }).observe(canvas);
  }
  sync();
}

/* ---------- GRADES / ÉCHELONS / INSIGNES ---------- */
const GRADES = [
  { name: "Soldat",            ins: { chev: 0, bar: 0, star: 0 } },
  { name: "Première classe",   ins: { chev: 1, bar: 0, star: 0 } },
  { name: "Caporal",           ins: { chev: 2, bar: 0, star: 0 } },
  { name: "Caporal-chef",      ins: { chev: 3, bar: 0, star: 0 } },
  { name: "Sergent",           ins: { chev: 0, bar: 1, star: 0 } },
  { name: "Sergent-chef",      ins: { chev: 0, bar: 2, star: 0 } },
  { name: "Adjudant",          ins: { chev: 0, bar: 3, star: 0 } },
  { name: "Adjudant-chef",     ins: { chev: 0, bar: 3, star: 1 } },
  { name: "Major",             ins: { chev: 0, bar: 4, star: 0 } },
  { name: "Lieutenant",        ins: { chev: 0, bar: 0, star: 1 } },
  { name: "Capitaine",         ins: { chev: 0, bar: 0, star: 2 } },
  { name: "Commandant",        ins: { chev: 0, bar: 0, star: 3 } },
  { name: "Lieutenant-colonel",ins: { chev: 0, bar: 0, star: 4 } },
  { name: "Colonel",           ins: { chev: 0, bar: 0, star: 5 } },
];
const MAX_GRADE = GRADES.length - 1;
const TIERS = ["Bronze", "Argent", "Or"];
const METAL = { Bronze: "#cd7f32", Argent: "#cdd2da", Or: "#ffd23f" };
/* COURBE DE GRADES — LADDER DE CARRIÈRE À LONG TERME (galons = XP persistante).
   Les grades ne se remettent PAS à zéro chaque mois (seuls les NIVEAUX le font).
   Ils représentent le temps de jeu total et restent à vie : c'est la vraie
   marque de prestige d'un joueur. Calibrage cible :
     • 1er grade (Soldat -> Première classe) ≈ 48 h de jeu réel ;
     • Colonel (sommet) ≈ ~1 an de jeu régulier — aspirationnel, peu l'atteindront.
   Hypothèse RÉVISÉE : les galons sont l'XP de carrière et tombent à CHAQUE
   match terminé — 50 gagné, 30 nul, 20 perdu, soit ~35 en moyenne. À dix
   matchs par jour (~350 galons/jour), Première classe tombe le premier jour,
   Sergent vers un mois, Major vers trois mois, Colonel vers quatorze mois.
   L'ancienne courbe (270 000 galons à 34 galons la victoire seulement) valait
   huit mille victoires : personne ne quittait jamais le grade de Soldat.
   GRADE_CUM[g] = galons cumulés pour ATTEINDRE le grade g.
   NB : la montée est désormais aussi soumise à un PÉAGE EN COINS (cf. étape 2 —
   il faut ET avoir l'XP de carrière ET payer pour valider le grade). */
const GRADE_CUM = [0, 500, 1500, 3200, 6000, 10000, 16000, 24000, 35000, 50000, 70000, 95000, 120000, 150000];
const LAST_SPAN = 30000; // écart du dernier grade, pour l'affichage une fois au max
function gradeSpan(g) { return g < MAX_GRADE ? GRADE_CUM[g + 1] - GRADE_CUM[g] : LAST_SPAN; }

function rankFromRP(rp) {
  rp = Math.max(0, rp | 0);
  let g = 0;
  while (g < MAX_GRADE && rp >= GRADE_CUM[g + 1]) g++;
  const capped = g >= MAX_GRADE && rp >= GRADE_CUM[MAX_GRADE];
  const span = gradeSpan(g), tierSize = span / TIERS.length;
  const within = capped ? span : rp - GRADE_CUM[g];
  let t = Math.floor(within / tierSize); if (t > 2) t = 2;
  const rpInTier = capped ? tierSize : within - t * tierSize;
  return { gradeIndex: g, grade: GRADES[g].name, tierIndex: t, tier: TIERS[t], rpInTier, tierSize, capped };
}

// COÛT EN COINS pour VALIDER la promotion vers le grade d'index g (péage).
// À GARDER identique à functions/index.js (GRADE_COST).
const GRADE_COST = [0, 300, 800, 1500, 3000, 5000, 8000, 12000, 18000, 26000, 36000, 50000, 70000, 100000];
/* GALONS GAGNÉS PAR MATCH. Le pari de galons a été retiré du jeu : on ne mise
   plus ses galons, on en gagne en jouant. Perdre rapporte quand même (un joueur
   en mauvaise passe doit continuer d'avancer), abandonner ne rapporte rien.
   À GARDER identique à Economy.rpForMatch() côté application. */
const RP_WIN = 50, RP_TIE = 30, RP_LOSS = 20;
function rpForMatch(outcome) {
  if (outcome === "win") return RP_WIN;
  if (outcome === "tie") return RP_TIE;
  if (outcome === "lose") return RP_LOSS;
  return 0;
}

// Grade auquel le joueur est ÉLIGIBLE (assez de galons), AVANT paiement.
function eligibleGrade(rp) { return rankFromRP(rp).gradeIndex; }
/* Rang EFFECTIF affiché : le grade est le grade STOCKÉ (celui qu'on a PAYÉ),
   pas l'éligibilité. L'échelon (Bronze/Argent/Or) reflète les galons DANS le
   grade affiché. `eligIdx` dit jusqu'où on POURRAIT monter en payant. */
function rankOf(p) {
  const rp = Math.max(0, (p && p.rp) | 0);
  const g = Math.max(0, Math.min(MAX_GRADE, (p && p.grade) | 0));
  const span = gradeSpan(g);
  const capped = g >= MAX_GRADE;
  // Plus d'échelons Bronze/Argent/Or : la barre de galons montre la progression
  // DANS le grade actuel, vers l'éligibilité au grade suivant.
  const rpInGrade = capped ? span : Math.max(0, Math.min(span, rp - GRADE_CUM[g]));
  return { gradeIndex: g, grade: GRADES[g].name, capped, eligIdx: eligibleGrade(rp), rpInGrade, gradeSpan: span };
}
function starPath(cx, cy, r) {
  let p = "";
  for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * .42 : r; p += (i ? "L" : "M") + (cx + Math.cos(ang) * rad).toFixed(1) + " " + (cy + Math.sin(ang) * rad).toFixed(1) + " "; }
  return p + "Z";
}
/* Écussons photographiés — les vrais galons MASSACRE.
   Seuls 8 grades sur 14 en ont un. Les autres gardent le tracé SVG :
   c'est voulu, pas un manque à combler dans l'urgence. Un insigne
   inventé serait pire que pas d'insigne du tout.
   Pour en ajouter un : dépose le fichier dans assets/ et ajoute sa
   ligne ici. Rien d'autre à toucher. */
const GRADE_PATCH = {
  1: "grade-1re-classe.webp",
  2: "grade-caporal.webp",
  3: "grade-caporal-chef.webp",
  4: "grade-sergent.webp",
  5: "grade-sergent-chef.webp",
  6: "grade-adjudant.webp",
  7: "grade-adjudant-chef.webp",
  9: "grade-lieutenant.webp",
};

/* La photo se superpose au SVG, qui reste dessous en filet de sécurité.
   Si le fichier manque — oubli de téléversement sur Shopify, panne du
   CDN — `onerror` retire l'image et le tracé réapparaît. Le joueur voit
   toujours un insigne, jamais un carré vide. */
function ggInsignia(gi, tier) {
  const svg = ggInsigniaSVG(gi, tier);
  const file = GRADE_PATCH[gi];
  if (!file) return svg;
  return '<span class="gg-insignia-wrap">' + svg +
    '<img class="gg-insignia__photo" src="' + esc(asset(file)) + '"' +
    ' alt="' + esc(GRADES[gi].name) + '" loading="lazy" decoding="async"' +
    ' onerror="this.remove()">' +
    "</span>";
}

function ggInsigniaSVG(gi, tier) {
  const spec = GRADES[gi].ins, metal = tier ? (METAL[tier] || "#cdd2da") : "#e0ac3f", dark = "#211d10";
  let pips = "";
  if (spec.chev) { let y = 80; for (let i = 0; i < spec.chev; i++) { pips += `<polyline points="22,${y} 50,${y - 20} 78,${y}" fill="none" stroke="${metal}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`; y -= 18; } }
  else if (spec.star && !spec.bar) { const s = spec.star, gap = Math.min(20, 78 / s); for (let i = 0; i < s; i++) pips += `<path d="${starPath(50 + (i - (s - 1) / 2) * gap, 50, gap * .46 + 4)}" fill="${metal}"/>`; }
  else { let y = 78; for (let i = 0; i < (spec.bar || 0); i++) { pips += `<rect x="22" y="${y - 8}" width="56" height="9" rx="4" fill="${metal}"/>`; y -= 15; } if (spec.star) pips += `<path d="${starPath(50, y - 1, 11)}" fill="${metal}"/>`; if (!spec.bar && !spec.star) pips += `<circle cx="50" cy="50" r="6" fill="${metal}" opacity=".7"/>`; }
  return `<svg class="gg-insignia" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="88" height="88" rx="14" fill="${dark}" stroke="${metal}" stroke-width="3"/>${pips}</svg>`;
}

/* ============================================================
   PROGRESSION — NIVEAUX & PRESTIGE
   ------------------------------------------------------------
   Deux échelles VOLONTAIREMENT distinctes, comme dans un Call of
   Duty :
     • NIVEAU 1 → 55 + PRESTIGE : la progression personnelle. Elle
       avance à chaque partie, gagnée ou perdue, et distribue une
       récompense à CHAQUE palier. C'est le moteur de rétention.
     • GRADES (Soldat → Colonel) : l'échelle compétitive, pilotée
       par les galons gagnés en victoire. C'est le classement.
   Mélanger les deux rendait la progression illisible.

   Courbe d'XP : environ 200 parties pour atteindre le niveau 55,
   soit un prestige par saison de jeu. Assez long pour avoir de la
   valeur, assez court pour rester atteignable.
   ============================================================ */
const MAX_LEVEL = 50;
const PRESTIGE_MAX = 10;

/* Courbe d'XP nettement plus pentue qu'avant (100 + (lvl-1)*22 au lieu de
   120 + (lvl-1)*4). Le niveau 55 demandait ~12 000 XP au total, soit ~130
   victoires : maxé en quelques jours. Il en demande maintenant ~37 000,
   soit ~600 victoires ≈ un mois pour un assidu, calé sur la course des
   grades. Les niveaux sont eux aussi remis à zéro chaque mois. */
const xpForLevel = (lvl) => 100 + (lvl - 1) * 22;

/* Titres de prestige : le seul moyen de les obtenir est de repasser
   niveau 1. Ils marquent le joueur de façon permanente. */
const PRESTIGES = [
  { p: 1,  name: "VÉTÉRAN DE POPOTE",       ico: "🥉" },
  { p: 2,  name: "BRISCARD",                ico: "🎖️" },
  { p: 3,  name: "BAROUDEUR",               ico: "🥈" },
  { p: 4,  name: "VIEILLE GARDE",           ico: "🛡️" },
  { p: 5,  name: "FER DE LANCE",            ico: "🥇" },
  { p: 6,  name: "TÊTE BRÛLÉE",             ico: "🔥" },
  { p: 7,  name: "LÉGENDE DE CASERNE",      ico: "⚔️" },
  { p: 8,  name: "IMMORTEL DU RÉFECTOIRE",  ico: "💀" },
  { p: 9,  name: "MARÉCHAL DE LA POPOTE",   ico: "👑" },
  { p: 10, name: "MASSACRE ABSOLU",         ico: "☠️" },
];
function prestigeInfo(p) { return PRESTIGES.find((x) => x.p === p) || null; }

/* Récompense d'un niveau donné. Le principe : on ne monte JAMAIS
   de niveau sans rien recevoir — c'est ce qui donne envie
   d'enchaîner « encore une partie ». */
function levelReward(lvl) {
  // Montants de coins revus À LA BAISSE (bonus « gratuits » de niveau).
  // Deux effets se combinent pour freiner l'inflation, sans toucher au gain
  // de mise (qui, lui, reste la vraie récompense d'une victoire) : les
  // niveaux arrivent ~4x moins souvent (courbe d'XP plus pentue) ET chaque
  // palier donne un peu moins. Les objets d'arsenal offerts restent, plus
  // rares : ça garde la surprise sans inonder la boutique.
  if (lvl >= MAX_LEVEL) return { kind: "prestige", coins: 4000, label: "NIVEAU MAX — PRESTIGE DISPONIBLE" };
  if (lvl % 10 === 0) return { kind: "big", coins: 1000, item: "fusil", label: "1000 coins + 1 Fusil" };
  if (lvl % 5 === 0)  return { kind: "item", coins: 400, item: lvl % 15 === 0 ? "montre" : "casque",
                               label: "400 coins + 1 " + (lvl % 15 === 0 ? "Montre" : "Casque") };
  const c = 90 + Math.floor(lvl / 5) * 25;   // 90 → 350 coins (avant 120 → 520)
  return { kind: "coins", coins: c, label: c + " coins" };
}

// Bonus permanent de prestige : +4 % de coins gagnés par prestige.
// Récompense la fidélité sans déséquilibrer les duels (les mises restent
// identiques, seuls les gains de fin de partie sont majorés).
function prestigeCoinMult(p) { return 1 + Math.min(PRESTIGE_MAX, p || 0) * 0.04; }

/* Ajoute de l'XP et distribue les récompenses de palier.
   Renvoie la liste des niveaux franchis pour l'écran de résultat. */
function addXp(amt) {
  ensureItems(profile);
  const gained = [];
  if (profile.level >= MAX_LEVEL) { profile.xp = 0; return { lv: 0, bonus: 0, gained }; }

  profile.xp += amt;
  let bonus = 0;
  while (profile.level < MAX_LEVEL && profile.xp >= xpForLevel(profile.level)) {
    profile.xp -= xpForLevel(profile.level);
    profile.level++;
    const r = levelReward(profile.level);
    profile.coins += r.coins; bonus += r.coins;
    profile.coinsEarned = (profile.coinsEarned || 0) + r.coins;
    if (r.item) profile.items[r.item] = (profile.items[r.item] || 0) + 1;
    gained.push({ level: profile.level, reward: r });
  }
  if (profile.level >= MAX_LEVEL) profile.xp = 0;   // plus rien à accumuler
  return { lv: gained.length, bonus, gained };
}

/* Passage au prestige. On garde TOUT ce qui a de la valeur (coins, objets,
   décorations, amis, statistiques) : remettre la caisse à zéro punirait le
   joueur le plus assidu et le découragerait d'acheter en boutique. Seule la
   jauge de niveau repart, en échange d'une marque permanente. */
function canPrestige(p) { return p && p.level >= MAX_LEVEL && (p.prestige || 0) < PRESTIGE_MAX; }
async function doPrestige() {
  if (!canPrestige(profile)) return false;
  // Le bonus de coins (croissant : 3000 + prestige*2000) et l'éligibilité
  // (niveau MAX) sont réglés par le SERVEUR — impossible de forcer le prestige.
  // Les objets offerts (non monétaires) restent ajoutés côté client.
  let bonus = 3000 + ((profile.prestige || 0) + 1) * 2000; // valeur de repli/affichage
  if (FB) {
    const res = await FB.doPrestige();
    if (res.ok) {
      profile.prestige = res.data.prestige;
      if (typeof res.data.coins === "number") profile.coins = res.data.coins;
      if (typeof res.data.bonus === "number") bonus = res.data.bonus;
      profile.level = 1; profile.xp = 0;
    } else if (!res.unavailable) {
      toast((res.error && res.error.message) || "Prestige indisponible, recrue."); return false;
    } else {
      profile.prestige = (profile.prestige || 0) + 1; profile.level = 1; profile.xp = 0;
      profile.coins += bonus; profile.coinsEarned = (profile.coinsEarned || 0) + bonus;
    }
  } else {
    profile.prestige = (profile.prestige || 0) + 1; profile.level = 1; profile.xp = 0;
    profile.coins += bonus; profile.coinsEarned = (profile.coinsEarned || 0) + bonus;
  }
  const info = prestigeInfo(profile.prestige);
  ensureItems(profile);
  profile.items.fusil++; profile.items.casque++; profile.items.montre++;
  saveProfile(); renderHud(); publishMe();
  APP.haptic("reward"); pwTrack("prestige", { prestige: profile.prestige });
  openModal(
    '<button class="pw-modal__close" data-close>✕</button>' +
    '<p class="pw-modal__eyebrow">// PASSAGE AU PRESTIGE ' + profile.prestige + '</p>' +
    '<div class="gg-ceremony"><div class="gg-ceremony__rays"></div>' +
      '<div class="gg-ceremony__medal gg-medal--or">' + info.ico + '</div></div>' +
    '<h2 class="pw-modal__title">' + esc(info.name) + '</h2>' +
    '<p class="pw-modal__text">Tu repars niveau 1, mais la marque reste à vie.<br>' +
      '<b>+' + bonus.toLocaleString("fr-FR") + ' coins</b>, un objet de chaque, et <b>+' + Math.round((prestigeCoinMult(profile.prestige) - 1) * 100) +
      ' % de coins</b> sur tous tes gains, définitivement.</p>' +
    '<div class="pw-modal__actions"><button class="btn btn--primary" data-close>🫡 À VOS ORDRES</button></div>');
  return true;
}
const botProb = (gi) => Math.min(.85, .5 + gi * .025);
const STAKES = [50, 100, 250, 500];
const START_COINS = 500;
// Règle "double or nothing" : la mise a déjà été retirée (escrow) au lancement.
function payout(outcome, stake) {
  if (outcome === "win") return { credit: stake * 2, net: stake };
  if (outcome === "tie") return { credit: stake, net: 0 };
  return { credit: 0, net: -stake };
}

/* ---------- banque de questions (ton caserne, cru et sans filtre) ---------- */
const QUESTIONS = [
  { tag: "// ADAGE DE CHAMBRÉE", q: "Complète l'adage : « Choses inconnues… »", options: ["Y'a pas d'abus", "Touche à ton cul", "T'as plus d'annu", "C'est pas perdu"], correct: 1, explain: "« Choses inconnues, touche à ton cul. » La rime de chambrée par excellence." },
  { tag: "// ADAGE DE CHAMBRÉE", q: "« Dépêche-toi… »", options: ["de signer", "de ramper", "d'attendre", "de chialer"], correct: 2, explain: "« Dépêche-toi d'attendre » : tout est urgent, puis tu poireautes 3 h. L'armée résumée." },
  { tag: "// SAGESSE DE PERM", q: "La devise officieuse de la perm douteuse : « Pas vu… »", options: ["pas pris", "pas grave", "pas con", "pas puni"], correct: 0, explain: "« Pas vu, pas pris. » Et si t'es pris… t'es puni, banane." },
  { tag: "// PROMESSE DE RECRUTEUR", q: "« Engage-toi, qu'ils disaient. Tu verras… »", options: ["la mer", "du pays", "le front", "le bout"], correct: 1, explain: "« …tu verras du pays. » Surtout le bout du Larzac sous la flotte." },
  { tag: "// ADAGE DE CHAMBRÉE", q: "« Un soldat qui dort… »", options: ["ronfle pour deux", "en vaut deux", "creuse pas", "rampe mieux"], correct: 1, explain: "« …en vaut deux. » La sieste tactique, seul moment de gloire du bidasse." },
  { tag: "// ADAGE DE CHAMBRÉE", q: "Pas de troisième option, recrue : « Marche… »", options: ["ou pleure", "ou rampe", "ou crève", "et tais-toi"], correct: 2, explain: "« Marche ou crève. » Voilà, voilà." },
  { tag: "// ADAGE DE CHAMBRÉE", q: "« C'est en rampant… »", options: ["qu'on devient para", "qu'on se salit", "qu'on chiale", "qu'on devient ver"], correct: 0, explain: "« …qu'on devient para. » La boue, c'est la base." },
  { tag: "// SAGESSE DU CHEF", q: "« Deux yeux, deux mains, un cerveau… mais surtout… »", options: ["ferme-la", "deux mains", "un fusil", "des couilles"], correct: 1, explain: "« …surtout deux mains. » On te loue les bras, pas les idées." },
  { tag: "// PROVERBE MAISON", q: "Best-seller de la boutique : « Pas payé… »", options: ["assez", "à rêver", "à chialer", "à réfléchir"], correct: 3, explain: "« Pas payé à réfléchir. » Dispo en t-shirt, d'ailleurs. 👕" },
  { tag: "// ADAGE DE CHAMBRÉE", q: "« La bave du crapaud… »", options: ["mouille le treillis", "n'atteint pas la blanche colombe", "ça pue grave", "retombe toujours"], correct: 1, explain: "« …n'atteint pas la blanche colombe. » Ce que tu te répètes quand l'adjudant t'allume." },
  { tag: "// SAGESSE DU CHEF", q: "L'adjudant a toujours raison. Et quand il a tort… ?", options: ["Relis la règle n°1", "C'est ta faute", "Tu fermes ta gueule", "Toutes ces réponses"], correct: 3, explain: "La hiérarchie, ce poème. Les trois en même temps." },
  { tag: "// SAGESSE DU CHEF", q: "« Y'a deux façons de faire : la bonne, la mauvaise… et… »", options: ["la mienne", "la façon de l'armée", "la mauvaise encore", "pas de façon"], correct: 1, explain: "« …la façon de l'armée. » Devine laquelle tu vas appliquer." },
  { tag: "// VIE DE CASERNE", q: "« Repos ! » à l'armée, ça dure environ… ?", options: ["tout le week-end", "8 heures", "3 secondes", "jamais"], correct: 2, explain: "« GARDE-À-VOUS ! »… et c'est reparti. Le repos est un mythe." },
  { tag: "// ARGOT MILITAIRE", q: "À la popote, « le jus », c'est… ?", options: ["le café", "l'eau de vaisselle", "la soupe", "l'essence"], correct: 0, explain: "« Le jus » = le café. Et il est toujours dégueu." },
  { tag: "// ARGOT MILITAIRE", q: "Un « bidasse », c'est… ?", options: ["un gradé", "un simple troufion", "le cuistot", "un déserteur"], correct: 1, explain: "« Bidasse » = le bon vieux troufion de base. Toi, quoi." },
  { tag: "// ARGOT MILITAIRE", q: "Faire « la soupe à la grimace », c'est… ?", options: ["cuisiner", "faire la gueule", "nettoyer", "ramper"], correct: 1, explain: "« Soupe à la grimace » = tirer la tronche. Comme au réveil à 5 h." },
  { tag: "// ARGOT MILITAIRE", q: "« Toucher son paquetage », ça veut dire… ?", options: ["récupérer son équipement", "se palper les bijoux d'famille", "bouffer", "pioncer"], correct: 0, explain: "« Toucher son paquetage » = récupérer son barda. La réponse B, c'est aux douches." },
  { tag: "// ARGOT MILITAIRE", q: "« Choper la crève au champ de tir » — la « crève », c'est… ?", options: ["une médaille", "une balle", "un bon gros rhume", "une perm"], correct: 2, explain: "« La crève » = le rhume qui t'explose. Couvre-toi, mauviette." },
  { tag: "// MOTIVATION DU MATIN", q: "« T'es pas là pour bronzer, t'es là pour… »", options: ["ramper", "en chier", "sourire", "dormir"], correct: 1, explain: "« …pour en chier. » Bienvenue, recrue. 🫡" },
  { tag: "// DISCIPLINE", q: "« Au garde-à-vous, on serre les fesses et on… »", options: ["sourit", "respire", "ferme sa gueule", "prie"], correct: 2, explain: "« …et on ferme sa gueule. » Discipline, mon gars." },
  { tag: "// ÉTAT D'ESPRIT", q: "« Tir groupé, cœur vaillant, et surtout… »", options: ["treillis propre", "rangers cirées", "couilles au carré", "tête vide"], correct: 2, explain: "« …couilles au carré. » L'état d'esprit MASSACRE." },
  { tag: "// VOCABULAIRE TECHNIQUE", q: "Quand l'exo part complètement en vrille, on dit que c'est… ?", options: ["tactique", "le bordel", "normal", "la fête"], correct: 1, explain: "« Le bordel. » Aussi appelé « ça part en couille ». Terme homologué." },
  { tag: "// ADAGE DE CHAMBRÉE", q: "« Quand t'as les chocottes, tu serres les… »", options: ["miches", "dents", "poings", "rangs"], correct: 0, explain: "« …les miches. » La trouille, ce grand classique du bleu." },
  { tag: "// LATIN DE GUERRE", q: "« Veni, vidi… »", options: ["vinci", "vici", "sushi", "merci"], correct: 1, explain: "« Veni, vidi, vici. » César, le gradé OG." },
  { tag: "// LATIN DE GUERRE", q: "« Memento… »", options: ["mortis", "mojito", "mori", "mort-né"], correct: 2, explain: "« Memento mori » : souviens-toi que tu vas crever. Ambiance caserne." },
  { tag: "// ARGOT MILITAIRE", q: "Le « TIG », à l'armée, c'est… ?", options: ["un grade", "les corvées (travaux d'intérêt général)", "un fusil", "une perm"], correct: 1, explain: "« TIG » = corvées. Brosse à dents + chiottes, ton combo gagnant." },
  { tag: "// PROVERBE MAISON", q: "Cerveau en option, treillis obligatoire — à MASSACRE on dit… ?", options: ["Marche ou crève", "Pas vu pas pris", "Pas de cerveau, pas de migraine", "Ferme ta gueule"], correct: 2, explain: "« Pas de cerveau, pas de migraine. » Le proverbe maison." },
  { tag: "// SAGESSE DU CHEF", q: "« Plus tu transpires à l'entraînement… »", options: ["plus tu pues", "moins tu saignes au combat", "plus t'as soif", "mieux tu dors"], correct: 1, explain: "« …moins tu saignes au combat. » La sueur, cette assurance-vie." },
  { tag: "// ADAGE DE CHAMBRÉE", q: "« Engagez-vous » rime surtout avec… ?", options: ["bisous", "sous l'flotte, dans la gadoue", "vacances", "grasse mat'"], correct: 1, explain: "Spoiler : la gadoue gagne toujours." },
  { tag: "// VIE DE CASERNE", q: "On réveille la chambrée à quelle heure de l'enfer ?", options: ["5 h", "9 h", "midi", "quand t'es prêt"], correct: 0, explain: "5 h. « Quand t'es prêt » n'existe pas dans ce métier." },

  { tag: "// ORGANISATION", q: "Combien y a-t-il de lieutenants dans un peloton ?", options: ["1", "2", "3", "4"], correct: 0, explain: "Un peloton, un chef : un seul lieutenant aux commandes." },
  { tag: "// VOCABULAIRE TECHNIQUE", q: "Un fourrier, c'est… ?", options: ["un four au régiment", "celui qui gère la trésorerie du régiment", "celui qui gère les perceptions", "celui qui porte une fourrure"], correct: 2, explain: "Le fourrier gère les perceptions (matos, habillement). Rien à voir avec le four ni la fourrure." },
  { tag: "// GÉOPOLITIQUE", q: "Combien de pays comptait le G5 Sahel ?", options: ["1", "2", "5", "7"], correct: 2, explain: "Mauritanie, Mali, Niger, Tchad, Burkina Faso : 5 pays au G5 Sahel." },
  { tag: "// VIE DE CASERNE", q: "Combien y a-t-il de Vélib' dans l'armée de Terre ?", options: ["150", "0", "30", "21"], correct: 1, explain: "Zéro, frérot. L'armée de Terre roule pas en libre-service." },
  { tag: "// ARMEMENT", q: "Combien de munitions maximum dans un chargeur d'HK416 ?", options: ["20", "25", "30", "40"], correct: 2, explain: "30 cartouches, le format réglementaire du chargeur HK416." },
  { tag: "// DISCIPLINE", q: "Que fait-on avant d'entrer dans la popote ?", options: ["on retire ses chaussures", "on salue", "on retire son béret", "on s'incline"], correct: 1, explain: "On salue avant d'entrer. Les bonnes manières, même à la popote." },
  { tag: "// VOCABULAIRE TECHNIQUE", q: "Qu'est-ce qu'un OFL ?", options: ["une jumelle infrarouge", "un obus flèche", "une fusée éclairante", "un officier de carrière"], correct: 1, explain: "OFL = Obus Flèche. Rien à voir avec les jumelles ou les fusées." },
  { tag: "// TRADITIONS", q: "« Et par Saint Georges… » ?", options: ["Vive la cavalerie", "Vive les paras", "Vive les Georges", "Vive les troupes de marine"], correct: 0, explain: "« Et par Saint Georges, vive la cavalerie ! » Le cri de guerre des cavaliers." },
  { tag: "// SÉCURITÉ", q: "On garde l'index sur la détente tant que les organes de visée ne sont pas sur l'objectif. Vrai ou faux ?", options: ["Vrai", "Faux"], correct: 1, explain: "Faux. L'index reste hors de la détente tant que tu ne vises pas. Sécurité d'abord." },
  { tag: "// BLINDÉS", q: "Le T-54 est un char… ?", options: ["russe", "espagnol", "chinois", "polonais"], correct: 2, explain: "Copié et produit en Chine sous licence, le T-54 y a fait une longue carrière." },
  { tag: "// BLINDÉS", q: "Le Type 99 est un char… ?", options: ["polonais", "chinois", "néerlandais", "français"], correct: 1, explain: "Le Type 99, fleuron blindé chinois." },
  { tag: "// BLINDÉS", q: "Le Scimitar est un blindé… ?", options: ["britannique", "vénézuélien", "italien", "espagnol"], correct: 0, explain: "Le CVR(T) Scimitar, blindé de reconnaissance britannique." },
  { tag: "// BLINDÉS", q: "Le Type 80 est un char… ?", options: ["slovaque", "ukrainien", "israélien", "chinois"], correct: 3, explain: "Encore un char chinois, le Type 80." },
  { tag: "// PROTOCOLE", q: "Que dit-on en saluant un général ?", options: ["On ne salue pas", "On dit bonjour", "Mes respects mon général", "Mes devoirs mon général"], correct: 3, explain: "« Mes devoirs, mon général. » La formule consacrée." },
  { tag: "// NRBC", q: "Le T3P est une combinaison de protection contre les armes bactériologiques et chimiques. Vrai ou faux ?", options: ["Vrai", "Faux"], correct: 0, explain: "Vrai, tenue NRBC de base contre le bactério et le chimique." },
  { tag: "// VÉHICULES", q: "Que se passe-t-il juste après le démarrage d'un VBL ?", options: ["Ça bip", "Ça roule direct"], correct: 0, explain: "Ça bip avant de rouler. Le VBL prévient tout le monde qu'il se réveille." },
  { tag: "// VÉHICULES", q: "Quel véhicule remplace l'AMX10RC ?", options: ["le Jaguar", "le char Leclerc", "la Fiat Multipla", "le VBCI"], correct: 0, explain: "L'EBRC Jaguar prend la relève de l'AMX10RC." },
  { tag: "// HISTOIRE", q: "En quelle année l'armée française a-t-elle quitté le Mali ?", options: ["2019", "2020", "2021", "2022"], correct: 3, explain: "2022, fin de l'opération Barkhane au Mali." },
  { tag: "// VIE DE PELOTON", q: "Il nage bien, le chef ?", options: ["Oui", "Non"], correct: 0, explain: "Oui, il nage bien le chef. Fin de la question, pas de débat." },
  { tag: "// CULTURE MASSACRE", q: "Le Moralex500, c'est… ?", options: ["sur la boutique MASSACRE", "un médicament qui existe vraiment", "un préservatif", "un stéroïde"], correct: 0, explain: "Le Moralex500, remède miracle dispo direct sur la boutique MASSACRE. 💊" },
  { tag: "// BLINDÉS", q: "Comment sont espacées les galets (roues) du T-55 ?", options: ["1+4", "2+3", "3+4", "1+5"], correct: 3, explain: "Espacement 1+5, caractéristique du train de roulement du T-55." },
  { tag: "// GÉOGRAPHIE", q: "C'est quoi la capitale de Djibouti ?", options: ["Ali Sabieh", "Dewele", "Djibouti", "Holhol"], correct: 2, explain: "Djibouti-ville, capitale du pays du même nom." },
  { tag: "// MARINE", q: "Combien la France possède-t-elle de sous-marins nucléaires lanceurs d'engins (SNLE) ?", options: ["4", "2", "30", "7"], correct: 0, explain: "4 SNLE : le pilier de la dissuasion nucléaire française." },
  { tag: "// MARINE", q: "Combien la France possède-t-elle de sous-marins nucléaires d'attaque (SNA) ?", options: ["2", "6", "8", "7"], correct: 1, explain: "6 SNA dans la flotte française." },
  { tag: "// PROCÉDURE RADIO", q: "Que dit-on avant de finir sa phrase à la radio ?", options: ["Parlez", "Terminé", "Stop", "Attends frère"], correct: 0, explain: "« Parlez » pour rendre l'antenne. « Terminé », c'est la fin de la conversation." },
  { tag: "// ARMEMENT", q: "Quelle est la portée effective du PAMAS ?", options: ["25 mètres", "50 mètres", "75 mètres"], correct: 1, explain: "50 mètres, ça t'en bouche un coin." },
  { tag: "// ARMEMENT", q: "La mitrailleuse 12,7 mm pèse 12,7 kg à vide. Vrai ou faux ?", options: ["Vrai", "Faux"], correct: 1, explain: "Faux, bien plus lourde que ça à vide." },
  { tag: "// ARMEMENT", q: "Le missile MILAN a été introduit en service en… ?", options: ["1972", "1984", "1990", "1980"], correct: 0, explain: "1972, mise en service du MILAN." },
  { tag: "// ARMEMENT", q: "Quelle est la pièce de neutralisation du FAMAS ?", options: ["le boîtier de mécanisme", "le neutraliseur F1", "l'XH45", "l'appuie-joue"], correct: 0, explain: "Le boîtier de mécanisme, pièce maîtresse de neutralisation du FAMAS." },
  { tag: "// VOCABULAIRE TECHNIQUE", q: "C'est quoi un DDRO ?", options: ["Donnée distance repère objectif", "Direction donnée rappel orientation", "Direction distance repère objectif", "Surrection distance repère orientation"], correct: 2, explain: "DDRO = Direction Distance Repère Objectif." },
  { tag: "// HISTOIRE", q: "Quelles sont les 3 manufactures historiques de l'armée française ?", options: ["Montpellier, Toulouse, Limoges", "Tours, Monceaux, Privat", "Marseille, Brétigny, Nantes", "Châtellerault, Tulle et Saint-Étienne"], correct: 3, explain: "Châtellerault, Tulle et Saint-Étienne : le trio historique des manufactures d'armes." },
  { tag: "// SÉCURITÉ", q: "Quelle est la première règle de l'ISTC ?", options: ["Une arme doit toujours être rechargée", "Une arme doit être démontée", "Une arme doit toujours être considérée comme chargée", "Charger l'arme pour prendre une visée"], correct: 2, explain: "Règle n°1 : toute arme est considérée comme chargée, point final." },
  { tag: "// ARMEMENT", q: "Quelle est la portée pratique du FAMAS ?", options: ["300 mètres", "400 mètres", "500 mètres", "1000 mètres"], correct: 0, explain: "300 mètres de portée pratique pour le FAMAS." },
  { tag: "// TACTIQUE", q: "Quels sont, dans l'ordre, les 3 actes élémentaires du combattant ?", options: ["Se poster, observer, utiliser la liaison", "Se déplacer, utiliser ses armes, se poster", "Se déplacer, se poster, utiliser ses armes", "Se poster, se déplacer, utiliser ses armes"], correct: 2, explain: "Se déplacer, se poster, utiliser ses armes : la base du combattant." },
  { tag: "// BLINDÉS", q: "Quel pays possède le véhicule à armement lourd PTL-02 ?", options: ["la Russie", "la Chine", "le Brésil", "le Venezuela"], correct: 1, explain: "Le PTL-02 est chinois." },
  { tag: "// HISTOIRE", q: "Quel atelier de construction a conçu l'AMX-30 ?", options: ["Issy-les-Moulineaux", "Roanne", "Saint-Étienne", "Tulle"], correct: 0, explain: "L'atelier d'Issy-les-Moulineaux, berceau de l'AMX-30." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron de la Légion étrangère ?", options: ["Saint Antoine", "Saint Christophe", "Saint Joseph", "Saint Bernard"], correct: 0, explain: "Saint Antoine, patron de la Légion étrangère." },
  { tag: "// HISTOIRE", q: "Qui fut le dernier homme décoré Maréchal de France de son vivant ?", options: ["Philippe Pétain", "Ferdinand Foch", "Alphonse Juin", "Philippe Leclerc"], correct: 2, explain: "Le maréchal Alphonse Juin, décoré en 1952." },
  { tag: "// PROCÉDURE", q: "Quand on n'a plus de munitions, on… ?", options: ["crie qu'on n'a plus de munitions", "fait pan-pan", "crie chargeur", "lance son flingue"], correct: 0, explain: "On crie qu'on n'a plus de munitions. Communication, toujours." },
  { tag: "// CULTURE MASSACRE", q: "Crier « bip bip je suis un satellite » permet… ?", options: ["à l'armée de capter des renseignements ennemis", "de faire réfléchir", "de transmettre des traditions", "de concurrencer Elon Musk"], correct: 1, explain: "Ça sert surtout à faire réfléchir tout le monde sur ce qui vient de se passer." },
  { tag: "// INSTITUTIONS", q: "Comment se nomme le service des Armées qui lutte contre le harcèlement, les VSS et les discriminations ?", options: ["Thémis", "Méduse", "Athéna", "Tennis"], correct: 0, explain: "La cellule Thémis, dédiée à la lutte contre le harcèlement et les discriminations." },
  { tag: "// PROGRAMMES", q: "Quel projet prend la relève du programme Scorpion ?", options: ["Titan", "Tirant", "Phoenix", "Trident"], correct: 0, explain: "Le programme Titan succède à Scorpion." },
  { tag: "// CULTURE MASSACRE", q: "Le « bitch camp » est un village balnéaire situé en Normandie. Vrai ou faux ?", options: ["Vrai", "Faux"], correct: 1, explain: "Absolument pas. Cherche pas, ça n'existe pas." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron des artilleurs ?", options: ["Saint Sébastien", "Saint Michel", "Sainte-Barbe", "Saint Bernard"], correct: 2, explain: "Sainte-Barbe, patronne des artilleurs." },
  { tag: "// HISTOIRE", q: "Quel est le surnom donné aux soldats français durant la guerre de 1914-1918 ?", options: ["Les résistants", "Les barbus", "Les poilus", "Les gaulois"], correct: 2, explain: "Les poilus, surnom passé à la postérité." },
  { tag: "// HISTOIRE", q: "En quelle année l'Allemagne a-t-elle capitulé pendant la Seconde Guerre mondiale ?", options: ["1946", "1942", "1944", "1945"], correct: 3, explain: "1945, capitulation allemande." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron des soldats montagnards ?", options: ["Saint François", "Saint Roch", "Saint Bernard", "Sainte Marie"], correct: 2, explain: "Saint Bernard, patron des troupes de montagne." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron des brigades cynophiles ?", options: ["Saint Hubert", "Saint Roch", "Saint Antoine", "Saint Privat"], correct: 1, explain: "Saint Roch, patron des brigades cynophiles." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron de l'infanterie ?", options: ["Saint Michel", "Saint Georges", "Saint Maurice", "Saint Denis"], correct: 2, explain: "Saint Maurice, patron de l'infanterie." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron du renseignement ?", options: ["Saint Raphaël", "Saint Gabriel", "Saint Mathieu", "Saint Georges"], correct: 0, explain: "Saint Raphaël, patron du renseignement." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron des Transmissions ?", options: ["Sainte Marie", "Saint Bernard", "Saint Étienne", "l'Archange Gabriel"], correct: 3, explain: "L'Archange Gabriel, patron des Transmissions." },
  { tag: "// TRADITIONS", q: "Qui est le saint patron des mécaniciens ?", options: ["Saint Éloi", "Saint Georges", "Saint Joseph", "Saint Léon"], correct: 0, explain: "Saint Éloi, patron des mécaniciens." },
  { tag: "// ARMEMENT", q: "Quel est le calibre du canon du CAESAR ?", options: ["120mm", "135mm", "155mm", "105mm"], correct: 2, explain: "155mm/52 cal pour le canon du CAESAR." },
  { tag: "// ARMEMENT", q: "Quelle est la fréquence de tir du canon du CAESAR ?", options: ["4 coups/minute", "6 coups/minute", "8 coups/minute", "10 coups/minute"], correct: 1, explain: "6 coups par minute pour le CAESAR." },
  { tag: "// ARMEMENT", q: "Quel est le calibre du canon de l'AMX10RCR ?", options: ["105mm", "120mm", "135mm", "125mm"], correct: 0, explain: "105mm pour le canon de l'AMX10RCR." },
  { tag: "// HISTOIRE", q: "Qui a écrit La Marseillaise ?", options: ["Rouget de l'Isle", "Rouget de Lille", "Rouge et de l'île", "Rouge et d'Lille"], correct: 0, explain: "Claude Joseph Rouget de l'Isle, auteur de La Marseillaise." },
  { tag: "// TRANSMISSIONS", q: "Quelle est la portée d'un poste radio ER328 ?", options: ["1 km", "12 km", "5 km", "30 km"], correct: 0, explain: "1 km de portée pour l'ER328." },
  { tag: "// VÉHICULES", q: "Combien de batteries possède un VBL ?", options: ["1", "2", "3", "aucune de ces réponses"], correct: 1, explain: "2 batteries pour le VBL." },

  /* ===== QCM DU COMBATTANT — BIBLE MILITAIRE (150 questions, PDF utilisateur) ===== */
  { tag: "// SYMBOLES", q: "Quelles sont les couleurs du drapeau français, de la hampe vers l'extérieur ?", options: ["Bleu, rouge, blanc", "Bleu, blanc, rouge", "Rouge, blanc, bleu", "Blanc, bleu, rouge"], correct: 1, explain: "Le bleu est près de la hampe, puis le blanc, puis le rouge." },
  { tag: "// SYMBOLES", q: "Quelle est la devise de la République française ?", options: ["Un pour tous, tous pour un", "Travail, Famille, Patrie", "Liberté, Égalité, Fraternité", "Honneur et Patrie"], correct: 2, explain: "Devise nationale ; « Honneur et Patrie » figure, elle, sur les drapeaux militaires." },
  { tag: "// SYMBOLES", q: "Quelle est la date de la fête nationale française ?", options: ["Le 11 novembre", "Le 8 mai", "Le 1er mai", "Le 14 juillet"], correct: 3, explain: "Le 14 juillet commémore la prise de la Bastille (1789)." },
  { tag: "// SYMBOLES", q: "Comment s'appelle l'hymne national français ?", options: ["La Marseillaise", "Le Chant du Départ", "La Madelon", "Le Chant des Partisans"], correct: 0, explain: "La Marseillaise est l'hymne national depuis 1795 (puis 1879)." },
  { tag: "// INSTITUTIONS", q: "Qui est le chef des armées en France ?", options: ["Le chef d'état-major", "Le Président de la République", "Le Premier ministre", "Le ministre des Armées"], correct: 1, explain: "La Constitution fait du Président de la République le chef des armées." },
  { tag: "// BLINDÉS", q: "Quel est le char de combat principal de l'armée de Terre ?", options: ["L'Abrams", "Le Challenger 2", "Le Leclerc", "Le Leopard 2"], correct: 2, explain: "Le char Leclerc est le char de bataille français." },
  { tag: "// ARMEMENT", q: "Quel fusil d'assaut remplace le FAMAS ?", options: ["Le M16", "Le G36", "Le SCAR", "Le HK416F"], correct: 3, explain: "Le HK416F est le nouveau fusil standard, adopté à partir de 2017." },
  { tag: "// ARMEMENT", q: "Quel surnom donne-t-on au FAMAS ?", options: ["Le Clairon", "Le Marteau", "Le Sifflet", "Le Rasoir"], correct: 0, explain: "« Le Clairon », à cause de sa poignée de transport." },
  { tag: "// GRADES", q: "Quel est le premier véritable grade des militaires du rang ?", options: ["Aspirant", "Soldat de 1re classe", "Caporal", "Sergent"], correct: 2, explain: "Le caporal. « Soldat de 1re classe » est une distinction, pas un grade." },
  { tag: "// NRBC", q: "Que signifie le sigle NRBC ?", options: ["Niveau de Risque Balistique Contrôlé", "Nouvelle Réserve du Bataillon Central", "Nucléaire, Radiologique, Biologique, Chimique", "Nord, Route, Bataille, Combat"], correct: 2, explain: "Les quatre grandes familles de menaces NRBC." },
  { tag: "// HISTOIRE", q: "Que commémore le 11 novembre ?", options: ["La victoire de 1945", "La prise de la Bastille", "La libération de Paris", "L'armistice de 1918"], correct: 3, explain: "Fin des combats de la Première Guerre mondiale (11 nov. 1918)." },
  { tag: "// HISTOIRE", q: "Que commémore le 8 mai ?", options: ["La victoire de 1945 en Europe", "L'armistice de 1918", "La bataille de Verdun", "Le débarquement"], correct: 0, explain: "Capitulation de l'Allemagne nazie, fin de la 2e Guerre mondiale en Europe." },
  { tag: "// TRADITIONS", q: "Dans quelle ville a lieu le grand défilé militaire du 14 juillet ?", options: ["Lille", "Paris (Champs-Élysées)", "Lyon", "Marseille"], correct: 1, explain: "Le défilé descend les Champs-Élysées." },
  { tag: "// SECOURISME", q: "Que signifie l'abréviation PLS ?", options: ["Poste Léger de Secours", "Protocole de Liaison Sanitaire", "Position Latérale de Sécurité", "Point Logistique Santé"], correct: 2, explain: "On y place une victime inconsciente qui respire." },
  { tag: "// TRADITIONS", q: "De quelle couleur est le célèbre képi de la Légion étrangère ?", options: ["Rouge", "Noir", "Bleu", "Blanc"], correct: 3, explain: "Le képi blanc est l'emblème du légionnaire." },
  { tag: "// HISTOIRE", q: "Sous quel monument repose le Soldat inconnu à Paris ?", options: ["L'Arc de Triomphe", "Le Panthéon", "Les Invalides", "La Tour Eiffel"], correct: 0, explain: "Sa flamme y est ravivée chaque soir." },
  { tag: "// HISTOIRE", q: "Qui a composé La Marseillaise ?", options: ["Gambetta", "Rouget de Lisle", "Victor Hugo", "Napoléon"], correct: 1, explain: "Composée en 1792 à Strasbourg." },
  { tag: "// SÉCURITÉ", q: "Quel est le numéro d'appel d'urgence unique européen ?", options: ["999", "115", "112", "911"], correct: 2, explain: "Le 112 fonctionne dans toute l'Union européenne." },
  { tag: "// SYMBOLES", q: "Combien de couleurs compte le drapeau tricolore ?", options: ["Deux", "Quatre", "Une", "Trois"], correct: 3, explain: "Bleu, blanc, rouge." },
  { tag: "// GRADES", q: "Combien de galons porte un capitaine ?", options: ["Trois", "Deux", "Un", "Cinq"], correct: 0, explain: "Capitaine = 3 galons ; lieutenant = 2 ; sous-lieutenant = 1." },
  { tag: "// ARMEMENT", q: "Quel est le calibre du FAMAS et du HK416F ?", options: ["12,7 mm", "5,56 mm", "9 mm", "7,62 mm"], correct: 1, explain: "Munition standard OTAN de 5,56 × 45 mm." },
  { tag: "// SECOURISME", q: "Face à une hémorragie qui gicle d'un bras, quel est le premier geste ?", options: ["Surélever la tête", "Mettre un pansement léger", "Poser un garrot", "Faire boire la victime"], correct: 2, explain: "L'hémorragie massive d'un membre se traite par un garrot." },
  { tag: "// TOPOGRAPHIE", q: "Que montre l'aiguille d'une boussole ?", options: ["Le sud", "L'est", "L'ouest", "Le nord"], correct: 3, explain: "Elle s'aligne sur le nord magnétique." },
  { tag: "// GRADES", q: "Combien d'étoiles porte un général de brigade ?", options: ["Deux", "Trois", "Quatre", "Cinq"], correct: 0, explain: "2 étoiles ; division = 3, corps d'armée = 4, armée = 5." },
  { tag: "// TRADITIONS", q: "Quelle est la devise de la Légion étrangère ?", options: ["Liberté, Égalité, Fraternité", "Honneur et Fidélité", "Honneur et Patrie", "Marche ou crève"], correct: 1, explain: "« Honneur et Fidélité », propre à la Légion." },
  { tag: "// HISTOIRE", q: "Dans quelle ville La Marseillaise a-t-elle été composée ?", options: ["Paris", "Lyon", "Strasbourg", "Marseille"], correct: 2, explain: "Rouget de Lisle la composa à Strasbourg en 1792." },
  { tag: "// ORGANISATION", q: "Combien d'armées composent les forces armées françaises (hors gendarmerie) ?", options: ["Deux", "Quatre", "Cinq", "Trois (Terre, Air et Espace, Marine)"], correct: 3, explain: "Terre, Armée de l'Air et de l'Espace, Marine nationale." },
  { tag: "// DISCIPLINE", q: "Quel geste marque le respect envers un supérieur ?", options: ["Le salut militaire", "La poignée de main", "Le garde-à-vous seul", "Le clin d'œil"], correct: 0, explain: "Le salut est une marque de respect réglementaire." },
  { tag: "// HISTOIRE", q: "Que commémore la date du 14 juillet 1789 ?", options: ["La fin de la guerre", "La prise de la Bastille", "Le sacre de Napoléon", "La bataille de Valmy"], correct: 1, explain: "Événement fondateur de la Révolution française." },
  { tag: "// TRADITIONS", q: "Quel couvre-chef de tradition est associé à l'armée française ?", options: ["Le chapeau melon", "La casquette plate", "Le képi", "Le béret basque civil"], correct: 2, explain: "Le képi est un couvre-chef militaire traditionnel." },
  { tag: "// BLINDÉS", q: "Quel est le calibre du canon du char Leclerc ?", options: ["105 mm", "90 mm", "155 mm", "120 mm"], correct: 3, explain: "Canon lisse de 120 mm." },
  { tag: "// ARMEMENT", q: "Quel pistolet a remplacé le PAMAS G1 ?", options: ["Le Glock 17", "Le Beretta 92", "Le SIG P226", "Le Colt 1911"], correct: 0, explain: "Le Glock 17, en 9 mm." },
  { tag: "// ARMEMENT", q: "Quel est le calibre du pistolet Glock 17 ?", options: ["11,43 mm", "9 × 19 mm", "5,56 mm", "7,65 mm"], correct: 1, explain: "Le 9 mm Parabellum, munition de poing standard." },
  { tag: "// VÉHICULES", q: "Dans quelle catégorie classe-t-on le Griffon ?", options: ["Hélicoptère", "Véhicule du génie", "VBMR (véhicule blindé multi-rôles)", "Char de combat"], correct: 2, explain: "Successeur du VAB dans le programme Scorpion." },
  { tag: "// VÉHICULES", q: "Que désigne le Jaguar du programme Scorpion ?", options: ["Un char lourd", "Un poseur de pont", "Un ravitailleur", "EBRC (engin blindé de reconnaissance et de combat)"], correct: 3, explain: "Il remplace l'AMX-10RC, l'ERC-90 Sagaie et le VAB HOT." },
  { tag: "// VÉHICULES", q: "Le Serval est un véhicule :", options: ["Blindé multi-rôles léger", "De combat lourd", "De franchissement", "Amphibie de débarquement"], correct: 0, explain: "VBMR léger du programme Scorpion." },
  { tag: "// BLINDÉS", q: "Quel est le calibre de la tourelle du VBCI ?", options: ["90 mm", "25 mm", "12,7 mm", "40 mm"], correct: 1, explain: "Canon de 25 mm." },
  { tag: "// VÉHICULES", q: "Que signifie l'abréviation VAB ?", options: ["Voiture Armée Blindée", "Véhicule Amphibie Blindé", "Véhicule de l'Avant Blindé", "Véhicule d'Assaut Blindé"], correct: 2, explain: "Transport de troupe remplacé progressivement par le Griffon." },
  { tag: "// AVIATION", q: "Quel est l'hélicoptère d'attaque de l'armée de Terre ?", options: ["Le Caïman", "La Gazelle", "Le Cougar", "Le Tigre"], correct: 3, explain: "Appareil d'attaque et de reconnaissance de l'ALAT." },
  { tag: "// AVIATION", q: "Quel hélicoptère de manœuvre est baptisé Caïman ?", options: ["Le NH90", "Le Chinook", "Le Puma", "Le Black Hawk"], correct: 0, explain: "Version terrestre du NH90." },
  { tag: "// GRADES", q: "Quel est le premier grade de sous-officier ?", options: ["Major", "Sergent", "Caporal-chef", "Adjudant"], correct: 1, explain: "Puis sergent-chef, adjudant, adjudant-chef, major." },
  { tag: "// GRADES", q: "Quel est le plus haut grade de sous-officier ?", options: ["Sergent-major", "Aspirant", "Major", "Adjudant-chef"], correct: 2, explain: "Le major coiffe le corps des sous-officiers." },
  { tag: "// GRADES", q: "Combien d'étoiles porte un général de division ?", options: ["Deux", "Quatre", "Cinq", "Trois"], correct: 3, explain: "Brigade 2, division 3, corps d'armée 4, armée 5." },
  { tag: "// ORGANISATION", q: "Qui commande habituellement une section (environ 30 hommes) ?", options: ["Un lieutenant", "Un colonel", "Un caporal", "Un général"], correct: 0, explain: "Le groupe est, lui, commandé par un sergent ou caporal-chef." },
  { tag: "// TOPOGRAPHIE", q: "En quelle unité mesure-t-on couramment un azimut ?", options: ["En hectares", "En degrés ou en millièmes", "En mètres", "En nœuds"], correct: 1, explain: "Angle par rapport au nord." },
  { tag: "// PROCÉDURE RADIO", q: "Dans l'alphabet phonétique OTAN, quel mot désigne la lettre R ?", options: ["Robert", "Rex", "Roméo", "Radio"], correct: 2, explain: "Alpha, Bravo, Charlie… Roméo." },
  { tag: "// PROCÉDURE RADIO", q: "Quel mot désigne la lettre T dans l'alphabet OTAN ?", options: ["Terre", "Tristan", "Théo", "Tango"], correct: 3, explain: "T = Tango." },
  { tag: "// PROCÉDURE RADIO", q: "À la radio, que signifie « Terminé » ?", options: ["La communication est finie", "J'attends ta réponse", "Message reçu", "Répète"], correct: 0, explain: "« Terminé » clôt définitivement l'échange." },
  { tag: "// NRBC", q: "À quoi sert l'ANP dans le domaine NRBC ?", options: ["Une combinaison", "C'est le masque de protection respiratoire", "Un antidote", "Un détecteur"], correct: 1, explain: "Appareil Normal de Protection : le masque à gaz." },
  { tag: "// ARMEMENT", q: "Que désigne le CAESAR ?", options: ["Un radar", "Un blindé du génie", "Un canon de 155 mm sur camion", "Un char léger"], correct: 2, explain: "Camion équipé d'un système d'artillerie." },
  { tag: "// ARMEMENT", q: "Que désigne l'AT4 ?", options: ["Un fusil de précision", "Un lance-grenades", "Une mine", "Un lance-roquettes antichar de 84 mm"], correct: 3, explain: "Tir depuis l'épaule, calibre 84 mm." },
  { tag: "// PROGRAMMES", q: "Comment s'appelle le grand programme de modernisation des blindés médians ?", options: ["Scorpion", "Titan", "Vulcain", "Rapace"], correct: 0, explain: "Griffon, Jaguar et Serval sous un système commun." },
  { tag: "// SECOURISME", q: "Où pose-t-on un garrot ?", options: ["Autour du cou", "En amont de la plaie, à la racine du membre", "Sur la plaie", "En aval de la plaie"], correct: 1, explain: "Entre la plaie et le cœur, jamais sur une articulation." },
  { tag: "// SECOURISME", q: "Au combat, que traite-t-on en priorité absolue ?", options: ["Les brûlures légères", "La déshydratation", "Les hémorragies", "Les fractures"], correct: 2, explain: "« L'hémorragie tue en premier. »" },
  { tag: "// TOPOGRAPHIE", q: "Que représente une échelle de carte au 1/25 000 ?", options: ["1 cm = 25 km", "1 cm = 25 m", "1 cm = 2,5 km", "1 cm = 250 m"], correct: 3, explain: "25 000 cm = 250 m." },
  { tag: "// TOPOGRAPHIE", q: "Que relient les courbes de niveau sur une carte ?", options: ["Des points de même altitude", "Des routes", "Des rivières", "Des frontières"], correct: 0, explain: "Elles décrivent le relief." },
  { tag: "// ARMEMENT", q: "La FN Minimi standard est chambrée en :", options: ["40 mm", "5,56 mm", "9 mm", "12,7 mm"], correct: 1, explain: "Arme d'appui du groupe de combat." },
  { tag: "// ARMEMENT", q: "Quel est le calibre de la mitrailleuse lourde Browning M2 ?", options: ["5,56 mm", "14,5 mm", "12,7 mm", "7,62 mm"], correct: 2, explain: "La « cinquante », 12,7 × 99 mm." },
  { tag: "// ARMEMENT", q: "Le missile MMP (Missile Moyenne Portée) remplace :", options: ["Le Roland", "Le Mistral", "Le Hot", "Le Milan"], correct: 3, explain: "Missile antichar de MBDA." },
  { tag: "// TOPOGRAPHIE", q: "Combien de « nords » distingue-t-on en topographie ?", options: ["Trois (géographique, magnétique, quadrillage)", "Un", "Deux", "Quatre"], correct: 0, explain: "Géographique, magnétique et du quadrillage." },
  { tag: "// BLINDÉS", q: "Quel est le calibre du canon du Jaguar (EBRC) ?", options: ["120 mm", "40 mm", "25 mm", "90 mm"], correct: 1, explain: "Canon télescopé de 40 mm (CTA)." },
  { tag: "// ARMEMENT", q: "Quel fusil de précision de gros calibre équipe l'armée française ?", options: ["Le HK416 (5,56)", "Le Glock (9 mm)", "L'Hécate II (12,7 mm)", "Le FR-F2 (9 mm)"], correct: 2, explain: "L'Hécate II (PGM) tire du 12,7 mm à longue distance." },
  { tag: "// VÉHICULES", q: "Le Griffon remplace quel véhicule ?", options: ["Le VBCI", "Le Leclerc", "Le VBL", "Le VAB"], correct: 3, explain: "Le VAB, blindé de transport de troupe." },
  { tag: "// TOPOGRAPHIE", q: "À combien de millièmes correspond un tour complet ?", options: ["6400", "360", "1000", "3600"], correct: 0, explain: "Cercle militaire divisé en 6400 millièmes." },
  { tag: "// BLINDÉS", q: "Combien de membres compte l'équipage du char Leclerc ?", options: ["Cinq", "Trois", "Quatre", "Deux"], correct: 1, explain: "Chef, tireur, pilote : le chargement est automatique." },
  { tag: "// PROCÉDURE RADIO", q: "Dans l'alphabet OTAN, quel mot désigne la lettre W ?", options: ["Wagon", "Willy", "Whiskey", "William"], correct: 2, explain: "W = Whiskey." },
  { tag: "// PROCÉDURE RADIO", q: "Dans l'alphabet OTAN, quel mot désigne la lettre Z ?", options: ["Zorro", "Zèbre", "Zoulou", "Zulu"], correct: 3, explain: "Z = Zulu." },
  { tag: "// GRADES", q: "Quel est l'ordre correct des officiers subalternes ?", options: ["Sous-lieutenant, lieutenant, capitaine", "Lieutenant, capitaine, commandant", "Capitaine, commandant, colonel", "Aspirant, major, lieutenant"], correct: 0, explain: "Trois grades subalternes." },
  { tag: "// GRADES", q: "Lequel de ces grades est un officier supérieur ?", options: ["Sergent-chef", "Lieutenant-colonel", "Capitaine", "Adjudant"], correct: 1, explain: "Commandant, lieutenant-colonel, colonel." },
  { tag: "// TRADITIONS", q: "Quelle sainte est la patronne des artilleurs et du génie ?", options: ["Sainte Jeanne", "Sainte Claire", "Sainte Barbe", "Sainte Geneviève"], correct: 2, explain: "Fêtée le 4 décembre." },
  { tag: "// TRADITIONS", q: "Quel saint est le patron des parachutistes ?", options: ["Saint Georges", "Saint Maurice", "Saint Gabriel", "Saint Michel"], correct: 3, explain: "L'archange Saint Michel." },
  { tag: "// PROCÉDURE RADIO", q: "À la radio, que signifie « Reçu » ?", options: ["Message entendu et compris", "Répète le message", "J'annule", "Donne ta position"], correct: 0, explain: "Équivalent de « Roger »." },
  { tag: "// PROCÉDURE RADIO", q: "À la radio, que dit-on pour rendre l'antenne à son correspondant ?", options: ["« Collationnez »", "« Parlez » ou « À vous »", "« Terminé »", "« Silence »"], correct: 1, explain: "On lui laisse la parole." },
  { tag: "// TOPOGRAPHIE", q: "Qu'appelle-t-on la déclinaison magnétique ?", options: ["L'altitude d'un point", "La longueur d'un azimut", "L'écart entre nord géographique et nord magnétique", "La pente du terrain"], correct: 2, explain: "Elle se corrige pour passer d'un nord à l'autre." },
  { tag: "// VÉHICULES", q: "À quoi sert principalement le VBL ?", options: ["Le transport de chars", "Le franchissement", "Le ravitaillement en eau", "La reconnaissance et la liaison"], correct: 3, explain: "Véhicule Blindé Léger, rapide et discret." },
  { tag: "// ARMEMENT", q: "Quelle est la portée pratique d'engagement d'un fusil d'assaut comme le HK416F ?", options: ["Environ 300 m", "Environ 50 m", "Environ 1500 m", "Environ 3000 m"], correct: 0, explain: "Efficace surtout jusqu'à ~300 m." },
  { tag: "// ARMEMENT", q: "Quel est le calibre de l'ancien lance-roquettes LRAC F1 ?", options: ["40 mm", "89 mm", "84 mm", "66 mm"], correct: 1, explain: "Le LRAC F1 est en 89 mm." },
  { tag: "// ARMEMENT", q: "Quel est le calibre du mortier léger d'infanterie le plus courant ?", options: ["60 mm", "155 mm", "81 mm", "120 mm"], correct: 2, explain: "Le mortier de 81 mm appuie la compagnie." },
  { tag: "// BLINDÉS", q: "Le canon du char Leclerc est :", options: ["Rayé", "À âme conique", "Sans frein de bouche", "Lisse"], correct: 3, explain: "Canon lisse de 120 mm." },
  { tag: "// VÉHICULES", q: "Le VBCI transporte principalement :", options: ["Un groupe de combat d'infanterie (~9 hommes)", "Un char", "Un canon tracté", "Un hélicoptère"], correct: 0, explain: "Véhicule blindé de combat d'infanterie." },
  { tag: "// ARMEMENT", q: "Quel est le missile sol-air très courte portée de l'armée française ?", options: ["Le Milan", "Le Mistral", "Le MMP", "L'AT4"], correct: 1, explain: "Missile antiaérien à guidage infrarouge." },
  { tag: "// TRADITIONS", q: "Quel saint est le patron de l'arme blindée cavalerie ?", options: ["Sainte Barbe", "Saint Michel", "Saint Georges", "Saint Maurice"], correct: 2, explain: "Saint Georges terrassant le dragon." },
  { tag: "// TRADITIONS", q: "Quel saint est le patron de l'infanterie ?", options: ["Saint Georges", "Saint Gabriel", "Saint Éloi", "Saint Maurice"], correct: 3, explain: "Saint Maurice, chef de la légion thébaine." },
  { tag: "// GRADES", q: "Combien d'étoiles porte un général de corps d'armée ?", options: ["Quatre", "Trois", "Cinq", "Deux"], correct: 0, explain: "Juste sous le général d'armée (5 étoiles)." },
  { tag: "// GRADES", q: "Combien d'étoiles porte un général d'armée ?", options: ["Sept", "Cinq", "Quatre", "Trois"], correct: 1, explain: "Le plus haut grade d'officier général." },
  { tag: "// INSTITUTIONS", q: "Où sont formés les officiers de l'armée de Terre ?", options: ["À Rochefort", "À Salon-de-Provence", "À Saint-Cyr Coëtquidan", "À Saint-Maixent"], correct: 2, explain: "L'ESM Saint-Cyr, à Coëtquidan." },
  { tag: "// INSTITUTIONS", q: "Où sont formés les sous-officiers d'active de l'armée de Terre ?", options: ["À Saint-Cyr", "À Draguignan", "À Coëtquidan", "À l'ENSOA de Saint-Maixent"], correct: 3, explain: "École Nationale des Sous-Officiers d'Active." },
  { tag: "// INSTITUTIONS", q: "Que signifie le sigle CEMAT ?", options: ["Chef d'État-Major de l'Armée de Terre", "Centre d'Entraînement Militaire Avancé de Terre", "Commandement des Écoles Militaires de l'Armée de Terre", "Corps d'État-Major Allié Terrestre"], correct: 0, explain: "Le plus haut chef militaire de l'armée de Terre." },
  { tag: "// ARMEMENT", q: "La munition de 7,62 × 51 mm équipe surtout :", options: ["Les lance-roquettes", "Les mitrailleuses et armes d'appui", "Les pistolets", "Les canons de char"], correct: 1, explain: "Par exemple la Minimi 7,62 ou l'ANF1." },
  { tag: "// ORGANISATION", q: "Que signifie l'abréviation ALAT ?", options: ["Aéronautique Lourde de l'Armée de Terre", "Alerte Légère Anti-Tank", "Aviation Légère de l'Armée de Terre", "Appui Logistique et Aérien Territorial"], correct: 2, explain: "Elle met en œuvre les hélicoptères de l'armée de Terre." },
  { tag: "// TRADITIONS", q: "Quel jour la Légion étrangère célèbre-t-elle Camerone ?", options: ["Le 14 juillet", "Le 8 mai", "Le 11 novembre", "Le 30 avril"], correct: 3, explain: "Combat de Camerone, 30 avril 1863." },
  { tag: "// HISTOIRE", q: "Dans quel pays s'est déroulé le combat de Camerone ?", options: ["Au Mexique", "En Algérie", "En Indochine", "En Italie"], correct: 0, explain: "Camarón de Tejeda, Mexique." },
  { tag: "// HISTOIRE", q: "En quelle année s'est déroulée la bataille de Bir Hakeim ?", options: ["1954", "1942", "1916", "1944"], correct: 1, explain: "Fait d'armes des Forces françaises libres." },
  { tag: "// HISTOIRE", q: "Quelle est la date du débarquement de Normandie ?", options: ["Le 11 novembre 1918", "Le 15 août 1944", "Le 6 juin 1944", "Le 8 mai 1945"], correct: 2, explain: "Le « Jour J » (D-Day)." },
  { tag: "// HISTOIRE", q: "En quelle année a eu lieu la bataille de Verdun ?", options: ["1914", "1918", "1940", "1916"], correct: 3, explain: "Une des plus longues batailles de la Grande Guerre." },
  { tag: "// TRADITIONS", q: "Quelle inscription figure traditionnellement sur les drapeaux et étendards ?", options: ["Honneur et Patrie", "Liberté, Égalité, Fraternité", "Honneur et Fidélité", "Pro Patria"], correct: 0, explain: "Devise brodée sur l'emblème." },
  { tag: "// ARMEMENT", q: "La munition de 40 mm du Jaguar est de type :", options: ["À balle traçante seule", "Télescopée (CTA)", "Sous-calibrée à sabot uniquement", "À charge creuse uniquement"], correct: 1, explain: "Cased Telescoped Ammunition, franco-britannique." },
  { tag: "// TRADITIONS", q: "Quel saint est le patron des transmissions ?", options: ["Sainte Barbe", "Saint Georges", "Saint Gabriel", "Saint Michel"], correct: 2, explain: "L'archange messager Saint Gabriel." },
  { tag: "// GRADES", q: "Dans la cavalerie et l'artillerie, quel grade correspond au caporal de l'infanterie ?", options: ["Le maréchal des logis", "Le sergent", "L'adjudant", "Le brigadier"], correct: 3, explain: "Ces armes montées ont une terminologie propre." },
  { tag: "// ARMEMENT", q: "Quelle est la portée maximale approximative du canon CAESAR (155 mm) ?", options: ["Environ 40 km", "Environ 8 km", "Environ 100 km", "Environ 15 km"], correct: 0, explain: "Jusqu'à ~40 km avec obus à propulsion assistée." },
  { tag: "// BLINDÉS", q: "Quelle est la masse approximative du char Leclerc ?", options: ["Environ 15 tonnes", "Environ 56 tonnes", "Environ 30 tonnes", "Environ 80 tonnes"], correct: 1, explain: "Char de bataille d'une cinquantaine de tonnes." },
  { tag: "// ARMEMENT", q: "Combien de cartouches contient le chargeur standard du Glock 17 ?", options: ["30", "8", "17", "10"], correct: 2, explain: "Le « 17 » vient de sa capacité." },
  { tag: "// HISTOIRE", q: "Qui a créé la Légion d'honneur ?", options: ["Louis XIV", "De Gaulle", "La IIIe République", "Napoléon Bonaparte (1802)"], correct: 3, explain: "Plus haute distinction française." },
  { tag: "// GRADES", q: "Le grade d'aspirant correspond à :", options: ["Un élève-officier (entre sous-off et officier)", "Un militaire du rang", "Un général", "Un civil"], correct: 0, explain: "Grade transitoire des futurs officiers." },
  { tag: "// TOPOGRAPHIE", q: "À 1000 m, un écart de 1 millième correspond à environ :", options: ["1 centimètre", "1 mètre", "10 mètres", "100 mètres"], correct: 1, explain: "Relation utile pour l'artillerie et le tir." },
  { tag: "// TOPOGRAPHIE", q: "Le gisement est un angle mesuré par rapport au :", options: ["Nord géographique", "Sud", "Nord du quadrillage (carte)", "Nord magnétique"], correct: 2, explain: "À distinguer de l'azimut magnétique." },
  { tag: "// TOPOGRAPHIE", q: "Dans la lecture d'une coordonnée, on lit d'abord :", options: ["Vers le nord d'abord", "L'altitude d'abord", "Peu importe l'ordre", "Vers l'est, puis vers le nord (« les X avant les Y »)"], correct: 3, explain: "Règle de lecture des carroyages." },
  { tag: "// ARMEMENT", q: "Qui a fabriqué le FAMAS ?", options: ["La MAS (Manufacture d'armes de Saint-Étienne)", "Heckler & Koch", "FN Herstal", "Beretta"], correct: 0, explain: "Arme française produite à Saint-Étienne." },
  { tag: "// ARMEMENT", q: "Le missile antichar MMP est produit par :", options: ["Dassault", "MBDA", "Nexter", "Thales seul"], correct: 1, explain: "Missilier européen MBDA." },
  { tag: "// ORGANISATION", q: "Une compagnie d'infanterie est commandée par :", options: ["Un sergent", "Un général", "Un capitaine", "Un colonel"], correct: 2, explain: "La compagnie regroupe plusieurs sections." },
  { tag: "// ORGANISATION", q: "Un régiment est commandé par :", options: ["Un capitaine", "Un adjudant", "Un lieutenant", "Un colonel"], correct: 3, explain: "Le chef de corps est un colonel." },
  { tag: "// AVIATION", q: "Quel constructeur produit l'hélicoptère Tigre ?", options: ["Airbus Helicopters", "Boeing", "Sikorsky", "Leonardo"], correct: 0, explain: "Ex-Eurocopter, aujourd'hui Airbus Helicopters." },
  { tag: "// TOPOGRAPHIE", q: "Combien de « nords » corrige-t-on avec la déclinaison et la convergence des méridiens ?", options: ["Quatre nords différents", "Le magnétique et celui du quadrillage par rapport au géographique", "Aucun", "Seulement le sud"], correct: 1, explain: "On relie les trois nords entre eux." },
  { tag: "// PROCÉDURE RADIO", q: "Dans l'alphabet OTAN, quel mot désigne la lettre J ?", options: ["Jules", "Juliet (un seul t)", "Juliett", "Jupiter"], correct: 2, explain: "L'orthographe officielle est « Juliett »." },
  { tag: "// TRADITIONS", q: "Le chasseur (troupes de chasseurs) célèbre traditionnellement :", options: ["Camerone", "Bazeilles", "Austerlitz", "Sidi-Brahim"], correct: 3, explain: "Combat de Sidi-Brahim (1845)." },
  { tag: "// ARMEMENT", q: "Le mortier lourd tracté de l'armée française est un :", options: ["120 mm (MO-120-RT)", "81 mm", "60 mm", "155 mm"], correct: 0, explain: "Mortier rayé tracté de 120 mm." },
  { tag: "// TRADITIONS", q: "Les troupes de marine célèbrent traditionnellement le combat de :", options: ["Valmy", "Bazeilles", "Sidi-Brahim", "Camerone"], correct: 1, explain: "Bazeilles (1870), « la maison des dernières cartouches »." },
  { tag: "// ORGANISATION", q: "Quelle est la vocation d'une OPEX ?", options: ["Une revue de matériel", "Une cérémonie", "Une opération militaire extérieure au territoire national", "Un exercice interne"], correct: 2, explain: "OPEX = OPération EXtérieure." },
  { tag: "// PROGRAMMES", q: "Le programme d'équipement individuel du fantassin s'appelle :", options: ["SCORPION", "TITAN", "SPECTRA", "FÉLIN"], correct: 3, explain: "Fantassin à Équipements et Liaisons Intégrés." },
  { tag: "// INSTITUTIONS", q: "Que gère la DGA ?", options: ["L'armement et les programmes d'équipement", "Le renseignement intérieur", "La solde des militaires", "Les cérémonies officielles"], correct: 0, explain: "Direction Générale de l'Armement." },
  { tag: "// HISTOIRE", q: "Quel officier commandait la compagnie de la Légion à Camerone ?", options: ["Le capitaine Morvan", "Le capitaine Danjou", "Le colonel Rollet", "Le général Koenig"], correct: 1, explain: "Jean Danjou et sa main articulée, devenue relique de la Légion." },
  { tag: "// TRADITIONS", q: "Quelle relique de la Légion étrangère est présentée chaque année à Camerone ?", options: ["Un fanion de Sidi-Brahim", "Le képi de Rollet", "La main en bois du capitaine Danjou", "L'épée de Napoléon"], correct: 2, explain: "La main articulée de Danjou est vénérée par la Légion." },
  { tag: "// HISTOIRE", q: "Quel général commandait les Français libres à Bir Hakeim (1942) ?", options: ["Le général Leclerc", "Le général de Lattre", "Le général Juin", "Le général Koenig"], correct: 3, explain: "Marie-Pierre Kœnig tint la position contre l'Afrikakorps." },
  { tag: "// HISTOIRE", q: "Quelle phrase célèbre est associée à la bataille de Verdun ?", options: ["« Ils ne passeront pas »", "« La garde meurt mais ne se rend pas »", "« On les aura tous »", "« Debout les morts »"], correct: 0, explain: "Mot d'ordre emblématique de Verdun (1916)." },
  { tag: "// ARMEMENT", q: "La munition télescopée de 40 mm (CTA) a été développée conjointement avec :", options: ["L'Italie", "Le Royaume-Uni", "L'Allemagne", "Les États-Unis"], correct: 1, explain: "CTA International, coentreprise franco-britannique (Nexter / BAE)." },
  { tag: "// ARMEMENT", q: "Que signifie exactement l'acronyme FAMAS ?", options: ["Fusil Anti-Matériel Automatique Standard", "Fusil À Munitions Ajustées Spéciales", "Fusil d'Assaut de la Manufacture d'Armes de Saint-Étienne", "Fusil Automatique Modèle de l'Armée du Sud"], correct: 2, explain: "Il tire son nom de la MAS." },
  { tag: "// ARMEMENT", q: "Quelle est la portée efficace approximative de l'Hécate II (12,7 mm) ?", options: ["Environ 300 m", "Environ 5000 m", "Environ 800 m", "Environ 1800 m"], correct: 3, explain: "Fusil de précision de gros calibre à longue distance." },
  { tag: "// ARMEMENT", q: "Quel calibre partagent la Browning M2 et l'Hécate II ?", options: ["12,7 mm", "7,62 mm", "5,56 mm", "9 mm"], correct: 0, explain: "Le 12,7 mm (.50)." },
  { tag: "// HISTOIRE", q: "En quelle année s'est achevée la bataille de Diên Biên Phu ?", options: ["1945", "1954", "1940", "1962"], correct: 1, explain: "Défaite française marquant un tournant de la guerre d'Indochine." },
  { tag: "// ÉQUIPEMENT", q: "Le casque de combat en service dans l'armée française est le casque :", options: ["Lourd M1", "Mk 6", "SPECTRA", "Adrian"], correct: 2, explain: "Casque composite SPECTRA (F1/F2)." },
  { tag: "// INSTITUTIONS", q: "Que signifie le sigle COS ?", options: ["Corps d'Officiers Supérieurs", "Centre d'Opérations et de Sécurité", "Commandement Outre-mer et Sécurité", "Commandement des Opérations Spéciales"], correct: 3, explain: "Il fédère les forces spéciales des trois armées." },
  { tag: "// GRADES", q: "Quelle dignité militaire correspond à sept étoiles ?", options: ["Maréchal de France", "Général d'armée", "Général de corps d'armée", "Amiral"], correct: 0, explain: "Dignité (et non grade) au sommet de la hiérarchie." },
  { tag: "// TRADITIONS", q: "Quelle est la devise de l'École spéciale militaire de Saint-Cyr ?", options: ["« Servir »", "« Ils s'instruisent pour vaincre »", "« Honneur et Fidélité »", "« Marche ou crève »"], correct: 1, explain: "Devise de l'ESM Saint-Cyr." },
  { tag: "// GRADES", q: "Dans la cavalerie et l'artillerie, quel grade correspond au sergent de l'infanterie ?", options: ["L'adjudant", "Le major", "Le maréchal des logis", "Le brigadier"], correct: 2, explain: "Terminologie propre aux armes autrefois montées." },
  { tag: "// HISTOIRE", q: "Quelle route ravitailla Verdun en 1916, surnommée la « Voie sacrée » ?", options: ["Paris — Verdun", "Reims — Verdun", "Metz — Verdun", "Bar-le-Duc — Verdun"], correct: 3, explain: "Axe logistique vital de la bataille." },
  { tag: "// ARMEMENT", q: "Le missile antichar MMP a une portée d'environ :", options: ["4000 m", "500 m", "20 000 m", "1000 m"], correct: 0, explain: "Portée de l'ordre de 4 km." },
  { tag: "// ARMEMENT", q: "De combien de calibres est le tube du CAESAR de 155 mm ?", options: ["70 calibres", "52 calibres", "39 calibres", "20 calibres"], correct: 1, explain: "155 mm / 52 calibres, gage de longue portée." },
  { tag: "// AVIATION", q: "Lequel de ces aéronefs appartient à l'armée de l'Air, et non à l'armée de Terre ?", options: ["Le Caïman", "La Gazelle", "Le Rafale", "Le Tigre"], correct: 2, explain: "Le Rafale est un avion de chasse ; les autres sont des hélicoptères de l'ALAT." },
  { tag: "// ARMEMENT", q: "Le mortier tracté de 120 mm de l'armée française est désigné :", options: ["LLR 81", "MO-60", "TR-155", "MO-120-RT"], correct: 3, explain: "Mortier rayé tracté (Rayé Tracté)." },
  { tag: "// PROGRAMMES", q: "Le programme FÉLIN équipe le fantassin en :", options: ["Optronique, radio et protection intégrées", "Blindage lourd", "Ravitaillement en carburant", "Artillerie"], correct: 0, explain: "Système modulaire du combattant débarqué." },
  { tag: "// HISTOIRE", q: "Quelle bataille de 1863 oppose ~62 légionnaires à des milliers de Mexicains ?", options: ["Magenta", "Camerone", "Sidi-Brahim", "Bazeilles"], correct: 1, explain: "Fait d'armes fondateur de l'esprit Légion." },
  { tag: "// INSTITUTIONS", q: "Que signifie le sigle EMAT ?", options: ["Établissement du Matériel de l'Armée de Terre", "Escadron Motorisé Antichar Territorial", "État-Major de l'Armée de Terre", "École Militaire de l'Armée de Terre"], correct: 2, explain: "Dirigé par le CEMAT." },
  { tag: "// PROCÉDURE RADIO", q: "Dans l'alphabet OTAN, quel mot désigne la lettre Q ?", options: ["Quintal", "Quentin", "Quatre", "Quebec"], correct: 3, explain: "Q = Quebec." },
  { tag: "// PROCÉDURE RADIO", q: "Dans l'alphabet OTAN, quel mot désigne la lettre Y ?", options: ["Yankee", "Yves", "Yacht", "York"], correct: 0, explain: "Y = Yankee." },
  { tag: "// BLINDÉS", q: "Le char Leclerc se passe de pourvoyeur (chargeur humain) grâce à :", options: ["Un second pilote", "Un système de chargement automatique", "Un canon plus court", "Un obus plus léger"], correct: 1, explain: "D'où un équipage réduit à trois." },
  { tag: "// VÉHICULES", q: "Combien de fantassins un Griffon peut-il transporter, environ ?", options: ["Vingt-cinq", "Quarante", "Une dizaine", "Deux"], correct: 2, explain: "Groupe de combat + équipage." },
  { tag: "// INSTITUTIONS", q: "Quel ordre national, après la Légion d'honneur, a été créé par le général de Gaulle en 1963 ?", options: ["La Médaille militaire", "La croix de guerre", "L'ordre de la Libération", "L'ordre national du Mérite"], correct: 3, explain: "Deuxième ordre national français." },
  { tag: "// ÉQUIPEMENT", q: "La structure de protection balistique du combattant est désignée par le sigle :", options: ["SMB (Structure Modulaire Balistique)", "SPECTRA", "FÉLIN", "ANP"], correct: 0, explain: "Gilet pare-balles modulaire." },
  { tag: "// TRADITIONS", q: "Quel saint est traditionnellement lié aux métiers du métal et à l'arme du Train ?", options: ["Saint Gabriel", "Saint Éloi", "Saint Maurice", "Sainte Barbe"], correct: 1, explain: "Saint Éloi, patron des orfèvres et des métiers du métal." },
  { tag: "// GRADES", q: "Le grade de « major » se situe :", options: ["Sous le caporal", "Chez les officiers généraux", "Au sommet du corps des sous-officiers", "Au-dessus du colonel"], correct: 2, explain: "C'est le plus haut grade de sous-officier, distinct du « commandant » (chef de bataillon)." },
];

/* ============================================================
   PALIERS DE DIFFICULTÉ
   ------------------------------------------------------------
   Chaque question reçoit une note de 1 à 5, alignée sur l'index
   du tableau QUESTIONS ci-dessus. On la stocke à part plutôt que
   dans chaque objet : c'est plus court, plus lisible, et ça évite
   de retoucher 238 lignes quand on veut ajuster un palier.

   1 RECRUE    — adages, blagues de chambrée, culture générale
   2 SOLDAT    — bases solides, matériel courant
   3 SOUS-OFF  — désignations, traditions, procédures
   4 OFFICIER  — calibres exacts, dates, sigles pointus
   5 ÉLITE     — le carré des tarés (détails de spécialistes)
   ============================================================ */
const QDIFF = [
  // 0-29 : humour / adages de chambrée
  2,1,1,1,1,1,2,2,1,1, 1,2,1,1,1,1,1,1,1,1, 1,1,1,2,2,2,1,1,1,1,
  // 30-87 : caserne, matériel, traditions (lot précédent)
  2,3,2,1,2,2,4,3,2,4, 4,4,5,3,4,3,2,2,1,1, 5,1,3,4,3,3,3,4,5,4,
  4,2,2,3,5,5,3,5,2,1, 3,4,1,2,1,1,3,4,3,4, 3,3,2,4,3,1,5,4,
]
  // 88-237 : les 150 questions du PDF, déjà classées par rang
  .concat(
    new Array(30).fill(1), // RANG BRONZE
    new Array(30).fill(2), // RANG ARGENT
    new Array(30).fill(3), // RANG OR
    new Array(30).fill(4), // RANG PLATINE
    new Array(30).fill(5)  // RANG DIAMANT
  );

QUESTIONS.forEach((q, i) => { q.d = QDIFF[i] || 3; });

/* ============================================================
   ARMÉES — filtrage des questions par corps
   ------------------------------------------------------------
   Un aviateur n'a pas à tomber sur le calibre du char Leclerc.
   Chaque question porte donc une armée :
     "terre" | "air" | "marine" | "general"
   « general » = culture militaire commune, adages de chambrée,
   histoire, symboles… : ces questions tombent dans TOUTES les
   catégories, car tout le monde est censé les connaître.
   ============================================================ */
const ARMIES = [
  { id: "tout",        name: "TOUTES ARMÉES",     short: "Toutes",  ico: "🎖️" },
  { id: "terre",       name: "ARMÉE DE TERRE",    short: "Terre",   ico: "🪖" },
  { id: "air",         name: "AIR ET ESPACE",     short: "Air",     ico: "✈️" },
  { id: "marine",      name: "MARINE",            short: "Marine",  ico: "⚓" },
  { id: "gendarmerie", name: "GENDARMERIE",       short: "Gendarm.", ico: "🚨" },
  { id: "police",      name: "POLICE NATIONALE",  short: "Police",  ico: "👮" },
  { id: "pompier",     name: "SAPEURS-POMPIERS",  short: "Pompiers", ico: "🚒" },
];

// Les questions maison n'ont pas d'armée : on la déduit du thème.
// Seuls les thèmes réellement spécifiques à la Terre sont restreints ;
// tout le reste (adages, histoire, grades, procédure radio…) est commun.
const TERRE_TAGS = ["BLINDÉS", "VÉHICULES", "ARMEMENT", "TACTIQUE", "NRBC", "TOPOGRAPHIE", "ÉQUIPEMENT"];
const MARINE_TAGS = ["MARINE"];
function armyFromTag(tag) {
  const t = String(tag || "").replace(/^\/\/\s*/, "").toUpperCase();
  if (MARINE_TAGS.some((x) => t.includes(x))) return "marine";
  if (TERRE_TAGS.some((x) => t.includes(x))) return "terre";
  return "general";
}
QUESTIONS.forEach((q) => { if (!q.a) q.a = armyFromTag(q.tag); });

/* Fusion avec la banque distante.
   Le tableau window.PW_QUESTIONS_BANK est créé vide par pw-questions-loader.js
   puis rempli au fil des chargements Firestore. On ne peut donc pas se
   contenter d'un push unique au démarrage : on réinjecte à chaque arrivée de
   lot. `QBANK_MERGED` évite d'insérer deux fois les mêmes questions. */
let QBANK_MERGED = 0;
function mergeQuestionBank() {
  const bank = (typeof window !== "undefined" && Array.isArray(window.PW_QUESTIONS_BANK))
    ? window.PW_QUESTIONS_BANK : [];
  if (bank.length <= QBANK_MERGED) return 0;
  const fresh = bank.slice(QBANK_MERGED);
  QBANK_MERGED = bank.length;
  // `fromBank` distingue les questions venues de Firestore des questions
  // maison : c'est ce qui permet de compter correctement l'effectif d'une
  // armée sans double comptage.
  fresh.forEach((q) => { if (!q.a) q.a = armyFromTag(q.tag); q.fromBank = true; });
  QUESTIONS.push(...fresh);
  return fresh.length;
}
mergeQuestionBank();

/* Garantit que les questions de l'armée demandée sont bien disponibles.
   Appelé AVANT chaque lancement de partie : sans ça, un joueur pouvait
   démarrer un match sur les seules questions maison le temps que le réseau
   réponde, et tomber sur les mêmes en boucle. */
async function ensureQuestions(armyId) {
  if (typeof window === "undefined" || !window.PWQuestions) return;
  if (window.PWQuestions.isLoaded(armyId)) { mergeQuestionBank(); return; }
  APP.loading(true);
  try { await window.PWQuestions.ensure(armyId); }
  catch (e) { console.warn("[PW] chargement des questions", e); }
  finally { APP.loading(false); }
  mergeQuestionBank();
}

// Chaque lot reçu est fusionné immédiatement, même hors lancement de partie
// (par exemple pendant que le joueur consulte le lobby).
if (typeof window !== "undefined") {
  window.PW_ON_QUESTIONS = () => { mergeQuestionBank(); if (dom && dom.armyPicker) renderArmyPicker(); };
}
// (le filet « armée manquante » est appliqué dans mergeQuestionBank, qui
//  traite chaque lot au moment où il arrive)

// Sélection courante, mémorisée d'une session à l'autre.
const ARMY_KEY = "massacre_popote_army";
let selectedArmy = (() => {
  try { const v = localStorage.getItem(ARMY_KEY); return ARMIES.some((a) => a.id === v) ? v : "tout"; }
  catch (e) { return "tout"; }
})();
function setArmy(id) {
  if (!ARMIES.some((a) => a.id === id)) return;
  selectedArmy = id;
  try { localStorage.setItem(ARMY_KEY, id); } catch (e) {}
}
function armyById(id) { return ARMIES.find((a) => a.id === id) || ARMIES[0]; }

/* Questions disponibles pour une armée donnée.
   « general » est toujours inclus : sans ça, choisir Marine priverait le
   joueur de toute la culture MASSACRE, qui fait l'identité du jeu. */
function questionsFor(armyId) {
  if (!armyId || armyId === "tout") return QUESTIONS;
  return QUESTIONS.filter((q) => q.a === armyId || q.a === "general");
}

// Libellés + couleurs des paliers (réutilisés dans le match et le tutoriel)
const DIFF_META = {
  1: { name: "RECRUE",   color: "#b9a77a", mult: 1.00 },
  2: { name: "SOLDAT",   color: "#cd7f32", mult: 1.15 },
  3: { name: "SOUS-OFF", color: "#cdd2da", mult: 1.35 },
  4: { name: "OFFICIER", color: "#e0ac3f", mult: 1.60 },
  5: { name: "ÉLITE",    color: "#f6ca66", mult: 2.00 },
};

// Palier "cible" selon le grade du joueur : plus tu montes, plus ça pique.
function diffCenter(gradeIndex) {
  if (gradeIndex <= 1) return 1;   // Soldat / Première classe
  if (gradeIndex <= 4) return 2;   // Caporal → Sergent
  if (gradeIndex <= 8) return 3;   // Sergent-chef → Major
  if (gradeIndex <= 11) return 4;  // Lieutenant → Commandant
  return 5;                        // Lieutenant-colonel / Colonel
}

/* Tirage pondéré autour du palier cible : la difficulté du joueur domine,
   les paliers voisins restent possibles (sinon c'est répétitif), les paliers
   lointains sont quasi exclus. Garantit aussi qu'on ne renvoie jamais deux
   fois la même question dans un même match. */
function pickQuestions(count, gradeIndex, armyId) {
  const center = diffCenter(gradeIndex);
  const pool = questionsFor(armyId || selectedArmy).slice();
  const out = [];
  while (out.length < count && pool.length) {
    const weights = pool.map((q) => 1 / (1 + 1.7 * Math.abs(q.d - center)));
    const total = weights.reduce((a, w) => a + w, 0);
    let r = Math.random() * total, idx = 0;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/* ============================================================
   DOSSIER MILITAIRE — DÉCORATIONS, TITRES, BANNIÈRES
   ------------------------------------------------------------
   Principe : on ne STOCKE jamais la liste des trophées débloqués,
   on la RECALCULE à partir des compteurs du profil. Impossible de
   désynchroniser, et un ancien compte récupère automatiquement
   tout ce qu'il a mérité avant l'ajout de cette fonctionnalité.
   Seuls les CHOIX du joueur (titre affiché, bannière) sont stockés.
   ============================================================ */

// `stat` pointe vers un compteur du profil, `need` est le seuil.
const MEDALS = [
  // --- SERVICE (nombre de parties) ---
  { id: "instruction", name: "Insigne d'Instruction",        cat: "Service",     ico: "🎗️", stat: "played",      need: 1,    metal: "Bronze", desc: "Terminer sa première partie." },
  { id: "combattant",  name: "Croix du Combattant",          cat: "Service",     ico: "✝️",  stat: "played",      need: 10,   metal: "Bronze", desc: "10 parties au compteur." },
  { id: "def_bronze",  name: "Défense Nationale — Bronze",   cat: "Service",     ico: "🥉", stat: "played",      need: 50,   metal: "Bronze", desc: "50 parties. Tu connais la maison." },
  { id: "def_argent",  name: "Défense Nationale — Argent",   cat: "Service",     ico: "🥈", stat: "played",      need: 150,  metal: "Argent", desc: "150 parties. Un pilier." },
  { id: "def_or",      name: "Défense Nationale — Or",       cat: "Service",     ico: "🥇", stat: "played",      need: 300,  metal: "Or",     desc: "300 parties. Un monument." },

  // --- BRAVOURE (victoires) ---
  { id: "militaire",   name: "Médaille Militaire",           cat: "Bravoure",    ico: "🎖️", stat: "wins",        need: 25,   metal: "Bronze", desc: "25 victoires." },
  { id: "valeur",      name: "Croix de la Valeur Militaire", cat: "Bravoure",    ico: "⚔️",  stat: "wins",        need: 75,   metal: "Argent", desc: "75 victoires." },
  { id: "guerre",      name: "Croix de Guerre",              cat: "Bravoure",    ico: "🗡️", stat: "wins",        need: 200,  metal: "Or",     desc: "200 victoires. Respect." },
  { id: "honneur",     name: "Légion d'Honneur",             cat: "Bravoure",    ico: "🏅", stat: "wins",        need: 400,  metal: "Or",     desc: "400 victoires. Le Graal." },

  // --- SAVOIR (bonnes réponses) ---
  { id: "brevet",      name: "Brevet Élémentaire",           cat: "Savoir",      ico: "📗", stat: "goodAnswers", need: 50,   metal: "Bronze", desc: "50 bonnes réponses." },
  { id: "certificat",  name: "Certificat Technique",         cat: "Savoir",      ico: "📘", stat: "goodAnswers", need: 200,  metal: "Argent", desc: "200 bonnes réponses." },
  { id: "superieur",   name: "Brevet Supérieur",             cat: "Savoir",      ico: "📙", stat: "goodAnswers", need: 500,  metal: "Or",     desc: "500 bonnes réponses." },
  { id: "guerre_ecole",name: "Diplôme de l'École de Guerre", cat: "Savoir",      ico: "🎓", stat: "goodAnswers", need: 1000, metal: "Or",     desc: "1000 bonnes réponses. Encyclopédie vivante." },

  // --- FAITS D'ARMES (série, sans-faute) ---
  { id: "citation",    name: "Citation à l'Ordre du Régiment",cat: "Faits d'armes", ico: "📜", stat: "best",     need: 5,    metal: "Bronze", desc: "5 victoires d'affilée." },
  { id: "fourragere",  name: "Fourragère",                   cat: "Faits d'armes", ico: "🧶", stat: "best",      need: 10,   metal: "Argent", desc: "10 victoires d'affilée." },
  { id: "resistance",  name: "Médaille de la Résistance",    cat: "Faits d'armes", ico: "🔥", stat: "best",      need: 20,   metal: "Or",     desc: "20 victoires d'affilée. Increvable." },
  { id: "sansfaute",   name: "Insigne du Sans-Faute",        cat: "Faits d'armes", ico: "🎯", stat: "perfects",  need: 5,    metal: "Argent", desc: "5 parties sans la moindre erreur." },
  { id: "tireur",      name: "Insigne de Tireur d'Élite",    cat: "Faits d'armes", ico: "🏹", stat: "perfects",  need: 20,   metal: "Or",     desc: "20 parties parfaites." },

  // --- INTENDANCE (économie & matériel) ---
  { id: "fourrier",    name: "Insigne de Fourrier",          cat: "Intendance",  ico: "📦", stat: "itemsUsed",   need: 25,   metal: "Bronze", desc: "25 objets d'arsenal utilisés." },
  { id: "armurier",    name: "Brevet d'Armurier",            cat: "Intendance",  ico: "🔧", stat: "itemsUsed",   need: 100,  metal: "Argent", desc: "100 objets utilisés." },
  { id: "tresorier",   name: "Médaille du Trésorier",        cat: "Intendance",  ico: "💰", stat: "coinsEarned", need: 10000,metal: "Or",     desc: "10 000 coins gagnés au total." },
];

/* Titres affichés à côté du pseudo. `cond(p)` reçoit le profil.
   Volontairement mélangés : progression sérieuse + vannes de caserne. */
const TITLES = [
  { id: "bleu",      name: "Bleu-bite",                 cond: () => true,                        desc: "Offert. Comme ta dignité." },
  { id: "recrue",    name: "Recrue",                    cond: (p) => p.goodAnswers >= 10,        desc: "10 bonnes réponses." },
  { id: "bidasse",   name: "Bidasse",                   cond: (p) => p.goodAnswers >= 50,        desc: "50 bonnes réponses." },
  { id: "troufion",  name: "Troufion Confirmé",         cond: (p) => p.goodAnswers >= 120,       desc: "120 bonnes réponses." },
  { id: "pilier",    name: "Pilier de Popote",          cond: (p) => p.goodAnswers >= 250,       desc: "250 bonnes réponses." },
  { id: "gueule",    name: "Grande Gueule de Chambrée", cond: (p) => p.goodAnswers >= 400,       desc: "400 bonnes réponses." },
  { id: "encyclo",   name: "Encyclopédie de Caserne",   cond: (p) => p.goodAnswers >= 700,       desc: "700 bonnes réponses." },
  { id: "legende",   name: "Légende de la Popote",      cond: (p) => p.goodAnswers >= 1200,      desc: "1200 bonnes réponses. Chapeau." },

  { id: "tirgroupe", name: "Roi du Tir Groupé",         cond: (p) => (p.used && p.used.fusil) >= 50,  desc: "50 fusils dégainés." },
  { id: "beton",     name: "Tête de Béton",             cond: (p) => (p.used && p.used.casque) >= 50, desc: "50 casques encaissés." },
  { id: "chrono",    name: "Maître du Chrono",          cond: (p) => (p.used && p.used.montre) >= 50, desc: "50 montres grillées." },
  { id: "rat",       name: "Rat de Caisse",             cond: (p) => p.coinsEarned >= 20000,     desc: "20 000 coins amassés." },
  { id: "invaincu",  name: "L'Invaincu",                cond: (p) => p.best >= 15,               desc: "15 victoires d'affilée." },
  { id: "sansfaute", name: "Le Sans-Faute",             cond: (p) => p.perfects >= 10,           desc: "10 parties parfaites." },
  { id: "marcheou",  name: "Marche ou Crève",           cond: (p) => p.played >= 300,            desc: "300 parties encaissées." },
  { id: "poilu",     name: "Le Poilu",                  cond: (p) => Date.now() - (p.created || Date.now()) >= 30 * DAY, desc: "30 jours d'ancienneté." },
  { id: "veteran",   name: "Vétéran de la Popote",      cond: (p) => p.wins >= 150,              desc: "150 victoires." },
  { id: "colonel",   name: "Le Vieux Briscard",         cond: (p) => rankFromRP(p.rp).gradeIndex >= 12, desc: "Atteindre Lieutenant-colonel." },
  { id: "baroudeur", name: "Baroudeur en Chef",         cond: (p) => rankFromRP(p.rp).gradeIndex >= MAX_GRADE, desc: "Atteindre Colonel." },
  { id: "presti1",   name: "Vieille Garde",             cond: (p) => (p.prestige || 0) >= 1,     desc: "Passer le prestige 1." },
  { id: "presti5",   name: "Fer de Lance",              cond: (p) => (p.prestige || 0) >= 5,     desc: "Atteindre le prestige 5." },
  { id: "presti10",  name: "Massacre Absolu",           cond: (p) => (p.prestige || 0) >= 10,    desc: "Prestige 10 — le sommet ultime." },
  { id: "tresorier2",name: "Trésorier de Guerre",       cond: (p) => (p.coinsEarned || 0) >= 100000, desc: "100 000 coins amassés au total." },
  { id: "sniper",    name: "Tireur d'Élite",            cond: (p) => (p.goodAnswers || 0) >= 2000, desc: "2000 bonnes réponses." },
  { id: "rouleau",   name: "Rouleau Compresseur",       cond: (p) => (p.best || 0) >= 30,        desc: "30 victoires d'affilée." },
  { id: "chirurgien",name: "Le Chirurgien",             cond: (p) => (p.perfects || 0) >= 50,    desc: "50 parties parfaites (sans-faute)." },
  { id: "acharne",   name: "Tête Brûlée",               cond: (p) => (p.played || 0) >= 1000,    desc: "1000 parties livrées." },
];

/* Bannières = habillage de la carte de profil. Débloquées au grade. */
const BANNERS = [
  { id: "olive",   name: "Treillis",      grade: 0,  css: "linear-gradient(135deg,#2b2a16,#1d1c10)" },
  { id: "sable",   name: "Sable",         grade: 2,  css: "linear-gradient(135deg,#3a3320,#241f12)" },
  { id: "bronze",  name: "Bronze",        grade: 4,  css: "linear-gradient(135deg,#4a2f18,#241a0e)" },
  { id: "acier",   name: "Acier",         grade: 6,  css: "linear-gradient(135deg,#2a2f36,#16191d)" },
  { id: "sang",    name: "Sang & Or",     grade: 8,  css: "linear-gradient(135deg,#4a1a14,#2a1008)" },
  { id: "laurier", name: "Laurier",       grade: 10, css: "linear-gradient(135deg,#1d3a24,#0f2015)" },
  { id: "or",      name: "Or de Colonel", grade: 13, css: "linear-gradient(135deg,#5a4212,#2e2208)" },
];

// --- calcul des déblocages (jamais stocké, toujours recalculé) ---
function statValue(p, key) {
  // Total TOUS objets confondus : sans la boucle, les 4 nouveaux ne
  // comptaient pas pour les décorations d'Intendance.
  if (key === "itemsUsed") { const u = p.used || {}; return ITEM_KEYS.reduce((a, k) => a + (u[k] || 0), 0); }
  return p[key] || 0;
}
function medalUnlocked(p, m) { return statValue(p, m.stat) >= m.need; }
function unlockedMedals(p) { return MEDALS.filter((m) => medalUnlocked(p, m)); }
function unlockedTitles(p) { return TITLES.filter((t) => { try { return !!t.cond(p); } catch (e) { return false; } }); }
function unlockedBanners(p) { const gi = rankFromRP(p.rp).gradeIndex; return BANNERS.filter((b) => gi >= b.grade); }

function titleById(id) { return TITLES.find((t) => t.id === id) || TITLES[0]; }
function bannerById(id) { return BANNERS.find((b) => b.id === id) || BANNERS[0]; }
// Titre réellement affichable : si le joueur a choisi un titre puis a (par ex.)
// changé de compte, on retombe proprement sur "Bleu-bite" plutôt que d'afficher
// un titre non mérité.
function activeTitle(p) {
  const t = titleById(p.title);
  return (t && t.cond(p)) ? t : TITLES[0];
}
function activeBanner(p) {
  const b = bannerById(p.banner);
  return (rankFromRP(p.rp).gradeIndex >= b.grade) ? b : BANNERS[0];
}

/* ---------- THÈMES SAISONNIERS ----------
   Habillage du jeu (accents + fond du hero) sans toucher à la direction
   artistique militaire. "auto" suit la vraie saison. Préférence stockée dans
   profile.theme (champ joueur, non verrouillé serveur). */
const SEASONS = [
  { key: "auto",      label: "Auto (saison)", ico: "🗓️", sw: "#e0ac3f" },
  { key: "ete",       label: "Été",           ico: "🏖️", sw: "#ffd875" },
  { key: "automne",   label: "Automne",       ico: "🍂", sw: "#d97b2e" },
  { key: "hiver",     label: "Hiver",         ico: "❄️", sw: "#84b4da" },
  { key: "printemps", label: "Printemps",     ico: "🌸", sw: "#8fae3f" },
];
// Saison réelle (hémisphère nord) d'après le mois courant.
function currentSeasonKey() {
  const m = new Date().getMonth();       // 0 = janvier
  if (m <= 1 || m === 11) return "hiver";
  if (m <= 4) return "printemps";
  if (m <= 7) return "ete";
  return "automne";
}
// Petites accroches de chambrée par saison, affichées dans le hero.
const SEASON_EYE = {
  ete: "// PERMISSION — MODE ÉTÉ",
  automne: "// QUARTIER — MODE AUTOMNE",
  hiver: "// CLASSE NEIGE — MODE HIVER",
  printemps: "// MANŒUVRES — MODE PRINTEMPS",
};
const SEASON_JOKE = {
  ete: "C'est l'été : treillis au vestiaire, tongs aux pieds — ça sent les perms, recrue. 🍹",
  automne: "L'automne à la caserne : le café fume et les galons tombent comme les feuilles. 🍂",
  hiver: "Classe neige : QCM au coin du poêle, treillis polaire de rigueur, recrue. ❄️",
  printemps: "Le printemps : la cour fleurit, les bleus bourgeonnent — en avant, marche ! 🌸",
};
// Applique le thème : attribut data-pw-season sur <html> + accroche saisonnière.
function applyTheme(pref) {
  const p = pref || "auto";
  const season = p === "auto" ? currentSeasonKey() : p;
  document.documentElement.setAttribute("data-pw-season", season);
  const eb = document.querySelector(".gg-hero .section__eyebrow");
  if (eb && SEASON_EYE[season]) eb.textContent = SEASON_EYE[season];
  const lead = document.querySelector(".gg-hero .gg-hero__lead");
  if (lead && SEASON_JOKE[season]) lead.textContent = SEASON_JOKE[season];
}

/* ============================================================
   MODE CLAIR / SOMBRE (indépendant de la saison)
   ------------------------------------------------------------
   Permet de jouer en plein soleil (fond clair, texte foncé, zéro reflet).
   Au 1er lancement on suit le réglage du système (prefers-color-scheme),
   puis on retient le choix manuel du joueur (localStorage).
   ============================================================ */
function currentMode() {
  try {
    const saved = localStorage.getItem("pw_mode");
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) {}
  try {
    if (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch (e) {}
  return "dark";
}
function applyMode(mode) {
  const m = (mode === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-pw-mode", m);
  const b = document.getElementById("btnThemeMode");
  if (b) {
    b.textContent = (m === "light") ? "☀️" : "🌙";
    b.title = (m === "light") ? "Passer en mode sombre" : "Passer en mode clair";
    b.setAttribute("aria-pressed", m === "light" ? "true" : "false");
  }
}
function toggleMode() {
  const next = (document.documentElement.getAttribute("data-pw-mode") === "light") ? "dark" : "light";
  try { localStorage.setItem("pw_mode", next); } catch (e) {}
  applyMode(next);
  if (typeof pwTrack === "function") pwTrack("theme_mode", { mode: next });
}
// Applique le mode DÈS le chargement du script (le bouton existe déjà dans le HTML).
applyMode(currentMode());
// Si le joueur n'a jamais choisi manuellement, on suit les changements système en direct.
try {
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
      let saved = null; try { saved = localStorage.getItem("pw_mode"); } catch (x) {}
      if (saved !== "light" && saved !== "dark") applyMode(e.matches ? "light" : "dark");
    });
  }
} catch (e) {}

/* ============================================================
   MESURE — Google Analytics 4 (via gtag). Aucun donnée perso : on suit le
   PARCOURS (ouverture, match, code échangé, visite boutique…) pour savoir où
   les joueurs décrochent et si le jeu fait vendre. Isolé sur NOTRE flux GA4
   (send_to) pour ne pas polluer l'analytics de la boutique.
   ============================================================ */
const PW_GA_ID = "G-FJ857FSRQJ";
let _gaReady = false;
function initAnalytics() {
  if (_gaReady) return; _gaReady = true;
  try {
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
    if (!document.querySelector("script[data-pw-ga]")) {
      const s = document.createElement("script");
      s.async = true; s.setAttribute("data-pw-ga", "1");
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + PW_GA_ID;
      document.head.appendChild(s);
      window.gtag("js", new Date());
    }
    window.gtag("config", PW_GA_ID, { send_page_view: false });
  } catch (e) { /* analytics ne doit jamais casser le jeu */ }
}
function pwTrack(event, params) {
  try { if (window.gtag) window.gtag("event", event, Object.assign({ send_to: PW_GA_ID }, params || {})); } catch (e) {}
}

/* SCÈNE D'ÉTÉ injectée dans le hero (coucher de soleil sur la mer + palmiers +
   étincelles). Le CSS ne l'affiche qu'en thème Été. On l'injecte une seule fois. */
const _PALM = '<path d="M72 180 C66 140 62 100 74 66 L82 68 C70 102 76 142 80 180 Z"/><circle cx="72" cy="66" r="4"/><circle cx="81" cy="68" r="3.4"/><path d="M76 64 C54 52 30 52 10 62 C30 54 54 58 74 68 Z"/><path d="M76 64 C62 40 40 28 16 30 C40 30 60 44 76 66 Z"/><path d="M76 64 C80 38 98 22 124 22 C100 30 84 46 78 66 Z"/><path d="M76 64 C94 50 120 48 138 60 C118 52 96 56 80 66 Z"/><path d="M76 64 C70 40 74 16 88 2 C80 22 78 44 78 66 Z"/><path d="M76 64 C82 70 108 70 132 80 C108 66 88 64 78 66 Z"/><path d="M76 64 C74 72 50 74 26 86 C50 68 66 64 76 66 Z"/>';
const SUMMER_HTML =
  '<div class="gg-hero__summer" aria-hidden="true">' +
    '<div class="pw-summer__sun"></div>' +
    '<span class="pw-summer__spark" style="left:16%;top:34%"></span>' +
    '<span class="pw-summer__spark" style="left:72%;top:26%;animation-delay:2.2s"></span>' +
    '<span class="pw-summer__spark" style="left:46%;top:18%;animation-delay:4.1s"></span>' +
    '<span class="pw-summer__spark" style="left:86%;top:42%;animation-delay:1.2s"></span>' +
    '<span class="pw-summer__spark" style="left:30%;top:48%;animation-delay:3.3s"></span>' +
    '<svg class="pw-summer__sea" viewBox="0 0 360 96" preserveAspectRatio="none" aria-hidden="true">' +
      '<path fill="#1c6b73" d="M0 26 C55 12 110 30 165 22 C225 13 285 32 360 22 L360 96 L0 96 Z"/>' +
      '<path fill="rgba(255,214,120,.5)" d="M168 24 C176 22 186 22 194 24 L214 96 L150 96 Z"/>' +
      '<path fill="#12545e" d="M0 44 C70 32 130 50 200 42 C270 34 320 50 360 42 L360 96 L0 96 Z"/>' +
      '<path fill="#0c3b44" d="M0 64 C80 54 150 70 230 62 C300 55 330 66 360 62 L360 96 L0 96 Z"/>' +
      '<path fill="rgba(255,255,255,.15)" d="M24 42 C56 36 84 44 116 40 C104 46 62 50 24 46 Z"/>' +
      '<path fill="rgba(255,255,255,.12)" d="M236 40 C268 34 298 42 336 38 C304 46 266 48 236 44 Z"/>' +
    '</svg>' +
    '<svg class="pw-summer__palm pw-summer__palm--m" viewBox="0 0 140 180" aria-hidden="true"><g fill="#2c1a0d">' + _PALM + '</g></svg>' +
    '<svg class="pw-summer__palm pw-summer__palm--l" viewBox="0 0 140 180" aria-hidden="true"><g fill="#241408">' + _PALM + '</g></svg>' +
    '<svg class="pw-summer__palm pw-summer__palm--r" viewBox="0 0 140 180" aria-hidden="true"><g fill="#1c1207">' + _PALM + '</g></svg>' +
  '</div>';
function mountSummerScene() {
  document.querySelectorAll(".gg-hero").forEach((h) => {
    if (!h.querySelector(".gg-hero__summer")) h.insertAdjacentHTML("afterbegin", SUMMER_HTML);
  });
}
/* Particules saisonnières (feuilles/flocons/pétales) : le CSS choisit la forme
   selon la saison, et n'affiche ce calque que pour automne/hiver/printemps. */
function mountHeroFx() {
  let fx = '<div class="gg-hero__fx" aria-hidden="true">';
  for (let i = 0; i < 16; i++) {
    const left = Math.round(Math.random() * 100);
    const dur = (5 + Math.random() * 5).toFixed(1);
    const del = (Math.random() * 6).toFixed(1);
    const sz = Math.round(7 + Math.random() * 8);
    fx += '<span class="pw-flake" style="left:' + left + '%;width:' + sz + 'px;height:' + sz +
      'px;animation-duration:' + dur + 's;animation-delay:' + del + 's"></span>';
  }
  fx += '</div>';
  document.querySelectorAll(".gg-hero").forEach((h) => {
    if (!h.querySelector(".gg-hero__fx")) h.insertAdjacentHTML("afterbegin", fx);
  });
}

const BOT_NAMES = ["Bidasse_77", "LaPiste", "AdjuPèteSec", "Marsouin_06", "TêteDeNoeud", "Rambo2Bgo", "Le_Bleu", "ParaSousPerf",
  "GégèneTango", "ChefPeperFan", "TgEtRampe", "CouscousBoulette", "TreillisSale", "FrérotLégion", "MarcheOuCrève",
  "CplGrognon", "PiouPiou", "LeFantassin", "GuileTraining", "TontonRéserviste", "Bigeard_Jr", "RangersCirées"];

/* ---------- intendance (boutique de coins) ---------- */
// NB : "key" identifie la récompense côté serveur (functions/index.js, SHOP_REWARDS /
// WHEEL_REWARDS). Quand le backend Firebase est actif, c'est le SERVEUR qui fixe la
// valeur réelle de la réduction (jamais le client) et crée un vrai code Shopify.
const SHOP = [
  { ico: "🎟️", key: "shop5",     title: "CODE -5 %",        desc: "5 % sur toute la boutique",          cost: 2500 },
  { ico: "🎟️", key: "shop10",    title: "CODE -10 %",       desc: "10 % sur toute la boutique",         cost: 5000 },
  { ico: "🚚", key: "freeship",  title: "LIVRAISON OFFERTE", desc: "Frais de port à 0 €",                cost: 4500 },
  { ico: "🎟️", key: "shop15",    title: "CODE -15 %",       desc: "15 % dès 40 € d'achat",              cost: 10000 },
  { ico: "🩹", key: "shoppatch", title: "PATCH OFFERT",     desc: "Un patch OFFERT dès 30 € d'achat en boutique.", cost: 12000 },
  { ico: "🔥", key: "shop20",    title: "CODE -20 %",        desc: "20 % dès 60 € — le gros calibre",    cost: 18000 },
  // --- ARSENAL ---
  // Prix calés sur les revenus réels : un joueur régulier encaisse ~980 coins
  // par jour hors parties. Un objet coûte donc entre un tiers et une journée
  // de jeu, pour qu'acheter reste un choix et non une formalité.
  { type: "item", key: "montre",   title: "MONTRE",        desc: "En match : +5 secondes sur le chrono de la question.",              cost: 300 },
  { type: "item", key: "ration",   title: "RATION DOUBLE", desc: "Double les points de ta prochaine bonne réponse.",                  cost: 400 },
  { type: "item", key: "casque",   title: "CASQUE",        desc: "Bloque la prochaine attaque adverse (fusil ou grenade).",           cost: 500 },
  { type: "item", key: "jumelles", title: "JUMELLES",      desc: "Élimine 2 mauvaises réponses sur la question en cours.",            cost: 550 },
  { type: "item", key: "fusil",    title: "FUSIL",         desc: "Annule une manche gagnée par l'adversaire.",                        cost: 700 },
  { type: "item", key: "fumigene", title: "FUMIGÈNE",      desc: "Aveugle l'adversaire : il ne voit plus ses réponses pendant 4 s.",  cost: 750 },
  { type: "item", key: "grenade",  title: "GRENADE",       desc: "Ampute de moitié le temps restant de l'adversaire.",                cost: 900 },
];
// PATCH OFFERT reste un code "maison" (cadeau physique, pas une réduction %) :
// pas d'équivalent automatique côté Shopify pour l'instant.

/* ---------- roue de la popote ---------- */
/* Lots de la roue — coins et matériel uniquement.
   Les codes promo en ont été retirés : ils exigent les Cloud Functions (plan
   Blaze) pour être de VRAIS codes Shopify, et distribuer des codes non
   reconnus en caisse serait pire que de ne pas en donner. Les segments "item"
   remplissent la même fonction de gros lot. */
const WHEEL = [
  { label: "+50",          type: "coins", val: 50,  color: "#4a5224", w: 24 },
  { label: "🔫 FUSIL",      type: "item",  key: "fusil",  title: "un FUSIL",  color: "#8e0f13", w: 12 },
  { label: "+100",         type: "coins", val: 100, color: "#6a5a1f", w: 18 },
  { label: "RIEN 😬",      type: "none",  color: "#2f3417", w: 12 },
  { label: "+250",         type: "coins", val: 250, color: "#b8732a", w: 10 },
  { label: "🪖 CASQUE",     type: "item",  key: "casque", title: "un CASQUE", color: "#3a6a2a", w: 10 },
  { label: "JACKPOT +500", type: "coins", val: 500, color: "#ffd23f", w: 4 },
  { label: "⌚ MONTRE",     type: "item",  key: "montre", title: "une MONTRE", color: "#2a5a6a", w: 10 },
];
const WHEEL_SPIN_COST = 150;

/* ============================================================
   CALENDRIER HEBDOMADAIRE — récompenses de présence
   ------------------------------------------------------------
   7 cases, une par jour consécutif de connexion. On réclame une
   case par jour ; sauter un jour remet la série à zéro et on
   repart au jour 1. Le jour 7 est le gros lot.
   Tout est vérifiable côté règles Firestore via `lastClaim`
   (même mécanique que la roue), donc pas besoin de Blaze.
   ============================================================ */
const WEEK_REWARDS = [
  { day: 1, kind: "coins", val: 100,       label: "100 coins",     ico: "🪙" },
  { day: 2, kind: "coins", val: 200,       label: "200 coins",     ico: "🪙" },
  { day: 3, kind: "item",  item: "montre", label: "1 Montre",      ico: "⌚" },
  { day: 4, kind: "coins", val: 350,       label: "350 coins",     ico: "🪙" },
  { day: 5, kind: "item",  item: "casque", label: "1 Casque",      ico: "🪖" },
  { day: 6, kind: "coins", val: 500,       label: "500 coins",     ico: "🪙" },
  { day: 7, kind: "jackpot", val: 1000, item: "fusil", label: "1000 coins + 1 Fusil", ico: "🎖️" },
];

// Jour calendaire local (et non un simple Date.now()/DAY) : sinon la journée
// bascule à une heure arbitraire selon le fuseau du joueur.
function dayStamp(ts) {
  const d = new Date(ts || Date.now());
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function daysBetween(a, b) {
  const p = (s) => new Date(Math.floor(s / 10000), Math.floor(s / 100) % 100 - 1, s % 100);
  return Math.round((p(b) - p(a)) / DAY);
}

/* État du calendrier : quel jour est réclamable, où en est la série. */
function weekState(p) {
  const today = dayStamp();
  const last = p.lastClaimDay || 0;
  let streak = p.weekStreak || 0;

  if (!last) return { streak: 0, next: 1, canClaim: true, claimedToday: false };
  const gap = daysBetween(last, today);
  // Date locale ANTÉRIEURE à la dernière réclamation : voyage vers l'ouest,
  // horloge reculée… On refuse la réclamation plutôt que d'écrire un
  // `lastClaimDay` plus petit, ce qui ferait rejeter par les règles Firestore
  // TOUTES les futures écritures du profil (coins de match compris).
  if (gap < 0) return { streak, next: Math.min(streak + 1, 7), canClaim: false, claimedToday: true, skewed: true };
  if (gap === 0) return { streak, next: Math.min(streak + 1, 7), canClaim: false, claimedToday: true };
  if (gap === 1) {
    // Après le jour 7, on reboucle sur une nouvelle semaine.
    const next = streak >= 7 ? 1 : streak + 1;
    return { streak: streak >= 7 ? 0 : streak, next, canClaim: true, claimedToday: false };
  }
  // Un jour sauté : la série repart de zéro.
  return { streak: 0, next: 1, canClaim: true, claimedToday: false, broken: true };
}

async function claimWeekly() {
  const st = weekState(profile);
  if (!st.canClaim) { toast("Récompense du jour déjà réclamée, recrue. Reviens demain."); return; }
  ensureItems(profile);

  // COINS réglés par le SERVEUR (claimDailyBonus), qui décide aussi du jour et de
  // la série. Les objets (non monétaires) restent ajoutés côté client.
  let r;
  if (FB) {
    const res = await FB.claimDailyBonus();
    if (res.ok) {
      r = WEEK_REWARDS[(res.data.day | 0) - 1] || WEEK_REWARDS[0];
      if (typeof res.data.coins === "number") profile.coins = res.data.coins;
      profile.weekStreak = res.data.day;
      profile.lastClaimDay = dayStamp();
    } else if (!res.unavailable) {
      toast((res.error && res.error.message) || "Récompense indisponible, recrue."); return;
    } else {
      r = WEEK_REWARDS[st.next - 1]; // repli local (Cloud Functions absentes)
      if (r.kind === "coins" || r.kind === "jackpot") { profile.coins += r.val; profile.coinsEarned = (profile.coinsEarned || 0) + r.val; }
      profile.weekStreak = st.next; profile.lastClaimDay = Math.max(profile.lastClaimDay || 0, dayStamp());
    }
  } else {
    r = WEEK_REWARDS[st.next - 1];
    if (r.kind === "coins" || r.kind === "jackpot") { profile.coins += r.val; profile.coinsEarned = (profile.coinsEarned || 0) + r.val; }
    profile.weekStreak = st.next; profile.lastClaimDay = Math.max(profile.lastClaimDay || 0, dayStamp());
  }

  let msg = "";
  if (r.kind === "coins") { msg = "+" + r.val + " coins"; }
  else if (r.kind === "item") { profile.items[r.item] = (profile.items[r.item] || 0) + 1; msg = r.label + " " + ITEM_FALLBACK[r.item]; }
  else { profile.items[r.item] = (profile.items[r.item] || 0) + 1; msg = "+" + r.val + " coins et 1 Fusil 🔫"; }

  saveProfile(); renderHud(); publishMe();
  renderWeekly(); refreshWeekDot();

  openModal(
    '<button class="pw-modal__close" data-close>✕</button>' +
    '<p class="pw-modal__eyebrow">// ORDINAIRE DU JOUR ' + st.next + '</p>' +
    '<div class="gg-ceremony"><div class="gg-ceremony__rays"></div>' +
      '<div class="gg-ceremony__medal gg-medal--' + (st.next === 7 ? "or" : "bronze") + '">' + r.ico + '</div></div>' +
    '<h2 class="pw-modal__title">' + (st.next === 7 ? "SEMAINE COMPLÈTE !" : "PERÇU !") + '</h2>' +
    '<p class="pw-modal__text">' + esc(msg) + (st.next === 7
      ? '<br><span style="color:var(--khaki)">Nouvelle semaine dès demain, soldat.</span>'
      : '<br><span style="color:var(--khaki)">Reviens demain pour le jour ' + (st.next + 1) + '.</span>') + '</p>' +
    '<div class="pw-modal__actions"><button class="btn btn--primary" data-close>🫡 ROMPEZ</button></div>');
}

// Pastille sur l'onglet tant qu'une récompense est à percevoir.
function refreshWeekDot() {
  const dot = $("weekDot"); if (!dot || !profile) return;
  dot.hidden = !weekState(profile).canClaim;
}

function renderWeekly() {
  const el = dom.weekly; if (!el) return;
  refreshWeekDot();
  const st = weekState(profile);

  let html = '<div class="gg-week__head">' +
    '<h2 class="gg-section-title" style="margin:0">ORDINAIRE DE LA SEMAINE</h2>' +
    '<span class="gg-week__streak">' + (st.streak > 0 ? "Série : " + st.streak + " jour" + (st.streak > 1 ? "s" : "") : "Série à démarrer") + '</span>' +
    '</div>' +
    '<p class="gg-career__sub">Une case par jour de présence. Saute un jour et tu repars au jour 1. Le jour 7 vaut le déplacement.</p>' +
    '<div class="gg-week">';

  WEEK_REWARDS.forEach((r) => {
    // weekState remet déjà `streak` à 0 quand une nouvelle semaine commence :
    // une simple comparaison suffit.
    const done = r.day <= st.streak;
    const isNext = r.day === st.next && st.canClaim;
    const cls = done ? "gg-day--done" : isNext ? "gg-day--now" : "gg-day--soon";
    html += '<div class="gg-day ' + cls + (r.day === 7 ? " gg-day--jackpot" : "") + '">' +
      '<span class="gg-day__num">JOUR ' + r.day + '</span>' +
      '<span class="gg-day__ico">' + (done ? "✔" : r.ico) + '</span>' +
      '<span class="gg-day__lbl">' + esc(r.label) + '</span>' +
      '</div>';
  });
  html += '</div>';

  html += '<div class="gg-week__cta">' + (st.canClaim
    ? '<button class="btn btn--primary" id="weekClaim">🎁 PERCEVOIR LE JOUR ' + st.next + '</button>'
    : '<button class="btn btn--ghost" disabled>✔ Jour ' + st.streak + ' déjà perçu — reviens demain</button>') + '</div>';

  if (st.broken && st.streak === 0 && (profile.lastClaimDay || 0)) {
    html += '<p class="gg-week__warn">⚠️ Série interrompue : tu as sauté un jour. On repart au jour 1.</p>';
  }

  el.innerHTML = html;
  const c = $("weekClaim"); if (c) c.addEventListener("click", claimWeekly);
}

/* ---------- comptes / profil (localStorage) ---------- */
const AKEY = "massacre_popote_accounts", CKEY = "massacre_popote_current";
function loadAccounts() { try { return JSON.parse(localStorage.getItem(AKEY)) || {}; } catch (e) { return {}; } }
function saveAccounts() { try { localStorage.setItem(AKEY, JSON.stringify(accounts)); } catch (e) {} }
function newAccount(pseudo, mat) {
  return { pseudo, matricule: mat, created: Date.now(), level: 1, xp: 0, coins: START_COINS, rp: 0,
    wins: 0, losses: 0, streak: 0, best: 0, codes: [], items: { fusil: 0, casque: 0, montre: 0 },
    lastSpin: 0, lastDaily: 0, lastStake: 100, sinceOffer: 0, tutoSeen: false,
    // --- dossier militaire (Lot 2) ---
    played: 0, goodAnswers: 0, perfects: 0, coinsEarned: 0,
    used: { fusil: 0, casque: 0, montre: 0 },
    title: "bleu", banner: "olive", friends: [],
    // --- calendrier hebdomadaire ---
    weekStreak: 0, lastClaimDay: 0,
    // --- progression / prestige ---
    prestige: 0 };
}
const normKey = (p) => p.trim().toLowerCase();
// Normalise un profil (localStorage OU Firestore) qui pourrait avoir des champs
// manquants — comptes créés avant l'ajout d'un champ, documents Firestore partiels,
// etc. Corrige l'affichage "undefined"/"NaN" dans le HUD et rend le profil auto-réparant.
function ensureItems(p) {
  if (!p) return p;
  if (typeof p.level !== "number" || isNaN(p.level)) p.level = 1;
  if (typeof p.xp !== "number" || isNaN(p.xp)) p.xp = 0;
  if (typeof p.coins !== "number" || isNaN(p.coins)) p.coins = START_COINS;
  if (typeof p.rp !== "number" || isNaN(p.rp)) p.rp = 0;
  if (typeof p.wins !== "number" || isNaN(p.wins)) p.wins = 0;
  if (typeof p.losses !== "number" || isNaN(p.losses)) p.losses = 0;
  if (typeof p.streak !== "number" || isNaN(p.streak)) p.streak = 0;
  if (typeof p.best !== "number" || isNaN(p.best)) p.best = 0;
  if (!Array.isArray(p.codes)) p.codes = [];
  // Inventaire : on parcourt ITEM_KEYS plutôt que d'énumérer à la main, sinon
  // chaque nouvel objet oblige à penser à trois endroits — et les profils
  // existants se retrouvent avec des compteurs `undefined`.
  if (!p.items || typeof p.items !== "object") p.items = {};
  ITEM_KEYS.forEach((k) => { if (typeof p.items[k] !== "number" || isNaN(p.items[k])) p.items[k] = 0; });
  if (typeof p.lastSpin !== "number") p.lastSpin = 0;
  if (typeof p.lastDaily !== "number") p.lastDaily = 0;
  if (typeof p.lastStake !== "number") p.lastStake = 100;
  if (typeof p.sinceOffer !== "number") p.sinceOffer = 0;
  if (typeof p.tutoSeen !== "boolean") p.tutoSeen = false;
  // --- dossier militaire (Lot 2) ---
  // Comptes créés avant cette version : on repart de 0 sur les nouveaux
  // compteurs, mais on estime rétroactivement 'played' et 'coinsEarned'
  // pour ne pas voler leurs premières décorations aux anciens joueurs.
  if (typeof p.played !== "number" || isNaN(p.played)) p.played = (p.wins || 0) + (p.losses || 0);
  if (typeof p.goodAnswers !== "number" || isNaN(p.goodAnswers)) p.goodAnswers = 0;
  if (typeof p.perfects !== "number" || isNaN(p.perfects)) p.perfects = 0;
  if (typeof p.coinsEarned !== "number" || isNaN(p.coinsEarned)) p.coinsEarned = Math.max(0, (p.coins || 0) - START_COINS);
  if (!p.used || typeof p.used !== "object") p.used = {};
  ITEM_KEYS.forEach((k) => { if (typeof p.used[k] !== "number" || isNaN(p.used[k])) p.used[k] = 0; });
  if (typeof p.title !== "string") p.title = "bleu";
  if (typeof p.banner !== "string") p.banner = "olive";
  if (!Array.isArray(p.friends)) p.friends = [];
  if (typeof p.weekStreak !== "number" || isNaN(p.weekStreak)) p.weekStreak = 0;
  if (typeof p.lastClaimDay !== "number" || isNaN(p.lastClaimDay)) p.lastClaimDay = 0;
  if (typeof p.prestige !== "number" || isNaN(p.prestige)) p.prestige = 0;
  p.prestige = clamp(p.prestige, 0, PRESTIGE_MAX);
  // La courbe d'XP a été rééquilibrée : un ancien compte pouvait dépasser 55.
  if (p.level > MAX_LEVEL) { p.level = MAX_LEVEL; p.xp = 0; }
  return p;
}
function saveProfile() { if (currentKey && !FB) { accounts[currentKey] = profile; saveAccounts(); } if (FB && profile) FB.saveProfile(profile); }

let accounts = loadAccounts();
let currentKey = localStorage.getItem(CKEY) || null;
let profile = null;
let MATCH = null, WAIT = null, SALONS = [], selectedStake = 100, authMode = "signup", wheelDeg = 0, offerTimer = null;
// Mémorise le dernier match solo terminé, uniquement pour le bouton REVANCHE :
// MATCH est remis à null en fin de partie et n'est donc plus consultable.
let LAST_MATCH = null;
// Backend en ligne : présent uniquement si firebase-config.js + pw-firebase.js sont chargés et activés.
const FB = (typeof window !== "undefined" && window.PWFirebase) ? window.PWFirebase : null;

/* Couche « ressenti app » (pw-app.js). Optionnelle : si le fichier n'est pas
   chargé, on retombe sur des implémentations neutres et le jeu fonctionne
   exactement pareil, sans animation de vue ni vibration. */
const APP = (typeof window !== "undefined" && window.PWApp) ? window.PWApp : {
  transition: (fn) => fn(),
  haptic: () => {},
  loading: () => {},
};

/* ---------- raccourcis DOM ---------- */
const dom = {};
["authEmbers", "ggEmbers", "viewAuth", "gameShell", "authPseudo", "authName", "authMat", "authErr", "btnAuthGo", "btnAuthToggle", "authSub", "authBonus",
 "ggHud", "quickStakes", "salonList", "salonSearch", "salonEmpty", "waitCode", "waitPlayers", "waitStakes", "waitPot",
 "meBadge", "meName", "meScore", "roundNum", "matchPot", "foeBadge", "foeName", "foeScore", "timerFill",
 "qTag", "qDiff", "qText", "qOptions", "qFeedback", "resultBox", "resultTitle", "resultPot", "resultScore",
 "resultGains", "resultRankup", "ggLadder", "shopGrid", "ownedCodes", "ownedItems", "modal", "modalBackdrop", "modalBox", "toast",
 "matchArsenal", "btnUseFusil", "btnUseCasque", "btnUseMontre",
 "btnUseJumelles", "btnUseRation", "btnUseFumigene", "btnUseGrenade",
 "cntFusil", "cntCasque", "cntMontre", "rwMe", "rwFoe",
 "dossier", "leaderboard", "weekly", "armyPicker", "progress"].forEach((id) => dom[id] = $(id));

/* ---------- toast ---------- */
let toastT;
function toast(m) { dom.toast.textContent = m; dom.toast.classList.add("toast--show"); clearTimeout(toastT); toastT = setTimeout(() => dom.toast.classList.remove("toast--show"), 2400); }

/* ---------- modale ---------- */
// Fermeture au clavier (Échap) : cohérent avec le clic sur le fond, déjà
// autorisé. Améliore l'accessibilité sans changer le comportement.
function escOnKey(e) { if (e.key === "Escape") closeModal(); }
function openModal(html) {
  dom.modalBox.innerHTML = html; dom.modal.hidden = false;
  dom.modal.setAttribute("role", "dialog"); dom.modal.setAttribute("aria-modal", "true");
  dom.modalBackdrop.onclick = closeModal;
  dom.modalBox.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  document.addEventListener("keydown", escOnKey);
  // Focus dans la modale pour le clavier / lecteur d'écran.
  const first = dom.modalBox.querySelector("button, [href], input, [tabindex]");
  if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
}
function closeModal() { dom.modal.hidden = true; dom.modalBox.innerHTML = ""; document.removeEventListener("keydown", escOnKey); if (offerTimer) { clearInterval(offerTimer); offerTimer = null; } }

/* ============================================================
   AUTH
   ============================================================ */
/* ---------- filtre anti-grossieretes pour les pseudos ---------- */
const BANNED = ["connard","conard","connasse","conasse","salope","salopard","salaud","putain","encule","enculer","enculee","enfoire","fdp","filsdepute","ntm","niquetamere","branleur","branlette","tarlouze","tafiole","pedophile","tapette","gouine","violeur","pouffiasse","poufiasse","petasse","grognasse","batard","merde","chiotte","negre","negro","bougnoule","bicot","youpin","chinetoque","bamboula","fuck","bitch","cunt","asshole","faggot","nigger","nigga","whore","rapist"];
function cleanPseudo(name) {
  const n = String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g,"o").replace(/1/g,"i").replace(/3/g,"e").replace(/4/g,"a").replace(/5/g,"s").replace(/7/g,"t").replace(/@/g,"a").replace(/\$/g,"s")
    .replace(/[^a-z]/g, "");
  return !BANNED.some((w) => n.includes(w));
}
function showAuth() { dom.viewAuth.hidden = false; dom.gameShell.hidden = true; authMode = "signup"; renderAuthMode(); }
function renderAuthMode() {
  if (FB) {
    if (authMode === "signup") { dom.authName.hidden = false; dom.authSub.innerHTML = "Crée ton compte : pseudo + email + mot de passe."; dom.btnAuthGo.textContent = "CRÉER MON COMPTE"; dom.btnAuthToggle.textContent = "J'ai déjà un compte → me connecter"; dom.authBonus.style.display = ""; }
    else { dom.authName.hidden = true; dom.authSub.innerHTML = "Connecte-toi avec ton email et ton mot de passe."; dom.btnAuthGo.textContent = "SE CONNECTER"; dom.btnAuthToggle.textContent = "Pas de compte ? → en créer un"; dom.authBonus.style.display = "none"; }
    dom.authErr.textContent = ""; return;
  }
  if (authMode === "signup") {
    dom.authSub.innerHTML = "Crée ton matricule pour entrer à la popote.<br>Compte local, sauvegardé sur cet appareil.";
    dom.btnAuthGo.textContent = "S'ENRÔLER";
    dom.btnAuthToggle.textContent = "J'ai déjà un matricule → me connecter";
    dom.authBonus.style.display = "";
  } else {
    dom.authSub.innerHTML = "Connecte-toi avec ton blaze et ton matricule.";
    dom.btnAuthGo.textContent = "SE CONNECTER";
    dom.btnAuthToggle.textContent = "Pas encore enrôlé ? → créer un compte";
    dom.authBonus.style.display = "none";
  }
  dom.authErr.textContent = "";
}
function authGo() {
  if (FB) return authGoFB();
  const pseudo = dom.authPseudo.value.trim(), mat = dom.authMat.value.trim();
  if (pseudo.length < 3) return (dom.authErr.textContent = "Blaze trop court (3 caractères mini).");
  if (!cleanPseudo(pseudo)) return (dom.authErr.textContent = "Blaze trop grossier, recrue. Trouve autre chose.");
  if (!/^\d{4}$/.test(mat)) return (dom.authErr.textContent = "Le matricule = 4 chiffres.");
  const key = normKey(pseudo);
  if (authMode === "signup") {
    if (accounts[key]) return (dom.authErr.textContent = "Ce blaze a déjà un matricule. Connecte-toi.");
    accounts[key] = newAccount(pseudo, mat); currentKey = key; saveAccounts();
    enterGame(); toast("Enrôlé, " + pseudo + " ! +" + START_COINS + " coins 🎁");
    setTimeout(() => openWheel(true), 600);
  } else {
    if (!accounts[key]) return (dom.authErr.textContent = "Aucun matricule pour ce blaze. Enrôle-toi.");
    if (accounts[key].matricule !== mat) return (dom.authErr.textContent = "Matricule erroné, recrue.");
    currentKey = key; enterGame(); toast("De retour, " + accounts[key].pseudo + " 🫡");
  }
}
/* ----- variantes Firebase (utilisées seulement si FB actif) ----- */
function setupFbAuthUI() {
  dom.authPseudo.placeholder = "Email"; dom.authPseudo.removeAttribute("maxlength"); dom.authPseudo.setAttribute("type", "email");
  dom.authMat.placeholder = "Mot de passe (6+ caractères)"; dom.authMat.setAttribute("type", "password"); dom.authMat.removeAttribute("maxlength"); dom.authMat.removeAttribute("inputmode");
  dom.authName.placeholder = "Pseudo (3 a 16 car.)"; dom.authName.removeAttribute("hidden");
  // Lien "mot de passe oublié" — ajouté une seule fois, uniquement en mode en ligne.
  if (!document.getElementById("authForgot") && dom.btnAuthToggle && dom.btnAuthToggle.parentNode) {
    const a = document.createElement("button");
    a.id = "authForgot"; a.type = "button"; a.className = "pw-auth__forgot";
    a.textContent = "Mot de passe oublié ?";
    a.addEventListener("click", authForgot);
    dom.btnAuthToggle.parentNode.insertBefore(a, dom.btnAuthToggle.nextSibling);
  }
}
// Envoie l'email de réinitialisation à l'adresse saisie dans le champ email.
async function authForgot() {
  const email = (dom.authPseudo.value || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { dom.authErr.textContent = "Entre d'abord ton email ci-dessus, puis reclique."; return; }
  dom.authErr.textContent = "Envoi de l'email…";
  try {
    await FB.sendPasswordReset(email);
    dom.authErr.textContent = "📧 Email envoyé à " + email + " — clique le lien reçu pour choisir un nouveau mot de passe (regarde aussi les spams).";
  } catch (e) {
    const map = { "auth/user-not-found": "Aucun compte pour cet email.", "auth/invalid-email": "Email invalide.", "auth/too-many-requests": "Trop de tentatives — réessaie plus tard." };
    dom.authErr.textContent = (e && map[e.code]) || "Impossible d'envoyer l'email. Réessaie.";
  }
}
async function authGoFB() {
  const email = dom.authPseudo.value.trim(), pass = dom.authMat.value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return (dom.authErr.textContent = "Entre un email valide.");
  if (pass.length < 6) return (dom.authErr.textContent = "Mot de passe : 6 caractères minimum.");
  dom.authErr.textContent = "Connexion…";
  let pseudo = "";
  if (authMode === "signup") {
    pseudo = dom.authName.value.trim();
    if (pseudo.length < 3) return (dom.authErr.textContent = "Choisis un pseudo (3 caractères mini).");
    if (!cleanPseudo(pseudo)) return (dom.authErr.textContent = "Pseudo trop grossier, recrue. Trouve autre chose.");
  }
  try { if (authMode === "signup") await FB.signUp(email, pass, pseudo); else await FB.signIn(email, pass); }
  catch (e) {
    // Messages clairs selon le motif. `pwCode` vient de signUp (pseudo pris /
    // réservé / trop court) ; `code` vient de Firebase Auth (email déjà utilisé…).
    const byPseudo = {
      taken: "Ce pseudo est déjà pris — choisis-en un autre, recrue.",
      reserved: "Ce pseudo est réservé (marque ou staff). Trouve autre chose.",
      short: "Pseudo trop court (3 caractères mini).",
    };
    const byAuth = {
      "auth/email-already-in-use": "Cet email a déjà un compte. Connecte-toi plutôt.",
      "auth/invalid-email": "Email invalide.",
      "auth/weak-password": "Mot de passe trop faible (6 caractères mini).",
      "auth/wrong-password": "Mot de passe incorrect.",
      "auth/user-not-found": "Aucun compte pour cet email.",
      "auth/too-many-requests": "Trop de tentatives — réessaie dans un moment.",
    };
    dom.authErr.textContent =
      byPseudo[e && e.pwCode] || byAuth[e && e.code] ||
      (e && e.message) || "Erreur d'authentification.";
  }
}
/* Non connecté : on affiche l'écran d'authentification INTÉGRÉ à la page.
   L'ancienne version ouvrait une modale bloquante renvoyant vers
   profils.html — page désormais absorbée dans l'onglet Profil. Elle
   entrait en plus en concurrence avec showAuth() appelé par logout(),
   ce qui pouvait laisser le joueur devant une modale impossible à fermer. */
function showLoginGate() {
  closeModal();
  showAuth();
}
async function handleFbAuth(user) {
  if (!user) { showLoginGate(); return; }
  try { profile = await FB.loadProfile(user); currentKey = user.uid; enterGame(true); closeModal(); }
  catch (e) { dom.authErr.textContent = "Impossible de charger le profil."; }
}
function logout() { cancelCountdown(); rtCleanup(); MATCH = null; if (FB) FB.signOut(); currentKey = null; localStorage.removeItem(CKEY); profile = null; dom.authPseudo.value = ""; dom.authMat.value = ""; showAuth(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function enterGame(fromFB) {
  if (!fromFB) profile = accounts[currentKey];
  if (typeof profile.sinceOffer !== "number") profile.sinceOffer = 0;
  ensureItems(profile);
  initAnalytics(); pwTrack("game_open", { fb: !!FB });
  mountSummerScene();                     // scène d'été (affichée seulement en thème Été)
  mountHeroFx();                          // particules automne/hiver/printemps
  applyTheme(profile.theme || "auto");   // habillage saisonnier du jeu
  // Texte de l'échelle des grades mis à jour depuis le JS (évite de régénérer la
  // section Shopify) : plus d'échelons, grades = XP + coins, reset mensuel de l'XP.
  const _careerSub = document.querySelector(".gg-career__sub");
  if (_careerSub) _careerSub.innerHTML = '14 grades, de <strong>Soldat</strong> à <strong style="color:#ffd23f">Colonel</strong>. Pour monter : gagne assez d\'<strong>XP de carrière</strong> (temps de jeu) au combat, PUIS paie la promotion en <strong style="color:#ffd23f">coins</strong>. L\'adversaire que tu croises est de <strong>ton grade</strong>, et les questions s\'adaptent à ton niveau. ⚠️ Chaque mois, l\'<strong>XP et les niveaux</strong> repartent à zéro (nouvelle saison) — mais tes <strong>grades</strong> et tes <strong>coins</strong> restent.';
  if (!FB) localStorage.setItem(CKEY, currentKey);
  saveProfile();
  dom.viewAuth.hidden = true; dom.gameShell.hidden = false;
  renderHud(); freshSalons();
  // Ancre d'arrivée : profils.html redirige vers #profil, et on peut partager
  // un lien direct vers un onglet (#classement, #boutique…).
  showView(viewFromHash() || "viewLobby");
  publishMe();        // inscrit / rafraîchit ma ligne au classement
  syncFriendships();  // récupère les demandes que d'autres ont acceptées
  // Préchargement en arrière-plan pendant que le joueur regarde le lobby.
  // En « Toutes armées » on ne précharge QUE la Terre (la plus fournie) :
  // tirer les 560 Ko des trois armées dès l'arrivée annulerait tout le gain
  // de la migration pour le joueur par défaut. Les deux autres armées seront
  // chargées au premier lancement de partie, ou au changement d'armée.
  // L'index seul (1 lecture, quelques octets) suffit à afficher les VRAIS
  // effectifs par armée dans le sélecteur, sans rien télécharger.
  if (window.PWQuestions) window.PWQuestions.warm().then(() => renderArmyPicker());
  ensureQuestions(selectedArmy === "tout" ? "terre" : selectedArmy);
  refreshWeekDot();
  maybeOpenTuto();
  if (profile.tutoSeen) {
    const st = weekState(profile);
    if (st.canClaim) toast("🎁 Ton ordinaire du jour " + st.next + " t'attend !");
    else if (Date.now() - profile.lastSpin >= DAY) toast("🎡 Ta roue quotidienne t'attend !");
  }
}

/* ============================================================
   HUD
   ============================================================ */
function renderHud() {
  const rk = rankOf(profile), metal = "#e0ac3f";
  const bActive = activeBanner(profile);   // le visuel choisi s'affiche sur la barre du haut
  const need = xpForLevel(profile.level), xpPct = Math.min(100, Math.round(profile.xp / need * 100));
  const rpPct = Math.round(rk.rpInGrade / rk.gradeSpan * 100);
  dom.ggHud.innerHTML = `
    <div class="gg-hud__id">
      <div class="gg-hud__badge">${ggInsignia(rk.gradeIndex, rk.tier)}</div>
      <div class="gg-hud__who">
        <span class="gg-hud__mytitle">${esc(activeTitle(profile).name)}</span>
        <span class="gg-hud__name">${esc(profile.pseudo)}</span>
        <div class="gg-hud__grade" style="color:${metal}">${rk.grade}</div>
      </div>
    </div>
    <div class="gg-bank"><div class="gg-bank__num">${coinIcon("pw-coin-ico pw-coin-ico--lg")} ${profile.coins}</div><span class="gg-bank__lbl">MASSACRE Coins</span><span class="gg-bank__hint">🎟️ échangeables contre de vrais codes promo</span></div>
    <div class="gg-hud__level">
      <div class="gg-hud__level-top">
        <span>${profile.prestige ? `<span class="gg-hud__pres" title="${esc(prestigeInfo(profile.prestige).name)}">${prestigeInfo(profile.prestige).ico}${profile.prestige}</span> ` : ""}NIVEAU <b>${profile.level}</b></span>
        <span>${profile.level >= MAX_LEVEL ? "MAX" : `${profile.xp}/${need} XP`}</span>
      </div>
      <div class="gg-bar"><div class="gg-bar__fill" style="width:${xpPct}%"></div></div>
      <div class="gg-hud__level-top" style="margin-top:.5rem"><span>GALONS</span><span>${rk.capped ? "MAX" : rk.rpInGrade + "/" + rk.gradeSpan}</span></div>
      <div class="gg-bar"><div class="gg-bar__fill" style="width:${rpPct}%;background:linear-gradient(90deg,var(--khaki),${metal})"></div></div>
    </div>
    <div class="gg-hud__stats">
      <div class="gg-stat"><div class="gg-stat__num gg-stat__num--win">${profile.wins}</div><span class="gg-stat__lbl">Victoires</span></div>
      <div class="gg-stat"><div class="gg-stat__num gg-stat__num--loss">${profile.losses}</div><span class="gg-stat__lbl">Défaites</span></div>
      <div class="gg-stat"><div class="gg-stat__num gg-stat__num--streak">${profile.streak}</div><span class="gg-stat__lbl">Série</span></div>
    </div>
    <div class="gg-hud__actions">
      <button class="gg-hud__btn gg-hud__btn--wheel" id="btnWheel">🎡 ROUE</button>
      <button class="gg-hud__btn" id="btnTuto">📖 INSTRUCTION</button>
      <button class="gg-hud__btn gg-hud__mode" id="btnThemeMode" aria-label="Basculer clair / sombre" title="Clair / sombre">${document.documentElement.getAttribute("data-pw-mode") === "light" ? "☀️" : "🌙"}</button>
    </div>`;
  // Bannière choisie en fond de la barre du haut (le "visuel" vit ici, plus de
  // carte d'identité répétée dans le profil). Voile sombre pour la lisibilité.
  dom.ggHud.style.background = `linear-gradient(rgba(18,15,7,.80),rgba(18,15,7,.88)), ${bActive.css}`;
  dom.ggHud.style.backgroundSize = "cover";
  dom.ggHud.style.backgroundPosition = "center";
  renderQuickStakes();
}

/* ============================================================
   MISES (sélecteur de stake)
   ============================================================ */
function bestAffordable() { let s = STAKES[0]; for (const k of STAKES) if (k <= profile.coins) s = k; return s; }
function renderStakeChips(container, current) {
  let html = `<span class="pw-stakes__lbl">MISE :</span>`;
  html += STAKES.map((s) => `<button class="pw-stake${s === current ? " pw-stake--active" : ""}" data-stake="${s}" ${s > profile.coins ? "disabled" : ""}>${s} ${coinIcon()}</button>`).join("");
  container.innerHTML = html;
}
/* Nombre de questions réellement disponibles pour une armée.
   On additionne les questions maison (toujours en mémoire) et l'effectif
   annoncé par l'index Firestore — SANS les télécharger. Avant, on comptait
   ce qui était chargé : le sélecteur annonçait « Air 156 » alors que l'armée
   en compte des centaines, simplement parce qu'elle n'avait pas encore été
   téléchargée. Repli sur le décompte en mémoire si l'index est injoignable. */
function armyQuestionCount(armyId) {
  const remote = (typeof window !== "undefined" && window.PWQuestions)
    ? window.PWQuestions.total(armyId) : null;
  // Index injoignable : on ne peut annoncer que ce qu'on a sous la main.
  if (remote == null) return questionsFor(armyId).length;
  // Sinon : questions MAISON de cette catégorie (jamais dans l'index)
  // + effectif distant annoncé pour cette armée.
  const maison = QUESTIONS.filter((q) => !q.fromBank
    && (armyId === "tout" || q.a === armyId || q.a === "general")).length;
  return maison + remote;
}

/* Sélecteur d'armée du lobby.
   Il pilote à la fois le tirage des questions ET le filtrage des salons :
   changer d'armée relance donc la liste des salons. */
function renderArmyPicker() {
  const el = dom.armyPicker; if (!el) return;
  const cur = armyById(selectedArmy);
  el.innerHTML =
    '<span class="gg-army__lbl">MON ARMÉE</span>' +
    '<div class="gg-army__row">' +
    ARMIES.map((a) => {
      const n = armyQuestionCount(a.id);
      return '<button class="gg-army__btn' + (a.id === selectedArmy ? " gg-army__btn--on" : "") + '"' +
        ' data-army="' + a.id + '" title="' + esc(a.name) + ' — ' + n + ' questions">' +
        '<span class="gg-army__ico">' + a.ico + '</span>' +
        '<span class="gg-army__name">' + esc(a.short) + '</span>' +
        '<span class="gg-army__n">' + n + '</span>' +
        '</button>';
    }).join("") +
    '</div>' +
    '<p class="gg-army__hint">' + (selectedArmy === "tout"
      ? "Toutes armées confondues : Terre, Air, Marine, Gendarmerie, Police ou Pompiers — plus la culture de chambrée commune."
      : esc(cur.name) + " — questions de ton corps uniquement, plus la culture militaire commune. En ligne, tu ne croises que les salons de ton corps et ceux ouverts à toutes armées.")
    + '</p>';

  el.querySelectorAll("[data-army]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.army === selectedArmy) return;
    setArmy(b.dataset.army);
    renderArmyPicker();
    ensureQuestions(selectedArmy).then(renderArmyPicker); // charge la nouvelle armée
    freshSalons();              // les salons visibles dépendent de l'armée
    toast(armyById(selectedArmy).ico + " " + armyById(selectedArmy).name);
  }));
}

function renderQuickStakes() {
  if (selectedStake > profile.coins) selectedStake = bestAffordable();
  renderStakeChips(dom.quickStakes, selectedStake);
}

/* ============================================================
   LOBBY / SALONS
   ============================================================ */
function generateSalons(gi) {
  const out = [], n = 6 + ((Math.random() * 4) | 0), used = {};
  for (let i = 0; i < n; i++) {
    let g = gi; const r = Math.random();
    if (r < .18) g = Math.max(0, gi - 1); else if (r > .85) g = Math.min(MAX_GRADE, gi + 1);
    let name; do { name = pick(BOT_NAMES); } while (used[name] && Object.keys(used).length < BOT_NAMES.length);
    used[name] = 1;
    // Salons simulés (mode hors ligne) : on respecte le filtre — soit l'armée
    // choisie, soit « toutes armées », qui reste visible par tout le monde.
    // Mélanger les deux évite une liste monotone tout en restant cohérent.
    const sa = selectedArmy === "tout" ? pick(ARMIES).id : pick([selectedArmy, selectedArmy, "tout"]);
    out.push({ code: genRoom(), host: name, gradeIndex: g, tierIndex: (Math.random() * 3) | 0, rounds: pick([3, 5, 5, 7]), stake: pick(STAKES), army: sa });
  }
  return out;
}
function freshSalons() { if (FB) { rtRefreshSalons(); return; } SALONS = generateSalons(rankFromRP(profile.rp).gradeIndex); renderSalons(); }
function renderSalons() {
  const term = (dom.salonSearch.value || "").toLowerCase().trim();
  let list = SALONS.filter((s) => !term || s.host.toLowerCase().includes(term) || GRADES[s.gradeIndex].name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term) || String(s.stake).includes(term));
  // FILTRE PAR MISE : la mise sélectionnée (chips du lobby) filtre la liste —
  // choisir 50 n'affiche que les salons à 50. S'il n'y a AUCUN salon à cette
  // mise, on affiche les autres (triés par mise la plus proche) avec un
  // bandeau explicatif, plutôt qu'une liste vide décourageante.
  let fallback = false;
  if (!term) {
    const atStake = list.filter((s) => s.stake === selectedStake);
    if (atStake.length) list = atStake;
    else if (list.length) { fallback = true; list = list.slice().sort((a, b) => Math.abs(a.stake - selectedStake) - Math.abs(b.stake - selectedStake)); }
  }
  const banner = fallback
    ? `<p class="gg-salon__fallback">Aucun salon à ${selectedStake} ${coinIcon()} pour l'instant — voici les autres mises (ou crée le tien).</p>`
    : "";
  dom.salonList.innerHTML = banner + list.map((s) => `
    <div class="gg-salon">
      <div class="gg-salon__badge">${ggInsignia(s.gradeIndex, TIERS[s.tierIndex])}</div>
      <div class="gg-salon__info">
        <div class="gg-salon__name">${esc(s.host)}</div>
        <div class="gg-salon__meta">${GRADES[s.gradeIndex].name} · ${s.rounds} manches · <code>${esc(s.code)}</code></div>
        <div class="gg-salon__army">${armyById(s.army || "tout").ico} ${esc(armyById(s.army || "tout").short)}</div>
        <div class="gg-salon__stake">Mise : ${s.stake} ${coinIcon()}</div>
      </div>
      <button class="btn btn--olive btn--sm gg-salon__join" data-code="${esc(s.code)}" data-grade="${s.gradeIndex}" data-name="${esc(s.host)}" data-rounds="${s.rounds}" data-stake="${s.stake}">REJOINDRE</button>
    </div>`).join("");
  dom.salonEmpty.hidden = list.length > 0;
}

/* ============================================================
   SALON D'ATTENTE
   ============================================================ */
function openWait() {
  if (profile.coins < STAKES[0]) return popupBroke();
  const gi = rankFromRP(profile.rp).gradeIndex;
  WAIT = { code: genRoom(), rounds: 5, stake: selectedStake, foe: { name: pick(BOT_NAMES), gradeIndex: gi } };
  dom.waitCode.textContent = WAIT.code;
  renderWaitPlayers();
  document.querySelectorAll("#viewWait .gg-chip").forEach((c) => c.classList.toggle("gg-chip--active", +c.dataset.rounds === WAIT.rounds));
  renderWaitStakes();
  showView("viewWait");
}
function renderWaitPlayers() {
  const rk = rankFromRP(profile.rp);
  dom.waitPlayers.innerHTML = `
    <div class="gg-player"><div class="gg-player__badge">${ggInsignia(rk.gradeIndex, rk.tier)}</div><div class="gg-player__name">${esc(profile.pseudo)}</div><div class="gg-player__grade">${rk.grade} · toi</div></div>
    <div class="gg-player"><div class="gg-player__badge">${ggInsignia(WAIT.foe.gradeIndex, "Or")}</div><div class="gg-player__name">${esc(WAIT.foe.name)}</div><div class="gg-player__grade">${GRADES[WAIT.foe.gradeIndex].name} · prêt 🟢</div></div>`;
}
function renderWaitStakes() {
  if (WAIT.stake > profile.coins) WAIT.stake = bestAffordable();
  renderStakeChips(dom.waitStakes, WAIT.stake);
  dom.waitPot.textContent = "POT : " + WAIT.stake * 2 + " coins";
}

/* ============================================================
   MATCH (QCM) — avec mise / pot
   ============================================================ */
// Verrou de lancement. Depuis que le chargement des questions est asynchrone,
// il s'écoule plusieurs secondes entre le clic et le débit de la mise au
// premier lancement : deux clics passaient tous les deux le test de solde et
// DÉBITAIENT DEUX FOIS, alors qu'un seul match démarrait.
let STARTING = false;

async function startMatch(foe, rounds, stake) {
  if (STARTING) return;
  STARTING = true;
  try {
    await startMatchInner(foe, rounds, stake);
  } catch (e) {
    console.warn("[PW] lancement de partie", e);
    toast("Impossible de lancer la partie.");
  } finally { STARTING = false; }
}

async function startMatchInner(foe, rounds, stake) {
  // Purge des minuteurs d'un éventuel match précédent encore en vol.
  if (MATCH) { clearTimeout(MATCH.timeout); clearTimeout(MATCH.nextT); clearInterval(MATCH.tick); }
  // Les questions de l'armée doivent être là AVANT de composer le match.
  await ensureQuestions(selectedArmy);
  rounds = rounds || 5; stake = stake || selectedStake;
  if (profile.coins < stake) return popupBroke();
  profile.coins -= stake; profile.lastStake = stake; saveProfile(); renderHud();
  const rk = rankFromRP(profile.rp);
  MATCH = { foe, rounds, stake, pot: stake * 2, idx: 0, meScore: 0, foeScore: 0, meRW: 0, foeRW: 0, correct: 0,
    army: selectedArmy,
    qs: pickQuestions(rounds, rk.gradeIndex, selectedArmy), q: null, correctIdx: 0, locked: false, timeout: null, qStart: 0, dur: 0, shield: false };
  dom.meBadge.innerHTML = ggInsignia(rk.gradeIndex, rk.tier); dom.meName.textContent = profile.pseudo;
  dom.foeBadge.innerHTML = ggInsignia(foe.gradeIndex, "Or"); dom.foeName.textContent = foe.name;
  dom.meScore.textContent = "0"; dom.foeScore.textContent = "0";
  dom.matchPot.textContent = "POT " + MATCH.pot;
  showView("viewMatch"); renderMatchRW(); renderMatchArsenal();
  // On affiche le plateau (adversaire, pot, arsenal) puis on laisse 5 s de
  // préparation avant que la 1re question et son chrono ne démarrent.
  dom.qTag.textContent = "// PRÉPARATION";
  dom.qText.textContent = "Le combat va commencer…";
  dom.qOptions.innerHTML = ""; dom.qFeedback.innerHTML = "";
  if (dom.qDiff) dom.qDiff.innerHTML = "";
  dom.timerFill.style.transition = "none"; dom.timerFill.style.width = "100%";
  runCountdown(PREP_S, () => { if (MATCH) renderQuestion(); });
}
/* ------------------------------------------------------------
   COMPTE À REBOURS DE PRÉPARATION (avant la 1re question)
   Laisse aux deux joueurs le temps de se poser avant que le
   chrono ne démarre. Overlay plein écran, non cliquable.
   ------------------------------------------------------------ */
const PREP_S = 5, PREP_MS = PREP_S * 1000;
let prepTimer = null, prepDoneTimer = null;

/* ------------------------------------------------------------
   PETITS EFFETS DE DYNAMISME
   ------------------------------------------------------------ */

// Fait « sauter » un compteur de score et anime la valeur qui grimpe.
function bumpScore(el, to) {
  if (!el) return;
  const from = parseInt(el.textContent, 10) || 0;
  to = to | 0;
  // Rien n'a changé : on ne rejoue NI l'animation NI la montée de chiffres.
  // (rtRenderRound est appelé à chaque snapshot Firestore — sans ce garde, le
  // score sautillait en boucle pendant la poignée de main.)
  if (from === to) return;
  // Une seule boucle à la fois par élément, sinon deux animations concurrentes
  // se disputent le textContent.
  if (el._bumpRaf) cancelAnimationFrame(el._bumpRaf);
  el.classList.remove("gg-score--bump"); void el.offsetWidth; el.classList.add("gg-score--bump");
  const t0 = performance.now(), dur = 480;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (k < 1) el._bumpRaf = requestAnimationFrame(step);
    else { el._bumpRaf = null; el.textContent = to; }
  })(t0);
}

// « +150 » qui s'envole depuis le bouton cliqué.
function floatPoints(text, anchor, kind) {
  const host = anchor || dom.qOptions;
  if (!host) return;
  const r = host.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "pw-float" + (kind ? " pw-float--" + kind : "");
  el.textContent = text;
  el.style.left = (r.left + r.width / 2) + "px";
  el.style.top = (r.top + r.height / 2) + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// Signale visuellement une manche gagnée / perdue sur les badges de manches.
function flashRW(won) {
  const el = won ? dom.rwMe : dom.rwFoe;
  if (!el) return;
  el.classList.remove("gg-rw--flash"); void el.offsetWidth; el.classList.add("gg-rw--flash");
}

function runCountdown(secs, done) {
  clearInterval(prepTimer);
  const old = document.querySelector(".pw-prep"); if (old) old.remove();

  const el = document.createElement("div");
  el.className = "pw-prep";
  el.innerHTML =
    '<div class="pw-prep__box">' +
      '<p class="pw-prep__eyebrow">// EN POSITION, RECRUE</p>' +
      '<div class="pw-prep__num" id="prepNum">' + secs + '</div>' +
      '<p class="pw-prep__hint">Le chrono démarre à 0…</p>' +
    '</div>';
  document.body.appendChild(el);

  let n = secs;
  const tick = () => {
    n--;
    const num = $("prepNum");
    if (n > 0) {
      if (num) { num.textContent = n; num.classList.remove("pw-prep__num--pop"); void num.offsetWidth; num.classList.add("pw-prep__num--pop"); }
    } else {
      clearInterval(prepTimer); prepTimer = null;
      if (num) { num.textContent = "FEU !"; num.classList.add("pw-prep__num--go"); }
      APP.haptic("warn"); // signal de départ ressenti même écran éteint
      // Mémorisé pour que cancelCountdown puisse l'annuler : sinon, quitter
      // pendant le « FEU ! » relançait quand même une question dans le vide.
      prepDoneTimer = setTimeout(() => {
        prepDoneTimer = null;
        el.remove();
        if (typeof done === "function") done();
      }, 600);
    }
  };
  prepTimer = setInterval(tick, 1000);
}
function cancelCountdown() {
  clearInterval(prepTimer); prepTimer = null;
  clearTimeout(prepDoneTimer); prepDoneTimer = null;
  const el = document.querySelector(".pw-prep"); if (el) el.remove();
}

function renderQuestion() {
  MATCH.locked = false;
  const q = MATCH.qs[MATCH.idx]; MATCH.q = q;
  dom.roundNum.textContent = `${MATCH.idx + 1}/${MATCH.rounds}`;
  dom.qTag.textContent = q.tag || "// ADAGE DE CHAMBRÉE";
  renderDiffBadge(q.d);
  dom.qText.textContent = q.q;
  const arr = q.options.map((t, i) => ({ t, ok: i === q.correct }));
  shuffle(arr); MATCH.correctIdx = arr.findIndex((o) => o.ok);
  const keys = ["A", "B", "C", "D"];
  dom.qOptions.innerHTML = arr.map((o, i) => `<button class="gg-opt" data-i="${i}"><span class="gg-opt__key">${keys[i]}</span><span>${esc(o.t)}</span></button>`).join("");
  [...dom.qOptions.children].forEach((b) => b.addEventListener("click", () => resolveRound(+b.dataset.i)));
  dom.qFeedback.innerHTML = ""; startTimer(13);
  renderMatchArsenal();
}
/* Bandeau de palier au-dessus de la question : 5 barres qui se remplissent
   selon la difficulté, + le multiplicateur de points annoncé au joueur. */
function renderDiffBadge(d) {
  const el = dom.qDiff; if (!el) return;
  const m = DIFF_META[d] || DIFF_META[3];
  let bars = "";
  for (let i = 1; i <= 5; i++) bars += `<i class="gg-diff__bar${i <= d ? " gg-diff__bar--on" : ""}"></i>`;
  el.style.setProperty("--diff-col", m.color);
  el.innerHTML = `<span class="gg-diff__bars">${bars}</span><span class="gg-diff__name">${m.name}</span>` +
    (m.mult > 1 ? `<span class="gg-diff__mult">×${m.mult.toFixed(2)}</span>` : "");
}

function startTimer(sec) {
  clearTimeout(MATCH.timeout); MATCH.qStart = Date.now(); MATCH.dur = sec * 1000;
  const fill = dom.timerFill;
  fill.classList.remove("gg-timer__fill--warn", "gg-timer__fill--danger");
  fill.style.transition = "none"; fill.style.width = "100%";
  void fill.offsetWidth;
  requestAnimationFrame(() => { fill.style.transition = `width ${sec}s linear`; fill.style.width = "0%"; });
  // Bascule ambre puis rouge : la pression monte visuellement.
  // L'id est gardé en LOCAL : lu depuis MATCH.tick, un clearInterval sur un
  // MATCH devenu null (déconnexion en pleine question) levait une exception
  // AVANT de nettoyer — l'intervalle tournait alors indéfiniment en erreur.
  clearInterval(MATCH.tick);
  const tickId = setInterval(() => {
    if (!MATCH || MATCH.locked || MATCH.tick !== tickId) { clearInterval(tickId); return; }
    const frac = Math.max(0, (MATCH.dur - (Date.now() - MATCH.qStart)) / MATCH.dur);
    fill.classList.toggle("gg-timer__fill--warn", frac <= 0.5 && frac > 0.25);
    fill.classList.toggle("gg-timer__fill--danger", frac <= 0.25);
  }, 150);
  MATCH.tick = tickId;
  MATCH.timeout = setTimeout(() => resolveRound(-1), sec * 1000);
}
function resolveRound(choice) {
  if (!MATCH || MATCH.locked) return;
  MATCH.locked = true; clearTimeout(MATCH.timeout);
  const leftFrac = clamp((MATCH.dur - (Date.now() - MATCH.qStart)) / MATCH.dur, 0, 1);
  dom.timerFill.style.transition = "none"; dom.timerFill.style.width = (leftFrac * 100) + "%";
  const playerCorrect = choice === MATCH.correctIdx;
  // Plus la question est dure, plus elle rapporte : c'est ce qui rend la montée
  // en grade intéressante (mêmes règles pour le bot, pas de passe-droit).
  const mult = (DIFF_META[MATCH.q.d] || DIFF_META[3]).mult;
  // RATION DOUBLE : ×2 sur cette bonne réponse, puis l'effet est consommé.
  const ration = playerCorrect && MATCH.ration;
  const pPts = playerCorrect ? Math.round((100 + leftFrac * 100) * mult * (ration ? 2 : 1)) : 0;
  if (MATCH.ration) MATCH.ration = false;

  // Le bot rate plus souvent les questions dures : un palier ÉLITE le fait douter.
  // FUMIGÈNE : il n'y voit plus rien, sa réussite s'effondre.
  let botChance = botProb(MATCH.foe.gradeIndex) * (1 - (MATCH.q.d - 1) * 0.07);
  if (MATCH.botBlind) botChance *= 0.35;
  const botCorrect = Math.random() < botChance;
  // GRENADE : il répond dans la précipitation, donc bien plus lentement.
  const botSpeed = MATCH.botRushed ? (0.02 + Math.random() * 0.15) : (0.2 + Math.random() * 0.7);
  const bPts = botCorrect ? Math.round((100 + botSpeed * 100) * mult) : 0;
  MATCH.botBlind = false; MATCH.botRushed = false;   // effets valables une manche
  MATCH.meScore += pPts; MATCH.foeScore += bPts;
  if (playerCorrect) MATCH.correct++;
  if (pPts > bPts) MATCH.meRW++; else if (bPts > pPts) MATCH.foeRW++;
  clearInterval(MATCH.tick); MATCH.tick = null;
  dom.timerFill.classList.remove("gg-timer__fill--warn", "gg-timer__fill--danger");
  [...dom.qOptions.children].forEach((b, i) => { b.disabled = true; if (i === MATCH.correctIdx) b.classList.add("gg-opt--correct"); else if (i === choice) b.classList.add("gg-opt--wrong"); });
  // Retour immédiat : points qui s'envolent du bouton, compteurs qui sautent.
  if (playerCorrect) { floatPoints("+" + pPts, dom.qOptions.children[choice], "win"); APP.haptic("win"); }
  else if (choice >= 0) { floatPoints("RATÉ", dom.qOptions.children[choice], "loss"); APP.haptic("lose"); }
  if (pPts > bPts) flashRW(true); else if (bPts > pPts) flashRW(false);
  bumpScore(dom.meScore, MATCH.meScore); bumpScore(dom.foeScore, MATCH.foeScore);
  const youMsg = playerCorrect ? `<b>+${pPts} pour toi !</b>` : (choice === -1 ? `<b>Trop lent, recrue.</b>` : `<b>Raté.</b>`);
  const botMsg = botCorrect ? `${esc(MATCH.foe.name)} a trouvé (+${bPts}).` : `${esc(MATCH.foe.name)} s'est planté (+0).`;
  dom.qFeedback.innerHTML = `${youMsg} ${botMsg}<br>${esc(MATCH.q.explain)}`;
  renderMatchRW(); renderMatchArsenal();
  botMaybeShoot();
  // Stocké dans MATCH : sinon, quitter l'écran pendant ces 2,7 s puis relancer
  // une partie laissait ce minuteur s'exécuter sur le NOUVEAU match et sauter
  // sa première question.
  MATCH.nextT = setTimeout(nextRound, 2700);
}

/* Le bot dégaine parfois son fusil.
   Sans ça, le CASQUE était strictement inutile en solo : rien ne « tirait »
   jamais sur le joueur, sauf la riposte du fusil. On achetait donc un objet
   qui ne pouvait, dans la majorité des parties, produire aucun effet. */
function botMaybeShoot() {
  if (!MATCH || MATCH.meRW <= 0) return;
  if (Math.random() > 0.28) return;
  setTimeout(() => {
    if (!MATCH || MATCH.meRW <= 0) return;
    if (MATCH.shield) {
      MATCH.shield = false;
      pwFx("blocked"); APP.haptic("warn");
      toast("🪖 Ton casque a encaissé le tir de " + MATCH.foe.name + " !");
    } else {
      MATCH.meRW = Math.max(0, MATCH.meRW - 1);
      pwFx("fusil"); APP.haptic("lose");
      toast("💥 " + MATCH.foe.name + " t'a dégommé une manche !");
    }
    renderMatchRW(); renderMatchArsenal();
  }, 1500);
}

function nextRound() { if (!MATCH) return; MATCH.idx++; if (MATCH.idx >= MATCH.rounds) endMatch(); else renderQuestion(); }

/* ============================================================
   ARSENAL — objets d'intendance utilisables en match
   (fusil : annule une manche gagnée adverse / casque : bloque le
   prochain tir / montre : +5 s sur le chrono en cours)
   ============================================================ */
/* ------------------------------------------------------------
   EFFETS VISUELS D'OBJET
   Un overlay plein écran injecté le temps de l'animation, puis
   retiré. Aucune dépendance : tout est en CSS (popote-war.css).
   `pointer-events:none` côté CSS pour ne jamais bloquer un clic
   pendant qu'une manche est en cours.
   ------------------------------------------------------------ */
function pwFx(type, opts) {
  opts = opts || {};
  const layer = document.createElement("div");
  layer.className = "pw-fx pw-fx--" + type;

  if (type === "fusil") {
    layer.innerHTML =
      '<div class="pw-fx__flash"></div>' +
      '<div class="pw-fx__crosshair"><span></span><span></span><i></i></div>' +
      '<div class="pw-fx__crack"></div>' +
      '<div class="pw-fx__label">🔫 TIR GROUPÉ</div>';
    document.body.classList.add("pw-shake");
    setTimeout(() => document.body.classList.remove("pw-shake"), 520);
  } else if (type === "casque") {
    layer.innerHTML =
      '<div class="pw-fx__dome"></div>' +
      '<div class="pw-fx__ring"></div>' +
      '<div class="pw-fx__ring pw-fx__ring--2"></div>' +
      '<div class="pw-fx__label">🪖 CASQUE EN POSITION</div>';
  } else if (type === "montre") {
    layer.innerHTML =
      '<div class="pw-fx__timewarp"></div>' +
      '<div class="pw-fx__dial"><i></i></div>' +
      '<div class="pw-fx__label">⌚ +5 SECONDES</div>';
    // Le chrono pulse en doré pour montrer visuellement le gain de temps.
    if (dom.timerFill) {
      dom.timerFill.classList.add("gg-timer__fill--boost");
      setTimeout(() => dom.timerFill.classList.remove("gg-timer__fill--boost"), 1400);
    }
  } else if (type === "jumelles") {
    layer.innerHTML =
      '<div class="pw-fx__scope"></div>' +
      '<div class="pw-fx__label">🔭 CIBLES ÉCARTÉES</div>';
  } else if (type === "ration") {
    layer.innerHTML =
      '<div class="pw-fx__dome" style="border-color:rgba(246,202,102,.7)"></div>' +
      '<div class="pw-fx__label">🥫 POINTS DOUBLÉS</div>';
  } else if (type === "fumigene") {
    layer.innerHTML =
      '<div class="pw-fx__smoke"></div>' +
      '<div class="pw-fx__label">💨 FUMIGÈNE</div>';
  } else if (type === "grenade") {
    layer.innerHTML =
      '<div class="pw-fx__flash"></div>' +
      '<div class="pw-fx__crack"></div>' +
      '<div class="pw-fx__label">💣 GRENADE</div>';
    document.body.classList.add("pw-shake");
    setTimeout(() => document.body.classList.remove("pw-shake"), 520);
  } else if (type === "blocked") {
    layer.innerHTML =
      '<div class="pw-fx__dome pw-fx__dome--hit"></div>' +
      '<div class="pw-fx__label">🛡️ TIR BLOQUÉ</div>';
  }

  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), opts.ms || 1500);
}

function renderMatchRW() {
  if (!dom.rwMe || !dom.rwFoe) return;
  let m = 0, f = 0;
  // RT prioritaire ici aussi, pour rester cohérent avec renderMatchArsenal.
  if (RT && RT.room) { const rw = RT.room.roundWins || {}; m = RT.role === "host" ? (rw.host || 0) : (rw.guest || 0); f = RT.role === "host" ? (rw.guest || 0) : (rw.host || 0); }
  else if (MATCH) { m = MATCH.meRW; f = MATCH.foeRW; }
  dom.rwMe.textContent = m + (m > 1 ? " manches" : " manche");
  dom.rwFoe.textContent = f + (f > 1 ? " manches" : " manche");
}
function renderMatchArsenal() {
  if (!dom.matchArsenal) return;
  ensureItems(profile);
  const it = profile.items;
  let foeRW = 0, shielded = false, activeQ = false;
  // RT prioritaire, dans le même ordre que le gestionnaire de clic.
  if (RT && RT.room) {
    const rw = RT.room.roundWins || {}; foeRW = RT.role === "host" ? (rw.guest || 0) : (rw.host || 0);
    shielded = !!(RT.room.shield && RT.room.shield[RT.role]);
    activeQ = !RT.prepping && RT.lastRound >= 0 && RT.answered !== RT.lastRound && RT.revealed !== RT.lastRound;
  }
  else if (MATCH) { foeRW = MATCH.foeRW; shielded = MATCH.shield; activeQ = !!MATCH.q && !MATCH.locked; }
  // Compteurs : on boucle sur ITEM_KEYS, les identifiants suivant la
  // convention cntFusil / cntJumelles / … (clé capitalisée).
  ITEM_KEYS.forEach((k) => {
    const el = $("cnt" + k.charAt(0).toUpperCase() + k.slice(1));
    if (el) el.textContent = it[k] || 0;
  });

  /* On ne DÉSACTIVE que si le joueur ne possède pas l'objet.
     Avant, un bouton était aussi grisé quand l'action n'était pas encore
     possible (fusil sans manche adverse à annuler, casque déjà posé…). Or un
     <button disabled> n'émet aucun clic : le joueur appuyait, il ne se passait
     RIEN — pas même un message. D'où « les objets ne fonctionnent pas tout le
     temps ». Le bouton reste donc actif, et la fonction d'usage explique
     précisément pourquoi ça ne part pas. */
  const arm = (btn, has, ready) => {
    if (!btn) return;
    btn.disabled = !has;
    btn.classList.toggle("gg-arm-btn--wait", has && !ready);
  };
  const rationOn = (RT && RT.room) ? !!RT.ration : !!(MATCH && MATCH.ration);
  arm(dom.btnUseFusil, it.fusil > 0, foeRW > 0);
  arm(dom.btnUseCasque, it.casque > 0, !shielded);
  arm(dom.btnUseMontre, it.montre > 0, activeQ);
  arm(dom.btnUseJumelles, it.jumelles > 0, activeQ);
  arm(dom.btnUseRation, it.ration > 0, activeQ && !rationOn);
  arm(dom.btnUseFumigene, it.fumigene > 0, activeQ);
  arm(dom.btnUseGrenade, it.grenade > 0, activeQ);
  // Les effets en cours restent visibles sur leur bouton.
  if (dom.btnUseCasque) dom.btnUseCasque.classList.toggle("gg-arm-btn--active", shielded);
  if (dom.btnUseRation) dom.btnUseRation.classList.toggle("gg-arm-btn--active", rationOn);
}
function useFusilLocal() {
  if (!MATCH) return;
  ensureItems(profile);
  if (!profile.items.fusil) return toast("Pas de fusil dans ton barda, recrue. 🔫");
  if (MATCH.foeRW <= 0) return toast("Rien à dégommer : l'adversaire n'a pas encore de manche gagnée.");
  profile.items.fusil--; profile.used.fusil++; saveProfile();
  MATCH.foeRW--;
  pwFx("fusil");
  toast("🔫 Tir groupé ! Manche annulée à " + MATCH.foe.name + ".");
  renderMatchRW(); renderMatchArsenal();
  if (MATCH.meRW > 0 && Math.random() < 0.45) {
    setTimeout(() => {
      if (!MATCH) return;
      if (MATCH.shield) { MATCH.shield = false; pwFx("blocked"); toast("🪖 Ton casque a bloqué la riposte de " + MATCH.foe.name + " !"); }
      else { MATCH.meRW = Math.max(0, MATCH.meRW - 1); pwFx("fusil"); toast("💥 " + MATCH.foe.name + " a riposté et t'a repris une manche !"); }
      renderMatchRW(); renderMatchArsenal();
    }, 1600);
  }
}
function useCasqueLocal() {
  if (!MATCH) return;
  ensureItems(profile);
  if (!profile.items.casque) return toast("Pas de casque dans ton barda, recrue. 🪖");
  if (MATCH.shield) return toast("Ton casque est déjà en position, recrue.");
  profile.items.casque--; profile.used.casque++; saveProfile();
  MATCH.shield = true;
  pwFx("casque");
  toast("🪖 Casque en position : le prochain tir adverse sera bloqué.");
  renderMatchArsenal();
}
function extendTimerLocal(extraMs) {
  if (!MATCH || MATCH.locked) return;
  clearTimeout(MATCH.timeout);
  const now = Date.now();
  const oldRemaining = Math.max(0, MATCH.dur - (now - MATCH.qStart));
  const track = dom.timerFill.parentElement;
  const curPct = track && track.clientWidth ? clamp(dom.timerFill.getBoundingClientRect().width / track.clientWidth * 100, 0, 100) : (MATCH.dur ? oldRemaining / MATCH.dur * 100 : 100);
  const newRemaining = oldRemaining + extraMs;
  MATCH.dur = (now - MATCH.qStart) + newRemaining;
  dom.timerFill.style.transition = "none";
  dom.timerFill.style.width = curPct + "%";
  requestAnimationFrame(() => {
    dom.timerFill.style.transition = `width ${newRemaining / 1000}s linear`;
    dom.timerFill.style.width = "0%";
  });
  MATCH.timeout = setTimeout(() => resolveRound(-1), newRemaining);
}
/* ============================================================
   NOUVEAUX OBJETS
   ------------------------------------------------------------
   Deux d'entre eux (fumigène, grenade) visent l'ADVERSAIRE. En 1v1
   ils écrivent dans le salon et l'autre client réagit. Contre un
   bot, il n'y a pas d'écran adverse à gêner : on applique alors
   l'équivalent en malus sur sa performance, pour que l'objet ait
   toujours un effet réel et non un simple message.
   ============================================================ */

// Vérifie qu'une question est bien en cours (règles communes aux deux modes).
function armGuard(needActive) {
  if (RT && RT.room) {
    if (RT.prepping) return "Attends le départ, recrue.";
    if (RT.lastRound < 0) return "Pas de question active, recrue.";
    if (needActive && RT.answered === RT.lastRound) return "Tu as déjà répondu.";
    if (needActive && RT.revealed === RT.lastRound) return "Manche terminée.";
    return null;
  }
  if (!MATCH) return "Pas de partie en cours.";
  if (!MATCH.q) return "Attends le départ, recrue.";
  if (needActive && MATCH.locked) return "Manche déjà jouée.";
  return null;
}

function spendItem(key) {
  ensureItems(profile);
  if (!profile.items[key]) { toast("Pas de " + ITEM_NAMES[key].toLowerCase() + " dans ton barda, recrue."); return false; }
  profile.items[key]--; profile.used[key]++;
  saveProfile(); renderMatchArsenal();
  return true;
}

/* --- JUMELLES : élimine 2 mauvaises réponses --- */
function useJumelles() {
  const err = armGuard(true); if (err) return toast(err);
  const opts = dom.qOptions ? [...dom.qOptions.children] : [];
  if (opts.length < 3) return toast("Rien à éliminer sur cette question.");

  // Index de la bonne réponse selon le mode.
  let correctIdx = -1;
  if (RT && RT.room) {
    const q = RT.room.questions[RT.lastRound];
    correctIdx = q.opts.findIndex((o) => o.ok);
  } else if (MATCH) correctIdx = MATCH.correctIdx;
  if (correctIdx < 0) return toast("Impossible ici.");

  const wrong = opts.map((_, i) => i).filter((i) => i !== correctIdx && !opts[i].classList.contains("gg-opt--out"));
  if (wrong.length < 2) return toast("Déjà utilisées sur cette question.");

  if (!spendItem("jumelles")) return;
  shuffle(wrong).slice(0, 2).forEach((i) => {
    opts[i].classList.add("gg-opt--out");
    opts[i].disabled = true;
  });
  pwFx("jumelles"); APP.haptic("reward");
  toast("🔭 Deux mauvaises réponses écartées.");
}

/* --- RATION DOUBLE : ×2 sur la prochaine bonne réponse --- */
function useRation() {
  const err = armGuard(true); if (err) return toast(err);
  const already = (RT && RT.room) ? RT.ration : (MATCH && MATCH.ration);
  if (already) return toast("Ration déjà entamée, recrue.");
  if (!spendItem("ration")) return;
  if (RT && RT.room) RT.ration = true; else MATCH.ration = true;
  pwFx("ration"); APP.haptic("reward");
  toast("🥫 Prochaine bonne réponse : points doublés !");
}

/* --- FUMIGÈNE : aveugle l'adversaire 4 s --- */
function useFumigene() {
  const err = armGuard(true); if (err) return toast(err);
  if (!spendItem("fumigene")) return;
  if (RT && RT.room) {
    const foeRole = RT.role === "host" ? "guest" : "host";
    FB.updateRoom(RT.roomId, { ["smoke." + foeRole]: Date.now() })
      .catch((e) => { console.warn("[PW] fumigène", e); toast("Réseau : le fumigène n'est pas parti."); });
  } else if (MATCH) {
    // Contre un bot : il « ne voit plus rien » cette manche.
    MATCH.botBlind = true;
  }
  pwFx("fumigene"); APP.haptic("win");
  toast("💨 Fumigène lancé — l'adversaire n'y voit plus rien.");
}

/* --- GRENADE : ampute de moitié le temps restant de l'adversaire --- */
function useGrenade() {
  const err = armGuard(true); if (err) return toast(err);
  if (RT && RT.room) {
    const foeRole = RT.role === "host" ? "guest" : "host";
    if (RT.room.shield && RT.room.shield[foeRole]) {
      if (!spendItem("grenade")) return;
      FB.updateRoom(RT.roomId, { ["shield." + foeRole]: false }).catch(() => {});
      pwFx("blocked");
      return toast("Grenade bloquée : l'adversaire portait un casque !");
    }
    if (!spendItem("grenade")) return;
    FB.updateRoom(RT.roomId, { ["cut." + foeRole]: Date.now() })
      .catch((e) => { console.warn("[PW] grenade", e); toast("Réseau : la grenade n'est pas partie."); });
  } else if (MATCH) {
    // ATTENTION : `MATCH.shield` est le casque du JOUEUR, pas celui du bot.
    // Le tester ici faisait perdre au joueur sa grenade ET son propre casque,
    // sans aucun effet sur l'adversaire. Le bot n'a pas de casque en solo :
    // la grenade part donc toujours.
    if (!spendItem("grenade")) return;
    MATCH.botRushed = true;   // le bot répond dans la précipitation
  }
  pwFx("grenade"); APP.haptic("win");
  toast("💣 Grenade ! Le temps de l'adversaire fond de moitié.");
}

function useMontreLocal() {
  // `MATCH.q` est nul pendant le compte à rebours de préparation : la montre y
  // était utilisable, elle armait un minuteur sur une question inexistante et
  // provoquait une erreur JS 5 secondes plus tard, objet perdu au passage.
  if (!MATCH || !MATCH.q || MATCH.locked) return toast("Pas de question active, recrue.");
  ensureItems(profile);
  if (!profile.items.montre) return toast("Pas de montre dans ton barda, recrue. ⌚");
  profile.items.montre--; profile.used.montre++; saveProfile();
  extendTimerLocal(5000);
  pwFx("montre");
  toast("⌚ +5 secondes sur le chrono !");
  renderMatchArsenal();
}

/* ============================================================
   FIN DE MATCH — paiement du pot (double or nothing)
   ============================================================ */
function endMatch() {
  let outcome;
  if (MATCH.meRW > MATCH.foeRW) outcome = "win";
  else if (MATCH.meRW < MATCH.foeRW) outcome = "lose";
  else outcome = MATCH.meScore > MATCH.foeScore ? "win" : (MATCH.meScore < MATCH.foeScore ? "lose" : "tie");

  const stake = MATCH.stake;
  const rankBefore = rankFromRP(profile.rp);
  const xpGain = (outcome === "win" ? 50 : 20) + MATCH.correct * 8;
  const po = payout(outcome, stake);
  // Bonus permanent de prestige appliqué au GAIN net, jamais à la mise :
  // les duels restent équitables, seule la récompense est majorée.
  const pBonus = outcome === "win" ? Math.round(stake * (prestigeCoinMult(profile.prestige) - 1)) : 0;
  profile.coins += po.credit + pBonus;
  if (pBonus) profile.coinsEarned = (profile.coinsEarned || 0) + pBonus;
  // GALONS = XP DE CARRIÈRE : ils tombent à chaque match terminé, même perdu.
  profile.rp = Math.max(0, (profile.rp | 0) + rpForMatch(outcome));
  if (outcome === "win") { profile.wins++; profile.streak++; if (profile.streak > profile.best) profile.best = profile.streak; }
  else if (outcome === "lose") { profile.losses++; profile.streak = 0; }
  // --- compteurs du dossier militaire ---
  // On compare par ID, pas par longueur : unlockedMedals() renvoie les médailles
  // dans l'ordre de DÉCLARATION, pas de déblocage. Un slice() sur la longueur
  // annoncerait la mauvaise médaille dès qu'un déblocage arrive "avant" une
  // médaille déjà acquise (ce qui est le cas courant, les stats progressant
  // en parallèle sur 7 compteurs différents).
  const medalsBefore = new Set(unlockedMedals(profile).map((m) => m.id));
  const titlesBefore = new Set(unlockedTitles(profile).map((t) => t.id));
  profile.played++;
  profile.goodAnswers += MATCH.correct;
  if (MATCH.correct === MATCH.rounds) profile.perfects++;
  if (po.net > 0) profile.coinsEarned += po.net;
  const lvlRes = addXp(xpGain);
  const rankAfter = rankFromRP(profile.rp);
  profile.sinceOffer = (profile.sinceOffer || 0) + 1;
  saveProfile();
  const newMedals = unlockedMedals(profile).filter((m) => !medalsBefore.has(m.id));
  const newTitles = unlockedTitles(profile).filter((t) => !titlesBefore.has(t.id));

  // Grades PAYANTS : gagner des galons rend ÉLIGIBLE, la promotion se valide en
  // payant dans MA CARRIÈRE. On annonce donc la DISPONIBILITÉ, pas une promotion
  // automatique (aligné sur rtShowResult ; l'ancien message « PROMU » + échelon
  // était faux et se référait au système d'échelons supprimé).
  let promo = null;
  if (rankAfter.gradeIndex > rankBefore.gradeIndex && rankAfter.gradeIndex > (profile.grade | 0)) {
    promo = `⭐ NOUVEAU GRADE DISPONIBLE : ${rankAfter.grade.toUpperCase()} — valide-le dans MA CARRIÈRE (péage en coins).`;
  }

  dom.resultBox.className = "gg-result " + (outcome === "win" ? "gg-result--win" : outcome === "lose" ? "gg-result--loss" : "");
  dom.resultTitle.textContent = outcome === "win" ? "VICTOIRE" : outcome === "lose" ? "DÉFAITE" : "ÉGALITÉ";
  if (outcome === "win") { dom.resultPot.className = "gg-result__pot gg-result__pot--win"; dom.resultPot.innerHTML = "+" + stake + " coins " + coinIcon(); }
  else if (outcome === "lose") { dom.resultPot.className = "gg-result__pot gg-result__pot--loss"; dom.resultPot.textContent = "−" + stake + " coins"; }
  else { dom.resultPot.className = "gg-result__pot"; dom.resultPot.style.color = "var(--khaki)"; dom.resultPot.textContent = "Mise remboursée"; }
  dom.resultScore.textContent = `${MATCH.meRW} — ${MATCH.foeRW} · ${esc(MATCH.foe.name)}`;
  let gains = `<div class="gg-gain"><div class="gg-gain__num">+${xpGain}</div><div class="gg-gain__lbl">XP</div></div>`;
  if (outcome === "win") gains += `<div class="gg-gain"><div class="gg-gain__num">+34</div><div class="gg-gain__lbl">Galons</div></div>`;
  gains += `<div class="gg-gain"><div class="gg-gain__num">${profile.coins}</div><div class="gg-gain__lbl">Coins</div></div>`;
  dom.resultGains.innerHTML = gains;
  let rk = "";
  if (promo) rk += `<b>${promo}</b>`;
  // Détail palier par palier : c'est le moment où le joueur voit ce qu'il a
  // gagné, donc ce qui lui donne envie d'enchaîner.
  (lvlRes.gained || []).forEach((g) => {
    rk += `<div class="gg-newmedal"><span class="gg-newmedal__ico">⬆️</span> NIVEAU ${g.level} — <b>${esc(g.reward.label)}</b></div>`;
  });
  if (profile.level >= MAX_LEVEL && (profile.prestige || 0) < PRESTIGE_MAX) {
    rk += `<div class="gg-newmedal"><span class="gg-newmedal__ico">⭐</span> <b>PRESTIGE DISPONIBLE</b> — va le réclamer dans MA CARRIÈRE.</div>`;
  }
  if (outcome === "win" && !promo && lvlRes.lv === 0) rk += `Série en cours : ${profile.streak} 🔥`;
  if (outcome === "lose") rk += `<div style="color:var(--khaki)">Reviens te refaire, recrue.</div>`;
  newMedals.forEach((m) => {
    rk += `<div class="gg-newmedal"><span class="gg-newmedal__ico">${m.ico}</span> DÉCORATION : <b>${esc(m.name)}</b></div>`;
  });
  newTitles.forEach((t) => {
    rk += `<div class="gg-newmedal"><span class="gg-newmedal__ico">🏷️</span> TITRE DÉBLOQUÉ : <b>${esc(t.name)}</b></div>`;
  });
  dom.resultRankup.hidden = !rk; dom.resultRankup.innerHTML = rk;

  showView("viewResult"); renderHud(); publishMe();

  // Le match solo est terminé : on libère MATCH pour qu'il ne puisse plus
  // parasiter l'affichage de l'arsenal ni les gardes d'usage des objets.
  // On garde de côté ce qu'il faut pour le bouton REVANCHE.
  LAST_MATCH = { foe: MATCH.foe, rounds: MATCH.rounds, stake: MATCH.stake };
  clearInterval(MATCH.tick); clearTimeout(MATCH.timeout); clearTimeout(MATCH.nextT);
  MATCH = null;
  renderMatchArsenal();

  // Une remise de décoration passe avant l'offre commerciale : on ne veut pas
  // écraser le moment de gloire du joueur par une modale de promo.
  if (newMedals.length) { setTimeout(() => medalCeremony(newMedals[0]), 700); return; }
  if (outcome === "win" && (profile.sinceOffer >= 2 || Math.random() < 0.4)) { profile.sinceOffer = 0; saveProfile(); setTimeout(flashOffer, 950); }
}

/* ============================================================
   CARRIÈRE
   ============================================================ */
/* ------------------------------------------------------------
   TABLEAU DE PROGRESSION (niveaux 1 → 55 + prestige)
   ------------------------------------------------------------ */
function renderProgress() {
  const el = dom.progress; if (!el) return;
  const p = profile;
  const lvl = p.level, pres = p.prestige || 0;
  const maxed = lvl >= MAX_LEVEL;
  const need = xpForLevel(lvl);
  const pct = maxed ? 100 : Math.min(100, Math.round((p.xp / need) * 100));
  const info = prestigeInfo(pres);

  let html = `
    <section class="gg-prog__head">
      <div class="gg-prog__badge${pres ? " gg-prog__badge--pres" : ""}">
        ${pres ? `<span class="gg-prog__presico">${info.ico}</span>` : ""}
        <span class="gg-prog__lvl">${lvl}</span>
      </div>
      <div class="gg-prog__info">
        <span class="gg-prog__label">${pres ? esc(info.name) : "SANS PRESTIGE"}</span>
        <span class="gg-prog__title">NIVEAU ${lvl}${maxed ? " — MAX" : ""}</span>
        <div class="gg-bar"><div class="gg-bar__fill" style="width:${pct}%"></div></div>
        <span class="gg-prog__xp">${maxed ? "Palier maximum atteint" : `${p.xp} / ${need} XP`}</span>
      </div>
    </section>`;

  // Bandeau prestige
  if (canPrestige(p)) {
    const nxt = prestigeInfo(pres + 1);
    html += `
      <div class="gg-prestige gg-prestige--ready">
        <div class="gg-prestige__ico">${nxt.ico}</div>
        <div class="gg-prestige__txt">
          <b>PRESTIGE ${pres + 1} DISPONIBLE — ${esc(nxt.name)}</b>
          <span>Tu repars niveau 1. Tu gardes tes coins, ton matériel, tes décorations et tes amis.
          Tu gagnes <b>un gros bonus de coins (croissant à chaque prestige)</b>, un objet de chaque, et <b>+4 % de coins à vie</b>.</span>
        </div>
        <button class="btn btn--primary" id="btnPrestige">⭐ PASSER AU PRESTIGE</button>
      </div>`;
  } else if (pres >= PRESTIGE_MAX) {
    html += `<div class="gg-prestige"><div class="gg-prestige__ico">☠️</div><div class="gg-prestige__txt">
      <b>PRESTIGE MAXIMUM</b><span>Il n'y a plus rien au-dessus de toi, recrue. Respect.</span></div></div>`;
  } else if (!maxed) {
    html += `<div class="gg-prestige"><div class="gg-prestige__ico">⭐</div><div class="gg-prestige__txt">
      <b>PRESTIGE À ${MAX_LEVEL}</b><span>Encore ${MAX_LEVEL - lvl} niveau${MAX_LEVEL - lvl > 1 ? "x" : ""} avant de pouvoir passer au prestige suivant.</span></div></div>`;
  }

  // Échelle des paliers : on affiche une fenêtre autour du niveau courant,
  // plus tous les gros paliers — la liste des 55 d'un coup serait illisible.
  html += `<h2 class="gg-section-title">PALIERS DE RÉCOMPENSE</h2><div class="gg-levels">`;
  const shown = new Set();
  for (let l = 2; l <= MAX_LEVEL; l++) {
    const near = Math.abs(l - lvl) <= 4;
    const milestone = l % 5 === 0 || l === MAX_LEVEL;
    if (!near && !milestone) continue;
    shown.add(l);
    const r = levelReward(l);
    const done = l <= lvl;
    const isNext = l === lvl + 1;
    html += `<div class="gg-lvl${done ? " gg-lvl--done" : ""}${isNext ? " gg-lvl--next" : ""}${r.kind === "big" || r.kind === "prestige" ? " gg-lvl--big" : ""}">
      <span class="gg-lvl__n">${l}</span>
      <span class="gg-lvl__r">${esc(r.label)}</span>
      <span class="gg-lvl__s">${done ? "✔" : (isNext ? "→" : "🔒")}</span>
    </div>`;
  }
  html += `</div>`;

  // Galerie des prestiges
  html += `<h2 class="gg-section-title">LES ${PRESTIGE_MAX} PRESTIGES</h2><div class="gg-presgrid">`;
  PRESTIGES.forEach((x) => {
    const got = pres >= x.p;
    html += `<div class="gg-pres${got ? " gg-pres--got" : ""}" title="${esc(x.name)}">
      <span class="gg-pres__ico">${got ? x.ico : "🔒"}</span>
      <span class="gg-pres__n">${x.p}</span>
      <span class="gg-pres__name">${got ? esc(x.name) : "???"}</span>
    </div>`;
  });
  html += `</div>`;

  el.innerHTML = html;
  const bp = $("btnPrestige");
  if (bp) bp.addEventListener("click", () => {
    openModal(
      '<button class="pw-modal__close" data-close>✕</button>' +
      '<p class="pw-modal__eyebrow">// CONFIRMATION</p>' +
      '<h2 class="pw-modal__title">PASSER AU PRESTIGE ?</h2>' +
      '<p class="pw-modal__text">Ton niveau repart à <b>1</b>.<br>' +
      'Tu <b>gardes</b> : coins, objets, décorations, titres, amis, statistiques.<br>' +
      'Tu <b>gagnes</b> : l\'emblème de prestige à vie, un gros bonus de coins (croissant à chaque prestige), un objet de chaque, +4 % de coins définitifs.</p>' +
      '<div class="pw-modal__actions">' +
        '<button class="btn btn--primary" id="presYes">⭐ CONFIRMER</button>' +
        '<button class="btn btn--ghost" data-close>Pas encore</button></div>');
    const y = $("presYes");
    if (y) y.addEventListener("click", () => { closeModal(); doPrestige().then((ok) => { if (ok) renderProgress(); }); });
  });
}

function renderLadder() {
  const rk = rankOf(profile);              // grade PAYÉ (actuel)
  const cur = rk.gradeIndex, elig = rk.eligIdx;

  // Bandeau de PROMOTION (péage) : XP de carrière requise + coût en coins.
  let promoHtml;
  if (cur >= MAX_GRADE) {
    promoHtml = `<div class="gg-promo gg-promo--max">🎖️ Grade maximum : <b>Colonel</b>. Rien au-dessus, mon colonel.</div>`;
  } else {
    const next = cur + 1, cost = GRADE_COST[next] || 0;
    const eligible = elig >= next, enough = (profile.coins || 0) >= cost;
    const need = Math.max(0, GRADE_CUM[next] - (profile.rp || 0));
    if (!eligible) {
      promoHtml = `<div class="gg-promo gg-promo--lock">
        <div class="gg-promo__t">Prochain grade : <b>${esc(GRADES[next].name)}</b></div>
        <div class="gg-promo__d">Encore <b>${need.toLocaleString("fr-FR")}</b> galons à gagner au combat, puis <b>${cost.toLocaleString("fr-FR")}</b> ${coinIcon()} pour valider.</div></div>`;
    } else {
      promoHtml = `<div class="gg-promo gg-promo--ready">
        <div class="gg-promo__t">✅ Éligible : <b>${esc(GRADES[next].name)}</b></div>
        <div class="gg-promo__d">Coût de la promotion : <b>${cost.toLocaleString("fr-FR")}</b> ${coinIcon()}${enough ? "" : " — <span style='color:#ff8a8a'>pas assez de coins</span>"}</div>
        <button class="btn btn--primary" id="btnPromote"${enough ? "" : " disabled"}>⬆️ PROMOUVOIR</button></div>`;
    }
  }

  dom.ggLadder.innerHTML = promoHtml + GRADES.map((g, i) => {
    let cls = "gg-rung", tag, tier;
    if (i < cur) { cls += " gg-rung--done"; tag = "Acquis"; tier = "Or"; }
    else if (i === cur) { cls += " gg-rung--current"; tag = rk.capped ? "MAX" : `${rk.rpInGrade}/${rk.gradeSpan} galons`; tier = null; }
    else if (i <= elig) { cls += " gg-rung--ready"; tag = `À payer : ${(GRADE_COST[i] || 0).toLocaleString("fr-FR")} 🪙`; tier = "Bronze"; }
    else { tag = "Verrouillé"; tier = "Bronze"; }
    return `<div class="${cls}"><div class="gg-rung__badge">${ggInsignia(i)}</div><div class="gg-rung__name">${g.name}<small>Grade ${i + 1}/${GRADES.length}</small></div><span class="gg-rung__tag">${tag}</span></div>`;
  }).join("");

  const bp = $("btnPromote");
  if (bp) bp.addEventListener("click", tryPromote);
}

/* Promotion de grade : payer le péage en coins (le SERVEUR vérifie l'XP de
   carrière ET débite les coins ; le client ne peut ni forcer ni tricher). */
async function tryPromote() {
  const cur = rankOf(profile).gradeIndex;
  if (cur >= MAX_GRADE) return;
  const next = cur + 1, cost = GRADE_COST[next] || 0;
  if (eligibleGrade(profile.rp) < next) { toast("Pas encore assez d'XP de carrière, recrue."); return; }
  if ((profile.coins || 0) < cost) { toast("Pas assez de coins pour la promotion."); return; }
  const bp = $("btnPromote"); if (bp) bp.disabled = true;
  if (FB) {
    const res = await FB.promoteGrade();
    if (res.ok) {
      profile.grade = res.data.grade;
      if (typeof res.data.coins === "number") profile.coins = res.data.coins;
      saveProfile(); publishMe(); renderHud(); renderLadder(); renderDossier();
      APP.haptic("reward"); pwTrack("promote_grade", { grade: profile.grade });
      toast("🎖️ Promu " + GRADES[profile.grade].name + " !");
      return;
    }
    if (bp) bp.disabled = false;
    toast((res.error && res.error.message) || "Promotion impossible pour le moment.");
    return;
  }
  // Mode local (hors ligne) : promotion directe.
  profile.grade = next; profile.coins -= cost;
  saveProfile(); renderHud(); renderLadder(); renderDossier();
  toast("🎖️ Promu " + GRADES[next].name + " !");
}

/* ============================================================
   INTENDANCE
   ============================================================ */
function renderShop() {
  // BANNIÈRE « boucle boutique » : rappelle que les coins = de vrais codes,
  // et pousse à l'échange / à l'usage en boutique (moteur commercial du jeu).
  const codeDeals = SHOP.filter((d) => d.type !== "item");
  const afford = codeDeals.filter((d) => profile.coins >= d.cost).sort((a, b) => b.cost - a.cost);
  let banner;
  if (afford.length) {
    banner = `<div class="gg-shop-banner gg-shop-banner--go" style="grid-column:1/-1">🎟️ Tes coins sont de <b>vrais codes promo MASSACRE</b> — tu peux débloquer <b>${esc(afford[0].title)}</b> maintenant. <a href="collection-50.html" id="shopBannerLink">Utiliser en boutique →</a></div>`;
  } else {
    const next = codeDeals.slice().sort((a, b) => a.cost - b.cost)[0];
    const need = Math.max(0, next.cost - (profile.coins || 0));
    banner = `<div class="gg-shop-banner" style="grid-column:1/-1">🎟️ Tes coins deviennent de <b>vrais codes promo MASSACRE</b>. Encore <b>${need.toLocaleString("fr-FR")}</b> coins pour ton 1er code (${esc(next.title)}).</div>`;
  }
  dom.shopGrid.innerHTML = banner + SHOP.map((d, i) => {
    const ok = profile.coins >= d.cost;
    const ico = d.type === "item" ? itemIcon(d.key, "gg-deal__ico-img") : d.ico;
    const verb = d.type === "item" ? "ACHETER" : "ÉCHANGER";
    return `<div class="gg-deal${ok ? "" : " gg-deal--locked"}${d.type === "item" ? " gg-deal--item" : ""}"><div class="gg-deal__ico">${ico}</div><div class="gg-deal__title">${d.title}</div><div class="gg-deal__desc">${d.desc}</div><div class="gg-deal__price">${d.cost} ${coinIcon()}</div><button class="btn ${ok ? "btn--primary" : "btn--ghost"} btn--sm gg-buy" data-i="${i}" ${ok ? "" : "disabled"}>${ok ? verb : "PAS ASSEZ"}</button></div>`;
  }).join("");
  const sbl = $("shopBannerLink");
  if (sbl) sbl.addEventListener("click", () => pwTrack("store_click", { from: "shop_banner" }));
  renderCodes();
  renderArsenalShop();
  renderProfilCodes();   // le barda du Profil reflète le même stock de codes
}
function renderCodes() {
  if (!profile.codes.length) { dom.ownedCodes.innerHTML = `<p class="gg-codes__empty">Aucun code pour l'instant. Gagne au combat ou tente la roue, recrue. 🪖</p>`; return; }
  dom.ownedCodes.innerHTML = profile.codes.slice().reverse().map((c) => `<div class="gg-code"><div><div class="gg-code__val">${esc(c.code)}</div><div class="gg-code__desc">${esc(c.title)}</div></div><div class="gg-code__actions"><button class="gg-code__copy" data-code="${esc(c.code)}">copier</button><button class="gg-code__del" data-del="${esc(c.code)}" title="Supprimer ce code" aria-label="Supprimer ce code">🗑</button></div></div>`).join("");
}
function renderArsenalShop() {
  if (!dom.ownedItems) return;
  ensureItems(profile);
  const it = profile.items;
  if (!ITEM_KEYS.some((k) => it[k] > 0)) { dom.ownedItems.innerHTML = `<p class="gg-codes__empty">Ton barda est vide. Achète du matos ci-dessus, recrue. 🎒</p>`; return; }
  dom.ownedItems.innerHTML = ITEM_KEYS.map((k) => it[k]
    ? `<div class="gg-arsenal-item"><div class="gg-arsenal-item__ico">${itemIcon(k)}</div><div class="gg-arsenal-item__label">${ITEM_NAMES[k]}</div><div class="gg-arsenal-item__count">×${it[k]}</div></div>`
    : "").join("");
}
async function buy(i) {
  const d = SHOP[i]; if (!d) return;
  if (profile.coins < d.cost) { toast("Pas assez de coins, recrue. 💸"); return; }

  if (d.type === "item") {
    // Backend en ligne : le SERVEUR débite les coins (le client ne les écrit
    // plus). L'objet, lui, est ajouté côté client (aucune valeur monétaire).
    if (FB) {
      const res = await FB.buyItem(d.key);
      if (res.ok) {
        profile.coins = res.data.coins;
        ensureItems(profile); profile.items[d.key] = (profile.items[d.key] || 0) + 1;
        saveProfile(); renderHud(); renderShop(); renderMatchArsenal();
        toast(d.title + " ajouté à ton arsenal " + ITEM_FALLBACK[d.key]);
        return;
      }
      if (!res.unavailable) { toast((res.error && res.error.message) || "Achat impossible, recrue."); return; }
      // res.unavailable (Cloud Functions absentes) -> repli local ci-dessous.
    }
    profile.coins -= d.cost;
    ensureItems(profile); profile.items[d.key] = (profile.items[d.key] || 0) + 1;
    saveProfile(); renderHud(); renderShop(); renderMatchArsenal();
    toast(d.title + " ajouté à ton arsenal " + ITEM_FALLBACK[d.key]);
    return;
  }

  // Backend en ligne + objet lié à un vrai code Shopify : le SERVEUR débite les
  // coins et crée le code (jamais le client). Sinon (mode local, ou objet sans
  // clé, ex: PATCH OFFERT) : code "maison" généré côté client comme avant.
  // Cloud Functions déployées : le serveur débite et crée un VRAI code Shopify.
  // Sinon on retombe sur un code « maison » généré en local (voir plus bas) —
  // sans ce repli, l'achat échouait purement et simplement en plan gratuit.
  if (FB && d.key) {
    toast("Génération du code…");
    const res = await FB.redeemShopCode(d.key);
    if (res.ok) {
      profile.coins -= d.cost;
      profile.codes.push({ code: res.data.code, title: res.data.title });
      pwTrack("code_redeemed", { key: d.key, cost: d.cost });
      saveProfile(); renderHud(); renderShop();
      toast("Code débloqué : " + res.data.code + " 🎟️");
      return;
    }
    if (!res.unavailable) {
      toast((res.error && res.error.message) || "Erreur lors de la création du code.");
      return;
    }
    // res.unavailable -> on continue vers le repli local ci-dessous
  }

  profile.coins -= d.cost;
  const code = genPromo();
  profile.codes.push({ code, title: d.title }); saveProfile(); renderHud(); renderShop();
  toast("Code débloqué : " + code + " 🎟️");
}
function grantCode(title) { const code = genPromo(); profile.codes.push({ code, title }); saveProfile(); return code; }
function copyText(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {}); toast("Copié : " + t); }

/* ============================================================
   ROUE DE LA POPOTE (mini-jeu) + incitations boutique
   ============================================================ */
function wheelGradient() { let acc = 0, stops = []; const seg = 360 / WHEEL.length; WHEEL.forEach((s) => { stops.push(`${s.color} ${acc}deg ${acc + seg}deg`); acc += seg; }); return `conic-gradient(${stops.join(",")})`; }
function wheelLabels() { const seg = 360 / WHEEL.length; return WHEEL.map((s, i) => `<div class="pw-wheel__seg" style="transform:rotate(${i * seg + seg / 2}deg)"><span>${s.label}</span></div>`).join(""); }
function openWheel(welcome) {
  const free = Date.now() - profile.lastSpin >= DAY;
  const h = Math.max(1, Math.ceil((DAY - (Date.now() - profile.lastSpin)) / 3600000));
  const costLine = free ? "🎁 Ton spin gratuit du jour est dispo !" : ("⏳ Un seul spin toutes les 24 h — reviens dans ~" + h + " h.");
  openModal(`
    <button class="pw-modal__close" data-close>✕</button>
    <p class="pw-modal__eyebrow">// MINI-JEU — ROUE DE LA POPOTE</p>
    <h2 class="pw-modal__title">${welcome ? "BIENVENUE ! TON 1ER SPIN 🎡" : "LA ROUE DE LA POPOTE"}</h2>
    <div class="pw-wheel-wrap">
      <div class="pw-wheel__pin">🔻</div>
      <div class="pw-wheel" id="wheelEl" style="background:${wheelGradient()};transform:rotate(${wheelDeg}deg)">${wheelLabels()}<div class="pw-wheel__hub">🍲</div></div>
    </div>
    <p class="pw-wheel__cost" id="wheelCost">${costLine}</p>
    <div class="pw-modal__actions"><button class="btn btn--primary" id="wheelSpin"${free ? "" : " disabled"}>TOURNER</button><button class="btn btn--ghost" data-close>Fermer</button></div>`);
  $("wheelSpin").addEventListener("click", spinWheel);
}
function pickWheel() { const tot = WHEEL.reduce((a, s) => a + s.w, 0); let r = Math.random() * tot; for (let i = 0; i < WHEEL.length; i++) { r -= WHEEL[i].w; if (r <= 0) return i; } return 0; }
// Résultat serveur du dernier spin (coins déjà crédités) ; null = tirage local.
let wheelServerResult = null;
async function spinWheel() {
  const free = Date.now() - profile.lastSpin >= DAY;
  if (!free) { const h = Math.max(1, Math.ceil((DAY - (Date.now() - profile.lastSpin)) / 3600000)); toast("Un seul spin toutes les 24 h — reviens dans ~" + h + " h."); return; }

  const btn = $("wheelSpin"); if (btn) btn.disabled = true;

  // Validation du cooldown.
  // - Cloud Functions déployées (Blaze) : le serveur fait foi.
  // - Sinon (plan Spark) : on écrit en local, et ce sont les RÈGLES FIRESTORE
  //   qui empêchent la triche — elles refusent toute avance de `lastSpin`
  //   à moins de 24 h d'écart selon l'heure SERVEUR. L'anti-triche est donc
  //   bien réel même sans Cloud Functions.
  // (Avant, un échec de l'appel bloquait purement et simplement la roue : elle
  //  ne tournait jamais en plan gratuit.)
  let i;                    // index du segment gagnant
  wheelServerResult = null;
  if (FB) {
    const res = await FB.claimDailySpin();
    if (res.ok) {
      profile.lastSpin = Date.now();
      i = res.data.seg;                 // segment DÉCIDÉ par le serveur (coins déjà crédités)
      wheelServerResult = res.data;
      if (typeof res.data.coins === "number") profile.coins = res.data.coins;
    } else if (res.unavailable) {
      profile.lastSpin = Date.now(); i = pickWheel(); // repli local (Cloud Functions absentes)
    } else {
      const msg = (res.error && res.error.message) || "Roue déjà utilisée aujourd'hui.";
      toast(msg); if (btn) btn.disabled = false; return;
    }
  } else {
    profile.lastSpin = Date.now(); i = pickWheel();
  }
  saveProfile(); renderHud();

  const wheel = $("wheelEl");
  const seg = 360 / WHEEL.length, center = i * seg + seg / 2;
  const target = (360 - center % 360 + 360) % 360;
  wheelDeg += 360 * 5 + ((target - (wheelDeg % 360)) + 360) % 360;
  if (wheel) wheel.style.transform = `rotate(${wheelDeg}deg)`;
  setTimeout(() => awardWheel(WHEEL[i]), 4350);
}
async function awardWheel(seg) {
  let resultHtml, cta = "";
  if (seg.type === "coins") {
    // Coins déjà crédités par le serveur (claimDailySpin) : on ne les rajoute
    // en local QUE si le tirage était local (Cloud Functions absentes).
    if (!wheelServerResult) {
      profile.coins += seg.val;
      profile.coinsEarned = (profile.coinsEarned || 0) + seg.val;
    }
    resultHtml = `<b>+${seg.val} coins</b> tombés dans la gamelle !`;
    if (seg.val >= 500) pwFx("montre", { ms: 1400 });
  } else if (seg.type === "item") {
    // Gros lot matériel : marche en plan gratuit, aucune dépendance serveur.
    ensureItems(profile);
    profile.items[seg.key] = (profile.items[seg.key] || 0) + 1;
    resultHtml = `Tu décroches <b>${seg.title}</b> ! ${ITEM_FALLBACK[seg.key]}<br>` +
      `<span style="color:var(--khaki)">Rangé dans ton barda — dégaine-le en plein match.</span>`;
    cta = `<button class="btn btn--primary" data-close>🎒 VU, CHEF</button>`;
    pwFx(seg.key === "fusil" ? "fusil" : seg.key === "casque" ? "casque" : "montre");
  } else {
    resultHtml = `<b>Rien</b> cette fois 😬 Reviens demain, soldat.`;
  }
  // renderMatchArsenal : un objet gagné à la roue PENDANT un match doit
  // apparaître immédiatement dans la barre, sinon il semble ne pas exister.
  saveProfile(); renderHud(); renderMatchArsenal(); if (!$("viewShop").hidden) renderShop();
  const free = Date.now() - profile.lastSpin >= DAY;
  const again = "";
  dom.modalBox.innerHTML = `
    <button class="pw-modal__close" data-close>✕</button>
    <p class="pw-modal__eyebrow">// RÉSULTAT DE LA ROUE</p>
    <h2 class="pw-modal__title">🎉 RÉSULTAT</h2>
    <p class="pw-modal__text">${resultHtml}</p>
    <div class="pw-modal__actions">${cta}${again}<button class="btn btn--ghost" data-close>Fermer</button></div>`;
  dom.modalBox.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  const ag = $("wheelAgain"); if (ag) ag.addEventListener("click", () => openWheel(false));
}

/* ---------- offre éclair (incitation boutique après victoire) ---------- */
async function flashOffer() {
  if (!dom.modal.hidden) return;
  let code;
  if (FB) {
    const res = await FB.redeemFlashCode();
    if (res.ok) { code = res.data.code; profile.codes.push({ code: res.data.code, title: res.data.title }); saveProfile(); }
    else if (res.unavailable) { code = grantCode("OFFRE ÉCLAIR -15%"); } // plan gratuit
    else { toast((res.error && res.error.message) || "Erreur lors de la création du code."); return; }
  } else {
    code = grantCode("OFFRE ÉCLAIR -15%");
  }
  renderHud();
  openModal(`
    <button class="pw-modal__close" data-close>✕</button>
    <p class="pw-modal__eyebrow">// OFFRE ÉCLAIR — POPOTE WAR</p>
    <h2 class="pw-modal__title">-15 % RIEN QUE POUR TOI 🔥</h2>
    <p class="pw-countdown" id="offerCd">10:00</p>
    <p class="pw-modal__text">Bien joué, soldat. Voilà un code <b>-15 %</b> à dégainer en boutique avant qu'il file. (Rangé dans ton barda aussi.)</p>
    <div class="pw-bigcode">${code}</div>
    <div class="pw-modal__actions"><a class="btn btn--primary" href="collection-50.html">🛒 PASSER À LA CAISSE</a><button class="btn btn--ghost" data-close>Plus tard</button></div>`);
  let t = 600;
  offerTimer = setInterval(() => { t--; const cd = $("offerCd"); if (!cd) { clearInterval(offerTimer); offerTimer = null; return; } const m = (t / 60) | 0, s = t % 60; cd.textContent = m + ":" + (s < 10 ? "0" : "") + s; if (t <= 0) { clearInterval(offerTimer); offerTimer = null; cd.textContent = "EXPIRÉ"; } }, 1000);
}

/* ============================================================
   DOSSIER MILITAIRE — rendu de l'onglet + personnalisation
   ============================================================ */

// Remise de décoration : petite cérémonie modale, façon prise d'armes.
function medalCeremony(m) {
  if (!dom.modal.hidden) return;
  APP.haptic("reward");
  openModal(`
    <button class="pw-modal__close" data-close>✕</button>
    <p class="pw-modal__eyebrow">// PRISE D'ARMES — REMISE DE DÉCORATION</p>
    <div class="gg-ceremony">
      <div class="gg-ceremony__rays"></div>
      <div class="gg-ceremony__medal gg-medal--${m.metal.toLowerCase()}">${m.ico}</div>
    </div>
    <h2 class="pw-modal__title">${esc(m.name)}</h2>
    <p class="pw-modal__text">${esc(m.desc)}<br><span style="color:var(--khaki)">Catégorie : ${esc(m.cat)}</span></p>
    <div class="pw-modal__actions">
      <button class="btn btn--primary" id="ceremGo">🎖️ VOIR MON DOSSIER</button>
      <button class="btn btn--ghost" data-close>Rompez</button>
    </div>`);
  const g = $("ceremGo");
  if (g) g.addEventListener("click", () => { closeModal(); showView("viewDossier"); });
}

// Affiche le rang mondial du joueur (classement par coins) dans sa carte de
// dossier. Asynchrone : la carte montre « … » puis est complétée dès la réponse.
async function fillWorldRank() {
  if (!FB) return;
  const el = $("dossierWorld"); if (!el) return;
  try {
    const rank = await FB.worldRank("wins", profile.wins || 0);
    el.innerHTML = `🏆 Rang mondial (victoires) : <b>#${rank}</b>`;
  } catch (e) { el.innerHTML = ""; }
}

function renderDossier() {
  if (!dom.dossier) return;
  ensureItems(profile);
  const p = profile;
  const rk = rankOf(p);
  const tActive = activeTitle(p), bActive = activeBanner(p);
  const uT = unlockedTitles(p), uB = unlockedBanners(p), uM = unlockedMedals(p);

  // --- bande d'identité COMPACTE ---
  // L'identité (badge, pseudo, grade, titre) et le visuel vivent désormais sur
  // la barre du haut (HUD). Ici on ne garde que ce qui ne s'y trouve pas :
  // le rang mondial et les dernières décorations. Zéro répétition.
  let html = `
    <section class="gg-dossier__strip">
      ${FB ? `<span class="gg-dossier__world" id="dossierWorld">🌍 Rang mondial <b>…</b></span>` : ""}
      <div class="gg-dossier__ribbons">
        ${uM.slice(-8).map((m) => `<span class="gg-ribbon gg-medal--${m.metal.toLowerCase()}" title="${esc(m.name)}">${m.ico}</span>`).join("") || '<span class="gg-dossier__none">Aucune décoration… pour l\'instant.</span>'}
      </div>
    </section>

    <div class="gg-dossier__stats">
      ${[["Parties", p.played], ["Victoires", p.wins], ["Bonnes réponses", p.goodAnswers],
         ["Sans-faute", p.perfects], ["Meilleure série", p.best], ["Coins gagnés", p.coinsEarned]]
        .map(([l, v]) => `<div class="gg-stat"><div class="gg-stat__num">${v}</div><span class="gg-stat__lbl">${l}</span></div>`).join("")}
    </div>`;

  // --- titres ---
  html += `<h2 class="gg-section-title">MON TITRE <small>(${uT.length}/${TITLES.length} débloqués)</small></h2>
    <div class="gg-picker" id="titlePicker">` +
    TITLES.map((t) => {
      const on = !!uT.find((x) => x.id === t.id), sel = t.id === tActive.id;
      return `<button class="gg-pick${sel ? " gg-pick--sel" : ""}${on ? "" : " gg-pick--lock"}" data-title="${t.id}" ${on ? "" : "disabled"}>
        <span class="gg-pick__name">${on ? esc(t.name) : "🔒 ???"}</span>
        <span class="gg-pick__desc">${esc(t.desc)}</span></button>`;
    }).join("") + `</div>`;

  // --- bannières ---
  html += `<h2 class="gg-section-title">MA BANNIÈRE <small>(${uB.length}/${BANNERS.length} débloquées)</small></h2>
    <div class="gg-banners" id="bannerPicker">` +
    BANNERS.map((b) => {
      const on = !!uB.find((x) => x.id === b.id), sel = b.id === bActive.id;
      return `<button class="gg-banner${sel ? " gg-banner--sel" : ""}" data-banner="${b.id}" ${on ? "" : "disabled"}
        style="background:${b.css}">
        <span>${on ? esc(b.name) : "🔒 " + GRADES[b.grade].name}</span></button>`;
    }).join("") + `</div>`;

  // --- thème saisonnier (habillage du jeu, DA militaire conservée) ---
  const curTheme = profile.theme || "auto";
  html += `<h2 class="gg-section-title">MON THÈME <small>(habillage du jeu)</small></h2>
    <div class="gg-themes" id="themePicker">` +
    SEASONS.map((s) => `<button class="gg-theme${s.key === curTheme ? " gg-theme--sel" : ""}" data-theme="${s.key}">
      <span class="gg-theme__ico">${s.ico}</span><span>${esc(s.label)}</span>
      <span class="gg-theme__sw" style="background:${s.sw}"></span></button>`).join("") + `</div>`;

  // --- décorations, groupées par catégorie ---
  html += `<h2 class="gg-section-title">MES DÉCORATIONS <small>(${uM.length}/${MEDALS.length})</small></h2>`;
  const cats = [...new Set(MEDALS.map((m) => m.cat))];
  cats.forEach((cat) => {
    html += `<h3 class="gg-dossier__cat">${esc(cat)}</h3><div class="gg-medals">`;
    MEDALS.filter((m) => m.cat === cat).forEach((m) => {
      const on = medalUnlocked(p, m);
      const cur = statValue(p, m.stat), pct = clamp(cur / m.need * 100, 0, 100);
      html += `<div class="gg-medal${on ? " gg-medal--on gg-medal--" + m.metal.toLowerCase() : " gg-medal--off"}">
        <div class="gg-medal__ico">${on ? m.ico : "🔒"}</div>
        <div class="gg-medal__body">
          <div class="gg-medal__name">${esc(m.name)}</div>
          <div class="gg-medal__desc">${esc(m.desc)}</div>
          ${on ? `<div class="gg-medal__got">✔ OBTENUE</div>`
               : `<div class="gg-bar gg-medal__bar"><div class="gg-bar__fill" style="width:${pct}%"></div></div>
                  <div class="gg-medal__prog">${Math.min(cur, m.need)} / ${m.need}</div>`}
        </div></div>`;
    });
    html += `</div>`;
  });

  dom.dossier.innerHTML = html;
  fillWorldRank();   // rang mondial (asynchrone : Firestore)

  // --- interactions ---
  renderProfilCodes();
  renderProfilAccount();

  dom.dossier.querySelectorAll("[data-title]").forEach((b) => b.addEventListener("click", () => {
    profile.title = b.dataset.title; saveProfile(); renderDossier(); renderHud();
    toast("Titre affiché : " + titleById(profile.title).name);
  }));
  dom.dossier.querySelectorAll("[data-banner]").forEach((b) => b.addEventListener("click", () => {
    profile.banner = b.dataset.banner; saveProfile(); renderDossier(); renderHud();
    toast("Bannière : " + bannerById(profile.banner).name);
  }));
  dom.dossier.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => {
    profile.theme = b.dataset.theme; saveProfile(); applyTheme(profile.theme); renderDossier();
    const s = SEASONS.find((x) => x.key === profile.theme);
    toast("Thème : " + (s ? s.label : profile.theme) + " " + (s ? s.ico : ""));
  }));
}

/* ------------------------------------------------------------
   PROFIL — barda (codes promo) et compte
   Récupéré de l'ancienne page profils.html : le jeu tient
   désormais dans une seule page, insérable telle quelle.
   ------------------------------------------------------------ */
function renderProfilCodes() {
  const el = $("profilCodes"); if (!el) return;
  const codes = profile.codes || [];
  if (!codes.length) {
    el.innerHTML = `<p class="gg-codes__empty">Aucun code pour l'instant. Gagne au combat, tente la roue ou passe à l'intendance. 🪖</p>`;
    return;
  }
  el.innerHTML = codes.slice().reverse().map((c) => {
    // La condition éventuelle (« — dès 30 € d'achat ») est détachée du titre et
    // affichée en pastille, pour que le joueur voie tout de suite qu'un minimum
    // de panier est requis.
    const parts = String(c.title || "").split(" — ");
    const name = parts[0];
    const cond = parts.slice(1).join(" — ");
    return `<div class="gg-code"><div><div class="gg-code__val">${esc(c.code)}</div>` +
      `<div class="gg-code__desc">${esc(name)}` +
      (cond ? ` <span class="gg-code__cond">⚠ ${esc(cond)}</span>` : "") + `</div></div>` +
    `<div class="gg-code__actions">` +
      `<button class="gg-code__copy" data-code="${esc(c.code)}">copier</button>` +
      `<button class="gg-code__del" data-del="${esc(c.code)}" title="Supprimer ce code" aria-label="Supprimer ce code">🗑</button>` +
    `</div></div>`;
  }).join("");
  el.querySelectorAll(".gg-code__copy").forEach((b) =>
    b.addEventListener("click", () => copyText(b.dataset.code)));
  el.querySelectorAll(".gg-code__del").forEach((b) =>
    b.addEventListener("click", () => deleteCode(b.dataset.del)));
}

/* Retire un code du barda (côté joueur). On confirme d'abord : un code non
   encore utilisé (surtout le patch) a de la valeur, on évite la suppression
   accidentelle. La suppression retire AUSSI le vrai code de réduction dans
   Shopify (Cloud Function deleteShopCode) : un code jeté n'est donc plus
   utilisable en boutique. */
function deleteCode(codeVal) {
  if (!codeVal) return;
  openModal(
    '<button class="pw-modal__close" data-close>✕</button>' +
    '<p class="pw-modal__eyebrow">// BARDA</p>' +
    '<h2 class="pw-modal__title">SUPPRIMER CE CODE ?</h2>' +
    '<p class="pw-modal__text">Le code <b>' + esc(codeVal) + '</b> sera supprimé de ton barda ' +
    "<b>et de la boutique</b> — il ne pourra plus servir. Cette action est définitive.</p>" +
    '<div class="pw-modal__actions">' +
      '<button class="btn btn--ghost" id="delCodeYes">🗑 SUPPRIMER</button>' +
      '<button class="btn btn--primary" data-close>← LE GARDER</button>' +
    '</div>');
  const y = $("delCodeYes");
  if (y) y.addEventListener("click", async () => {
    y.disabled = true; y.textContent = "Suppression…";
    // Supprime le VRAI code Shopify (best-effort). Le serveur retire aussi le
    // code du profil ; on met à jour l'affichage local dans la foulée.
    if (FB && typeof FB.deleteShopCode === "function") {
      try { await FB.deleteShopCode(codeVal); } catch (e) { console.warn("[PW] deleteShopCode", e); }
    }
    profile.codes = (profile.codes || []).filter((c) => c.code !== codeVal);
    saveProfile();
    renderProfilCodes();
    if (typeof renderCodes === "function") renderCodes();
    closeModal();
    toast("Code supprimé du barda et de la boutique.");
  });
}

function renderProfilAccount() {
  const el = $("profilAccount"); if (!el) return;
  const created = profile.created ? new Date(profile.created).toLocaleDateString("fr-FR") : "—";
  el.innerHTML =
    '<div class="gg-account__row"><span>Pseudo</span><b>' + esc(profile.pseudo || "Recrue") + '</b></div>' +
    (profile.email ? '<div class="gg-account__row"><span>Email</span><b>' + esc(profile.email) + '</b></div>' : "") +
    '<div class="gg-account__row"><span>Inscrit depuis</span><b>' + created + '</b></div>' +
    '<div class="gg-account__row"><span>Sauvegarde</span><b>' + (FB ? "En ligne ✔" : "Locale (cet appareil)") + '</b></div>' +
    // En mode en ligne : changer de pseudo (unicité garantie) et de mot de passe.
    (FB ?
      '<div class="gg-account__edit">' +
        '<label class="gg-account__lbl" for="newPseudo">Changer de pseudo</label>' +
        '<div class="gg-account__row2">' +
          '<input class="gg-input" id="newPseudo" maxlength="16" autocomplete="off" placeholder="Nouveau pseudo" value="' + esc(profile.pseudo || "") + '">' +
          '<button class="btn btn--primary btn--sm" id="savePseudo">Enregistrer</button>' +
        '</div>' +
        '<button class="btn btn--ghost btn--sm" id="changePass" style="margin-top:.5rem">🔑 Changer mon mot de passe</button>' +
      '</div>'
    : '') +
    '<div class="gg-account__actions">' +
      '<a class="btn btn--primary" id="useCodesLink" href="collection-50.html">🛍️ UTILISER MES CODES</a>' +
      '<button class="btn btn--ghost" id="profilLogout">⏏ Se déconnecter</button>' +
    '</div>';
  const lo = $("profilLogout");
  if (lo) lo.addEventListener("click", logout);
  const ucl = $("useCodesLink");
  if (ucl) ucl.addEventListener("click", () => pwTrack("store_click"));

  // --- Changer de pseudo ---
  const sp = $("savePseudo");
  if (sp) sp.addEventListener("click", async () => {
    const val = (($("newPseudo") || {}).value || "").trim();
    if (val.length < 3) { toast("Pseudo trop court (3 caractères mini)."); return; }
    if (!cleanPseudo(val)) { toast("Pseudo trop grossier, recrue. Trouve autre chose."); return; }
    if (normPseudoLike(val) === normPseudoLike(profile.pseudo || "")) { toast("C'est déjà ton pseudo, recrue. 🙂"); return; }
    sp.disabled = true; sp.textContent = "…";
    try {
      const clean = await FB.changePseudo(val);
      profile.pseudo = clean; saveProfile(); publishMe();
      renderHud(); renderDossier();
      toast("Pseudo changé : " + clean + " ✅");
    } catch (e) {
      toast((e && e.message) || "Impossible de changer le pseudo.");
      sp.disabled = false; sp.textContent = "Enregistrer";
    }
  });

  // --- Changer de mot de passe (email de réinitialisation) ---
  const cpw = $("changePass");
  if (cpw) cpw.addEventListener("click", async () => {
    if (!profile.email) { toast("Aucun email rattaché à ce compte."); return; }
    cpw.disabled = true;
    try {
      await FB.sendPasswordReset(profile.email);
      toast("📧 Email envoyé à " + profile.email + " — clique le lien pour choisir un nouveau mot de passe.");
    } catch (e) {
      toast("Impossible d'envoyer l'email — réessaie.");
      cpw.disabled = false;
    }
  });
}
// Comparaison "même pseudo" tolérante à la casse/accents (évite un aller-retour
// serveur inutile quand l'utilisateur ré-enregistre le même nom).
function normPseudoLike(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ============================================================
   CLASSEMENTS & AMIS
   ------------------------------------------------------------
   Nécessite le backend en ligne (FB). Sans Firebase, l'onglet
   affiche un message plutôt que de casser : le reste du jeu
   fonctionne toujours en local.
   ============================================================ */
let LB = { scope: "monde", field: "wins", rows: null, loading: false, token: 0, page: 0 };
const LB_PER_PAGE = 20;

const LB_FIELDS = [
  { key: "wins",        label: "🏆 Victoires",      suffix: "" },
  { key: "coins",       label: "🪙 Coins",          suffix: "" },
  { key: "best",        label: "🔥 Meilleure série",suffix: "" },
  { key: "goodAnswers", label: "🎯 Bonnes réponses",suffix: "" },
];

// Publie la vitrine publique (appelée après chaque fin de match).
function publishMe() {
  if (!FB || !profile) return;
  profile.medalCount = unlockedMedals(profile).length;
  FB.publishLeaderboard(profile);
}

/* Réciprocité des amitiés : quand quelqu'un accepte MA demande, je ne peux
   pas écrire dans son profil (et lui pas dans le mien). Chacun ajoute donc
   l'autre de son côté — lui à l'acceptation, moi ici au chargement. */
async function syncFriendships() {
  if (!FB || !profile) return;
  try {
    const accepted = await FB.acceptedRequests();
    if (!accepted.length) return;
    let changed = false;
    for (const r of accepted) {
      if (!profile.friends.includes(r.to)) { profile.friends.push(r.to); changed = true; }
      await FB.dropRequest(r.id).catch(() => {});
    }
    if (changed) { saveProfile(); toast("Nouveau frère d'armes ajouté ! 🤝"); }
  } catch (e) { /* silencieux : le classement reste utilisable */ }
}

async function renderLeaderboard() {
  const el = dom.leaderboard; if (!el) return;

  if (!FB) {
    el.innerHTML = `<p class="gg-codes__empty">Le classement nécessite le mode en ligne (Firebase). Tu joues actuellement en local, recrue.</p>`;
    return;
  }

  const myUid = FB.uid();
  const myCode = FB.friendCode(myUid);

  // --- barre d'outils : portée + critère + code ami ---
  let html = `
    <div class="gg-lb__bar">
      <div class="gg-lb__scopes">
        <button class="gg-lb__scope${LB.scope === "monde" ? " gg-lb__scope--on" : ""}" data-scope="monde">🌍 MONDIAL</button>
        <button class="gg-lb__scope${LB.scope === "amis" ? " gg-lb__scope--on" : ""}" data-scope="amis">🤝 MES AMIS</button>
      </div>
      <div class="gg-lb__fields">
        ${LB_FIELDS.map((f) => `<button class="gg-lb__field${LB.field === f.key ? " gg-lb__field--on" : ""}" data-field="${f.key}">${f.label}</button>`).join("")}
      </div>
    </div>

    <div class="gg-ally">
      <div class="gg-ally__id">
        <span class="gg-ally__lbl">📛 TON MATRICULE</span>
        <div class="gg-ally__code" id="myFriendCode">${esc(myCode)}</div>
        <div class="gg-ally__sub">Ton code <b>ami</b> ET ton code de <b>parrain</b> — un seul matricule, recrue.</div>
        <div class="gg-ally__acts">
          <button class="btn btn--ghost btn--sm" id="copyFriendCode">📋 Copier</button>
          <button class="btn btn--primary btn--sm" id="shareRef">📣 Partager</button>
        </div>
      </div>
      <div class="gg-ally__ops">
        <div class="gg-ally__op">
          <span class="gg-ally__lbl">🤝 AJOUTER UN FRÈRE D'ARMES</span>
          <div class="gg-ally__row">
            <input class="gg-input" id="friendCodeInput" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" />
            <button class="btn btn--primary btn--sm" id="addFriendBtn">AJOUTER</button>
          </div>
        </div>
        <div class="gg-ally__op">
          <span class="gg-ally__lbl">🎖️ CODE DE TON PARRAIN — <b>+500 coins</b></span>
          ${profile.referredBy
            ? '<div class="gg-referral__done">✔ Parrain validé. Repos, recrue.</div>'
            : `<div class="gg-ally__row">
                 <input class="gg-input" id="refCodeInput" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off">
                 <button class="btn btn--olive btn--sm" id="claimRefBtn">VALIDER</button>
               </div>`}
        </div>
      </div>
      <p class="gg-ally__joke">🍲 File ton matricule à un frère d'armes : <b>+500 coins</b> pour toi ET lui. La popote nourrit toute la chambrée.</p>
    </div>
    <div id="friendReqs"></div>
    <div id="lbRows">${LB.loading ? '<p class="gg-codes__empty">Chargement du classement…</p>' : ""}</div>`;

  el.innerHTML = html;

  // --- interactions ---
  // NB : on n'appelle PAS loadLbRows() ici — renderLeaderboard() s'en charge
  // déjà quand LB.rows est null. L'appeler en plus lançait deux chargements
  // concurrents à chaque clic (lectures Firestore doublées + résultat périmé
  // possible si la première réponse arrivait après la seconde).
  el.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => {
    LB.scope = b.dataset.scope; LB.rows = null; LB.page = 0; renderLeaderboard();
  }));
  // CHANGEMENT DE CRITÈRE 100 % LOCAL : chaque ligne contient déjà les 4
  // compteurs (coins/wins/best/goodAnswers). Re-trier en mémoire est
  // instantané et évite de relire ~1250 documents Firestore par clic.
  el.querySelectorAll("[data-field]").forEach((b) => b.addEventListener("click", () => {
    LB.field = b.dataset.field; LB.page = 0;
    if (LB.rows && LB.rows.length) {
      LB.rows.sort((a, x) => (x[LB.field] || 0) - (a[LB.field] || 0));
      renderLeaderboard();
    } else { LB.rows = null; renderLeaderboard(); }
  }));
  const cp = $("copyFriendCode"); if (cp) cp.addEventListener("click", () => copyText(myCode));
  const af = $("addFriendBtn"); if (af) af.addEventListener("click", addFriendByCode);
  const fi = $("friendCodeInput");
  if (fi) fi.addEventListener("keydown", (e) => { if (e.key === "Enter") addFriendByCode(); });
  const sr = $("shareRef"); if (sr) sr.addEventListener("click", () => shareReferral(myCode));
  const cr = $("claimRefBtn"); if (cr) cr.addEventListener("click", claimReferral);
  const rci = $("refCodeInput");
  if (rci) rci.addEventListener("keydown", (e) => { if (e.key === "Enter") claimReferral(); });

  renderFriendRequests();
  if (LB.rows) paintLbRows(); else loadLbRows();
}

/* Partage du code de parrainage (natif si possible, sinon copie). */
async function shareReferral(code) {
  const url = "https://massacre-officiel.com/pages/popote-war";
  const text = "🎖️ Rejoins-moi sur POPOTE WAR ! Mets mon code de parrainage " + code +
    " → +500 MASSACRE Coins offerts pour toi. " + url;
  pwTrack("referral_share");
  try { if (navigator.share) { await navigator.share({ title: "POPOTE WAR", text }); return; } } catch (e) {}
  copyText(text);
}

/* Réclame un code de parrain : le SERVEUR crédite les deux joueurs (une seule
   fois, jamais soi-même, parrain plafonné). */
async function claimReferral() {
  if (!FB) { toast("Le parrainage nécessite le mode en ligne."); return; }
  if (profile.referredBy) { toast("Tu as déjà utilisé un code de parrain."); return; }
  const inp = $("refCodeInput"); if (!inp) return;
  const code = (inp.value || "").trim().toUpperCase();
  if (!code) { toast("Entre le code de ton parrain, recrue."); return; }
  const btn = $("claimRefBtn"); if (btn) btn.disabled = true;
  const res = await FB.claimReferral(code);
  if (res.ok) {
    profile.referredBy = "1";                      // marqueur local (le serveur fait foi)
    if (typeof res.data.coins === "number") profile.coins = res.data.coins;
    saveProfile(); renderHud();
    pwTrack("referral_claimed");
    toast("🎁 Parrainage validé — +" + (res.data.bonus || 500) + " coins pour vous deux !");
    LB.rows = null; renderLeaderboard();
    return;
  }
  if (btn) btn.disabled = false;
  toast((res.error && res.error.message) || "Code de parrainage invalide.");
}

async function addFriendByCode() {
  const inp = $("friendCodeInput"); if (!inp) return;
  const code = (inp.value || "").trim().toUpperCase();
  if (!code) return toast("Entre un code ami, recrue.");
  if (code === FB.friendCode(FB.uid())) return toast("C'est ton propre code, malin. 🙃");
  try {
    const found = await FB.findByCode(code);
    if (!found) return toast("Aucun soldat avec ce code.");
    if (profile.friends.includes(found.uid)) return toast("Vous êtes déjà frères d'armes.");
    const res = await FB.sendFriendRequest(found.uid, profile.pseudo);
    inp.value = "";
    if (res && res.mutual) {
      // Il m'avait déjà invité : l'amitié se scelle immédiatement.
      if (!profile.friends.includes(found.uid)) profile.friends.push(found.uid);
      saveProfile();
      toast(found.pseudo + " t'avait déjà invité — vous êtes frères d'armes ! 🤝");
      LB.rows = null; renderLeaderboard();
    } else {
      toast("Demande envoyée à " + found.pseudo + " 📨");
    }
  } catch (e) {
    toast((e && e.message) ? e.message : "Impossible d'envoyer la demande.");
  }
}

async function renderFriendRequests() {
  const box = $("friendReqs"); if (!box || !FB) return;
  let reqs = [];
  try { reqs = await FB.incomingRequests(); } catch (e) { return; }
  if (!reqs.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<h3 class="gg-dossier__cat">Demandes reçues (${reqs.length})</h3>` +
    reqs.map((r) => `
      <div class="gg-req">
        <span class="gg-req__name">${esc(r.fromPseudo || "Recrue")}</span>
        <div class="gg-req__actions">
          <button class="btn btn--primary btn--sm" data-acc="${esc(r.id)}" data-uid="${esc(r.from)}">✔ Accepter</button>
          <button class="btn btn--ghost btn--sm" data-dec="${esc(r.id)}">✕ Refuser</button>
        </div>
      </div>`).join("");

  box.querySelectorAll("[data-acc]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await FB.acceptAndClean(b.dataset.acc, b.dataset.uid);
      if (!profile.friends.includes(b.dataset.uid)) profile.friends.push(b.dataset.uid);
      saveProfile();
      toast("Frère d'armes ajouté ! 🤝");
      LB.rows = null; renderLeaderboard();
    } catch (e) { b.disabled = false; toast("Échec de l'ajout."); }
  }));
  box.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { await FB.dropRequest(b.dataset.dec); toast("Demande refusée."); renderFriendRequests(); }
    catch (e) { b.disabled = false; }
  }));
}

async function loadLbRows() {
  if (!FB) return;
  // Jeton de requête : si le joueur enchaîne les filtres, seule la réponse de
  // la DERNIÈRE demande a le droit de peindre. Sans ça, une requête lente
  // partie avant peut écraser un résultat plus récent.
  const token = ++LB.token;
  LB.loading = true;
  APP.loading(true);
  const rowsEl = $("lbRows");
  if (rowsEl) rowsEl.innerHTML = '<p class="gg-codes__empty">Chargement du classement…</p>';
  try {
    if (LB.scope === "amis") {
      // On s'inclut toujours dans le classement des amis : sinon on ne sait
      // pas où on se situe, ce qui est tout l'intérêt du truc.
      const uids = [FB.uid()].concat(profile.friends || []);
      const rows = await FB.playersByUids(uids);
      rows.sort((a, b) => (b[LB.field] || 0) - (a[LB.field] || 0));
      LB.rows = rows;
    } else {
      // On charge TOUT le monde (limite haute) pour pouvoir feuilleter le
      // classement complet par pages de 20. 5000 couvre large (1256 comptes
      // aujourd'hui) ; le nombre total affiché sert le côté compétitif.
      LB.rows = await FB.topPlayers(LB.field, 5000);
      LB.loadedAt = Date.now();   // horodatage du cache (TTL 2 min, cf. showView)
    }
  } catch (e) {
    APP.loading(false);
    if (token !== LB.token) return; // une demande plus récente a pris la main
    LB.rows = [];
    if (rowsEl) rowsEl.innerHTML = `<p class="gg-codes__empty">Classement indisponible. Vérifie que les règles Firestore sont déployées (<code>firebase deploy --only firestore:rules</code>).</p>`;
    LB.loading = false;
    return;
  }
  APP.loading(false);
  if (token !== LB.token) return;
  // ASSAINISSEMENT : chaque joueur écrit librement SA ligne de classement.
  // Les règles ne validaient ni `level`, ni `prestige`, ni les compteurs :
  // un attaquant pouvait y glisser du HTML et le servir à tous les visiteurs
  // du classement, en se plaçant premier grâce à un solde absurde.
  LB.rows = (LB.rows || []).map((r) => ({
    uid: sStr(r.uid, 40),
    pseudo: sStr(r.pseudo || "Recrue", 24),
    coins: sNum(r.coins, 0, 1e12, 0),
    wins: sNum(r.wins, 0, 1e9, 0),
    best: sNum(r.best, 0, 1e6, 0),
    played: sNum(r.played, 0, 1e9, 0),
    goodAnswers: sNum(r.goodAnswers, 0, 1e9, 0),
    medals: sNum(r.medals, 0, 999, 0),
    rp: sNum(r.rp, 0, 1e9, 0),
    level: sNum(r.level, 1, MAX_LEVEL, 1),
    prestige: sNum(r.prestige, 0, PRESTIGE_MAX, 0),
    grade: sNum(r.grade, 0, MAX_GRADE, 0),
    title: sStr(r.title, 24),
  }));
  LB.loading = false;
  paintLbRows();
}

function paintLbRows() {
  const rowsEl = $("lbRows"); if (!rowsEl) return;
  const rows = LB.rows || [];
  if (!rows.length) {
    rowsEl.innerHTML = LB.scope === "amis"
      ? `<p class="gg-codes__empty">Aucun frère d'armes pour l'instant. Partage ton code ami ci-dessus. 🤝</p>`
      : `<p class="gg-codes__empty">Classement vide pour l'instant. Sois le premier à marquer l'histoire.</p>`;
    return;
  }
  const myUid = FB.uid();
  const fieldMeta = LB_FIELDS.find((f) => f.key === LB.field) || LB_FIELDS[0];

  // --- pagination : 20 joueurs par page (page 1 = 1→20, page 2 = 21→40, …) ---
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / LB_PER_PAGE));
  if (LB.page >= pages) LB.page = pages - 1;
  if (LB.page < 0) LB.page = 0;
  const start = LB.page * LB_PER_PAGE;
  const slice = rows.slice(start, start + LB_PER_PAGE);
  // Position mondiale de l'appelant dans CE classement (pour le bouton « moi »).
  const myIndex = rows.findIndex((x) => x.uid === myUid);

  const rowsHtml = slice.map((r, i) => {
    const pos = start + i + 1;                       // rang MONDIAL réel
    const rk = rankOf(r);
    const me = r.uid === myUid;
    const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : pos;
    return `<button class="gg-lb__row${me ? " gg-lb__row--me" : ""}" data-player="${esc(r.uid)}">
      <span class="gg-lb__pos">${medal}</span>
      <span class="gg-lb__badge">${ggInsignia(rk.gradeIndex, rk.tier)}</span>
      <span class="gg-lb__who">
        <b>${r.prestige ? `<span class="gg-lb__pres">${prestigeInfo(r.prestige).ico}${r.prestige}</span> ` : ""}${esc(r.pseudo || "Recrue")}</b>
        <small>Niv. ${r.level || 1} · ${esc(titleById(r.title).name)} · ${rk.grade}</small>
      </span>
      <span class="gg-lb__val">${(r[LB.field] || 0).toLocaleString("fr-FR")}<small>${esc(fieldMeta.label.replace(/^\S+\s/, ""))}</small></span>
    </button>`;
  }).join("");

  // Barre de navigation : ‹ précédent · Page X / Y · suivant › + saut « MOI ».
  const nav = `
    <div class="gg-lb__nav">
      <button class="btn btn--ghost btn--sm lbPrev"${LB.page === 0 ? " disabled" : ""}>‹ Préc.</button>
      <span class="gg-lb__pageinfo">Page ${LB.page + 1} / ${pages} · ${total} joueur${total > 1 ? "s" : ""}</span>
      <button class="btn btn--ghost btn--sm lbNext"${LB.page >= pages - 1 ? " disabled" : ""}>Suiv. ›</button>
      ${myIndex >= 0 ? `<button class="btn btn--primary btn--sm lbMe">🎯 Ma position (#${myIndex + 1})</button>` : ""}
    </div>`;
  // Compteur d'effectifs, bien visible : le côté compétitif « X soldats enrôlés ».
  const troops = LB.scope === "monde"
    ? `<div class="gg-lb__troops">⚔️ <b>${total.toLocaleString("fr-FR")}</b> soldat${total > 1 ? "s" : ""} enrôlé${total > 1 ? "s" : ""} au classement</div>`
    : "";

  rowsEl.innerHTML = troops + nav + `<div class="gg-lb__rows">` + rowsHtml + `</div>` + (pages > 1 ? nav : "");

  rowsEl.querySelectorAll("[data-player]").forEach((b) => b.addEventListener("click", () => {
    const row = rows.find((x) => x.uid === b.dataset.player);
    if (row) openPlayerCard(row);
  }));
  rowsEl.querySelectorAll(".lbPrev").forEach((b) => b.addEventListener("click", () => { if (LB.page > 0) { LB.page--; paintLbRows(); } }));
  rowsEl.querySelectorAll(".lbNext").forEach((b) => b.addEventListener("click", () => { if (LB.page < pages - 1) { LB.page++; paintLbRows(); } }));
  rowsEl.querySelectorAll(".lbMe").forEach((b) => b.addEventListener("click", () => { LB.page = Math.floor(myIndex / LB_PER_PAGE); paintLbRows(); }));
}

/* ------------------------------------------------------------
   FICHE JOUEUR — consultable depuis le classement.
   Ne lit QUE la vitrine publique (jamais le profil privé), donc
   aucune donnée sensible ne peut fuiter ici.
   ------------------------------------------------------------ */
function openPlayerCard(p) {
  const rk = rankOf(p);
  const isMe = p.uid === FB.uid();
  const isFriend = (profile.friends || []).includes(p.uid);
  const t = titleById(p.title);

  const stats = [
    ["Niveau", (p.prestige ? prestigeInfo(p.prestige).ico + " " : "") + (p.level || 1)],
    ["Parties", p.played || 0], ["Victoires", p.wins || 0],
    ["Bonnes réponses", p.goodAnswers || 0], ["Meilleure série", p.best || 0],
    ["Décorations", (p.medals || 0) + "/" + MEDALS.length],
  ];

  let action;
  if (isMe) action = `<button class="btn btn--ghost" data-close>C'est toi, recrue 🫡</button>`;
  else if (isFriend) action = `<button class="btn btn--ghost" disabled>🤝 Déjà frère d'armes</button>`;
  else action = `<button class="btn btn--primary" id="pcAdd">➕ AJOUTER EN AMI</button>`;

  openModal(`
    <button class="pw-modal__close" data-close>✕</button>
    <p class="pw-modal__eyebrow">// FICHE SOLDAT</p>
    <div class="gg-pcard">
      <div class="gg-pcard__badge">${ggInsignia(rk.gradeIndex, rk.tier)}</div>
      <div class="gg-pcard__id">
        <span class="gg-dossier__title">${esc(t.name)}</span>
        <span class="gg-pcard__pseudo">${esc(p.pseudo || "Recrue")}</span>
        <span class="gg-dossier__grade">${rk.grade}</span>
      </div>
    </div>
    <div class="gg-dossier__stats gg-pcard__stats">
      ${stats.map(([l, v]) => `<div class="gg-stat"><div class="gg-stat__num">${v}</div><span class="gg-stat__lbl">${l}</span></div>`).join("")}
    </div>
    <div class="pw-modal__actions">
      ${action}
      <button class="btn btn--ghost" data-close>Fermer</button>
    </div>`);

  const add = $("pcAdd");
  if (add) add.addEventListener("click", async () => {
    add.disabled = true;
    try {
      const res = await FB.sendFriendRequest(p.uid, profile.pseudo);
      if (res && res.mutual) {
        if (!profile.friends.includes(p.uid)) profile.friends.push(p.uid);
        saveProfile();
        toast(p.pseudo + " t'avait déjà invité — vous êtes frères d'armes ! 🤝");
      } else {
        toast("Demande envoyée à " + p.pseudo + " 📨");
      }
      closeModal(); LB.rows = null; renderLeaderboard();
    } catch (e) {
      add.disabled = false;
      toast((e && e.message) ? e.message : "Impossible d'envoyer la demande.");
    }
  });
}

/* ============================================================
   INSTRUCTION (tutoriel nouveaux arrivants)
   ------------------------------------------------------------
   Ouvert automatiquement à la 1re connexion (profile.tutoSeen),
   rejouable à tout moment via le bouton 📖 INSTRUCTION du HUD.
   ============================================================ */
const TUTO_STEPS = [
  {
    icon: "🍲",
    title: "BIENVENUE À LA POPOTE",
    body: "POPOTE WAR, c'est un duel de QCM militaire. Tu affrontes une autre recrue (ou un bot) sur une série de questions. Celui qui remporte le plus de <b>manches</b> rafle le pot.<br><br>Tu démarres avec <b>500 MASSACRE Coins</b>. C'est ta caisse : tu mises avec, tu achètes avec.",
  },
  {
    icon: "🪙",
    title: "LA MISE — DOUBLE OU RIEN",
    body: "Avant chaque partie tu choisis ta <b>mise</b> (de 50 à 1000 coins). Elle est retirée de ta caisse au lancement.<br><br>• <b>Victoire</b> → tu récupères le double.<br>• <b>Défaite</b> → la mise reste sur la table.<br>• <b>Égalité</b> → tu es remboursé.<br><br>Mise petit tant que tu apprends, recrue.",
  },
  {
    icon: "⏱️",
    title: "RÉPONDRE VITE = MARQUER PLUS",
    body: "Chaque question dure <b>12 secondes</b>. Tu marques 100 points de base pour une bonne réponse, <b>+100 max selon ta vitesse</b>.<br><br>Celui qui marque le plus sur une question gagne la <b>manche</b>. À la fin, c'est le total des manches qui décide du vainqueur — pas le score brut.",
  },
  {
    icon: "🎖️",
    title: "LES PALIERS DE DIFFICULTÉ",
    body: "Les 238 questions sont classées en 5 paliers : <b>RECRUE, SOLDAT, SOUS-OFF, OFFICIER, ÉLITE</b>.<br><br>Plus ton grade monte, plus les questions qu'on te sert sont dures — mais elles rapportent aussi plus : jusqu'à <b>×2 points</b> au palier ÉLITE. Le palier de chaque question s'affiche au-dessus d'elle.",
  },
  {
    icon: "🎒",
    title: "L'ARSENAL — TES 3 OBJETS",
    body: "Achète-les à <b>l'Intendance</b> avec tes coins, puis dégaine-les en plein match :<br><br>🔫 <b>Fusil</b> — annule une manche gagnée par l'adversaire. Attention, il peut riposter.<br>🪖 <b>Casque</b> — bloque le prochain tir adverse.<br>⌚ <b>Montre</b> — +5 secondes sur le chrono en cours.",
  },
  {
    icon: "🎟️",
    title: "MONTER EN GRADE & ENCAISSER",
    body: "Chaque victoire te donne des <b>galons</b> (14 grades, du Soldat au Colonel) et de l'<b>XP</b> (chaque niveau = +50 coins bonus).<br><br>À l'Intendance, tu échanges tes coins contre de <b>vrais codes promo</b> valables sur la boutique MASSACRE. Et tu as droit à <b>un tour de roue gratuit par jour</b>.<br><br>Rompez. 🫡",
  },
];

function openTuto(step) {
  step = clamp(step | 0, 0, TUTO_STEPS.length - 1);
  const s = TUTO_STEPS[step], last = step === TUTO_STEPS.length - 1;
  const dots = TUTO_STEPS.map((_, i) =>
    `<i class="pw-tuto__dot${i === step ? " pw-tuto__dot--on" : ""}" data-goto="${i}"></i>`).join("");
  openModal(`
    <button class="pw-modal__close" data-close>✕</button>
    <p class="pw-modal__eyebrow">// INSTRUCTION — ÉTAPE ${step + 1}/${TUTO_STEPS.length}</p>
    <div class="pw-tuto__icon">${s.icon}</div>
    <h2 class="pw-modal__title">${s.title}</h2>
    <p class="pw-modal__text pw-tuto__body">${s.body}</p>
    <div class="pw-tuto__dots">${dots}</div>
    <div class="pw-modal__actions">
      ${step > 0 ? `<button class="btn btn--ghost" id="tutoPrev">← Retour</button>` : ""}
      <button class="btn btn--primary" id="tutoNext">${last ? "🫡 J'AI COMPRIS, CHEF" : "Suivant →"}</button>
      ${!last ? `<button class="btn btn--ghost" id="tutoSkip">Passer</button>` : ""}
    </div>`);
  const nx = $("tutoNext"), pv = $("tutoPrev"), sk = $("tutoSkip");
  if (nx) nx.addEventListener("click", () => last ? finishTuto() : openTuto(step + 1));
  if (pv) pv.addEventListener("click", () => openTuto(step - 1));
  if (sk) sk.addEventListener("click", finishTuto);
  dom.modalBox.querySelectorAll("[data-goto]").forEach((d) =>
    d.addEventListener("click", () => openTuto(+d.dataset.goto)));
}
function finishTuto() {
  profile.tutoSeen = true; saveProfile();
  closeModal();
  toast("Instruction terminée. À toi de jouer, recrue. 🫡");
}
// Appelé après l'entrée dans le jeu : n'ouvre le tuto qu'une seule fois par compte.
function maybeOpenTuto() {
  if (!profile || profile.tutoSeen) return;
  setTimeout(() => { if (dom.modal.hidden) openTuto(0); }, 700);
}

/* ---------- caisse vide ---------- */
function popupBroke() {
  const canDaily = Date.now() - profile.lastDaily >= DAY;
  openModal(`
    <button class="pw-modal__close" data-close>✕</button>
    <p class="pw-modal__eyebrow">// INTENDANCE — RUPTURE</p>
    <h2 class="pw-modal__title">CAISSE VIDE, SOLDAT 💸</h2>
    <p class="pw-modal__text">Plus assez de coins pour miser. Recharge les batteries :</p>
    <div class="pw-modal__actions">
      ${canDaily ? `<button class="btn btn--primary" id="claimDaily">🎁 +200 COINS (1×/jour)</button>` : `<button class="btn btn--ghost" disabled>Bonus du jour déjà pris</button>`}
      <button class="btn btn--olive" id="brokeWheel">🎡 TENTER LA ROUE</button>
    </div>
    <p class="pw-modal__text" style="margin-top:1rem">…ou équipe-toi directement à la boutique :</p>
    <div class="pw-modal__actions"><a class="btn btn--ghost" href="collection-50.html">🛒 VOIR LA BOUTIQUE</a></div>`);
  const cd = $("claimDaily"); if (cd) cd.addEventListener("click", async () => {
    // +200 coins réglés par le SERVEUR (claimDailyCoins) : le client ne crédite plus.
    if (FB) {
      const res = await FB.claimDailyCoins();
      if (res.ok) { profile.lastDaily = Date.now(); profile.coins = res.data.coins; renderHud(); toast("+200 coins, recrue. À la mise ! 🪙"); closeModal(); return; }
      if (!res.unavailable) { toast((res.error && res.error.message) || "Bonus du jour indisponible."); return; }
    }
    profile.lastDaily = Date.now(); profile.coins += 200; saveProfile(); renderHud(); toast("+200 coins, recrue. À la mise ! 🪙"); closeModal();
  });
  const bw = $("brokeWheel"); if (bw) bw.addEventListener("click", () => { closeModal(); openWheel(false); });
}

/* ============================================================
   NAVIGATION (fluide)
   ============================================================ */
const VIEWS = ["viewLobby", "viewWait", "viewMatch", "viewResult", "viewWeek", "viewCareer", "viewDossier", "viewRank", "viewShop"];
let currentView = null;

/* Ancres partageables : popote-war.html#profil ouvre directement l'onglet.
   Sert notamment à profils.html, qui redirige ici — sans ça, l'utilisateur
   arrivant par l'icône 👤 du site atterrissait sur le lobby et devait
   chercher son profil lui-même. */
const HASH_VIEWS = {
  profil: "viewDossier", dossier: "viewDossier",
  classement: "viewRank", rang: "viewRank",
  boutique: "viewShop", intendance: "viewShop",
  carriere: "viewCareer", grades: "viewCareer",
  ordinaire: "viewWeek",
  salons: "viewLobby", lobby: "viewLobby",
};
function viewFromHash() {
  try {
    const h = (location.hash || "").replace(/^#/, "").toLowerCase();
    return HASH_VIEWS[h] || null;
  } catch (e) { return null; }
}
function showView(id) {
  // On ne coupe la liaison temps réel QUE si la partie n'est pas en cours.
  // Avant, un simple clic sur un onglet pendant un match coupait l'abonnement
  // Firestore : l'hôte cessait de faire avancer les manches et l'adversaire
  // restait gelé sur « en attente », mise déjà débitée et jamais rendue.
  const leavingViews = ["viewLobby", "viewWeek", "viewCareer", "viewDossier", "viewRank", "viewShop"];
  if (RT && leavingViews.includes(id)) {
    const live = RT.room && RT.room.status === "playing" && !RT.settled;
    if (live) { askAbandon(id); return; }
    rtCleanup();
  }
  if (id !== "viewMatch" && MATCH && MATCH.timeout) { clearTimeout(MATCH.timeout); MATCH.locked = true; }

  const apply = () => {
    VIEWS.forEach((v) => { const el = $(v); if (!el) return; const on = v === id; el.hidden = !on; el.classList.toggle("gg-view--active", on); });
    document.querySelectorAll(".gg-tab").forEach((t) => t.classList.toggle("gg-tab--active", t.dataset.view === id));
    if (id === "viewShop") { renderShop(); pwTrack("shop_open"); }
    if (id === "viewCareer") { renderProgress(); renderLadder(); }
    if (id === "viewWeek") renderWeekly();
    if (id === "viewDossier") renderDossier();
    // CACHE 2 MIN : recharger ~1250 documents à CHAQUE passage sur l'onglet
    // était le premier poste de lectures Firestore du jeu (~85 % du total).
    // Un classement à 2 minutes près est indiscernable pour le joueur.
    if (id === "viewRank") {
      if (!LB.rows || Date.now() - (LB.loadedAt || 0) > 120000) LB.rows = null;
      renderLeaderboard();
    }
    if (id === "viewLobby") { renderArmyPicker(); renderSalons(); renderQuickStakes(); }
    if (id === "viewMatch") { renderMatchRW(); renderMatchArsenal(); }
  };

  // On n'anime — et on ne recale le scroll — QUE lorsqu'on change réellement
  // d'écran. rtRenderRound() rappelle showView("viewMatch") à CHAQUE snapshot
  // Firestore, et renderHud/renderWeekly en déclenchent d'autres : sans ce
  // garde, le fondu se rejouait en boucle ET scrollToTop() ramenait le joueur
  // en haut dès qu'il essayait de descendre. C'est ce qui rendait la page
  // « impossible à faire défiler vers le bas ».
  const samePage = currentView === id;
  currentView = id;
  if (samePage) { apply(); return; }
  APP.transition(() => { apply(); scrollToTop(); });
}

/* Recalage du scroll après changement d'écran.
   Appelé DEPUIS la mutation du DOM : mesuré avant, il lisait l'ancienne vue et
   le défilement démarrait pendant la capture de l'instantané de transition,
   ce qui décalait visiblement l'animation. */
function scrollToTop() {
  // Sur mobile la barre d'onglets est EN BAS : se recaler dessus enverrait le
  // joueur en bas de page à chaque changement d'écran.
  const bottomTabs = window.matchMedia("(max-width: 860px)").matches;
  if (bottomTabs) {
    const main = document.querySelector(".gg-main");
    const top = main ? main.getBoundingClientRect().top + window.scrollY - 8 : 0;
    if (window.scrollY > top + 30) window.scrollTo({ top, behavior: "smooth" });
  } else {
    const tabs = document.querySelector(".gg-tabs");
    if (tabs) { const top = tabs.getBoundingClientRect().top + window.scrollY - 64; if (Math.abs(window.scrollY - top) > 30) window.scrollTo({ top, behavior: "smooth" }); }
  }
}

/* ============================================================
   ÉCOUTEURS
   ============================================================ */
function bind() {
  startEmbers(dom.ggEmbers, 45); startEmbers(dom.authEmbers, 40);

  dom.btnAuthGo.addEventListener("click", authGo);
  dom.authMat.addEventListener("keydown", (e) => { if (e.key === "Enter") authGo(); });

  // (Le bouton clair/sombre vit dans le HUD, géré par délégation ci-dessous.)
  dom.btnAuthToggle.addEventListener("click", () => { authMode = authMode === "signup" ? "login" : "signup"; renderAuthMode(); });

  dom.ggHud.addEventListener("click", (e) => {
    if (e.target.closest("#btnWheel")) openWheel(false);
    else if (e.target.closest("#btnTuto")) openTuto(0);
    else if (e.target.closest("#btnThemeMode")) toggleMode();
  });

  document.querySelectorAll(".gg-tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));

  dom.quickStakes.addEventListener("click", (e) => { const b = e.target.closest(".pw-stake"); if (!b || b.disabled) return; selectedStake = +b.dataset.stake; renderQuickStakes(); renderSalons(); });
  dom.waitStakes.addEventListener("click", (e) => { const b = e.target.closest(".pw-stake"); if (!b || b.disabled || !WAIT) return; WAIT.stake = +b.dataset.stake; renderWaitStakes(); });

  $("btnQuick").addEventListener("click", () => { if (FB) return rtQuick(); const gi = rankFromRP(profile.rp).gradeIndex; startMatch({ name: pick(BOT_NAMES), gradeIndex: gi }, 5, selectedStake); });
  $("btnCreate").addEventListener("click", () => FB ? rtCreate() : openWait());
  $("btnJoin").addEventListener("click", () => { const c = ($("joinCode").value || "").trim(); if (!c) { toast("Entre un code de salon, recrue."); return; } if (FB) return rtJoinByCode(c.toUpperCase()); if (profile.coins < selectedStake) return popupBroke(); const gi = rankFromRP(profile.rp).gradeIndex; toast("Salon " + c.toUpperCase() + " rejoint ⚔️"); startMatch({ name: pick(BOT_NAMES), gradeIndex: gi }, 5, selectedStake); });
  $("btnRefresh").addEventListener("click", () => { freshSalons(); toast("Salons actualisés ↻"); });
  // Anti-rebond : on ne reconstruit pas toute la liste à chaque frappe.
  let salonSearchTimer;
  dom.salonSearch.addEventListener("input", () => {
    clearTimeout(salonSearchTimer);
    salonSearchTimer = setTimeout(renderSalons, 150);
  });
  dom.salonList.addEventListener("click", (e) => { const b = e.target.closest(".gg-salon__join"); if (!b) return; if (FB) return rtJoinByCode(b.dataset.code); const stake = +b.dataset.stake; if (profile.coins < stake) return popupBroke(); startMatch({ name: b.dataset.name, gradeIndex: +b.dataset.grade }, +b.dataset.rounds, stake); });

  document.querySelectorAll("#viewWait .gg-chip").forEach((c) => c.addEventListener("click", () => { if (!WAIT) return; WAIT.rounds = +c.dataset.rounds; document.querySelectorAll("#viewWait .gg-chip").forEach((x) => x.classList.toggle("gg-chip--active", x === c)); }));
  $("btnInvite").addEventListener("click", () => WAIT && copyText(WAIT.code));
  $("btnLaunch").addEventListener("click", () => { if (!WAIT) return; startMatch(WAIT.foe, WAIT.rounds, WAIT.stake); });
  $("btnLeaveWait").addEventListener("click", () => showView("viewLobby"));

  $("btnRematch").addEventListener("click", () => {
    if (FB) return rtQuick();
    const m = MATCH || LAST_MATCH;   // MATCH est nul après la fin d'un match
    if (m) startMatch(m.foe, m.rounds, m.stake); else showView("viewLobby");
  });
  $("btnBackLobby").addEventListener("click", () => { freshSalons(); showView("viewLobby"); });

  dom.shopGrid.addEventListener("click", (e) => { const b = e.target.closest(".gg-buy"); if (b && !b.disabled) buy(+b.dataset.i); });
  dom.ownedCodes.addEventListener("click", (e) => {
    const cp = e.target.closest(".gg-code__copy"); if (cp) { copyText(cp.dataset.code); return; }
    const del = e.target.closest(".gg-code__del"); if (del) deleteCode(del.dataset.del);
  });

  if (dom.matchArsenal) dom.matchArsenal.addEventListener("click", (e) => {
    const b = e.target.closest(".gg-arm-btn"); if (!b || b.disabled) return;
    const key = b.dataset.item;
    // Condition STRICTEMENT identique à renderMatchArsenal et renderMatchRW
    // (`RT && RT.room`). Avec `RT` seul, un salon encore en attente envoyait le
    // clic vers les fonctions RT, qui sortaient sans le moindre message : le
    // bouton semblait mort. C'est précisément ce qu'on cherche à éliminer.
    // Les 4 nouveaux objets ont une implémentation UNIQUE qui gère les deux
    // modes en interne : pas de duplication solo/en-ligne à maintenir.
    if (key === "jumelles") return useJumelles();
    if (key === "ration") return useRation();
    if (key === "fumigene") return useFumigene();
    if (key === "grenade") return useGrenade();
    if (RT && RT.room) { if (key === "fusil") useFusilRT(); else if (key === "casque") useCasqueRT(); else useMontreRT(); }
    else { if (key === "fusil") useFusilLocal(); else if (key === "casque") useCasqueLocal(); else useMontreLocal(); }
  });

  const burger = $("burger");
  if (burger) burger.addEventListener("click", () => { const nav = document.querySelector(".nav"); const open = nav.style.display === "flex"; nav.style.display = open ? "none" : "flex"; if (!open) Object.assign(nav.style, { position: "absolute", flexDirection: "column", top: "100%", left: "0", right: "0", background: "var(--ink-soft)", padding: "1rem 1.2rem", borderBottom: "1px solid var(--line)" }); });
}

/* ============================================================
   1v1 TEMPS RÉEL (Firebase Firestore) — actif seulement si FB présent
   Hôte autoritaire : il fait avancer les manches. Règlement côté client
   (plan gratuit). Pour un anti-triche total des coins -> Cloud Function (Blaze).
   ============================================================ */
let RT = null;

function rtCleanup() {
  if (RT) {
    if (RT.unsub) { try { RT.unsub(); } catch (e) { console.warn("[PW] unsub", e); } }
    if (RT.timer) clearInterval(RT.timer);
    if (RT.hostTimer) clearTimeout(RT.hostTimer);
    if (RT.readyTimer) clearTimeout(RT.readyTimer);
  }
  cancelCountdown(); // un décompte en cours ne doit pas survivre à la partie
  RT = null;
}

async function rtRefreshSalons() {
  try {
    const gi = rankOf(profile).gradeIndex, me = FB.uid();
    const rooms = await FB.listOpenRooms(gi, selectedArmy);
    // ASSAINISSEMENT : ces champs sont écrits librement par l'hôte du salon.
    // Sans bornage, un joueur pouvait y placer du HTML (le code du salon et le
    // nombre de manches finissaient dans la page sans échappement) ou une
    // valeur hors limites faisant planter le lobby de tout le monde
    // (ex. un grade inexistant → GRADES[gi] indéfini).
    SALONS = rooms.filter((r) => r.hostUid !== me).map((r) => ({
      code: sStr(r.code, 16),
      host: sStr(r.hostName || "Recrue", 24),
      gradeIndex: sNum(r.hostGrade, 0, MAX_GRADE, 0),
      tierIndex: 2,
      rounds: sNum(r.rounds, 1, 20, 5),
      stake: sNum(r.stake, 0, 1000000, 100),
      army: sPick(r.army, ["tout", "terre", "air", "marine", "gendarmerie", "police", "pompier"], "tout"),
    }));
    renderSalons();
  } catch (e) {
    // Un lobby vide et une erreur de permission/index se ressemblaient trait
    // pour trait. On distingue désormais les deux.
    console.warn("[PW] listOpenRooms", e);
    SALONS = []; renderSalons();
    if (e && (e.code === "failed-precondition" || /index/i.test(e.message || ""))) {
      toast("Index Firestore manquant — lance : firebase deploy --only firestore");
    } else if (e && e.code === "permission-denied") {
      toast("Règles Firestore non déployées — firebase deploy --only firestore:rules");
    }
  }
}

async function rtQuick() {
  // Verrou anti double-clic : deux MATCH RAPIDE simultanés créaient deux
  // parcours concurrents (salon fantôme + abonnement fuité, mise débitée à
  // l'insu du joueur). Un seul lancement à la fois.
  if (STARTING) return;
  if (RT && RT.room && RT.room.status === "playing" && !RT.settled) { showView("viewMatch"); return; }
  STARTING = true;
  try {
    if (profile.coins < selectedStake) return popupBroke();
    // Grade PAYÉ (rankOf), pas seulement éligible (rankFromRP) : les salons sont
    // étiquetés avec le grade payé de l'hôte (rtCreateInner/rtRefreshSalons).
    // Chercher par grade éligible faisait rater l'appariement pour un joueur
    // qui a les galons mais n'a pas encore validé sa promotion.
    const gi = rankOf(profile).gradeIndex;
    toast("Recherche d'un adversaire…");
    const open = await FB.listOpenRooms(gi, selectedArmy), me = FB.uid();
    // APPARIEMENT — LA MISE EST SACRÉE. On ne rejoint JAMAIS un salon dont la mise
    // diffère de celle choisie par le joueur : sinon quelqu'un qui a sélectionné
    // 50 mais possède 500 coins pouvait être envoyé dans un salon à 500 et perdre
    // 500 (le bug signalé). On croise en priorité un adversaire de MÊME GRADE
    // (questions calées sur le grade), sinon n'importe quel grade — mais TOUJOURS
    // à la mise EXACTEMENT choisie. Aucun salon à cette mise → on crée le sien.
    const ok = (r) => r.hostUid !== me && (r.stake || 0) === selectedStake;
    const room =
      open.find((r) => ok(r) && r.hostGrade === gi) ||
      open.find((r) => ok(r));
    if (room) await rtJoinByCodeInner(room.code); else await rtCreateInner(selectedStake);
  } catch (e) { toast("Réseau : impossible de chercher un salon."); }
  finally { STARTING = false; }
}

async function rtCreate(stake) {
  // Même verrou qu'en solo : sans lui, un double-clic créait deux salons.
  if (STARTING) return;
  STARTING = true;
  try { return await rtCreateInner(stake); }
  catch (e) { console.warn("[PW] création de salon", e); toast("Impossible de créer le salon."); }
  finally { STARTING = false; }
}

async function rtCreateInner(stake) {
  stake = stake || selectedStake;
  if (profile.coins < stake) return popupBroke();
  const rk = rankOf(profile); let rounds = profile.lastRounds || 5;
  // L'hôte compose les questions du salon : elles doivent être chargées avant.
  await ensureQuestions(selectedArmy);
  // Palier calé sur le plus haut grade des deux joueurs au moment de la création :
  // l'hôte ne connaît pas encore l'invité, on part donc de son propre grade.
  const qs = pickQuestions(rounds, rk.gradeIndex, selectedArmy).map((q) => {
    const opts = q.options.map((t, i) => ({ t, ok: i === q.correct })); shuffle(opts);
    return { q: q.q, tag: q.tag, explain: q.explain, d: q.d, opts };
  });
  // On n'annonce JAMAIS plus de manches qu'il n'y a de questions : sinon le
  // salon référencerait une question inexistante en fin de partie (gel).
  if (!qs.length) { toast("Pas assez de questions pour cette armée, recrue."); return; }
  if (qs.length < rounds) rounds = qs.length;
  try {
    const res = await FB.createRoom({ stake, rounds, gradeIndex: rk.gradeIndex, pseudo: profile.pseudo, army: selectedArmy, questions: qs });
    // Les questions sont maintenant DANS le salon dès la création : l'invité
    // peut donc lancer la partie sans attendre l'hôte (voir createRoom).
    rtCleanup(); // jamais deux abonnements RT en vie (fuite = actions sur le mauvais salon)
    RT = { roomId: res.id, role: "host", rounds, stake, lastRound: -1, answered: -1, revealed: -1, resolving: -1, escrowed: false, settled: false, pendingQuestions: qs };
    rtWaitModal(res.code);
    RT.unsub = FB.watchRoom(res.id, onRoomSnap);
  } catch (e) { toast("Impossible de créer le salon."); }
}

async function rtJoinByCode(code) {
  // Même verrou que rtQuick/rtCreate : un double-clic sur REJOINDRE lançait
  // deux jointures concurrentes.
  if (STARTING) return;
  STARTING = true;
  try { return await rtJoinByCodeInner(code); }
  finally { STARTING = false; }
}

async function rtJoinByCodeInner(code) {
  const rk = rankOf(profile);   // grade PAYÉ affiché à l'adversaire
  try {
    // On VÉRIFIE LA MISE AVANT de rejoindre. Avant, on rejoignait puis on
    // sortait si la mise était trop élevée : le salon restait marqué "playing"
    // avec un invité fantôme, et l'hôte jouait seul contre le vide.
    const peek = await FB.peekRoom(code);
    if (!peek) return toast("Salon introuvable.");
    if (peek.guestUid || peek.status !== "waiting") return toast("Salon déjà plein.");
    if (profile.coins < (peek.stake || 0)) {
      return toast("Mise trop élevée pour ta caisse (" + peek.stake + " coins).");
    }
    // Les questions du salon ont été composées par l'HÔTE selon SON armée.
    // Rejoindre par code reste autorisé (c'est le cas d'usage entre amis),
    // mais on prévient : sinon un joueur Marine se retrouve sans comprendre
    // avec des questions Terre.
    const ra = peek.army || "tout";
    if (ra !== selectedArmy) {
      toast("⚠️ Salon " + armyById(ra).short + " — les questions seront celles de cette armée.");
    }

    const room = await FB.joinRoom(code, { pseudo: profile.pseudo, gradeIndex: rk.gradeIndex });
    rtCleanup(); // jamais deux abonnements RT en vie
    RT = { roomId: room.id, role: "guest", rounds: room.rounds, stake: room.stake, lastRound: -1, answered: -1, revealed: -1, resolving: -1, escrowed: false, settled: false };
    toast("Salon rejoint ⚔️");
    // Retour visuel immédiat : sans ça l'invité restait sur le lobby, où le
    // moindre clic sur un onglet le sortait de la partie.
    rtJoinWaitModal(room.hostName || "l'adversaire");
    RT.unsub = FB.watchRoom(room.id, onRoomSnap);

    // LANCEMENT PILOTÉ PAR L'INVITÉ. Les questions sont déjà dans le salon
    // (écrites à la création), donc on n'attend plus que l'hôte réagisse : on
    // démarre la manche 0 nous-mêmes. C'est LE correctif du bug « je rejoins
    // mais la partie ne se lance pas » : avant, si l'onglet de l'hôte dormait,
    // rien ne partait. L'hôte lance aussi de son côté ; les deux écritures sont
    // gardées par `round === -1`, la première l'emporte.
    FB.updateRoom(room.id, {
      round: 0, roundStartAt: Date.now() + PREP_MS, prepUntil: Date.now() + PREP_MS,
    }).catch((e) => console.warn("[PW] lancement invité", e));

    // Garde-fou réseau : si dans 10 s la manche 0 n'est pas là (double échec
    // d'écriture), on ne laisse pas l'invité coincé « en attente » — on le
    // sort proprement et on lui rend la main. Sa mise n'a pas encore été
    // débitée (l'escrow n'a lieu qu'une fois en partie), rien n'est perdu.
    const joinedRoomId = room.id;
    setTimeout(() => {
      if (RT && RT.roomId === joinedRoomId && (!RT.room || (RT.room.round == null || RT.room.round < 0))) {
        toast("L'hôte ne répond pas — salon quitté, réessaie.");
        if (RT.roomId) FB.closeRoom(RT.roomId);
        rtCleanup(); closeModal(); showView("viewLobby");
      }
    }, 10000);
  } catch (e) {
    console.warn("[PW] rtJoinByCode", e);
    toast((e && e.message) || "Salon introuvable ou déjà plein.");
  }
}

/* Abandon d'une partie en ligne.
   Indispensable : sans porte de sortie, un joueur dont l'adversaire a fermé son
   onglet restait prisonnier de la vue Match (tous les onglets bloqués), et seul
   un rechargement de page le libérait — en lui laissant sa mise perdue. */
function askAbandon(targetView) {
  openModal(
    '<button class="pw-modal__close" data-close>✕</button>' +
    '<p class="pw-modal__eyebrow">// PARTIE EN COURS</p>' +
    '<h2 class="pw-modal__title">ABANDONNER ?</h2>' +
    '<p class="pw-modal__text">Tu quittes le combat en cours. Ta mise de <b>' +
      (RT ? RT.stake : 0) + ' coins</b> est perdue, et l\'adversaire est déclaré vainqueur.</p>' +
    '<div class="pw-modal__actions">' +
      '<button class="btn btn--ghost" id="abYes">⏏ ABANDONNER</button>' +
      '<button class="btn btn--primary" data-close>← RESTER AU COMBAT</button>' +
    '</div>');
  const y = $("abYes");
  if (y) y.addEventListener("click", () => {
    doAbandon();
    closeModal();
    showView(targetView || "viewLobby");
  });
}

function doAbandon() {
  if (!RT) return;
  const room = RT.room || {};
  // Abandon TRANSACTIONNEL : ne s'applique que si la partie est réellement
  // encore en cours côté serveur (l'état local peut être périmé de quelques
  // centaines de ms — un abandon tardif écrasait le vainqueur légitime).
  if (RT.roomId && room.status === "playing") {
    const foeUid = RT.role === "host" ? room.guestUid : room.hostUid;
    FB.abandonRoom(RT.roomId, foeUid, FB.uid())
      .catch((e) => console.warn("[PW] abandon", e));
  }
  // La mise a déjà été retirée (escrow) : on l'acte comme une défaite.
  if (RT.escrowed) {
    profile.losses++; profile.streak = 0; profile.played++;
    saveProfile(); renderHud(); publishMe();
  }
  RT.settled = true;
  cancelCountdown();
  rtCleanup();
  toast("Combat abandonné. Ta mise reste sur la table.");
}

// Écran d'attente côté INVITÉ, entre le join et le lancement par l'hôte.
function rtJoinWaitModal(hostName) {
  openModal(
    '<p class="pw-modal__eyebrow">// SALON REJOINT</p>' +
    '<h2 class="pw-modal__title">EN ATTENTE DE ' + esc(String(hostName).toUpperCase()) + '</h2>' +
    '<div class="pw-prep__spinner"></div>' +
    '<p class="pw-modal__text">Tu es dans le salon. La partie démarre dès que l\'hôte est prêt…</p>' +
    '<div class="pw-modal__actions"><button class="btn btn--ghost" id="rtLeaveJoin">QUITTER LE SALON</button></div>');
  const lv = $("rtLeaveJoin");
  if (lv) lv.addEventListener("click", () => {
    if (RT && RT.roomId) FB.closeRoom(RT.roomId);
    rtCleanup(); closeModal(); showView("viewLobby");
  });
}

function rtWaitModal(code) {
  openModal(
    '<button class="pw-modal__close" id="rtCancel">✕</button>' +
    '<p class="pw-modal__eyebrow">// SALON 1v1 — EN ATTENTE</p>' +
    '<h2 class="pw-modal__title">' + esc(code) + '</h2>' +
    '<p class="pw-modal__text">Donne ce code à un pote : il le tape dans <b>REJOINDRE</b>. En attente d\'un adversaire…</p>' +
    '<div class="pw-modal__actions"><button class="btn btn--primary" id="rtInvite">🔗 COPIER LE CODE</button><button class="btn btn--ghost" id="rtCancel2">ANNULER</button></div>');
  const inv = $("rtInvite"); if (inv) inv.addEventListener("click", () => copyText(code));
  [$("rtCancel"), $("rtCancel2")].forEach((b) => b && b.addEventListener("click", rtCancelRoom));
}
function rtCancelRoom() {
  // On SUPPRIME le salon au lieu de le marquer "done" : un document qui traîne
  // reste comptabilisé dans la page de résultats et finit par masquer les vrais
  // salons ouverts.
  if (RT && RT.role === "host" && RT.roomId) FB.closeRoom(RT.roomId);
  rtCleanup(); closeModal(); showView("viewLobby");
}

function onRoomSnap(room) {
  if (!RT) return;
  // SALON SUPPRIMÉ (adversaire qui quitte avant le début, nettoyage…) : avant,
  // l'écran restait gelé en silence avec la mise affichée débitée. On informe,
  // on rend l'affichage de la mise (rien n'a bougé côté serveur) et on rentre.
  if (room === null) {
    if (RT.settled) { rtCleanup(); return; }
    if (RT.escrowed) { profile.coins += RT.stake; renderHud(); }
    RT.settled = true;
    rtCleanup(); closeModal();
    toast("L'adversaire a quitté le salon — mise rendue. 🎖️");
    showView("viewLobby");
    return;
  }
  RT.room = room;
  // l'hôte démarre la 1re manche dès que l'invité arrive
  if (RT.role === "host" && room.status === "playing" && room.round === -1 && room.guestUid) {
    // Chemin de SECOURS : normalement l'invité a déjà lancé la manche 0 lui-même
    // (voir rtJoinByCode). Si son écriture a échoué, l'hôte prend le relais.
    // Les questions sont déjà dans le salon depuis la création : inutile de les
    // réécrire (grosse écriture évitée). Gardé par `round === -1` : si l'invité
    // a déjà démarré, ce bloc ne s'exécute pas.
    FB.updateRoom(RT.roomId, {
      round: 0, roundStartAt: Date.now() + PREP_MS, prepUntil: Date.now() + PREP_MS,
    }).catch((e) => { console.warn("[PW] lancement manche 0 (secours hôte)", e); });
    return;
  }
  // Ferme l'écran d'attente au BON moment selon le rôle.
  // L'hôte attend un adversaire -> on ferme quand l'invité arrive.
  // L'invité attend le lancement -> on ferme quand la manche 0 est écrite.
  // (Fermer sur `guestUid` côté invité fermait la modale ~100 ms après son
  // propre join, donc AVANT le lancement : il se retrouvait sur le lobby, sans
  // bouton pour sortir, et bloqué par le garde de showView si l'hôte partait.)
  if (!dom.modal.hidden) {
    const ready = RT.role === "host" ? !!room.guestUid : room.round >= 0;
    if (ready) closeModal();
  }
  if (room.status === "waiting") return;
  if (room.status === "done") { rtShowResult(room); return; }
  if (room.status === "playing" && room.round >= 0) {
    rtEscrowOnce();
    rtRenderRound(room);
    rtHostMaybeAdvance(room);
  }
}

function rtEscrowOnce() {
  if (RT.escrowed) return;
  RT.escrowed = true;
  // Débit OPTIMISTE pour l'affichage seulement : la mise est réellement retirée
  // par le serveur (settleMatch) en fin de match. Le client ne persiste plus les
  // coins (cf. firestore.rules) — d'où l'absence de saveProfile ici.
  profile.coins -= RT.stake; renderHud();
}

function rtRenderRound(room) {
  // Pendant le compte à rebours, un snapshot Firestore arrivant entre-temps
  // aurait rendu la question et lancé le chrono de 12 s SOUS l'overlay : le
  // joueur perdait jusqu'à 5 s sans pouvoir cliquer.
  if (RT.prepping) return;
  const role = RT.role;
  const foeName = sStr(role === "host" ? (room.guestName || "Adversaire") : room.hostName, 24);
  // Borné : c'était le dernier champ distant non assaini. Un invité écrivant
  // `guestGrade: 999` faisait planter l'écran de match de l'hôte
  // (GRADES[999] indéfini), ce qui gelait la partie.
  const foeGrade = sNum(role === "host" ? room.guestGrade : room.hostGrade, 0, MAX_GRADE, 0);
  const myRk = rankOf(profile);
  dom.meBadge.innerHTML = ggInsignia(myRk.gradeIndex, myRk.tier); dom.meName.textContent = profile.pseudo;
  dom.foeBadge.innerHTML = ggInsignia(foeGrade, "Or"); dom.foeName.textContent = foeName;
  dom.matchPot.textContent = "POT " + (RT.stake * 2);
  const _sc = room.scores || { host: 0, guest: 0 };
  bumpScore(dom.meScore, role === "host" ? (_sc.host || 0) : (_sc.guest || 0));
  bumpScore(dom.foeScore, role === "host" ? (_sc.guest || 0) : (_sc.host || 0));
  showView("viewMatch");

  const R = room.round, q = (room.questions || [])[R];

  // GARDE anti-crash : un salon dont les questions sont incomplètes (moins de
  // manches que prévu, écriture partielle) rendait q indéfini → q.tag/q.opts
  // levaient une TypeError et gelaient l'écran de match. On sort proprement.
  if (R >= 0 && !q) {
    console.warn("[PW] question manquante manche", R, "/", (room.questions || []).length);
    toast("Salon corrompu (question manquante) — retour au lobby.");
    rtCleanup(); showView("viewLobby"); return;
  }

  /* --- POIGNÉE DE MAIN DE DÉPART ---
     Chacun signale « je suis là » dès qu'il reçoit la manche 0, puis attend
     que l'autre en fasse autant. Le compte à rebours ne démarre que quand les
     deux ont répondu : les deux joueurs partent donc ensemble, à un aller-retour
     réseau près, au lieu que le plus rapide attaque pendant que l'autre charge
     encore sa page. */
  if (R === 0 && !RT.prepDone) {
    const ready = room.ready || {};
    if (!RT.readySent) {
      RT.readySent = true;
      FB.updateRoom(RT.roomId, { ["ready." + role]: true })
        .catch((e) => { console.warn("[PW] ready", e); RT.readySent = false; });
    }
    dom.qTag.textContent = "// PRÉPARATION";
    if (dom.qDiff) dom.qDiff.innerHTML = "";
    dom.qOptions.innerHTML = ""; dom.qFeedback.innerHTML = "";
    dom.timerFill.style.transition = "none"; dom.timerFill.style.width = "100%";

    // Filet de sécurité : on ne reste jamais coincé sur la poignée de main.
    // Cas visés : salon créé avant l'ajout du champ `ready`, ou écriture de
    // l'adversaire perdue. Au bout de 8 s, on démarre quand même.
    if (!RT.readySince) RT.readySince = Date.now();
    const waited = Date.now() - RT.readySince;
    if (!(ready.host && ready.guest) && waited < 8000) {
      dom.qText.textContent = "En attente de " + foeName + "…";
      if (RT.readyTimer) clearTimeout(RT.readyTimer);
      RT.readyTimer = setTimeout(() => { if (RT && RT.room) rtRenderRound(RT.room); }, 1200);
      return; // on repassera ici au prochain snapshot (ou via ce minuteur)
    }
    if (RT.readyTimer) { clearTimeout(RT.readyTimer); RT.readyTimer = null; }

    RT.prepDone = true; RT.prepping = true;
    dom.qText.textContent = "Le combat va commencer…";
    runCountdown(PREP_S, () => {
      if (!RT || !RT.room) return;
      RT.prepping = false; RT.lastRound = -1; // force le rendu réel de la manche
      rtRenderRound(RT.room);
    });
    return;
  }

  if (R !== RT.lastRound) {
    // Chrono basé sur l'horloge LOCALE au moment où l'on découvre la manche,
    // et non sur `roundStartAt` (qui est un Date.now() de la machine de l'hôte).
    // Une horloge décalée de plus de 12 s côté invité faisait expirer le chrono
    // instantanément : il perdait toutes les manches sans pouvoir cliquer.
    RT.lastRound = R; RT.answered = -1; RT.revealed = -1; RT.roundStart = Date.now(); RT.extraMs = 0;
    dom.roundNum.textContent = (R + 1) + "/" + room.rounds;
    dom.qTag.textContent = q.tag || "// ADAGE DE CHAMBRÉE";
    renderDiffBadge(q.d || 3);
    dom.qText.textContent = q.q;
    const keys = ["A", "B", "C", "D"];
    dom.qOptions.innerHTML = q.opts.map((o, i) => '<button class="gg-opt" data-i="' + i + '"><span class="gg-opt__key">' + keys[i] + '</span><span>' + esc(o.t) + '</span></button>').join("");
    [...dom.qOptions.children].forEach((b) => b.addEventListener("click", () => rtAnswer(+b.dataset.i)));
    dom.qFeedback.innerHTML = "";
    rtStartTimer();
  }
  renderMatchRW(); renderMatchArsenal();
  rtIncoming(room);
  const ans = (room.answers && room.answers[R]) || {};
  if (ans.host && ans.guest && RT.revealed !== R) rtReveal(room, R, ans);
}

/* Réception des attaques adverses (fumigène, grenade).
   L'adversaire écrit un horodatage dans le salon ; on ne réagit qu'UNE fois
   par attaque, sinon chaque nouveau snapshot rejouerait l'effet en boucle. */
function rtIncoming(room) {
  if (!RT) return;

  const smoke = (room.smoke && room.smoke[RT.role]) || 0;
  const cut = (room.cut && room.cut[RT.role]) || 0;

  // On ACQUITTE l'attaque même si on a déjà répondu (donc sans en subir
  // l'effet). Sinon l'horodatage restait « non vu » et l'attaque se
  // déclenchait à la manche SUIVANTE, qui n'était pas visée — sévère avec
  // la grenade, qui ampute alors une manche innocente.
  const done = RT.answered === RT.lastRound;
  if (done) { RT.lastSmoke = smoke; RT.lastCut = cut; return; }

  if (smoke && smoke !== RT.lastSmoke) {
    RT.lastSmoke = smoke;
    blindMe(4000);
  }

  if (cut && cut !== RT.lastCut) {
    RT.lastCut = cut;
    // On ampute le temps RESTANT de moitié, en repartant de l'horloge locale.
    const total = 13000 + (RT.extraMs || 0);
    const left = Math.max(0, total - (Date.now() - RT.roundStart));
    RT.roundStart -= left / 2;          // revient à décaler le départ
    const fill = dom.timerFill;
    const frac = Math.max(0, (left / 2) / total);
    fill.style.transition = "none";
    fill.style.width = (frac * 100) + "%";
    void fill.offsetWidth;
    requestAnimationFrame(() => {
      fill.style.transition = "width " + (left / 2000) + "s linear";
      fill.style.width = "0%";
    });
    pwFx("grenade"); APP.haptic("lose");
    toast("💣 Grenade adverse ! Ton temps vient de fondre de moitié.");
  }
}

/* Aveuglement temporaire : on masque les réponses sans les désactiver, pour
   que le joueur puisse quand même tenter sa chance à l'aveugle. */
function blindMe(ms) {
  if (!dom.qOptions) return;
  dom.qOptions.classList.add("gg-options--blind");
  pwFx("fumigene"); APP.haptic("warn");
  toast("💨 Fumigène ! Tu n'y vois plus rien pendant 4 secondes.");
  clearTimeout(blindMe._t);
  blindMe._t = setTimeout(() => dom.qOptions.classList.remove("gg-options--blind"), ms);
}

/* Chrono du 1v1.
   Auparavant la barre était repeinte tous les 100 ms avec `transition:none` :
   rendu saccadé, et surtout largeur figée à 0 % chez l'invité quand l'horloge
   de l'hôte était en avance (d'où « la barre ne s'affiche pas »). On utilise
   maintenant la même animation CSS fluide que le mode solo, l'intervalle ne
   servant plus qu'à surveiller l'échéance et la couleur. */
function rtStartTimer() {
  if (RT.timer) clearInterval(RT.timer);
  const dur = 13000 + (RT.extraMs || 0);
  const fill = dom.timerFill;

  fill.classList.remove("gg-timer__fill--warn", "gg-timer__fill--danger");
  fill.style.transition = "none";
  fill.style.width = "100%";
  // Force le navigateur à appliquer le 100 % avant d'animer vers 0 %,
  // sinon la transition est ignorée et la barre saute directement.
  void fill.offsetWidth;
  requestAnimationFrame(() => {
    fill.style.transition = "width " + (dur / 1000) + "s linear";
    fill.style.width = "0%";
  });

  RT.timer = setInterval(() => {
    if (!RT) return;
    const total = 13000 + (RT.extraMs || 0);
    const left = Math.max(0, total - (Date.now() - RT.roundStart));
    const frac = left / total;
    fill.classList.toggle("gg-timer__fill--warn", frac <= 0.5 && frac > 0.25);
    fill.classList.toggle("gg-timer__fill--danger", frac <= 0.25);
    if (left <= 0) {
      clearInterval(RT.timer); RT.timer = null;
      if (RT.answered !== RT.lastRound) rtAnswer(-1);
    }
  }, 150);
}
function extendTimerRT(extraMs) {
  if (!RT) return;
  RT.extraMs = (RT.extraMs || 0) + extraMs;
  // Il faut relancer l'animation CSS, sinon la barre continue de filer vers 0
  // à l'ancienne vitesse et les 5 s gagnées ne se voient pas.
  const fill = dom.timerFill;
  const total = 13000 + RT.extraMs;
  const left = Math.max(0, total - (Date.now() - RT.roundStart));
  const cur = (left / total) * 100;
  fill.style.transition = "none";
  fill.style.width = cur + "%";
  void fill.offsetWidth;
  requestAnimationFrame(() => {
    fill.style.transition = "width " + (left / 1000) + "s linear";
    fill.style.width = "0%";
  });
  // Même pulsation dorée qu'en solo : sans ça, en 1v1, la montre n'avait
  // aucun retour visuel et on croyait qu'elle n'avait pas fonctionné.
  fill.classList.remove("gg-timer__fill--warn", "gg-timer__fill--danger");
  fill.classList.add("gg-timer__fill--boost");
  setTimeout(() => fill.classList.remove("gg-timer__fill--boost"), 1400);
}

function rtAnswer(choice) {
  const R = RT.lastRound;
  if (RT.answered === R) return;
  RT.answered = R;
  // Justesse comptée À LA RÉPONSE (et non à la révélation). Avant, RT.myCorrect
  // n'était incrémenté que dans rtReveal, appelé UNIQUEMENT quand les deux ont
  // répondu : si l'adversaire laissait filer une manche (timeout/déconnexion),
  // ma bonne réponse n'était jamais comptée → goodAnswers sous-évalué et
  // « sans-faute » quasi impossible en ligne. On la compte ici, une fois/manche
  // (garde RT.answered === R au-dessus), indépendamment de l'adversaire.
  const _q = (RT.room && RT.room.questions) ? RT.room.questions[R] : null;
  if (_q && _q.opts && choice === _q.opts.findIndex((o) => o.ok)) {
    RT.myCorrect = (RT.myCorrect || 0) + 1;
  }
  const ms = Math.min(13000, Date.now() - RT.roundStart);
  [...dom.qOptions.children].forEach((b) => { b.disabled = true; });
  // La barre d'arsenal doit refléter TOUT DE SUITE qu'on a répondu, sinon la
  // montre reste visuellement active alors qu'elle n'aura plus aucun effet.
  renderMatchArsenal();
  dom.qFeedback.innerHTML = "Réponse envoyée. En attente de l'adversaire…";
  const usedRation = !!RT.ration;
  const patch = {}; patch["answers." + R + "." + RT.role] = { choice, ms, x2: usedRation };
  RT.ration = false;   // la ration ne vaut que pour cette réponse
  renderMatchArsenal();
  // Erreur visible : si cette écriture échoue silencieusement, l'adversaire
  // attend dans le vide et la manche est comptée 0 sans que personne ne sache
  // pourquoi. C'était l'une des causes des « bugs de liaison » fantômes.
  FB.updateRoom(RT.roomId, patch).catch((e) => {
    console.warn("[PW] envoi réponse", e);
    RT.answered = -1; // on autorise une nouvelle tentative
    // …et on rend la ration, sinon le joueur la perdait pour une réponse
    // qui n'est jamais partie.
    if (usedRation) { RT.ration = true; renderMatchArsenal(); }
    dom.qFeedback.innerHTML = "<b style='color:#ff7a7f'>Réponse non transmise — reclique.</b>";
    [...dom.qOptions.children].forEach((b) => { b.disabled = false; });
  });
}

function rtReveal(room, R, ans) {
  RT.revealed = R;
  const q = room.questions[R], correctIdx = q.opts.findIndex((o) => o.ok);
  const myA = ans[RT.role], foeA = ans[RT.role === "host" ? "guest" : "host"];
  [...dom.qOptions.children].forEach((b, i) => { b.disabled = true; if (i === correctIdx) b.classList.add("gg-opt--correct"); });
  if (myA && myA.choice >= 0 && myA.choice !== correctIdx && dom.qOptions.children[myA.choice]) dom.qOptions.children[myA.choice].classList.add("gg-opt--wrong");
  const myOk = myA && myA.choice === correctIdx, foeOk = foeA && foeA.choice === correctIdx;
  // (RT.myCorrect est désormais incrémenté dans rtAnswer, au moment où l'on
  // répond, pour ne pas dépendre de la réponse de l'adversaire.)
  if (RT.timer) { clearInterval(RT.timer); RT.timer = null; }
  // Fige la barre là où elle en est : sans ça la transition CSS continuait de
  // filer jusqu'à 0 % alors que la manche est déjà résolue (le solo, lui,
  // figeait bien la barre — l'incohérence se voyait).
  const tf = dom.timerFill;
  const stopW = tf.getBoundingClientRect().width;
  const trackW = tf.parentElement ? tf.parentElement.clientWidth : 0;
  tf.style.transition = "none";
  tf.style.width = trackW ? (stopW / trackW * 100) + "%" : "0%";
  tf.classList.remove("gg-timer__fill--warn", "gg-timer__fill--danger");
  // Retour visuel sur la réponse du joueur.
  if (myA && myA.choice >= 0) {
    floatPoints(myOk ? "BIEN VU" : "RATÉ", dom.qOptions.children[myA.choice], myOk ? "win" : "loss");
    APP.haptic(myOk ? "win" : "lose");
  }
  if (myOk && !foeOk) flashRW(true); else if (foeOk && !myOk) flashRW(false);
  renderMatchArsenal(); // la manche est révélée : la montre n'a plus lieu d'être
  dom.qFeedback.innerHTML = (myOk ? "<b>Bonne réponse !</b>" : "<b>Raté.</b>") + " L'adversaire : " + (foeOk ? "trouvé." : "raté.") + "<br>" + esc(q.explain);
}

/* ---------- arsenal en 1v1 temps réel (Firestore, patchs directs — même logique que rtAnswer) ---------- */
function useFusilRT() {
  if (!RT || !RT.room) return;
  ensureItems(profile);
  if (!profile.items.fusil) return toast("Pas de fusil dans ton barda, recrue. 🔫");
  const foeRole = RT.role === "host" ? "guest" : "host";
  const foeRW = (RT.room.roundWins && RT.room.roundWins[foeRole]) || 0;
  if (foeRW <= 0) return toast("Rien à dégommer : l'adversaire n'a pas encore de manche gagnée.");
  // Verrou jusqu'au prochain instantané : `foeRW` est lu sur un état qui peut
  // dater de quelques centaines de ms. Deux clics rapprochés passaient tous
  // les deux le test et décrémentaient deux fois pour une seule manche.
  if (RT.shooting) return toast("Tir déjà en cours, recrue.");
  RT.shooting = true;
  setTimeout(() => { if (RT) RT.shooting = false; }, 1200);
  profile.items.fusil--; profile.used.fusil++; saveProfile(); renderMatchArsenal();
  // Tir TRANSACTIONNEL : casque et compteur relus au moment du commit — plus
  // de manche « avalée » par un compteur négatif, plus de casque ignoré.
  FB.shootFoe(RT.roomId, foeRole).then((r) => {
    if (r.result === "hit") { pwFx("fusil"); toast("🔫 Tir groupé ! Manche adverse annulée."); return; }
    if (r.result === "blocked") { pwFx("blocked"); toast("Tir bloqué : l'adversaire portait un casque !"); return; }
    // Rien à toucher (manche déjà résolue / partie finie) : on REND le fusil.
    ensureItems(profile); profile.items.fusil++; profile.used.fusil--; saveProfile(); renderMatchArsenal();
    toast(r.result === "nothing" ? "Trop tard : plus de manche à dégommer — fusil rendu." : "Partie déjà terminée — fusil rendu.");
  }).catch((e) => {
    console.warn("[PW] fusil", e);
    ensureItems(profile); profile.items.fusil++; profile.used.fusil--; saveProfile(); renderMatchArsenal();
    toast("Réseau : le tir n'a pas été transmis — fusil rendu.");
  });
}
function useCasqueRT() {
  if (!RT || !RT.room) return;
  ensureItems(profile);
  if (!profile.items.casque) return toast("Pas de casque dans ton barda, recrue. 🪖");
  const myRole = RT.role;
  if (RT.room.shield && RT.room.shield[myRole]) return toast("Ton casque est déjà en position, recrue.");
  profile.items.casque--; profile.used.casque++; saveProfile(); renderMatchArsenal();
  FB.updateRoom(RT.roomId, { ["shield." + myRole]: true }).catch(() => {});
  pwFx("casque");
  toast("🪖 Casque en position : le prochain tir adverse sera bloqué.");
}
function useMontreRT() {
  if (!RT || !RT.room) return;
  ensureItems(profile);
  if (!profile.items.montre) return toast("Pas de montre dans ton barda, recrue. ⌚");
  // Gardes qui manquaient totalement ici (le mode solo, lui, les avait) :
  // sans eux, cliquer la montre juste après avoir répondu consommait l'objet
  // pour rallonger un chrono déjà terminé. Objet perdu, effet nul.
  if (RT.prepping) return toast("Attends le départ, recrue. ⌚");
  if (RT.lastRound < 0) return toast("Pas de question active, recrue.");
  if (RT.answered === RT.lastRound) return toast("Tu as déjà répondu — trop tard pour la montre.");
  if (RT.revealed === RT.lastRound) return toast("Manche terminée, garde-la pour la suivante.");

  profile.items.montre--; profile.used.montre++; saveProfile(); renderMatchArsenal();
  extendTimerRT(5000);
  // `increment` et non une valeur fixe : deux montres dans la même manche
  // écrivaient toutes les deux « 5000 », si bien que l'hôte tranchait la
  // manche AVANT la fin du chrono réellement rallongé — la 2e montre était
  // perdue et faisait même perdre la manche.
  FB.updateRoom(RT.roomId, { ["extend." + RT.role]: firebase.firestore.FieldValue.increment(5000) })
    .catch((e) => { console.warn("[PW] montre", e); toast("Réseau : la montre n'a pas été transmise."); });
  pwFx("montre");
  toast("⌚ +5 secondes sur le chrono !");
}
function rtPoints(a, correctIdx, d) {
  if (!a || a.choice !== correctIdx) return 0;
  const mult = (DIFF_META[d] || DIFF_META[3]).mult;
  // `x2` est posé par le joueur lui-même au moment de répondre (ration double) :
  // il voyage dans la réponse, pour que l'hôte comme l'invité calculent
  // exactement le même score.
  const ration = a.x2 ? 2 : 1;
  return Math.round((100 + Math.max(0, (13000 - (a.ms || 13000)) / 13000) * 100) * mult * ration);
}

/* Fait avancer la manche.
   L'hôte est prioritaire, mais l'INVITÉ prend le relais s'il ne se passe rien
   pendant 8 s de plus. Sans ce filet, un hôte qui ferme son onglet, perd le
   réseau, ou dont le navigateur met les minuteurs en veille (cas classique sur
   mobile en arrière-plan) gelait la partie définitivement pour l'adversaire —
   avec sa mise débitée et jamais remboursée. */
function rtHostMaybeAdvance(room) {
  const R = room.round;
  if (R < 0 || RT.resolving === R) return;
  // Pendant le compte à rebours on ne résout rien — mais on REPLANIFIE, sinon
  // plus personne ne relance la boucle une fois le décompte terminé.
  if (RT.prepping) {
    if (RT.hostTimer) clearTimeout(RT.hostTimer);
    RT.hostTimer = setTimeout(() => { if (RT && RT.room) rtHostMaybeAdvance(RT.room); }, 1500);
    return;
  }
  const ans = (room.answers && room.answers[R]) || {};
  const both = ans.host && ans.guest;
  const ext = room.extend || {}; const bonus = Math.max(ext.host || 0, ext.guest || 0);

  // Délai local depuis qu'on a vu la manche : indépendant de l'horloge de l'autre.
  const seenFor = Date.now() - (RT.roundStart || Date.now());
  const expired = seenFor > 14500 + bonus;

  // L'invité laisse 8 s de marge à l'hôte avant de s'en mêler.
  const iMayAct = RT.role === "host" || seenFor > 22500 + bonus;
  if (!iMayAct) {
    if (RT.hostTimer) clearTimeout(RT.hostTimer);
    RT.hostTimer = setTimeout(() => { if (RT && RT.room) rtHostMaybeAdvance(RT.room); }, 2000);
    return;
  }

  if (!both && !expired) {
    if (RT.hostTimer) clearTimeout(RT.hostTimer);
    RT.hostTimer = setTimeout(() => { if (RT && RT.room) rtHostMaybeAdvance(RT.room); }, 1500);
    return;
  }
  RT.resolving = R;

  setTimeout(() => {
    if (!RT) return;

    /* Résolution transactionnelle avec calcul SUR DONNÉES FRAÎCHES : les
       réponses, extensions (montre) et le score sont relus DANS la
       transaction au moment du commit. Une réponse arrivée pendant ces 2,6 s
       (latence, mobile qui se réveille) n'est donc plus jamais comptée zéro,
       et un fusil tiré entre-temps est bien pris en compte. La transaction
       refuse aussi d'appliquer deux fois la même manche. */
    FB.resolveRound(RT.roomId, R, {
      compute: (d) => {
        const q = (d.questions || [])[R];
        // Question absente : plutôt que de planter en boucle (la transaction
        // rejetterait et serait relancée indéfiniment, gelant la partie), on
        // clôt la manche proprement en la déclarant dernière et nulle.
        if (!q || !q.opts) {
          return { scores: (d.scores || { host: 0, guest: 0 }), roundWinner: null, isLast: true };
        }
        const correctIdx = q.opts.findIndex((o) => o.ok);
        const fresh = (d.answers && d.answers[R]) || {};
        const hp = rtPoints(fresh.host, correctIdx, q.d), gp = rtPoints(fresh.guest, correctIdx, q.d);
        return {
          scores: { host: ((d.scores && d.scores.host) || 0) + hp, guest: ((d.scores && d.scores.guest) || 0) + gp },
          roundWinner: hp > gp ? "host" : (gp > hp ? "guest" : null),
          isLast: R + 1 >= d.rounds,
        };
      },
      hostUid: room.hostUid,
      guestUid: room.guestUid,
    }).catch((e) => {
      console.warn("[PW] résolution de manche", e);
      toast("Erreur réseau — nouvelle tentative…");
      // Sans cette relance, la partie était GELÉE définitivement : le document
      // n'ayant pas changé, aucun snapshot ne serait venu relancer la boucle,
      // et les deux joueurs restaient bloqués avec leur mise débitée.
      if (RT) {
        if (RT.hostTimer) clearTimeout(RT.hostTimer);
        RT.hostTimer = setTimeout(() => { if (RT && RT.room) rtHostMaybeAdvance(RT.room); }, 2000);
      }
    }).finally(() => { if (RT) RT.resolving = -1; });
  }, 2600);
}

async function rtShowResult(room) {
  if (!RT || RT.settled) return;
  if (RT.timer) clearInterval(RT.timer);
  RT.settled = true;
  const me = FB.uid(), role = RT.role, stake = RT.stake;
  const _rw = room.roundWins || { host: 0, guest: 0 };
  const myRW = role === "host" ? (_rw.host || 0) : (_rw.guest || 0);
  const foeRW = role === "host" ? (_rw.guest || 0) : (_rw.host || 0);
  const outcome = room.winner === me ? "win" : (room.winner == null ? "tie" : "lose");
  pwTrack("match_end", { outcome: outcome, stake: RT.stake });

  const preLevel = profile.level;
  const rankBefore = rankFromRP(profile.rp);

  // RÈGLEMENT SERVEUR : escrow, paiement du pot et coins de palier sont calculés
  // par settleMatch — le client ne touche plus jamais aux coins. On applique
  // ensuite l'état renvoyé pour l'affichage. Idempotent : les deux joueurs
  // peuvent l'appeler, un seul règlement est réellement appliqué.
  // Règlement avec RÉESSAIS : sous forte latence/charge, un premier appel peut
  // échouer. On retente (avec un petit délai croissant) pour garantir que le
  // joueur touche bien ses coins. Idempotent côté serveur : aucun risque de
  // double paiement.
  // UN SEUL RÈGLEUR de préférence : l'hôte appelle tout de suite, l'invité
  // n'intervient qu'en secours ~1,2 s plus tard (le plus souvent, le match est
  // déjà réglé et son appel renvoie l'état sans re-transiger). Divise par
  // deux les invocations et la contention en fin de match.
  if (RT.role === "guest") await new Promise((r) => setTimeout(r, 1200));
  let settled = null;
  for (let attempt = 0; attempt < 3 && !(settled && (settled.you || settled.already)); attempt++) {
    try { settled = await FB.settle(RT.roomId); }
    catch (e) {
      console.warn("[PW] settle (essai " + (attempt + 1) + ")", e);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (!settled || !(settled.you || settled.already)) {
    // Dernier repli : l'adversaire a peut-être déjà réglé — on relit l'état serveur.
    const srv = await FB.reloadServerFields();
    if (srv) settled = { you: srv };
  }
  const you = (settled && settled.you) || {};
  if (typeof you.coins === "number") profile.coins = you.coins;
  if (typeof you.coinsEarned === "number") profile.coinsEarned = you.coinsEarned;
  if (typeof you.level === "number") profile.level = you.level;
  if (typeof you.xp === "number") profile.xp = you.xp;

  // Objets de palier gagnés : les COINS de palier sont déjà crédités par le
  // serveur ; ici on n'ajoute QUE les objets (non monétaires, gérés côté client),
  // déduits de la progression de niveau renvoyée.
  const lvlRes = { gained: [] };
  for (let l = preLevel + 1; l <= (profile.level || preLevel); l++) {
    const r = levelReward(l);
    if (r.item) { ensureItems(profile); profile.items[r.item] = (profile.items[r.item] || 0) + 1; }
    lvlRes.gained.push({ level: l, reward: r });
  }

  const xpGain = outcome === "win" ? 50 : 20;
  // Progression de VANITÉ (non monétaire) : reste côté client.
  // GALONS = XP DE CARRIÈRE : ils tombent à chaque match terminé, même perdu.
  profile.rp = Math.max(0, (profile.rp | 0) + rpForMatch(outcome));
  if (outcome === "win") { profile.wins++; profile.streak++; if (profile.streak > profile.best) profile.best = profile.streak; }
  else if (outcome === "lose") { profile.losses++; profile.streak = 0; }
  // --- compteurs du dossier militaire ---
  const medalsBefore = new Set(unlockedMedals(profile).map((m) => m.id));
  const titlesBefore = new Set(unlockedTitles(profile).map((t) => t.id));
  profile.played++;
  profile.goodAnswers += (RT.myCorrect || 0);
  if (RT.myCorrect === room.rounds) profile.perfects++;
  const newMedals = unlockedMedals(profile).filter((m) => !medalsBefore.has(m.id));
  const newTitles = unlockedTitles(profile).filter((t) => !titlesBefore.has(t.id));
  const rankAfter = rankFromRP(profile.rp);
  saveProfile();
  // Rafraîchit le HUD TOUT DE SUITE avec l'état SERVEUR (coins + barre d'XP) :
  // sans ça, le bandeau du haut gardait l'ancien solde/XP jusqu'à la navigation
  // suivante — d'où l'impression que "les coins n'arrivent pas" ou que la barre
  // d'XP saute.
  renderHud();
  dom.resultBox.className = "gg-result " + (outcome === "win" ? "gg-result--win" : outcome === "lose" ? "gg-result--loss" : "");
  dom.resultTitle.textContent = outcome === "win" ? "VICTOIRE" : outcome === "lose" ? "DÉFAITE" : "ÉGALITÉ";
  if (outcome === "win") { dom.resultPot.className = "gg-result__pot gg-result__pot--win"; dom.resultPot.innerHTML = "+" + stake + " coins " + coinIcon(); }
  else if (outcome === "lose") { dom.resultPot.className = "gg-result__pot gg-result__pot--loss"; dom.resultPot.textContent = "−" + stake + " coins"; }
  else { dom.resultPot.className = "gg-result__pot"; dom.resultPot.textContent = "Mise remboursée"; }
  const foeName = role === "host" ? (room.guestName || "Adversaire") : room.hostName;
  dom.resultScore.textContent = myRW + " — " + foeRW + " · " + esc(foeName);
  let gains = '<div class="gg-gain"><div class="gg-gain__num">+' + xpGain + '</div><div class="gg-gain__lbl">XP</div></div>';
  if (outcome === "win") gains += '<div class="gg-gain"><div class="gg-gain__num">+34</div><div class="gg-gain__lbl">Galons</div></div>';
  gains += '<div class="gg-gain"><div class="gg-gain__num">' + profile.coins + '</div><div class="gg-gain__lbl">Coins</div></div>';
  dom.resultGains.innerHTML = gains;
  let rk = "";
  // Grades PAYANTS : gagner des galons rend ÉLIGIBLE au grade suivant ; la
  // promotion elle-même se valide en payant dans MA CARRIÈRE. On annonce donc
  // la DISPONIBILITÉ, pas une promotion automatique.
  if (rankAfter.gradeIndex > rankBefore.gradeIndex && rankAfter.gradeIndex > (profile.grade | 0)) {
    rk += "<b>⭐ NOUVEAU GRADE DISPONIBLE : " + rankAfter.grade.toUpperCase() + "</b> — valide-le dans MA CARRIÈRE (péage en coins).";
  }
  (lvlRes.gained || []).forEach((g) => {
    rk += '<div class="gg-newmedal"><span class="gg-newmedal__ico">⬆️</span> NIVEAU ' + g.level + ' — <b>' + esc(g.reward.label) + '</b></div>';
  });
  if (profile.level >= MAX_LEVEL && (profile.prestige || 0) < PRESTIGE_MAX) {
    rk += '<div class="gg-newmedal"><span class="gg-newmedal__ico">⭐</span> <b>PRESTIGE DISPONIBLE</b> — dans MA CARRIÈRE.</div>';
  }
  newMedals.forEach((m) => {
    rk += '<div class="gg-newmedal"><span class="gg-newmedal__ico">' + m.ico + '</span> DÉCORATION : <b>' + esc(m.name) + '</b></div>';
  });
  newTitles.forEach((t) => {
    rk += '<div class="gg-newmedal"><span class="gg-newmedal__ico">🏷️</span> TITRE DÉBLOQUÉ : <b>' + esc(t.name) + '</b></div>';
  });
  dom.resultRankup.hidden = !rk; dom.resultRankup.innerHTML = rk;
  showView("viewResult");
  rtCleanup();
  publishMe();
  if (newMedals.length) setTimeout(() => medalCeremony(newMedals[0]), 700);
}


/* ============================================================
   INIT
   ============================================================ */
bind();

// Une sauvegarde refusée par les règles doit se VOIR : sinon le joueur croit
// avoir gagné, puis retrouve son ancien solde au rechargement.
if (FB) {
  FB.onSaveError = (e) => {
    const denied = e && (e.code === "permission-denied" || /permission/i.test(e.message || ""));
    toast(denied
      ? "⚠️ Sauvegarde refusée par le serveur — recharge la page."
      : "⚠️ Sauvegarde impossible (réseau). Tes derniers gains risquent d'être perdus.");
  };
}

if (FB) { setupFbAuthUI(); FB.onAuth(handleFbAuth); }
else if (currentKey && accounts[currentKey]) enterGame();
else showAuth();

// Filet de sécurité : si la page se ferme ou passe en arrière-plan pendant qu'une
// sauvegarde Firestore est en attente (debounce), on la force immédiatement pour
// ne jamais perdre un achat / un gain de coins fait juste avant de quitter.
if (FB && FB.saveProfileNow) {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && profile) FB.saveProfileNow(profile); });
  window.addEventListener("pagehide", () => { if (profile) FB.saveProfileNow(profile); });
}

// Ferme le salon si on quitte la page alors qu'on attendait encore un
// adversaire : sinon le document reste "waiting" pour toujours et pollue la
// liste des salons ouverts de tout le monde.
if (FB) {
  window.addEventListener("pagehide", () => {
    if (RT && RT.roomId && RT.room && RT.room.status === "waiting") FB.closeRoom(RT.roomId);
  });
}

window.PW = {
  get profile() { return profile; }, get accounts() { return accounts; },
  rankFromRP, xpForLevel, payout, defaultProfile: (pseudo) => newAccount(pseudo, ""), GRADES, TIERS, QUESTIONS, SHOP, STAKES, WHEEL,
  resetAll() { localStorage.removeItem(AKEY); localStorage.removeItem(CKEY); location.reload(); },
};

})();
