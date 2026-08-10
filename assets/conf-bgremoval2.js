/**
 * conf-bgremoval2.js
 * Suppression d'arrière-plan côté client (gratuit, IA locale).
 *
 * L'en-tête portait le nom `conf-bg-removal.js` : c'était la version
 * précédente, jamais chargée, supprimée le 2026-08-05. Ce fichier-ci est le
 * seul en service — c'est lui que référence sections/configurateur.liquid.
 *
 * API publique :
 *   window.ConfBgRemoval.ask(dataUrl) -> Promise<string>
 *     Affiche une modale « Voulez-vous supprimer l'arrière-plan ? ».
 *     - « Non »  -> résout avec le dataUrl ORIGINAL.
 *     - « Oui »  -> détoure l'image (spinner), résout avec le PNG transparent.
 *       Un bouton « Remettre le fond » permet de revenir à l'original.
 *
 * Le moteur est @imgly/background-removal, chargé à la demande depuis un CDN
 * ESM. Le modèle (~10 Mo) est téléchargé une seule fois puis mis en cache par
 * le navigateur.
 */
(function () {
  'use strict';

  // ── Moteur : onnxruntime-web + modèle RMBG-1.4 (ONNX) ──
  // onnxruntime-web est conçu POUR le navigateur (WebAssembly) : aucun `require`
  // Node exécuté. On fait le pré/post-traitement nous-mêmes. Fiable et gratuit.
  // IMPORTANT : on charge onnxruntime-web via une balise <script> (UMD, variable
  // globale `ort`) et NON via import()/require(). Raison : Shopify transpile les
  // assets .js au déploiement et convertit les import() dynamiques en require(),
  // ce qui casse dans le navigateur (« require is not defined »). Une balise
  // <script> avec URL en chaîne échappe à cette transformation.
  var ORT_SCRIPT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
  var ORT_WASM   = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  // Modèle NON quantifié : nettement plus précis que le quantifié (moins de
  // « restes » de fond). Plus lourd (~176 Mo) mais mis en cache après le 1er usage.
  var MODEL_URL  = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx';
  var MODEL_SIZE = 1024;   // RMBG-1.4 attend une entrée 1024x1024

  var _sessionPromise = null; // cache de la session ONNX
  var _ortPromise = null;     // cache du chargement du runtime
  var _lastOriginal = null;   // dernier dataUrl original (pour « Remettre le fond »)
  var _lastCutout = null;     // dernier dataUrl détouré (cache)

  /* Charge le runtime onnxruntime-web via <script> et renvoie window.ort. */
  function loadOrt() {
    if (window.ort) return Promise.resolve(window.ort);
    if (_ortPromise) return _ortPromise;
    _ortPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = ORT_SCRIPT;
      s.async = true;
      s.onload = function () {
        if (window.ort) resolve(window.ort);
        else reject(new Error('onnxruntime-web indisponible après chargement.'));
      };
      s.onerror = function () { reject(new Error('Chargement du moteur impossible.')); };
      document.head.appendChild(s);
    });
    return _ortPromise;
  }

  /* Charge onnxruntime-web + le modèle RMBG une seule fois.
     onProgress(pct) : progression du téléchargement du modèle. */
  function loadSession(onProgress) {
    if (_sessionPromise) return _sessionPromise;
    _sessionPromise = loadOrt()
      .then(function (ort) {
        // Indique où trouver les fichiers .wasm du runtime.
        if (ort.env && ort.env.wasm) { ort.env.wasm.wasmPaths = ORT_WASM; }
        // Télécharge le modèle avec suivi de progression.
        return fetchWithProgress(MODEL_URL, onProgress).then(function (buf) {
          return ort.InferenceSession.create(buf, {
            executionProviders: ['wasm']
          }).then(function (session) {
            return { ort: ort, session: session };
          });
        });
      })
      .catch(function (err) {
        _sessionPromise = null; // permet de réessayer
        throw err;
      });
    return _sessionPromise;
  }

  /* Télécharge une URL en ArrayBuffer avec callback de progression (%). */
  function fetchWithProgress(url, onProgress) {
    return fetch(url).then(function (resp) {
      if (!resp.ok) throw new Error('Téléchargement du modèle échoué (' + resp.status + ')');
      var total = parseInt(resp.headers.get('content-length') || '0', 10);
      if (!resp.body || !total) return resp.arrayBuffer();
      var reader = resp.body.getReader();
      var received = 0;
      var chunks = [];
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            var out = new Uint8Array(received);
            var pos = 0;
            chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
            return out.buffer;
          }
          chunks.push(r.value);
          received += r.value.length;
          if (onProgress) onProgress(Math.round((received / total) * 100));
          return pump();
        });
      })();
    });
  }

  /* Charge un dataUrl en HTMLImageElement. */
  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Image illisible.')); };
      img.src = dataUrl;
    });
  }

  /* Détoure une image (dataUrl) et renvoie un dataUrl PNG transparent. */
  function removeBg(dataUrl, onProgress) {
    return Promise.all([loadSession(onProgress), loadImage(dataUrl)])
      .then(function (res) {
        var ort = res[0].ort, session = res[0].session, img = res[1];
        var W = img.naturalWidth, H = img.naturalHeight;

        // 1) Redimensionne l'image en 1024x1024 pour l'entrée du modèle.
        var rc = document.createElement('canvas');
        rc.width = MODEL_SIZE; rc.height = MODEL_SIZE;
        var rctx = rc.getContext('2d');
        rctx.drawImage(img, 0, 0, MODEL_SIZE, MODEL_SIZE);
        var rgba = rctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;

        // 2) Construit le tenseur CHW normalisé [0..1] (RMBG : mean .5, std 1).
        var area = MODEL_SIZE * MODEL_SIZE;
        var input = new Float32Array(3 * area);
        for (var i = 0; i < area; i++) {
          input[i]            = (rgba[i * 4]     / 255 - 0.5) / 1.0; // R
          input[i + area]     = (rgba[i * 4 + 1] / 255 - 0.5) / 1.0; // G
          input[i + area * 2] = (rgba[i * 4 + 2] / 255 - 0.5) / 1.0; // B
        }
        var tensor = new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]);

        // 3) Inférence. Le nom d'entrée est le 1er attendu par le modèle.
        var feeds = {};
        feeds[session.inputNames[0]] = tensor;
        return session.run(feeds).then(function (results) {
          var mask = results[session.outputNames[0]].data; // 1x1x1024x1024, [0..1]

          // 4) Normalise le masque (min-max) sur [0..1].
          var mn = Infinity, mx = -Infinity;
          for (var k = 0; k < mask.length; k++) {
            if (mask[k] < mn) mn = mask[k];
            if (mask[k] > mx) mx = mask[k];
          }
          var range = (mx - mn) || 1;

          // Courbe de contraste (seuil doux) : élimine les « restes » de fond.
          // - en dessous de LOW  -> transparent (0)
          // - au dessus de HIGH  -> opaque (1)
          // - entre les deux     -> transition lisse (bords propres).
          var LOW = 0.35, HIGH = 0.65;
          function refine(v01) {
            if (v01 <= LOW) return 0;
            if (v01 >= HIGH) return 1;
            var t = (v01 - LOW) / (HIGH - LOW);
            return t * t * (3 - 2 * t); // smoothstep
          }

          // 5) Reprojette le masque 1024x1024 sur un canvas, puis à la taille réelle.
          var mc = document.createElement('canvas');
          mc.width = MODEL_SIZE; mc.height = MODEL_SIZE;
          var mctx = mc.getContext('2d');
          var mImgData = mctx.createImageData(MODEL_SIZE, MODEL_SIZE);
          for (var j = 0; j < area; j++) {
            var norm = (mask[j] - mn) / range;
            var a = Math.round(refine(norm) * 255);
            mImgData.data[j * 4]     = a;
            mImgData.data[j * 4 + 1] = a;
            mImgData.data[j * 4 + 2] = a;
            mImgData.data[j * 4 + 3] = 255;
          }
          mctx.putImageData(mImgData, 0, 0);

          // 6) Compose : image d'origine (taille réelle) + alpha = masque redimensionné.
          var out = document.createElement('canvas');
          out.width = W; out.height = H;
          var octx = out.getContext('2d');
          octx.drawImage(img, 0, 0, W, H);
          var maskResized = document.createElement('canvas');
          maskResized.width = W; maskResized.height = H;
          var mrctx = maskResized.getContext('2d');
          mrctx.drawImage(mc, 0, 0, W, H);
          var alphaData = mrctx.getImageData(0, 0, W, H).data;
          var px = octx.getImageData(0, 0, W, H);
          for (var p = 0; p < W * H; p++) {
            px.data[p * 4 + 3] = alphaData[p * 4]; // alpha depuis le masque
          }
          octx.putImageData(px, 0, 0);
          return out.toDataURL('image/png');
        });
      });
  }

  /* Injecte les styles de la modale (une seule fois). */
  function ensureStyles() {
    if (document.getElementById('conf-bgr-styles')) return;
    var css = ''
      + '.conf-bgr-overlay{position:fixed;inset:0;z-index:100000;display:flex;'
      + 'align-items:center;justify-content:center;background:rgba(15,18,22,.55);'
      + 'backdrop-filter:blur(2px);animation:conf-bgr-fade .18s ease;}'
      + '@keyframes conf-bgr-fade{from{opacity:0}to{opacity:1}}'
      + '.conf-bgr-card{background:#fff;border-radius:16px;width:min(92vw,420px);'
      + 'padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,.28);'
      + 'font-family:inherit;text-align:center;}'
      + '.conf-bgr-title{font-size:16px;font-weight:800;color:#14181c;margin:0 0 6px;}'
      + '.conf-bgr-sub{font-size:12.5px;color:#5b636c;line-height:1.5;margin:0 0 16px;}'
      + '.conf-bgr-preview{width:150px;height:150px;margin:0 auto 16px;border-radius:12px;'
      + 'background-color:#f4f5f7;'
      + 'background-image:conic-gradient(#e9ebee 25%,transparent 0 50%,#e9ebee 0 75%,transparent 0);'
      + 'background-size:22px 22px;display:flex;align-items:center;justify-content:center;'
      + 'overflow:hidden;border:1px solid #eceef1;}'
      + '.conf-bgr-preview img{max-width:100%;max-height:100%;object-fit:contain;display:block;}'
      + '.conf-bgr-actions{display:flex;gap:10px;}'
      + '.conf-bgr-btn{flex:1;padding:11px 12px;border-radius:10px;font-size:13px;'
      + 'font-weight:700;cursor:pointer;border:1.5px solid transparent;transition:.15s;}'
      + '.conf-bgr-btn.secondary{background:#f2f3f5;color:#333;border-color:#e5e7ea;}'
      + '.conf-bgr-btn.secondary:hover{background:#e9ebee;}'
      + '.conf-bgr-btn.primary{background:#14181c;color:#fff;}'
      + '.conf-bgr-btn.primary:hover{background:#000;}'
      + '.conf-bgr-btn:disabled{opacity:.5;cursor:not-allowed;}'
      + '.conf-bgr-spinner{width:46px;height:46px;border-radius:50%;border:4px solid #e5e7ea;'
      + 'border-top-color:#14181c;animation:conf-bgr-spin .8s linear infinite;margin:0 auto;}'
      + '@keyframes conf-bgr-spin{to{transform:rotate(360deg)}}'
      + '.conf-bgr-progress{font-size:12px;color:#5b636c;margin-top:12px;min-height:16px;}'
      + '.conf-bgr-err{font-size:12px;color:#c0392b;margin-top:10px;}';
    var style = document.createElement('style');
    style.id = 'conf-bgr-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* Construit l'overlay + carte. Renvoie {overlay, card, close}. */
  function buildModal() {
    ensureStyles();
    var overlay = document.createElement('div');
    overlay.className = 'conf-bgr-overlay';
    var card = document.createElement('div');
    card.className = 'conf-bgr-card';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    function close() {
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.remove(); }, 160);
    }
    return { overlay: overlay, card: card, close: close };
  }

  /**
   * Point d'entrée : pose la question et renvoie le src final.
   * @param {string} dataUrl - image uploadée (dataURL).
   * @returns {Promise<string>} src final (original ou détouré).
   */
  function ask(dataUrl) {
    return new Promise(function (resolve) {
      var m = buildModal();
      var settled = false;
      function finish(src) {
        if (settled) return;
        settled = true;
        m.close();
        resolve(src);
      }

      // --- Écran 1 : la question ---
      function renderQuestion() {
        m.card.innerHTML = ''
          + '<div class="conf-bgr-preview"><img src="' + dataUrl + '" alt="Aperçu"></div>'
          + '<h3 class="conf-bgr-title">Supprimer l\'arrière-plan ?</h3>'
          + '<p class="conf-bgr-sub">Nous pouvons rendre le fond de votre image transparent, '
          + 'automatiquement. Vous pourrez revenir en arrière.</p>'
          + '<div class="conf-bgr-actions">'
          + '  <button type="button" class="conf-bgr-btn secondary" data-act="no">Non, garder le fond</button>'
          + '  <button type="button" class="conf-bgr-btn primary" data-act="yes">Oui, enlever le fond</button>'
          + '</div>';
        m.card.querySelector('[data-act="no"]').onclick = function () { finish(dataUrl); };
        m.card.querySelector('[data-act="yes"]').onclick = function () { runRemoval(); };
      }

      // --- Écran 2 : traitement (spinner) ---
      function renderLoading() {
        m.card.innerHTML = ''
          + '<div class="conf-bgr-spinner"></div>'
          + '<h3 class="conf-bgr-title" style="margin-top:16px;">Traitement en cours…</h3>'
          + '<p class="conf-bgr-progress" id="conf-bgr-progress">Préparation…</p>';
      }
      function setProgress(txt) {
        var el = document.getElementById('conf-bgr-progress');
        if (el) el.textContent = txt;
      }

      // --- Écran 3 : résultat (avec « Remettre le fond ») ---
      function renderResult(cutoutUrl) {
        m.card.innerHTML = ''
          + '<div class="conf-bgr-preview"><img src="' + cutoutUrl + '" alt="Détouré"></div>'
          + '<h3 class="conf-bgr-title">Arrière-plan supprimé</h3>'
          + '<p class="conf-bgr-sub">Voici le résultat. Vous pouvez le garder ou remettre '
          + 'l\'image d\'origine.</p>'
          + '<div class="conf-bgr-actions">'
          + '  <button type="button" class="conf-bgr-btn secondary" data-act="revert">Remettre le fond</button>'
          + '  <button type="button" class="conf-bgr-btn primary" data-act="keep">Garder</button>'
          + '</div>';
        m.card.querySelector('[data-act="revert"]').onclick = function () { finish(dataUrl); };
        m.card.querySelector('[data-act="keep"]').onclick = function () { finish(cutoutUrl); };
      }

      // --- Erreur : on retombe sur l'original ---
      function renderError(msg) {
        m.card.innerHTML = ''
          + '<h3 class="conf-bgr-title">Traitement impossible</h3>'
          + '<p class="conf-bgr-err">' + (msg || 'Une erreur est survenue.') + '</p>'
          + '<p class="conf-bgr-sub" style="margin-top:8px;">Votre image d\'origine sera '
          + 'utilisée telle quelle.</p>'
          + '<div class="conf-bgr-actions">'
          + '  <button type="button" class="conf-bgr-btn primary" data-act="ok">OK</button>'
          + '</div>';
        m.card.querySelector('[data-act="ok"]').onclick = function () { finish(dataUrl); };
      }

      // Lance le détourage.
      function runRemoval() {
        renderLoading();
        // Réutilise le cache si on retraite exactement la même image.
        if (_lastOriginal === dataUrl && _lastCutout) {
          renderResult(_lastCutout);
          return;
        }
        setProgress('Préparation du modèle…');
        removeBg(dataUrl, function (pct) {
          if (pct >= 100) setProgress('Détourage en cours…');
          else setProgress('Chargement du modèle… ' + pct + '%');
        }).then(function (cutoutUrl) {
          _lastOriginal = dataUrl;
          _lastCutout = cutoutUrl;
          renderResult(cutoutUrl);
        }).catch(function (err) {
          console.warn('[bg-removal] échec :', err);
          renderError(err && err.message);
        });
      }

      renderQuestion();
    });
  }

  window.ConfBgRemoval = { ask: ask };
})();
