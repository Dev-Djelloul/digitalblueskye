 // Model Router — selection de modele(s), retries et cascade de max_tokens,
// independant de la logique chat (prompt RAG/web/memoire) qui reste dans
// worker-openrouter.js.
//
// Providers supportes :
// - OpenAI direct
// - OpenRouter
// - Cloudflare Workers AI
//
// Interface : routeChatCompletion({ messages, systemPrompt, userPrompt,
// maxTokens, temperature, env, metadata, onEvent, fetchImpl, modelTier,
// forceProvider })
//   - messages: historique de conversation (sans le message system), deja
//     enrichi par l'appelant (memoire projet, resume, etc.)
//   - userPrompt: optionnel, ajoute en dernier message 'user' si fourni et
//     pas deja present comme dernier element de `messages`.
//   - onEvent(eventType, payload): callback de telemetrie.
//   - fetchImpl: pour les tests.
//   - modelTier: 'fast' | 'balanced' | 'strong'.
//   - forceProvider: 'openai' pour diagnostic direct.

import { applyCompletionGuard, resolveMaxContinuations, closeOpenMarkdownStructures } from './completionGuard.js';

export const DEFAULT_MAX_TOKENS = 2000;
// Echelle de repli proportionnelle au budget effectif (et non plus une liste
// absolue [700, 500, 350] qui plafonnait la PREMIERE tentative a 700 tokens
// quel que soit maxTokens) : la premiere tentative part toujours avec le
// budget complet ; les niveaux reduits ne servent qu'aux retries 402
// (credit_limit) d'OpenRouter.
export const TOKEN_RETRY_RATIOS = [1, 0.55, 0.3];
export const LAST_RESORT_MODEL = 'openrouter/auto';
export const MIN_USEFUL_OPENROUTER_TOKENS = 128;

export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_DEFAULT_MODEL = 'gpt-4.1-mini';
export const OPENAI_BALANCED_MODEL = 'gpt-4.1-mini';
export const OPENAI_STRONG_MODEL = 'gpt-4.1';

export const MODEL_TIERS = { FAST: 'fast', BALANCED: 'balanced', STRONG: 'strong' };
const VALID_MODEL_TIERS = new Set(Object.values(MODEL_TIERS));

export function normalizeModelTier(tier) {
  const value = String(tier || '').trim().toLowerCase();
  return VALID_MODEL_TIERS.has(value) ? value : MODEL_TIERS.BALANCED;
}

export const FAST_MODEL_HINTS = ['google/gemini-2.5-flash-lite'];
// Haiku 4.5 en tete des hints "strong" : sans lui, une requete tier strong
// reordonnait mistral-small DEVANT le modele principal configure (Haiku),
// c'est-a-dire un modele plus faible en premier.
export const STRONG_MODEL_HINTS = ['anthropic/claude-haiku-4.5', 'qwen/qwen3-30b-a3b', 'mistralai/mistral-small-3.2-24b-instruct'];

function getOpenAiModel(env, tier = MODEL_TIERS.BALANCED) {
  const normalizedTier = normalizeModelTier(tier);

  if (normalizedTier === MODEL_TIERS.STRONG) {
    return env?.OPENAI_STRONG_MODEL || env?.OPENAI_MODEL || OPENAI_STRONG_MODEL;
  }

  if (normalizedTier === MODEL_TIERS.BALANCED) {
    return env?.OPENAI_BALANCED_MODEL || env?.OPENAI_MODEL || OPENAI_BALANCED_MODEL;
  }

  return env?.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
}

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

function inferUsedTier(provider, model) {
  if (provider === 'cloudflare_ai') return MODEL_TIERS.FAST;
  if (provider === 'openai') {
    if (model === OPENAI_STRONG_MODEL || String(model || '').includes('gpt-4.1')) return MODEL_TIERS.STRONG;
    return MODEL_TIERS.BALANCED;
  }
  if (STRONG_MODEL_HINTS.includes(model)) return MODEL_TIERS.STRONG;
  if (FAST_MODEL_HINTS.includes(model)) return MODEL_TIERS.FAST;
  return MODEL_TIERS.BALANCED;
}

// Cloudflare AI : le modele 3.1 a ete deprecie le 2026-05-30.
// On garde uniquement le modele valide confirme par diagnostic.
export const CLOUDFLARE_AI_MODEL = '@cf/meta/llama-3.2-3b-instruct';
export const CLOUDFLARE_AI_MODEL_CHAIN = [
  '@cf/meta/llama-3.2-3b-instruct'
];

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

  OPENAI_ATTEMPT: 'openai_attempt',
  OPENAI_SUCCESS: 'openai_success',
  OPENAI_FAILED: 'openai_failed',

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
    if (candidate === LAST_RESORT_MODEL) continue;
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

