document.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector(".explorer-project-marquee-track");
  if (!track) return;

  const originalCards = Array.from(track.querySelectorAll(".project-card-style"));
  if (!originalCards.length) return;

  originalCards.forEach((card) => {
    card.classList.add("is-marquee-original");
  });

  originalCards.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.remove("is-marquee-original");
    clone.classList.add("is-marquee-clone");
    clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.querySelectorAll("a, button, input, select, textarea").forEach((element) => {
      element.setAttribute("tabindex", "-1");
    });
    track.appendChild(clone);
  });

  if (typeof loadTranslations === "function" && typeof currentLanguage !== "undefined") {
    loadTranslations(currentLanguage);
  } else if (typeof applyTranslations === "function") {
    applyTranslations();
  }

  initMarqueeArrows(track);
});

function initMarqueeArrows(track) {
  const panel = track.closest(".explorer-project-display-panel");
  const prevBtn = panel?.querySelector(".explorer-marquee-arrow--prev");
  const nextBtn = panel?.querySelector(".explorer-marquee-arrow--next");
  if (!panel || (!prevBtn && !nextBtn)) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  track.classList.add("js-marquee-active");

  const DURATION_MS = 58000; // Durée d'un tour complet, identique à l'animation CSS d'origine
  const FAST_MULTIPLIER = 6; // Vitesse au survol d'une flèche

  let halfWidth = track.scrollWidth / 2;
  let baseSpeed = halfWidth / DURATION_MS; // px/ms
  let position = 0;
  let panelHovered = false;
  let arrowDirection = 0;
  let lastTime = null;

  const recomputeWidths = () => {
    halfWidth = track.scrollWidth / 2;
    baseSpeed = halfWidth / DURATION_MS;
  };
  window.addEventListener("resize", recomputeWidths);

  const wrap = (value) => (halfWidth > 0 ? ((value % halfWidth) + halfWidth) % halfWidth : 0);

  const step = (time) => {
    if (lastTime === null) lastTime = time;
    const dt = time - lastTime;
    lastTime = time;

    let speed = 0;
    if (arrowDirection !== 0) {
      speed = baseSpeed * FAST_MULTIPLIER * arrowDirection;
    } else if (!panelHovered) {
      speed = baseSpeed;
    }

    position = wrap(position + speed * dt);
    track.style.transform = `translateX(-${position}px)`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  panel.addEventListener("mouseenter", () => {
    panelHovered = true;
  });
  panel.addEventListener("mouseleave", () => {
    panelHovered = false;
  });
  panel.addEventListener("focusin", () => {
    panelHovered = true;
  });
  panel.addEventListener("focusout", () => {
    panelHovered = false;
  });

  [prevBtn, nextBtn].forEach((btn) => {
    if (!btn) return;
    const direction = Number(btn.dataset.direction) || 0;

    btn.addEventListener("mouseenter", () => {
      arrowDirection = direction;
    });
    btn.addEventListener("mouseleave", () => {
      arrowDirection = 0;
    });
    btn.addEventListener("focus", () => {
      arrowDirection = direction;
    });
    btn.addEventListener("blur", () => {
      arrowDirection = 0;
    });
    btn.addEventListener("click", () => {
      const card = track.querySelector(".project-display-content");
      const cardStep = card ? card.getBoundingClientRect().width + 30 : 300;
      position = wrap(position + direction * cardStep);
    });
  });
}
