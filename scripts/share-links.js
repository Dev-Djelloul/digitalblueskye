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
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const resp = await fetch("/.netlify/functions/publish-to-networkee", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: document.title,
              url: pageUrl,
            }),
          });

          if (!resp.ok && resp.status === 405) {
            // Fonction absente : normal en local (Live Server ne fait pas tourner
            // les Netlify Functions), seul le site déployé sur Netlify peut publier.
            throw new Error(
              isFrench
                ? "Fonction indisponible en local — teste depuis le site déployé sur Netlify."
                : "Function unavailable locally — test from the site deployed on Netlify."
            );
          }

          let data;
          try {
            data = await resp.json();
          } catch {
            throw new Error(isFrench ? "Réponse invalide du serveur" : "Invalid server response");
          }

          if (data.success) {
            const labelText = isFrench ? "Partagé sur Networkee !" : "Shared on Networkee!";
            const label = el.querySelector(".share-networkee-label");
            if (label) {
              label.textContent = labelText;
            } else if (el.querySelector("img")) {
              const span = document.createElement("span");
              span.className = "share-networkee-label";
              span.textContent = labelText;
              el.appendChild(span);
            }
            el.classList.add("is-shared");
            setTimeout(() => {
              const existingLabel = el.querySelector(".share-networkee-label");
              if (existingLabel) {
                existingLabel.remove();
              }
              el.classList.remove("is-shared");
            }, 2000);
          } else {
            alert(isFrench ? "Erreur: " + (data.message || data.error) : "Error: " + (data.message || data.error));
          }
        } catch (error) {
          console.error("Networkee share failed", error);
          alert(error.message || (isFrench ? "Erreur de partage" : "Share failed"));
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
