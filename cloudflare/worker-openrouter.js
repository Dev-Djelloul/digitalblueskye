/**
 * Cloudflare Worker - Digital Blue Skye AI via OpenRouter Free
 *
 * Required secrets/vars:
 * - OPENROUTER_API_KEY (secret)
 * - OPENROUTER_MODEL (text, optional but recommended)
 *   Example: google/gemma-2-9b-it:free
 *
 * Optional vars:
 * - ALLOWED_ORIGIN (text)
 *   Example: https://digitalblueskye.infinityfreeapp.com
 */

const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const FALLBACK_MODEL = 'openrouter/auto';
const DEFAULT_MAX_TOKENS = 220;

function buildCorsHeaders(request, env) {
  const fallbackOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.infinityfreeapp.com';
  const requestOrigin = request.headers.get('Origin');
  const corsOrigin = requestOrigin || fallbackOrigin;

  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    Vary: 'Origin'
  };
}

function jsonResponse(payload, status, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders
  });
}

function normalizeDateContext(rawDate) {
  const fallback = {
    isoDate: new Date().toISOString().slice(0, 10),
    timezone: 'Europe/Paris'
  };
  if (!rawDate || typeof rawDate !== 'object') return fallback;
  const isoDate = typeof rawDate.isoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.isoDate)
    ? rawDate.isoDate
    : fallback.isoDate;
  const timezone = typeof rawDate.timezone === 'string' && rawDate.timezone.trim()
    ? rawDate.timezone.slice(0, 80)
    : fallback.timezone;
  return { isoDate, timezone };
}

function buildSystemPrompt(language, dateContext) {
  const currentYear = dateContext.isoDate.slice(0, 4);
  if (language === 'en') {
    return [
      'You are the Digital Blue Skye assistant.',
      `Current date: ${dateContext.isoDate} (${dateContext.timezone}). Treat ${currentYear} as the current year.`,
      'Never say we are in 2024 unless the user explicitly asks about 2024.',
      'For latest/current market facts, recent product launches, prices, release dates, rankings, laws, or news: you do not have live web access.',
      'Do not invent models, examples, dates, specs, prices, citations, or rankings. If no source is provided, say that live verification is required and offer a safe comparison framework using neutral placeholders only, such as "Brand / Model to verify".',
      'Reply in concise, practical, actionable language.',
      'Prefer short sections and bullet points on separate lines.',
      'Limit answers to the essentials unless the user asks for details.'
    ].join(' ');
  }

  return [
    "Tu es l'assistant Digital Blue Skye.",
    `Date actuelle : ${dateContext.isoDate} (${dateContext.timezone}). Considere ${currentYear} comme l'annee en cours.`,
    "Ne dis jamais que nous sommes en 2024 sauf si l'utilisateur parle explicitement de 2024.",
    "Pour les faits recents, les dernieres sorties produit, les prix, dates de sortie, classements, lois ou actualites : tu n'as pas d'acces web temps reel.",
    'N\'invente jamais de modeles, exemples, dates, fiches techniques, prix, citations ou classements. Si aucune source n\'est fournie, explique qu\'une verification web est necessaire et propose une grille de comparaison fiable avec uniquement des placeholders neutres, par exemple "Marque / modele a verifier".',
    'Reponds en francais de facon concise, pratique et actionnable.',
    'Privilegie des sections courtes et des puces sur des lignes separees.',
    'Reste bref sauf si la personne demande explicitement plus de details.'
  ].join(' ');
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((entry) => entry && typeof entry.content === 'string')
    .slice(-4)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content.trim().slice(0, 700)
    }))
    .filter((entry) => entry.content.length > 0);
}

