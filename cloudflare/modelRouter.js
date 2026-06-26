// Model Router — selection de modele(s), retries et cascade de max_tokens,
// independant de la logique chat (prompt RAG/web/memoire) qui reste dans
// worker-openrouter.js. Pense pour pouvoir accueillir demain d'autres
// providers (Cloudflare AI, Mistral, OpenAI direct) sans toucher a l'appelant :
// seul callModel() et buildModelChain() connaissent le detail "OpenRouter".
//
// Interface : routeChatCompletion({ messages, systemPrompt, userPrompt,
// maxTokens, temperature, env, metadata, onEvent, fetchImpl })
//   - messages: historique de conversation (sans le message system), deja
//     enrichi par l'appelant (memoire projet, resume, etc.)
//   - userPrompt: optionnel, ajoute en dernier message 'user' si fourni et
//     pas deja present comme dernier element de `messages`.
//   - onEvent(eventType, payload): callback de telemetrie, appele pour
//     chaque evenement (cf. EVENT_TYPES ci-dessous) — l'appelant decide quoi
//     en faire (D1, console, etc.). Optionnel.
//   - fetchImpl: pour les tests (simulation de reponses sans reseau reel).

import { applyCompletionGuard, resolveMaxContinuations, closeOpenMarkdownStructures } from './completionGuard.js';

export const DEFAULT_MAX_TOKENS = 700;
export const TOKEN_RETRY_LEVELS = [700, 500, 350];
export const LAST_RESORT_MODEL = 'openrouter/auto';
export const MIN_USEFUL_OPENROUTER_TOKENS = 128;

// Lot 6 — Dynamic Model Selection. Le Prompt Orchestrator (cf.
// cloudflare/promptOrchestrator.js) calcule un preferredModelTier par
// requete ('fast' | 'balanced' | 'strong') et le transmet ici via
// routeChatCompletion({ modelTier }). Le tier ne RESTREINT jamais la chaine
// de secours : il se contente de REORDONNER quels modeles sont essayes en
// premier (et, pour 'fast', de tenter Cloudflare AI avant OpenRouter). Si le
// modele priorise echoue, le fallback complet standard reste disponible.
export const MODEL_TIERS = { FAST: 'fast', BALANCED: 'balanced', STRONG: 'strong' };
const VALID_MODEL_TIERS = new Set(Object.values(MODEL_TIERS));

export function normalizeModelTier(tier) {
  const value = String(tier || '').trim().toLowerCase();
  return VALID_MODEL_TIERS.has(value) ? value : MODEL_TIERS.BALANCED;
}

// Sous-ensembles de la chaine standard consideres "rapides" / "robustes" —
// servent uniquement a reordonner buildModelChain(), jamais a la restreindre.
export const FAST_MODEL_HINTS = ['google/gemini-2.5-flash-lite'];
export const STRONG_MODEL_HINTS = ['qwen/qwen3-30b-a3b', 'mistralai/mistral-small-3.2-24b-instruct'];

function reorderChainByTier(chain, modelTier) {
  if (modelTier === MODEL_TIERS.STRONG) {
    const hinted = chain.filter((model) => STRONG_MODEL_HINTS.includes(model));
    if (!hinted.length) return chain;
    const rest = chain.filter((model) => !STRONG_MODEL_HINTS.includes(model));
    return [...hinted, ...rest];
  }
  if (modelTier === MODEL_TIERS.FAST) {
    const hinted = chain.filter((model) => FAST_MODEL_HINTS.includes(model));
    if (!hinted.length) return chain;
    const rest = chain.filter((model) => !FAST_MODEL_HINTS.includes(model));
    return [...hinted, ...rest];
  }
  return chain;
}

// Tier "reellement utilise" pour un succes donne — sert uniquement a la
// telemetrie (model_tier_used), pas a une decision de routage.
function inferUsedTier(provider, model) {
  if (provider === 'cloudflare_ai') return MODEL_TIERS.FAST;
  if (STRONG_MODEL_HINTS.includes(model)) return MODEL_TIERS.STRONG;
  if (FAST_MODEL_HINTS.includes(model)) return MODEL_TIERS.FAST;
  return MODEL_TIERS.BALANCED;
}

