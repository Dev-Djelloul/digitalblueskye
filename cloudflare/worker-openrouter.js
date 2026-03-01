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

const DEFAULT_MODEL = 'google/gemma-2-9b-it:free';

function jsonResponse(payload, status, corsOrigin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function buildSystemPrompt(language) {
  if (language === 'en') {
    return [
      'You are the Digital Blue Skye assistant.',
      'Reply in concise, practical, actionable language.',
      'When relevant, give concrete examples and clear next steps.'
    ].join(' ');
  }

  return [
    "Tu es l'assistant Digital Blue Skye.",
    'Reponds en francais de facon concise, pratique et actionnable.',
    'Quand c est pertinent, donne des exemples concrets et des prochaines etapes claires.'
  ].join(' ');
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((entry) => entry && typeof entry.content === 'string')
    .slice(-8)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content.trim().slice(0, 1200)
    }))
    .filter((entry) => entry.content.length > 0);
}

function extractReply(openRouterJson) {
  const firstChoice = openRouterJson?.choices?.[0];
  const messageText = firstChoice?.message?.content;

  if (typeof messageText === 'string' && messageText.trim()) {
    return messageText.trim();
  }

  if (Array.isArray(messageText)) {
    const textParts = messageText
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();

    if (textParts) return textParts;
  }

  return '';
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.infinityfreeapp.com';
    const requestOrigin = request.headers.get('Origin');
    const corsOrigin = requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, corsOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, corsOrigin);
    }

    const mode = typeof body?.mode === 'string' ? body.mode : 'chat';
    if (mode === 'event') {
      return jsonResponse({ ok: true, tracked: true }, 200, corsOrigin);
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const language = body?.language === 'en' ? 'en' : 'fr';
    const history = normalizeHistory(body?.history);

    if (!message) {
      return jsonResponse({ ok: false, error: 'empty_message' }, 400, corsOrigin);
    }

    if (!env.OPENROUTER_API_KEY) {
      return jsonResponse({ ok: false, error: 'missing_openrouter_key' }, 500, corsOrigin);
    }

    const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const systemPrompt = buildSystemPrompt(language);

    const openRouterPayload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ],
      temperature: 0.5,
      max_tokens: 500
    };

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': allowedOrigin,
        'X-Title': 'Digital Blue Skye AI'
      },
      body: JSON.stringify(openRouterPayload)
    });

    const raw = await upstream.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
      // Keep raw payload in diagnostic response below.
    }

    if (!upstream.ok) {
      const upstreamError =
        parsed?.error?.message ||
        parsed?.message ||
        'openrouter_request_failed';

      return jsonResponse(
        {
          ok: false,
          error: 'openrouter_error',
          diagnostic: {
            status_code: upstream.status,
            upstream_error: upstreamError
          }
        },
        502,
        corsOrigin
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
          fallback_reason: 'empty_openrouter_reply'
        },
        200,
        corsOrigin
      );
    }

    return jsonResponse(
      {
        ok: true,
        reply,
        provider: 'openrouter',
        model
      },
      200,
      corsOrigin
    );
  }
};
