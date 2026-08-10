/* ============================================================
   MASSACRE — musique d'ambiance (site entier)
   ------------------------------------------------------------
   Lecture jamais automatique au chargement (règle des navigateurs :
   pas de son sans interaction). Le visiteur clique sur le bouton
   rond 🎵 pour lancer ; ensuite la lecture, le volume et le mute
   sont mémorisés (localStorage) et repris sur toutes les pages.
   Dépose les 2 pistes dans /assets/audio avec exactement ces noms :
     assets/audio/track-awakening.mp3
     assets/audio/track-star-bounce.mp3
   ============================================================ */
(() => {
  "use strict";

  // Playlist par défaut : fichiers de Contenu > Fichiers (Shopify), servis
  // par le CDN à l'adresse relative /cdn/shop/files/<nom>. Cette adresse
  // marche sur .myshopify.com comme sur un domaine personnalisé.
  // Tous réencodés en AUDIO PUR : un mp3 qui embarque une pochette-vidéo
  // n'est pas décodé par les navigateurs (les boutons s'affichent, aucun
  // son ne sort) — la panne rencontrée sur les deux premières pistes.
  // Hors Shopify (site local), ces chemins n'existent pas : le repli local
  // ci-dessous prend alors le relais.
  const DEFAULT_TRACKS = [
    { src: "/cdn/shop/files/music-journeys.mp3",       name: "Journeys Reflection" },
    { src: "/cdn/shop/files/music-rising-tyranny.mp3", name: "Rising Tyranny" },
    { src: "/cdn/shop/files/music-asimov.mp3",         name: "Asimov" },
    { src: "/cdn/shop/files/music-arising.mp3",        name: "Arising" },
    { src: "/cdn/shop/files/track-awakening.mp3",      name: "Awakening" },
    { src: "/cdn/shop/files/track-star-bounce.mp3",    name: "Star Bounce" },
  ];

  // La liste la plus fournie l'emporte : si la section Shopify injecte une
  // vraie playlist (window.PW_MUSIC) au moins aussi longue, on la prend ;
  // sinon on garde DEFAULT_TRACKS. Ainsi une ancienne section à 2 pistes
  // n'écrase pas les 6 morceaux, et une section à jour reste maîtresse.
  const TRACKS = (Array.isArray(window.PW_MUSIC) && window.PW_MUSIC.length >= DEFAULT_TRACKS.length)
    ? window.PW_MUSIC
    : DEFAULT_TRACKS;
  const LS_VOL = "massacre_music_vol";
  const LS_MUTE = "massacre_music_mute";
  const LS_IDX = "massacre_music_idx";
  const LS_PLAYING = "massacre_music_playing";

  let idx = parseInt(localStorage.getItem(LS_IDX), 10);
  if (isNaN(idx) || idx < 0 || idx >= TRACKS.length) idx = 0;
  let vol = parseFloat(localStorage.getItem(LS_VOL));
  if (isNaN(vol)) vol = 0.5;
  let muted = localStorage.getItem(LS_MUTE) === "1";
  const wantsPlaying = localStorage.getItem(LS_PLAYING) === "1";

  const audio = new Audio();

  /* Sans ça, un fichier introuvable ou illisible ne produit RIEN :
     les `.catch(() => {})` plus bas avalent l'échec, les boutons
     répondent normalement, et on cherche longtemps pourquoi il n'y a
     pas de son. Le cas s'est produit sur Shopify, où le mp3 n'était
     pas servi. On trace donc l'erreur, et on le dit à l'écran. */
  audio.addEventListener("error", () => {
    const err = audio.error;
    console.warn("[MASSACRE] piste illisible :", TRACKS[idx] && TRACKS[idx].src,
                 err ? "code " + err.code : "");
    const lbl = document.getElementById("mxTrack");
    /* Le bandeau est étroit : un libellé long est coupé en « PISTE
       INTROUVAB… » et devient illisible. On reste court, le détail
       complet est dans la console juste au-dessus. */
    if (lbl) { lbl.textContent = "⚠ pas de son"; lbl.title = "Fichier audio introuvable — voir la console."; }
  });

  audio.preload = "none";
  audio.loop = false;
  audio.volume = vol;
  audio.muted = muted;
  audio.src = TRACKS[idx].src;

  function nextTrack() {
    idx = (idx + 1) % TRACKS.length;
    localStorage.setItem(LS_IDX, String(idx));
    audio.src = TRACKS[idx].src;
    audio.play().catch(() => {});
  }
  audio.addEventListener("ended", () => { nextTrack(); if (updateTrackLabel) updateTrackLabel(); });

  let updateTrackLabel = null;

  function build() {
    const wrap = document.createElement("div");
    wrap.className = "mx-player";
    wrap.innerHTML =
      '<button class="mx-player__toggle" id="mxToggle" title="Musique MASSACRE" aria-label="Lecture musique">🎵</button>' +
      '<div class="mx-player__panel">' +
        '<button class="mx-player__mute" id="mxMute" title="Muet" aria-label="Couper le son">' + (muted ? "🔇" : "🔊") + "</button>" +
        '<input class="mx-player__vol" id="mxVol" type="range" min="0" max="100" value="' + Math.round(vol * 100) + '" aria-label="Volume">' +
        '<span class="mx-player__track" id="mxTrack"></span>' +
      "</div>";
    document.body.appendChild(wrap);

    const toggleBtn = wrap.querySelector("#mxToggle");
    const muteBtn = wrap.querySelector("#mxMute");
    const volInput = wrap.querySelector("#mxVol");
    const trackLbl = wrap.querySelector("#mxTrack");

    function setPlayIcon() { toggleBtn.textContent = audio.paused ? "🎵" : "⏸"; }
    updateTrackLabel = function () { trackLbl.textContent = TRACKS[idx].name; };
    updateTrackLabel();
    setPlayIcon();

    toggleBtn.addEventListener("click", () => {
      if (audio.paused) {
        audio.play().then(() => {
          localStorage.setItem(LS_PLAYING, "1"); setPlayIcon(); wrap.classList.add("mx-player--open");
        }).catch(() => { setPlayIcon(); });
      } else {
        audio.pause(); localStorage.setItem(LS_PLAYING, "0"); setPlayIcon();
        wrap.classList.toggle("mx-player--open");
      }
    });

    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      muted = !muted; audio.muted = muted; localStorage.setItem(LS_MUTE, muted ? "1" : "0");
      muteBtn.textContent = muted ? "🔇" : "🔊";
    });

    volInput.addEventListener("input", (e) => {
      vol = (+e.target.value) / 100; audio.volume = vol; localStorage.setItem(LS_VOL, String(vol));
      if (vol > 0 && muted) { muted = false; audio.muted = false; localStorage.setItem(LS_MUTE, "0"); muteBtn.textContent = "🔊"; }
    });

    // Reprend la lecture si elle était en cours sur la page précédente.
    // Si le navigateur bloque (pas encore d'interaction sur ce domaine), on
    // réessaie discrètement au premier clic n'importe où sur la page.
    if (wantsPlaying) {
      audio.play().then(() => { wrap.classList.add("mx-player--open"); setPlayIcon(); }).catch(() => {
        const resume = () => { audio.play().then(() => { setPlayIcon(); }).catch(() => {}); document.removeEventListener("click", resume); };
        document.addEventListener("click", resume, { once: true });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
