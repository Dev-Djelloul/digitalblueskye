document.addEventListener("DOMContentLoaded", () => {
  const commentsSection = document.querySelector(".article-comments");
  if (!commentsSection) {
    return;
  }

  const listEl = commentsSection.querySelector("[data-comments]");
  const statusEl = commentsSection.querySelector("[data-comments-status]");
  const copyEl = commentsSection.querySelector("[data-comments-copy]");
  const form = commentsSection.querySelector(".article-comments-form");
  const articleSlug = window.location.pathname.split("/").pop().replace(".html", "");

  const getCopy = (key, fallback) => {
    if (!copyEl) {
      return fallback;
    }
    const item = copyEl.querySelector(`[data-copy="${key}"]`);
    return item ? item.textContent : fallback;
  };

  const setStatus = (message, type = "") => {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message;
    statusEl.className = `comments-status ${type}`.trim();
  };

  const formatDate = (isoString) => {
    const normalized = String(isoString || "").replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString(document.documentElement.lang || "fr", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderComment = (comment) => {
    const item = document.createElement("div");
    item.className = "comment-item";

    const header = document.createElement("div");
    header.className = "comment-header";

    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = comment.author_name || "Anonyme";

    const date = document.createElement("span");
    date.className = "comment-date";
    date.textContent = formatDate(comment.created_at);

    const message = document.createElement("p");
    message.className = "comment-message";
    message.textContent = comment.message || "";

    header.appendChild(author);
    header.appendChild(date);
    item.appendChild(header);
    item.appendChild(message);

    return item;
  };

  const loadComments = async () => {
    if (!listEl) {
      return;
    }
    try {
      const response = await fetch(`/backend/comments.php?article=${encodeURIComponent(articleSlug)}`);
      const data = await response.json();
      if (!data.ok) {
        setStatus(data.error || getCopy("error", "Erreur de chargement"), "is-error");
        return;
      }
      listEl.innerHTML = "";
      if (!data.comments || data.comments.length === 0) {
        setStatus(getCopy("empty", "Aucun commentaire pour le moment."));
        return;
      }
      setStatus("");
      data.comments.forEach((comment) => {
        listEl.appendChild(renderComment(comment));
      });
    } catch (error) {
      setStatus(getCopy("error", "Erreur de chargement"), "is-error");
    }
  };

  loadComments();

  if (!form) {
    return;
  }

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

    const submitBtn = form.querySelector(".comment-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      const response = await fetch("/backend/comments.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) {
        setStatus(data.error || getCopy("error", "Erreur d'envoi"), "is-error");
        return;
      }
      const isPending = data.status === "pending";
      setStatus(
        isPending
          ? getCopy("pending", "Merci ! Votre commentaire est en attente de validation.")
          : getCopy("success", "Merci ! Votre commentaire a bien été publié."),
        "is-success"
      );
      form.reset();
      if (!isPending) {
        loadComments();
      }
    } catch (error) {
      setStatus(getCopy("error", "Erreur d'envoi"), "is-error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
});
