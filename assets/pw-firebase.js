/* ============================================================
   POPOTE WAR — couche Firebase (backend en ligne)
   ------------------------------------------------------------
   Inclure APRÈS le SDK Firebase (compat) et firebase-config.js,
   mais AVANT popote-war.js. Si PW_FIREBASE.enabled != true, ce
   fichier ne fait rien et le jeu reste en mode local.
   Expose window.PWFirebase = { onAuth, signUp, signIn, signOut,
   loadProfile, saveProfile, + primitives de salon 1v1 }.
   ============================================================ */
(() => {
  "use strict";
  const CFG = window.PW_FIREBASE;
  if (!CFG || !CFG.enabled || !window.firebase) return; // -> mode local

  firebase.initializeApp(CFG.config);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const fns = firebase.functions ? firebase.app().functions(CFG.region || "us-central1") : null;

  // --- helpers ---
  let saveTimer = null;
  let lastSaveAt = 0;
  let lbTimer = null; // débounce de la vitrine publique (classement)

  /* --- Disponibilité des Cloud Functions ---------------------------------
     Les Cloud Functions exigent le plan Blaze. En plan Spark (gratuit) elles
     ne sont PAS déployées : tout appel échoue en "not-found", ce qui cassait
     silencieusement la roue et la boutique de codes.
     On détecte donc l'absence une fois pour toutes, et le jeu bascule sur son
     mode local (l'anti-triche de la roue est de toute façon assuré par les
     règles Firestore, qui contrôlent `lastSpin` avec l'heure SERVEUR).
     Le drapeau `useFunctions` de firebase-config.js permet de forcer l'un ou
     l'autre comportement sans attendre le premier échec. */
  let fnsOK = (CFG.useFunctions === true) ? null : false; // null = à déterminer
  const FN_ABSENT = ["not-found", "functions/not-found", "unavailable", "functions/unavailable", "internal", "functions/internal"];

  async function callFn(name, payload) {
    if (fnsOK === false || !fns) return { ok: false, unavailable: true };
    try {
      const res = await fns.httpsCallable(name)(payload || {});
      fnsOK = true;
      return { ok: true, data: res.data };
    } catch (e) {
      const code = (e && e.code) || "";
      // Tant qu'aucun appel n'a jamais abouti, une erreur de ce type signifie
      // très probablement « fonctions non déployées » plutôt qu'un vrai bug.
      if (fnsOK === null && FN_ABSENT.includes(code)) {
        fnsOK = false;
        console.info("[PWFirebase] Cloud Functions indisponibles (plan Spark) — mode local activé.");
        return { ok: false, unavailable: true };
      }
      return { ok: false, error: e };
    }
  }
  // champs transitoires qu'on ne stocke pas en ligne
  const TRANSIENT = new Set(["matricule"]);
  function cleanProfile(p) { const o = {}; for (const k in p) if (!TRANSIENT.has(k)) o[k] = p[k]; return o; }
  // Champs PROPRIÉTÉ DU SERVEUR : le client ne les écrit jamais (cf.
  // firestore.rules). saveProfile les retire donc de ses sauvegardes — leur
  // valeur fait foi côté serveur et revient via loadProfile ou le retour des
  // Cloud Functions (match, roue, calendrier, prestige, achat). Une sauvegarde
  // qui les inclurait serait REFUSÉE en bloc par les règles.
  const SERVER_OWNED = ["coins", "coinsEarned", "level", "xp", "prestige", "grade", "referredBy", "refCount", "lastSpin", "lastClaimDay", "weekStreak", "lastDaily", "spinToken", "lastFlash", "bonusDay", "bonusEarned"];
  function cleanForUpdate(p) { const o = cleanProfile(p); for (const k of SERVER_OWNED) delete o[k]; return o; }
  function pwDefaultProfile(pseudo) { return { pseudo: pseudo || "RECRUE", created: Date.now(), level: 1, xp: 0, coins: 500, rp: 0, wins: 0, losses: 0, streak: 0, best: 0, codes: [], items: { fusil: 0, casque: 0, montre: 0 }, lastSpin: 0, lastDaily: 0, lastStake: 100, sinceOffer: 0 }; }

  /* Unicite des pseudos.
     Firestore ne sait pas imposer « ce champ est unique ». Le motif standard :
     une collection `usernames` dont l'IDENTIFIANT du document EST le pseudo
     normalise. Creer deux fois le meme identifiant est impossible ; une
     transaction transforme donc « le doc existe deja » en « pseudo pris ».
     La normalisation empeche de contourner par la casse ou les accents :
     « Massacre Officiel », « massacre_officiel » et « MASSACRE OFFICIEL »
     donnent la meme cle et entrent donc en collision. */
  function normPseudo(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // Noms proteges : personne ne peut se faire passer pour la marque ni le staff.
  // Normalises (sans espace ni accent) pour coller a normPseudo.
  const RESERVED = new Set([
    "massacre", "massacreofficiel", "officialmassacre", "massacreofficial",
    "officiel", "official", "kaoni", "kaonimassacre",
    "admin", "administrateur", "administrator", "moderateur", "moderator", "mod",
    "staff", "equipe", "team", "root", "owner", "proprietaire", "support",
    "systeme", "system", "popotewar", "popote",
  ]);

  function pwErr(msg, code) { const e = new Error(msg); e.pwCode = code; return e; }

  window.PWFirebase = {
    /* ----- AUTH ----- */
    onAuth(cb) { auth.onAuthStateChanged((user) => cb(user)); },
    uid() { return auth.currentUser ? auth.currentUser.uid : null; },
    // Verifie si un pseudo est libre SANS creer de compte (pour un retour
    // immediat dans le formulaire). Renvoie true si disponible.
    async pseudoAvailable(pseudo) {
      const norm = normPseudo(pseudo);
      if (norm.length < 3 || RESERVED.has(norm)) return false;
      try { const snap = await db.collection("usernames").doc(norm).get(); return !snap.exists; }
      catch (e) { return true; } // en cas d'erreur reseau, on laisse la transaction trancher
    },
    async signUp(email, password, pseudo) {
      const norm = normPseudo(pseudo);
      if (norm.length < 3) throw pwErr("Pseudo trop court (3 lettres/chiffres mini).", "short");
      if (RESERVED.has(norm)) throw pwErr("Ce pseudo est reserve, choisis-en un autre.", "reserved");

      // On cree le compte AVANT de reserver le pseudo : ecrire dans `usernames`
      // exige d'etre authentifie (regles Firestore). Si la reservation echoue,
      // on supprime ce compte tout juste cree pour que l'email reste libre.
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      try {
        await db.runTransaction(async (tx) => {
          const ref = db.collection("usernames").doc(norm);
          const snap = await tx.get(ref);
          if (snap.exists && snap.data().uid !== uid) {
            throw pwErr("Ce pseudo est deja pris, choisis-en un autre.", "taken");
          }
          tx.set(ref, {
            uid, pseudo: String(pseudo || "").slice(0, 24),
            at: firebase.firestore.FieldValue.serverTimestamp(),
          });
        });
      } catch (e) {
        try { await cred.user.delete(); } catch (_) {}
        throw e;
      }

      const base = pwDefaultProfile(pseudo || email.split("@")[0]);
      base.uid = uid; base.email = email;
      await db.collection("profiles").doc(uid).set(cleanProfile(base), { merge: true });
      return cred.user;
    },
    async signIn(email, password) { const cred = await auth.signInWithEmailAndPassword(email, password); return cred.user; },
    async signOut() { await auth.signOut(); },

    // Email de réinitialisation de mot de passe (Firebase envoie un lien vers sa
    // page hébergée où l'utilisateur choisit un nouveau mot de passe).
    async sendPasswordReset(email) {
      await auth.sendPasswordResetEmail(String(email || "").trim());
    },

    /* Changement de pseudo, avec la MÊME unicité qu'à l'inscription : on
       réserve le nouveau nom normalisé (transaction : échoue s'il est pris),
       on met à jour le profil, puis on LIBÈRE l'ancien nom pour qu'il
       redevienne disponible. */
    async changePseudo(newPseudo) {
      const uid = auth.currentUser && auth.currentUser.uid;
      if (!uid) throw pwErr("Non connecté.", "noauth");
      const norm = normPseudo(newPseudo);
      if (norm.length < 3) throw pwErr("Pseudo trop court (3 lettres/chiffres mini).", "short");
      if (RESERVED.has(norm)) throw pwErr("Ce pseudo est réservé, choisis-en un autre.", "reserved");
      const clean = String(newPseudo || "").slice(0, 24);

      // 1) Réserver le nouveau nom (échoue si déjà pris par quelqu'un d'autre).
      await db.runTransaction(async (tx) => {
        const ref = db.collection("usernames").doc(norm);
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().uid !== uid) throw pwErr("Ce pseudo est déjà pris, choisis-en un autre.", "taken");
        tx.set(ref, { uid, pseudo: clean, at: firebase.firestore.FieldValue.serverTimestamp() });
      });

      // 2) Mettre à jour le profil (pseudo n'est pas un champ serveur : autorisé).
      await db.collection("profiles").doc(uid).set({ pseudo: clean }, { merge: true });

      // 3) Libérer les anciens noms réservés par cet uid (sauf le nouveau).
      try {
        const olds = await db.collection("usernames").where("uid", "==", uid).get();
        await Promise.all(olds.docs.map((d) => (d.id !== norm ? d.ref.delete().catch(() => {}) : null)));
      } catch (e) { /* si le nettoyage échoue, l'essentiel (nouveau pseudo) est déjà fait */ }

      return clean;
    },

    /* ----- PROFIL (Firestore) ----- */
    async loadProfile(user) {
      const ref = db.collection("profiles").doc(user.uid);
      const snap = await ref.get();
      if (snap.exists) return Object.assign({ uid: user.uid }, snap.data());
      // pas encore de profil -> on en crée un par défaut
      const base = pwDefaultProfile(user.email ? user.email.split("@")[0] : "RECRUE");
      base.uid = user.uid; base.email = user.email || "";
      await ref.set(cleanProfile(base), { merge: true });
      return base;
    },
    // Notifié quand une sauvegarde est REFUSÉE par les règles. Sans ça, un lot
    // de roue ou une récompense de calendrier s'affichait puis disparaissait au
    // rechargement, sans le moindre message — le pire scénario possible.
    onSaveError: null,

    saveProfile(profile) {
      if (!profile || !profile.uid) return;
      clearTimeout(saveTimer);
      const write = () => {
        lastSaveAt = Date.now();
        db.collection("profiles").doc(profile.uid).set(cleanForUpdate(profile), { merge: true })
          .catch((e) => {
            console.warn("[PWFirebase] save", e);
            if (typeof window.PWFirebase.onSaveError === "function") window.PWFirebase.onSaveError(e);
          });
      };
      // Écriture immédiate (front) si le dernier envoi remonte à plus de 600 ms : une mise (achat, coins,
      // objets…) est ainsi sauvegardée tout de suite, même si le joueur rafraîchit la page juste après.
      // Sinon, on debounce (arrière) pour éviter de spammer Firestore lors de rafales de changements.
      if (Date.now() - lastSaveAt > 600) write();
      else saveTimer = setTimeout(write, 600);
    },
    // Force une sauvegarde immédiate, sans attendre le debounce (utile avant un changement de page).
    saveProfileNow(profile) {
      if (!profile || !profile.uid) return;
      clearTimeout(saveTimer);
      lastSaveAt = Date.now();
      return db.collection("profiles").doc(profile.uid).set(cleanForUpdate(profile), { merge: true }).catch((e) => console.warn("[PWFirebase] save", e));
    },

    /* ============================================================
       CLASSEMENTS & AMIS (100 % Firestore — compatible plan Spark)
       ------------------------------------------------------------
       Le document `profiles/{uid}` reste PRIVÉ (il contient l'email).
       On publie donc à côté une vitrine publique `leaderboard/{uid}`
       ne contenant que des champs inoffensifs. C'est cette collection
       seule qui est lisible par les autres joueurs.
       ============================================================ */

    // Code ami dérivé de l'uid : déterministe, donc rien à réserver ni à
    // vérifier côté serveur, et impossible à « prendre » par quelqu'un d'autre.
    // IMPORTANT : cette dérivation est répliquée telle quelle dans
    // firestore.rules (uid[0:4].upper() + '-' + uid[4:8].upper()) pour que le
    // serveur puisse REFUSER un code qui ne correspond pas à son auteur. Sans
    // ça, n'importe qui pourrait inscrire le code d'un autre dans sa propre
    // ligne de classement et détourner ses demandes d'ami. Ne pas modifier
    // l'une sans l'autre.
    friendCode(uid) {
      const u = uid || (auth.currentUser && auth.currentUser.uid) || "";
      return (u.slice(0, 4) + "-" + u.slice(4, 8)).toUpperCase();
    },

    // Publie la vitrine publique. Débouncée : inutile de réécrire à chaque coin.
    publishLeaderboard(p) {
      if (!p || !p.uid) return;
      clearTimeout(lbTimer);
      lbTimer = setTimeout(() => {
        db.collection("leaderboard").doc(p.uid).set({
          uid: p.uid,
          pseudo: String(p.pseudo || "Recrue").slice(0, 24),
          code: window.PWFirebase.friendCode(p.uid),
          coins: p.coins | 0,
          wins: p.wins | 0,
          best: p.best | 0,
          played: p.played | 0,
          goodAnswers: p.goodAnswers | 0,
          rp: p.rp | 0,
          level: p.level | 0,
          prestige: p.prestige | 0,
          grade: p.grade | 0,
          title: String(p.title || "bleu").slice(0, 24),
          medals: p.medalCount | 0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        // PAS de `merge` : la regle impose desormais une liste EXACTE de champs.
        // Avec une fusion, un champ ecrit par une version anterieure survivrait
        // et ferait echouer toutes les publications suivantes, definitivement
        // et en silence. Les 15 champs sont reecrits a chaque fois de toute
        // facon : la fusion n'apportait rien.
        }).catch((e) => console.warn("[PWFirebase] leaderboard", e));
      }, 1500);
    },

    // Classement mondial. `field` : "coins" | "wins" | "best".
    async topPlayers(field, max) {
      const f = ["coins", "wins", "best", "goodAnswers"].includes(field) ? field : "coins";
      const q = await db.collection("leaderboard").orderBy(f, "desc").limit(max || 50).get();
      return q.docs.map((d) => d.data());
    },
    // Rang mondial sur un critère : nombre de joueurs STRICTEMENT au-dessus + 1.
    // Agrégation count() : le COMPTAGE se fait côté serveur (≈1 lecture par
    // millier d'entrées d'index) au lieu de télécharger tous les documents
    // au-dessus de soi (~625 lectures pour un joueur médian). Repli sur
    // l'ancienne méthode si le SDK chargé ne connaît pas count().
    async worldRank(field, value) {
      const f = ["coins", "wins", "best", "goodAnswers"].includes(field) ? field : "coins";
      const q = db.collection("leaderboard").where(f, ">", value || 0);
      try {
        if (typeof q.count === "function") {
          const agg = await q.count().get();
          return (agg.data().count || 0) + 1;
        }
      } catch (e) { /* repli ci-dessous */ }
      const snap = await q.get();
      return snap.size + 1;
    },

    // Vitrines publiques d'une liste d'uid (classement entre amis).
    async playersByUids(uids) {
      const list = (uids || []).slice(0, 60);
      if (!list.length) return [];
      const snaps = await Promise.all(list.map((u) =>
        db.collection("leaderboard").doc(u).get().catch(() => null)));
      return snaps.filter((s) => s && s.exists).map((s) => s.data());
    },

    async findByCode(code) {
      const c = String(code || "").trim().toUpperCase();
      if (!c) return null;
      const q = await db.collection("leaderboard").where("code", "==", c).limit(1).get();
      return q.empty ? null : q.docs[0].data();
    },

    /* --- demandes d'ami ---
       Un doc par couple, id = "<expéditeur>__<destinataire>", ce qui interdit
       nativement les doublons sans avoir à faire de requête préalable. */
    async sendFriendRequest(toUid, myPseudo) {
      const me = auth.currentUser && auth.currentUser.uid;
      if (!me) throw new Error("Non connecté.");
      if (me === toUid) throw new Error("Tu ne peux pas t'ajouter toi-même, recrue. 🙃");

      // Si la demande existe déjà, un .set() serait évalué comme un UPDATE par
      // les règles — que seul le destinataire a le droit de faire. On sortirait
      // donc avec un "permission-denied" incompréhensible pour le joueur.
      const ref = db.collection("friendReqs").doc(me + "__" + toUid);
      const existing = await ref.get().catch(() => null);
      if (existing && existing.exists) {
        const st = existing.data().status;
        throw new Error(st === "accepted"
          ? "Demande déjà acceptée — recharge la page."
          : "Demande déjà envoyée, patiente un peu.");
      }

      // L'autre m'a peut-être déjà invité : dans ce cas on accepte SA demande
      // au lieu d'en créer une seconde, sinon chacun garde une invitation
      // fantôme alors qu'ils sont déjà amis.
      const reverse = db.collection("friendReqs").doc(toUid + "__" + me);
      const rev = await reverse.get().catch(() => null);
      if (rev && rev.exists && rev.data().status === "pending") {
        await reverse.update({ status: "accepted" });
        return { mutual: true };
      }

      await ref.set({
        from: me, to: toUid, fromPseudo: String(myPseudo || "Recrue").slice(0, 24),
        status: "pending", at: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return { mutual: false };
    },
    // Accepte une demande ET purge l'eventuelle demande symetrique, pour ne pas
    // laisser une invitation fantome entre deux joueurs deja amis.
    async acceptAndClean(reqId, otherUid) {
      const me = auth.currentUser && auth.currentUser.uid;
      await db.collection("friendReqs").doc(reqId).update({ status: "accepted" });
      if (me && otherUid) {
        await db.collection("friendReqs").doc(me + "__" + otherUid).delete().catch(() => {});
      }
    },
    // Demandes reçues, en attente de ma réponse.
    async incomingRequests() {
      const me = auth.currentUser && auth.currentUser.uid; if (!me) return [];
      const q = await db.collection("friendReqs").where("to", "==", me).where("status", "==", "pending").limit(40).get();
      return q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    },
    // Mes demandes qui viennent d'être acceptées : c'est ce qui rend l'amitié
    // réciproque sans jamais écrire dans le profil privé de l'autre joueur.
    async acceptedRequests() {
      const me = auth.currentUser && auth.currentUser.uid; if (!me) return [];
      const q = await db.collection("friendReqs").where("from", "==", me).where("status", "==", "accepted").limit(40).get();
      return q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    },
    async acceptRequest(reqId) { await db.collection("friendReqs").doc(reqId).update({ status: "accepted" }); },
    async dropRequest(reqId) { await db.collection("friendReqs").doc(reqId).delete(); },

    /* ----- SALONS 1v1 (temps réel) — primitives prêtes à câbler ----- */
    async createRoom({ stake, rounds, gradeIndex, pseudo, questions, army }) {
      const code = "MSCR-" + Math.random().toString(16).slice(2, 6).toUpperCase();
      const ref = await db.collection("rooms").add({
        // L'armee du salon : un aviateur ne doit pas se retrouver dans une
        // partie Terre. Sert de filtre dans listOpenRooms().
        army: army || "tout",
        code, hostUid: auth.currentUser.uid, hostName: pseudo, hostGrade: gradeIndex,
        // `questions` ECRITES DES LA CREATION. Auparavant elles restaient en
        // memoire chez l'hote jusqu'au demarrage, pour ne pas exposer le corrige
        // dans un salon en attente (lisible de tous). Mais cela rendait le
        // LANCEMENT dependant du client de l'hote : si son onglet dormait
        // (frequent sur mobile), l'invite rejoignait et restait bloque « en
        // attente », la partie ne demarrait jamais. Priorite au fonctionnement :
        // les questions sont la des le depart, donc l'INVITE peut lancer la
        // partie lui-meme, sans attendre l'hote. Compromis assume : un joueur
        // pourrait lire les reponses d'un salon en attente avant de le rejoindre
        // — triche marginale sur un jeu deja entierement juge cote client.
        guestUid: null, guestName: null, guestGrade: null, stake, rounds, questions: questions || [],
        status: "waiting", round: -1, roundStartAt: 0, answers: {}, scores: { host: 0, guest: 0 }, roundWins: { host: 0, guest: 0 },
        shield: { host: false, guest: false }, extend: { host: 0, guest: 0 },
        // Attaques recues : horodatage de la derniere attaque subie par chacun.
        // Un horodatage plutot qu'un booleen, pour que le client sache
        // distinguer une NOUVELLE attaque d'un simple re-envoi du meme etat.
        smoke: { host: 0, guest: 0 }, cut: { host: 0, guest: 0 },
        // Poignee de main de depart : chacun signale qu'il a bien recu la
        // manche 0. Le compte a rebours ne part que quand les DEUX ont repondu,
        // ce qui garantit un demarrage simultane a un aller-retour reseau pres.
        ready: { host: false, guest: false },
        settled: false, winner: null, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return { id: ref.id, code };
    },
    /* Salons ouverts.
       - PLUS de filtrage strict par grade : c'était la raison n°1 pour laquelle
         deux amis de grades différents ne se voyaient jamais (chacun créait son
         salon et attendait dans le vide). Le grade sert maintenant seulement à
         TRIER (adversaires proches en premier), plus à exclure.
       - Tri par date + rejet des salons de plus de 15 min : sans ça, les salons
         fantômes (onglet fermé pendant l'attente) saturaient la page de 30 et
         masquaient les vrais.
       - `guestUid == null` : un salon déjà rempli n'a rien à faire dans la liste. */
    async listOpenRooms(gradeIndex, army) {
      const q = await db.collection("rooms")
        .where("status", "==", "waiting")
        .orderBy("createdAt", "desc")
        .limit(40).get();
      const fresh = Date.now() - 15 * 60 * 1000;
      const me = auth.currentUser && auth.currentUser.uid;
      const rooms = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((r) => {
        if (r.guestUid) return false;
        if (r.hostUid === me) return false;
        const t = r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : Date.now();
        if (t < fresh) return false;
        // Filtre par armee. Contrairement au grade (qui ne fait que trier),
        // l'armee EXCLUT : c'est tout l'interet de la selection. Un salon
        // "toutes armees" reste visible par tout le monde, et un joueur en
        // mode "toutes armees" voit tous les salons.
        // Filtre par armee : correspondance EXACTE.
        // L'ancienne version laissait les salons "toutes armees" visibles par
        // tout le monde. Comme c'est le reglage par defaut, la quasi-totalite
        // des salons l'etaient : un joueur Marine croisait donc tout le monde,
        // et surtout heritait de questions Terre ou Air, puisque les questions
        // d'un salon sont composees par son hote selon SON armee.
        // Une correspondance exacte garantit que les questions correspondent
        // toujours a l'armee choisie.
        if (army) {
          const ra = r.army || "tout";   // salons anterieurs au champ `army`
          if (ra !== army) return false;
        }
        return true;
      });
      if (gradeIndex != null) {
        rooms.sort((a, b) => Math.abs((a.hostGrade || 0) - gradeIndex) - Math.abs((b.hostGrade || 0) - gradeIndex));
      }
      return rooms;
    },

    /* Jointure ATOMIQUE. L'ancienne version lisait puis écrivait : deux joueurs
       cliquant à une seconde d'intervalle passaient tous les deux le test et
       le second écrasait le premier — qui restait abonné, envoyait ses réponses
       sur la même clé, et voyait sa mise débitée pour un match fantôme. */
    async joinRoom(code, { pseudo, gradeIndex }) {
      // Le filtre `status == "waiting"` est INDISPENSABLE depuis que la lecture
      // des salons est restreinte : pour une requete de liste, Firestore doit
      // pouvoir prouver a partir de la REQUETE SEULE que tous les resultats
      // sont autorises. Sans ce filtre, la requete entiere est refusee et
      // rejoindre par code devient impossible.
      const q = await db.collection("rooms")
        .where("code", "==", code).where("status", "==", "waiting").limit(1).get();
      if (q.empty) throw new Error("Salon introuvable ou deja ferme.");
      const ref = q.docs[0].ref;
      const joined = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("Salon introuvable.");
        const d = snap.data();
        if (d.hostUid === auth.currentUser.uid) throw new Error("C'est ton propre salon, recrue. 🙃");
        if (d.status !== "waiting" || d.guestUid) throw new Error("Salon déjà plein.");
        tx.update(ref, {
          guestUid: auth.currentUser.uid, guestName: pseudo,
          guestGrade: gradeIndex, status: "playing",
        });
        return Object.assign({ id: ref.id }, d, { guestUid: auth.currentUser.uid, status: "playing" });
      });
      return joined;
    },

    // Consulter un salon sans le rejoindre (verification de la mise avant join).
    async peekRoom(code) {
      // Meme contrainte que joinRoom : la requete doit porter le filtre
      // `status == "waiting"` pour etre autorisee par les regles.
      const q = await db.collection("rooms")
        .where("code", "==", code).where("status", "==", "waiting").limit(1).get();
      return q.empty ? null : Object.assign({ id: q.docs[0].id }, q.docs[0].data());
    },
    // Supprime reellement le salon (l'ancien code se contentait de status:"done",
    // ce qui laissait le document trainer indefiniment).
    async closeRoom(roomId) {
      if (!roomId) return;
      await db.collection("rooms").doc(roomId).delete().catch(() => {});
    },
    // `cb(null)` si le document a été SUPPRIMÉ (adversaire qui quitte le salon,
    // nettoyage…) : sans ça, l'autre client recevait un objet vide et l'écran
    // de match restait gelé en silence, mise affichée débitée.
    watchRoom(roomId, cb) { return db.collection("rooms").doc(roomId).onSnapshot((d) => cb(d.exists ? Object.assign({ id: d.id }, d.data()) : null)); },
    // (submitAnswer supprimee : elle ecrivait dans une sous-collection
    //  rooms/{id}/answers que AUCUNE regle ne couvre — les regles ne cascadent
    //  pas — donc l'appel aurait ete refuse. Le jeu passe par updateRoom avec
    //  des champs pointes `answers.<manche>.<role>`.)
    async updateRoom(roomId, patch) { await db.collection("rooms").doc(roomId).update(patch); },

    /* Résolution ATOMIQUE d'une manche.
       L'hote resout a 14,5 s ; l'invite prend le relais a 22,5 s si l'hote a
       disparu. Les deux peuvent donc, dans de rares cas de latence, resoudre
       la MEME manche. Avec un increment cote serveur, le vainqueur gagnerait
       alors 2 manches au lieu d'une.
       La transaction verifie que la manche n'a pas deja avance : si c'est le
       cas, elle ne fait rien. Une seule resolution est donc appliquee, quel
       que soit le nombre de clients qui tentent. */
    /* `compute(d)` : rappel fourni par le jeu, exécuté SUR LES DONNÉES FRAÎCHES
       relues dans la transaction. Il renvoie { scores, roundWinner, isLast }.
       C'était LE bug d'équité n°1 sous latence : les scores étaient calculés
       sur un instantané figé 2,6 s avant le commit — une réponse (ou une
       montre) arrivée entre-temps était comptée zéro. En recalculant dans la
       transaction, la dernière réponse écrite est toujours prise en compte. */
    async resolveRound(roomId, expectedRound, { compute, hostUid, guestUid }) {
      const ref = db.collection("rooms").doc(roomId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { applied: false };
        const d = snap.data();
        if (d.round !== expectedRound || d.status === "done") return { applied: false };

        const { scores, roundWinner, isLast } = compute(d);
        const rw = d.roundWins || { host: 0, guest: 0 };
        const patch = { scores };
        // `max(0, ...)` : deux coups de fusil tires avant le premier aller-retour
        // reseau pouvaient faire passer le compteur sous zero et decaler
        // l'affichage « -1 manche » jusqu'a la fin du match.
        patch.roundWins = {
          host: Math.max(0, (rw.host || 0) + (roundWinner === "host" ? 1 : 0)),
          guest: Math.max(0, (rw.guest || 0) + (roundWinner === "guest" ? 1 : 0)),
        };
        if (isLast) {
          patch.status = "done";
          // Le vainqueur se decide sur les MANCHES d'abord, les points ne
          // servant qu'a departager — exactement comme en solo. Trancher sur
          // les seuls points rendait le FUSIL purement decoratif en 1v1, et
          // pouvait afficher « 3 — 1 » sous le titre « DEFAITE ».
          const fw = patch.roundWins;
          patch.winner =
            fw.host > fw.guest ? hostUid :
            fw.guest > fw.host ? guestUid :
            scores.host > scores.guest ? hostUid :
            scores.guest > scores.host ? guestUid : null;
        } else {
          patch.round = expectedRound + 1;
          patch.roundStartAt = Date.now();
          patch.extend = { host: 0, guest: 0 };
          // Les attaques sont valables UNE manche : sans cette remise a zero,
          // un fumigene ou une grenade de la manche precedente restait dans le
          // document et pouvait se rejouer plus tard.
          patch.smoke = { host: 0, guest: 0 };
          patch.cut = { host: 0, guest: 0 };
        }
        tx.update(ref, patch);
        return { applied: true };
      });
    },
    async settle(roomId) { if (!fns) throw new Error("functions indisponible"); const call = fns.httpsCallable("settleMatch"); const res = await call({ roomId }); return res.data; },

    /* Abandon TRANSACTIONNEL : ne déclare l'adversaire vainqueur que si la
       partie est réellement encore en cours CÔTÉ SERVEUR. Avant, un abandon
       cliqué juste après la résolution de la dernière manche écrasait le
       vainqueur légitime (état local périmé) et inversait le paiement. */
    async abandonRoom(roomId, foeUid, myUid) {
      const ref = db.collection("rooms").doc(roomId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { applied: false };
        const d = snap.data();
        if (d.status !== "playing") return { applied: false, status: d.status, winner: d.winner || null };
        tx.update(ref, { status: "done", winner: foeUid || null, abandonedBy: myUid || null });
        return { applied: true };
      });
    },

    /* Tir de fusil TRANSACTIONNEL : relit `roundWins` et `shield` au moment du
       commit. Corrige deux courses réelles : (1) un tir concurrent à la
       résolution de manche pouvait rendre le compteur négatif et « avaler »
       une victoire adverse ; (2) un casque équipé pendant le vol du tir était
       ignoré. Renvoie ce qui s'est réellement passé pour l'affichage. */
    async shootFoe(roomId, foeRole) {
      const ref = db.collection("rooms").doc(roomId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { result: "gone" };
        const d = snap.data();
        if (d.status !== "playing") return { result: "over" };
        if (d.shield && d.shield[foeRole]) {
          tx.update(ref, { ["shield." + foeRole]: false });
          return { result: "blocked" };
        }
        const rw = (d.roundWins && d.roundWins[foeRole]) || 0;
        if (rw <= 0) return { result: "nothing" };
        tx.update(ref, { ["roundWins." + foeRole]: rw - 1 });
        return { result: "hit" };
      });
    },

    /* ----- VRAIS codes promo Shopify (Cloud Functions — cf. functions/index.js) ----- */
    /* Ces méthodes renvoient TOUJOURS un objet { ok, data|error|unavailable }
       et ne lèvent jamais : l'appelant décide s'il bascule en mode local.
       C'est ce qui permet au jeu de rester entièrement jouable en plan gratuit. */
    redeemShopCode(key) { return callFn("redeemShopCode", { key }); },
    redeemWheelCode(key) { return callFn("redeemWheelCode", { key }); },
    redeemFlashCode() { return callFn("redeemFlashCode", {}); },
    claimDailySpin() { return callFn("claimDailySpin", {}); },
    // Nouvelles sources de coins, toutes réglées côté serveur.
    claimDailyBonus() { return callFn("claimDailyBonus", {}); },
    claimDailyCoins() { return callFn("claimDailyCoins", {}); },
    doPrestige() { return callFn("doPrestige", {}); },
    buyItem(key) { return callFn("buyItem", { key }); },
    promoteGrade() { return callFn("promoteGrade", {}); },
    claimReferral(code) { return callFn("claimReferral", { code }); },
    // Recharge les champs propriété serveur (coins, niveau, xp…) depuis
    // Firestore — utile après un match réglé par l'adversaire.
    async reloadServerFields() {
      const u = auth.currentUser; if (!u) return null;
      try { const snap = await db.collection("profiles").doc(u.uid).get(); return snap.exists ? snap.data() : null; }
      catch (e) { return null; }
    },
    functionsReady() { return fnsOK === true; },
  };

  console.log("[PWFirebase] backend en ligne actif ✅");
})();
