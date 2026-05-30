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
});
