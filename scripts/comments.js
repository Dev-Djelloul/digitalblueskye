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
    { key: "like", emoji: String.fromCodePoint(0x1f44d) }, // 👍
    { key: "smile", emoji: String.fromCodePoint(0x1f60a) }, // 😊
    { key: "dislike", emoji: String.fromCodePoint(0x1f44e) }, // 👎
    { key: "clap", emoji: String.fromCodePoint(0x1f44f) }, // 👏
    { key: "blueheart", emoji: String.fromCodePoint(0x1f499) }, // 💙
  ];

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
    const useSingular = safeCount === 1 || safeCount === 0;
    countLabelEl.textContent = useSingular
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
    if (!reactionKey) {
      localStorage.removeItem(reactionStorageKey(commentId));
      return;
    }
    localStorage.setItem(reactionStorageKey(commentId), reactionKey);
  };

  const validatePayload = (payload) => {
    const nameValue = String(payload.name || "").trim();
    const emailValue = String(payload.email || "").trim();
    const messageValue = String(payload.message || "").trim();
    const emailValid = /^\S+@\S+\.\S+$/.test(emailValue);
    if (!nameValue || !emailValue || !messageValue) {
      setStatus(
        t("Veuillez renseigner tous les champs obligatoires.", "Missing required fields."),
        "is-error"
      );
      return false;
    }
    if (!emailValid) {
      setStatus(
        t("Veuillez saisir une adresse email valide.", "Please enter a valid email address."),
        "is-error"
      );
      return false;
    }
    return true;
  };

  const postComment = async (payload) => {
    const response = await fetch("/backend/comments.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.json();
  };

  const postReaction = async (commentId, reaction, operation = "add") => {
    const response = await fetch("/backend/comments.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "react",
        article: articleSlug,
        comment_id: commentId,
        reaction,
        operation,
      }),
    });
    return response.json();
  };

  const updateReactionButtons = (container, reactions, activeReaction) => {
    const buttons = container.querySelectorAll(".comment-reaction-btn");
    buttons.forEach((btn) => {
      const key = btn.dataset.reactionKey || "";
      const count = Number((reactions && reactions[key]) || 0);
      btn.querySelector(".comment-reaction-count").textContent = String(count);
      btn.classList.toggle("is-active", key === activeReaction);
    });
  };

  const createReplyForm = (commentId, onDone) => {
    const wrapper = document.createElement("div");
    wrapper.className = "reply-form-wrap";

    const replyForm = document.createElement("form");
    replyForm.className = "article-comments-form reply-form";
    replyForm.noValidate = true;

    const makeField = (labelText, type, name, required = true) => {
      const field = document.createElement("div");
      field.className = "comment-field";

      const label = document.createElement("label");
      label.textContent = labelText;

      const input =
        type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      if (type !== "textarea") input.type = type;
      input.name = name;
      input.required = required;
      if (type === "textarea") input.rows = 3;

      field.appendChild(label);
      field.appendChild(input);
      return { field, input };
    };

    const nameField = makeField(t("Nom", "Name"), "text", "comment-name");
    const emailField = makeField(t("Email", "Email"), "email", "comment-email");
    const messageField = makeField(t("Réponse", "Reply"), "textarea", "comment-message");

    const actions = document.createElement("div");
    actions.className = "comment-actions-row";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "comment-submit comment-submit-reply";
    submitBtn.textContent = t("Répondre", "Reply");

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "comment-secondary-btn";
    cancelBtn.textContent = t("Annuler", "Cancel");
    cancelBtn.addEventListener("click", () => wrapper.remove());

    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);

    replyForm.appendChild(nameField.field);
    replyForm.appendChild(emailField.field);
    replyForm.appendChild(messageField.field);
    replyForm.appendChild(actions);
    wrapper.appendChild(replyForm);

    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: nameField.input.value || "",
        email: emailField.input.value || "",
        message: messageField.input.value || "",
        article: articleSlug,
        page_url: window.location.href,
        website: "",
        parent_id: commentId,
      };

      if (!validatePayload(payload)) return;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;

      try {
        const data = await postComment(payload);
        if (!data.ok) {
          setStatus(data.error || getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
          return;
        }
        const isPending = data.status === "pending";
        setStatus(
          isPending
            ? getCopy(
                "pending",
                t(
                  "Merci ! Votre commentaire est en attente de validation.",
                  "Thanks! Your comment is pending approval."
                )
              )
            : getCopy("success", t("Merci ! Votre commentaire a bien été publié.", "Thanks! Your comment was posted.")),
          "is-success"
        );
        wrapper.remove();
        if (!isPending && typeof onDone === "function") onDone();
      } catch {
        setStatus(getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
      } finally {
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });

    return wrapper;
  };

  const renderComment = (comment, childrenByParent, depth = 0, reloadFn) => {
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

    const reactionWrap = document.createElement("div");
    reactionWrap.className = "comment-reactions";

    const commentReactions = comment.reactions || {
      like: Number(comment.likes_count || 0),
      smile: 0,
      dislike: 0,
      clap: 0,
      blueheart: 0,
    };

    const currentReaction = getMyReaction(comment.id);

    REACTIONS.forEach((reaction) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "comment-reaction-btn";
      btn.dataset.reactionKey = reaction.key;

      const emoji = document.createElement("span");
      emoji.className = "comment-reaction-emoji";
      emoji.textContent = reaction.emoji;

      const count = document.createElement("span");
      count.className = "comment-reaction-count";
      count.textContent = String(Number(commentReactions[reaction.key] || 0));

      btn.appendChild(emoji);
      btn.appendChild(count);
      if (reaction.key === currentReaction) btn.classList.add("is-active");

      btn.addEventListener("click", async () => {
        const existingReaction = getMyReaction(comment.id);
        reactionWrap.querySelectorAll("button").forEach((b) => {
          b.disabled = true;
        });

        let liveReactions = { ...commentReactions };

        try {
          if (existingReaction === reaction.key) {
            const removed = await postReaction(comment.id, reaction.key, "remove");
            if (!removed.ok) {
              setStatus(removed.error || getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
              return;
            }
            liveReactions = removed.reactions || liveReactions;
            setMyReaction(comment.id, "");
            updateReactionButtons(reactionWrap, liveReactions, "");
            commentReactions.like = Number(liveReactions.like || 0);
            commentReactions.smile = Number(liveReactions.smile || 0);
            commentReactions.dislike = Number(liveReactions.dislike || 0);
            commentReactions.clap = Number(liveReactions.clap || 0);
            commentReactions.blueheart = Number(liveReactions.blueheart || 0);
            return;
          }

          if (existingReaction) {
            const removed = await postReaction(comment.id, existingReaction, "remove");
            if (removed.ok) {
              liveReactions = removed.reactions || liveReactions;
            }
          }

          const added = await postReaction(comment.id, reaction.key, "add");
          if (!added.ok) {
            setStatus(added.error || getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
            updateReactionButtons(reactionWrap, liveReactions, existingReaction);
            return;
          }
          liveReactions = added.reactions || liveReactions;
          setMyReaction(comment.id, reaction.key);
          updateReactionButtons(reactionWrap, liveReactions, reaction.key);
          commentReactions.like = Number(liveReactions.like || 0);
          commentReactions.smile = Number(liveReactions.smile || 0);
          commentReactions.dislike = Number(liveReactions.dislike || 0);
          commentReactions.clap = Number(liveReactions.clap || 0);
          commentReactions.blueheart = Number(liveReactions.blueheart || 0);
        } catch {
          setStatus(getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
          updateReactionButtons(reactionWrap, liveReactions, existingReaction);
        } finally {
          reactionWrap.querySelectorAll("button").forEach((b) => {
            b.disabled = false;
          });
        }
      });

      reactionWrap.appendChild(btn);
    });

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "comment-action-btn comment-reply-btn";
    replyBtn.textContent = t("Répondre", "Reply");

    replyBtn.addEventListener("click", () => {
      const existing = item.querySelector(".reply-form-wrap");
      if (existing) {
        existing.remove();
        return;
      }
      item.appendChild(createReplyForm(comment.id, reloadFn));
    });

    actions.appendChild(reactionWrap);
    actions.appendChild(replyBtn);

    header.appendChild(author);
    header.appendChild(date);
    item.appendChild(header);
    item.appendChild(message);
    item.appendChild(actions);

    const children = childrenByParent.get(comment.id) || [];
    if (children.length > 0) {
      const repliesWrap = document.createElement("div");
      repliesWrap.className = "comment-replies";
      children.forEach((child) => {
        repliesWrap.appendChild(renderComment(child, childrenByParent, depth + 1, reloadFn));
      });
      item.appendChild(repliesWrap);
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
      if (comments.length === 0) return;

      const byParent = new Map();
      comments.forEach((comment) => {
        const parentId = comment.parent_id ? Number(comment.parent_id) : 0;
        if (!byParent.has(parentId)) byParent.set(parentId, []);
        byParent.get(parentId).push(comment);
      });

      const roots = byParent.get(0) || [];
      roots.forEach((comment) => {
        listEl.appendChild(renderComment(comment, byParent, 0, loadComments));
      });
    } catch {
      setStatus(getCopy("error", t("Erreur de chargement", "Loading error")), "is-error");
    }
  };

  setCount(Number.parseInt(countNumberEl?.textContent || "0", 10) || 0);
  loadComments();

  document.addEventListener("translationCompleted", () => {
    const currentCount = Number.parseInt(countNumberEl?.textContent || "0", 10);
    setCount(Number.isNaN(currentCount) ? 0 : currentCount);
    loadComments();
  });

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
      const isPending = data.status === "pending";
      setStatus(
        isPending
          ? getCopy(
              "pending",
              t(
                "Merci ! Votre commentaire est en attente de validation.",
                "Thanks! Your comment is pending approval."
              )
            )
          : getCopy("success", t("Merci ! Votre commentaire a bien été publié.", "Thanks! Your comment was posted.")),
        "is-success"
      );
      form.reset();
      if (!isPending) loadComments();
    } catch {
      setStatus(getCopy("error", t("Erreur d'envoi", "Send error")), "is-error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
