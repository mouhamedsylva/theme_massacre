/* ============================================================
   POPOTE WAR — COUCHE COMPORTEMENTALE « APP MOBILE »
   ------------------------------------------------------------
   Chargée AVANT popote-war.js. N'expose que window.PWApp, que
   popote-war.js utilise si présent — le jeu reste parfaitement
   fonctionnel sans ce fichier (dégradation propre).

   Ça reste un site web : pas de service worker, pas d'installation.
   On travaille uniquement le RESSENTI.
   ============================================================ */
(() => {
  "use strict";

  /* ---------- INTERRUPTEUR DE SECOURS ----------
     Ajoute ?noapp=1 à l'URL pour désactiver toute cette couche
     (transitions, vibrations, retouches tactiles) sans toucher au code :
       https://popotewar.web.app/popote-war.html?noapp=1
     Utile pour vérifier en deux secondes si un bug d'affichage vient d'ici
     ou du jeu lui-même. Le choix est mémorisé jusqu'à la fermeture de l'onglet. */
  try {
    const p = new URLSearchParams(location.search);
    if (p.has("noapp")) sessionStorage.setItem("pw_noapp", p.get("noapp") === "0" ? "0" : "1");
    if (sessionStorage.getItem("pw_noapp") === "1") {
      document.documentElement.classList.add("pw-noapp");
      window.PWApp = { transition: (fn) => fn(), haptic: () => {}, loading: () => {},
        supports: { disabled: true }, relabelTabs: () => {} };
      console.info("[PWApp] couche app désactivée (?noapp=1)");
      return;
    }
  } catch (e) { /* sessionStorage indisponible : on continue normalement */ }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  // Les transitions de vues n'existent que sur les navigateurs récents ;
  // ailleurs on exécute simplement la mise à jour sans animer.
  const canTransition = typeof document !== "undefined" && typeof document.startViewTransition === "function";

  /* ----------------------------------------------------------
     TRANSITIONS DE VUES
     `update` doit contenir TOUTE la mutation du DOM : le navigateur
     photographie l'avant, exécute update(), photographie l'après,
     puis interpole entre les deux.
     ---------------------------------------------------------- */
  function transition(update) {
    if (typeof update !== "function") return;
    if (!canTransition || reduceMotion) { update(); return; }
    try {
      const vt = document.startViewTransition(update);
      // Une transition interrompue par une plus récente rejette ses promesses
      // en AbortError. Sans ces catch, la console se remplit de rejets non
      // gérés dès qu'on enchaîne deux changements d'écran rapprochés.
      if (vt) {
        if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
        if (vt.finished) vt.finished.catch(() => {});
        if (vt.ready) vt.ready.catch(() => {});
      }
    } catch (e) {
      // Un échec d'animation ne doit JAMAIS empêcher le changement d'écran.
      console.warn("[PWApp] view transition", e);
      update();
    }
  }

  /* ----------------------------------------------------------
     RETOUR HAPTIQUE
     Vibrations très courtes : au-delà de ~30 ms ça devient
     désagréable. Android uniquement (iOS Safari ne l'expose pas),
     d'où la dégradation silencieuse.
     ---------------------------------------------------------- */
  const PATTERNS = {
    tap: 8,           // appui sur un bouton
    select: [10],     // choix d'une réponse
    win: [14, 40, 22],
    lose: [30, 60, 30],
    reward: [10, 30, 10, 30, 26],
    warn: [22, 50, 22],
  };
  function haptic(kind) {
    if (!canVibrate || reduceMotion) return;
    try { navigator.vibrate(PATTERNS[kind] || PATTERNS.tap); } catch (e) { /* sans effet */ }
  }

  /* ----------------------------------------------------------
     BARRE DE CHARGEMENT
     Compteur de références : plusieurs requêtes simultanées ne
     doivent pas éteindre la barre dès que la première se termine.
     ---------------------------------------------------------- */
  let busy = 0, bar = null;
  function loading(on) {
    busy = Math.max(0, busy + (on ? 1 : -1));
    if (busy > 0 && !bar) {
      bar = document.createElement("div");
      bar.className = "pw-loading";
      document.body.appendChild(bar);
    } else if (busy === 0 && bar) {
      bar.remove(); bar = null;
    }
  }

  /* ----------------------------------------------------------
     LIBELLÉS COURTS DES ONGLETS (barre du bas, mobile)
     Le CSS les lit via attr(data-short). On les dérive du texte
     existant pour ne pas dupliquer l'information dans le HTML.
     ---------------------------------------------------------- */
  // Libellés volontairement COURTS : sur un écran de 360 px, six onglets ne
  // laissent que ~53 px utiles chacun. « Classement » débordait et repassait
  // à la ligne dès que la police Oswald n'était pas encore chargée.
  const SHORT = {
    viewLobby: "Salons",
    viewWeek: "Ordinaire",
    viewCareer: "Grades",
    viewRank: "Rang",
    viewShop: "Boutique",
    viewDossier: "Profil",
  };
  /* On RESTRUCTURE le contenu de l'onglet en deux éléments réels plutôt que
     d'utiliser ::first-letter : ce pseudo-élément ne s'applique pas à un
     conteneur flex, et la barre mobile se retrouvait sans aucune icône.
     La pastille de notification (#weekDot) est préservée telle quelle. */
  function labelTabs() {
    document.querySelectorAll(".gg-tab").forEach((t) => {
      if (t.dataset.appReady) return;
      const v = t.dataset.view;
      const dot = t.querySelector(".gg-tab__dot");   // à réinsérer ensuite
      const raw = (t.textContent || "").trim();

      // Sépare l'emoji de tête du libellé. On segmente par graphème pour ne pas
      // couper un emoji composé (drapeau, séquence ZWJ…) au milieu.
      let ico = "", label = raw;
      const seg = (typeof Intl !== "undefined" && Intl.Segmenter)
        ? [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(raw)].map((s) => s.segment)
        : [...raw];
      if (seg.length && /\p{Extended_Pictographic}/u.test(seg[0])) {
        ico = seg[0];
        label = seg.slice(1).join("").trim();
      }

      t.textContent = "";
      const i = document.createElement("span");
      i.className = "gg-tab__ico"; i.textContent = ico || "•";
      const l = document.createElement("span");
      l.className = "gg-tab__lbl"; l.textContent = label;
      l.dataset.short = (v && SHORT[v]) || label;

      t.append(i, l);
      if (dot) t.appendChild(dot);
      t.dataset.appReady = "1";
    });
  }

  /* ----------------------------------------------------------
     CONFORT TACTILE
     ---------------------------------------------------------- */
  function touchPolish() {
    // Empêche le zoom par double-tap sur les zones de jeu, sans bloquer
    // le pincement (qui reste une aide d'accessibilité légitime).
    let lastTouch = 0;
    document.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouch < 320 && e.target.closest(".gg-opt, .gg-tab, .btn, .gg-arm-btn")) {
        e.preventDefault();
      }
      lastTouch = now;
    }, { passive: false });

    // Un appui long sur une image de l'arsenal ouvrait le menu contextuel
    // « enregistrer l'image » : très « site web », jamais dans une app.
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".gg-arm-btn, .gg-deal__ico, .pw-coin-ico, .pw-item-ico")) e.preventDefault();
    });

    // Vibration légère sur tout appui de bouton, sans avoir à câbler
    // chaque écouteur un par un.
    document.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      if (e.target.closest(".btn, .gg-tab, .gg-opt, .gg-arm-btn, .pw-stake, .gg-day")) haptic("tap");
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     BARRE D'ADRESSE MOBILE
     Certains navigateurs mobiles n'appliquent `dvh` qu'après un
     premier redimensionnement. On force un recalcul à l'orientation.
     ---------------------------------------------------------- */
  function viewportFix() {
    const set = () => document.documentElement.style.setProperty("--vh-real", window.innerHeight + "px");
    set();
    window.addEventListener("resize", set, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(set, 120), { passive: true });
  }

  /* ==========================================================
     DIAGNOSTIC DE DÉFILEMENT  —  ajouter ?diag=1 à l'URL
     ----------------------------------------------------------
     Affiche un panneau listant tout ce qui peut empêcher le
     défilement à un doigt, y compris l'élément réellement touché
     au centre de l'écran. Conçu pour être lisible SUR le
     téléphone, sans console de développement.
     ========================================================== */
  function runDiagnostic() {
    const lines = [];
    const add = (label, value, bad) =>
      lines.push(`<div class="${bad ? "d-bad" : "d-ok"}"><b>${label}</b><span>${value}</span></div>`);

    const de = document.documentElement, bd = document.body;
    const cs = (el) => getComputedStyle(el);

    // 1. La page est-elle seulement plus haute que l'écran ?
    const docH = Math.max(de.scrollHeight, bd.scrollHeight);
    const viewH = window.innerHeight;
    add("Hauteur page / écran", `${docH} / ${Math.round(viewH)} px`, docH <= viewH + 4);
    if (docH <= viewH + 4) lines.push('<p class="d-note">La page ne dépasse pas l\'écran : il n\'y a rien à faire défiler.</p>');

    // 2. Qui est le conteneur de défilement, et y en a-t-il deux ?
    add("scrollingElement", document.scrollingElement === de ? "html ✔" : (document.scrollingElement === bd ? "body" : "autre"), document.scrollingElement !== de);
    [["html", de], ["body", bd]].forEach(([n, el]) => {
      const s = cs(el);
      const scroller = ["auto", "scroll", "hidden"].includes(s.overflowY);
      add(`overflow ${n}`, `x:${s.overflowX} / y:${s.overflowY}`, scroller);
    });

    // 3. touch-action sur la chaîne d'ancêtres au centre de l'écran
    const cx = Math.round(window.innerWidth / 2), cy = Math.round(viewH / 2);
    const hit = document.elementFromPoint(cx, cy);
    add("Élément au centre", hit ? (hit.tagName.toLowerCase() + (hit.className ? "." + String(hit.className).split(" ")[0] : "")) : "aucun", !hit);

    let node = hit, bloquants = [];
    while (node && node !== document) {
      const s = cs(node);
      const ta = s.touchAction;
      const scroller = ["auto", "scroll", "hidden"].includes(s.overflowY) && node !== de && node !== bd;
      if (ta && ta !== "auto" && ta !== "manipulation" && ta !== "pan-y" && ta !== "pan-x pan-y pinch-zoom") {
        bloquants.push(`${node.tagName.toLowerCase()}.${String(node.className).split(" ")[0]} → touch-action:${ta}`);
      }
      if (s.position === "fixed" && node !== de && node !== bd) {
        const r = node.getBoundingClientRect();
        if (r.width > window.innerWidth * 0.8 && r.height > viewH * 0.8 && s.pointerEvents !== "none") {
          bloquants.push(`${node.tagName.toLowerCase()}.${String(node.className).split(" ")[0]} → calque FIXE plein écran`);
        }
      }
      if (scroller) bloquants.push(`${node.tagName.toLowerCase()}.${String(node.className).split(" ")[0]} → conteneur de défilement imbriqué`);
      node = node.parentElement;
    }
    add("Blocages détectés", bloquants.length ? bloquants.join("<br>") : "aucun ✔", bloquants.length > 0);

    // 4. Calques plein écran présents dans le document
    const overlays = [...document.querySelectorAll("body *")].filter((el) => {
      const s = cs(el);
      if (s.position !== "fixed" || s.display === "none" || s.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width >= window.innerWidth * 0.9 && r.height >= viewH * 0.9;
    }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}${cs(el).pointerEvents === "none" ? " (transparent)" : " ⚠️ CAPTE LE TOUCHER"}`);
    add("Calques plein écran", overlays.length ? overlays.join("<br>") : "aucun ✔", overlays.some((o) => o.includes("CAPTE")));

    // 5. Le défilement programmatique fonctionne-t-il ?
    const y0 = window.scrollY;
    window.scrollTo(0, y0 + 120);
    const bougé = Math.abs(window.scrollY - y0) > 4;
    window.scrollTo(0, y0);
    add("Défilement programmatique", bougé ? "fonctionne ✔" : "NE BOUGE PAS", !bougé);

    add("Écran", `${window.innerWidth}×${Math.round(viewH)} · zoom ${(window.visualViewport ? (window.innerWidth / window.visualViewport.width).toFixed(2) : "?")}`, false);

    const box = document.createElement("div");
    box.id = "pwDiag";
    box.innerHTML =
      '<style>' +
      '#pwDiag{position:fixed;inset:auto 8px 8px 8px;z-index:99999;max-height:70dvh;overflow:auto;' +
      'background:#12120c;color:#e8e4d4;border:2px solid #f6ca66;border-radius:12px;padding:12px;' +
      'font:12px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.7);}' +
      '#pwDiag h4{font:700 13px system-ui;margin:0 0 8px;color:#f6ca66;}' +
      '#pwDiag div{display:flex;gap:8px;justify-content:space-between;padding:4px 0;border-bottom:1px solid #2a2718;}' +
      '#pwDiag b{flex:0 0 42%;font-weight:600;color:#b9a77a;}' +
      '#pwDiag span{flex:1;text-align:right;word-break:break-word;}' +
      '#pwDiag .d-bad span{color:#ff8b8b;font-weight:700;}' +
      '#pwDiag .d-ok span{color:#8fd14f;}' +
      '#pwDiag .d-note{color:#ffce6b;margin:6px 0 0;}' +
      '#pwDiag button{margin-top:10px;width:100%;padding:9px;border-radius:8px;border:0;' +
      'background:#f6ca66;color:#14140f;font-weight:700;}' +
      '</style>' +
      '<h4>DIAGNOSTIC DÉFILEMENT</h4>' + lines.join("") +
      '<button onclick="this.parentNode.remove()">Fermer</button>';
    document.body.appendChild(box);
  }

  function init() {
    labelTabs();
    touchPolish();
    viewportFix();
    try {
      if (new URLSearchParams(location.search).has("diag")) setTimeout(runDiagnostic, 900);
    } catch (e) { /* ignoré */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.PWApp = {
    transition, haptic, loading,
    supports: { viewTransitions: canTransition, vibrate: canVibrate, reduceMotion },
    relabelTabs: labelTabs,
  };
})();
