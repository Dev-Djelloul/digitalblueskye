/**
 * Cloudflare Worker API for Digital Blue Skye
 * Compatible routes:
 * - POST /backend/consent.php
 * - GET/POST /backend/comments.php
 * - POST /contact-submit.php
 * - GET /export-csv.php
 *
 * Required bindings/secrets:
 * - DB (D1 database binding)
 * - EXPORT_TOKEN (secret, for /export-csv.php)
 * - ADMIN_TOKEN (secret, for /admin/*)
 *
 * Optional vars:
 * - ALLOWED_ORIGIN (CORS fallback)
 * - COMMENTS_REQUIRE_APPROVAL ("true" or "false")
 */

const REACTION_MAP = Object.freeze({
  thumbsup: "reactions_thumbsup",
  purpleheart: "reactions_purpleheart",
  wink: "reactions_wink",
  sweatsmile: "reactions_sweatsmile",
  nerd: "reactions_nerd",
  idea: "reactions_idea",
  robot: "reactions_robot",
  mobile: "reactions_mobile",
  laptop: "reactions_laptop",
});

const REACTION_ALIASES = Object.freeze({
  thumbsup: "thumbsup",
  purpleheart: "purpleheart",
  wink: "wink",
  sweatsmile: "sweatsmile",
  nerd: "nerd",
  idea: "idea",
  robot: "robot",
  mobile: "mobile",
  laptop: "laptop",
  like: "thumbsup",
  smile: "wink",
  blueheart: "purpleheart",
  clap: "idea",
  dislike: "sweatsmile",
});

const ALLOWED_EXPORT_TABLES = Object.freeze({
  contact_messages: [
    "id",
    "first_name",
    "last_name",
    "email",
    "message",
    "contact_consent",
    "ip_address",
    "user_agent",
    "submitted_at",
  ],
  consent_logs: [
    "id",
    "consent_id",
    "consent_given",
    "analytics",
    "marketing",
    "language",
    "theme",
    "viewport_width",
    "viewport_height",
    "device_pixel_ratio",
    "screen_width",
    "screen_height",
    "navigator_language",
    "ua_data",
    "in_app_browser",
    "created_at",
    "ip_address",
    "user_agent",
    "page_url",
  ],
  article_comments: [
    "id",
    "article_slug",
    "page_url",
    "parent_id",
    "author_name",
    "author_email",
    "message",
    "likes_count",
    "reactions_thumbsup",
    "reactions_purpleheart",
    "reactions_wink",
    "reactions_sweatsmile",
    "reactions_nerd",
    "reactions_idea",
    "reactions_robot",
    "reactions_mobile",
    "reactions_laptop",
    "status",
    "created_at",
    "ip_address",
    "user_agent",
  ],
  ai_assistant_events: [
    "id",
    "session_id",
    "event_type",
    "event_value",
    "language",
    "page_url",
    "meta",
    "created_at",
    "ip_address",
    "user_agent",
  ],
});

const COMMENT_STATUSES = Object.freeze(["approved", "pending", "hidden"]);

function corsHeaders(request, env, contentType = "application/json; charset=utf-8") {
  const requestOrigin = request.headers.get("Origin");
  const fallbackOrigin = env.ALLOWED_ORIGIN || "*";
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": requestOrigin || fallbackOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
    Vary: "Origin",
  };
}

function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request, env),
  });
}

function textResponse(request, env, body, status = 200, contentType = "text/plain; charset=utf-8") {
  return new Response(body, {
    status,
    headers: corsHeaders(request, env, contentType),
  });
}

function normalizeReaction(input) {
  const key = String(input || "").trim().toLowerCase();
  return REACTION_ALIASES[key] || "";
}

function toBoolInt(value) {
  return value ? 1 : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith("en") ? "en" : "fr";
}

function parseBoolEnv(value, defaultValue = false) {
  if (typeof value !== "string") return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function extractIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function extractUserAgent(request) {
  return (request.headers.get("User-Agent") || "unknown").slice(0, 255);
}

function commentsRequireApproval(env) {
  return parseBoolEnv(env.COMMENTS_REQUIRE_APPROVAL, false);
}

function isAdminAuthorized(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 && token === env.ADMIN_TOKEN;
}

function parsePagination(url) {
  const rawLimit = Number(url.searchParams.get("limit") || 50);
  const rawOffset = Number(url.searchParams.get("offset") || 0);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 50, 1), 200);
  const offset = Math.max(Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0, 0);
  return { limit, offset };
}

