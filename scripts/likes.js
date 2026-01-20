document.addEventListener("DOMContentLoaded", () => {
  const likeButtons = document.querySelectorAll("[data-like]");
  if (likeButtons.length === 0) {
    return;
  }

  const storage = (() => {
    try {
      const testKey = "__likes_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (error) {
      return null;
    }
  })();

  const getLang = () => (document.documentElement.lang || "fr").toLowerCase();

  const getLabels = () => {
    const lang = getLang();
    const labels = {
      fr: { singular: "like", plural: "likes" },
      en: { singular: "like", plural: "likes" },
    };
    return lang.startsWith("en") ? labels.en : labels.fr;
  };

  const slug = () => {
    const last = window.location.pathname.split("/").pop() || "page";
    return last.replace(".html", "") || "page";
  };

  const readCount = (key) => {
    if (!storage) {
      return 0;
    }
    const value = Number.parseInt(storage.getItem(`likes:${key}:count`) || "0", 10);
    return Number.isNaN(value) ? 0 : value;
  };

  const readLiked = (key) => storage?.getItem(`likes:${key}:liked`) === "1";

  const writeState = (key, count, liked) => {
    if (!storage) {
      return;
    }
    storage.setItem(`likes:${key}:count`, String(count));
    storage.setItem(`likes:${key}:liked`, liked ? "1" : "0");
  };

  const updateButton = (button, count, liked) => {
    const countEl = button.querySelector("[data-like-count]");
    const labelEl = button.querySelector("[data-like-label]");
    const { singular, plural } = getLabels();
    const safeCount = Number.isFinite(count) ? count : 0;

    if (countEl) {
      countEl.textContent = String(safeCount);
    }
    if (labelEl) {
      const useSingular = safeCount <= 1;
      labelEl.textContent = useSingular ? singular : plural;
    }
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.classList.toggle("is-active", liked);
  };

  likeButtons.forEach((button) => {
    const scope = button.getAttribute("data-like-scope") || "page";
    const key = button.getAttribute("data-like-key") || `${scope}:${slug()}`;
    let count = readCount(key);
    let liked = readLiked(key);

    if (liked && count === 0) {
      count = 1;
    }

    updateButton(button, count, liked);

    button.addEventListener("click", () => {
      if (!storage) {
        return;
      }
      if (liked) {
        count = Math.max(0, count - 1);
        liked = false;
      } else {
        count += 1;
        liked = true;
      }
      writeState(key, count, liked);
      updateButton(button, count, liked);
    });
  });

  const enhanceInspirationHeader = () => {
    const inspirationMain = document.querySelector(".inspiration-detail");
    if (!inspirationMain) {
      return;
    }
    const heroContent = inspirationMain.querySelector(".detail-hero-content");
    const h1 = heroContent?.querySelector("h1");
    const likeButton = heroContent?.querySelector(".detail-like");
    if (!heroContent || !h1 || !likeButton) {
      return;
    }

    const existingRow = heroContent.querySelector(".detail-title-row");
    const eyebrowRow = heroContent.querySelector(".detail-eyebrow-row");

    if (existingRow) {
      const lead = heroContent.querySelector(".detail-lead");
      if (lead) {
        heroContent.insertBefore(h1, lead);
      } else {
        heroContent.insertBefore(h1, existingRow);
      }
      existingRow.remove();
    }

    if (eyebrowRow) {
      eyebrowRow.classList.remove("detail-eyebrow-row--hidden");
      if (!eyebrowRow.contains(likeButton)) {
        eyebrowRow.appendChild(likeButton);
      }
    }
  };

  enhanceInspirationHeader();

  document.addEventListener("translationCompleted", () => {
    likeButtons.forEach((button) => {
      const scope = button.getAttribute("data-like-scope") || "page";
      const key = button.getAttribute("data-like-key") || `${scope}:${slug()}`;
      updateButton(button, readCount(key), readLiked(key));
    });
    enhanceInspirationHeader();
  });
});
