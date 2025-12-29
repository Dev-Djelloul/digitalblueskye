document.addEventListener("DOMContentLoaded", () => {
  const pageUrl = window.location.href;
  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedTitle = encodeURIComponent(document.title);
  const isFrench = document.documentElement.lang === "fr";

  const shareHandlers = {
    x: (el) => {
      el.href = `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
    },
    linkedin: (el) => {
      el.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    },
    facebook: (el) => {
      el.href = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    },
    link: (el) => {
      el.href = pageUrl;
    },
    copy: (el) => {
      el.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(pageUrl);
          const labelText = isFrench ? "Lien copié !" : "Link copied!";
          const label = el.querySelector(".share-copy-label");
          if (label) {
            label.textContent = labelText;
          } else if (el.querySelector("img")) {
            const span = document.createElement("span");
            span.className = "share-copy-label";
            span.textContent = labelText;
            el.appendChild(span);
          } else {
            const originalText = el.textContent;
            el.textContent = labelText;
            el.dataset.originalText = originalText;
          }
          el.classList.add("is-copied");
          setTimeout(() => {
            const existingLabel = el.querySelector(".share-copy-label");
            if (existingLabel) {
              existingLabel.remove();
            } else if (el.dataset.originalText) {
              el.textContent = el.dataset.originalText;
              delete el.dataset.originalText;
            }
            el.classList.remove("is-copied");
          }, 2000);
        } catch (error) {
          console.error("Copy failed", error);
        }
      });
    },
  };

  document.querySelectorAll("[data-share]").forEach((el) => {
    const shareType = el.getAttribute("data-share");
    const handler = shareHandlers[shareType];
    if (handler) {
      handler(el);
    }
  });
});
