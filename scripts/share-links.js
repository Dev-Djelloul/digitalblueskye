document.addEventListener("DOMContentLoaded", () => {
  const pageUrl = window.location.href;
  const articleMatch = window.location.pathname.match(/\/blog\/digital\/(article-[^/]+\.html)/);
  const shareBase = "https://digitalblueskye.com/share";
  const shareUrl = articleMatch ? `${shareBase}/${articleMatch[1]}` : pageUrl;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(document.title);
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    "";
  const encodedSummary = encodeURIComponent(metaDescription);
  const isFrench = document.documentElement.lang === "fr";

  const shareHandlers = {
    x: (el) => {
      const rawText = [document.title, metaDescription].filter(Boolean).join(" — ");
      const encodedText = encodeURIComponent(rawText);
      el.href = `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
    },
    linkedin: (el) => {
      el.href = `https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodedTitle}&summary=${encodedSummary}`;
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
    networkee: (el) => {
      // Ouvre la page de partage Networkee en popup, façon x.com/intent ou
      // LinkedIn : l'utilisateur voit un aperçu de l'article et publie sur son
      // propre fil avec sa session (aucun jeton, chacun partage sur son compte).
      el.addEventListener("click", (e) => {
        e.preventDefault();
        // Image de l'article pour l'aperçu : l'image principale (celle de la
        // liste blogArticles.html, via data-share-image) en priorité, sinon l'og:image.
        const shareImage =
          el.getAttribute("data-share-image") ||
          document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
          "";
        const shareIntentUrl =
          "https://networkee.up.railway.app/pages/share.php" +
          `?url=${encodedUrl}&title=${encodedTitle}` +
          (shareImage ? `&image=${encodeURIComponent(shareImage)}` : "");
        const w = 600;
        const h = 660;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(
          shareIntentUrl,
          "networkee-share",
          `popup,noopener,width=${w},height=${h},left=${left},top=${top}`
        );
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