function getModelFallbackChain(env) {
  const configuredFallbacks = String(env.OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  return [
    env.OPENROUTER_MODEL || DEFAULT_MODEL,
    ...configuredFallbacks,
    FALLBACK_MODEL
  ].filter((value, index, array) => value && array.indexOf(value) === index);
}

function shouldTryFallback(statusCode, upstreamError) {
  const msg = String(upstreamError || '').toLowerCase();
  return (
    !statusCode ||
    statusCode === 400 ||
    statusCode === 404 ||
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 429 ||
    statusCode >= 500 ||
    msg.includes('model') ||
    msg.includes('endpoint') ||
    msg.includes('provider returned error') ||
    msg.includes('rate limit') ||
    msg.includes('timeout') ||
    msg.includes('unavailable')
  );
}

function hasUsableOpenRouterKey(env) {
  return normalizeOpenRouterApiKey(env).length > 0;
}

function normalizeOpenRouterApiKey(env) {
  return String(env.OPENROUTER_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^OPENROUTER_API_KEY\s*=\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '')
    .trim();
}

function buildAuthorizationHeader(env) {
  return `Bearer ${normalizeOpenRouterApiKey(env)}`;
}

function buildOpenRouterHeaders(env, allowedOrigin) {
  return {
    Authorization: buildAuthorizationHeader(env),
    'Content-Type': 'application/json',
    'HTTP-Referer': allowedOrigin,
    'X-Title': 'Digital Blue Skye AI'
  };
}

function hasAuthorizationHeader(headers) {
  return Boolean(headers && typeof headers.Authorization === 'string' && headers.Authorization.startsWith('Bearer '));
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((part) => extractTextFromContent(part))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (content && typeof content === 'object') {
    const directText =
      content.text ||
      content.content ||
      content.value ||
      content.output_text ||
      content.message;

    if (typeof directText === 'string' && directText.trim()) return directText.trim();

    if (Array.isArray(directText)) return extractTextFromContent(directText);

    if (content.type && typeof content.text === 'object') return extractTextFromContent(content.text);
  }

  return '';
}

function extractReply(openRouterJson) {
  const firstChoice = openRouterJson?.choices?.[0];
  const candidates = [
    firstChoice?.message?.content,
    firstChoice?.message?.text,
    firstChoice?.message?.output_text,
    firstChoice?.text,
    firstChoice?.delta?.content,
    firstChoice?.delta?.text,
    openRouterJson?.output_text,
    openRouterJson?.message?.content
  ];

  for (const candidate of candidates) {
    const text = extractTextFromContent(candidate);
    if (text) return text;
  }

  return '';
}

function buildEmptyReplyDiagnostic(openRouterJson) {
  const firstChoice = openRouterJson?.choices?.[0] || null;
  const message = firstChoice?.message || null;
  const content = message?.content;
  return {
    has_choices: Array.isArray(openRouterJson?.choices),
    choices_length: Array.isArray(openRouterJson?.choices) ? openRouterJson.choices.length : 0,
    first_choice_keys: firstChoice && typeof firstChoice === 'object' ? Object.keys(firstChoice) : [],
    message_keys: message && typeof message === 'object' ? Object.keys(message) : [],
    content_type: Array.isArray(content) ? 'array' : typeof content
  };
}

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.infinityfreeapp.com';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders);
    }

    let body;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, corsHeaders);
    }

    const mode = typeof body?.mode === 'string' ? body.mode : 'chat';
    if (mode === 'event') {
      return jsonResponse({ ok: true, tracked: true }, 200, corsHeaders);
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const language = body?.language === 'en' ? 'en' : 'fr';
    const history = normalizeHistory(body?.history);

    if (!message) {
      return jsonResponse({ ok: false, error: 'empty_message' }, 400, corsHeaders);
    }

    if (!hasUsableOpenRouterKey(env)) {
      return jsonResponse({ ok: false, error: 'missing_openrouter_key' }, 500, corsHeaders);
    }

    const primaryModel = env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const dateContext = normalizeDateContext(body?.currentDate);
    const systemPrompt = buildSystemPrompt(language, dateContext);
    const maxTokens = Number(env.OPENROUTER_MAX_TOKENS) > 0
      ? Math.min(Number(env.OPENROUTER_MAX_TOKENS), 1200)
      : DEFAULT_MAX_TOKENS;

    function buildOpenRouterPayload(modelName) {
      return {
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message }
        ],
        temperature: 0.35,
        max_tokens: maxTokens
      };
    }

    async function callOpenRouter(modelName) {
      let upstream;
      const openRouterHeaders = buildOpenRouterHeaders(env, allowedOrigin);
      try {
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: openRouterHeaders,
          body: JSON.stringify(buildOpenRouterPayload(modelName))
        });
      } catch (error) {
        return {
          upstream: null,
          parsed: null,
          transportError: error instanceof Error ? error.message : 'openrouter_fetch_failed'
        };
      }

      const raw = await upstream.text();
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (error) {
        // Keep raw payload in diagnostic response below.
      }
      return { upstream, parsed };
    }

    const modelsToTry = getModelFallbackChain(env);
    let lastError = null;
    let parsed = null;
    let resolvedModel = primaryModel;
    const attempts = [];
    let upstreamSucceeded = false;

    for (const modelName of modelsToTry) {
      const result = await callOpenRouter(modelName);
      parsed = result.parsed;
      resolvedModel = modelName;
      if (!result.upstream) {
        lastError = {
          model: modelName,
          status_code: 0,
          upstream_error: result.transportError || 'openrouter_fetch_failed',
          openrouter_key_configured: hasUsableOpenRouterKey(env),
          authorization_header_built: true
        };
        attempts.push(lastError);
        console.warn('openrouter_attempt_failed', lastError);
        if (!shouldTryFallback(0, lastError.upstream_error)) break;
        continue;
      }

      if (result.upstream.ok) {
        upstreamSucceeded = true;
        break;
      }

      const upstreamError =
        parsed?.error?.message ||
        parsed?.message ||
        'openrouter_request_failed';

      lastError = {
        model: modelName,
        status_code: result.upstream.status,
        upstream_error: upstreamError,
        openrouter_key_configured: hasUsableOpenRouterKey(env),
        authorization_header_built: hasAuthorizationHeader(buildOpenRouterHeaders(env, allowedOrigin))
      };
      attempts.push(lastError);
      console.warn('openrouter_attempt_failed', lastError);

      if (!shouldTryFallback(result.upstream.status, upstreamError)) break;
    }

    if (!upstreamSucceeded && lastError && (!parsed || !extractReply(parsed))) {
      return jsonResponse(
        {
          ok: false,
          error: 'openrouter_error',
          diagnostic: {
            ...lastError,
            attempts
          }
        },
        502,
        corsHeaders
      );
    }

    const reply = extractReply(parsed);
    if (!reply) {
      return jsonResponse(
        {
          ok: true,
          reply:
            language === 'en'
              ? 'I could not generate a complete answer right now. Please try again.'
              : "Je n'ai pas pu generer une reponse complete pour le moment. Reessayez dans un instant.",
          fallback: true,
          fallback_reason: 'empty_openrouter_reply',
          diagnostic: buildEmptyReplyDiagnostic(parsed)
        },
        200,
        corsHeaders
      );
    }

    return jsonResponse(
      {
        ok: true,
        reply,
        provider: 'openrouter',
        model: resolvedModel,
        resolved_model: parsed?.model || resolvedModel,
        fallback_model_used: resolvedModel !== primaryModel
      },
      200,
      corsHeaders
    );
  }
};
