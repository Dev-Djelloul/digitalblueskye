(function () {
  function createScrollToTopButton() {
    var button = document.createElement("button");
    button.id = "scroll-to-top";
    button.className = "scroll-to-top";
    button.type = "button";
    button.setAttribute("data-i18n-title", "ui.backToTop");
    button.setAttribute("title", "Retour en haut");
    button.setAttribute("aria-label", "Retour en haut");
    button.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M7 14l5-5 5 5z" fill="currentColor"></path>' +
      "</svg>";

    document.body.appendChild(button);
    return button;
  }

  function initScrollToTop() {
    var scrollToTopBtn =
      document.getElementById("scroll-to-top") || createScrollToTopButton();

    if (!scrollToTopBtn || scrollToTopBtn.dataset.scrollToTopReady === "true") {
      return;
    }

    scrollToTopBtn.dataset.scrollToTopReady = "true";

    function updateButtonVisibility() {
      var isVisible =
        document.body.scrollTop > 300 ||
        document.documentElement.scrollTop > 300;

      if (isVisible) {
        scrollToTopBtn.style.display = "flex";
        scrollToTopBtn.style.visibility = "visible";
        scrollToTopBtn.style.pointerEvents = "auto";
        requestAnimationFrame(function () {
          scrollToTopBtn.style.opacity = "1";
        });
      } else {
        scrollToTopBtn.style.opacity = "0";
        scrollToTopBtn.style.pointerEvents = "none";
        window.setTimeout(function () {
          if (
            document.body.scrollTop <= 300 &&
            document.documentElement.scrollTop <= 300
          ) {
            scrollToTopBtn.style.display = "none";
            scrollToTopBtn.style.visibility = "hidden";
          }
        }, 300);
      }
    }

    scrollToTopBtn.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });

    window.addEventListener("scroll", updateButtonVisibility, { passive: true });
    updateButtonVisibility();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScrollToTop);
  } else {
    initScrollToTop();
  }
})();
