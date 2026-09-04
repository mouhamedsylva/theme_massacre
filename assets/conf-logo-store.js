/**
 * Mémoire des logos PAR PRODUIT (sweat, t-shirt coton, t-shirt polyester).
 *
 * Chaque textile garde ses propres visuels : basculer de l'un à l'autre ne doit
 * ni mélanger les designs, ni les perdre.
 *
 * Deux sources, dans cet ordre :
 *   1. LOGO_STORE — instantané EN MÉMOIRE, rempli au changement de produit.
 *      Rapide, mais vidé par tout rechargement de page.
 *   2. conf_uploads — stockage de session indexé par produit. C'est le repli
 *      après un F5 ou un retour depuis le récapitulatif, cas où LOGO_STORE est
 *      vide alors que les designs existent bel et bien.
 *
 * Déporté du template : configurateur.liquid atteint la limite Shopify
 * de 256 Ko. Dépend de window.LOGO_STORE et window.readUploadStore, exposés
 * par le template — ne pas retirer ces assignations.
 */
(function () {
  'use strict';

  /** @returns {object} l'instantané mémoire (créé à la volée si absent). */
  function store() {
    if (!window.LOGO_STORE) window.LOGO_STORE = {};
    return window.LOGO_STORE;
  }

  function saveLogosForProduct(productKey) {
    /* Capture SAUTÉE au retour depuis le panier : le design vient d'être lu
       depuis la session, il n'y a rien à mémoriser. Sans ce garde, l'aller-
       retour sur un MÊME produit (clic sur la vignette d'un article du produit
       déjà affiché) capturait puis restaurait — tout reposant alors sur la
       fidélité de la capture, qui est précisément ce qui a échoué ici.
       Drapeau posé par conf-cart-open-design.js. */
    if (window.__ouvertureDepuisPanier) return;

    const zones = ['f', 'fr', 'b', 'sl', 'sr'];
    store()[productKey] = {};
    zones.forEach(zone => {
      const img = document.getElementById('i' + zone);
      // img.src vaut l'URL absolue de la page quand il est vide — on filtre ça
      const src = img ? img.getAttribute('src') : null;

      /* Toute source EXPLOITABLE est retenue, pas seulement les `data:`.

         Ce filtre datait de l'époque où les designs étaient persistés en
         base64. Depuis qu'ils le sont sous forme d'URL Cloudinary, le `src` du
         DOM est une URL `https://` — elle était donc rejetée et `null` écrit à
         sa place. restoreLogosForProduct effaçait ensuite le canvas (voir son
         commentaire) : le client retrouvait un vêtement nu en revenant au
         design d'un article de son panier.

         `safeImgSrc` (conf-main-inline.js) porte déjà le bon verdict —
         `data:image/`, `https?`, protocole-relatif, chemin absolu. On le
         réutilise plutôt que d'écrire un second test, qui divergerait à son
         tour au prochain changement de format. */
      var ok = (typeof window.safeImgSrc === 'function')
        ? !!window.safeImgSrc(src)
        : !!(src && src !== '' && !/^https?:\/\/[^/]+\/?$/i.test(src));
      store()[productKey][zone] = ok ? src : null;
    });
  }
  
  
  function restoreLogosForProduct(productKey) {
    /* RETOUR DEPUIS LE PANIER : la SESSION fait autorité, pas l'instantané.

       L'instantané mémoire (LOGO_STORE) reflète le canvas au dernier changement
       de produit, pas le design de la ligne que le client vient d'ouvrir.
       Appliqué tel quel, il reposait un design périmé ou vidait le canvas.

       Cette fonction SORTAIT alors immédiatement. Mais elle est la seule à
       peindre les aperçus de la barre latérale (`p{zone}`, `i{zone}`) et les
       lignes du récapitulatif — `restoreUploads` ne les touche jamais. Après
       une ouverture depuis le panier, ils restaient donc vides alors que le
       canvas, lui, était correct.

       On ne sort donc plus : on IGNORE l'instantané et on lit directement la
       session, que reposerEtatDesign vient de remplir avec le bon design.
       C'est exactement ce que fait le repli ci-dessous ; il suffit de le
       déclencher. `saveLogosForProduct` garde son `return` (:34) — capturer un
       instantané pendant l'ouverture n'aurait aucun sens. */
    const depuisPanier = !!window.__ouvertureDepuisPanier;

    const zones = ['f', 'fr', 'b', 'sl', 'sr'];
    /* LOGO_STORE ne vit QU'EN MÉMOIRE : il est vide après un rechargement
       (retour depuis le récapitulatif, F5). On retombe alors sur
       conf_uploads, désormais indexé par produit — sans quoi le canvas
       restait vierge alors que les designs étaient bien enregistrés.
       saveLogosForProduct() ne retient que les images `data:` ; le
       stockage persisté couvre aussi les URLs distantes. */
    let saved = store()[productKey];

    /* Le repli se déclenche aussi quand l'entrée existe mais est VIDE.

       `if (!saved)` seul ne le voyait pas : après une capture ratée, l'objet
       vaut `{ f: null, fr: null, … }` — non vide, donc truthy. Le repli sur
       conf_uploads était alors court-circuité, et la boucle plus bas effaçait
       le canvas au lieu de le repeupler. C'est ce qui rendait le défaut
       invisible : le stockage persisté contenait bien le design, mais on ne
       l'atteignait jamais. */
    const aQuelqueChose = !depuisPanier && saved && Object.keys(saved).some(function (z) {
      return !!saved[z];
    });
    /* ═══ L'INSTANTANÉ DE LIGNE FAIT FOI PENDANT UNE RÉOUVERTURE ══════════

       Cette fonction est appelée depuis `selProd` (conf-main-inline.js:2472),
       donc AVANT toute passe de restauration. Et elle est DESTRUCTIVE : sa
       boucle plus bas pose `src = ''` et `display: none` sur les zones
       qu'elle croit vides.

       Sa garde `protegee` consultait la SESSION pour éviter d'effacer ce
       qu'une autre source déclare valide. Mais `saved` et `enSession` en
       venaient tous deux : quand l'écriture de session avait échoué (quota
       dépassé — le cas des coins et drapeaux lourds), les deux étaient vides,
       `protegee` valait faux, et la fonction effaçait TOUT ce que
       l'ouverture venait de poser.

       L'instantané ne dépend d'aucun quota : il vit en mémoire vive et porte
       exactement les zones de la ligne. En le prenant pour source, la boucle
       d'effacement devient EXACTE — elle efface précisément les zones absentes
       de la ligne, ce qui fait d'elle une alliée de la clôture au lieu d'une
       menace.

       Le rôle légitime de la fonction est intact : elle continue de peindre
       les aperçus latéraux, les vignettes et les lignes de récapitulatif, que
       `restoreUploads` ne touche jamais. */
    const snapOuv = window.__snapshotOuverture;
    const snapUtilisable = depuisPanier && snapOuv && snapOuv.produit === productKey;

    if (snapUtilisable) {
      saved = {};
      zones.forEach(function (z) {
        const e = snapOuv.zones && snapOuv.zones[z];
        if (e && e.src) saved[z] = e.src;
      });
    } else if (!aQuelqueChose) {
      /* `depuisPanier` force ce repli : l'instantané mémoire est périmé dans
         ce cas, la session porte le design de la ligne ouverte. */
      saved = {};
      try {
        const persisted = window.readUploadStore ? window.readUploadStore().byProduct[productKey] || {} : {};
        Object.keys(persisted).forEach(function (z) {
          const e = persisted[z];
          const src = (typeof e === 'string') ? e : (e && e.src);
          if (src) saved[z] = src;
        });
      } catch (e) { saved = {}; }
    }
  
    /* Zones que la SESSION déclare encore pourvues.

       Cette fonction efface les zones qu'elle croit vides (`src = ''`,
       `display: none`, plus bas). Or `restoreUploads` — l'autre restaurateur —
       est purement ADDITIF : il n'écrit que les zones qu'il trouve, et ne
       répare donc jamais un effacement.

       Tout désaccord entre les deux sources se soldait par un canvas vide, sans
       rattrapage possible. C'est ce qui vidait le vêtement au retour depuis le
       panier : l'instantané mémoire (LOGO_STORE) était périmé, la session
       portait bien le design, et c'est l'instantané qui gagnait.

       On consulte donc la session avant d'effacer : une zone qu'elle déclare
       pourvue est LAISSÉE EN PLACE, à charge pour restoreUploads de la
       repeupler. Une fonction de restauration ne doit jamais détruire ce qu'une
       autre source déclare encore valide. */
    let enSession = {};
    if (snapUtilisable) {
      /* MÊME SOURCE QUE `saved` — sinon la clôture ne se ferait jamais.

         `protegee` arbitre un désaccord entre deux sources incertaines. Avec
         l'instantané il n'y a plus qu'une source certaine : protéger une zone
         qu'il ne contient PAS reviendrait à laisser en place le résidu d'une
         autre ligne, c'est-à-dire à défaire la clôture qu'on cherche.

         `protegee` devient donc toujours faux ici : une zone absente de
         l'instantané est une zone à effacer, sans ambiguïté. */
      enSession = {};
    } else {
      try {
        const p = window.readUploadStore
          ? (window.readUploadStore().byProduct[productKey] || {}) : {};
        Object.keys(p).forEach(function (z) {
          const e = p[z];
          const s = (typeof e === 'string') ? e : (e && e.src);
          if (s) enSession[z] = 1;
        });
      } catch (e) { enSession = {}; }
    }

    zones.forEach(zone => {
      const src = saved[zone] || null;
      // Rien en mémoire MAIS présent en session : on ne touche à rien.
      const protegee = !src && !!enSession[zone];

      // Sidebar preview
      const prev = document.getElementById('p' + zone);
      const img  = document.getElementById('i' + zone);
      const lbl  = document.getElementById('l' + zone);
      const input = document.getElementById('u' + zone);

      if (src) {
        if (img)  img.src = src;
        if (prev) prev.style.display = 'block';
        if (lbl)  lbl.style.display = 'flex';
      } else if (!protegee) {
        if (img)  img.src = '';
        if (prev) prev.style.display = 'none';
        if (lbl)  lbl.style.display = 'none';
        if (input) input.value = '';
      }

      /* APERÇU DU PANNEAU MODERNE — la vignette avec le bouton « Supprimer ».

         La barre latérale porte DEUX jeux d'aperçus : l'ancien (#p/#i/#l,
         traité juste au-dessus) et celui-ci. Seul le premier était nettoyé
         d'un produit à l'autre.

         Ce jeu-ci n'est affiché qu'à l'upload (conf-share.js:610) et masqué
         qu'à la suppression (:888) : RIEN ne le masquait au changement de
         produit. Un logo posé sur le sweatshirt laissait donc sa vignette
         visible sur le t-shirt, dont le canvas était pourtant vide — comme si
         les deux produits partageaient le même emplacement.

         On réutilise les fonctions de l'upload plutôt que de manipuler ce DOM
         à la main : deux chemins d'affichage divergeraient au premier
         ajustement de la vignette. Elles vivent dans conf-share.js, chargé en
         `defer` — d'où les gardes, comme partout dans ce fichier.

         La garde `protegee` s'applique ICI AUSSI : une zone que la session
         déclare encore pourvue sera repeuplée par restoreUploads. L'effacer
         maintenant la ferait disparaître sans retour. */
      var boxId = 'up-preview-' + zone;
      var imgId = 'up-preview-img-' + zone;
      if (src) {
        if (typeof window.showUpPreview === 'function') {
          window.showUpPreview(boxId, imgId, src);
        }
      } else if (!protegee) {
        if (typeof window.hideUpPreview === 'function') {
          window.hideUpPreview(boxId, imgId);
        }
      }

      // Logo draggable sur le canvas
      const logoEl = document.getElementById('logo-' + zone);
      if (logoEl) {
        const limg = logoEl.querySelector('img');
        if (src) {
          if (limg) limg.src = src;
          logoEl.style.display = 'block';
        } else if (!protegee) {
          if (limg) limg.src = '';
          logoEl.style.display = 'none';
        }
      }
    });
  
    // Recap rows
    const savedF  = saved['f']  || null;
    const savedB  = saved['b']  || null;
    const savedSl = saved['sl'] || null;
    const savedSr = saved['sr'] || null;
  
    const rcFront   = document.getElementById('rc-front');
    const rcBack    = document.getElementById('rc-back');
    const rcSleeves = document.getElementById('rc-sleeves');
    const rcImgF    = document.getElementById('rc-img-f');
    const rcImgB    = document.getElementById('rc-img-b');
  
    if (rcFront)   rcFront.style.display   = savedF  ? 'flex' : 'none';
    if (rcBack)    rcBack.style.display    = savedB  ? 'flex' : 'none';
    /* LE `src` EST VIDÉ QUAND LA ZONE L'EST — symétrie indispensable.

       L'écriture était conditionnée à `savedF` : une zone vide masquait la
       ligne mais laissait le `src` de l'ARTICLE PRÉCÉDENT. Dès que quoi que
       ce soit rallumait la ligne — applyUpload dans un ordre défavorable, un
       restoreLogosForProduct tardif — l'ancienne vignette réapparaissait.

       Le correctif existe depuis longtemps côté TEXTE
       (conf-text-editor.js:1475, « sinon l'ancienne vignette réapparaîtrait au
       prochain affichage ») ; il n'avait jamais été reporté ici. */
    if (rcImgF) { if (savedF) rcImgF.src = savedF; else rcImgF.removeAttribute('src'); }
    if (rcImgB) { if (savedB) rcImgB.src = savedB; else rcImgB.removeAttribute('src'); }
    if (rcSleeves) rcSleeves.style.display = (savedSl || savedSr) ? 'flex' : 'none';
  
    // Réaligne l'aperçu logo de la vignette récap pour ce produit.
    if (typeof window.updateRecapThumbLogo === 'function') window.updateRecapThumbLogo();
  }

  window.saveLogosForProduct = saveLogosForProduct;
  window.restoreLogosForProduct = restoreLogosForProduct;
})();
