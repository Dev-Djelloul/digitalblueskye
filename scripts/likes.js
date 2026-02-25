document.addEventListener("DOMContentLoaded", () => {
  const likeButtons = document.querySelectorAll("[data-like]");
  if (likeButtons.length === 0) return;

  const storage = (() => {
    try {
      const testKey = "__likes_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  if (!storage) return;

  const REACTIONS = [
    { key: "thumbsup", emoji: String.fromCodePoint(0x1f44d) }, // 👍
    { key: "purpleheart", emoji: String.fromCodePoint(0x1f49c) }, // 💜
    { key: "wink", emoji: String.fromCodePoint(0x1f609) }, // 😉
    { key: "sweatsmile", emoji: String.fromCodePoint(0x1f605) }, // 😅
    { key: "nerd", emoji: String.fromCodePoint(0x1f913) }, // 🤓
    { key: "idea", emoji: String.fromCodePoint(0x1f4a1) }, // 💡
    { key: "robot", emoji: String.fromCodePoint(0x1f916) }, // 🤖
    { key: "mobile", emoji: String.fromCodePoint(0x1f4f2) }, // 📲
    { key: "laptop", emoji: String.fromCodePoint(0x1f4bb) }, // 💻
  ];
  const DEFAULT_KEY = "purpleheart";
  const HOVER_OPEN_DELAY_MS = 2000;
  const isEnglish = () => (document.documentElement.lang || "").toLowerCase().startsWith("en");
  const reactionLabel = (count) => {
    if (isEnglish()) return count <= 1 ? "reaction" : "reactions";
    return count <= 1 ? "réaction" : "réactions";
  };

  const slug = () => {
    const last = window.location.pathname.split("/").pop() || "page";
    return last.replace(".html", "") || "page";
  };

  const baseKey = (button) => {
    const scope = button.getAttribute("data-like-scope") || "page";
    return button.getAttribute("data-like-key") || `${scope}:${slug()}`;
  };

  const reactionsStorageKey = (key) => `likes:${key}:reactions`;
  const reactionMineKey = (key) => `likes:${key}:mine`;

  const readReactions = (key) => {
    try {
      const parsed = JSON.parse(storage.getItem(reactionsStorageKey(key)) || "{}");
      const result = {};
      REACTIONS.forEach((reaction) => {
        result[reaction.key] = Number(parsed?.[reaction.key] || 0);
      });
      return result;
    } catch {
      return Object.fromEntries(REACTIONS.map((reaction) => [reaction.key, 0]));
    }
  };

  const writeReactions = (key, reactions) => {
    storage.setItem(reactionsStorageKey(key), JSON.stringify(reactions));
  };

  const readMine = (key) => storage.getItem(reactionMineKey(key)) || "";
  const writeMine = (key, reactionKey) => {
    if (!reactionKey) storage.removeItem(reactionMineKey(key));
    else storage.setItem(reactionMineKey(key), reactionKey);
  };

  const totalCount = (reactions) =>
    REACTIONS.reduce((acc, reaction) => acc + Number(reactions?.[reaction.key] || 0), 0);

  const emojiByKey = (reactionKey) =>
    REACTIONS.find((reaction) => reaction.key === reactionKey)?.emoji ||
    REACTIONS.find((reaction) => reaction.key === DEFAULT_KEY)?.emoji ||
    "💜";

  likeButtons.forEach((button) => {
    const key = baseKey(button);
    let reactions = readReactions(key);
    let mine = readMine(key);

    button.classList.add("like-reaction-trigger");

    const icon = button.querySelector(".like-icon");
    if (icon) icon.style.display = "none";

    let triggerEmoji = button.querySelector(".like-trigger-emoji");
    if (!triggerEmoji) {
      triggerEmoji = document.createElement("span");
      triggerEmoji.className = "like-trigger-emoji";
      button.insertBefore(triggerEmoji, button.firstChild);
    }

    const countEl = button.querySelector("[data-like-count]");
    const labelEl = button.querySelector("[data-like-label]");

    const picker = document.createElement("div");
    picker.className = "like-reaction-picker";
    button.parentNode?.insertBefore(picker, button);
    picker.appendChild(button);

    const palette = document.createElement("div");
    palette.className = "like-reaction-palette";
    picker.appendChild(palette);

    const refresh = () => {
      triggerEmoji.textContent = emojiByKey(mine || DEFAULT_KEY);
      const total = totalCount(reactions);
      if (countEl) countEl.textContent = String(total);
      if (labelEl) labelEl.textContent = reactionLabel(total);
      button.classList.toggle("is-active", !!mine);
      button.setAttribute("aria-pressed", mine ? "true" : "false");
      palette.querySelectorAll("button").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.reactionKey === mine);
      });
    };

    let hoverTimer = 0;
    const clearHoverTimer = () => {
      if (hoverTimer) {
        window.clearTimeout(hoverTimer);
        hoverTimer = 0;
      }
    };

    const openPalette = () => {
      clearHoverTimer();
      picker.classList.add("is-open");
    };
    const closePalette = () => {
      clearHoverTimer();
      picker.classList.remove("is-open");
    };

    const scheduleOpenPalette = () => {
      clearHoverTimer();
      hoverTimer = window.setTimeout(openPalette, HOVER_OPEN_DELAY_MS);
    };

    picker.addEventListener("mouseenter", scheduleOpenPalette);
    picker.addEventListener("mouseleave", closePalette);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearHoverTimer();
      picker.classList.toggle("is-open");
    });

    REACTIONS.forEach((reaction) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "like-reaction-choice";
      btn.dataset.reactionKey = reaction.key;
      btn.textContent = reaction.emoji;

      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (mine === reaction.key) {
          reactions[reaction.key] = Math.max(0, Number(reactions[reaction.key] || 0) - 1);
          mine = "";
        } else {
          if (mine) {
            reactions[mine] = Math.max(0, Number(reactions[mine] || 0) - 1);
          }
          reactions[reaction.key] = Number(reactions[reaction.key] || 0) + 1;
          mine = reaction.key;
        }

        writeReactions(key, reactions);
        writeMine(key, mine);
        refresh();
        closePalette();
      });

      palette.appendChild(btn);
    });

    refresh();
  });

  const enhanceInspirationHeader = () => {
    const inspirationMain = document.querySelector(".inspiration-detail");
    if (!inspirationMain) return;
    const heroContent = inspirationMain.querySelector(".detail-hero-content");
    const h1 = heroContent?.querySelector("h1");
    const likeButton = heroContent?.querySelector(".detail-like");
    if (!heroContent || !h1 || !likeButton) return;

    const existingRow = heroContent.querySelector(".detail-title-row");
    const eyebrowRow = heroContent.querySelector(".detail-eyebrow-row");

    if (existingRow) {
      const lead = heroContent.querySelector(".detail-lead");
      if (lead) heroContent.insertBefore(h1, lead);
      else heroContent.insertBefore(h1, existingRow);
      existingRow.remove();
    }

    if (eyebrowRow) {
      eyebrowRow.classList.remove("detail-eyebrow-row--hidden");
      if (!eyebrowRow.contains(likeButton.closest(".like-reaction-picker") || likeButton)) {
        eyebrowRow.appendChild(likeButton.closest(".like-reaction-picker") || likeButton);
      }
    }
  };

  document.addEventListener("click", () => {
    document.querySelectorAll(".like-reaction-picker.is-open").forEach((picker) => {
      picker.classList.remove("is-open");
    });
  });

  enhanceInspirationHeader();
  document.addEventListener("translationCompleted", enhanceInspirationHeader);
});