// Second provider, hors OpenRouter : Cloudflare Workers AI (env.AI binding,
// deja present pour les embeddings RAG, cf. cloudflare/embeddings.js).
// N'est tente qu'apres l'echec COMPLET de la chaine OpenRouter (y compris
// openrouter/auto) — jamais en remplacement, jamais en concurrence.
// Deux modeles essayes en cascade : si le premier echoue (modele retire du
// catalogue, erreur de nom, quota), on retente une fois avec un second
// modele leger avant d'abandonner.
export const CLOUDFLARE_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
export const CLOUDFLARE_AI_MODEL_CHAIN = [
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.2-3b-instruct'
];

// Liste par defaut si OPENROUTER_MODEL et OPENROUTER_FALLBACK_MODELS sont
// absents. openrouter/auto est volontairement exclu d'ici : il n'est tente
// qu'en tout dernier recours (cf. routeChatCompletion), jamais comme membre
// normal de la chaine, car il echoue en 402 (credit) plutot qu'en 429 et
// gaspille une tentative a chaque fois qu'on l'essaie "en cours de route".
export const DEFAULT_MODEL_CHAIN = [
  'google/gemini-2.5-flash-lite',
  'openai/gpt-oss-120b',
  'qwen/qwen3-30b-a3b',
  'mistralai/mistral-small-3.2-24b-instruct'
];

export const EVENT_TYPES = {
  MODEL_ATTEMPT: 'openrouter_model_attempt',
  MODEL_SUCCESS: 'openrouter_model_success',
  MODEL_FAILED: 'openrouter_model_failed',
  RATE_LIMIT: 'openrouter_rate_limit',
  CREDIT_LIMIT: 'openrouter_credit_limit',
  RETRY_REDUCED_TOKENS: 'openrouter_retry_reduced_tokens',
  ALL_MODELS_FAILED: 'openrouter_all_models_failed',
  MODEL_INVALID: 'model_invalid',
  CLOUDFLARE_AI_ATTEMPT: 'cloudflare_ai_attempt',
  CLOUDFLARE_AI_SUCCESS: 'cloudflare_ai_success',
  CLOUDFLARE_AI_FAILED: 'cloudflare_ai_failed',
  MODEL_TIER_REQUESTED: 'model_tier_requested',
  MODEL_TIER_USED: 'model_tier_used'
};

const USER_MESSAGES = {
  fr: 'Le moteur de génération est temporairement limité. Les sources ont été récupérées lorsque disponibles, mais la reformulation complète n\'a pas pu être générée.',
  en: 'The generation engine is temporarily limited. Sources were retrieved when available, but the full reformulated answer could not be generated.'
};

// Forme attendue : "namespace/model-name" (eventuellement suivi de
// ":free", ":nitro", etc.). Ne garantit pas que le modele existe reellement
// cote OpenRouter (verification a froid, pas d'appel reseau ici) — sert
// uniquement a ecarter une faute de frappe evidente dans une variable
// d'environnement avant de gaspiller une tentative HTTP dessus.
const MODEL_ID_SHAPE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function isValidModelId(modelId) {
  return typeof modelId === 'string' && MODEL_ID_SHAPE.test(modelId.trim());
}

