/**
 * Import CSV / collage dans la modale « plusieurs surnoms ».
 *
 * grpImportFile(input) — lit un fichier déposé et le parse.
 * grpParseCsv(text)    — transforme le texte en lignes du tableau.
 * grpCsvSplit / grpNorm / grpMatch / grpHint — utilitaires internes.
 *
 * Déporté ici : configurateur.liquid atteint la limite Shopify de 256 Ko.
 * Dépend de window.grpAddRow, window.grpColors et window.grpSizes, exposés
 * par le template — ne pas retirer ces assignations.
 */
(function () {
  'use strict';

  function grpCsvSplit(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }  // "" échappé
          else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (v) { return v.trim(); });
  }
  
  /* Normalise pour comparer : minuscules, sans accents ni espaces. */
  function grpNorm(v) {
    return String(v == null ? '' : v).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[\s_-]/g, '').trim();
  }
  
  /* Retrouve la valeur officielle la plus proche (taille ou couleur). */
  function grpMatch(value, allowed) {
    var n = grpNorm(value);
    if (!n) return null;
    for (var i = 0; i < allowed.length; i++) {
      if (grpNorm(allowed[i]) === n) return allowed[i];
    }
    for (var j = 0; j < allowed.length; j++) {
      if (grpNorm(allowed[j]).indexOf(n) === 0) return allowed[j];
    }
    return null;
  }
  
  /* Échappement HTML des valeurs venant du fichier importé.

     grpHint() écrit en innerHTML parce que ses messages contiennent du balisage
     légitime (<strong>, <em>). Les libellés sont donc écrits en dur ici, mais
     tout ce qui provient du CSV doit passer par cette fonction : une cellule
     « couleur » contenant <img src=x onerror=…> s'exécutait sinon dans la
     session de la personne qui importe le fichier — typiquement un commercial
     ouvrant la liste d'effectifs envoyée par un client.

     Réutilise window.grpEsc (conf-main-inline.js) et embarque un repli
     identique : ce fichier peut être chargé sans lui. */
  function esc(s) {
    if (typeof window.grpEsc === 'function') return window.grpEsc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Quantité d'une cellule CSV → entier ≥ 1.

     L'ancienne version faisait `parseInt(cell.replace(/[^0-9]/g, ''), 10)` :
     supprimer TOUS les non-chiffres colle les décimales à la partie entière,
     donc « 1,5 » devenait 15 et « 1,25 » devenait 125. La ligne partait au
     panier à cette quantité et était facturée telle quelle — les `parseInt`
     en aval (grpAddRow, grpCollect, recapitulatif.liquid) ne peuvent rien
     rattraper : 15 est un entier parfaitement valide.

     On lit donc un NOMBRE, en acceptant les deux notations décimales (« 1.5 »
     et « 1,5 » — Excel FR produit la virgule), puis on arrondit. Les
     séparateurs de milliers (espace, espace insécable) sont retirés avant
     lecture : « 1 500 » vaut bien 1500.

     Une quantité fractionnaire n'a pas de sens pour un vêtement : on arrondit
     au plus proche, avec un plancher à 1 pour ne pas transformer « 0,4 » en
     ligne à zéro (grpCollect écarte les lignes à 0, la personne
     disparaîtrait silencieusement de la commande).

     PLAFOND : borné à MAX_QTY. Une cellule aberrante (« 999999 », un numéro
     de téléphone tombé dans la mauvaise colonne) créait sinon une ligne de
     panier démesurée sans qu'aucun contrôle ne s'y oppose. */
  var MAX_QTY = 10000;

  /* Nombre maximal de lignes importées en une fois. 2000 personnes couvre
     très largement une commande de groupe réelle (club, école, entreprise)
     tout en gardant l'insertion instantanée. Au-delà, c'est un fichier
     erroné ou un export non filtré — mieux vaut le dire que le charger. */
  var MAX_ROWS = 2000;

  function grpParseQty(cell) {
    var s = String(cell == null ? '' : cell)
      .replace(/[\s  ]/g, '')   // milliers : « 1 500 », « 1 500 »
      .replace(',', '.');                 // décimale FR
    /* VALIDATION DE FORME, pas filtrage de caractères.
       La version précédente faisait `s.replace(/[^0-9.\-]/g, '')` : supprimer
       les caractères non numériques COLLE les chiffres restants, ce qui
       réinterprète silencieusement la valeur —
           « 1e3 »  -> « 13 »   au lieu de 1000
           « 1/2 »  -> « 12 »   au lieu de ½ (×24 de sur-facturation)
           « 0x10 » -> « 010 »  au lieu de 16
       Même piège que le `[^0-9]` d'origine, en plus discret. On exige donc que
       la cellule SOIT un nombre décimal simple ; tout le reste est signalé
       plutôt que deviné.

       Renvoie un objet : l'appelant doit pouvoir AVERTIR. Une quantité
       réinterprétée ou plafonnée passait sans un mot, alors que les tailles et
       couleurs non reconnues sont signalées depuis le début. */
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) {
      return { qty: 1, suspect: s !== '', capped: false };
    }

    var n = parseFloat(s);
    if (!isFinite(n)) return { qty: 1, suspect: true, capped: false };
    if (n < 1) return { qty: 1, suspect: true, capped: false };

    var rounded = Math.round(n);
    if (rounded > MAX_QTY) return { qty: MAX_QTY, suspect: false, capped: true };
    return { qty: rounded, suspect: false, capped: false };
  }

  /* Affiche un message sous la barre d'outils (info / succès / erreur).
     ATTENTION : `msg` est inséré en HTML. N'y concaténer que du balisage
     maîtrisé ; toute donnée issue du fichier importé doit passer par esc(). */
  function grpHint(msg, kind) {
    var el = document.getElementById('grp-import-hint');
    if (!el) return;
    el.className = 'grp-import-hint' + (kind ? ' ' + kind : '');
    el.innerHTML = msg;
  }
  
  function grpImportFile(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    input.value = '';                       // permet de réimporter le même fichier
  
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      grpHint('Le format Excel n\'est pas lu directement. Dans Excel : ' +
              '<em>Fichier → Enregistrer sous → CSV (séparateur point-virgule)</em>, ' +
              'puis réimportez le fichier .csv.', 'err');
      return;
    }
  
    var reader = new FileReader();
    reader.onerror = function () { grpHint('Lecture du fichier impossible.', 'err'); };
    reader.onload = function (e) {
      try { grpParseCsv(String(e.target.result)); }
      /* esc() : un message d'erreur peut reprendre un extrait du fichier. */
      catch (err) { grpHint('Fichier illisible : ' + esc(err && err.message), 'err'); }
    };
    reader.readAsText(file, 'UTF-8');
  }
  
  /* Parse le CSV et crée une ligne de tableau par personne. */
  function grpParseCsv(text) {
    text = text.replace(/^﻿/, '');                    // BOM Excel
    var lines = text.split(/\r\n|\n|\r/).filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) { grpHint('Le fichier est vide.', 'err'); return; }
  
    // Séparateur : le plus fréquent sur la 1re ligne (Excel FR utilise ";").
    var head0 = lines[0];
    var sep = [';', ',', '\t'].map(function (s) {
      return { s: s, n: head0.split(s).length };
    }).sort(function (a, b) { return b.n - a.n; })[0];
    sep = sep.n > 1 ? sep.s : ';';
  
    // En-tête présent ? On cherche un intitulé connu sur la 1re ligne.
    var first = grpCsvSplit(lines[0], sep);
    var HEAD = {
      name:  ['nom', 'nomref', 'nomreference', 'reference', 'ref', 'personne', 'prenom'],
      size:  ['taille', 'size', 'tailles'],
      color: ['couleur', 'color', 'coloris'],
      flock: ['nomfloque', 'floquage', 'flocage', 'floque', 'marquage', 'numero'],
      qty:   ['qte', 'quantite', 'qty', 'quantity', 'nombre']
    };
    var idx = { name: 0, size: 1, color: 2, flock: 3, qty: 4 };   // ordre par défaut
    var hasHeader = false;
    first.forEach(function (cell, i) {
      var n = grpNorm(cell);
      Object.keys(HEAD).forEach(function (k) {
        if (HEAD[k].indexOf(n) !== -1) { idx[k] = i; hasHeader = true; }
      });
    });
  
    var sizes = window.grpSizes();
    var colors = window.grpColors().map(function (c) { return c.name; });
    var rows = lines.slice(hasHeader ? 1 : 0);
    if (!rows.length) { grpHint('Aucune ligne de données après l\'en-tête.', 'err'); return; }

    /* PLAFOND — un fichier volumineux figeait l'onglet : chaque insertion
       ajoute une ligne au DOM, et le total qui la suivait relisait tout le
       tableau (10 000 lignes = 50 millions de lectures de <tr>). Le plafond
       borne le travail ; le report du total (grpAddRow(…, true) plus bas)
       supprime le caractère quadratique.

       Les lignes en excès sont ANNONCÉES, jamais coupées en silence : un
       import tronqué sans avertissement ferait partir une commande
       incomplète en le laissant croire complète. */
    var ignored = 0;
    if (rows.length > MAX_ROWS) {
      ignored = rows.length - MAX_ROWS;
      rows = rows.slice(0, MAX_ROWS);
    }
  
    var added = 0, warn = [];
    rows.forEach(function (line, n) {
      var c = grpCsvSplit(line, sep);
      var noLigne = n + (hasHeader ? 2 : 1);
  
      var rawSize  = idx.size  != null ? c[idx.size]  : '';
      var rawColor = idx.color != null ? c[idx.color] : '';
      var size  = grpMatch(rawSize, sizes);
      var color = grpMatch(rawColor, colors);
  
      // Valeur inconnue : on garde la ligne avec la valeur courante et on signale.
      /* esc() : ces valeurs viennent telles quelles du fichier et finissent
         dans grpHint(), qui écrit en innerHTML. */
      if (rawSize && !size)   warn.push('L' + noLigne + ' taille « ' + esc(rawSize) + ' »');
      if (rawColor && !color) warn.push('L' + noLigne + ' couleur « ' + esc(rawColor) + ' »');
  
      /* Quantité : on SIGNALE une cellule illisible ou plafonnée, au lieu de la
         réinterpréter en silence. Une quantité fausse se paie en euros — c'est
         au moins aussi important qu'une taille non reconnue. */
      var rawQty = idx.qty != null ? c[idx.qty] : '';
      var qtyRes = grpParseQty(rawQty);
      var qty = qtyRes.qty;
      if (qtyRes.suspect) {
        warn.push('L' + noLigne + ' quantité « ' + esc(rawQty) + ' » illisible → 1');
      } else if (qtyRes.capped) {
        warn.push('L' + noLigne + ' quantité « ' + esc(rawQty) + ' » ramenée à ' + MAX_QTY);
      }
  
      /* deferTotals=true : le total est calculé UNE fois après la boucle.
         Sans ce report, grpAddRow appelait grpUpdateTotals() à chaque ligne,
         et celui-ci relit tout le tableau — coût quadratique. */
      window.grpAddRow({
        name:  idx.name  != null ? (c[idx.name]  || '') : '',
        flock: idx.flock != null ? (c[idx.flock] || '') : '',
        size:  size  || undefined,
        color: color || undefined,
        qty:   qty
      }, true);
      added++;
    });

    /* Total calculé une seule fois, maintenant que toutes les lignes sont en
       place. Indispensable : les lignes ont été insérées avec deferTotals, le
       compteur et l'état du bouton d'envoi sont donc encore sur l'état
       précédent. Gardé par typeof — ce fichier peut être chargé seul. */
    if (typeof window.grpUpdateTotals === 'function') window.grpUpdateTotals();
  
    if (!added) { grpHint('Aucune ligne importée.', 'err'); return; }
  
    var msg = '<strong>' + added + ' ligne' + (added > 1 ? 's' : '') + ' importée' +
              (added > 1 ? 's' : '') + '.</strong>';

    /* Troncature annoncée en PREMIER et traitée comme une erreur : c'est
       l'information la plus lourde de conséquences du message (des personnes
       manquent à la commande). La taire laisserait croire l'import complet. */
    if (ignored) {
      msg += ' <strong>' + ignored + ' ligne' + (ignored > 1 ? 's' : '') +
             ' au-delà de ' + MAX_ROWS + ' n\'' + (ignored > 1 ? 'ont' : 'a') +
             ' pas été importée' + (ignored > 1 ? 's' : '') + '</strong> : ' +
             'découpez le fichier en plusieurs imports.';
    }

    if (warn.length) {
      msg += ' Valeurs non reconnues, remplacées par la sélection courante : ' +
             warn.slice(0, 4).join(', ') +
             (warn.length > 4 ? ' … (+' + (warn.length - 4) + ')' : '') +
             '. Vérifiez ces lignes.';
    }

    if (ignored || warn.length) grpHint(msg, 'err');
    else grpHint(msg + ' Vérifiez le tableau avant d\'envoyer.', 'ok');
  }
  
  /* Met la pastille de couleur à jour d'après le select. */

  window.grpImportFile = grpImportFile;
  window.grpParseCsv = grpParseCsv;
})();
