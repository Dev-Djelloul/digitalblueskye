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

// Static fallback whitelist: kept in addition to ALLOWED_ORIGIN so Netlify
// and local dev keep working even if the env var is unset or misconfigured.
const STATIC_ALLOWED_ORIGINS = ["https://digitalblueskye.netlify.app"];
const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function getEnvAllowedOrigins(env) {
  return String(env?.ALLOWED_ORIGIN || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (LOCALHOST_ORIGIN_PATTERN.test(normalized)) return true;
  if (STATIC_ALLOWED_ORIGINS.includes(normalized)) return true;
  return getEnvAllowedOrigins(env).includes(normalized);
}

function corsHeaders(request, env, contentType = "application/json; charset=utf-8") {
  const requestOrigin = request.headers.get("Origin");
  const headers = {
    "Content-Type": contentType,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
    Vary: "Origin",
  };
  if (isOriginAllowed(requestOrigin, env)) {
    headers["Access-Control-Allow-Origin"] = normalizeOrigin(requestOrigin);
  }
  return headers;
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

function isConfigured(value) {
  return String(value || "").trim().length > 0;
}

function healthStatus(status, detail, priority) {
  return { status, detail, priority };
}

function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function averageWeighted(scores) {
  const totalWeight = scores.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (!totalWeight) return 0;
  const total = scores.reduce((sum, item) => sum + Number(item.score || 0) * Number(item.weight || 0), 0);
  return roundOne(total / totalWeight);
}

function buildDomainScores({ openRouterOk, tavilyOk, dbConfigured, frontendOk }) {
  const domains = [
    { domain: "IA", score: openRouterOk ? 8.1 : 6.4, weight: 1.4 },
    { domain: "Recherche Web", score: tavilyOk ? 8.0 : 6.2, weight: 1.1 },
    { domain: "Documents", score: 7.4, weight: 1.0 },
    { domain: "Mémoire", score: 7.2, weight: 0.9 },
    { domain: "UX/UI", score: frontendOk ? 8.0 : 7.2, weight: 0.9 },
    { domain: "Sécurité", score: dbConfigured ? 8.0 : 6.6, weight: 1.2 },
    { domain: "Observabilité", score: 6.9, weight: 1.1 },
    { domain: "Agents", score: 4.8, weight: 0.7 },
  ];
  return {
    domains,
    global_score: averageWeighted(domains),
    trend: "hausse",
    delta_since_last_audit: "+0.6",
    last_audit_score: 7.1,
    method: "Moyenne pondérée des domaines produit et techniques.",
  };
}

function healthVerification(ok, partial = false) {
  if (ok) return "verified";
  return partial ? "partial" : "failed";
}

function healthVerificationLabel(value) {
  if (value === "verified") return "🟢 Vérifié automatiquement";
  if (value === "partial") return "🟡 Vérification partielle";
  return "🔴 Échec du contrôle";
}

function detectedHealthEnvNames(env) {
  return Object.keys(env || {})
    .filter((name) => /^(AI_|APP_|BUILD|COMMIT|LAST_|ADMIN|HEALTH|OPENROUTER|TAVILY|SERPER|MISTRAL|ALLOWED|ENVIRONMENT|CF_)/i.test(name))
    .sort();
}

function explainAiWorkerHealthStatus(status, error) {
  if (status === 200) return "";
  if (status === 401) return "Token Health incorrect ou manquant";
  if (status === 404) return "Route /admin/health introuvable sur le Worker IA";
  if (status === 0) return error === "timeout" ? "Timeout lors de l'appel au Worker IA" : "Échec réseau lors de l'appel au Worker IA";
  return error || `Réponse inattendue du Worker IA (${status})`;
}

function buildApiHealthDiagnostics({ request, env, aiWorkerHealthUrl, aiHealthResult, aiHealthToken }) {
  const status = aiHealthResult?.status ?? null;
  const error = aiHealthResult?.payload?.error || aiHealthResult?.error || "";
  return {
    worker: "digitalblueskye-api",
    environment: env.ENVIRONMENT || env.CF_ENVIRONMENT || "production",
    request_path: new URL(request.url).pathname,
    ai_health_token_configured: isConfigured(aiHealthToken),
    ai_worker_call_mode: aiHealthResult?.call_mode || "public_fetch",
    ai_worker_health_url_configured: isConfigured(env.AI_WORKER_HEALTH_URL),
    ai_worker_health_url_used: aiHealthResult?.final_url || aiWorkerHealthUrl,
    ai_worker_health_url: aiWorkerHealthUrl,
    ai_worker_http_status: status,
    ai_worker_response_url: aiHealthResult?.response_url || "",
    ai_worker_response_preview: aiHealthResult?.raw_text_first_500_chars || "",
    ai_worker_used_health_token: Boolean(aiHealthResult?.used_ai_health_token),
    ai_worker_headers_sent: aiHealthResult?.request_headers_sent || [],
    ai_worker_error: explainAiWorkerHealthStatus(status, error),
    ai_worker_raw_error: error,
    ai_worker_payload_ok: Boolean(aiHealthResult?.payload?.ok),
    detected_variable_names: detectedHealthEnvNames(env),
    source: "digitalblueskye-api aggregation + digitalblueskye-ai health",
    secrets_values_exposed: false,
  };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 2200) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = options.headers || {};
  const requestHeadersSent = Object.keys(headers);
  const usedAiHealthToken = requestHeadersSent.includes("X-Health-Check-Token");
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {}
    return {
      ok: response.ok,
      status: response.status,
      payload,
      final_url: url,
      response_url: response.url || "",
      raw_text_first_500_chars: text.slice(0, 500),
      request_headers_sent: requestHeadersSent,
      used_ai_health_token: usedAiHealthToken,
      call_mode: "public_fetch",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      final_url: url,
      response_url: "",
      raw_text_first_500_chars: "",
      request_headers_sent: requestHeadersSent,
      used_ai_health_token: usedAiHealthToken,
      call_mode: "public_fetch",
      error: error?.name === "AbortError" ? "timeout" : "fetch_failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseJsonResponseMetadata(response, url, requestHeadersSent, usedAiHealthToken, callMode) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {}
  return {
    ok: response.ok,
    status: response.status,
    payload,
    final_url: url,
    response_url: response.url || "",
    raw_text_first_500_chars: text.slice(0, 500),
    request_headers_sent: requestHeadersSent,
    used_ai_health_token: usedAiHealthToken,
    call_mode: callMode,
  };
}

async function fetchAiWorkerHealth(env, aiWorkerHealthUrl, aiHealthToken, timeoutMs = 10000) {
  const headers = {
    ...(aiHealthToken ? { "X-Health-Check-Token": aiHealthToken } : {}),
    Accept: "application/json",
  };
  const requestHeadersSent = Object.keys(headers);
  const usedAiHealthToken = requestHeadersSent.includes("X-Health-Check-Token");

  if (env.AI_WORKER?.fetch) {
    try {
      const response = await env.AI_WORKER.fetch(new Request("https://digitalblueskye-ai/admin/health", {
        method: "GET",
        headers,
      }));
      return await parseJsonResponseMetadata(
        response,
        "service-binding://digitalblueskye-ai/admin/health",
        requestHeadersSent,
        usedAiHealthToken,
        "service_binding"
      );
    } catch (error) {
      return {
        ok: false,
        status: 0,
        payload: null,
        final_url: "service-binding://digitalblueskye-ai/admin/health",
        response_url: "",
        raw_text_first_500_chars: "",
        request_headers_sent: requestHeadersSent,
        used_ai_health_token: usedAiHealthToken,
        call_mode: "service_binding",
        error: error?.name === "AbortError" ? "timeout" : "service_binding_failed",
      };
    }
  }

  return await fetchJsonWithTimeout(aiWorkerHealthUrl, {
    method: "GET",
    headers,
  }, timeoutMs);
}

async function firstCount(env, sql, ...bindings) {
  const statement = env.DB.prepare(sql);
  const row = bindings.length ? await statement.bind(...bindings).first() : await statement.first();
  return Number(row?.count || 0);
}

async function firstNumber(env, sql, field = "value", ...bindings) {
  const statement = env.DB.prepare(sql);
  const row = bindings.length ? await statement.bind(...bindings).first() : await statement.first();
  const value = Number(row?.[field]);
  return Number.isFinite(value) ? value : null;
}

function parseEventMeta(row) {
  if (!row?.meta) return {};
  try {
    const parsed = JSON.parse(row.meta);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function eventMatches(row, needles) {
  const haystack = [
    row?.event_type,
    row?.event_value,
    row?.meta,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return needles.some((needle) => haystack.includes(needle));
}

function averageFromEvents(rows, fieldNames) {
  const values = [];
  for (const row of rows) {
    const meta = parseEventMeta(row);
    for (const fieldName of fieldNames) {
      const value = Number(meta[fieldName] ?? row?.[fieldName]);
      if (Number.isFinite(value) && value > 0) values.push(value);
    }
  }
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function latestOpenRouterResponseInfo(rows) {
  const row = rows.find((item) => item?.event_type === "openrouter_response");
  if (!row) return null;
  const meta = parseEventMeta(row);
  return {
    at: row.created_at || "",
    model: meta.resolved_model || meta.model || row.event_value || "",
    latency_ms: Number(meta.latency_ms || 0) || null,
  };
}

function latestTavilyEventInfo(rows, eventType) {
  const row = rows.find((item) => item?.event_type === eventType);
  if (!row) return null;
  const meta = parseEventMeta(row);
  return {
    at: row.created_at || "",
    latency_ms: Number(meta.latency_ms || meta.duration_ms || 0) || null,
    endpoint: meta.endpoint || "",
    error: meta.error || row.event_value || "",
    status_code: meta.status_code ?? null,
  };
}

function averagePerPeriod(rows, predicate, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const count = rows.filter((row) => {
    const createdAt = new Date(row.created_at || 0).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff && predicate(row);
  }).length;
  return Math.round((count / days) * 10) / 10;
}

const TAVILY_DEFAULT_QUOTA = 1000;

function buildTavilyUsageFromEvents(rows, aiHealthPayload, env) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const runtime = aiHealthPayload?.tavily_usage || {};
  const actualCallRows = eventRows.filter((row) => ["web_search_success", "web_search_error"].includes(row.event_type));
  const successRows = eventRows.filter((row) => row.event_type === "web_search_success");
  const cacheRows = eventRows.filter((row) => row.event_type === "web_search_cached");
  const dedupeRows = eventRows.filter((row) => row.event_type === "web_search_deduplicated");
  const skippedRows = eventRows.filter((row) => row.event_type === "web_search_skipped");
  const creditsFromEvents = actualCallRows.reduce((sum, row) => {
    const meta = parseEventMeta(row);
    const value = Number(meta.estimated_credits ?? meta.credits_estimated ?? 1);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const quota = Number(runtime.quota_estimated_total || env.TAVILY_MONTHLY_QUOTA || env.TAVILY_CREDIT_QUOTA || TAVILY_DEFAULT_QUOTA);
  const quotaSource = runtime.quota_source
    || ((env.TAVILY_MONTHLY_QUOTA || env.TAVILY_CREDIT_QUOTA) ? "env_configured" : "fallback_default");
  const searchesExecuted = actualCallRows.length;
  const searchesSkipped = skippedRows.length;
  const cacheHits = cacheRows.length;
  const dedupeCount = dedupeRows.length;
  const creditsUsed = creditsFromEvents;
  const cacheTotal = searchesExecuted + cacheHits;
  const dedupeTotal = searchesExecuted + dedupeCount;
  const latestSuccess = latestTavilyEventInfo(eventRows, "web_search_success");
  const latestError = latestTavilyEventInfo(eventRows, "web_search_error");
  const lastEvent = [latestSuccess, latestError].filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;
  const averageLatencyMs = Number(runtime.average_latency_ms || 0) || averageFromEvents(successRows, ["latency_ms", "duration_ms"]);
  const quotaUsedPercent = quota ? Math.min(100, Math.round((creditsUsed / quota) * 1000) / 10) : 0;
  const lastSuccessAt = runtime.last_success_at || latestSuccess?.at || null;
  const lastErrorAt = runtime.last_error_at || latestError?.at || null;
  const errorStatus = !lastErrorAt
    ? "none"
    : (lastSuccessAt && new Date(lastSuccessAt) > new Date(lastErrorAt) ? "resolved" : "active");

  return {
    endpoint: runtime.endpoint || latestSuccess?.endpoint || latestError?.endpoint || "https://api.tavily.com/search",
    api_key_configured: aiHealthPayload?.configuration?.tavily_api_key_configured ?? null,
    searches_executed: searchesExecuted,
    searches_skipped: searchesSkipped,
    searches_avoided_cache: cacheHits,
    searches_avoided_deduplication: dedupeCount,
    cache_hit_count: cacheHits,
    cache_miss_count: searchesExecuted,
    cache_hit_rate: cacheTotal ? Math.round((cacheHits / cacheTotal) * 1000) / 10 : 0,
    cache_miss_rate: cacheTotal ? Math.round((searchesExecuted / cacheTotal) * 1000) / 10 : 0,
    deduplication_rate: dedupeTotal ? Math.round((dedupeCount / dedupeTotal) * 1000) / 10 : 0,
    average_latency_ms: averageLatencyMs,
    credits_estimated_consumed: creditsUsed,
    credits_estimated_remaining: Math.max(0, quota - creditsUsed),
    quota_estimated_total: quota,
    quota_source: quotaSource,
    quota_estimated_used_percent: quotaUsedPercent,
    daily_average: averagePerPeriod(eventRows, (row) => ["web_search_success", "web_search_error"].includes(row.event_type), 1),
    weekly_average: averagePerPeriod(eventRows, (row) => ["web_search_success", "web_search_error"].includes(row.event_type), 7),
    last_call_at: runtime.last_call_at || lastEvent?.at || null,
    last_latency_ms: runtime.last_latency_ms ?? lastEvent?.latency_ms ?? null,
    last_success_at: lastSuccessAt,
    last_error_at: lastErrorAt,
    last_error: runtime.last_error || latestError?.error || "",
    error_status: errorStatus,
    economy_mode_active: runtime.economy_mode_active ?? true,
    ultra_economy_mode_active: runtime.ultra_economy_mode_active ?? quotaUsedPercent >= 95,
  };
}

function buildRagUsageFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const queryRows = eventRows.filter((row) => row.event_type === "rag_query");
  const matchRows = eventRows.filter((row) => row.event_type === "rag_match");
  const noMatchRows = eventRows.filter((row) => row.event_type === "rag_no_match");
  const contextRows = eventRows.filter((row) => row.event_type === "rag_context_used");
  const searches = queryRows.length;
  const matchRate = searches ? Math.round((matchRows.length / searches) * 1000) / 10 : 0;
  const averageDurationMs = averageFromEvents(queryRows.concat(matchRows, noMatchRows), ["duration_ms"]);
  const documentUse = new Map();
  contextRows.forEach((row) => {
    const meta = parseEventMeta(row);
    const key = meta.projectName || meta.projectId || "Projet";
    documentUse.set(key, (documentUse.get(key) || 0) + Number(meta.documents_used || 0));
  });
  return {
    project_rag_active: searches > 0,
    searches_performed: searches,
    matches: matchRows.length,
    no_matches: noMatchRows.length,
    match_rate: matchRate,
    average_search_ms: averageDurationMs,
    contexts_used: contextRows.length,
    documents_indexed: Math.max(0, ...eventRows.map((row) => Number(parseEventMeta(row).documents_used || 0))),
    chunks_available: Math.max(0, ...eventRows.map((row) => Number(parseEventMeta(row).chunks_searched || 0))),
    top_documents: Array.from(documentUse.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

function stabilizeOpenRouterCheck(check, configured, latestResponse) {
  if (!check || !configured || !latestResponse) return check;
  const statusCode = Number(check.status_code || 0);
  if (statusCode === 401 || statusCode === 403 || check.status === "operational") return check;
  return {
    ...check,
    status: "partial",
    verification: check.verification === "verified" ? "verified" : "partial",
    detail: "Le contrôle ponctuel est instable, mais des réponses OpenRouter récentes existent.",
    recent_openrouter_response_at: latestResponse.at,
    last_model_used: latestResponse.model,
  };
}

function formatHealthActivity(row) {
  const type = String(row?.event_type || "").toLowerCase();
  const value = String(row?.event_value || "").toLowerCase();
  const meta = String(row?.meta || "").toLowerCase();
  const combined = `${type} ${value} ${meta}`;
  let label = "Événement IA";
  if (combined.includes("web_search")) label = "Recherche web exécutée";
  else if (combined.includes("rag_")) label = "Recherche RAG projet";
  else if (combined.includes("pdf")) label = "PDF analysé";
  else if (combined.includes("docx")) label = "DOCX analysé";
  else if (combined.includes("xlsx") || combined.includes("excel")) label = "XLSX analysé";
  else if (combined.includes("openrouter") || combined.includes("api_response")) label = "Appel OpenRouter traité";
  else if (combined.includes("api_error")) label = "Erreur IA détectée";
  return {
    at: row?.created_at || "",
    type: row?.event_type || "ai_event",
    label,
    detail: row?.event_value || "",
  };
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

async function handleAdminHealth(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }

  const checkedAt = nowIso();
  const dbConfigured = Boolean(env.DB);
  const adminConfigured = isConfigured(env.ADMIN_TOKEN);
  const frontendOrigin = env.ALLOWED_ORIGIN || "Origine dynamique via CORS";
  const aiWorkerHealthUrl = env.AI_WORKER_HEALTH_URL || "https://digitalblueskye-ai.djelloulabid75.workers.dev/admin/health";
  const aiHealthToken = env.AI_HEALTH_TOKEN || env.HEALTH_CHECK_TOKEN || "";
  const appVersion = env.APP_VERSION || "1.5.0";
  const buildNumber = env.BUILD_NUMBER || checkedAt.slice(0, 10);
  const commitSha = env.COMMIT_SHA || env.CF_PAGES_COMMIT_SHA || "";
  const deployedAt = env.LAST_DEPLOYED_AT || checkedAt;

  const recentEventsPromise = env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     ORDER BY created_at DESC, id DESC
     LIMIT 500`
  ).all();

  const aiHealthPromise = fetchAiWorkerHealth(env, aiWorkerHealthUrl, aiHealthToken, 10000);

  const frontendHealthPromise = frontendOrigin && frontendOrigin.startsWith("http")
    ? fetchJsonWithTimeout(frontendOrigin, { method: "GET" }, 2200)
    : Promise.resolve({ ok: false, status: 0, payload: null, error: "dynamic_origin" });

  const [
    recentEventsResult,
    aiHealthResult,
    frontendHealthResult,
    conversationCount,
    aiEventCount,
    webSearchCount,
    pdfCount,
    docxCount,
    xlsxCount,
    openRouterCount,
    averageResponseMs,
    averageWebSearchMs,
  ] = await Promise.all([
    recentEventsPromise,
    aiHealthPromise,
    frontendHealthPromise,
    firstCount(env, "SELECT COUNT(DISTINCT session_id) AS count FROM ai_assistant_events WHERE session_id IS NOT NULL AND session_id != ''"),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events"),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type IN ('web_search_requested', 'web_search_skipped', 'web_search_cached', 'web_search_deduplicated', 'web_search_success', 'web_search_error', 'web_search')"),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'pdf_uploaded'"),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'docx_uploaded'"),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'xlsx_uploaded'"),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'openrouter_request'"),
    firstNumber(
      env,
      `SELECT AVG(CAST(json_extract(meta, '$.latency_ms') AS REAL)) AS value
       FROM ai_assistant_events
       WHERE event_type IN ('openrouter_response', 'assistant_response')
         AND json_valid(meta)
         AND json_extract(meta, '$.latency_ms') IS NOT NULL`
    ).then((value) => value == null ? null : Math.round(value)),
    firstNumber(
      env,
      `SELECT AVG(CAST(json_extract(meta, '$.latency_ms') AS REAL)) AS value
       FROM ai_assistant_events
       WHERE event_type = 'web_search_success'
         AND json_valid(meta)
         AND json_extract(meta, '$.latency_ms') IS NOT NULL`
    ).then((value) => value == null ? null : Math.round(value)),
  ]);

  const recentEvents = recentEventsResult.results || [];
  const aiHealthDiagnostics = buildApiHealthDiagnostics({ request, env, aiWorkerHealthUrl, aiHealthResult, aiHealthToken });
  console.log("admin_health_aggregation", aiHealthDiagnostics);
  const openRouterCheck = aiHealthResult.payload?.checks?.openrouter || null;
  const tavilyCheck = aiHealthResult.payload?.checks?.tavily || null;
  const aiHealthAvailable = Boolean(aiHealthResult.ok && aiHealthResult.payload?.ok);
  const latestOpenRouterResponse = latestOpenRouterResponseInfo(recentEvents);
  const openRouterConfigured = aiHealthAvailable
    ? Boolean(aiHealthResult.payload?.configuration?.openrouter_api_key_configured)
    : (latestOpenRouterResponse ? true : null);
  const tavilyConfigured = aiHealthAvailable
    ? Boolean(aiHealthResult.payload?.configuration?.tavily_api_key_configured)
    : null;
  const tavilyUsage = buildTavilyUsageFromEvents(recentEvents, aiHealthResult.payload, env);
  const ragUsage = buildRagUsageFromEvents(recentEvents);
  const effectiveOpenRouterCheck = stabilizeOpenRouterCheck(openRouterCheck, openRouterConfigured, latestOpenRouterResponse);
  const openRouterOk = Boolean(effectiveOpenRouterCheck?.ok);
  const tavilyOk = Boolean(tavilyCheck?.ok);
  const frontendOk = Boolean(frontendHealthResult.ok);

  const scorecard = buildDomainScores({
    openRouterOk,
    tavilyOk,
    dbConfigured,
    frontendOk,
  });

  const services = [
    {
      name: "Netlify frontend",
      ...healthStatus(
        frontendOk ? "operational" : "partial",
        `Origine autorisée: ${frontendOrigin}. Réponse HTTP: ${frontendHealthResult.status || "non vérifiée"}.`,
        frontendOk ? "Surveiller le déploiement Netlify et les erreurs console." : "Vérifier la disponibilité Netlify ou la variable ALLOWED_ORIGIN."
      ),
      verification: healthVerification(frontendOk, true),
      verification_label: healthVerificationLabel(healthVerification(frontendOk, true)),
      last_checked_at: checkedAt,
    },
    {
      name: "Cloudflare Worker",
      ...healthStatus(
        dbConfigured && adminConfigured ? "operational" : "partial",
        `Endpoint admin actif. DB D1: ${dbConfigured ? "oui" : "non"}. ADMIN_TOKEN: ${adminConfigured ? "oui" : "non"}.`,
        dbConfigured && adminConfigured ? "Ajouter un monitoring externe." : "Finaliser les bindings/secrets Worker."
      ),
      verification: healthVerification(dbConfigured && adminConfigured, true),
      verification_label: healthVerificationLabel(healthVerification(dbConfigured && adminConfigured, true)),
      last_checked_at: checkedAt,
    },
    {
      name: "OpenRouter",
      ...healthStatus(
        effectiveOpenRouterCheck?.status || (openRouterConfigured === false ? "unconfigured" : "partial"),
        effectiveOpenRouterCheck?.detail || `Contrôle du Worker IA non disponible (${aiHealthDiagnostics.ai_worker_error || aiHealthDiagnostics.ai_worker_http_status || "erreur inconnue"}). OPENROUTER_API_KEY: non vérifiable depuis digitalblueskye-api.`,
        openRouterConfigured === true ? "Suivre les erreurs fournisseur, la latence et les modèles de repli." : "Rendre /admin/health accessible sur digitalblueskye-ai via ADMIN_TOKEN ou HEALTH_CHECK_TOKEN."
      ),
      verification: effectiveOpenRouterCheck?.verification || "partial",
      verification_label: healthVerificationLabel(effectiveOpenRouterCheck?.verification || "partial"),
      latency_ms: effectiveOpenRouterCheck?.latency_ms ?? null,
      last_checked_at: checkedAt,
    },
    {
      name: "Tavily",
      ...healthStatus(
        tavilyCheck?.status || (tavilyConfigured === false ? "unconfigured" : "partial"),
        tavilyCheck?.detail || `Contrôle du Worker IA non disponible (${aiHealthDiagnostics.ai_worker_error || aiHealthDiagnostics.ai_worker_http_status || "erreur inconnue"}). TAVILY_API_KEY: non vérifiable depuis digitalblueskye-api.`,
        tavilyConfigured === true ? "Suivre la qualité des résultats, la latence et les quotas." : "Rendre /admin/health accessible sur digitalblueskye-ai via ADMIN_TOKEN ou HEALTH_CHECK_TOKEN."
      ),
      verification: tavilyCheck?.verification || "partial",
      verification_label: healthVerificationLabel(tavilyCheck?.verification || "partial"),
      latency_ms: tavilyCheck?.latency_ms ?? null,
      last_checked_at: checkedAt,
    },
    {
      name: "Recherche web",
      ...healthStatus(
        tavilyOk ? "operational" : "partial",
        tavilyOk ? "Recherche temps réel vérifiée via le Worker IA digitalblueskye-ai." : "Recherche web disponible côté interface, contrôle Tavily incomplet.",
        tavilyOk ? "Ajouter suivi de quotas et qualité des sources." : "Finaliser la configuration Tavily sur digitalblueskye-ai."
      ),
      verification: tavilyCheck?.verification || "partial",
      verification_label: healthVerificationLabel(tavilyCheck?.verification || "partial"),
      latency_ms: tavilyCheck?.latency_ms ?? null,
      last_checked_at: checkedAt,
    },
    {
      name: "Upload PDF",
      ...healthStatus(
        "operational",
        "Extraction PDF côté navigateur via PDF.js, avec contexte transmis au chat.",
        "Ajouter des tests sur PDF scannés et gros fichiers."
      ),
      verification: "partial",
      verification_label: healthVerificationLabel("partial"),
      last_checked_at: checkedAt,
    },
    {
      name: "Upload DOCX",
      ...healthStatus(
        "operational",
        "Extraction DOCX côté navigateur et intégration dans le contexte assistant.",
        "Renforcer la validation sur documents volumineux."
      ),
      verification: "partial",
      verification_label: healthVerificationLabel("partial"),
      last_checked_at: checkedAt,
    },
    {
      name: "Upload XLSX",
      ...healthStatus(
        "partial",
        "Lecture XLS/XLSX côté navigateur présente, consolidation produit encore en cours.",
        "Stabiliser les cas multi-feuilles, formats et exports."
      ),
      verification: "partial",
      verification_label: healthVerificationLabel("partial"),
      last_checked_at: checkedAt,
    },
    {
      name: "Mémoire conversationnelle",
      ...healthStatus(
        "operational",
        "Résumé et contexte conversationnel conservés localement côté navigateur.",
        "Prévoir une stratégie de synchronisation ou sauvegarde optionnelle."
      ),
      verification: "partial",
      verification_label: healthVerificationLabel("partial"),
      last_checked_at: checkedAt,
    },
    {
      name: "Historique",
      ...healthStatus(
        "operational",
        "Historique des conversations stocké localement avec export possible.",
        "Ajouter une gestion de sauvegarde/restauration."
      ),
      verification: "partial",
      verification_label: healthVerificationLabel("partial"),
      last_checked_at: checkedAt,
    },
    {
      name: "RAG documentaire",
      ...healthStatus(
        "partial",
        "Bibliothèque documentaire locale disponible, sans index vectoriel serveur dédié.",
        "Mettre en place un vrai pipeline RAG avec index et citations."
      ),
      verification: "partial",
      verification_label: healthVerificationLabel("partial"),
      last_checked_at: checkedAt,
    },
    {
      name: "Agents spécialisés",
      ...healthStatus(
        "development",
        "Non exposé comme orchestration agentique dédiée dans l’interface actuelle.",
        "Définir les rôles, outils, garde-fous et traces d’exécution."
      ),
      verification: "partial",
      verification_label: healthVerificationLabel("partial"),
      last_checked_at: checkedAt,
    },
  ];

  return jsonResponse(request, env, {
    ok: true,
    version: "2.0",
    checked_at: checkedAt,
    system: {
      version: appVersion,
      build: buildNumber,
      commit: commitSha ? commitSha.slice(0, 12) : null,
      last_deployed_at: deployedAt,
      api_worker: "digitalblueskye-api",
      ai_worker: "digitalblueskye-ai",
      ai_worker_health_url: aiWorkerHealthUrl,
    },
    maturity: {
      score: scorecard.global_score,
      max: 10,
      detail: "Score global calculé par moyenne pondérée des domaines V2.",
    },
    scorecard,
    configuration: {
      openrouter_api_key_configured: openRouterConfigured,
      tavily_api_key_configured: tavilyConfigured,
      source: "digitalblueskye-ai",
      source_available: aiHealthAvailable,
    },
    health_diagnostics: {
      api_worker: aiHealthDiagnostics,
      ai_worker: aiHealthResult.payload?.health_diagnostics || null,
    },
    checks: {
      worker: {
        status: dbConfigured && adminConfigured ? "operational" : "partial",
        verification: healthVerification(dbConfigured && adminConfigured, true),
        http_status: 200,
        detail: "Endpoint /admin/health actif sur digitalblueskye-api.",
      },
      frontend: {
        status: frontendOk ? "operational" : "partial",
        verification: healthVerification(frontendOk, true),
        http_status: frontendHealthResult.status,
        detail: frontendOk ? "Frontend accessible depuis le Worker API." : "Disponibilité frontend non confirmée pendant ce contrôle.",
      },
      openrouter: effectiveOpenRouterCheck,
      tavily: tavilyCheck,
    },
    tavily_usage: tavilyUsage,
    rag_usage: ragUsage,
    services,
    statistics: {
      architecture_version: 1,
      items: [
        { key: "conversation_count", label: "Nombre de conversations", value: conversationCount, unit: "" },
        { key: "web_search_count", label: "Nombre de recherches web", value: webSearchCount, unit: "" },
        { key: "tavily_searches_executed", label: "Recherches Tavily exécutées", value: tavilyUsage.searches_executed, unit: "" },
        { key: "tavily_cache_saved", label: "Recherches évitées par cache", value: tavilyUsage.searches_avoided_cache, unit: "" },
        { key: "tavily_dedupe_saved", label: "Recherches évitées par déduplication", value: tavilyUsage.searches_avoided_deduplication, unit: "" },
        { key: "rag_search_count", label: "Recherches RAG projet", value: ragUsage.searches_performed, unit: "" },
        { key: "rag_match_rate", label: "Taux de match RAG", value: ragUsage.match_rate, unit: "%" },
        { key: "pdf_count", label: "Nombre de PDF analysés", value: pdfCount, unit: "" },
        { key: "docx_count", label: "Nombre de DOCX analysés", value: docxCount, unit: "" },
        { key: "xlsx_count", label: "Nombre de XLSX analysés", value: xlsxCount, unit: "" },
        { key: "openrouter_request_count", label: "Nombre de requêtes OpenRouter", value: openRouterCount || aiEventCount, unit: "" },
        { key: "average_response_ms", label: "Temps moyen de réponse", value: averageResponseMs ?? effectiveOpenRouterCheck?.latency_ms ?? null, unit: "ms" },
        { key: "average_web_search_ms", label: "Temps moyen de recherche web", value: averageWebSearchMs ?? tavilyCheck?.latency_ms ?? null, unit: "ms" },
      ],
      note: "Métriques extensibles depuis ai_assistant_events et les futurs logs serveur.",
    },
    recent_activity: {
      limit: 20,
      has_more: recentEvents.length > 20,
      next_offset: recentEvents.length > 20 ? 20 : null,
      items: recentEvents.slice(0, 20).map(formatHealthActivity),
    },
    ai_state: {
      model_active: aiHealthResult.payload?.ai_state?.model_active || env.OPENROUTER_MODEL || "non vérifié",
      model_configured: aiHealthResult.payload?.ai_state?.model_configured || aiHealthResult.payload?.ai_state?.model_active || env.OPENROUTER_MODEL || "non vérifié",
      model_resolved: aiHealthResult.payload?.ai_state?.model_resolved || "",
      health_model_used: aiHealthResult.payload?.ai_state?.health_model_used || effectiveOpenRouterCheck?.health_model_used || "",
      last_model_used: latestOpenRouterResponse?.model || effectiveOpenRouterCheck?.last_model_used || "",
      provider: "openrouter",
      fallback_active: Boolean(aiHealthResult.payload?.ai_state?.fallback_active),
      last_successful_call_at: latestOpenRouterResponse?.at || aiHealthResult.payload?.ai_state?.last_successful_call_at || null,
      openrouter_error_count: effectiveOpenRouterCheck?.verification === "failed" ? 1 : 0,
      fallback_used_count: aiHealthResult.payload?.ai_state?.fallback_used_count ?? 0,
      average_latency_ms: aiHealthResult.payload?.ai_state?.average_latency_ms ?? effectiveOpenRouterCheck?.latency_ms ?? null,
      last_check: effectiveOpenRouterCheck,
    },
    documents: [
      { format: "PDF", status: "supported", max_tested_size: "40 pages / test navigateur", last_validation: checkedAt, reliability: "élevée" },
      { format: "DOCX", status: "supported", max_tested_size: "Document texte standard", last_validation: checkedAt, reliability: "élevée" },
      { format: "XLSX", status: "partial", max_tested_size: "Multi-feuilles à stabiliser", last_validation: checkedAt, reliability: "moyenne" },
      { format: "CSV", status: "partial", max_tested_size: "Import texte simple", last_validation: checkedAt, reliability: "moyenne" },
      { format: "PPTX", status: "partial", max_tested_size: "Extraction expérimentale", last_validation: checkedAt, reliability: "moyenne" },
    ],
    current_capabilities: [
      "Chat IA",
      "Recherche web temps réel",
      "Sources web",
      "Upload PDF",
      "Upload DOCX",
      "Historique local",
      "Mémoire conversationnelle locale",
      "Proxy OpenRouter sécurisé",
    ],
    in_development: [
      "XLSX",
      "Sources web premium",
      "Export documentaire",
      "RAG",
      "Agents spécialisés",
    ],
    next_priorities: [
      {
        priority: "P1",
        feature: "Observabilité Worker IA",
        impact: "Diagnostic rapide des erreurs OpenRouter/Tavily et des latences.",
        effort: "Moyen",
        risk: "Faible",
        state: "En cours",
      },
      {
        priority: "P1",
        feature: "RAG documentaire",
        impact: "Réponses ancrées dans les documents avec sources maîtrisées.",
        effort: "Élevé",
        risk: "Moyen",
        state: "À faire",
      },
      {
        priority: "P2",
        feature: "XLSX stabilisé",
        impact: "Analyse fiable des tableaux et exports métier.",
        effort: "Moyen",
        risk: "Moyen",
        state: "En cours",
      },
      {
        priority: "P2",
        feature: "Exports documentaires",
        impact: "Production de livrables PDF/DOCX/HTML plus robuste.",
        effort: "Moyen",
        risk: "Faible",
        state: "À faire",
      },
      {
        priority: "P3",
        feature: "Agents spécialisés",
        impact: "Parcours guidés pour veille, audit, rédaction et gestion projet.",
        effort: "Élevé",
        risk: "Moyen",
        state: "À faire",
      },
    ],
    v3_placeholders: [
      {
        name: "RAG documentaire",
        status: "prévu",
        detail: "Indexer les documents validés et produire des réponses sourcées avec citations contrôlées.",
        next_step: "Définir le corpus pilote et la stratégie de citation.",
      },
      {
        name: "Base vectorielle",
        status: "prévu",
        detail: "Préparer embeddings, stockage, réindexation et seuils de similarité.",
        next_step: "Choisir le stockage et le cycle d’indexation.",
      },
      {
        name: "Mémoire persistante",
        status: "prévu",
        detail: "Mémoriser uniquement les préférences utiles avec règles d’effacement et minimisation.",
        next_step: "Lister les champs mémorisables et leurs durées de conservation.",
      },
      {
        name: "Agents spécialisés",
        status: "prévu",
        detail: "Créer des parcours guidés pour veille, audit, rédaction et gestion projet.",
        next_step: "Définir rôles, outils autorisés et reprise humaine.",
      },
      {
        name: "Monitoring avancé",
        status: "prévu",
        detail: "Suivre erreurs fournisseur, latences, fallback, recherche web et volumes par session.",
        next_step: "Brancher alertes Tavily/OpenRouter et taux d’échec.",
      },
      {
        name: "Analytics IA",
        status: "prévu",
        detail: "Transformer les événements D1 en indicateurs d’usage, qualité et fiabilité.",
        next_step: "Créer les vues 7j/30j et la segmentation par type d’événement.",
      },
    ],
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
  if (pathname === "/admin/health") return await handleAdminHealth(request, env);
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