function emit(onEvent, eventType, payload) {
  if (typeof onEvent !== 'function') return;
  try {
    onEvent(eventType, payload);
  } catch (error) {
    console.warn('model_router_onEvent_failed', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Construit la chaine de modeles a essayer, dans l'ordre :
 * 1. env.OPENROUTER_MODEL (si valide)
 * 2. env.OPENROUTER_FALLBACK_MODELS (liste separee par virgules, valides)
 * 3. DEFAULT_MODEL_CHAIN si aucune variable n'est configuree
 * openrouter/auto n'apparait jamais ici : il est ajoute separement par
 * routeChatCompletion comme dernier recours, une seule fois.
 */
export function buildModelChain(env, onEvent, modelTier) {
  const configuredPrimary = String(env?.OPENROUTER_MODEL || '').trim();
  const configuredFallbacks = String(env?.OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  const candidates = configuredPrimary || configuredFallbacks.length
    ? [configuredPrimary, ...configuredFallbacks].filter(Boolean)
    : [...DEFAULT_MODEL_CHAIN];

  const chain = [];
  for (const candidate of candidates) {
    if (candidate === LAST_RESORT_MODEL) continue; // jamais dans la chaine normale
    if (!isValidModelId(candidate)) {
      emit(onEvent, EVENT_TYPES.MODEL_INVALID, { model: candidate });
      console.warn('model_invalid', candidate);
      continue;
    }
    if (!chain.includes(candidate)) chain.push(candidate);
  }
  const baseChain = chain.length ? chain : [...DEFAULT_MODEL_CHAIN];
  return reorderChainByTier(baseChain, normalizeModelTier(modelTier));
}

function classifyFailure(statusCode, upstreamError, isTimeout) {
  if (isTimeout) return 'timeout';
  const msg = String(upstreamError || '').toLowerCase();
  if (statusCode === 429 || msg.includes('rate limit') || msg.includes('free-models-per-day')) return 'rate_limit';
  if (statusCode === 402 || msg.includes('can only afford') || msg.includes('credit')) return 'credit_limit';
  if (statusCode >= 500) return 'provider_error';
  if (!statusCode) return 'provider_error';
  return 'unknown';
}

function extractAffordableTokens(upstreamError) {
  const text = String(upstreamError || '');
  const match = text.match(/can\s+only\s+afford\s+(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function isOpenRouterCreditExhausted(upstreamError) {
  const affordableTokens = extractAffordableTokens(upstreamError);
  return affordableTokens !== null && affordableTokens < MIN_USEFUL_OPENROUTER_TOKENS;
}

function extractReplyContent(parsed) {
  const direct = parsed?.choices?.[0]?.message?.content;
  if (typeof direct === 'string' && direct.trim()) return direct;
  if (Array.isArray(direct)) {
    const joined = direct.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n').trim();
    if (joined) return joined;
  }
  const altText = parsed?.choices?.[0]?.text;
  if (typeof altText === 'string' && altText.trim()) return altText;
  return '';
}

async function callModel({ fetchImpl, apiKey, headers, model, messages, maxTokens, temperature, timeoutMs }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 20000);
  try {
    const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: Number.isFinite(temperature) ? temperature : 0.35,
        max_tokens: maxTokens
      })
    });
    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { /* garde raw, parsed reste null */ }
    const finishReason = parsed?.choices?.[0]?.finish_reason || parsed?.choices?.[0]?.native_finish_reason || null;
    return { ok: response.ok, statusCode: response.status, parsed, finishReason, latencyMs: Date.now() - startedAt, isTimeout: false };
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return {
      ok: false,
      statusCode: 0,
      parsed: null,
      latencyMs: Date.now() - startedAt,
      isTimeout,
      transportError: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractCloudflareAiContent(result) {
  if (typeof result?.response === 'string' && result.response.trim()) return result.response;
  if (typeof result?.result?.response === 'string' && result.result.response.trim()) return result.result.response;
  return '';
}

// Apercu non sensible du payload envoye a env.AI.run() : nombre de messages,
// roles, longueur de chaque contenu — jamais le contenu complet (peut
// contenir des donnees utilisateur/RAG), juste assez pour diagnostiquer un
// payload mal forme (role invalide, contenu vide, trop de messages, etc.).
function summarizePayloadForDiagnostic(messages, maxTokens, temperature) {
  return {
    message_count: Array.isArray(messages) ? messages.length : 0,
    roles: Array.isArray(messages) ? messages.map((m) => m?.role || 'unknown') : [],
    content_lengths: Array.isArray(messages) ? messages.map((m) => String(m?.content || '').length) : [],
    max_tokens: maxTokens,
    temperature
  };
}

function describeCloudflareAiError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || '',
      stack: String(error.stack || '').split('\n').slice(0, 6).join('\n'),
      cause: error.cause
        ? (error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message } : String(error.cause))
        : null
    };
  }
  return { name: 'NonErrorThrown', message: String(error), stack: '', cause: null };
}

/**
 * Second provider, hors OpenRouter : Cloudflare Workers AI (env.AI binding).
 * Ne leve jamais — retourne { ok, content, latencyMs, statusCode, error,
 * errorDetail, payloadSummary }. env.AI peut etre absent (Workers Paid pas
 * active, comme pour Vectorize) : traite comme un echec normal.
 */
async function callCloudflareAiChat({ env, model, messages, maxTokens, temperature }) {
  const startedAt = Date.now();
  const payloadSummary = summarizePayloadForDiagnostic(messages, maxTokens, temperature);
  console.log('cloudflare_ai_call', { model, payload: payloadSummary });

  if (!env?.AI || typeof env.AI.run !== 'function') {
    return { ok: false, statusCode: 0, content: '', latencyMs: 0, error: 'cloudflare_ai_unavailable', errorDetail: null, payloadSummary };
  }
  try {
    const result = await env.AI.run(model, {
      messages,
      max_tokens: maxTokens,
      temperature: Number.isFinite(temperature) ? temperature : 0.35
    });
    const content = extractCloudflareAiContent(result);
    if (!content) {
      console.warn('cloudflare_ai_empty_reply', { model, result_keys: result && typeof result === 'object' ? Object.keys(result) : typeof result });
      return {
        ok: false,
        statusCode: 0,
        content: '',
        latencyMs: Date.now() - startedAt,
        error: 'cloudflare_ai_empty_reply',
        errorDetail: { result_preview: result && typeof result === 'object' ? Object.keys(result) : String(result) },
        payloadSummary
      };
    }
    return { ok: true, statusCode: 200, content, latencyMs: Date.now() - startedAt, payloadSummary };
  } catch (error) {
    const errorDetail = describeCloudflareAiError(error);
    console.error('cloudflare_ai_run_failed', { model, ...errorDetail });
    return {
      ok: false,
      statusCode: 0,
      content: '',
      latencyMs: Date.now() - startedAt,
      error: errorDetail.message || 'cloudflare_ai_run_failed',
      errorDetail,
      payloadSummary
    };
  }
}

/**
 * Mode diagnostic independant : appelle UNIQUEMENT env.AI.run() (jamais
 * OpenRouter, jamais le RAG), pour tester directement le binding Workers AI
 * et chaque modele de la chaine. cf. mode: 'cloudflare_ai_diagnose' dans
 * worker-openrouter.js.
 */
export async function diagnoseCloudflareAi(env, { prompt } = {}) {
  const testMessages = [
    { role: 'system', content: 'You are a diagnostic assistant. Reply with a short confirmation sentence.' },
    { role: 'user', content: prompt || 'Diagnostic ping: please confirm you are working.' }
  ];
  const results = [];
  for (const model of CLOUDFLARE_AI_MODEL_CHAIN) {
    const attemptResult = await callCloudflareAiChat({ env, model, messages: testMessages, maxTokens: 100, temperature: 0.2 });
    results.push({
      model,
      ok: attemptResult.ok,
      latency_ms: attemptResult.latencyMs,
      content_preview: attemptResult.ok ? attemptResult.content.slice(0, 200) : null,
      error: attemptResult.error || null,
      error_detail: attemptResult.errorDetail || null,
      payload_summary: attemptResult.payloadSummary
    });
    if (attemptResult.ok) break;
  }
  const ok = results.some((r) => r.ok);
  return { ok, ai_binding_present: Boolean(env?.AI && typeof env.AI.run === 'function'), results };
}

/**
 * Point d'entree unique du routeur. Ne leve jamais : retourne toujours une
 * forme normalisee { ok: true, ... } ou { ok: false, ... }.
 */
export async function routeChatCompletion({
  messages,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature,
  env,
  metadata,
  modelTier,
  cloudflareAiMaxTokens,
  onEvent,
  fetchImpl,
  timeoutMs
}) {
  const fetcher = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const language = metadata?.language === 'en' ? 'en' : 'fr';
  const requestedModelTier = normalizeModelTier(modelTier);
  emit(onEvent, EVENT_TYPES.MODEL_TIER_REQUESTED, { tier: requestedModelTier });
  const apiKey = String(env?.OPENROUTER_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^OPENROUTER_API_KEY\s*=\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '');

  if (!apiKey) {
    return {
      ok: false,
      provider: 'openrouter',
      attempts: [],
      errorType: 'unknown',
      userMessage: USER_MESSAGES[language]
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': metadata?.allowedOrigin || 'https://digitalblueskye.com',
    'X-Title': 'Digital Blue Skye AI'
  };

  const baseMessages = Array.isArray(messages) ? [...messages] : [];
  if (userPrompt && baseMessages[baseMessages.length - 1]?.content !== userPrompt) {
    baseMessages.push({ role: 'user', content: userPrompt });
  }
  const fullMessages = [{ role: 'system', content: String(systemPrompt || '') }, ...baseMessages];

  const effectiveMaxTokens = Math.max(1, Number(maxTokens) || DEFAULT_MAX_TOKENS);
  const tokenRetryLevels = TOKEN_RETRY_LEVELS
    .map((level) => Math.min(level, effectiveMaxTokens))
    .filter((value, index, array) => index === 0 || value < array[index - 1]);
  if (!tokenRetryLevels.length) tokenRetryLevels.push(effectiveMaxTokens);
  const effectiveCloudflareAiMaxTokens = Math.max(
    tokenRetryLevels[tokenRetryLevels.length - 1],
    Number(cloudflareAiMaxTokens) || tokenRetryLevels[tokenRetryLevels.length - 1]
  );

  const modelChain = buildModelChain(env, onEvent, requestedModelTier);
  const attempts = [];
  let attemptIndex = 0;
  let success = null;
  let lastFailure = null;
  let openRouterCreditExhausted = false;

  async function attemptOnce(model, tokenLimit, isRetryOfSameAttempt) {
    attemptIndex += 1;
    const localIndex = attemptIndex;
    emit(onEvent, EVENT_TYPES.MODEL_ATTEMPT, { model, provider: 'openrouter', tokens_requested: tokenLimit, attempt_index: localIndex, retry: Boolean(isRetryOfSameAttempt) });

    const result = await callModel({
      fetchImpl: fetcher,
      apiKey,
      headers,
      model,
      messages: fullMessages,
      maxTokens: tokenLimit,
      temperature,
      timeoutMs
    });

    const record = {
      model,
      provider: 'openrouter',
      status_code: result.statusCode,
      tokens_requested: tokenLimit,
      attempt_index: localIndex,
      latency_ms: result.latencyMs
    };

    if (result.ok) {
      const content = extractReplyContent(result.parsed);
      if (content) {
        record.error_type = null;
        attempts.push(record);
        emit(onEvent, EVENT_TYPES.MODEL_SUCCESS, { ...record, content_length: content.length, resolved_model: result.parsed?.model || model, finish_reason: result.finishReason });
        success = {
          model,
          content,
          usage: result.parsed?.usage || null,
          tokensRequested: tokenLimit,
          finishReason: result.finishReason
        };
        return true;
      }
      record.error_type = 'empty_reply';
      attempts.push(record);
      lastFailure = { ...record, upstream_error: 'empty_openrouter_reply' };
      emit(onEvent, EVENT_TYPES.MODEL_FAILED, lastFailure);
      return false;
    }

    const upstreamError = result.transportError || result.parsed?.error?.message || result.parsed?.message || 'openrouter_request_failed';
    const errorType = classifyFailure(result.statusCode, upstreamError, result.isTimeout);
    record.error_type = errorType;
    record.upstream_error = String(upstreamError).slice(0, 300);
    const affordableTokens = extractAffordableTokens(upstreamError);
    if (affordableTokens !== null) record.affordable_tokens = affordableTokens;
    attempts.push(record);
    lastFailure = record;
    if (errorType === 'credit_limit' && isOpenRouterCreditExhausted(upstreamError)) {
      openRouterCreditExhausted = true;
    }

    emit(onEvent, EVENT_TYPES.MODEL_FAILED, record);
    if (errorType === 'rate_limit') emit(onEvent, EVENT_TYPES.RATE_LIMIT, record);
    if (errorType === 'credit_limit') emit(onEvent, EVENT_TYPES.CREDIT_LIMIT, record);
    return false;
  }

  // Second provider, hors OpenRouter : cascade de modeles legers (cf.
  // CLOUDFLARE_AI_MODEL_CHAIN). Factorise pour pouvoir etre appele soit en
  // PRIORITE (tier 'fast'), soit en dernier recours (apres echec complet de
  // la chaine OpenRouter) — meme logique, deux points d'appel. Retourne la
  // forme finale de routeChatCompletion en cas de succes, sinon null (et
  // continue d'alimenter `attempts`/`lastCloudflareAiRecord` pour le flux
  // appelant).
  let lastCloudflareAiRecord = null;
  async function attemptCloudflareAiChain(cloudflareAiTokenLimit) {
    for (const cloudflareAiModel of CLOUDFLARE_AI_MODEL_CHAIN) {
      attemptIndex += 1;
      const cloudflareAiAttemptIndex = attemptIndex;
      emit(onEvent, EVENT_TYPES.CLOUDFLARE_AI_ATTEMPT, {
        model: cloudflareAiModel,
        provider: 'cloudflare_ai',
        tokens_requested: cloudflareAiTokenLimit,
        attempt_index: cloudflareAiAttemptIndex
      });
      const cloudflareAiStartedAt = Date.now();
      const cloudflareAiResult = await callCloudflareAiChat({
        env,
        model: cloudflareAiModel,
        messages: fullMessages,
        maxTokens: cloudflareAiTokenLimit,
        temperature
      });
      const cloudflareAiRecord = {
        model: cloudflareAiModel,
        provider: 'cloudflare_ai',
        status_code: cloudflareAiResult.statusCode,
        tokens_requested: cloudflareAiTokenLimit,
        attempt_index: cloudflareAiAttemptIndex,
        latency_ms: cloudflareAiResult.latencyMs ?? (Date.now() - cloudflareAiStartedAt)
      };

      if (cloudflareAiResult.ok) {
        cloudflareAiRecord.error_type = null;
        attempts.push(cloudflareAiRecord);
        emit(onEvent, EVENT_TYPES.CLOUDFLARE_AI_SUCCESS, { ...cloudflareAiRecord, content_length: cloudflareAiResult.content.length });
        // Pas de continuation pour le provider de secours (env.AI.run ne fournit
        // pas de finish_reason fiable), mais on ferme tout de meme les structures
        // Markdown laissees ouvertes par une eventuelle troncature.
        const guardEnabled = String(env?.COMPLETION_GUARD_ENABLED ?? 'true').toLowerCase() !== 'false';
        const closed = guardEnabled ? closeOpenMarkdownStructures(cloudflareAiResult.content) : { text: cloudflareAiResult.content, meta: null };
        emit(onEvent, EVENT_TYPES.MODEL_TIER_USED, {
          tier_requested: requestedModelTier,
          tier_used: inferUsedTier('cloudflare_ai', cloudflareAiModel),
          provider: 'cloudflare_ai',
          model: cloudflareAiModel,
          success: true
        });
        return {
          ok: true,
          provider: 'cloudflare_ai',
          model: cloudflareAiModel,
          tokensRequested: cloudflareAiTokenLimit,
          attempts,
          content: closed.text,
          usage: null,
          completionGuard: closed.meta ? { continuations: 0, structure: closed.meta } : null
        };
      }

      cloudflareAiRecord.error_type = cloudflareAiResult.error === 'cloudflare_ai_unavailable' ? 'provider_unavailable' : 'unknown';
      cloudflareAiRecord.upstream_error = String(cloudflareAiResult.error || 'cloudflare_ai_failed').slice(0, 300);
      cloudflareAiRecord.error_detail = cloudflareAiResult.errorDetail || null;
      cloudflareAiRecord.payload_summary = cloudflareAiResult.payloadSummary || null;
      attempts.push(cloudflareAiRecord);
      emit(onEvent, EVENT_TYPES.CLOUDFLARE_AI_FAILED, cloudflareAiRecord);
      lastCloudflareAiRecord = cloudflareAiRecord;

      // Binding absent : inutile de retenter avec un autre nom de modele, le
      // resultat sera identique pour tous les modeles de la chaine.
      if (cloudflareAiRecord.error_type === 'provider_unavailable') break;
    }
    return null;
  }

  // Lot 6 — pour le tier 'fast', on privilegie Cloudflare AI (latence plus
  // faible) AVANT meme d'attaquer la chaine OpenRouter standard. En cas
  // d'echec (binding absent, quota, modele retire), on retombe immediatement
  // sur le flux normal ci-dessous — aucune perte de fallback.
  let cloudflareAiAlreadyAttempted = false;
  let earlyCloudflareAiResult = null;
  if (requestedModelTier === MODEL_TIERS.FAST) {
    cloudflareAiAlreadyAttempted = true;
    earlyCloudflareAiResult = await attemptCloudflareAiChain(effectiveCloudflareAiMaxTokens);
  }

  if (!earlyCloudflareAiResult) {
    modelLoop:
    for (const model of modelChain) {
      let retriedTransientOnce = false;
      for (let levelIndex = 0; levelIndex < tokenRetryLevels.length; levelIndex += 1) {
        const tokenLimit = tokenRetryLevels[levelIndex];
        const ok = await attemptOnce(model, tokenLimit, false);
        if (ok) break modelLoop;

        const errorType = lastFailure?.error_type;

        // 402 avec credit restant trop faible : le plafond concerne la cle
        // OpenRouter, pas un modele specifique. Continuer la cascade ne fait
        // que multiplier les echecs; on bascule directement vers le provider
        // de secours si disponible.
        if (openRouterCreditExhausted) break modelLoop;

        // 402 (credit) : meme modele, niveau de tokens reduit.
        if (errorType === 'credit_limit' && levelIndex < tokenRetryLevels.length - 1) {
          const nextTokenLimit = tokenRetryLevels[levelIndex + 1];
          emit(onEvent, EVENT_TYPES.RETRY_REDUCED_TOKENS, { model, from_max_tokens: tokenLimit, to_max_tokens: nextTokenLimit });
          continue;
        }

        // 5xx/timeout : un seul retry sur le meme modele/niveau, puis modele suivant.
        if ((errorType === 'provider_error' || errorType === 'timeout') && !retriedTransientOnce) {
          retriedTransientOnce = true;
          const retryOk = await attemptOnce(model, tokenLimit, true);
          if (retryOk) break modelLoop;
        }

        // 429 (rate limit) ou tout le reste : modele suivant.
        break;
      }
    }
  }

  // Completion Guard : si OpenRouter a tronque la reponse (finish_reason
  // 'length'), on relance le MEME modele pour continuer, fusionne les
  // morceaux et ferme les structures Markdown restees ouvertes — avant de
  // renvoyer au worker (donc au frontend). Desactivable via
  // env.COMPLETION_GUARD_ENABLED='false'. Applique aux deux chemins de succes
  // OpenRouter (chaine normale + dernier recours openrouter/auto).
  async function finalizeOpenRouterSuccess() {
    const guardEnabled = String(env?.COMPLETION_GUARD_ENABLED ?? 'true').toLowerCase() !== 'false';
    const maxContinuations = resolveMaxContinuations(env?.COMPLETION_GUARD_MAX_CONTINUATIONS);

    // Une continuation = un appel supplementaire au modele qui a reussi, avec
    // la reponse partielle injectee comme tour 'assistant' + une consigne de
    // poursuite stricte (pas de repetition, pas de reintroduction).
    const requestContinuation = async (accumulated) => {
      const continuationMessages = [
        ...fullMessages,
        { role: 'assistant', content: accumulated },
        {
          role: 'user',
          content: language === 'en'
            ? 'Continue your previous answer exactly where it stopped. Do not repeat any already-written text, do not reintroduce the topic, do not add any intro. Resume directly, keeping the same Markdown structure (tables, lists, code blocks).'
            : "Poursuis ta réponse précédente exactement là où elle s'est arrêtée. Ne répète aucun texte déjà écrit, ne réintroduis pas le sujet, n'ajoute aucune formule d'introduction. Reprends directement, en conservant la même structure Markdown (tableaux, listes, blocs de code)."
        }
      ];
      const contResult = await callModel({
        fetchImpl: fetcher,
        apiKey,
        headers,
        model: success.model,
        messages: continuationMessages,
        maxTokens: success.tokensRequested,
        temperature,
        timeoutMs
      });
      if (!contResult.ok) {
        return { ok: false, reason: `status_${contResult.statusCode}` };
      }
      return { ok: true, content: extractReplyContent(contResult.parsed), finishReason: contResult.finishReason };
    };

    let finalContent = success.content;
    let guardMeta = null;
    if (guardEnabled) {
      const guarded = await applyCompletionGuard({
        initialContent: success.content,
        initialFinishReason: success.finishReason,
        requestContinuation,
        maxContinuations,
        onEvent
      });
      finalContent = guarded.content;
      guardMeta = {
        continuations: guarded.continuations,
        was_truncated: guarded.wasTruncated,
        still_truncated: guarded.stillTruncated,
        structure: guarded.structureMeta
      };
    }

    emit(onEvent, EVENT_TYPES.MODEL_TIER_USED, {
      tier_requested: requestedModelTier,
      tier_used: inferUsedTier('openrouter', success.model),
      provider: 'openrouter',
      model: success.model,
      success: true
    });

    return {
      ok: true,
      provider: 'openrouter',
      model: success.model,
      tokensRequested: success.tokensRequested,
      attempts,
      content: finalContent,
      usage: success.usage,
      finishReason: success.finishReason,
      completionGuard: guardMeta
    };
  }

  if (earlyCloudflareAiResult) return earlyCloudflareAiResult;

  if (success) {
    return await finalizeOpenRouterSuccess();
  }

  // Dernier recours : openrouter/auto, une seule fois, au plus petit niveau
  // de tokens — jamais essaye plus tot dans la chaine.
  const smallestTokenLimit = tokenRetryLevels[tokenRetryLevels.length - 1];
  if (!openRouterCreditExhausted) {
    const lastResortOk = await attemptOnce(LAST_RESORT_MODEL, smallestTokenLimit, false);
    if (lastResortOk) {
      return await finalizeOpenRouterSuccess();
    }
  }

  emit(onEvent, EVENT_TYPES.ALL_MODELS_FAILED, {
    attempts_count: attempts.length,
    last_error_type: lastFailure?.error_type || 'unknown',
    credit_exhausted: openRouterCreditExhausted,
    affordable_tokens: lastFailure?.affordable_tokens ?? null
  });

  // Second provider, hors OpenRouter, uniquement quand toute la chaine
  // OpenRouter (y compris openrouter/auto) a echoue. Jamais essaye avant,
  // jamais en concurrence avec OpenRouter (sauf early-attempt tier 'fast'
  // ci-dessus, deja gere via cloudflareAiAlreadyAttempted).
  if (!cloudflareAiAlreadyAttempted) {
    const fallbackAttempt = await attemptCloudflareAiChain(effectiveCloudflareAiMaxTokens);
    if (fallbackAttempt) return fallbackAttempt;
  }

  emit(onEvent, EVENT_TYPES.MODEL_TIER_USED, {
    tier_requested: requestedModelTier,
    tier_used: null,
    provider: null,
    model: null,
    success: false
  });

  return {
    ok: false,
    provider: 'openrouter',
    attempts,
    errorType: lastFailure?.error_type || 'unknown',
    userMessage: USER_MESSAGES[language],
    cloudflareAiErrorDetail: lastCloudflareAiRecord?.error_detail || null
  };
}
