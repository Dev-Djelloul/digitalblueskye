/**
 * Fond animé « constellation neuronale » pour chat.html.
 *
 * Des nœuds lumineux dérivent lentement et se relient par des lignes fines
 * quand ils se rapprochent — évoquant à la fois un réseau de neurones (IA) et
 * un ciel étoilé (Digital Blue Skye). Visible surtout quand l'assistant est
 * réduit en pastille (la page derrière est alors vide).
 *
 * Contraintes : Canvas 2D pur (aucune dépendance), léger, en pause quand le
 * panneau couvre l'écran ou que l'onglet est masqué, respect de
 * prefers-reduced-motion, couleurs adaptées aux thèmes clair et sombre.
 */
(function () {
  if (!document.body || !document.body.classList.contains('chat-page')) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'chat-bg-constellation';
  canvas.setAttribute('aria-hidden', 'true');
  const style = canvas.style;
  style.position = 'fixed';
  style.inset = '0';
  style.width = '100%';
  style.height = '100%';
  style.zIndex = '0';
  style.pointerEvents = 'none';
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];

  // Palette d'accents de la marque (cyan, violet clair, violet profond).
  const ACCENTS = [
    [158, 232, 255],
    [185, 140, 255],
    [123, 86, 255],
  ];

  function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function nodeCountFor(area) {
    return Math.max(34, Math.min(90, Math.floor(area / 16000)));
  }

  function createNodes() {
    const count = nodeCountFor(width * height);
    nodes = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const accent = ACCENTS[i % ACCENTS.length];
      nodes[i] = {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.34,
        vy: (Math.random() - 0.5) * 0.34,
        r: 1.2 + Math.random() * 1.4,
        accent,
      };
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    createNodes();
  }

  // Le panneau plein écran couvre le canvas : inutile de dessiner. On anime
  // seulement quand l'assistant est réduit (pastille) ou fermé.
  function isCovered() {
    const panel = document.getElementById('ai-assistant-panel');
    const minimized = document.body.classList.contains('ai-assistant-minimized');
    return Boolean(panel && panel.classList.contains('is-open') && !minimized);
  }

  const maxDist = 148;
  const maxDistSq = maxDist * maxDist;

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const light = isLightTheme();
    // Sur fond clair, on assombrit les traits/nœuds pour rester lisible.
    const lineBase = light ? [90, 70, 205] : [150, 195, 255];
    const linePeak = light ? 0.26 : 0.2;

    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > maxDistSq) continue;
        const alpha = (1 - distSq / maxDistSq) * linePeak;
        ctx.strokeStyle = `rgba(${lineBase[0]}, ${lineBase[1]}, ${lineBase[2]}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const [r, g, bl] = n.accent;
      ctx.beginPath();
      ctx.shadowColor = `rgba(${r}, ${g}, ${bl}, ${light ? 0.35 : 0.6})`;
      ctx.shadowBlur = light ? 5 : 8;
      ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${light ? 0.7 : 0.85})`;
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function step() {
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -20) n.x = width + 20;
      else if (n.x > width + 20) n.x = -20;
      if (n.y < -20) n.y = height + 20;
      else if (n.y > height + 20) n.y = -20;
    }
  }

  let rafId = 0;

  function loop() {
    rafId = window.requestAnimationFrame(loop);
    if (document.hidden || isCovered()) return;
    step();
    draw();
  }

  function start() {
    if (rafId) return;
    if (prefersReducedMotion) {
      // Rendu statique unique : présence visuelle sans mouvement.
      if (!isCovered()) draw();
      return;
    }
    loop();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
      if (prefersReducedMotion && !isCovered()) draw();
    }, 180);
  });

  // Redessiner une fois au changement de thème (couleurs adaptées).
  const themeObserver = new MutationObserver(() => {
    if (!isCovered()) draw();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();
  start();
})();