async function callModel({ fetchImpl, headers, model, messages, maxTokens, temperature, timeoutMs }) {
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
    try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { /* parsed reste null */ }
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

async function callOpenAiChat({
  env,
  messages,
  model,
  maxTokens = 1200,
  temperature = 0.3,
  metadata = {},
  onEvent,
  fetchImpl = fetch,
  timeoutMs = 20000
}) {
  const startedAt = Date.now();

  if (!env?.OPENAI_API_KEY) {
    return {
      ok: false,
      provider: 'openai',
      model,
      errorType: 'provider_unavailable',
      error: 'OPENAI_API_KEY missing',
      latency_ms: Date.now() - startedAt
    };
  }

  emit(onEvent, EVENT_TYPES.OPENAI_ATTEMPT, {
    provider: 'openai',
    model,
    tokens_requested: maxTokens,
    temperature,
    ...metadata
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(OPENAI_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: Number.isFinite(temperature) ? temperature : 0.3
      })
    });

    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { /* parsed reste null */ }

    const latency = Date.now() - startedAt;

    if (!response.ok) {
      const errorMessage = parsed?.error?.message || parsed?.message || raw || 'OpenAI request failed';
      const errorType =
        response.status === 401 || response.status === 403
          ? 'auth_error'
          : response.status === 429
            ? 'rate_limit'
            : response.status >= 500
              ? 'server_error'
              : 'provider_error';

      emit(onEvent, EVENT_TYPES.OPENAI_FAILED, {
        provider: 'openai',
        model,
        status_code: response.status,
        error_type: errorType,
        upstream_error: String(errorMessage).slice(0, 300),
        latency_ms: latency,
        ...metadata
      });

      return {
        ok: false,
        provider: 'openai',
        model,
        status: response.status,
        errorType,
        error: errorMessage,
        latency_ms: latency
      };
    }

    const content = extractReplyContent(parsed);
    const finishReason = parsed?.choices?.[0]?.finish_reason || null;

    if (!content) {
      emit(onEvent, EVENT_TYPES.OPENAI_FAILED, {
        provider: 'openai',
        model,
        status_code: response.status,
        error_type: 'empty_reply',
        latency_ms: latency,
        ...metadata
      });

      return {
        ok: false,
        provider: 'openai',
        model,
        status: response.status,
        errorType: 'empty_reply',
        error: 'empty_openai_reply',
        latency_ms: latency
      };
    }

    emit(onEvent, EVENT_TYPES.OPENAI_SUCCESS, {
      provider: 'openai',
      model,
      latency_ms: latency,
      finish_reason: finishReason,
      content_length: content.length,
      ...metadata
    });

    return {
      ok: true,
      provider: 'openai',
      model,
      content,
      usage: parsed?.usage || null,
      finishReason,
      latency_ms: latency,
      tokensRequested: maxTokens
    };
  } catch (error) {
    const latency = Date.now() - startedAt;
    const isTimeout = error?.name === 'AbortError';
    const errorType = isTimeout ? 'timeout' : 'network_error';

    emit(onEvent, EVENT_TYPES.OPENAI_FAILED, {
      provider: 'openai',
      model,
      error_type: errorType,
      upstream_error: error?.message || String(error),
      latency_ms: latency,
      ...metadata
    });

    return {
      ok: false,
      provider: 'openai',
      model,
      errorType,
      error: error?.message || String(error),
      latency_ms: latency
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

export async function diagnoseOpenAi(env, { prompt } = {}, fetchImpl = fetch) {
  const messages = [
    { role: 'system', content: 'You are a diagnostic assistant. Reply with one short confirmation sentence.' },
    { role: 'user', content: prompt || 'OpenAI diagnostic test.' }
  ];

  const model = getOpenAiModel(env, MODEL_TIERS.BALANCED);
  const result = await callOpenAiChat({
    env,
    messages,
    model,
    maxTokens: 100,
    temperature: 0.2,
    metadata: { diagnostic: true },
    fetchImpl
  });

  return {
    ok: result.ok,
    provider: 'openai',
    model,
    latency_ms: result.latency_ms,
    content_preview: result.ok ? result.content.slice(0, 200) : null,
    error: result.error || null,
    errorType: result.errorType || null,
    api_key_present: Boolean(env?.OPENAI_API_KEY)
  };
}

// Nettoyage de la cle OpenRouter, factorise pour etre identique entre
// routeChatCompletion() (appel reel) et diagnoseOpenRouterKey() (diagnostic) —
// garantit que le diagnostic teste exactement la meme cle/header que l'appel
// de production.
function cleanOpenRouterApiKey(rawValue) {
  return String(rawValue || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^OPENROUTER_API_KEY\s*=\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '');
}

export const OPENROUTER_KEY_DIAGNOSE_URL = 'https://openrouter.ai/api/v1/key';

/**
 * Diagnostic dedie OpenRouter (Lot stabilisation) : appelle GET /api/v1/key
 * avec exactement la meme cle/header que routeChatCompletion(), sans jamais
 * lancer d'exception ni exposer la cle. Permet de distinguer immediatement
 * une cle absente/mal formee, un compte sans credit, un quota/rate-limit
 * atteint, ou une panne cote OpenRouter.
 */
export async function diagnoseOpenRouterKey(env, fetchImpl = fetch) {
  const startedAt = Date.now();
  const apiKeyPresent = Boolean(env?.OPENROUTER_API_KEY);
  const apiKey = cleanOpenRouterApiKey(env?.OPENROUTER_API_KEY);
  const authorizationHeaderPresent = Boolean(apiKey);
  const authorizationHeaderPrefix = apiKey ? `Bearer ${apiKey.slice(0, 8)}...` : null;

  if (!apiKeyPresent || !authorizationHeaderPresent) {
    return {
      ok: false,
      provider: 'openrouter',
      api_key_present: apiKeyPresent,
      authorization_header_present: authorizationHeaderPresent,
      authorization_header_prefix: authorizationHeaderPrefix,
      http_status: 0,
      latency_ms: Date.now() - startedAt,
      account: null,
      credits: null,
      limit: null,
      remaining: null,
      usage: null,
      rate_limit: null,
      is_free_tier: null,
      raw_response: null,
      raw_error: 'OPENROUTER_API_KEY missing or empty after cleanup'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetchImpl(OPENROUTER_KEY_DIAGNOSE_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { /* parsed reste null */ }

    const latencyMs = Date.now() - startedAt;
    const data = parsed?.data || null;
    const limitRemaining = data?.limit_remaining ?? (
      data?.limit != null ? Math.max(0, Number(data.limit) - Number(data.usage || 0)) : null
    );

    if (!response.ok) {
      const errorMessage = parsed?.error?.message || parsed?.message || raw || `OpenRouter key check failed (${response.status})`;
      return {
        ok: false,
        provider: 'openrouter',
        api_key_present: apiKeyPresent,
        authorization_header_present: authorizationHeaderPresent,
        authorization_header_prefix: authorizationHeaderPrefix,
        http_status: response.status,
        latency_ms: latencyMs,
        account: null,
        credits: null,
        limit: null,
        remaining: null,
        usage: null,
        rate_limit: null,
        is_free_tier: null,
        raw_response: parsed,
        raw_error: String(errorMessage).slice(0, 500)
      };
    }

    return {
      ok: true,
      provider: 'openrouter',
      api_key_present: apiKeyPresent,
      authorization_header_present: authorizationHeaderPresent,
      authorization_header_prefix: authorizationHeaderPrefix,
      http_status: response.status,
      latency_ms: latencyMs,
      account: data?.label ?? null,
      credits: limitRemaining,
      limit: data?.limit ?? null,
      remaining: limitRemaining,
      usage: data?.usage ?? null,
      rate_limit: data?.rate_limit ?? null,
      is_free_tier: data?.is_free_tier ?? null,
      raw_response: parsed,
      raw_error: null
    };
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return {
      ok: false,
      provider: 'openrouter',
      api_key_present: apiKeyPresent,
      authorization_header_present: authorizationHeaderPresent,
      authorization_header_prefix: authorizationHeaderPrefix,
      http_status: 0,
      latency_ms: Date.now() - startedAt,
      account: null,
      credits: null,
      limit: null,
      remaining: null,
      usage: null,
      rate_limit: null,
      is_free_tier: null,
      raw_response: null,
      raw_error: isTimeout ? 'timeout' : (error?.message || String(error))
    };
  } finally {
    clearTimeout(timer);
  }
}

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
  timeoutMs,
  forceProvider,
  // Optionnel (Lot 8, Capability Planner) : override du budget de
  // continuations du Completion Guard a partir de expectedAnswerLength.
  // Non fourni => comportement actuel inchange (env var uniquement).
  maxContinuationsHint
}) {
  const fetcher = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const language = metadata?.language === 'en' ? 'en' : 'fr';
  const requestedModelTier = normalizeModelTier(modelTier);
  emit(onEvent, EVENT_TYPES.MODEL_TIER_REQUESTED, { tier: requestedModelTier });

  const baseMessages = Array.isArray(messages) ? [...messages] : [];
  if (userPrompt && baseMessages[baseMessages.length - 1]?.content !== userPrompt) {
    baseMessages.push({ role: 'user', content: userPrompt });
  }
  const fullMessages = [{ role: 'system', content: String(systemPrompt || '') }, ...baseMessages];

  const effectiveMaxTokens = Math.max(1, Number(maxTokens) || DEFAULT_MAX_TOKENS);
  const tokenRetryLevels = TOKEN_RETRY_RATIOS
    .map((ratio) => Math.max(MIN_USEFUL_OPENROUTER_TOKENS, Math.round(effectiveMaxTokens * ratio)))
    .filter((value, index, array) => index === 0 || value < array[index - 1]);
  if (!tokenRetryLevels.length) tokenRetryLevels.push(effectiveMaxTokens);

  const effectiveCloudflareAiMaxTokens = Math.max(
    tokenRetryLevels[tokenRetryLevels.length - 1],
    Number(cloudflareAiMaxTokens) || tokenRetryLevels[tokenRetryLevels.length - 1]
  );

  if (forceProvider === 'openai') {
    const openAiModel = getOpenAiModel(env, requestedModelTier);
    const openAiResult = await callOpenAiChat({
      env,
      messages: fullMessages,
      model: openAiModel,
      maxTokens: effectiveMaxTokens,
      temperature,
      metadata,
      onEvent,
      fetchImpl: fetcher,
      timeoutMs
    });

    if (openAiResult.ok) {
      emit(onEvent, EVENT_TYPES.MODEL_TIER_USED, {
        tier_requested: requestedModelTier,
        tier_used: inferUsedTier('openai', openAiResult.model),
        provider: 'openai',
        model: openAiResult.model,
        success: true
      });
      return {
        ok: true,
        provider: 'openai',
        model: openAiResult.model,
        tokensRequested: effectiveMaxTokens,
        attempts: [{
          model: openAiResult.model,
          provider: 'openai',
          status_code: 200,
          tokens_requested: effectiveMaxTokens,
          latency_ms: openAiResult.latency_ms
        }],
        content: openAiResult.content,
        usage: openAiResult.usage,
        finishReason: openAiResult.finishReason
      };
    }

    emit(onEvent, EVENT_TYPES.MODEL_TIER_USED, {
      tier_requested: requestedModelTier,
      tier_used: null,
      provider: 'openai',
      model: openAiModel,
      success: false
    });

    return {
      ok: false,
      provider: 'openai',
      model: openAiModel,
      attempts: [{
        model: openAiModel,
        provider: 'openai',
        status_code: openAiResult.status || 0,
        tokens_requested: effectiveMaxTokens,
        latency_ms: openAiResult.latency_ms,
        error_type: openAiResult.errorType,
        upstream_error: openAiResult.error
      }],
      errorType: openAiResult.errorType,
      error: openAiResult.error,
      userMessage: USER_MESSAGES[language]
    };
  }

  async function attemptOpenAiPreferred() {
    if (requestedModelTier !== MODEL_TIERS.STRONG && requestedModelTier !== MODEL_TIERS.BALANCED) {
      return null;
    }

    const openAiModel = getOpenAiModel(env, requestedModelTier);
    const openAiResult = await callOpenAiChat({
      env,
      messages: fullMessages,
      model: openAiModel,
      maxTokens: effectiveMaxTokens,
      temperature,
      metadata,
      onEvent,
      fetchImpl: fetcher,
      timeoutMs
    });

    if (!openAiResult.ok) return null;

    emit(onEvent, EVENT_TYPES.MODEL_TIER_USED, {
      tier_requested: requestedModelTier,
      tier_used: inferUsedTier('openai', openAiResult.model),
      provider: 'openai',
      model: openAiResult.model,
      success: true
    });

    return {
      ok: true,
      provider: 'openai',
      model: openAiResult.model,
      tokensRequested: effectiveMaxTokens,
      attempts: [{
        model: openAiResult.model,
        provider: 'openai',
        status_code: 200,
        tokens_requested: effectiveMaxTokens,
        latency_ms: openAiResult.latency_ms
      }],
      content: openAiResult.content,
      usage: openAiResult.usage,
      finishReason: openAiResult.finishReason
    };
  }

  // OpenAI direct devient prioritaire pour balanced/strong.
  // Si OpenAI echoue, le fallback OpenRouter + Cloudflare reste intact.
  const openAiPreferredResult = await attemptOpenAiPreferred();
  if (openAiPreferredResult) return openAiPreferredResult;

  const apiKey = cleanOpenRouterApiKey(env?.OPENROUTER_API_KEY);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': metadata?.allowedOrigin || 'https://digitalblueskye.com',
    'X-Title': 'Digital Blue Skye AI'
  };

  const modelChain = apiKey ? buildModelChain(env, onEvent, requestedModelTier) : [];
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
        emit(onEvent, EVENT_TYPES.MODEL_SUCCESS, { ...record, content_length: content.length, resolved_model: result.parsed?.model || model, finish_reason: result.finishReason, usage: result.parsed?.usage || null });
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

      if (cloudflareAiRecord.error_type === 'provider_unavailable') break;
    }
    return null;
  }

  let cloudflareAiAlreadyAttempted = false;
  let earlyCloudflareAiResult = null;
  if (requestedModelTier === MODEL_TIERS.FAST) {
    cloudflareAiAlreadyAttempted = true;
    earlyCloudflareAiResult = await attemptCloudflareAiChain(effectiveCloudflareAiMaxTokens);
  }

  if (!earlyCloudflareAiResult && apiKey) {
    modelLoop:
    for (const model of modelChain) {
      let retriedTransientOnce = false;
      for (let levelIndex = 0; levelIndex < tokenRetryLevels.length; levelIndex += 1) {
        const tokenLimit = tokenRetryLevels[levelIndex];
        const ok = await attemptOnce(model, tokenLimit, false);
        if (ok) break modelLoop;

        const errorType = lastFailure?.error_type;

        if (openRouterCreditExhausted) break modelLoop;

        if (errorType === 'credit_limit' && levelIndex < tokenRetryLevels.length - 1) {
          const nextTokenLimit = tokenRetryLevels[levelIndex + 1];
          emit(onEvent, EVENT_TYPES.RETRY_REDUCED_TOKENS, { model, from_max_tokens: tokenLimit, to_max_tokens: nextTokenLimit });
          continue;
        }

        if ((errorType === 'provider_error' || errorType === 'timeout') && !retriedTransientOnce) {
          retriedTransientOnce = true;
          const retryOk = await attemptOnce(model, tokenLimit, true);
          if (retryOk) break modelLoop;
        }

        break;
      }
    }
  }

  async function finalizeOpenRouterSuccess() {
    const guardEnabled = String(env?.COMPLETION_GUARD_ENABLED ?? 'true').toLowerCase() !== 'false';
    const maxContinuations = resolveMaxContinuations(
      maxContinuationsHint != null ? maxContinuationsHint : env?.COMPLETION_GUARD_MAX_CONTINUATIONS
    );

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

  const smallestTokenLimit = tokenRetryLevels[tokenRetryLevels.length - 1];
  if (apiKey && !openRouterCreditExhausted) {
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

/**
 * Variante STREAMING de routeChatCompletion : negocie l'ouverture d'un flux
 * SSE OpenRouter (stream: true) en parcourant la meme chaine de modeles et la
 * meme cascade de niveaux de tokens (retry 402), puis retourne le
 * ReadableStream BRUT d'OpenRouter des que les headers d'un modele repondent
 * 200 — le relais/transformation SSE est la responsabilite de l'appelant
 * (cf. createOpenRouterSseRelay dans worker-openrouter.js).
 *
 * Volontairement hors perimetre (l'appelant retombe sur routeChatCompletion
 * non-streame en cas d'echec ici) : Completion Guard et fallback OpenAI /
 * Cloudflare AI — ils exigent le texte complet ou d'autres protocoles.
 * Le timeout ne couvre QUE l'attente des headers : une fois le flux ouvert,
 * l'abandonner en cours de route couperait la reponse cote utilisateur.
 */
export async function routeChatCompletionStream({
  messages,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature,
  env,
  metadata,
  modelTier,
  onEvent,
  fetchImpl,
  timeoutMs
}) {
  const fetcher = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const requestedModelTier = normalizeModelTier(modelTier);
  const baseMessages = Array.isArray(messages) ? [...messages] : [];
  if (userPrompt && baseMessages[baseMessages.length - 1]?.content !== userPrompt) {
    baseMessages.push({ role: 'user', content: userPrompt });
  }
  const fullMessages = [{ role: 'system', content: String(systemPrompt || '') }, ...baseMessages];

  const effectiveMaxTokens = Math.max(1, Number(maxTokens) || DEFAULT_MAX_TOKENS);
  const tokenRetryLevels = TOKEN_RETRY_RATIOS
    .map((ratio) => Math.max(MIN_USEFUL_OPENROUTER_TOKENS, Math.round(effectiveMaxTokens * ratio)))
    .filter((value, index, array) => index === 0 || value < array[index - 1]);

  const apiKey = cleanOpenRouterApiKey(env?.OPENROUTER_API_KEY);
  if (!apiKey) return { ok: false, errorType: 'missing_openrouter_key', attempts: [] };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': metadata?.allowedOrigin || 'https://digitalblueskye.com',
    'X-Title': 'Digital Blue Skye AI'
  };

  const modelChain = buildModelChain(env, onEvent, requestedModelTier);
  const attempts = [];

  modelLoop:
  for (const model of modelChain) {
    for (let levelIndex = 0; levelIndex < tokenRetryLevels.length; levelIndex += 1) {
      const tokenLimit = tokenRetryLevels[levelIndex];
      emit(onEvent, EVENT_TYPES.MODEL_ATTEMPT, {
        model, provider: 'openrouter', tokens_requested: tokenLimit, streaming: true
      });
      const controller = new AbortController();
      const headerTimer = setTimeout(() => controller.abort(), timeoutMs || 30000);
      const startedAt = Date.now();
      let response;
      try {
        response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: fullMessages,
            temperature: Number.isFinite(temperature) ? temperature : 0.35,
            max_tokens: tokenLimit,
            stream: true
          })
        });
      } catch (error) {
        clearTimeout(headerTimer);
        const record = {
          model,
          provider: 'openrouter',
          status_code: 0,
          tokens_requested: tokenLimit,
          error_type: error?.name === 'AbortError' ? 'timeout' : 'provider_error',
          upstream_error: String(error?.message || error).slice(0, 300)
        };
        attempts.push(record);
        emit(onEvent, EVENT_TYPES.MODEL_FAILED, record);
        continue modelLoop;
      }
      clearTimeout(headerTimer);

      if (response.ok && response.body) {
        emit(onEvent, EVENT_TYPES.MODEL_SUCCESS, {
          model,
          provider: 'openrouter',
          tokens_requested: tokenLimit,
          streaming: true,
          latency_ms: Date.now() - startedAt
        });
        return {
          ok: true,
          provider: 'openrouter',
          model,
          tokensRequested: tokenLimit,
          body: response.body,
          attempts
        };
      }

      const raw = await response.text().catch(() => '');
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { /* parsed reste null */ }
      const upstreamError = parsed?.error?.message || parsed?.message || `openrouter_http_${response.status}`;
      const errorType = classifyFailure(response.status, upstreamError, false);
      const record = {
        model,
        provider: 'openrouter',
        status_code: response.status,
        tokens_requested: tokenLimit,
        error_type: errorType,
        upstream_error: String(upstreamError).slice(0, 300)
      };
      attempts.push(record);
      emit(onEvent, EVENT_TYPES.MODEL_FAILED, record);
      if (errorType === 'rate_limit') emit(onEvent, EVENT_TYPES.RATE_LIMIT, record);
      if (errorType === 'credit_limit') {
        emit(onEvent, EVENT_TYPES.CREDIT_LIMIT, record);
        if (isOpenRouterCreditExhausted(upstreamError)) {
          return { ok: false, errorType: 'credit_limit', attempts };
        }
        if (levelIndex < tokenRetryLevels.length - 1) {
          emit(onEvent, EVENT_TYPES.RETRY_REDUCED_TOKENS, {
            model, from_max_tokens: tokenLimit, to_max_tokens: tokenRetryLevels[levelIndex + 1]
          });
          continue;
        }
      }
      continue modelLoop;
    }
  }

  return {
    ok: false,
    errorType: attempts[attempts.length - 1]?.error_type || 'all_models_failed',
    attempts
  };
}