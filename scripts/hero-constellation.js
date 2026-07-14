/**
 * Fond animé « constellation neuronale » pour le hero de la page d'accueil.
 *
 * Scopé à `.hero-media` (zone entre le header et l'intro-divider). Superpose :
 *   1) un réseau ambiant de nœuds qui dérivent et se relient (réseau de
 *      neurones + poussière d'étoiles) ;
 *   2) de VRAIES constellations (Leo, Orion, Grande Ourse, Cassiopée) tracées
 *      plus intensément, avec nom discret et scintillement ;
 *   3) une réaction à la souris : parallaxe de profondeur + « rassemblement »
 *      des nœuds proches du curseur.
 *
 * Toujours en mouvement (contrairement à la version chat, jamais mise en
 * pause tant que l'onglet est visible). Canvas 2D pur, sans dépendance.
 * Respecte prefers-reduced-motion (rendu statique riche) et les thèmes.
 */
(function () {
  const hero = document.querySelector('.home-page .intro-text .hero-media');
  if (!hero) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-constellation';
  canvas.setAttribute('aria-hidden', 'true');
  const s = canvas.style;
  s.position = 'absolute';
  s.inset = '0';
  s.width = '100%';
  s.height = '100%';
  s.zIndex = '3'; // au-dessus du gradient ::before (z-index 1), sous le texte (z-index 4)
  s.pointerEvents = 'none';
  hero.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ACCENTS = [
    [158, 232, 255], // cyan
    [185, 140, 255], // violet clair
    [123, 86, 255],  // violet profond
  ];

  // Constellations réelles (coordonnées normalisées 0..1 dans leur propre
  // cadre ; x vers la droite, y vers le bas). Formes simplifiées mais
  // reconnaissables. `edges` relie les indices d'étoiles.
  const CONSTELLATIONS = [
    {
      name: 'LEO',
      anchor: { x: 0.72, y: 0.30 }, scale: 0.26, depth: 1.0,
      stars: [
        [0.30, 0.90], [0.34, 0.68], [0.40, 0.52], [0.34, 0.40],
        [0.22, 0.34], [0.16, 0.22], [0.75, 0.34], [0.72, 0.52], [1.00, 0.44],
      ],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 7], [7, 6], [6, 8], [8, 7], [7, 0]],
    },
    {
      name: 'ORION',
      anchor: { x: 0.30, y: 0.55 }, scale: 0.20, depth: 1.25,
      stars: [
        [0.30, 0.14], [0.72, 0.10], [0.40, 0.52], [0.50, 0.55],
        [0.60, 0.52], [0.34, 0.92], [0.78, 0.90],
      ],
      edges: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]],
    },
    {
      name: 'URSA MAJOR',
      anchor: { x: 0.12, y: 0.16 }, scale: 0.30, depth: 0.8,
      stars: [
        [0.92, 0.15], [0.90, 0.42], [0.66, 0.52], [0.63, 0.28],
        [0.44, 0.30], [0.22, 0.24], [0.03, 0.12],
      ],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
    },
    {
      name: 'CASSIOPEIA',
      anchor: { x: 0.62, y: 0.08 }, scale: 0.17, depth: 0.9,
      stars: [[0.02, 0.30], [0.26, 0.70], [0.50, 0.28], [0.74, 0.68], [0.98, 0.30]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
    },
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];
  let t = 0;

  // Position souris normalisée par rapport au hero (-0.5..0.5), et absolue.
  const mouse = { nx: 0, ny: 0, x: -9999, y: -9999, inside: false };

  function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function createNodes() {
    const count = Math.max(40, Math.min(70, Math.floor((width * height) / 20000)));
    nodes = new Array(count);
    for (let i = 0; i < count; i += 1) {
      nodes[i] = {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 1 + Math.random() * 1.5,
        accent: ACCENTS[i % ACCENTS.length],
        phase: Math.random() * Math.PI * 2,
      };
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    createNodes();
  }

  const maxDist = 132;
  const maxDistSq = maxDist * maxDist;
  const mouseDist = 168;
  const mouseDistSq = mouseDist * mouseDist;

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const light = isLightTheme();
    const lineBase = light ? [88, 66, 205] : [150, 195, 255];
    const ambientPeak = light ? 0.24 : 0.18;
    const starRGB = light ? [70, 52, 190] : [212, 236, 255];

    // Parallaxe : décalage doux opposé au curseur (profondeur).
    const parX = mouse.inside ? -mouse.nx : 0;
    const parY = mouse.inside ? -mouse.ny : 0;

    // 1) Réseau ambiant.
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > maxDistSq) continue;
        const alpha = (1 - distSq / maxDistSq) * ambientPeak;
        ctx.strokeStyle = `rgba(${lineBase[0]}, ${lineBase[1]}, ${lineBase[2]}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Réaction souris : relie les nœuds proches au curseur + les avive.
    if (mouse.inside) {
      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i];
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > mouseDistSq) continue;
        const alpha = (1 - distSq / mouseDistSq) * (light ? 0.4 : 0.34);
        ctx.strokeStyle = `rgba(${lineBase[0]}, ${lineBase[1]}, ${lineBase[2]}, ${alpha})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }

    // Nœuds ambiants.
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const [r, g, bl] = n.accent;
      const tw = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.03 + n.phase));
      ctx.beginPath();
      ctx.shadowColor = `rgba(${r}, ${g}, ${bl}, ${light ? 0.3 : 0.55})`;
      ctx.shadowBlur = light ? 4 : 7;
      ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${(light ? 0.6 : 0.8) * tw})`;
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // 2) Vraies constellations : plus intenses, avec dérive + scintillement.
    for (let c = 0; c < CONSTELLATIONS.length; c += 1) {
      const cons = CONSTELLATIONS[c];
      const sizePx = cons.scale * width;
      const driftX = Math.sin(t * 0.008 + c * 1.7) * 7;
      const driftY = Math.cos(t * 0.006 + c * 2.3) * 6;
      const px = cons.anchor.x * width + driftX + parX * 26 * cons.depth;
      const py = cons.anchor.y * height + driftY + parY * 20 * cons.depth;

      const pts = cons.stars.map((star) => ({
        x: px + star[0] * sizePx,
        y: py + star[1] * sizePx,
      }));

      // Lignes de la figure (plus visibles que le réseau ambiant).
      ctx.strokeStyle = light
        ? 'rgba(88, 66, 205, 0.5)'
        : 'rgba(170, 210, 255, 0.42)';
      ctx.lineWidth = 1.2;
      for (let e = 0; e < cons.edges.length; e += 1) {
        const p1 = pts[cons.edges[e][0]];
        const p2 = pts[cons.edges[e][1]];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // Étoiles brillantes + scintillement individuel.
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const tw = 0.6 + 0.4 * Math.sin(t * 0.05 + i * 1.3 + c);
        ctx.beginPath();
        ctx.shadowColor = light ? 'rgba(120, 90, 230, 0.5)' : 'rgba(158, 232, 255, 0.85)';
        ctx.shadowBlur = light ? 6 : 12;
        ctx.fillStyle = `rgba(${starRGB[0]}, ${starRGB[1]}, ${starRGB[2]}, ${0.9 * (0.7 + 0.3 * tw)})`;
        ctx.arc(p.x, p.y, 2.1 + tw * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Nom de la constellation, discret, en petites capitales espacées.
      const label = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      label.x /= pts.length;
      label.y = Math.min(...pts.map((p) => p.y)) - 12;
      ctx.font = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = light ? 'rgba(80, 60, 180, 0.55)' : 'rgba(200, 224, 255, 0.5)';
      ctx.save();
      ctx.translate(label.x, label.y);
      // Espacement de lettres manuel (letterSpacing n'est pas partout dispo).
      const text = cons.name;
      const spacing = 3;
      let totalW = 0;
      for (const ch of text) totalW += ctx.measureText(ch).width + spacing;
      let cx = -totalW / 2;
      ctx.textAlign = 'left';
      for (const ch of text) {
        ctx.fillText(ch, cx, 0);
        cx += ctx.measureText(ch).width + spacing;
      }
      ctx.restore();
      ctx.textAlign = 'start';
    }
  }

  function step() {
    t += 1;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -16) n.x = width + 16;
      else if (n.x > width + 16) n.x = -16;
      if (n.y < -16) n.y = height + 16;
      else if (n.y > height + 16) n.y = -16;
    }
  }

  let rafId = 0;
  function loop() {
    rafId = window.requestAnimationFrame(loop);
    if (document.hidden) return;
    step();
    draw();
  }

  window.addEventListener('mousemove', (event) => {
    const rect = hero.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    mouse.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    mouse.x = x;
    mouse.y = y;
    mouse.nx = rect.width ? (x / rect.width - 0.5) : 0;
    mouse.ny = rect.height ? (y / rect.height - 0.5) : 0;
  }, { passive: true });

  window.addEventListener('mouseleave', () => { mouse.inside = false; mouse.x = -9999; mouse.y = -9999; });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
      if (prefersReducedMotion) draw();
    }, 180);
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      resize();
      if (prefersReducedMotion) draw();
    });
    ro.observe(hero);
  }

  const themeObserver = new MutationObserver(() => draw());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();
  if (prefersReducedMotion) draw();
  else loop();
})();
