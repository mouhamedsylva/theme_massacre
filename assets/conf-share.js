/**
 * conf-share.js — Menu de partage du design + liste dépliable de la
 * section « Personnalisation ».
 *
 * Extrait de configurateur.liquid : ce fichier frôlait la limite Shopify de
 * 256 Ko par template, ce qui bloquait tout déploiement. Un asset n'a pas
 * cette limite et est mis en cache séparément.
 */
(function () {
  'use strict';
    function openShareMenu(url, text, mode) {
      const old = document.getElementById('share-menu');
      if (old) old.remove();

      var isSave = (mode === 'save');
      var isInvite = (mode === 'invite') || isSave; // save = même flux (lien de reprise)
      const enc = encodeURIComponent;
      var subject = isSave ? 'Mon design sauvegardé' : (isInvite ? 'Personnalisez ce design avec moi' : 'Mon design personnalisé');
      const waHref = 'https://wa.me/?text=' + enc(text + ' ' + url);
      const mailHref = 'https://mail.google.com/mail/?view=cm&fs=1&su=' +
        enc(subject) + '&body=' + enc(text + '\n' + url);

      var title = isSave ? 'Design sauvegardé' : (isInvite ? 'Inviter à éditer' : 'Partager mon design');
      var copyLabel = isInvite ? 'Copier le lien' : 'Copier le lien de l\'image';
      // Bloc "Inviter" (mode image) OU bouton "retour" (mode invite, pas save).
      var extraBlock = isInvite
        ? (isSave ? '' : '<button type="button" id="share-back-btn" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px;border:none;border-radius:10px;background:#f0f0f0;cursor:pointer;color:#333;font-weight:600;font-family:inherit;margin-top:4px;"><span style="font-size:18px;">←</span> Retour au partage d\'image</button>')
        : '<div style="border-top:1px solid #eee;margin:6px 0 12px;"></div>' +
          '<button type="button" id="share-invite-btn" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px;border:none;border-radius:10px;background:#1a1a1a;cursor:pointer;color:#fff;font-weight:700;font-family:inherit;"><span style="font-size:20px;">✉️</span> Inviter une personne à éditer</button>' +
          '<p style="font-size:11px;color:#888;margin-top:8px;line-height:1.4;">La personne invitée ouvrira le configurateur avec votre design en cours (modifiable).</p>';

      const overlay = document.createElement('div');
      overlay.id = 'share-menu';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:24px;max-width:380px;width:90%;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="font-size:16px;">${title}</strong>
            <button type="button" onclick="document.getElementById('share-menu').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;">✕</button>
          </div>
          ${isInvite ? ('<p style="font-size:12px;color:#16a34a;margin:0 0 14px;font-weight:600;">✓ ' + (isSave ? 'Lien de reprise prêt (envoyez-le-vous)' : 'Lien d\'invitation prêt à envoyer') + '</p>') : '<div style="margin-bottom:10px;"></div>'}
          <a href="${waHref}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #e8e8e8;border-radius:10px;text-decoration:none;color:#1a1a1a;margin-bottom:10px;font-weight:600;">
            <span style="font-size:20px;">🟢</span> WhatsApp
          </a>
          <a href="${mailHref}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #e8e8e8;border-radius:10px;text-decoration:none;color:#1a1a1a;margin-bottom:10px;font-weight:600;">
            <span style="font-size:20px;">✉️</span> Gmail
          </a>
          <button type="button" id="share-copy-btn" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px;border:1px solid #e8e8e8;border-radius:10px;background:#fff;cursor:pointer;color:#1a1a1a;font-weight:600;font-family:inherit;margin-bottom:10px;">
            <span style="font-size:20px;">🔗</span> ${copyLabel}
          </button>
          ${extraBlock}
        </div>`;
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);

      const copyBtn = document.getElementById('share-copy-btn');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.innerHTML = '<span style="font-size:20px;">✅</span> Lien copié !';
        } catch (e) {
          confPrompt('Copiez le lien ci-dessous :', { defaultValue: url, icon: 'info', title: 'Lien', confirmText: 'Fermer' });
        }
      });

      if (isInvite) {
        // Retour au menu image.
        var backBtn = document.getElementById('share-back-btn');
        if (backBtn) backBtn.addEventListener('click', function () { openShareMenu(window.__lastImageUrl || url, "Découvrez mon design personnalisé :", 'image'); });
      } else {
        // Mémorise l'URL image pour le retour, et branche le bouton Inviter.
        window.__lastImageUrl = url;
        var inviteBtn = document.getElementById('share-invite-btn');
        inviteBtn.addEventListener('click', async () => {
          var orig = inviteBtn.innerHTML;
          inviteBtn.disabled = true;
          inviteBtn.innerHTML = '<span style="font-size:20px;">⏳</span> Génération du lien…';
          try {
            var inviteUrl = await createInviteLink();
            // Rouvre le menu en mode INVITE : WhatsApp/Gmail/Copier -> lien d'invitation.
            openShareMenu(inviteUrl, "Personnalisez ce design avec moi :", 'invite');
          } catch (err) {
            inviteBtn.disabled = false;
            inviteBtn.innerHTML = orig;
            confAlert('Impossible de générer le lien d\'invitation.\n' + (err && err.message ? err.message : err), { icon: 'error', title: 'Invitation' });
          }
        });
      }
    }

    function textZoneImage(zoneId, imgBox, layerBox, canReproject) {
      var el = document.getElementById(zoneId);
      if (!el || el.style.display === 'none') return null;
      var content = el.querySelector('.dt-content');
      if (!content) return null;
      var raw = (content.textContent || '').trim();
      if (!raw) return null;

      return new Promise(function (resolve) {
        // Dimensions écran de la zone de texte (pour reprojeter comme un logo).
        var pct = function (v) {
          if (typeof v !== 'string') return null;
          var m = v.trim().match(/^([\d.]+)%$/);
          return m ? parseFloat(m[1]) / 100 : null;
        };
        var geo;
        if (canReproject) {
          var r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            geo = {
              x: (r.left - imgBox.left) / imgBox.width,
              y: (r.top - imgBox.top) / imgBox.height,
              w: r.width / imgBox.width
            };
          }
        }
        if (!geo) {
          /* Repli (vue masquée) : reprojection depuis les % inline.
             La largeur peut avoir été déplacée vers max-width par fitTextBox()
             — la boîte épouse alors le texte — d'où la lecture de data-w, qui
             conserve la valeur d'origine. */
          var rawW = el.getAttribute('data-w') || el.style.width || el.style.maxWidth;
          var lx = pct(el.style.left), ly = pct(el.style.top), lw = pct(rawW);
          if (lx == null || ly == null || lw == null) { resolve(null); return; }
          geo = { x: lx, y: ly, w: lw };
        }

        var cs = window.getComputedStyle(el);
        var color = cs.color || '#111';
        var fontFamily = cs.fontFamily || 'sans-serif';
        var shaped = el.classList.contains('is-shaped');

        // Texte courbé : on rasterise le SVG déjà rendu dans .dt-content.
        var svg = content.querySelector('svg');
        if (shaped && svg) {
          var clone = svg.cloneNode(true);
          // Fige une taille de rendu nette.
          clone.setAttribute('width', '600');
          clone.setAttribute('height', '180');
          var xml = new XMLSerializer().serializeToString(clone);
          var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
          var im = new Image();
          im.onload = function () {
            var cv = document.createElement('canvas');
            cv.width = 600; cv.height = 180;
            cv.getContext('2d').drawImage(im, 0, 0, 600, 180);
            try { resolve({ src: cv.toDataURL('image/png'), x: geo.x, y: geo.y, w: geo.w }); }
            catch (e) { resolve(null); }
          };
          im.onerror = function () { resolve(null); };
          im.src = url;
          return;
        }

        // Texte simple : dessin canvas 2D haute résolution.
        var fontSize = 160;
        var font = '700 ' + fontSize + 'px ' + fontFamily;
        var meas = document.createElement('canvas').getContext('2d');
        meas.font = font;
        var tw = Math.max(1, meas.measureText(raw).width);
        var padX = fontSize * 0.15, padY = fontSize * 0.35;
        var cv = document.createElement('canvas');
        cv.width = Math.ceil(tw + padX * 2);
        cv.height = Math.ceil(fontSize + padY * 2);
        var ctx = cv.getContext('2d');
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(raw, cv.width / 2, cv.height / 2);
        try { resolve({ src: cv.toDataURL('image/png'), x: geo.x, y: geo.y, w: geo.w }); }
        catch (e) { resolve(null); }
      });
    }

  window.textZoneImage = textZoneImage;
  window.openShareMenu = openShareMenu;
})();

/* ── Section « Personnalisation » : liste dépliable ──────────────────────
   Ouvre une ligne et referme les autres : une seule zone de travail à la
   fois, ce qui garde la barre latérale courte et lisible. */
(function () {
  'use strict';
  window.togglePerso = function (id) {
    var el = document.getElementById('pi-' + id);
    if (!el) return;
    var open = el.classList.contains('open');
    document.querySelectorAll('.perso-item.open').forEach(function (n) {
      if (n !== el) n.classList.remove('open');
    });
    el.classList.toggle('open', !open);
  };

  /* -- Application d'un design dans l'interface (upload + restauration) --
     Extrait de configurateur.liquid (limite Shopify de 256 Ko par template).
     Ne lit aucun etat du template : ses seules dependances sont des fonctions
     exposees sur window (clamps, thumbs, placeLogoInZone, setTextEnabled...). */
    function applyUpload(zone, src) {
      {

        // Si c'est un upload de coin
        if (zone === 'c') {
          // Preview dans la sidebar
          const prev = document.getElementById('pc');
          const img  = document.getElementById('ic');
          const lbl  = document.getElementById('lc');
          if (prev && img) { img.src = src; prev.style.display = 'block'; }
          if (lbl) lbl.style.display = 'flex';

          /* Aperçu dans le panneau Upload moderne : vignette du fichier
             envoyé + bouton Supprimer. La sidebar d'origine avait son propre
             bloc (#pc/#ic/#lc), remplacé par celui-ci. */
          showUpPreview('patch-preview', 'patch-preview-img', src);

          // Le patch est occupé : son repère de zone s'efface.
          if (typeof window.updatePatchZoneGuide === 'function') {
            window.updatePatchZoneGuide();
          }


          // Afficher dans le canvas circulaire (logo déplaçable/redimensionnable)
          const coinsCanvas = document.getElementById('coins-canvas');
          const coinsPreviewImg = document.getElementById('coins-preview-img');
          const patchLogo = document.getElementById('patch-logo');
          if (coinsPreviewImg) coinsPreviewImg.src = src;
          if (patchLogo) patchLogo.style.display = 'block';
          if (coinsCanvas) {
            coinsCanvas.classList.add('has-image');
            // Masquer le placeholder
            const ph = coinsCanvas.querySelector('.coins-placeholder');
            if (ph) ph.style.display = 'none';
          }
          // Le visuel uploadé garde sa taille par défaut (70 %) : on le ramène
          // dans la zone imprimable de la forme. Différé jusqu'au 'load' :
          // la hauteur réelle — donc le ratio — n'est connue qu'ensuite.
          /* reset = true seulement pour un VRAI upload. À la restauration, le
             recadrage et le zoom du client doivent survivre : ces rappels sont
             différés et partent APRÈS applyUploadGeo, qui vient justement de
             les reposer. Le drapeau est capturé ici — il repasse à false avant
             que les callbacks ne s'exécutent. */
          var freshUpload = !window.__restoringUploads;
          if (typeof window.clampPatchLogo === 'function') {
            setTimeout(function () { window.clampPatchLogo(freshUpload); }, 80);
          }
          if (coinsPreviewImg) {
            coinsPreviewImg.addEventListener('load', function onceLoaded() {
              coinsPreviewImg.removeEventListener('load', onceLoaded);
              if (typeof window.clampPatchLogo === 'function') window.clampPatchLogo(freshUpload);
              if (typeof window.updatePatchRecapThumb === 'function') window.updatePatchRecapThumb();
            });
          }
          // Recap - miniature : image du patch (forme + couleur) + logo positionné.
          window.updatePatchRecapThumb();

          return;
        }

        // Si c'est un upload de coin métallique (recto / verso)
        if (zone === 'coin-recto' || zone === 'coin-verso') {
          const face = zone === 'coin-recto' ? 'recto' : 'verso';

          // Logo déplaçable/redimensionnable sur la pièce
          const logo = document.getElementById('coin-logo-' + face);
          if (logo) {
            const limg = logo.querySelector('img');
            if (limg) limg.src = src;
            logo.style.display = 'block';
            // À l'upload, le visuel remplit toute la zone frappée et se centre.
            // À la RESTAURATION, on se contente de le borner : sa géométrie
            // sauvegardée doit être respectée. Le drapeau est capturé ici, car
            // il est remis à false avant que les callbacks différés ne partent.
            /* Le motif REMPLIT la zone frappée et déborde (le surplus est
               rogné par le disque), comme sur les patchs et les drapeaux.
               En mode « découpé », setCoinCover() ne fait rien : la pièce
               épouse le contour du design, il n'y a plus de zone à couvrir —
               on retombe alors sur le bornage d'origine. */
            const fillZone = !window.__restoringUploads;
            const applyCoinCover = function () {
              if (typeof window.setCoinCover === 'function') {
                if (fillZone) window.setCoinCover(face);
                else if (typeof window.syncCoinCrop === 'function') window.syncCoinCrop(face);
              }
              if (typeof window.clampCoinLogo === 'function' &&
                  document.querySelector('.coin-disc.shape-decoupe')) {
                window.clampCoinLogo(face, fillZone);
              }
            };
            setTimeout(applyCoinCover, 80);
            if (limg) limg.addEventListener('load', applyCoinCover, { once: true });
            // Mode « découpé à la forme » déjà actif : le nouveau visuel doit
            // être détouré, sinon la pièce prendrait la forme de son rectangle.
            const inDecoupe = document.querySelector('.coin-disc.shape-decoupe');
            if (inDecoupe && !window.__restoringUploads &&
                typeof window.applyDecoupeShape === 'function') {
              setTimeout(function () { window.applyDecoupeShape(); }, 120);
            }
          }

          // Afficher le logo recto aussi sur la vue de côté (aperçu)
          if (face === 'recto') {
            const coteLogo = document.getElementById('coin-cote-logo');
            if (coteLogo) { coteLogo.src = src; coteLogo.style.display = 'block'; }
          }

          // Aperçu dans le panneau Upload (vignette + bouton Supprimer)
          showUpPreview('coin-preview-' + face, 'coin-preview-img-' + face, src);

          // La face est occupée : son repère de zone s'efface.
          if (typeof window.updateCoinZoneGuides === 'function') {
            window.updateCoinZoneGuides();
          }

          // Vignette du récap : recto composé (disque + logo), temps réel.
          window.updateCoinRecapThumb();
          return;
        }

        // Si c'est un upload de drapeau (recto / verso)
        if (zone === 'flag-recto' || zone === 'flag-verso') {
          const wrap = document.getElementById(zone);
          if (wrap) {
            // Masquer les placeholders (3D + 2D)
            wrap.querySelectorAll('.flag-canvas-placeholder').forEach(ph => ph.style.display = 'none');
            // Mettre l'image dans toutes les zones design (3D déplaçable + 2D codé)
            wrap.querySelectorAll('.flag-design-img').forEach(img => { img.src = src; img.style.display = 'block'; });
          }
          // Afficher le logo déplaçable (vue 3D)
          const face = zone === 'flag-recto' ? 'recto' : 'verso';
          const dragLogo = document.getElementById('flag-logo-' + face);
          if (dragLogo) dragLogo.style.display = 'block';
          /* Le design REMPLIT la zone imprimable et déborde (le surplus est
             rogné), comme sur les patchs : plus de vide autour d'un visuel
             posé en « contain ». Le client recadre en glissant, agrandit au
             double-clic. Différé : la boîte de l'image doit être connue.
             À la RESTAURATION, on ne repose pas le cadrage plein — la
             géométrie sauvegardée vient d'être appliquée. */
          const freshFlag = !window.__restoringUploads;
          const applyCover = function () {
            if (typeof window.setFlagCover !== 'function') return;
            if (freshFlag) window.setFlagCover(face);
            else if (typeof window.syncFlagCrop === 'function') window.syncFlagCrop(face);
          };
          setTimeout(applyCover, 80);
          const fimg = dragLogo && dragLogo.querySelector('.flag-design-img');
          if (fimg) fimg.addEventListener('load', applyCover, { once: true });

          // Aperçu dans le panneau Upload (vignette + bouton Supprimer)
          showUpPreview('flag-preview-' + face, 'flag-preview-img-' + face, src);

          // La face est occupée : son repère de zone s'efface.
          if (typeof window.updateFlagZoneGuides === 'function') {
            window.updateFlagZoneGuides();
          }
          // Miniature du récap (recto uniquement) : drapeau + logo positionné.
          if (zone === 'flag-recto') {
            window.updateFlagRecapThumb();
          }
          return;
        }

        /* Logo et texte COEXISTENT sur la poitrine.
           L'ancien code supprimait le texte de la zone à l'upload (règle
           « un seul élément par emplacement », héritée d'une zone poitrine
           unique). Le bandeau accueille désormais deux emplacements libres et
           le client positionne logo et texte où il veut : effacer sa saisie
           n'a plus lieu d'être — et se faisait sans avertissement. */

        // Sidebar preview (textiles) — ancienne sidebar, masquée mais conservée.
        const prev = document.getElementById('p' + zone);
        const img  = document.getElementById('i' + zone);
        const lbl  = document.getElementById('l' + zone);
        if (prev && img) { img.src = src; prev.style.display = 'block'; }
        if (lbl)          lbl.style.display = 'flex';

        // Aperçu du panneau Upload moderne (vignette + bouton Supprimer).
        showUpPreview('up-preview-' + zone, 'up-preview-img-' + zone, src);

        // SVG overlay
        const ov = document.getElementById('ov-' + zone);
        if (ov) { ov.setAttribute('href', src); ov.style.display = 'block'; }

        // Logos manches déplaçables. Chaque manche a désormais SA vue : le
        // profil est le même retourné en miroir, et [data-side] n'affiche que
        // le côté courant. La manche droite n'était pas rendue du tout
        // auparavant — un upload dessus restait invisible.
        if (zone === 'sl' || zone === 'sr') {
          const logo = document.getElementById('logo-' + zone);
          if (logo) {
            const limg = logo.querySelector('img');
            if (limg) limg.src = src;
            logo.style.display = 'block';
          }
          // Le logo "-face" conserve l'asset (compat récap/export) mais reste
          // masqué : les manches ne s'affichent plus en vue de face.
          const logoFace = document.getElementById('logo-' + zone + '-face');
          if (logoFace) {
            const limg2 = logoFace.querySelector('img');
            if (limg2) limg2.src = src;
            logoFace.style.display = 'none';
          }
          const rcS = document.getElementById('rc-sleeves');
          if (rcS) rcS.style.display = 'flex';
          if (typeof window.updateSleeveSurcharge === 'function') window.updateSleeveSurcharge();

          // Placement auto dans la zone de la manche concernée.
          // Pas à la restauration : la géométrie sauvegardée ferait foi et
          // serait écrasée par ce recentrage (voir zone 'b').
          if (!window.__restoringUploads) window.placeLogoInZone(zone);

          // La rotation vers la bonne manche est déclenchée par doUpload
          // (showSleeve), qui passe en vue de côté puis pivote. On ne bascule
          // pas ici : applyUpload sert aussi à la RESTAURATION au rechargement,
          // et le vêtement se mettrait à tourner tout seul.
        }

        // Logos poitrine déplaçables (vue de face) + bascule auto vers la face.
        // 'f' = cœur (gauche du porteur), 'fr' = poitrine droite : même
        // traitement, seul l'id du calque change.
        if (zone === 'f' || zone === 'fr') {
          // Voir la zone 'b' : à la restauration, la géométrie sauvegardée
          // prime sur le placement automatique.
          const restoringF = !!window.__restoringUploads;
          const logo = document.getElementById('logo-' + zone);
          if (logo) {
            const limg = logo.querySelector('img');
            if (limg) {
              limg.src = src;
              // Placement auto dans la zone dès que l'image est chargée (ratio connu).
              if (!restoringF) {
                limg.onload = function () { window.placeLogoInZone(zone); };
              }
            }
            logo.style.display = 'block';
          }
          if (!restoringF) window.placeLogoInZone(zone);
          // Aperçu temps réel dans la vignette récap
          window.updateRecapThumbLogo();
          if (!restoringF) {
            // Basculer vers la vue de face pour positionner le logo
            const faceBtn = document.querySelector('.vt[onclick*="face"]');
            if (faceBtn && typeof selView === 'function') {
              selView(faceBtn, 'face');
            }
          }
        }

        // Logo dos déplaçable sur le produit + bascule automatique vers la vue de dos
        if (zone === 'b') {
          /* RESTAURATION : la géométrie sauvegardée fait foi. placeLogoInZone()
             recentre le logo dans sa zone — appelé ici, il écrasait la position
             que le client avait réglée, et le logo semblait « perdu » au retour
             depuis le récapitulatif. Le onload le rappelait même APRÈS
             applyUploadGeo(), en asynchrone : la position restaurée ne tenait
             pas une frame. */
          const restoring = !!window.__restoringUploads;
          const logo = document.getElementById('logo-b');
          if (logo) {
            const limg = logo.querySelector('img');
            if (limg) {
              limg.src = src;
              if (!restoring) {
                limg.onload = function () { window.placeLogoInZone('b'); };
              }
            }
            logo.style.display = 'block';
          }
          if (!restoring) {
            window.placeLogoInZone('b');
            // Basculer vers la vue de dos pour que le client positionne le logo.
            // Pas à la restauration : la vue sauterait au chargement de la page.
            const dosBtn = document.querySelector('.vt[onclick*="dos"]');
            if (dosBtn && typeof selView === 'function') {
              selView(dosBtn, 'dos');
            }
          }
        }

        /* Lignes du récap. Elles vivent dans .recap, dont l'innerHTML est
           remplacé pour les coins/drapeaux/patchs : absentes hors layout
           textile. applyUpload() est appelée pour TOUS les produits — sans
           garde, une TypeError interrompait la pose du design lui-même. */
        if (zone === 'f') {
          var imgF = document.getElementById('rc-img-f');
          var front = document.getElementById('rc-front');
          if (imgF) imgF.src = src;
          if (front) front.style.display = 'flex';
        }
        if (zone === 'b') {
          var imgB = document.getElementById('rc-img-b');
          var back = document.getElementById('rc-back');
          if (imgB) imgB.src = src;
          if (back) back.style.display = 'flex';
        }
      }
    }
  window.applyUpload = applyUpload;

  /* Applique une géométrie sauvegardée (left/top/width) au(x) logo(s) d'une
     zone. Déplacée depuis configurateur.liquid (limite Shopify de 256 Ko).
     Ne dépend que du DOM : rien à exposer côté template. */
  function applyUploadGeo(zone, geo) {
    var ids = {
      'f': ['logo-f'],
      /* Le patch garde sa LARGEUR (100 %, il couvre la forme) mais son
         left/top est restaurable : c'est le recadrage choisi par le client.
         Ce cas était ignoré à l'époque où le design n'était pas déplaçable. */
      'c': ['patch-logo'],
      'fr': ['logo-fr'],
      'b': ['logo-b'],
      'sl': ['logo-sl', 'logo-sl-face'],
      'sr': ['logo-sr', 'logo-sr-face'],
      'coin-recto': ['coin-logo-recto'],
      'coin-verso': ['coin-logo-verso'],
      'flag-recto': ['flag-logo-recto'],
      'flag-verso': ['flag-logo-verso']
    }[zone] || [];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (geo.left != null) el.style.left = geo.left;
      if (geo.top != null) el.style.top = geo.top;
      /* Largeur restaurée pour toutes les zones, patch compris : elle porte
         désormais son niveau de zoom (≥ 100 %). Elle était exclue quand le
         design du patch n'était ni déplaçable ni redimensionnable. */
      if (geo.width != null) el.style.width = geo.width;
      /* Hauteur : enregistrée pour les designs en couverture (coins,
         drapeaux), où elle porte le zoom comme la largeur. Absente pour les
         logos ordinaires, qui gardent leur ratio naturel. */
      if (geo.height) el.style.height = geo.height;
    });
  }
  window.applyUploadGeo = applyUploadGeo;

  /* ══════════════════════════════════════════════════════════════════
     APERÇUS D'UPLOAD (panneau moderne)
     Le client doit voir CE qu'il a envoyé, pas seulement qu'un envoi a
     eu lieu. Une vignette + un bouton Supprimer par zone.
     ══════════════════════════════════════════════════════════════════ */

  /**
   * Affiche l'aperçu d'une zone.
   * @param {string} boxId - Conteneur de l'aperçu.
   * @param {string} imgId - <img> de la vignette.
   * @param {string} src   - Image (data URL ou URL distante).
   */
  function showUpPreview(boxId, imgId, src) {
    const img = document.getElementById(imgId);
    if (img) img.src = src;
    const box = document.getElementById(boxId);
    if (box) box.style.display = 'flex';
  }
  window.showUpPreview = showUpPreview;

  /**
   * Masque l'aperçu d'une zone et vide sa vignette.
   * @param {string} boxId - Conteneur de l'aperçu.
   * @param {string} imgId - <img> de la vignette.
   */
  function hideUpPreview(boxId, imgId) {
    const img = document.getElementById(imgId);
    if (img) img.src = '';
    const box = document.getElementById(boxId);
    if (box) box.style.display = 'none';
  }
  window.hideUpPreview = hideUpPreview;

  /* ══════════════════════════════════════════════════════════════════
     rmUp() — retire le design d'une zone (UI + persistance).
     Déplacée ici depuis configurateur.liquid, qui atteignait la limite
     Shopify de 256 Ko par template (même raison qu'applyUpload).
     Les dépendances vivent dans le template et sont appelées via
     window.* : elles y sont exposées explicitement.
     ══════════════════════════════════════════════════════════════════ */
  function rmUp(zone) {
    // Retirer de la persistance
    if (typeof window.removeUpload === 'function') window.removeUpload(zone);

    /* Coins et drapeaux : la remise à zéro (logo, vue de côté, vignette du
       récap, bouton Supprimer, input fichier) est déjà écrite dans leurs
       modules. Sans cette délégation, le bouton « × » du logo n'atteignait
       aucune branche ici et ne supprimait donc rien à l'écran. */
    if (zone === 'coin-recto' || zone === 'coin-verso') {
      if (typeof window.removeCoinLogo === 'function') {
        window.removeCoinLogo(zone === 'coin-recto' ? 'recto' : 'verso');
      }
      return;
    }
    if (zone === 'flag-recto' || zone === 'flag-verso') {
      if (typeof window.removeFlagDesign === 'function') {
        window.removeFlagDesign(zone === 'flag-recto' ? 'recto' : 'verso');
      }
      return;
    }

    // Patch (zone unique 'c')
    if (zone === 'c') {
      const prev = document.getElementById('pc');
      const img = document.getElementById('ic');
      const lbl = document.getElementById('lc');
      const input = document.getElementById('uc');

      if (img) img.src = '';
      if (prev) prev.style.display = 'none';
      if (lbl) lbl.style.display = 'none';
      if (input) input.value = '';

      // Aperçu du panneau Upload moderne.
      hideUpPreview('patch-preview', 'patch-preview-img');

      // Patch redevenu vide : son repère de zone réapparaît.
      if (typeof window.updatePatchZoneGuide === 'function') {
        window.updatePatchZoneGuide();
      }

      // Cacher dans le canvas (logo déplaçable) + réafficher le placeholder
      const coinsCanvas = document.getElementById('coins-canvas');
      const coinsPreviewImg = document.getElementById('coins-preview-img');
      const patchLogo = document.getElementById('patch-logo');
      if (coinsCanvas) {
        coinsCanvas.classList.remove('has-image');
        const ph = coinsCanvas.querySelector('.coins-placeholder');
        if (ph) ph.style.display = '';
      }
      if (coinsPreviewImg) coinsPreviewImg.src = '';
      if (patchLogo) {
        patchLogo.style.display = 'none';
        // Le design remplit toute la forme (rogné par .patch-body) : on remet
        // la pleine dimension, pas l'ancien cadrage à 70 %.
        patchLogo.style.left = '0%';
        patchLogo.style.top = '0%';
        patchLogo.style.width = '100%';
        patchLogo.style.height = '';
      }
      // Réinitialiser la miniature du récap
      const recapThumb = document.getElementById('coins-recap-thumb');
      if (recapThumb) {
        recapThumb.innerHTML =
          '<svg width="60" height="60" viewBox="0 0 24 24" fill="#ccc">' +
          '<circle cx="12" cy="12" r="10" fill="none" stroke="#ccc" stroke-width="2"/>' +
          '<path d="M12 8v8M8 12h8" stroke="#ccc" stroke-width="2"/></svg>';
      }
      return;
    }

    // Textiles — aperçus de l'ancienne sidebar (masquée mais conservée).
    ['p', 'i', 'l'].forEach(function (pfx) {
      const el = document.getElementById(pfx + zone);
      if (!el) return;
      if (pfx === 'i') el.src = '';
      else el.style.display = 'none';
    });

    // Aperçu du panneau Upload moderne.
    hideUpPreview('up-preview-' + zone, 'up-preview-img-' + zone);
    const input = document.getElementById('u' + zone);
    if (input) input.value = '';
    const ov = document.getElementById('ov-' + zone);
    if (ov) { ov.removeAttribute('href'); ov.style.display = 'none'; }

    // Cacher le(s) logo(s) déplaçable(s) correspondant(s) sur le produit
    ['logo-' + zone, 'logo-' + zone + '-face'].forEach(function (id) {
      const logo = document.getElementById(id);
      if (logo) {
        const limg = logo.querySelector('img');
        if (limg) limg.src = '';
        logo.style.display = 'none';
      }
    });

    if (zone === 'f' || zone === 'fr') {
      if (zone === 'f') {
        const rcFront = document.getElementById('rc-front');
        if (rcFront) rcFront.style.display = 'none';
      }
      // Le logo est retiré : réautoriser l'ajout de texte sur CETTE zone.
      if (typeof window.setTextEnabled === 'function') {
        window.setTextEnabled(zone, true);
      }
    }
    if (zone === 'b') {
      const rcBack = document.getElementById('rc-back');
      if (rcBack) rcBack.style.display = 'none';
    }
    if (zone === 'sl' || zone === 'sr') {
      const slEl = document.getElementById('isl');
      const srEl = document.getElementById('isr');
      const slSrc = slEl && slEl.src;
      const srSrc = srEl && srEl.src;
      if (!slSrc && !srSrc) {
        const rcSleeves = document.getElementById('rc-sleeves');
        if (rcSleeves) rcSleeves.style.display = 'none';
      }
      // Le supplément suit le nombre de manches restantes.
      if (typeof window.updateSleeveSurcharge === 'function') {
        window.updateSleeveSurcharge();
      }
    }
    // Mettre à jour l'aperçu temps réel de la vignette récap (logo cœur)
    if (typeof window.updateRecapThumbLogo === 'function') {
      window.updateRecapThumbLogo();
    }
    // Réafficher les zones guides dont le logo a été retiré.
    if (typeof window.refreshZoneGuides === 'function') {
      window.refreshZoneGuides();
    }
  }
  window.rmUp = rmUp;

})();