function likePattern(value) {
  return `%${String(value).replace(/[\\%_]/g, "\\$&")}%`;
}

function adminForbidden(request, env) {
  const status = env.ADMIN_TOKEN ? 401 : 503;
  const error = env.ADMIN_TOKEN ? "Unauthorized" : "Admin disabled";
  return jsonResponse(request, env, { ok: false, error }, status);
}

function reactionsPayload(row) {
  return {
    thumbsup: Number(row?.reactions_thumbsup || 0),
    purpleheart: Number(row?.reactions_purpleheart || 0),
    wink: Number(row?.reactions_wink || 0),
    sweatsmile: Number(row?.reactions_sweatsmile || 0),
    nerd: Number(row?.reactions_nerd || 0),
    idea: Number(row?.reactions_idea || 0),
    robot: Number(row?.reactions_robot || 0),
    mobile: Number(row?.reactions_mobile || 0),
    laptop: Number(row?.reactions_laptop || 0),
  };
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseAdminIds(input) {
  const rawIds = Array.isArray(input?.ids) ? input.ids : [input?.id];
  return Array.from(
    new Set(
      rawIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).slice(0, 200);
}

function sqlPlaceholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function csvEscape(value) {
  const raw = value == null ? "" : String(value);
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toCsv(headers, rows) {
  const lines = [];
  lines.push(headers.map(csvEscape).join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function handleConsent(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const input = await readJsonBody(request);
  if (!input || typeof input !== "object") {
    return jsonResponse(request, env, { ok: false, error: "Invalid payload" }, 400);
  }

  const consentId = String(input.consent_id || "").trim();
  const pageUrl = String(input.page_url || "").trim();
  if (!consentId || !pageUrl) {
    return jsonResponse(request, env, { ok: false, error: "Missing required fields" }, 422);
  }

  const analytics = toBoolInt(Boolean(input.analytics));
  const marketing = toBoolInt(Boolean(input.marketing));
  const consentGiven = analytics || marketing ? "yes" : "no";
  const language = String(input.language || "").trim().slice(0, 8) || null;
  const theme = String(input.theme || "").trim().slice(0, 16) || null;
  const viewportWidth = Number.isFinite(input.viewport_width) ? Number(input.viewport_width) : null;
  const viewportHeight = Number.isFinite(input.viewport_height) ? Number(input.viewport_height) : null;
  const devicePixelRatio = Number.isFinite(input.device_pixel_ratio) ? Number(input.device_pixel_ratio) : null;
  const screenWidth = Number.isFinite(input.screen_width) ? Number(input.screen_width) : null;
  const screenHeight = Number.isFinite(input.screen_height) ? Number(input.screen_height) : null;
  const navigatorLanguage = String(input.navigator_language || "").trim().slice(0, 16) || null;
  const inAppBrowser = input.in_app_browser == null ? null : toBoolInt(Boolean(input.in_app_browser));
  const uaData = input.ua_data == null ? null : JSON.stringify(input.ua_data);

  await env.DB.prepare(
    `INSERT INTO consent_logs (
      consent_id, consent_given, analytics, marketing, language, theme,
      viewport_width, viewport_height, device_pixel_ratio, screen_width, screen_height,
      navigator_language, ua_data, in_app_browser, created_at, ip_address, user_agent, page_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      consentId,
      consentGiven,
      analytics,
      marketing,
      language,
      theme,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      screenWidth,
      screenHeight,
      navigatorLanguage,
      uaData,
      inAppBrowser,
      nowIso(),
      extractIp(request),
      extractUserAgent(request),
      pageUrl
    )
    .run();

  return jsonResponse(request, env, { ok: true });
}

async function handleComments(request, env, url) {
  if (request.method === "GET") {
    const article = String(url.searchParams.get("article") || "").trim();
    if (!article) {
      return jsonResponse(request, env, { ok: false, error: "Missing article" }, 422);
    }

    const rows = await env.DB.prepare(
      `SELECT id, parent_id, author_name, message, likes_count,
        reactions_thumbsup, reactions_purpleheart, reactions_wink, reactions_sweatsmile,
        reactions_nerd, reactions_idea, reactions_robot, reactions_mobile, reactions_laptop,
        created_at
       FROM article_comments
       WHERE article_slug = ? AND status = 'approved'
       ORDER BY created_at ASC, id ASC
       LIMIT 300`
    )
      .bind(article)
      .all();

    const comments = (rows.results || []).map((row) => ({
      ...row,
      reactions: reactionsPayload(row),
    }));
    return jsonResponse(request, env, { ok: true, comments });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const input = await readJsonBody(request);
  if (!input || typeof input !== "object") {
    return jsonResponse(request, env, { ok: false, error: "Invalid payload" }, 400);
  }

  const action = String(input.action || "comment").trim().toLowerCase();
  if (action === "react" || action === "like") {
    const article = String(input.article || "").trim();
    const commentId = Number(input.comment_id || 0);
    const reaction = normalizeReaction(input.reaction || (action === "like" ? "thumbsup" : ""));
    const operation = String(input.operation || "add").trim().toLowerCase();
    if (!article || !commentId || !reaction) {
      return jsonResponse(request, env, { ok: false, error: "Missing required fields" }, 422);
    }

    const column = REACTION_MAP[reaction];
    if (!column) {
      return jsonResponse(request, env, { ok: false, error: "Invalid reaction" }, 422);
    }

    const delta = operation === "remove" ? -1 : 1;
    const likesSql =
      reaction === "thumbsup"
        ? ", likes_count = max(likes_count + ?, 0)"
        : "";
    const updateSql = `UPDATE article_comments
      SET ${column} = max(${column} + ?, 0)
      ${likesSql}
      WHERE id = ? AND article_slug = ? AND status = 'approved'`;

    const bindings =
      reaction === "thumbsup"
        ? [delta, delta, commentId, article]
        : [delta, commentId, article];
    const result = await env.DB.prepare(updateSql).bind(...bindings).run();
    if (!result.success || result.meta.changes === 0) {
      return jsonResponse(request, env, { ok: false, error: "Comment not found" }, 404);
    }

    const selected = await env.DB.prepare(
      `SELECT likes_count, reactions_thumbsup, reactions_purpleheart, reactions_wink, reactions_sweatsmile,
       reactions_nerd, reactions_idea, reactions_robot, reactions_mobile, reactions_laptop
       FROM article_comments WHERE id = ? AND article_slug = ? LIMIT 1`
    )
      .bind(commentId, article)
      .first();

    return jsonResponse(request, env, {
      ok: true,
      likes_count: Number(selected?.likes_count || 0),
      reactions: reactionsPayload(selected || {}),
    });
  }

  if (input.website) {
    return jsonResponse(request, env, { ok: true, status: "ignored" });
  }

  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim();
  const message = String(input.message || "").trim();
  const article = String(input.article || "").trim();
  const pageUrl = String(input.page_url || "").trim();
  const parentId = Number(input.parent_id || 0);
  const normalizedParentId = parentId > 0 ? parentId : null;

  if (!name || !email || !message || !article || !pageUrl) {
    return jsonResponse(request, env, { ok: false, error: "Missing required fields" }, 422);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return jsonResponse(request, env, { ok: false, error: "Invalid email" }, 422);
  }
  if (message.length > 2000) {
    return jsonResponse(request, env, { ok: false, error: "Message too long" }, 422);
  }

  if (normalizedParentId !== null) {
    const parent = await env.DB.prepare(
      `SELECT id FROM article_comments
       WHERE id = ? AND article_slug = ? AND status = 'approved'
       LIMIT 1`
    )
      .bind(normalizedParentId, article)
      .first();
    if (!parent) {
      return jsonResponse(request, env, { ok: false, error: "Invalid parent comment" }, 422);
    }
  }

  const status = commentsRequireApproval(env) ? "pending" : "approved";
  await env.DB.prepare(
    `INSERT INTO article_comments (
      article_slug, page_url, parent_id, author_name, author_email, message,
      likes_count, reactions_thumbsup, reactions_purpleheart, reactions_wink, reactions_sweatsmile,
      reactions_nerd, reactions_idea, reactions_robot, reactions_mobile, reactions_laptop,
      status, created_at, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?)`
  )
    .bind(
      article,
      pageUrl,
      normalizedParentId,
      name,
      email,
      message,
      status,
      nowIso(),
      extractIp(request),
      extractUserAgent(request)
    )
    .run();

  return jsonResponse(request, env, { ok: true, status });
}

async function handleContactSubmit(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { success: false, message: "Method not allowed." }, 405);
  }

  const formData = await request.formData();
  const honeypot = String(formData.get("website") || "").trim();
  if (honeypot) {
    return jsonResponse(request, env, { success: false, message: "Invalid submission." }, 400);
  }

  const firstName = String(formData.get("user_first_name") || "").trim();
  const lastName = String(formData.get("user_last_name") || "").trim();
  const email = String(formData.get("user_email") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const contactConsent = formData.get("contact_consent") ? "yes" : "no";

  if (!firstName || !lastName || !email || !message) {
    return jsonResponse(request, env, { success: false, message: "Missing required fields." }, 422);
  }
  if (contactConsent !== "yes") {
    return jsonResponse(request, env, { success: false, message: "Consent required." }, 422);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return jsonResponse(request, env, { success: false, message: "Invalid email." }, 422);
  }
  if (message.length > 5000) {
    return jsonResponse(request, env, { success: false, message: "Message too long." }, 422);
  }

  await env.DB.prepare(
    `INSERT INTO contact_messages (
      first_name, last_name, email, message, contact_consent, ip_address, user_agent, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      firstName,
      lastName,
      email,
      message,
      contactConsent,
      extractIp(request),
      extractUserAgent(request),
      nowIso()
    )
    .run();

  return jsonResponse(request, env, { success: true, message: "Saved." });
}

async function handleExportCsv(request, env, url) {
  if (request.method !== "GET") {
    return textResponse(request, env, "Method not allowed.", 405);
  }

  if (!env.EXPORT_TOKEN) {
    return textResponse(request, env, "Export disabled.", 503);
  }
  const token = String(url.searchParams.get("token") || "");
  if (token !== env.EXPORT_TOKEN) {
    return textResponse(request, env, "Forbidden", 403);
  }

  const table = String(url.searchParams.get("table") || "").trim();
  const columns = ALLOWED_EXPORT_TABLES[table];
  if (!columns) {
    return textResponse(request, env, "Invalid table.", 400);
  }

  const query = `SELECT ${columns.join(", ")} FROM ${table} ORDER BY id DESC`;
  const rows = await env.DB.prepare(query).all();
  const csvBody = toCsv(columns, rows.results || []);
  const filename = `${table}-${new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z")}.csv`;

  return new Response(csvBody, {
    status: 200,
    headers: {
      ...corsHeaders(request, env, "text/csv; charset=utf-8"),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function requireAdmin(request, env) {
  if (!isAdminAuthorized(request, env)) {
    return adminForbidden(request, env);
  }
  return null;
}

async function handleAdminSummary(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const [
    commentsTotal,
    commentsPending,
    commentsApproved,
    commentsHidden,
    contactMessages,
    consentLogs,
    aiEvents,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments WHERE status = 'pending'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments WHERE status = 'approved'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments WHERE status = 'hidden'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM contact_messages").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM consent_logs").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM ai_assistant_events").first(),
  ]);

  return jsonResponse(request, env, {
    ok: true,
    summary: {
      comments_total: Number(commentsTotal?.count || 0),
      comments_pending: Number(commentsPending?.count || 0),
      comments_approved: Number(commentsApproved?.count || 0),
      comments_hidden: Number(commentsHidden?.count || 0),
      contact_messages: Number(contactMessages?.count || 0),
      consent_logs: Number(consentLogs?.count || 0),
      ai_assistant_events: Number(aiEvents?.count || 0),
    },
  });
}

async function handleAdminComments(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const { limit, offset } = parsePagination(url);
  const articleSlug = String(url.searchParams.get("article_slug") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim();
  if (status && !COMMENT_STATUSES.includes(status)) {
    return jsonResponse(request, env, { ok: false, error: "Invalid status" }, 422);
  }

  const where = [];
  const bindings = [];
  if (articleSlug) {
    where.push("article_slug LIKE ? ESCAPE '\\'");
    bindings.push(likePattern(articleSlug));
  }
  if (status) {
    where.push("status = ?");
    bindings.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await env.DB.prepare(
    `SELECT id, article_slug, page_url, parent_id, author_name, author_email, message,
      likes_count, reactions_thumbsup, reactions_purpleheart, reactions_wink, reactions_sweatsmile,
      reactions_nerd, reactions_idea, reactions_robot, reactions_mobile, reactions_laptop,
      status, created_at, ip_address, user_agent
     FROM article_comments
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindings, limit, offset)
    .all();

  return jsonResponse(request, env, { ok: true, items: rows.results || [], limit, offset });
}

async function handleAdminCommentStatus(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const input = await readJsonBody(request);
  const id = Number(input?.id || 0);
  const status = String(input?.status || "").trim();
  if (!Number.isInteger(id) || id <= 0 || !COMMENT_STATUSES.includes(status)) {
    return jsonResponse(request, env, { ok: false, error: "Invalid payload" }, 422);
  }

  const result = await env.DB.prepare("UPDATE article_comments SET status = ? WHERE id = ?")
    .bind(status, id)
    .run();
  if (!result.success || result.meta.changes === 0) {
    return jsonResponse(request, env, { ok: false, error: "Comment not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true });
}

async function handleAdminCommentDelete(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const input = await readJsonBody(request);
  const ids = parseAdminIds(input);
  if (!ids.length) {
    return jsonResponse(request, env, { ok: false, error: "Invalid payload" }, 422);
  }

  const placeholders = sqlPlaceholders(ids.length);
  await env.DB.prepare(`DELETE FROM article_comments WHERE parent_id IN (${placeholders})`).bind(...ids).run();
  const result = await env.DB.prepare(`DELETE FROM article_comments WHERE id IN (${placeholders})`).bind(...ids).run();
  if (!result.success || result.meta.changes === 0) {
    return jsonResponse(request, env, { ok: false, error: "Comment not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true, deleted: Number(result.meta.changes || 0) });
}

async function handleAdminContactMessages(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const { limit, offset } = parsePagination(url);
  const q = String(url.searchParams.get("q") || "").trim();
  const where = [];
  const bindings = [];
  if (q) {
    where.push("(first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')");
    const pattern = likePattern(q);
    bindings.push(pattern, pattern, pattern, pattern);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await env.DB.prepare(
    `SELECT id, first_name, last_name, email, message, contact_consent,
      ip_address, user_agent, submitted_at
     FROM contact_messages
     ${whereSql}
     ORDER BY submitted_at DESC, id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindings, limit, offset)
    .all();

  return jsonResponse(request, env, { ok: true, items: rows.results || [], limit, offset });
}

async function handleAdminContactMessageDelete(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const input = await readJsonBody(request);
  const ids = parseAdminIds(input);
  if (!ids.length) {
    return jsonResponse(request, env, { ok: false, error: "Invalid payload" }, 422);
  }

  const result = await env.DB.prepare(`DELETE FROM contact_messages WHERE id IN (${sqlPlaceholders(ids.length)})`)
    .bind(...ids)
    .run();
  if (!result.success || result.meta.changes === 0) {
    return jsonResponse(request, env, { ok: false, error: "Message not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true, deleted: Number(result.meta.changes || 0) });
}

async function handleAdminConsentLogs(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const { limit, offset } = parsePagination(url);
  const consentGiven = String(url.searchParams.get("consent_given") || "").trim().toLowerCase();
  const language = String(url.searchParams.get("language") || "").trim().toLowerCase();
  if (consentGiven && !["yes", "no"].includes(consentGiven)) {
    return jsonResponse(request, env, { ok: false, error: "Invalid consent_given" }, 422);
  }
  if (language && !["fr", "en"].includes(language)) {
    return jsonResponse(request, env, { ok: false, error: "Invalid language" }, 422);
  }

  const where = [];
  const bindings = [];
  if (consentGiven) {
    where.push("consent_given = ?");
    bindings.push(consentGiven);
  }
  if (language) {
    where.push("language = ?");
    bindings.push(language);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await env.DB.prepare(
    `SELECT id, consent_id, consent_given, analytics, marketing, language, theme,
      viewport_width, viewport_height, device_pixel_ratio, screen_width, screen_height,
      navigator_language, ua_data, in_app_browser, created_at, ip_address, user_agent, page_url
     FROM consent_logs
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindings, limit, offset)
    .all();

  return jsonResponse(request, env, { ok: true, items: rows.results || [], limit, offset });
}

async function handleAdminConsentLogDelete(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const input = await readJsonBody(request);
  const ids = parseAdminIds(input);
  if (!ids.length) {
    return jsonResponse(request, env, { ok: false, error: "Invalid payload" }, 422);
  }

  const result = await env.DB.prepare(`DELETE FROM consent_logs WHERE id IN (${sqlPlaceholders(ids.length)})`)
    .bind(...ids)
    .run();
  if (!result.success || result.meta.changes === 0) {
    return jsonResponse(request, env, { ok: false, error: "Consent log not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true, deleted: Number(result.meta.changes || 0) });
}

async function handleAdminAiEvents(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const { limit, offset } = parsePagination(url);
  const eventType = String(url.searchParams.get("event_type") || "").trim();
  const sessionId = String(url.searchParams.get("session_id") || "").trim();
  const language = String(url.searchParams.get("language") || "").trim().toLowerCase();
  if (language && !["fr", "en"].includes(language)) {
    return jsonResponse(request, env, { ok: false, error: "Invalid language" }, 422);
  }

  const where = [];
  const bindings = [];
  if (eventType) {
    where.push("event_type LIKE ? ESCAPE '\\'");
    bindings.push(likePattern(eventType));
  }
  if (sessionId) {
    where.push("session_id LIKE ? ESCAPE '\\'");
    bindings.push(likePattern(sessionId));
  }
  if (language) {
    where.push("language = ?");
    bindings.push(language);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, language, page_url, meta,
      created_at, ip_address, user_agent
     FROM ai_assistant_events
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindings, limit, offset)
    .all();

  return jsonResponse(request, env, { ok: true, items: rows.results || [], limit, offset });
}

async function handleAdminAiEventDelete(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const input = await readJsonBody(request);
  const ids = parseAdminIds(input);
  if (!ids.length) {
    return jsonResponse(request, env, { ok: false, error: "Invalid payload" }, 422);
  }

  const result = await env.DB.prepare(`DELETE FROM ai_assistant_events WHERE id IN (${sqlPlaceholders(ids.length)})`)
    .bind(...ids)
    .run();
  if (!result.success || result.meta.changes === 0) {
    return jsonResponse(request, env, { ok: false, error: "Event not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true, deleted: Number(result.meta.changes || 0) });
}

async function handleAdminExport(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const table = String(url.searchParams.get("table") || "").trim();
  const format = String(url.searchParams.get("format") || "json").trim().toLowerCase();
  const columns = ALLOWED_EXPORT_TABLES[table];
  if (!columns) {
    return jsonResponse(request, env, { ok: false, error: "Invalid table" }, 400);
  }
  if (format !== "json") {
    return jsonResponse(request, env, { ok: false, error: "Invalid format" }, 400);
  }

  const rows = await env.DB.prepare(`SELECT ${columns.join(", ")} FROM ${table} ORDER BY id DESC`).all();
  const filename = `${table}-${new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z")}.json`;
  return new Response(JSON.stringify({ ok: true, table, items: rows.results || [] }, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders(request, env),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function handleAdmin(request, env, url) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  const pathname = url.pathname;
  if (pathname === "/admin/summary") return await handleAdminSummary(request, env);
  if (pathname === "/admin/comments") return await handleAdminComments(request, env, url);
  if (pathname === "/admin/comments/status") return await handleAdminCommentStatus(request, env);
  if (pathname === "/admin/comments/delete") return await handleAdminCommentDelete(request, env);
  if (pathname === "/admin/contact-messages") return await handleAdminContactMessages(request, env, url);
  if (pathname === "/admin/contact-messages/delete") return await handleAdminContactMessageDelete(request, env);
  if (pathname === "/admin/consent-logs") return await handleAdminConsentLogs(request, env, url);
  if (pathname === "/admin/consent-logs/delete") return await handleAdminConsentLogDelete(request, env);
  if (pathname === "/admin/ai-events") return await handleAdminAiEvents(request, env, url);
  if (pathname === "/admin/ai-events/delete") return await handleAdminAiEventDelete(request, env);
  if (pathname === "/admin/export") return await handleAdminExport(request, env, url);
  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!env.DB) {
      return jsonResponse(request, env, { ok: false, error: "Missing DB binding" }, 500);
    }

    try {
      if (pathname.startsWith("/admin/")) return await handleAdmin(request, env, url);
      if (pathname === "/backend/consent.php") return await handleConsent(request, env);
      if (pathname === "/backend/comments.php") return await handleComments(request, env, url);
      if (pathname === "/contact-submit.php") return await handleContactSubmit(request, env);
      if (pathname === "/export-csv.php") return await handleExportCsv(request, env, url);
      return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
    } catch (error) {
      return jsonResponse(
        request,
        env,
        {
          ok: false,
          error: "Server error",
          detail: String(error?.message || error || "unknown_error"),
        },
        500
      );
    }
  },
};
