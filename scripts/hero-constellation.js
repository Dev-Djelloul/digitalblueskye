/**
 * Fond animé « défilement céleste » pour le hero de la page d'accueil.
 *
 * Scopé à `.hero-media` (zone entre le header et l'intro-divider). Un réseau
 * ambiant de nœuds (réseau de neurones + poussière d'étoiles) sert de toile de
 * fond ; par-dessus défile en continu, d'est en ouest comme la vraie voûte
 * céleste, un CATALOGUE de constellations réelles connues (Orion, Léo, Grande
 * et Petite Ourse, Cassiopée, Cygne, Scorpion, Croix du Sud, Taureau, Gémeaux,
 * Grand Chien, Lyre, Bouvier, Pégase, Sagittaire…). Chaque figure entre par la
 * droite, traverse, sort par la gauche et est recyclée avec la constellation
 * suivante du catalogue — la parade est donc infinie et couvre tout le
 * catalogue au fil du temps. Noms discrets + scintillement + réaction souris
 * (parallaxe de profondeur et rassemblement des nœuds proches du curseur).
 *
 * Canvas 2D pur, sans dépendance. Toujours animé (pause si onglet masqué),
 * respect de prefers-reduced-motion, couleurs adaptées clair/sombre.
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

  // Catalogue de constellations réelles. Coordonnées normalisées 0..1 dans un
  // cadre propre (x vers la droite, y vers le bas), formes simplifiées mais
  // reconnaissables. `edges` relie les indices d'étoiles.
  const CATALOG = [
    { name: 'ORION',
      stars: [[0.30, 0.14], [0.72, 0.10], [0.40, 0.52], [0.50, 0.55], [0.60, 0.52], [0.34, 0.92], [0.78, 0.90]],
      edges: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
    { name: 'URSA MAJOR',
      stars: [[0.92, 0.15], [0.90, 0.42], [0.66, 0.52], [0.63, 0.28], [0.44, 0.30], [0.22, 0.24], [0.03, 0.12]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
    { name: 'LEO',
      stars: [[0.30, 0.90], [0.34, 0.68], [0.40, 0.52], [0.34, 0.40], [0.22, 0.34], [0.16, 0.22], [0.75, 0.34], [0.72, 0.52], [1.00, 0.44]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 7], [7, 6], [6, 8], [8, 7], [7, 0]] },
    { name: 'CASSIOPEIA',
      stars: [[0.02, 0.30], [0.26, 0.70], [0.50, 0.28], [0.74, 0.68], [0.98, 0.30]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { name: 'CYGNUS',
      stars: [[0.50, 0.05], [0.50, 0.42], [0.50, 0.68], [0.50, 0.95], [0.14, 0.46], [0.86, 0.40]],
      edges: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]] },
    { name: 'SCORPIUS',
      stars: [[0.12, 0.12], [0.22, 0.22], [0.32, 0.32], [0.44, 0.44], [0.52, 0.56], [0.56, 0.70], [0.50, 0.82], [0.38, 0.88], [0.26, 0.84]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]] },
    { name: 'CRUX',
      stars: [[0.50, 0.05], [0.50, 0.95], [0.12, 0.52], [0.88, 0.46], [0.58, 0.30]],
      edges: [[0, 1], [2, 3]] },
    { name: 'URSA MINOR',
      stars: [[0.06, 0.10], [0.22, 0.24], [0.32, 0.42], [0.30, 0.64], [0.54, 0.58], [0.58, 0.80], [0.40, 0.84]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 6], [6, 5], [5, 4], [4, 3]] },
    { name: 'TAURUS',
      stars: [[0.08, 0.32], [0.24, 0.42], [0.40, 0.52], [0.56, 0.42], [0.72, 0.30], [0.90, 0.10], [0.30, 0.14]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6]] },
    { name: 'GEMINI',
      stars: [[0.20, 0.10], [0.26, 0.36], [0.31, 0.62], [0.36, 0.88], [0.60, 0.12], [0.63, 0.38], [0.67, 0.63], [0.71, 0.87]],
      edges: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [0, 4], [3, 7]] },
    { name: 'CANIS MAJOR',
      stars: [[0.30, 0.18], [0.46, 0.36], [0.40, 0.56], [0.56, 0.72], [0.72, 0.60], [0.24, 0.66]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]] },
    { name: 'LYRA',
      stars: [[0.30, 0.06], [0.56, 0.22], [0.34, 0.46], [0.56, 0.56], [0.32, 0.78]],
      edges: [[0, 1], [1, 3], [3, 4], [4, 2], [2, 0], [2, 3]] },
    { name: 'BOOTES',
      stars: [[0.50, 0.95], [0.30, 0.60], [0.34, 0.30], [0.55, 0.10], [0.70, 0.34], [0.64, 0.62]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 5]] },
    { name: 'PEGASUS',
      stars: [[0.16, 0.18], [0.84, 0.16], [0.86, 0.84], [0.18, 0.86], [1.00, 0.04]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4]] },
    { name: 'SAGITTARIUS',
      stars: [[0.18, 0.56], [0.30, 0.30], [0.46, 0.30], [0.50, 0.56], [0.62, 0.20], [0.70, 0.56], [0.34, 0.76], [0.60, 0.76]],
      edges: [[0, 3], [3, 5], [5, 7], [7, 6], [6, 0], [1, 2], [2, 4], [0, 1], [5, 4]] },
    { name: 'ANDROMEDA',
      stars: [[0.08, 0.22], [0.34, 0.36], [0.60, 0.48], [0.86, 0.58]],
      edges: [[0, 1], [1, 2], [2, 3]] },
    { name: 'AQUILA',
      stars: [[0.50, 0.46], [0.34, 0.30], [0.18, 0.16], [0.66, 0.30], [0.82, 0.18], [0.50, 0.72], [0.42, 0.94]],
      edges: [[2, 1], [1, 0], [0, 3], [3, 4], [0, 5], [5, 6]] },
    { name: 'PERSEUS',
      stars: [[0.20, 0.10], [0.35, 0.30], [0.46, 0.50], [0.56, 0.66], [0.72, 0.82], [0.40, 0.74], [0.30, 0.92]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]] },
    { name: 'CORONA BOREALIS',
      stars: [[0.10, 0.56], [0.20, 0.34], [0.35, 0.20], [0.50, 0.16], [0.65, 0.20], [0.80, 0.34], [0.90, 0.56]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
    { name: 'DELPHINUS',
      stars: [[0.46, 0.20], [0.62, 0.30], [0.56, 0.48], [0.40, 0.40], [0.24, 0.62]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]] },
    { name: 'HERCULES',
      stars: [[0.40, 0.36], [0.60, 0.36], [0.65, 0.56], [0.38, 0.56], [0.24, 0.14], [0.76, 0.14], [0.30, 0.82], [0.70, 0.82]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 5], [3, 6], [2, 7]] },
    { name: 'CEPHEUS',
      stars: [[0.25, 0.56], [0.25, 0.26], [0.50, 0.08], [0.75, 0.26], [0.75, 0.56]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
    { name: 'AURIGA',
      stars: [[0.30, 0.16], [0.62, 0.10], [0.86, 0.42], [0.64, 0.78], [0.24, 0.56]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
    { name: 'CORVUS',
      stars: [[0.25, 0.26], [0.70, 0.20], [0.80, 0.66], [0.35, 0.76], [0.14, 0.54]],
      edges: [[4, 0], [0, 1], [1, 2], [2, 3], [3, 0]] },
    { name: 'DRACO',
      stars: [[0.08, 0.82], [0.20, 0.62], [0.35, 0.56], [0.46, 0.42], [0.56, 0.30], [0.68, 0.24], [0.80, 0.14], [0.90, 0.22]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] },
    { name: 'VIRGO',
      stars: [[0.14, 0.24], [0.34, 0.34], [0.50, 0.30], [0.66, 0.46], [0.54, 0.66], [0.78, 0.78]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5]] },
    { name: 'CAPRICORNUS',
      stars: [[0.15, 0.30], [0.36, 0.18], [0.60, 0.34], [0.82, 0.54], [0.54, 0.82], [0.28, 0.60]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
    { name: 'TRIANGULUM',
      stars: [[0.14, 0.30], [0.86, 0.24], [0.54, 0.82]],
      edges: [[0, 1], [1, 2], [2, 0]] },
    { name: 'ARIES',
      stars: [[0.10, 0.58], [0.40, 0.46], [0.70, 0.30], [0.86, 0.34]],
      edges: [[0, 1], [1, 2], [2, 3]] },
    { name: 'CANIS MINOR',
      stars: [[0.22, 0.66], [0.78, 0.34]],
      edges: [[0, 1]] },
  ];

  // Précalcule la bounding box normalisée de chaque figure : sert à garantir
  // qu'une constellation tient ENTIÈREMENT dans le cadre (échelle + position
  // contraintes), donc jamais coupée en haut/bas.
  for (let i = 0; i < CATALOG.length; i += 1) {
    const st = CATALOG[i].stars;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let k = 0; k < st.length; k += 1) {
      if (st[k][0] < minX) minX = st[k][0];
      if (st[k][0] > maxX) maxX = st[k][0];
      if (st[k][1] < minY) minY = st[k][1];
      if (st[k][1] > maxY) maxY = st[k][1];
    }
    CATALOG[i].bbox = { minX, maxX, minY, maxY, h: Math.max(0.001, maxY - minY) };
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];
  let instances = [];
  let nextCatalog = 0;
  let slotGap = 480;
  let t = 0;

  const SPEED = 0.018; // fraction de la largeur par seconde (défilement lent)
  const yBands = [0.14, 0.26, 0.66, 0.80]; // bandes verticales (on évite le centre du titre)
  let bandCursor = 0;

  const mouse = { nx: 0, ny: 0, x: -9999, y: -9999, inside: false };

  function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function makeInstance(leftX) {
    const band = yBands[bandCursor % yBands.length];
    bandCursor += 1;
    const ci = nextCatalog % CATALOG.length;
    nextCatalog += 1;
    const bbox = CATALOG[ci].bbox;

    // Marges (haut réservé au libellé) : la figure doit tenir entièrement.
    const topM = 14 + 14; // marge + place du nom au-dessus
    const botM = 14;
    const bobRoom = 6;
    const available = Math.max(30, height - topM - botM - bobRoom);

    // Échelle souhaitée (fraction de largeur) bornée pour que la hauteur réelle
    // de la figure (bbox.h * sizePx) ne dépasse jamais l'espace vertical.
    let sizePx = (0.15 + Math.random() * 0.06) * width;
    const maxSizeByHeight = available / bbox.h;
    if (sizePx > maxSizeByHeight) sizePx = maxSizeByHeight;

    // yTop tel que la figure reste dans [topM ; height - botM].
    const yTopMin = topM - bbox.minY * sizePx;
    const yTopMax = height - botM - bbox.maxY * sizePx - bobRoom;
    let yTop = (band + (Math.random() - 0.5) * 0.05) * height - bbox.minY * sizePx;
    if (yTopMax >= yTopMin) yTop = Math.min(yTopMax, Math.max(yTopMin, yTop));
    else yTop = (height - bbox.h * sizePx) / 2 - bbox.minY * sizePx;

    return {
      ci,
      x: leftX,
      yTop,
      sizePx,
      phase: Math.random() * Math.PI * 2,
      bob: 0.4 + Math.random() * 0.6,
    };
  }

  function createInstances() {
    instances = [];
    nextCatalog = 0;
    bandCursor = 0;
    slotGap = Math.max(360, width * 0.42);
    const count = Math.ceil(width / slotGap) + 3;
    for (let i = 0; i < count; i += 1) {
      instances.push(makeInstance(-slotGap + i * slotGap));
    }
  }

  function createNodes() {
    const count = Math.max(38, Math.min(64, Math.floor((width * height) / 22000)));
    nodes = new Array(count);
    for (let i = 0; i < count; i += 1) {
      nodes[i] = {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: -0.12 - Math.random() * 0.14, // léger courant vers l'ouest
        vy: (Math.random() - 0.5) * 0.16,
        r: 1 + Math.random() * 1.4,
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
    createInstances();
  }

  const maxDist = 128;
  const maxDistSq = maxDist * maxDist;
  const mouseDist = 168;
  const mouseDistSq = mouseDist * mouseDist;

  function drawConstellation(inst, light, starRGB, parX, parY) {
    const cons = CATALOG[inst.ci];
    const sizePx = inst.sizePx;
    const bob = Math.sin(t * 0.6 + inst.phase) * 3 * inst.bob;
    const ox = inst.x + parX * 18;
    const oy = inst.yTop + bob + parY * 14;

    const pts = cons.stars.map((star) => ({ x: ox + star[0] * sizePx, y: oy + star[1] * sizePx }));

    ctx.strokeStyle = light ? 'rgba(88, 66, 205, 0.5)' : 'rgba(170, 210, 255, 0.42)';
    ctx.lineWidth = 1.2;
    for (let e = 0; e < cons.edges.length; e += 1) {
      const p1 = pts[cons.edges[e][0]];
      const p2 = pts[cons.edges[e][1]];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.3 + inst.phase);
      ctx.beginPath();
      ctx.shadowColor = light ? 'rgba(120, 90, 230, 0.5)' : 'rgba(158, 232, 255, 0.85)';
      ctx.shadowBlur = light ? 6 : 12;
      ctx.fillStyle = `rgba(${starRGB[0]}, ${starRGB[1]}, ${starRGB[2]}, ${0.9 * (0.7 + 0.3 * tw)})`;
      ctx.arc(p.x, p.y, 2.1 + tw * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Nom discret, en petites capitales espacées, au-dessus de la figure.
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const top = Math.min.apply(null, pts.map((p) => p.y)) - 12;
    ctx.font = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = light ? 'rgba(80, 60, 180, 0.5)' : 'rgba(200, 224, 255, 0.46)';
    const text = cons.name;
    const spacing = 3;
    let totalW = 0;
    for (const ch of text) totalW += ctx.measureText(ch).width + spacing;
    let lx = cx - totalW / 2;
    ctx.textAlign = 'left';
    for (const ch of text) {
      ctx.fillText(ch, lx, top);
      lx += ctx.measureText(ch).width + spacing;
    }
    ctx.textAlign = 'start';
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const light = isLightTheme();
    const lineBase = light ? [88, 66, 205] : [150, 195, 255];
    const ambientPeak = light ? 0.22 : 0.16;
    const starRGB = light ? [70, 52, 190] : [212, 236, 255];

    const parX = mouse.inside ? -mouse.nx : 0;
    const parY = mouse.inside ? -mouse.ny : 0;

    // Réseau ambiant.
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

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const [r, g, bl] = n.accent;
      const tw = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6 + n.phase));
      ctx.beginPath();
      ctx.shadowColor = `rgba(${r}, ${g}, ${bl}, ${light ? 0.28 : 0.5})`;
      ctx.shadowBlur = light ? 4 : 6;
      ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${(light ? 0.55 : 0.75) * tw})`;
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Constellations qui défilent.
    for (let i = 0; i < instances.length; i += 1) {
      drawConstellation(instances[i], light, starRGB, parX, parY);
    }
  }

  function update(dt) {
    t += dt;
    const shift = SPEED * width * dt;

    // Réseau ambiant : dérive + recyclage aux bords.
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -16) n.x = width + 16;
      else if (n.x > width + 16) n.x = -16;
      if (n.y < -16) n.y = height + 16;
      else if (n.y > height + 16) n.y = -16;
    }

    // Convoyeur : les constellations glissent vers l'ouest ; celle qui sort à
    // gauche revient à droite avec la constellation suivante du catalogue.
    let maxRight = -Infinity;
    for (let i = 0; i < instances.length; i += 1) {
      if (instances[i].x > maxRight) maxRight = instances[i].x;
    }
    for (let i = 0; i < instances.length; i += 1) {
      const inst = instances[i];
      inst.x -= shift;
      const consWidth = inst.sizePx;
      if (inst.x + consWidth < -30) {
        const recycled = makeInstance(maxRight + slotGap);
        maxRight = recycled.x;
        instances[i] = recycled;
      }
    }
  }

  let rafId = 0;
  let last = 0;
  function loop(ts) {
    rafId = window.requestAnimationFrame(loop);
    if (document.hidden) { last = ts; return; }
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
    last = ts;
    update(dt);
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
  else loop(0);
})();
