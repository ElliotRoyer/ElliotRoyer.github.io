/* ==========================================================================
   Carnet de rêves — comportement de la page
   Les données viennent de donnees.js (window.REVES), généré par build-index.js.

   Principe : les fils sont toujours invisibles. On les fait apparaître en
   choisissant un mot, jamais en survolant un point. Un mot = un chemin.
   ========================================================================== */

(function () {
  'use strict';

  const D = window.REVES;
  if (!D) { console.error('donnees.js absent : lancer « node build-index.js ».'); return; }

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  const svg = $('graphe');
  const gLiens = $('liens');
  const gPoints = $('points');
  const apercu = $('apercu');
  const voile = $('voile');
  const cartouche = $('cartouche');

  const survolPossible = window.matchMedia('(hover: hover)').matches;

  // Portrait ou paysage : décidé une fois au chargement, d'après la forme de
  // la fenêtre (pas seulement la taille de l'écran). build-index.js a préparé
  // les deux mises en page à partir du même nuage relâché — il suffit de
  // choisir laquelle utiliser. Tourner l'appareil demande de recharger la
  // page pour reprendre l'autre mise en page.
  const portrait = innerWidth < innerHeight;
  const X = (r) => (portrait && r.xM != null) ? r.xM : r.x;
  const Y = (r) => (portrait && r.yM != null) ? r.yM : r.y;

  const boiteVue = portrait && D.viewBoxMobile ? D.viewBoxMobile : D.viewBox;
  if (boiteVue) svg.setAttribute('viewBox', boiteVue);

  const parId = new Map(D.reves.map((r) => [r.id, { reve: r, el: null }]));

  // ======================================================= rêves déjà lus
  //
  // Trois états visuels pour un point : jamais ouvert (gris par défaut),
  // déjà lu (plus sombre, moins visible), et le tout dernier refermé (clair,
  // comme au survol — pour se souvenir lequel on vient de quitter). Ne
  // survit pas à un rechargement de la page : c'est un repère pour la
  // session en cours, pas un journal de lecture permanent.
  const listeParId = new Map();
  let dernierLu = null;

  function marquerCommeLu(id) {
    if (dernierLu && dernierLu !== id) {
      const ancien = parId.get(dernierLu);
      if (ancien) ancien.el.classList.replace('recent', 'lu');
    }
    const n = parId.get(id);
    if (n) { n.el.classList.remove('lu'); n.el.classList.add('recent'); }
    dernierLu = id;

    const entreeListe = listeParId.get(id);
    if (entreeListe) entreeListe.classList.add('lu');
  }


  // ============================================================== le graphe

  const lignesParPaire = new Map();

  D.liens.forEach((l) => {
    const a = parId.get(l.a), b = parId.get(l.b);
    if (!a || !b) return;
    const ligne = document.createElementNS(NS, 'line');
    ligne.setAttribute('class', 'lien');
    ligne.setAttribute('x1', X(a.reve)); ligne.setAttribute('y1', Y(a.reve));
    ligne.setAttribute('x2', X(b.reve)); ligne.setAttribute('y2', Y(b.reve));
    // longueur du trait : sert à l'animation de tracé
    const long = Math.hypot(X(b.reve) - X(a.reve), Y(b.reve) - Y(a.reve));
    ligne.style.setProperty('--longueur', long.toFixed(1));
    gLiens.appendChild(ligne);
    lignesParPaire.set(l.a + '|' + l.b, ligne);
    lignesParPaire.set(l.b + '|' + l.a, ligne);
  });

  D.reves.forEach((r) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'point');
    g.setAttribute('transform', `translate(${X(r)},${Y(r)})`);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', r.titre + (r.date ? ', ' + formatDate(r.date) : ''));
    g.dataset.id = r.id;

    const flotte = document.createElementNS(NS, 'g');
    flotte.setAttribute('class', 'flotte');
    flotte.style.setProperty('--duree', r.duree + 's');
    flotte.style.setProperty('--delai', r.delai + 's');

    flotte.appendChild(cercle('halo', 20));
    flotte.appendChild(cercle('anneau', 12));
    flotte.appendChild(cercle('pastille', 5));

    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'etiquette');
    t.setAttribute('y', -16);
    t.textContent = r.titre;
    flotte.appendChild(t);

    g.appendChild(flotte);
    gPoints.appendChild(g);
    parId.get(r.id).el = g;
  });

  function cercle(classe, r) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', classe);
    c.setAttribute('r', r);
    return c;
  }

  // ==================================== les rêves de chaque mot, par ordre de date

  const revesParMot = new Map();
  D.mots.forEach((m) => {
    const suite = D.reves
      .filter((r) => r.mots.includes(m))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (suite.length > 1) revesParMot.set(m, suite);
  });

  // =============================== dérive des points : on la suspend pour tracer
  //
  // Un survol très bref d'un mot pouvait produire un petit saut visible :
  // le point commençait tout juste à glisser vers sa position exacte quand
  // on relâchait déjà, et l'animation de flottement reprenait aussitôt à
  // vitesse nulle — un arrêt brutal en plein mouvement. La parade : ne
  // jamais interrompre le glissement en cours. Si on relâche avant qu'il
  // soit terminé, la demande est mémorisée et n'est honorée qu'une fois le
  // point effectivement posé, jamais avant.
  const DUREE_INSTALLATION = 820; // un peu plus que la transition CSS (0.8s), par sécurité

  const flottes = () => gPoints.querySelectorAll('.flotte');
  let figee = false;          // un chemin doit-il rester affiché ?
  let installee = false;      // le glissement vers la position exacte est-il terminé ?
  let liberationEnAttente = false;
  let minuteurInstallation = null;

  // Les fils sont attachés aux positions exactes des rêves. Avant de les
  // dessiner, on ramène doucement chaque point sur la sienne.
  function figer() {
    clearTimeout(minuteurInstallation);
    liberationEnAttente = false;
    if (figee) { installee = false; } // un nouveau mot : on reglisse depuis la position actuelle
    figee = true;

    flottes().forEach((g) => { g.style.transform = getComputedStyle(g).transform; });
    svg.classList.add('fige');                       // coupe l'animation
    requestAnimationFrame(() => {
      flottes().forEach((g) => { g.style.transform = 'translate(0px, 0px)'; });
    });

    minuteurInstallation = setTimeout(() => {
      installee = true;
      if (liberationEnAttente) executerLiberation();
    }, DUREE_INSTALLATION);
  }

  function liberer() {
    if (!figee) return;
    figee = false;
    if (!installee) { liberationEnAttente = true; return; } // le point glisse encore : on attend
    executerLiberation();
  }

  function executerLiberation() {
    clearTimeout(minuteurInstallation);
    liberationEnAttente = false;
    installee = false;
    // l'animation redémarre à sa position zéro, exactement où le point vient
    // de s'immobiliser : aucun saut possible.
    flottes().forEach((g) => { g.style.transform = ''; g.style.animationDelay = '0s'; });
    svg.classList.remove('fige');
  }

  // ============================================================== le chemin

  let motActif = null;      // mot dont le chemin est affiché
  let motEpingle = false;   // affiché suite à un clic (donc persistant)

  function tracerChemin(mot, epingler) {
    const suite = revesParMot.get(mot);
    if (!suite) return;

    if (motActif !== mot) {
      effacerChemin(true);
      motActif = mot;
      figer();
      svg.classList.add('chemin-actif');

      suite.forEach((r) => parId.get(r.id).el.classList.add('chemin'));

      // les fils se dessinent l'un après l'autre, dans l'ordre des dates
      for (let i = 0; i + 1 < suite.length; i++) {
        const ligne = lignesParPaire.get(suite[i].id + '|' + suite[i + 1].id);
        if (!ligne) continue;
        ligne.style.setProperty('--rang', (i * 0.18).toFixed(2) + 's');
        ligne.classList.add('chemin');
      }

      $('cartouche-mot').textContent = mot;
      $('cartouche-compte').textContent =
        suite.length + (suite.length > 1 ? ' rêves' : ' rêve');
      cartouche.hidden = false;
    }

    if (epingler) motEpingle = true;
    majEtatMots();
  }

  function effacerChemin(force) {
    if (!motActif) return;
    if (motEpingle && !force) return;
    gLiens.querySelectorAll('.chemin').forEach((l) => {
      l.classList.remove('chemin');
      l.style.removeProperty('--rang');
    });
    gPoints.querySelectorAll('.chemin').forEach((p) => p.classList.remove('chemin'));
    svg.classList.remove('chemin-actif');
    cartouche.hidden = true;
    motActif = null;
    motEpingle = false;
    liberer();
    majEtatMots();
  }

  function majEtatMots() {
    document.querySelectorAll('.mot').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mot === motActif && motEpingle));
    });
  }

  $('cartouche-effacer').addEventListener('click', () => effacerChemin(true));

  // fabrique les boutons de mots-clés (aperçu et fiche partagent ce code)
  function boutonsMots(reve, conteneur, tronquer) {
    conteneur.replaceChildren();
    reve.mots.forEach((mot) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mot' + (revesParMot.has(mot) ? '' : ' seul');
      b.dataset.mot = mot;
      b.textContent = mot;

      if (!revesParMot.has(mot)) {
        b.title = 'Ce mot n’apparaît que dans ce rêve';
        b.disabled = true;
        conteneur.appendChild(b);
        return;
      }

      b.setAttribute('aria-pressed', 'false');
      b.title = 'Tracer le chemin de « ' + mot + ' »';

      if (survolPossible) {
        b.addEventListener('mouseenter', () => { if (!motEpingle) tracerChemin(mot, false); });
        b.addEventListener('mouseleave', () => { if (!motEpingle) effacerChemin(false); });
      }
      b.addEventListener('focus', () => { if (!motEpingle) tracerChemin(mot, false); });
      b.addEventListener('click', () => {
        if (!voile.hidden) fermer();          // la lecture cède la place au chemin
        afficherConstellation();              // le chemin ne se voit que là
        tracerChemin(mot, true);
      });

      conteneur.appendChild(b);
    });

    if (tronquer) limiterADeuxLignes(conteneur);
  }

  // Au-delà de deux lignes, les mots supplémentaires sont masqués derrière
  // un bouton « + N mots » — l'aperçu reste léger même pour un rêve à
  // vocabulaire chargé.
  function limiterADeuxLignes(conteneur) {
    const boutons = [...conteneur.querySelectorAll('.mot')];
    if (!boutons.length) return;
    const rangs = [...new Set(boutons.map((b) => b.offsetTop))];
    if (rangs.length <= 2) return; // tient déjà sur deux lignes

    const limite = rangs[1];
    const masques = boutons.filter((b) => b.offsetTop > limite);
    masques.forEach((b) => { b.hidden = true; });

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'mot-plus';
    plus.textContent = `+ ${masques.length} mot${masques.length > 1 ? 's' : ''}`;
    plus.addEventListener('click', (e) => {
      e.stopPropagation(); // le bouton se retire du DOM juste après : sans ceci,
                            // l'écouteur « clic à l'extérieur » ne retrouve plus
                            // .apercu comme ancêtre et referme l'aperçu à tort
      masques.forEach((b) => { b.hidden = false; });
      plus.remove();
      if (reveApercu) placerApercu(parId.get(reveApercu).el); // la hauteur a changé
    });
    conteneur.appendChild(plus);
  }

  // ============================================================= vues (bascule)

  const cadreGraphe = $('graphe-cadre');
  const cadreListe = $('liste-cadre');
  const bascule = $('bascule');

  // Le chemin d'un mot ne se voit que sur la constellation : cliquer un mot
  // depuis la fiche (elle-même accessible depuis la liste) doit donc y
  // ramener, sinon le chemin se dessine hors champ, invisible.
  function afficherConstellation() {
    cacherApercu();
    cadreListe.hidden = true;
    cadreGraphe.hidden = false;
    document.body.classList.remove('mode-liste');
    bascule.textContent = 'Voir la liste';
    bascule.setAttribute('aria-pressed', 'false');
  }

  function afficherListe() {
    cacherApercu();
    effacerChemin(true);
    cadreGraphe.hidden = true;
    cadreListe.hidden = false;
    document.body.classList.add('mode-liste');
    bascule.textContent = 'Voir la constellation';
    bascule.setAttribute('aria-pressed', 'true');
  }

  bascule.addEventListener('click', () => {
    if (cadreListe.hidden) afficherListe(); else afficherConstellation();
  });

  // ============================================================== l'aperçu

  let reveApercu = null;
  let apercuViaClavier = false;

  function montrerApercu(id, viaClavier) {
    if (!survolPossible || reveApercu === id) return;
    const n = parId.get(id);
    if (!n) return;

    if (reveApercu) parId.get(reveApercu).el.classList.remove('actif');
    reveApercu = id;
    apercuViaClavier = !!viaClavier;
    n.el.classList.add('actif');

    $('apercu-titre').textContent = n.reve.titre;
    $('apercu-date').textContent = n.reve.date ? formatDate(n.reve.date) : '';
    $('apercu-extrait').textContent = insecables(n.reve.extrait);
    $('apercu-lire').onclick = () => ouvrir(id, n.el);
    boutonsMots(n.reve, $('apercu-mots'), true);

    apercu.classList.add('visible');
    placerApercu(n.el);
    majEtatMots();
  }

  function cacherApercu() {
    if (!reveApercu) return;
    parId.get(reveApercu).el.classList.remove('actif');
    reveApercu = null;
    apercuViaClavier = false;
    apercu.classList.remove('visible');
  }

  // l'aperçu s'ancre sous le point, ou au-dessus s'il manque la place
  function placerApercu(el) {
    const p = el.getBoundingClientRect();
    const a = apercu.getBoundingClientRect();
    const m = 14;

    let x = p.left + p.width / 2 - a.width / 2;
    x = Math.min(Math.max(m, x), innerWidth - a.width - m);

    let y = p.bottom + m;
    if (y + a.height > innerHeight - m) y = p.top - a.height - m;
    y = Math.min(Math.max(m, y), innerHeight - a.height - m);

    apercu.style.left = Math.round(x) + 'px';
    apercu.style.top = Math.round(y) + 'px';
  }

  gPoints.addEventListener('mouseover', (e) => {
    const p = e.target.closest('.point');
    if (p) montrerApercu(p.dataset.id);
  });

  gPoints.addEventListener('focusin', (e) => {
    if (ignorerProchainFocus) { ignorerProchainFocus = false; return; }
    const p = e.target.closest('.point');
    if (p) montrerApercu(p.dataset.id, true);
  });

  // L'aperçu ouvert au survol se ferme tout seul si le pointeur s'éloigne
  // suffisamment — pas besoin de cliquer ailleurs. La marge est assez large
  // pour qu'on puisse passer du point à l'aperçu (et à ses mots) sans se
  // hâter. Un aperçu ouvert au clavier n'est, lui, jamais concerné : il n'a
  // aucune raison de dépendre d'une position de souris.
  const SEUIL_ELOIGNEMENT = 130; // px

  function distanceAuRectangle(x, y, rect) {
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.hypot(dx, dy);
  }

  document.addEventListener('mousemove', (e) => {
    if (!survolPossible || !reveApercu || apercuViaClavier) return;
    const rPoint = parId.get(reveApercu).el.getBoundingClientRect();
    const rApercu = apercu.getBoundingClientRect();
    const d = Math.min(
      distanceAuRectangle(e.clientX, e.clientY, rPoint),
      distanceAuRectangle(e.clientX, e.clientY, rApercu)
    );
    if (d > SEUIL_ELOIGNEMENT) cacherApercu();
  });

  // clic dans le vide : on range tout
  document.addEventListener('click', (e) => {
    if (e.target.closest('.point, .apercu, .cartouche, .voile, .entete, .liste')) return;
    cacherApercu();
    effacerChemin(true);
  });

  // ============================================================ la lecture

  gPoints.addEventListener('click', (e) => {
    const p = e.target.closest('.point');
    if (p) ouvrir(p.dataset.id, p);
  });

  gPoints.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const p = e.target.closest('.point');
    if (!p) return;
    e.preventDefault();
    ouvrir(p.dataset.id, p);
  });

  let renvoiFocus = null;
  let ignorerProchainFocus = false; // évite qu'une fermeture ne rouvre l'aperçu (voir plus haut)
  let idOuvert = null;

  function ouvrir(id, origine) {
    const r = parId.get(id).reve;
    idOuvert = id;
    $('fiche-titre').textContent = r.titre;
    $('fiche-date').textContent = r.date ? formatDate(r.date) : '';

    const zone = $('fiche-texte');
    zone.replaceChildren();
    r.texte.forEach((par) => {
      const p = document.createElement('p');
      p.innerHTML = texteEnHTML(par);
      zone.appendChild(p);
    });

    const mots = $('fiche-mots');
    if (r.mots.length) {
      boutonsMots(r, mots, false);
      const intitule = document.createElement('span');
      intitule.className = 'intitule';
      intitule.textContent = 'Relié par :';
      mots.prepend(intitule);
    } else {
      mots.replaceChildren();
    }

    renvoiFocus = origine || null;
    cacherApercu();
    document.body.classList.add('lecture-ouverte');
    voile.hidden = false;
    voile.querySelector('.fiche-corps').scrollTop = 0;   // texte long : on repart du début
    requestAnimationFrame(() => voile.classList.add('ouvert'));
    $('fermer').focus();
  }

  function fermer() {
    if (voile.hidden) return;
    voile.classList.remove('ouvert');
    document.body.classList.remove('lecture-ouverte');
    setTimeout(() => { voile.hidden = true; }, 560);
    if (renvoiFocus) { ignorerProchainFocus = true; renvoiFocus.focus(); renvoiFocus = null; }
    if (idOuvert) { marquerCommeLu(idOuvert); idOuvert = null; }
  }

  $('fermer').addEventListener('click', fermer);
  voile.addEventListener('click', (e) => { if (e.target === voile) fermer(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!voile.hidden) fermer();
    else if (motActif) effacerChemin(true);
    else cacherApercu();
  });

  // ============================================================= vue liste

  const liste = $('liste');

  [...D.reves]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .forEach((r) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'liste-entree';

      const t = document.createElement('span');
      t.className = 'liste-titre';
      t.textContent = r.titre;

      const m = document.createElement('span');
      m.className = 'liste-meta';
      m.textContent = [r.date ? formatDate(r.date) : '', r.mots.join(' · ')]
        .filter(Boolean).join(' — ');

      const x = document.createElement('span');
      x.className = 'liste-extrait';
      x.textContent = insecables(r.extrait);

      b.append(t, m, x);
      b.addEventListener('click', () => ouvrir(r.id, b));
      li.appendChild(b);
      liste.appendChild(li);
      listeParId.set(r.id, b);
    });


  // l'aperçu suit le point si la fenêtre change de taille
  addEventListener('resize', () => {
    if (reveApercu) placerApercu(parId.get(reveApercu).el);
  });

  // ================================================================ outils

  // Espaces insécables « à la française » : avant ; : ! ?, et de part et
  // d'autre des guillemets « ». Appliquée à l'affichage plutôt qu'au fichier
  // source, pour que l'écriture dans Obsidian reste une ponctuation ordinaire
  // — aucune touche spéciale à retenir. Un espace insécable déjà tapé à la
  // main n'est pas perturbé : la règle se contente de le normaliser.
  function insecables(s) {
    return s
      .replace(/\s+([;:!?])/g, '\u00A0$1')
      .replace(/«\s+/g, '«\u00A0')
      .replace(/\s+»/g, '\u00A0»');
  }

  // **gras** et *italique*, à la façon d'Obsidian. Échappe d'abord le texte
  // (au cas où un rêve contiendrait un caractère < ou &), pour qu'aucun
  // balisage étranger ne puisse s'y glisser.
  function texteEnHTML(s) {
    let t = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    t = insecables(t);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return t;
  }

  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
})();
