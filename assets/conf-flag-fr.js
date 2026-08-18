/* ─────────────────────────────────────────────────────────────────────────
   Drapeau français prêt à l'emploi sur les manches.

   Le client peut poser un drapeau FR sans passer par un upload de fichier :
   un bouton du panneau « Upload Image » applique l'image du thème
   (assets/france_flag.png) sur la manche AFFICHÉE.

   Deux principes :

   1. AUCUN chemin parallèle. Le drapeau emprunte `window.applyUpload(zone,
      src)` — la fonction qu'utilise déjà un upload de fichier
      (conf-share.js:245). Il hérite donc gratuitement du placement dans la
      zone, du déplacement, du redimensionnement, de l'aperçu dans le panneau,
      du bouton « Supprimer » et de la persistance en session. Une
      implémentation séparée aurait dupliqué tout cela, et divergé au premier
      changement.

   2. Le bouton n'existe que là où il a un sens. Il reste masqué sur les vues
      « face » et « dos », qui n'ont pas de manche à floquer, et n'apparaît que
      sur « Manche gauche » / « Manche droite ».

   Dépendances (toutes gardées par `typeof`) :
     - window.applyUpload        conf-share.js
     - window.currentSleeveSide  conf-sleeve-side.js  (côté affiché : 'l'|'r')
     - window.ASSET_URLS.franceFlag  layout/configurateur.liquid
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function bouton() { return document.getElementById('upload-flag-fr'); }

  /** URL de l'image du drapeau, exposée par le layout. */
  function urlDrapeau() {
    var a = window.ASSET_URLS || {};
    return a.franceFlag || '';
  }

  /* Zone à floquer = la manche actuellement à l'écran.

     On lit `currentSleeveSide()` plutôt que l'onglet de vue : la bascule
     gauche/droite peut se faire sans changer d'onglet (conf-sleeve-side.js),
     et c'est bien le profil VISIBLE que le client veut floquer. Repli sur la
     manche gauche si l'asset n'a pas chargé. */
  function zoneCourante() {
    var side = (typeof window.currentSleeveSide === 'function')
      ? window.currentSleeveSide()
      : 'l';
    return (side === 'r') ? 'sr' : 'sl';
  }

  /** Applique le drapeau sur la manche affichée. Appelé par le bouton. */
  window.addFrenchFlag = function () {
    var src = urlDrapeau();
    if (!src) {
      /* L'image n'a pas été fournie : on le dit plutôt que de poser un logo
         vide, qui laisserait croire à un bug d'affichage. */
      if (typeof window.confAlert === 'function') {
        window.confAlert('Le visuel du drapeau est introuvable.',
                         { icon: 'error', title: 'Image manquante' });
      }
      return;
    }
    if (typeof window.applyUpload !== 'function') return;

    var zone = zoneCourante();
    window.applyUpload(zone, src);

    /* PERSISTANCE. `applyUpload` ne fait que poser l'image dans le DOM : seul
       `doUpload` (chemin d'un fichier choisi par le client) écrit en session.
       Le drapeau disparaissait donc au premier rechargement, alors que le
       supplément manches, lui, restait facturé — un écart silencieux entre ce
       que le client voyait et ce qu'il payait.

       On passe par saveUploadSafe plutôt que saveUpload : c'est le point
       d'écriture unique, qui compresse et borne. Ici il n'a rien à faire —
       `src` est une URL du CDN Shopify (ASSET_URLS.franceFlag), donc stockée
       telle quelle, pour ~80 octets. */
    if (typeof window.saveUploadSafe === 'function') {
      window.saveUploadSafe(zone, src);
    } else if (typeof window.saveUpload === 'function') {
      window.saveUpload(zone, src);   // repli : ancien contrat
    }

    /* Le supplément « manches » est PAYANT (+4 €/manche) : l'activer est
       indispensable, sans quoi le drapeau serait floqué sans être facturé.

       `sleeveOptOn()` est l'état lu partout ailleurs (conf-sidebar-modern.js
       :411) ; `handleSleeveToggle()` est la bascule du panneau (:444). On ne
       la déclenche que si l'option est encore inactive — l'appeler alors
       qu'elle est déjà active la DÉSACTIVERAIT. */
    if (typeof window.sleeveOptOn === 'function' &&
        !window.sleeveOptOn() &&
        typeof window.handleSleeveToggle === 'function') {
      window.handleSleeveToggle();
    }

    window.refreshSleeveZoneState();
  };

  /* Grise la zone d'upload d'une manche DÉJÀ occupée.

     La feuille de style prévoit cet état depuis toujours
     (`.upload-zone-btn.is-filled`, conf-sidebar-modern.css:1666-1681, commenté
     « Le bouton se grise dès qu'un visuel est présent : un second upload
     écraserait le premier sans avertissement ») — mais AUCUN code ne posait la
     classe. Le style était mort ; on l'active enfin.

     On se fonde sur l'ÉTAT RÉEL du logo (`img[src]` non vide), pas sur le fait
     qu'on vienne de cliquer : la zone se dégrise donc toute seule après un
     « Supprimer », un changement de textile ou une réinitialisation, sans
     qu'aucun de ces chemins ait à nous appeler. */
  window.refreshSleeveZoneState = function () {
    ['sl', 'sr'].forEach(function (zone) {
      var btn = document.querySelector('.upload-zone-btn[data-upzone="' + zone + '"]');
      if (!btn) return;

      var logo = document.getElementById('logo-' + zone);
      var img = logo && logo.querySelector('img');
      var occupee = !!(img && img.getAttribute('src'));

      btn.classList.toggle('is-filled', occupee);
      /* `aria-disabled` et non `disabled` : le bouton reste focalisable, donc
         annonçable par un lecteur d'écran, mais signalé comme inactif. Le clic
         est neutralisé par `pointer-events` en CSS. */
      btn.setAttribute('aria-disabled', occupee ? 'true' : 'false');
    });
  };

  /* La zone doit se dégriser quand le logo part (bouton « Supprimer »,
     changement de produit, réinitialisation). Plutôt que de brancher un rappel
     dans chacun de ces chemins — et d'en oublier un —, on observe la couche
     des logos : toute modification d'un `src` y passe forcément. */
  function observerLogos() {
    window.refreshSleeveZoneState();

    var layer = document.getElementById('logo-layer');
    if (!layer || typeof MutationObserver !== 'function') return;

    new MutationObserver(function () {
      window.refreshSleeveZoneState();
    }).observe(layer, {
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observerLogos);
  } else {
    observerLogos();
  }

  /* AUCUN pilotage de visibilité en JS — c'est volontaire.

     Le bouton vit dans `#upload-view-cote`, le bloc que l'application révèle
     déjà sur la seule vue de côté : switchUploadView() lui pose la classe
     `active` (conf-sidebar-modern.js:380-383). Le bouton est donc visible
     exactement quand il doit l'être, sans une ligne de JS.

     La première version posait en plus un `style.display` calculé ici. Deux
     sources de vérité pour une même décision, et elles finissaient par se
     contredire : après une suppression de logo ou un changement de textile,
     `display: none` restait figé en style inline alors que le bloc parent
     était bien actif — le bouton disparaissait définitivement. Retirer ce
     pilotage supprime le conflit à la racine plutôt que d'ajouter un rappel
     de synchronisation de plus. */
})();
