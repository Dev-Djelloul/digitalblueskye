/**
 * Cloudflare Worker - Digital Blue Skye AI (Version Corrigée)
 */

const DEFAULT_MODEL = 'openrouter/free';

function buildCorsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin');
  // On autorise l'origine qui appelle (votre site InfinityFree)
  const corsOrigin = requestOrigin || "https://digitalblueskye.netlify.app/";

  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // On liste explicitement Content-Type pour éviter le blocage du navigateur
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Vary': 'Origin'
  };
}

function jsonResponse(payload, status, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders
  });
}

// Nettoyage de l'historique pour OpenRouter
function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map(entry => {
      // On s'assure que chaque entrée a le bon format pour l'API
      const role = entry.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof entry.content === 'string' ? entry.content : String(entry);
      return { role, content: content.trim() };
    })
    .slice(-6); // On garde les 6 derniers messages pour ne pas saturer le contexte
}

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    // Gestion du Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, corsHeaders);
    }

    try {
      const body = await request.json(); // Utilisation directe de .json()
      
      if (body.mode === 'event') {
        return jsonResponse({ ok: true }, 200, corsHeaders);
      }

      const message = body.message?.trim();
      if (!message) {
        return jsonResponse({ ok: false, error: 'Empty message' }, 400, corsHeaders);
      }

      const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
      const history = normalizeHistory(body.history);
      
      // Construction du prompt système
      const systemPrompt = body.language === 'en' 
        ? "You are the Digital Blue Skye assistant. Be concise and helpful."
        : "Tu es l'assistant Digital Blue Skye. Réponds en français de façon concise et pratique.";

      // Appel à OpenRouter
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://digitalblueskye.netlify.app/',
          'X-Title': 'Digital Blue Skye AI'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message }
          ],
          temperature: 0.7
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return jsonResponse({ ok: false, error: 'OpenRouter Error', detail: data }, 502, corsHeaders);
      }

      const reply = data.choices?.[0]?.message?.content || "";

      return jsonResponse({
        ok: true,
        reply: reply,
        model: model
      }, 200, corsHeaders);

    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500, corsHeaders);
    }
  }
};
