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
      /* `:not(.sb-group)` : le bouton « Pour Groupe » de la sidebar porte AUSSI
         la classe .sb, alors que ce n'est pas une taille. Sans ce filtre, il
         apparaissait comme option dans les listes déroulantes Taille de la
         modale de groupe. Même filtre que getAvailableSizes()
         (conf-size-quantity-modal.js:27). */
      var btns = document.querySelectorAll('.sb:not(.sb-group)');
      /* Dé-doublonne par libellé, comme grpColors() juste en dessous.
         Le sidebar est reconstruit selon le produit et la vue : plusieurs jeux
         de boutons .sb peuvent coexister dans le DOM (l'ancien masqué, le
         nouveau visible). Sans dé-doublonnage, la liste Taille affichait deux
         fois XS/S/M/L/XL/XXL — le « des fois » du symptôme, selon que le
         sidebar avait déjà été reconstruit ou non. */
      var seen = {}, out = [];
      btns.forEach(function (b) {
        var t = (b.textContent || '').trim();
        if (t && !seen[t]) { seen[t] = 1; out.push(t); }
      });
      /* Repli si aucun bouton .sb n'est dans le DOM. Aligné sur les 9 tailles
         du sélecteur (sections/configurateur.liquid) et de la modale de groupe
         (conf-size-quantity-modal.js:48) : les trois listes doivent coïncider,
         sinon une taille commandable ici serait absente ailleurs. */
      return out.length ? out : ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
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
      /* PLUS DE MODALE — on bascule sur l'étape « Configurer » du parcours.

         Le tableau vit désormais dans le canvas : une fenêtre par-dessus
         ferait un cadre dans un cadre, et le déplacer entre les deux
         emplacements à chaque ouverture était fragile — les écouteurs suivent
         l'élément, les mesures en cours l'ignorent.

         Cette fonction reste le POINT D'ENTRÉE UNIQUE : elle est appelée
         depuis la barre latérale (conf-sidebar-modern.js:751), le panneau
         texte (:667) et un bouton du markup. Les rediriger un par un les
         aurait fait diverger ; on redirige ici, une fois.

         Le mode groupe est activé au passage : demander la liste des surnoms
         EST le mode groupe, même si le client n'est pas passé par l'écran de
         choix. */
      var root = document.querySelector('.conf-app-root');
      if (root && typeof allerEtapeGroupe === 'function') {
        if (root.getAttribute('data-mode') !== 'groupe') {
          try { sessionStorage.setItem(MODE_KEY, 'groupe'); } catch (e) {}
          window.__modePerso = 'groupe';
          root.setAttribute('data-mode', 'groupe');
          root.removeAttribute('data-etape');
        }
        allerEtapeGroupe('configurer');
        return;
      }

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
      /* Le client a pu ajouter ou retirer un texte depuis la dernière
         ouverture : le sélecteur de zone est reconstruit à chaque fois, et
         reste masqué s'il n'y a pas d'ambiguïté (0 ou 1 texte). */
      if (typeof window.grpRefreshTextZonePicker === 'function') {
        window.grpRefreshTextZonePicker();
      }
      grpRefreshCurveWarning();
    }

    /**
     * Signale un TEXTE COURBÉ et bloque la validation.
     *
     * Un texte courbé est rendu en SVG : son `textContent` est vide, et les
     * deux chemins de substitution s'abstiennent — l'aperçu
     * (conf-group-preview.js:140) comme l'ajout au panier (:2466, `peutSubstituer`).
     * Le client validait donc trente surnoms et recevait trente articles
     * portant le même texte, sans le moindre signal.
     *
     * On BLOQUE plutôt qu'on avertit : le coût de l'erreur est une commande
     * entière à refaire, et un avertissement serait franchi par le premier
     * client pressé.
     *
     * Même test que les deux chemins ci-dessus — la classe `is-shaped` — pour
     * qu'ils ne puissent pas diverger.
     */
    function grpRefreshCurveWarning() {
      var box = document.getElementById('grp-curve-warn');
      var submit = document.getElementById('grp-submit');
      if (!box) return;

      var zone = (typeof window.grpTextZone === 'function') ? window.grpTextZone() : 'f';
      var el = document.getElementById('text-' + zone);
      var courbe = !!(el && el.classList.contains('is-shaped') &&
                      el.style.display !== 'none');

      box.style.display = courbe ? 'block' : 'none';
      if (submit) {
        submit.disabled = courbe;
        submit.title = courbe
          ? 'Redressez le texte pour attribuer un nom à chaque personne'
          : '';
      }
    }
    /* Exposée : le sélecteur de zone (conf-group-textzone.js) peut changer la
       zone visée, et la nouvelle n'est pas forcément courbée comme l'ancienne. */
    window.grpRefreshCurveWarning = grpRefreshCurveWarning;
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
       une URL douteuse — la vignette manque, le panier reste utilisable.

       La forme PROTOCOLE-RELATIVE `//domaine/…` a été ajoutée : c'est celle
       que produit le filtre Liquid `asset_url`, donc celle de toutes les images
       produit du thème. Elle était rejetée par `/^\/[^\/]/`, qui exige une
       barre NON suivie d'une seconde — l'aperçu d'une ligne de commande de
       groupe recevait donc `src=""` et n'affichait aucun vêtement.
       `[^\/]` en troisième position reste indispensable : il accepte
       `//domaine/…` mais refuse `///…`. Aucun risque rouvert — `//` ne peut pas
       introduire de schéma exécutable, et `javascript:` reste rejeté. */
    function safeImgSrc(u) {
      var s = String(u == null ? '' : u).trim();
      var ok = /^data:image\//i.test(s) ||
               /^https?:\/\//i.test(s) ||
               /^\/\/[^\/]/.test(s) ||        // protocole-relatif : //cdn.shopify…
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
      /* Pastille de couleur dans la liste déroulante.

         Un <option> n'accepte ni image ni pseudo-élément de façon fiable, mais
         `background-color` fonctionne dans les navigateurs actuels quand la
         liste est ouverte. On peint donc une BANDE à gauche via un dégradé
         net (deux arrêts à la même position = pas de fondu), et on décale le
         texte avec padding-left pour ne pas le recouvrir.

         La bande fait 22px, le texte commence à 30px : ils ne se recouvrent
         jamais, donc le libellé reste lisible quelle que soit la teinte —
         inutile de recalculer une couleur de texte par contraste. */
      var colorOpts = colors.map(function (c) {
        /* `c.hex` vient de `style.background`, que le navigateur peut renvoyer
           DÉVELOPPÉ : "rgb(239,241,240) none repeat scroll 0% 0% / auto ...".
           Injecté tel quel dans un gradient, il le rendrait invalide et la
           pastille disparaîtrait. On extrait donc la seule couleur. */
        var brut = String(c.hex || '').trim();
        var m = brut.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i);
        var hex = m ? m[0] : '';
        var style = hex
          ? 'background:linear-gradient(90deg,' + hex + ' 0,' + hex + ' 22px,transparent 22px);padding-left:30px;'
          : '';
        return '<option value="' + grpEsc(c.name) + '" data-hex="' + grpEsc(c.hex) + '"' +
               (style ? ' style="' + style + '"' : '') +
               (c.name === selColorName ? ' selected' : '') + '>' + grpEsc(c.name) + '</option>';
      }).join('');

      /* Entrées de la liste MAISON : une pastille <span> + le nom. Contrairement
         à <option>, un <span> accepte un fond coloré dans tous les navigateurs.
         `data-val` porte le nom, seule valeur écrite dans le <select> caché. */
      var colorItems = colors.map(function (c) {
        var brut = String(c.hex || '').trim();
        var m = brut.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i);
        var hex = m ? m[0] : '#ccc';
        return '<button type="button" class="grp-cpick-item' +
               (c.name === selColorName ? ' on' : '') + '" data-val="' + grpEsc(c.name) + '"' +
               ' onclick="grpPickColor(this)">' +
                 '<span class="grp-cpick-sw" style="background:' + hex + '"></span>' +
                 '<span>' + grpEsc(c.name) + '</span>' +
               '</button>';
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
        '<td><input class="grp-inp grp-f-flock" type="text" maxlength="20" placeholder="JEAN 10" value="' + grpEsc(preset.flock || '') + '"></td>' +
        '<td><select class="grp-sel grp-f-size" onchange="grpUpdateTotals()">' + sizeOpts + '</select></td>' +
        /* Sélecteur de couleur : le <select> natif est CONSERVÉ mais masqué, et
           doublé d'une liste maison.

           Pourquoi : les navigateurs n'appliquent pas de façon fiable un fond
           coloré sur un <option> (mesuré ici — la pastille de la ligne
           s'affichait, celles de la liste ouverte non). Une liste maison est le
           seul moyen d'afficher une pastille à côté de chaque NOM de couleur.

           Le <select> reste la source de vérité : `grpVal(tr, 'grp-f-color')`,
           l'import CSV et l'aperçu le lisent tous. On ne fait que piloter sa
           valeur, donc rien en aval ne change. */
        '<td><div class="grp-color-cell grp-cpick">' +
          '<button type="button" class="grp-cpick-btn" onclick="grpTogglePicker(this)">' +
            '<span class="grp-color-dot" data-dot="1"></span>' +
            '<span class="grp-cpick-label"></span>' +
            '<span class="grp-cpick-caret">▾</span>' +
          '</button>' +
          '<div class="grp-cpick-menu" hidden>' + colorItems + '</div>' +
          '<select class="grp-sel grp-f-color" onchange="grpSyncDot(this)" hidden>' + colorOpts + '</select>' +
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
        /* Les deux actions dans un conteneur EN LIGNE : sans lui, la cellule
           n'imposait aucune direction et les boutons s'empilaient l'un sous
           l'autre, débordant de la hauteur de leur propre ligne. */
        /* L'œil d'aperçu par ligne a été RETIRÉ : l'étape « Vérifier » montre
           désormais le rendu de chaque personne côte à côte, ce qui rend la
           vérification ligne par ligne inutile. grpPreviewRow() est conservée
           dans conf-group-preview.js — cet écran s'en sert. */
        '<td class="grp-c-act"><div class="grp-row-acts">' +
          // '<button type="button" class="grp-row-btn" title="Dupliquer" onclick="grpDupRow(this)">' +
          //   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
          // '</button>' +
          '<button type="button" class="grp-row-btn danger" title="Supprimer" onclick="grpDelRow(this)">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>' +
          '</button>' +
        '</div></td>';
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
      var cell = sel.closest('.grp-color-cell');
      var dot = cell.querySelector('.grp-color-dot');
      if (dot && opt) dot.style.background = opt.getAttribute('data-hex') || '#ccc';
      /* Le bouton de la liste maison affiche le nom sélectionné : sans cela il
         resterait vide, le <select> qui le portait étant masqué. */
      var lbl = cell.querySelector('.grp-cpick-label');
      if (lbl && opt) lbl.textContent = opt.value;
    }

    /* Ouvre/ferme la liste maison. Une seule ouverte à la fois : deux panneaux
       superposés se recouvriraient dans un tableau aux lignes serrées. */
    function grpTogglePicker(btn) {
      var menu = btn.parentNode.querySelector('.grp-cpick-menu');
      var ouvert = !menu.hidden;
      document.querySelectorAll('.grp-cpick-menu').forEach(function (m) { m.hidden = true; });
      if (ouvert) return;
      menu.hidden = false;

      /* Le panneau est en `position: fixed` (voir conf-styles.css) : il échappe
         aux deux conteneurs qui défilent, mais il faut donc le positionner
         nous-mêmes, en coordonnées écran.

         On mesure APRÈS l'avoir affiché — un élément `hidden` a une hauteur
         nulle, et le test de place disponible serait faussé. */
      var r = btn.getBoundingClientRect();
      menu.style.minWidth = r.width + 'px';
      menu.style.left = r.left + 'px';

      var h = menu.offsetHeight;
      var placeDessous = window.innerHeight - r.bottom;
      /* Bascule au-dessus du bouton quand le bas de l'écran est trop proche —
         sinon les dernières couleurs tombaient hors de la fenêtre. */
      if (placeDessous < h + 8 && r.top > h + 8) {
        menu.style.top = (r.top - h - 4) + 'px';
      } else {
        menu.style.top = (r.bottom + 4) + 'px';
      }
    }
    window.grpTogglePicker = grpTogglePicker;

    /* Applique le choix : écrit dans le <select> caché — qui reste la source de
       vérité pour grpVal(), l'import CSV et l'aperçu — puis déclenche `change`
       pour que les recalculs branchés dessus tournent comme avant. */
    function grpPickColor(item) {
      var cell = item.closest('.grp-color-cell');
      var sel = cell.querySelector('.grp-f-color');
      if (sel) {
        sel.value = item.getAttribute('data-val');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        grpSyncDot(sel);
      }
      cell.querySelectorAll('.grp-cpick-item').forEach(function (b) { b.classList.remove('on'); });
      item.classList.add('on');
      cell.querySelector('.grp-cpick-menu').hidden = true;
    }
    window.grpPickColor = grpPickColor;

    /* Clic hors d'un sélecteur : referme les panneaux ouverts. Sans cela, seul
       un second clic sur le bouton d'origine les fermait. */
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.grp-cpick')) return;
      document.querySelectorAll('.grp-cpick-menu').forEach(function (m) { m.hidden = true; });
    });

    /* Un panneau `fixed` ne suit PAS le défilement de son conteneur : il
       resterait figé à l'écran pendant que sa ligne s'éloigne. On le referme
       donc au défilement — `true` en 3e argument pour capter aussi celui des
       conteneurs internes, qui ne remonte pas jusqu'ici.

       MAIS on ignore le défilement DU PANNEAU LUI-MÊME : la liste a sa propre
       barre (max-height 260px), et sans cette exclusion elle se refermait dès
       qu'on tentait de la parcourir. */
    document.addEventListener('scroll', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('grp-cpick-menu')) return;
      document.querySelectorAll('.grp-cpick-menu').forEach(function (m) {
        if (!m.hidden) m.hidden = true;
      });
    }, true);

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

    /* Lecture DIRECTE du tableau à l'écran, sans passer par la liste validée.

       `groupOrderRows` n'est rempli qu'à la VALIDATION de la liste : à l'étape
       « Vérifier », il porte encore l'état précédent — ou rien du tout. Les
       cartes sortaient donc sans taille ni couleur, toutes au coloris affiché
       sur le canvas. L'écran de vérification doit refléter ce que le client
       vient de saisir, pas un état antérieur. */
    window.grpCollectRows = grpCollect;

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

    /* ZOOM MÉMORISÉ PAR PRODUIT.

       `zl` est une variable unique : rapprocher la vue sur le sweatshirt
       rapprochait aussi celle des deux t-shirts, alors que chaque produit a son
       propre cadrage. Même principe que les couleurs, déjà propres à chaque
       textile (applyColorForProduct).

       `zoomUserControlled` suit le même chemin : il dit que le client a réglé
       le zoom LUI-MÊME sur CE produit, et doit donc empêcher le zoom
       automatique à l'upload — sur ce produit seulement. Partagé, un réglage
       manuel sur le sweatshirt privait les t-shirts de leur rapprochement
       automatique.

       En mémoire uniquement : un cadrage de confort n'a pas à survivre à un
       rechargement, et n'a rien à faire dans le quota de session. */
    const ZOOM_PAR_PRODUIT = {};

    /** Mémorise le cadrage courant sous le produit qui l'affiche. */
    function memoriserZoom(produit) {
      if (!produit) return;
      ZOOM_PAR_PRODUIT[produit] = { zl: zl, userControlled: zoomUserControlled };
    }

    /** Repose le cadrage propre à un produit, ou le cadrage par défaut. */
    function restaurerZoom(produit) {
      var m = produit && ZOOM_PAR_PRODUIT[produit];
      zl = m ? m.zl : 100;
      zoomUserControlled = m ? m.userControlled : false;
      setZoomLabel(zl);
      applyZoom();
    }
    let currentColor = '#0a0a0a';
    let currentColorName = 'Black';
    let currentColorSlug = 'black';
    let currentProductKey = 'sweatshirt';
    // Type de produit courant (tous types : textile, drapeaux, coins, patches).
    let currentProductType = 'sweatshirt';
    window.currentProductType = currentProductType;   // lu par conf-overview.js

    /* Le bouton « Vue d'ensemble » restait MASQUÉ au premier chargement, et
       n'apparaissait qu'après un aller-retour vers un autre produit.

       Ordre d'exécution en cause : les scripts `defer` s'exécutent dans l'ordre
       du document, et conf-overview.js est chargé dans le <head> du layout
       (:731) tandis que CE fichier l'est dans le <body> de la section (:1081).
       conf-overview.js appelle donc refreshOverviewTab() (:139-143) AVANT que
       la ligne ci-dessus n'ait posé window.currentProductType : isTextile()
       lisait `undefined`, captureFn() renvoyait null, et le bouton était
       masqué. Un changement de produit le rétablissait, via le rappel de
       :1982 — d'où le symptôme « il apparaît si je vais sur un autre textile
       et je reviens ».

       On rejoue donc la décision maintenant que la variable existe. Garde
       `typeof` : ce fichier ne doit pas dépendre du chargement de l'autre. */
    if (typeof window.refreshOverviewTab === 'function') {
      window.refreshOverviewTab();
    }

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

    /**
     * Écrit le compte du panier et masque la pastille quand il est nul.
     *
     * Le bouton panier est désormais TOUJOURS visible : le client sait où
     * trouver son panier avant d'y avoir rien mis. La pastille, elle, n'a de
     * sens qu'à partir d'un article — un « 0 » permanent attirerait le regard
     * sur une information vide.
     *
     * Fonction unique parce que QUATRE endroits écrivent ce compte : les
     * laisser diverger finirait par produire une pastille « 0 » sur l'un des
     * chemins.
     *
     * @param {HTMLElement} el - la pastille
     * @param {number} n - nombre d'articles
     */
    function majPastillePanier(el, n) {
      if (!el) return;
      el.textContent = n;
      el.style.display = (Number(n) > 0) ? 'inline-flex' : 'none';
    }

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
          if (cartCountEl) majPastillePanier(cartCountEl, cartCount);
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
      /* Génération au moment du DÉPART. Cette restauration est différée de 200
         à 300 ms ; si le client change de mode dans cet intervalle, elle
         arriverait APRÈS le nettoyage et reposerait le design de l'ancien
         mode. On la laisse alors expirer. */
      var generationDepart = window.__genDesignMode || 0;

      var doRestore = function (textileDejaFait) {
        if ((window.__genDesignMode || 0) !== generationDepart) return;

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

      /* URL normalisées par absUrl() — voir sa définition plus bas (:1885).

         Les dictionnaires ci-dessus viennent du filtre Liquid `asset_url`, qui
         produit des URL PROTOCOLE-RELATIVES : `//massacre-officiel.com/cdn/…`.
         Le canvas s'en accommode (il fait `imgEl.src = url`, que le navigateur
         résout tout seul), mais tout consommateur qui construit du HTML passe
         par safeImgSrc() — dont la liste blanche rejetait cette forme. L'aperçu
         d'une ligne de commande de groupe (conf-group-preview.js:113) recevait
         donc une chaîne vide : le vêtement n'apparaissait pas, alors que le
         logo et le texte (des data-URL) s'affichaient.

         currentProductImageURL() normalisait déjà de cette façon (:1919) ;
         c'est cette asymétrie entre les deux résolveurs d'URL qu'on supprime
         ici. */
      const list = [];
      const enUrl = urls[prefix + '-' + slug + '-' + view];
      if (enUrl) list.push(absUrl(enUrl));

      const frSlug = legacyMap[slug];
      if (frSlug) {
        const frUrl = legacyUrls[prefix + '-' + frSlug + '-' + view];
        if (frUrl) list.push(absUrl(frUrl));
      }
      if (fallbacks[view]) list.push(absUrl(fallbacks[view]));
      return list;
    }

    /* Exposés pour l aperçu de ligne de groupe (conf-group-preview.js), qui vit
       dans un autre fichier et n a donc pas accès à ces `const` locaux.

       Sans ces trois lignes, grpPreviewRow() ne pouvait résoudre ni le slug de
       couleur ni le préfixe produit : candidates restait vide, l aperçu se
       rabattait sur l image du canvas (#view-face) et affichait « la teinte n a
       pas d image dédiée » — alors que le fichier existe bel et bien
       (sweatshirt-sand-face.png, par exemple). */
    window.COLOR_SLUGS = COLOR_SLUGS;
    window.PRODUCT_SLUGS = PRODUCT_SLUGS;
    window.colorImageCandidates = colorImageCandidates;
    /* absUrl : exportée pour les assets qui construisent du HTML à partir d'une
       URL Shopify (vignettes du récap drapeau/coin, aperçu de groupe). Elle
       était restée locale, alors que colorImageCandidates juste au-dessus était
       déjà exposée — d'où des URL `//…` transmises telles quelles à
       safeImgSrc(), qui les rejetait. */
    window.absUrl = absUrl;

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
       DOS_H_MAX_PCT = hauteur imprimable, en % du visuel. Descendue par
                      étapes : 46 % valait 34,8 cm, 39.6 % encore 30,0 cm.
                      34.3 % = 26,0 cm, la surface réellement floquée.
       DOS_TOP_PCT passé de 22 % à 25 % dans le même mouvement : la zone
       démarrait sur la couture d'épaule. Le sweat ajoute +4 (voir buildZones),
       son bras étant plus bas — elle y commence donc à 29 %. */
    const DOS_TOP_PCT   = 25;
    /* 30.3 % = 23,0 cm (facteur 1,3192 %/cm, calé sur l'ancien repère
       34,3 % = 26,0 cm). Réduite pour l'aspect visuel : le rectangle occupait
       une part du dos que le rendu faisait paraître excessive. La surface
       floquable proposée au client baisse donc de 26 à 23 cm de haut. */
    const DOS_H_MAX_PCT = 30.3;
    /* Largeur imprimable du dos, en % du visuel. Ramenée de 22 % à 17 % :
       22 % valait 38,9 cm sur le sweat, très au-delà de la contrainte atelier
       « L30 max » rappelée plus bas — la zone frôlait les coutures latérales.
       17 % = 30,0 cm (17 / (30.0/53)), soit la limite atelier exactement.
       La zone reste centrée sans autre réglage : `left` est calculé en
       49.8 - dosW / 2 (voir buildZones). */
    /* 15.3 % = 27,0 cm (facteur 0,5667 %/cm, calé sur l'ancien repère
       17 % = 30,0 cm). Même motif que la hauteur ci-dessus : la zone paraissait
       trop large à l'écran, elle s'écarte maintenant davantage des coutures
       latérales. La largeur floquable passe donc de 30 à 27 cm. */
    const DOS_W_PCT     = 15.3;

    /* Zone de flocage d'une MANCHE (vue de côté), en % du visuel et PAR PRODUIT :
       les silhouettes diffèrent, une valeur unique tombait juste sur le sweat et
       à côté sur les t-shirts. Calée sur le rendu, comme le dos. */
    /* Zone de manche : 9 cm de large, hauteur SELON LE PRODUIT, convertie avec
       le facteur propre à chaque silhouette (CM.<produit>, % de cadre par cm) :
         largeur  9 cm -> 5.1 %   (était 9 %, soit 15,9 cm — bien trop large
                                   pour un logo de manche)
         hauteur  8 cm -> 10.6 %  (était 29 % sur le sweat, soit 22,0 cm : la
                                   zone descendait jusqu'au poignet ; sur les
                                   t-shirts elle passait sous l'emmanchure)

       `left` est RECALCULÉ, pas conservé : rétrécir la largeur sans toucher au
       bord gauche aurait décalé la zone vers l'intérieur du bras. On garde le
       centre d'origine (sweat 51 %, t-shirt 52 %) et on en déduit le bord.

       Ne PAS réutiliser une valeur d'un produit sur l'autre : les facteurs
       diffèrent légèrement, et le résultat ne ferait plus la même taille. */
    const SLEEVE = {
      /* Sweat : zone haute, calée sous la couture d'épaule.
         `left` avancé de 48.5 à 49.5 (+1 %, soit ~1 cm sur le rendu) le
         14/08/2026 : sur le visuel de profil du sweat, le rectangle tombait
         trop à gauche par rapport au haut du bras.
         La manche DROITE suit automatiquement — elle est dérivée en miroir
         (`100 - left - w`, voir LOGO_ZONES.'sr' plus bas) : il n'y a qu'une
         valeur à régler pour les deux côtés. */
      sweat:  { left: 49.5, top: 34, w: 5.1, h: 10.6 },
      /* T-shirt COTON : manche courte, la zone s'arrête avant l'ourlet.
         `left` reculé en deux fois (49.5 -> 48.7 -> 47.9, soit ~2,8 cm) : sur
         cette silhouette, le rectangle mordait le bord droit de la manche. */
      tshirt: { left: 47.9, top: 29, w: 5.1, h: 10.6 },
      /* T-shirt POLYESTER : entrée DISTINCTE du coton. Les deux partageaient la
         même zone, si bien qu'un réglage fait sur le coton déplaçait aussi le
         polyester — alors que leurs visuels n'ont pas le même cadrage de manche.
         `left` reste à 49.5 (position d'origine, centrée sur ce visuel) : c'est
         le coton qui a reculé à 47.9, pas le polyester qui a avancé. */
      tshirt_polyester: { left: 49.5, top: 29, w: 5.1, h: 10.6 },
    };

    /* Contraintes atelier (en cm) :
         Dos     : L30 x H30 max
         Cœur    : 8 cm (logo rond/autre) — le pseudo monte à 12 cm, mais la
                   zone reste à 8 : au-delà, le placement n'est plus « cœur ».
         Manches : zone 9 x 8 cm (voir SLEEVE ci-dessus, converti par produit).
       Positions (left/top) relevées sur les visuels de référence de l'atelier. */
    /* @param isSweat  sweat à capuche : bras plus bas et plus en arrière qu'un
                       t-shirt, d'où une zone de manche distincte (voir SLEEVE). */
    /* @param productType  clé exacte du produit ('sweatshirt', 'tshirt',
                           'tshirt_polyester'). `isSweat` ne suffit plus : les
                           deux t-shirts ont des cadrages de manche distincts,
                           et sans ce paramètre un réglage fait sur le coton
                           déplaçait aussi le polyester. */
    function buildZones(cm, isSweat, productType) {
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
         épaules.

         Sa hauteur n'est PLUS réduite en contrepartie : le retrait de 4 points
         lui donnait 22,9 cm contre 25,9 cm aux t-shirts, alors que la zone dos
         doit faire la même taille sur les trois textiles. Le bord inférieur
         descend donc de 4 points — il reste au-dessus de l'ourlet (63,3 %). */
      var dosTop = DOS_TOP_PCT;
      if (isSweat) { dosTop += 4; }
      /* Zone de manche du produit courant (silhouettes différentes).
         Lecture par clé exacte, avec repli sur `tshirt` : un type inconnu
         garde l'ancien comportement plutôt que de casser le rendu. */
      var SLV = isSweat ? SLEEVE.sweat : (SLEEVE[productType] || SLEEVE.tshirt);
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
    var LOGO_ZONES = buildZones(CM.sweatshirt, true, 'sweatshirt');
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
    /* Exposée : conf-mobile.js la rappelle au retour d'une largeur mobile vers
       le bureau. applyMobileZones écrase les propriétés de LOGO_ZONES — l'objet
       partagé — et rien ne les rétablissait, cette fonction n'étant appelée
       qu'au changement de produit. */
    window.applyZonesForProduct = applyZonesForProduct;

    function applyZonesForProduct(productType) {
      var isSweat = String(productType || '').indexOf('sweat') === 0;
      LOGO_ZONES = buildZones(isSweat ? CM.sweatshirt : CM.tshirt, isSweat, productType);
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
    /* Exposée : conf-mobile.js et conf-tablet.js s'en servent dans reflowLogos()
       à la place de placeLogoInZone().

       La différence est décisive. clampLogoToZone LIT la position et la taille
       courantes (:1650, :1688-1689) et se contente de les BORNER à la zone :
       elle est idempotente, exactement comme clampTextToZone pour les textes.
       placeLogoInZone, elle, les IGNORE et les recalcule depuis `startW` /
       `startLeft` — la rejouer après un geste annulait le déplacement ET le
       redimensionnement, puis persistait cette géométrie de départ.

       placeLogoInZone garde son rôle : le PREMIER placement, à l'upload. */
    window.clampLogoToZone = clampLogoToZone;

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
      /* DESIGN EN COUVERTURE : on affiche l'image DÉJÀ ROGNÉE.

         Les styles inline lus plus haut (left/top/width) décrivent la boîte du
         logo, pas ce qui est réellement VISIBLE : en couverture, `object-fit:
         cover` rogne l'image dans cette boîte et `.flag-crop` coupe le
         débordement. Reproduire ici la boîte avec `object-fit: contain`
         affichait donc l'image entière, réduite et décalée — c'est ce que
         montrait la vignette du récapitulatif alors que le canvas était juste.

         `flagCoverDataUrl` (conf-flag-cover.js) produit exactement le rendu de
         l'écran ; elle sert déjà à la vignette du panier et à la vue
         d'ensemble. On la réutilise pour que les trois affichages découlent
         d'une source unique — c'est ce qui les empêche de diverger à nouveau.

         Elle est calée sur la ZONE IMPRIMABLE (.flag-crop), en retrait des
         bords du drapeau : on la positionne donc sur ce cadre, mesuré à
         l'écran, et non en plein cadre. */
      var aplatiRecap = (typeof window.flagCoverDataUrl === 'function')
        ? window.flagCoverDataUrl('recto') : '';

      /* IMAGE PAS ENCORE DÉCODÉE : on rejouera.

         flagCoverDataUrl sort à vide tant que `naturalWidth` vaut 0, ce qui est
         le cas au moment même de l'upload — updateFlagRecapThumb est appelée
         depuis conf-share.js dès que le `src` est posé, avant le décodage. La
         vignette restait alors figée sur son repli, celui qui déborde, jusqu'au
         prochain geste sur le design.

         On s'abonne donc au chargement pour reconstruire une fois la mesure
         possible. `once` : l'écouteur ne doit pas s'accumuler à chaque upload. */
      if (!aplatiRecap && logoImg && !logoImg.naturalWidth) {
        logoImg.addEventListener('load', function () {
          if (typeof window.updateFlagRecapThumb === 'function') {
            window.updateFlagRecapThumb();
          }
        }, { once: true });
      }

      if (aplatiRecap) {
        var cropRecap = logoEl ? logoEl.closest('.flag-crop') : null;
        var bRecap = baseRecto ? baseRecto.getBoundingClientRect() : null;
        var cRecap = cropRecap ? cropRecap.getBoundingClientRect() : null;
        var l2 = left, t2 = top, w2 = width;
        if (bRecap && cRecap && bRecap.width > 0 && bRecap.height > 0) {
          l2 = (cRecap.left - bRecap.left) / bRecap.width * 100;
          t2 = (cRecap.top - bRecap.top) / bRecap.height * 100;
          w2 = cRecap.width / bRecap.width * 100;
        }
        html += '<img src="' + safeImgSrc(aplatiRecap) + '" alt="" style="position:absolute;left:' +
                l2 + '%;top:' + t2 + '%;width:' + w2 +
                '%;height:auto;pointer-events:none;z-index:2;">';
      } else if (logoSrc) {
        /* REPLI (image pas encore décodée, ou aplatissement impossible).

           En mode COUVERTURE, on reproduit le rendu de l'écran plutôt que la
           boîte du logo : une hauteur explicite et `object-fit: cover`, dans un
           conteneur qui rogne. Sans cela, `height: auto` laissait l'image
           prendre sa hauteur naturelle — bien plus grande que le drapeau — et
           elle débordait au-dessus et en dessous.

           Les dimensions viennent du cadre imprimable mesuré à l'écran, comme
           pour le chemin principal. */
        var enCouverture = logoEl && logoEl.classList.contains('is-cover');
        if (enCouverture) {
          var cropR = logoEl.closest('.flag-crop');
          var bR = baseRecto ? baseRecto.getBoundingClientRect() : null;
          var cR = cropR ? cropR.getBoundingClientRect() : null;
          var l3 = left, t3 = top, w3 = width, h3 = 0;
          if (bR && cR && bR.width > 0 && bR.height > 0) {
            l3 = (cR.left - bR.left) / bR.width * 100;
            t3 = (cR.top - bR.top) / bR.height * 100;
            w3 = cR.width / bR.width * 100;
            h3 = cR.height / bR.height * 100;
          }
          html += '<div style="position:absolute;left:' + l3 + '%;top:' + t3 + '%;width:' + w3 +
                  '%;' + (h3 ? 'height:' + h3 + '%;' : '') +
                  'overflow:hidden;pointer-events:none;z-index:2;">' +
                  '<img src="' + logoSrc + '" alt="" style="width:100%;height:100%;' +
                  'object-fit:cover;display:block;"></div>';
        } else {
          html += '<img src="' + logoSrc + '" alt="" style="position:absolute;left:' + left + '%;top:' + top +
                  '%;width:' + width + '%;height:auto;object-fit:contain;pointer-events:none;z-index:2;">';
        }
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

      /* L'IMAGE EST POSÉE EN PROPRIÉTÉ, JAMAIS DANS DU BALISAGE.

         Elle était interpolée dans une chaîne HTML confiée à `innerHTML`. Or
         `logoSrc` est une data-URL COMPLÈTE — plusieurs mégaoctets. Le parseur
         du navigateur devait analyser un attribut de plusieurs millions de
         caractères, et son tokenizer récursif épuisait la pile :
         « Maximum call stack size exceeded ».

         Pire, cette exception remontait la chaîne de promesses et tombait dans
         le `.catch` de l'envoi Cloudinary (:5511), qui l'attribuait au réseau —
         « Upload Cloudinary échoué ». L'URL hébergée n'était donc jamais
         mémorisée, et le design du patch disparaissait au changement de
         produit.

         Affecter `src` en PROPRIÉTÉ contourne entièrement le parseur : aucune
         limite de longueur, aucun coût d'analyse. C'est aussi pourquoi
         `safeImgSrc` n'a plus lieu d'être ici — sans interpolation dans du
         balisage, il n'y a plus de surface d'injection à couvrir. */
      thumb.innerHTML = '';
      var body = document.createElement('div');
      body.className = 'patch-body';
      if (logoSrc) {
        var im = document.createElement('img');
        im.alt = '';
        im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
                           'object-fit:cover;pointer-events:none;';
        im.src = logoImg.getAttribute('src');
        body.appendChild(im);
      }
      thumb.appendChild(body);
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

      /* Le cadrage de l'ANCIEN produit est mis de côté AVANT la bascule —
         `currentProductType` va changer à la ligne suivante, et il désigne
         encore ici le produit qu'on quitte. Le nouveau est reposé plus bas,
         une fois le canvas en place. */
      var produitQuitte = currentProductType;
      if (productType && productType !== produitQuitte) memoriserZoom(produitQuitte);

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

      /* Éviction PRÉVENTIVE des designs devenus inutiles.

         `byProduct` n'était jamais purgé : un client qui essayait sweatshirt →
         t-shirt → polyester → patch → coin accumulait cinq designs en session.
         Le seul mécanisme d'éviction (writeUploadStore) est RÉACTIF — il se
         déclenche après le dépassement de quota, et échoue précisément quand un
         seul produit sature déjà.

         On garde le produit courant ET le précédent : un aller-retour entre
         deux textiles pour comparer est un geste courant, perdre le design en
         chemin serait brutal. Au-delà, le client a changé d'avis.

         `elaguerUploads` est défini plus bas ; garde `typeof` car selProd peut
         s'exécuter avant lui au tout premier rendu. */
      if (typeof elaguerUploads === 'function') elaguerUploads(productType);

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

      /* Les vignettes de l'écran de choix ne suivent PLUS le produit.

         Elles montrent le RÉSULTAT de chaque mode — un logo sur la poitrine,
         un surnom floqué. Y substituer l'image du produit sélectionné les
         remplaçait par deux vêtements nus, identiques : la différence entre
         les deux modes disparaissait, et l'illustration soignée aussi. */

      /* La barre de mode suit le produit : sa contrainte ne vaut que pour les
         coins, drapeaux et patchs. Reprendre un textile la lève.

         DIFFÉRÉ : les canvas des coins, drapeaux et patchs sont reconstruits
         après ce point (conf-dynamic-layout.js). Appelée trop tôt, la barre
         serait recréée puis emportée par cette reconstruction. */
      if (typeof window.majBarreMode === 'function') {
        setTimeout(window.majBarreMode, 350);
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

        /* Zones REJOUÉES après la restauration.

           applyZonesForProduct() a déjà tourné plus haut (:2021), mais à ce
           moment-là le DOM portait encore les textes de l'ANCIEN produit :
           clampTextToZone les bornait donc contre les zones du NOUVEAU. Comme
           les zones diffèrent d'un textile à l'autre (CHEST.top vaut 34 sur
           sweat, 31 sur t-shirt), les positions étaient rabattues — et les
           zones de poitrine gauche et droite partageant le même rectangle,
           texte et logo s'effondraient sur la même borne, ce qui donnait
           l'impression qu'ils échangeaient leur place.

           On ne DÉPLACE pas l'appel de :2021 : les logos en dépendent avant
           leur propre restauration. On le rejoue, maintenant que le DOM porte
           bien les éléments du produit courant. */
        if (typeof applyZonesForProduct === 'function') applyZonesForProduct(productType);

        // Recalcule le prix affiché pour le TEXTILE choisi : sans cela, le prix
        // restait figé sur celui du produit affiché au chargement de la page
        // (sweat 60 € gardé sur les t-shirts, ou inversement). Limité aux
        // textiles : coins/drapeaux ont leur propre affichage de prix.
        if (typeof updateTotalPrice === 'function') updateTotalPrice();

        /* Les tailles diffèrent d'un textile à l'autre et la grille vient
           d'être reconstruite : le sélecteur du récapitulatif se repeuple,
           sinon il proposerait celles du produit précédent. */
        if (typeof window.syncSelectTaille === 'function') window.syncSelectTaille();
      }

      /* CADRAGE PROPRE AU NOUVEAU PRODUIT.

         Hors du bloc textile ci-dessus : coins, drapeaux et patchs ont eux
         aussi leur cadrage, et `applyZoom` les couvre déjà (:5101).

         Différé : applyZoom écrit un `transform` sur des éléments du canvas,
         que conf-dynamic-layout.js réinjecte pour les produits non textiles.
         Appliqué trop tôt, le style partirait avec l'ancien DOM. Le rendez-vous
         est posé après la reconstruction (250 ms) et sa restauration. */
      if (productType && productType !== produitQuitte) {
        setTimeout(function () { restaurerZoom(productType); }, 300);
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

        /* LE BOUTON DU PARCOURS GROUPE aussi. C'est lui que le client vient de
           cliquer à l'étape « Vérifier » — le bouton du récapitulatif est
           masqué à ce moment. Sans cette ligne, rien ne signalait le travail en
           cours là où il regardait, et il pouvait recliquer. */
        var lockGrp = document.getElementById('grp-actions-btn');
        var grpEtaitDesactive = lockGrp ? lockGrp.disabled : false;
        if (lockGrp) lockGrp.disabled = true;

        /* DURÉE MINIMALE d'affichage de l'état d'attente. Un ajout servi par le
           cache se termine en quelques dizaines de millisecondes : l'animation
           n'apparaîtrait qu'en un éclair, plus déroutant que rassurant. */
        var debutAjout = Date.now();

        try {
          return await fn.apply(this, arguments);
        } catch (err) {
          /* ÉCHEC RENDU VISIBLE.

             Sans ce filet, une exception pendant l'ajout — composition d'une
             vignette, envoi Cloudinary, quota de session — remontait dans le
             vide : le bouton se réactivait et le client voyait un clic SANS
             AUCUN EFFET, au terme de son parcours. Il ne pouvait ni comprendre
             ni contourner.

             On trace pour le diagnostic, et on le dit au client. */
          console.error('Ajout au panier échoué :', err);
          if (typeof confAlert === 'function') {
            confAlert("L'ajout au panier a échoué. Réessayez ; si le problème persiste, rechargez la page.",
                      { icon: 'warning', title: 'Ajout impossible' });
          }
        } finally {
          var ecoule = Date.now() - debutAjout;
          if (ecoule < 420) {
            await new Promise(function (r) { setTimeout(r, 420 - ecoule); });
          }
          cartAddBusy = false;
          /* On ne réactive que si NOUS avons désactivé : sinon on annulerait
             une désactivation légitime posée entre-temps (bouton masqué parce
             que le panier bascule en devis, par exemple). */
          if (lockBtn && !wasDisabled) lockBtn.disabled = false;
          /* Même règle pour le bouton du parcours : on ne réactive que si NOUS
             l'avons désactivé. Sans cette remise en état, il resterait bloqué
             après un ajout — le client ne pourrait plus rien commander. */
          if (lockGrp && !grpEtaitDesactive) lockGrp.disabled = false;
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

        /* CANVAS RENDU MESURABLE LE TEMPS DE LA COMPOSITION.

           L'ajout part de l'étape « Vérifier », où le produit a cédé la place
           aux cartes : `.cv-wrap` y est en `display: none`. Or la composition
           des vignettes MESURE le canvas — sur un élément masqué, elle
           retombait sur les pourcentages bruts du calque et les logos
           sortaient deux à trois fois trop petits dans le panier.

           Même correctif que l'entrée dans l'étape « Vérifier » : on retire
           l'attribut d'étape, et on rend le canvas invisible SANS le
           démesurer — `visibility` ne le retire pas du flux, contrairement à
           `display`. Rien ne clignote, les dimensions redeviennent lisibles. */
        const rootAdd = document.querySelector('.conf-app-root');
        const etapeAdd = rootAdd ? rootAdd.getAttribute('data-etape-groupe') : null;
        const wrapAdd = document.querySelector('.cv-wrap');
        const visAdd = wrapAdd ? wrapAdd.style.visibility : '';
        const opaAdd = wrapAdd ? wrapAdd.style.opacity : '';

        if (rootAdd) rootAdd.removeAttribute('data-etape-groupe');
        if (wrapAdd) {
          wrapAdd.style.visibility = 'hidden';
          wrapAdd.style.opacity = '0';
        }

        /* Rétabli DANS TOUS LES CAS, y compris si une composition échoue :
           laisser le canvas révélé afficherait le vêtement par-dessus les
           cartes. */
        const rendreEtape = function () {
          if (wrapAdd) {
            wrapAdd.style.visibility = visAdd;
            wrapAdd.style.opacity = opaAdd;
          }
          if (rootAdd && etapeAdd) rootAdd.setAttribute('data-etape-groupe', etapeAdd);
        };

        /* VIGNETTE PAR COULEUR.
           Chaque ligne recevait `design.thumb`, composée une seule fois sur
           `fallbackSrc` — donc sur la couleur AFFICHÉE À L'ÉCRAN. Le panier
           montrait ainsi trois articles « Gold », « Millennial Lilac » et
           « Fire Red » avec la même vignette turquoise : le libellé était bon,
           l'image non.

           On recompose donc le design sur l'image de CHAQUE couleur. Les
           couleurs identiques sont mutualisées (Map) : une liste de 20 personnes
           en 3 teintes ne déclenche que 3 compositions, pas 20. */
        /* Le SURNOM entre aussi dans le visuel, pas seulement la couleur.

           Les planches envoyées à l'atelier portaient le texte du CANVAS pour
           toutes les lignes : le nom de chaque personne ne circulait qu'à côté,
           en propriété « Personne ». L'atelier devait croiser les deux — source
           d'erreur de production. On incruste donc le bon surnom dans chaque
           visuel.

           La zone substituée est celle CHOISIE par le client quand plusieurs
           textes coexistent (sélecteur de la modale, conf-group-textzone.js) ;
           les autres textes restent identiques pour tout le monde. */
        /* La zone de texte n'est plus lue ici : la vignette étant mutualisée
           par couleur, aucun surnom n'y est incrusté. Les variables de
           substitution et de restauration ont disparu avec elle. */

        /* ═══ CLÉ = LA COULEUR SEULE ═══════════════════════════════════════

           Elle valait auparavant « couleur + surnom », pour incruster le nom de
           chaque personne dans sa vignette. Mais un surnom est UNIQUE par
           ligne : deux personnes ne partageaient donc jamais la même clé, et la
           mutualisation annoncée ne jouait JAMAIS.

           Chaque composition coûte DEUX requêtes serveur enchaînées — l'aperçu
           puis la planche multi-vues. Trente personnes déclenchaient soixante
           allers-retours en série : plusieurs dizaines de secondes, onglet figé.
           Avec la couleur seule, trois teintes ne coûtent que trois
           compositions, quel que soit l'effectif.

           CE QUE LA VIGNETTE PERD : le surnom incrusté dans l'image. Il reste
           affiché en toutes lettres sur chaque ligne du panier et du
           récapitulatif, et part en commande comme propriété « Personne »
           (recapitulatif.liquid:988) — INDÉPENDAMMENT de l'image. C'est cela
           que l'atelier lit pour floquer ; le visuel ne fait que l'illustrer.

           Clé construite ICI et NULLE PART AILLEURS : l'expression était
           autrefois dupliquée entre le remplissage et la lecture, et les deux
           ont divergé sur un caractère invisible — chaque ligne retombait alors
           sur la couleur affichée à l'écran. Une fonction unique rend cette
           divergence impossible. */
        const vignettes = new Map();
        const cleVignette = (r) => r.color || '';

        /* `try/finally` : le canvas doit retrouver son état MÊME si une
           composition échoue. Sans lui, une exception laisserait le vêtement
           révélé par-dessus les cartes de vérification. */
        try {
        for (const r of rows) {
          const cle = cleVignette(r);
          if (vignettes.has(cle)) continue;

          /* Même résolution que le canvas : slug EN, puis FR, puis générique.
             On passe par les candidats plutôt que de deviner un nom de fichier,
             pour hériter des replis quand une teinte n'a pas d'image dédiée. */
          const slug = COLOR_SLUGS[r.color] || '';
          const cand = colorImageCandidates(PRODUCT_SLUGS[currentProductKey], slug, 'face');
          const base = cand[0] || fallbackSrc;

          /* Plus de substitution du surnom avant la capture : la vignette est
             désormais mutualisée par couleur, elle ne porte donc plus de nom.
             Cela retire aussi un reflow forcé par personne — le texte était
             réécrit puis re-mesuré à chaque tour. */

          /* `btnEl` seulement au premier appel : il sert à afficher
             « Préparation du design… » sur le bouton. Le passer à chaque tour
             ferait clignoter le libellé. */
          const dz = await resolveDesignImage(base, vignettes.size === 0 ? btnEl : null);
          vignettes.set(cle, dz);
        }

        } finally {
          /* Les mesures sont faites : l'étape reprend sa place, succès ou
             échec. */
          rendreEtape();
        }

        /* Plus de restauration à faire : la boucle ne touche plus au texte du
           canvas, puisqu'elle n'y substitue plus de surnom. */

        /* ÉTAT DU DESIGN CAPTURÉ UNE SEULE FOIS.

           Il ne varie pas d'une ligne à l'autre — les personnes d'un groupe
           partagent le même design. L'appeler par personne était présenté comme
           « peu coûteux », mais la fonction enchaîne sept lectures de session et
           parcourt dix zones du DOM ; et pushToCart la rappelle une seconde
           fois par ligne, en mode complet cette fois. */
        const designCommun = (typeof capturerEtatDesign === 'function')
          ? capturerEtatDesign() : null;

        rows.forEach(function (r, idx) {
          /* Repli sur `design` si la composition a échoué : mieux vaut la
             vignette de l'écran qu'une case vide. `cleVignette` garantit que
             lecture et écriture ne peuvent plus diverger — c'est exactement ce
             qui s'était produit (voir le commentaire du remplissage). */
          const dz = vignettes.get(cleVignette(r)) || design;
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
            img: dz.thumb,        // vignette à LA couleur de cette ligne
            sheet: dz.sheet,
            assets: logoAssets.concat(textAssets),
            /* Même état complet que pour un ajout unitaire, capturé une seule
               fois au-dessus : les lignes de groupe partagent un design commun,
               chacune doit pouvoir le rouvrir. */
            design: designCommun,
            sleeveCount: sleeves,
            qty: r.qty,
            _sizeGroupSummary: r._sizeGroupSummary  // 🆕 Transmet le résumé groupe
            /* `true` : écriture en session et rendu du tiroir DIFFÉRÉS. Ils
               sont faits une fois après la boucle, au lieu d'une fois par
               personne. */
          }, idx === rows.length - 1 ? btnEl : null, false, true);
        });

        /* L'écriture et le rendu, une seule fois pour toute la liste. */
        window.persistCartSafe(cartItems);
        renderCartDrawer();
        openCartDrawer();
        // Consommée : un second clic ne redupliquerait pas la liste.
        groupOrderRows = null;
        saveGroupRows();        // efface aussi la copie en session
        refreshGroupBadge();

        /* RETOUR À L'ÉCRAN DE CHOIX — le parcours de groupe est terminé.

           Rester sur « Vérifier » laissait le client devant des cartes dont la
           commande venait de partir : rien à y faire, et le bouton d'ajout
           invitait à recommencer.

           Le DESIGN COMMUN est conservé : seule la liste de personnes est
           vidée. Enchaîner une seconde commande avec le même visuel est le cas
           courant — un club qui commande pour deux équipes.

           Différé : le tiroir du panier s'ouvre juste après l'ajout, et le
           client doit voir ce qu'il vient de commander avant que l'écran ne
           change. */
        setTimeout(function () {
          if (typeof retourChoixMode === 'function') retourChoixMode();
        }, 1200);
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
        /* ÉTAT COMPLET du design, pour pouvoir le rouvrir plus tard.

           `assets` ne porte qu'un libellé et une URL : de quoi imprimer, pas de
           quoi rééditer — ni zone technique, ni position, ni taille, ni police.
           La ligne de panier s'appuyait donc sur `conf_uploads` / `conf_texts`,
           la mémoire de TRAVAIL du canvas. Supprimer un logo (removeUpload fait
           `delete u[zone]`), réinitialiser ou changer de produit effaçait cette
           source, et l'article ne pouvait plus être rouvert : seule la couleur
           revenait.

           On mémorise donc l'état ici, à l'ajout — la ligne devient autonome.
           Même structure que le lien de partage (capturerEtatDesign), dont la
           restauration est le seul chemin réellement éprouvé.

           Le poids reste tenable depuis que les images sont persistées sous
           forme d'URL Cloudinary : quelques dizaines d'octets par zone au lieu
           de plusieurs mégaoctets. Sans ce préalable, ce champ aurait ramené la
           saturation de session. */
        design: (typeof capturerEtatDesign === 'function') ? capturerEtatDesign() : null,
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

      /* Rendu délégué à window.rasteriserTexte (conf-share.js) : cette fonction
         portait une copie ligne à ligne du rasterizer de textZoneImage. Les
         deux ont désormais une source unique — sans quoi une évolution appliquée
         d'un seul côté ferait diverger la vignette du panier et le fichier
         envoyé à l'atelier, un écart invisible jusqu'à la production.

         Garde `typeof` : ce fichier ne doit pas dépendre du chargement de
         l'autre. conf-share.js est chargé avant (layout:684), mais un repli
         silencieux vaut mieux qu'une exception dans l'ajout au panier. */
      if (typeof window.rasteriserTexte !== 'function') return '';
      return window.rasteriserTexte(el);
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
        faceDesign = await captureFaceDesign();
        // Coins / drapeaux / patchs n'ont pas de « vue de face » : pour eux, la
        // vue courante EST le design. Le repli reste donc légitime.
        if (!isTextile &&
            (!faceDesign || !faceDesign.logos || !faceDesign.logos.length)) {
          const fb = captureCurrentDesign();
          if (fb && fb.logos && fb.logos.length) faceDesign = fb;
        }
      } catch (e) {
        /* Ce `catch` était MUET. Il avale une erreur qui vide entièrement la
           vignette du panier — le client repart avec un vêtement nu, sans que
           rien ne le signale, ni à lui ni au développeur. C'est ce silence qui
           a rendu une régression invisible pendant plusieurs itérations. */
        console.warn('Capture du design de face échouée : la vignette du panier ' +
                     'sera celle du vêtement nu.', e);
        faceDesign = null;
      }

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

       `replaceQty` est CONSERVÉ pour ne pas casser ses appelants, mais il n'a
       plus d'effet : il opposait les produits dont la quantité est saisie
       avant l'ajout (coins, patchs, drapeaux) aux textiles, qui cumulaient
       +1 par ajout. Le cumul a disparu avec la fusion des lignes — un même
       produit ré-ajouté met à jour sa ligne — et tous suivent désormais la
       quantité affichée dans le panneau. */
    /* Valeur NUE d'un libellé d'option, pour comparer deux lignes de panier.

       Couleur et taille sont stockées tantôt nues (« Black »), tantôt préfixées
       (« Couleur : Black ») selon le chemin d'ajout — commande de groupe ou
       ajout unitaire. Sans normalisation, deux ajouts identiques passant par
       des chemins différents ne fusionneraient pas.

       Même règle que applyColor() / applySize() dans conf-cart-open-design.js,
       qui dépouillent ce préfixe pour retrouver la pastille correspondante.
       La casse est ignorée : les libellés viennent de sources hétérogènes
       (métadonnées produit, CSV importé). */
    function valOption(v) {
      var s = String(v == null ? '' : v).trim();

      /* DESCRIPTION COMPLÈTE : on la garde ENTIÈRE.

         Les non-textiles rangent toute leur description dans ce champ (:3125) :
           « Type : Recto verso · Couleur : Rouge · … · Finition : 2 anneaux »

         Le dépouillement ci-dessous est GLOUTON — `.*` consomme jusqu'au
         DERNIER deux-points. Il renvoyait donc « 2 anneaux » pour un drapeau
         rouge comme pour un bleu : les deux avaient la même clé de fusion, et
         le second ÉCRASAIT le premier. Le client croyait commander deux
         drapeaux, il en payait un seul, sans le moindre signal.

         Coins et patchs y échappaient par hasard : leur champ discriminant
         — Type, Finition — se trouve être le dernier de la liste. Un champ
         ajouté après lui aurait cassé leur fusion à son tour.

         Une description à plusieurs champs est déjà normalisée : elle vient du
         récapitulatif, jamais d'une saisie libre. La comparer telle quelle
         distingue donc TOUTE différence — couleur, taille, finition — pour les
         trois familles, sans dépendre de l'ordre des champs.

         Le séparateur « · » signe ce format : il ne peut pas apparaître dans un
         simple libellé de couleur ou de taille. */
      if (s.indexOf('·') !== -1) return s.toLowerCase();

      /* Libellé SIMPLE — « Couleur : Black » ou « Black ». Un seul préfixe à
         retirer, et le dépouillement est ici sans danger : sans séparateur, il
         n'y a qu'un deux-points. */
      return s.replace(/^[^:·]*:\s*/, '').trim().toLowerCase();
    }

    /**
     * Ajoute une ligne au panier.
     *
     * @param {Object} item
     * @param {HTMLElement} [btnEl] - bouton à animer (« Ajouté ! »)
     * @param {boolean} [replaceQty]
     * @param {boolean} [differer] - n'ÉCRIT PAS la session et NE REDESSINE PAS
     *   le tiroir. Réservé aux ajouts en série (commande de groupe) :
     *   l'appelant s'en charge une fois la boucle terminée.
     *
     *   Sans lui, une liste de trente personnes déclenchait trente écritures —
     *   dont la dernière sérialise trente lignes, un coût quadratique — et
     *   trente reconstructions du tiroir pour un résultat identique. C'est
     *   aussi ce qui faisait clignoter l'écran pendant tout l'ajout.
     */
    function pushToCart(item, btnEl, replaceQty, differer) {
      // Vérifie si le même article existe déjà (même nom+détails).
      // personName entre dans la clé : deux personnes d'une liste de groupe
      // ayant même taille+couleur doivent rester DEUX lignes distinctes.
      //
      // groupIndex y entre AUSSI : `personName` vaut le NOM FLOQUÉ, souvent
      // laissé vide. Deux lignes de groupe sans nom floqué partageaient alors
      // une clé identique dès qu'elles avaient même couleur et même taille — la
      // seconde fusionnait dans la première, qui héritait de sa quantité (un
      // panier affichait « 6 » pour une liste de 2). Chaque ligne d'une liste
      // porte un groupIndex unique (« 2/5 ») ; les ajouts hors groupe n'en ont
      // pas, leur cumul habituel est donc préservé.
      /* Un même produit ré-ajouté À L'IDENTIQUE met à jour sa ligne au lieu
         d'en créer une seconde.

         COULEUR ET TAILLE FONT PARTIE DE LA CLÉ. Elles en avaient été retirées
         pour couvrir le client qui « change d'avis » — mais ce choix ne
         distinguait pas *changer d'avis* de *vouloir les deux* : commander le
         même sweat en Black ET en Atoll ne donnait qu'une ligne, la première
         écrasée en silence. Sur une boutique, couleur et taille sont des
         articles distincts, chacun avec son variant au checkout.

         Les valeurs sont comparées NORMALISÉES : le libellé arrive tantôt nu
         (« Black »), tantôt préfixé (« Couleur : Black ») selon le chemin
         d'ajout — groupe ou unitaire. Comparer les chaînes brutes ferait
         échouer la fusion entre deux ajouts pourtant identiques.

         `productType` accompagne `name` : le libellé affiché peut coïncider
         entre deux produits distincts (coton et polyester s'intitulent tous
         deux « T-shirt »), et les fusionner enverrait le mauvais variant au
         checkout. Le type, lui, est la clé technique.

         Restent aussi dans la clé les deux marqueurs de COMMANDE GROUPÉE, qui
         désignent de vraies lignes distinctes :
           • personName — le nom floqué, propre à chaque personne ;
           • groupIndex — « 2/5 », unique par ligne de liste, indispensable
             quand le nom floqué est laissé vide.
         Sans eux, une liste de cinq personnes s'effondrerait en une ligne. */
      const existing = cartItems.find(i => i.productType === item.productType &&
                                           i.name === item.name &&
                                           valOption(i.color) === valOption(item.color) &&
                                           valOption(i.size) === valOption(item.size) &&
                                           (i.personName || '') === (item.personName || '') &&
                                           (i.groupIndex || '') === (item.groupIndex || ''));
      if (existing) {
        /* La quantité SUIT le sélecteur, elle n'est jamais cumulée.

           Ré-ajouter le même article ne doit pas faire monter le compteur —
           mais la valeur choisie dans le panneau QUANTITÉ doit être respectée :
           un client qui affiche 2 et ajoute veut 2, pas la quantité de son
           ajout précédent.

           `replaceQty` distinguait les produits dont la quantité est saisie
           avant l'ajout (coins, patchs, drapeaux) de ceux qui cumulaient. Le
           cumul ayant disparu avec la fusion des lignes, tous suivent
           désormais la même règle et le paramètre n'a plus d'effet ici. */
        existing.qty = item.qty || existing.qty || 1;

        /* Couleur, taille et design sont RAFRAÎCHIS : c'est tout l'objet de la
           fusion — la ligne reflète le dernier choix du client. */
        existing.color = item.color;
        existing.size = item.size;
        existing.price = item.price;      // le prix suit le produit et sa taille
        existing.img = item.img;
        existing.sheet = item.sheet;
        existing.assets = item.assets;
        existing.sleeveCount = item.sleeveCount;
        /* `design` est l'instantané rouvert par la vignette du tiroir. Omis de
           cette liste, il gardait celui du PREMIER ajout : la ligne montrait la
           nouvelle image mais rouvrait l'ancien design. */
        existing.design = item.design;
      } else {
        cartItems.push(item);
      }
      /* RÉSERVE MÉMOIRE du design COMPLET — data-URL comprises.

         `item.design` ne porte que les images déjà hébergées : les data-URL en
         sont filtrées pour ne pas saturer les 5 Mo de sessionStorage. Un client
         qui ajoute au panier avant la fin de l'envoi Cloudinary — quelques
         centaines de millisecondes, donc le cas COURANT — voyait son design
         capturé vide, et rouvrir sa vignette ne restaurait rien.

         Cette réserve vit en mémoire vive et n'est JAMAIS persistée : le quota
         reste intact. Elle ne survit pas à un rechargement, où le champ
         `design` filtré prend le relais.

         Centralisée ici plutôt qu'aux trois sites d'ajout : tous passent par
         cette fonction, et la clé doit suivre l'identifiant RÉELLEMENT retenu —
         celui de la ligne fusionnée, pas celui de l'objet entrant. */
      try {
        window.__designsPanier = window.__designsPanier || {};
        var cible = existing || item;
        if (cible && cible.id != null && typeof capturerEtatDesign === 'function') {
          window.__designsPanier[cible.id] = capturerEtatDesign(true);
        }
      } catch (e) {
        /* Sans réserve, on retombe sur le champ persisté : dégradé, pas cassé. */
        console.warn('Réserve de design non enregistrée :', e);
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
      if (cartCountEl) majPastillePanier(cartCountEl, cartCount);

      // Sauvegarder le panier pour la page Récapitulatif (utilisé par le drawer).
      // persistCartSafe signale la saturation du quota — voir sa définition.
      if (!differer) window.persistCartSafe(cartItems);

      // Feedback bouton
      if (btnEl) {
        const original = btnEl.innerHTML;
        btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> Ajouté !`;
        btnEl.style.background = '#16a34a';
        setTimeout(() => { btnEl.innerHTML = original; btnEl.style.background = ''; }, 1800);
      }

      // Ouvrir le drawer — sauté en ajout différé, l'appelant s'en charge.
      if (!differer) {
        renderCartDrawer();
        openCartDrawer();
      }
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
         cas seulement, on passe par le serveur.

         Le PATCH est le produit `patches` — voir la garde de
         capturePatchDesign, qui donne la chaîne produit -> canvas. */
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

      /* DRAPEAU / COIN : compose le design côté serveur.
         - img (vignette panier) = RECTO seul.
         - sheet (Aperçu commande) = planche recto + verso.

         Le COIN est le produit `coins` — voir la garde de captureCoinDesign,
         qui donne la chaîne produit -> catégorie -> canvas. */
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
          /* `.coin-base-img` A ÉTÉ RETIRÉ de cette liste.

             C'est le DISQUE VIERGE du coin — le métal nu, sans aucun design.
             Il donnait au panier une vignette de rond blanc, que le client
             lisait comme un design perdu alors que son écran montrait deux
             disques logotés.

             Les autres sélecteurs restent : l'image du drapeau porte déjà sa
             couleur, et celle du patch sa forme — retomber dessus reste
             informatif. Un fond de coin nu, non.

             Avec le filtre des vues sans logo (captureCoinDesign) et la
             détection par boîte réelle, ce repli ne devrait plus être atteint
             pour un coin pourvu d'un design. S'il l'est, mieux vaut une
             vignette vide qu'une vignette trompeuse. */
          const canvasImg = document.querySelector(
            '.flag-base-img, #coins-preview-img, .coins-canvas-circle img'
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
        assets: collectCustomAssets(),   // logos utilisés -> visibles dans la commande
        /* ÉTAT COMPLET du design, pour pouvoir rouvrir cette ligne plus tard.

           Les textiles le portent déjà (:2518) ; coins, drapeaux et patchs
           l'avaient été oubliés. Sans lui, cliquer la vignette d'un de ces
           articles ne restaurait que sa couleur : le design dépendait alors de
           `conf_uploads`, la mémoire de TRAVAIL du canvas, qu'un changement de
           produit ou une suppression efface.

           `assets` ne suffit pas : il ne porte qu'un libellé et une URL, de
           quoi imprimer mais pas de quoi rééditer — ni face, ni position, ni
           recadrage. */
        design: (typeof capturerEtatDesign === 'function') ? capturerEtatDesign() : null
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
              <div class="qm-field">
                <label for="qm-fichier">Fichier joint <span style="font-weight:400;color:#888">(optionnel)</span></label>
                <input type="file" id="qm-fichier" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf">
                <small style="display:block;margin-top:4px;color:#888;font-size:11px">Votre logo ou un visuel de référence — JPG, PNG, WEBP, GIF, SVG ou PDF, 10 Mo maximum.</small>
                <div id="qm-fichier-etat" style="margin-top:6px;font-size:11.5px"></div>
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
      /* `new FormData(form)` ramasse AUSSI l input file, mais y depose un objet
         `File`, pas une chaine. Envoye tel quel il serait rejete par la
         validation @IsString() du DTO. On ecarte donc la cle ici : le fichier
         est traite a part juste en dessous (upload -> URL). */
      new FormData(form).forEach((v, k) => { if (!(v instanceof File)) client[k] = v; });

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

        /* Fichier joint (optionnel) : uploade AVANT la creation du devis, pour
           que le corps JSON ne porte qu une URL. Meme motif que les apercus
           ci-dessus. Route dediee /uploads/piece-jointe : elle accepte le PDF,
           contrairement a /uploads/logo qui passe par sharp. */
        var fichierUrl = '', fichierNom = '';
        var champFichier = document.getElementById('qm-fichier');
        var fichier = champFichier && champFichier.files && champFichier.files[0];
        if (fichier) {
          /* 10 Mo : la borne du SERVEUR (MAX_FILE_SIZE). Le reste du
             configurateur autorise 12 Mo pour les logos, ce qui fait echouer
             en 400 les fichiers entre les deux. On aligne sur le serveur. */
          if (fichier.size > 10 * 1024 * 1024) {
            throw new Error('Le fichier depasse 10 Mo. Compressez-le ou envoyez-le par email.');
          }
          var etat = document.getElementById('qm-fichier-etat');
          if (etat) { etat.textContent = 'Envoi du fichier…'; etat.style.color = '#888'; }
          var resPJ = await window.ConfAPI.uploadPieceJointe(fichier);
          fichierUrl = (resPJ && resPJ.url) ? resPJ.url : '';
          fichierNom = fichier.name;
          if (etat) { etat.textContent = 'Fichier envoye.'; etat.style.color = '#127a3d'; }
        }

        const payload = {
          customer: {
            nom: client.nom,
            email: client.email,
            telephone: client.telephone,
            entreprise: client.entreprise || undefined,
            message: client.message || undefined,
            /* Ajoutes explicitement : ce payload liste les champs UN PAR UN,
               donc une cle posee sur `client` sans etre reprise ici serait
               perdue en silence. */
            fichierUrl: fichierUrl || undefined,
            fichierNom: fichierNom || undefined
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
        /* Mode de personnalisation : « Réinitialiser » doit ramener au tout
           début du parcours, donc à l'écran de choix. Le conserver aurait
           laissé le client dans un mode qu'il vient pourtant d'effacer. */
        sessionStorage.removeItem('conf_mode_perso');
        sessionStorage.removeItem('conf_group_rows');      // liste de noms validée
        /* Option manches (payante, +4 €/manche) : elle échappait au reset et
           restait donc active sur un design pourtant vidé — le surcoût
           réapparaissait sans logo pour le justifier. */
        sessionStorage.removeItem('conf_sleeve_opt');
        /* URLs hébergées : sans cette ligne, la restauration les reposerait au
           rechargement et le design reviendrait après un reset. */
        sessionStorage.removeItem('conf_cloud_urls');

        /* PAQUETS RANGÉS PAR MODE — `conf_design_mode_libre`,
           `conf_design_mode_groupe`, etc.

           Chacun porte une COPIE COMPLÈTE du design de son mode : logos,
           textes, couleurs et liste de surnoms. Les lignes ci-dessus vident
           le design COURANT, jamais ces réserves — la liste de surnoms
           réapparaissait donc au prochain choix de mode, alors que le client
           venait de tout réinitialiser.

           On balaie par PRÉFIXE plutôt que d'énumérer les modes : un mode
           ajouté plus tard serait sinon oublié ici. Les clés sont collectées
           avant suppression, car retirer pendant le parcours décale les
           index. */
        var aSupprimer = [];
        for (var i = 0; i < sessionStorage.length; i++) {
          var k = sessionStorage.key(i);
          if (k && k.indexOf('conf_design_mode_') === 0) aSupprimer.push(k);
        }
        for (var j = 0; j < aSupprimer.length; j++) {
          sessionStorage.removeItem(aSupprimer[j]);
        }

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
    /* `async` depuis l'ajout de la capture du texte (textZoneImage renvoie une
       Promise). Un seul appelant dans le dépôt — resolveDesignImage (:2558),
       déjà asynchrone — d'où l'absence de risque sur les autres chemins. */
    async function captureFaceDesign() {
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

      /* TEXTE DE LA VUE DE FACE, rasterisé et ajouté comme un logo.
         `faceZones` ne liste que les zones LOGO : un design composé d'un texte
         seul renvoyait donc `logos: []`. resolveDesignImage (:2568) saute alors
         la composition et ne génère aucune image — la vignette du panier
         restait celle du canvas, et le surnom de chaque ligne de groupe
         n'apparaissait nulle part, alors même qu'il est substitué avant la
         capture (:2289). Les deux symptômes venaient de cette seule omission.

         On réutilise textZoneImage (conf-share.js:91), déjà employée par
         captureAllViews (:3593) pour la planche de l'atelier : le texte y est
         rendu en PNG et reprojeté exactement comme un logo. Les deux zones de
         face sont traitées — poitrine gauche et droite peuvent coexister. */
      const canReproject = !!(layerBox && imgBox && imgBox.width > 0 && imgBox.height > 0);
      if (typeof window.textZoneImage === 'function') {
        for (const zt of ['f', 'fr']) {
          /* ISOLÉ : le texte est un COMPLÉMENT, jamais une condition.

             Sans ce try/catch, une rasterisation qui échoue remontait jusqu'au
             `catch` de resolveDesignImage (:2582), lequel pose
             `faceDesign = null` — et faisait donc perdre les LOGOS déjà
             collectés juste au-dessus. La composition était alors sautée et la
             vignette du panier sortait NUE, alors que le vêtement portait bien
             son design à l'écran.

             Une étape facultative ne doit jamais annuler une étape essentielle
             déjà réussie. On garde ce qu'on a, et on continue. */
          try {
            const t = await window.textZoneImage('text-' + zt, imgBox, layerBox, canReproject);
            if (t) logos.push(t);
          } catch (e) {
            console.warn('Texte « ' + zt + ' » non rasterisé pour la vignette ' +
                         '(les logos sont conservés) :', e);
          }
        }
      }

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
        /* La face porte DEUX zones de texte, comme elle porte deux logos :
           cœur (#text-f) et poitrine droite (#text-fr). Seule la première était
           déclarée — un second texte n'apparaissait ni dans l'aperçu de groupe,
           ni dans la vue d'ensemble, ni sur la planche atelier. */
        { key: 'face',  img: 'face', label: 'FACE',          zones: ['logo-f', 'logo-fr'], textZone: ['f', 'fr'] },
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
        /* PLUSIEURS textes par vue. `textZone` était une chaîne unique : la vue
           de face ne rendait donc que #text-f, et un second texte en poitrine
           DROITE (#text-fr) disparaissait — de l'aperçu de groupe, mais aussi
           de la vue d'ensemble et de la planche envoyée à l'atelier. On accepte
           désormais une liste, en tolérant l'ancienne forme. */
        if (def.textZone) {
          const zonesTexte = Array.isArray(def.textZone) ? def.textZone : [def.textZone];
          for (const zt of zonesTexte) {
            const t = await textZoneImage('text-' + zt, imgBox, layerBox, canReproject);
            if (t) logos.push(t);
          }
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
      /* LE TYPE ATTENDU EST BIEN 'coins'. La chaîne complète, vérifiable :

           productType 'coins'
             -> categoryMap donne la catégorie "patches"   (conf-dynamic-layout.js:139)
             -> switchLayout appelle loadPatchesCanvas()   (:184-186)
             -> ce gabarit injecte #coin-disc-recto, #coin-logo-recto  (:891-946)

         Autrement dit : le produit `coins` affiche le canvas du COIN, que cette
         fonction manipule. Les noms sont inversés dans le projet, mais PAS ici —
         la clé du mapping (`coins`) est le produit, sa valeur (`patches`) est la
         catégorie interne. Confondre les deux mène à croire l'inverse.

         Preuve indépendante : updateCoinRecapThumb (conf-coin-thumb.js:44) lit
         les MÊMES éléments et fonctionne — elle n'a simplement aucune garde de
         type produit. */
      if (currentProductType !== 'coins') return null;

      // (label, id du disque conteneur, id du logo déplaçable)
      var faces = [
        { label: 'RECTO', disc: 'coin-disc-recto', logo: 'coin-logo-recto', base: 'coin-base-recto' },
        { label: 'VERSO', disc: 'coin-disc-verso', logo: 'coin-logo-verso', base: 'coin-base-verso' }
      ];

      /* MOBILE : les DEUX faces doivent être mesurables pendant la capture.

         Sur téléphone, la scène n'affiche qu'une face à la fois — l'autre est
         masquée en CSS par `data-face-active` (conf-mobile.css:513-520). Un
         élément en `display: none` n'a pas de boîte : `getBoundingClientRect()`
         renvoie zéro, `coinCoverDataUrl` abandonne (conf-coin-thumb.js:141), et
         la face inactive était capturée VIDE. La vue d'ensemble ne montrait donc
         que la face affichée au moment du clic.

         On lève l'attribut le temps de la mesure, puis on le restaure. Les deux
         faces redeviennent mesurables sans que l'écran change : la capture est
         synchrone, aucun rendu intermédiaire n'est peint.

         Le « recto simple » n'est PAS affecté : sa face verso porte
         `display: none` en style INLINE, posé par selectCoinType(), que cette
         levée ne touche pas. La distinction est la même que celle de
         conf-mobile.js:1030-1035 — l'inline exprime un choix du client, le CSS
         un simple état d'affichage. */
      var scene = document.querySelector('.coin-stage[data-face-active]');
      var faceActive = scene ? scene.getAttribute('data-face-active') : null;
      if (scene) {
        scene.removeAttribute('data-face-active');
        /* Même nécessité que pour les drapeaux : lire `offsetHeight` force le
           recalcul de mise en page — sans quoi la face démasquée garde des
           dimensions nulles — puis le cadre de rognage doit être reposé, ses
           pixels ayant été figés à zéro pendant le masquage. */
        void scene.offsetHeight;
        if (typeof window.syncCoinCrop === 'function') window.syncCoinCrop();
      }

      var views = [];
      try {
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

        /* VISIBILITÉ RÉELLE, pas le style inline.

           Le test portait sur `logoEl.style.display !== 'none'`. Or le gabarit
           pose ce `display:none` en INLINE (conf-dynamic-layout.js:914, :928),
           et selon le chemin d'affichage il n'est pas toujours levé alors que
           le motif est bien à l'écran — le logo peut être rendu visible par sa
           classe, ou reparenté dans `.coin-crop` par syncCoinCrop.

           La capture repartait alors SANS logo. Comme la vue était publiée
           quand même (voir plus bas), le panier retombait sur le disque vierge
           en guise de vignette : un rond blanc.

           On mesure donc la boîte, seul juge de ce qui est réellement peint.
           Un élément masqué — par l'inline ou par le CSS — a des dimensions
           nulles ; c'est le même critère que le repli quelques lignes plus bas,
           qui n'était jamais atteint. */
        var logoBox = logoEl ? logoEl.getBoundingClientRect() : null;
        if (logoEl && logoBox && logoBox.width > 0 && logoBox.height > 0) {
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
              /* REPLI — l'aplatissement a échoué.

                 coinCoverDataUrl a cinq sorties à vide : mode « découpé »
                 (qui retire `is-cover`), image non décodée, cadre de rognage
                 absent, boîte non mesurable, ou canvas bloqué par les règles
                 de sécurité sur les images distantes.

                 On envoie alors l'image brute et sa géométrie. Le rendu est
                 moins fidèle qu'une image déjà rognée, mais il PORTE le
                 design — là où l'absence de repli donnait un disque nu.

                 `logoBox` est la boîte déjà mesurée plus haut : la recalculer
                 ici ferait diverger la garde et le calcul. */
              logos.push({
                src: limg.src,
                x: (logoBox.left - discBox.left) / discBox.width,
                y: (logoBox.top - discBox.top) / discBox.height,
                w: logoBox.width / discBox.width
              });
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

        /* SEULES LES FACES AVEC UN LOGO sont publiées — comme le drapeau
           (:4295), dont c'est la seule différence structurelle avec ce code.

           Une vue sans logo était publiée quand même. En aval,
           addCustomToCartInner teste `recto.logos.length` : faux, donc la
           composition de la vignette était SAUTÉE, et le repli attrapait
           `.coin-base-img` — le disque vierge. Le client voyait un rond blanc
           alors que son écran montrait deux disques logotés.

           Sans aucune face pourvue, la fonction renvoie null (voir la fin) :
           le repli s'applique alors franchement, au lieu d'être déclenché par
           une vue creuse. */
        if (logos.length) {
          views.push({ label: f.label, background: baseImg.src, logos: logos });
        }
      });

      } finally {
        /* L'affichage retrouve son état, MÊME si la boucle a échoué. L'oublier
           laisserait les deux faces visibles sur un écran de téléphone — un
           défaut permanent, bien pire que celui qu'on corrige ici. */
        if (scene && faceActive) {
          scene.setAttribute('data-face-active', faceActive);
          /* Le cadre de rognage a été recalculé sur DEUX faces visibles : il
             faut le reposer sur la disposition réelle, sinon le design de la
             face affichée resterait mal calé après la capture. */
          if (typeof window.syncCoinCrop === 'function') window.syncCoinCrop();
        }
      }

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
        { label: 'RECTO', key: 'recto', base: 'flag-base-recto', logo: 'flag-logo-recto' },
        { label: 'VERSO', key: 'verso', base: 'flag-base-verso', logo: 'flag-logo-verso' }
      ];

      /* MÊME LEVÉE QUE LES COINS : sur téléphone, la scène ne montre qu'une face
         (`data-face-active`, conf-mobile.css:515-516). La face masquée n'a pas
         de boîte, sa capture sortait donc vide et la vue d'ensemble ne
         présentait que la face affichée au moment du clic. */
      var scene = document.querySelector('.flag-stage[data-face-active]');
      var faceActive = scene ? scene.getAttribute('data-face-active') : null;
      if (scene) {
        scene.removeAttribute('data-face-active');

        /* RECALCUL FORCÉ, puis resynchronisation du cadre de rognage.

           Retirer l'attribut ne suffit pas : le navigateur ne recalcule la mise
           en page qu'au prochain rendu, si bien que la face démasquée gardait
           des dimensions NULLES pendant toute la capture. flagCoverDataUrl
           abandonnait alors (conf-flag-cover.js:426) et la vignette du panier
           sortait vide — le défaut restait donc entier sur mobile, alors que la
           levée seule avait suffi pour la vue d'ensemble.

           Lire `offsetHeight` force ce recalcul de façon synchrone. Il faut
           ensuite reposer `.flag-crop` : ses dimensions ont été FIGÉES EN PIXELS
           par syncFlagCrop alors que la face était masquée, donc à zéro. Sans
           cette reprise, le cadre reste inutilisable même une fois la face
           visible. */
        void scene.offsetHeight;
        if (typeof window.syncFlagCrop === 'function') window.syncFlagCrop();
      }

      var views = [];
      try {
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
            /* DESIGN EN COUVERTURE : on envoie une image DÉJÀ ROGNÉE.

               À l'écran, deux mécanismes purement CSS façonnent le rendu :
               `object-fit: cover` sur l'image (elle remplit sa boîte en se
               rognant) et `overflow: hidden` sur .flag-crop (ce qui dépasse est
               coupé). Le serveur ignore les deux : il reçoit l'image ENTIÈRE et
               la pose telle quelle, d'où un design décalé et hors cadre.

               Aucun ajustement de largeur ne peut corriger cela — le problème
               n'est pas la taille mais le rognage. On aplatit donc le rendu
               dans un canvas avant l'envoi, exactement comme les COINS le font
               déjà (flagCoverDataUrl / coinCoverDataUrl, :3762).

               Repli sur l'image brute si l'aplatissement échoue (canvas teinté
               par CORS) : mieux vaut un design mal calé qu'aucune vignette. */
            var aplati = (typeof window.flagCoverDataUrl === 'function')
              ? window.flagCoverDataUrl(f.key) : '';
            if (aplati) {
              /* L'image aplatie couvre la ZONE IMPRIMABLE (.flag-crop), pas le
                 drapeau entier : celle-ci est en retrait des bords (marges de
                 4 % et 9 %, voir syncFlagCrop). On la positionne donc sur ce
                 cadre réel, et non en {0,0,1} comme les coins — dont le cadre
                 de rognage coïncide, lui, avec le disque. */
              var cropEl = logoEl.closest('.flag-crop');
              var cb2 = cropEl ? cropEl.getBoundingClientRect() : null;
              if (cb2 && cb2.width > 0) {
                logos.push({
                  src: aplati,
                  x: (cb2.left - box.left) / box.width,
                  y: (cb2.top - box.top) / box.height,
                  w: cb2.width / box.width
                });
              } else {
                logos.push({ src: aplati, x: 0, y: 0, w: 1 });
              }
            } else {
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
        }
        // L'image du drapeau est DÉJÀ à la bonne couleur : on l'envoie telle quelle.
        // On ne garde que les faces AVEC un logo (évite un verso vide).
        if (logos.length) views.push({ label: f.label, background: baseImg.src, logos: logos });
      });
      } finally {
        /* Restauré même en cas d'échec : sans cela, les deux faces resteraient
           visibles sur téléphone — un défaut permanent. */
        if (scene && faceActive) {
          scene.setAttribute('data-face-active', faceActive);
          // Cadre reposé sur la disposition réelle (voir captureCoinDesign).
          if (typeof window.syncFlagCrop === 'function') window.syncFlagCrop();
        }
      }

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
      /* LE TYPE ATTENDU EST BIEN 'patches'. Symétrique de captureCoinDesign :

           productType 'patches'
             -> catégorie "coins"                        (conf-dynamic-layout.js:141)
             -> loadCoinsCanvas()                        (:169-171)
             -> injecte #patch-stage, #patch-logo        (:300-325)

         Cette fonction manipule `patch-logo` : elle sert donc bien le produit
         `patches`. */
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

    /**
     * Capture l'état COMPLET du design courant : produit, couleur, finitions,
     * images ET textes.
     *
     * Extraite de createInviteLink() pour servir deux usages : le lien de
     * partage, et la mémorisation d'une ligne de panier — qui doit pouvoir
     * rouvrir son design même si le canvas a changé depuis (logo supprimé,
     * réinitialisation, changement de produit).
     *
     * `texts` est une AJOUT : la capture ne le portait pas, si bien qu'un
     * design partagé arrivait chez le destinataire sans ses textes. Le défaut
     * existait avant ce changement ; il est corrigé ici pour les deux usages.
     *
     * @returns {object} état sérialisable, sûr à écrire en session
     */

    /** Une source d'image est-elle HÉBERGÉE (donc légère à mémoriser) ? */
    function srcHeberge(s) {
      return typeof s === 'string' && /^(https?:)?\/\//i.test(s);
    }

    /**
     * Ne conserve d'un magasin d'uploads que les zones dont l'image est
     * hébergée — les data-URLs sont écartées.
     *
     * Le magasin d'origine n'est PAS modifié : on renvoie une copie. Sans cela,
     * filtrer pour le panier amputerait aussi `conf_uploads`, et le design
     * disparaîtrait du canvas.
     *
     * @param {object|null} store - magasin { _v, byProduct }
     * @returns {object|null} copie filtrée, ou null si rien à garder
     */
    function filtrerUploadsHeberges(store) {
      if (!store || !store.byProduct) return store;
      var out = { _v: store._v || 2, byProduct: {} };
      var garde = false;

      Object.keys(store.byProduct).forEach(function (produit) {
        var zones = store.byProduct[produit];
        if (!zones || typeof zones !== 'object') return;
        var propres = {};
        Object.keys(zones).forEach(function (z) {
          var e = zones[z];
          var src = (typeof e === 'string') ? e : (e && e.src);
          if (!srcHeberge(src)) return;      // data-URL : trop lourde, écartée
          propres[z] = (typeof e === 'string') ? { src: e, geo: null } : e;
          garde = true;
        });
        if (Object.keys(propres).length) out.byProduct[produit] = propres;
      });

      return garde ? out : null;
    }

    /**
     * @param {boolean} [complet] - si vrai, AUCUN filtre : les data-URL sont
     *   conservées. Réservé à la réserve mémoire des lignes de panier
     *   (window.__designsPanier), qui ne va jamais en sessionStorage.
     *   Par défaut (faux), seules les images hébergées sont retenues — c'est
     *   la version persistée, qui doit rester légère.
     */
    function capturerEtatDesign(complet) {
      var state = {
        product: null, color: null, patchColor: null, coinFinish: null,
        flagColor: null, flagColorName: null, flagOrientation: null,
        uploads: null, texts: null
      };
      try { state.product = sessionStorage.getItem('conf_current_product') || currentProductType; } catch (e) {}
      try { state.color = JSON.parse(sessionStorage.getItem('conf_current_color') || 'null'); } catch (e) {}
      try { state.patchColor = JSON.parse(sessionStorage.getItem('conf_patch_color') || 'null'); } catch (e) {}
      try { state.coinFinish = sessionStorage.getItem('conf_coin_finish') || null; } catch (e) {}

      /* RÉGLAGES DU DRAPEAU — fond et orientation.

         Ils manquaient : un drapeau rouvert depuis le panier revenait à son
         fond par défaut. L'orientation compte doublement, car elle pilote le
         calcul du cadre de rognage (conf-flag-cover.js:100) — un drapeau
         portrait recadré comme un paysage affiche son design décalé, ce qui
         passe pour une restauration ratée alors que l'image est bien là.

         L'orientation ne vit QU'EN MÉMOIRE (conf-drapeaux.js:80) : elle n'est
         nulle part en session, d'où la lecture sur window. */
      try { state.flagColor = sessionStorage.getItem('conf_flag_color') || null; } catch (e) {}
      try { state.flagColorName = sessionStorage.getItem('conf_flag_color_name') || null; } catch (e) {}
      state.flagOrientation = window.__flagOrientation || null;
      try { state.uploads = JSON.parse(sessionStorage.getItem('conf_uploads') || 'null'); } catch (e) {}
      try { state.texts = JSON.parse(sessionStorage.getItem('conf_texts') || 'null'); } catch (e) {}

      /* SEULES LES IMAGES DÉJÀ HÉBERGÉES sont retenues.

         Cet état est recopié dans CHAQUE ligne de panier : le design s'y
         retrouvait donc stocké deux fois — une dans `conf_uploads`, une dans la
         ligne. Sur un drapeau recto/verso non encore uploadé, cela faisait
         ~5,6 Mo pour un quota de 5 Mo : une seule ligne saturait la session, et
         la modale « Panier non mémorisé » s'affichait au premier ajout.

         Une URL Cloudinary pèse quelques centaines d'octets ; une data-URL
         plusieurs mégaoctets. On ne garde donc que les premières. Une image
         encore en cours d'envoi est simplement omise : la ligne reste ouvrable
         tant que le canvas la porte, et le cas nominal — upload terminé — est
         couvert. La version lourde vit déjà dans `conf_uploads`, et la commande
         part avec les URL via `assets`.

         Ce champ sert à ROUVRIR une ligne, pas à archiver le design.

         `complet` court-circuite ce filtre : la réserve mémoire des lignes de
         panier a besoin des data-URL, et n'est jamais persistée. */
      if (!complet) state.uploads = filtrerUploadsHeberges(state.uploads);

      /* COMPLÉMENT DEPUIS LE DOM — ce qui est à l'écran fait foi.

         La session ne suffit pas : l'écriture d'une image y est ASYNCHRONE
         (compression, puis remplacement par l'URL Cloudinary une fois l'upload
         abouti). Un client qui pose un logo et ajoute aussitôt au panier
         capturait donc un état encore incomplet — la ligne partait sans ses
         assets, et le design ne pouvait plus être rouvert.

         On relit donc les calques réellement posés et on comble ce qui manque.
         La session reste prioritaire : elle porte la géométrie exacte, que le
         DOM n'exprime qu'en styles inline. */
      try {
        var produit = state.product || currentProductType;
        if (!state.uploads) state.uploads = { _v: 2, byProduct: {} };
        if (!state.uploads.byProduct) state.uploads.byProduct = {};
        var zonesProduit = state.uploads.byProduct[produit] || {};

        /* Toutes les zones, TEXTILES ET NON TEXTILES.

           La liste s'arrêtait aux zones de vêtement : un coin, un drapeau ou un
           patch ajouté au panier AVANT la fin de l'upload Cloudinary partait
           donc sans son design, sans que rien ne le signale. Les identifiants
           DOM diffèrent d'une famille à l'autre, d'où la table ci-dessous
           plutôt qu'un préfixe unique. */
        var ZONES_DOM = {
          'f': 'logo-f', 'fr': 'logo-fr', 'b': 'logo-b',
          'sl': 'logo-sl', 'sr': 'logo-sr',
          'c': 'patch-logo',
          'coin-recto': 'coin-logo-recto', 'coin-verso': 'coin-logo-verso',
          'flag-recto': 'flag-logo-recto', 'flag-verso': 'flag-logo-verso'
        };

        Object.keys(ZONES_DOM).forEach(function (zone) {
          if (zonesProduit[zone] && zonesProduit[zone].src) return;  // déjà en session
          var el = document.getElementById(ZONES_DOM[zone]);
          if (!el || el.style.display === 'none') return;
          var img = el.querySelector('img');
          var src = img && img.getAttribute('src');
          /* Sources HÉBERGÉES seulement, même règle que le filtre ci-dessus :
             ce complément acceptait les data-URLs et réintroduisait donc le
             poids qu'on vient d'écarter. Une image encore en cours d'envoi est
             omise — elle rejoindra la session dès que son URL arrivera.
             `complet` lève cette restriction pour la réserve mémoire. */
          if (!src) return;
          if (!complet && !srcHeberge(src)) return;

          zonesProduit[zone] = {
            src: src,
            geo: {
              left: el.style.left || null,
              top: el.style.top || null,
              width: el.style.width || null,
              /* `height` est indispensable aux modes COUVERTURE (coins,
                 drapeaux), où la boîte grandit sur les deux axes. Les logos
                 ordinaires gardent `auto` : la valeur est alors vide et
                 applyUploadGeo l'ignore. */
              height: el.style.height || null
            }
          };
        });
        state.uploads.byProduct[produit] = zonesProduit;
      } catch (e) {
        /* DOM illisible : on garde ce que la session a fourni. */
      }

      return state;
    }
    window.capturerEtatDesign = capturerEtatDesign;

    /* Capture l'état complet du design courant et le sauvegarde côté serveur.
       Renvoie l'URL d'invitation (?design=<id>) que l'invité ouvrira pour
       retrouver et éditer ce design. */
    async function createInviteLink() {
      var state = capturerEtatDesign();

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

    /* Détail d'une ligne du tiroir : une information par ligne, chacune
       étiquetée. Le nom floqué était auparavant accolé au titre (« T-shirt
       coton — Thierno Ngom ») et la couleur collée à la taille, sans libellé.

       `item.color` arrive PRÉFIXÉ (« Couleur : Apricot ») depuis les lignes de
       groupe, et `item.size` peut l'être aussi (« Taille : M ») : on retire ces
       préfixes avant d'ajouter les nôtres, sinon la ligne se lisait
       « Couleur : Couleur : Apricot ». Même traitement que le récapitulatif
       (sections/recapitulatif.liquid:1235).

       Les articles hors textile (drapeaux, patchs, coins) n'ont pas de taille
       et portent des détails déjà formatés dans `color` : ils sont rendus tels
       quels, sans étiquette, pour ne rien casser de leur affichage. */
    function cdLignesMeta(item) {
      const sansPrefixe = (v, p) =>
        String(v == null ? '' : v).replace(new RegExp('^\\s*' + p + '\\s*:\\s*', 'i'), '').trim();

      // L'étiquette est en <strong> (gris léger via CSS), la valeur en
      // .cd-val (foncée et grasse) : c'est elle qu'on cherche du regard.
      const ligne = (etiquette, valeur) =>
        '<span><strong>' + etiquette + ' :</strong> ' +
        '<span class="cd-val">' + grpEsc(valeur) + '</span></span>';

      const lignes = [];
      if (item.personName) lignes.push(ligne('Nom floqué', item.personName));
      if (item.color) {
        // Un article sans taille est un produit non textile : détails bruts.
        lignes.push(item.size
          ? ligne('Couleur', sansPrefixe(item.color, 'Couleur'))
          : '<span>' + grpEsc(item.color) + '</span>');
      }
      if (item.size) lignes.push(ligne('Taille', sansPrefixe(item.size, 'Taille')));
      return lignes.join('');
    }

    /* ── REGROUPEMENT DES COMMANDES DE GROUPE ─────────────────────────────
       Une liste de cinq personnes créait cinq lignes de panier identiques —
       même produit, même design, seule la taille changeait. Le panier devenait
       illisible dès qu'une équipe dépassait quelques personnes.

       Le regroupement est PUREMENT VISUEL : `cartItems` garde ses N lignes,
       et tout ce qui part en commande (buildShopifyItems, variantForItem)
       reste inchangé. C'est ce qui rend l'opération sans risque.

       Note : la taille n'est PAS une variante Shopify dans ce thème — la
       variante se choisit par produit + couleur (recapitulatif.liquid:872).
       Regrouper les tailles ne peut donc rien casser côté commande. */

    /** Retire le préfixe « Couleur : » / « Taille : » d'une valeur. */
    function sansPrefixeCd(v, p) {
      return String(v == null ? '' : v)
        .replace(new RegExp('^\\s*' + p + '\\s*:\\s*', 'i'), '').trim();
    }

    /**
     * Clé de regroupement d'une ligne de panier.
     *
     * Le SEUL `groupLabel` : une commande de groupe forme une carte unique,
     * même si ses membres ont choisi des couleurs différentes. La carte porte
     * alors un effet de pile et liste les teintes — l'image montre la première,
     * les autres sont nommées juste dessous.
     *
     * @returns {string|null} null pour un article individuel.
     */
    function cleGroupeCd(item) {
      if (!item || !item.groupLabel) return null;
      return item.groupLabel;
    }

    /**
     * Couleurs distinctes d'un groupe, dans l'ordre d'apparition.
     * @returns {string[]}
     */
    function couleursDuGroupe(lignes) {
      const vues = [];
      lignes.forEach(function (l) {
        const c = sansPrefixeCd(l.color, 'Couleur');
        if (c && vues.indexOf(c) === -1) vues.push(c);
      });
      return vues;
    }

    /**
     * Partitionne le panier : groupes d'un côté, articles isolés de l'autre.
     * L'ordre d'apparition est conservé — un groupe se place là où sa
     * première ligne se trouvait.
     * @returns {Array<{cle:string|null, lignes:Array}>}
     */
    function partitionnerPanier(items) {
      const blocs = [];
      const parCle = {};
      items.forEach(function (it) {
        const cle = cleGroupeCd(it);
        if (!cle) { blocs.push({ cle: null, lignes: [it] }); return; }
        if (!parCle[cle]) { parCle[cle] = { cle: cle, lignes: [] }; blocs.push(parCle[cle]); }
        parCle[cle].lignes.push(it);
      });
      return blocs;
    }

    /**
     * Agrège les tailles d'un groupe, dans l'ordre de leur première apparition.
     * @returns {Array<{taille:string, qte:number}>}
     */
    function taillesDuGroupe(lignes) {
      const ordre = [];
      const parTaille = {};
      lignes.forEach(function (l) {
        const t = sansPrefixeCd(l.size, 'Taille') || '—';
        if (!parTaille[t]) { parTaille[t] = { taille: t, qte: 0 }; ordre.push(parTaille[t]); }
        parTaille[t].qte += Number(l.qty) || 0;
      });
      return ordre;
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
      partitionnerPanier(cartItems).forEach(bloc => {
       /* CHAQUE BLOC EST ISOLÉ. Sans ce filet, une exception sur l'un
          interrompait la boucle : les suivants existaient bien en session
          mais n'étaient jamais peints — le client voyait son panier amputé.

          Le risque vient des tarifs, calculés par des fonctions externes
          (window.effectiveUnitPrice, window.tierMinQty) qu'une ligne au type
          inconnu ou au prix manquant peut faire échouer. Un article de trop
          vaut mieux qu'un panier tronqué : on le passe, et on le signale. */
       try {
        /* GROUPE : une carte unique pour toute la liste. */
        if (bloc.cle) {
          const lignes = bloc.lignes;
          const tete = lignes[0];
          const unitG = Number(cartUnitPrice(tete, totalsByType)) || 0;
          /* Le sous-total alimente le TOTAL du panier, même s'il n'est plus
             affiché dans la carte : sans lui, une commande de groupe ne
             compterait pas dans le montant du pied. */
          let sousTotal = 0;
          /* Nombre de PIÈCES de ce groupe : une ligne peut en porter plusieurs
             (« ×3 »), le nombre de personnes ne suffit donc pas. */
          let piecesG = 0;
          lignes.forEach(function (l) {
            const q = Number(l.qty) || 0;
            piecesG += q;
            sousTotal += (Number(cartUnitPrice(l, totalsByType)) || 0) * q;
          });
          total += sousTotal;

          const cleJs = JSON.stringify(bloc.cle);
          const tailles = taillesDuGroupe(lignes).map(function (t) {
            const tj = JSON.stringify(t.taille);
            /* À UNE PIÈCE, le « − » devient une CORBEILLE : le prochain clic
               retire la taille de la commande, il ne décrémente plus. Le
               changement d'icône l'annonce avant le clic. */
            /* QUANTITÉ EN LECTURE SEULE. Les boutons − / + ont été retirés :
               une commande de groupe se modifie à l'étape « Configurer », où
               chaque personne a sa ligne avec son surnom. Les ajuster ici, sur
               un total par taille, ne dirait pas À QUI la pièce ajoutée ou
               retirée appartient. */
            return '<div class="cd-grp-taille">' +
                     '<span class="cd-grp-lbl">' + grpEsc(t.taille) + '</span>' +
                     '<span class="cd-grp-qte">×' + t.qte + '</span>' +
                   '</div>';
          }).join('');

          /* SURNOMS LISTÉS SOUS LA CARTE. Une erreur de nom brodé coûte une
             commande entière : le client doit pouvoir les vérifier avant de
             payer, même si la carte est compacte. */
          const noms = lignes.map(function (l) { return l.personName; })
                             .filter(function (n) { return n; });
          const blocNoms = noms.length
            ? '<div class="cd-grp-noms"><strong>Noms floqués :</strong> ' +
              grpEsc(noms.join(' · ')) + '</div>'
            : '';

          /* PILE — l'image porte deux feuillets décalés derrière elle quand la
             commande compte plusieurs teintes. La vignette n'en montre qu'une ;
             la pile dit qu'il y en a d'autres, sans avoir à les afficher. */
          const couleurs = couleursDuGroupe(lignes);
          const estPile = couleurs.length > 1;

          const divG = document.createElement('div');
          divG.className = 'cd-item cd-item-grp';
          divG.innerHTML =
            '<div class="cd-thumb-pile' + (estPile ? ' is-pile' : '') + '">' +
            '<button type="button" class="cd-thumb" onclick="openCartItemDesign(' +
              (Number(tete.id) || 0) + ')" title="Revenir au design de cette commande">' +
              '<img src="' + safeImgSrc(tete.img) + '" alt="' + grpEsc(tete.name) + '">' +
            '</button>' +
            /* Le compte sous la VIGNETTE, pas dans la colonne de droite : il
               qualifie l'image — combien de pièces cette commande représente —
               là où la colonne de droite décrit le produit et ses options. */
            '<div class="cd-grp-compte">' + piecesG +
              ' article' + (piecesG > 1 ? 's' : '') + '</div>' +
            '</div>' +
            '<div class="cd-info">' +
              '<div class="cd-name">' + grpEsc(tete.name) + '</div>' +
              '<div class="cd-meta"><span class="cd-val">' +
                grpEsc(couleurs.join(', ')) + '</span></div>' +
              '<div class="cd-price">' + unitG.toFixed(2).replace('.', ',') +
                ' € <span class="cd-tier">/u</span></div>' +
              '<div class="cd-grp-tailles">' + tailles + '</div>' +
              blocNoms +
            '</div>' +
            '<button type="button" class="cd-delete" ' +
              'onclick=\'removeGroupItems(' + cleJs + ')\' title="Supprimer cette commande">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6"/></svg>' +
            '</button>';
          container.appendChild(divG);
          return;
        }

        const item = bloc.lignes[0];
        // Palier dégressif + supplément manches (voir cartUnitPrice).
        const unit = Number(cartUnitPrice(item, totalsByType)) || 0;
        /* Un seul NaN contaminerait le TOTAL de tout le panier — il s'affiche
           alors « NaN € », et le client ne peut plus commander. */
        total += unit * (Number(item.qty) || 0);
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
            <div class="cd-name">${grpEsc(item.name)}</div>
            <div class="cd-meta">${cdLignesMeta(item)}</div>
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
       } catch (e) {
        /* On lit le NOM depuis le bloc, pas depuis `item` : cette variable est
           hors de portée quand l'exception vient de la branche « groupe », et
           la lire y masquerait l'erreur d'origine par une seconde. */
        const nomBloc = bloc.lignes && bloc.lignes[0] && bloc.lignes[0].name;
        console.warn('Article du panier non affiché :', nomBloc, e);
       }
      });

      /* `i.qty || 0` : une quantité manquante donnait « NaN article ». Les
         lignes équivalentes (totalsByType, pushToCart) sont déjà défensives. */
      const totalCount = cartItems.reduce((s, i) => s + (i.qty || 0), 0);
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
        /* Les DATA-URLs sont retirées avant écriture.

           Sur coins, drapeaux et patchs, `img` retombe parfois sur le `src`
           d'une <img> du canvas — une data-URL de plusieurs centaines de Ko.
           Or le checkout la REJETTE déjà : recapitulatif.liquid n'accepte que
           des URLs http(s) comme propriété de ligne (une data-URL dépasse la
           limite de longueur de Shopify et fait échouer /cart/add.js).

           Elle occupait donc le quota sans jamais servir. On applique le même
           filtre ici, à l'entrée : ce qui sera rejeté à la sortie n'a pas à
           être mémorisé. La vignette reste affichée à l'écran — c'est le DOM
           qui la porte, pas la session. */
        var propres = (items || []).map(function (it) {
          if (!it) return it;
          var estUrl = function (u) {
            return (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : '';
          };
          /* Le champ `design` est filtré LUI AUSSI.

             Ce nettoyage ne couvrait que `img` et `sheet` : `design` a été
             ajouté après lui, et transportait tout le magasin d'uploads —
             data-URLs comprises. C'est ce qui saturait la session dès le
             premier drapeau recto/verso.

             Dernier rempart avant l'écriture : même si capturerEtatDesign
             filtre déjà en amont, une ligne ajoutée par un autre chemin, ou
             mémorisée avant ce correctif, ne doit pas pouvoir passer. */
          var designLourd = !!(it.design && it.design.uploads &&
                            /"src"\s*:\s*"data:/i.test(JSON.stringify(it.design.uploads)));

          if (/^data:/i.test(it.img || '') || /^data:/i.test(it.sheet || '') || designLourd) {
            var copie = Object.assign({}, it);
            copie.img = estUrl(it.img);
            copie.sheet = estUrl(it.sheet);
            if (designLourd && typeof filtrerUploadsHeberges === 'function') {
              copie.design = Object.assign({}, it.design);
              copie.design.uploads = filtrerUploadsHeberges(it.design.uploads);
            }
            return copie;
          }
          return it;
        });
        sessionStorage.setItem('conf_cart', JSON.stringify(propres));
        return true;
      } catch (e) {
        var quotaHit = e && (
          e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||   // Firefox
          e.code === 22 || e.code === 1014
        );
        if (quotaHit) {
          console.warn('Panier non mémorisé : stockage de session saturé.', e);
          /* AUCUNE MODALE — même décision que pour la saturation du magasin
             d'uploads (voir writeUploadStore).

             Le panier reste AFFICHÉ et la commande part correctement : le
             message interrompait sans que le client ait quoi que ce soit à
             corriger. Il apparaissait notamment à la réouverture d'un article,
             où il n'y avait rien à signaler.

             La trace console suffit au diagnostic. */
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
      item.qty = Math.max(minQtyPour(item.productType), (Number(item.qty) || 0) + delta);
      cartCount = cartItems.reduce((s, i) => s + (i.qty || 0), 0);
      const cartCountEl = document.getElementById('hdr-cart-count');
      if (cartCountEl) majPastillePanier(cartCountEl, cartCount);
      persistCart();
      renderCartDrawer();
    }

    /**
     * Recalcule le résumé des tailles d'un groupe.
     *
     * `_sizeGroupSummary` (« 2×M, 2×L, 1×XL ») est figé à la création et part
     * TEL QUEL à l'atelier (recapitulatif.liquid:997). Modifier les quantités
     * depuis le panier le rendrait faux : l'atelier recevrait une répartition
     * qui n'est plus celle commandée.
     */
    function majResumeTailles(cle) {
      const lignes = cartItems.filter(i => cleGroupeCd(i) === cle);
      if (!lignes.length) return;
      const resume = taillesDuGroupe(lignes)
        .map(t => t.qte + '×' + t.taille).join(', ');
      lignes.forEach(l => { if (l._sizeGroupSummary) l._sizeGroupSummary = resume; });
    }

    /**
     * Ajuste la quantité d'UNE TAILLE dans une commande de groupe.
     *
     * Une taille peut couvrir PLUSIEURS lignes de panier : la modale de
     * répartition crée une ligne par pièce (conf-size-quantity-modal.js:284).
     * On agit donc sur l'ensemble, et non sur un identifiant unique comme le
     * fait changeCartQty.
     *
     * @param {string} cle    - clé du groupe (cleGroupeCd)
     * @param {string} taille - taille visée, sans préfixe
     * @param {number} delta  - +1 ou -1
     */
    function changeGroupSizeQty(cle, taille, delta) {
      const lignes = cartItems.filter(function (i) {
        return cleGroupeCd(i) === cle &&
               (sansPrefixeCd(i.size, 'Taille') || '—') === taille;
      });
      if (!lignes.length) return;

      if (delta > 0) {
        lignes[0].qty = (Number(lignes[0].qty) || 0) + 1;
      } else {
        /* RETRAIT — on décrémente la dernière ligne, et on la SUPPRIME quand
           elle atteint zéro. changeCartQty, lui, plafonne à un minimum et ne
           descend jamais à zéro : retirer une taille y serait impossible. */
        const derniere = lignes[lignes.length - 1];
        const q = (Number(derniere.qty) || 0) - 1;
        if (q > 0) {
          derniere.qty = q;
        } else {
          const idx = cartItems.indexOf(derniere);
          if (idx !== -1) cartItems.splice(idx, 1);
          try {
            if (window.__designsPanier) delete window.__designsPanier[derniere.id];
          } catch (e) {}
        }
      }

      majResumeTailles(cle);

      cartCount = cartItems.reduce((s, i) => s + (i.qty || 0), 0);
      /* Le bouton panier reste VISIBLE même vide (voir configurateur.liquid) :
         seul le compteur retombe à zéro. */
      if (cartCount < 1) cartCount = 0;
      const cel = document.getElementById('hdr-cart-count');
      if (cel) cel.textContent = cartCount;
      persistCart();
      renderCartDrawer();
    }
    window.changeGroupSizeQty = changeGroupSizeQty;

    /**
     * Supprime TOUTES les lignes d'une commande de groupe.
     * @param {string} cle - clé du groupe (cleGroupeCd)
     */
    function removeGroupItems(cle) {
      const restants = [];
      cartItems.forEach(function (i) {
        if (cleGroupeCd(i) !== cle) { restants.push(i); return; }
        cartCount -= (Number(i.qty) || 0);
        /* La réserve mémoire suit CHAQUE ligne : sans cette purge, une session
           longue accumulerait les images de toute la commande supprimée. */
        try { if (window.__designsPanier) delete window.__designsPanier[i.id]; } catch (e) {}
      });
      cartItems.length = 0;
      Array.prototype.push.apply(cartItems, restants);

      /* Bouton panier toujours visible : seul le compteur retombe à zéro. */
      if (cartCount < 1) cartCount = 0;
      const cel = document.getElementById('hdr-cart-count');
      if (cel) cel.textContent = cartCount;
      persistCart();
      renderCartDrawer();
    }
    window.removeGroupItems = removeGroupItems;

    function removeCartItem(id) {
      const idx = cartItems.findIndex(i => i.id === id);
      if (idx !== -1) {
        cartCount -= cartItems[idx].qty;
        cartItems.splice(idx, 1);
      }
      /* La réserve mémoire suit la ligne : sans cela, une session longue
         accumulerait les images des articles supprimés. */
      try { if (window.__designsPanier) delete window.__designsPanier[id]; } catch (e) {}
      /* Bouton panier toujours visible : seul le compteur retombe à zéro. */
      if (cartCount < 1) cartCount = 0;
      const cartCountEl = document.getElementById('hdr-cart-count');
      if (cartCountEl) majPastillePanier(cartCountEl, cartCount);
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

      /* Le sélecteur du récapitulatif suit : la taille peut aussi être choisie
         depuis la grille du canvas ou restaurée depuis le panier, et les deux
         affichages ne doivent jamais diverger. */
      if (typeof window.syncSelectTaille === 'function') window.syncSelectTaille();

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

    /* PASTILLE DE COMPTE MASQUÉE À ZÉRO.

       Le bouton panier reste visible même vide (configurateur.liquid) : sans
       cela il porterait un « 0 » permanent, qui se lit comme une anomalie
       plutôt que comme un panier vide.

       Un OBSERVATEUR plutôt qu'une retouche des six points d'écriture du
       compteur : ils sont dispersés dans le fichier et un ajout futur en
       oublierait la règle. Ici, la pastille suit son contenu quoi qu'il
       arrive. */
    document.addEventListener('DOMContentLoaded', function () {
      var pastille = document.getElementById('hdr-cart-count');
      if (!pastille) return;
      var majPastille = function () {
        var n = parseInt(pastille.textContent, 10) || 0;
        pastille.style.visibility = n > 0 ? '' : 'hidden';
      };
      majPastille();
      new MutationObserver(majPastille)
        .observe(pastille, { childList: true, characterData: true, subtree: true });
    });

    /* ── File upload ── */
    // Registre des URLs Cloudinary (une par zone) une fois l'upload backend terminé
    window.CLOUDINARY_URLS = window.CLOUDINARY_URLS || {};

    /* ══════════════════════════════════════════════════════════════════════
       URLS HÉBERGÉES PERSISTÉES — le filet de sécurité du design.

       Le registre ci-dessus vit en MÉMOIRE : un rechargement l'efface. Deux
       conséquences, l'une visible et l'autre coûteuse :

       • le design disparaissait du vêtement au F5 quand la data-URL était trop
         lourde pour la session (saveUploadSafe abandonne au-delà de 300 000
         caractères) — il ne restait qu'une coquille `{src: null}` posée par
         saveUploadGeo ;
       • les articles partaient au checkout SANS leurs URLs, défaut déjà
         documenté plus bas (:5969).

       On persiste donc ces URLs. Quelques centaines d'octets par zone, contre
       plusieurs mégaoctets pour une data-URL : c'est précisément pourquoi
       elles avaient été choisies.

       Indexé PAR PRODUIT, comme le magasin d'uploads : le logo d'un sweatshirt
       n'a rien à faire sur un t-shirt.
       ══════════════════════════════════════════════════════════════════════ */
    var CLOUD_KEY = 'conf_cloud_urls';

    /** @returns {Object} le registre complet, par produit puis par zone. */
    function lireCloudUrls() {
      try {
        var brut = sessionStorage.getItem(CLOUD_KEY);
        var obj = brut ? JSON.parse(brut) : null;
        return (obj && typeof obj === 'object') ? obj : {};
      } catch (e) { return {}; }
    }

    /**
     * Mémorise l'URL hébergée d'une zone.
     * @param {string} zone
     * @param {string} url
     * @param {string} [owner] - produit propriétaire ; voir saveUpload pour la
     *   raison de ce paramètre (l'upload est asynchrone, le produit courant a
     *   pu changer entre-temps).
     */
    function memoriserCloudUrl(zone, url, owner) {
      if (!zone || !url) return;
      var produit = owner || currentProductType;
      if (!produit) return;
      try {
        var tout = lireCloudUrls();
        tout[produit] = tout[produit] || {};
        tout[produit][zone] = url;
        sessionStorage.setItem(CLOUD_KEY, JSON.stringify(tout));
      } catch (e) {
        /* Quota ou mode privé : sans conséquence immédiate — le design reste
           affiché et part avec la commande. Seule sa survie au F5 est perdue. */
      }
    }

    /** @returns {string} l'URL hébergée d'une zone pour le produit courant. */
    function cloudUrlDe(zone) {
      var tout = lireCloudUrls();
      var parProduit = tout[currentProductType];
      return (parProduit && parProduit[zone]) || '';
    }
    window.cloudUrlDe = cloudUrlDe;

    /* REPEUPLEMENT AU DÉMARRAGE : le registre mémoire est reconstruit depuis la
       session. Sans lui, `window.CLOUDINARY_URLS` resterait vide après un F5 et
       les images partiraient en commande sans leur adresse. */
    document.addEventListener('DOMContentLoaded', function () {
      try {
        var parProduit = lireCloudUrls()[currentProductType];
        if (!parProduit) return;
        Object.keys(parProduit).forEach(function (z) {
          if (!window.CLOUDINARY_URLS[z]) window.CLOUDINARY_URLS[z] = parProduit[z];
        });
      } catch (e) {}
    });

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
             l'aperçu reste instantané et net.

             ISOLÉ DU RESTE DE LA CHAÎNE. Une exception d'affichage remontait
             jusqu'au `.catch` de l'envoi Cloudinary plus bas, qui l'attribuait
             au réseau — et la persistance de l'image n'était jamais atteinte.
             C'est ainsi qu'un défaut de vignette a fait perdre les designs de
             patch, sous un message parlant d'upload.

             Un aperçu manquant est visible et rattrapable ; une image non
             mémorisée est perdue en silence. L'affichage ne doit donc jamais
             pouvoir emporter la mémorisation. */
          try {
            window.applyUpload(zone, src);
          } catch (e) {
            console.warn('Affichage du design échoué (' + zone + ') :', e);
          }

          /* Persistance PROVISOIRE, le temps que l'upload Cloudinary aboutisse.

             saveUploadSafe compresse et borne elle-même — la compression a été
             déplacée au point d'écriture pour qu'aucun chemin ne la contourne
             (voir son commentaire). Asynchrone : elle ne retarde pas
             l'affichage ci-dessus.

             Dès que l'URL Cloudinary arrive (plus bas), elle REMPLACE cette
             base64 : le cas nominal ne laisse donc que quelques octets en
             session. Cette copie ne subsiste que si l'upload échoue — réseau
             coupé, backend indisponible — et permet alors au design de
             survivre quand même à un rechargement.

             La géométrie est enregistrée séparément par saveUploadGeo() et
             n'est pas affectée. */
          saveUploadSafe(zone, src, uploadOwner);

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
                  /* EN SESSION AUSSI : le registre mémoire ci-dessus ne
                     survit pas à un rechargement. C'est cette copie qui permet
                     au design de revenir après un F5, et aux articles de
                     partir en commande avec leur visuel. */
                  memoriserCloudUrl(zone, res.url, uploadOwner);
                  confLog('☁️ Uploadé sur Cloudinary (' + zone + ') :', res.url);

                  /* L'URL REMPLACE la base64 en session.

                     L'image était mémorisée DEUX FOIS : la base64 en session
                     (plusieurs Mo, jetable) et cette URL en mémoire volatile
                     (quelques octets, utile). C'est la mauvaise qui survivait au
                     rechargement — d'où la saturation du quota, et un second
                     défaut : window.CLOUDINARY_URLS étant vide après un F5, les
                     assets partaient au checkout sans leurs URLs.

                     On persiste donc l'URL. La session passe de plusieurs
                     mégaoctets à quelques centaines d'octets par zone, et
                     applyUpload la repose telle quelle à la restauration — elle
                     ne fait aucune hypothèse sur la forme du `src`. */
                  saveUploadSafe(zone, res.url, uploadOwner);
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

        /* FORMATS SANS TRANSPARENCE : on sort tout de suite.

           Cette fonction ne retire que des pixels DEJA INVISIBLES (voir
           l'en-tete). Un JPEG n'en possede aucun : il n'y a rien a rogner, et
           le traitement ne peut que couter.

           Et il coutait cher sur mobile : le canvas ci-dessous est alloue en
           PLEINE RESOLUTION, et getImageData y lit tout d'un coup — pour une
           photo iPhone de 4032x3024, un buffer RGBA de 48 Mo. Safari iOS refuse
           l'appel ou rend un backing store purge sous pression memoire ;
           l'image repartait alors en PNG (8 a 10 fois plus lourde) et saturait
           sessionStorage des la premiere photo.

           Sortir ici supprime la cause a la racine, sans rien changer au rendu :
           l'image rendue est exactement celle recue. */
        if (/^data:image\/(jpe?g|bmp)/i.test(dataUrl)) {
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

            /* Format d'ORIGINE conservé.

               Le PNG était imposé « au cas où » l'image aurait de la
               transparence. Mais un JPEG n'en a AUCUNE par construction : le
               réencoder en PNG multiplie son poids par 8 à 10 sans rien
               préserver.

               C'est ce qui saturait sessionStorage sur mobile dès la première
               photo. Le préfixe PNG posé ici faisait ensuite basculer
               compressForStorage() (:4528) du côté « conserver l'alpha », et son
               garde hasAlpha() — qui aurait constaté l'opacité — échoue sur iOS
               (getImageData sur un canvas de 48 Mo, refusé ou vidé sous pression
               mémoire, avec un repli à `true`). Résultat : un PNG de 3 à 5 Mo
               en base64, soit 6 à 10 Mo en session, là où un JPEG en pesait 0,8.

               On ne réencode donc en PNG que si l'entrée POUVAIT porter de
               l'alpha. Pour un JPEG, on reste en JPEG — qualité 0.92, le
               rognage n'étant pas l'étape de compression (c'est le rôle de
               compressForStorage). */
            var peutAvoirAlpha = /^data:image\/(png|webp|gif)/i.test(dataUrl);
            resolve(peutAvoirAlpha
              ? out.toDataURL('image/png')
              : out.toDataURL('image/jpeg', 0.92));
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

    /* Exposées : conf-cart-open-design.js repose le design mémorisé par une
       ligne de panier et doit le normaliser exactement comme le fait la
       restauration d'un design partagé — même format attendu en aval. */
    window.migrateUploadStore = migrateUploadStore;
    window.sanitizeUploadSrcs = sanitizeUploadSrcs;

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
          /* TENTATIVE DE RECUPERATION avant d alerter.

             Le code se contentait d avertir et de rendre false : aucune
             seconde chance. Or la cause la plus frequente est un ancien
             design encore en session pour un produit que le client a quitte.

             On evince donc les uploads des AUTRES produits et on reessaie.
             Le design courant, seul visible a l ecran, est preserve — c est
             lui que la restauration doit couvrir. La modale ne s affiche que
             si cette tentative echoue elle aussi. */
          try {
            var courant = (typeof currentProductType !== "undefined") ? currentProductType : null;
            if (courant && store && store.byProduct && store.byProduct[courant]) {
              var reduit = { _v: store._v, byProduct: {} };
              reduit.byProduct[courant] = store.byProduct[courant];
              sessionStorage.setItem("conf_uploads", JSON.stringify(reduit));
              console.warn("Stockage sature : uploads des autres produits evinces.");
              return true;
            }
          } catch (e2) { /* la tentative a echoue : on poursuit vers l alerte */ }

          /* AUCUNE MODALE — décision produit, assumée.

             Elle interrompait le client alors que rien n'est cassé pour lui :
             le design reste AFFICHÉ (l'application directe ne dépend pas de la
             session) et part BIEN avec la commande, qui transporte ses propres
             URL. Elle s'ouvrait notamment à chaque réouverture d'un article du
             panier, où il n'y avait rien à corriger — et son conseil
             « utilisez une image plus légère » n'avait alors aucun sens.

             Le seul cas non couvert : un client qui recharge la page après un
             upload très lourd perd ce design sans avoir été prévenu. C'est le
             compromis retenu, l'interruption étant jugée plus coûteuse que ce
             cas limite.

             L'avertissement console demeure : il documente la situation pour
             le diagnostic, sans rien imposer au client. */
          console.warn('Stockage local saturé : le design ne survivra pas au rechargement.', e);
        } else {
          // Mode privé Safari, cookies bloqués… : l'affichage reste correct.
          console.warn('Écriture dans sessionStorage impossible :', e);
        }
        return false;
      }
    }

    /* Exposée : conf-cart-open-design.js repose le design d'une ligne de panier
       et doit bénéficier de la MÊME gestion du quota — éviction des autres
       produits puis nouvelle tentative. Elle écrivait en direct, et un design
       trop lourd échouait sans seconde chance. */
    window.writeUploadStore = writeUploadStore;

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
      console.log('[ecrit] zone=' + zone + ' produit=' + product +
                  ' | relu=' + !!((readUploadStore().byProduct[product] || {})[zone] || {}).src);
    }
    /* Plafond DUR de ce qu'une zone peut peser en session.

       sessionStorage plafonne à ~5 Mo par origine, et une image y coûte le
       DOUBLE de sa data-URL (stockage UTF-16). 300 000 caractères ≈ 600 Ko
       réels : huit zones tiennent donc largement.

       Au-delà, on n'écrit RIEN plutôt que de saturer : le design reste affiché
       et part avec la commande, seule sa survie à un rechargement est perdue —
       préférable à une modale d'erreur. */
    const MAX_SRC_SESSION = 300000;

    /* POINT D'ÉCRITURE UNIQUE des images en session.

       La compression vivait chez l'APPELANT — doUpload était le seul à appeler
       compressForStorage — si bien que les autres chemins l'ignoraient :
       conf-patches.js persistait la sortie brute du détourage, un PNG pleine
       résolution avec transparence, plusieurs mégaoctets. Il saturait le quota
       à lui seul, et c'est lui qui faisait réapparaître la modale malgré le
       correctif précédent.

       La compression appartient donc ici : aucun appelant, présent ou futur, ne
       peut plus la contourner.

       PRIORITÉ À L'URL : quand l'image est déjà hébergée (Cloudinary, CDN du
       thème), on la stocke telle quelle — quelques dizaines d'octets au lieu de
       plusieurs mégaoctets. C'est le cas nominal ; la compression n'est qu'un
       repli pour la fenêtre où l'upload n'a pas encore abouti. */
    function saveUploadSafe(zone, src, owner) {
      if (!src) return Promise.resolve(false);

      // Déjà une URL hébergée : rien à compresser, rien à craindre.
      if (!/^data:/i.test(src)) {
        saveUpload(zone, src, owner);
        return Promise.resolve(true);
      }

      return compressForStorage(src).then(function (stored) {
        var valeur = stored || src;
        if (valeur.length <= MAX_SRC_SESSION) {
          saveUpload(zone, valeur, owner);
          return true;
        }
        /* Trop lourde même compressée : une réduction plus franche avant
           d'abandonner. La copie de session n'a pas à être belle — l'écran
           affiche la pleine résolution depuis le DOM et la commande part avec
           l'URL Cloudinary. Elle sert seulement à survivre à un F5. */
        return reduireFort(valeur).then(function (petite) {
          if (petite && petite.length <= MAX_SRC_SESSION) {
            saveUpload(zone, petite, owner);
            return true;
          }
          console.warn('Image trop lourde pour la session (' +
                       Math.round(valeur.length / 1024) + ' Ko) : non mémorisée. ' +
                       'Le design reste affiché et sera transmis avec la commande.');
          return false;
        });
      });
    }

    /* Réduction de dernier recours : 600 px, JPEG, transparence abandonnée.

       Volontairement plus agressive que compressForStorage (1400 px, PNG si
       alpha) : à ce stade on cherche à faire tenir une image de SECOURS, pas à
       préserver la qualité — celle-ci vit dans le DOM et sur Cloudinary. Un
       JPEG 600 px pèse ~50 Ko en session. */
    function reduireFort(dataUrl) {
      return new Promise(function (resolve) {
        if (/^data:image\/svg\+xml/i.test(dataUrl)) return resolve(dataUrl);
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth, h = img.naturalHeight;
            if (!w || !h) return resolve(null);
            var scale = Math.min(1, 600 / Math.max(w, h));
            var cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(w * scale));
            cv.height = Math.max(1, Math.round(h * scale));
            var ctx = cv.getContext('2d');
            /* Fond blanc : le JPEG ignore la transparence, et sans ce
               remplissage les zones transparentes sortiraient en NOIR. */
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            resolve(cv.toDataURL('image/jpeg', 0.7));
          } catch (err) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = dataUrl;
      });
    }

    /* Produit visité juste avant le courant : conservé en session, un
       aller-retour entre deux textiles étant un geste de comparaison courant. */
    var produitPrecedent = null;

    /**
     * Ne garde en session que les designs du produit courant et du précédent.
     *
     * Appelée au CHANGEMENT de produit, donc AVANT toute saturation — là où
     * l'éviction de writeUploadStore n'intervient qu'une fois le quota dépassé,
     * trop tard pour éviter la modale.
     *
     * @param {string} produitCourant - type du produit qu'on vient de choisir
     */
    function elaguerUploads(produitCourant) {
      if (!produitCourant) return;

      /* PREMIER passage : on n'élague PAS, on se contente de mémoriser.

         `selProd` s'exécute au chargement de la page pour poser le produit
         initial. À ce moment `produitPrecedent` vaut encore null : l'élagage
         ne gardait donc que le produit affiché et SUPPRIMAIT les designs de
         tous les autres — alors qu'ils venaient tout juste d'être restaurés
         depuis la session.

         C'est ce qui vidait le canvas en revenant au design d'un article du
         panier : la couleur se rétablissait, mais logos et textes avaient été
         effacés du stockage entre-temps.

         L'élagage n'a de sens qu'à un VRAI changement de produit, c'est-à-dire
         à partir du deuxième appel. */
      if (produitPrecedent === null) {
        produitPrecedent = produitCourant;
        return;
      }

      /* Retour au design d'un article du PANIER : ce chemin clique la carte
         produit, donc passe ici — mais il ne s'agit pas d'un changement d'avis.
         Purger les autres produits ferait disparaître les designs des autres
         lignes du panier, que le client peut vouloir rouvrir ensuite. */
      if (window.__ouvertureDepuisPanier) {
        produitPrecedent = produitCourant;
        return;
      }

      try {
        var store = readUploadStore();
        if (!store || !store.byProduct) return;

        var garder = {};
        garder[produitCourant] = 1;
        if (produitPrecedent !== produitCourant) {
          garder[produitPrecedent] = 1;
        }

        var modifie = false;
        Object.keys(store.byProduct).forEach(function (p) {
          if (!garder[p]) { delete store.byProduct[p]; modifie = true; }
        });
        if (modifie) writeUploadStore(store);

        if (produitPrecedent !== produitCourant) produitPrecedent = produitCourant;
      } catch (e) {
        // Session illisible (mode privé, cookies bloqués) : rien à élaguer.
      }
    }

    /* Exposé : conf-patches.js persiste ici l'image détourée du mode
       « découpé à la forme », pour qu'elle survive au rechargement.

       C'est saveUploadSafe qui est exposée, PAS saveUpload : ce chemin
       persistait un PNG pleine résolution avec transparence — plusieurs Mo — et
       saturait la session à lui seul. En passant par la version sûre, il hérite
       de la compression et du plafond sans avoir à être modifié.

       Le contrat change légèrement (une Promise est renvoyée), mais les
       appelants existants ignorent la valeur de retour : rien à adapter. */
    window.saveUpload = saveUploadSafe;
    window.saveUploadSafe = saveUploadSafe;

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
      /* L'URL HÉBERGÉE PART AUSSI — et d'abord, car la suite peut sortir tôt.

         La restauration s'en sert de repli quand la session n'a pas gardé
         l'image : la laisser ferait REVENIR au rechargement un logo que le
         client vient de supprimer. */
      try {
        var toutCloud = lireCloudUrls();
        if (toutCloud[currentProductType]) {
          delete toutCloud[currentProductType][zone];
          if (!Object.keys(toutCloud[currentProductType]).length) {
            delete toutCloud[currentProductType];
          }
          sessionStorage.setItem('conf_cloud_urls', JSON.stringify(toutCloud));
        }
      } catch (e) {}
      if (window.CLOUDINARY_URLS) delete window.CLOUDINARY_URLS[zone];

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

      /* ZONES DES DEUX SOURCES. Une zone peut n'exister que dans les URLs
         hébergées : si la data-URL a été refusée par la session ET que le logo
         n'a jamais été déplacé, `conf_uploads` ne porte aucune entrée pour
         elle. Ne parcourir que ce magasin la laisserait de côté. */
      const zones = Object.keys(u);
      try {
        const cloudProduit = lireCloudUrls()[currentProductType] || {};
        Object.keys(cloudProduit).forEach(function (z) {
          if (zones.indexOf(z) === -1) zones.push(z);
        });
      } catch (e) {}

      zones.forEach(zone => {
        const entry = u[zone];
        /* REPLI SUR L'URL HÉBERGÉE quand la session n'a pas gardé l'image.

           Le cas est fréquent : saveUploadGeo pose `{src: null}` dès que le
           logo s'affiche, et saveUploadSafe renonce ensuite si la data-URL
           dépasse le plafond de session. Restait une coquille — géométrie
           sans image — et le design disparaissait au rechargement.

           L'URL hébergée, elle, tient en quelques centaines d'octets.
           applyUpload ne fait aucune hypothèse sur la forme de la source :
           une adresse `https` s'y pose comme une data-URL. */
        const src = (typeof entry === 'string')
          ? entry
          : ((entry && entry.src) || cloudUrlDe(zone));
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
    /* Rastérise le texte d'une zone en data-URL PNG transparente, SANS réseau
       (contrairement à collectTextAssets, qui téléverse sur Cloudinary).
       Exposée pour updateTextRecap() (conf-text-editor.js), qui en fait la
       vignette des lignes « Texte » du récapitulatif.

       Retour HYBRIDE : une string pour un texte simple, une Promise<string>
       pour un texte courbé (rastérisé depuis son SVG). L'appelant doit donc
       faire `await Promise.resolve(...)`, comme collectTextAssets (:2400). */
    window.textAssetDataUrl = textAssetDataUrl;
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
       doit pouvoir remplir sa zone comme le fait un logo.

       REVENU À UNE LIMITE FERME, à la demande : 200 px laissait la zone seule
       arbitrer, et un mot court comme « Papa » y atteignait 34 px — trop grand
       pour un flocage de poitrine.

       20 px est désormais le plafond RÉEL, celui que le client rencontrera.

       Il couvre les DEUX chemins d'agrandissement, car tous deux passent par
       clampTextToZone (conf-text-clamp.js:162, :171) :
         • la jauge de la barre d'outils — qui lit cette valeur pour son `max`
           (conf-text-toolbar.js:594) ;
         • l'étirement à la poignée, qui serait sinon resté libre.

       C'est aussi ce qui rend la borne indispensable : `clampTextToZone`
       compare `cur` et `wanted` à cette valeur, un `undefined` fausserait ces
       tests en permanence. */
    var MAX_TEXT_SIZE = 20;
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

    /* LARGEUR MAXIMALE DU TEXTE — contrainte atelier, en centimètres.

       La zone poitrine mesure 24 % du visuel, soit 42,4 cm sur un sweat : très
       au-delà de ce qu'un flocage de nom accepte. Le texte pouvait donc être
       étiré sur presque toute la largeur du buste.

       Conversion : les % de ce fichier sont des % du visuel, et CM[produit].w
       donne le facteur cm -> %. Contrôle inverse sur une valeur connue :
       17 % / (30/53) = 30,0 cm, exactement la limite « L30 max » du dos
       documentée plus haut — la formule est donc la bonne.

       20 cm valent ainsi ~11,3 % sur les deux familles de produits.

       Valeur passée de 12,5 à 20 cm après essai : à 12,5 cm, un prénom court
       comme « Papa » était déjà réduit au point d'être rogné. 20 cm laissent
       la place d'un nom complet à taille lisible, tout en restant nettement en
       deçà de la zone d'origine (24 %, soit 42,4 cm — le texte pouvait s'étirer
       jusqu'aux coutures latérales). */
    var TEXT_MAX_CM = 20;

    /* HAUTEUR du texte : bornée par la ZONE de poitrine (9 % du visuel, soit
       6,8 cm réels), et non par une constante propre.

       Un plafond dédié a été essayé à 9 cm — proportionné aux 20 cm de largeur
       ci-dessus, dans un rapport 2:1 usuel en flocage. Le rendu s'est révélé
       TROP GRAND à l'usage : « Papa » atteignait 34 px et couvrait presque tout
       le buste.

       La hauteur de zone est donc le bon plafond. Ce n'est pas un oubli : le
       rapport 3:1 qu'elle produit correspond à ce qu'un flocage de poitrine
       doit rester — un texte large et discret, pas un visuel dorsal. */

    /* VUE DE FACE UNIQUEMENT. Le dos garde sa zone d'origine (17 %, soit les
       30 cm de la contrainte atelier « L30 max ») : un visuel dorsal occupe
       légitimement toute la largeur imprimable, ce n'est pas un flocage de nom. */
    var TEXT_MAX_ZONES = { f: 1, fr: 1 };

    function textZone(zone) {
      var z = (typeof LOGO_ZONES !== 'undefined') ? LOGO_ZONES[zone] : null;
      if (!z) return null;
      var hh = z.height * TEXT_ZONE_RATIO;


      /* La zone sert à DEUX choses dans clampTextToZone() : plafonner la
         TAILLE du texte, mais aussi borner sa POSITION (:143-148). Rétrécir la
         zone elle-même enfermait donc le texte dans un couloir étroit et
         centré — il ne pouvait plus être déplacé sur le buste.

         On expose donc deux valeurs distinctes :
           width    la zone de DÉPLACEMENT, inchangée (24 %) ;
           maxWidth le plafond de LARGEUR du texte (20 cm), lu par le clamp.

         `maxWidth` est absent pour le dos : sa zone de 30 cm correspond déjà à
         la contrainte atelier, aucun plafond supplémentaire n'y a de sens. */
      var maxW = null;
      if (TEXT_MAX_ZONES[zone]) {
        /* MOBILE : la moitié de la zone, et non une conversion en centimètres.

           `TEXT_MAX_CM * ref.w` traduit 20 cm en % du CONTENEUR — le référentiel
           du desktop. Le calque mobile, lui, est calé sur l'IMAGE (voir
           syncLayerToImage) et sa zone de poitrine fait 38 % au lieu de 24 %.
           Appliqué tel quel, ce plafond ne laissait au texte que 30 % de sa
           zone contre 47 % sur ordinateur : le mot se réduisait à un trait.

           Les deux référentiels ne sont pas convertibles — le rapport
           image/conteneur n'est pas une constante, c'est ce que documente déjà
           l'en-tête des zones mobile. On raisonne donc en PROPORTION de la
           zone, la seule grandeur qui garde le même sens des deux côtés.

           50 % : proche des 47 % obtenus sur ordinateur, donc un rendu
           cohérent d'un appareil à l'autre. */
        var estMobile = window.matchMedia('(max-width: 767px)').matches;
        if (estMobile) {
          maxW = z.width * 0.5;
        } else if (typeof CM !== 'undefined') {
          /* Le facteur cm -> % suit la SILHOUETTE, pas le tissu : le polyester
             partage le cadrage du t-shirt coton, et CM n'a donc que deux
             entrées. Même repli que buildZones() (:1474). */
          var ref = (currentProductType === 'sweatshirt') ? CM.sweatshirt : CM.tshirt;
          if (ref && ref.w) maxW = Math.min(z.width, TEXT_MAX_CM * ref.w);
        }
      }

      return {
        left: z.left,
        top: z.top + (z.height - hh) / 2,   // bandeau centré verticalement
        width: z.width,
        height: hh,
        maxWidth: maxW,
        /* Position de DÉPART, propre à chaque zone — à ne pas confondre avec
           `left`, qui est le bord GAUCHE de la zone et sert de borne minimale.

           Les zones 'f' et 'fr' partagent le même rectangle (zone-chest) : sans
           cette distinction, deux textes jamais déplacés recevaient la même
           position de repli et se SUPERPOSAIENT au rechargement — « Papa » et
           « Maman » côte à côte revenaient l'un sur l'autre.

           On reprend `startLeft` des logos (LOGO_ZONES :1468 et :1475), qui
           résout déjà ce problème pour eux : 'f' démarre à droite du bandeau,
           'fr' à gauche. Le texte étant plus large qu'un logo, on borne pour
           que la position de départ reste dans la zone. */
        startLeft: (z.startLeft != null)
          ? Math.max(z.left, Math.min(z.startLeft, z.left + z.width))
          : z.left
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

    /**
     * Facteur de conversion entre une taille de police EN PIXELS D'ÉCRAN et sa
     * taille RÉELLE en centimètres imprimés.
     *
     * Pourquoi c'est nécessaire : le curseur de taille pilote `font-size`, une
     * valeur en pixels dont la signification dépend de la largeur du calque —
     * donc de l'appareil. Un même réglage donne 0,05 cm sur ordinateur et
     * 0,10 cm sur téléphone : deux clients obtiennent des flocages différents,
     * et sur mobile la plage utile devient si étroite que le curseur ne peut
     * plus bouger (min et max se rejoignent à 8 px).
     *
     * On réutilise `CM`, la table qui sert déjà à borner la largeur du texte à
     * 20 cm (textZone) — plutôt que d'introduire un second facteur, qui
     * divergerait du premier au premier ajustement de gabarit.
     *
     * @returns {number} pixels d'écran par centimètre, ou 0 si non mesurable
     */
    function pxParCm() {
      var layer = document.getElementById('logo-layer');
      if (!layer) return 0;
      var lb = layer.getBoundingClientRect();
      if (!lb.width) return 0;
      /* Le facteur suit la SILHOUETTE : le polyester partage le cadrage du
         t-shirt coton, d'où le repli — même règle que textZone. */
      var ref = (currentProductType === 'sweatshirt') ? CM.sweatshirt : CM.tshirt;
      if (!ref || !ref.w) return 0;
      return lb.width * ref.w;
    }
    window.pxParCm = pxParCm;

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


    /* ══════════════════════════════════════════════════════════════════════
       ÉCRAN DE CHOIX DU MODE — première étape du parcours
       ══════════════════════════════════════════════════════════════════════ */

    var MODE_KEY = 'conf_mode_perso';

    /* ══════════════════════════════════════════════════════════════════════
       UN DESIGN PAR MODE

       Les deux modes — libre et groupe — partageaient le même espace de
       travail : composer un design en libre puis basculer en groupe le
       retrouvait intact, mélangeant deux commandes sans rapport.

       On ne l'EFFACE pas pour autant : le design du mode quitté est RANGÉ, et
       y revenir le retrouve. L'intention d'origine (« perdre son travail
       serait brutal », :7082) est préservée, la confusion disparaît.

       Ce qui appartient au design : textes, images, couleurs, finitions,
       option manches, et la liste des surnoms — sans objet en mode libre.
       Ce qui reste COMMUN : le produit choisi (un choix transverse) et le
       panier, qui ne doit jamais être touché.
       ══════════════════════════════════════════════════════════════════════ */

    /** Clé de rangement du design d'un mode. */
    function cleDesignMode(mode) {
      return 'conf_design_mode_' + mode;
    }

    /* Clés de session qui composent le design en cours. `conf_current_product`
       en est ABSENT volontairement : changer de mode ne doit pas ramener au
       sweatshirt si le client travaillait sur un t-shirt. */
    var CLES_DESIGN = [
      'conf_texts', 'conf_uploads', 'conf_current_color', 'conf_patch_color',
      'conf_coin_finish', 'conf_flag_color', 'conf_flag_color_name',
      'conf_sleeve_opt', 'conf_group_rows',
      /* Les URLs hébergées suivent le design : sans cette ligne, celles d'un
         mode ressurgiraient dans l'autre au rechargement. */
      'conf_cloud_urls'
    ];

    /**
     * Range le design du mode qu'on quitte.
     * @param {string} mode - mode sortant
     */
    function rangerDesignMode(mode) {
      if (!mode) return;
      var paquet = {};
      try {
        for (var i = 0; i < CLES_DESIGN.length; i++) {
          var v = sessionStorage.getItem(CLES_DESIGN[i]);
          if (v !== null) paquet[CLES_DESIGN[i]] = v;
        }
        sessionStorage.setItem(cleDesignMode(mode), JSON.stringify(paquet));
      } catch (e) {
        /* QUOTA DÉPASSÉ — deux designs pèsent plus qu'un, et l'espace de
           session est limité. On abandonne le rangement plutôt que de garder
           un paquet partiel : mieux vaut un vêtement vierge au retour qu'un
           design à moitié restauré, dont le client ne comprendrait pas l'état. */
        try { sessionStorage.removeItem(cleDesignMode(mode)); } catch (e2) {}
      }
    }

    /**
     * Retire tous les logos AFFICHÉS, dans leurs quatre emplacements.
     *
     * UN LOGO VIT À QUATRE ENDROITS : le calque du vêtement (`logo-f`…), la
     * vignette du panneau Upload (`up-preview-f`…), l'ancienne barre latérale
     * (`pf`/`if`/`lf`…) et le champ de fichier (`uf`…).
     *
     * N'en vider qu'un ne suffit pas — et c'est ce qui faisait échouer
     * l'isolation entre modes. Le stock de logos en mémoire se RECONSTRUIT en
     * lisant `#i{zone}` (conf-logo-store.js:36-60) : tant que cette image
     * garde son `src`, le stock se repeuple et se réinjecte sur le vêtement
     * (:2327). Mettre LOGO_STORE à null sans vider `#i{zone}` ne sert donc à
     * rien.
     *
     * On délègue à rmUp() (conf-share.js:821), qui fait déjà exactement ce
     * travail — vignettes du récap comprises, et cas particuliers des coins,
     * drapeaux et patchs délégués à leurs modules. Réécrire ce nettoyage
     * garantirait qu'il diverge du premier au prochain ajout de zone.
     *
     * ORDRE : rmUp supprime AUSSI l'entrée en session (removeUpload, :6178).
     * Le rangement du design sortant doit donc être terminé avant l'appel,
     * sinon on rangerait un paquet déjà amputé.
     */
    /**
     * Retire les logos de l'écran.
     *
     * @param {boolean} [affichageSeul] - true pour ne vider QUE l'affichage,
     *   en laissant la session intacte.
     *
     * `rmUp` supprime AUSSI l'entrée en session. C'est voulu au changement de
     * mode — le design de l'ancien mode ne doit pas réapparaître. Mais au
     * retour à l'écran de choix, cet effacement rendait les commandes du
     * panier irrécupérables : leur vignette ne retrouvait plus aucune image.
     *
     * D'où ce second mode, qui se contente de masquer les calques.
     */
    function viderLogosAffiches(affichageSeul) {
      /* Invalide toute restauration différée encore en vol (:1041) : sans ce
         jeton, un setTimeout parti avant le nettoyage reposerait le design de
         l'ancien mode 200 ms plus tard. */
      window.__genDesignMode = (window.__genDesignMode || 0) + 1;

      var ZONES = [
        'f', 'fr', 'b', 'sl', 'sr', 'c',
        'coin-recto', 'coin-verso', 'flag-recto', 'flag-verso'
      ];

      if (affichageSeul) {
        /* On masque les calques du DOM, sans toucher au stockage. Les zones
           d'un autre produit sont simplement absentes. */
        var IDS = {
          f: 'logo-f', fr: 'logo-fr', b: 'logo-b', sl: 'logo-sl', sr: 'logo-sr',
          c: 'patch-logo',
          'coin-recto': 'coin-logo-recto', 'coin-verso': 'coin-logo-verso',
          'flag-recto': 'flag-logo-recto', 'flag-verso': 'flag-logo-verso'
        };
        for (var i = 0; i < ZONES.length; i++) {
          var el = document.getElementById(IDS[ZONES[i]]);
          if (el) el.style.display = 'none';
        }
        return;
      }

      if (typeof window.rmUp !== 'function') return;
      for (var z = 0; z < ZONES.length; z++) {
        /* Une zone absente du produit courant (un coin n'a pas de manches)
           doit rester sans effet, pas interrompre le nettoyage des autres. */
        try { window.rmUp(ZONES[z]); } catch (e) {}
      }
    }

    /**
     * Écrit en session le design d'un mode — SANS toucher à l'affichage.
     *
     * C'est tout ce que le rechargement demande : le démarrage lira ces clés
     * et reconstruira l'écran par son chemin habituel.
     *
     * @param {string} mode - mode entrant
     */
    function poserDesignModeEnSession(mode) {
      var paquet = null;
      try {
        var brut = sessionStorage.getItem(cleDesignMode(mode));
        if (brut) paquet = JSON.parse(brut);
      } catch (e) { paquet = null; }

      try {
        for (var i = 0; i < CLES_DESIGN.length; i++) {
          var k = CLES_DESIGN[i];
          /* Absente du paquet = le mode n'avait pas cette valeur. On SUPPRIME
             plutôt que de laisser celle du mode précédent : c'est ce qui
             faisait persister la couleur d'un mode à l'autre. */
          if (paquet && paquet[k] != null) sessionStorage.setItem(k, paquet[k]);
          else sessionStorage.removeItem(k);
        }
      } catch (e) {}
    }

    /* Le nettoyage manuel de l'espace de travail — vidage du stock mémoire,
       des vignettes, reprojection dans le DOM — a été RETIRÉ : le rechargement
       de page le fait entièrement, et de façon exhaustive. Le conserver aurait
       laissé deux chemins d'isolation, dont le second aurait divergé du
       premier au prochain ajout de zone. */

    /**
     * Bascule de mode AVEC RECHARGEMENT de la page.
     *
     * POURQUOI RECHARGER plutôt que nettoyer à la main.
     *
     * Le design ne vit pas qu'en session : stock de logos en mémoire (qui se
     * reconstruit en lisant le DOM), vignettes de panneau, champs de fichier,
     * variables de module. Et les fonctions de restauration du projet
     * AJOUTENT sans jamais remettre par défaut — restoreColor (:1096) ne fait
     * rien quand le mode entrant n'a pas de couleur, laissant celle du mode
     * précédent à l'écran.
     *
     * Nettoyer à la main exige donc de connaître chaque état, et le prochain
     * élément ajouté au configurateur devra y penser aussi. Trois correctifs
     * successifs ont révélé trois fuites différentes.
     *
     * Le rechargement supprime la question : l'état mémoire repart de zéro par
     * construction, et le design se restaure par le chemin du DÉMARRAGE —
     * celui qui est éprouvé à chaque visite, pas un second chemin qui
     * divergerait. Même mécanique que le bouton « Réinitialiser » (:3709), en
     * rangeant au lieu d'effacer.
     *
     * @param {string} sortant
     * @param {string} entrant
     * @returns {boolean} true si un rechargement est lancé (l'appelant doit
     *   alors s'arrêter : la page est en train de partir).
     */
    function basculerModeAvecRechargement(sortant, entrant) {
      if (window.__ouvertureDepuisPanier) return false;

      /* `sortant` vaut null après un passage par l'écran de choix, qui a
         retiré le mode (:7307). On recharge QUAND MÊME : le design y a été
         rangé, mais l'état mémoire du mode précédent, lui, est toujours vivant.
         Ne sortir que si l'on reprend exactement le même mode sans détour. */
      if (sortant && sortant === entrant) return false;

      if (sortant) rangerDesignMode(sortant);

      /* L'ORDRE COMPTE : la session doit porter le design du mode entrant
         AVANT le rechargement — c'est elle que le démarrage lira. */
      try { sessionStorage.setItem(MODE_KEY, entrant); } catch (e) {}
      poserDesignModeEnSession(entrant);

      window.location.href = '/pages/configurateur';
      return true;
    }

    /**
     * Quitte l'écran de choix et révèle le configurateur.
     *
     * @param {string} mode - 'individuelle' ou 'groupe'
     * @param {boolean} [reprise] - true quand l'appel vient de la reprise de
     *   session au chargement : le design ne doit alors PAS être permuté.
     */
    /**
     * Ajuste la barre « Mode actuel » selon que le mode a été CHOISI ou IMPOSÉ.
     *
     * Choisir un coin, un drapeau ou un patch depuis l'écran de choix bascule
     * d'office en mode libre (conf-sidebar-modern.js) : ces produits ne portent
     * pas de surnom, la commande de groupe n'a aucun sens pour eux.
     *
     * Mais le mode s'enregistrait alors comme une DÉCISION du client. Reprenant
     * un sweatshirt, il restait en mode libre sans jamais avoir choisi — ni su
     * qu'une alternative existait.
     *
     * La barre explique donc la contrainte, là où le client regarde déjà. Elle
     * redevient neutre dès qu'il reprend un textile : la règle ne s'applique
     * plus, et un message qui persiste devient un reproche.
     */
    function majBarreMode() {
      var barre = document.getElementById('mode-actuel');

      /* BARRE RECONSTRUITE SI ELLE A DISPARU.

         Les canvas des coins, drapeaux et patchs remplacent tout le contenu du
         canvas (`canvasParent.innerHTML`, conf-dynamic-layout.js:300, 586,
         891) : la barre, qui y vivait, partait avec — et le message
         n'apparaissait jamais sur les produits qu'il concerne, précisément.

         On la recrée au besoin, en tête du canvas. Elle est réinjectée à
         chaque changement de produit, donc toujours présente là où elle doit
         l'être. */
      if (!barre) {
        var canvas = document.querySelector('.canvas');
        if (!canvas) return;
        barre = document.createElement('div');
        barre.className = 'mode-actuel';
        barre.id = 'mode-actuel';
        barre.innerHTML =
          '<span class="mode-actuel-lbl"></span>' +
          '<button type="button" class="mode-actuel-btn" ' +
                  'onclick="retourChoixMode()">Changer de mode</button>';
        canvas.insertBefore(barre, canvas.firstChild);
      }

      var lbl = barre.querySelector('.mode-actuel-lbl');
      if (!lbl) return;

      var impose = null;
      try { impose = sessionStorage.getItem('conf_mode_impose'); } catch (e) {}

      var NOMS = {
        coins: 'Les coins',
        drapeaux: 'Les drapeaux',
        patches: 'Les patchs'
      };
      /* La contrainte ne vaut que tant que le produit COURANT la subit :
         revenu sur un textile, le client peut de nouveau commander en groupe. */
      var subitEncore = impose && impose === currentProductType;

      barre.classList.toggle('is-impose', !!subitEncore);

      if (subitEncore) {
        lbl.innerHTML = (NOMS[impose] || 'Ce produit') +
          ' ne portent pas de surnom — <strong>mode libre appliqué</strong>';
      } else {
        var mode = document.querySelector('.conf-app-root');
        mode = mode ? mode.getAttribute('data-mode') : null;
        lbl.innerHTML = 'Mode actuel : <strong id="mode-actuel-nom">' +
          (mode === 'groupe' ? 'Personnalisation groupe' : 'Personnalisation libre') +
          '</strong>';
      }
    }
    window.majBarreMode = majBarreMode;

    function choisirMode(mode, reprise) {
      var root = document.querySelector('.conf-app-root');
      if (!root) return;

      /* CHANGEMENT DE MODE = RECHARGEMENT de la page.

         `reprise` distingue un changement VOLONTAIRE d'une reprise de session
         au chargement (:7247). Sans cette garde, le rechargement se
         redéclencherait à chaque démarrage : BOUCLE INFINIE. C'est le risque
         principal de cette approche.

         La fonction s'arrête ici quand la page part : tout ce qui suit
         (attributs, recalage) sera refait par le démarrage. */
      if (!reprise) {
        var precedent = null;
        try { precedent = sessionStorage.getItem(MODE_KEY); } catch (e) {}
        if (basculerModeAvecRechargement(precedent, mode)) return;
      }

      try { sessionStorage.setItem(MODE_KEY, mode); } catch (e) {}
      window.__modePerso = mode;

      root.removeAttribute('data-etape');

      /* MODE GROUPE : le parcours en quatre étapes s'active.

         `data-mode` révèle le stepper et la barre d'action (conf-styles.css).
         Le mode libre ne le porte pas : son parcours reste direct, sans cadre
         supplémentaire — c'est la promesse de son nom. */
      root.setAttribute('data-mode', mode);

      /* Le libellé du mode courant, au-dessus du produit. Écrit ici plutôt que
         dans le markup : il dépend du mode retenu, et « individuelle » comme
         « libre » désignent le même parcours selon l'endroit du code. */
      var nomMode = document.getElementById('mode-actuel-nom');
      if (nomMode) {
        nomMode.textContent = (mode === 'groupe')
          ? 'Personnalisation groupe'
          : 'Personnalisation libre';
      }
      majBarreMode();
      if (mode === 'groupe' && typeof allerEtapeGroupe === 'function') {
        /* REPRISE DE SESSION (rechargement) : on retrouve l'étape en cours.
           CHOIX DÉLIBÉRÉ du mode : on repart du début — le client vient de
           décider de son parcours, il l'attend depuis sa première étape. */
        var cible = (reprise && rappelerEtapeGroupe()) || 'designer';

        /* « VÉRIFIER » AU RECHARGEMENT : on ATTEND la restauration du design.

           Elle est différée de 200 à 300 ms (:1076), le temps que le produit
           soit sélectionné et ses images décodées. Entrer dans l'étape avant
           cela ferait capturer un vêtement encore VIERGE : les cartes
           sortaient sans logo ni texte, et le rechargement paraissait perdre
           le design.

           Les autres étapes n'ont rien à mesurer : elles entrent tout de
           suite. */
        if (reprise && cible === 'valider') {
          /* 900 ms : la restauration part à 300 ms (:1076), puis les images
             doivent être décodées ET mises en page avant d'être mesurables.
             L'étape affiche « Préparation des aperçus… » pendant ce temps. */
          setTimeout(function () { allerEtapeGroupe('valider'); }, 900);
        } else {
          allerEtapeGroupe(cible);
        }
      }

      /* RECALAGE OBLIGATOIRE après la révélation.

         Les zones et le calque sont dimensionnés à partir de mesures prises à
         l'écran. Tant que le canvas était masqué, ces mesures valaient ZÉRO :
         les rectangles seraient posés de travers et le calque des logos calé
         sur une boîte inexistante.

         On rejoue donc le calcul, exactement comme le fait le retour depuis une
         largeur mobile (conf-mobile.js). Différé d'un tour de boucle : la mise
         en page doit d'abord être calculée par le navigateur.

         `syncLayerToImage` est propre au mobile — d'où la garde. */
      var recaler = function () {
        if (typeof window.applyZonesForProduct === 'function' &&
            typeof window.currentProductType === 'string') {
          window.applyZonesForProduct(window.currentProductType);
        }
        if (typeof window.syncLayerToImage === 'function') window.syncLayerToImage();
        if (typeof window.refreshZoneGuides === 'function') window.refreshZoneGuides();
      };

      /* DEUX rendus d'attente, et non un report immédiat.

         Le premier laisse le navigateur appliquer la révélation ; le second
         lui laisse CALCULER la mise en page qui en découle. Un seul tour de
         boucle mesurait un canvas révélé mais pas encore dessiné : les zones
         étaient posées sur des dimensions intermédiaires, d'où un rectangle
         plus étroit et plus bas que la zone réelle. */
      requestAnimationFrame(function () {
        requestAnimationFrame(recaler);
      });

      /* ET APRÈS LE CHARGEMENT DE L'IMAGE.

         Les zones sont exprimées en % de l'image du vêtement. Tant qu'elle
         n'est pas décodée, sa boîte est vide : le calcul ci-dessus porterait
         alors sur du vide. L'événement arrive toujours ; s'il est déjà passé —
         image en cache — la mesure précédente suffit.

         Les trois vues sont écoutées : le client peut avoir quitté l'écran de
         choix sur le dos ou le côté. */
      ['view-face', 'view-dos', 'view-cote'].forEach(function (id) {
        var im = document.getElementById(id);
        if (im && !(im.complete && im.naturalWidth > 0)) {
          im.addEventListener('load', recaler, { once: true });
        }
      });

      placerStepperGroupe(mode);

      /* MODE GROUPE SUR UN NON-TEXTILE : on bascule sur le sweatshirt.

         Coins, drapeaux et patchs n'ont pas de zone de texte — le parcours de
         groupe, qui floque un surnom par personne, n'y mène nulle part. Leurs
         cartes sont masquées (conf-styles.css), mais masquer la carte ne
         change pas le produit DÉJÀ affiché : un client venu des coins serait
         resté dessus, sans pouvoir en changer puisque les autres cartes de sa
         famille ont disparu. */
      if (mode === 'groupe') {
        var TEXTILES = ['sweatshirt', 'tshirt', 'tshirt_polyester'];
        if (TEXTILES.indexOf(window.currentProductType) === -1) {
          var carte = document.querySelector('.product-card[data-product="sweatshirt"]');
          if (carte && typeof window.modernSidebar === 'object' &&
              typeof window.modernSidebar.selectProduct === 'function') {
            window.modernSidebar.selectProduct(carte, 'sweatshirt');
          }
        }
      }

      /* MODE GROUPE : on ouvre sur « Mon Équipe ».
         C'est l'écran de travail de ce parcours — le client vient composer un
         design pour une liste de personnes, pas choisir un produit. Différé
         d'un tour de boucle : la sidebar doit d'abord être révélée, sinon le
         panneau s'ouvre sur une largeur nulle et son aperçu ne se calcule pas
         (voir eqSyncApercu). */
      if (mode === 'groupe') {
        requestAnimationFrame(function () {
          if (typeof window.modernSidebar === 'object' &&
              typeof window.modernSidebar.openPanel === 'function') {
            window.modernSidebar.openPanel('panel-equipe');
          }
        });
      }
    }

    /**
     * Déplace le stepper du parcours groupe DANS l'en-tête, à la place du
     * stepper général — et l'en ressort quand on quitte le mode.
     *
     * Les deux se succédaient verticalement : deux barres d'étapes l'une sous
     * l'autre, dont une seule concernait le client. Le parcours groupe est le
     * seul pertinent tant qu'on y est.
     *
     * Un DÉPLACEMENT plutôt qu'un second markup : le stepper porte son état
     * (étape courante, franchies, à venir) et ses gestionnaires de clic.
     * Le dupliquer imposerait de tenir les deux copies synchronisées.
     *
     * @param {string} mode
     */
    function placerStepperGroupe(mode) {
      var steps = document.getElementById('grp-steps');
      var hdr = document.querySelector('.hdr-steps');
      if (!steps || !hdr) return;

      /* BUREAU SEULEMENT. L'en-tête mobile est déjà à l'étroit — logo, retour
         et boutons s'y partagent la largeur. Y glisser quatre étapes de plus
         les rendrait illisibles ; le stepper garde donc sa place dans le
         canvas, où il a la largeur nécessaire. */
      if (window.innerWidth <= 768) return;

      if (mode === 'groupe') {
        /* Le stepper général cède la place plutôt que de disparaître : le
           client garde un repère de progression, celui de SON parcours. */
        hdr.style.display = 'none';
        if (steps.parentNode !== hdr.parentNode) {
          hdr.parentNode.insertBefore(steps, hdr);
        }
        steps.classList.add('grp-steps--hdr');
      } else {
        hdr.style.display = '';
        steps.classList.remove('grp-steps--hdr');
      }
    }
    window.choisirMode = choisirMode;   // appelée depuis un onclick inline

    /* Un mode déjà retenu dans la session : on passe l'écran de choix.

       Sans cela, un rechargement — ou un retour depuis le récapitulatif —
       ramènerait le client au début alors qu'il a déjà commencé son design. */
    document.addEventListener('DOMContentLoaded', function () {
      var mode = null;
      try { mode = sessionStorage.getItem(MODE_KEY); } catch (e) {}
      /* `true` = reprise de session : le design en cours est celui de ce mode,
         il ne faut surtout pas le permuter. */
      if (mode) choisirMode(mode, true);
    });

    /* majVignettesMode() a été RETIRÉE : elle remplaçait les illustrations des
       cartes de choix par l'image du produit sélectionné, effaçant ce qu'elles
       montraient — le logo d'un côté, le surnom floqué de l'autre. Les deux
       cartes devenaient alors deux vêtements nus identiques. */

    /**
     * Revient à l'écran de choix du mode.
     *
     * Le design en cours n'est pas effacé mais RANGÉ, sous la clé de son mode.
     * Reprendre ce même mode le retrouvera intact ; prendre l'autre partira
     * d'un espace propre. Le client peut se tromper de mode après avoir
     * commencé, et perdre son travail pour cela serait brutal.
     */
    function retourChoixMode() {
      var root = document.querySelector('.conf-app-root');
      if (!root) return;

      /* Rangement AVANT le retrait du mode : après, on ne saurait plus sous
         quelle clé ranger. */
      var courant = null;
      try { courant = sessionStorage.getItem(MODE_KEY); } catch (e) {}
      if (courant && !window.__ouvertureDepuisPanier) {
        rangerDesignMode(courant);

        /* NETTOYAGE VISUEL SEULEMENT — la session reste intacte.

           Sans nettoyage, la vignette du dernier logo resterait affichée sur
           l'écran de choix alors qu'aucun mode n'est retenu.

           Mais l'effacement complet, lui, supprimait les images DE LA SESSION :
           une commande de groupe déjà au panier devenait irrécupérable, sa
           vignette ne retrouvant plus rien à restaurer.

           Le paquet du mode vient d'être rangé, et l'isolation entre modes
           repose sur le rechargement du clic suivant — pas sur cet
           effacement. */
        viderLogosAffiches(true);
      }

      try { sessionStorage.removeItem(MODE_KEY); } catch (e) {}
      window.__modePerso = null;
      root.setAttribute('data-etape', 'choix');
      /* L'étape mémorisée repart avec le mode : sans cela, un nouveau parcours
         de groupe reprendrait à mi-chemin, sur une étape qui ne lui appartient
         pas. */
      try { sessionStorage.removeItem(ETAPE_KEY); } catch (e) {}
      /* Le client reprend la main sur son mode : la contrainte du produit n'a
         plus à être expliquée, quel que soit son choix suivant. */
      try { sessionStorage.removeItem('conf_mode_impose'); } catch (e) {}
      etapeGroupeCourante = 'designer';
      /* Le verrou de capture repart avec le mode : une seconde commande doit
         recapturer son design, pas réutiliser celui de la précédente. */
      window.__captureVerifFaite = false;
      /* Le stepper général reprend sa place dans l'en-tête : sans cet appel,
         celui du groupe y resterait alors qu'aucun mode n'est choisi. */
      placerStepperGroupe(null);

      /* RETOUR SUR « TYPE DE PRODUIT ».

         Les onglets Upload, Texte et Mon Équipe sont masqués à cette étape
         (conf-styles.css). Si l'un d'eux était ouvert au moment du retour, son
         panneau resterait affiché sans onglet pour le désigner — et la
         sidebar montrerait un contenu hors sujet. C'est le seul onglet qui a
         un sens ici. */
      if (typeof window.modernSidebar === 'object' &&
          typeof window.modernSidebar.openPanel === 'function') {
        window.modernSidebar.openPanel('panel-product');
      }
      /* Le stepper et la barre d'action repartent avec le mode : les laisser
         afficherait un parcours groupe par-dessus l'écran de choix. */
      root.removeAttribute('data-mode');
      root.removeAttribute('data-etape-groupe');

      /* SWEATSHIRT REMIS PAR DÉFAUT.

         Les produits sans surnom — coin, drapeau, patch — entrent directement
         en commande individuelle (conf-sidebar-modern.js). Revenir ici avec
         l'un d'eux sélectionné rouvrait donc un écran de choix dont les deux
         cartes ne s'appliquent pas à lui : le client devait recliquer un
         textile pour en sortir.

         On repart d'un textile, celui qui ouvre le configurateur. Différé d'un
         tour de boucle : l'attribut d'étape vient d'être posé, la sidebar doit
         d'abord être révélée pour que les mesures du canvas soient justes. */
      requestAnimationFrame(function () {
        var carteSweat = document.querySelector('.product-card[data-product="sweatshirt"]');
        if (carteSweat && !carteSweat.classList.contains('selected') &&
            typeof window.modernSidebar === 'object' &&
            typeof window.modernSidebar.selectProduct === 'function') {
          window.modernSidebar.selectProduct(carteSweat, 'sweatshirt');
        }
      });
    }
    window.retourChoixMode = retourChoixMode;

    /* ══════════════════════════════════════════════════════════════════════
       PARCOURS GROUPE — quatre étapes

       ORDRE : designer → configurer → prévisualiser → valider.

       Designer AVANT configurer, à l'inverse de la maquette : le client
       compose son design commun, PUIS liste les personnes qui le porteront.
       Saisir des noms avant de savoir à quoi ressemblera le vêtement
       demanderait de se projeter dans le vide.
       ══════════════════════════════════════════════════════════════════════ */

    /* TROIS ÉTAPES, et non quatre.

       « Prévisualiser » et « Valider » ont été fusionnées : elles
       appartiennent au même moment du parcours — le client vérifie, puis
       confirme. Les séparer aurait donné un quatrième écran portant un seul
       bouton, que le récapitulatif offre déjà.

       Une étape de plus n'ajoute pas de la clarté ; elle ajoute un clic. */
    var ETAPES_GROUPE = ['designer', 'configurer', 'valider'];

    /* Libellé et information de la barre d'action, par étape. Le bouton dit ce
       qu'il FAIT, jamais « Suivant » : le client doit savoir où il va. */
    var LIBELLES_ETAPE = {
      designer:   { btn: 'Continuer vers la configuration', info: 'Composez le design commun à toute l\'équipe.' },
      configurer: { btn: 'Continuer vers l\'aperçu',         info: '' },
      valider:    { btn: 'Ajouter au panier',                info: 'Vérifiez votre commande avant de l\'ajouter au panier.' }
    };

    /* Libellé du bouton RETOUR — il nomme l'ACTION, pas l'étape.

       « Retour vers DESIGNER » reprenait le nom du stepper : un mot en
       capitales, technique, qui ne dit pas ce qu'on va y faire. Le stepper
       juste au-dessus indique déjà où l'on est.

       « Modifier le design », « Modifier la liste » : le client lit ce qu'il
       s'apprête à faire, pas la case où il atterrit. */
    var RETOUR_ETAPE = {
      designer:   'Modifier le design',
      configurer: 'Modifier la liste',
      valider:    'Revoir les aperçus'
    };

    var etapeGroupeCourante = 'designer';

    /* Étape mémorisée en session, comme le mode l'est déjà (MODE_KEY).

       Sans elle, un rafraîchissement depuis « Vérifier » ou « Configurer »
       ramenait à « Designer » : le client perdait sa place au milieu de son
       parcours, et devait recliquer chaque étape pour revenir. */
    var ETAPE_KEY = 'conf_etape_groupe';

    /** @returns {string|null} l'étape mémorisée, si elle est valide. */
    function rappelerEtapeGroupe() {
      var e = null;
      try { e = sessionStorage.getItem(ETAPE_KEY); } catch (err) {}
      return (e && ETAPES_GROUPE.indexOf(e) !== -1) ? e : null;
    }

    /**
     * Affiche une étape du parcours groupe.
     * @param {string} etape - clé de ETAPES_GROUPE
     */
    function allerEtapeGroupe(etape) {
      var idx = ETAPES_GROUPE.indexOf(etape);
      if (idx === -1) return;

      var root = document.querySelector('.conf-app-root');
      if (!root || root.getAttribute('data-mode') !== 'groupe') return;

      /* CAPTURE TERMINÉE AVANT MASQUAGE — l'ordre est critique.

         L'attribut posé plus bas masque le canvas en CSS, et la capture des
         designs MESURE le DOM live : sur un élément caché, ses mesures valent
         zéro.

         Le code se contentait auparavant d'AMORCER la capture ici, en pensant
         la faire pendant que le canvas était encore visible. Mais
         grpPreparerVerification() lance une chaîne asynchrone et rend la main
         aussitôt : la mesure survenait donc APRÈS le masquage. La capture
         basculait alors sur son repli et renvoyait les pourcentages bruts du
         calque au lieu de fractions de l'image — d'où un décalage de 30 à
         45 % sur les cartes.

         On ATTEND désormais sa fin, puis on rejoue l'entrée dans l'étape. Le
         drapeau évite la récursion infinie : au second passage, la capture est
         faite et l'on poursuit normalement.

         Même précaution que conf-overview.js:70, qui capture avant d'ouvrir sa
         modale — et dont le rendu, lui, a toujours été juste. */
      if (etape === 'valider' && !window.__captureVerifFaite &&
          typeof window.grpPreparerVerification === 'function') {
        window.__captureVerifFaite = true;

        /* LE CANVAS EST RÉVÉLÉ LE TEMPS DE LA MESURE.

           On arrive ici depuis « Configurer », où le tableau a REMPLACÉ le
           produit : `.cv-wrap` y est déjà en `display: none`
           (conf-styles.css:2911). Attendre la fin de la capture ne suffisait
           donc pas — elle mesurait un canvas invisible et retombait sur les
           pourcentages bruts du calque, d'où des logos deux à trois fois trop
           petits sur les cartes.

           On retire l'attribut d'étape le temps de mesurer, puis on le remet.

           La révélation du canvas vit désormais DANS la capture elle-même
           (conf-group-verify.js, capturerPourNom) : elle y couvre CHAQUE nom,
           là où la faire ici ne couvrait que le premier — les captures
           suivantes, séparées par un rendu, retrouvaient un canvas masqué. */
        Promise.resolve(window.grpPreparerVerification())
          .catch(function () {})
          .then(function () { allerEtapeGroupe('valider'); });
        return;
      }
      /* Réarmé dès qu'on quitte l'étape : y revenir doit recapturer, le design
         ayant pu changer entre-temps. */
      if (etape !== 'valider') window.__captureVerifFaite = false;

      /* SAUVEGARDE EN QUITTANT « CONFIGURER ».

         Le tableau n'était enregistré qu'à la validation finale
         (submitGroupOrder). Quitter l'étape autrement — « Retour », un clic
         sur le stepper, « Continuer » — laissait les saisies dans le seul DOM.
         deplacerTableauGroupe() repeuple ensuite depuis `groupOrderRows`, resté
         périmé : noms, tailles, couleurs et quantités revenaient à leur état
         d'avant. */
      if (etapeGroupeCourante === 'configurer' && etape !== 'configurer') {
        if (typeof grpCollect === 'function') {
          var saisies = grpCollect();
          if (saisies && saisies.length) {
            groupOrderRows = saisies;
            if (typeof saveGroupRows === 'function') saveGroupRows();
            if (typeof refreshGroupBadge === 'function') refreshGroupBadge();
          }
        }
      }

      etapeGroupeCourante = etape;
      try { sessionStorage.setItem(ETAPE_KEY, etape); } catch (e) {}
      root.setAttribute('data-etape-groupe', etape);

      /* État visuel du stepper : franchie, courante, ou à venir.

         Les étapes À VENIR sont désactivées — on ne saute pas en avant sans
         avoir renseigné ce qui précède. Les étapes FRANCHIES restent
         cliquables : revenir corriger son design est légitime. */
      var boutons = document.querySelectorAll('.grp-step');
      for (var i = 0; i < boutons.length; i++) {
        var b = boutons[i];
        var bIdx = ETAPES_GROUPE.indexOf(b.getAttribute('data-step'));
        b.classList.toggle('is-current', bIdx === idx);
        b.classList.toggle('is-done', bIdx < idx);
        b.disabled = bIdx > idx;
      }

      var lib = LIBELLES_ETAPE[etape] || {};
      var btn = document.getElementById('grp-actions-btn');
      var info = document.getElementById('grp-actions-info');
      /* LIBELLÉ COURT SUR TÉLÉPHONE aux étapes où le PRIX partage la ligne :
         « Continuer vers la configuration » recouvrait le montant. Le stepper
         juste au-dessus nomme déjà l'étape suivante — le libellé long n'y
         apprend rien.

         À la dernière étape, le libellé complet est conservé : « Ajouter la
         commande au panier » engage un achat, il doit se lire en entier. */
      var court = window.innerWidth <= 768 && etape !== 'valider';
      if (btn) btn.childNodes[0].nodeValue = (court ? 'Continuer' : (lib.btn || 'Continuer')) + ' ';

      /* Le blocage est évalué APRÈS le libellé : il peut écraser le texte
         d'information par sa raison. */
      majBlocageEtapeGroupe();
      /* Le résumé chiffré doit être juste dès l'affichage de l'étape, pas
         seulement après la première saisie. */
      if (typeof majSommeGroupe === 'function') majSommeGroupe();

      /* Le RETOUR nomme sa destination : « Retour vers DESIGNER » plutôt qu'un
         « Retour » nu, qui laisse le client deviner où il atterrit. Le libellé
         suit donc l'étape précédente, quelle qu'elle soit. */
      var retour = document.getElementById('grp-actions-retour');
      if (retour) {
        var precedente = ETAPES_GROUPE[idx - 1];
        var lbl = retour.querySelector('.grp-retour-lbl');
        if (lbl) {
          lbl.textContent = precedente
            ? (RETOUR_ETAPE[precedente] || 'Retour')
            : 'Retour';
        }
      }

      /* À l'étape « configurer », l'information est le NOMBRE DE PERSONNES —
         le seul chiffre qui compte à ce moment, et celui que le client vérifie
         avant de continuer. Le texte fixe des autres étapes ne dirait rien
         d'utile ici. */
      if (info) {
        if (etape === 'configurer') {
          var n = (groupOrderRows && groupOrderRows.length) ||
                  document.querySelectorAll('#grp-rows tr').length;
          info.textContent = n + (n > 1 ? ' personnes ajoutées' : ' personne ajoutée');
        } else {
          info.textContent = lib.info || '';
        }
      }

      /* CONFIGURER — la liste des personnes remplace le produit, DANS le
         canvas. Plus de modale : le parcours est déjà cadré par le stepper,
         une fenêtre par-dessus ferait un cadre dans un cadre. */
      if (etape === 'configurer') {
        deplacerTableauGroupe(true);
        /* MOBILE : numérote les lignes, calcule leur résumé et déplie la
           première. L'observateur de conf-mobile.js ne voit que les lignes
           AJOUTÉES ; quand elles existent déjà — liste reprise, retour depuis
           « Vérifier » — le client arrivait sur des cartes toutes fermées,
           sans savoir qu'elles s'ouvrent. Différé : le tableau vient d'être
           déplacé dans le canvas. */
        if (typeof window.grpMajLignes === 'function') {
          requestAnimationFrame(function () { window.grpMajLignes(); });
        }
      } else {
        deplacerTableauGroupe(false);
      }

      /* VÉRIFIER — les cartes sont peintes ici, à partir des captures
         amorcées plus haut, avant le masquage du canvas. */
      if (etape === 'valider' && typeof window.grpRendreVerification === 'function') {
        window.grpRendreVerification();
      }
    }
    window.allerEtapeGroupe = allerEtapeGroupe;

    /**
     * Recule d'une étape. Pendant du bouton « Continuer ».
     *
     * Le stepper permettait déjà de revenir sur une étape franchie, mais rien
     * ne l'indiquait : le parcours paraissait à sens unique.
     */
    function etapeGroupePrecedente() {
      var idx = ETAPES_GROUPE.indexOf(etapeGroupeCourante);
      if (idx <= 0) return;
      allerEtapeGroupe(ETAPES_GROUPE[idx - 1]);
    }
    window.etapeGroupePrecedente = etapeGroupePrecedente;

    /**
     * Vérifie que le parcours peut passer à l'étape suivante, et reflète le
     * verdict sur le bouton et le stepper.
     *
     * DEUX CONDITIONS, à deux étapes différentes :
     *
     * « Designer » — au moins UN surnom. Le premier saisi n'est pas une donnée
     *   parmi d'autres : chaque nom remplace le contenu de la MÊME zone de
     *   texte, en héritant de sa position et de sa taille. Il règle donc
     *   l'apparence de toute l'équipe, et c'est le travail de cette étape.
     *
     * « Configurer » — AUCUN champ de nom vide. Une ligne sans nom donnerait un
     *   vêtement non floqué au milieu d'une commande qui l'est : l'erreur ne se
     *   verrait qu'à la livraison.
     *
     * On DÉSACTIVE plutôt que d'alerter au clic : un bouton grisé accompagné de
     * sa raison informe avant l'action, là où une alerte reproche un geste déjà
     * fait.
     */
    function majBlocageEtapeGroupe() {
      var root = document.querySelector('.conf-app-root');
      if (!root || root.getAttribute('data-mode') !== 'groupe') return;

      var etape = root.getAttribute('data-etape-groupe') || 'designer';
      var btn = document.getElementById('grp-actions-btn');
      var info = document.getElementById('grp-actions-info');
      var bloque = false;
      var raison = '';

      if (etape === 'designer') {
        var noms = (typeof window.getGroupOrderRows === 'function')
          ? (window.getGroupOrderRows() || []) : [];
        var auMoinsUn = noms.some(function (r) {
          return String((r && (r.flock || r.name)) || '').trim() !== '';
        });
        if (!auMoinsUn) {
          bloque = true;
          raison = 'Saisissez un premier surnom — il définira la position du ' +
                   'texte pour toute l\'équipe.';
        }
      } else if (etape === 'configurer') {
        /* On lit le TABLEAU À L'ÉCRAN, pas la liste validée : le client est en
           train de le remplir, la liste ne reflète pas encore ses saisies. */
        var lignes = document.querySelectorAll('#grp-rows tr');
        var vides = 0;
        for (var i = 0; i < lignes.length; i++) {
          var champ = lignes[i].querySelector('.grp-f-flock');
          if (champ && !String(champ.value || '').trim()) vides++;
        }
        if (!lignes.length) {
          bloque = true;
          raison = 'Ajoutez au moins une personne à votre liste.';
        } else if (vides) {
          bloque = true;
          raison = vides > 1
            ? 'Renseignez le nom floqué des ' + vides + ' lignes incomplètes.'
            : 'Renseignez le nom floqué de la ligne incomplète.';
        }
      }

      /* LE BOUTON RESTE CLIQUABLE.

         Il était désactivé tant que la condition n'était pas remplie. Deux
         défauts : l'animation d'attente du bouton s'appliquait à cet état
         aussi — le client croyait à un traitement en cours — et un bouton
         grisé n'explique rien à qui ne lit pas la ligne d'à côté.

         Le message n'apparaît donc qu'AU CLIC, au moment où le client cherche
         à avancer. La ligne d'information reprend son rôle habituel. */
      if (btn) btn.disabled = false;
      if (info) {
        info.classList.remove('is-bloque');
        if (etape === 'configurer') {
          var n = document.querySelectorAll('#grp-rows tr').length;
          info.textContent = n + (n > 1 ? ' personnes ajoutées' : ' personne ajoutée');
        } else {
          info.textContent = (LIBELLES_ETAPE[etape] || {}).info || '';
        }
      }

      /* Le verdict est RENVOYÉ : etapeGroupeSuivante l'interroge au clic pour
         décider s'il avance ou s'il explique. */
      return bloque ? raison : null;
    }
    window.majBlocageEtapeGroupe = majBlocageEtapeGroupe;

    /* SAISIE DANS LE TABLEAU — écouteur GLOBAL, posé une seule fois.

       Les lignes sont créées et détruites au fil de la saisie : leur attacher
       un écouteur individuel obligerait à le refaire à chaque ajout, et une
       ligne importée depuis un fichier CSV serait oubliée. On écoute donc le
       document, en filtrant sur le champ concerné.

       `input` et non `change` : le bouton doit se débloquer à la frappe, pas
       seulement quand le client quitte le champ. */
    document.addEventListener('input', function (e) {
      if (!e.target || !e.target.classList) return;
      if (e.target.classList.contains('grp-f-flock')) {
        majBlocageEtapeGroupe();
      }
      /* La QUANTITÉ change le résumé chiffré : total d'articles, palier
         dégressif, montant. `input` et non `change` — le total doit suivre à
         la frappe. */
      if (e.target.classList.contains('grp-f-qty') &&
          typeof window.majSommeGroupe === 'function') {
        window.majSommeGroupe();
      }
    });

    /* Lignes ajoutées ou retirées : le compte de champs vides change sans
       qu'aucune frappe n'ait lieu. */
    document.addEventListener('DOMContentLoaded', function () {
      var corps = document.getElementById('grp-rows');
      if (!corps) return;
      new MutationObserver(function () {
        majBlocageEtapeGroupe();
        majSommeGroupe();
      }).observe(corps, { childList: true });
    });

    /** Avance d'une étape. Appelée par le bouton de la barre d'action. */
    function etapeGroupeSuivante() {
      var idx = ETAPES_GROUPE.indexOf(etapeGroupeCourante);
      if (idx === -1) return;

      /* CONTRÔLE AU CLIC, pas avant.

         Le bouton reste cliquable : c'est en cherchant à avancer que le client
         apprend ce qui manque. Un bouton grisé n'explique rien à qui ne lit
         pas la ligne d'à côté — et l'animation d'attente s'y appliquait, lui
         faisant croire à un traitement en cours.

         Le message s'affiche là où il agissait, et disparaît dès que la
         condition est remplie. */
      var manque = majBlocageEtapeGroupe();
      if (manque) {
        var info = document.getElementById('grp-actions-info');
        if (info) {
          info.textContent = manque;
          info.classList.add('is-bloque');
        }
        /* Le champ à remplir reçoit le focus : le client n'a pas à le
           chercher. */
        var cible = (etapeGroupeCourante === 'designer')
          ? document.getElementById('eq-ajout-champ')
          : (function () {
              var lignes = document.querySelectorAll('#grp-rows tr');
              for (var i = 0; i < lignes.length; i++) {
                var c = lignes[i].querySelector('.grp-f-flock');
                if (c && !String(c.value || '').trim()) return c;
              }
              return null;
            })();
        if (cible) cible.focus();
        return;
      }

      /* DERNIÈRE ÉTAPE : le bouton porte « Ajouter la commande au panier » et
         doit le faire.

         LE CANVAS EST RÉVÉLÉ LE TEMPS DE L'AJOUT. L'étape « Vérifier » le
         masque (conf-styles.css), or addToCart compose une vignette par
         couleur en MESURANT le vêtement affiché : sur un élément caché, ces
         mesures valent zéro et l'ajout échouait — silencieusement, le clic
         restant sans effet.

         On repasse donc à l'étape « designer », où le canvas est visible, puis
         on ajoute. Le tiroir du panier s'ouvre par-dessus : le client ne voit
         pas ce détour. */
      if (idx >= ETAPES_GROUPE.length - 1) {
        if (typeof window.addToCart !== 'function') return;
        /* On RESTE sur « Vérifier ». Le détour par « Designer » servait à
           rendre le canvas mesurable, mais il faisait clignoter l'écran sous
           les yeux du client au moment le plus important de son parcours.
           Les vignettes sont composées à partir des URL d'images, pas de
           mesures du canvas : ce détour était inutile. */
        window.addToCart();
        return;
      }

      allerEtapeGroupe(ETAPES_GROUPE[idx + 1]);
    }
    window.etapeGroupeSuivante = etapeGroupeSuivante;

    /**
     * Déplace le corps de la liste de groupe entre la modale et le canvas.
     *
     * DÉPLACER, et non dupliquer : le tableau, l'import CSV et les totaux
     * existent déjà et sont éprouvés. Une seconde copie divergerait de la
     * première au premier ajustement — et surtout, les deux porteraient les
     * mêmes identifiants (`#grp-rows`, `#grp-file`), que `getElementById`
     * résoudrait alors au hasard de l'ordre du DOM.
     *
     * @param {boolean} versCanvas - true pour l'étape « configurer »
     */
    function deplacerTableauGroupe(versCanvas) {
      var corps = document.querySelector('.grp-body');
      var hote = document.getElementById('grp-inline-hote');
      if (!corps || !hote) return;

      if (versCanvas) {
        /* Déplacement DÉFINITIF, à la première entrée dans l'étape : le
           tableau ne repart jamais dans la modale, qui n'est plus ouverte par
           personne (openGroupOrder redirige ici). Un aller-retour à chaque
           changement d'étape déplaçait un élément vivant — ses écouteurs le
           suivent, mais une mesure en cours l'ignore. */
        if (corps.parentElement !== hote) hote.appendChild(corps);

        /* Peuplement, repris de openGroupOrder : sans lui, le client arrive
           sur un tableau vide alors qu'il a peut-être déjà saisi sa liste.

           `deferTotals` : le total est calculé une fois après la boucle, pas à
           chaque ligne — une liste de 200 personnes se rouvrait sinon avec un
           temps d'attente visible. */
        var tbody = document.getElementById('grp-rows');
        if (tbody) {
          if (groupOrderRows && groupOrderRows.length) {
            tbody.innerHTML = '';
            groupOrderRows.forEach(function (r) { grpAddRow(r, true); });
          } else if (!tbody.children.length) {
            grpAddRow(); grpAddRow();      // deux lignes pour démarrer
          }
        }
        if (typeof grpUpdateTotals === 'function') grpUpdateTotals();
        if (typeof window.grpRefreshTextZonePicker === 'function') {
          window.grpRefreshTextZonePicker();
        }
        if (typeof grpRefreshCurveWarning === 'function') grpRefreshCurveWarning();
      }
      /* Pas de branche « retour » : le tableau reste dans le canvas. Le CSS
         le masque hors de l'étape (`.grp-inline`), ce qui suffit — et évite un
         second déplacement à chaque navigation. */
    }

    /* ══════════════════════════════════════════════════════════════════════
       TAILLE ET QUANTITÉ DANS LE RÉCAPITULATIF
       ══════════════════════════════════════════════════════════════════════ */

    /**
     * Peuple le sélecteur de taille depuis les boutons `.sb`.
     *
     * Ceux-ci restent la SEULE source de vérité : ils sont reconstruits à
     * chaque changement de produit, et chaque textile a ses propres tailles.
     * Lire ailleurs aurait créé une seconde liste, vouée à diverger.
     */
    function syncSelectTaille() {
      var sel = document.getElementById('rp-taille-select');
      if (!sel) return;

      /* `.sg:not(.cv-opt-clone)` : la grille de tailles est CLONÉE dans le
         sélecteur du canvas. Sans ce filtre, chaque taille apparaîtrait deux
         fois dans la liste. */
      var btns = document.querySelectorAll('.sg:not(.cv-opt-clone) .sb');
      if (!btns.length) return;

      var actuelle = '';
      var html = '';
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].textContent.trim();
        if (!t) continue;
        var on = btns[i].classList.contains('on');
        if (on) actuelle = t;
        html += '<option value="' + grpEsc(t) + '"' + (on ? ' selected' : '') + '>' +
                grpEsc(t) + '</option>';
      }
      sel.innerHTML = html;
      if (actuelle) sel.value = actuelle;
    }
    window.syncSelectTaille = syncSelectTaille;

    /**
     * Applique la taille choisie dans le récapitulatif.
     *
     * On CLIQUE le bouton correspondant plutôt que de réimplémenter selSize :
     * celui-ci met à jour le libellé du récap, l'échelle du produit et le prix.
     * Dupliquer cette chaîne l'aurait fait diverger au premier ajustement.
     */
    function choisirTailleDepuisRecap(taille) {
      var btns = document.querySelectorAll('.sg:not(.cv-opt-clone) .sb');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim() === taille) { btns[i].click(); return; }
      }
    }
    window.choisirTailleDepuisRecap = choisirTailleDepuisRecap;

    /**
     * Ouvre la répartition par tailles DANS la barre latérale.
     *
     * La modale existante (`#size-qty-overlay`) s'affichait au centre de la
     * page, par-dessus tout. Ici elle monte depuis le bas du récapitulatif et
     * ne le déborde pas : le client reste dans le même espace visuel, celui où
     * il vient de cliquer.
     *
     * On réutilise la modale telle quelle — son contenu, ses compteurs et sa
     * validation sont éprouvés. Seule sa POSITION change, par une classe.
     */
    function ouvrirRepartitionTailles() {
      var recap = document.querySelector('.recap');
      var ov = document.getElementById('size-qty-overlay');
      if (recap) recap.classList.add('repartition-ouverte');
      if (typeof window.openSizeQuantityModal === 'function') {
        window.openSizeQuantityModal();
      } else if (ov) {
        ov.classList.add('open');
      }
    }
    window.ouvrirRepartitionTailles = ouvrirRepartitionTailles;

    /* La classe doit partir avec la fermeture, quel qu'en soit le chemin —
       bouton « Annuler », validation, ou clic hors du panneau. On observe
       l'overlay plutôt que d'intercepter chaque sortie. */
    document.addEventListener('DOMContentLoaded', function () {
      syncSelectTaille();

      var ov = document.getElementById('size-qty-overlay');
      var recap = document.querySelector('.recap');
      if (ov && recap) {
        new MutationObserver(function () {
          if (!ov.classList.contains('open')) recap.classList.remove('repartition-ouverte');
        }).observe(ov, { attributes: true, attributeFilter: ['class'] });
      }
    });

    /* ══════════════════════════════════════════════════════════════════════
       PANNEAU « MON ÉQUIPE » — surnoms et aperçu (parcours groupe)
       ══════════════════════════════════════════════════════════════════════ */

    /* La liste vit dans `groupOrderRows`, le MÊME stockage que le tableau de
       l'étape « Configurer » (:679). Une seconde liste aurait divergé de la
       première dès qu'un nom serait ajouté d'un côté seulement. */

    /** Redessine la liste des surnoms du panneau. */
    function eqRendreNoms() {
      var hote = document.getElementById('eq-noms');
      var compte = document.getElementById('eq-liste-compte');
      if (!hote) return;

      var rows = (typeof window.getGroupOrderRows === 'function')
        ? (window.getGroupOrderRows() || []) : [];

      if (compte) compte.textContent = rows.length;

      if (!rows.length) {
        /* Une CONSIGNE plutôt qu'un constat : « aucun surnom » décrivait l'état
           sans dire quoi faire. Ce texte remplace aussi le sous-titre de
           l'en-tête, retiré — il est ici plus près du champ de saisie. */
        hote.innerHTML = '<p class="eq-vide">Ajoutez les surnoms de votre groupe</p>';
        return;
      }

      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var nom = rows[i].flock || rows[i].name || '';
        /* grpEsc : ces valeurs viennent d'une saisie libre ou d'un import CSV. */
        html += '<div class="eq-nom" data-index="' + i + '">' +
                  '<button type="button" class="eq-nom-txt" onclick="eqEssayerNom(' + i + ')">' +
                    grpEsc(nom) +
                  '</button>' +
                  '<button type="button" class="eq-nom-x" onclick="eqRetirerNom(' + i + ')" ' +
                          'aria-label="Retirer ' + grpEsc(nom) + '">✕</button>' +
                '</div>';
      }
      hote.innerHTML = html;

      /* Point de passage OBLIGÉ de tout ajout ou retrait : le bouton de l'étape
         « Designer » y reflète donc l'état réel de la liste, sans qu'on ait à
         l'appeler depuis chaque fonction qui la modifie. */
      if (typeof majBlocageEtapeGroupe === 'function') majBlocageEtapeGroupe();
    }
    window.eqRendreNoms = eqRendreNoms;

    /* ══════════════════════════════════════════════════════════════════════
       RÉCAPITULATIF DU DESIGN — mode groupe, étape « Designer »

       Le récapitulatif habituel est masqué en mode groupe (conf-styles.css) :
       prix et quantité n'y ont pas de sens, chaque personne ayant les siens.
       Le client compose donc son design sans aucun retour écrit.

       Ce panneau montre le TEXTE sélectionné, sa typographie et sa couleur —
       les trois réglages qu'on ne peut pas lire sur le vêtement lui-même : la
       police se devine mal à petite taille, et le nom d'une couleur ne se
       déduit pas de son aspect.
       ══════════════════════════════════════════════════════════════════════ */

    /**
     * Nom lisible d'une couleur de texte.
     *
     * Accepte le format hexadécimal (session) comme `rgb()` (style calculé,
     * quand la session ne connaît pas encore la zone) : les deux sont
     * normalisés avant comparaison.
     */
    function nomCouleurTexte(couleur) {
      var c = String(couleur || '').trim().toLowerCase();

      /* rgb(r, g, b) → #rrggbb */
      var m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) {
        c = '#' + [m[1], m[2], m[3]].map(function (n) {
          var v = parseInt(n, 10).toString(16);
          return v.length === 1 ? '0' + v : v;
        }).join('');
      }
      /* #abc → #aabbcc */
      if (/^#[0-9a-f]{3}$/.test(c)) {
        c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      }

      var noms = {
        '#ffffff': 'Blanc',
        '#000000': 'Noir Premium',
        '#1a1a1a': 'Noir Premium',
        '#c2410c': 'Orange', '#e02424': 'Rouge',
        '#eab308': 'Jaune', '#16a34a': 'Vert',
        '#2563eb': 'Bleu', '#7c3aed': 'Violet',
        '#f5f5f5': 'Blanc cassé', '#9ca3af': 'Gris'
      };
      return noms[c] || c.toUpperCase();
    }

    /**
     * Remplit le récapitulatif à partir de la zone de texte SÉLECTIONNÉE.
     *
     * On lit la SESSION plutôt que l'état interne de l'éditeur : celui-ci
     * n'est pas exposé, et la session est de toute façon la source que le
     * rechargement relira.
     */
    function majRecapDesign() {
      var panneau = document.getElementById('grp-recap');
      if (!panneau) return;

      var corps = document.getElementById('grp-recap-body');
      var sousTitre = document.getElementById('grp-recap-sub');

      /* Zone SÉLECTIONNÉE en priorité ; à défaut, la première qui porte du
         texte — le client vient peut-être d'en poser un sans le sélectionner. */
      var zones = ['f', 'fr', 'b'];
      var choisie = null;
      var i, el;

      for (i = 0; i < zones.length; i++) {
        el = document.getElementById('text-' + zones[i]);
        if (el && el.classList.contains('is-selected')) { choisie = zones[i]; break; }
      }
      if (!choisie) {
        for (i = 0; i < zones.length; i++) {
          el = document.getElementById('text-' + zones[i]);
          var c = el && el.querySelector('.dt-content');
          if (el && el.style.display !== 'none' && c && c.textContent.trim()) {
            choisie = zones[i];
            break;
          }
        }
      }

      var etat = null;
      if (choisie) {
        try {
          var tous = JSON.parse(sessionStorage.getItem('conf_texts') || '{}');
          var parProduit = tous[currentProductType] || {};
          etat = parProduit[choisie] || null;
        } catch (e) { etat = null; }

        /* LE TEXTE VIENT DU DOM, pas de la session.

           Un surnom essayé depuis « Mon Équipe » est écrit directement sur le
           vêtement (eqEssayerNom) sans passer par la session : le panneau
           restait vide alors qu'un nom s'affichait à l'écran.

           La session garde en revanche la police et la couleur, qu'on ne peut
           pas lire sur le calque. On combine donc les deux sources. */
        var elChoisi = document.getElementById('text-' + choisie);
        var contenuDom = elChoisi ? elChoisi.querySelector('.dt-content') : null;
        var texteDom = contenuDom ? String(contenuDom.textContent || '').trim() : '';

        if (texteDom) {
          etat = etat ? Object.assign({}, etat) : {};
          etat.text = texteDom;
          /* Repli sur le style calculé quand la session ne sait rien de cette
             zone — le texte existe, il a forcément une couleur. */
          if (!etat.color && elChoisi) {
            etat.color = window.getComputedStyle(elChoisi).color || '#000';
          }
        }
      }

      if (!etat || !String(etat.text || '').trim()) {
        if (corps) corps.hidden = true;
        if (sousTitre) sousTitre.textContent = 'Aucun élément sélectionné';
        return;
      }

      if (sousTitre) sousTitre.textContent = 'Élément sélectionné : Texte';
      if (corps) corps.hidden = false;

      var champTexte = document.getElementById('grp-recap-texte');
      var champPolice = document.getElementById('grp-recap-police');
      var champNom = document.getElementById('grp-recap-couleur-nom');
      var pastille = document.getElementById('grp-recap-dot');

      if (champTexte) {
        champTexte.textContent = etat.text;
        /* Le texte s'affiche DANS SA POLICE : la voir vaut mieux que la lire. */
        champTexte.style.fontFamily = etat.font || 'inherit';
      }
      if (champPolice) champPolice.textContent = etat.fontName || 'Police';
      if (champNom) champNom.textContent = nomCouleurTexte(etat.color);
      if (pastille) pastille.style.background = etat.color || '#000';
    }
    window.majRecapDesign = majRecapDesign;

    /* ══════════════════════════════════════════════════════════════════════
       RÉSUMÉ DE LA CONFIGURATION — mode groupe, étape « Configurer »

       La colonne de droite suit l'ÉTAPE : à « Designer » elle montre le design
       composé, ici ce que la commande représente. Le client saisit une liste ;
       le chiffre lui parle plus que la typographie.
       ══════════════════════════════════════════════════════════════════════ */
    function majSommeGroupe() {
      var panneau = document.getElementById('grp-somme');
      if (!panneau) return;

      /* On lit le TABLEAU À L'ÉCRAN : le client est en train de le remplir, la
         liste validée ne reflète pas encore ses saisies. */
      var lignes = document.querySelectorAll('#grp-rows tr');
      var pieces = 0;
      for (var i = 0; i < lignes.length; i++) {
        var champ = lignes[i].querySelector('.grp-f-qty');
        pieces += Math.max(0, parseInt(champ && champ.value, 10) || 0);
      }

      var elArticles = document.getElementById('grp-somme-articles');
      var elLignes = document.getElementById('grp-somme-lignes');
      var elUnitaire = document.getElementById('grp-somme-unitaire');
      var elTotal = document.getElementById('grp-somme-total');

      if (elArticles) elArticles.textContent = pieces;
      if (elLignes) elLignes.textContent = lignes.length;

      /* PRIX DÉGRESSIF — c'est ce qui justifie d'afficher un montant ici
         plutôt que d'attendre le paiement : sur une commande d'équipe, la
         remise par palier est significative, et la cacher ferait renoncer un
         client avant qu'il ne la découvre.

         `tierUnitPrice` renvoie `null` quand aucune grille n'existe pour ce
         produit : on retombe alors sur le prix de base. */
      var unit = null;
      if (typeof window.tierUnitPrice === 'function') {
        unit = window.tierUnitPrice(currentProductType, pieces);
      }
      if (unit == null && typeof window.prixUnitaire === 'function') {
        unit = window.prixUnitaire(currentProductType);
      }
      unit = Number(unit) || 0;

      var fmt = (typeof window.formatPrix === 'function')
        ? window.formatPrix
        : function (v) { return Number(v).toFixed(2).replace('.', ',') + ' €'; };

      if (elUnitaire) elUnitaire.textContent = unit ? fmt(unit) : '—';
      if (elTotal) elTotal.textContent = (unit && pieces) ? fmt(unit * pieces) : '—';
    }
    window.majSommeGroupe = majSommeGroupe;

    /* Le récapitulatif suit CHAQUE changement : sélection, saisie, police,
       couleur. On observe le calque plutôt que d'appeler depuis chaque
       fonction qui le modifie — elles sont nombreuses, et en oublier une
       laisserait un récapitulatif périmé. */
    document.addEventListener('DOMContentLoaded', function () {
      var layer = document.getElementById('logo-layer');
      if (!layer) return;
      majRecapDesign();
      var enAttente = null;
      new MutationObserver(function () {
        clearTimeout(enAttente);
        enAttente = setTimeout(majRecapDesign, 80);
      }).observe(layer, {
        attributes: true, childList: true, characterData: true, subtree: true,
        attributeFilter: ['class', 'style']
      });
    });

    /** Ajoute un surnom depuis le champ du panneau. */
    function eqAjouterNom() {
      var champ = document.getElementById('eq-ajout-champ');
      if (!champ) return;
      var nom = champ.value.trim();
      if (!nom) return;

      var rows = (typeof window.getGroupOrderRows === 'function')
        ? (window.getGroupOrderRows() || []).slice() : [];

      /* Taille et couleur RESTENT VIDES : elles se choisissent à l'étape
         « Configurer ». Les pré-remplir ici imposerait un défaut que le client
         n'a pas choisi, et qu'il pourrait ne pas remarquer. */
      rows.push({ name: nom, flock: nom, size: '', color: '', qty: 1 });

      if (typeof window.setGroupOrderRows === 'function') window.setGroupOrderRows(rows);
      champ.value = '';
      champ.focus();          // saisie en série : le clavier reste ouvert
      eqRendreNoms();
      eqEssayerNom(rows.length - 1);
    }
    window.eqAjouterNom = eqAjouterNom;

    /** Retire un surnom. */
    function eqRetirerNom(i) {
      var rows = (typeof window.getGroupOrderRows === 'function')
        ? (window.getGroupOrderRows() || []).slice() : [];
      if (i < 0 || i >= rows.length) return;
      rows.splice(i, 1);
      if (typeof window.setGroupOrderRows === 'function') window.setGroupOrderRows(rows);
      eqRendreNoms();
    }
    window.eqRetirerNom = eqRetirerNom;

    /**
     * Pose un surnom SUR LE VÊTEMENT, à la place du texte courant.
     *
     * Même mécanisme que l'aperçu de ligne (conf-group-preview.js:143) : on
     * remplace le `textContent` de la zone de texte, sans toucher à sa police,
     * sa taille ni sa position. Le client voit donc le rendu RÉEL — c'est tout
     * l'objet de cette étape.
     */
    function eqEssayerNom(i) {
      var rows = (typeof window.getGroupOrderRows === 'function')
        ? (window.getGroupOrderRows() || []) : [];
      if (i < 0 || i >= rows.length) return;

      var nom = rows[i].flock || rows[i].name || '';
      var zone = (typeof window.grpTextZone === 'function') ? window.grpTextZone() : 'f';
      var el = document.getElementById('text-' + zone);
      var contenu = el ? el.querySelector('.dt-content') : null;

      /* TEXTE COURBÉ : la substitution est impossible (rendu SVG, textContent
         vide). Même garde que les deux autres chemins — sans elle, le client
         verrait le nom ne pas changer, sans comprendre pourquoi. */
      if (!contenu || el.classList.contains('is-shaped')) {
        var lbl0 = document.getElementById('eq-apercu-nom');
        if (lbl0) lbl0.textContent = 'Texte courbé : redressez-le pour essayer les surnoms';
        return;
      }

      contenu.textContent = nom;
      if (el.style.display === 'none') el.style.display = '';
      if (typeof window.clampTextToZone === 'function') window.clampTextToZone(zone);

      var lbl = document.getElementById('eq-apercu-nom');
      if (lbl) lbl.textContent = 'Aperçu : ' + nom;

      /* Marque la ligne active — le client sait quel nom il regarde. */
      var noms = document.querySelectorAll('#eq-noms .eq-nom');
      for (var k = 0; k < noms.length; k++) {
        noms[k].classList.toggle('is-actif', k === i);
      }
    }
    window.eqEssayerNom = eqEssayerNom;

    /* Entrée au clavier : ajouter sans quitter le champ. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'eq-ajout-champ') {
        e.preventDefault();
        eqAjouterNom();
      }
    });

    document.addEventListener('DOMContentLoaded', function () { eqRendreNoms(); });

    /**
     * Cale l'aperçu du panneau « Mon équipe » sur la vue affichée.
     *
     * Il reprend l'image ACTIVE du canvas — face, dos ou côté — pour que le
     * client vérifie le rendu là où il travaille. Sans cela, l'aperçu serait
     * resté sur la face, alors qu'un design dorsal est fréquent en groupe.
     */
    function eqSyncApercu() {
      var img = document.getElementById('eq-apercu-img');
      if (!img) return;
      var active = document.querySelector('.product-img-single.on');
      if (active && active.getAttribute('src')) img.src = active.src;
    }
    window.eqSyncApercu = eqSyncApercu;

    /* L'aperçu suit CHAQUE changement d'image : vue, couleur, produit. On
       observe les images plutôt que d'appeler depuis chaque fonction — celles
       qui les modifient sont nombreuses, et en oublier une laisserait un
       aperçu périmé. */
    document.addEventListener('DOMContentLoaded', function () {
      eqSyncApercu();
      var vue = document.querySelector('.cv-single-view');
      if (!vue) return;
      new MutationObserver(function () { eqSyncApercu(); })
        .observe(vue, { attributes: true, subtree: true, attributeFilter: ['src', 'class'] });
    });
