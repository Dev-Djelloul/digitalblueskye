/**
 * Cloudflare Worker - Digital Blue Skye AI (OpenRouter)
 * Stable version with model fallback.
 */

const DEFAULT_MODEL = 'openrouter/free';
const FALLBACK_MODEL = 'openrouter/auto';

function buildCorsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin');
  const fallbackOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.infinityfreeapp.com';
  const corsOrigin = requestOrigin || fallbackOrigin;

  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Vary': 'Origin'
  };
}

function jsonResponse(payload, status, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders
  });
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((entry) => {
      const role = entry?.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof entry?.content === 'string' ? entry.content : String(entry?.content ?? '');
      return { role, content: content.trim() };
    })
    .filter((m) => m.content.length > 0)
    .slice(-8);
}

function extractReply(data) {
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function callOpenRouter({ apiKey, model, systemPrompt, history, message, referer }) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer,
      'X-Title': 'Digital Blue Skye AI'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ],
      temperature: 0.6
    })
  });

  const raw = await resp.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch (_) {
    parsed = null;
  }

  return { resp, parsed, raw };
}

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);
    const referer = env.ALLOWED_ORIGIN || 'https://digitalblueskye.infinityfreeapp.com';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders);
    }

    if (!env.OPENROUTER_API_KEY) {
      return jsonResponse({ ok: false, error: 'missing_openrouter_key' }, 500, corsHeaders);
    }

    let body = {};
    try {
      const text = await request.text(); // compatible text/plain
      body = text ? JSON.parse(text) : {};
    } catch (_) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, corsHeaders);
    }

    const mode = typeof body.mode === 'string' ? body.mode : 'chat';
    if (mode === 'event') {
      return jsonResponse({ ok: true, tracked: true }, 200, corsHeaders);
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return jsonResponse({ ok: false, error: 'empty_message' }, 400, corsHeaders);
    }

    const language = body.language === 'en' ? 'en' : 'fr';
    const history = normalizeHistory(body.history);

    const systemPrompt =
      language === 'en'
        ? 'You are the Digital Blue Skye assistant. Be concise, practical, and actionable.'
        : "Tu es l'assistant Digital Blue Skye. Reponds en francais de facon concise, pratique et actionnable.";

    const requestedModel = (env.OPENROUTER_MODEL || DEFAULT_MODEL).trim();
    const modelsToTry = [requestedModel, FALLBACK_MODEL].filter((v, i, a) => v && a.indexOf(v) === i);

    let lastError = null;

    for (const model of modelsToTry) {
      const { resp, parsed } = await callOpenRouter({
        apiKey: env.OPENROUTER_API_KEY,
        model,
        systemPrompt,
        history,
        message,
        referer
      });

      if (resp.ok) {
        const reply = extractReply(parsed);
        return jsonResponse(
          {
            ok: true,
            reply: reply || (language === 'en' ? 'No reply generated.' : 'Aucune reponse generee.'),
            provider: 'openrouter',
            model
          },
          200,
          corsHeaders
        );
      }

      lastError = {
        model,
        status_code: resp.status,
        upstream_error: parsed?.error?.message || parsed?.message || 'openrouter_request_failed'
      };

      // On tente le fallback seulement si erreur de modele / endpoint
      const msg = (lastError.upstream_error || '').toLowerCase();
      const canFallback =
        resp.status === 400 || resp.status === 404 || msg.includes('model') || msg.includes('endpoint');

      if (!canFallback) break;
    }

    return jsonResponse(
      {
        ok: false,
        error: 'openrouter_error',
        diagnostic: lastError
      },
      502,
      corsHeaders
    );
  }
};
