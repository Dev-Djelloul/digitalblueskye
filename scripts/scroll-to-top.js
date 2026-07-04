(function () {
  function initScrollToTop() {
    var scrollToTopBtn = document.getElementById("scroll-to-top");

    if (!scrollToTopBtn) {
      return;
    }

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
