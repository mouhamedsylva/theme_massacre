    /* ══════════════════ CONVENTION : les `catch (e) {}` vides ═══════════════
       Ce fichier en compte une trentaine. Ils sont volontaires, et réservés à
       UN seul cas : les accès à sessionStorage, qui lèvent une exception en
       navigation privée Safari ou lorsque les cookies sont bloqués. Un design
       non mémorisé y est un désagrément, pas une panne : l'aperçu reste juste.

       Partout ailleurs, un échec doit laisser une trace (`console.warn`) — il
       masque sinon une panne réelle derrière une interface silencieusement
       incohérente. Les cas qui le méritaient ont été traités :
         • écriture du design PARTAGÉ en session (le destinataire verrait un
           configurateur vide sans explication) ;
         • génération de la vignette de devis (l'atelier recevrait une demande
           sans visuel) ;
         • dépassement de quota à l'upload -> writeUploadStore(), qui distingue
           QuotaExceededError et prévient le client.

       Restent muets, à dessein : lecture de `location.search` (URL exotique),
       `history.replaceState` (cosmétique), `navigator.clipboard` (dont l'échec
       est déjà rattrapé par un repli visible à l'écran).

       En ajouter un ailleurs demande de se poser la question : « si ceci
       échoue en production, veut-on le savoir ? » */

    /* ═══════════════════ LISTE MULTI-PERSONNES (textiles) ═══════════════════
       Design commun (créé dans le configurateur) + une ligne par personne :
       taille, couleur, nom floqué optionnel. Sortie = ajout au panier (une
       ligne de panier par personne), jamais un devis. */

    /* Tailles disponibles : lues depuis le sidebar (.sb) pour rester synchronisées
       si on modifie la liste. Repli sur les tailles standard. */
    function grpSizes() {
      var btns = document.querySelectorAll('.sb');
      var out = [];
      btns.forEach(function (b) {
        var t = (b.textContent || '').trim();
        if (t) out.push(t);
      });
      return out.length ? out : ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    }
    window.grpSizes = grpSizes;     // conf-group-csv.js

    /* Couleurs disponibles : lues depuis les swatches (.cs) — nom (title) + hex. */
    function grpColors() {
      var sw = document.querySelectorAll('.txt-color-swatches .cs, .cs');
      var out = [];
      sw.forEach(function (s) {
        var name = s.getAttribute('title');
        var hex = (s.style.background || s.style.backgroundColor || '').trim();
        if (name && hex) out.push({ name: name, hex: hex });
      });
      // Dé-doublonne par nom.
      var seen = {}, uniq = [];
      out.forEach(function (c) { if (!seen[c.name]) { seen[c.name] = 1; uniq.push(c); } });
      return uniq.length ? uniq : [{ name: 'Black', hex: '#0a0a0a' }];
    }
    window.grpColors = grpColors;   // conf-group-csv.js

    /* Taille / couleur actuellement sélectionnées dans le sidebar (valeurs par
       défaut d'une nouvelle ligne). */
    function grpCurrentSize() {
      var on = document.querySelector('.sb.on');
      return on ? on.textContent.trim() : 'M';
    }
    function grpCurrentColor() {
      return (typeof currentColorName !== 'undefined' && currentColorName) || 'Black';
    }

    var grpRowSeq = 0;

    /* Ouvre la modale « plusieurs surnoms ». Une liste déjà validée est
       RECHARGÉE (badge vert) : on corrige une taille sans tout ressaisir.
       On repart de zéro, le tableau pouvant garder des lignes abandonnées. */
    function openGroupOrder() {
      var ov = document.getElementById('grp-overlay');
      if (!ov) return;
      var tbody = document.getElementById('grp-rows');
      if (tbody) {
        if (groupOrderRows && groupOrderRows.length) {
          tbody.innerHTML = '';
          /* deferTotals : le total est calculé une fois après la boucle (plus
             bas), pas à chaque ligne restaurée. Une liste de 200 personnes
             rouvrait sinon la modale avec un temps d'attente visible. */
          groupOrderRows.forEach(function (r) { grpAddRow(r, true); });
        } else if (!tbody.children.length) {
          grpAddRow(); grpAddRow();        // deux lignes pour démarrer
        }
      }
      ov.classList.add('open');
      document.body.style.overflow = 'hidden';
      grpUpdateTotals();
    }
    function closeGroupOrder() {
      var ov = document.getElementById('grp-overlay');
      if (ov) ov.classList.remove('open');
      document.body.style.overflow = '';
    }

    /* Échappement HTML pour interpolation dans du balisage construit à la main.
       Les guillemets DOIVENT être couverts : ces valeurs atterrissent dans des
       attributs `value="…"`, où un simple `"` referme l'attribut et permet
       d'injecter `onfocus=…`. Le nom floqué est saisi par le client ou importé
       d'un CSV fourni par lui, et la liste est persistée en session : sans cet
       échappement, la charge utile survivait au rechargement.
       Exposée sur window : conf-group-csv.js s'en sert pour ses messages. */
    function grpEsc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    window.grpEsc = grpEsc;

    /* URL d'image sûre pour un attribut `src` construit à la main.

       grpEsc() ne suffit pas ici : il neutralise les guillemets, donc
       l'évasion d'attribut, mais `javascript:alert(1)` ne contient ni
       guillemet ni chevron — il passerait intact et s'exécuterait au clic.
       Les vignettes du panier sont des data-URL générées par le canvas, mais
       elles transitent par `conf_cart` en sessionStorage : leur valeur est
       modifiable côté client.

       Liste blanche de protocoles plutôt que liste noire : `data:image/`,
       `http(s):` et les chemins relatifs (assets Shopify) couvrent tous les
       usages réels. Tout le reste retombe sur une image vide plutôt que sur
       une URL douteuse — la vignette manque, le panier reste utilisable. */
    function safeImgSrc(u) {
      var s = String(u == null ? '' : u).trim();
      var ok = /^data:image\//i.test(s) ||
               /^https?:\/\//i.test(s) ||
               /^\/[^\/]/.test(s) ||          // chemin absolu du domaine
               /^[\w.\-]+\.(png|jpe?g|webp|svg|gif)(\?.*)?$/i.test(s);
      return ok ? grpEsc(s) : '';
    }
    window.safeImgSrc = safeImgSrc;

    /* Sélectionne un élément par valeur d'attribut, sans risque d'injection.

       `querySelector('[data-x="' + v + '"]')` lève une SyntaxError si `v`
       contient un guillemet, et un `v` bien choisi peut aussi ÉLARGIR le
       sélecteur (une virgule vaut « ou »). Or plusieurs de ces valeurs viennent
       d'un design partagé (?design=), donc d'une source non fiable :
       `restoreColor()` s'interrompait alors avant `restoreUploads()` et
       `restoreTexts()`, et le destinataire ouvrait un configurateur SANS son
       design — sans le moindre message.

       On échappe donc la valeur, et on avale une éventuelle SyntaxError :
       renvoyer null est le bon comportement (« aucune carte ne correspond »),
       pas propager l'exception à toute la restauration.

       CSS.escape n'est pas utilisable directement : il échappe pour un
       IDENTIFIANT, pas pour une valeur entre guillemets. On neutralise donc les
       deux caractères qui comptent ici : le guillemet et l'antislash. */
    function queryByAttr(selectorTpl, value) {
      var v = String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      try {
        return document.querySelector(selectorTpl.replace('%v', v));
      } catch (e) {
        console.warn('Sélecteur refusé (valeur invalide) :', value);
        return null;
      }
    }

    /* Purge les `src` d'un magasin d'uploads venant d'une source non fiable.

       DÉFENSE EN PROFONDEUR — les sinks qui affichent ces images échappent
       désormais leur valeur (safeImgSrc dans les vignettes de récap). Mais un
       design partagé traverse tout le configurateur : écrit en session, relu
       par restoreUploads(), reposé dans des attributs `src`, puis recomposé
       par les vignettes. Filtrer à l'ENTRÉE évite d'avoir à se souvenir de
       chaque point de sortie — c'est précisément cet oubli qui avait laissé
       passer les trois vignettes de récap.

       Une URL rejetée est mise à `null` plutôt que la zone supprimée : la
       géométrie sauvegardée reste valable, et les consommateurs ignorent déjà
       une entrée sans `src` (motif `if (src)`, voir restoreUploads).

       Ne valide QUE le protocole — la FORME du magasin (byProduct, _v) est
       normalisée par migrateUploadStore(), qui doit tourner avant. */
    function sanitizeUploadSrcs(store) {
      if (!store || typeof store !== 'object') return store;
      var byP = store.byProduct;
      if (!byP || typeof byP !== 'object') return store;

      Object.keys(byP).forEach(function (product) {
        var zones = byP[product];
        if (!zones || typeof zones !== 'object') return;
        Object.keys(zones).forEach(function (zone) {
          var entry = zones[zone];
          if (!entry || typeof entry !== 'object') return;
          if (typeof entry.src !== 'string' || !entry.src) return;

          /* On réutilise le VERDICT de safeImgSrc, pas sa sortie : celle-ci
             échappe le HTML, ce qui casserait une URL légitime réinjectée
             dans une propriété `.src` (`&` deviendrait `&amp;`).

             D'où un contrôle SUPPLÉMENTAIRE ici : un guillemet, une apostrophe
             ou un chevron n'a rien à faire dans une URL d'image, et ce sont
             exactement les caractères qui permettent de s'échapper d'un
             attribut en aval. `/a.png" onerror="…` satisfait pourtant
             `^\/[^\/]` — le préfixe est valide, la charge suit. Sans ce test,
             la validation d'entrée laissait passer la charge de A1 et ne
             reposait que sur l'échappement des sinks. */
          var s = entry.src.trim();
          var ok = !/["'<>]/.test(s) && (
                   /^data:image\//i.test(s) ||
                   /^https?:\/\//i.test(s) ||
                   /^\/[^\/]/.test(s) ||
                   /^[\w.\-]+\.(png|jpe?g|webp|svg|gif)(\?.*)?$/i.test(s));
          if (ok) {
            entry.src = s;
          } else {
            console.warn('Design partagé : URL d\'image refusée (' +
                         s.slice(0, 40) + '), zone « ' + zone + ' » ignorée.');
            entry.src = null;
          }
        });
      });
      return store;
    }

    /* Construit une ligne du tableau.

       `deferTotals` (optionnel) — n'appelle PAS grpUpdateTotals() en fin de
       fonction. Réservé aux insertions en masse (import CSV) : ce total
       relit tout le tableau par querySelectorAll, donc l'appeler à chaque
       ligne rend l'import quadratique (10 000 lignes = 50 millions de
       lectures de <tr>, onglet figé). L'appelant DOIT alors appeler
       grpUpdateTotals() une fois l'insertion terminée — sans quoi le total
       affiché et le bouton d'envoi resteraient sur l'état précédent. */
    function grpAddRow(preset, deferTotals) {
      var tbody = document.getElementById('grp-rows');
      if (!tbody) return;
      preset = preset || {};
      var id = 'grp-r-' + (++grpRowSeq);

      var sizes = grpSizes();
      var colors = grpColors();
      var selSize = preset.size || grpCurrentSize();
      var selColorName = preset.color || grpCurrentColor();

      var sizeOpts = sizes.map(function (s) {
        return '<option value="' + grpEsc(s) + '"' + (s === selSize ? ' selected' : '') +
               '>' + grpEsc(s) + '</option>';
      }).join('');
      var colorOpts = colors.map(function (c) {
        return '<option value="' + grpEsc(c.name) + '" data-hex="' + grpEsc(c.hex) + '"' +
               (c.name === selColorName ? ' selected' : '') + '>' + grpEsc(c.name) + '</option>';
      }).join('');

      var tr = document.createElement('tr');
      tr.id = id;
      tr.innerHTML =
        // '<td><input class="grp-inp grp-f-name" type="text" placeholder="Nom / réf." value="' + (preset.name || '') + '"></td>' +
        /* maxlength="20" : le nom floque est une contrainte PHYSIQUE (largeur
           de broderie sur un dos de vetement). Sans borne, un nom de 500
           caracteres partait au backend puis en atelier — tronque a l'aveugle
           ou rejete en 400. Les deux autres champs texte du projet sont bornes
           a 40 (texte libre) et 25 (panneau texte) caracteres. */
        '<td><input class="grp-inp grp-f-flock" type="text" maxlength="20" placeholder="ex. JEAN 10" value="' + grpEsc(preset.flock || '') + '"></td>' +
        '<td><select class="grp-sel grp-f-size" onchange="grpUpdateTotals()">' + sizeOpts + '</select></td>' +
        '<td><div class="grp-color-cell">' +
          '<span class="grp-color-dot" data-dot="1"></span>' +
          '<select class="grp-sel grp-f-color" onchange="grpSyncDot(this)">' + colorOpts + '</select>' +
        '</div></td>' +
        '<td><div class="grp-qty">' +
          /* Quantité : coercition numérique plutôt qu'échappement — elle vient
             aussi de l'import CSV, où une cellule arbitraire pourrait sinon
             s'échapper de l'attribut. */
          /* `max="10000"` : la même borne que l'import CSV applique par ligne
             (MAX_QTY, conf-group-csv.js:95). La saisie directe y échappait
             complètement — seul le total agrégé était plafonné par
             GRP_MAX_PIECES (50 000). Une ligne pouvait donc porter 999999999
             et n'être refusée qu'au checkout, par un 400 opaque. */
          '<input class="grp-f-qty" type="number" min="1" max="10000" value="' +
            (Math.min(10000, Math.max(1, parseInt(preset.qty, 10) || 1))) + '" onchange="grpUpdateTotals()">' +
        '</div></td>' +
        '<td>' +
          // '<button type="button" class="grp-row-btn" title="Aperçu" onclick="grpPreviewRow(this)">' +
          //   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>' +
          // '</button>' +
          // '<button type="button" class="grp-row-btn" title="Dupliquer" onclick="grpDupRow(this)">' +
          //   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
          // '</button>' +
          '<button type="button" class="grp-row-btn danger" title="Supprimer" onclick="grpDelRow(this)">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>' +
          '</button>' +
        '</td>';
      tbody.appendChild(tr);
      grpSyncDot(tr.querySelector('.grp-f-color'));
      if (!deferTotals) grpUpdateTotals();
    }
    window.grpAddRow = grpAddRow;   // conf-group-csv.js

    /* ── Import CSV / Excel ─────────────────────────────────────────────
       Le CSV est lu nativement (aucune librairie). Un vrai .xlsx est un ZIP
       binaire : on ne le décode pas ici, on invite à réenregistrer en CSV. */

    /* L'import CSV (grpImportFile, grpParseCsv et leurs utilitaires) vit
       desormais dans assets/conf-group-csv.js (limite Shopify de 256 Ko).
       Il depend de window.grpAddRow / grpColors / grpSizes, exposes ci-dessus. */

    function grpSyncDot(sel) {
      if (!sel) return;
      var opt = sel.options[sel.selectedIndex];
      var dot = sel.closest('.grp-color-cell').querySelector('.grp-color-dot');
      if (dot && opt) dot.style.background = opt.getAttribute('data-hex') || '#ccc';
    }

    function grpDelRow(btn) {
      var tr = btn.closest('tr');
      if (tr) tr.remove();
      grpUpdateTotals();
    }

    /* Lit une valeur de champ dans une ligne, sans planter si la colonne a été
       retirée du markup (ex. l'ancienne colonne « nom de personne »). */
    function grpVal(tr, cls) {
      var el = tr.querySelector('.' + cls);
      return el ? el.value : '';
    }
    window.grpVal = grpVal;   // lu par conf-group-preview.js

    function grpDupRow(btn) {
      var tr = btn.closest('tr');
      if (!tr) return;
      grpAddRow({
        size: grpVal(tr, 'grp-f-size'),
        color: grpVal(tr, 'grp-f-color'),
        flock: grpVal(tr, 'grp-f-flock'),
        qty: grpVal(tr, 'grp-f-qty')
      });
    }

    /* Lit toutes les lignes en objets. Colonnes : Nom floqué, Taille, Couleur,
       Qté (plus de colonne « nom de personne »). Le nom floqué sert d'étiquette
       de la ligne ET de propriété transmise à la commande. */
    function grpCollect() {
      var rows = [];
      document.querySelectorAll('#grp-rows tr').forEach(function (tr) {
        var qty = parseInt(grpVal(tr, 'grp-f-qty'), 10) || 0;
        if (qty < 1) return;
        var flock = String(grpVal(tr, 'grp-f-flock')).trim();
        rows.push({
          name: flock,          // le nom floqué identifie la ligne
          size: grpVal(tr, 'grp-f-size'),
          color: grpVal(tr, 'grp-f-color'),
          flock: flock,
          qty: qty
        });
      });
      return rows;
    }

    /* Plafond sur le TOTAL de pièces d'une commande de groupe.

       Les plafonds de l'import CSV (MAX_QTY = 10 000 par ligne, MAX_ROWS = 2000
       lignes) bornent chaque fichier, mais leur produit vaut 20 millions de
       pièces — et l'import AJOUTE au tableau existant, donc plusieurs imports
       cumulent sans limite. Ce total est le seul endroit qui voit la somme
       réelle, quelle qu'en soit la provenance (import, saisie, duplication). */
    var GRP_MAX_PIECES = 50000;

    function grpUpdateTotals() {
      /* Borner chaque champ de quantité AVANT de collecter : l'attribut
         `max="10000"` du markup n'est qu'indicatif — un navigateur laisse taper
         999999999 dans un `type="number"`, il ne refuse qu'à la validation d'un
         formulaire, et ce tableau n'en est pas un. Même plafond que l'import CSV
         (MAX_QTY, conf-group-csv.js:95). */
      var champs = document.querySelectorAll('#grp-rows .grp-f-qty');
      for (var i = 0; i < champs.length; i++) {
        var brut = parseInt(champs[i].value, 10);
        if (!isFinite(brut)) continue;          // laisse effacer avant de retaper
        var borne = Math.min(10000, Math.max(1, brut));
        if (String(champs[i].value) !== String(borne)) champs[i].value = borne;
      }

      var rows = grpCollect();
      var persons = document.querySelectorAll('#grp-rows tr').length;
      var pieces = rows.reduce(function (s, r) { return s + r.qty; }, 0);
      var l = document.getElementById('grp-total-lines');
      var q = document.getElementById('grp-total-qty');
      if (l) l.textContent = persons + ' ligne' + (persons > 1 ? 's' : '');
      if (q) q.textContent = pieces + ' pièce' + (pieces > 1 ? 's' : '');

      /* Au-delà du plafond, on BLOQUE l'envoi et on le dit. Laisser passer
         reviendrait à créer autant de lignes de panier, ce qui fige l'onglet
         puis échoue côté Shopify — sans que le client comprenne pourquoi. */
      var over = pieces > GRP_MAX_PIECES;
      var hint = document.getElementById('grp-import-hint');
      if (over && hint) {
        hint.className = 'grp-import-hint err';
        hint.innerHTML = '<strong>' + pieces.toLocaleString('fr-FR') +
          ' pièces</strong> : au-delà de la limite de ' +
          GRP_MAX_PIECES.toLocaleString('fr-FR') +
          '. Réduisez les quantités ou passez par une demande de devis.';
      }

      var submit = document.getElementById('grp-submit');
      if (submit) submit.disabled = pieces < 1 || over;
    }

    /* grpPreviewRow() / closeGroupPreview() vivent desormais dans
       assets/conf-group-preview.js (limite Shopify de 256 Ko). Appelees via
       window.* ; dependent de window.grpVal, expose plus haut. */

    /* Liste multi-personnes validée (« Confirmer »). Mémorisée ici puis consommée
       par addToCart, qui crée UNE ligne de panier par personne.
       PERSISTÉE en session : une saisie de dix personnes ne doit pas être perdue
       sur un rechargement ou un aller-retour vers un autre produit. Effacée à la
       validation du panier et par le bouton « Réinitialiser ». */
    var GRP_KEY = 'conf_group_rows';
    var groupOrderRows = null;
    try {
      var _gr = sessionStorage.getItem(GRP_KEY);
      if (_gr) groupOrderRows = JSON.parse(_gr) || null;
    } catch (e) { groupOrderRows = null; }

    /** Écrit (ou efface) la liste en session. */
    function saveGroupRows() {
      try {
        if (groupOrderRows && groupOrderRows.length) {
          sessionStorage.setItem(GRP_KEY, JSON.stringify(groupOrderRows));
        } else {
          sessionStorage.removeItem(GRP_KEY);
        }
      } catch (e) {}
    }

    /**
     * Enregistre une liste construite AILLEURS (modale « Pour Groupe », qui vit
     * dans conf-size-quantity-modal.js).
     *
     * Cette modale écrivait dans `window.groupOrderRows`, jamais exposé : sa
     * garde `typeof !== 'undefined'` était fausse et la liste se perdait
     * silencieusement. Passer par une fonction garantit aussi la persistance
     * et le rafraîchissement du badge.
     *
     * @param {Array} rows - lignes { name, size, color, qty, … }
     */
    function setGroupOrderRows(rows) {
      groupOrderRows = (rows && rows.length) ? rows : null;
      saveGroupRows();
      refreshGroupBadge();
    }
    window.setGroupOrderRows = setGroupOrderRows;
    /* Lecture : conf-size-quantity-modal.js recharge ses quantités depuis la
       liste validée. */
    window.getGroupOrderRows = function () { return groupOrderRows; };

    /* Rouvre la modale d'où vient la liste. Les lignes de la modale « Pour
       Groupe » portent _sizeGroupSummary ; celles des surnoms, non. Sans ce
       test, une liste de tailles se serait rouverte dans le tableau des
       surnoms, avec des colonnes vides. */
    function reopenGroupList() {
      var isSizes = groupOrderRows && groupOrderRows.length &&
                    groupOrderRows.every(function (r) { return r && r._sizeGroupSummary; });
      if (isSizes && typeof window.openSizeQuantityModal === 'function') {
        window.openSizeQuantityModal();
      } else {
        openGroupOrder();
      }
    }
    window.reopenGroupList = reopenGroupList;

    /** Supprime la liste (croix du badge) après confirmation. */
    function clearGroupOrder() {
      confConfirm('Supprimer la liste de noms ? Les lignes saisies seront perdues.',
        { icon: 'warning', title: 'Supprimer la liste ?',
          confirmText: 'Supprimer', cancelText: 'Annuler' })
        .then(function (ok) {
          if (!ok) return;
          groupOrderRows = null;
          saveGroupRows();
          refreshGroupBadge();
          // Le tableau de la modale repart vierge au prochain ouverture.
          var tbody = document.getElementById('grp-rows');
          if (tbody) tbody.innerHTML = '';
        });
    }
    window.clearGroupOrder = clearGroupOrder;

    /* Résumé sous le bouton d'ajout : rappelle que le panier créera N lignes.
       Deux actions : le libellé rouvre la liste, la croix la supprime. */
    /* Liste restaurée depuis la session : le badge doit reparaître au
       chargement, sinon elle serait mémorisée mais invisible. */
    document.addEventListener('DOMContentLoaded', function () { refreshGroupBadge(); });

    function refreshGroupBadge() {
      var el = document.getElementById('grp-badge');
      if (!el) return;
      if (!groupOrderRows || !groupOrderRows.length) { el.style.display = 'none'; return; }
      var pieces = groupOrderRows.reduce(function (s, r) { return s + r.qty; }, 0);
      el.style.display = '';

      /* Libellé selon l'origine. La modale « Pour Groupe » crée UNE LIGNE PAR
         PIÈCE : annoncer « 3 lignes » pour 3 pièces d'une même taille serait
         trompeur. On compte donc les TAILLES distinctes dans ce cas. */
      var isSizes = groupOrderRows.every(function (r) { return r && r._sizeGroupSummary; });
      var label;
      if (isSizes) {
        var uniq = {};
        groupOrderRows.forEach(function (r) { if (r.size) uniq[r.size] = 1; });
        var n = Object.keys(uniq).length;
        label = 'Liste : ' + n + ' taille' + (n > 1 ? 's' : '');
      } else {
        label = 'Liste : ' + groupOrderRows.length + ' ligne' +
                (groupOrderRows.length > 1 ? 's' : '');
      }

      el.innerHTML =
        '<button type="button" class="grp-badge-txt" onclick="reopenGroupList()" ' +
        'title="Modifier la liste">' + label + ' · ' + pieces + ' pièce' +
        (pieces > 1 ? 's' : '') + '</button>' +
        '<button type="button" class="grp-badge-x" onclick="clearGroupOrder()" ' +
        'title="Supprimer la liste" aria-label="Supprimer la liste">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
        '<path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    }

    function submitGroupOrder(btnEl) {
      var rows = grpCollect();
      if (!rows.length) {
        confAlert('Ajoutez au moins une ligne à votre liste.', { icon: 'info', title: 'Liste vide' });
        return;
      }

      var pieces = rows.reduce(function (s, r) { return s + r.qty; }, 0);

      // La liste est mémorisée. L'ajout au panier se fait ensuite via
      // « Ajouter au panier », une fois le design terminé : c'est lui qui
      // déplie la liste en une ligne de panier par personne.
      groupOrderRows = rows;
      saveGroupRows();          // survit au rechargement
      refreshGroupBadge();
      closeGroupOrder();
      confAlert(
        'Liste enregistrée : ' + rows.length + ' ligne' + (rows.length > 1 ? 's' : '') +
        ' · ' + pieces + ' pièce' + (pieces > 1 ? 's' : '') +
        '. Terminez votre design, puis « Ajouter au panier » créera une ligne par personne.',
        { icon: 'success', title: 'Liste enregistrée' }
      );
    }

    /* ── Guide des tailles ── */
    function openSizeGuide(e) {
      if (e && e.preventDefault) e.preventDefault();
      var m = document.getElementById('sg-modal-overlay');
      if (m) m.classList.add('open');
    }
    function closeSizeGuide() {
      var m = document.getElementById('sg-modal-overlay');
      if (m) m.classList.remove('open');
    }

    /* ── State ── */
    let zl = 100;
    /* Passe à true dès que l'utilisateur règle le zoom lui-même : le zoom
       automatique à l'upload cesse alors d'intervenir (voir autoZoomOnUpload). */
    let zoomUserControlled = false;
    let currentColor = '#0a0a0a';
    let currentColorName = 'Black';
    let currentColorSlug = 'black';
    let currentProductKey = 'sweatshirt';
    // Type de produit courant (tous types : textile, drapeaux, coins, patches).
    let currentProductType = 'sweatshirt';
    window.currentProductType = currentProductType;   // lu par conf-overview.js

    /* Les 3 produits textiles : seuls eux acceptent une commande de groupe
       (un coin ou un drapeau n'a ni taille ni nom floqué par personne). */
    var TEXTILE_TYPES = ['sweatshirt', 'tshirt', 'tshirt_polyester'];

    /* Affiche « Ajouter plusieurs surnoms » pour les seuls textiles.
       Appelée au changement de produit ET au chargement : sans l'appel
       initial, le bouton restait masqué (display:none du markup) même sur un
       textile, puisque rien ne le réaffichait avant un changement. */
    function refreshMultiNameBtn(productType) {
      var t = productType || currentProductType;
      var btn = document.getElementById('txt-multi-btn');
      if (btn) btn.style.display = (TEXTILE_TYPES.indexOf(t) !== -1) ? '' : 'none';
      // Couleur/Taille au-dessus de l'aperçu : même critère (textiles seuls).
      if (typeof window.refreshCanvasOpts === 'function') {
        window.refreshCanvasOpts(t);
      }
    }
    window.refreshMultiNameBtn = refreshMultiNameBtn;

    /* ── Variants Shopify pour le panier natif (produits à prix fixe) ──
       ATTENTION nommage interne INVERSÉ :
         • écran visible « Coins »  = productType 'coins'   = vos PATCHS codés
           -> produit Shopify « Patch personnalisé »
         • écran visible « Patchs » = productType 'patches' = COINS réels
           -> produit Shopify « Coin métal personnalisé »
       Sans la clé 'coins', l'ajout au panier des patchs était écarté au checkout
       (variant introuvable).

       Les IDs ci-dessous appartiennent à la boutique 38cca3.myshopify.com
       (massacre-officiel.com), régénérés le 2026-08-07. Ne PAS les recopier à la
       main : `customizer-backend/scripts/exporter-variants.mjs` les lit sur la
       boutique et `injecter-variants.mjs` les écrit ici — un chiffre faux fait
       écarter l'article au checkout, sans aucun message d'erreur. */
    window.CONF_VARIANTS = {
      sweatshirt:       60327512342862,
      tshirt:           60327514669390,
      tshirt_polyester: 60327519224142,
      /* Variant de REPLI du drapeau : « Blanc ». Le produit a 4 variants couleur
         depuis le 11/08/2026 ; l'ancien `Default Title` (60327528563022) a été
         supprimé à leur création. La couleur choisie est résolue par
         CONF_COLOR_VARIANTS (recapitulatif.liquid). */
      drapeaux:         60352869663054,
      coins:            60327529939278   // « Patch personnalisé » (patchs codés)
      // patches (= COINS réels) : pas de variant, sur devis uniquement.
      // C'est cette ABSENCE qui déclenche la bascule devis — ne pas ajouter
      // de clé ici sans retirer d'abord la bascule.
    };

    /* Produit add-on « Personnalisation manche » (masqué du storefront).
       Le textile passe par le panier NATIF Shopify, où une line item property
       ne porte aucun prix : le supplément doit être une vraie ligne de panier.
       Créé par customizer-backend/scripts/create-sleeve-addon.mjs. */
    window.CONF_SLEEVE_VARIANT = 60327504183630;

    /* ── Panier (persisté dans sessionStorage) ── */
    let cartItems = [];
    try {
      cartItems = JSON.parse(sessionStorage.getItem('conf_cart')) || [];
    } catch (e) { cartItems = []; }
    let cartCount = cartItems.reduce((s, i) => s + (i.qty || 1), 0);

    // Afficher le bouton panier du header si des articles existent déjà
    document.addEventListener('DOMContentLoaded', () => {
      // Détecte un retour APRÈS PAIEMENT : si un checkout était en cours et que le
      // panier Shopify natif est désormais vide, la commande a été finalisée
      // -> on réinitialise le design (panier local + logos), puis on recharge.
      maybeResetAfterPurchase().then((didReset) => {
        if (didReset) return; // la page va se recharger vierge
        if (cartCount > 0) {
          const cartBtn = document.getElementById('hdr-cart-btn');
          const cartCountEl = document.getElementById('hdr-cart-count');
          if (cartBtn) cartBtn.style.display = 'inline-flex';
          if (cartCountEl) cartCountEl.textContent = cartCount;
          if (typeof renderCartDrawer === 'function') renderCartDrawer();

          /* Retour depuis le récapitulatif (« Modifier ») : on rouvre le
             drawer pour rendre l'écran quitté, panier visible. Sans cela, le
             client retombe sur un configurateur d'apparence vierge et croit
             son panier perdu — alors qu'il est bien restauré.
             Le paramètre est ensuite retiré de l'URL : un F5 ou un partage
             de lien ne doit pas rouvrir le drawer indéfiniment. */
          try {
            if (new URLSearchParams(location.search).get('cart') === '1') {
              openCartDrawer();
              var clean = location.pathname + location.hash;
              history.replaceState(null, '', clean);
            }
          } catch (e) {}
        }
        // Si un design partagé est passé en URL (?design=<id>), on le charge
        // d'abord (invitation à éditer), sinon on restaure l'état local.
        loadSharedDesignThenRestore();
        // Affiche les zones guides vides dès l'ouverture.
        // Applique les zones du produit restauré (échelle sweat ≠ t-shirt),
        // ce qui rafraîchit aussi les guides.
        if (typeof applyZonesForProduct === 'function') {
          setTimeout(function () {
            applyZonesForProduct(currentProductType);
            // Le bouton « plusieurs surnoms » suit le produit restauré.
            if (typeof refreshMultiNameBtn === 'function') refreshMultiNameBtn();
          }, 300);
        } else if (typeof refreshZoneGuides === 'function') {
          setTimeout(refreshZoneGuides, 300);
        }
      });
    });

    /* Si l'URL contient ?design=<id> (lien d'invitation), récupère le design
       partagé, l'injecte dans sessionStorage, puis restaure. Sinon, restauration
       locale normale. */
    function loadSharedDesignThenRestore() {
      var shareId = null;
      try { shareId = new URLSearchParams(window.location.search).get('design'); } catch (e) {}

      if (!shareId) { restoreProductThenUploads(); return; }

      window.ConfAPI.getSharedDesign(shareId).then(function (data) {
        // data = { product, color, patchColor, uploads } (state sérialisé).
        try {
          if (data && data.product) sessionStorage.setItem('conf_current_product', data.product);
          if (data && data.color) sessionStorage.setItem('conf_current_color', JSON.stringify(data.color));
          if (data && data.patchColor) sessionStorage.setItem('conf_patch_color', JSON.stringify(data.patchColor));
          if (data && data.coinFinish) sessionStorage.setItem('conf_coin_finish', data.coinFinish);
          /* Normalisé à l'écriture : un lien de partage créé avant l'indexation
             par produit transporte un objet PLAT. migrateUploadStore() le range
             sous son produit, sinon ses zones seraient lues comme des noms de
             produits et le design n'apparaîtrait nulle part. */
          if (data && data.uploads) {
            /* data.product fait foi ici : le design partagé appartient au
               produit de son auteur, pas à celui affiché chez le destinataire
               (currentProductType, encore sur le sweatshirt par défaut). */
            sessionStorage.setItem('conf_uploads',
              JSON.stringify(sanitizeUploadSrcs(
                migrateUploadStore(data.uploads, data.product))));
          }
        } catch (e) {
          /* Écriture en session impossible (quota, mode privé) : le lien
             d'invitation s'ouvre alors sur un configurateur vide, sans que le
             destinataire comprenne pourquoi. On trace — contrairement aux
             écritures de confort, celle-ci porte tout le design partagé. */
          console.warn('Design partagé non restauré (stockage de session) :', e);
        }
        // Nettoie l'URL (retire ?design=) sans recharger.
        try { history.replaceState(null, '', '/pages/configurateur'); } catch (e) {}
        restoreProductThenUploads();
      }).catch(function (err) {
        console.error('Design partagé introuvable :', err);
        restoreProductThenUploads();
      });
    }

    /* Rebascule sur le PRODUIT où était l'utilisateur avant le reload, puis
       restaure ses uploads. Priorité : conf_current_product (dernier produit
       sélectionné), repli sur conf_uploads._product. */
    function restoreProductThenUploads() {
      var saved = null;
      try { saved = sessionStorage.getItem('conf_current_product'); } catch (e) {}
      if (!saved) {
        /* Repli : le seul produit ayant des uploads. S'il y en a plusieurs,
           aucun ne fait autorité — conf_current_product tranche, et à défaut
           on laisse le produit par défaut plutôt que d'en choisir un au
           hasard et de dérouter le client. */
        try {
          var byP = readUploadStore().byProduct;
          var keys = Object.keys(byP);
          if (keys.length === 1) saved = keys[0];
        } catch (e) {}
      }

      /* @param textileDejaFait  true quand selProd() vient d'être appelé.
         Il exécute applyColorForProduct(), qui lit déjà la couleur enregistrée du
         produit, pose currentColorSlug, active la pastille et charge les images.
         Rejouer la partie TEXTILE de restoreColor() par-dessus déclenchait un
         SECOND chargement des mêmes images, 300 ms après le premier — les deux
         couraient en parallèle et le retardataire pouvait écraser le bon.

         Seule la partie textile est sautée : applyColorForProduct() ne touche ni
         `conf_patch_color` (couleur du patch) ni `conf_coin_finish` (finition du
         coin), que restoreColor() doit continuer de restaurer. Et le sweatshirt
         ne passe PAS par selProd — il a besoin des deux parties. */
      var doRestore = function (textileDejaFait) {
        /* Chaque restauration est ISOLÉE : une exception dans l'une ne doit pas
           emporter les suivantes. La couleur est la moins critique des trois —
           perdre les logos et les textes du client parce qu'une finition est
           illisible serait hors de proportion. queryByAttr couvre déjà la cause
           connue (sélecteur forgé), ces gardes couvrent le reste. */
        try { restoreColor({ sauterTextile: !!textileDejaFait }); }
        catch (e) { console.warn('Restauration de la couleur échouée :', e); }
        try { if (typeof restoreUploads === 'function') restoreUploads(); }
        catch (e) { console.error('Restauration des logos échouée :', e); }
        try { if (typeof restoreTexts === 'function') restoreTexts(); }
        catch (e) { console.error('Restauration des textes échouée :', e); }
      };

      // Produit non-sweatshirt : on le sélectionne d'abord (textile OU coins/
      // drapeaux/patches), puis on restaure couleur + uploads une fois prêt.
      if (saved && saved !== 'sweatshirt') {
        /* .pt = type-bar d'origine (masquée mais toujours dans le DOM) ;
           .product-card = sidebar moderne. On accepte les deux, pour ne pas
           dépendre de la survie de l'ancienne barre. */
        /* queryByAttr : `saved` vient de conf_current_product, écrit depuis
           data.product du serveur de partage — même exposition que ci-dessus. */
        var card = queryByAttr('.pt[data-product="%v"]', saved) ||
                   queryByAttr('.product-card[data-product="%v"]', saved);
        if (card && typeof selProd === 'function') {
          selProd(card);
          /* `true` : selProd a déjà appliqué la couleur du textile. */
          setTimeout(function () { doRestore(true); }, 300);
          return;
        }
      }
      /* Sweatshirt (ou produit inconnu) : selProd n'a PAS été appelé, la couleur
         du textile est donc à restaurer ici. */
      setTimeout(function () { doRestore(false); }, 200);
    }

    /* Restaure la couleur mémorisée : reclique la pastille correspondante pour
       rétablir l'état visuel + l'image/fond coloré. Gère TEXTILE (.cs) et
       PATCH/COINS (.patch-color-sw) selon le produit courant. */
    /**
     * @param {{sauterTextile?: boolean}} [opts]
     *   `sauterTextile` : la couleur du textile a déjà été appliquée par
     *   applyColorForProduct() (appelée depuis selProd). La rejouer relancerait
     *   un second chargement des mêmes images, en concurrence avec le premier.
     *   Les parties PATCH et COIN restent toujours exécutées : elles n'ont pas
     *   d'équivalent ailleurs.
     */
    function restoreColor(opts) {
      var sauterTextile = !!(opts && opts.sauterTextile);
      // Textile : couleur mémorisée POUR LE PRODUIT COURANT -> pastilles .cs
      var savedTx = sauterTextile ? null : savedColorFor(currentProductType);
      if (savedTx && savedTx.name) {
        var cs = document.querySelectorAll('.cs');
        for (var i = 0; i < cs.length; i++) {
          if (cs[i].getAttribute('title') === savedTx.name && typeof selColor === 'function') {
            selColor(cs[i], savedTx.hex || cs[i].style.backgroundColor, savedTx.name);
            break;
          }
        }
      }

      // Patch / Coins : conf_patch_color -> pastilles .patch-color-sw
      var savedPatch = null;
      try { savedPatch = JSON.parse(sessionStorage.getItem('conf_patch_color')); } catch (e) {}
      if (savedPatch && savedPatch.name) {
        var pw = document.querySelectorAll('.patch-color-sw');
        for (var j = 0; j < pw.length; j++) {
          if (pw[j].getAttribute('title') === savedPatch.name && typeof selectPatchColor === 'function') {
            selectPatchColor(pw[j], savedPatch.hex || pw[j].style.backgroundColor, savedPatch.name);
            break;
          }
        }
      }

      // Coins : conf_coin_finish -> carte .coin-finish-card[data-finish]
      var savedFinish = null;
      try { savedFinish = sessionStorage.getItem('conf_coin_finish'); } catch (e) {}
      if (savedFinish) {
        /* queryByAttr : `savedFinish` vient de conf_coin_finish, écrit depuis
           data.coinFinish du serveur de partage. Une valeur forgée levait une
           SyntaxError ici — dernière instruction de restoreColor(), donc
           restoreUploads() et restoreTexts() ne s'exécutaient jamais. */
        var fc = queryByAttr('.coin-finish-card[data-finish="%v"]', savedFinish);
        if (fc && typeof selectCoinFinish === 'function') selectCoinFinish(fc);
      }
    }

    /* Réinitialise le configurateur si le client revient après un paiement réussi.
       Condition : un checkout était marqué en cours (conf_checkout_pending) ET le
       panier Shopify natif est vide (commande passée -> Shopify a vidé le panier).
       Renvoie true si un reset a eu lieu (la page est rechargée). */
    async function maybeResetAfterPurchase() {
      let pending = null;
      try { pending = localStorage.getItem('conf_checkout_pending'); } catch (e) {}
      if (!pending) return false;

      // Garde-fou : ignore un flag trop ancien (> 2h) pour éviter tout reset tardif.
      const age = Date.now() - parseInt(pending, 10);
      if (isNaN(age) || age > 2 * 60 * 60 * 1000) {
        try { localStorage.removeItem('conf_checkout_pending'); } catch (e) {}
        return false;
      }

      // Vérifie le panier Shopify natif.
      let itemCount = null;
      try {
        const res = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } });
        if (res.ok) { const cart = await res.json(); itemCount = cart.item_count; }
      } catch (e) { itemCount = null; }

      // Panier natif vide => commande finalisée => on nettoie.
      if (itemCount === 0) {
        try { localStorage.removeItem('conf_checkout_pending'); } catch (e) {}
        if (typeof clearConfiguratorState === 'function') clearConfiguratorState();
        // Recharge vierge (retire aussi un éventuel ?design=... de partage).
        window.location.replace('/pages/configurateur');
        return true;
      }

      // Panier non vide (le client est juste revenu en arrière) : on garde tout.
      return false;
    }

    /* Instantané des logos par produit, EN MÉMOIRE (perdu au rechargement).
       Exposé : conf-logo-store.js le lit et l'écrit. */
    const LOGO_STORE = {};
    window.LOGO_STORE = LOGO_STORE;

    /* ── Couleurs : nom affiché -> slug de fichier ── */
    const COLOR_SLUGS = {
      'Apricot': 'apricot',
      'Ash': 'ash',
      'Atoll': 'atoll',
      'Black': 'black',
      'Bottle Green': 'bottle-green',
      'Brown': 'brown',
      'Burgundy': 'burgundy',
      'Chocolate': 'chocolate',
      'Cobalt Blue': 'cobalt-blue',
      'Dark Grey': 'dark-grey',
      'Diva Blue': 'diva-blue',
      'Fire Red': 'fire-red',
      'Gold': 'gold',
      'Kelly Green': 'kelly-green',
      'Millennial Lilac': 'millennial-lilac',
      'Millennial Mint': 'millennial-mint',
      'Natural': 'natural',
      'Navy': 'navy',
      'Navy Blue': 'navy-blue',
      'Orange': 'orange',
      'Orchid Green': 'orchid-green',
      'Orchid Pink': 'orchid-pink',
      'Pacific Grey': 'pacific-grey',
      'Pixel Lime': 'pixel-lime',
      'Radiant Purple': 'radiant-purple',
      'Red': 'red',
      'Royal Blue': 'royal-blue',
      'Sand': 'sand',
      'Sky': 'sky',
      'Solar Yellow': 'solar-yellow',
      'Sorbet': 'sorbet',
      'Sport Grey': 'sport-grey',
      'Stone Blue': 'stone-blue',
      'Sunset Orange': 'sunset-orange',
      'Swimming Pool': 'swimming-pool',
      'Urban Khaki': 'urban-khaki',
      'Urban Orange': 'urban-orange',
      'Urban Purple': 'urban-purple',
      'Used Black': 'used-black',
      'White': 'white'
    };

    /* ── Produits : data-product -> préfixe de fichier ── */
    const PRODUCT_SLUGS = {
      'sweatshirt': 'sweatshirt',
      'tshirt': 'tshirt',
      'tshirt_polyester': 'tshirt-polyester'
    };

    /* Charge les images {produit}-{couleur}-{vue}.png pour les 3 vues.
       Repli automatique sur l'image générique si le fichier couleur manque. */
    /* Renvoie la liste ordonnée d'URLs candidates pour (prefix, slug, view) :
       1) image couleur EN {produit}-{slugEN}-{vue}.png
       2) image couleur FR existante (via COLOR_SLUG_LEGACY)
       3) image générique du produit.
       On essaie chaque URL dans l'ordre (onerror -> suivante). */
    function colorImageCandidates(prefix, slug, view) {
      const urls = window.PRODUCT_IMAGE_URLS || {};
      const legacyUrls = window.PRODUCT_IMAGE_URLS_LEGACY || {};
      const legacyMap = window.COLOR_SLUG_LEGACY || {};
      const fallbacks = (window.PRODUCT_FALLBACK_URLS || {})[prefix] || {};

      const list = [];
      const enUrl = urls[prefix + '-' + slug + '-' + view];
      if (enUrl) list.push(enUrl);

      const frSlug = legacyMap[slug];
      if (frSlug) {
        const frUrl = legacyUrls[prefix + '-' + frSlug + '-' + view];
        if (frUrl) list.push(frUrl);
      }
      if (fallbacks[view]) list.push(fallbacks[view]);
      return list;
    }

    /* Charge la première URL candidate qui existe dans imgEl. */
    function loadFirstAvailable(imgEl, candidates) {
      if (!imgEl || !candidates.length) return;

      /* JETON DE SÉQUENCE — évite qu'un chargement obsolète écrase le bon.

         Sans lui, deux appels sur le même élément couraient en parallèle et le
         dernier `onload` à se déclencher gagnait, quel que soit l'ordre d'appel.
         Au rechargement, restoreProductThenUploads() en enchaîne justement deux :
         selProd() demande la couleur par DÉFAUT, puis restoreColor() la couleur
         ENREGISTRÉE. Si la première arrivait en retard — cache froid, réseau
         lent, 360 fichiers servis par le CDN — elle écrasait la seconde et le
         vêtement s'affichait dans la mauvaise teinte. D'où le défaut
         intermittent : la couleur était bien en session, seule l'image perdait
         la course.

         Chaque appel s'attribue un numéro et ne écrit que s'il est toujours le
         plus récent. `onerror` est gardé de la même façon : sans cela une chaîne
         périmée continuait d'essayer ses candidats et finissait par écrire. */
      var seq = (imgEl.__loadSeq || 0) + 1;
      imgEl.__loadSeq = seq;

      let i = 0;
      const tryNext = () => {
        if (imgEl.__loadSeq !== seq) return;   // un appel plus récent a pris la main
        if (i >= candidates.length) return;
        const url = candidates[i++];
        const test = new Image();
        test.onload = () => { if (imgEl.__loadSeq === seq) imgEl.src = url; };
        test.onerror = tryNext;
        test.src = url;
      };
      tryNext();
    }

    /* ═══════════════════════ IMAGES PATCH (PNG) ═══════════════════════
       Un patch = UNE image PNG (forme + couleur). Le logo se pose PAR-DESSUS.
       - Si l'image colorée patch-{forme}-{slug}.png existe -> on l'affiche.
       - Sinon -> repli sur l'image blanche patch-{forme}-blanc.png, telle
         quelle (aucune teinte : la couleur vient uniquement des vraies
         images fournies par le client).                                       */

    // hex de la pastille -> slug de fichier (mêmes 16 couleurs que les drapeaux).
    var PATCH_COLOR_SLUGS = {
      '#1a1a1a': 'noir', '#f5f2ed': 'blanc-casse', '#9e9e9e': 'gris',
      '#555555': 'gris-fonce', '#607d8b': 'gris-ardoise', '#1e3a5f': 'bleu-marine',
      '#5bb8e8': 'bleu-ciel', '#2e6b45': 'vert-fonce', '#f0c8d8': 'rose-clair',
      '#e8729a': 'rose', '#c0392b': 'rouge', '#e8842a': 'orange',
      '#f5c842': 'jaune', '#9b6bb5': 'violet', '#7d4e2d': 'marron', '#ffffff': 'blanc'
    };
    window.PATCH_COLOR_SLUGS = PATCH_COLOR_SLUGS;

    // Aspect-ratio (largeur/hauteur) de chaque forme, pour ne pas déformer l'image.
    var PATCH_SHAPE_RATIO = { rond: 1, carre: 1, rectangle: 1346 / 861, blason: 829 / 972 };
    window.PATCH_SHAPE_RATIO = PATCH_SHAPE_RATIO;

    // Couleur de patch courante (hex + slug), suivie pour le récap et la capture.
    window.currentPatchHex = '#1a1a1a';
    window.currentPatchSlug = 'noir';

    function patchHexToSlug(hex) {
      if (!hex) return 'noir';
      var h = hex.trim().toLowerCase();
      // rgb(...) -> #rrggbb (le canvas renvoie parfois du rgb()).
      var m = h.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (m) {
        h = '#' + [m[1], m[2], m[3]].map(function (n) {
          return ('0' + parseInt(n, 10).toString(16)).slice(-2);
        }).join('');
      }
      return PATCH_COLOR_SLUGS[h] || 'noir';
    }
    window.patchHexToSlug = patchHexToSlug;

    // URL de la vraie image colorée (peut ne pas exister) pour (forme, slug).
    function patchColorUrl(shape, slug) {
      var t = window.PATCH_IMAGE_URLS || {};
      return t[shape + '-' + slug] || '';
    }
    // URL de l'image blanche de repli (existe toujours) pour la forme.
    function patchWhiteUrl(shape) {
      var t = window.PATCH_WHITE_URLS || {};
      return t[shape] || '';
    }

    /* Applique l'aspect-ratio de la forme au canevas du patch.
       La forme et sa couleur sont désormais rendues en CSS (.patch-body) :
       plus aucune image PNG à charger, donc plus de préchargement ni de fondu
       — le changement de forme est instantané. */
    function updatePatchShapeImg() {
      var canvas = document.getElementById('coins-canvas');
      if (!canvas) return;
      var shape = patchShapeName();
      canvas.style.aspectRatio = PATCH_SHAPE_RATIO[shape] || 1;
    }
    window.updatePatchShapeImg = updatePatchShapeImg;


    function updateProductImages() {
      const prefix = PRODUCT_SLUGS[currentProductKey];
      if (!prefix) return;

      ['face', 'dos', 'cote'].forEach(view => {
        const imgEl = document.getElementById('view-' + view);
        if (!imgEl) return;
        imgEl.style.transition = 'none';
        loadFirstAvailable(imgEl, colorImageCandidates(prefix, currentColorSlug, view));
      });

      // ← Miniature du récap : même logique de repli (EN -> FR -> générique).
      const rcProdImg = document.getElementById('rc-prod-img');
      if (rcProdImg) {
        loadFirstAvailable(rcProdImg, colorImageCandidates(prefix, currentColorSlug, 'face'));
      }

      // Réaligne l'overlay logo de la vignette récap sur la nouvelle image.
      if (typeof updateRecapThumbLogo === 'function') updateRecapThumbLogo();
    }

    /* Synchronise l'overlay logo de la vignette récap (colonne droite) avec le
       logo cœur du canvas (logo-f), pour un aperçu temps réel AVANT ajout au
       panier. Position/taille en % du logo (relatifs au layer) reprojetés sur la
       petite vignette carrée (approx : on reprend les mêmes % — suffisant à cette
       échelle pour donner un aperçu fidèle). */
    function updateRecapThumbLogo() {
      const ov = document.getElementById('rc-prod-logo');
      if (!ov) return;
      const logoEl = document.getElementById('logo-f');
      const img = logoEl ? logoEl.querySelector('img') : null;
      const src = img ? img.getAttribute('src') : null;
      const visible = logoEl && logoEl.style.display !== 'none' && src;
      if (!visible) { ov.style.display = 'none'; ov.src = ''; return; }

      // % inline du logo (relatifs au layer). La vignette produit est en
      // object-fit:contain dans un carré 38px : on applique les mêmes % en
      // laissant un léger facteur pour compenser le contain (le vêtement occupe
      // ~80% de la vignette en hauteur).
      const left = parseFloat(logoEl.style.left) || 38;
      const top  = parseFloat(logoEl.style.top)  || 34;
      const width = parseFloat(logoEl.style.width) || 18;
      ov.src = src;
      ov.style.display = 'block';
      ov.style.left = left + '%';
      ov.style.top = top + '%';
      ov.style.width = width + '%';
      ov.style.height = 'auto';
    }

    /* ── Zones de placement des logos textile (en % du logo-layer) ──
       Chaque zone : bornes (left/top/width/height) = le rectangle pointillé, et
       maxW = largeur max du logo dans cette zone (contraintes cm converties en %).
       logoId = le logo déplaçable ; zoneId = le rectangle guide. */
    /* ÉCHELLE cm -> % du cadre, mesurée sur les PNG RÉELLEMENT AFFICHÉS.
       Référence : largeur du buste (sous les emmanchures) = 53 cm (taille M,
       cf. guide des tailles).

       ATTENTION : mesurer sur sweatshirt-face.png (443x564, buste 91 %) est
       une erreur — ce fichier n'est plus affiché. Les visuels servis sont les
       déclinaisons couleur (sweatshirt-<couleur>-face.png), toutes en 500x500
       avec un buste à ~65 %. Même cadrage 500x500 que les t-shirts, donc un
       seul facteur par axe suffit ici. */
    const CM = {
      tshirt:     { w: 30.2 / 53, h: 70.2 / 53 },
      sweatshirt: { w: 30.0 / 53, h: 70.0 / 53 }
    };

    /* Zone dos : bornes verticales relevées sur les repères atelier.
       DOS_TOP_PCT  = sous la couture d'épaule (au-dessus, l'impression
                      passerait sur l'épaule / la capuche).
       DOS_H_MAX_PCT = hauteur imprimable ; plafonne les 39 cm théoriques, qui
                      descendaient jusqu'aux hanches sur le rendu. */
    /* Zone remontée sous le col (25 % -> 22 %) et allongée (39 % -> 46 %) :
       le rectangle s'arrêtait bien au-dessus de l'ourlet alors que la
       surface imprimable descend plus bas dans le dos. */
    const DOS_TOP_PCT   = 22;
    const DOS_H_MAX_PCT = 46;
    /* Largeur imprimable du dos, en % du visuel (et non convertie depuis les
       cm : voir le commentaire dans buildZones). Calée sur le rendu par
       ajustements successifs : 28 % touchait les coutures, 18 % était trop
       resserré. 22 % occupe le panneau dos en gardant une marge de chaque
       côté, et la hauteur allongée (46 %) suit la forme du vêtement. */
    const DOS_W_PCT     = 22;

    /* Zone de flocage d'une MANCHE (vue de côté), en % du visuel et PAR PRODUIT :
       les silhouettes diffèrent, une valeur unique tombait juste sur le sweat et
       à côté sur les t-shirts. Calée sur le rendu, comme le dos. */
    const SLEEVE = {
      // Sweat : zone haute, elle descend de l'épaule jusqu'au coude.
      sweat:  { left: 46.5, top: 34, w: 9, h: 29 },
      // T-shirts : manche courte, la zone s'arrête avant l'ourlet.
      tshirt: { left: 47.5, top: 29, w: 9, h: 13 },
    };

    /* Contraintes atelier (en cm) :
         Dos     : L30 x H39 max
         Cœur    : 8 cm (logo rond/autre) — le pseudo monte à 12 cm, mais la
                   zone reste à 8 : au-delà, le placement n'est plus « cœur ».
         Manches : rectangle 8x6, ou rond/autre 8x8 -> zone 8x8.
       Positions (left/top) relevées sur les visuels de référence de l'atelier. */
    /* @param isSweat  sweat à capuche : bras plus bas et plus en arrière qu'un
                       t-shirt, d'où une zone de manche distincte (voir SLEEVE). */
    function buildZones(cm, isSweat) {
      // Zone poitrine unifiée : bandeau LARGE et FIN centré sur la poitrine
      // (cf. maquette de référence). Exprimée directement en % du layer — les
      // "cm" servent aux zones dos/manches, mais ici la contrainte est visuelle
      // (un ruban horizontal), pas une taille d'impression fixe.
      // Les logos "gauche" (f) et "droite" (fr) s'y placent librement ; ils
      // démarrent décalés (gauche / droite) pour ne pas se recouvrir à l'upload.
      // Largeur portée de 18 % à 26 % : le bandeau d'origine était trop étroit
      // pour accueillir deux logos côte à côte sans les tasser. Reste centré
      // sur la poitrine (centre à 50 % => left = 50 - 26/2).
      /* Largeur calée sur le rendu : 26 % débordait des coutures d'épaule,
         20 % était trop resserré. 24 % centré (left = 50 - 24/2) occupe la
         surface plate de la poitrine sans mordre sur les coutures. */
      /* `top` distinct pour le sweat : sa capuche et ses cordons descendent
         plus bas que le col d'un t-shirt, si bien qu'à 31 % le bandeau mordait
         sur les cordons au lieu de tomber sur la poitrine. Même principe que
         SLEEVE, qui sépare déjà les deux silhouettes. */
      var CHEST = { left: 38, top: isSweat ? 34 : 31, width: 24, height: 9 };
      // Largeur initiale d'un logo dans le bandeau, et marge intérieure.
      var chLogoW = 7.5, chPad = CHEST.width * 0.06;
      /* Zone dos.
         La largeur atelier (30 cm) convertie à l'échelle du visuel donnait
         ~17 % : un ruban étroit au milieu du dos, très en retrait des coutures
         latérales alors que l'impression peut aller bien plus large.
         L'écart vient de l'échelle (cm.w est calibrée sur la LARGEUR TOTALE du
         vêtement, capuche et manches comprises, pas sur le seul panneau dos).
         On cale donc la zone sur le rendu : 28 % de large, ce qui correspond
         aux 30 cm imprimables sur le dos affiché. */
      var dosW = DOS_W_PCT, dosH = Math.min(39 * cm.h, DOS_H_MAX_PCT);
      /* Le sweat porte une CAPUCHE, qui occupe le haut du panneau dos : à 22 %
         la zone mordait dessus. Elle démarre donc 4 points plus bas, sous les
         épaules — et perd ces 4 points en hauteur pour que son bord INFÉRIEUR
         reste où il tombait déjà bien, au-dessus de l'ourlet. */
      var dosTop = DOS_TOP_PCT;
      if (isSweat) { dosTop += 4; dosH -= 4; }
      // Zone de manche du produit courant (silhouettes différentes).
      var SLV = isSweat ? SLEEVE.sweat : SLEEVE.tshirt;
      return {
        // Logo « Cœur (gauche) » : démarre côté DROIT du bandeau (le porteur voit
        // son cœur à sa gauche = à droite sur le rendu vu de face).
        /* `maxW` = plafond d'AGRANDISSEMENT, `startW` = largeur à l'arrivée.
           Les deux valaient chLogoW (7,5 %), si bien que le client ne pouvait
           jamais dépasser 31 % de la largeur de son bandeau : le redimensionnement
           butait bien avant que le pointillé du logo n'atteigne celui de la zone.
           Le dos et les manches n'avaient pas ce défaut (maxW y égalait déjà
           width) — seule la poitrine était bridée.

           `maxW` monte donc à CHEST.width, et `startW` conserve les 7,5 % de
           départ : un logo de cœur arrive petit, comme avant, mais peut désormais
           remplir toute la zone imprimable. */
        'f':  { zoneId: 'zone-chest', logoId: 'logo-f',
                left: CHEST.left, top: CHEST.top,
                width: CHEST.width, height: CHEST.height,
                maxW: CHEST.width, startW: chLogoW,
                startLeft: CHEST.left + CHEST.width - chLogoW - chPad },
        // Logo « Poitrine droite » : démarre côté GAUCHE du bandeau (droite du
        // porteur = gauche sur le rendu vu de face).
        'fr': { zoneId: 'zone-chest', logoId: 'logo-fr',
                left: CHEST.left, top: CHEST.top,
                width: CHEST.width, height: CHEST.height,
                maxW: CHEST.width, startW: chLogoW,
                startLeft: CHEST.left + chPad },
        // Dos : centré (X≈49.8 %), haut de zone sous le col (sous la capuche
        // pour le sweat, cf. dosTop).
        'b':  { zoneId: 'zone-b',  logoId: 'logo-b',
                left: 49.8 - dosW / 2, top: dosTop, width: dosW, height: dosH, maxW: dosW },
        /* Manches : vue de côté. Le profil droit est le gauche en miroir,
           d'où la zone symétrique (100 - left - width).
           Bornes calées sur le rendu (comme le dos) : la conversion depuis les
           cm donnait ~6 % de large sur 11 % de haut, un rectangle étroit placé
           trop haut — au-dessus de l'emplacement réel du flocage, sur l'épaule.
           SLV_* décrit la zone telle qu'elle apparaît sur le visuel. */
        'sl': { zoneId: 'zone-sl', logoId: 'logo-sl',
                left: SLV.left, top: SLV.top, width: SLV.w, height: SLV.h, maxW: SLV.w },
        'sr': { zoneId: 'zone-sr', logoId: 'logo-sr',
                left: 100 - SLV.left - SLV.w, top: SLV.top,
                width: SLV.w, height: SLV.h, maxW: SLV.w }
      };
    }

    /* Zones du produit courant. Réaffecté par applyZonesForProduct(). */
    /* Sweatshirt = produit affiché au chargement : on construit ses zones, pas
       celles du t-shirt (les manches diffèrent). */
    var LOGO_ZONES = buildZones(CM.sweatshirt, true);
    /* Exposée : conf-text-zone.js la lit pour réaligner la zone guide.
       Réassignée dans applyZonesForProduct() — qui met aussi window.LOGO_ZONES
       à jour, sans quoi l'asset lirait les zones du produit précédent. */
    window.LOGO_ZONES = LOGO_ZONES;

    /* Recentre un logo dans sa zone (bouton « Centrer » des panneaux Logo).
       Réutilise placeLogoInZone(), qui centre déjà à l'upload : le bouton ne
       fait que le rejouer après un déplacement manuel. */
    function centerLogo(zone) {
      var z = LOGO_ZONES[zone];
      var logo = z && document.getElementById(z.logoId);
      var img = logo && logo.querySelector('img');
      // Rien à recentrer tant qu'aucun visuel n'est chargé.
      if (!img || !img.getAttribute('src')) {
        confAlert('Ajoutez d’abord un logo, puis vous pourrez le recentrer.',
                  { icon: 'info', title: 'Aucun logo' });
        return;
      }
      placeLogoInZone(zone);
      // Le récap (colonne de droite) rejoue la position du logo : on le rafraîchit.
      if (typeof updateRecap === 'function') updateRecap();
    }

    /* Recalcule les zones pour le produit courant et repositionne les guides.
       Appelé au changement de produit : sweat et t-shirt n'ont pas la même
       échelle, les bornes en % doivent donc être recalculées. */
    function applyZonesForProduct(productType) {
      var isSweat = String(productType || '').indexOf('sweat') === 0;
      LOGO_ZONES = buildZones(isSweat ? CM.sweatshirt : CM.tshirt, isSweat);
      window.LOGO_ZONES = LOGO_ZONES;   // garde la référence exposée à jour

      // Reporte les bornes sur les rectangles guides du DOM.
      Object.keys(LOGO_ZONES).forEach(function (k) {
        var z = LOGO_ZONES[k];
        var el = document.getElementById(z.zoneId);
        if (!el) return;
        el.style.left   = z.left + '%';
        el.style.top    = z.top + '%';
        el.style.width  = z.width + '%';
        el.style.height = z.height + '%';
        // Un logo déjà posé peut dépasser la nouvelle zone : on le recontraint.
        clampLogoToZone(k);
        // Idem pour le texte : les zones de texte dérivent de LOGO_ZONES, elles
        // changent donc aussi avec le produit.
        if (typeof clampTextToZone === 'function') clampTextToZone(k);
      });
      refreshZoneGuides();
    }

    /* Place un logo AU CENTRE de sa zone, à une largeur adaptée (bornée à maxW),
       puis contraint sa position dans la zone. */
    function placeLogoInZone(zone) {
      var z = LOGO_ZONES[zone];
      if (!z) return;
      var logo = document.getElementById(z.logoId);
      var layer = document.getElementById('logo-layer');
      if (!logo || !layer) return;

      /* Largeur d'arrivée : `startW` quand la zone en définit une, sinon ~90 % de
         sa largeur. La distinction compte pour la poitrine, où le logo doit
         arriver PETIT (7,5 % — un logo de cœur) tout en pouvant être agrandi
         jusqu'aux 24 % de la zone. Sans `startW`, il apparaîtrait d'emblée à
         21,6 %, soit presque tout le bandeau. */
      var w = z.startW != null
        ? Math.min(z.startW, z.maxW, z.width)
        : Math.min(z.maxW, z.width * 0.9);
      logo.style.width = w + '%';

      /* Hauteur MESURÉE (et non approximée) : le layer n'est pas carré, donc
         convertir une largeur en % vers une hauteur en % via le seul ratio de
         l'image était faux — un visuel plus haut que large débordait de la
         zone, en bas comme sur les côtés. On lit la hauteur réelle rendue. */
      var lh = layer.offsetHeight || 1;
      var h = (logo.offsetHeight / lh) * 100;
      /* offsetHeight = 0 si l'image n'est pas décodée OU si le calque est
         masqué (un logo de dos n'est rendu qu'en vue de dos). La géométrie
         nulle qui en résultait plaçait le logo hors zone — invisible sur le
         vêtement alors que la vignette du panneau s'affichait — et elle était
         PERSISTÉE. On retombe sur le ratio naturel de l'image. */
      var im0 = logo.querySelector('img');
      if (!logo.offsetHeight) {
        if (im0 && im0.naturalWidth && im0.naturalHeight) {
          // Largeur en % de la LARGEUR du calque -> hauteur en % de sa HAUTEUR.
          var lw0 = layer.offsetWidth || 1;
          h = ((w / 100) * lw0 * (im0.naturalHeight / im0.naturalWidth) / lh) * 100;
        } else {
          // Pas encore décodée : on replace au chargement.
          if (im0 && !im0.complete) {
            im0.addEventListener('load', function () { placeLogoInZone(zone); }, { once: true });
          }
          return;
        }
      }
      if (h > z.height && h > 0) {
        // Trop haut pour la zone : on réduit la largeur d'autant (ratio gardé).
        w = w * (z.height / h);
        logo.style.width = w + '%';
        /* Re-mesure : on relit le rendu s'il est disponible, sinon on
           applique le même facteur à la hauteur estimée — relire un
           offsetHeight nul remettrait h à 0 et casserait le centrage. */
        h = logo.offsetHeight ? (logo.offsetHeight / lh) * 100 : z.height;
      }

      // Position de départ : centrée par défaut, ou décalée (startLeft) pour la
      // zone poitrine unifiée où gauche (f) et droite (fr) ne doivent pas se
      // superposer. Dans tous les cas, bornée à la zone.
      var startL = (typeof z.startLeft === 'number') ? z.startLeft : z.left + (z.width - w) / 2;
      logo.style.left = clampNum(startL, z.left, z.left + z.width - w) + '%';
      logo.style.top  = clampNum(z.top + (z.height - h) / 2, z.top, z.top + z.height - h) + '%';

      /* Persiste la géométrie DÈS le placement automatique. Elle n'était
         enregistrée qu'en fin de glisser-déposer : un logo jamais déplacé
         n'avait donc rien de sauvegardé, et la restauration le replaçait à
         90 % de la zone au lieu de sa taille réelle.
         Pas pendant une restauration : on écraserait la valeur qu'on est
         justement en train de relire. */
      if (!window.__restoringUploads && typeof saveUploadGeo === 'function') {
        saveUploadGeo(zone, {
          left: logo.style.left,
          top: logo.style.top,
          width: logo.style.width
        });
      }

      refreshZoneGuides();
    }

    /* Borne `v` entre min et max.

       Si max < min, la plage est VIDE : l'élément est plus grand que la zone
       qui doit le contenir. Le `Math.max` extérieur gagnant en dernier,
       l'ancienne version renvoyait alors `min` à CHAQUE appel — et comme le
       clamp tourne à chaque touchmove, la coordonnée était réécrite en
       boucle sur le bord de la zone : le logo semblait figé (visible en
       mobile sur la poitrine, dont le calque est calé sur l'image dessinée
       et rend donc les hauteurs en % nettement plus grandes).

       On centre désormais l'élément sur la plage vide : le débordement se
       répartit des deux côtés et le geste reste suivi. */
    function clampNum(v, min, max) {
      if (max < min) return (min + max) / 2;
      return Math.max(min, Math.min(max, v));
    }

    /* Contraint la position/taille d'un logo pour qu'il reste DANS sa zone.
       Appelé pendant le drag/resize. Renvoie true si une correction a eu lieu. */
    function clampLogoToZone(zone) {
      var z = LOGO_ZONES[zone];
      var logo = z && document.getElementById(z.logoId);
      var layer = document.getElementById('logo-layer');
      if (!z || !logo || !layer) return false;

      var w = parseFloat(logo.style.width) || z.maxW;
      // Largeur bornée à maxW et à la largeur de zone.
      w = Math.min(w, z.maxW, z.width);
      logo.style.width = w + '%';

      /* Hauteur du logo en % de la HAUTEUR du calque.

         Calculée depuis le RATIO NATUREL de l'image plutôt que relue dans
         `offsetHeight` après écriture de la largeur : le navigateur ne
         refait pas la mise en page dans la même frame, donc la relecture
         renvoyait la hauteur d'AVANT la réduction. Le logo restait mesuré
         trop haut, la plage de `top` restait vide, et la correction ne
         convergeait jamais.

         `logo` est positionné en % de la largeur du calque : une largeur w
         vaut w% * lw pixels, d'où une hauteur de w% * lw * (nH / nW) pixels,
         soit (w * lw * nH) / (nW * lh) en % de la hauteur du calque.

         Repli sur la mesure rendue si l'image n'est pas encore décodée. */
      var lw = layer.offsetWidth || 1;
      var lh = layer.offsetHeight || 1;
      var im = logo.querySelector('img');
      var nW = im && im.naturalWidth;
      var nH = im && im.naturalHeight;

      function heightPct(widthPct) {
        if (nW && nH) return (widthPct * lw * nH) / (nW * lh);
        return (logo.offsetHeight / lh) * 100;
      }

      var h = heightPct(w);
      if (h > z.height && h > 0) {
        // Trop haut pour la zone : on réduit la largeur d'autant, ratio gardé.
        w = w * (z.height / h);
        logo.style.width = w + '%';
        h = heightPct(w);
      }

      var left = parseFloat(logo.style.left);
      var top  = parseFloat(logo.style.top);
      if (isNaN(left)) left = z.left;
      if (isNaN(top))  top = z.top;

      logo.style.left = clampNum(left, z.left, z.left + z.width - w) + '%';
      logo.style.top  = clampNum(top,  z.top,  z.top + z.height - h) + '%';
      return true;
    }

    /* Affiche/masque les rectangles guides : visibles seulement si leur logo est
       vide (pas encore d'asset). Pour la zone poitrine, elle se masque dès qu'un
       des deux logos (f ou fr) est présent. */
    function refreshZoneGuides() {
      Object.keys(LOGO_ZONES).forEach(function (zone) {
        var z = LOGO_ZONES[zone];
        var zoneEl = document.getElementById(z.zoneId);
        if (!zoneEl) return;
        
        // Pour la zone poitrine partagée, vérifier les deux logos (f et fr)
        if (z.zoneId === 'zone-chest') {
          var logoF = document.getElementById('logo-f');
          var logoFr = document.getElementById('logo-fr');
          var imgF = logoF ? logoF.querySelector('img') : null;
          var imgFr = logoFr ? logoFr.querySelector('img') : null;
          
          var hasLogoF = logoF && logoF.style.display !== 'none' && imgF && imgF.getAttribute('src');
          var hasLogoFr = logoFr && logoFr.style.display !== 'none' && imgFr && imgFr.getAttribute('src');
          
          // Vérifier aussi les textes sur f et fr
          var txtF = document.getElementById('text-f');
          var txtFr = document.getElementById('text-fr');
          var hasTextF = txtF && txtF.style.display !== 'none' &&
            (txtF.textContent.trim() || txtF.querySelector('svg'));
          var hasTextFr = txtFr && txtFr.style.display !== 'none' &&
            (txtFr.textContent.trim() || txtFr.querySelector('svg'));
          
          // Masquer la zone dès qu'un élément est présent
          zoneEl.classList.toggle('filled', hasLogoF || hasLogoFr || hasTextF || hasTextFr);
          // Un LOGO sur un côté grise le choix de TEXTE de ce côté (réciproque
          // du grisage upload<->texte). Indépendant gauche/droite.
          refreshTextZoneChoices(!!hasLogoF, !!hasLogoFr);
        } else {
          // Autres zones : comportement normal
          var logo = document.getElementById(z.logoId);
          var img = logo ? logo.querySelector('img') : null;
          var hasLogo = logo && logo.style.display !== 'none' && img && img.getAttribute('src');
          var txtEl = (zone === 'b') ? document.getElementById('text-' + zone) : null;
          var hasText = txtEl && txtEl.style.display !== 'none' &&
            (txtEl.textContent.trim() || txtEl.querySelector('svg'));
          zoneEl.classList.toggle('filled', !!hasLogo || !!hasText);
        }
      });
    }
    window.refreshZoneGuides = refreshZoneGuides;

    /* Grise le bouton d'emplacement TEXTE d'un côté quand un LOGO l'occupe.
       Zone poitrine unifiée : pas de texte + logo du même côté. Si le côté
       désactivé était sélectionné, on repli la sélection vers un côté libre. */
    function refreshTextZoneChoices(logoOnF, logoOnFr) {
      var wrap = document.getElementById('txt-where');
      if (!wrap) return;
      var blocked = { f: !!logoOnF, fr: !!logoOnFr };
      var titles = { f: 'Côté cœur, à gauche du porteur',
                     fr: 'Poitrine, à droite du porteur', b: 'Dos du vêtement' };
      var current = null, firstFree = null;
      wrap.querySelectorAll('.txt-where-opt').forEach(function (b) {
        var z = b.getAttribute('data-zone');
        var off = !!blocked[z];                 // b (dos) jamais bloqué
        b.disabled = off;
        b.style.opacity = off ? '0.4' : '';
        b.style.pointerEvents = off ? 'none' : '';
        b.title = off ? 'Un logo occupe ce côté — retirez-le pour y ajouter du texte'
                      : (titles[z] || '');
        if (b.classList.contains('on')) current = b;
        if (!off && !firstFree) firstFree = b;
      });
      // Le côté actif vient d'être bloqué -> basculer vers un côté libre.
      if (current && blocked[current.getAttribute('data-zone')] && firstFree &&
          typeof window.setTextZoneChoice === 'function') {
        window.setTextZoneChoice(firstFree);
      }
    }

    /* Met à jour dynamiquement les bornes des zones selon la TAILLE choisie
       (manches : 8cm vs 5cm de la couture selon t-shirt/sweat — approx visuelle). */

    /* Met à jour la vignette du récap DRAPEAU (colonne droite) : affiche le
       drapeau recto (fond) + le logo uploadé positionné dessus, en temps réel.
       Reflète la vue recto du canvas. */
    function updateFlagRecapThumb() {
      var thumb = document.getElementById('flag-recap-thumb');
      if (!thumb) return;

      /* safeImgSrc OBLIGATOIRE — `getAttribute('src')` relit l'attribut de
         contenu BRUT, guillemets compris. applyUpload() y a écrit la valeur
         telle quelle (`limg.src = src`), et cette valeur peut venir d'un
         design partagé (?design=) ou de conf_uploads en session, tous deux
         hors de notre contrôle. Concaténée en innerHTML plus bas, une valeur
         du genre `/a.png" onerror="…` s'échappait de l'attribut.
         Le getter `.src` aurait encodé le guillemet — pas getAttribute. */
      var baseRecto = document.getElementById('flag-base-recto');
      var bgSrc = baseRecto ? safeImgSrc(baseRecto.getAttribute('src')) : '';

      // Logo recto + sa position (% inline relatifs au drapeau).
      var logoEl = document.getElementById('flag-logo-recto');
      var logoImg = logoEl ? logoEl.querySelector('img') : null;
      var logoSrc = (logoImg && logoEl.style.display !== 'none')
        ? safeImgSrc(logoImg.getAttribute('src')) : '';
      var left = logoEl ? (parseFloat(logoEl.style.left) || 28) : 28;
      var top  = logoEl ? (parseFloat(logoEl.style.top)  || 32) : 32;
      var width = logoEl ? (parseFloat(logoEl.style.width) || 44) : 44;

      if (!bgSrc) return;

      // L'image du drapeau est DÉJÀ à la bonne couleur (une image par couleur) :
      // aucune teinte à appliquer, on affiche simplement l'image + le logo.
      /* Le logo est positionné en % DU DRAPEAU, pas du cadre. Avec un
         object-fit:contain, l'image ne remplit pas la vignette carrée (60px)
         alors qu'un drapeau est en 3:2 : les deux repères divergeaient et le
         logo débordait. On donne donc au conteneur le ratio du drapeau, et
         l'image le remplit — les % redeviennent cohérents. */
      var isPortrait = (window.__flagOrientation === 'portrait');
      var html = '<div style="position:relative;width:100%;aspect-ratio:' +
        (isPortrait ? '2/3' : '3/2') + ';margin:auto;">' +
        '<img src="' + bgSrc + '" alt="Drapeau" style="position:absolute;inset:0;' +
        'width:100%;height:100%;object-fit:fill;display:block;border-radius:4px;">';
      if (logoSrc) {
        html += '<img src="' + logoSrc + '" alt="" style="position:absolute;left:' + left + '%;top:' + top +
                '%;width:' + width + '%;height:auto;object-fit:contain;pointer-events:none;z-index:2;">';
      }
      html += '</div>';
      thumb.innerHTML = html;
      thumb.style.overflow = 'hidden';
      thumb.style.display = 'flex';
      thumb.style.alignItems = 'center';
    }

    /* Met à jour la vignette du récap PATCH (colonne droite) : cercle à la couleur
       de fond choisie + le logo uploadé positionné dessus, en temps réel. */
    function updatePatchRecapThumb() {
      var thumb = document.getElementById('coins-recap-thumb');
      if (!thumb) return;

      var shape = patchShapeName();
      var logoEl = document.getElementById('patch-logo');
      var logoImg = logoEl ? logoEl.querySelector('img') : null;
      /* safeImgSrc : voir updateFlagRecapThumb — getAttribute('src') relit la
         valeur brute posée par applyUpload, qui peut venir d'un design
         partagé. Sans filtre, elle s'échappait de l'attribut en innerHTML. */
      var logoSrc = (logoImg && logoEl.style.display !== 'none')
        ? safeImgSrc(logoImg.getAttribute('src')) : '';

      // Même rendu que le canevas : forme en CSS, design rogné à la silhouette.
      // Les classes .patch-body / .shape-* portent déjà cette géométrie — on la
      // réutilise au lieu de la redéfinir, pour que miniature et aperçu ne
      // puissent pas diverger.
      // On ne remplace PAS tout le style : .rp-patch-thumb porte width/height
      // (60px). Un cssText complet les effacait -> conteneur de hauteur nulle,
      // donc miniature vide. On n'ajuste que le ratio et le débordement.
      thumb.style.aspectRatio = PATCH_SHAPE_RATIO[shape] || 1;
      thumb.style.overflow = 'visible';
      thumb.style.position = 'relative';
      ['rond', 'carre', 'rectangle', 'blason'].forEach(function (s) { thumb.classList.remove('shape-' + s); });
      thumb.classList.add('coins-canvas-circle', 'shape-' + shape);

      var inner = '<div class="patch-body">';
      if (logoSrc) {
        inner += '<img src="' + logoSrc + '" alt="" ' +
                 'style="position:absolute;inset:0;width:100%;height:100%;' +
                 'object-fit:cover;pointer-events:none;">';
      }
      inner += '</div>';
      thumb.innerHTML = inner;
    }


    /* Forme du patch actuellement choisie : 'rond' | 'carre' | 'rectangle' | 'blason'. */
    function patchShapeName() {
      var canvas = document.getElementById('coins-canvas');
      var cls = canvas ? canvas.className : '';
      if (cls.indexOf('shape-blason') !== -1) return 'blason';
      if (cls.indexOf('shape-rectangle') !== -1) return 'rectangle';
      if (cls.indexOf('shape-carre') !== -1) return 'carre';
      return 'rond';
    }

    /* Trace le contour du patch (forme choisie) dans un contexte canvas.
       La zone est définie par (x, y, w, h). Appeler ctx.fill() ensuite. */
    function tracePatchShape(ctx, shape, x, y, w, h) {
      ctx.beginPath();

      if (shape === 'rond') {
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        return;
      }

      if (shape === 'blason') {
        // Même écusson que le clip-path CSS du canvas.
        var pts = [
          [50, 0], [92, 12], [92, 45], [84, 68], [68, 86], [50, 100],
          [32, 86], [16, 68], [8, 45], [8, 12]
        ];
        pts.forEach(function (p, i) {
          var px = x + (p[0] / 100) * w;
          var py = y + (p[1] / 100) * h;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.closePath();
        return;
      }

      // Carré / rectangle : coins arrondis (comme le border-radius du canvas).
      var r = Math.min(w, h) * 0.025;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    /* Forme du patch pour la miniature du récap.
       Renvoie soit un clip-path (blason), soit des rayons (rond/carré/rectangle). */
    function patchShapeStyle() {
      var shape = patchShapeName();

      if (shape === 'blason') {
        // Même écusson que le canvas (haut plat, pointe en bas).
        return {
          clip: 'polygon(50% 0%,92% 12%,92% 45%,84% 68%,68% 86%,50% 100%,' +
                '32% 86%,16% 68%,8% 45%,8% 12%)',
          radius: '', radiusInner: ''
        };
      }
      if (shape === 'carre' || shape === 'rectangle') {
        return { clip: '', radius: '6px', radiusInner: '4px' };
      }
      // Rond par défaut.
      return { clip: '', radius: '50%', radiusInner: '50%' };
    }

    /* Met à jour la vignette du récap COIN (vue RECTO uniquement) : disque
       métallique (fond) + logo positionné, en temps réel. */
    /* updateCoinRecapThumb() vit desormais dans assets/conf-coin-thumb.js
       (limite Shopify de 256 Ko). Appelee via window.*. */

    /* Renvoie l'URL CDN de l'image {produit}-{couleur}-{vue} pour l'état courant,
       avec repli sur l'image générique du produit. Source fiable et synchrone
       pour l'aperçu envoyé au panier (indépendante du chargement DOM). */
    // Force une URL absolue https: (les asset_url Shopify sont protocole-relatifs
    // "//cdn..." — le backend Node ne sait pas les parser).
    function absUrl(u) {
      if (!u) return u;
      if (u.indexOf('//') === 0) return window.location.protocol + u;
      if (u.charAt(0) === '/') return window.location.origin + u;
      return u;
    }

    function currentProductImageURL(view) {
      const prefix = PRODUCT_SLUGS[currentProductKey];
      if (!prefix) return '';
      /* Ordre de recherche : slug ANGLAIS, puis français, puis générique.

         L'ordre était INVERSÉ — français, générique, anglais en dernier. Or
         seules 15 des 40 couleurs avaient une entrée française : les 25 autres
         atteignaient le générique AVANT leur vraie image. Constaté le
         12/08/2026 : un t-shirt « Sand » s'affichait juste dans le canvas (qui
         lit PRODUCT_IMAGE_URLS directement) mais BLANC dans la vue d'ensemble et
         sur la planche de commande, qui passent toutes deux par ici.

         Les 360 visuels existent maintenant en slug anglais
         (scripts/renommer-images-textiles.mjs) : c'est la source de vérité. Les
         deux replis restent pour un fichier qui viendrait à manquer — mieux vaut
         une image approximative qu'un canvas vide. */
      const urls = window.PRODUCT_IMAGE_URLS || {};
      const legacyUrls = window.PRODUCT_IMAGE_URLS_LEGACY || {};
      const legacyMap = window.COLOR_SLUG_LEGACY || {};
      const enKey = prefix + '-' + currentColorSlug + '-' + view;
      const frSlug = legacyMap[currentColorSlug];
      const frKey = frSlug ? (prefix + '-' + frSlug + '-' + view) : null;
      const fallbacks = (window.PRODUCT_FALLBACK_URLS || {})[prefix] || {};
      const chosen =
        urls[enKey] ||
        (frKey && legacyUrls[frKey]) ||
        fallbacks[view] || '';
      return absUrl(chosen);
    }

    /* ── Applique la couleur : charge les images correspondantes ── */
    function applyColor(hex) {
      updateProductImages();
    }

    function shadeHex(hex, pct) {
      const n = parseInt(hex.replace('#',''), 16);
      const r = Math.min(255, Math.max(0, (n>>16) + pct));
      const g = Math.min(255, Math.max(0, ((n>>8)&0xff) + pct));
      const b = Math.min(255, Math.max(0, (n&0xff) + pct));
      return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
    }

    /* ── Product select ── */
    function selProd(el) {
      document.querySelectorAll('.pt').forEach(c => c.classList.remove('on'));
      el.classList.add('on');

      const productType = el.dataset.product;
      // Mémorise le type courant pour TOUS les produits (utilisé au checkout).
      if (productType) currentProductType = productType;
      /* Exposé : conf-overview.js s'en sert pour n'afficher l'onglet
         « Vue d'ensemble » que sur les textiles. */
      window.currentProductType = currentProductType;
      if (typeof window.refreshOverviewTab === 'function') window.refreshOverviewTab();

      // Les zones d'impression sont en % du cadre, et sweat / t-shirt n'ont
      // pas la même échelle d'image : on les recalcule à chaque changement.
      if (typeof applyZonesForProduct === 'function') applyZonesForProduct(productType);

      /* Commande de groupe : réservée aux textiles. Le point d'entrée est
         « Ajouter plusieurs noms » (section Texte) ; l'ancien bouton reste
         masqué en permanence. */
      var isTx = ['sweatshirt', 'tshirt', 'tshirt_polyester'].indexOf(productType) !== -1;
      refreshMultiNameBtn(productType);
      // Persiste le produit choisi : au reload (F5), on revient sur CE produit
      // au lieu de repartir sur le sweatshirt par défaut.
      try { if (productType) sessionStorage.setItem('conf_current_product', productType); } catch (e) {}

      /* Vignette + nom dans le récap.
         Deux structures de carte coexistent : l'ancienne type-bar (.pt-img,
         span) et le sidebar moderne (.product-card-icon img,
         .product-card-name). Le code ne visait que la première : depuis le
         passage au sidebar moderne, le récap restait figé sur « Sweatshirt ». */
      const rcProdImg = document.getElementById('rc-prod-img');
      if (rcProdImg) {
        const ptImg = el.querySelector('.pt-img, .product-card-icon img');
        if (ptImg) rcProdImg.src = ptImg.src;
      }

      const rcProd = document.getElementById('rc-prod');
      if (rcProd) {
        const ptLabel = el.querySelector('.product-card-name') ||
                        el.querySelector('span:not(.pt-ck)');
        if (ptLabel) rcProd.textContent = ptLabel.textContent.trim();
      }

      // ← AJOUT : sauvegarder les logos du produit actuellement actif
      if (currentProductKey) {
        if (typeof window.saveLogosForProduct === 'function') window.saveLogosForProduct(currentProductKey);
      }

      if (productType && window.dynamicLayoutManager) {
        window.dynamicLayoutManager.handleProductChange(productType);
      }

      if (productType && (productType === 'sweatshirt' || productType === 'tshirt' || productType === 'tshirt_polyester')) {
        currentProductKey = productType;

        // Restaure la couleur PROPRE à ce produit (chaque textile garde la sienne).
        // Si aucune couleur mémorisée, on revient au Noir par défaut.
        applyColorForProduct(productType);

        updateProductImages();

        // ← AJOUT : restaurer les logos sauvegardés pour ce produit
        if (typeof window.restoreLogosForProduct === 'function') window.restoreLogosForProduct(productType);
        // Restaurer les textes personnalisés de ce produit.
        if (typeof restoreTexts === 'function') restoreTexts();

        // Recalcule le prix affiché pour le TEXTILE choisi : sans cela, le prix
        // restait figé sur celui du produit affiché au chargement de la page
        // (sweat 60 € gardé sur les t-shirts, ou inversement). Limité aux
        // textiles : coins/drapeaux ont leur propre affichage de prix.
        if (typeof updateTotalPrice === 'function') updateTotalPrice();
      }
    }

    /* Applique la couleur mémorisée d'un produit textile (ou Noir par défaut) :
       met à jour l'état + l'état visuel de la pastille, SANS re-sauvegarder (on
       lit ce qui a été enregistré pour CE produit). */
    function applyColorForProduct(productType) {
      var saved = savedColorFor(productType);
      var name = (saved && saved.name) ? saved.name : 'Black';
      var hex = (saved && saved.hex) ? saved.hex : '#0a0a0a';

      currentColor = hex;
      currentColorName = name;
      currentColorSlug = COLOR_SLUGS[name] || 'noir';

      // État visuel de la pastille correspondante.
      document.querySelectorAll('.cs').forEach(function (s) { s.classList.remove('on'); });
      var cs = document.querySelectorAll('.cs');
      for (var i = 0; i < cs.length; i++) {
        if (cs[i].getAttribute('title') === name) { cs[i].classList.add('on'); break; }
      }
      var rc = document.getElementById('rc-color');
      if (rc) rc.textContent = 'Couleur : ' + name;

      /* Sélecteur « Couleur » en haut du canvas : il n'était pas mis à jour
         ici, d'où un écart visible entre lui et le récap au changement de
         produit (chaque textile garde sa propre couleur). */
      var cvVal = document.getElementById('cv-color-val');
      if (cvVal) cvVal.textContent = name;
      var cvSw = document.getElementById('cv-color-swatch');
      if (cvSw) cvSw.style.background = hex;
    }


    /* VERROU D'AJOUT AU PANIER — partagé par addToCart et addCustomToCart.

       Les deux fonctions traversent plusieurs `await` (composition d'aperçu,
       upload des assets) avant de pousser la ligne. Sans verrou, un double-clic
       lançait deux exécutions concurrentes :

         - liste de groupe : les deux lisaient `groupOrderRows` non nul avant que
           l'une ait pu le remettre à null (ce qui n'arrive qu'APRÈS les await).
           Une liste de 10 personnes partait deux fois, avec deux groupLabel
           distincts — donc aucune déduplication par pushToCart, et une commande
           double facturée ;
         - hors groupe : pushToCart déduplique, mais avec `qty += qty`, donc la
           quantité doublait quand même.

       La désactivation du bouton existait déjà mais était CONDITIONNELLE à la
       présence d'un logo (busy() dans resolveDesignImage) : un design en texte
       seul — cas courant — ne désactivait jamais rien, alors que
       collectTextAssets() fait des appels réseau.

       Ce verrou est indépendant du DOM : il tient même si le bouton n'est pas
       trouvé, ou si un appel vient d'ailleurs que d'un clic. */
    var cartAddBusy = false;

    /** Enveloppe une fonction d'ajout : un seul ajout à la fois. */
    function withCartLock(fn) {
      return async function () {
        if (cartAddBusy) return;
        cartAddBusy = true;

        /* Retour visuel INCONDITIONNEL, en complément du verrou : celui-ci
           empêche le second ajout, mais sans bouton grisé le client croit que
           son clic n'a rien fait et reclique. On ne touche pas au libellé —
           resolveDesignImage() le fait déjà quand il y a un aperçu à composer,
           et l'écraser ici ferait clignoter deux textes. */
        var lockBtn = document.getElementById('main-add-to-cart');
        var wasDisabled = lockBtn ? lockBtn.disabled : false;
        if (lockBtn) lockBtn.disabled = true;

        try {
          return await fn.apply(this, arguments);
        } finally {
          cartAddBusy = false;
          /* On ne réactive que si NOUS avons désactivé : sinon on annulerait
             une désactivation légitime posée entre-temps (bouton masqué parce
             que le panier bascule en devis, par exemple). */
          if (lockBtn && !wasDisabled) lockBtn.disabled = false;
        }
      };
    }

    async function addToCartInner() {
      // cartCount est recalculé depuis cartItems par pushToCart : ne pas
      // l'incrémenter ici (faux pour une liste de groupe = plusieurs lignes).

      // Récupère les infos du produit courant
      const rcProdImg = document.getElementById('rc-prod-img');
      const rcProd    = document.getElementById('rc-prod');
      const rcColor   = document.getElementById('rc-color');
      const rcSize    = document.getElementById('rc-size');

      /* Prix UNITAIRE de la ligne (RV6).

         Ce champ lisait `#rp-price-val`, qui affiche le TOTAL
         (`basePrice + sleeveExtra) * qty`, voir updateTotalPrice) : `item.price`
         contenait donc un total étiqueté comme prix unitaire. Inoffensif tant
         que l'affichage recalcule tout via tierUnitPrice(), mais c'était une
         sur-facturation en sommeil — et déjà fausse pour une commande de
         groupe, où le même total était recopié sur chaque ligne quelle que
         soit sa quantité.

         On recalcule donc depuis la MÊME source que l'affichage, sans relire
         le DOM : le palier dégressif du produit, avec repli sur
         `prixUnitaire()` comme dans updateTotalPrice.

         Le supplément manches est VOLONTAIREMENT exclu. `cartUnitPrice()`
         l'ajoute déjà par-dessus `effectiveUnitPrice()`, laquelle retombe sur
         `item.price` pour les produits sans grille (coins, patchs sous 10
         pièces) : l'inclure ici le compterait deux fois sur ces lignes.
         `item.price` = prix de base unitaire, les options restent à
         l'appelant. */
      let price = 0;
      {
        const qtyForTier = (typeof textileQty === 'function') ? textileQty() : 1;
        let unit = null;
        if (typeof window.tierUnitPrice === 'function') {
          unit = window.tierUnitPrice(currentProductType, qtyForTier);
        }
        if (unit == null) {
          unit = window.prixUnitaire ? window.prixUnitaire(currentProductType) : 0;
        }
        price = Number(unit) || 0;
      }

      // Image de base (fallback) : la vue de face du produit, à la COULEUR courante.
      // On calcule l'URL directement (produit+couleur) plutôt que de lire
      // view-face.src, qui est mis à jour de façon asynchrone (new Image().onload)
      // et peut encore pointer sur la couleur précédente au moment du clic.
      let fallbackSrc = currentProductImageURL('face');
      if (!fallbackSrc) {
        const canvasImg = document.getElementById('view-face');
        if (canvasImg && canvasImg.src && !canvasImg.src.endsWith(window.location.href)) {
          fallbackSrc = canvasImg.src;
        } else if (rcProdImg) {
          fallbackSrc = rcProdImg.src;
        }
      }

      const btnEl = document.getElementById('main-add-to-cart');
      // Compose 2 aperçus : une VIGNETTE (face seule + logo, carrée, pour le
      // panier) et une PLANCHE multi-vues (face+dos+côté, pour la commande).
      const design = await resolveDesignImage(fallbackSrc, btnEl);

      // Logos uploadés + textes personnalisés rasterisés (courbe/couleur/taille
      // fidèles) uploadés sur Cloudinary : les deux apparaissent parmi les
      // assets de la commande.
      const logoAssets = collectDesignAssets();
      const textAssets = await collectTextAssets();

      const productName = rcProd ? rcProd.textContent.trim() : 'Produit personnalisé';
      const sleeves = (typeof sleeveCount === 'function') ? sleeveCount() : 0;

      /* LISTE DE GROUPE validée : le design est commun, mais chaque personne a
         sa taille et sa couleur -> une ligne de panier par personne. La couleur
         est écrite « Couleur : X » car variantForItem (recapitulatif.liquid)
         extrait le nom via ce format pour choisir le bon variant ; sans le
         préfixe, tout le monde retomberait sur le variant de repli. */
      if (groupOrderRows && groupOrderRows.length) {
        const rows = groupOrderRows;
        // Toutes les lignes partagent ce libellé : elles restent identifiables
        // comme UNE même liste dans le panier et sur la commande Shopify.
        const groupLabel = 'Groupe ' + rows.length + ' pers. #' + String(Date.now()).slice(-5);
        rows.forEach(function (r, idx) {
          pushToCart({
            id: Date.now() + idx,
            productType: currentProductType,
            name: productName,
            color: 'Couleur : ' + r.color,
            size: r.size,
            personName: r.name || '',    // distingue deux personnes identiques
            groupLabel: groupLabel,
            groupIndex: (idx + 1) + '/' + rows.length,
            price: price,
            img: design.thumb,
            sheet: design.sheet,
            assets: logoAssets.concat(textAssets),
            sleeveCount: sleeves,
            qty: r.qty,
            _sizeGroupSummary: r._sizeGroupSummary  // 🆕 Transmet le résumé groupe
          }, idx === rows.length - 1 ? btnEl : null);
        });
        // Consommée : un second clic ne redupliquerait pas la liste.
        groupOrderRows = null;
        saveGroupRows();        // efface aussi la copie en session
        refreshGroupBadge();
        return;
      }

      const item = {
        id: Date.now(),
        productType: currentProductType,
        name:  productName,
        color: rcColor ? rcColor.textContent.trim() : '',
        size:  rcSize  ? rcSize.textContent.trim()  : '',
        price: price,
        img:   design.thumb,   // vignette panier (face + logo)
        sheet: design.sheet,   // planche multi-vues (aperçu commande) — peut être null
        // URLs Cloudinary des logos/textes réellement utilisés (pour la commande Shopify)
        assets: logoAssets.concat(textAssets),
        // Nombre de manches personnalisées : facturé au checkout via le produit
        // add-on (voir buildShopifyItems dans recapitulatif.liquid).
        sleeveCount: sleeves,
        // Quantité choisie dans le récap (champ QUANTITÉ des textiles).
        qty: (typeof textileQty === 'function') ? textileQty() : 1
      };

      pushToCart(item, btnEl);
    }

    /* Le nom `addToCart` DOIT rester une fonction globale : il est appelé
       depuis un onclick inline (configurateur.liquid). On expose donc la
       version verrouillée sous ce nom. */
    var addToCart = withCartLock(addToCartInner);
    window.addToCart = addToCart;

    /* Rassemble les assets (logos uploadés) réellement utilisés pour le produit
       courant, sous forme d'URLs Cloudinary hébergées afin qu'elles restent
       accessibles dans la commande Shopify (une data-URL ne le serait pas).
       Chaque entrée = { label, url }. On ne garde que les zones dont le logo est
       affiché ET dont l'upload Cloudinary a réussi. */
    function collectDesignAssets() {
      const zoneLabels = {
        f:  'Logo cœur',
        b:  'Logo dos',
        sl: 'Logo manche gauche',
        sr: 'Logo manche droite'
      };
      const cloud = window.CLOUDINARY_URLS || {};
      const assets = [];
      Object.keys(zoneLabels).forEach(zone => {
        // La zone est utilisée si son aperçu sidebar affiche bien une image.
        const img = document.getElementById('i' + zone);
        const shown = img && img.getAttribute('src') && img.getAttribute('src') !== '' &&
                      img.src !== window.location.href;
        if (!shown) return;
        const url = cloud[zone];
        if (url) assets.push({ label: zoneLabels[zone], url: url });
      });
      return assets;
    }

    /* Rasterise le texte personnalisé d'une zone en PNG transparent, FIDÈLE au
       rendu (courbe, couleur, taille de police). Renvoie une data-URL, ou ''
       si la zone n'a pas de texte. Réutilisé pour les vignettes-assets de la
       commande (le texte apparaît alors parmi les logos). */
    function textAssetDataUrl(zone) {
      var el = document.getElementById('text-' + zone);
      if (!el || el.style.display === 'none') return '';
      var content = el.querySelector('.dt-content');
      if (!content) return '';
      var raw = (content.textContent || '').trim();
      if (!raw) return '';

      var cs = window.getComputedStyle(el);
      var color = cs.color || '#111';
      var fontFamily = cs.fontFamily || 'sans-serif';

      // Texte COURBÉ : rasterise le SVG déjà rendu (conserve la forme exacte).
      var svg = content.querySelector('svg');
      if (el.classList.contains('is-shaped') && svg) {
        var clone = svg.cloneNode(true);
        clone.setAttribute('width', '600');
        clone.setAttribute('height', '180');
        var xml = new XMLSerializer().serializeToString(clone);
        var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        return new Promise(function (resolve) {
          var im = new Image();
          im.onload = function () {
            var cv = document.createElement('canvas');
            cv.width = 600; cv.height = 180;
            cv.getContext('2d').drawImage(im, 0, 0, 600, 180);
            try { resolve(cv.toDataURL('image/png')); } catch (e) { resolve(''); }
          };
          im.onerror = function () { resolve(''); };
          im.src = url;
        });
      }

      // Texte SIMPLE : dessin canvas 2D haute résolution.
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
      try { return cv.toDataURL('image/png'); } catch (e) { return ''; }
    }

    /* Rasterise les textes (face/dos), les upload sur Cloudinary, et renvoie
       leurs assets { label, url } pour la commande. Async : l'upload doit
       aboutir à une URL hébergée (une data-URL serait rejetée par Shopify). */
    async function collectTextAssets() {
      if (!window.ConfAPI || typeof window.ConfAPI.uploadLogo !== 'function') return [];
      var zones = [{ z: 'f', label: 'Texte face' }, { z: 'b', label: 'Texte dos' }];
      var out = [];
      for (var i = 0; i < zones.length; i++) {
        var dataUrl = await Promise.resolve(textAssetDataUrl(zones[i].z));
        if (!dataUrl) continue;
        try {
          var file = dataUrlToFile(dataUrl, 'texte-' + zones[i].z + '.png');
          var res = await window.ConfAPI.uploadLogo(file);
          var url = res && (res.url || res.secure_url);
          if (url) out.push({ label: zones[i].label, url: url });
        } catch (e) { /* upload raté : on n'ajoute pas ce texte, sans bloquer */ }
      }
      return out;
    }

    /* Assets (logos Cloudinary) utilisés pour les produits NON textiles :
       drapeaux (recto/verso), coins (recto/verso), patch (unique). On considère
       une zone "utilisée" si son logo déplaçable est visible dans le canvas. */
    function collectCustomAssets() {
      var cloud = window.CLOUDINARY_URLS || {};
      // zone (clé CLOUDINARY_URLS) -> { label, logoElId (canvas) }
      var map = {
        'flag-recto':  { label: 'Design recto', el: 'flag-logo-recto' },
        'flag-verso':  { label: 'Design verso', el: 'flag-logo-verso' },
        'coin-recto':  { label: 'Logo recto',   el: 'coin-logo-recto' },
        'coin-verso':  { label: 'Logo verso',   el: 'coin-logo-verso' },
        'c':           { label: 'Design patch', el: 'patch-logo' }
      };
      var assets = [];
      Object.keys(map).forEach(function (zone) {
        var conf = map[zone];
        var logoEl = document.getElementById(conf.el);
        var visible = logoEl && logoEl.style.display !== 'none' &&
                      logoEl.querySelector('img') && logoEl.querySelector('img').getAttribute('src');
        if (!visible) return;
        var url = cloud[zone];
        if (url) assets.push({ label: conf.label, url: url });
      });
      return assets;
    }

    /* Compose les aperçus du design. Retourne { thumb, sheet } :
       - thumb : image VIGNETTE (vue de face + logo, carrée) pour le panier ;
       - sheet : PLANCHE multi-vues (face+dos+côté) pour l'aperçu de la commande
                 (null si non textile ou si aucun logo/échec).
       Si aucun logo, thumb = fallbackSrc (image couleur simple). */
    async function resolveDesignImage(fallbackSrc, btnEl) {
      let original = null;
      const busy = () => { if (btnEl && original === null) { original = btnEl.innerHTML; btnEl.disabled = true; btnEl.innerHTML = 'Préparation du design…'; } };
      const done = () => { if (btnEl && original !== null) { btnEl.disabled = false; btnEl.innerHTML = original; original = null; } };

      // --- 1) VIGNETTE : vue de face + logo cœur (image carrée lisible) ---
      //
      // Un repli capturait ici la VUE COURANTE quand la face n'avait pas de
      // logo. Résultat : en vue de côté, il récupérait le logo de MANCHE (avec
      // ses coordonnées de profil) et le composait sur l'image de FACE — le
      // logo de manche se retrouvait plaqué au milieu du torse.
      //
      // La vignette du panier montre la face, et rien d'autre. Si la face n'est
      // pas personnalisée, on garde l'image produit nue (fallbackSrc) : les
      // manches sont visibles sur la planche de production, pas ici.
      const isTextile = ['sweatshirt', 'tshirt', 'tshirt_polyester']
        .indexOf(currentProductType) !== -1;

      let thumb = fallbackSrc;
      let faceDesign = null;
      try {
        faceDesign = captureFaceDesign();
        // Coins / drapeaux / patchs n'ont pas de « vue de face » : pour eux, la
        // vue courante EST le design. Le repli reste donc légitime.
        if (!isTextile &&
            (!faceDesign || !faceDesign.logos || !faceDesign.logos.length)) {
          const fb = captureCurrentDesign();
          if (fb && fb.logos && fb.logos.length) faceDesign = fb;
        }
      } catch (e) { faceDesign = null; }

      if (faceDesign && faceDesign.logos && faceDesign.logos.length) {
        busy();
        try {
          const bg = fallbackSrc || faceDesign.background;
          const res = await window.ConfAPI.createPreviewImage(bg, faceDesign.logos);
          if (res && res.url) thumb = res.url;
        } catch (e) {
          console.error('Composition vignette échouée :', e);
        }
      }

      // --- 2) PLANCHE multi-vues (textile uniquement, si au moins un logo) ---
      let sheet = null;
      try {
        const views = await captureAllViews();
        if (views && views.length && views.some(v => v.logos && v.logos.length)) {
          busy();
          try {
            const res = await window.ConfAPI.createMultiViewImage(views);
            if (res && res.url) sheet = res.url;
          } catch (e) {
            console.error('Composition multi-vues échouée :', e);
          }
        }
      } catch (e) { /* non textile : pas de planche */ }

      done();
      return { thumb: thumb, sheet: sheet };
    }

    /* ── Ajout générique au panier (textile, drapeaux, coins, patchs) ──
       replaceQty = true : la quantité de l'item EST le nombre d'unités (coins/patchs/drapeaux),
       on remplace au lieu de cumuler. false (textile) : on cumule +1 à chaque ajout. */
    function pushToCart(item, btnEl, replaceQty) {
      // Vérifie si le même article existe déjà (même nom+détails).
      // personName entre dans la clé : deux personnes d'une liste de groupe
      // ayant même taille+couleur doivent rester DEUX lignes distinctes.
      const existing = cartItems.find(i => i.name === item.name && i.color === item.color &&
                                           i.size === item.size &&
                                           (i.personName || '') === (item.personName || ''));
      if (existing) {
        if (replaceQty) {
          existing.qty = item.qty || 1;   // remplacer par la quantité choisie
        } else {
          existing.qty += (item.qty || 1); // cumuler
        }
        // Met à jour le design (image/planche/assets) : le client a pu modifier
        // son logo avant de ré-ajouter le même produit/couleur/taille.
        existing.img = item.img;
        existing.sheet = item.sheet;
        existing.assets = item.assets;
      } else {
        cartItems.push(item);
      }
      cartCount = cartItems.reduce((s, i) => s + (i.qty || 1), 0);

      // Afficher le bouton panier dans le header
      const cartBtn    = document.getElementById('hdr-cart-btn');
      const cartCountEl = document.getElementById('hdr-cart-count');
      if (cartBtn) {
        cartBtn.style.display = 'inline-flex';
        cartBtn.style.animation = 'none';
        void cartBtn.offsetWidth;
        cartBtn.style.animation = 'cartBounce 0.4s ease';
      }
      if (cartCountEl) cartCountEl.textContent = cartCount;

      // Sauvegarder le panier pour la page Récapitulatif (utilisé par le drawer).
      // persistCartSafe signale la saturation du quota — voir sa définition.
      window.persistCartSafe(cartItems);

      // Feedback bouton
      if (btnEl) {
        const original = btnEl.innerHTML;
        btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> Ajouté !`;
        btnEl.style.background = '#16a34a';
        setTimeout(() => { btnEl.innerHTML = original; btnEl.style.background = ''; }, 1800);
      }

      // Ouvrir le drawer
      renderCartDrawer();
      openCartDrawer();
    }

    /* ── Ajout au panier depuis les récaps Drapeaux / Coins / Patchs ──
       Lit les infos directement dans le récap courant (colonne droite). */
    async function addCustomToCartInner(btnEl) {
      const recap = document.querySelector('.recap');
      if (!recap) return;

      // Nom du produit (titre du récap)
      const titleEl = recap.querySelector('.rp-patch-title');
      const name = titleEl ? titleEl.textContent.trim() : 'Produit personnalisé';

      // Détails (type, taille, forme, finition...) concaténés
      const details = Array.from(recap.querySelectorAll('.rp-patch-details p'))
        .map(p => p.textContent.trim())
        .join(' · ');

      // Quantité : cibler l'input quantité du récap actif (coins/patchs/drapeaux)
      const qtyInput = recap.querySelector(
        '#coin-recap-qty-input, #coin-qty-input, #flag-qty-input, input[type="number"]'
      );
      /* Plancher au MINIMUM DE COMMANDE du produit, et non à 1 : l'attribut
         `min` du champ (50 pour les coins, 10 pour les patchs) ne contraint que
         la saisie au clavier — il est ignoré quand la valeur est vide ou
         illisible. Un coin partait alors au panier à 1 pièce, sous le seuil de
         l'atelier. */
      const qMin = minQtyPour(currentProductType);
      const qty = qtyInput
        ? Math.max(qMin, parseInt(qtyInput.value) || qMin)
        : qMin;

      /* Prix UNITAIRE de la ligne — même traitement que addToCart (RV6).

         Ce bloc relisait le prix AFFICHÉ dans le récap, avec trois défauts :
           1. le récap des coins (conf-dynamic-layout.js, gabarit
              `#coin-recap-size`) n'a AUCUN élément de prix : `totalEl` était
              null, donc `price = 0` — tout coin partait au panier à 0 € ;
           2. le parseur agrège tous les chiffres du texte, donc un libellé
              comme « 3,50 €/u (x100) » donnait 3.501 ;
           3. aller-retour destructif `price * qty` puis `price / qty`.

         On recalcule donc depuis la même source que l'affichage. Le
         supplément manches reste EXCLU, comme dans addToCart : cartUnitPrice()
         l'ajoute par-dessus effectiveUnitPrice(), qui retombe sur item.price
         pour les produits sans grille — l'inclure ici le compterait deux fois.
         Voir RV6 dans AUDIT-FRONTEND.md. */
      let price = 0;
      {
        let unit = null;
        if (typeof window.tierUnitPrice === 'function') {
          unit = window.tierUnitPrice(currentProductType, qty);
        }
        if (unit == null) {
          unit = window.prixUnitaire ? window.prixUnitaire(currentProductType) : 0;
        }
        price = Number(unit) || 0;
      }

      // Image de la vignette panier + planche d'aperçu (recto/verso).
      let imgSrc = '';
      let sheetSrc = null;

      /* PATCH : capturePatchDesign() rend désormais une image DÉJÀ COMPOSÉE
         (logo découpé à la forme, aplati dans le fond). On l'utilise telle
         quelle — la faire recomposer par le serveur ajouterait un aller-retour
         pour un résultat identique.
         Le repli « canvas taint » renvoie encore un calque séparé : dans ce
         cas seulement, on passe par le serveur. */
      if (currentProductType === 'patches') {
        var patch = null;
        try { patch = await capturePatchDesign(); } catch (e) { patch = null; }
        if (patch && patch.background) {
          if (patch.logos && patch.logos.length) {
            var origP = btnEl ? btnEl.innerHTML : '';
            if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = 'Préparation…'; }
            try {
              var resP = await window.ConfAPI.createPreviewImage(patch.background, patch.logos);
              if (resP && resP.url) imgSrc = resP.url;
            } catch (e) { console.error('Composition patch échouée :', e); }
            finally { if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origP; } }
          } else {
            imgSrc = patch.background;
          }
        }
      }

      // DRAPEAU / COINS : compose le design côté serveur.
      // - img (vignette panier) = RECTO seul.
      // - sheet (Aperçu commande) = planche recto + verso.
      var customViews = null;
      try {
        if (currentProductType === 'drapeaux') customViews = captureFlagDesign();
        else if (currentProductType === 'coins') customViews = captureCoinDesign();
      } catch (e) { customViews = null; }

      if (customViews && customViews.length) {
        var original = btnEl ? btnEl.innerHTML : '';
        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = 'Préparation…'; }
        try {
          // Vignette : recto seul (image carrée lisible).
          var recto = customViews[0];
          if (recto && recto.logos && recto.logos.length) {
            var res = await window.ConfAPI.createPreviewImage(recto.background, recto.logos);
            if (res && res.url) imgSrc = res.url;
          }
          // Planche : recto + verso (si au moins 2 faces).
          if (customViews.length >= 2) {
            var resM = await window.ConfAPI.createMultiViewImage(customViews);
            if (resM && resM.url) sheetSrc = resM.url;
          }
        } catch (e) { console.error('Composition aperçu échouée :', e); }
        finally { if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = original; } }
      }

      // Repli : miniature du récap si <img>, sinon image de base du canvas.
      if (!imgSrc) {
        const thumbImg = recap.querySelector('.rp-patch-thumb img');
        if (thumbImg && thumbImg.src) {
          imgSrc = thumbImg.src;
        } else {
          const canvasImg = document.querySelector(
            '.flag-base-img, .coin-base-img, #coins-preview-img, .coins-canvas-circle img'
          );
          if (canvasImg && canvasImg.src) imgSrc = canvasImg.src;
        }
      }

      const item = {
        id: Date.now(),
        productType: currentProductType,
        name: name,
        color: details,   // on met les détails dans le champ "color" (affiché en propriétés)
        size: '',
        price: price,   // déjà UNITAIRE (voir le calcul plus haut, RV6/A2)
        qty: qty,
        img: imgSrc,
        sheet: sheetSrc,   // planche recto/verso pour l'_Aperçu de la commande
        assets: collectCustomAssets()   // logos utilisés -> visibles dans la commande
      };

      // replaceQty = true : la quantité est le nombre d'unités commandé (pas un cumul d'ajouts)
      pushToCart(item, btnEl, true);
    }

    /* Même verrou que addToCart : ses désactivations de bouton étaient aussi
       conditionnelles (patch.logos / customViews), donc un coin sans logo
       passait sans aucune protection. Appelée depuis un onclick inline, d'où
       l'exposition sous le nom d'origine. */
    var addCustomToCart = withCartLock(addCustomToCartInner);
    window.addCustomToCart = addCustomToCart;

    /* ── Demande de devis (Coins) : ouvre un modal avec formulaire + design du coin ── */
    function requestCoinQuote(btnEl) {
      const recap = document.querySelector('.recap');

      // Récupère les détails du coin depuis le récap
      const name = 'Coin métal personnalisé';
      const details = recap ? Array.from(recap.querySelectorAll('.rp-patch-details p'))
        .map(p => p.textContent.trim()) : [];
      const qtyInput = recap ? recap.querySelector('#coin-recap-qty-input, input[type="number"]') : null;
      const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;

      // Vérifie qu'une source d'image est réelle (pas vide, pas la page elle-même)
      const validSrc = (el) => {
        if (!el || !el.getAttribute) return '';
        const s = el.getAttribute('src') || '';
        if (!s || s.trim() === '' || s === window.location.href) return '';
        // ignorer si l'image est masquée
        if (el.style && el.style.display === 'none') return '';
        return el.src;
      };

      // Récupère les designs du coin (recto / verso) dans le canvas.
      // La vue de côté n'est pas incluse dans le devis (peu utile pour la prod).
      const previews = [];
      [
        { face: 'recto', id: 'coin-disc-recto' },
        { face: 'verso', id: 'coin-disc-verso' }
      ].forEach(({ face, id }) => {
        const disc = document.getElementById(id);
        if (!disc) return;
        const baseImg = disc.querySelector('.coin-base-img');
        const logoImg = disc.querySelector('.coin-logo img, .coin-cote-logo');
        const base = validSrc(baseImg);
        let logo = validSrc(logoImg);

        // VERSO NUMÉROTÉ : le numéro est du TEXTE, pas une image. On le rasterise
        // pour qu'il apparaisse dans l'aperçu du devis (sinon le verso semble vide).
        if (face === 'verso' && !logo) {
          const num = coinNumberDataUrl();
          if (num) logo = num;
        }

        // On garde la face seulement si la pièce de base existe
        if (base) {
          previews.push({ label: face.toUpperCase(), base: base, logo: logo });
        }
      });

      openQuoteModal({ name, details, qty, previews });
    }

    /* Demande de devis pour un PATCH en PVC ou Tissé. Collecte les specs du patch
       (taille, forme, couleur) + le style demandé, et un aperçu (cercle + logo).
       Réutilise le même modal/flux que le devis coins. */
    function requestPatchQuote(style) {
      var recap = document.querySelector('.recap');
      var name = 'Patch personnalisé (' + style + ')';

      // Détails depuis le récap patch (Face, Taille, Format, Couleur, Type…).
      var details = recap ? Array.from(recap.querySelectorAll('.rp-patch-details p'))
        .map(function (p) { return p.textContent.trim(); }) : [];
      // On force le style demandé dans les détails.
      details = details.filter(function (d) { return !/^Type\s*:/i.test(d); });
      details.push('Finition souhaitée : ' + style);

      // Quantité (input du récap patch).
      var qtyInput = recap ? recap.querySelector('#coins-recap-qty-input, #coin-recap-qty-input, input[type="number"]') : null;
      var qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 20;

      // Aperçu : le patch composé (cercle couleur + logo) si un logo est présent.
      var previews = [];
      var logoEl = document.getElementById('patch-logo');
      var logoImg = logoEl ? logoEl.querySelector('img') : null;
      var logoSrc = (logoImg && logoEl.style.display !== 'none') ? logoImg.getAttribute('src') : '';
      var canvasEl = document.getElementById('coins-canvas');
      var bgColor = (canvasEl && canvasEl.style.backgroundColor) ? canvasEl.style.backgroundColor : '#ffffff';
      if (logoSrc) {
        // Génère un cercle coloré (fond) en data-URL pour l'aperçu.
        try {
          var c = document.createElement('canvas'); c.width = 400; c.height = 400;
          var ctx = c.getContext('2d');
          ctx.beginPath(); ctx.arc(200, 200, 200, 0, Math.PI * 2); ctx.fillStyle = bgColor; ctx.fill();
          previews.push({ label: 'PATCH', base: c.toDataURL('image/png'), logo: logoSrc });
        } catch (e) {
          /* Le devis part quand même, mais sans vignette : l'atelier reçoit
             alors une demande sans visuel. À tracer — ce n'est pas un échec
             de stockage anodin (canvas « tainted », mémoire insuffisante). */
          console.warn('Vignette du patch non générée pour le devis :', e);
        }
      }

      openQuoteModal({ name: name, details: details, qty: qty, previews: previews,
                       subtitle: 'Recevez un devis pour votre patch en ' + style + '.' });
    }

    /* Devis depuis le panier (patchs ≥100 / multi-produits ≥3 familles) et
       bascule du bouton de checkout : déportés dans conf-cart-quote.js. Ils
       accèdent au panier via window.getCartItems (exposé plus bas). */

    // Ouvre le formulaire de devis PVC / Tissé pour le patch (bouton contact).
    function contactPatchStyle() {
      confConfirm('Souhaitez-vous un patch en PVC ou en Tissé ? Choisissez une option pour recevoir un devis.', {
        icon: 'question',
        title: 'Patch PVC ou Tissé',
        confirmText: 'PVC',
        cancelText: 'Tissé'
      }).then(function (isPvc) {
        // confConfirm renvoie true (Confirmer=PVC) ou false (Annuler=Tissé).
        requestPatchQuote(isPvc ? 'PVC' : 'Tissé');
      });
    }

    function openQuoteModal(data) {
      // Supprime un éventuel ancien modal
      const old = document.getElementById('quote-modal');
      if (old) old.remove();

      /* ÉCHAPPEMENT OBLIGATOIRE — même origine que RV1 : conf-cart-quote.js
         construit `details` et `previews[].label` à partir de `item.name`,
         `item.color` et `item.size`, donc du nom floqué saisi par le client
         ou importé d'un CSV. Le devis n'était pas seulement une régression
         latente : il partageait le vecteur du tiroir panier.
         Les `src` passent par safeImgSrc — un `javascript:` traverserait
         grpEsc intact (ni guillemet ni chevron). */
      const detailsHtml = (data.details || []).map(d => `<li>${grpEsc(d)}</li>`).join('');
      const previewHtml = (data.previews || []).map(p => {
        /* URL rejetée par safeImgSrc -> on n'émet PAS la balise, au lieu d'une
           <img src=""> qui déclencherait une requête vers la page courante et
           afficherait une icône d'image cassée. */
        const base = safeImgSrc(p.base);
        const logo = safeImgSrc(p.logo);
        return `
        <div class="qm-preview">
          <div class="qm-preview-disc">
            ${base ? `<img src="${base}" alt="${grpEsc(p.label)}" class="qm-preview-base">` : ''}
            ${logo ? `<img src="${logo}" alt="" class="qm-preview-logo">` : ''}
          </div>
          <span>${grpEsc(p.label)}</span>
        </div>`;
      }).join('');

      const modal = document.createElement('div');
      modal.id = 'quote-modal';
      modal.className = 'qm-overlay';
      /* Accessibilité : cette modale est l'UNIQUE chemin d'achat des coins
         (vendus seulement sur devis), et c'était la moins accessible des dix
         overlays du configurateur. `conf-alert.js:100` et `#ov-modal` avaient
         déjà role/aria-modal ; celle-ci ne les avait pas. */
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'qm-title');
      modal.innerHTML = `
        <div class="qm-box">
          <button type="button" class="qm-close" onclick="closeQuoteModal()"
                  aria-label="Fermer la demande de devis">✕</button>
          <h2 class="qm-title" id="qm-title">Demande de devis</h2>
          <p class="qm-sub">${grpEsc(data.subtitle || 'Recevez un devis personnalisé pour votre coin métallique.')}</p>

          <div class="qm-content">
            <div class="qm-design">
              <div class="qm-design-title">Votre design</div>
              <div class="qm-previews">${previewHtml || '<p style="font-size:12px;color:#888">Aucun aperçu</p>'}</div>
              <div class="qm-specs">
                <div class="qm-specs-title">${grpEsc(data.name)}</div>
                <ul>${detailsHtml}<li>Quantité : ${Number(data.qty) || 0} unités</li></ul>
              </div>
            </div>

            <form class="qm-form" id="qm-form">
              <div class="qm-field">
                <label for="qm-nom">Nom complet <span>*</span></label>
                <input type="text" id="qm-nom" name="nom" required autocomplete="name">
              </div>
              <div class="qm-field">
                <label for="qm-email">Email <span>*</span></label>
                <input type="email" id="qm-email" name="email" required autocomplete="email">
              </div>
              <div class="qm-field">
                <label for="qm-tel">Téléphone <span>*</span></label>
                <input type="tel" id="qm-tel" name="telephone" required autocomplete="tel">
              </div>
              <div class="qm-field">
                <label for="qm-entreprise">Entreprise (facultatif)</label>
                <input type="text" id="qm-entreprise" name="entreprise" autocomplete="organization">
              </div>
              <div class="qm-field">
                <label for="qm-message">Message / précisions</label>
                <textarea id="qm-message" name="message" rows="3" placeholder="Détaillez votre besoin…"></textarea>
              </div>
              <button type="button" class="qm-submit" onclick="submitQuote()">Envoyer ma demande de devis</button>
            </form>
          </div>
        </div>`;
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';
      // Stocke les données pour la soumission
      window._quoteData = data;

      /* Échap, clic hors boîte, piège de focus et focus initial.
         À poser APRÈS l'insertion dans le document : la fonction mesure la
         visibilité des éléments pour bâtir le cycle de tabulation. */
      _qmInstallerClavier(modal);

      /* Trace de diagnostic (visible avec ?debug=1) — la modale s'ouvrait sans
         être visible sur certains mobiles, et rien ne permettait de savoir si
         le problème venait du JS ou du CSS. On mesure donc ce que le navigateur
         calcule VRAIMENT après insertion. */
      if (typeof confLog === 'function') {
        try {
          var cs = window.getComputedStyle(modal);
          var r = modal.getBoundingClientRect();
          confLog('[devis] modale insérée', {
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
            zIndex: cs.zIndex,
            position: cs.position,
            taille: Math.round(r.width) + 'x' + Math.round(r.height),
            dansLeDom: !!document.getElementById('quote-modal'),
            apercus: (data.previews || []).length
          });
        } catch (e) { confLog('[devis] mesure impossible', e); }
      }
    }

    /* Handlers de la modale de devis, retenus pour pouvoir être retirés.
       Sans ces références, chaque ouverture empilerait un écouteur `keydown` sur
       `document` qui survivrait à la fermeture. */
    var _qmKeydown = null;
    var _qmFocusAvant = null;

    /* Piège de focus + Échap. Aucun des dix overlays du projet n'en avait
       (0 occurrence de 'Tab' / trapFocus / activeElement dans les 30 assets) :
       depuis le dernier champ, Tab envoyait le focus dans les ~100
       `<div tabindex="0">` situés DERRIÈRE l'overlay, invisibles et non annoncés
       comme masqués. L'utilisateur au clavier perdait sa place sans indice. */
    function _qmInstallerClavier(modal) {
      // Mémoriser le focus courant pour le restaurer à la fermeture.
      _qmFocusAvant = document.activeElement;

      var focusables = function () {
        return [].slice.call(modal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
          'select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )).filter(function (el) {
          // Un élément masqué ne doit pas entrer dans le cycle.
          return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
        });
      };

      _qmKeydown = function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          closeQuoteModal();
          return;
        }
        if (e.key !== 'Tab') return;
        var f = focusables();
        if (!f.length) return;
        var premier = f[0], dernier = f[f.length - 1];
        /* Le focus reste DANS la modale : on boucle aux extrémités. */
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault(); dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault(); premier.focus();
        } else if (!modal.contains(document.activeElement)) {
          // Focus égaré hors de la modale : on le ramène.
          e.preventDefault(); premier.focus();
        }
      };
      document.addEventListener('keydown', _qmKeydown, true);

      /* Clic hors de la boîte : ferme, comme conf-alert.js:132 et
         snippets/size-quantity-modal.liquid:7. Seul le ✕ le faisait ici. */
      modal.addEventListener('mousedown', function (e) {
        if (e.target === modal) closeQuoteModal();
      });

      /* Focus initial sur le premier champ : sans cela il reste sur le bouton
         « Demander un devis », derrière l'overlay. */
      var f = focusables();
      var premierChamp = modal.querySelector('#qm-nom') || f[0];
      if (premierChamp) {
        // Après le rendu, sinon le focus est perdu sur certains mobiles.
        setTimeout(function () { try { premierChamp.focus(); } catch (e) {} }, 40);
      }
    }

    function closeQuoteModal() {
      const m = document.getElementById('quote-modal');
      if (m) m.remove();
      document.body.style.overflow = '';

      // Retirer l'écouteur global, sinon il s'empile à chaque ouverture.
      if (_qmKeydown) {
        document.removeEventListener('keydown', _qmKeydown, true);
        _qmKeydown = null;
      }
      // Rendre le focus à l'élément qui a ouvert la modale.
      if (_qmFocusAvant && typeof _qmFocusAvant.focus === 'function') {
        try { _qmFocusAvant.focus(); } catch (e) {}
      }
      _qmFocusAvant = null;
    }

    /* Convertit une data-URL (data:image/...;base64,...) en Blob.
       Renvoie null si ce n'en est pas une (déjà une URL hébergée). */
    function dataUrlToBlob(dataUrl) {
      if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) return null;
      const [head, body] = dataUrl.split(',');
      if (!body) return null;
      const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
      const isBase64 = /;base64/i.test(head);
      const binary = isBase64 ? atob(body) : decodeURIComponent(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }

    /* Si la valeur est une data-URL, l'uploade sur Cloudinary et renvoie l'URL.
       Sinon (URL CDN déjà hébergée, ou vide) la renvoie telle quelle.
       Évite d'envoyer des images base64 volumineuses dans le body JSON (erreur 413). */
    async function uploadIfDataUrl(value, filename) {
      const blob = dataUrlToBlob(value);
      if (!blob) return value;
      const res = await window.ConfAPI.uploadPreview(blob, filename);
      return (res && res.url) || value;
    }

    async function submitQuote() {
      const form = document.getElementById('qm-form');
      /* Garde obligatoire : `openQuoteModal` fait `old.remove()` (:2416), donc
         deux ouvertures rapprochées remplacent le nœud. Cette fonction est
         `async` et appelée depuis un `onclick` inline : entre deux `await`, la
         modale peut avoir disparu. Sans cette garde, `form.checkValidity()`
         levait un TypeError — sur le seul chemin d'achat des coins.
         Toutes les autres fonctions du fichier gardent leurs querySelector ;
         celle-ci était l'exception. */
      if (!form) {
        console.warn('submitQuote : #qm-form absent (modale fermée entre-temps).');
        return;
      }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const client = {};
      new FormData(form).forEach((v, k) => client[k] = v);

      const d = window._quoteData || {};

      // Désactiver le bouton pendant l'envoi
      const submitBtn = form.querySelector('.qm-submit');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Envoi en cours…'; }

      try {
        // Transforme les aperçus base64 en URLs Cloudinary AVANT l'envoi,
        // pour que le body du devis reste léger (quelques Ko au lieu de plusieurs Mo).
        const previews = await Promise.all((d.previews || []).map(async (p, i) => ({
          label: p.label,
          base: await uploadIfDataUrl(p.base, `quote-${i}-base.png`),
          logo: p.logo ? await uploadIfDataUrl(p.logo, `quote-${i}-logo.png`) : undefined
        })));

        const payload = {
          customer: {
            nom: client.nom,
            email: client.email,
            telephone: client.telephone,
            entreprise: client.entreprise || undefined,
            message: client.message || undefined
          },
          coin: {
            name: d.name || 'Coin métal personnalisé',
            details: d.details || [],
            qty: d.qty || (d.group ? d.group.pieces : 1) || 1,
            previews: previews
          }
        };

        // Commande de groupe (textiles) : la liste des personnes part avec le
        // devis. Le backend la retrouve sous quoteData.group.
        if (d.group) payload.group = d.group;

        await window.ConfAPI.createQuote(payload);
        showQuoteSuccess(client);
      } catch (err) {
        console.error('Erreur devis :', err);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Envoyer ma demande de devis'; }
        confAlert("Une erreur est survenue lors de l'envoi de votre demande.\n" + err.message,
                  { icon: 'error', title: 'Envoi échoué' });
      }
    }

    /* ── Réinitialisation complète du configurateur ──
       Purge le panier, les uploads et les états sauvegardés, puis recharge
       la page pour repartir d'un design vierge. Appelée après un paiement
       ou une demande de devis. */
    function clearConfiguratorState() {
      try {
        sessionStorage.removeItem('conf_cart');
        sessionStorage.removeItem('conf_uploads');
        sessionStorage.removeItem('conf_texts');          // textes personnalisés (face/dos)
        sessionStorage.removeItem('conf_order');
        sessionStorage.removeItem('pendingProduct');
        sessionStorage.removeItem('conf_current_product');
        sessionStorage.removeItem('conf_current_color');
        sessionStorage.removeItem('conf_patch_color');
        sessionStorage.removeItem('conf_coin_finish');
        sessionStorage.removeItem('conf_flag_color');      // couleur de fond drapeau
        sessionStorage.removeItem('conf_flag_color_name');
        sessionStorage.removeItem('conf_active_panel');    // onglet ouvert du sidebar
        sessionStorage.removeItem('conf_group_rows');      // liste de noms validée
        /* Option manches (payante, +4 €/manche) : elle échappait au reset et
           restait donc active sur un design pourtant vidé — le surcoût
           réapparaissait sans logo pour le justifier. */
        sessionStorage.removeItem('conf_sleeve_opt');
        localStorage.removeItem('last_design_id');
      } catch (e) {}
    }

    /* Réinitialise tout et recharge le configurateur vierge, en RESTANT sur le
       type de produit courant (ex. Patchs, Coins…) au lieu de repartir sur le
       sweatshirt. On mémorise le produit courant après le nettoyage : il est
       restauré au chargement par restorePendingProduct(). */
    function resetConfigurator() {
      var keepProduct = currentProductType;
      clearConfiguratorState();
      try {
        // Après reset : conf_uploads est vidé (design effacé) mais on RESTE sur le
        // même type de produit. restoreProductThenUploads() lit conf_current_product.
        if (keepProduct && keepProduct !== 'sweatshirt') {
          sessionStorage.setItem('conf_current_product', keepProduct);
        }
      } catch (e) {}
      window.location.href = '/pages/configurateur';
    }

    /* Réinitialisation manuelle (bouton "Réinitialiser") avec confirmation. */
    function confirmReset() {
      confConfirm('Votre panier et vos logos seront effacés.', {
        icon: 'warning',
        title: 'Réinitialiser votre design ?',
        confirmText: 'Réinitialiser'
      }).then(function (ok) {
        if (ok) resetConfigurator();
      });
    }

    /* ── Partage du design ──
       Compose une image (produit + logos) côté serveur, récupère une URL
       publique, puis ouvre le partage natif (WhatsApp, mail…) ou un fallback. */

    /* Boîte (en coordonnées écran) réellement occupée par le CONTENU d'une <img>
       affichée en object-fit:contain. L'élément <img> peut être plus grand que
       l'image visible ; on calcule la zone effective via le ratio naturel, pour
       que les fractions x/y/w correspondent exactement à l'image que le backend
       superpose. Repli sur la boîte de l'élément si dimensions naturelles absentes. */
    function imageContentRect(img) {
      if (!img || !img.getBoundingClientRect) return null;
      const box = img.getBoundingClientRect();
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh || box.width === 0 || box.height === 0) return box;
      const boxRatio = box.width / box.height;
      const imgRatio = nw / nh;
      let w, h;
      if (imgRatio > boxRatio) {
        // Image limitée par la largeur : pleine largeur, hauteur réduite.
        w = box.width;
        h = box.width / imgRatio;
      } else {
        // Image limitée par la hauteur : pleine hauteur, largeur réduite.
        h = box.height;
        w = box.height * imgRatio;
      }
      const left = box.left + (box.width - w) / 2;
      const top = box.top + (box.height - h) / 2;
      return { left, top, width: w, height: h };
    }

    // Récupère la vue produit actuellement visible et ses logos superposés.
    function captureCurrentDesign() {
      // Image de fond : la vue produit affichée (face/dos/côté) ou l'aperçu coin/drapeau.
      const bgCandidates = [
        document.querySelector('.product-img-single.on'),
        document.getElementById('view-face'),
        document.querySelector('.coin-base-img'),
        document.querySelector('.flag-base-img'),
        document.getElementById('coins-preview-img')
      ];
      let bg = null;
      for (const el of bgCandidates) {
        if (el && el.src && el.getAttribute('src') &&
            el.src !== window.location.href &&
            (!el.style || el.style.display !== 'none') &&
            (!el.closest('.product-img-single') || el.classList.contains('on') || el.id === 'view-face')) {
          bg = el; break;
        }
      }
      if (!bg) return null;

      // Référence pour convertir les positions en fractions : l'IMAGE DU PRODUIT
      // (bg), pas le logo-layer. Le backend superpose les logos sur cette image ;
      // les fractions doivent donc être calculées par rapport à sa boîte réelle
      // affichée (l'image est en object-fit:contain, souvent plus étroite que le
      // layer). Sinon le logo est décalé et rétréci sur l'aperçu composé.
      const layer = document.getElementById('logo-layer');
      const ref = imageContentRect(bg);
      const logos = [];
      if (layer && ref && ref.width > 0 && ref.height > 0) {
        layer.querySelectorAll('.design-logo').forEach(el => {
          if (el.style.display === 'none') return;
          const img = el.querySelector('img');
          if (!img || !img.src || !img.getAttribute('src')) return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          logos.push({
            src: img.src,
            x: (r.left - ref.left) / ref.width,
            y: (r.top - ref.top) / ref.height,
            w: r.width / ref.width
          });
        });
      }
      return { background: bg.src, logos: logos };
    }

    /* Capture le design de la VUE DE FACE indépendamment de la vue actuellement
       affichée. Seul le logo cœur y figure (les manches sont sur les côtés).
       Il est lu via ses styles inline (left/top/width en %) : fiable même quand
       la vue courante est "dos" ou "côté" (où ce logo est masqué par CSS et donnerait une
       taille nulle). Sert à générer l'aperçu envoyé au panier/commande. */
    function captureFaceDesign() {
      const background = currentProductImageURL('face');
      if (!background) return null;

      // Convertit "38%" -> 0.38 ; renvoie null si non exprimé en %.
      const pct = (v) => {
        if (typeof v !== 'string') return null;
        const m = v.trim().match(/^([\d.]+)%$/);
        return m ? parseFloat(m[1]) / 100 : null;
      };

      // Les % inline des logos sont relatifs au logo-layer (inset:0 = toute la
      // zone canvas), plus large que l'image produit (object-fit:contain). On
      // reprojette donc chaque logo sur la boîte réelle de l'image (view-face)
      // pour que le backend le pose au bon endroit et à la bonne taille.
      const layer = document.getElementById('logo-layer');
      const layerBox = layer ? layer.getBoundingClientRect() : null;

      // Boîte réelle de l'image produit. On privilégie la MESURE directe de
      // l'image affichée (getBoundingClientRect via imageContentRect, précise) ;
      // à défaut (image masquée), on approxime avec imgBoxWithinLayer.
      let refImg = document.querySelector('.product-img-single.on') || document.getElementById('view-face');
      let imgBox = null;
      if (refImg && refImg.getBoundingClientRect().width > 0) {
        imgBox = imageContentRect(refImg);
      }
      if (!imgBox || imgBox.width === 0) {
        imgBox = imgBoxWithinLayer(refImg, layerBox);
      }

      // Vue de FACE : uniquement ce qui est visible de face, donc le logo cœur.
      // Les manches (logo-sl-face / logo-sr-face) étaient incluses ici — un
      // reste de l'époque où elles s'affichaient sur la vue de face. Elles ont
      // été retirées du canevas mais pas d'ici : leurs logos se retrouvaient
      // plaqués sur la vignette du panier alors qu'ils sont sur les côtés.
      const faceZones = ['logo-f', 'logo-fr'];
      const logos = [];
      faceZones.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.style.display === 'none') return;   // zone non personnalisée
        const img = el.querySelector('img');
        if (!img || !img.getAttribute('src')) return;

        // Mesure DIRECTE de la boîte du logo à l'écran si visible (précis),
        // sinon reprojection depuis les % du layer.
        const r = el.getBoundingClientRect();
        const measurable = r.width > 0 && r.height > 0;

        if (imgBox && imgBox.width > 0 && imgBox.height > 0 && measurable) {
          logos.push({
            src: img.src,
            x: (r.left - imgBox.left) / imgBox.width,
            y: (r.top - imgBox.top) / imgBox.height,
            w: r.width / imgBox.width
          });
          return;
        }

        // Repli : reprojection depuis les % inline (vue masquée).
        const lx = pct(el.style.left);
        const ly = pct(el.style.top);
        const lw = pct(el.style.width);
        if (lx == null || ly == null || lw == null) return;
        if (layerBox && imgBox && imgBox.width > 0 && imgBox.height > 0) {
          const scrLeft = layerBox.left + lx * layerBox.width;
          const scrTop  = layerBox.top  + ly * layerBox.height;
          const scrW    = lw * layerBox.width;
          logos.push({
            src: img.src,
            x: (scrLeft - imgBox.left) / imgBox.width,
            y: (scrTop - imgBox.top) / imgBox.height,
            w: scrW / imgBox.width
          });
        } else {
          logos.push({ src: img.src, x: lx, y: ly, w: lw });
        }
      });

      return { background: background, logos: logos };
    }

    /* Capture les 3 vues (face, dos, côté) du produit textile courant pour
       composer une image de partage multi-vues. Chaque vue = { label, background,
       logos } avec logos reprojetés sur l'image produit (mêmes règles que
       captureFaceDesign). Les positions viennent des % inline (fiables même pour
       les vues masquées). Renvoie null si le produit n'est pas textile. */
    /* Boîte occupée par l'image produit À L'INTÉRIEUR du layer (object-fit:contain),
       robuste même quand l'image est masquée : on applique son ratio naturel à la
       boîte du layer. Renvoie {left, top, width, height} en coordonnées écran. */
    function imgBoxWithinLayer(img, layerBox) {
      if (!layerBox || layerBox.width === 0 || layerBox.height === 0) return null;
      const nw = img && img.naturalWidth, nh = img && img.naturalHeight;
      // .cv-single-view a un padding (20px) -> l'image ne remplit pas tout le layer.
      // On approxime la zone image par le layer moins ce padding.
      const PAD = 20;
      const availW = Math.max(1, layerBox.width - PAD * 2);
      const availH = Math.max(1, layerBox.height - PAD * 2);
      let w = availW, h = availH;
      if (nw && nh) {
        const imgRatio = nw / nh;
        const availRatio = availW / availH;
        if (imgRatio > availRatio) { w = availW; h = availW / imgRatio; }
        else { h = availH; w = availH * imgRatio; }
      }
      const left = layerBox.left + PAD + (availW - w) / 2;
      const top = layerBox.top + PAD + (availH - h) / 2;
      return { left, top, width: w, height: h };
    }

    /* Rasterise le texte personnalisé d'une zone (#text-f / #text-b) en PNG
       transparent, et renvoie { src, x, y, w } reprojeté sur l'image produit —
       exactement comme un logo — pour l'ajouter à la planche. Renvoie null si la
       zone n'a pas de texte. Gère le texte simple ET le texte courbé (SVG).
       Sans ça, le texte du client n'apparaissait pas sur la planche. */
    /* textZoneImage : extrait dans assets/conf-share.js (limite 256 Ko). */

    async function captureAllViews() {
      // Uniquement pour les produits TEXTILES. Pour coins/drapeaux/patches,
      // currentProductKey peut rester sur un ancien textile -> on vérifie le
      // type de produit COURANT réel avant de capturer les vues face/dos/côté.
      var textileTypes = ['sweatshirt', 'tshirt', 'tshirt_polyester'];
      if (textileTypes.indexOf(currentProductType) === -1) return null;
      const prefix = PRODUCT_SLUGS[currentProductKey];
      if (!prefix) return null; // non textile -> pas de vues multiples

      const pct = (v) => {
        if (typeof v !== 'string') return null;
        const m = v.trim().match(/^([\d.]+)%$/);
        return m ? parseFloat(m[1]) / 100 : null;
      };

      // Boîte de référence : l'image produit affichée (même géométrie pour les 3 vues).
      const layer = document.getElementById('logo-layer');
      let refImg = document.querySelector('.product-img-single.on') || document.getElementById('view-face');
      const layerBox = layer ? layer.getBoundingClientRect() : null;
      // Mesure directe de la boîte image si affichée (précis), sinon approximation.
      let imgBox = null;
      if (refImg && refImg.getBoundingClientRect().width > 0) imgBox = imageContentRect(refImg);
      if (!imgBox || imgBox.width === 0) imgBox = imgBoxWithinLayer(refImg, layerBox);
      const canReproject = !!(layerBox && imgBox && imgBox.width > 0 && imgBox.height > 0);

      // Convertit un logo en fractions de l'image produit. Mesure DIRECTE si le
      // logo est visible à l'écran (précis) ; sinon reprojection depuis ses %.
      const project = (el) => {
        const img = el.querySelector('img');
        if (!img || !img.getAttribute('src')) return null;
        if (canReproject) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return {
              src: img.src,
              x: (r.left - imgBox.left) / imgBox.width,
              y: (r.top - imgBox.top) / imgBox.height,
              w: r.width / imgBox.width
            };
          }
        }
        const lx = pct(el.style.left), ly = pct(el.style.top), lw = pct(el.style.width);
        if (lx == null || ly == null || lw == null) return null;
        if (!canReproject) return { src: img.src, x: lx, y: ly, w: lw };
        const scrLeft = layerBox.left + lx * layerBox.width;
        const scrTop  = layerBox.top  + ly * layerBox.height;
        const scrW    = lw * layerBox.width;
        return {
          src: img.src,
          x: (scrLeft - imgBox.left) / imgBox.width,
          y: (scrTop - imgBox.top) / imgBox.height,
          w: scrW / imgBox.width
        };
      };

      // Mapping vue -> logos qui s'y affichent.
      // Les deux manches partagent la même image de profil : on les sépare en
      // deux vues distinctes, sinon leurs logos se superposeraient sur un seul
      // visuel et l'atelier ne saurait pas laquelle imprimer.
      // NB : les textes personnalisés (#text-f, #text-b) ne sont pas capturés
      // ici — project() attend une <img>, or un texte n'en est pas une. Ils
      // restent visibles sur la vignette du panier.
      // mirror : il n'existe qu'UNE image de profil (le côté gauche). Le côté
      // droit est cette image retournée — comme dans le configurateur. Sans ce
      // drapeau, les deux vues de manche sortent orientées à l'identique et
      // l'atelier ne peut pas distinguer quel côté imprimer.
      // textZone : la zone de texte personnalisé visible sur cette vue
      // (face -> #text-f, dos -> #text-b). Les manches n'ont pas de texte.
      const viewDefs = [
        { key: 'face',  img: 'face', label: 'FACE',          zones: ['logo-f', 'logo-fr'], textZone: 'f' },
        { key: 'dos',   img: 'dos',  label: 'DOS',           zones: ['logo-b'], textZone: 'b' },
        { key: 'sl',    img: 'cote', label: 'MANCHE GAUCHE', zones: ['logo-sl'] },
        { key: 'sr',    img: 'cote', label: 'MANCHE DROITE', zones: ['logo-sr'], mirror: true }
      ];

      const views = [];
      for (const def of viewDefs) {
        const background = currentProductImageURL(def.img);
        if (!background) continue;

        const logos = [];
        def.zones.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          // « Non personnalisé » = le style inline dit display:none. On ne se
          // fie PAS à la visibilité réelle : en vue de côté, la manche du côté
          // non affiché est masquée par CSS ([data-side]) alors qu'elle porte
          // bien un logo — la tester ferait disparaître son visuel de la
          // planche de production.
          if (el.style.display === 'none') return;
          const p = project(el);
          if (p) logos.push(p);
        });

        // Texte personnalisé de la vue : rasterisé en PNG et ajouté comme un
        // logo. C'est ce qui le fait apparaître sur la planche (il était ignoré
        // avant, car ce n'est pas une <img>).
        if (def.textZone) {
          const t = await textZoneImage('text-' + def.textZone, imgBox, layerBox, canReproject);
          if (t) logos.push(t);
        }

        // Une vue sans impression n'apprend rien à l'atelier : on l'omet.
        // (Sans ce filtre, une vue de côté vide apparaissait systématiquement.)
        if (!logos.length) continue;

        // Vue miroir (manche droite) : le serveur retourne le FOND. Le logo,
        // lui, ne doit PAS être inversé — le design du client apparaîtrait à
        // l'envers. On lui donne donc sa position déjà convertie dans le repère
        // retourné : x' = 1 - x - w. Le serveur le pose tel quel, à l'endroit.
        if (def.mirror) {
          logos.forEach(l => { l.x = 1 - l.x - l.w; });
        }

        views.push({
          label: def.label,
          background: background,
          logos: logos,
          mirror: !!def.mirror
        });
      }

      return views.length ? views : null;
    }
    /* Exposée : conf-overview.js compose la « Vue d'ensemble » à partir des
       mêmes données que la planche de production. */
    window.captureAllViews = captureAllViews;

    /* Capture les vues d'un COIN (recto + verso, + côté si présent) avec leurs
       logos, sous forme de "views" pour la planche multi-vues. Chaque disque
       (fond métallique) est le background ; le logo posé dessus est superposé.
       Renvoie null si le produit courant n'est pas un coin. */
    function captureCoinDesign() {
      if (currentProductType !== 'coins') return null;

      // (label, id du disque conteneur, id du logo déplaçable)
      var faces = [
        { label: 'RECTO', disc: 'coin-disc-recto', logo: 'coin-logo-recto', base: 'coin-base-recto' },
        { label: 'VERSO', disc: 'coin-disc-verso', logo: 'coin-logo-verso', base: 'coin-base-verso' }
      ];

      var views = [];
      faces.forEach(function (f) {
        var baseImg = document.getElementById(f.base);
        if (!baseImg || !baseImg.getAttribute('src')) return;

        // Boîte réelle du disque (le fond métallique).
        var discBox = imageContentRect(baseImg);
        if (!discBox || discBox.width === 0) {
          var db = baseImg.getBoundingClientRect();
          discBox = { left: db.left, top: db.top, width: db.width, height: db.height };
        }

        var logos = [];
        var logoEl = document.getElementById(f.logo);
        if (logoEl && logoEl.style.display !== 'none') {
          var limg = logoEl.querySelector('img');
          if (limg && limg.getAttribute('src') && discBox.width > 0) {
            /* Motif en couverture : il déborde et le rognage n'existe qu'en
               CSS. On envoie donc une image DÉJÀ rognée, calée sur le disque —
               sinon le serveur recomposerait le débordement. */
            var flat = (typeof window.coinCoverDataUrl === 'function')
              ? window.coinCoverDataUrl(f.label === 'RECTO' ? 'recto' : 'verso') : '';
            if (flat) {
              logos.push({ src: flat, x: 0, y: 0, w: 1 });
            } else {
              var r = logoEl.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                logos.push({
                  src: limg.src,
                  x: (r.left - discBox.left) / discBox.width,
                  y: (r.top - discBox.top) / discBox.height,
                  w: r.width / discBox.width
                });
              }
            }
          }
        }

        // VERSO NUMÉROTÉ : le numéro est un élément TEXTE (div), pas une image.
        // On le rasterise en PNG transparent pour qu'il apparaisse dans les
        // aperçus composés côté serveur (devis, commande, partage).
        if (f.label === 'VERSO') {
          var numImg = captureCoinNumberImage(discBox);
          if (numImg) logos.push(numImg);
        }

        views.push({ label: f.label, background: baseImg.src, logos: logos });
      });

      return views.length ? views : null;
    }
    window.captureCoinDesign = captureCoinDesign;     // conf-overview.js

    /* Rend le numéro du verso (ex. "001") en PNG transparent CENTRÉ sur un carré.
       Utilisé comme "logo" du verso dans l'aperçu du devis (le numéro est du texte
       et n'apparaîtrait pas sinon). Renvoie un dataURL ou '' si pas de numéro. */
    function coinNumberDataUrl() {
      var numEl = document.getElementById('coin-verso-number');
      if (!numEl || numEl.style.display === 'none') return '';
      var text = (numEl.textContent || '').trim();
      if (!text) return '';

      var cs = window.getComputedStyle(numEl);
      var fontSize = 200;                   // haute résolution ; l'affichage scale
      var spacing = fontSize * 0.1;         // letter-spacing: 0.1em (comme le CSS)
      var font = (cs.fontWeight || '800') + ' ' + fontSize + 'px ' +
                 (cs.fontFamily || "'Courier New', monospace");

      // 1) Mesure le texte pour dimensionner le canvas AU PLUS JUSTE.
      //    Un canvas serré évite que le numéro paraisse minuscule une fois
      //    affiché à 52 % du disque dans l'aperçu du devis.
      var meas = document.createElement('canvas').getContext('2d');
      meas.font = font;
      var widths = [], total = 0;
      for (var i = 0; i < text.length; i++) {
        var w = meas.measureText(text[i]).width;
        widths.push(w);
        total += w + spacing;
      }
      total -= spacing;

      var padX = fontSize * 0.12;
      var padY = fontSize * 0.18;
      var cv = document.createElement('canvas');
      cv.width = Math.ceil(total + padX * 2);
      cv.height = Math.ceil(fontSize + padY * 2);

      // 2) Dessine, lettre par lettre (le canvas 2D ignore letter-spacing).
      var ctx = cv.getContext('2d');
      ctx.font = font;
      ctx.fillStyle = cs.color || 'rgba(30,25,15,0.75)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var x = padX;
      for (var j = 0; j < text.length; j++) {
        ctx.fillText(text[j], x + widths[j] / 2, cv.height / 2);
        x += widths[j] + spacing;
      }
      return cv.toDataURL('image/png');
    }

    /* Rend le numéro du verso (ex. "001") en image PNG transparente, positionnée
       comme à l'écran. Renvoie un objet logo {src,x,y,w} ou null si pas de numéro. */
    function captureCoinNumberImage(discBox) {
      var numEl = document.getElementById('coin-verso-number');
      if (!numEl || numEl.style.display === 'none') return null;
      var text = (numEl.textContent || '').trim();
      if (!text) return null;

      var r = numEl.getBoundingClientRect();
      if (!r.width || !r.height || !discBox || !discBox.width) return null;

      // Rendu haute résolution (x4) pour rester net une fois recomposé.
      var scale = 4;
      var cv = document.createElement('canvas');
      cv.width = Math.ceil(r.width * scale);
      cv.height = Math.ceil(r.height * scale);
      var ctx = cv.getContext('2d');

      var cs = window.getComputedStyle(numEl);
      var fontSize = parseFloat(cs.fontSize) || 40;
      ctx.font = cs.fontWeight + ' ' + (fontSize * scale) + 'px ' + cs.fontFamily;
      ctx.fillStyle = cs.color || 'rgba(30,25,15,0.75)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Léger relief blanc (comme le text-shadow CSS).
      ctx.shadowColor = 'rgba(255,255,255,0.4)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 1 * scale;

      // letter-spacing n'existe pas en canvas 2D : on dessine lettre par lettre.
      var spacing = parseFloat(cs.letterSpacing);
      if (isNaN(spacing)) spacing = 0;
      spacing *= scale;

      if (spacing) {
        var widths = [], total = 0;
        for (var i = 0; i < text.length; i++) {
          var w = ctx.measureText(text[i]).width;
          widths.push(w);
          total += w + spacing;
        }
        total -= spacing;
        var x = (cv.width - total) / 2;
        for (var j = 0; j < text.length; j++) {
          ctx.fillText(text[j], x + widths[j] / 2, cv.height / 2);
          x += widths[j] + spacing;
        }
      } else {
        ctx.fillText(text, cv.width / 2, cv.height / 2);
      }

      return {
        src: cv.toDataURL('image/png'),
        x: (r.left - discBox.left) / discBox.width,
        y: (r.top - discBox.top) / discBox.height,
        w: r.width / discBox.width
      };
    }

    /* Capture le design d'un DRAPEAU (recto + verso s'il y a un logo) : fond +
       logo positionné, pour composer une image d'aperçu. Renvoie un tableau de
       "views" (comme captureCoinDesign) ou null si le produit n'est pas drapeau. */
    function captureFlagDesign() {
      if (currentProductType !== 'drapeaux') return null;

      var faces = [
        { label: 'RECTO', base: 'flag-base-recto', logo: 'flag-logo-recto' },
        { label: 'VERSO', base: 'flag-base-verso', logo: 'flag-logo-verso' }
      ];

      var views = [];
      faces.forEach(function (f) {
        var baseImg = document.getElementById(f.base);
        if (!baseImg || !baseImg.getAttribute('src')) return;

        var box = imageContentRect(baseImg);
        if (!box || box.width === 0) {
          var b = baseImg.getBoundingClientRect();
          box = { left: b.left, top: b.top, width: b.width, height: b.height };
        }

        var logos = [];
        var logoEl = document.getElementById(f.logo);
        if (logoEl && logoEl.style.display !== 'none') {
          var limg = logoEl.querySelector('img');
          if (limg && limg.getAttribute('src') && box.width > 0) {
            var r = logoEl.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              logos.push({
                src: limg.src,
                x: (r.left - box.left) / box.width,
                y: (r.top - box.top) / box.height,
                w: r.width / box.width
              });
            }
          }
        }
        // L'image du drapeau est DÉJÀ à la bonne couleur : on l'envoie telle quelle.
        // On ne garde que les faces AVEC un logo (évite un verso vide).
        if (logos.length) views.push({ label: f.label, background: baseImg.src, logos: logos });
      });

      return views.length ? views : null;
    }
    window.captureFlagDesign = captureFlagDesign;     // conf-overview.js

    /* Charge une image (Promise). crossOrigin pour pouvoir toDataURL (CDN Shopify
       renvoie les en-têtes CORS). Renvoie null si le chargement échoue. */
    function loadImagePromise(url) {
      return new Promise(function (resolve) {
        if (!url) { resolve(null); return; }
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function () { resolve(im); };
        im.onerror = function () { resolve(null); };
        im.src = url;
      });
    }

    /* Capture le design d'un PATCH : le fond est désormais l'IMAGE PNG du patch
       (forme + couleur). Si la vraie image colorée n'existe pas, on prend l'image
       BLANCHE et on la TEINTE (couleur en 'source-in' sur une copie masquée par
       l'alpha de l'image, en 'multiply' pour garder la couture). Le logo est
       superposé à sa position (% du canvas = % de l'image). Renvoie une Promise
       de { background, logos } ou null. */
    async function capturePatchDesign() {
      if (currentProductType !== 'patches') return null;

      var logoEl = document.getElementById('patch-logo');
      var logoImg = logoEl ? logoEl.querySelector('img') : null;
      var logoSrc = (logoImg && logoEl.style.display !== 'none') ? logoImg.getAttribute('src') : '';
      if (!logoSrc) return null;

      var shape = patchShapeName();
      var slug = window.currentPatchSlug || 'noir';

      // 1) Image source : la vraie image colorée si elle existe, sinon l'image
      //    blanche telle quelle (aucune teinte).
      var colorUrl = (window.PATCH_IMAGE_URLS || {})[shape + '-' + slug] || '';
      var whiteUrl = (window.PATCH_WHITE_URLS || {})[shape] || '';

      var baseImg = colorUrl ? await loadImagePromise(colorUrl) : null;
      if (!baseImg) baseImg = await loadImagePromise(whiteUrl);

      /* 2) Canvas au ratio de la FORME AFFICHÉE, pas à celui du PNG de fond
         (simple texture) : s'y caler faussait le cadrage « cover ». */
      var ratio = (window.PATCH_SHAPE_RATIO || {})[shape] || 1;
      var W = 1000;
      var H = Math.round(W / ratio);
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      /* 3) Fond du patch.
         Toutes les images ne sont pas fournies : la forme « rond » n'en a
         AUCUNE (0/16) et « rectangle » seulement 2/16, alors que « rond » est
         la forme par défaut. On renvoyait alors null, et la planche envoyée à
         l'atelier partait sans aperçu — sans que rien ne le signale.
         À l'écran, la forme est de toute façon dessinée en CSS (.patch-body,
         border-radius / clip-path) et non par un PNG : on reproduit ici le même
         rendu avec tracePatchShape(), qui connaît déjà les quatre silhouettes.
         L'image PNG reste préférée quand elle existe, pour sa texture (couture). */
      if (baseImg) {
        ctx.drawImage(baseImg, 0, 0, W, H);
      } else {
        ctx.save();
        tracePatchShape(ctx, shape, 0, 0, W, H);
        ctx.fillStyle = window.currentPatchHex || '#000000';
        ctx.fill();
        ctx.restore();
      }

      // 4) Logo : ses % sont relatifs au canvas = à l'image entière.
      var lx = logoEl ? (parseFloat(logoEl.style.left) || 0) / 100 : 0;
      var ly = logoEl ? (parseFloat(logoEl.style.top)  || 0) / 100 : 0;
      var lw = logoEl ? (parseFloat(logoEl.style.width) || 100) / 100 : 1;

      /* 5) Logo DÉCOUPÉ À LA FORME et aplati ici : le backend l'aurait
         superposé en rectangle, sans connaître la silhouette (dessinée en
         CSS). Reproduit le rendu du canvas en deux temps — boîte .patch-logo
         (carrée, large de `lw`, posée en left/top), puis object-fit:cover
         dedans. Le côté est borné à H : le blason est plus haut que large et
         un carré de 100 % y laisserait un vide en bas. */
      var logoImgEl = await loadImagePromise(logoSrc);
      if (logoImgEl) {
        ctx.save();
        tracePatchShape(ctx, shape, 0, 0, W, H);
        ctx.clip();
        var bw = Math.max(lw * W, H);
        var bx = lx * W, by = ly * H;
        var nw2 = logoImgEl.naturalWidth || 1;
        var nh2 = logoImgEl.naturalHeight || 1;
        var scale = Math.max(bw / nw2, bw / nh2);
        var dw = nw2 * scale, dh = nh2 * scale;
        ctx.drawImage(logoImgEl, bx + (bw - dw) / 2, by + (bw - dh) / 2, dw, dh);
        ctx.restore();
      }

      var bgDataUrl;
      try { bgDataUrl = c.toDataURL('image/png'); }
      catch (e) {
        /* Canvas taint (CORS) : impossible d'exporter. On repasse au calque
           séparé — la vignette sera moins fidèle, mais elle existera. */
        console.warn('Patch: canvas taint, repli sur calque serveur', e);
        return { background: baseImg.src, logos: [{ src: logoSrc, x: lx, y: ly, w: lw }] };
      }

      // Le logo est déjà dans le fond : aucun calque à superposer.
      return { background: bgDataUrl, logos: [] };
    }
    window.capturePatchDesign = capturePatchDesign;   // conf-overview.js

    async function shareDesign(btnEl) {
      // Drapeaux : planche recto (+ verso) avec logo.
      const flagViews = captureFlagDesign();
      if (flagViews && flagViews.length) {
        return shareMultiView(flagViews, btnEl);
      }

      // Coins : planche recto + verso (fond métal + logo).
      const coinViews = captureCoinDesign();
      if (coinViews && coinViews.length) {
        return shareMultiView(coinViews, btnEl);
      }

      // Textile : image multi-vues (face + dos + côté) en une seule image.
      const views = await captureAllViews();
      if (views && views.length) {
        return shareMultiView(views, btnEl);
      }

      const design = captureCurrentDesign();
      if (!design) {
        await confAlert("Aucun aperçu à partager pour le moment.", { icon: 'info', title: 'Partage' });
        return;
      }

      const original = btnEl ? btnEl.innerHTML : '';
      if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = 'Préparation…'; }

      try {
        const res = await window.ConfAPI.createPreviewImage(design.background, design.logos);
        const url = res && res.url;
        if (!url) throw new Error("URL de partage manquante");

        const shareText = "Découvrez mon design personnalisé :";
        // Toujours notre menu (contient WhatsApp/Gmail/Copier + Inviter à éditer).
        openShareMenu(url, shareText);
      } catch (err) {
        console.error('Erreur partage :', err);
        confAlert("Impossible de générer le lien de partage.\n" + err.message, { icon: 'error', title: 'Partage' });
      } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = original; }
      }
    }

    /* Partage d'une image multi-vues (face + dos + côté). Compose côté serveur
       puis partage (natif mobile ou menu desktop), comme shareDesign. */
    async function shareMultiView(views, btnEl) {
      const original = btnEl ? btnEl.innerHTML : '';
      if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = 'Préparation…'; }
      try {
        const res = await window.ConfAPI.createMultiViewImage(views);
        const url = res && res.url;
        if (!url) throw new Error("URL de partage manquante");

        const shareText = "Découvrez mon design personnalisé :";
        // Toujours notre menu (contient WhatsApp/Gmail/Copier + Inviter à éditer).
        openShareMenu(url, shareText);
      } catch (err) {
        console.error('Erreur partage multi-vues :', err);
        confAlert("Impossible de générer le lien de partage.\n" + err.message, { icon: 'error', title: 'Partage' });
      } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = original; }
      }
    }

    /* Menu de partage. mode = 'image' (partage l'aperçu) ou 'invite' (partage le
       lien d'invitation à éditer). Les boutons WhatsApp/Gmail/Copier pointent tous
       vers l'URL fournie. */
    /* openShareMenu : extrait dans assets/conf-share.js (limite 256 Ko).
       Exposé sur window par ce fichier. */

    /* Capture l'état complet du design courant (produit, couleur, uploads) et le
       sauvegarde côté serveur. Renvoie l'URL d'invitation (?design=<id>) que
       l'invité ouvrira pour retrouver et éditer ce design. */
    async function createInviteLink() {
      var state = {
        product: null, color: null, patchColor: null, coinFinish: null, uploads: null
      };
      try { state.product = sessionStorage.getItem('conf_current_product') || currentProductType; } catch (e) {}
      try { state.color = JSON.parse(sessionStorage.getItem('conf_current_color') || 'null'); } catch (e) {}
      try { state.patchColor = JSON.parse(sessionStorage.getItem('conf_patch_color') || 'null'); } catch (e) {}
      try { state.coinFinish = sessionStorage.getItem('conf_coin_finish') || null; } catch (e) {}
      try { state.uploads = JSON.parse(sessionStorage.getItem('conf_uploads') || 'null'); } catch (e) {}

      var res = await window.ConfAPI.shareDesign(state);
      var shareId = res && res.shareId;
      if (!shareId) throw new Error('Identifiant de partage manquant');

      // Lien vers le configurateur avec le design à restaurer.
      return window.location.origin + '/pages/configurateur?design=' + encodeURIComponent(shareId);
    }

    /* Bouton "Sauvegarder le design" (tous produits) : génère un lien de reprise
       et l'affiche pour que le client puisse retrouver son design plus tard. */
    async function saveDesign(btnEl) {
      var original = btnEl ? btnEl.innerHTML : '';
      if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = 'Sauvegarde…'; }
      try {
        var link = await createInviteLink();
        var copied = false;
        try { await navigator.clipboard.writeText(link); copied = true; } catch (e) {}
        // Menu de partage en mode "invite" : WhatsApp/Gmail/Copier pointent vers
        // le lien de reprise (le client peut se l'envoyer à lui-même).
        if (typeof openShareMenu === 'function') {
          openShareMenu(link, "Reprenez mon design personnalisé :", 'save');
        } else {
          await confAlert((copied ? '✓ Lien copié !\n\n' : '') + 'Conservez ce lien pour retrouver votre design :\n' + link,
                          { icon: 'success', title: 'Design sauvegardé' });
        }
      } catch (err) {
        console.error('Sauvegarde échouée :', err);
        await confAlert('Impossible de sauvegarder le design.\n' + (err && err.message ? err.message : err),
                        { icon: 'error', title: 'Sauvegarde' });
      } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = original; }
      }
    }

    function showQuoteSuccess(client) {
      // Le design a été envoyé en devis : on nettoie l'état dès maintenant
      // pour que la fermeture / le rechargement reparte d'un design vierge.
      clearConfiguratorState();
      const box = document.querySelector('#quote-modal .qm-box');
      if (box) {
        box.innerHTML = `
          <button type="button" class="qm-close" onclick="resetConfigurator()">✕</button>
          <div class="qm-success">
            <div class="qm-success-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            </div>
            <h2>Demande envoyée !</h2>
            <p>Merci ${grpEsc(client.nom)}. Nous vous enverrons votre devis à <strong>${grpEsc(client.email)}</strong> sous peu.</p>
            <button type="button" class="qm-submit" onclick="resetConfigurator()">Fermer</button>
          </div>`;
      }
    }

    function renderCartDrawer() {
      const container = document.getElementById('cd-items');
      const emptyEl   = document.getElementById('cd-empty');
      const footerEl  = document.getElementById('cd-footer');
      const countEl   = document.getElementById('cd-count');
      const totalEl   = document.getElementById('cd-total');
      if (!container) return;

      // Vider (sauf le bloc empty)
      Array.from(container.children).forEach(c => { if (c.id !== 'cd-empty') c.remove(); });

      if (cartItems.length === 0) {
        emptyEl.style.display = 'flex';
        footerEl.style.display = 'none';
        countEl.textContent = '';
        return;
      }

      emptyEl.style.display = 'none';
      footerEl.style.display = 'block';

      // Quantité totale PAR TYPE (toutes lignes) -> palier de prix dégressif.
      const totalsByType = {};
      cartItems.forEach(i => {
        totalsByType[i.productType] = (totalsByType[i.productType] || 0) + (i.qty || 0);
      });

      let total = 0;
      cartItems.forEach(item => {
        // Palier dégressif + supplément manches (voir cartUnitPrice).
        const unit = cartUnitPrice(item, totalsByType);
        total += unit * item.qty;
        const div = document.createElement('div');
        div.className = 'cd-item';
        /* ÉCHAPPEMENT OBLIGATOIRE — `item.*` vient du client (nom floqué saisi
           ou importé d'un CSV, couleur d'un design partagé) et transite par
           `conf_cart` en sessionStorage. Sans grpEsc(), une charge utile
           s'exécutait à chaque ouverture du tiroir ET à chaque rechargement
           (DOMContentLoaded appelle renderCartDrawer) : échapper la saisie du
           tableau de groupe ne suffit pas, la même donnée ressort ici.
           `item.id` et `item.qty` sont numériques (voir pushToCart), d'où
           l'absence d'échappement — mais `id` passe par une coercition
           explicite, la valeur atterrissant dans un attribut onclick. */
        const cdId = Number(item.id) || 0;
        div.innerHTML = `
          <button type="button" class="cd-thumb" onclick="openCartItemDesign(${cdId})"
                  title="Revenir au design de cet article">
            <img src="${safeImgSrc(item.img)}" alt="${grpEsc(item.name)}">
          </button>
          <div class="cd-info">
            <div class="cd-name">${grpEsc(item.name)}${item.personName ? ' — ' + grpEsc(item.personName) : ''}</div>
            <div class="cd-meta">${grpEsc(item.color)}${item.size ? ' · ' + grpEsc(item.size) : ''}</div>
            <div class="cd-price">${unit.toFixed(2).replace('.',',')} € <span class="cd-tier">/u</span></div>
            <div class="cd-qty">
              <button type="button" class="cd-qty-btn" onclick="changeCartQty(${cdId}, -1)"${
                (Number(item.qty) || 0) <= minQtyPour(item.productType)
                  ? ` disabled title="Minimum de commande : ${minQtyPour(item.productType)} unités"`
                  : ''
              }>−</button>
              <span class="cd-qty-val">${Number(item.qty) || 0}</span>
              <button type="button" class="cd-qty-btn" onclick="changeCartQty(${cdId}, +1)">+</button>
            </div>
          </div>
          <button type="button" class="cd-delete" onclick="removeCartItem(${cdId})" title="Supprimer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6"/></svg>
          </button>
        `;
        container.appendChild(div);
      });

      const totalCount = cartItems.reduce((s, i) => s + i.qty, 0);
      countEl.textContent = totalCount + ' article' + (totalCount > 1 ? 's' : '');
      totalEl.textContent = total.toFixed(2).replace('.',',') + ' €';

      // Bascule « Continuer » <-> « Faire une demande de devis » (coin présent,
      // patchs ≥100, ou ≥3 familles). Logique déportée dans conf-cart-quote.js.
      refreshDrawerCheckoutBtn();
    }
    /* Exposée pour le suivi des prix en direct (configurateur.liquid) : le
       tiroir recalcule ses montants via cartUnitPrice(), il suffit de le
       redessiner quand l'admin change un tarif. */
    window.renderCartDrawer = renderCartDrawer;

    /* Met à jour le bouton bas de drawer selon l'état du panier. Robuste au
       timing de chargement (asset en defer) : réessaie brièvement si l'asset
       n'est pas encore prêt. */
    function refreshDrawerCheckoutBtn(_retry) {
      if (typeof window.updateDrawerCheckoutBtn === 'function' &&
          typeof window.cartNeedsQuote === 'function') {
        var isQuote = window.cartNeedsQuote();
        window.updateDrawerCheckoutBtn(isQuote);
        // En mode DEVIS, le total n'a pas de sens (le prix est justement à
        // chiffrer) : on masque « Total estimé » et on adapte la note.
        var sub = document.getElementById('cd-subtotal');
        var note = document.getElementById('cd-tax-note');
        if (sub) sub.style.display = isQuote ? 'none' : '';
        if (note) note.textContent = isQuote
          ? 'Le prix vous sera communiqué après étude de votre demande de devis.'
          : 'Taxes incluses. Livraison calculée à l’étape suivante.';
      } else if (!_retry || _retry < 10) {
        // asset conf-cart-quote.js pas encore chargé : on retente sous peu.
        setTimeout(function () { refreshDrawerCheckoutBtn((_retry || 0) + 1); }, 100);
      }
    }

    /* Écrit le panier dans sessionStorage en SIGNALANT la saturation.

       Le défaut corrigé : les trois écritures de `conf_cart` étaient des
       `try { … } catch (e) {}` muets. Or le panier contient des data-URL —
       `img: imgSrc` peut venir d'un `toDataURL('image/png')` (voir :3089 et
       :3145) — et deux ou trois patchs suffisent à dépasser les ~5 Mo de quota.
       `QuotaExceededError` était alors avalée : l'interface affichait le bon
       compteur, puis TOUT disparaissait au rechargement ou à l'arrivée sur
       /pages/recapitulatif, qui relit cette clé.

       `writeUploadStore()` (:4015) traitait déjà ce cas correctement pour les
       uploads. Le panier, plus précieux, ne le faisait pas : même traitement ici.

       Exposée sur window : les trois sites d'écriture vivent dans des portées
       différentes de ce fichier.

       @param {Array} items le panier à persister
       @returns {boolean} true si l'écriture a réussi */
    window.persistCartSafe = function (items) {
      try {
        sessionStorage.setItem('conf_cart', JSON.stringify(items || []));
        return true;
      } catch (e) {
        var quotaHit = e && (
          e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||   // Firefox
          e.code === 22 || e.code === 1014
        );
        if (quotaHit) {
          console.warn('Panier non mémorisé : stockage de session saturé.', e);
          /* Une seule alerte par session : cette fonction est appelée à chaque
             modification du panier, et répéter le message à chaque clic serait
             pire que le problème. */
          if (!window.__cartQuotaWarned) {
            window.__cartQuotaWarned = true;
            if (typeof window.confAlert === 'function') {
              window.confAlert(
                'Votre navigateur ne peut plus mémoriser le contenu de votre panier ' +
                '(mémoire de session saturée par les aperçus de vos designs). ' +
                'Les articles restent affichés ici, mais ils seront perdus si vous ' +
                'rechargez la page. Terminez votre commande maintenant, ou retirez ' +
                'un article pour libérer de la place.',
                { title: 'Panier non mémorisé' }
              );
            }
          }
        } else {
          // Navigation privée Safari, cookies bloqués… : l'affichage reste bon.
          console.warn('Écriture du panier dans sessionStorage impossible :', e);
        }
        return false;
      }
    };

    // Persiste l'état courant du panier pour qu'il survive à un rechargement.
    function persistCart() {
      return window.persistCartSafe(cartItems);
    }

    /* Quantité MINIMALE de commande d'un type de produit.
       L'atelier ne produit pas en dessous : les champs de saisie du
       configurateur portent déjà ces bornes (`min="10"` sur #coin-qty-input,
       `min="50"` sur #coin-recap-qty-input), mais le tiroir du panier les
       ignorait — le client pouvait y redescendre à 1 avec le bouton « − »,
       et commander sous le seuil.

       `coins` (= COINS MÉTAL) n'a pas de grille dégressive — ils se chiffrent
       sur devis : tierMinQty() y renverrait 1. Leur plancher, 50 pièces, est
       donc écrit ici ; c'est la valeur que porte déjà `min="50"` sur
       #coin-recap-qty-input. Pour les autres, la grille fait foi — un changement
       de palier dans le dashboard déplace le minimum sans retoucher ce code
       (les patchs sont ainsi à 10, premier palier de leur grille). */
    function minQtyPour(productType) {
      if (productType === 'coins') return 50;   // coins métal : 50 pièces
      var t = (typeof window.tierMinQty === 'function')
        ? window.tierMinQty(productType) : 1;
      return t > 0 ? t : 1;
    }

    function changeCartQty(id, delta) {
      const item = cartItems.find(i => i.id === id);
      if (!item) return;
      item.qty = Math.max(minQtyPour(item.productType), item.qty + delta);
      cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
      const cartCountEl = document.getElementById('hdr-cart-count');
      if (cartCountEl) cartCountEl.textContent = cartCount;
      persistCart();
      renderCartDrawer();
    }

    function removeCartItem(id) {
      const idx = cartItems.findIndex(i => i.id === id);
      if (idx !== -1) {
        cartCount -= cartItems[idx].qty;
        cartItems.splice(idx, 1);
      }
      if (cartCount < 1) {
        cartCount = 0;
        const cartBtn = document.getElementById('hdr-cart-btn');
        if (cartBtn) cartBtn.style.display = 'none';
      }
      const cartCountEl = document.getElementById('hdr-cart-count');
      if (cartCountEl) cartCountEl.textContent = cartCount;
      persistCart();
      renderCartDrawer();
    }

    /* Le tiroir et son voile sont définis en fin de configurateur.liquid, hors
       du périmètre reconstruit par DynamicLayoutManager — ils devraient donc
       toujours exister. La garde reste : ces deux fonctions sont exposées et
       appelées depuis d'autres assets (conf-cart-open-design.js, conf-mobile.js),
       où un appel prématuré ne doit pas interrompre l'appelant. */
    function toggleCartDrawer(open) {
      var drawer = document.getElementById('cart-drawer');
      var overlay = document.getElementById('cart-overlay');
      if (drawer) drawer.classList.toggle('open', open);
      if (overlay) overlay.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    }

    function openCartDrawer() {
      toggleCartDrawer(true);
      // Filet de sécurité : garantit le bon bouton (Continuer / Devis) à
      // l'ouverture, même si le rendu initial a précédé le chargement de l'asset.
      if (typeof refreshDrawerCheckoutBtn === 'function') refreshDrawerCheckoutBtn();
    }

    function closeCartDrawer() {
      toggleCartDrawer(false);
    }

    function goToCheckout() {
      // Redirige vers le checkout Shopify
      window.location.href = '/checkout';
    }

    // Bouton "Continuer" du drawer -> page Récapitulatif (étape 2)
    function goToRecap() {
      /* Cas le PLUS critique : /pages/recapitulatif relit `conf_cart` au
         chargement. Si l'écriture échoue et qu'on navigue quand même, le client
         arrive sur un récapitulatif VIDE après avoir rempli son panier.
         On l'avertit et on reste sur place — il peut retirer un article pour
         libérer de la place, ou commander directement depuis le tiroir. */
      if (!window.persistCartSafe(cartItems)) return;
      window.location.href = '/pages/recapitulatif';
    }

    /* Exposition pour conf-cart-quote.js (devis panier déporté). getCartItems
       renvoie la référence vive de cartItems (réassigné via let). */
    window.getCartItems = function () { return cartItems; };
    window.openQuoteModal = openQuoteModal;
    window.closeCartDrawer = closeCartDrawer;
    window.goToRecap = goToRecap;

    // function scrollToCart() {
    //   // Scroll vers le récap ou simplement un feedback visuel
    //   const recap = document.querySelector('.recap, .rp-items');
    //   if (recap) recap.scrollIntoView({ behavior: 'smooth' });
    // }

    /* ── Color select ── */
    function selColor(el, hex, name) {
      document.querySelectorAll('.cs').forEach(s => s.classList.remove('on'));
      el.classList.add('on');
      currentColor = hex;
      currentColorName = name;
      currentColorSlug = COLOR_SLUGS[name] || 'noir';
      applyColor(hex);
      /* #rc-color vit dans .recap, dont l'innerHTML est INTÉGRALEMENT remplacé
         pour les coins/drapeaux/patchs (voir DynamicLayoutManager). Sans cette
         garde, l'accès levait une TypeError qui interrompait la fonction AVANT
         la persistance ci-dessous : la couleur choisie était alors perdue au
         rechargement. */
      var rcColor = document.getElementById('rc-color');
      if (rcColor) rcColor.textContent = 'Couleur : ' + name;
      // Persiste la couleur PAR PRODUIT : chaque textile garde sa propre couleur.
      // conf_current_color = { sweatshirt:{hex,name}, tshirt:{...}, ... }
      try {
        var all = JSON.parse(sessionStorage.getItem('conf_current_color') || '{}');
        // Compat : ancien format {hex,name} -> on repart d'un objet vide.
        if (all && (all.hex || all.name)) all = {};
        all[currentProductType] = { hex: hex, name: name };
        sessionStorage.setItem('conf_current_color', JSON.stringify(all));
      } catch (e) {}
    }

    // Couleur mémorisée pour un produit donné (ou null).
    function savedColorFor(productType) {
      try {
        var all = JSON.parse(sessionStorage.getItem('conf_current_color') || '{}');
        if (all && (all.hex || all.name)) return null; // ancien format global : ignoré
        return all[productType] || null;
      } catch (e) { return null; }
    }

    /* saveLogosForProduct() et restoreLogosForProduct() vivent desormais dans
       assets/conf-logo-store.js (limite Shopify de 256 Ko). Appelees via
       window.*. Elles dependent de window.LOGO_STORE et window.readUploadStore,
       exposes plus bas — ne pas retirer ces assignations. */

    /* ── Size select ── */
    function selSize(el) {
      document.querySelectorAll('.sb').forEach(b => b.classList.remove('on'));
      el.classList.add('on');

      const size = el.textContent.trim();
      // #rc-size : même remarque que #rc-color — absent hors layout textile.
      var rcSize = document.getElementById('rc-size');
      if (rcSize) rcSize.textContent = 'Taille : ' + size;

      /* L'aperçu ne change PLUS avec la taille (voir applyProductSize) :
         l'appel ne sert qu'à effacer une échelle héritée. */
      applyProductSize(size);
    }

    /* La taille ne change PLUS l'aperçu.

       Le visuel était mis à l'échelle selon la taille choisie (XS 0,84 →
       XXL 1,24) : cliquer sur « S » rapetissait le vêtement à l'écran. Cette
       variation n'apporte rien — l'aperçu sert à composer le design, pas à
       comparer des tailles — et elle déroutait, le produit bougeant à chaque
       essai de taille.

       La taille reste évidemment enregistrée (récap, panier, production) :
       seul le RENDU est découplé.

       La fonction est conservée — elle est appelée par selSize() — mais elle
       ne fait plus que réappliquer le zoom courant, pour effacer une échelle
       héritée d'un état de session antérieur. */
    function applyProductSize(size) {
      const view = document.querySelector('.cv-single-view');
      if (!view) return;
      delete view.dataset.sizeScale;   // vestige : plus aucun lecteur
      view.style.transform = `scale(${zl / 100})`;
      view.style.transformOrigin = 'center center';
      view.style.transition = 'transform 0.25s ease';
    }

    /* ── View tabs : gérées par conf-view-switcher.js (selView global) ── */

    /* ── Zoom ── */
    function zoom(d) {
      zl = Math.min(200, Math.max(50, zl + d));
      /* #zlvl disparaît pendant la reconstruction du canvas (il est redéfini
         dans trois templates injectés distincts par conf-dynamic-layout.js).
         setZoomLabel() est la garde commune : la troisième fonction de zoom de
         ce fichier prenait déjà cette précaution, pas les deux autres. */
      setZoomLabel(zl);
      applyZoom();
      /* Réglage manuel : l'automatisme d'upload ne doit plus intervenir,
         sinon l'upload suivant écraserait ce choix. */
      zoomUserControlled = true;
    }

    function applyZoom() {
      /* Textile : seul le ZOOM agit désormais sur l'échelle. La taille
         choisie ne modifie plus l'aperçu (voir applyProductSize). */
      const singleView = document.querySelector('.cv-single-view');
      if (singleView) {
        singleView.style.transform = `scale(${zl / 100})`;
        singleView.style.transformOrigin = 'center center';
        singleView.style.transition = 'transform 0.2s ease';
      }
      // Autres produits
      document.querySelectorAll('.cv-view, .coins-canvas-circle, .flag-stage, .coin-stage').forEach(v => {
        v.style.transform = `scale(${zl/100})`;
        v.style.transformOrigin = 'center center';
      });
    }

    /* Écrit le niveau de zoom dans l'indicateur, s'il existe.
       Les trois fonctions de zoom passent par ici — voir zoom(). */
    function setZoomLabel(level) {
      var lvl = document.getElementById('zlvl');
      if (lvl) lvl.textContent = level + '%';
    }

    function resetZoom() {
      zl = 100;
      setZoomLabel(zl);
      applyZoom();
      // Remettre les autres à zéro aussi
      document.querySelectorAll('.cv-view, .coins-canvas-circle, .flag-stage, .coin-stage').forEach(v => { v.style.transform = ''; });
      // L'utilisateur reprend la main : on ne rezoomera plus tout seul.
      zoomUserControlled = true;
    }

    /* Zoom auto à l'upload (textiles) : le design occupe une petite part du
       vêtement, un cadrage large ne montre pas le résultat. Sans effet si
       l'utilisateur a déjà réglé le zoom (zoomUserControlled) ou si la vue
       est déjà plus rapprochée. Les coins/drapeaux/patchs remplissent déjà
       le cadre : réservé à .cv-single-view. */
    function autoZoomOnUpload() { autoZoomTo(170); }
    /* Exposée : conf-mobile.js la rejoue après un ajout de TEXTE. L'upload
       l'appelle déjà lui-même (doUpload), mais le texte passe par un autre
       chemin — et sur un aperçu de téléphone, un texte posé sans rapprocher
       la vue est à peine lisible. */
    window.autoZoomOnUpload = autoZoomOnUpload;

    /* Porte la vue à un niveau de zoom, sauf si l'utilisateur a déjà réglé le
       zoom lui-même ou si la vue est déjà plus rapprochée.
       Réservé aux textiles (.cv-single-view) : les coins/drapeaux/patchs
       remplissent déjà le cadre. */
    function autoZoomTo(level) {
      if (zoomUserControlled || zl >= level) return;
      if (!document.querySelector('.cv-single-view')) return;
      zl = level;
      setZoomLabel(zl);
      applyZoom();
    }
    /* Exposée : conf-sleeve-side.js zoome en passant en vue de côté — une
       manche occupe une petite part du visuel, il faut s'en approcher. */
    window.autoZoomTo = autoZoomTo;

    /* ── File upload ── */
    // Registre des URLs Cloudinary (une par zone) une fois l'upload backend terminé
    window.CLOUDINARY_URLS = window.CLOUDINARY_URLS || {};

    /* Taille maximale acceptée pour un design. Au-delà, le fichier est refusé :
       la lecture base64 d'une image de 20 Mo fige l'onglet plusieurs secondes
       avant de saturer sessionStorage. L'atelier n'a de toute façon pas besoin
       de cette résolution — l'original part vers Cloudinary, pas dans le
       navigateur. */
    const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;   // 12 Mo

    /* Types réellement exploitables par l'aperçu. L'attribut HTML `accept` ne
       fait qu'orienter le sélecteur de fichiers : il est contourné par un
       glisser-déposer ou un renommage, d'où ce contrôle côté code. Le PDF est
       accepté par certaines zones (coins/drapeaux) mais n'est pas rendu en
       aperçu : on le laisse passer sans tenter de le dessiner. */
    const UPLOAD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

    /* Réduit une image avant stockage en session. L'aperçu s'affiche dans un
       cadre de quelques centaines de pixels : conserver 4000 px de large ne se
       voit pas et sature le quota (~5 Mo). On borne le plus grand côté et on
       repasse en JPEG quand l'image est opaque.
       La transparence (PNG/WebP détourés — cas du retrait d'arrière-plan) est
       préservée : un aplat blanc ruinerait le détourage. */
    function compressForStorage(dataUrl) {
      const MAX_SIDE = 1400;
      return new Promise(function (resolve) {
        // Le SVG est vectoriel et déjà léger : le rastériser le dégraderait.
        if (/^data:image\/svg\+xml/i.test(dataUrl)) return resolve(dataUrl);
        const img = new Image();
        img.onload = function () {
          try {
            const w = img.naturalWidth, h = img.naturalHeight;
            if (!w || !h) return resolve(dataUrl);
            const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
            // Déjà petite et déjà compacte : on garde l'original tel quel.
            if (scale === 1 && dataUrl.length < 600000) return resolve(dataUrl);

            const cv = document.createElement('canvas');
            cv.width  = Math.max(1, Math.round(w * scale));
            cv.height = Math.max(1, Math.round(h * scale));
            const ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0, cv.width, cv.height);

            const keepAlpha = /^data:image\/(png|webp)/i.test(dataUrl) && hasAlpha(ctx, cv);
            const out = keepAlpha
              ? cv.toDataURL('image/png')
              : cv.toDataURL('image/jpeg', 0.85);
            // On ne garde le résultat que s'il fait réellement gagner de la place.
            resolve(out.length < dataUrl.length ? out : dataUrl);
          } catch (err) {
            // Canvas « tainted » ou mémoire insuffisante : l'original fera l'affaire.
            console.warn('Compression de l\'aperçu impossible :', err);
            resolve(dataUrl);
          }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      });
    }

    /** Vrai si au moins un pixel n'est pas complètement opaque. */
    function hasAlpha(ctx, cv) {
      try {
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        // Un pixel sur 40 suffit à repérer une zone transparente, sans parcourir
        // plusieurs millions d'octets à chaque upload.
        for (let i = 3; i < d.length; i += 4 * 40) if (d[i] < 255) return true;
        return false;
      } catch (err) {
        return true;   // dans le doute, on conserve le canal alpha
      }
    }

    function doUpload(e, zone) {
      const file = e.target.files[0];
      if (!file) return;

      /* Garde-fous AVANT lecture : au-delà de la limite, on refuse plutôt que
         de laisser le client composer sa commande sur un design qui ne sera
         pas mémorisé. Le champ est vidé pour qu'il puisse resélectionner le
         même fichier après l'avoir réduit. */
      /* PDF : REFUSÉ explicitement, avec une consigne actionnable.

         Il était accepté — ce test le laissait passer volontairement — puis
         `reader.readAsDataURL` produisait `data:application/pdf;base64,…` que
         `applyUpload` posait dans un `img.src` (conf-share.js:208). Aucun
         navigateur ne rend un PDF dans une <img> : le client voyait une icône
         d'image cassée, sans le moindre message, alors que son fichier avait
         été « accepté ». Vérifié : aucun rendu PDF (première page → canvas)
         n'existe dans le projet.

         Mieux vaut un refus clair qu'une acceptation qui ne marche pas. Le
         `accept="image/*,.pdf"` des champs (sections/configurateur.liquid:146-154)
         est conservé : un client qui a un PDF le sélectionnera quand même par
         glisser-déposer ou en forçant le filtre, et il doit alors être informé
         plutôt que de rester devant une image vide. */
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      if (isPdf) {
        e.target.value = '';
        const msgPdf = 'Les fichiers PDF ne peuvent pas être affichés sur le produit. ' +
              'Exportez votre visuel en PNG (fond transparent) ou en JPEG, ' +
              'puis réessayez.';
        if (typeof window.confAlert === 'function') {
          window.confAlert(msgPdf, { title: 'PDF non pris en charge' });
        } else {
          alert(msgPdf);
        }
        return;
      }
      if (file.type && UPLOAD_IMAGE_TYPES.indexOf(file.type) === -1) {
        e.target.value = '';
        const msgType = 'Format non pris en charge : ' + (file.type || 'inconnu') +
              '. Utilisez une image JPEG, PNG, WebP ou SVG.';
        if (typeof window.confAlert === 'function') window.confAlert(msgType, { title: 'Fichier refusé' });
        else alert(msgType);
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        e.target.value = '';
        const mo = (file.size / 1048576).toFixed(1).replace('.', ',');
        const msgSize = 'Ce fichier fait ' + mo + ' Mo, au-delà de la limite de 12 Mo. ' +
              'Réduisez sa taille ou exportez-le en JPEG avant de le déposer.';
        if (typeof window.confAlert === 'function') window.confAlert(msgSize, { title: 'Fichier trop volumineux' });
        else alert(msgSize);
        return;
      }

      const reader = new FileReader();
      reader.onload = ev => {
        const brut = ev.target.result;

        /* Produit propriétaire, capturé MAINTENANT — avant la modale de
           détourage (temps utilisateur arbitraire) et la compression
           (~100-400 ms). Sans cette capture, saveUpload() relisait
           `currentProductType` à la résolution : changer de produit pendant
           l'opération rangeait l'image sous le nouveau produit, la faisant
           disparaître de celui où le client l'avait posée. */
        const uploadOwner = currentProductType;

        /* Recadrage des bords TRANSPARENTS, avant toute chose.

           À ne pas confondre avec le détourage ci-dessous : celui-ci supprime un
           FOND OPAQUE et reste un choix du client. Le recadrage ne retire que des
           pixels DÉJÀ invisibles — l'apparence du logo est identique, seule sa
           boîte englobante rétrécit. Aucune décision à demander.

           Sans lui, un PNG exporté avec des bandes vides s'affichait à distance
           du pointillé de zone, et le client lisait cet écart comme une marge
           qui serait imprimée. CustomInk recadre de la même façon. */
        rognerBordsTransparents(brut).then(function (original) {

        // Demande au client s'il veut supprimer l'arrière-plan (détourage local).
        // Le module résout avec l'image d'origine OU la version détourée transparente.
        const decide = (window.ConfBgRemoval && typeof window.ConfBgRemoval.ask === 'function')
          ? window.ConfBgRemoval.ask(original)
          : Promise.resolve(original);

        decide.then(function (src) {
          /* Applique l'image dans l'interface EN PREMIER, en pleine résolution :
             l'aperçu reste instantané et net. */
          window.applyUpload(zone, src);

          /* Persistance : version réduite, pour que le design survive au
             rechargement sans saturer le quota de session (~5 Mo). Asynchrone —
             elle ne doit pas retarder l'affichage ci-dessus. La géométrie
             (position/taille) est enregistrée séparément par saveUploadGeo() et
             n'est pas affectée. */
          compressForStorage(src).then(function (stored) {
            saveUpload(zone, stored, uploadOwner);
          });

          // Upload sur une manche : on pivote vers elle pour que le client
          // voie ce qu'il vient de poser. (Uniquement à l'upload — pas à la
          // restauration, sinon le vêtement tournerait seul au rechargement.)
          if ((zone === 'sl' || zone === 'sr') &&
              typeof window.showSleeve === 'function') {
            window.showSleeve(zone);
          }

          /* Zoom automatique sur les zones TEXTILES : le design occupe une
             petite part du vêtement, un cadrage large ne montre pas le
             résultat. Différé d'un tour de boucle : le logo doit être posé
             et clampé avant qu'on rapproche la vue. */
          /* Pas sur mobile : le zoom anime `transform` sur .cv-single-view,
             et toute mesure prise pendant l'animation (placeLogoInZone,
             clampTextToZone) place l'élément à côté de sa zone. L'aperçu y
             est déjà plein écran — le rapprochement apporte peu, et le
             client peut zoomer lui-même. */
          var isNarrow = window.matchMedia('(max-width: 767px)').matches;
          if (!isNarrow && ['f', 'fr', 'b', 'sl', 'sr'].indexOf(zone) !== -1) {
            setTimeout(autoZoomOnUpload, 120);
          }

          // En arrière-plan : upload vers Cloudinary via le backend (production).
          // On envoie l'image RÉELLEMENT retenue (détourée si le client a choisi
          // de retirer le fond, sinon l'originale). N'empêche jamais l'affichage.
          if (window.ConfAPI) {
            const uploadFile = (src === original)
              ? file                                  // inchangée : garde le fichier d'origine
              : dataUrlToFile(src, file.name);        // détourée : PNG transparent
            window.ConfAPI.uploadLogo(uploadFile)
              .then(res => {
                if (res && res.url) {
                  window.CLOUDINARY_URLS[zone] = res.url;
                  confLog('☁️ Uploadé sur Cloudinary (' + zone + ') :', res.url);
                }
              })
              .catch(err => console.warn('Upload Cloudinary échoué (' + zone + ') :', err.message));
          }
        });
        });   // fin de rognerBordsTransparents()
      };
      reader.readAsDataURL(file);
    }

    /**
     * Retire les bandes ENTIÈREMENT TRANSPARENTES autour d'une image.
     *
     * Ne modifie PAS l'apparence : seuls des pixels déjà invisibles disparaissent.
     * L'image rendue occupe donc toute sa boîte, et le pointillé de zone épouse
     * le dessin au lieu de flotter à distance.
     *
     * @param {string} dataUrl image lue par FileReader
     * @returns {Promise<string>} l'image rognée, ou l'ORIGINALE si rien à rogner
     *
     * Rend toujours l'original en cas de doute — image sans transparence, canvas
     * indisponible, décodage impossible. Un upload ne doit jamais échouer à cause
     * d'un ajustement cosmétique.
     */
    function rognerBordsTransparents(dataUrl) {
      return new Promise(function (resolve) {
        if (typeof dataUrl !== 'string' || !/^data:image\//i.test(dataUrl)) {
          resolve(dataUrl);
          return;
        }
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth, h = img.naturalHeight;
            if (!w || !h) { resolve(dataUrl); return; }

            var cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            var ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);

            var px;
            try {
              px = ctx.getImageData(0, 0, w, h).data;
            } catch (e) {
              /* Canvas « contaminé » : impossible sur un dataURL, mais la lecture
                 des pixels reste la seule opération qui peut lever ici. */
              resolve(dataUrl);
              return;
            }

            /* Seuil à 10 plutôt que 0 : un export PNG laisse souvent des pixels
               à alpha 1-3 sur les bords, invisibles à l'œil mais suffisants pour
               qu'un test strict ne rogne rien du tout. */
            var SEUIL = 10;
            var opaque = function (x, y) { return px[(y * w + x) * 4 + 3] > SEUIL; };

            var haut = 0, bas = h - 1, gauche = 0, droite = w - 1;
            var x, y, trouve;

            trouve = false;
            for (y = 0; y < h && !trouve; y++) {
              for (x = 0; x < w; x++) if (opaque(x, y)) { haut = y; trouve = true; break; }
            }
            /* Aucun pixel visible : image entièrement transparente. La rogner
               produirait un canvas de taille nulle — on rend l'original, le
               client verra que son fichier est vide. */
            if (!trouve) { resolve(dataUrl); return; }

            for (y = h - 1; y >= haut; y--) {
              trouve = false;
              for (x = 0; x < w; x++) if (opaque(x, y)) { bas = y; trouve = true; break; }
              if (trouve) break;
            }
            trouve = false;
            for (x = 0; x < w && !trouve; x++) {
              for (y = haut; y <= bas; y++) if (opaque(x, y)) { gauche = x; trouve = true; break; }
            }
            for (x = w - 1; x >= gauche; x--) {
              trouve = false;
              for (y = haut; y <= bas; y++) if (opaque(x, y)) { droite = x; trouve = true; break; }
              if (trouve) break;
            }

            var nw = droite - gauche + 1, nh = bas - haut + 1;

            /* Rien à gagner : on rend l'ORIGINAL sans le réencoder. Un PNG déjà
               propre ne doit pas repasser par le canvas — la réécriture ferait
               perdre les métadonnées et regonflerait le poids du fichier. */
            if (nw >= w && nh >= h) { resolve(dataUrl); return; }

            var out = document.createElement('canvas');
            out.width = nw; out.height = nh;
            out.getContext('2d').drawImage(img, gauche, haut, nw, nh, 0, 0, nw, nh);

            /* PNG imposé : le format d'origine peut être un JPEG, qui n'a pas de
               couche alpha — réencoder en JPEG remplacerait la transparence par
               du noir. */
            resolve(out.toDataURL('image/png'));
          } catch (e) {
            resolve(dataUrl);
          }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      });
    }

    /* Convertit un dataURL (ex. PNG détouré) en objet File pour l'upload backend. */
    function dataUrlToFile(dataUrl, name) {
      const parts = dataUrl.split(',');
      const mime = (parts[0].match(/:(.*?);/) || [null, 'image/png'])[1];
      const bin = atob(parts[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      // Nom en .png car le détourage produit du PNG transparent.
      const baseName = (name || 'design').replace(/\.[^.]+$/, '') + '.png';
      return new File([arr], baseName, { type: mime });
    }

    /* ── Persistance des designs uploadés (image + taille/position) ──

       STOCKAGE INDEXÉ PAR PRODUIT :
         { _v: 2, byProduct: { sweatshirt: { f: {src, geo} }, tshirt: {...} } }

       L'ancien format était PLAT — { f: {...}, b: {...}, _product: 'tshirt' } —
       donc partagé par tous les produits : uploader sur un t-shirt écrasait les
       clés de zone du sweatshirt, et restoreUploads() reposait ces images sur
       le mauvais vêtement. Chaque produit a désormais son propre espace. */

    /** Lecture brute du stockage, converti au format courant si nécessaire. */
    function readUploadStore() {
      var raw = null;
      try { raw = JSON.parse(sessionStorage.getItem('conf_uploads')); } catch (e) {}
      return migrateUploadStore(raw);
    }

    /**
     * Convertit un stockage au format v2.
     * Un objet plat (v1, ou reçu via un lien de partage ancien) est rangé sous
     * son _product : sans cela, les designs d'une session en cours seraient
     * perdus au déploiement.
     */
    function migrateUploadStore(raw, ownerHint) {
      if (!raw || typeof raw !== 'object') return { _v: 2, byProduct: {} };
      if (raw._v === 2 && raw.byProduct) return raw;

      var owner = ownerHint || raw._product || currentProductType || 'sweatshirt';
      var zones = {};
      Object.keys(raw).forEach(function (k) {
        if (k === '_product' || k === '_v' || k === 'byProduct') return;
        zones[k] = raw[k];
      });
      var out = { _v: 2, byProduct: {} };
      if (Object.keys(zones).length) out.byProduct[owner] = zones;
      return out;
    }

    /* Exposée : conf-logo-store.js s'en sert comme repli quand LOGO_STORE est
       vide (après un rechargement). */
    window.readUploadStore = readUploadStore;

    /* Écrit le magasin d'uploads. Renvoie true si l'écriture a réussi.
       On DISTINGUE le dépassement de quota des autres échecs : un `catch` muet
       faisait disparaître le design du client au rechargement sans un mot.
       sessionStorage plafonne à ~5 Mo par origine, et une image y est stockée
       en base64 (+33 %) puis en UTF-16 (×2) : une photo de smartphone suffit à
       le saturer. Voir compressForStorage(), qui réduit l'image en amont. */
    function writeUploadStore(store) {
      try {
        sessionStorage.setItem('conf_uploads', JSON.stringify(store));
        return true;
      } catch (e) {
        var quotaHit = e && (
          e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||   // Firefox
          e.code === 22 || e.code === 1014
        );
        if (quotaHit) {
          console.warn('Stockage local saturé : le design ne survivra pas au rechargement.', e);
          if (typeof window.confAlert === 'function') {
            window.confAlert(
              'Votre navigateur ne peut plus mémoriser ce design (mémoire de session ' +
              'saturée). Il reste affiché et sera bien transmis avec votre commande, ' +
              'mais il disparaîtra si vous rechargez la page. Pour éviter cela, ' +
              'utilisez une image plus légère.',
              { title: 'Mémoire de session saturée' }
            );
          }
        } else {
          // Mode privé Safari, cookies bloqués… : l'affichage reste correct.
          console.warn('Écriture dans sessionStorage impossible :', e);
        }
        return false;
      }
    }

    /** Zones du produit courant uniquement — ce que manipule tout l'appelant. */
    function getUploads() {
      var store = readUploadStore();
      return store.byProduct[currentProductType] || {};
    }
    /* Sauvegarde l'image d'une zone (conserve la géométrie déjà enregistrée).

       `owner` (optionnel) — produit propriétaire de cet upload. À passer
       IMPÉRATIVEMENT depuis un contexte asynchrone : `currentProductType` est
       relu à l'appel, or doUpload() attend la modale de détourage (temps
       utilisateur) puis compressForStorage() (~100-400 ms). Si le client change
       de produit entre-temps, l'image était rangée sous le NOUVEAU produit :
       elle disparaissait de celui où il l'avait posée et réapparaissait
       spontanément sur l'autre. L'indexation par produit existe justement pour
       éviter ce mélange — la capture tardive la contournait.

       Sans `owner`, comportement inchangé (appels synchrones depuis un geste). */
    function saveUpload(zone, src, owner) {
      const product = owner || currentProductType;
      const store = readUploadStore();
      const u = store.byProduct[product] || {};
      const prev = (u[zone] && typeof u[zone] === 'object') ? u[zone] : {};
      u[zone] = { src: src, geo: prev.geo || null };
      store.byProduct[product] = u;
      writeUploadStore(store);
    }
    // Exposé : conf-patches.js persiste ici l'image détourée du mode
    // « découpé à la forme », pour qu'elle survive au rechargement.
    window.saveUpload = saveUpload;

    /* Sauvegarde la taille/position (left/top/width) d'un logo pour une zone.

       La géométrie peut arriver AVANT l'image : doUpload() affiche l'aperçu
       tout de suite mais ne persiste qu'après compression (asynchrone). Un
       client qui déplace son logo dans cet intervalle appelait cette fonction
       alors que la zone n'existait pas encore en session — l'ancien `return`
       perdait alors le déplacement, et saveUpload() écrivait ensuite
       `geo: null`. On mémorise donc la géométrie même sans image ; saveUpload()
       la conserve en la retrouvant dans `prev.geo`. */
    function saveUploadGeo(zone, geo) {
      const store = readUploadStore();
      const u = store.byProduct[currentProductType] || {};
      if (typeof u[zone] === 'string') u[zone] = { src: u[zone] };
      else if (!u[zone]) u[zone] = { src: null };   // en attente de l'image
      u[zone].geo = geo;
      store.byProduct[currentProductType] = u;
      writeUploadStore(store);
    }
    /* Exposée : conf-logo-drag.js (fin de drag/resize) et conf-coin-toolbar.js
       l'appellent via window.*. Sans cette ligne, leur garde
       `typeof window.saveUploadGeo === 'function'` est faux et la géométrie
       n'est jamais persistée — le logo repart au centre après rechargement. */
    window.saveUploadGeo = saveUploadGeo;
    function removeUpload(zone) {
      const store = readUploadStore();
      const u = store.byProduct[currentProductType];
      if (!u) return;
      delete u[zone];
      // Produit sans plus aucune zone : on retire son entrée plutôt que de
      // laisser un objet vide s'accumuler à chaque essai.
      if (!Object.keys(u).length) delete store.byProduct[currentProductType];
      writeUploadStore(store);
    }
    /* Exposée : conf-logo-drag.js l'appelle via window.removeUpload en repli
       de rmUp. Les modules coins/drapeaux y accèdent par la portée globale,
       mais le repli du bouton « × » passe bien par window.*. */
    window.removeUpload = removeUpload;

    // Réapplique tous les designs sauvegardés après un chargement de page
    function restoreUploads() {
      // getUploads() ne renvoie QUE les zones du produit courant : les designs
      // des autres produits ne peuvent plus se poser sur celui-ci.
      const u = getUploads();
      Object.keys(u).forEach(zone => {
        const entry = u[zone];
        const src = (typeof entry === 'string') ? entry : (entry && entry.src);
        const geo = (entry && typeof entry === 'object') ? entry.geo : null;
        if (src) {
          // Restauration : le visuel garde la taille/position sauvegardées.
          // Sans ce drapeau, le « remplir la zone » de l'upload (différé)
          // écraserait la géométrie que le client avait ajustée.
          window.__restoringUploads = true;
          window.applyUpload(zone, src);
          if (geo && typeof window.applyUploadGeo === 'function') {
            window.applyUploadGeo(zone, geo);
          } else if (typeof window.placeLogoInZone === 'function') {
            /* Aucune géométrie enregistrée (logo jamais déplacé depuis
               l'upload) : applyUpload n'a rien placé à cause du drapeau de
               restauration. Sans ce placement, le logo restait à sa position
               par défaut — hors de la zone, donc invisible. */
            window.placeLogoInZone(zone);
          }
          window.__restoringUploads = false;
        }
      });
    }
    /* Exposées : conf-dynamic-layout.js les appelle via window.* pour
       reconstruire le canvas textile sans recharger la page, et
       conf-sidebar-modern.js appelle window.selProd à la sélection d'un
       produit. Sans ces lignes, leurs gardes `typeof === 'function'` sont
       faux et l'appel est ignoré en silence. */
    window.selProd = selProd;
    window.restoreColor = restoreColor;
    window.restoreUploads = restoreUploads;

    // Applique une géométrie sauvegardée au(x) logo(s) d'une zone
    /* ── Application d'un design dans l'interface (partagé upload + restauration) ── */
    /* applyUploadGeo() vit aussi dans conf-share.js. Appelée via window.*. */
    /* applyUpload() et rmUp() vivent desormais dans assets/conf-share.js
       (limite Shopify de 256 Ko par template). Appelees via window.*.
       rmUp() depend de fonctions restees ici : removeUpload, setTextEnabled,
       updateSleeveSurcharge, updateRecapThumbLogo, refreshZoneGuides — toutes
       exposees sur window, ne pas retirer ces assignations. */


    /* ══════════════ TEXTE PERSONNALISÉ (textiles) ══════════════
       La logique d'édition (panneau, polices, formes) est dans le module
       conf-text-editor.js. Ici on garde uniquement :
       - l'exclusivité FACE (texte <-> logo cœur),
       - le passage de la zone pointillée en mode HORIZONTAL pour le texte,
       - le clamp du texte DANS sa zone. */

    // Grise la zone d'upload d'un côté quand un TEXTE l'occupe déjà : la zone
    // poitrine est unifiée, on interdit donc logo + texte du même côté.
    //   f  (cœur/gauche)   -> upload uz-f
    //   fr (poitrine droite) -> upload uz-fr
    /* Exposée : conf-text-zone.js (setTextZoneMode) l'appelle via window.*. */
    function setUploadEnabled(zone, enabled) {
      if (zone !== 'f' && zone !== 'fr') return;
      var uz = document.getElementById('uz-' + zone);
      if (!uz) return;
      uz.style.pointerEvents = enabled ? '' : 'none';
      uz.style.opacity = enabled ? '' : '0.4';
      uz.title = enabled ? '' : 'Retirez le texte de ce côté pour ajouter un logo';
    }
    window.setUploadEnabled = setUploadEnabled;
    function setTextEnabled(zone, enabled) { refreshTextButton(); }
    /* Exposées pour conf-share.js, qui héberge applyUpload (limite 256 Ko). */
    window.setTextEnabled = setTextEnabled;
    window.placeLogoInZone = placeLogoInZone;
    window.updateRecapThumbLogo = updateRecapThumbLogo;
    window.updateFlagRecapThumb = updateFlagRecapThumb;
    window.updatePatchRecapThumb = updatePatchRecapThumb;
    /* updateCoinRecapThumb est exposée par assets/conf-coin-thumb.js, où elle
       vit désormais : la référencer ici lèverait une ReferenceError. */

    /* Active/désactive le bouton « Ajouter un texte » selon la vue courante.
       Le bouton vit dans #txt-add-btns (un seul bouton + sélecteur
       d'emplacement) ; #txt-add-btn est l'ancien id, conservé en repli.
       Plus de désactivation liée au logo cœur : chaque emplacement est
       indépendant, et l'exclusivité logo/texte se règle zone par zone au
       moment de l'insertion. */
    function refreshTextButton() {
      var btn = document.querySelector('#txt-add-btns .txt-add-btn') ||
                document.getElementById('txt-add-btn');
      if (!btn) return;
      var layer = document.getElementById('logo-layer');
      var view = layer ? layer.getAttribute('data-view') : 'face';
      var onSleeve = (view === 'cote');
      btn.disabled = onSleeve;
      btn.title = onSleeve ? 'Le texte n\'est pas disponible sur les manches' : '';
    }
    window.refreshTextButton = refreshTextButton;

    /* Passe la zone pointillée en mode HORIZONTAL (bandeau) pour le texte, ou
       la remet dans sa forme d'origine. Mémorise le style d'origine. */
    /* ── Supplément « personnalisation manches » ──────────────────────────
       Option payante. Le tarif définitif viendra de la grille fournie par
       l'atelier : brancher ici window.PRICES.sleeve (servi par GET /api/pricing)
       dès qu'il sera renseigné côté backend. La valeur ci-dessous n'est qu'un
       repli d'affichage, pour que l'option soit visiblement payante. */
    var SLEEVE_PRICE_FALLBACK = 4;

    /** Prix unitaire du supplément par manche personnalisée.
     *
     *  Défaut corrigé le 2026-08-08 : cette fonction lisait `PRICES.sleeve`,
     *  mais GET /api/pricing renvoie la clé `manche`. La clé ne correspondait
     *  donc JAMAIS et le repli s'appliquait toujours — le client voyait 4,00 €
     *  là où l'admin avait fixé 7,76 €.
     *
     *  `manche` d'abord, `sleeve` en repli : si la clé du backend change un
     *  jour, les deux formes restent acceptées. */
    function sleeveUnitPrice() {
      var P = window.PRICES || {};
      var p = P.manche !== undefined ? P.manche : P.sleeve;
      var v = Number(p);
      return isNaN(v) || v <= 0 ? SLEEVE_PRICE_FALLBACK : v;
    }
    window.sleeveUnitPrice = sleeveUnitPrice;

    /* Prix unitaire d'une ligne de panier, SUPPLÉMENT MANCHES COMPRIS.
       effectiveUnitPrice() ne rend que le palier dégressif : le drawer
       affichait 60 € sur un article facturé 64 €. */
    function cartUnitPrice(item, totalsByType) {
      var base = window.effectiveUnitPrice
        ? window.effectiveUnitPrice(item, totalsByType)
        : Number(item.price) || 0;
      var n = Math.max(0, parseInt(item.sleeveCount, 10) || 0);
      return base + sleeveUnitPrice() * n;
    }
    window.cartUnitPrice = cartUnitPrice;

    /** Nombre de manches personnalisées (0, 1 ou 2). */
    function sleeveCount() {
      return ['sl', 'sr'].filter(function (z) {
        var el = document.getElementById('logo-' + z);
        var img = el && el.querySelector('img');
        return img && img.getAttribute('src');
      }).length;
    }

    /* Option manches activée par le client (bascule). Persistée pour survivre
       à un rechargement, comme le reste du design. */
    function sleeveOptOn() {
      try { return sessionStorage.getItem('conf_sleeve_opt') === '1'; } catch (e) { return false; }
    }
    function setSleeveOpt(on) {
      try { sessionStorage.setItem('conf_sleeve_opt', on ? '1' : '0'); } catch (e) {}
    }

    /* Active/désactive l'option payante. En la désactivant, on retire les
       logos déjà posés : laisser un visuel sur une prestation non facturée
       produirait une commande que l'atelier ne saurait pas honorer. */
    function toggleSleeveOption() {
      var on = !sleeveOptOn();
      if (!on && sleeveCount() > 0) {
        confConfirm('Désactiver l’option retirera les logos déjà placés sur les manches.',
          { icon: 'warning', title: 'Retirer la personnalisation ?',
            confirmText: 'Retirer', cancelText: 'Annuler' })
          .then(function (ok) {
            if (!ok) return;
            ['sl', 'sr'].forEach(function (z) { if (typeof rmUp === 'function') rmUp(z); });
            setSleeveOpt(false);
            applySleeveOption();
          });
        return;
      }
      setSleeveOpt(on);
      applySleeveOption();
    }
    window.toggleSleeveOption = toggleSleeveOption;

    /* Reflète l'état de l'option dans l'interface (bascule + repli du corps). */
    function applySleeveOption() {
      var on = sleeveOptOn();
      var card = document.getElementById('slv-opt');
      var row = document.getElementById('slv-toggle-row');
      var body = document.getElementById('slv-body');
      var coteBtn = document.getElementById('cote-view-btn');
      
      if (card) card.classList.toggle('on', on);
      if (row) row.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (body) body.style.display = on ? '' : 'none';
      
      /* Onglets de vue.
         Option ACTIVE   : « Vue de côté » disparaît, remplacé par deux onglets
                           explicites « Manche gauche » / « Manche droite ».
         Option INACTIVE : retour à « Vue de côté » (désactivé), et les onglets
                           manche sont retirés. */
      var slL = document.getElementById('sleeve-l-btn');
      var slR = document.getElementById('sleeve-r-btn');
      if (slL) slL.style.display = on ? '' : 'none';
      if (slR) slR.style.display = on ? '' : 'none';

      if (coteBtn) {
        coteBtn.disabled = !on;
        // Masqué quand les onglets dédiés le remplacent.
        coteBtn.style.display = on ? 'none' : '';

        /* Désactivation depuis la vue de côté : on revient à la face, sinon
           l'utilisateur resterait sur une vue dont l'onglet vient de
           disparaître. On teste aussi les onglets manche, désormais porteurs
           de l'état actif. */
        var inCote = coteBtn.classList.contains('on') ||
                     (slL && slL.classList.contains('on')) ||
                     (slR && slR.classList.contains('on'));
        if (!on && inCote) {
          var faceBtn = document.querySelector('.vt[onclick*="face"]');
          if (faceBtn && typeof selView === 'function') {
            selView(faceBtn, 'face');
          }
        }
      }

      /* Pastille de l'onglet « Vue de côté » : sans objet maintenant que
         l'option fait apparaître des onglets nommés. */
      var coteDot = document.getElementById('cote-view-dot');
      if (coteDot) coteDot.style.display = 'none';

      // Rappel sous le prix du récapitulatif.
      var flag = document.getElementById('rp-sleeve-flag');
      if (flag) flag.style.display = on ? '' : 'none';

      // Mettre à jour le bouton manches dans la sidebar moderne
      if (window.modernSidebar && typeof window.modernSidebar.updateSleeveOptionButton === 'function') {
        window.modernSidebar.updateSleeveOptionButton();
      }

      updateSleeveSurcharge();
      updateTotalPrice(); // Met à jour le prix total
    }
    window.applySleeveOption = applySleeveOption;

    /* Met à jour l'indication de prix (badge + ligne du récap).
       Appelée à chaque ajout/retrait de logo manche. */
    function updateSleeveSurcharge() {
      var unit = sleeveUnitPrice();
      var n = sleeveCount();

      // Met à jour le badge de prix dans l'option
      var badge = document.getElementById('slv-price-badge');
      if (badge) {
        if (n > 0) {
          // Si des manches sont personnalisées, affiche le total
          badge.textContent = '+ ' + window.formatPrix(unit * n);
        } else {
          // Sinon affiche le prix unitaire
          badge.textContent = '+ ' + window.formatPrix(unit) + '/manche';
        }
      }

      /* Étiquettes du panneau « Upload Image » (sidebar-modern.liquid, une par
         type de textile). Repérées par CLASSE et non par id : elles sont en
         trois exemplaires, et leur libellé était écrit en dur dans le HTML —
         il restait donc à 4,00 € quand l'admin changeait le tarif. */
      var tags = document.querySelectorAll('.upload-sleeve-price-tag');
      for (var i = 0; i < tags.length; i++) {
        tags[i].textContent = '+ ' + window.formatPrix(unit) + '/manche';
      }

      var qty = document.getElementById('rc-sleeves-qty');
      if (qty) qty.textContent = n > 1 ? '×' + n : '';

      var extra = document.getElementById('rc-sleeves-extra');
      if (extra) extra.textContent = n ? '+ ' + window.formatPrix(unit * n) : '';

      /* Montant sur l'indicateur sous le prix : le supplément réel tant
         qu'aucune manche n'est encore personnalisée resterait à 0, on affiche
         alors le tarif unitaire pour annoncer ce qui sera facturé. */
      var flagAmount = document.getElementById('rp-sleeve-amount');
      if (flagAmount) {
        flagAmount.textContent = n > 0
          ? '+ ' + window.formatPrix(unit * n)
          : '+ ' + window.formatPrix(unit) + '/manche';
      }

      // Met à jour le prix total
      updateTotalPrice();
    }
    window.updateSleeveSurcharge = updateSleeveSurcharge;

    /* Met à jour le prix total affiché dans le récapitulatif.
       Inclut le prix de base + supplément manches. */
    /* Quantité choisie pour le textile courant (champ du récap). */
    function textileQty() {
      var el = document.getElementById('textile-qty-input');
      return Math.max(1, parseInt(el && el.value, 10) || 1);
    }
    window.textileQty = textileQty;

    function changeTextileQty(delta) {
      var el = document.getElementById('textile-qty-input');
      if (!el) return;
      el.value = Math.max(1, (parseInt(el.value, 10) || 1) + delta);
      updateTotalPrice();
    }
    function handleTextileQtyInput() {
      var el = document.getElementById('textile-qty-input');
      if (el) el.value = Math.max(1, parseInt(el.value, 10) || 1);
      updateTotalPrice();
    }

    function updateTotalPrice() {
      var priceEl = document.getElementById('rp-price-val');
      if (!priceEl) return;

      var qty = textileQty();

      /* Palier calculé sur la quantité TOTALE du type — celle de la ligne en
         cours PLUS ce qui est déjà au panier pour ce même produit.

         Cette fonction ne regardait que `qty`, alors que renderCartDrawer et le
         récapitulatif somment par type (`totalsByType`). Deux lignes de 6
         t-shirts affichaient donc 28,90 €/u pendant la composition, puis
         26,50 €/u au panier : le client voyait un prix changer sans agir. Le
         palier réellement appliqué étant celui du total, c'est lui qui doit
         être annoncé.

         `cartItems` est la même source que le tiroir, donc les deux affichages
         ne peuvent plus diverger. */
      var qtyForTier = qty;
      try {
        if (Array.isArray(cartItems)) {
          cartItems.forEach(function (it) {
            if (it && it.productType === currentProductType) {
              qtyForTier += (parseInt(it.qty, 10) || 0);
            }
          });
        }
      } catch (e) { qtyForTier = qty; }

      /* Prix unitaire : palier dégressif selon la quantité si le produit a une
         grille (sweat / t-shirts), sinon prix fixe de l'admin. */
      var basePrice = null;
      if (typeof window.tierUnitPrice === 'function') {
        basePrice = window.tierUnitPrice(currentProductType, qtyForTier);
      }
      if (basePrice == null) {
        basePrice = window.prixUnitaire ? window.prixUnitaire(currentProductType) : 45;
      }

      // Supplément manches (uniquement si l'option est activée), par pièce.
      var sleeveExtra = 0;
      if (sleeveOptOn()) {
        sleeveExtra = sleeveUnitPrice() * sleeveCount();
      }

      var total = (basePrice + sleeveExtra) * qty;

      /* Affichage : total, avec le détail unitaire dès 2 pièces — ou dès qu'un
         supplément manches s'applique, même à l'unité : sans cela le client
         voit un total plus élevé que le prix annoncé, sans explication. */
      var showUnit = qty > 1 || sleeveExtra > 0;
      priceEl.innerHTML = window.formatPrix(total) + ' <span class="rp-pvat">TTC</span>' +
        (showUnit ? ' <span class="rp-punit">(' + window.formatPrix(basePrice + sleeveExtra) +
                   ' /u)</span>' : '');
    }
    window.updateTotalPrice = updateTotalPrice;

    // Affiche le prix initial, puis le rafraîchit quand les prix
    // réels arrivent du backend (fetch /api/pricing).
    document.addEventListener('DOMContentLoaded', applySleeveOption);

    /* On s'accroche à la PROMESSE, pas à l'événement `conf:prices-loaded`.

       Le fetch part d'un <script> inline de configurateur.liquid, exécuté dès
       le parsing, alors que ce fichier est chargé en `defer` — donc APRÈS.
       Quand /api/pricing répondait vite (cache navigateur, connexion rapide),
       l'événement était émis avant que ces abonnements existent. Les événements
       DOM n'étant pas rejoués, updateTotalPrice() ne se déclenchait jamais et la
       page restait sur les prix de repli codés en dur, jusqu'au rechargement
       suivant. Le symptôme était intermittent et partiel : l'auditeur inline du
       template, lui, était bien enregistré à temps.

       Une promesse déjà résolue rappelle immédiatement tout `.then()` ajouté
       ensuite : la course disparaît, quel que soit l'ordre d'exécution.
       `PRICES_READY` est toujours résolue (le fetch a un `.catch`), y compris
       backend injoignable — les prix de repli restent alors affichés.
       Le `|| Promise.resolve()` couvre le cas où ce fichier serait chargé sans
       le template (tests, page isolée). */
    (window.PRICES_READY || Promise.resolve()).then(function () {
      updateSleeveSurcharge();
      updateTotalPrice();
    });

    /* Taille de police maximale du texte personnalisé (px CSS).

       Portée de 28 à 200 le 12/08/2026, à la demande du commerçant : le texte
       doit pouvoir remplir sa zone comme le fait un logo. À 28, il butait à
       environ un tiers du bandeau de poitrine alors qu'il restait de la place.

       C'était un plafond ATELIER, pas une contrainte technique — la qualité
       d'impression d'un très grand texte relève désormais du commerçant.

       La borne n'est PAS supprimée : `clampTextToZone` compare `cur` et `wanted`
       à cette valeur, et un `undefined` rendrait ces tests faux en permanence.
       200 px est hors d'atteinte dans une zone de configurateur — c'est un
       garde-fou contre une valeur aberrante (saisie forgée, état corrompu), pas
       une limite que le client rencontrera : c'est la zone qui l'arrête, via la
       boucle d'agrandissement de conf-text-clamp.js. */
    var MAX_TEXT_SIZE = 200;
    window.MAX_TEXT_SIZE = MAX_TEXT_SIZE;

    /* Zones de TEXTE : dérivées des zones de logo (LOGO_ZONES), qui sont
       calculées depuis les contraintes atelier en cm et changent selon le
       produit (sweat / t-shirt). Les valeurs étaient auparavant codées en dur
       et ne suivaient donc ni la taille réelle des zones ni le produit choisi :
       un texte pouvait sortir du gabarit d'impression.
       Le texte occupe un BANDEAU : toute la largeur de la zone, mais une
       hauteur réduite (un texte est large et peu haut). */
    /* Part de la hauteur de zone réservée au texte. À 0.42, la zone ne faisait
       que ~23px de haut : dès 24px de police le texte débordait et
       clampTextToZone le rapetissait — le curseur de taille semblait sans
       effet. À 1, le texte dispose de toute la hauteur du bandeau et peut
       atteindre le plafond atelier (MAX_TEXT_SIZE). */
    var TEXT_ZONE_RATIO = 1;
    function textZone(zone) {
      var z = (typeof LOGO_ZONES !== 'undefined') ? LOGO_ZONES[zone] : null;
      if (!z) return null;
      var hh = z.height * TEXT_ZONE_RATIO;
      return {
        left: z.left,
        top: z.top + (z.height - hh) / 2,   // bandeau centré verticalement
        width: z.width,
        height: hh
      };
    }
    /* Compat : l'ancien objet est conservé en accès dynamique, les appelants
       existants (TEXT_ZONE_HORIZ[zone]) continuent de fonctionner. */
    var TEXT_ZONE_HORIZ = {
      get 'f'()  { return textZone('f'); },
      get 'fr'() { return textZone('fr'); },
      get 'b'()  { return textZone('b'); }
    };
    /* Exposé : conf-text-clamp.js le lit. Les getters restent dynamiques, la
       référence suffit — ne pas remplacer par une copie. */
    window.TEXT_ZONE_HORIZ = TEXT_ZONE_HORIZ;

    /* clampTextToZone() vit desormais dans assets/conf-text-clamp.js (limite
       Shopify de 256 Ko). Appelee via window.clampTextToZone ; depend de
       window.TEXT_ZONE_HORIZ et window.MAX_TEXT_SIZE, exposes plus haut. */

    /* clampCoinLogo() vit desormais dans assets/conf-patches.js (limite
       Shopify de 256 Ko par template). Appelee via window.clampCoinLogo. */

    /* Ramène le logo du patch DANS sa zone imprimable.
       La contrainte de conf-logo-drag.js ne joue qu'au déplacement et au
       redimensionnement : un visuel fraîchement uploadé garde sa taille par
       défaut (70 %) et déborderait de la forme.
       Les bornes suivent la forme choisie — le rectangle est plus large que
       haut, ses marges verticales sont donc plus fortes. */
    /* @param fill  true : le visuel est AGRANDI pour occuper toute la zone
                    (upload / changement de forme) — le design s'intègre seul,
                    sans placement manuel. false : simple bornage. */
    /* Le design du patch remplit toute la forme et est rogné par .patch-body
       (overflow:hidden + masque) : il n'y a plus de placement à calculer.
       Conservée pour les appelants existants, elle remet simplement le logo en
       pleine forme — un design cadré lors d'une session précédente est ainsi
       recentré. */
    /* Cadrage initial d'un patch. reset=false pendant une restauration : cette
       fonction part au 'load' de l'image, donc APRÈS applyUploadGeo, et
       effacerait le recadrage et le zoom du client. */
    function clampPatchLogo(reset) {
      var logo = document.getElementById('patch-logo');
      if (!logo || logo.style.display === 'none') return;
      if (reset === false) return;
      logo.style.left = '0%';
      logo.style.top = '0%';
      logo.style.width = '100%';
    }
    window.clampPatchLogo = clampPatchLogo;

    /* ── Coins functions ── */
    function selectShape(el) {
      document.querySelectorAll('.coins-shape-card').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
      const shapeName = el.querySelector('span').textContent;
      const shape = el.dataset.shape;

      // La forme est portée par la CLASSE shape-* (lue par patchShapeName()),
      // puis rendue par l'IMAGE PNG (updatePatchShapeImg applique aussi le ratio).
      const canvas = document.getElementById('coins-canvas');
      if (canvas && shape) {
        canvas.classList.remove('shape-rond', 'shape-carre', 'shape-rectangle', 'shape-blason');
        canvas.classList.add('shape-' + shape);
      }

      // Recalcule l'image du patch (forme + couleur, repli teinté) + l'aspect-ratio.
      if (typeof updatePatchShapeImg === 'function') updatePatchShapeImg();

      // Mettre à jour le récap
      const recapShape = document.getElementById('coins-recap-shape');
      if (recapShape) recapShape.textContent = shapeName;

      // La vignette du récap doit suivre la nouvelle forme.
      if (typeof updatePatchRecapThumb === 'function') updatePatchRecapThumb();

      /* Les bornes de la zone imprimable dépendent de la forme : on recontraint
         le logo, sinon il reste hors de la nouvelle silhouette (agrandir un logo
         aux bords d'un carré puis choisir « Blason » le laissait dépasser).

         Pourquoi ici : cette fonction EST celle qui gagne. `selectShape` existe
         aussi dans conf-dynamic-layout.js:1028, qui portait déjà cet appel —
         mais ce fichier est chargé par layout/configurateur.liquid:366 (`defer`)
         alors que celui-ci vient de sections/configurateur.liquid:989, donc
         APRÈS dans l'ordre du document. Ses `function` étant globales (aucune
         IIFE ici), c'est cette version qui écrase l'autre.

         Le délai laisse `updatePatchShapeImg()` appliquer le nouvel
         `aspect-ratio` avant de mesurer : sans lui, clampPatchLogo lirait encore
         les bornes de l'ancienne forme. */
      setTimeout(function () {
        if (typeof window.clampPatchLogo === 'function') window.clampPatchLogo(true);
      }, 60);
    }

    // Couleur de fond du patch
    function selectPatchColor(el, hex, name) {
      document.querySelectorAll('.patch-color-sw').forEach(s => s.classList.remove('active'));
      el.classList.add('active');

      // Couleur courante du patch (hex + slug de fichier). Le rendu se fait via
      // l'IMAGE PNG patch-{forme}-{slug}.png (ou l'image blanche teintée en repli).
      window.currentPatchHex = hex;
      window.currentPatchSlug = (typeof patchHexToSlug === 'function') ? patchHexToSlug(hex) : 'noir';

      // On conserve --patch-color / backgroundColor pour compat (capture lit le hex).
      const canvas = document.getElementById('coins-canvas');
      if (canvas) {
        canvas.style.setProperty('--patch-color', hex);
      }

      // Recalcule l'image du patch (vraie image colorée sinon blanc teinté).
      if (typeof updatePatchShapeImg === 'function') updatePatchShapeImg();

      // Met à jour la vignette du récap (image + logo positionné).
      if (typeof updatePatchRecapThumb === 'function') updatePatchRecapThumb();

      // Ajouter/mettre à jour la ligne "Couleur" dans le récap
      let recapColor = document.getElementById('coins-recap-color');
      if (recapColor) {
        recapColor.textContent = name;
      }

      // Persiste la couleur du patch : restaurée au reload.
      try { sessionStorage.setItem('conf_patch_color', JSON.stringify({ hex: hex, name: name })); } catch (e) {}

      confLog('🎨 Couleur du patch:', name, hex);
    }

    /* selectCoinSize() SUPPRIMÉE (collision de portée).

       Ce fichier étant chargé en DERNIER, sa définition racine écrasait sur
       window celles de conf-dynamic-layout.js et conf-patches.js. Les clics
       (`onclick="selectCoinSize(this)"`, résolus par la portée globale)
       exécutaient donc celle-ci, alors que conf-sidebar-modern.js — qui appelle
       `window.selectCoinSize(...)` pour resynchroniser le panneau après un
       changement de produit — exécutait celle de conf-patches.js : deux rendus
       différents pour la même taille.

       L'implémentation unique vit désormais dans conf-patches.js. */

    /* applyCoinSizeScale() SUPPRIMÉE avec selectCoinSize(), son unique
       appelante. Sa formule `0.5 + mm/42` bornée à 1.20 saturait dès 30 mm :
       un coin de 30 mm s'affichait à la même taille qu'un 50 mm.

       Mise à jour du 2026-08-08 : la question ne se pose plus. L'aperçu ne
       change PLUS de taille selon le diamètre choisi — le visuel sautait à
       chaque clic sans rien apprendre au client, un coin de 25 mm et un de
       50 mm se ressemblant à l'écran. La taille est désormais une simple
       information, affichée dans le récapitulatif et transmise avec la commande
       via `.rp-patch-details p` (voir :2202).

       `applyCoinDiameterScale()` (conf-patches.js) subsiste mais remet
       seulement `scale(1)` : elle efface une échelle qu'une session précédente
       aurait laissée. */

    function selectFabrication(el) {
      document.querySelectorAll('.conf-fabrication-option').forEach(f => f.classList.remove('active'));
      el.classList.add('active');
      const radio = el.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      const typeName = el.querySelector('strong').textContent;
      confLog('Fabrication sélectionnée:', el.dataset.fabrication);
      
      // Mettre à jour le récap
      const recapType = document.getElementById('coins-recap-type');
      if (recapType) recapType.textContent = typeName;
    }

    /* switchCoinsView, coinMinQty, changeQty, handleQtyInput, updateCoinPrice :
       supprimés d'ici. Les versions actives vivent dans conf-dynamic-layout.js.

       ATTENTION — la justification d'origine était FAUSSE. Elle disait que ces
       définitions étaient « écrasées par celles de conf-dynamic-layout.js,
       chargé après ». L'ordre est L'INVERSE :

         - conf-dynamic-layout.js : layout/configurateur.liquid:366  (`defer`)
         - conf-main-inline.js    : sections/configurateur.liquid:989 (`defer`)

       La section est injectée par `content_for_layout` (layout:475), donc APRÈS
       tout le <head>. Les `defer` s'exécutant dans l'ordre du document, c'est CE
       FICHIER qui s'exécute en dernier et qui écrase les autres — comme le
       commentaire de selectCoinSize plus haut le décrit correctement, lui.

       Conséquence réelle de cette confusion : `selectShape` (:4558) et
       `selectFabrication` (:4653) ont survécu ici en écrasant les versions de
       conf-dynamic-layout.js, et `selectShape` perdait au passage l'appel à
       `clampPatchLogo(true)` — un logo restait hors silhouette après changement
       de forme. Corrigé à :4586.

       Retirer ces cinq noms était donc le bon geste (les versions de
       conf-dynamic-layout.js sont bien les seules en vie), mais pour la raison
       opposée à celle écrite. Ne pas se fier à ce raisonnement pour supprimer
       d'autres doublons : vérifier l'ordre réel dans un navigateur. */

    /* ── Contact for custom (PVC/Tissé) ── */
    /* ── Init : charge les images de la couleur par défaut au démarrage ── */
    document.addEventListener('DOMContentLoaded', () => {
      updateProductImages();
    });

