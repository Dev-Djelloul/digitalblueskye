document.addEventListener("DOMContentLoaded", () => {
  const commentsSection = document.querySelector(".article-comments");
  if (!commentsSection) return;

  const listEl = commentsSection.querySelector("[data-comments]");
  const statusEl = commentsSection.querySelector("[data-comments-status]");
  const copyEl = commentsSection.querySelector("[data-comments-copy]");
  const countNumberEl = document.querySelector("[data-comments-count]");
  const countLabelEl = document.querySelector("[data-comments-count-label]");
  const form = commentsSection.querySelector(".article-comments-form");
  const articleSlug = window.location.pathname.split("/").pop().replace(".html", "");

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

  const DEFAULT_REACTION = "purpleheart";
  const DEFAULT_EMOJI = REACTIONS.find((r) => r.key === DEFAULT_REACTION)?.emoji || "💜";

  const getCopy = (key, fallback) => {
    if (!copyEl) return fallback;
    const item = copyEl.querySelector(`[data-copy="${key}"]`);
    return item ? item.textContent : fallback;
  };

  const isEnglish = () => (document.documentElement.lang || "").toLowerCase().startsWith("en");
  const t = (fr, en) => (isEnglish() ? en : fr);

  const setStatus = (message, type = "") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `comments-status ${type}`.trim();
  };

  const setCount = (count) => {
    if (!countNumberEl || !countLabelEl) return;
    const safeCount = Number.isFinite(count) ? count : 0;
    countNumberEl.textContent = String(safeCount);
    countLabelEl.textContent =
      safeCount <= 1
        ? getCopy("countSingular", t("commentaire", "comment"))
        : getCopy("countPlural", t("commentaires", "comments"));
  };

  const formatDate = (isoString) => {
    const normalized = String(isoString || "").replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(document.documentElement.lang || "fr", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const reactionStorageKey = (commentId) => `dbs:reaction:${articleSlug}:${commentId}`;
  const getMyReaction = (commentId) => localStorage.getItem(reactionStorageKey(commentId)) || "";
  const setMyReaction = (commentId, reactionKey) => {
    if (!reactionKey) localStorage.removeItem(reactionStorageKey(commentId));
    else localStorage.setItem(reactionStorageKey(commentId), reactionKey);
  };

  const sumReactions = (reactions) =>
    REACTIONS.reduce((acc, reaction) => acc + Number(reactions?.[reaction.key] || 0), 0);

  const postComment = async (payload) => {
    const response = await fetch("/backend/comments.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.json();
  };

  const postReaction = async (commentId, reactionKey, operation = "add") => {
    const response = await fetch("/backend/comments.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "react",
        article: articleSlug,
        comment_id: commentId,
        reaction: reactionKey,
        operation,
      }),
    });
    return response.json();
  };

  const validatePayload = (payload) => {
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim();
    const message = String(payload.message || "").trim();
    const emailValid = /^\S+@\S+\.\S+$/.test(email);
    if (!name || !email || !message) {
      setStatus(t("Veuillez renseigner tous les champs obligatoires.", "Missing required fields."), "is-error");
      return false;
    }
    if (!emailValid) {
      setStatus(t("Veuillez saisir une adresse email valide.", "Please enter a valid email address."), "is-error");
      return false;
    }
    return true;
  };

  const createReplyForm = (commentId, reloadFn) => {
    const wrapper = document.createElement("div");
    wrapper.className = "reply-form-wrap";

    const replyForm = document.createElement("form");
    replyForm.className = "article-comments-form reply-form";
    replyForm.noValidate = true;

    const field = (labelText, name, type = "text") => {
      const wrap = document.createElement("div");
      wrap.className = "comment-field";
      const label = document.createElement("label");
      label.textContent = labelText;
      const input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      if (type !== "textarea") input.type = type;
      if (type === "textarea") input.rows = 3;
      input.name = name;
      wrap.appendChild(label);
      wrap.appendChild(input);
      return { wrap, input };
    };

    const fName = field(t("Nom", "Name"), "comment-name", "text");
    const fEmail = field(t("Email", "Email"), "comment-email", "email");
    const fMessage = field(t("Réponse", "Reply"), "comment-message", "textarea");

    const row = document.createElement("div");
    row.className = "comment-actions-row";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "comment-submit comment-submit-reply";
    submit.textContent = t("Répondre", "Reply");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "comment-secondary-btn";
    cancel.textContent = t("Annuler", "Cancel");
    cancel.addEventListener("click", () => wrapper.remove());

    row.appendChild(submit);
    row.appendChild(cancel);

    replyForm.appendChild(fName.wrap);
    replyForm.appendChild(fEmail.wrap);
    replyForm.appendChild(fMessage.wrap);
    replyForm.appendChild(row);
    wrapper.appendChild(replyForm);

    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: fName.input.value || "",
        email: fEmail.input.value || "",
        message: fMessage.input.value || "",
        article: articleSlug,
        page_url: window.location.href,
        website: "",
        parent_id: commentId,
      };
      if (!validatePayload(payload)) return;
      submit.disabled = true;
      cancel.disabled = true;
      try {
        const data = await postComment(payload);
        if (!data.ok) {
          setStatus(data.error || getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
          return;
        }
        const isPending = data.status === "pending";
        setStatus(
          isPending
            ? getCopy("pending", t("Merci ! Votre commentaire est en attente de validation.", "Thanks! Your comment is pending approval."))
            : getCopy("success", t("Merci ! Votre commentaire a bien été publié.", "Thanks! Your comment was posted.")),
          "is-success"
        );
        wrapper.remove();
        if (!isPending) reloadFn();
      } catch {
        setStatus(getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
      } finally {
        submit.disabled = false;
        cancel.disabled = false;
      }
    });

    return wrapper;
  };

  const createReactionPicker = (commentId, reactionsState, reloadFn) => {
    const picker = document.createElement("div");
    picker.className = "comment-reaction-picker";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "comment-reaction-trigger";
    trigger.setAttribute("aria-expanded", "false");

    const triggerEmoji = document.createElement("span");
    triggerEmoji.className = "comment-reaction-trigger-emoji";
    const active = getMyReaction(commentId);
    triggerEmoji.textContent = DEFAULT_EMOJI;

    const triggerCount = document.createElement("span");
    triggerCount.className = "comment-reaction-trigger-count";
    triggerCount.textContent = String(sumReactions(reactionsState));

    trigger.appendChild(triggerEmoji);
    trigger.appendChild(triggerCount);

    const palette = document.createElement("div");
    palette.className = "comment-reaction-palette";

    const closePalette = () => {
      picker.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    };

    const openPalette = () => {
      picker.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    };

    trigger.addEventListener("mouseenter", openPalette);
    picker.addEventListener("mouseleave", closePalette);
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = picker.classList.contains("is-open");
      if (isOpen) closePalette();
      else openPalette();
    });

    REACTIONS.forEach((reaction) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "comment-reaction-choice";
      btn.dataset.reactionKey = reaction.key;
      btn.textContent = reaction.emoji;

      if (active === reaction.key) btn.classList.add("is-active");

      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const current = getMyReaction(commentId);
        palette.querySelectorAll("button").forEach((b) => {
          b.disabled = true;
        });

        try {
          let nextActive = current;
          if (current === reaction.key) {
            const removed = await postReaction(commentId, reaction.key, "remove");
            if (!removed.ok) {
              setStatus(removed.error || getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
              return;
            }
            reactionsState = removed.reactions || reactionsState;
            nextActive = "";
          } else {
            if (current) {
              const removedPrev = await postReaction(commentId, current, "remove");
              if (removedPrev.ok) reactionsState = removedPrev.reactions || reactionsState;
            }
            const added = await postReaction(commentId, reaction.key, "add");
            if (!added.ok) {
              setStatus(added.error || getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
              return;
            }
            reactionsState = added.reactions || reactionsState;
            nextActive = reaction.key;
          }

          setMyReaction(commentId, nextActive);
          triggerEmoji.textContent = DEFAULT_EMOJI;
          triggerCount.textContent = String(sumReactions(reactionsState));
          palette.querySelectorAll("button").forEach((b) => {
            b.classList.toggle("is-active", b.dataset.reactionKey === nextActive);
          });
          closePalette();
        } catch {
          setStatus(getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
        } finally {
          palette.querySelectorAll("button").forEach((b) => {
            b.disabled = false;
          });
          if (typeof reloadFn === "function") reloadFn();
        }
      });

      palette.appendChild(btn);
    });

    picker.appendChild(trigger);
    picker.appendChild(palette);
    return picker;
  };

  const renderComment = (comment, byParent, reloadFn, depth = 0) => {
    const item = document.createElement("div");
    item.className = `comment-item${depth > 0 ? " comment-item-reply" : ""}`;
    item.dataset.commentId = String(comment.id);

    const header = document.createElement("div");
    header.className = "comment-header";

    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = comment.author_name || t("Anonyme", "Anonymous");

    const date = document.createElement("span");
    date.className = "comment-date";
    date.textContent = formatDate(comment.created_at);

    const message = document.createElement("p");
    message.className = "comment-message";
    message.textContent = comment.message || "";

    const actions = document.createElement("div");
    actions.className = "comment-actions";

    const reactionsState = comment.reactions || {};
    const picker = createReactionPicker(comment.id, reactionsState, reloadFn);

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "comment-action-btn comment-reply-btn";
    replyBtn.textContent = t("Répondre", "Reply");
    replyBtn.addEventListener("click", () => {
      const existing = item.querySelector(".reply-form-wrap");
      if (existing) existing.remove();
      else item.appendChild(createReplyForm(comment.id, reloadFn));
    });

    actions.appendChild(picker);
    actions.appendChild(replyBtn);

    header.appendChild(author);
    header.appendChild(date);
    item.appendChild(header);
    item.appendChild(message);
    item.appendChild(actions);

    const children = byParent.get(Number(comment.id)) || [];
    if (children.length) {
      const replies = document.createElement("div");
      replies.className = "comment-replies";
      children.forEach((child) => replies.appendChild(renderComment(child, byParent, reloadFn, depth + 1)));
      item.appendChild(replies);
    }

    return item;
  };

  const loadComments = async () => {
    if (!listEl) return;
    try {
      const response = await fetch(`/backend/comments.php?article=${encodeURIComponent(articleSlug)}`);
      const data = await response.json();
      if (!data.ok) {
        setStatus(data.error || getCopy("error", t("Erreur de chargement", "Loading error")), "is-error");
        return;
      }

      const comments = Array.isArray(data.comments) ? data.comments : [];
      listEl.innerHTML = "";
      setCount(comments.length);
      setStatus("");
      if (!comments.length) return;

      const byParent = new Map();
      comments.forEach((comment) => {
        const parentId = Number(comment.parent_id || 0);
        if (!byParent.has(parentId)) byParent.set(parentId, []);
        byParent.get(parentId).push(comment);
      });

      (byParent.get(0) || []).forEach((comment) => {
        listEl.appendChild(renderComment(comment, byParent, loadComments));
      });
    } catch {
      setStatus(getCopy("error", t("Erreur de chargement", "Loading error")), "is-error");
    }
  };

  document.addEventListener("click", () => {
    document.querySelectorAll(".comment-reaction-picker.is-open").forEach((picker) => {
      picker.classList.remove("is-open");
      const trigger = picker.querySelector(".comment-reaction-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  });

  setCount(Number.parseInt(countNumberEl?.textContent || "0", 10) || 0);
  loadComments();

  document.addEventListener("translationCompleted", loadComments);

  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get("comment-name") || "",
      email: formData.get("comment-email") || "",
      message: formData.get("comment-message") || "",
      article: articleSlug,
      page_url: window.location.href,
      website: formData.get("website") || "",
    };

    if (!validatePayload(payload)) return;

    const submitBtn = form.querySelector(".comment-submit");
    if (submitBtn) submitBtn.disabled = true;
    try {
      const data = await postComment(payload);
      if (!data.ok) {
        setStatus(data.error || getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
        return;
      }
      const pending = data.status === "pending";
      setStatus(
        pending
          ? getCopy("pending", t("Merci ! Votre commentaire est en attente de validation.", "Thanks! Your comment is pending approval."))
          : getCopy("success", t("Merci ! Votre commentaire a bien été publié.", "Thanks! Your comment was posted.")),
        "is-success"
      );
      form.reset();
      if (!pending) loadComments();
    } catch {
      setStatus(getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
