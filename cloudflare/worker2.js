/**
 * Cloudflare Worker - Digital Blue Skye AI (OpenRouter)
 * Stable version with model fallback.
 *
 * @deprecated Non déployé, non référencé par aucun wrangler.*.toml.
 * Prototype historique conservé pour mémoire. Les Workers actifs sont
 * cloudflare/worker-api.js et cloudflare/worker-openrouter.js.
 * Voir docs/ARCHITECTURE.md.
 */

const DEFAULT_MODEL = 'openrouter/free';
const FALLBACK_MODEL = 'openrouter/auto';

function buildCorsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin');
  const fallbackOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.com/';
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

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((entry) => {
      const name = typeof entry?.name === 'string' ? entry.name.slice(0, 160) : 'image';
      const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
      const type = entry?.type === 'image_url' ? 'image_url' : '';
      return { type, url, name };
    })
    .filter((item) => item.type === 'image_url' && item.url.startsWith('data:image/'))
    .slice(0, 2);
}

function extractReply(data) {
  return data?.choices?.[0]?.message?.content?.trim() || '';
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

function buildDateAwareSystemPrompt(language, hasImages, dateContext) {
  const currentYear = dateContext.isoDate.slice(0, 4);
  const dateRule =
    language === 'en'
      ? `Current date: ${dateContext.isoDate} (${dateContext.timezone}). Treat ${currentYear} as the current year. Never say we are in 2024 unless the user explicitly asks about 2024. For latest/current market facts, recent product launches, prices, release dates, rankings, laws, or news: you do not have live web access. Do not invent models, examples, dates, specs, prices, citations, or rankings. If the user asks for current/latest facts and no source is provided, say that live verification is required and offer a safe comparison framework using neutral placeholders only, such as "Brand / Model to verify".`
      : `Date actuelle : ${dateContext.isoDate} (${dateContext.timezone}). Considere ${currentYear} comme l'annee en cours. Ne dis jamais que nous sommes en 2024 sauf si l'utilisateur parle explicitement de 2024. Pour les faits recents, les dernieres sorties produit, les prix, dates de sortie, classements, lois ou actualites : tu n'as pas d'acces web temps reel. N'invente jamais de modeles, exemples, dates, fiches techniques, prix, citations ou classements. Si l'utilisateur demande des donnees actuelles et qu'aucune source n'est fournie, explique qu'une verification web est necessaire et propose plutot une grille de comparaison fiable avec uniquement des placeholders neutres, par exemple "Marque / modele a verifier".`;

  const basePrompt =
    language === 'en'
      ? 'You are the Digital Blue Skye assistant. Be concise, practical, and actionable.'
      : "Tu es l'assistant Digital Blue Skye. Reponds en francais de facon concise, pratique et actionnable.";

  const visionPrompt =
    language === 'en'
      ? 'Strict vision mode: report only what is directly visible. Never invent brands, places, prices, or context. If uncertain, say "Uncertain". Structure image answers as: 1) Observations, 2) Uncertainties, 3) Next useful checks.'
      : 'Mode vision strict: decris uniquement ce qui est directement visible. N\'invente jamais marque, lieu, prix ou contexte. Si un point est incertain, ecris "Incertain". Structure la reponse image en: 1) Observations, 2) Incertitudes, 3) Verifications utiles.';

  return hasImages
    ? `${basePrompt} ${dateRule} ${visionPrompt}`
    : `${basePrompt} ${dateRule}`;
}

async function callOpenRouter({ apiKey, model, systemPrompt, history, message, attachments, referer }) {
  const userMessage =
    attachments.length > 0
      ? {
        role: 'user',
        content: [
          { type: 'text', text: message },
          ...attachments.map((item) => ({
            type: 'image_url',
            image_url: { url: item.url }
          }))
        ]
      }
      : { role: 'user', content: message };

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
        userMessage
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
    const referer = env.ALLOWED_ORIGIN || 'https://digitalblueskye.com/';

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
    const attachments = normalizeAttachments(body.attachments);
    const hasImages = attachments.length > 0;
    const dateContext = normalizeDateContext(body.currentDate);
    const systemPrompt = buildDateAwareSystemPrompt(language, hasImages, dateContext);

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
        attachments,
        referer
      });

      if (resp.ok) {
        const reply = extractReply(parsed);
        return jsonResponse(
          {
            ok: true,
            reply: reply || (language === 'en' ? 'No reply generated.' : 'Aucune reponse generee.'),
            provider: 'openrouter',
            model,
            resolved_model: parsed?.model || model
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

      // On tente le fallback aussi lorsque le provider gratuit est temporairement sature.
      const msg = (lastError.upstream_error || '').toLowerCase();
      const canFallback =
        resp.status === 400 ||
        resp.status === 404 ||
        resp.status === 429 ||
        msg.includes('model') ||
        msg.includes('endpoint') ||
        msg.includes('provider returned error') ||
        msg.includes('rate limit');

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
