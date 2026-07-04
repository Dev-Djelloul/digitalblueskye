/**
 * TODO(securite) — Durcissement de l'acces au chatbot IA.
 * Le front (scripts/dbs-auth.js) n'applique qu'un gate UX : il peut envoyer un
 * bloc `user: { userId, email, authClientState: 'local-dev' }` dans le payload,
 * mais cette information est INDICATIVE et forgeable. Ce Worker ne doit PAS la
 * traiter comme une preuve d'identite. Prochaine etape : verifier une vraie
 * preuve cote serveur (Cloudflare Access / JWT signe verifie ici), ajouter du
 * rate limiting IP+utilisateur et des quotas. Plan detaille dans
 * docs/CHATBOT_AUTH_SECURITY.md.
 *
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

import { computeProjectPlan } from './aiProjectManager.js';
import { buildMaturityDashboardPayload } from './maturityEngine.js';
import { computeServiceHealthScore } from './serviceHealth.js';
import { BUILD_INFO } from './build-info.js';
import { handleAuthRoutes, handleAiChat, authOptionsResponse, isAuthOrAiPath } from './auth.js';

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
const STATIC_ALLOWED_ORIGINS = ["https://digitalblueskye.com"];
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

// Compte les lignes correspondant au premier event_type de la liste qui
// produit un resultat non nul, dans l'ordre fourni (le premier type est le
// signal le plus authoritaire/precis ; les suivants ne servent que de
// repli si renommage ou variation d'instrumentation). Garantit qu'un
// compteur fondamental n'affiche jamais 0 quand au moins un des event_type
// listes existe reellement dans les rows — sans sur-compter (pas d'union/
// somme, qui doublerait le compte si plusieurs event_type co-occurrent pour
// une meme analyse).
function countByPreferredEventType(rows, eventTypes) {
  const eventRows = Array.isArray(rows) ? rows : [];
  for (const type of eventTypes) {
    const count = eventRows.filter((row) => row.event_type === type).length;
    if (count > 0) return count;
  }
  return 0;
}

function parseEventMeta(row) {
  if (!row?.meta) return {};
  // meta peut arriver deja comme objet (selon le chemin d'appel) ou comme
  // chaine JSON (cas normal depuis la colonne D1 TEXT) — on gere les deux.
  if (typeof row.meta === "object") return row.meta;
  try {
    const parsed = JSON.parse(row.meta);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

// Source unique des event_type Tavily reconnus — utilisee a la fois pour le
// filtrage SQL (IN clause) et les filtres JS, afin d'eviter toute liste
// dupliquee/desynchronisee entre les differentes fonctions de stats.
const WEB_SEARCH_EVENT_TYPES = new Set([
  "web_search",
  "web_search_requested",
  "web_search_success",
  "web_search_error",
  "web_search_cached",
  "web_search_deduplicated",
  "web_search_skipped",
]);

function isWebSearchEventType(eventType) {
  return WEB_SEARCH_EVENT_TYPES.has(String(eventType || "").trim().toLowerCase());
}

// Statut humain normalise pour un event_type Tavily — evite de dupliquer la
// meme cascade de comparaisons dans chaque fonction qui affiche un "dernier
// statut" Tavily.
function getWebSearchStatus(eventType) {
  const type = String(eventType || "").trim().toLowerCase();
  if (type === "web_search_success") return "success";
  if (type === "web_search_error") return "error";
  if (type === "web_search_cached") return "cached";
  if (type === "web_search_deduplicated") return "deduplicated";
  if (type === "web_search_skipped") return "skipped";
  if (type === "web_search_requested" || type === "web_search") return "requested";
  return "unknown";
}

function webSearchEventTypesSqlList() {
  return Array.from(WEB_SEARCH_EVENT_TYPES).map((type) => `'${type}'`).join(", ");
}

// D1/JSON peut renvoyer un booleen comme true, 1, "1" ou "true" selon le
// chemin de serialisation (json_extract SQLite renvoie parfois un entier
// pour un booleen). On accepte toutes ces formes equivalentes a "vrai".
function isTruthyFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
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

function extractAffordableTokensFromText(value) {
  const match = String(value || "").match(/can\s+only\s+afford\s+(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

// Statistiques par modele a partir des nouveaux evenements du Model Router
// (cloudflare/modelRouter.js) : openrouter_model_attempt/success/failed,
// openrouter_rate_limit/credit_limit, openrouter_retry_reduced_tokens,
// openrouter_all_models_failed. N'affecte aucun des champs existants
// (latestOpenRouterResponseInfo, effectiveOpenRouterCheck, etc.).
function buildOpenRouterModelStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const attempts = eventRows.filter((row) => row.event_type === "openrouter_model_attempt");
  const successes = eventRows.filter((row) => row.event_type === "openrouter_model_success");
  const failures = eventRows.filter((row) => row.event_type === "openrouter_model_failed");
  const rateLimitEvents = eventRows.filter((row) => row.event_type === "openrouter_rate_limit");
  const creditLimitEvents = eventRows.filter((row) => row.event_type === "openrouter_credit_limit");
  const retryEvents = eventRows.filter((row) => row.event_type === "openrouter_retry_reduced_tokens");
  const allFailedEvents = eventRows.filter((row) => row.event_type === "openrouter_all_models_failed");
  const creditExhaustedEvents = allFailedEvents.filter((row) => isTruthyFlag(parseEventMeta(row).credit_exhausted));

  // Second provider (cf. cloudflare/modelRouter.js, callCloudflareAiChat) :
  // n'apparait que quand OpenRouter a totalement echoue.
  const cloudflareAiAttempts = eventRows.filter((row) => row.event_type === "cloudflare_ai_attempt");
  const cloudflareAiSuccesses = eventRows.filter((row) => row.event_type === "cloudflare_ai_success");
  const cloudflareAiFailures = eventRows.filter((row) => row.event_type === "cloudflare_ai_failed");
  const providerFallbackEvents = eventRows.filter((row) => row.event_type === "provider_fallback_used");

  // rows sont triees created_at DESC : le premier match est donc le plus recent.
  const lastSuccess = successes[0] ? parseEventMeta(successes[0]) : null;
  const lastFailure = failures[0] ? parseEventMeta(failures[0]) : null;
  const lastCreditLimit = creditLimitEvents[0] ? parseEventMeta(creditLimitEvents[0]) : null;
  const lastAffordableTokens = lastCreditLimit
    ? (Number(lastCreditLimit.affordable_tokens) || extractAffordableTokensFromText(lastCreditLimit.upstream_error))
    : null;

  // Provider reellement utilise lors de la derniere reponse generee, tous
  // providers confondus (le plus recent entre un succes OpenRouter et un
  // succes Cloudflare AI).
  const lastCloudflareAiSuccess = cloudflareAiSuccesses[0] ? parseEventMeta(cloudflareAiSuccesses[0]) : null;
  const lastProviderUsed = (() => {
    const openRouterAt = successes[0]?.created_at || "";
    const cloudflareAiAt = cloudflareAiSuccesses[0]?.created_at || "";
    if (!openRouterAt && !cloudflareAiAt) return { provider: "", model: "", at: null };
    if (cloudflareAiAt && (!openRouterAt || cloudflareAiAt > openRouterAt)) {
      return { provider: "cloudflare_ai", model: lastCloudflareAiSuccess?.model || "", at: cloudflareAiAt };
    }
    return { provider: "openrouter", model: lastSuccess?.resolved_model || lastSuccess?.model || "", at: openRouterAt };
  })();

  const byModel = new Map();
  const touch = (model, provider) => {
    if (!model) return null;
    if (!byModel.has(model)) byModel.set(model, { model, provider: provider || "openrouter", attempts: 0, successes: 0, failures: 0 });
    return byModel.get(model);
  };
  attempts.forEach((row) => { const entry = touch(parseEventMeta(row).model, "openrouter"); if (entry) entry.attempts += 1; });
  successes.forEach((row) => { const entry = touch(parseEventMeta(row).model, "openrouter"); if (entry) entry.successes += 1; });
  failures.forEach((row) => { const entry = touch(parseEventMeta(row).model, "openrouter"); if (entry) entry.failures += 1; });
  cloudflareAiAttempts.forEach((row) => { const entry = touch(parseEventMeta(row).model, "cloudflare_ai"); if (entry) entry.attempts += 1; });
  cloudflareAiSuccesses.forEach((row) => { const entry = touch(parseEventMeta(row).model, "cloudflare_ai"); if (entry) entry.successes += 1; });
  cloudflareAiFailures.forEach((row) => { const entry = touch(parseEventMeta(row).model, "cloudflare_ai"); if (entry) entry.failures += 1; });

  const successRateByModel = Array.from(byModel.values())
    .map((entry) => ({ ...entry, success_rate: entry.attempts ? Math.round((entry.successes / entry.attempts) * 1000) / 10 : 0 }))
    .sort((a, b) => b.attempts - a.attempts);

  // Modele de secours le plus fiable : on exclut le modele principal (celui
  // du dernier succes le plus frequent en 1ere position) et openrouter/auto,
  // pour ne retenir qu'un vrai fallback parmi les modeles secondaires testes.
  const primaryModelGuess = successRateByModel[0]?.model || null;
  const mostReliableFallback = successRateByModel
    .filter((entry) => entry.model !== primaryModelGuess && entry.model !== "openrouter/auto" && entry.attempts > 0)
    .sort((a, b) => (b.success_rate - a.success_rate) || (b.attempts - a.attempts))[0] || null;

  return {
    last_successful_model: lastSuccess?.resolved_model || lastSuccess?.model || "",
    last_successful_at: successes[0]?.created_at || null,
    last_blocked_model: lastFailure?.model || "",
    last_blocked_error_type: lastFailure?.error_type || "",
    last_blocked_at: failures[0]?.created_at || null,
    retries_count: retryEvents.length + failures.length,
    success_rate_by_model: successRateByModel,
    rate_limit_count: rateLimitEvents.length,
    credit_limit_count: creditLimitEvents.length,
    credit_exhausted_count: creditExhaustedEvents.length,
    openrouter_credit_exhausted: creditExhaustedEvents.length > 0,
    last_credit_limit_detail: lastCreditLimit
      ? {
          model: lastCreditLimit.model || "",
          at: creditLimitEvents[0]?.created_at || null,
          status_code: lastCreditLimit.status_code ?? null,
          tokens_requested: lastCreditLimit.tokens_requested ?? null,
          affordable_tokens: lastAffordableTokens,
          upstream_error: lastCreditLimit.upstream_error || "",
        }
      : null,
    all_models_failed_count: allFailedEvents.length,
    most_reliable_fallback_model: mostReliableFallback?.model || "",
    // Provider reellement utilise (OpenRouter ou Cloudflare AI en secours).
    last_provider_used: lastProviderUsed.provider,
    last_provider_model: lastProviderUsed.model,
    last_provider_used_at: lastProviderUsed.at,
    provider_fallback_count: providerFallbackEvents.length,
    cloudflare_ai_attempts: cloudflareAiAttempts.length,
    cloudflare_ai_successes: cloudflareAiSuccesses.length,
    cloudflare_ai_failures: cloudflareAiFailures.length,
    // Detail brut de la derniere erreur Cloudflare AI (name/message/stack
    // tronque/cause), pour diagnostiquer sans devoir lire les logs Worker.
    last_cloudflare_ai_error: cloudflareAiFailures[0]
      ? {
          model: parseEventMeta(cloudflareAiFailures[0]).model || "",
          at: cloudflareAiFailures[0].created_at || null,
          error_type: parseEventMeta(cloudflareAiFailures[0]).error_type || "",
          upstream_error: parseEventMeta(cloudflareAiFailures[0]).upstream_error || "",
          error_detail: parseEventMeta(cloudflareAiFailures[0]).error_detail || null,
        }
      : null,
  };
}

// Lot 6 — Dynamic Model Selection (cf. cloudflare/modelRouter.js) a partir
// des evenements model_tier_requested / model_tier_used. N'affecte pas les
// agregations existantes (success_rate_by_model reste par modele, ceci est
// par tier).
function buildModelTierStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const requested = eventRows.filter((row) => row.event_type === "model_tier_requested");
  const used = eventRows.filter((row) => row.event_type === "model_tier_used");

  const lastRequestedMeta = requested[0] ? parseEventMeta(requested[0]) : null;
  const lastUsedMeta = used[0] ? parseEventMeta(used[0]) : null;

  const byTier = new Map();
  used.forEach((row) => {
    const meta = parseEventMeta(row);
    const tier = meta.tier_requested || "balanced";
    if (!byTier.has(tier)) byTier.set(tier, { tier, total: 0, success: 0 });
    const entry = byTier.get(tier);
    entry.total += 1;
    if (meta.success) entry.success += 1;
  });

  const successRateByTier = Array.from(byTier.values())
    .map((entry) => ({ ...entry, success_rate: entry.total ? Math.round((entry.success / entry.total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total);

  return {
    last_tier_requested: lastRequestedMeta?.tier || "",
    last_tier_requested_at: requested[0]?.created_at || null,
    last_tier_used: lastUsedMeta?.tier_used || "",
    last_tier_used_provider: lastUsedMeta?.provider || "",
    last_tier_used_model: lastUsedMeta?.model || "",
    last_tier_used_success: lastUsedMeta ? Boolean(lastUsedMeta.success) : null,
    last_tier_used_at: used[0]?.created_at || null,
    success_rate_by_tier: successRateByTier,
  };
}

// Lot 7 (+ Lot 7.1 Auto-Improver) — Response Quality Controller (cf.
// cloudflare/responseQualityController.js) a partir des evenements
// response_quality_analyzed / _repaired / _retry / _retry_failed /
// _improve_requested / _improved / _improve_failed / _final_sent.
export function buildResponseQualityStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const analyzed = eventRows.filter((row) => row.event_type === "response_quality_analyzed");
  const repaired = eventRows.filter((row) => row.event_type === "response_quality_repaired");
  const retried = eventRows.filter((row) => row.event_type === "response_quality_retry");
  const retryFailed = eventRows.filter((row) => row.event_type === "response_quality_retry_failed");
  const improveRequested = eventRows.filter((row) => row.event_type === "response_quality_improve_requested");
  const improved = eventRows.filter((row) => row.event_type === "response_quality_improved");
  const improveFailed = eventRows.filter((row) => row.event_type === "response_quality_improve_failed");
  // response_quality_sent : nom legacy conserve pour compatibilite si des
  // evenements anterieurs au Lot 7.1 existent encore en base.
  const sent = eventRows.filter((row) => row.event_type === "response_quality_final_sent" || row.event_type === "response_quality_sent");

  const lastSentMeta = sent[0] ? parseEventMeta(sent[0]) : null;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentSent = sent.filter((row) => {
    const ts = Date.parse(row.created_at || "");
    return Number.isFinite(ts) && ts >= dayAgo;
  });

  const scores = sent.map((row) => Number(parseEventMeta(row).score)).filter((value) => Number.isFinite(value));
  const averageScore = scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null;

  // citations_present (booleen) journalise dans response_quality_final_sent
  // depuis ce lot (cf. worker-openrouter.js) — deja calcule par
  // analyzeCitations() au moment du scoring RQC, jamais recalcule ici.
  // Evenements anterieurs a ce lot : champ absent (undefined), exclus du
  // denominateur plutot que comptes comme "sans citation" — sinon le taux
  // serait artificiellement tire vers le bas par l'historique pre-instrumentation.
  const citationFlagged = sent
    .map((row) => parseEventMeta(row).citations_present)
    .filter((value) => typeof value === "boolean");
  const citationRate = citationFlagged.length
    ? Math.round((citationFlagged.filter(Boolean).length / citationFlagged.length) * 1000) / 10
    : null;
  const recentScores = recentSent.map((row) => Number(parseEventMeta(row).score)).filter((value) => Number.isFinite(value));
  const recentAverageScore = recentScores.length
    ? Math.round((recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length) * 10) / 10
    : null;

  const improveGains = improved
    .map((row) => Number(parseEventMeta(row).score_gain))
    .filter((value) => Number.isFinite(value));
  const averageImproveGain = improveGains.length
    ? Math.round((improveGains.reduce((sum, value) => sum + value, 0) / improveGains.length) * 10) / 10
    : null;
  const successfulImprovements = improved.filter((row) => Number(parseEventMeta(row).score_gain) > 0).length;

  const issueCounts = new Map();
  sent.forEach((row) => {
    const issues = parseEventMeta(row).issues;
    if (!Array.isArray(issues)) return;
    issues.forEach((issue) => issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1));
  });
  const topIssues = Array.from(issueCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    last_score: lastSentMeta?.score ?? lastSentMeta?.score_after ?? null,
    last_score_before: lastSentMeta?.score_before ?? null,
    last_score_after: lastSentMeta?.score_after ?? lastSentMeta?.score ?? null,
    last_grade: lastSentMeta?.grade || "",
    last_action: lastSentMeta?.action || "",
    last_at: sent[0]?.created_at || null,
    analyzed_count: analyzed.length,
    repaired_count: repaired.length,
    retry_count: retried.length,
    retry_failed_count: retryFailed.length,
    improve_requested_count: improveRequested.length,
    improved_count: improved.length,
    improve_failed_count: improveFailed.length,
    successful_improvements_count: successfulImprovements,
    average_improve_gain: averageImproveGain,
    average_score: averageScore,
    recent_24h_count: recentSent.length,
    recent_24h_average_score: recentAverageScore,
    citation_rate: citationRate,
    citation_sample_size: citationFlagged.length,
    status: !sent.length
      ? "unknown"
      : ((recentAverageScore ?? averageScore ?? 0) >= 80 ? "operational" : ((recentAverageScore ?? averageScore ?? 0) >= 60 ? "partial" : "degraded")),
    top_issues: topIssues,
  };
}

// Completion Guard (cf. cloudflare/completionGuard.js) a partir des
// evenements completion_truncated / completion_continued /
// completion_continuation_failed / completion_structure_closed, deja logues
// par onRouterEvent() dans worker-openrouter.js (aucun nouvel event_type
// requis, aucune table ajoutee). Meme pattern que les autres agregateurs
// planners : une metrique sans donnee retourne null, jamais une valeur
// simulee.
export function buildCompletionGuardStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const truncated = eventRows.filter((row) => row.event_type === "completion_truncated");
  const continued = eventRows.filter((row) => row.event_type === "completion_continued");
  const continuationFailed = eventRows.filter((row) => row.event_type === "completion_continuation_failed");
  const structureClosed = eventRows.filter((row) => row.event_type === "completion_structure_closed");

  // rows triees created_at DESC : premier = plus recent.
  const lastEvent = [...truncated, ...continued, ...continuationFailed, ...structureClosed]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  const lastMeta = lastEvent ? parseEventMeta(lastEvent) : null;

  const continuationCounts = continued
    .map((row) => Number(parseEventMeta(row).continuations))
    .filter((value) => Number.isFinite(value));
  const averageContinuations = continuationCounts.length
    ? Math.round((continuationCounts.reduce((sum, value) => sum + value, 0) / continuationCounts.length) * 10) / 10
    : null;

  const totalSignals = truncated.length + continued.length + continuationFailed.length + structureClosed.length;

  return {
    truncated_count: truncated.length,
    continued_count: continued.length,
    continuation_failed_count: continuationFailed.length,
    structure_closed_count: structureClosed.length,
    average_continuations: averageContinuations,
    last_event_type: lastEvent?.event_type || "",
    last_at: lastEvent?.created_at || null,
    last_still_truncated: lastMeta ? Boolean(lastMeta.still_truncated) : null,
    // signal absent (pas d'erreur) si aucun event_type completion_* n'a
    // encore ete produit, distinct d'un statut "actif" base sur un volume reel.
    status: totalSignals === 0 ? "signal absent" : (continuationFailed.length > 0 ? "erreur" : "actif"),
  };
}

// Statistiques Prompt Orchestrator (cf. cloudflare/promptOrchestrator.js) a
// partir des evenements prompt_intent_detected / prompt_capabilities_planned /
// prompt_profile_used / prompt_orchestrator_error. Aucun impact sur les autres
// agregations.
export function buildPromptOrchestratorStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const intents = eventRows.filter((row) => row.event_type === "prompt_intent_detected");
  const profiles = eventRows.filter((row) => row.event_type === "prompt_profile_used");
  const errors = eventRows.filter((row) => row.event_type === "prompt_orchestrator_error");

  // rows triees created_at DESC : premier = plus recent.
  const lastIntentMeta = intents[0] ? parseEventMeta(intents[0]) : null;

  const countBy = (rowsList, key) => {
    const map = new Map();
    rowsList.forEach((row) => {
      const value = parseEventMeta(row)[key] || row.event_value || "";
      if (!value) return;
      map.set(value, (map.get(value) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };

  const total = intents.length;
  const errorRate = total + errors.length > 0
    ? Math.round((errors.length / (total + errors.length)) * 1000) / 10
    : 0;

  return {
    intents_detected: total,
    error_count: errors.length,
    error_rate: errorRate,
    last_intent: lastIntentMeta?.primaryIntent || "",
    last_profile: lastIntentMeta?.promptProfile || "",
    last_expected_format: lastIntentMeta?.expectedFormat || "",
    last_complexity: lastIntentMeta?.complexity || "",
    last_needs_rag: lastIntentMeta ? Boolean(lastIntentMeta.needsRag) : null,
    last_needs_web: lastIntentMeta ? Boolean(lastIntentMeta.needsWeb) : null,
    last_model_tier: lastIntentMeta?.preferredModelTier || "",
    last_max_tokens_hint: lastIntentMeta?.maxTokensHint ?? null,
    last_confidence: lastIntentMeta?.confidence ?? null,
    last_at: intents[0]?.created_at || null,
    top_intents: countBy(intents, "primaryIntent").slice(0, 6),
    top_profiles: countBy(profiles, "promptProfile").slice(0, 6),
  };
}

// Statistiques Capability Planner (cf. cloudflare/capabilityPlanner.js, Lot
// 8) a partir des evenements capability_detected / capability_plan_created /
// capability_pipeline_built / capability_error. Meme pattern que
// buildPromptOrchestratorStatsFromEvents — aucun impact sur les autres
// agregations.
export function buildCapabilityPlannerStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const detections = eventRows.filter((row) => row.event_type === "capability_detected");
  const plans = eventRows.filter((row) => row.event_type === "capability_plan_created");
  const pipelines = eventRows.filter((row) => row.event_type === "capability_pipeline_built");
  const errors = eventRows.filter((row) => row.event_type === "capability_error");

  // rows triees created_at DESC : premier = plus recent. Les 3 evenements
  // d'une meme requete partagent le meme objet meta (cf. worker-openrouter.js),
  // donc n'importe lequel des trois donne la derniere analyse complete.
  const lastMeta = detections[0] ? parseEventMeta(detections[0]) : (plans[0] ? parseEventMeta(plans[0]) : null);

  const countBy = (rowsList, key) => {
    const map = new Map();
    rowsList.forEach((row) => {
      const value = parseEventMeta(row)[key] || row.event_value || "";
      if (!value) return;
      map.set(value, (map.get(value) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };

  // Repartition des capacites detectees (needsRag/needsWeb/needsTable/...) —
  // compte, pour chaque requete analysee, combien de capacites "vraies" ont
  // ete detectees, regroupees par capacite individuelle.
  const CAPABILITY_KEYS = [
    "needsRag", "needsWeb", "needsTable", "needsSources", "needsMarkdown",
    "needsExport", "needsLongAnswer",
  ];
  const capabilityBreakdown = CAPABILITY_KEYS.map((key) => ({
    name: key,
    count: detections.filter((row) => parseEventMeta(row)[key] === true).length,
  })).sort((a, b) => b.count - a.count);

  const total = detections.length;
  const errorRate = total + errors.length > 0
    ? Math.round((errors.length / (total + errors.length)) * 1000) / 10
    : 0;
  // analyses_count : capability_detected (signal primaire) avec repli sur
  // capability_plan_created si le premier est absent — jamais une somme des
  // deux, qui doublerait le compte puisque les 3 evenements partagent la
  // meme analyse (cf. commentaire ci-dessus).
  const analysesCount = countByPreferredEventType(eventRows, ["capability_detected", "capability_plan_created"]);

  return {
    analyses_count: analysesCount,
    error_count: errors.length,
    error_rate: errorRate,
    last_complexity: lastMeta?.complexity || "",
    last_pipeline: Array.isArray(lastMeta?.pipeline) ? lastMeta.pipeline : (pipelines[0] ? String(pipelines[0].event_value || "").split(" > ") : []),
    last_model_tier: lastMeta?.preferredModelTier || "",
    last_max_tokens: lastMeta?.preferredMaxTokens ?? null,
    last_estimated_latency_ms: lastMeta?.estimatedLatency ?? null,
    last_estimated_cost: lastMeta?.estimatedCost ?? null,
    last_expected_answer_length: lastMeta?.expectedAnswerLength || "",
    last_confidence: lastMeta?.confidence ?? null,
    last_at: detections[0]?.created_at || null,
    top_tiers: countBy(plans, "preferredModelTier").slice(0, 6),
    capability_breakdown: capabilityBreakdown,
  };
}

// Statistiques Source Planner / Evidence Planner (cf.
// cloudflare/sourcePlanner.js, Lot 9) a partir des evenements
// source_evidence_detected / source_plan_created / source_policy_built /
// source_web_forced / source_rag_forced / source_clarification_required /
// source_planner_error. Meme pattern que buildCapabilityPlannerStatsFromEvents.
export function buildSourcePlannerStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const detections = eventRows.filter((row) => row.event_type === "source_evidence_detected");
  const plans = eventRows.filter((row) => row.event_type === "source_plan_created");
  const webForced = eventRows.filter((row) => row.event_type === "source_web_forced");
  const ragForced = eventRows.filter((row) => row.event_type === "source_rag_forced");
  const clarifications = eventRows.filter((row) => row.event_type === "source_clarification_required");
  const errors = eventRows.filter((row) => row.event_type === "source_planner_error");

  // rows triees created_at DESC : premier = plus recent.
  const lastMeta = detections[0] ? parseEventMeta(detections[0]) : (plans[0] ? parseEventMeta(plans[0]) : null);

  const countBy = (rowsList, key) => {
    const map = new Map();
    rowsList.forEach((row) => {
      const value = parseEventMeta(row)[key] || row.event_value || "";
      if (!value) return;
      map.set(value, (map.get(value) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };

  const topReasons = (() => {
    const map = new Map();
    detections.forEach((row) => {
      const reasons = parseEventMeta(row).reasons || {};
      Object.values(reasons).forEach((list) => {
        (Array.isArray(list) ? list : []).forEach((reason) => {
          map.set(reason, (map.get(reason) || 0) + 1);
        });
      });
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  })();

  const total = detections.length;
  const errorRate = total + errors.length > 0
    ? Math.round((errors.length / (total + errors.length)) * 1000) / 10
    : 0;
  // analyses_count : source_evidence_detected (signal primaire) avec repli
  // sur source_plan_created si le premier est absent — meme logique que
  // buildCapabilityPlannerStatsFromEvents (pas de sur-comptage par somme).
  const analysesCount = countByPreferredEventType(eventRows, ["source_evidence_detected", "source_plan_created"]);

  return {
    analyses_count: analysesCount,
    error_count: errors.length,
    error_rate: errorRate,
    last_evidence_need: lastMeta?.evidenceNeed || "",
    last_risk_level: lastMeta?.riskLevel || "",
    last_source_requirement: lastMeta?.sourceRequirement || "",
    last_use_web: lastMeta ? Boolean(lastMeta.useWeb) : null,
    last_use_rag: lastMeta ? Boolean(lastMeta.useRag) : null,
    last_force_web: lastMeta ? Boolean(lastMeta.forceWeb) : null,
    last_force_rag: lastMeta ? Boolean(lastMeta.forceRag) : null,
    last_require_citations: lastMeta ? Boolean(lastMeta.requireCitations) : null,
    last_forbid_unsupported_numbers: lastMeta ? Boolean(lastMeta.forbidUnsupportedNumbers) : null,
    last_fallback_behavior: lastMeta?.fallbackBehavior || "",
    last_confidence: lastMeta?.confidence ?? null,
    last_at: detections[0]?.created_at || null,
    web_forced_count: webForced.length,
    rag_forced_count: ragForced.length,
    clarification_required_count: clarifications.length,
    top_reasons: topReasons,
    evidence_need_breakdown: countBy(detections, "evidenceNeed"),
    risk_level_breakdown: countBy(detections, "riskLevel"),
  };
}

// Statistiques Execution Planner (cf. cloudflare/executionPlanner.js, Lot
// 10) a partir des evenements execution_intent_built / execution_plan_resolved
// / execution_policy_built / execution_plan_applied / execution_planner_error.
// Meme pattern que buildCapabilityPlannerStatsFromEvents/buildSourcePlannerStatsFromEvents.
export function buildExecutionPlannerStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const intents = eventRows.filter((row) => row.event_type === "execution_intent_built");
  const resolved = eventRows.filter((row) => row.event_type === "execution_plan_resolved");
  const applied = eventRows.filter((row) => row.event_type === "execution_plan_applied");
  const errors = eventRows.filter((row) => row.event_type === "execution_planner_error");

  // rows triees created_at DESC : premier = plus recent.
  const lastMeta = intents[0] ? parseEventMeta(intents[0]) : (resolved[0] ? parseEventMeta(resolved[0]) : null);

  const countBy = (rowsList, key) => {
    const map = new Map();
    rowsList.forEach((row) => {
      const value = parseEventMeta(row)[key] || row.event_value || "";
      if (!value) return;
      map.set(value, (map.get(value) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };

  const topReasons = (() => {
    const map = new Map();
    intents.forEach((row) => {
      const reasons = parseEventMeta(row).reasons;
      if (Array.isArray(reasons)) {
        reasons.forEach((reason) => map.set(reason, (map.get(reason) || 0) + 1));
      } else if (reasons && typeof reasons === "object") {
        Object.values(reasons).forEach((list) => {
          (Array.isArray(list) ? list : []).forEach((reason) => map.set(reason, (map.get(reason) || 0) + 1));
        });
      }
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  })();

  const total = intents.length;
  const errorRate = total + errors.length > 0
    ? Math.round((errors.length / (total + errors.length)) * 1000) / 10
    : 0;
  // BUG CORRIGE : plans_created_count lisait `total` = intents.length =
  // count(execution_intent_built), pas le plan reellement cree
  // (`resolved` = count(execution_plan_resolved) etait calcule plus haut
  // mais jamais utilise). error_rate/breakdowns restent bases sur les
  // intents (etape amont, seule porteuse des metadonnees de repartition).
  const plansCreatedCount = resolved.length;

  return {
    plans_created_count: plansCreatedCount,
    error_count: errors.length,
    error_rate: errorRate,
    last_primary_goal: lastMeta?.primaryGoal || "",
    last_answer_mode: lastMeta?.answerMode || "",
    last_evidence_mode: lastMeta?.evidenceMode || "",
    last_model_mode: lastMeta?.modelMode || "",
    last_output_mode: lastMeta?.outputMode || "",
    last_risk_level: lastMeta?.riskLevel || "",
    last_complexity: lastMeta?.complexity || "",
    last_pipeline: Array.isArray(lastMeta?.pipeline) ? lastMeta.pipeline : [],
    last_model_tier: lastMeta?.preferredModelTier || "",
    last_max_tokens: lastMeta?.preferredMaxTokens ?? null,
    last_max_continuations: lastMeta?.maxContinuations ?? null,
    last_rqc_strictness: lastMeta?.rqcStrictness || "",
    last_use_web: lastMeta ? Boolean(lastMeta.useWeb) : null,
    last_use_rag: lastMeta ? Boolean(lastMeta.useRag) : null,
    last_require_citations: lastMeta ? Boolean(lastMeta.requireCitations) : null,
    last_fallback_behavior: lastMeta?.fallbackBehavior || "",
    last_confidence: lastMeta?.confidence ?? null,
    last_at: intents[0]?.created_at || null,
    applied_count: applied.length,
    top_reasons: topReasons,
    answer_mode_breakdown: countBy(intents, "answerMode"),
    evidence_mode_breakdown: countBy(intents, "evidenceMode"),
    model_mode_breakdown: countBy(intents, "modelMode"),
  };
}

// --- Agregats dedies au Tableau de bord admin ("dashboard") ---------------
// Les fonctions ci-dessous n'inventent aucune logique metier : elles
// recombinent les compteurs/evenements deja calcules ailleurs (Tavily, RAG,
// planners, model router, response quality) ou lisent directement
// ai_assistant_events, pour eviter toute valeur codee en dur cote admin/index.html.
// Convention commune : une metrique sans donnee retourne null/"non_mesure"
// (jamais une valeur simulee) — c'est a l'appelant (front) de l'afficher
// comme "non mesuré" / "aucune donnée récente".

function eventDayBuckets(rows, now = Date.now()) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const cutoffs = {
    today: todayStart.getTime(),
    last_24h: now - 24 * 60 * 60 * 1000,
    last_7d: now - 7 * 24 * 60 * 60 * 1000,
    last_30d: now - 30 * 24 * 60 * 60 * 1000,
  };
  const countSince = (cutoff) => eventRows.filter((row) => {
    const ts = Date.parse(row.created_at || "");
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
  return {
    today: countSince(cutoffs.today),
    last_24h: countSince(cutoffs.last_24h),
    last_7d: countSince(cutoffs.last_7d),
    last_30d: countSince(cutoffs.last_30d),
  };
}

// Fenetres temporelles reelles pour un compteur D1 (table/colonne created_at)
// quand on ne dispose pas deja des lignes en memoire (comments, contacts,
// consent_logs). Utilise firstCount() existant, donc memes garanties que les
// autres compteurs du fichier.
async function countSinceFromTable(env, table, cutoffIso, whereExtra = "") {
  const extra = whereExtra ? ` AND ${whereExtra}` : "";
  return firstCount(
    env,
    `SELECT COUNT(*) AS count FROM ${table} WHERE created_at >= ?${extra}`,
    cutoffIso
  );
}

async function buildDashboardKpisFromEvents(env, counts, aiEventsRows) {
  const now = Date.now();
  const todayIso = new Date(new Date(now).setHours(0, 0, 0, 0)).toISOString();
  const sevenDaysIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  let commentsToday = null;
  let commentsWeek = null;
  let contactsToday = null;
  let contactsWeek = null;
  let consentToday = null;
  let consentWeek = null;
  try {
    [commentsToday, commentsWeek, contactsToday, contactsWeek, consentToday, consentWeek] = await Promise.all([
      countSinceFromTable(env, "article_comments", todayIso),
      countSinceFromTable(env, "article_comments", sevenDaysIso),
      countSinceFromTable(env, "contact_messages", todayIso),
      countSinceFromTable(env, "contact_messages", sevenDaysIso),
      countSinceFromTable(env, "consent_logs", todayIso),
      countSinceFromTable(env, "consent_logs", sevenDaysIso),
    ]);
  } catch (error) {
    // Tables sans colonne created_at exploitable ou erreur D1 : on degrade
    // proprement vers "non mesure" plutot que de casser tout le dashboard.
    commentsToday = commentsWeek = contactsToday = contactsWeek = consentToday = consentWeek = null;
  }

  const aiBuckets = eventDayBuckets(aiEventsRows, now);

  return {
    comments: {
      total: Number(counts.comments_total || 0),
      pending: Number(counts.comments_pending || 0),
      approved: Number(counts.comments_approved || 0),
      today: commentsToday,
      last_7d: commentsWeek,
    },
    contacts: {
      total: Number(counts.contact_messages || 0),
      today: contactsToday,
      last_7d: contactsWeek,
    },
    consent_logs: {
      total: Number(counts.consent_logs || 0),
      today: consentToday,
      last_7d: consentWeek,
    },
    ai_assistant_events: {
      total: Number(counts.ai_assistant_events || 0),
      today: aiBuckets.today,
      last_24h: aiBuckets.last_24h,
      last_7d: aiBuckets.last_7d,
      last_30d: aiBuckets.last_30d,
    },
    conversations: {
      total: Number(counts.conversations_total || 0),
    },
  };
}

async function buildActivitySeriesFromEvents(env, rows) {
  const buckets = eventDayBuckets(rows, Date.now());
  let installedSinceAt = null;
  try {
    const row = await env.DB.prepare("SELECT MIN(created_at) AS value FROM ai_assistant_events").first();
    installedSinceAt = row?.value || null;
  } catch (error) {
    installedSinceAt = null;
  }
  return {
    today: buckets.today,
    last_24h: buckets.last_24h,
    last_7d: buckets.last_7d,
    last_30d: buckets.last_30d,
    since_installation: installedSinceAt ? { since: installedSinceAt, total_events: Array.isArray(rows) ? rows.length : 0 } : null,
  };
}

// Statut "non_mesure" explicite pour les services sans télémétrie serveur
// dédiée — remplace les anciens statuts littéraux ("operational"/"development"
// devinés) par une badge honnête plutôt qu'une valeur simulée.
const DASHBOARD_NO_TELEMETRY_SERVICES = new Set([
  "Mémoire conversationnelle",
  "Historique",
  "Agents spécialisés",
  "RAG documentaire",
]);

// event_type -> { successType, errorType, countKey } pour les services dont on
// dispose d'un signal direct dans ai_assistant_events.
const DASHBOARD_UPLOAD_SERVICE_SIGNALS = {
  "Upload PDF": { eventType: "pdf_uploaded", errorType: "pdf_upload_error" },
  "Upload DOCX": { eventType: "docx_uploaded", errorType: "docx_upload_error" },
  "Upload XLSX": { eventType: "xlsx_uploaded", errorType: "xlsx_upload_error" },
};

function computeServiceBadge({ successCount, errorCount, lastSuccessAt, lastErrorAt }) {
  if (!successCount && !errorCount) {
    return { status: "aucune_donnee_recente", detail: "Aucun événement récent pour ce service." };
  }
  const total = successCount + errorCount;
  const successRate = total ? Math.round((successCount / total) * 1000) / 10 : 0;
  const recentErrorIsLatest = lastErrorAt && (!lastSuccessAt || new Date(lastErrorAt) > new Date(lastSuccessAt));
  if (recentErrorIsLatest && successRate < 50) {
    return { status: "erreur", detail: `Taux de succès récent: ${successRate}%. Dernière erreur après le dernier succès.` };
  }
  if (successRate >= 90) {
    return { status: "operational", detail: `Taux de succès récent: ${successRate}%.` };
  }
  if (successRate >= 50) {
    return { status: "partiel", detail: `Taux de succès récent: ${successRate}%.` };
  }
  return { status: "degrade", detail: `Taux de succès récent: ${successRate}%.` };
}

// Recalcule, pour les services dont buildAdminHealthPayload() utilisait
// jusqu'ici un statut litteral, un statut/detail derive des evenements reels.
// `existingServices` (deja construit par buildAdminHealthPayload) est copie et
// seules les entrees concernees sont remplacees — aucune regression sur
// Netlify/Cloudflare Worker/OpenRouter/Tavily/Recherche web, deja calcules
// dynamiquement.
function buildServiceHealthFromEvents(existingServices, rows, checkedAt) {
  const eventRows = Array.isArray(rows) ? rows : [];
  return (Array.isArray(existingServices) ? existingServices : []).map((service) => {
    if (DASHBOARD_NO_TELEMETRY_SERVICES.has(service.name)) {
      return {
        ...service,
        status: "non_mesure",
        detail: "Aucune télémétrie serveur dédiée à ce jour pour ce service (fonctionnalité côté navigateur).",
        next_step: "Ajouter un événement D1 dédié si un suivi serveur devient nécessaire.",
        verification: "partial",
        verification_label: healthVerificationLabel("partial"),
        last_checked_at: checkedAt,
      };
    }
    const signal = DASHBOARD_UPLOAD_SERVICE_SIGNALS[service.name];
    if (signal) {
      const successRows = eventRows.filter((row) => row.event_type === signal.eventType);
      const errorRows = eventRows.filter((row) => row.event_type === signal.errorType);
      const badge = computeServiceBadge({
        successCount: successRows.length,
        errorCount: errorRows.length,
        lastSuccessAt: successRows[0]?.created_at || null,
        lastErrorAt: errorRows[0]?.created_at || null,
      });
      return {
        ...service,
        status: badge.status,
        detail: badge.detail,
        success_count: successRows.length,
        error_count: errorRows.length,
        last_success_at: successRows[0]?.created_at || null,
        last_error_at: errorRows[0]?.created_at || null,
        verification: errorRows.length ? "partial" : (successRows.length ? "verified" : "partial"),
        verification_label: healthVerificationLabel(errorRows.length ? "partial" : (successRows.length ? "verified" : "partial")),
        last_checked_at: checkedAt,
      };
    }
    return service;
  });
}

function buildModelUsageFromEvents(rows) {
  return {
    models: buildOpenRouterModelStatsFromEvents(rows),
    tiers: buildModelTierStatsFromEvents(rows),
  };
}

// Familles d'evenements connues pour porter un signal d'erreur — on derive la
// famille depuis le prefixe de event_type plutot que de maintenir une liste
// figee de noms, pour rester additif si de nouveaux event_type apparaissent.
const DASHBOARD_ERROR_FAMILIES = [
  { key: "model_router", prefixes: ["openrouter_"] },
  { key: "tavily", prefixes: ["web_search_"] },
  { key: "rag", prefixes: ["rag_"] },
  { key: "completion_guard", prefixes: ["completion_guard_", "completion_"] },
  { key: "response_quality", prefixes: ["response_quality_"] },
  { key: "prompt_orchestrator", prefixes: ["prompt_"] },
  { key: "capability_planner", prefixes: ["capability_"] },
  { key: "source_planner", prefixes: ["source_"] },
  { key: "execution_planner", prefixes: ["execution_"] },
];

function isErrorEventType(eventType) {
  const type = String(eventType || "").toLowerCase();
  return type.includes("error") || type.includes("failed");
}

function buildErrorStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const errorRows = eventRows.filter((row) => isErrorEventType(row.event_type));
  const families = DASHBOARD_ERROR_FAMILIES.map(({ key, prefixes }) => {
    const familyErrors = errorRows.filter((row) => prefixes.some((prefix) => String(row.event_type || "").startsWith(prefix)));
    return {
      family: key,
      error_count: familyErrors.length,
      last_error_at: familyErrors[0]?.created_at || null,
      last_error_type: familyErrors[0]?.event_type || null,
    };
  });
  return {
    total_error_count: errorRows.length,
    families,
    status: errorRows.length === 0 ? "aucune_donnee_recente" : "des_erreurs_recentes",
  };
}

// Statistiques Tool Planner (cf. cloudflare/toolPlanner.js, Lot 11) a partir
// des evenements tool_needs_detected / tool_plan_created / tool_policy_built
// / tool_planner_error. Meme pattern que buildExecutionPlannerStatsFromEvents.
export function buildToolPlannerStatsFromEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const detections = eventRows.filter((row) => row.event_type === "tool_needs_detected");
  const plans = eventRows.filter((row) => row.event_type === "tool_plan_created");
  const policies = eventRows.filter((row) => row.event_type === "tool_policy_built");
  const errors = eventRows.filter((row) => row.event_type === "tool_planner_error");

  // rows triees created_at DESC : premier = plus recent.
  const lastMeta = detections[0] ? parseEventMeta(detections[0]) : (plans[0] ? parseEventMeta(plans[0]) : null);

  const countToolUsage = (rowsList) => {
    const map = new Map();
    rowsList.forEach((row) => {
      const tools = parseEventMeta(row).toolsNeeded;
      (Array.isArray(tools) ? tools : []).forEach((tool) => map.set(tool, (map.get(tool) || 0) + 1));
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };

  const topReasons = (() => {
    const map = new Map();
    detections.forEach((row) => {
      const reasons = parseEventMeta(row).reasons;
      if (reasons && typeof reasons === "object") {
        Object.values(reasons).forEach((list) => {
          (Array.isArray(list) ? list : []).forEach((reason) => map.set(reason, (map.get(reason) || 0) + 1));
        });
      }
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  })();

  const clarifications = policies.filter((row) => row.event_value === "clarification" || parseEventMeta(row).requiresClarification);
  const userFileRequired = detections.filter((row) => parseEventMeta(row).requiresUserFile);
  const userImageRequired = detections.filter((row) => parseEventMeta(row).requiresUserImage);

  const total = detections.length;
  const errorRate = total + errors.length > 0
    ? Math.round((errors.length / (total + errors.length)) * 1000) / 10
    : 0;
  // BUG CORRIGE : plans_created_count lisait `total` = detections.length =
  // count(tool_needs_detected), pas le plan reellement cree (`plans` =
  // count(tool_plan_created) etait calcule plus haut mais jamais utilise).
  // error_rate/breakdowns restent bases sur les detections (etape amont,
  // seule porteuse des metadonnees de repartition).
  const plansCreatedCount = plans.length;

  return {
    plans_created_count: plansCreatedCount,
    error_count: errors.length,
    error_rate: errorRate,
    last_primary_tool: lastMeta?.primaryTool || "",
    last_tools_needed: Array.isArray(lastMeta?.toolsNeeded) ? lastMeta.toolsNeeded : [],
    last_tools_optional: Array.isArray(lastMeta?.toolsOptional) ? lastMeta.toolsOptional : [],
    last_tool_sequence: Array.isArray(lastMeta?.toolSequence) ? lastMeta.toolSequence : [],
    last_requires_clarification: lastMeta ? Boolean(lastMeta.requiresClarification) : null,
    last_requires_user_file: lastMeta ? Boolean(lastMeta.requiresUserFile) : null,
    last_confidence: lastMeta?.confidence ?? null,
    last_at: detections[0]?.created_at || null,
    clarification_required_count: clarifications.length,
    user_file_required_count: userFileRequired.length,
    user_image_required_count: userImageRequired.length,
    top_reasons: topReasons,
    tool_usage_breakdown: countToolUsage(detections),
  };
}

function buildPlannerSummaryFromEvents(rows) {
  return {
    capability: buildCapabilityPlannerStatsFromEvents(rows),
    source: buildSourcePlannerStatsFromEvents(rows),
    execution: buildExecutionPlannerStatsFromEvents(rows),
    tool: buildToolPlannerStatsFromEvents(rows),
  };
}

// Remplace summaryTrend() cote front (admin/index.html), qui renvoyait des
// chaines litterales fixes ("+0 aujourd'hui · +0 sur 7 jours", ...).
function buildDashboardTrendsFromEvents(kpis) {
  const trendFor = (today, last7d) => {
    if (today == null || last7d == null) {
      return { today: null, last_7d: null, label: "non mesuré" };
    }
    if (today === 0 && last7d === 0) {
      return { today: 0, last_7d: 0, label: "aucune donnée récente" };
    }
    return {
      today,
      last_7d: last7d,
      label: `+${today} aujourd'hui · +${last7d} sur 7 jours`,
    };
  };
  return {
    "Conversations": trendFor(kpis.ai_assistant_events.today, kpis.ai_assistant_events.last_7d),
    "Activités IA": trendFor(kpis.ai_assistant_events.today, kpis.ai_assistant_events.last_7d),
    "Commentaires": trendFor(kpis.comments.today, kpis.comments.last_7d),
    "Contacts": trendFor(kpis.contacts.today, kpis.contacts.last_7d),
    "Consentements": trendFor(kpis.consent_logs.today, kpis.consent_logs.last_7d),
  };
}

// --- Agregats dedies a l'onglet admin "Conversations" ----------------------
// Aucune table dediee conversations/messages : tout est derive par SQL sur
// ai_assistant_events (group by session_id), conformement a la decision
// actee (pas de duplication ni de risque de desynchronisation). Seules
// conversation_tags/conversation_feedback/conversation_exports sont de
// vraies nouvelles tables (fonctionnalites neuves, demarrent vides).

function isErrorEventTypeSqlClause(column) {
  return `(${column} LIKE '%error%' OR ${column} LIKE '%failed%')`;
}

// Construit les clauses WHERE/bindings communes a buildConversationList et
// buildConversationFilters, pour ne pas dupliquer la logique de filtrage.
function buildConversationWhereClauses({ q, model, hasErrors, dateFrom, dateTo }) {
  const clauses = ["session_id IS NOT NULL", "session_id != ''"];
  const bindings = [];

  if (q) {
    clauses.push(`session_id IN (
      SELECT session_id FROM ai_assistant_events
      WHERE session_id = ? OR event_value LIKE ? OR meta LIKE ?
    )`);
    bindings.push(q, `%${q}%`, `%${q}%`);
  }
  if (model) {
    clauses.push(`session_id IN (
      SELECT session_id FROM ai_assistant_events
      WHERE event_type = 'openrouter_response' AND json_valid(meta)
        AND json_extract(meta, '$.resolved_model') = ?
    )`);
    bindings.push(model);
  }
  if (hasErrors === true) {
    clauses.push(`session_id IN (SELECT session_id FROM ai_assistant_events WHERE ${isErrorEventTypeSqlClause("event_type")})`);
  }
  if (dateFrom) {
    clauses.push("created_at >= ?");
    bindings.push(dateFrom);
  }
  if (dateTo) {
    clauses.push("created_at <= ?");
    bindings.push(dateTo);
  }
  return { whereSql: clauses.join(" AND "), bindings };
}

const CONVERSATION_SORT_COLUMNS = {
  last_at: "last_at DESC",
  messages: "message_count DESC",
  latency: "avg_latency_ms DESC",
};

// Pagination/recherche/tri/filtres reels cote SQL (pas de chargement complet
// en memoire) : une 1ere requete GROUP BY pagine les session_id, une 2e
// requete bornee recupere uniquement les evenements des session_id de la
// page courante pour calculer modele/apercu/erreurs.
async function buildConversationList(env, { limit = 20, offset = 0, q = "", model = "", hasErrors = false, dateFrom = "", dateTo = "", sort = "last_at" } = {}) {
  const { whereSql, bindings } = buildConversationWhereClauses({ q, model, hasErrors, dateFrom, dateTo });
  const orderBy = CONVERSATION_SORT_COLUMNS[sort] || CONVERSATION_SORT_COLUMNS.last_at;
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM (SELECT session_id FROM ai_assistant_events WHERE ${whereSql} GROUP BY session_id)`
  ).bind(...bindings).first();

  const groupedResult = await env.DB.prepare(
    `SELECT
       session_id,
       COUNT(*) AS message_count,
       MIN(created_at) AS started_at,
       MAX(created_at) AS last_at,
       (SELECT AVG(CAST(json_extract(e2.meta, '$.latency_ms') AS REAL))
          FROM ai_assistant_events e2
          WHERE e2.session_id = ai_assistant_events.session_id
            AND e2.event_type IN ('openrouter_response', 'assistant_response')
            AND json_valid(e2.meta)
            AND json_extract(e2.meta, '$.latency_ms') IS NOT NULL) AS avg_latency_ms
     FROM ai_assistant_events
     WHERE ${whereSql}
     GROUP BY session_id
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  ).bind(...bindings, safeLimit, safeOffset).all();

  const groups = groupedResult.results || [];
  const sessionIds = groups.map((g) => g.session_id);

  let eventsBySession = new Map();
  if (sessionIds.length) {
    const placeholders = sessionIds.map(() => "?").join(", ");
    const eventsResult = await env.DB.prepare(
      `SELECT id, session_id, event_type, event_value, meta, created_at
       FROM ai_assistant_events
       WHERE session_id IN (${placeholders})
       ORDER BY created_at DESC, id DESC
       LIMIT 2000`
    ).bind(...sessionIds).all();
    (eventsResult.results || []).forEach((row) => {
      if (!eventsBySession.has(row.session_id)) eventsBySession.set(row.session_id, []);
      eventsBySession.get(row.session_id).push(row);
    });
  }

  const items = groups.map((group) => {
    const events = eventsBySession.get(group.session_id) || [];
    const modelRow = events.find((row) => row.event_type === "openrouter_response" || row.event_type === "assistant_response");
    const previewRow = events.find((row) => row.event_type === "user_message") || events[events.length - 1] || null;
    const errorCount = events.filter((row) => isErrorEventType(row.event_type)).length;
    return {
      session_id: group.session_id,
      // Anonyme par construction : aucune identite utilisateur reelle
      // n'existe (pas d'auth) — on affiche l'identifiant de session, jamais
      // un nom invente.
      session_label: `Session #${String(group.session_id).slice(0, 8)}`,
      message_count: Number(group.message_count || 0),
      started_at: group.started_at,
      last_at: group.last_at,
      average_latency_ms: group.avg_latency_ms != null ? Math.round(group.avg_latency_ms) : null,
      model: modelRow ? (parseEventMeta(modelRow).resolved_model || parseEventMeta(modelRow).model || null) : null,
      // Apercu tronque tel que stocke en base (compactText(...,120) cote
      // worker-openrouter.js) — jamais le texte integral, jamais invente.
      preview: previewRow ? String(previewRow.event_value || "").slice(0, 120) : "",
      error_count: errorCount,
      status: errorCount > 0 ? "erreur" : "operational",
    };
  });

  return {
    items,
    total: Number(totalRow?.count || 0),
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function buildConversationSearch(env, q, pagination = {}) {
  if (!q) {
    return { items: [], total: 0, limit: pagination.limit || 20, offset: pagination.offset || 0, error: "missing_query" };
  }
  return buildConversationList(env, { ...pagination, q });
}

// Facettes reelles pour les filtres du front (modeles distincts vus, bornes
// de dates, nombre de conversations en erreur) — jamais une liste figee.
async function buildConversationFilters(env) {
  const [modelsResult, boundsRow, errorSessionsRow] = await Promise.all([
    env.DB.prepare(
      `SELECT DISTINCT json_extract(meta, '$.resolved_model') AS model
       FROM ai_assistant_events
       WHERE event_type = 'openrouter_response' AND json_valid(meta)
         AND json_extract(meta, '$.resolved_model') IS NOT NULL
       LIMIT 50`
    ).all(),
    env.DB.prepare("SELECT MIN(created_at) AS min_at, MAX(created_at) AS max_at FROM ai_assistant_events").first(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT session_id) AS count FROM ai_assistant_events WHERE ${isErrorEventTypeSqlClause("event_type")}`
    ).first(),
  ]);
  return {
    models: (modelsResult.results || []).map((row) => row.model).filter(Boolean),
    date_from: boundsRow?.min_at || null,
    date_to: boundsRow?.max_at || null,
    conversations_with_errors: Number(errorSessionsRow?.count || 0),
  };
}

// Transforme les evenements d'une session (deja tries) en etapes de pipeline
// ordonnees — uniquement celles reellement presentes, aucune etape inventee.
function buildConversationTimeline(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  return sorted.map((row) => {
    const meta = parseEventMeta(row);
    return {
      at: row.created_at || null,
      step: row.event_type || "unknown",
      event_value: row.event_value || "",
      is_error: isErrorEventType(row.event_type),
      detail: meta,
    };
  });
}

async function buildConversationDetails(env, sessionId) {
  const [eventsResult, tagsResult, feedbackResult, exportsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, session_id, event_type, event_value, meta, created_at
       FROM ai_assistant_events WHERE session_id = ? ORDER BY created_at ASC, id ASC`
    ).bind(sessionId).all(),
    env.DB.prepare("SELECT id, tag, created_by, created_at FROM conversation_tags WHERE session_id = ? ORDER BY created_at DESC").bind(sessionId).all(),
    env.DB.prepare("SELECT id, rating, note, created_by, created_at FROM conversation_feedback WHERE session_id = ? ORDER BY created_at DESC").bind(sessionId).all(),
    env.DB.prepare("SELECT id, format, requested_by, created_at FROM conversation_exports WHERE session_id = ? ORDER BY created_at DESC").bind(sessionId).all(),
  ]);

  const events = eventsResult.results || [];
  if (!events.length) return null;

  const responseRows = events.filter((row) => row.event_type === "openrouter_response" || row.event_type === "assistant_response");
  const usageRows = responseRows.map((row) => parseEventMeta(row).usage).filter(Boolean);
  const tokensTotal = usageRows.length
    ? usageRows.reduce((sum, usage) => sum + (Number(usage.total_tokens) || 0), 0)
    : null;
  const costTotal = usageRows.length
    ? usageRows.reduce((sum, usage) => sum + (Number(usage.cost ?? usage.total_cost) || 0), 0) || null
    : null;
  const latencyValues = responseRows.map((row) => Number(parseEventMeta(row).latency_ms)).filter((value) => Number.isFinite(value));
  const averageLatencyMs = latencyValues.length ? Math.round(latencyValues.reduce((sum, v) => sum + v, 0) / latencyValues.length) : null;
  const modelsUsed = Array.from(new Set(responseRows.map((row) => parseEventMeta(row).resolved_model || parseEventMeta(row).model).filter(Boolean)));
  const errorEvents = events.filter((row) => isErrorEventType(row.event_type));
  const startedAt = events[0]?.created_at || null;
  const lastAt = events[events.length - 1]?.created_at || null;
  const durationMs = startedAt && lastAt ? Math.max(0, new Date(lastAt) - new Date(startedAt)) : null;

  const ragUsage = buildRagUsageFromEvents(events);
  const tavilyUsage = buildTavilyUsageFromEvents(events, null, env);
  const planners = buildPlannerSummaryFromEvents(events);

  return {
    session_id: sessionId,
    session_label: `Session #${String(sessionId).slice(0, 8)}`,
    message_count: events.length,
    started_at: startedAt,
    last_at: lastAt,
    duration_ms: durationMs,
    models_used: modelsUsed,
    average_latency_ms: averageLatencyMs,
    tokens_total: tokensTotal,
    cost_total: costTotal, // null si OpenRouter ne renvoie pas de champ cost — jamais estime
    error_count: errorEvents.length,
    rag: ragUsage,
    web: tavilyUsage,
    planners,
    tags: tagsResult.results || [],
    feedback: feedbackResult.results || [],
    exports: exportsResult.results || [],
    timeline: buildConversationTimeline(events),
  };
}

async function buildConversationStats(env, { dateFrom = "", dateTo = "" } = {}) {
  const dateClause = [];
  const dateBindings = [];
  if (dateFrom) { dateClause.push("created_at >= ?"); dateBindings.push(dateFrom); }
  if (dateTo) { dateClause.push("created_at <= ?"); dateBindings.push(dateTo); }
  const whereDate = dateClause.length ? `WHERE ${dateClause.join(" AND ")}` : "";

  const [sessionsRow, messagesRow, latencyRow, usageRowsResult, feedbackRowsResult] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT session_id) AS count FROM ai_assistant_events ${whereDate}`).bind(...dateBindings).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM ai_assistant_events ${whereDate}`).bind(...dateBindings).first(),
    firstNumber(
      env,
      `SELECT AVG(CAST(json_extract(meta, '$.latency_ms') AS REAL)) AS value
       FROM ai_assistant_events
       WHERE event_type IN ('openrouter_response', 'assistant_response') AND json_valid(meta)
         AND json_extract(meta, '$.latency_ms') IS NOT NULL
         ${dateClause.length ? `AND ${dateClause.join(" AND ")}` : ""}`,
      "value",
      ...dateBindings
    ),
    env.DB.prepare(
      `SELECT meta FROM ai_assistant_events
       WHERE event_type IN ('openrouter_response', 'assistant_response') AND json_valid(meta)
         AND json_extract(meta, '$.usage') IS NOT NULL
         ${dateClause.length ? `AND ${dateClause.join(" AND ")}` : ""}`
    ).bind(...dateBindings).all(),
    env.DB.prepare(`SELECT rating FROM conversation_feedback ${whereDate}`).bind(...dateBindings).all(),
  ]);

  const usages = (usageRowsResult.results || []).map((row) => parseEventMeta(row).usage).filter(Boolean);
  const tokensTotal = usages.length ? usages.reduce((sum, usage) => sum + (Number(usage.total_tokens) || 0), 0) : null;
  const costTotal = usages.length
    ? (usages.reduce((sum, usage) => sum + (Number(usage.cost ?? usage.total_cost) || 0), 0) || null)
    : null;

  const ratings = (feedbackRowsResult.results || []).map((row) => Number(row.rating)).filter((value) => Number.isFinite(value));
  const averageSatisfaction = ratings.length ? Math.round((ratings.reduce((sum, v) => sum + v, 0) / ratings.length) * 10) / 10 : null;

  const conversations = Number(sessionsRow?.count || 0);
  const messages = Number(messagesRow?.count || 0);

  return {
    conversations,
    messages,
    // Aucune identite utilisateur reelle (pas d'auth) : "sessions" est le
    // seul identifiant disponible — libelle explicite plutot que de fabriquer
    // une notion d'utilisateur.
    sessions: conversations,
    average_messages_per_conversation: conversations ? Math.round((messages / conversations) * 10) / 10 : null,
    average_response_ms: latencyRow,
    tokens_total: tokensTotal,
    cost_total: costTotal,
    average_satisfaction: averageSatisfaction,
    satisfaction_sample_size: ratings.length,
  };
}

async function buildConversationAnalytics(env, recentEvents) {
  return {
    models: buildModelUsageFromEvents(recentEvents),
    quality: buildResponseQualityStatsFromEvents(recentEvents),
    rag: buildRagUsageFromEvents(recentEvents),
    web: buildTavilyUsageFromEvents(recentEvents, null, env),
    planners: buildPlannerSummaryFromEvents(recentEvents),
    errors: buildErrorStatsFromEvents(recentEvents),
  };
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
  const actualCallRows = eventRows.filter((row) => ["success", "error"].includes(getWebSearchStatus(row.event_type)));
  const successRows = eventRows.filter((row) => getWebSearchStatus(row.event_type) === "success");
  const cacheRows = eventRows.filter((row) => getWebSearchStatus(row.event_type) === "cached");
  const dedupeRows = eventRows.filter((row) => getWebSearchStatus(row.event_type) === "deduplicated");
  const skippedRows = eventRows.filter((row) => getWebSearchStatus(row.event_type) === "skipped");
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
    daily_average: averagePerPeriod(eventRows, (row) => ["success", "error"].includes(getWebSearchStatus(row.event_type)), 1),
    weekly_average: averagePerPeriod(eventRows, (row) => ["success", "error"].includes(getWebSearchStatus(row.event_type)), 7),
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

  // vector_search=true peut etre porte par rag_query, rag_match ou
  // rag_context_used (meme baseMeta cote client) — regroupes ici uniquement
  // pour le debug (compte chaque flag, evenement par evenement).
  const ragEventRows = queryRows.concat(matchRows, contextRows);
  const parsedMetas = ragEventRows.map((row) => parseEventMeta(row));
  const parsedMetaCount = parsedMetas.filter((meta) => meta && Object.keys(meta).length > 0).length;
  const vectorTrueCount = parsedMetas.filter((meta) => isTruthyFlag(meta?.vector_search)).length;
  // Le nombre REEL de recherches passees par Vectorize doit se baser sur
  // rag_query (une ligne par recherche lancee), pas sur rag_match : une
  // recherche vectorielle qui ne trouve aucun passage au-dessus du seuil est
  // journalisee en rag_no_match (pas rag_match) mais a bien interroge
  // Vectorize. Compter seulement les rag_match sous-estime l'usage reel.
  const vectorSearches = queryRows.filter((row) => isTruthyFlag(parseEventMeta(row).vector_search)).length;
  const vectorSearchRate = searches ? Math.round((vectorSearches / searches) * 1000) / 10 : 0;
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
    vector_searches: vectorSearches,
    vector_search_rate: vectorSearchRate,
    engine: vectorSearches > 0 ? "vectorize" : (matchRows.length > 0 ? "browser_fallback" : "n/a"),
    // Debug temporaire (cf. investigation comptage vectoriel) — a retirer une
    // fois le comptage confirme stable en production.
    debug_raw_rag_events_count: ragEventRows.length,
    debug_parsed_meta_count: parsedMetaCount,
    debug_vector_true_count: vectorTrueCount,
  };
}

// --- Agregats dedies a l'onglet admin "Sources & RAG" ----------------------
// rag_chunks reste la granularite d'indexation (texte des passages, jamais
// modifiee ici). rag_sources est la granularite documentaire (additive,
// alimentee par indexDocumentChunks() cote cloudflare/ragPipeline.js). Quand
// un document a ete indexe avant l'existence de rag_sources (ou que la ligne
// a ete perdue), on reconstruit une source "partielle" depuis rag_chunks —
// jamais une source fictive : son statut est explicitement "partiel".

const RAG_ERROR_EVENT_SQL_CLAUSE = "(event_type LIKE 'rag%error%' OR event_type LIKE 'rag%failed%' OR event_type = 'rag_index_failed' OR event_type = 'rag_delete_failed')";

export function isRagErrorEventType(eventType) {
  const type = String(eventType || "").toLowerCase();
  return type.startsWith("rag") && (type.includes("error") || type.includes("failed"));
}

async function buildRagProjectStats(env) {
  const [sourceProjects, chunkProjects] = await Promise.all([
    env.DB.prepare(
      `SELECT project_id, COUNT(*) AS sources_count, SUM(chunks_count) AS chunks_count
       FROM rag_sources WHERE project_id IS NOT NULL AND project_id != '' GROUP BY project_id`
    ).all(),
    env.DB.prepare(
      `SELECT project_id, COUNT(DISTINCT document_id) AS documents_count, COUNT(*) AS chunks_count
       FROM rag_chunks WHERE project_id IS NOT NULL AND project_id != '' GROUP BY project_id`
    ).all(),
  ]);
  const byProject = new Map();
  (sourceProjects.results || []).forEach((row) => {
    byProject.set(row.project_id, {
      project_id: row.project_id,
      sources_count: Number(row.sources_count || 0),
      chunks_count: Number(row.chunks_count || 0),
    });
  });
  (chunkProjects.results || []).forEach((row) => {
    if (!byProject.has(row.project_id)) {
      byProject.set(row.project_id, {
        project_id: row.project_id,
        sources_count: 0,
        chunks_count: Number(row.chunks_count || 0),
        documents_without_source_row: Number(row.documents_count || 0),
      });
    }
  });
  return Array.from(byProject.values());
}

// Pagination/recherche/filtre/tri reels cote SQL sur rag_sources. Les
// documents presents dans rag_chunks mais sans ligne rag_sources (indexes
// avant la creation de cette table) sont ajoutes comme sources "partielles" —
// jamais masques, jamais inventes.
async function buildRagSourceList(env, { limit = 20, offset = 0, q = "", projectId = "", status = "", sort = "indexed_at" } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const clauses = [];
  const bindings = [];
  if (q) {
    clauses.push("(title LIKE ? OR filename LIKE ? OR id = ?)");
    bindings.push(`%${q}%`, `%${q}%`, q);
  }
  if (projectId) {
    clauses.push("project_id = ?");
    bindings.push(projectId);
  }
  if (status) {
    clauses.push("status = ?");
    bindings.push(status);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sortColumn = { indexed_at: "indexed_at DESC", title: "title ASC", chunks_count: "chunks_count DESC", size_bytes: "size_bytes DESC" }[sort] || "indexed_at DESC";

  const [totalRow, sourcesResult] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM rag_sources ${whereSql}`).bind(...bindings).first(),
    env.DB.prepare(
      `SELECT id, project_id, title, source_type, filename, mime_type, size_bytes, checksum, status, chunks_count, indexed_at, created_at, updated_at
       FROM rag_sources ${whereSql} ORDER BY ${sortColumn} LIMIT ? OFFSET ?`
    ).bind(...bindings, safeLimit, safeOffset).all(),
  ]);

  const knownSources = (sourcesResult.results || []).map((row) => ({ ...row, partial: false }));

  // Reconstruction des sources partielles uniquement sur la 1ere page, sans
  // filtre projet/statut/recherche actif (sinon le tri/pagination SQL perd
  // son sens) — evite de fabriquer une notion de pagination sur des donnees
  // non structurees.
  let partialSources = [];
  if (safeOffset === 0 && !q && !projectId && !status) {
    const orphanChunks = await env.DB.prepare(
      `SELECT document_id, project_id, document_name, COUNT(*) AS chunks_count, MAX(created_at) AS last_chunk_at
       FROM rag_chunks
       WHERE document_id NOT IN (SELECT id FROM rag_sources)
       GROUP BY document_id
       ORDER BY last_chunk_at DESC
       LIMIT ?`
    ).bind(safeLimit).all();
    partialSources = (orphanChunks.results || []).map((row) => ({
      id: row.document_id,
      project_id: row.project_id,
      title: row.document_name || row.document_id,
      source_type: null,
      filename: row.document_name || null,
      mime_type: null,
      size_bytes: null,
      checksum: null,
      status: "partiel",
      chunks_count: Number(row.chunks_count || 0),
      indexed_at: row.last_chunk_at,
      created_at: row.last_chunk_at,
      updated_at: row.last_chunk_at,
      partial: true,
    }));
  }

  const total = Number(totalRow?.count || 0);
  return {
    items: knownSources.concat(partialSources),
    total: total + (safeOffset === 0 ? partialSources.length : 0),
    limit: safeLimit,
    offset: safeOffset,
    reconstructed_count: partialSources.length,
  };
}

async function buildRagSourceDetails(env, sourceId) {
  const sourceRow = await env.DB.prepare(
    `SELECT id, project_id, title, source_type, filename, mime_type, size_bytes, checksum, status, chunks_count, indexed_at, created_at, updated_at, metadata_json
     FROM rag_sources WHERE id = ?`
  ).bind(sourceId).first();

  const chunksResult = await env.DB.prepare(
    `SELECT id, document_id, project_id, document_name, chunk_index, locator, text, created_at
     FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index ASC`
  ).bind(sourceId).all();
  const chunks = chunksResult.results || [];
  if (!sourceRow && !chunks.length) return null;

  // Recherches reelles ayant cite ce document : recoupe les evenements
  // rag_context_used dont meta.documentId correspond — jamais une recherche
  // inventee.
  const citingEventsResult = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE event_type = 'rag_context_used' AND json_valid(meta) AND meta LIKE ?
     ORDER BY created_at DESC LIMIT 50`
  ).bind(`%${sourceId}%`).all();
  const citingSearches = (citingEventsResult.results || [])
    .map((row) => ({ at: row.created_at, session_id: row.session_id, meta: parseEventMeta(row) }))
    .filter((row) => String(row.meta.documentId || "") === sourceId);

  const errorsResult = await env.DB.prepare(
    `SELECT id, event_type, event_value, meta, created_at FROM ai_assistant_events
     WHERE ${RAG_ERROR_EVENT_SQL_CLAUSE} AND (event_value LIKE ? OR meta LIKE ?)
     ORDER BY created_at DESC LIMIT 20`
  ).bind(`%${sourceId}%`, `%${sourceId}%`).all();

  const source = sourceRow || {
    id: sourceId,
    project_id: chunks[0]?.project_id || null,
    title: chunks[0]?.document_name || sourceId,
    source_type: null,
    filename: chunks[0]?.document_name || null,
    mime_type: null,
    size_bytes: null,
    checksum: null,
    status: "partiel",
    chunks_count: chunks.length,
    indexed_at: chunks[chunks.length - 1]?.created_at || null,
    created_at: chunks[0]?.created_at || null,
    updated_at: chunks[chunks.length - 1]?.created_at || null,
    metadata_json: null,
    partial: true,
  };

  return {
    source,
    chunks: chunks.map((row) => ({
      id: row.id,
      chunk_index: row.chunk_index,
      content_preview: String(row.text || "").slice(0, 160),
      token_count: null, // non mesure : aucun comptage de tokens par chunk n'est stocke
      vector_id: row.id, // id == cle vectorielle (chunkVectorId) cote ragPipeline.js
      source_id: row.document_id,
      locator: row.locator || null,
      created_at: row.created_at,
    })),
    citing_searches: citingSearches,
    errors: (errorsResult.results || []).map((row) => ({ at: row.created_at, type: row.event_type, detail: row.event_value })),
  };
}

async function buildRagChunkStats(env) {
  const [totalsRow, projectRows] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count, COUNT(DISTINCT document_id) AS documents FROM rag_chunks").first(),
    env.DB.prepare("SELECT project_id, COUNT(*) AS count FROM rag_chunks WHERE project_id IS NOT NULL AND project_id != '' GROUP BY project_id ORDER BY count DESC LIMIT 10").all(),
  ]);
  return {
    chunks_total: Number(totalsRow?.count || 0),
    documents_with_chunks: Number(totalsRow?.documents || 0),
    // Aucun token_count stocke par chunk (cf. rag_chunks schema) : impossible
    // de calculer une moyenne reelle sans l'inventer.
    average_token_count: null,
    by_project: (projectRows.results || []).map((row) => ({ project_id: row.project_id, chunks_count: Number(row.count || 0) })),
  };
}

export async function buildRagDiagnostics(env) {
  const warnings = [];
  const safeFirst = async (sql, bindings = [], fallback = {}) => {
    try {
      return await env.DB.prepare(sql).bind(...bindings).first();
    } catch (error) {
      warnings.push(`diagnostic_sql_failed: ${String(error?.message || error || "unknown_error").slice(0, 180)}`);
      return fallback;
    }
  };
  const safeAll = async (sql, bindings = []) => {
    try {
      const result = await env.DB.prepare(sql).bind(...bindings).all();
      return result.results || [];
    } catch (error) {
      warnings.push(`diagnostic_sql_failed: ${String(error?.message || error || "unknown_error").slice(0, 180)}`);
      return [];
    }
  };
  const countOf = (row) => Number(row?.count || 0);
  const splitIds = (value) => String(value || "").split(",").map((id) => id.trim()).filter(Boolean);

  const [
    documentsRow,
    sourcesRow,
    chunksRow,
    documentsWithoutChunksRow,
    documentsWithoutChunksItems,
    chunksWithoutSourceRow,
    chunksWithoutSourceItems,
    duplicateSourcesRows,
    duplicateChunksRows,
    topDocumentsRows,
    orphanRows,
  ] = await Promise.all([
    safeFirst("SELECT COUNT(*) AS count FROM documents", [], { count: 0 }),
    safeFirst("SELECT COUNT(*) AS count FROM rag_sources", [], { count: 0 }),
    safeFirst("SELECT COUNT(*) AS count FROM rag_chunks", [], { count: 0 }),
    safeFirst(
      `SELECT COUNT(*) AS count
       FROM documents d
       LEFT JOIN rag_chunks c ON c.document_id = COALESCE(NULLIF(d.rag_source_id, ''), d.id)
       WHERE c.id IS NULL`,
      [],
      { count: 0 }
    ),
    safeAll(
      `SELECT d.id, d.rag_source_id, d.project_id, d.title, d.filename, d.status, d.updated_at
       FROM documents d
       LEFT JOIN rag_chunks c ON c.document_id = COALESCE(NULLIF(d.rag_source_id, ''), d.id)
       WHERE c.id IS NULL
       ORDER BY d.updated_at DESC
       LIMIT 100`
    ),
    safeFirst(
      `SELECT COUNT(*) AS count
       FROM rag_chunks c
       LEFT JOIN rag_sources s ON s.id = c.document_id
       WHERE s.id IS NULL`,
      [],
      { count: 0 }
    ),
    safeAll(
      `SELECT c.document_id, c.document_name, c.project_id, COUNT(*) AS chunks_count
       FROM rag_chunks c
       LEFT JOIN rag_sources s ON s.id = c.document_id
       WHERE s.id IS NULL
       GROUP BY c.document_id, c.document_name, c.project_id
       ORDER BY chunks_count DESC
       LIMIT 100`
    ),
    safeAll(
      `SELECT LOWER(TRIM(COALESCE(NULLIF(filename, ''), NULLIF(title, ''), id))) AS normalized_title,
              COUNT(*) AS count,
              GROUP_CONCAT(id) AS ids,
              GROUP_CONCAT(title) AS titles
       FROM rag_sources
       GROUP BY normalized_title
       HAVING COUNT(*) > 1
       ORDER BY count DESC, normalized_title ASC
       LIMIT 100`
    ),
    safeAll(
      `SELECT document_id, document_name, chunk_index, COUNT(*) AS count, GROUP_CONCAT(id) AS chunk_ids
       FROM rag_chunks
       GROUP BY document_id, document_name, chunk_index
       HAVING COUNT(*) > 1
       ORDER BY count DESC, document_id ASC, chunk_index ASC
       LIMIT 100`
    ),
    safeAll(
      `SELECT document_id, document_name, project_id, COUNT(*) AS chunks_count
       FROM rag_chunks
       GROUP BY document_id, document_name, project_id
       ORDER BY chunks_count DESC
       LIMIT 20`
    ),
    safeAll(
      `SELECT c.document_id, c.document_name, c.project_id, COUNT(*) AS chunks_count,
              CASE WHEN s.id IS NULL THEN 1 ELSE 0 END AS missing_rag_source,
              CASE WHEN d.id IS NULL THEN 1 ELSE 0 END AS missing_document_row
       FROM rag_chunks c
       LEFT JOIN rag_sources s ON s.id = c.document_id
       LEFT JOIN documents d ON d.id = c.document_id OR d.rag_source_id = c.document_id
       WHERE s.id IS NULL OR d.id IS NULL
       GROUP BY c.document_id, c.document_name, c.project_id, missing_rag_source, missing_document_row
       ORDER BY chunks_count DESC
       LIMIT 100`
    ),
  ]);

  const totalDocuments = countOf(documentsRow);
  const totalSources = countOf(sourcesRow);
  const totalChunks = countOf(chunksRow);
  const documentsWithoutChunksCount = countOf(documentsWithoutChunksRow);
  const chunksWithoutSourceCount = countOf(chunksWithoutSourceRow);

  if (totalDocuments === 0 && totalChunks > 0) warnings.push("documents_table_empty_but_rag_chunks_present");
  if (totalSources === 0 && totalChunks > 0) warnings.push("rag_sources_empty_but_rag_chunks_present");
  if (documentsWithoutChunksCount > 0) warnings.push("documents_without_chunks_detected");
  if (chunksWithoutSourceCount > 0) warnings.push("chunks_without_source_detected");
  if (duplicateSourcesRows.length > 0) warnings.push("duplicate_sources_by_title_detected");
  if (duplicateChunksRows.length > 0) warnings.push("duplicate_chunks_by_document_detected");
  if (orphanRows.length > 0) warnings.push("orphan_document_ids_detected");

  const healthStatus = warnings.length ? "degraded" : "operational";

  return {
    total_documents_table: totalDocuments,
    total_rag_sources: totalSources,
    total_rag_chunks: totalChunks,
    documents_without_chunks: {
      count: documentsWithoutChunksCount,
      items: documentsWithoutChunksItems.map((row) => ({
        id: row.id,
        rag_source_id: row.rag_source_id || null,
        project_id: row.project_id || null,
        title: row.title || row.filename || row.id,
        filename: row.filename || null,
        status: row.status || null,
        updated_at: row.updated_at || null,
      })),
    },
    chunks_without_source: {
      count: chunksWithoutSourceCount,
      groups: chunksWithoutSourceItems.map((row) => ({
        document_id: row.document_id,
        document_name: row.document_name || row.document_id,
        project_id: row.project_id || null,
        chunks_count: Number(row.chunks_count || 0),
      })),
    },
    duplicate_sources_by_title: duplicateSourcesRows.map((row) => ({
      title: row.normalized_title || "sans titre",
      count: Number(row.count || 0),
      ids: splitIds(row.ids),
      titles: splitIds(row.titles),
    })),
    duplicate_chunks_by_document: duplicateChunksRows.map((row) => ({
      document_id: row.document_id,
      document_name: row.document_name || row.document_id,
      chunk_index: Number(row.chunk_index || 0),
      count: Number(row.count || 0),
      chunk_ids: splitIds(row.chunk_ids),
    })),
    top_documents_by_chunks: topDocumentsRows.map((row) => ({
      document_id: row.document_id,
      document_name: row.document_name || row.document_id,
      project_id: row.project_id || null,
      chunks_count: Number(row.chunks_count || 0),
    })),
    orphan_document_ids: orphanRows.map((row) => ({
      document_id: row.document_id,
      document_name: row.document_name || row.document_id,
      project_id: row.project_id || null,
      chunks_count: Number(row.chunks_count || 0),
      missing_rag_source: Boolean(row.missing_rag_source),
      missing_document_row: Boolean(row.missing_document_row),
    })),
    health_status: healthStatus,
    warnings: Array.from(new Set(warnings)),
  };
}

// Recherches RAG : aucune table dediee (decision actee — pas de duplication
// des evenements). Tout est derive de rag_query/rag_match/rag_no_match/
// rag_context_used deja journalises par le runtime RAG existant.
export function buildRagSearchStats(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const queryRows = eventRows.filter((row) => row.event_type === "rag_query");
  const matchRows = eventRows.filter((row) => row.event_type === "rag_match");
  const noMatchRows = eventRows.filter((row) => row.event_type === "rag_no_match");
  const contextRows = eventRows.filter((row) => row.event_type === "rag_context_used");
  const searches = queryRows.length;
  const matchRate = searches ? Math.round((matchRows.length / searches) * 1000) / 10 : null;
  const averageLatencyMs = averageFromEvents(queryRows.concat(matchRows, noMatchRows), ["duration_ms"]);

  const scoreValues = matchRows.map((row) => Number(parseEventMeta(row).top_score ?? parseEventMeta(row).score)).filter((value) => Number.isFinite(value));
  const averageTopScore = scoreValues.length ? Math.round((scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length) * 1000) / 1000 : null;

  const projectCounts = new Map();
  queryRows.forEach((row) => {
    const meta = parseEventMeta(row);
    const key = meta.projectName || meta.projectId || null;
    if (!key) return;
    projectCounts.set(key, (projectCounts.get(key) || 0) + 1);
  });

  const sourceCounts = new Map();
  contextRows.forEach((row) => {
    const meta = parseEventMeta(row);
    const key = meta.documentName || meta.documentId;
    if (!key) return;
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  });

  return {
    searches_performed: searches,
    matches: matchRows.length,
    no_matches: noMatchRows.length,
    match_rate: matchRate,
    average_top_score: averageTopScore,
    average_latency_ms: averageLatencyMs,
    searches_without_results: noMatchRows.length,
    top_projects_queried: Array.from(projectCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    top_sources_cited: Array.from(sourceCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

async function buildRagIndexingStats(env) {
  const statusRows = await env.DB.prepare(
    "SELECT status, COUNT(*) AS count FROM rag_sources GROUP BY status"
  ).all();
  const lastIndexedRow = await env.DB.prepare(
    "SELECT MAX(indexed_at) AS last_indexed_at FROM rag_sources"
  ).first();
  return {
    by_status: (statusRows.results || []).map((row) => ({ status: row.status, count: Number(row.count || 0) })),
    last_indexed_at: lastIndexedRow?.last_indexed_at || null,
  };
}

// Statut Vectorize : jamais affiche "operational" sans signal reel. Calcule
// uniquement a partir de signaux observables cote D1 (events rag_*, lignes
// rag_sources) — le Worker API n'a pas de binding VECTOR_INDEX direct (celui-ci
// vit cote Worker IA, cloudflare/ragPipeline.js).
export function buildRagHealth(rows, sourcesCount, chunksCount) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const queryRows = eventRows.filter((row) => row.event_type === "rag_query");
  const vectorSearchRows = queryRows.filter((row) => isTruthyFlag(parseEventMeta(row).vector_search));
  const errorRows = eventRows.filter((row) => isRagErrorEventType(row.event_type));
  const lastQueryAt = queryRows[0]?.created_at || null;
  const lastErrorAt = errorRows[0]?.created_at || null;
  const lastVectorSearchAt = vectorSearchRows[0]?.created_at || null;

  const hasAnyActivity = queryRows.length > 0 || sourcesCount > 0 || chunksCount > 0;
  const hasRecentQuery = lastQueryAt && (Date.now() - new Date(lastQueryAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
  const hasRecentError = lastErrorAt && (Date.now() - new Date(lastErrorAt).getTime()) < 7 * 24 * 60 * 60 * 1000;

  let status = "not_configured";
  if (hasAnyActivity) status = "unknown";
  if (hasRecentQuery && vectorSearchRows.length > 0 && !hasRecentError) status = "operational";
  else if (hasRecentQuery && hasRecentError) status = "degraded";
  else if (hasRecentQuery && vectorSearchRows.length === 0) status = "degraded";
  else if (hasRecentError && !hasRecentQuery) status = "unavailable";

  return {
    status,
    last_query_at: lastQueryAt,
    last_vector_search_at: lastVectorSearchAt,
    last_error_at: lastErrorAt,
    recent_error_count: errorRows.length,
    engine: vectorSearchRows.length > 0 ? "vectorize" : (queryRows.length > 0 ? "browser_fallback" : "n/a"),
  };
}

export function buildRagCoverage(sourcesCount, sourcesWithChunksCount) {
  if (!sourcesCount) {
    return { sources_total: 0, sources_with_chunks: 0, coverage_rate: null, label: "aucune source indexée" };
  }
  const rate = Math.round((sourcesWithChunksCount / sourcesCount) * 1000) / 10;
  return { sources_total: sourcesCount, sources_with_chunks: sourcesWithChunksCount, coverage_rate: rate, label: `${rate}%` };
}

export function buildRagFreshness(lastIndexedAt, lastSearchAt) {
  const now = Date.now();
  const ageMs = (iso) => (iso ? now - new Date(iso).getTime() : null);
  return {
    last_indexed_at: lastIndexedAt || null,
    last_search_at: lastSearchAt || null,
    indexed_age_ms: lastIndexedAt ? ageMs(lastIndexedAt) : null,
    search_age_ms: lastSearchAt ? ageMs(lastSearchAt) : null,
    label: !lastIndexedAt && !lastSearchAt ? "aucune donnée récente" : null,
  };
}

export function buildRagErrors(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const errorRows = eventRows.filter((row) => isRagErrorEventType(row.event_type));
  return {
    total_error_count: errorRows.length,
    recent: errorRows.slice(0, 20).map((row) => ({ at: row.created_at, type: row.event_type, detail: row.event_value, session_id: row.session_id })),
    status: errorRows.length === 0 ? "aucune_erreur_recente" : "des_erreurs_recentes",
  };
}

// Activite RAG par jour, uniquement a partir des evenements reels (pas de
// donnees synthetiques pour combler les jours sans evenement : ces jours
// affichent 0, jamais une valeur generee).
export function buildRagActivitySeries(rows, days = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const relevant = eventRows.filter((row) => ["rag_query", "rag_match", "rag_no_match", "rag_context_used"].includes(row.event_type));
  const byDay = new Map();
  relevant.forEach((row) => {
    const day = String(row.created_at || "").slice(0, 10);
    if (!day) return;
    if (!byDay.has(day)) byDay.set(day, { date: day, queries: 0, matches: 0, no_matches: 0 });
    const entry = byDay.get(day);
    if (row.event_type === "rag_query") entry.queries += 1;
    if (row.event_type === "rag_match") entry.matches += 1;
    if (row.event_type === "rag_no_match") entry.no_matches += 1;
  });
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}

async function buildRagOverview(env, recentEvents) {
  const [chunkStats, projects, sourcesCountRow, sourcesWithChunksRow, indexingStats] = await Promise.all([
    buildRagChunkStats(env),
    buildRagProjectStats(env),
    env.DB.prepare("SELECT COUNT(*) AS count FROM rag_sources").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM rag_sources WHERE chunks_count > 0").first(),
    buildRagIndexingStats(env),
  ]);
  const sourcesTotal = Number(sourcesCountRow?.count || 0);
  const sourcesWithChunks = Number(sourcesWithChunksRow?.count || 0);
  const searchStats = buildRagSearchStats(recentEvents);
  const health = buildRagHealth(recentEvents, sourcesTotal, chunkStats.chunks_total);
  const errors = buildRagErrors(recentEvents);
  const coverage = buildRagCoverage(sourcesTotal, sourcesWithChunks);
  const freshness = buildRagFreshness(indexingStats.last_indexed_at, searchStats.searches_performed ? recentEvents.find((r) => r.event_type === "rag_query")?.created_at : null);

  return {
    sources_total: sourcesTotal,
    // Sources reconstruites depuis rag_chunks (sans ligne rag_sources)
    // comptees a part : honnete sur leur statut "partiel".
    sources_with_chunks: sourcesWithChunks,
    chunks_total: chunkStats.chunks_total,
    documents_with_chunks: chunkStats.documents_with_chunks,
    searches_performed: searchStats.searches_performed,
    match_rate: searchStats.match_rate,
    average_search_latency_ms: searchStats.average_latency_ms,
    projects_count: projects.length,
    health,
    coverage,
    freshness,
    errors_count: errors.total_error_count,
  };
}

// --- Agregats dedies a l'onglet admin "Documents" ---------------------------
// `documents` est la vue transverse (upload -> parsing -> chunking ->
// indexation -> utilisation -> export), distincte de rag_sources (specialise
// Sources & RAG). Alimentee de facon additive par indexDocumentChunks() (cf.
// cloudflare/ragPipeline.js) et par les evenements document_* journalises
// par le client (cloudflare/worker-openrouter.js, mode: 'event'). Si un
// document a ete uploade mais jamais indexe (texte vide, echec), aucune
// ligne `documents` n'existe encore : on le reconstruit alors comme entree
// "partielle" depuis l'evenement document_uploaded — jamais un document
// fictif.

const DOCUMENT_EVENT_TYPES = [
  "document_uploaded",
  "document_parse_started",
  "document_parsed",
  "document_chunked",
  "document_indexed",
  "document_index_failed",
  "document_used",
  "document_exported",
  "document_deleted",
];

async function fetchRecentDocumentEvents(env, limit = 2000) {
  const placeholders = DOCUMENT_EVENT_TYPES.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE event_type IN (${placeholders})
     ORDER BY created_at DESC, id DESC LIMIT ?`
  ).bind(...DOCUMENT_EVENT_TYPES, limit).all();
  return result.results || [];
}

export function documentIdFromEvent(row) {
  const meta = parseEventMeta(row);
  return String(meta.documentId || "").trim();
}

function buildDocumentWhereClauses({ q, projectId, status }) {
  const clauses = [];
  const bindings = [];
  if (q) {
    clauses.push("(title LIKE ? OR filename LIKE ? OR id = ?)");
    bindings.push(`%${q}%`, `%${q}%`, q);
  }
  if (projectId) {
    clauses.push("project_id = ?");
    bindings.push(projectId);
  }
  if (status) {
    clauses.push("status = ?");
    bindings.push(status);
  }
  return { whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", bindings };
}

const DOCUMENT_SORT_COLUMNS = {
  indexed_at: "indexed_at DESC",
  uploaded_at: "uploaded_at DESC",
  title: "title ASC",
  chunks_count: "chunks_count DESC",
  used_count: "used_count DESC",
  size_bytes: "size_bytes DESC",
};

async function buildDocumentList(env, { limit = 20, offset = 0, q = "", projectId = "", status = "", sort = "uploaded_at" } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const { whereSql, bindings } = buildDocumentWhereClauses({ q, projectId, status });
  const orderBy = DOCUMENT_SORT_COLUMNS[sort] || DOCUMENT_SORT_COLUMNS.uploaded_at;

  const [totalRow, docsResult] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM documents ${whereSql}`).bind(...bindings).first(),
    env.DB.prepare(
      `SELECT id, rag_source_id, project_id, title, filename, file_path, mime_type, source_type, size_bytes, pages_count, chunks_count, status, indexed_at, uploaded_at, updated_at, last_used_at, used_count, average_relevance, checksum
       FROM documents ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).bind(...bindings, safeLimit, safeOffset).all(),
  ]);

  const knownDocs = (docsResult.results || []).map((row) => ({ ...row, partial: false }));

  // Documents uploades mais jamais indexes (texte vide, echec d'extraction) :
  // reconstruits depuis document_uploaded uniquement sur la 1ere page sans
  // filtre actif, comme pour les sources RAG partielles.
  let partialDocs = [];
  if (safeOffset === 0 && !q && !projectId && !status) {
    const knownIds = new Set(knownDocs.map((d) => d.id));
    const uploadEvents = await env.DB.prepare(
      `SELECT id, session_id, event_type, event_value, meta, created_at
       FROM ai_assistant_events WHERE event_type = 'document_uploaded'
       ORDER BY created_at DESC LIMIT 200`
    ).all();
    const seen = new Set();
    (uploadEvents.results || []).forEach((row) => {
      const docId = documentIdFromEvent(row);
      if (!docId || knownIds.has(docId) || seen.has(docId)) return;
      seen.add(docId);
      const meta = parseEventMeta(row);
      partialDocs.push({
        id: docId,
        rag_source_id: null,
        project_id: meta.projectId || null,
        title: row.event_value || docId,
        filename: row.event_value || null,
        file_path: null,
        mime_type: meta.mimeType || null,
        source_type: null,
        size_bytes: meta.sizeBytes ?? null,
        pages_count: null,
        chunks_count: 0,
        status: "non_indexe",
        indexed_at: null,
        uploaded_at: row.created_at,
        updated_at: row.created_at,
        last_used_at: null,
        used_count: 0,
        average_relevance: null,
        checksum: null,
        partial: true,
      });
    });
    partialDocs = partialDocs.slice(0, safeLimit);
  }

  const total = Number(totalRow?.count || 0);
  return {
    items: knownDocs.concat(partialDocs),
    total: total + (safeOffset === 0 ? partialDocs.length : 0),
    limit: safeLimit,
    offset: safeOffset,
    reconstructed_count: partialDocs.length,
  };
}

async function buildDocumentDetails(env, documentId) {
  const docRow = await env.DB.prepare(
    `SELECT id, rag_source_id, project_id, title, filename, file_path, mime_type, source_type, size_bytes, pages_count, chunks_count, status, indexed_at, uploaded_at, updated_at, last_used_at, used_count, average_relevance, checksum, metadata_json
     FROM documents WHERE id = ?`
  ).bind(documentId).first();

  const eventsResult = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at FROM ai_assistant_events
     WHERE event_type IN (${DOCUMENT_EVENT_TYPES.map(() => "?").join(", ")})
     ORDER BY created_at ASC, id ASC`
  ).bind(...DOCUMENT_EVENT_TYPES).all();
  const events = (eventsResult.results || []).filter((row) => documentIdFromEvent(row) === documentId);

  if (!docRow && !events.length) return null;

  const chunksResult = docRow?.rag_source_id
    ? await env.DB.prepare(
      `SELECT id, chunk_index, locator, text, created_at FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index ASC`
    ).bind(docRow.rag_source_id).all()
    : { results: [] };
  const chunks = (chunksResult.results || []).map((row) => ({
    id: row.id,
    chunk_index: row.chunk_index,
    content_preview: String(row.text || "").slice(0, 160),
    locator: row.locator || null,
    created_at: row.created_at,
  }));

  const usedEvents = events.filter((row) => row.event_type === "document_used");
  const exportEvents = events.filter((row) => row.event_type === "document_exported");
  const errorEvents = events.filter((row) => row.event_type === "document_index_failed");

  const document = docRow || {
    id: documentId,
    rag_source_id: null,
    project_id: parseEventMeta(events[0]).projectId || null,
    title: events.find((e) => e.event_type === "document_uploaded")?.event_value || documentId,
    filename: null,
    file_path: null,
    mime_type: null,
    source_type: null,
    size_bytes: null,
    pages_count: null,
    chunks_count: 0,
    status: "non_indexe",
    indexed_at: null,
    uploaded_at: events[0]?.created_at || null,
    updated_at: events[events.length - 1]?.created_at || null,
    last_used_at: usedEvents[usedEvents.length - 1]?.created_at || null,
    used_count: usedEvents.length,
    average_relevance: null,
    checksum: null,
    partial: true,
  };

  return {
    document,
    chunks,
    timeline: events.map((row) => ({
      at: row.created_at,
      step: row.event_type,
      event_value: row.event_value || "",
      is_error: row.event_type === "document_index_failed",
      detail: parseEventMeta(row),
    })),
    used_events: usedEvents.map((row) => ({ at: row.created_at, session_id: row.session_id, meta: parseEventMeta(row) })),
    export_events: exportEvents.map((row) => ({ at: row.created_at, session_id: row.session_id, meta: parseEventMeta(row) })),
    errors: errorEvents.map((row) => ({ at: row.created_at, detail: parseEventMeta(row).error || row.event_value })),
  };
}

async function buildDocumentStats(env) {
  const [totalsRow, sizeRow, statusRows] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count, SUM(chunks_count) AS chunks_total, AVG(chunks_count) AS avg_chunks FROM documents").first(),
    env.DB.prepare("SELECT SUM(size_bytes) AS total_size, AVG(size_bytes) AS avg_size FROM documents WHERE size_bytes IS NOT NULL").first(),
    env.DB.prepare("SELECT status, COUNT(*) AS count FROM documents GROUP BY status").all(),
  ]);
  const indexedCount = (statusRows.results || []).find((row) => row.status === "indexed")?.count || 0;
  const total = Number(totalsRow?.count || 0);

  const [indexedEventsRow, failedEventsRow] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'document_indexed'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'document_index_failed'").first(),
  ]);
  const indexedAttempts = Number(indexedEventsRow?.count || 0);
  const failedAttempts = Number(failedEventsRow?.count || 0);
  const totalAttempts = indexedAttempts + failedAttempts;
  const successRate = totalAttempts ? Math.round((indexedAttempts / totalAttempts) * 1000) / 10 : null;

  return {
    documents_total: total,
    documents_indexed: Number(indexedCount),
    chunks_total: Number(totalsRow?.chunks_total || 0),
    average_chunks_per_document: totalsRow?.avg_chunks != null ? Math.round(totalsRow.avg_chunks * 10) / 10 : null,
    total_size_bytes: sizeRow?.total_size != null ? Number(sizeRow.total_size) : null,
    average_size_bytes: sizeRow?.avg_size != null ? Math.round(Number(sizeRow.avg_size)) : null,
    indexing_success_rate: successRate,
    indexing_attempts: totalAttempts,
    indexing_failures: failedAttempts,
    // Aucune extraction de pages n'est instrumentee aujourd'hui : honnete
    // plutot que d'inventer une moyenne.
    average_pages: null,
  };
}

export function buildDocumentTypeDistributionFromRows(rows) {
  const counts = new Map();
  (rows || []).forEach((row) => {
    const key = row.source_type || row.mime_type || "non mesuré";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

async function buildDocumentTypeDistribution(env) {
  const result = await env.DB.prepare("SELECT source_type, mime_type FROM documents").all();
  return buildDocumentTypeDistributionFromRows(result.results || []);
}

// Activite documentaire par jour, uniquement a partir des evenements reels —
// aucun jour sans evenement n'affiche une valeur generee (0 reel, jamais
// invente).
export function buildDocumentActivitySeries(rows, days = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const byDay = new Map();
  eventRows.forEach((row) => {
    const day = String(row.created_at || "").slice(0, 10);
    if (!day) return;
    if (!byDay.has(day)) byDay.set(day, { date: day, uploaded: 0, indexed: 0, used: 0, deleted: 0, failed: 0 });
    const entry = byDay.get(day);
    if (row.event_type === "document_uploaded") entry.uploaded += 1;
    if (row.event_type === "document_indexed") entry.indexed += 1;
    if (row.event_type === "document_used") entry.used += 1;
    if (row.event_type === "document_deleted") entry.deleted += 1;
    if (row.event_type === "document_index_failed") entry.failed += 1;
  });
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}

export function isDocumentErrorEventType(eventType) {
  return eventType === "document_index_failed";
}

export function buildDocumentErrors(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const errorRows = eventRows.filter((row) => isDocumentErrorEventType(row.event_type));
  return {
    total_error_count: errorRows.length,
    recent: errorRows.slice(0, 20).map((row) => ({ at: row.created_at, documentId: documentIdFromEvent(row), detail: parseEventMeta(row).error || row.event_value })),
    status: errorRows.length === 0 ? "aucune_erreur_recente" : "des_erreurs_recentes",
  };
}

// Statut du pipeline documentaire : jamais "operational" sans signal reel
// (au moins un document_indexed recent, et pas d'echec recent dominant).
export function buildDocumentHealth(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const indexedRows = eventRows.filter((row) => row.event_type === "document_indexed");
  const failedRows = eventRows.filter((row) => row.event_type === "document_index_failed");
  const uploadRows = eventRows.filter((row) => row.event_type === "document_uploaded");
  const lastIndexedAt = indexedRows[0]?.created_at || null;
  const lastFailedAt = failedRows[0]?.created_at || null;
  const hasAnyActivity = eventRows.length > 0;
  const hasRecentIndexed = lastIndexedAt && (Date.now() - new Date(lastIndexedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
  const hasRecentFailed = lastFailedAt && (Date.now() - new Date(lastFailedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;

  let status = "not_configured";
  if (hasAnyActivity) status = "unknown";
  if (hasRecentIndexed && !hasRecentFailed) status = "operational";
  else if (hasRecentIndexed && hasRecentFailed) status = "degraded";
  else if (hasRecentFailed && !hasRecentIndexed) status = "unavailable";

  return {
    status,
    last_indexed_at: lastIndexedAt,
    last_failed_at: lastFailedAt,
    uploads_count: uploadRows.length,
    indexed_count: indexedRows.length,
    failed_count: failedRows.length,
  };
}

async function buildDocumentOverview(env, recentEvents) {
  const [stats, types] = await Promise.all([
    buildDocumentStats(env),
    buildDocumentTypeDistribution(env),
  ]);
  const health = buildDocumentHealth(recentEvents);
  const errors = buildDocumentErrors(recentEvents);
  const activity = buildDocumentActivitySeries(recentEvents);
  return { stats, types, health, errors, activity };
}

// --- Agregats dedies a l'onglet admin "Exports" -----------------------------
// `exports` n'est alimentee que par des exports reellement executes (table
// generique, conversation, document — cf. handleAdminExport /
// handleAdminConversationExport / handleAdminDocumentExport). Aucune ligne,
// KPI ou serie n'est jamais fabriquee : en l'absence de donnees, les
// agregateurs renvoient null/liste vide et le front affiche "aucun export"
// ou "non mesuré".

async function fetchRecentExportEvents(env, limit = 2000) {
  const placeholders = EXPORT_EVENT_TYPES.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE event_type IN (${placeholders})
     ORDER BY created_at DESC, id DESC LIMIT ?`
  ).bind(...EXPORT_EVENT_TYPES, limit).all();
  return result.results || [];
}

function exportWhereClauses({ q, exportType, exportFormat, status }) {
  const clauses = [];
  const bindings = [];
  if (q) {
    clauses.push("(filename LIKE ? OR source_module LIKE ? OR conversation_id = ?)");
    bindings.push(`%${q}%`, `%${q}%`, q);
  }
  if (exportType) {
    clauses.push("export_type = ?");
    bindings.push(exportType);
  }
  if (exportFormat) {
    clauses.push("export_format = ?");
    bindings.push(exportFormat);
  }
  if (status) {
    clauses.push("status = ?");
    bindings.push(status);
  }
  return { whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", bindings };
}

const EXPORT_SORT_COLUMNS = {
  generated_at: "generated_at DESC",
  size_bytes: "size_bytes DESC",
  duration_ms: "duration_ms DESC",
  filename: "filename ASC",
};

async function buildExportList(env, { limit = 20, offset = 0, q = "", exportType = "", exportFormat = "", status = "", sort = "generated_at" } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const { whereSql, bindings } = exportWhereClauses({ q, exportType, exportFormat, status });
  const orderBy = EXPORT_SORT_COLUMNS[sort] || EXPORT_SORT_COLUMNS.generated_at;

  const [totalRow, rowsResult] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM exports ${whereSql}`).bind(...bindings).first(),
    env.DB.prepare(
      `SELECT id, export_type, export_format, source_module, project_id, conversation_id, filename, storage_path, size_bytes, generated_by, generated_at, completed_at, duration_ms, status, error_message, checksum, download_count, downloaded_last_at
       FROM exports ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).bind(...bindings, safeLimit, safeOffset).all(),
  ]);

  return {
    items: rowsResult.results || [],
    total: Number(totalRow?.count || 0),
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function buildExportDetails(env, exportId) {
  const row = await env.DB.prepare(
    `SELECT id, export_type, export_format, source_module, project_id, conversation_id, filename, storage_path, size_bytes, generated_by, generated_at, completed_at, duration_ms, status, error_message, checksum, download_count, downloaded_last_at, metadata_json
     FROM exports WHERE id = ?`
  ).bind(exportId).first();
  if (!row) return null;

  const eventsResult = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at FROM ai_assistant_events
     WHERE event_type IN (${EXPORT_EVENT_TYPES.map(() => "?").join(", ")})
     ORDER BY created_at ASC, id ASC`
  ).bind(...EXPORT_EVENT_TYPES).all();
  const linkedKey = row.conversation_id || row.source_module || String(row.id);
  const timeline = (eventsResult.results || [])
    .filter((evt) => {
      const meta = parseEventMeta(evt);
      return meta.sessionId === row.conversation_id || meta.documentId === row.conversation_id || meta.table === row.source_module || evt.event_value === linkedKey;
    })
    .map((evt) => ({ at: evt.created_at, step: evt.event_type, event_value: evt.event_value || "", is_error: evt.event_type === "export_failed", detail: parseEventMeta(evt) }));

  return { export: row, timeline };
}

async function buildExportStats(env) {
  const [totalsRow, statusRows, sizeRow, durationRow] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM exports").first(),
    env.DB.prepare("SELECT status, COUNT(*) AS count FROM exports GROUP BY status").all(),
    env.DB.prepare("SELECT SUM(size_bytes) AS total_size FROM exports WHERE size_bytes IS NOT NULL").first(),
    env.DB.prepare("SELECT AVG(duration_ms) AS avg_duration FROM exports WHERE duration_ms IS NOT NULL").first(),
  ]);
  const statusCounts = Object.fromEntries((statusRows.results || []).map((row) => [row.status, Number(row.count)]));
  const total = Number(totalsRow?.count || 0);
  const completed = statusCounts.completed || 0;
  const failed = statusCounts.failed || 0;
  const successRate = total ? Math.round((completed / total) * 1000) / 10 : null;

  return {
    exports_total: total,
    exports_completed: completed,
    exports_failed: failed,
    total_size_bytes: sizeRow?.total_size != null ? Number(sizeRow.total_size) : null,
    average_duration_ms: durationRow?.avg_duration != null ? Math.round(Number(durationRow.avg_duration)) : null,
    success_rate: successRate,
  };
}

export function buildExportFormatDistributionFromRows(rows) {
  const counts = new Map();
  (rows || []).forEach((row) => {
    const key = row.export_format || "non mesuré";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

async function buildExportFormatDistribution(env) {
  const result = await env.DB.prepare("SELECT export_format FROM exports").all();
  return buildExportFormatDistributionFromRows(result.results || []);
}

// Activite par jour : exports_completed / exports_failed / exports_downloaded
// + volume exporte et temps moyen, uniquement a partir des lignes reellement
// presentes en table `exports` — aucun jour sans export n'a de valeur
// generee.
export function buildExportActivitySeries(rows, days = 30) {
  const exportRows = Array.isArray(rows) ? rows : [];
  const byDay = new Map();
  exportRows.forEach((row) => {
    const day = String(row.generated_at || "").slice(0, 10);
    if (!day) return;
    if (!byDay.has(day)) byDay.set(day, { date: day, completed: 0, failed: 0, downloaded: 0, volume_bytes: 0, duration_samples: [] });
    const entry = byDay.get(day);
    if (row.status === "completed") entry.completed += 1;
    if (row.status === "failed") entry.failed += 1;
    if (Number(row.download_count) > 0) entry.downloaded += Number(row.download_count);
    if (row.size_bytes != null) entry.volume_bytes += Number(row.size_bytes) || 0;
    if (row.duration_ms != null) entry.duration_samples.push(Number(row.duration_ms));
  });
  return Array.from(byDay.values())
    .map((entry) => ({
      date: entry.date,
      completed: entry.completed,
      failed: entry.failed,
      downloaded: entry.downloaded,
      volume_bytes: entry.volume_bytes,
      average_duration_ms: entry.duration_samples.length ? Math.round(entry.duration_samples.reduce((a, b) => a + b, 0) / entry.duration_samples.length) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

export function isExportErrorStatus(status) {
  return status === "failed";
}

export function buildExportErrors(rows) {
  const exportRows = Array.isArray(rows) ? rows : [];
  const errorRows = exportRows.filter((row) => isExportErrorStatus(row.status));
  return {
    total_error_count: errorRows.length,
    recent: errorRows.slice(0, 20).map((row) => ({ at: row.generated_at, exportId: row.id, detail: row.error_message || "non mesuré" })),
    status: errorRows.length === 0 ? "aucune_erreur_recente" : "des_erreurs_recentes",
  };
}

// Statut du pipeline export : jamais "operational" sans signal reel (au
// moins un export completed recent, et pas d'echec recent dominant).
export function buildExportHealth(rows) {
  const exportRows = Array.isArray(rows) ? rows : [];
  const completedRows = exportRows.filter((row) => row.status === "completed");
  const failedRows = exportRows.filter((row) => row.status === "failed");
  const lastCompletedAt = completedRows[0]?.generated_at || null;
  const lastFailedAt = failedRows[0]?.generated_at || null;
  const hasAnyActivity = exportRows.length > 0;
  const hasRecentCompleted = lastCompletedAt && (Date.now() - new Date(lastCompletedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
  const hasRecentFailed = lastFailedAt && (Date.now() - new Date(lastFailedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;

  let status = "not_configured";
  if (hasAnyActivity) status = "unknown";
  if (hasRecentCompleted && !hasRecentFailed) status = "operational";
  else if (hasRecentCompleted && hasRecentFailed) status = "degraded";
  else if (hasRecentFailed && !hasRecentCompleted) status = "unavailable";

  return {
    status,
    last_completed_at: lastCompletedAt,
    last_failed_at: lastFailedAt,
    completed_count: completedRows.length,
    failed_count: failedRows.length,
  };
}

async function buildExportOverview(env) {
  const rowsResult = await env.DB.prepare(
    `SELECT id, export_type, export_format, status, generated_at, size_bytes, duration_ms, download_count, error_message
     FROM exports ORDER BY generated_at DESC LIMIT 2000`
  ).all();
  const rows = rowsResult.results || [];
  const [stats, formats] = await Promise.all([
    buildExportStats(env),
    buildExportFormatDistribution(env),
  ]);
  const health = buildExportHealth(rows);
  const errors = buildExportErrors(rows);
  const activity = buildExportActivitySeries(rows);
  return { stats, formats, health, errors, activity };
}

// --- Agregats dedies a l'onglet admin "Analytics" ---------------------------
// Aucune table dediee : tout est derive par SQL/JS sur ai_assistant_events
// (+ exports/documents/rag_sources quand pertinent), comme pour Conversations
// et Dashboard. Pas de Math.random(), pas de buildSeries() : une serie sans
// evenement reel renvoie un tableau vide, jamais des points generes.

async function fetchRecentAnalyticsEvents(env, limit = 3000) {
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at, user_agent
     FROM ai_assistant_events ORDER BY created_at DESC, id DESC LIMIT ?`
  ).bind(limit).all();
  return result.results || [];
}

// Reprend la classification reelle deja utilisee cote front
// (admin/index.html aiEventCategory) — aucune nouvelle taxonomie inventee.
export function analyticsEventCategory(eventType) {
  const type = String(eventType || "").toLowerCase();
  if (["user_message", "assistant_response"].includes(type)) return "Messages";
  if (type.startsWith("web_search")) return "Recherche Web";
  if (["pdf_uploaded", "docx_uploaded", "xlsx_uploaded", "csv_uploaded", "pptx_uploaded"].includes(type) || type.startsWith("document_")) return "Documents";
  if (type.startsWith("openrouter_") || type === "fallback_used") return "OpenRouter";
  if (type.startsWith("export_")) return "Exports";
  if (type.startsWith("rag_")) return "RAG";
  if (type.includes("conversation")) return "Conversations";
  if (type.includes("error") || type.includes("failed")) return "Erreurs";
  return "Autres";
}

export function buildAnalyticsKpis(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const sessions = new Set(eventRows.map((row) => row.session_id).filter(Boolean));
  const messages = eventRows.filter((row) => row.event_type === "user_message").length;
  const responses = eventRows.filter((row) => row.event_type === "assistant_response").length;
  const errors = eventRows.filter((row) => isErrorEventType(row.event_type)).length;
  const total = eventRows.length;
  const successRate = total > 0 ? Math.round(((total - errors) / total) * 1000) / 10 : null;
  const ragQueries = eventRows.filter((row) => row.event_type === "rag_query").length;
  const ragMatches = eventRows.filter((row) => row.event_type === "rag_match").length;
  const ragUsageRate = ragQueries > 0 ? Math.round((ragMatches / ragQueries) * 1000) / 10 : null;

  return {
    // Aucune identite utilisateur reelle (pas d'auth) — on mesure des
    // sessions distinctes, jamais un nombre d'"utilisateurs" invente.
    sessions_total: sessions.size,
    messages_sent: messages,
    assistant_responses: responses,
    success_rate: successRate,
    rag_usage_rate: ragUsageRate,
    events_total: total,
    errors_total: errors,
  };
}

export function buildAnalyticsActivitySeries(rows, days = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const byDay = new Map();
  eventRows.forEach((row) => {
    const day = String(row.created_at || "").slice(0, 10);
    if (!day) return;
    if (!byDay.has(day)) byDay.set(day, { date: day, messages: 0, responses: 0, rag_queries: 0, web_searches: 0, errors: 0 });
    const entry = byDay.get(day);
    if (row.event_type === "user_message") entry.messages += 1;
    if (row.event_type === "assistant_response") entry.responses += 1;
    if (row.event_type === "rag_query") entry.rag_queries += 1;
    if (String(row.event_type || "").startsWith("web_search")) entry.web_searches += 1;
    if (isErrorEventType(row.event_type)) entry.errors += 1;
  });
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}

export function buildAnalyticsSessionsPerDay(rows, days = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const byDay = new Map();
  eventRows.forEach((row) => {
    const day = String(row.created_at || "").slice(0, 10);
    if (!day || !row.session_id) return;
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day).add(row.session_id);
  });
  return Array.from(byDay.entries())
    .map(([date, sessions]) => ({ date, sessions: sessions.size }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

// Classification reelle a partir du user_agent deja capture par
// logAiEvent() (cloudflare/worker-openrouter.js) — aucune nouvelle collecte,
// uniquement un parsing honnête d'une donnee deja stockee.
export function classifyUserAgent(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "non mesuré";
  if (/bot|crawler|spider|curl|wget|python-requests|axios|postman/.test(ua)) return "API / Script";
  if (/ipad|tablet/.test(ua)) return "Tablet";
  if (/mobile|iphone|android/.test(ua)) return "Mobile";
  return "Desktop";
}

export function buildAnalyticsDeviceDistribution(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const sessionsByDevice = new Map();
  const seenSessions = new Set();
  eventRows.forEach((row) => {
    if (!row.session_id || seenSessions.has(row.session_id)) return;
    seenSessions.add(row.session_id);
    const device = classifyUserAgent(row.user_agent);
    sessionsByDevice.set(device, (sessionsByDevice.get(device) || 0) + 1);
  });
  return Array.from(sessionsByDevice.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function buildAnalyticsMessageDistribution(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const counts = new Map();
  eventRows.forEach((row) => {
    const category = analyticsEventCategory(row.event_type);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// Reutilise les agregateurs deja valides (Capability/Source/Execution
// Planner, Model Router, RAG, Tavily, Response Quality) plutot que de
// dupliquer leur logique — un domaine sans evenement renvoie "non mesuré".
export function buildAnalyticsDomainSuccess(rows, env) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const planners = buildPlannerSummaryFromEvents(rows);
  const ragUsage = buildRagUsageFromEvents(rows);
  const tavilyUsage = buildTavilyUsageFromEvents(rows, null, env);
  const quality = buildResponseQualityStatsFromEvents(rows);

  const fromErrorRate = (analysesCount, errorRate) => (analysesCount > 0 ? Math.round((100 - errorRate) * 10) / 10 : null);
  const ragTotal = (ragUsage?.searches_performed || 0);
  const ragSuccessRate = ragTotal > 0 ? Math.round(((ragUsage?.matches || 0) / ragTotal) * 1000) / 10 : null;
  const modelSuccesses = eventRows.filter((row) => row.event_type === "openrouter_model_success").length;
  const modelFailures = eventRows.filter((row) => row.event_type === "openrouter_model_failed").length;
  const modelTotal = modelSuccesses + modelFailures;
  const modelSuccessRate = modelTotal > 0 ? Math.round((modelSuccesses / modelTotal) * 1000) / 10 : null;

  const tavilySuccessRows = eventRows.filter((row) => getWebSearchStatus(row.event_type) === "success");
  const tavilyTotal = tavilyUsage?.searches_executed || 0;
  const tavilySuccessRate = tavilyTotal > 0 ? Math.round((tavilySuccessRows.length / tavilyTotal) * 1000) / 10 : null;

  const qualityTotal = quality?.analyzed_count || 0;
  const qualitySuccessRate = quality?.average_score != null ? Math.round(quality.average_score * 10) / 10 : null;

  return [
    { domain: "Capability Planner", success_rate: fromErrorRate(planners.capability.analyses_count, planners.capability.error_rate), sample_size: planners.capability.analyses_count },
    { domain: "Source Planner", success_rate: fromErrorRate(planners.source.analyses_count, planners.source.error_rate), sample_size: planners.source.analyses_count },
    { domain: "Execution Planner", success_rate: fromErrorRate(planners.execution.analyses_count, planners.execution.error_rate), sample_size: planners.execution.analyses_count },
    { domain: "Model Router", success_rate: modelSuccessRate, sample_size: modelTotal },
    { domain: "RAG", success_rate: ragSuccessRate, sample_size: ragTotal },
    { domain: "Recherche Web (Tavily)", success_rate: tavilySuccessRate, sample_size: tavilyTotal },
    { domain: "Qualité de réponse", success_rate: qualitySuccessRate, sample_size: qualityTotal },
  ];
}

// Temps de reponse reel : latence des appels modele (openrouter_model_success,
// meta.latency_ms — cf. cloudflare/modelRouter.js). Aucune latence
// recalculee ni estimee.
export function buildAnalyticsResponseTime(rows, days = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const latencyRows = eventRows
    .filter((row) => row.event_type === "openrouter_model_success")
    .map((row) => ({ day: String(row.created_at || "").slice(0, 10), latency: Number(parseEventMeta(row).latency_ms) }))
    .filter((row) => row.day && Number.isFinite(row.latency));

  const byDay = new Map();
  latencyRows.forEach(({ day, latency }) => {
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(latency);
  });
  const series = Array.from(byDay.entries())
    .map(([date, values]) => ({ date, average_latency_ms: Math.round(values.reduce((a, b) => a + b, 0) / values.length) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);

  const allValues = latencyRows.map((row) => row.latency);
  const overallAverage = allValues.length ? Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length) : null;

  return { series, average_latency_ms: overallAverage, sample_size: allValues.length };
}

// Heatmap reelle jour-de-semaine x heure, calculee depuis created_at (UTC).
// Jamais de matrice generee si aucun evenement.
export function buildAnalyticsHeatmap(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let hasData = false;
  eventRows.forEach((row) => {
    const date = new Date(row.created_at);
    if (Number.isNaN(date.getTime())) return;
    matrix[date.getUTCDay()][date.getUTCHours()] += 1;
    hasData = true;
  });
  return { matrix: hasData ? matrix : [], has_data: hasData };
}

export function buildAnalyticsEventDistribution(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const counts = new Map();
  eventRows.forEach((row) => {
    const category = analyticsEventCategory(row.event_type);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// Messages par modele : reutilise buildOpenRouterModelStatsFromEvents (deja
// valide pour le Dashboard) plutot que de dupliquer le GROUP BY.
export function buildAnalyticsModelDistribution(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const counts = new Map();
  eventRows
    .filter((row) => row.event_type === "openrouter_model_success" || row.event_type === "cloudflare_ai_success")
    .forEach((row) => {
      const meta = parseEventMeta(row);
      const model = meta.resolved_model || meta.model || "non mesuré";
      counts.set(model, (counts.get(model) || 0) + 1);
    });
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// "Intentions" : aucune classification d'intention dediee n'existe.
// Plutot que d'en inventer une, on expose la repartition reelle des
// capacites detectees par le Capability Planner (capability_detected,
// needsRag/needsWeb/...), deja une classification reelle de la requete.
export function buildAnalyticsIntentions(rows) {
  const planners = buildPlannerSummaryFromEvents(rows);
  const breakdown = planners.capability.capability_breakdown || [];
  if (!breakdown.length || !breakdown.some((b) => b.count > 0)) return [];
  const labels = {
    needsRag: "Nécessite RAG",
    needsWeb: "Nécessite recherche web",
    needsTable: "Nécessite tableau",
    needsSources: "Nécessite sources",
    needsMarkdown: "Nécessite markdown",
    needsExport: "Nécessite export",
    needsLongAnswer: "Réponse longue",
  };
  return breakdown.filter((b) => b.count > 0).map((b) => ({ label: labels[b.name] || b.name, value: b.count }));
}

export function buildAnalyticsRealtime(rows, limit = 20) {
  const eventRows = Array.isArray(rows) ? rows : [];
  return eventRows.slice(0, limit).map((row) => ({
    at: row.created_at,
    event_type: row.event_type,
    category: analyticsEventCategory(row.event_type),
    event_value: row.event_value || "",
    session_id: row.session_id || "",
    is_error: isErrorEventType(row.event_type),
  }));
}

async function buildAnalyticsOverview(env) {
  const rows = await fetchRecentAnalyticsEvents(env);
  return {
    kpis: buildAnalyticsKpis(rows),
    activity: buildAnalyticsActivitySeries(rows),
    sessions_per_day: buildAnalyticsSessionsPerDay(rows),
    device_distribution: buildAnalyticsDeviceDistribution(rows),
    message_distribution: buildAnalyticsMessageDistribution(rows),
    domain_success: buildAnalyticsDomainSuccess(rows, env),
    response_time: buildAnalyticsResponseTime(rows),
    heatmap: buildAnalyticsHeatmap(rows),
    event_distribution: buildAnalyticsEventDistribution(rows),
    model_distribution: buildAnalyticsModelDistribution(rows),
    intentions: buildAnalyticsIntentions(rows),
    realtime: buildAnalyticsRealtime(rows),
    events_used: rows.length,
  };
}

// --- Agregats dedies a l'onglet admin "Observabilite" -----------------------
// Aucune table dediee : tout est derive de ai_assistant_events (meme
// principe qu'Analytics/Conversations). Le score de sante par service
// reutilise le module partage cloudflare/serviceHealth.js — aucune logique
// de scoring dupliquee. Un service sans signal reel (aucun evenement
// correspondant) renvoie status "not_configured" et des champs null, jamais
// une valeur fabriquee ("Operationnel" par defaut interdit).

const OBSERVABILITY_EVENT_LIMIT = 3000;

async function fetchRecentObservabilityEvents(env, limit = OBSERVABILITY_EVENT_LIMIT) {
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events ORDER BY created_at DESC, id DESC LIMIT ?`
  ).bind(limit).all();
  return result.results || [];
}

// Verification "lifetime" (hors fenetre des OBSERVABILITY_EVENT_LIMIT
// derniers evenements) : un service a fort volume (ex. Pipeline Documents)
// peut faire sortir de la fenetre analysee des evenements plus anciens mais
// reels d'un autre service (Tavily, RAG, Exports). Sans ce controle, ces
// services apparaissent a tort comme "not_configured" alors qu'ils ont deja
// ete utilises. Une seule requete groupee, sans LIMIT, sur les seuls
// event_type reellement attendus par OBSERVABILITY_SERVICES.
// Champs meta.* exploitables comme duree (cf. latencyField des entrees de
// OBSERVABILITY_SERVICES) — calcules tous les deux par type d'evenement
// dans la requete groupee ci-dessous (cout negligeable, evite une 2e
// requete par champ). Toute valeur absente reste NULL, jamais 0.
const LIFETIME_LATENCY_FIELDS = ["latency_ms", "duration_ms"];

async function fetchObservabilityLifetimeStats(env, services) {
  const types = Array.from(new Set(
    services.flatMap((service) => [...(service.successTypes || []), ...(service.errorTypes || [])])
  ));
  if (!types.length) return {};
  const placeholders = types.map(() => "?").join(",");
  const latencyColumns = LIFETIME_LATENCY_FIELDS
    .map((field) => `AVG(CASE WHEN json_extract(meta, '$.${field}') IS NOT NULL THEN CAST(json_extract(meta, '$.${field}') AS REAL) END) AS avg_${field}`)
    .join(",\n       ");
  const result = await env.DB.prepare(
    `SELECT event_type, COUNT(*) AS count, MAX(created_at) AS last_at,
       ${latencyColumns}
     FROM ai_assistant_events WHERE event_type IN (${placeholders}) GROUP BY event_type`
  ).bind(...types).all();
  const rows = result.results || [];
  const byType = new Map(rows.map((row) => [row.event_type, row]));

  // Aucune activite reelle = aucune disponibilite/latence "mesuree" pour ce
  // service depuis toujours, pas seulement la fenetre recente — distinct de
  // "jamais utilise" (services sans activeProbe ni lifetime, restant
  // "non mesure").
  const statsByServiceKey = {};
  services.forEach((service) => {
    const successTypes = service.successTypes || [];
    const errorTypes = service.errorTypes || [];
    let successCount = 0;
    let errorCount = 0;
    let lastAt = null;
    let latencyWeightedSum = 0;
    let latencyWeight = 0;
    const latencyColumn = service.latencyField ? `avg_${service.latencyField}` : null;

    [...successTypes, ...errorTypes].forEach((type) => {
      const row = byType.get(type);
      if (!row) return;
      const typeCount = Number(row.count || 0);
      if (successTypes.includes(type)) successCount += typeCount;
      if (errorTypes.includes(type)) errorCount += typeCount;
      if (row.last_at && (!lastAt || row.last_at > lastAt)) lastAt = row.last_at;
      if (latencyColumn && successTypes.includes(type) && row[latencyColumn] != null) {
        latencyWeightedSum += Number(row[latencyColumn]) * typeCount;
        latencyWeight += typeCount;
      }
    });

    statsByServiceKey[service.key] = {
      count: successCount + errorCount,
      success_count: successCount,
      error_count: errorCount,
      last_at: lastAt,
      average_latency_ms: latencyWeight > 0 ? Math.round(latencyWeightedSum / latencyWeight) : null,
    };
  });
  return statsByServiceKey;
}

// Definition des services reellement observables depuis ai_assistant_events.
// successTypes/errorTypes : event_type exacts qui constituent une requete
// reussie/en echec pour ce service. latencyField : cle meta lue pour la
// latence (latency_ms ou duration_ms selon l'emetteur).
const OBSERVABILITY_SERVICES = [
  {
    key: "ai_worker", label: "AI Worker (OpenRouter)",
    successTypes: ["openrouter_model_success", "cloudflare_ai_success"],
    errorTypes: ["openrouter_model_failed", "cloudflare_ai_failed", "openrouter_all_models_failed"],
    latencyField: "latency_ms",
  },
  {
    key: "tavily", label: "Recherche Web (Tavily)",
    successTypes: ["web_search_success"],
    errorTypes: ["web_search_error"],
    latencyField: "latency_ms",
  },
  {
    key: "rag_pipeline", label: "RAG Pipeline (Vectorize)",
    // Aucun event_type d'echec dedie n'est journalise pour les requetes RAG
    // elles-memes (rag_no_match est un resultat valide, pas une erreur) — les
    // echecs d'indexation sont deja comptabilises sous le service
    // "Pipeline Documents" (document_index_failed). errorTypes reste vide
    // plutot que de referencer un event_type qui n'est jamais journalise.
    successTypes: ["rag_query", "rag_match", "rag_no_match"],
    errorTypes: [],
    latencyField: "duration_ms",
  },
  {
    key: "documents", label: "Pipeline Documents",
    successTypes: ["document_indexed"],
    errorTypes: ["document_index_failed"],
    latencyField: null,
  },
  {
    key: "exports", label: "Exports",
    successTypes: ["export_completed"],
    errorTypes: ["export_failed"],
    latencyField: null,
  },
  {
    key: "d1_database", label: "D1 Database",
    // Aucun evenement d1_query/d1_error n'est journalise (pas d'instrumentation
    // dediee). Le signal disponible est indirect : chaque ligne de
    // ai_assistant_events est elle-meme une ecriture D1 reussie. On l'utilise
    // comme preuve faible de disponibilite, jamais comme mesure de latence.
    successTypes: null,
    errorTypes: [],
    latencyField: null,
    useAllRowsAsSuccess: true,
  },
];

export function buildSingleServiceHealth(service, rows, lifetimeStats = {}, activeProbes = {}) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const successRows = service.useAllRowsAsSuccess
    ? eventRows
    : eventRows.filter((row) => (service.successTypes || []).includes(row.event_type));
  const errorRows = eventRows.filter((row) => (service.errorTypes || []).includes(row.event_type));
  const windowedTotalRequests = successRows.length + errorRows.length;
  // Si la fenetre analysee (OBSERVABILITY_EVENT_LIMIT derniers evenements)
  // ne contient aucun signal pour ce service, on se rabat sur l'historique
  // complet (lifetimeStats, requete sans LIMIT sur les seuls event_type de
  // ce service) plutot que de conclure "non mesure" : un service a faible
  // volume (Tavily, RAG, Exports) peut etre reellement configure et deja
  // utilise, mais simplement evince de la fenetre par un autre service a
  // fort volume (ex. Pipeline Documents). Disponibilite/latence/requetes
  // refletent alors l'historique complet plutot que la fenetre recente —
  // jamais une valeur fabriquee au-dela de ce que lifetimeStats a reellement
  // mesure en base.
  const lifetime = lifetimeStats[service.key];
  const usingLifetimeFallback = windowedTotalRequests === 0 && Number(lifetime?.count || 0) > 0;
  const totalRequests = usingLifetimeFallback ? lifetime.count : windowedTotalRequests;
  const errorCount = usingLifetimeFallback ? Number(lifetime.error_count || 0) : errorRows.length;
  const lastActivityAt = [...successRows, ...errorRows][0]?.created_at
    || (usingLifetimeFallback ? lifetime.last_at : null);

  let averageLatencyMs = null;
  if (service.latencyField) {
    if (usingLifetimeFallback) {
      averageLatencyMs = lifetime.average_latency_ms ?? null;
    } else {
      const latencies = successRows
        .map((row) => Number(parseEventMeta(row)[service.latencyField]))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (latencies.length) averageLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    }
  }

  const recentWindowMs = 60 * 60 * 1000;
  // null (pas 0) si le service n'a aucune activite mesuree DANS LA FENETRE :
  // le fallback lifetime ci-dessus repond a "disponibilite/latence
  // globales", pas a "y a-t-il eu un echec dans la derniere heure" — une
  // question a laquelle on ne peut honnetement repondre que si la fenetre
  // recente contient elle-meme des evenements de ce service.
  const recentFailureCount = windowedTotalRequests > 0
    ? errorRows.filter((row) => {
      const ts = Date.parse(row.created_at || "");
      return Number.isFinite(ts) && Date.now() - ts <= recentWindowMs;
    }).length
    : null;

  // activeProbeOk : signal direct issu d'un controle reel au moment de la
  // requete (ex. checks.openrouter.ok / checks.vectorize.ok renvoyes par
  // /admin/health du Worker AI), distinct de toute activite passee. Reste
  // null (signal absent du calcul) pour les services sans controle actif
  // disponible (documents, exports, d1_database) ou si le Worker AI n'a pas
  // repondu — jamais une valeur fabriquee.
  const activeProbeOk = typeof activeProbes?.[service.key] === "boolean" ? activeProbes[service.key] : null;

  const health = computeServiceHealthScore({
    totalRequests,
    errorCount,
    averageLatencyMs,
    lastActivityAt,
    recentFailureCount,
    activeProbeOk,
  });

  return {
    key: service.key,
    label: service.label,
    ...health,
  };
}

export function buildServiceHealth(rows, lifetimeStats = {}, activeProbes = {}) {
  return OBSERVABILITY_SERVICES.map((service) => buildSingleServiceHealth(service, rows, lifetimeStats, activeProbes));
}

// Disponibilite/Etat global : moyenne ponderee des services qui ont
// reellement un score (les "non mesure" n'abaissent jamais artificiellement
// le score global).
export function buildObservabilityKpis(rows, services) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const scored = services.filter((s) => s.score != null);
  const globalScore = scored.length ? scored.reduce((sum, s) => sum + s.score, 0) / scored.length : null;
  const globalStatus = globalScore == null ? "not_configured" : (globalScore >= 8.5 ? "operational" : (globalScore >= 6 ? "degraded" : "unavailable"));

  const availabilities = scored.map((s) => s.availability_percent).filter((v) => v != null);
  const availability = availabilities.length ? Math.round((availabilities.reduce((a, b) => a + b, 0) / availabilities.length) * 10) / 10 : null;

  const latencies = scored.map((s) => s.average_latency_ms).filter((v) => v != null);
  const averageLatencyMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  const totalRequests = services.reduce((sum, s) => sum + (s.total_requests || 0), 0);
  const totalErrors = services.reduce((sum, s) => sum + (s.error_count || 0), 0);
  const errorRate = totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 1000) / 10 : null;

  return {
    global_status: globalStatus,
    global_score: globalScore != null ? Math.round(globalScore * 10) / 10 : null,
    availability_percent: availability,
    average_latency_ms: averageLatencyMs,
    total_requests: totalRequests,
    total_errors: totalErrors,
    error_rate_percent: errorRate,
    events_analyzed: eventRows.length,
  };
}

export function observabilitySeverity(eventType) {
  const type = String(eventType || "").toLowerCase();
  if (type.includes("error") || type.includes("failed")) return "error";
  if (type.includes("skipped") || type.includes("degraded") || type.includes("retry") || type.includes("fallback") || type.includes("timeout")) return "warning";
  return "info";
}

export function buildRealtimeLogs(rows, limit = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  return eventRows.slice(0, limit).map((row) => ({
    at: row.created_at,
    level: observabilitySeverity(row.event_type).toUpperCase(),
    event_type: row.event_type,
    event_value: row.event_value || "",
    session_id: row.session_id || "",
  }));
}

// Alertes reelles : un service avec >= seuil d'echecs recents (1h) declenche
// une alerte. Aucune alerte n'est jamais affichee sans evenements d'erreur
// reels en base.
const OBSERVABILITY_ALERT_THRESHOLDS = { elevated: 5, moderate: 1 };

export function buildRealtimeAlerts(rows, services) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const recentWindowMs = 60 * 60 * 1000;
  const alerts = [];

  services.forEach((service) => {
    const def = OBSERVABILITY_SERVICES.find((s) => s.key === service.key);
    if (!def) return;
    const recentErrors = eventRows.filter((row) => {
      if (!(def.errorTypes || []).includes(row.event_type)) return false;
      const ts = Date.parse(row.created_at || "");
      return Number.isFinite(ts) && Date.now() - ts <= recentWindowMs;
    });
    if (!recentErrors.length) return;
    const severity = recentErrors.length >= OBSERVABILITY_ALERT_THRESHOLDS.elevated ? "Élevée" : "Moyenne";
    alerts.push({
      severity,
      service: service.label,
      message: `${recentErrors.length} erreur(s) (${def.errorTypes.join(", ")}) sur la dernière heure`,
      at: recentErrors[0].created_at,
    });
  });

  return alerts.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function buildSystemEvents(rows) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const bySeverity = new Map();
  const byType = new Map();
  eventRows.forEach((row) => {
    const severity = observabilitySeverity(row.event_type);
    bySeverity.set(severity, (bySeverity.get(severity) || 0) + 1);
    byType.set(row.event_type, (byType.get(row.event_type) || 0) + 1);
  });
  return {
    total: eventRows.length,
    by_severity: Array.from(bySeverity.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    by_type: Array.from(byType.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 20),
  };
}

export function buildErrorDistribution(rows, services) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const errorRows = eventRows.filter((row) => observabilitySeverity(row.event_type) === "error");
  const byService = services
    .map((service) => {
      const def = OBSERVABILITY_SERVICES.find((s) => s.key === service.key);
      const count = errorRows.filter((row) => (def?.errorTypes || []).includes(row.event_type)).length;
      return { label: service.label, value: count };
    })
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  return { total_errors: errorRows.length, by_service: byService };
}

// Requetes/minute : nombre d'evenements ai_assistant_events par minute sur
// la derniere heure. Une minute sans evenement vaut 0, jamais une valeur
// interpolee.
export function buildRequestsPerMinute(rows, minutes = 60) {
  const eventRows = Array.isArray(rows) ? rows : [];
  const now = Date.now();
  const buckets = new Map();
  eventRows.forEach((row) => {
    const ts = Date.parse(row.created_at || "");
    if (!Number.isFinite(ts)) return;
    const minutesAgo = Math.floor((now - ts) / 60000);
    if (minutesAgo < 0 || minutesAgo >= minutes) return;
    buckets.set(minutesAgo, (buckets.get(minutesAgo) || 0) + 1);
  });
  const series = [];
  for (let i = minutes - 1; i >= 0; i -= 1) {
    series.push({ minutes_ago: i, requests: buckets.get(i) || 0 });
  }
  return series;
}

export function buildServiceLatencySeries(rows, days = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  return OBSERVABILITY_SERVICES.filter((s) => s.latencyField).map((service) => {
    const successRows = eventRows.filter((row) => (service.successTypes || []).includes(row.event_type));
    const byDay = new Map();
    successRows.forEach((row) => {
      const day = String(row.created_at || "").slice(0, 10);
      const latency = Number(parseEventMeta(row)[service.latencyField]);
      if (!day || !Number.isFinite(latency) || latency <= 0) return;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(latency);
    });
    const series = Array.from(byDay.entries())
      .map(([date, values]) => ({ date, average_latency_ms: Math.round(values.reduce((a, b) => a + b, 0) / values.length) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-days);
    return { service: service.label, series };
  });
}

export function buildServiceErrorRateSeries(rows, days = 30) {
  const eventRows = Array.isArray(rows) ? rows : [];
  return OBSERVABILITY_SERVICES.filter((s) => !s.useAllRowsAsSuccess).map((service) => {
    const byDay = new Map();
    eventRows.forEach((row) => {
      const day = String(row.created_at || "").slice(0, 10);
      if (!day) return;
      const isSuccess = (service.successTypes || []).includes(row.event_type);
      const isError = (service.errorTypes || []).includes(row.event_type);
      if (!isSuccess && !isError) return;
      if (!byDay.has(day)) byDay.set(day, { success: 0, error: 0 });
      const entry = byDay.get(day);
      if (isSuccess) entry.success += 1;
      if (isError) entry.error += 1;
    });
    const series = Array.from(byDay.entries())
      .map(([date, counts]) => ({ date, error_rate_percent: (counts.success + counts.error) > 0 ? Math.round((counts.error / (counts.success + counts.error)) * 1000) / 10 : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-days);
    return { service: service.label, series };
  });
}

// Utilisation CPU/Memoire/Stockage/Reseau : aucune API Workers exposee dans
// ce code ne fournit ces metriques (pas de binding d'observabilite
// d'infrastructure). Honnete plutot que fabrique.
export function buildResourceUsage() {
  return {
    cpu_percent: null,
    memory_percent: null,
    storage_percent: null,
    network_percent: null,
    status: "non_mesure",
    reason: "Aucune métrique d'infrastructure (CPU/mémoire/stockage/réseau) n'est exposée par les bindings Workers actuels.",
  };
}

// Controles actifs reels (pas derives d'evenements passes) disponibles pour
// certains services Observabilite : le Worker AI expose deja ces probes
// dans son propre /admin/health (checks.openrouter pour le modele IA,
// checks.vectorize pour Vectorize, cf. buildAiHealthPayload() et
// checkVectorizeHealth() dans worker-openrouter.js/ragPipeline.js). Sans ce
// signal, un service utilise par rafales (recherches RAG/IA espacees de
// plusieurs heures) decotait jusqu'ici a la seule recence des evenements,
// "Indisponible" alors que le service repond reellement a l'instant du
// controle. Retourne {} (aucun signal) si le Worker AI ne repond pas —
// jamais une valeur fabriquee : buildSingleServiceHealth() retombe alors
// sur les signaux bases evenements seuls, comme avant.
//
// Cas particulier Tavily : contrairement a OpenRouter/Vectorize, on ne
// declenche jamais d'appel reseau synthetique juste pour un health-check
// (chaque recherche Tavily consomme un credit reel et limite). Le signal
// "actif" vient donc de la consommation reelle deja journalisee en D1 :
// l'issue du DERNIER appel Tavily reellement effectue par un utilisateur,
// quelle que soit son anciennete (contrairement a errorRateScore qui ne
// regarde que la fenetre d'evenements recents analysee par Observabilite,
// elle-meme evincable par du bruit haut volume). true si ce dernier appel
// reel a reussi, false s'il a echoue, null si Tavily n'a jamais ete appele.
async function fetchLastRealEventOutcome(env, successTypes = [], errorTypes = []) {
  const types = [...successTypes, ...errorTypes];
  if (!types.length || !env.DB) return null;
  const placeholders = types.map(() => "?").join(",");
  const row = await env.DB.prepare(
    `SELECT event_type FROM ai_assistant_events
     WHERE event_type IN (${placeholders})
     ORDER BY created_at DESC, id DESC LIMIT 1`
  ).bind(...types).first();
  if (!row) return null;
  return successTypes.includes(row.event_type);
}

async function fetchObservabilityActiveProbes(env) {
  const aiWorkerHealthUrl = env.AI_WORKER_HEALTH_URL || "https://digitalblueskye-ai.djelloulabid75.workers.dev/admin/health";
  const aiHealthToken = env.AI_HEALTH_TOKEN || env.HEALTH_CHECK_TOKEN || "";
  const tavilyService = OBSERVABILITY_SERVICES.find((service) => service.key === "tavily");
  const [aiHealthResult, tavilyLastOutcomeOk] = await Promise.all([
    fetchAiWorkerHealth(env, aiWorkerHealthUrl, aiHealthToken, 6000),
    fetchLastRealEventOutcome(env, tavilyService?.successTypes, tavilyService?.errorTypes),
  ]);
  const checks = aiHealthResult?.payload?.checks || null;
  return {
    ai_worker: typeof checks?.openrouter?.ok === "boolean" ? checks.openrouter.ok : null,
    rag_pipeline: typeof checks?.vectorize?.ok === "boolean" ? checks.vectorize.ok : null,
    tavily: tavilyLastOutcomeOk,
  };
}

async function buildObservabilityOverview(env) {
  const rows = await fetchRecentObservabilityEvents(env);
  const lifetimeStats = await fetchObservabilityLifetimeStats(env, OBSERVABILITY_SERVICES);
  const activeProbes = await fetchObservabilityActiveProbes(env);
  const services = buildServiceHealth(rows, lifetimeStats, activeProbes);
  return {
    kpis: buildObservabilityKpis(rows, services),
    services,
    alerts: buildRealtimeAlerts(rows, services),
    logs: buildRealtimeLogs(rows),
    latency: buildServiceLatencySeries(rows),
    error_rate: buildServiceErrorRateSeries(rows),
    requests_per_minute: buildRequestsPerMinute(rows),
    resources: buildResourceUsage(),
    error_distribution: buildErrorDistribution(rows, services),
    system_events: buildSystemEvents(rows),
    events_used: rows.length,
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

// Helper partage entre handleAdminSummary et buildAdminHealthPayload : evite
// de dupliquer la requete dediee Tavily (filtree par event_type, donc jamais
// starvee par le bruit des autres evenements de chat).
async function fetchTavilyEventsWindow(env, limit = 500, cutoffIso = null) {
  // cutoffIso optionnel : les appels existants sans cutoff (limit seul)
  // restent inchanges, cf. usage hors fenetre datee a la ligne ~3915
  // (/admin/summary, hors perimetre de ce lot range).
  const dateClause = cutoffIso ? "AND datetime(created_at) >= datetime(?)" : "";
  const bindings = cutoffIso ? [cutoffIso, limit] : [limit];
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE event_type IN (${webSearchEventTypesSqlList()}) ${dateClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).bind(...bindings).all();
  return result.results || [];
}

// Memes symptome et meme remede que fetchTavilyEventsWindow() ci-dessus : les
// evenements planners (capability_/source_/execution_/tool_/prompt_/
// response_quality_/completion_) sont a faible volume (quelques dizaines au
// total) face au bruit de chat (openrouter_*, assistant_response,
// user_message, model_tier_used... plusieurs par tour). Avec la seule fenetre
// globale recentEvents (LIMIT 500, tous types confondus, cf. plus bas), ils
// se retrouvent integralement evinces dès que quelques dizaines de tours de
// chat se sont ecoules depuis leur emission — d'ou des compteurs ai_state a
// 0 alors que ces evenements existent bien en base. Fenetre dediee, comme
// pour Tavily, independante du volume des autres types d'evenements.
export function plannerEventTypesSqlClause() {
  return [
    "event_type LIKE 'capability_%'",
    "event_type LIKE 'source_%'",
    "event_type LIKE 'execution_%'",
    "event_type LIKE 'tool_%'",
    "event_type LIKE 'prompt_%'",
    "event_type LIKE 'response_quality_%'",
    "event_type LIKE 'completion_%'",
  ].join(" OR ");
}

export async function fetchPlannerEventsWindow(env, limit = 500, cutoffIso = null) {
  // cutoffIso optionnel, meme contrat que fetchTavilyEventsWindow() ci-dessus.
  const dateClause = cutoffIso ? "AND datetime(created_at) >= datetime(?)" : "";
  const bindings = cutoffIso ? [cutoffIso, limit] : [limit];
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE ${plannerEventTypesSqlClause()} ${dateClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).bind(...bindings).all();
  return result.results || [];
}

// Meme symptome et meme remede que fetchTavilyEventsWindow()/
// fetchPlannerEventsWindow() ci-dessus : les recherches RAG (rag_query/
// rag_match/rag_no_match/rag_context_used) sont a faible volume face au
// bruit de chat (openrouter_*, assistant_response...) ET face au bruit
// d'indexation documentaire (document_indexed, des milliers d'evenements).
// Sans fenetre dediee, buildRagUsageFromEvents(recentEvents) les voit
// integralement evinces de la fenetre globale LIMIT 500 — d'ou la carte
// "Recherches RAG" du tableau de bord a 0 alors que ces recherches
// existent bien en base (cf. /admin/observability/overview, qui a deja le
// meme correctif via un mecanisme equivalent pour le Pipeline RAG).
function ragEventTypesSqlClause() {
  return "event_type IN ('rag_query', 'rag_match', 'rag_no_match', 'rag_context_used')";
}

export async function fetchRagEventsWindow(env, limit = 500, cutoffIso = null) {
  const dateClause = cutoffIso ? "AND datetime(created_at) >= datetime(?)" : "";
  const bindings = cutoffIso ? [cutoffIso, limit] : [limit];
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE ${ragEventTypesSqlClause()} ${dateClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).bind(...bindings).all();
  return result.results || [];
}

// Meme symptome et meme remede : les exports (export_started/
// export_completed/export_failed) sont encore plus rares que les
// recherches RAG, donc encore plus exposes a l'eviction par le bruit de
// chat — d'ou la carte "Exports documents" du tableau de bord a 0 malgre
// des exports reels en base (visibles via /admin/exports).
function exportEventTypesSqlClause() {
  return "event_type IN ('export_started', 'export_completed', 'export_failed')";
}

export async function fetchExportEventsWindow(env, limit = 500, cutoffIso = null) {
  const dateClause = cutoffIso ? "AND datetime(created_at) >= datetime(?)" : "";
  const bindings = cutoffIso ? [cutoffIso, limit] : [limit];
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE ${exportEventTypesSqlClause()} ${dateClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).bind(...bindings).all();
  return result.results || [];
}

// Debug non sensible pour diagnostiquer en production si la fenetre dediee
// fetchPlannerEventsWindow() ramene bien des lignes (cf. symptome "ai_state
// planners a zero malgre evenements D1 existants"). Jamais de meta complet —
// uniquement event_type + created_at, deja non sensibles par construction
// (aucune donnee utilisateur dans ces deux colonnes).
export function buildPlannerEventsDebugInfo(plannerEvents) {
  const rows = Array.isArray(plannerEvents) ? plannerEvents : [];
  const eventTypes = Array.from(new Set(rows.map((row) => row.event_type).filter(Boolean)));
  const latestAt = rows.reduce((latest, row) => {
    if (!row.created_at) return latest;
    if (!latest) return row.created_at;
    return new Date(row.created_at) > new Date(latest) ? row.created_at : latest;
  }, null);
  return {
    count: rows.length,
    event_types: eventTypes,
    latest_at: latestAt,
    sample: rows.slice(0, 5).map((row) => ({ event_type: row.event_type, created_at: row.created_at })),
  };
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
    tavilyEvents,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments WHERE status = 'pending'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments WHERE status = 'approved'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM article_comments WHERE status = 'hidden'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM contact_messages").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM consent_logs").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM ai_assistant_events").first(),
    fetchTavilyEventsWindow(env, 500),
  ]);

  // tavily_usage est calcule a partir d'une requete dediee filtree par
  // event_type Tavily (cf. fetchTavilyEventsWindow), jamais starvee par le
  // bruit des autres evenements de chat — cf. buildAdminHealthPayload pour
  // le detail du probleme que ce calcul corrige (carte Tavily vide alors que
  // les evenements existent en base).
  const tavilyUsage = buildTavilyUsageFromEvents(tavilyEvents, null, env);

  const counts = {
    comments_total: Number(commentsTotal?.count || 0),
    comments_pending: Number(commentsPending?.count || 0),
    comments_approved: Number(commentsApproved?.count || 0),
    comments_hidden: Number(commentsHidden?.count || 0),
    contact_messages: Number(contactMessages?.count || 0),
    consent_logs: Number(consentLogs?.count || 0),
    ai_assistant_events: Number(aiEvents?.count || 0),
    conversations_total: null,
  };

  // Bloc "dashboard" additif (cf. tache d'audit du Tableau de bord) : ne
  // remplace pas `summary` ci-dessus, consomme uniquement des sources reelles
  // (ai_assistant_events, maturityEngine.js via buildAdminHealthPayload,
  // compteurs D1 existants). En cas d'echec d'une sous-partie, on degrade
  // proprement plutot que de faire echouer tout l'endpoint /admin/summary.
  const missingSources = [];
  const fallbackFields = [];
  let dashboard = null;
  let recentEventsForDashboard = [];
  try {
    const [health, recentEventsResult] = await Promise.all([
      buildAdminHealthPayload(request, env),
      env.DB.prepare(
        `SELECT id, session_id, event_type, event_value, meta, created_at
         FROM ai_assistant_events
         ORDER BY created_at DESC, id DESC
         LIMIT 1000`
      ).all(),
    ]);
    recentEventsForDashboard = recentEventsResult.results || [];

    const kpis = await buildDashboardKpisFromEvents(env, counts, recentEventsForDashboard);
    const activity = await buildActivitySeriesFromEvents(env, recentEventsForDashboard);
    const services = buildServiceHealthFromEvents(health.services, recentEventsForDashboard, health.checked_at);
    const planners = buildPlannerSummaryFromEvents(recentEventsForDashboard);
    const models = buildModelUsageFromEvents(recentEventsForDashboard);
    const errors = buildErrorStatsFromEvents(recentEventsForDashboard);
    const trends = buildDashboardTrendsFromEvents(kpis);

    if (kpis.comments.today == null) {
      fallbackFields.push("kpis.comments.today/last_7d (requête D1 indisponible)");
    }
    DASHBOARD_NO_TELEMETRY_SERVICES.forEach((name) => {
      missingSources.push(`${name}: aucune télémétrie serveur dédiée`);
    });

    dashboard = {
      maturity: health.maturity, // uniquement depuis maturityEngine.js — jamais recalculé ici
      kpis,
      activity,
      services,
      planners,
      models,
      quality: health.ai_state?.response_quality || null,
      web: health.tavily_usage,
      rag: health.rag_usage,
      documents: health.documents,
      errors,
      trends,
      charts: {
        activity_series: activity,
      },
    };
  } catch (error) {
    dashboard = null;
    missingSources.push(`dashboard: erreur d'agrégation (${error?.message || "inconnue"})`);
  }

  return jsonResponse(request, env, {
    ok: true,
    summary: {
      ...counts,
      tavily_usage: tavilyUsage,
    },
    dashboard,
    dashboard_debug: {
      events_used: recentEventsForDashboard.length,
      time_window: "today / 24h / 7d / 30d / depuis installation",
      missing_sources: missingSources,
      fallback_fields: fallbackFields,
    },
  });
}

// Whitelist stricte : la valeur query string ?range= n'est JAMAIS interpolee
// directement dans du SQL — uniquement les champs numeriques (days/limit) de
// cette table, deja connus et fixes a la deploiement, sont relayes vers les
// requetes parametrees (bind), jamais l'entree utilisateur brute.
const ADMIN_RANGE_PRESETS = Object.freeze({
  "7d": { key: "7d", label: "7 jours", days: 7, limit: 300 },
  "30d": { key: "30d", label: "30 jours", days: 30, limit: 1000 },
  "90d": { key: "90d", label: "90 jours", days: 90, limit: 3000 },
});
const ADMIN_RANGE_DEFAULT = ADMIN_RANGE_PRESETS["30d"];

function parseAdminRange(requestUrl) {
  let rawRange = "";
  try {
    rawRange = new URL(requestUrl).searchParams.get("range") || "";
  } catch (error) {
    rawRange = "";
  }
  return ADMIN_RANGE_PRESETS[rawRange] || ADMIN_RANGE_DEFAULT;
}

async function buildAdminHealthPayload(request, env) {
  const checkedAt = nowIso();
  const range = parseAdminRange(request.url);
  // Cutoff calcule une seule fois en JS (et non recalcule par "now" dans
  // chaque requete SQL parallele) pour garantir que toutes les requetes de
  // cette fonction (evenements, compteurs, moyennes) partagent exactement la
  // meme borne temporelle, sans deriver de quelques millisecondes entre elles.
  const rangeCutoffIso = new Date(Date.now() - range.days * 24 * 60 * 60 * 1000).toISOString();
  const dbConfigured = Boolean(env.DB);
  const adminConfigured = isConfigured(env.ADMIN_TOKEN);
  const frontendOrigin = env.ALLOWED_ORIGIN || "Origine dynamique via CORS";
  const aiWorkerHealthUrl = env.AI_WORKER_HEALTH_URL || "https://digitalblueskye-ai.djelloulabid75.workers.dev/admin/health";
  const aiHealthToken = env.AI_HEALTH_TOKEN || env.HEALTH_CHECK_TOKEN || "";
  const appVersion = env.APP_VERSION || "1.5.0";
  const buildNumber = env.BUILD_NUMBER || checkedAt.slice(0, 10);
  // BUILD_INFO est généré par scripts/generate-build-info.mjs à partir de Git local
  // (jamais de secret) ; les variables d'environnement restent prioritaires si définies
  // (utile pour un déploiement Pages/CI qui connaît son propre commit).
  const commitSha = env.COMMIT_SHA || env.CF_PAGES_COMMIT_SHA || BUILD_INFO?.commit || "local";
  const commitFull = env.COMMIT_SHA_FULL || BUILD_INFO?.commitFull || commitSha;
  const gitBranch = env.BUILD_BRANCH || env.CF_PAGES_BRANCH || BUILD_INFO?.branch || "unknown";
  const deployedAt = env.LAST_DEPLOYED_AT || BUILD_INFO?.buildDate || checkedAt;
  const buildDateLabel = BUILD_INFO?.buildDateLabel || "n/a";
  const buildTimeLabel = BUILD_INFO?.buildTimeLabel || "n/a";
  // Les URL GitHub ne sont jamais reconstruites depuis des secrets : elles viennent
  // uniquement du remote Git local lu par generate-build-info.mjs, ou d'une variable
  // d'environnement explicite si le pipeline de déploiement la fournit.
  const githubCommitUrl = env.GITHUB_COMMIT_URL || BUILD_INFO?.githubCommitUrl || null;
  const githubBranchUrl = env.GITHUB_BRANCH_URL || BUILD_INFO?.githubBranchUrl || null;

  // datetime(created_at) normalise les deux formats de timestamp presents en
  // base ("YYYY-MM-DD HH:MM:SS" via datetime('now') et "YYYY-MM-DDTHH:MM:SS.SSSZ"
  // via new Date().toISOString(), selon le chemin d'insertion historique) —
  // une comparaison de chaines brutes serait faussee par le separateur
  // different ('espace' vs 'T'). range.limit reste une borne de securite,
  // jamais une valeur libre (cf. ADMIN_RANGE_PRESETS).
  const recentEventsPromise = env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE datetime(created_at) >= datetime(?)
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).bind(rangeCutoffIso, range.limit).all();

  // recentEventsPromise ci-dessus melange TOUS les types d'evenements
  // (modele, RQC, RAG, etc. — un seul tour de chat peut en emettre 10-20),
  // donc une fenetre globale peut etre entierement consommee par du bruit de
  // chat recent et ne plus contenir aucun evenement Tavily, meme si ceux-ci
  // existent bien en base sur la meme periode (cause du symptome "carte
  // Tavily parfois vide"). fetchTavilyEventsWindow() garantit jusqu'a
  // range.limit evenements Tavily recents sur la meme fenetre temporelle,
  // independamment du volume des autres types.
  const tavilyEventsPromise = fetchTavilyEventsWindow(env, range.limit, rangeCutoffIso);
  const plannerEventsPromise = fetchPlannerEventsWindow(env, range.limit, rangeCutoffIso);
  const ragEventsPromise = fetchRagEventsWindow(env, range.limit, rangeCutoffIso);
  const exportEventsPromise = fetchExportEventsWindow(env, range.limit, rangeCutoffIso);

  const aiHealthPromise = fetchAiWorkerHealth(env, aiWorkerHealthUrl, aiHealthToken, 10000);

  const frontendHealthPromise = frontendOrigin && frontendOrigin.startsWith("http")
    ? fetchJsonWithTimeout(frontendOrigin, { method: "GET" }, 2200)
    : Promise.resolve({ ok: false, status: 0, payload: null, error: "dynamic_origin" });

  const [
    recentEventsResult,
    tavilyEvents,
    plannerEvents,
    ragEvents,
    exportEvents,
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
    tavilyEventsPromise,
    plannerEventsPromise,
    ragEventsPromise,
    exportEventsPromise,
    aiHealthPromise,
    frontendHealthPromise,
    // Mêmes compteurs qu'avant ce lot, desormais bornes a la fenetre range
    // selectionnee (datetime(created_at) >= datetime(rangeCutoffIso)) — sinon
    // ces totaux seraient restes "depuis toujours" alors que les evenements
    // et le score affiches a cote sont, eux, filtres par periode : on aurait
    // reintroduit une incoherence du meme type que celle corrigee au lot
    // precedent (libelle de periode qui ne correspond pas aux chiffres).
    firstCount(env, "SELECT COUNT(DISTINCT session_id) AS count FROM ai_assistant_events WHERE session_id IS NOT NULL AND session_id != '' AND datetime(created_at) >= datetime(?)", rangeCutoffIso),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE datetime(created_at) >= datetime(?)", rangeCutoffIso),
    firstCount(env, `SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type IN (${webSearchEventTypesSqlList()}) AND datetime(created_at) >= datetime(?)`, rangeCutoffIso),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'pdf_uploaded' AND datetime(created_at) >= datetime(?)", rangeCutoffIso),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'docx_uploaded' AND datetime(created_at) >= datetime(?)", rangeCutoffIso),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'xlsx_uploaded' AND datetime(created_at) >= datetime(?)", rangeCutoffIso),
    firstCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'openrouter_request' AND datetime(created_at) >= datetime(?)", rangeCutoffIso),
    firstNumber(
      env,
      `SELECT AVG(CAST(json_extract(meta, '$.latency_ms') AS REAL)) AS value
       FROM ai_assistant_events
       WHERE event_type IN ('openrouter_response', 'assistant_response')
         AND json_valid(meta)
         AND json_extract(meta, '$.latency_ms') IS NOT NULL
         AND datetime(created_at) >= datetime(?)`,
      "value",
      rangeCutoffIso
    ).then((value) => value == null ? null : Math.round(value)),
    firstNumber(
      env,
      `SELECT AVG(CAST(json_extract(meta, '$.latency_ms') AS REAL)) AS value
       FROM ai_assistant_events
       WHERE event_type = 'web_search_success'
         AND json_valid(meta)
         AND json_extract(meta, '$.latency_ms') IS NOT NULL
         AND datetime(created_at) >= datetime(?)`,
      "value",
      rangeCutoffIso
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
  const tavilyUsage = buildTavilyUsageFromEvents(tavilyEvents, aiHealthResult.payload, env);
  const ragUsage = buildRagUsageFromEvents(ragEvents);
  const openRouterModelStats = buildOpenRouterModelStatsFromEvents(recentEvents);
  const modelTierStats = buildModelTierStatsFromEvents(recentEvents);
  // plannerEvents (fenetre dediee, cf. fetchPlannerEventsWindow) plutot que
  // recentEvents (fenetre globale LIMIT 500 tous types confondus) : ces
  // evenements sont a faible volume et se faisaient evincer par le bruit de
  // chat (openrouter_*, assistant_response...), d'ou des compteurs a 0.
  const promptOrchestratorStats = buildPromptOrchestratorStatsFromEvents(plannerEvents);
  const capabilityPlannerStats = buildCapabilityPlannerStatsFromEvents(plannerEvents);
  const sourcePlannerStats = buildSourcePlannerStatsFromEvents(plannerEvents);
  const executionPlannerStats = buildExecutionPlannerStatsFromEvents(plannerEvents);
  const toolPlannerStats = buildToolPlannerStatsFromEvents(plannerEvents);
  const responseQualityStats = buildResponseQualityStatsFromEvents(plannerEvents);
  const completionGuardStats = buildCompletionGuardStatsFromEvents(plannerEvents);
  const knowledgeOrchestrator = aiHealthResult.payload?.knowledge_orchestrator || {
    enabled: false,
    sources: [],
    documents_count: 0,
    chunks_count: 0,
    last_sync_at: null,
    health_score: null,
    errors: []
  };
  const effectiveOpenRouterCheck = stabilizeOpenRouterCheck(openRouterCheck, openRouterConfigured, latestOpenRouterResponse);
  const tavilyOk = Boolean(tavilyCheck?.ok);
  const frontendOk = Boolean(frontendHealthResult.ok);

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

  // Remplace les statuts litteraux ("operational"/"partial"/"development"
  // devines) des services sans verification dynamique ci-dessus par un statut
  // calcule depuis ai_assistant_events (Upload PDF/DOCX/XLSX) ou "non_mesure"
  // explicite pour les fonctionnalites purement cote navigateur (Memoire
  // conversationnelle, Historique, Agents specialises, RAG documentaire).
  // Netlify/Cloudflare Worker/OpenRouter/Tavily/Recherche web restent
  // inchanges (deja calcules dynamiquement plus haut).
  const servicesWithRealStatus = buildServiceHealthFromEvents(services, recentEvents, checkedAt);

  const checks = {
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
  };

  const statistics = {
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
      { key: "knowledge_documents_count", label: "Documents Knowledge Orchestrator", value: knowledgeOrchestrator.documents_count ?? null, unit: "" },
      { key: "knowledge_chunks_count", label: "Chunks Knowledge Orchestrator", value: knowledgeOrchestrator.chunks_count ?? null, unit: "" },
    ],
    note: "Métriques extensibles depuis ai_assistant_events et les futurs logs serveur.",
  };

  const aiState = {
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
    model_router: openRouterModelStats,
    model_tiers: modelTierStats,
    prompt_orchestrator: promptOrchestratorStats,
    capability_planner: capabilityPlannerStats,
    source_planner: sourcePlannerStats,
    execution_planner: executionPlannerStats,
    tool_planner: toolPlannerStats,
    response_quality: responseQualityStats,
    completion_guard: completionGuardStats,
  };

  // Statut/fiabilite derives des compteurs reels (pdfCount/docxCount/xlsxCount,
  // deja calcules plus haut depuis ai_assistant_events) au lieu de litteraux
  // figes. CSV/PPTX n'ont aucun event_type dedie aujourd'hui -> "non_mesure"
  // explicite plutot qu'une fiabilite simulee.
  const documentReliabilityFromCount = (count) => {
    if (!count) return { status: "aucune_donnee_recente", reliability: "non mesuré" };
    if (count >= 10) return { status: "supported", reliability: "élevée" };
    return { status: "partial", reliability: "moyenne" };
  };
  // success_rate: null partout — aucun event_type d'erreur dedie aux uploads
  // n'existe a ce jour dans ai_assistant_events, donc impossible de calculer
  // un taux de succes reel ; le front affiche "non mesuré" plutot qu'un % simule.
  const documents = [
    { format: "PDF", ...documentReliabilityFromCount(pdfCount), max_tested_size: `${pdfCount} document(s) traité(s)`, last_validation: checkedAt, success_rate: null },
    { format: "DOCX", ...documentReliabilityFromCount(docxCount), max_tested_size: `${docxCount} document(s) traité(s)`, last_validation: checkedAt, success_rate: null },
    { format: "XLSX", ...documentReliabilityFromCount(xlsxCount), max_tested_size: `${xlsxCount} document(s) traité(s)`, last_validation: checkedAt, success_rate: null },
    { format: "CSV", status: "non_mesure", reliability: "non mesuré", max_tested_size: "Aucun événement D1 dédié", last_validation: checkedAt, success_rate: null },
    { format: "PPTX", status: "non_mesure", reliability: "non mesuré", max_tested_size: "Aucun événement D1 dédié", last_validation: checkedAt, success_rate: null },
  ];

  const uniqueEvents = Array.from(
    new Map(recentEvents.concat(tavilyEvents, ragEvents, exportEvents).map((row) => [row.id ?? `${row.event_type}:${row.created_at}:${row.event_value}`, row])).values()
  );
  const maturityDashboard = buildMaturityDashboardPayload({
    events: uniqueEvents,
    tavilyUsage,
    ragUsage,
    aiState,
    services: servicesWithRealStatus,
    documents,
    checks,
    statistics: {
      average_response_ms: averageResponseMs ?? effectiveOpenRouterCheck?.latency_ms ?? null,
      average_web_search_ms: averageWebSearchMs ?? tavilyCheck?.latency_ms ?? null,
    },
    runtime: {
      dbConfigured,
      adminConfigured,
      conversationCount,
      aiEventCount,
      webSearchCount,
      pdfCount,
      docxCount,
      xlsxCount,
      openRouterCount,
    },
  });
  const { maturity, scorecard } = maturityDashboard;

  return {
    ok: true,
    version: "2.0",
    checked_at: checkedAt,
    // Periode reellement appliquee aux requetes D1 ci-dessus (evenements,
    // compteurs, latences moyennes) — jamais juste un libelle decoratif. Le
    // front doit lire ce champ pour afficher la fenetre active, plutot que de
    // se fier a la valeur du <select> qu'il a lui-meme envoyee.
    range: {
      key: range.key,
      label: range.label,
      days: range.days,
      applied: true,
      source: "D1 ai_assistant_events.created_at",
      cutoff_at: rangeCutoffIso,
    },
    // Total reel d'evenements D1 sur la fenetre range appliquee (meme
    // compteur que runtime.aiEventCount passe au moteur de maturite) —
    // expose au niveau racine pour permettre une verification simple
    // (curl ... | jq '.events_total') que le volume varie bien selon range.
    events_total: aiEventCount,
    system: {
      version: appVersion,
      build: buildNumber,
      commit: commitSha,
      commitFull,
      branch: gitBranch,
      buildDateLabel,
      buildTimeLabel,
      githubCommitUrl,
      githubBranchUrl,
      last_deployed_at: deployedAt,
      api_worker: "digitalblueskye-api",
      ai_worker: "digitalblueskye-ai",
      ai_worker_health_url: aiWorkerHealthUrl,
    },
    versioning: {
      version: appVersion,
      build: buildNumber,
      buildDate: deployedAt,
      buildDateLabel,
      buildTimeLabel,
      commit: commitSha,
      commitFull,
      branch: gitBranch,
      githubCommitUrl,
      githubBranchUrl,
      deployedAt,
      // Reference courte vers le versioning du Worker AI (cf.
      // buildAiWorkerVersioning() dans worker-openrouter.js), en plus de
      // health_diagnostics.ai_worker.versioning ci-dessous — pratique pour
      // un consommateur qui ne lit que .versioning sans health_diagnostics.
      ai_worker_versioning: aiHealthResult.payload?.versioning || null,
    },
    maturity,
    scorecard,
    configuration: {
      openrouter_api_key_configured: openRouterConfigured,
      tavily_api_key_configured: tavilyConfigured,
      source: "digitalblueskye-ai",
      source_available: aiHealthAvailable,
    },
    health_diagnostics: {
      api_worker: aiHealthDiagnostics,
      // Le Worker AI expose son propre health_diagnostics (worker, environment,
      // auth_mode, detected_variable_names, etc.) ainsi qu'un bloc versioning
      // distinct (commit/branch/build propres a digitalblueskye-ai, cf.
      // buildAiWorkerVersioning() dans worker-openrouter.js). On les fusionne
      // ici pour exposer une seule entree ai_worker.versioning cote admin,
      // sans casser les champs existants ni masquer un Worker AI qui ne
      // repondrait pas (reste null dans ce cas).
      ai_worker: aiHealthResult.payload?.health_diagnostics
        ? {
            ...aiHealthResult.payload.health_diagnostics,
            versioning: aiHealthResult.payload?.versioning || null,
          }
        : null,
    },
    checks,
    tavily_usage: tavilyUsage,
    rag_usage: ragUsage,
    knowledge_orchestrator: knowledgeOrchestrator,
    services: servicesWithRealStatus,
    statistics,
    recent_activity: {
      limit: 20,
      has_more: recentEvents.length > 20,
      next_offset: recentEvents.length > 20 ? 20 : null,
      items: recentEvents.slice(0, 20).map(formatHealthActivity),
    },
    ai_state: aiState,
    dashboard_debug: {
      planner_events: buildPlannerEventsDebugInfo(plannerEvents),
    },
    documents,
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
  };
}

async function handleAdminHealth(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const payload = await buildAdminHealthPayload(request, env);
  return jsonResponse(request, env, payload);
}

async function handleAdminProjectPlan(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const healthPayload = await buildAdminHealthPayload(request, env);
  const plan = computeProjectPlan(healthPayload);
  return jsonResponse(request, env, {
    ok: true,
    checked_at: healthPayload.checked_at,
    maturity: healthPayload.maturity,
    plan,
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

// --- Onglet admin "Exports" : table transverse exports -----------------------
// N'enregistre que des exports reellement executes par les endpoints
// existants (table generique, conversation, document). Aucune ligne n'est
// jamais fabriquee pour remplir l'UI.

const EXPORT_EVENT_TYPES = [
  "export_requested",
  "export_started",
  "export_completed",
  "export_failed",
  "export_downloaded",
  "export_deleted",
  "export_expired",
];

async function logExportEvent(env, eventType, eventValue, meta, generatedBy = "admin") {
  await env.DB.prepare(
    `INSERT INTO ai_assistant_events (session_id, event_type, event_value, meta, created_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, datetime('now'), 'admin', 'admin-panel')`
  ).bind(String(generatedBy || "admin"), eventType, String(eventValue || "").slice(0, 255), JSON.stringify(meta || {})).run();
}

async function insertExportRecord(env, record) {
  const result = await env.DB.prepare(
    `INSERT INTO exports (export_type, export_format, source_module, project_id, conversation_id, filename, storage_path, size_bytes, generated_by, completed_at, duration_ms, status, error_message, checksum, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    record.export_type,
    record.export_format,
    record.source_module || null,
    record.project_id || null,
    record.conversation_id || null,
    record.filename || null,
    record.storage_path || null,
    record.size_bytes ?? null,
    record.generated_by || "admin",
    record.completed_at || null,
    record.duration_ms ?? null,
    record.status || "completed",
    record.error_message || null,
    record.checksum || null,
    JSON.stringify(record.metadata || {})
  ).run();
  return result?.meta?.last_row_id ?? null;
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

  const startedAt = Date.now();
  await logExportEvent(env, "export_requested", table, { table, format });
  let rows;
  try {
    rows = await env.DB.prepare(`SELECT ${columns.join(", ")} FROM ${table} ORDER BY id DESC`).all();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await logExportEvent(env, "export_failed", table, { table, format, error: detail });
    await insertExportRecord(env, {
      export_type: "table_export", export_format: format, source_module: table,
      status: "failed", error_message: detail, duration_ms: Date.now() - startedAt,
    });
    return jsonResponse(request, env, { ok: false, error: "Export failed" }, 500);
  }
  const filename = `${table}-${new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z")}.json`;
  const body = JSON.stringify({ ok: true, table, items: rows.results || [] }, null, 2);
  await logExportEvent(env, "export_completed", table, { table, format, size_bytes: body.length });
  await insertExportRecord(env, {
    export_type: "table_export", export_format: format, source_module: table, filename,
    size_bytes: body.length, status: "completed", duration_ms: Date.now() - startedAt,
  });
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders(request, env),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function parseConversationListParams(url) {
  return {
    limit: Number(url.searchParams.get("limit")) || 20,
    offset: Number(url.searchParams.get("offset")) || 0,
    q: String(url.searchParams.get("q") || "").trim(),
    model: String(url.searchParams.get("model") || "").trim(),
    hasErrors: url.searchParams.get("has_errors") === "true",
    dateFrom: String(url.searchParams.get("date_from") || "").trim(),
    dateTo: String(url.searchParams.get("date_to") || "").trim(),
    sort: String(url.searchParams.get("sort") || "last_at").trim(),
  };
}

function conversationSessionIdFromPath(pathname, suffix = "") {
  const prefix = "/admin/conversations/";
  if (!pathname.startsWith(prefix)) return "";
  let rest = pathname.slice(prefix.length);
  if (suffix) {
    if (!rest.endsWith(suffix)) return "";
    rest = rest.slice(0, -suffix.length);
  }
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

async function handleAdminConversationsList(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const params = parseConversationListParams(url);
  const list = await buildConversationList(env, params);
  return jsonResponse(request, env, {
    ok: true,
    ...list,
    conversation_debug: {
      events_used: list.items.length,
      time_window: "pagination réelle (GROUP BY session_id), pas de fenêtre fixe",
      missing_sources: [],
      fallback_fields: [],
    },
  });
}

async function handleAdminConversationsSearch(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const params = parseConversationListParams(url);
  const result = await buildConversationSearch(env, params.q, params);
  return jsonResponse(request, env, { ok: true, ...result });
}

async function handleAdminConversationsFilters(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const filters = await buildConversationFilters(env);
  return jsonResponse(request, env, { ok: true, filters });
}

async function handleAdminConversationsStats(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const dateFrom = String(url.searchParams.get("date_from") || "").trim();
  const dateTo = String(url.searchParams.get("date_to") || "").trim();
  const stats = await buildConversationStats(env, { dateFrom, dateTo });
  return jsonResponse(request, env, {
    ok: true,
    stats,
    conversation_debug: {
      events_used: stats.messages,
      time_window: dateFrom || dateTo ? `${dateFrom || "…"} → ${dateTo || "…"}` : "toutes données disponibles",
      missing_sources: stats.tokens_total == null ? ["Coût/Tokens: aucun usage OpenRouter capturé sur la période"] : [],
      fallback_fields: stats.average_satisfaction == null ? ["satisfaction: aucune ligne conversation_feedback"] : [],
    },
  });
}

async function handleAdminConversationsAnalytics(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const recentEventsResult = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events ORDER BY created_at DESC, id DESC LIMIT 2000`
  ).all();
  const recentEvents = recentEventsResult.results || [];
  const analytics = await buildConversationAnalytics(env, recentEvents);
  return jsonResponse(request, env, {
    ok: true,
    analytics,
    conversation_debug: {
      events_used: recentEvents.length,
      time_window: "2000 événements les plus récents",
      missing_sources: [],
      fallback_fields: [],
    },
  });
}

async function handleAdminConversationsTimeline(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const sessionId = String(url.searchParams.get("session_id") || "").trim();
  if (!sessionId) {
    return jsonResponse(request, env, { ok: false, error: "Missing session_id" }, 400);
  }
  const eventsResult = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events WHERE session_id = ? ORDER BY created_at ASC, id ASC`
  ).bind(sessionId).all();
  const events = eventsResult.results || [];
  return jsonResponse(request, env, {
    ok: true,
    session_id: sessionId,
    timeline: buildConversationTimeline(events),
    conversation_debug: {
      events_used: events.length,
      time_window: "historique complet de la session",
      missing_sources: events.length === 0 ? ["Aucun événement pour cette session"] : [],
      fallback_fields: [],
    },
  });
}

async function handleAdminConversationDetails(request, env, sessionId) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const details = await buildConversationDetails(env, sessionId);
  if (!details) {
    return jsonResponse(request, env, { ok: false, error: "Conversation not found" }, 404);
  }
  return jsonResponse(request, env, {
    ok: true,
    conversation: details,
    conversation_debug: {
      events_used: details.message_count,
      time_window: "historique complet de la session",
      missing_sources: details.cost_total == null ? ["Coût: aucun usage.cost renvoyé par le provider pour cette session"] : [],
      fallback_fields: ["Aperçu des messages tronqué à 120 caractères (compactText côté worker-openrouter.js)"],
    },
  });
}

async function handleAdminConversationTags(request, env, sessionId) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const input = await readJsonBody(request);
  const tag = String(input?.tag || "").trim();
  if (!sessionId || !tag) {
    return jsonResponse(request, env, { ok: false, error: "Missing session id or tag" }, 422);
  }
  const createdBy = String(input?.created_by || "admin").trim();
  await env.DB.prepare(
    "INSERT INTO conversation_tags (session_id, tag, created_by) VALUES (?, ?, ?)"
  ).bind(sessionId, tag, createdBy).run();
  return jsonResponse(request, env, { ok: true });
}

async function handleAdminConversationFeedback(request, env, sessionId) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const input = await readJsonBody(request);
  const rating = input?.rating != null ? Number(input.rating) : null;
  const note = String(input?.note || "").trim();
  if (!sessionId || (rating == null && !note)) {
    return jsonResponse(request, env, { ok: false, error: "Missing session id, rating or note" }, 422);
  }
  const createdBy = String(input?.created_by || "admin").trim();
  await env.DB.prepare(
    "INSERT INTO conversation_feedback (session_id, rating, note, created_by) VALUES (?, ?, ?, ?)"
  ).bind(sessionId, Number.isFinite(rating) ? rating : null, note || null, createdBy).run();
  return jsonResponse(request, env, { ok: true });
}

async function handleAdminConversationExport(request, env, sessionId) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const input = await readJsonBody(request);
  const format = String(input?.format || "json").trim().toLowerCase();
  if (!sessionId || !["json", "csv"].includes(format)) {
    return jsonResponse(request, env, { ok: false, error: "Missing session id or invalid format" }, 422);
  }
  const startedAt = Date.now();
  const requestedBy = String(input?.requested_by || "admin").trim();
  await logExportEvent(env, "export_requested", sessionId, { sessionId, format }, requestedBy);
  const eventsResult = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events WHERE session_id = ? ORDER BY created_at ASC, id ASC`
  ).bind(sessionId).all();
  const rows = eventsResult.results || [];
  await env.DB.prepare(
    "INSERT INTO conversation_exports (session_id, format, requested_by) VALUES (?, ?, ?)"
  ).bind(sessionId, format, requestedBy).run();

  if (format === "csv") {
    const columns = ["id", "session_id", "event_type", "event_value", "created_at"];
    const body = toCsv(columns, rows);
    await logExportEvent(env, "export_completed", sessionId, { sessionId, format, size_bytes: body.length }, requestedBy);
    await insertExportRecord(env, {
      export_type: "conversation", export_format: format, source_module: "conversations", conversation_id: sessionId,
      filename: `conversation-${sessionId.slice(0, 8)}.csv`, size_bytes: body.length, generated_by: requestedBy,
      status: "completed", duration_ms: Date.now() - startedAt,
    });
    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders(request, env, "text/csv; charset=utf-8") },
    });
  }
  const jsonBody = JSON.stringify({ ok: true, session_id: sessionId, items: rows });
  await logExportEvent(env, "export_completed", sessionId, { sessionId, format, size_bytes: jsonBody.length }, requestedBy);
  await insertExportRecord(env, {
    export_type: "conversation", export_format: format, source_module: "conversations", conversation_id: sessionId,
    filename: `conversation-${sessionId.slice(0, 8)}.json`, size_bytes: jsonBody.length, generated_by: requestedBy,
    status: "completed", duration_ms: Date.now() - startedAt,
  });
  return jsonResponse(request, env, { ok: true, session_id: sessionId, items: rows });
}

async function fetchRecentRagEvents(env, limit = 2000) {
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at
     FROM ai_assistant_events
     WHERE event_type LIKE 'rag%'
     ORDER BY created_at DESC, id DESC LIMIT ?`
  ).bind(limit).all();
  return result.results || [];
}

function parseRagSourceListParams(url) {
  return {
    limit: Number(url.searchParams.get("limit")) || 20,
    offset: Number(url.searchParams.get("offset")) || 0,
    q: String(url.searchParams.get("q") || "").trim(),
    projectId: String(url.searchParams.get("project_id") || "").trim(),
    status: String(url.searchParams.get("status") || "").trim(),
    sort: String(url.searchParams.get("sort") || "indexed_at").trim(),
  };
}

function ragDebugBlock({ events, sourcesTotal, chunksTotal }) {
  const missing = [];
  if (!sourcesTotal && !chunksTotal) missing.push("Aucune source ni chunk indexé en base D1");
  if (!events.length) missing.push("Aucun événement rag_* trouvé sur la fenêtre observée");
  return {
    events_used: events.length,
    tables_used: ["rag_sources", "rag_chunks", "ai_assistant_events"],
    vectorize_signals: ["rag_query.meta.vector_search", "rag_match/rag_no_match", "rag_context_used.meta.documentId"],
    missing_sources: missing,
    fallback_fields: ["token_count par chunk: non mesuré (non stocké)", "checksum: non mesuré si non transmis par le client"],
    time_window: "2000 événements rag_* les plus récents",
  };
}

async function handleAdminRagOverview(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const events = await fetchRecentRagEvents(env);
  const [overview, sources, projects, chunks, errors] = await Promise.all([
    buildRagOverview(env, events),
    buildRagSourceList(env, { limit: 20, offset: 0 }),
    buildRagProjectStats(env),
    buildRagChunkStats(env),
    Promise.resolve(buildRagErrors(events)),
  ]);
  const searches = buildRagSearchStats(events);
  const activity = buildRagActivitySeries(events);
  return jsonResponse(request, env, {
    ok: true,
    rag: {
      overview,
      projects,
      sources: sources.items,
      chunks,
      searches,
      health: overview.health,
      freshness: overview.freshness,
      coverage: overview.coverage,
      errors,
      activity,
      debug: ragDebugBlock({ events, sourcesTotal: overview.sources_total, chunksTotal: chunks.chunks_total }),
    },
  });
}

async function handleAdminRagSourcesList(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const params = parseRagSourceListParams(url);
  const list = await buildRagSourceList(env, params);
  return jsonResponse(request, env, { ok: true, ...list });
}

async function handleAdminRagSourceDetails(request, env, sourceId) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const details = await buildRagSourceDetails(env, sourceId);
  if (!details) {
    return jsonResponse(request, env, { ok: false, error: "Source not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true, ...details });
}

async function handleAdminRagProjects(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const projects = await buildRagProjectStats(env);
  return jsonResponse(request, env, { ok: true, projects });
}

async function handleAdminRagChunks(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const sourceId = String(url.searchParams.get("source_id") || "").trim();
  if (sourceId) {
    const details = await buildRagSourceDetails(env, sourceId);
    return jsonResponse(request, env, { ok: true, chunks: details?.chunks || [] });
  }
  const stats = await buildRagChunkStats(env);
  return jsonResponse(request, env, { ok: true, chunks: stats });
}

async function handleAdminRagSearches(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const events = await fetchRecentRagEvents(env);
  const searches = buildRagSearchStats(events);
  return jsonResponse(request, env, { ok: true, searches });
}

async function handleAdminRagHealth(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const events = await fetchRecentRagEvents(env);
  const [sourcesCountRow, chunkStats] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM rag_sources").first(),
    buildRagChunkStats(env),
  ]);
  const health = buildRagHealth(events, Number(sourcesCountRow?.count || 0), chunkStats.chunks_total);
  return jsonResponse(request, env, { ok: true, health });
}

async function handleAdminRagActivity(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const events = await fetchRecentRagEvents(env);
  const activity = buildRagActivitySeries(events, days);
  return jsonResponse(request, env, { ok: true, activity });
}

async function handleAdminRagErrors(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const events = await fetchRecentRagEvents(env);
  const errors = buildRagErrors(events);
  return jsonResponse(request, env, { ok: true, errors });
}

async function handleAdminRagDiagnostics(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const diagnostics = await buildRagDiagnostics(env);
  return jsonResponse(request, env, { ok: true, diagnostics });
}

function ragSourceIdFromPath(pathname) {
  const prefix = "/admin/rag/sources/";
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length);
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

async function handleAdminRag(request, env, url) {
  const pathname = url.pathname;
  if (pathname === "/admin/rag") return await handleAdminRagOverview(request, env);
  if (pathname === "/admin/rag/sources") return await handleAdminRagSourcesList(request, env, url);
  if (pathname === "/admin/rag/projects") return await handleAdminRagProjects(request, env);
  if (pathname === "/admin/rag/chunks") return await handleAdminRagChunks(request, env, url);
  if (pathname === "/admin/rag/searches") return await handleAdminRagSearches(request, env);
  if (pathname === "/admin/rag/health") return await handleAdminRagHealth(request, env);
  if (pathname === "/admin/rag/activity") return await handleAdminRagActivity(request, env, url);
  if (pathname === "/admin/rag/errors") return await handleAdminRagErrors(request, env);
  if (pathname === "/admin/rag/diagnostics") return await handleAdminRagDiagnostics(request, env);

  const sourceId = ragSourceIdFromPath(pathname);
  if (sourceId) return await handleAdminRagSourceDetails(request, env, sourceId);

  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

async function fetchKnowledgeOverview(env) {
  const safeCount = async (sql) => {
    try {
      const row = await env.DB.prepare(sql).first();
      return Number(row?.count || 0);
    } catch {
      return 0;
    }
  };
  const [sources, documents, chunks, conflicts, queries, lastSync, avgQuery] = await Promise.all([
    safeCount("SELECT COUNT(*) AS count FROM knowledge_sources"),
    safeCount("SELECT COUNT(*) AS count FROM knowledge_documents WHERE status = 'indexed'"),
    safeCount("SELECT COUNT(*) AS count FROM knowledge_chunks"),
    safeCount("SELECT COUNT(*) AS count FROM knowledge_conflicts"),
    safeCount("SELECT COUNT(*) AS count FROM knowledge_queries"),
    env.DB.prepare("SELECT MAX(last_incremental_sync_at) AS value FROM knowledge_sync_state").first().catch(() => null),
    env.DB.prepare("SELECT AVG(latency_ms) AS value, AVG(confidence) AS confidence FROM knowledge_queries").first().catch(() => null),
  ]);
  const healthScore = sources > 0 ? Math.round(((documents > 0 ? 0.45 : 0) + (chunks > 0 ? 0.35 : 0) + (queries > 0 ? 0.2 : 0)) * 100) : 0;
  return {
    status: sources > 0 ? (chunks > 0 ? "operational" : "partial") : "not_configured",
    sources_count: sources,
    documents_count: documents,
    chunks_count: chunks,
    embeddings_count: chunks,
    conflicts_count: conflicts,
    queries_count: queries,
    last_sync_at: lastSync?.value || null,
    average_search_ms: avgQuery?.value == null ? null : Math.round(Number(avgQuery.value)),
    confidence_avg: avgQuery?.confidence == null ? null : Math.round(Number(avgQuery.confidence) * 1000) / 1000,
    cache: "non mesuré",
    memory: "non mesuré",
    health_score: healthScore
  };
}

async function handleAdminKnowledgeOverview(request, env) {
  if (request.method !== "GET") return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  const [overview, sources, conflicts, queries] = await Promise.all([
    fetchKnowledgeOverview(env),
    handleAdminKnowledgeSourcesData(env),
    handleAdminKnowledgeConflictsData(env),
    handleAdminKnowledgeQueriesData(env),
  ]);
  return jsonResponse(request, env, { ok: true, knowledge: { overview, sources, conflicts, queries } });
}

async function handleAdminKnowledgeSourcesData(env) {
  try {
    const rows = await env.DB.prepare(
      `SELECT s.id, s.type, s.name, s.status, s.last_sync_at,
        COUNT(DISTINCT d.id) AS documents_count,
        COUNT(c.id) AS chunks_count
       FROM knowledge_sources s
       LEFT JOIN knowledge_documents d ON d.source_id = s.id AND d.status = 'indexed'
       LEFT JOIN knowledge_chunks c ON c.source_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC`
    ).all();
    return rows.results || [];
  } catch {
    return [];
  }
}

async function handleAdminKnowledgeSources(request, env) {
  if (request.method !== "GET") return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  return jsonResponse(request, env, { ok: true, sources: await handleAdminKnowledgeSourcesData(env) });
}

async function handleAdminKnowledgeHealth(request, env) {
  if (request.method !== "GET") return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  return jsonResponse(request, env, { ok: true, health: await fetchKnowledgeOverview(env) });
}

async function handleAdminKnowledgeSync(request, env) {
  if (request.method !== "GET") return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  const rows = await env.DB.prepare("SELECT * FROM knowledge_sync_state ORDER BY updated_at DESC LIMIT 100").all().catch(() => ({ results: [] }));
  return jsonResponse(request, env, { ok: true, sync: rows.results || [] });
}

async function handleAdminKnowledgeConflictsData(env) {
  const rows = await env.DB.prepare("SELECT * FROM knowledge_conflicts ORDER BY created_at DESC LIMIT 100").all().catch(() => ({ results: [] }));
  return rows.results || [];
}

async function handleAdminKnowledgeConflicts(request, env) {
  if (request.method !== "GET") return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  return jsonResponse(request, env, { ok: true, conflicts: await handleAdminKnowledgeConflictsData(env) });
}

async function handleAdminKnowledgeQueriesData(env) {
  const rows = await env.DB.prepare("SELECT * FROM knowledge_queries ORDER BY created_at DESC LIMIT 100").all().catch(() => ({ results: [] }));
  return rows.results || [];
}

async function handleAdminKnowledgeQueries(request, env) {
  if (request.method !== "GET") return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  return jsonResponse(request, env, { ok: true, queries: await handleAdminKnowledgeQueriesData(env) });
}

function adminKnowledgeSourceRefreshId(pathname) {
  const prefix = "/admin/knowledge/sources/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith("/refresh")) return "";
  return decodeURIComponent(pathname.slice(prefix.length, -"/refresh".length));
}

async function handleAdminKnowledgeRefresh(request, env, sourceId) {
  if (request.method !== "POST") return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  if (!env.AI_WORKER?.fetch) {
    return jsonResponse(request, env, { ok: false, error: "ai_worker_binding_unavailable" }, 503);
  }
  const body = await request.text();
  const response = await env.AI_WORKER.fetch(new Request("https://digitalblueskye-ai/knowledge/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || JSON.stringify({ source: sourceId })
  }));
  const payload = await response.json().catch(() => ({ ok: false, error: "invalid_ai_worker_response" }));
  return jsonResponse(request, env, payload, response.status);
}

async function handleAdminKnowledge(request, env, url) {
  const pathname = url.pathname;
  if (pathname === "/admin/knowledge") return await handleAdminKnowledgeOverview(request, env);
  if (pathname === "/admin/knowledge/sources") return await handleAdminKnowledgeSources(request, env);
  if (pathname === "/admin/knowledge/health") return await handleAdminKnowledgeHealth(request, env);
  if (pathname === "/admin/knowledge/sync") return await handleAdminKnowledgeSync(request, env);
  if (pathname === "/admin/knowledge/conflicts") return await handleAdminKnowledgeConflicts(request, env);
  if (pathname === "/admin/knowledge/queries") return await handleAdminKnowledgeQueries(request, env);
  const sourceId = adminKnowledgeSourceRefreshId(pathname);
  if (sourceId) return await handleAdminKnowledgeRefresh(request, env, sourceId);
  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

function parseDocumentListParams(url) {
  return {
    limit: Number(url.searchParams.get("limit")) || 20,
    offset: Number(url.searchParams.get("offset")) || 0,
    q: String(url.searchParams.get("q") || "").trim(),
    projectId: String(url.searchParams.get("project_id") || "").trim(),
    status: String(url.searchParams.get("status") || "").trim(),
    sort: String(url.searchParams.get("sort") || "uploaded_at").trim(),
  };
}

function documentIdFromPath(pathname, suffix = "") {
  const prefix = "/admin/documents/";
  if (!pathname.startsWith(prefix)) return "";
  let rest = pathname.slice(prefix.length);
  if (suffix) {
    if (!rest.endsWith(suffix)) return "";
    rest = rest.slice(0, -suffix.length);
  }
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

function documentDebugBlock({ events, documentsTotal }) {
  const missing = [];
  if (!documentsTotal) missing.push("Aucun document indexé en base D1 (table documents vide)");
  if (!events.length) missing.push("Aucun événement document_* trouvé sur la fenêtre observée");
  return {
    events_used: events.length,
    tables_used: ["documents", "rag_chunks", "ai_assistant_events"],
    missing_sources: missing,
    fallback_fields: ["pages_count: non mesuré (extraction de pages non instrumentée)", "average_relevance: non mesuré sans recherches RAG associées"],
    time_window: "2000 événements document_* les plus récents",
  };
}

async function handleAdminDocumentsList(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const params = parseDocumentListParams(url);
  const list = await buildDocumentList(env, params);
  return jsonResponse(request, env, { ok: true, ...list });
}

async function handleAdminDocumentDetails(request, env, documentId) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const details = await buildDocumentDetails(env, documentId);
  if (!details) {
    return jsonResponse(request, env, { ok: false, error: "Document not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true, ...details });
}

async function handleAdminDocumentsStats(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const stats = await buildDocumentStats(env);
  return jsonResponse(request, env, { ok: true, stats });
}

async function handleAdminDocumentsActivity(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const events = await fetchRecentDocumentEvents(env);
  const activity = buildDocumentActivitySeries(events, days);
  return jsonResponse(request, env, { ok: true, activity });
}

async function handleAdminDocumentsTypes(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const types = await buildDocumentTypeDistribution(env);
  return jsonResponse(request, env, { ok: true, types });
}

async function handleAdminDocumentsHealth(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const events = await fetchRecentDocumentEvents(env);
  const health = buildDocumentHealth(events);
  return jsonResponse(request, env, { ok: true, health });
}

async function handleAdminDocumentsExports(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const result = await env.DB.prepare(
    `SELECT id, session_id, event_type, event_value, meta, created_at FROM ai_assistant_events
     WHERE event_type = 'document_exported' ORDER BY created_at DESC LIMIT 100`
  ).all();
  const exports = (result.results || []).map((row) => ({
    at: row.created_at,
    session_id: row.session_id,
    documentId: documentIdFromEvent(row),
    meta: parseEventMeta(row),
  }));
  return jsonResponse(request, env, { ok: true, exports });
}

async function handleAdminDocumentExport(request, env, documentId) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const input = await readJsonBody(request);
  const format = String(input?.format || "json").trim().toLowerCase();
  if (!documentId || !["json"].includes(format)) {
    return jsonResponse(request, env, { ok: false, error: "Missing document id or invalid format" }, 422);
  }
  const startedAt = Date.now();
  const requestedBy = String(input?.requested_by || "admin").trim();
  await logExportEvent(env, "export_requested", documentId, { documentId, format }, requestedBy);
  const details = await buildDocumentDetails(env, documentId);
  if (!details) {
    await logExportEvent(env, "export_failed", documentId, { documentId, format, error: "document_not_found" }, requestedBy);
    return jsonResponse(request, env, { ok: false, error: "Document not found" }, 404);
  }
  await env.DB.prepare(
    `INSERT INTO ai_assistant_events (session_id, event_type, event_value, meta, created_at, ip_address, user_agent)
     VALUES (?, 'document_exported', ?, ?, datetime('now'), 'admin', 'admin-panel')`
  ).bind(requestedBy, details.document.title || documentId, JSON.stringify({ documentId, format, requested_by: requestedBy })).run();
  const responseBody = JSON.stringify({ ok: true, document: details.document, chunks: details.chunks });
  await logExportEvent(env, "export_completed", documentId, { documentId, format, size_bytes: responseBody.length }, requestedBy);
  await insertExportRecord(env, {
    export_type: "document", export_format: format, source_module: "documents", project_id: details.document.project_id || null,
    filename: `document-${String(documentId).slice(0, 24)}.${format}`, size_bytes: responseBody.length, generated_by: requestedBy,
    status: "completed", duration_ms: Date.now() - startedAt,
  });
  return jsonResponse(request, env, { ok: true, document: details.document, chunks: details.chunks });
}

async function handleAdminDocumentsOverview(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const events = await fetchRecentDocumentEvents(env);
  const overview = await buildDocumentOverview(env, events);
  const list = await buildDocumentList(env, { limit: 20, offset: 0 });
  return jsonResponse(request, env, {
    ok: true,
    documents: {
      overview: overview.stats,
      items: list.items,
      total: list.total,
      types: overview.types,
      health: overview.health,
      errors: overview.errors,
      activity: overview.activity,
      debug: documentDebugBlock({ events, documentsTotal: overview.stats.documents_total }),
    },
  });
}

async function handleAdminDocuments(request, env, url) {
  const pathname = url.pathname;
  if (pathname === "/admin/documents") return await handleAdminDocumentsList(request, env, url);
  if (pathname === "/admin/documents/stats") return await handleAdminDocumentsStats(request, env);
  if (pathname === "/admin/documents/activity") return await handleAdminDocumentsActivity(request, env, url);
  if (pathname === "/admin/documents/types") return await handleAdminDocumentsTypes(request, env);
  if (pathname === "/admin/documents/health") return await handleAdminDocumentsHealth(request, env);
  if (pathname === "/admin/documents/exports") return await handleAdminDocumentsExports(request, env, url);
  if (pathname === "/admin/documents/overview") return await handleAdminDocumentsOverview(request, env);

  let documentId = documentIdFromPath(pathname, "/export");
  if (documentId) return await handleAdminDocumentExport(request, env, documentId);

  documentId = documentIdFromPath(pathname);
  if (documentId) return await handleAdminDocumentDetails(request, env, documentId);

  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

function parseExportListParams(url) {
  return {
    limit: Number(url.searchParams.get("limit")) || 20,
    offset: Number(url.searchParams.get("offset")) || 0,
    q: String(url.searchParams.get("q") || "").trim(),
    exportType: String(url.searchParams.get("export_type") || "").trim(),
    exportFormat: String(url.searchParams.get("export_format") || "").trim(),
    status: String(url.searchParams.get("status") || "").trim(),
    sort: String(url.searchParams.get("sort") || "generated_at").trim(),
  };
}

function exportIdFromPath(pathname, suffix = "") {
  const prefix = "/admin/exports/";
  if (!pathname.startsWith(prefix)) return null;
  let rest = pathname.slice(prefix.length);
  if (suffix) {
    if (!rest.endsWith(suffix)) return null;
    rest = rest.slice(0, -suffix.length);
  }
  const id = Number(rest);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function exportsDebugBlock({ rows, exportsTotal }) {
  const missing = [];
  if (!exportsTotal) missing.push("Aucun export enregistré en base D1 (table exports vide)");
  if (!rows.length) missing.push("Aucun événement export_* trouvé sur la fenêtre observée");
  return {
    events_used: rows.length,
    tables_used: ["exports", "conversation_exports", "ai_assistant_events"],
    missing_sources: missing,
    fallback_fields: ["storage_path: non mesuré (exports générés à la demande, jamais persistés sur disque)", "checksum: non mesuré sauf calcul explicite"],
    time_window: "2000 exports les plus récents",
  };
}

async function handleAdminExportsList(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const params = parseExportListParams(url);
  const list = await buildExportList(env, params);
  return jsonResponse(request, env, { ok: true, ...list });
}

async function handleAdminExportDetails(request, env, exportId) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const details = await buildExportDetails(env, exportId);
  if (!details) {
    return jsonResponse(request, env, { ok: false, error: "Export not found" }, 404);
  }
  return jsonResponse(request, env, { ok: true, ...details });
}

async function handleAdminExportsStats(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const stats = await buildExportStats(env);
  return jsonResponse(request, env, { ok: true, stats });
}

async function handleAdminExportsActivity(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const rowsResult = await env.DB.prepare(
    `SELECT id, export_type, export_format, status, generated_at, size_bytes, duration_ms, download_count, error_message FROM exports ORDER BY generated_at DESC LIMIT 2000`
  ).all();
  const activity = buildExportActivitySeries(rowsResult.results || [], days);
  return jsonResponse(request, env, { ok: true, activity });
}

async function handleAdminExportsFormats(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const formats = await buildExportFormatDistribution(env);
  return jsonResponse(request, env, { ok: true, formats });
}

async function handleAdminExportsErrors(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rowsResult = await env.DB.prepare(
    `SELECT id, export_type, export_format, status, generated_at, error_message FROM exports WHERE status = 'failed' ORDER BY generated_at DESC LIMIT 100`
  ).all();
  const errors = buildExportErrors(rowsResult.results || []);
  return jsonResponse(request, env, { ok: true, errors });
}

async function handleAdminExportsHealth(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rowsResult = await env.DB.prepare(
    `SELECT id, export_type, export_format, status, generated_at FROM exports ORDER BY generated_at DESC LIMIT 2000`
  ).all();
  const health = buildExportHealth(rowsResult.results || []);
  return jsonResponse(request, env, { ok: true, health });
}

async function handleAdminExportsOverview(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const overview = await buildExportOverview(env);
  const list = await buildExportList(env, { limit: 20, offset: 0 });
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM exports").first();
  return jsonResponse(request, env, {
    ok: true,
    exports: {
      overview: overview.stats,
      items: list.items,
      total: list.total,
      formats: overview.formats,
      health: overview.health,
      errors: overview.errors,
      activity: overview.activity,
      debug: exportsDebugBlock({ rows: list.items, exportsTotal: Number(totalRow?.count || 0) }),
    },
  });
}

async function handleAdminExportDownload(request, env, exportId) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const row = await env.DB.prepare("SELECT id, export_type, export_format, source_module, conversation_id, filename FROM exports WHERE id = ?").bind(exportId).first();
  if (!row) {
    return jsonResponse(request, env, { ok: false, error: "Export not found" }, 404);
  }
  await env.DB.prepare(
    "UPDATE exports SET download_count = download_count + 1, downloaded_last_at = datetime('now') WHERE id = ?"
  ).bind(exportId).run();
  await logExportEvent(env, "export_downloaded", row.filename || String(exportId), { exportId, export_type: row.export_type, export_format: row.export_format });
  return jsonResponse(request, env, { ok: true, export_id: exportId, message: "Téléchargement enregistré. Le fichier original n'étant pas persisté sur disque, relancez l'export pour régénérer le contenu." });
}

async function handleAdminExportRetry(request, env, exportId) {
  if (request.method !== "POST") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const row = await env.DB.prepare("SELECT id, export_type, export_format, source_module, conversation_id, project_id, status FROM exports WHERE id = ?").bind(exportId).first();
  if (!row) {
    return jsonResponse(request, env, { ok: false, error: "Export not found" }, 404);
  }
  if (row.status !== "failed") {
    return jsonResponse(request, env, { ok: false, error: "Seuls les exports en échec peuvent être relancés" }, 422);
  }
  const startedAt = Date.now();
  await logExportEvent(env, "export_requested", row.filename || String(exportId), { exportId, retry: true });

  if (row.export_type === "table_export" && row.source_module && ALLOWED_EXPORT_TABLES[row.source_module]) {
    const columns = ALLOWED_EXPORT_TABLES[row.source_module];
    try {
      const rows = await env.DB.prepare(`SELECT ${columns.join(", ")} FROM ${row.source_module} ORDER BY id DESC`).all();
      const body = JSON.stringify({ ok: true, table: row.source_module, items: rows.results || [] }, null, 2);
      await logExportEvent(env, "export_completed", row.source_module, { exportId, retry: true, size_bytes: body.length });
      const newId = await insertExportRecord(env, {
        export_type: "table_export", export_format: row.export_format, source_module: row.source_module,
        filename: `${row.source_module}-retry.json`, size_bytes: body.length, status: "completed", duration_ms: Date.now() - startedAt,
      });
      return jsonResponse(request, env, { ok: true, export_id: newId, status: "completed" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await logExportEvent(env, "export_failed", row.source_module, { exportId, retry: true, error: detail });
      const newId = await insertExportRecord(env, {
        export_type: "table_export", export_format: row.export_format, source_module: row.source_module,
        status: "failed", error_message: detail, duration_ms: Date.now() - startedAt,
      });
      return jsonResponse(request, env, { ok: false, export_id: newId, error: detail }, 500);
    }
  }

  return jsonResponse(request, env, { ok: false, error: "Type d'export non rejouable automatiquement dans ce lot" }, 422);
}

async function handleAdminExports(request, env, url) {
  const pathname = url.pathname;
  if (pathname === "/admin/exports") return await handleAdminExportsList(request, env, url);
  if (pathname === "/admin/exports/stats") return await handleAdminExportsStats(request, env);
  if (pathname === "/admin/exports/activity") return await handleAdminExportsActivity(request, env, url);
  if (pathname === "/admin/exports/formats") return await handleAdminExportsFormats(request, env);
  if (pathname === "/admin/exports/errors") return await handleAdminExportsErrors(request, env);
  if (pathname === "/admin/exports/health") return await handleAdminExportsHealth(request, env);
  if (pathname === "/admin/exports/overview") return await handleAdminExportsOverview(request, env);

  let exportId = exportIdFromPath(pathname, "/download");
  if (exportId) return await handleAdminExportDownload(request, env, exportId);

  exportId = exportIdFromPath(pathname, "/retry");
  if (exportId) return await handleAdminExportRetry(request, env, exportId);

  exportId = exportIdFromPath(pathname);
  if (exportId) return await handleAdminExportDetails(request, env, exportId);

  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

function analyticsDebugBlock(eventsUsed) {
  const missing = [];
  if (!eventsUsed) missing.push("Aucun événement ai_assistant_events trouvé sur la fenêtre observée");
  return {
    events_used: eventsUsed,
    tables_used: ["ai_assistant_events"],
    missing_sources: missing,
    fallback_fields: [
      "sessions_total : sessions distinctes (pas d'authentification réelle, pas d'identité utilisateur)",
      "device_distribution : dérivé du user_agent déjà capturé, \"non mesuré\" si absent",
      "intentions : dérivé de la classification réelle du Capability Planner (capability_detected), aucune taxonomie d'intention dédiée n'existe",
    ],
    time_window: "3000 événements ai_assistant_events les plus récents",
  };
}

async function handleAdminAnalyticsOverview(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const overview = await buildAnalyticsOverview(env);
  return jsonResponse(request, env, { ok: true, analytics: { ...overview, debug: analyticsDebugBlock(overview.events_used) } });
}

async function handleAdminAnalyticsActivity(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, {
    ok: true,
    activity: buildAnalyticsActivitySeries(rows, days),
    sessions_per_day: buildAnalyticsSessionsPerDay(rows, days),
  });
}

async function handleAdminAnalyticsModels(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, models: buildAnalyticsModelDistribution(rows) });
}

async function handleAdminAnalyticsEvents(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, events: buildAnalyticsEventDistribution(rows) });
}

async function handleAdminAnalyticsHeatmap(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, heatmap: buildAnalyticsHeatmap(rows) });
}

async function handleAdminAnalyticsSessions(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, sessions: buildAnalyticsDeviceDistribution(rows), sessions_per_day: buildAnalyticsSessionsPerDay(rows) });
}

async function handleAdminAnalyticsMessages(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, messages: buildAnalyticsMessageDistribution(rows) });
}

async function handleAdminAnalyticsIntentions(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, intentions: buildAnalyticsIntentions(rows) });
}

async function handleAdminAnalyticsPerformance(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, performance: buildAnalyticsResponseTime(rows, days) });
}

async function handleAdminAnalyticsErrors(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentAnalyticsEvents(env);
  return jsonResponse(request, env, { ok: true, errors: buildErrorStatsFromEvents(rows) });
}

async function handleAdminAnalyticsRealtime(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const rows = await fetchRecentAnalyticsEvents(env, Math.max(limit, 200));
  return jsonResponse(request, env, { ok: true, realtime: buildAnalyticsRealtime(rows, limit) });
}

async function handleAdminAnalytics(request, env, url) {
  const pathname = url.pathname;
  if (pathname === "/admin/analytics" || pathname === "/admin/analytics/overview") return await handleAdminAnalyticsOverview(request, env);
  if (pathname === "/admin/analytics/activity") return await handleAdminAnalyticsActivity(request, env, url);
  if (pathname === "/admin/analytics/models") return await handleAdminAnalyticsModels(request, env);
  if (pathname === "/admin/analytics/events") return await handleAdminAnalyticsEvents(request, env);
  if (pathname === "/admin/analytics/heatmap") return await handleAdminAnalyticsHeatmap(request, env);
  if (pathname === "/admin/analytics/sessions") return await handleAdminAnalyticsSessions(request, env);
  if (pathname === "/admin/analytics/messages") return await handleAdminAnalyticsMessages(request, env);
  if (pathname === "/admin/analytics/intentions") return await handleAdminAnalyticsIntentions(request, env);
  if (pathname === "/admin/analytics/performance") return await handleAdminAnalyticsPerformance(request, env, url);
  if (pathname === "/admin/analytics/errors") return await handleAdminAnalyticsErrors(request, env);
  if (pathname === "/admin/analytics/realtime") return await handleAdminAnalyticsRealtime(request, env, url);

  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

function observabilityDebugBlock(eventsUsed, services) {
  const missing = [];
  if (!eventsUsed) missing.push("Aucun événement ai_assistant_events trouvé sur la fenêtre observée");
  const notConfigured = (services || []).filter((s) => s.status === "not_configured").map((s) => s.label);
  if (notConfigured.length) missing.push(`Services sans signal réel : ${notConfigured.join(", ")}`);
  return {
    events_used: eventsUsed,
    tables_used: ["ai_assistant_events"],
    missing_sources: missing,
    fallback_fields: [
      "cpu_percent/memory_percent/storage_percent/network_percent : non mesuré (aucun binding d'observabilité d'infrastructure exposé)",
      "D1 Database : disponibilité estimée depuis l'activité d'écriture observée, pas de mesure de latence D1 dédiée",
    ],
    time_window: `${OBSERVABILITY_EVENT_LIMIT} événements les plus récents`,
  };
}

async function handleAdminObservabilityOverview(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const overview = await buildObservabilityOverview(env);
  return jsonResponse(request, env, { ok: true, observability: { ...overview, debug: observabilityDebugBlock(overview.events_used, overview.services) } });
}

async function handleAdminObservabilityServices(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentObservabilityEvents(env);
  const lifetimeStats = await fetchObservabilityLifetimeStats(env, OBSERVABILITY_SERVICES);
  const activeProbes = await fetchObservabilityActiveProbes(env);
  return jsonResponse(request, env, { ok: true, services: buildServiceHealth(rows, lifetimeStats, activeProbes) });
}

async function handleAdminObservabilityLogs(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const rows = await fetchRecentObservabilityEvents(env, Math.max(limit, 200));
  return jsonResponse(request, env, { ok: true, logs: buildRealtimeLogs(rows, limit) });
}

async function handleAdminObservabilityErrors(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentObservabilityEvents(env);
  const services = buildServiceHealth(rows);
  return jsonResponse(request, env, { ok: true, errors: buildErrorDistribution(rows, services) });
}

async function handleAdminObservabilityAlerts(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentObservabilityEvents(env);
  const services = buildServiceHealth(rows);
  return jsonResponse(request, env, { ok: true, alerts: buildRealtimeAlerts(rows, services) });
}

async function handleAdminObservabilityLatency(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const rows = await fetchRecentObservabilityEvents(env);
  return jsonResponse(request, env, { ok: true, latency: buildServiceLatencySeries(rows, days) });
}

async function handleAdminObservabilityRequests(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const minutes = Math.min(180, Math.max(1, Number(url.searchParams.get("minutes")) || 60));
  const rows = await fetchRecentObservabilityEvents(env);
  return jsonResponse(request, env, { ok: true, requests_per_minute: buildRequestsPerMinute(rows, minutes) });
}

async function handleAdminObservabilityResources(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  return jsonResponse(request, env, { ok: true, resources: buildResourceUsage() });
}

async function handleAdminObservabilityEvents(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const rows = await fetchRecentObservabilityEvents(env);
  return jsonResponse(request, env, { ok: true, system_events: buildSystemEvents(rows) });
}

async function handleAdminObservabilityRealtime(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse(request, env, { ok: false, error: "Method not allowed" }, 405);
  }
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const rows = await fetchRecentObservabilityEvents(env, Math.max(limit, 200));
  return jsonResponse(request, env, { ok: true, realtime: buildRealtimeLogs(rows, limit) });
}

async function handleAdminObservability(request, env, url) {
  const pathname = url.pathname;
  if (pathname === "/admin/observability" || pathname === "/admin/observability/overview") return await handleAdminObservabilityOverview(request, env);
  if (pathname === "/admin/observability/services") return await handleAdminObservabilityServices(request, env);
  if (pathname === "/admin/observability/logs") return await handleAdminObservabilityLogs(request, env, url);
  if (pathname === "/admin/observability/errors") return await handleAdminObservabilityErrors(request, env);
  if (pathname === "/admin/observability/alerts") return await handleAdminObservabilityAlerts(request, env);
  if (pathname === "/admin/observability/latency") return await handleAdminObservabilityLatency(request, env, url);
  if (pathname === "/admin/observability/requests") return await handleAdminObservabilityRequests(request, env, url);
  if (pathname === "/admin/observability/resources") return await handleAdminObservabilityResources(request, env);
  if (pathname === "/admin/observability/events") return await handleAdminObservabilityEvents(request, env);
  if (pathname === "/admin/observability/realtime") return await handleAdminObservabilityRealtime(request, env, url);

  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

async function handleAdminConversations(request, env, url) {
  const pathname = url.pathname;
  if (pathname === "/admin/conversations") return await handleAdminConversationsList(request, env, url);
  if (pathname === "/admin/conversations/search") return await handleAdminConversationsSearch(request, env, url);
  if (pathname === "/admin/conversations/filters") return await handleAdminConversationsFilters(request, env);
  if (pathname === "/admin/conversations/stats") return await handleAdminConversationsStats(request, env, url);
  if (pathname === "/admin/conversations/analytics") return await handleAdminConversationsAnalytics(request, env);
  if (pathname === "/admin/conversations/timeline") return await handleAdminConversationsTimeline(request, env, url);

  let sessionId = conversationSessionIdFromPath(pathname, "/tags");
  if (sessionId) return await handleAdminConversationTags(request, env, sessionId);
  sessionId = conversationSessionIdFromPath(pathname, "/feedback");
  if (sessionId) return await handleAdminConversationFeedback(request, env, sessionId);
  sessionId = conversationSessionIdFromPath(pathname, "/export");
  if (sessionId) return await handleAdminConversationExport(request, env, sessionId);

  sessionId = conversationSessionIdFromPath(pathname);
  if (sessionId) return await handleAdminConversationDetails(request, env, sessionId);

  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

async function handleAdmin(request, env, url) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  const pathname = url.pathname;
  if (pathname === "/admin/summary") return await handleAdminSummary(request, env);
  if (pathname === "/admin/health") return await handleAdminHealth(request, env);
  if (pathname === "/admin/project-plan") return await handleAdminProjectPlan(request, env);
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
  if (pathname === "/admin/conversations" || pathname.startsWith("/admin/conversations/")) {
    return await handleAdminConversations(request, env, url);
  }
  if (pathname === "/admin/rag" || pathname.startsWith("/admin/rag/")) {
    return await handleAdminRag(request, env, url);
  }
  if (pathname === "/admin/knowledge" || pathname.startsWith("/admin/knowledge/")) {
    return await handleAdminKnowledge(request, env, url);
  }
  if (pathname === "/admin/documents" || pathname.startsWith("/admin/documents/")) {
    return await handleAdminDocuments(request, env, url);
  }
  if (pathname === "/admin/exports" || pathname.startsWith("/admin/exports/")) {
    return await handleAdminExports(request, env, url);
  }
  if (pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/")) {
    return await handleAdminAnalytics(request, env, url);
  }
  if (pathname === "/admin/observability" || pathname.startsWith("/admin/observability/")) {
    return await handleAdminObservability(request, env, url);
  }
  return jsonResponse(request, env, { ok: false, error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      // Les routes auth/ai exigent un CORS avec credentials (cookie de session).
      if (isAuthOrAiPath(pathname)) return authOptionsResponse(request, env);
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!env.DB) {
      return jsonResponse(request, env, { ok: false, error: "Missing DB binding" }, 500);
    }

    try {
      // Authentification serveur OAuth + proxy IA protege (cf. cloudflare/auth.js).
      if (pathname === "/ai/chat") return await handleAiChat(request, env);
      if (pathname.startsWith("/auth/")) return await handleAuthRoutes(request, env, url);
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
