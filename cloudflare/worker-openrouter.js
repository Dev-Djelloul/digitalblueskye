/**
 * Cloudflare Worker - Digital Blue Skye AI via OpenRouter Free
 *
 * Required secrets/vars:
 * - OPENROUTER_API_KEY (secret)
 * - OPENROUTER_MODEL (text, optional but recommended)
 *   Example: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
 *
 * Optional vars:
 * - ALLOWED_ORIGIN (text)
 *   Example: https://digitalblueskye.netlify.app
 * - TAVILY_API_KEY (secret) - for real-time web search capability
 */

const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const FALLBACK_MODEL = 'openrouter/auto';
const WORKER_BUILD = '2026-06-18-web-search-openrouter-v3';
const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_MAX_TOKENS = 1400;
const WEB_SEARCH_TIMEOUT = 8000; // 8 secondes max par recherche web
const WEB_SEARCH_CACHE_TTL = 3600000; // 1 heure de cache

// Cache simple pour débounce et réutilisation des résultats
const webSearchCache = new Map();
const webSearchDebounce = new Map();

function buildCorsHeaders(request, env) {
  const fallbackOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.netlify.app/';
  const requestOrigin = request.headers.get('Origin');
  const corsOrigin = requestOrigin || fallbackOrigin;

  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      'Objective: help the user analyze, understand, research, compare, plan, write, and produce professional deliverables.',
      'Principles: answer precisely, stay factual, be transparent about information limits, adapt detail level to the request, favor directly usable answers, structure with headings, tables, and lists when useful, avoid unnecessary repetition, and never invent facts, figures, citations, or sources.',
      'When external data is provided, use it as raw material to build the answer.',
      'The format requested by the user always has priority over the format of received data.'
    ].join(' ');
  }

  return [
    "Tu es l'assistant Digital Blue Skye.",
    `Date actuelle : ${dateContext.isoDate} (${dateContext.timezone}). Considere ${currentYear} comme l'annee en cours.`,
    "Objectif : aider l'utilisateur a analyser, comprendre, rechercher, comparer, planifier, rediger et produire des livrables professionnels.",
    'Principes : repondre avec precision, etre factuel, etre transparent sur les limites des informations disponibles, adapter le niveau de detail a la demande, privilegier les reponses directement exploitables, structurer avec des titres, tableaux et listes quand cela ameliore la lisibilite, eviter les repetitions inutiles, et ne jamais inventer des faits, chiffres, citations ou sources.',
    'Lorsque des donnees externes sont fournies, les utiliser comme matiere premiere pour construire la reponse.',
    "Le format demande par l'utilisateur est toujours prioritaire sur le format des donnees recues."
  ].join(' ');
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((entry) => entry && typeof entry.content === 'string')
    .slice(-16)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content.trim().slice(0, 1200)
    }))
    .filter((entry) => entry.content.length > 0);
}

function normalizeConversationSummary(summary) {
  return typeof summary === 'string' ? summary.replace(/\s+/g, ' ').trim().slice(0, 1800) : '';
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

function extractSnippet(result, maxTokens = 300) {
  const text = String(result?.snippet || result?.description || '');
  if (text.length <= maxTokens) return text;
  return text.slice(0, maxTokens).trim() + '...';
}

function normalizeTavilyApiKey(apiKey) {
  const cleaned = String(apiKey || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\r?\n/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^TAVILY_API_KEY\s*=\s*/i, '')
    .replace(/\s+/g, '')
    .trim();
  const match = cleaned.match(/tvly-[A-Za-z0-9_-]+/);
  return match ? match[0] : '';
}

function buildTavilyDiagnostics(apiKey, extra = {}) {
  const key = normalizeTavilyApiKey(apiKey);
  return {
    tavily_key_configured: key.length > 0,
    tavily_key_prefix: key ? key.slice(0, 8) : '',
    tavily_key_length: key.length,
    tavily_auth_header_built: key.length > 0,
    tavily_endpoint: TAVILY_SEARCH_ENDPOINT,
    ...extra
  };
}

function buildWebContextPrompt(language, searchResults, query, answer = '') {
  const sources = searchResults.map((r, i) => `${i + 1}. ${r.title || r.link} - ${r.link}`);
  const snippets = searchResults.map((r, i) => `${i + 1}. "${extractSnippet(r)}"`).join('\n');
  const answerBlock = answer ? `\nInternal synthesized search answer:\n${answer}\n` : '';

  if (language === 'en') {
    return [
      'A web search has already been performed.',
      'The following information is internal working data.',
      'Never reproduce raw search results.',
      'Never reproduce snippets.',
      'Never reproduce links.',
      'Analyze the information.',
      'Synthesize the data.',
      'Cross-check the sources.',
      'Build the requested answer.',
      'The web results are not the final answer.',
      'The final answer must be produced from these data.',
      'You may cite sources by identifier such as [1] only when useful; never print the URLs.',
      `Query: ${query}`,
      answerBlock,
      '',
      'Internal source index:',
      sources.join('\n'),
      '',
      'Internal excerpts:',
      snippets
    ].join('\n');
  }

  return [
    'Une recherche web a deja ete effectuee.',
    'Les informations suivantes sont des donnees de travail internes.',
    'Ne reproduis jamais les resultats bruts.',
    'Ne reproduis jamais les snippets.',
    'Ne reproduis jamais les liens.',
    'Analyse les informations.',
    'Synthetise les donnees.',
    'Recoupe les sources.',
    'Construis la reponse demandee.',
    'Les resultats web ne constituent pas la reponse finale.',
    'La reponse finale doit etre produite a partir de ces donnees.',
    'Tu peux citer les sources par identifiant comme [1] uniquement lorsque cela apporte de la valeur ; ne reproduis jamais les URLs.',
    `Requete : ${query}`,
    answerBlock,
    '',
    'Index interne des sources :',
    sources.join('\n'),
    '',
    'Extraits internes :',
    snippets
  ].join('\n');
}

function looksLikeToolCall(text) {
  const value = String(text || '').toLowerCase();
  return (
    value.includes('<tool_call') ||
    value.includes('</tool_call') ||
    value.includes('<arg_key>') ||
    value.includes('"tool_call"') ||
    value.includes('web_search')
  );
}

function isDebugWebEnabled(env, body) {
  return body?.debugWeb === true || String(env.DEBUG_WEB || '').toLowerCase() === 'true';
}

function buildDeterministicWebReply(language, searchResults, query, answer = '', rawResults = [], debugWeb = false) {
  const safeResults = Array.isArray(searchResults) ? searchResults.slice(0, 5) : [];
  const safeRawResults = Array.isArray(rawResults) ? rawResults.slice(0, 5) : [];
  if (!debugWeb) {
    return language === 'en'
      ? 'I could not produce a complete answer from the web search in this attempt. Please retry the request or specify the expected format.'
      : "Je n'ai pas pu produire une reponse complete a partir de la recherche web dans cette tentative. Relance la demande ou precise le format attendu.";
  }

  const resultBlocks = safeResults.map((result, index) => {
    const rawResult = safeRawResults[index] || {};
    const title = result.title || rawResult.title || result.link || rawResult.url || '';
    const url = result.link || rawResult.url || '';
    const baseLines = [
      `${index + 1}. **Titre**`,
      title,
      '',
      '**URL**',
      url
    ];

    if (debugWeb && rawResult && Object.keys(rawResult).length) {
      const score = rawResult.score !== undefined ? String(rawResult.score) : '';
      const publishedDate = rawResult.published_date || rawResult.publishedDate || '';
      if (score) baseLines.push('', '**Score Tavily**', score);
      if (publishedDate) baseLines.push('', '**Date Tavily**', String(publishedDate));
    }

    return baseLines.join('\n');
  });

  if (language === 'en') {
    const heading = `## DEBUG_WEB - Tavily results for "${query}"`;
    const tavilyAnswer = answer ? `\n\n**Tavily answer**\n${answer}` : '';
    return `${heading}${tavilyAnswer}\n\n${resultBlocks.join('\n\n')}`.trim();
  }

  const heading = `## DEBUG_WEB - Resultats Tavily pour "${query}"`;
  const tavilyAnswer = answer ? `\n\n**Réponse Tavily**\n${answer}` : '';
  return `${heading}${tavilyAnswer}\n\n${resultBlocks.join('\n\n')}`.trim();
}
function isFinancialQuery(query) {
  const lower = query.toLowerCase();
  const financialKeywords = ['action', 'cours', 'stock', 'bourse', 'nasdaq', 'nyse', 'ticker'];
  return financialKeywords.some(k => lower.includes(k));
}

function extractTicker(query) {
  const map = {
    'nvidia': 'NVDA',
    'apple': 'AAPL',
    'microsoft': 'MSFT',
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'amazon': 'AMZN',
    'tesla': 'TSLA',
    'meta': 'META',
    'facebook': 'META',
    'netflix': 'NFLX',
    'intel': 'INTC',
    'amd': 'AMD',
    'oracle': 'ORCL',
    'cisco': 'CSCO',
    'adobe': 'ADBE',
    'salesforce': 'CRM',
    'ibm': 'IBM',
    'qualcomm': 'QCOM',
    'broadcom': 'AVGO',
    'texas instruments': 'TXN',
    'intuit': 'INTU',
    'paypal': 'PYPL',
    'shopify': 'SHOP',
    'snowflake': 'SNOW',
    'zoom': 'ZM',
    'uber': 'UBER',
    'lyft': 'LYFT',
    'spotify': 'SPOT',
    'airbnb': 'ABNB',
    'doordash': 'DASH',
    'palantir': 'PLTR',
    // common lowercase tickers
    'nvda': 'NVDA',
    'aapl': 'AAPL',
    'msft': 'MSFT',
    'googl': 'GOOGL',
    'goog': 'GOOGL',
    'amzn': 'AMZN',
    'tsla': 'TSLA',
    'nflx': 'NFLX',
    'intc': 'INTC',
    'orcl': 'ORCL',
    'csco': 'CSCO',
    'adbe': 'ADBE',
    'crm': 'CRM',
    'qcom': 'QCOM',
    'avgo': 'AVGO',
    'txn': 'TXN',
    'intu': 'INTU',
    'pypl': 'PYPL',
    'shop': 'SHOP',
    'snow': 'SNOW',
    'zm': 'ZM',
    'spot': 'SPOT',
    'abnb': 'ABNB',
    'dash': 'DASH',
    'pltr': 'PLTR'
  };
  const words = query.split(/\s+/);
  for (const w of words) {
    const low = w.toLowerCase();
    if (map[low]) return map[low];
  }
  // detect uppercase ticker pattern
  const maybeTicker = query.match(/\b[A-Z]{1,5}\b/);
  if (maybeTicker) return maybeTicker[0];
  return null;
}

function buildFinancialQuery(originalQuery) {
  if (!isFinancialQuery(originalQuery)) return originalQuery;
  let ticker = extractTicker(originalQuery);
  let base = ticker ? `${ticker} stock price today` : originalQuery;
  const lower = originalQuery.toLowerCase();
  const nasdaqTickers = new Set(['NVDA','AAPL','MSFT','GOOGL','AMZN','TSLA','META','NFLX','INTC','AMD','CSCO','ADBE','CBMG','ORCL','IBM','QCOM','AVGO','TXN','INTU','PYPL','SHOP','SNOW','ZM','UBER','LYFT','SPOT','ABNB','DASH','PLTR']);
  const addNasdaq = lower.includes('nasdaq') || (ticker && nasdaqTickers.has(ticker));
  if (addNasdaq && !base.toLowerCase().includes('nasdaq')) {
    base += ' NASDAQ';
  }
  return base;
}

function normalizeWebSearchQuery(rawQuery, fallbackMessage = '') {
  const original = String(rawQuery || fallbackMessage || '').trim();
  if (!original) return '';

  let query = original
    .replace(/^recherche\s+web\s*:?\s*/i, '')
    .replace(/^web\s+search\s*:?\s*/i, '')
    .replace(/\r/g, '\n');

  const instructionMarkers = [
    '\n\nje veux',
    '\nje veux',
    '\n\nj’aimerais',
    '\nj’aimerais',
    '\n\nj aimerais',
    '\nj aimerais',
    '\n\nne m’invente',
    '\nne m’invente',
    '\n\nne m invente',
    '\nne m invente',
    '\n\ni want',
    '\ni want',
    '\n\ndo not',
    '\ndo not'
  ];
  const lower = query.toLowerCase();
  const cutIndex = instructionMarkers
    .map((marker) => lower.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (cutIndex >= 0) query = query.slice(0, cutIndex);

  query = query
    .replace(/^\s*[-*]?\s*\d+[.)]\s+/gm, ' ')
    .replace(/[“”"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (query.length > 240) {
    const sentenceEnd = query.slice(0, 240).search(/[?!。]\s*[^?!。]*$/);
    query = sentenceEnd > 40 ? query.slice(0, sentenceEnd + 1) : query.slice(0, 240);
  }

  return query.trim();
}

function hashQuery(query) {
  // Simple hash pour le cache
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function safeLogJson(label, value, maxLength = 6000) {
  try {
    const serialized = JSON.stringify(value, null, 2);
    console.log(label, serialized.length > maxLength ? `${serialized.slice(0, maxLength)}... [truncated]` : serialized);
  } catch (error) {
    console.log(label, '[unserializable]', error instanceof Error ? error.message : String(error));
  }
}

function compactText(value, maxLength = 120) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? compact.slice(0, maxLength).trim() : compact;
}

function safeMeta(meta) {
  let serialized = '{}';
  try {
    serialized = JSON.stringify(meta && typeof meta === 'object' ? meta : {});
  } catch (error) {
    serialized = JSON.stringify({ serialization_error: true });
  }
  if (serialized.length <= 4000) return serialized;
  return JSON.stringify({
    truncated: true,
    preview: serialized.slice(0, 3800)
  }).slice(0, 4000);
}

function normalizeEventType(value) {
  return compactText(value, 80).replace(/[^a-z0-9_:-]/gi, '_').toLowerCase() || 'ai_event';
}

function normalizeLogLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('fr')) return 'fr';
  return '';
}

function normalizeLogUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 1000) return '';
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 500);
  } catch (error) {
    return raw.slice(0, 500);
  }
}

function extractStatusCode(errorValue) {
  const match = String(errorValue || '').match(/\b(\d{3})\b/);
  return match ? Number(match[1]) : null;
}

async function logAiEvent(env, request, event) {
  try {
    if (!env?.DB) return;
    const userAgent = String(request.headers.get('User-Agent') || '').slice(0, 255);
    const ipAddress = String(request.headers.get('CF-Connecting-IP') || '').slice(0, 80);
    await env.DB.prepare(
      `INSERT INTO ai_assistant_events
        (session_id, event_type, event_value, language, page_url, meta, created_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      compactText(event?.session_id, 120),
      normalizeEventType(event?.event_type),
      compactText(event?.event_value, 255),
      normalizeLogLanguage(event?.language),
      normalizeLogUrl(event?.page_url),
      safeMeta(event?.meta),
      new Date().toISOString(),
      ipAddress,
      userAgent
    ).run();
  } catch (error) {
    console.warn('ai_event_log_failed', error instanceof Error ? error.message : String(error));
  }
}

function queueAiEvent(ctx, env, request, event) {
  const promise = logAiEvent(env, request, event);
  if (ctx?.waitUntil) ctx.waitUntil(promise);
}

function normalizeAttachmentKind(attachment) {
  const kind = String(attachment?.kind || '').trim().toLowerCase();
  if (['pdf', 'docx', 'xlsx', 'csv', 'pptx'].includes(kind)) return kind;
  const name = String(attachment?.name || '').toLowerCase();
  const extension = name.includes('.') ? name.split('.').pop() : '';
  if (extension === 'xls') return 'xlsx';
  if (extension === 'ppt') return 'pptx';
  if (['pdf', 'docx', 'xlsx', 'csv', 'pptx'].includes(extension)) return extension;
  return '';
}

function attachmentEventValue(attachment, kind) {
  const name = String(attachment?.name || '').trim();
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : kind;
  return `${extension || kind} uploaded`;
}

function isAllowedLegacyWebSearchEndpoint(endpoint) {
  const normalizedEndpoint = String(endpoint || '').trim();
  let blockedLegacyHost = false;
  try {
    const host = new URL(normalizedEndpoint).hostname;
    blockedLegacyHost = host === ['digitalblueskye-ai', 'digitalblueskye', 'workers', 'dev'].join('.');
  } catch (error) {
    blockedLegacyHost = true;
  }
  return (
    normalizedEndpoint.startsWith('https://') &&
    !blockedLegacyHost
  );
}

async function performLegacyWebSearch(query, endpoint) {
  const normalizedEndpoint = String(endpoint || '').trim();
  if (!isAllowedLegacyWebSearchEndpoint(normalizedEndpoint)) {
    return { results: [], answer: '', error: 'legacy_search_disabled', transformedQuery: query };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT);
  try {
    const response = await fetch(normalizedEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        mode: 'chat',
        language: 'fr',
        message: query,
        searchWeb: true,
        webSearchQuery: query
      })
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return { results: [], answer: '', error: `legacy_search_${response.status}`, transformedQuery: query };
    }
    const data = await response.json();
    const results = Array.isArray(data?.web_search_results)
      ? data.web_search_results
        .filter((result) => result && (result.link || result.url))
        .slice(0, 5)
        .map((result, index) => ({
          title: result.title || result.link || result.url || `Source ${index + 1}`,
          link: result.link || result.url,
          snippet: result.snippet || result.description || result.content || ''
        }))
      : [];
    return {
      results,
      rawResults: [],
      answer: '',
      error: results.length ? '' : (data?.web_search_error || 'legacy_search_no_results'),
      transformedQuery: data?.web_search_query || query
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      results: [],
      answer: '',
      error: error?.name === 'AbortError' ? 'legacy_search_timeout' : 'legacy_search_failed',
      transformedQuery: query
    };
  }
}

async function performWebSearch(query, env) {
  const normalizedApiKey = normalizeTavilyApiKey(env?.TAVILY_API_KEY);
  const fallbackEndpoint = String(env?.TAVILY_FALLBACK_ENDPOINT || '').trim();
  if (!normalizedApiKey) {
    if (isAllowedLegacyWebSearchEndpoint(fallbackEndpoint)) {
      return performLegacyWebSearch(query, fallbackEndpoint);
    }
    return {
      results: [],
      answer: '',
      error: 'missing_tavily_key',
      transformedQuery: query,
      diagnostics: buildTavilyDiagnostics(normalizedApiKey, {
        tavily_error: 'missing_tavily_key'
      })
    };
  }
  const normalizedQuery = normalizeWebSearchQuery(query);
  if (!normalizedQuery) return { results: [], answer: '', error: 'empty_web_search_query', transformedQuery: query };
  const transformedQuery = buildFinancialQuery(normalizedQuery);
  const cacheKey = hashQuery(transformedQuery);

  // Vérifier le cache
  const cached = webSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEB_SEARCH_CACHE_TTL) {
    console.log('web_search_cache_hit', { originalQuery: query, transformedQuery, cacheAge: Date.now() - cached.timestamp });
    return { ...cached, error: '', transformedQuery };
  }

  // Vérifier le debounce (éviter recherches identiques trop rapides)
  const debounceKey = cacheKey;
  const lastSearch = webSearchDebounce.get(debounceKey);
  if (lastSearch && Date.now() - lastSearch < 30000) {
    console.log('web_search_debounce', { originalQuery: query, transformedQuery, timeSinceLastSearch: Date.now() - lastSearch });
    return cached ? { ...cached, error: '', transformedQuery } : { results: [], answer: '', error: 'web_search_debounced', transformedQuery };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT);

    const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizedApiKey}`
      },
      body: JSON.stringify({
        query: transformedQuery,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
        include_raw_content: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const responsePreview = errorText.slice(0, 300);
      const diagnostics = buildTavilyDiagnostics(normalizedApiKey, {
        tavily_status_code: response.status,
        tavily_response_preview: responsePreview,
        tavily_error: `tavily_${response.status}`
      });
      console.warn('web_search_error', diagnostics);
      return {
        results: [],
        answer: '',
        error: `tavily_${response.status}`,
        transformedQuery,
        diagnostics
      };
    }

    const data = await response.json();
    safeLogJson('TAVILY_RAW', data);
    const results = data?.results || [];
    const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';

    // Format Tavily → format attendu (compatible ancien code)
    const formattedResults = results.map(r => ({
      title: r.title,
      link: r.url,
      snippet: r.content,
      description: r.content
    }));

    // Mettre en cache
    webSearchCache.set(cacheKey, {
      results: formattedResults,
      answer,
      rawResults: results,
      timestamp: Date.now()
    });

    // Enregistrer dernier search pour debounce
    webSearchDebounce.set(debounceKey, Date.now());

    console.log('web_search_success', {
      originalQuery: query,
      transformedQuery,
      resultsCount: formattedResults.length,
      result1: formattedResults[0] ? { title: formattedResults[0].title, link: formattedResults[0].link } : null,
      result2: formattedResults[1] ? { title: formattedResults[1].title, link: formattedResults[1].link } : null
    });

    return {
      results: formattedResults,
      answer,
      rawResults: results,
      error: '',
      transformedQuery,
      diagnostics: buildTavilyDiagnostics(normalizedApiKey, {
        tavily_status_code: response.status,
        tavily_response_preview: '',
        tavily_error: ''
      })
    };
  } catch (error) {
    const diagnostics = buildTavilyDiagnostics(normalizedApiKey, {
      tavily_status_code: 0,
      tavily_response_preview: '',
      tavily_error: error?.name === 'AbortError' ? 'web_search_timeout' : 'web_search_failed'
    });
    if (error.name === 'AbortError') {
      console.warn('web_search_timeout', { originalQuery: query, transformedQuery, timeoutMs: WEB_SEARCH_TIMEOUT, ...diagnostics });
      return { results: [], answer: '', error: 'web_search_timeout', transformedQuery, diagnostics };
    } else {
      console.warn('web_search_failed', { error: error.message, originalQuery: query, ...diagnostics });
      return { results: [], answer: '', error: 'web_search_failed', transformedQuery, diagnostics };
    }
  }
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

function isHealthAuthorized(request, env) {
  const healthToken = String(env.HEALTH_CHECK_TOKEN || '').trim();
  const healthHeader = request.headers.get('X-Health-Check-Token') || '';
  return healthToken.length > 0 && healthHeader.trim() === healthToken;
}

function detectedHealthEnvNames(env) {
  return Object.keys(env || {})
    .filter((name) => /^(OPENROUTER|TAVILY|MISTRAL|ADMIN|HEALTH|ALLOWED|DEBUG|OPENAI|AI_|WORKER)/i.test(name))
    .sort();
}

function buildHealthDiagnostics(request, env, authMode) {
  return {
    worker: 'digitalblueskye-ai',
    environment: env.ENVIRONMENT || env.CF_ENVIRONMENT || 'production',
    request_path: new URL(request.url).pathname,
    auth_mode: authMode,
    detected_variable_names: detectedHealthEnvNames(env),
    source: 'digitalblueskye-ai env bindings',
    secrets_values_exposed: false
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkOpenRouterHealth(env) {
  const configured = hasUsableOpenRouterKey(env);
  const timeoutMs = 8000;
  const configuredModel = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const healthModel = env.OPENROUTER_HEALTH_MODEL || configuredModel;
  if (!configured) {
    return {
      status: 'unavailable',
      verification: 'failed',
      configured,
      ok: false,
      latency_ms: null,
      timeout_ms: timeoutMs,
      status_code: null,
      response_preview: '',
      reply_detected: false,
      model_active: configuredModel,
      model_configured: configuredModel,
      health_model_used: healthModel,
      model_resolved: '',
      provider: 'openrouter',
      detail: 'OPENROUTER_API_KEY configurée: non.'
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: buildOpenRouterHeaders(env, env.ALLOWED_ORIGIN || 'https://digitalblueskye.netlify.app/'),
      body: JSON.stringify({
        model: healthModel,
        messages: [
          { role: 'system', content: 'Reply with OK only.' },
          { role: 'user', content: 'OK' }
        ],
        max_tokens: 16,
        temperature: 0
      })
    }, timeoutMs);
    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();
    const responsePreview = raw.slice(0, 300);
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {}
    const reply = extractReply(parsed);
    const replyDetected = Boolean(reply);
    const authFailed = response.status === 401 || response.status === 403;
    const ok = response.ok && replyDetected;
    const partial = !authFailed && (response.ok || response.status >= 400);
    return {
      status: ok ? 'operational' : (partial ? 'partial' : 'unavailable'),
      verification: ok ? 'verified' : (partial ? 'partial' : 'failed'),
      configured,
      ok,
      latency_ms: latencyMs,
      timeout_ms: timeoutMs,
      status_code: response.status,
      response_preview: responsePreview,
      reply_detected: replyDetected,
      model_active: configuredModel,
      model_configured: configuredModel,
      health_model_used: healthModel,
      model_resolved: parsed?.model || '',
      provider: 'openrouter',
      detail: ok
        ? 'OpenRouter répond à une requête de contrôle minimale.'
        : (response.ok
          ? 'OpenRouter répond HTTP 200 mais la réponse est vide ou non exploitable.'
          : (authFailed
            ? `OpenRouter a répondu HTTP ${response.status}: authentification refusée.`
            : `OpenRouter a répondu HTTP ${response.status}; contrôle ponctuel partiel.`))
    };
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return {
      status: isTimeout ? 'partial' : 'unavailable',
      verification: isTimeout ? 'partial' : 'failed',
      configured,
      ok: false,
      latency_ms: Date.now() - startedAt,
      timeout_ms: timeoutMs,
      status_code: 0,
      response_preview: '',
      reply_detected: false,
      model_active: configuredModel,
      model_configured: configuredModel,
      health_model_used: healthModel,
      model_resolved: '',
      provider: 'openrouter',
      detail: isTimeout
        ? 'Timeout du contrôle OpenRouter, mais le service peut rester utilisable côté chat.'
        : 'Contrôle OpenRouter échoué: erreur réseau complète.'
    };
  }
}

async function checkTavilyHealth(env) {
  const apiKey = normalizeTavilyApiKey(env?.TAVILY_API_KEY);
  const configured = apiKey.length > 0;
  const baseDiagnostics = buildTavilyDiagnostics(apiKey);
  if (!configured) {
    return {
      status: 'unconfigured',
      verification: 'partial',
      configured,
      ok: false,
      latency_ms: null,
      ...baseDiagnostics,
      tavily_status_code: null,
      tavily_response_preview: '',
      tavily_error: 'missing_tavily_key',
      detail: 'TAVILY_API_KEY configurée: non.'
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(TAVILY_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: 'Digital Blue Skye health check',
        search_depth: 'basic',
        max_results: 1,
        include_answer: true,
        include_raw_content: false
      })
    }, 3000);
    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();
    const responsePreview = raw.slice(0, 300);
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (error) {}
    const resultCount = Array.isArray(data?.results) ? data.results.length : 0;
    const tavilyError = response.ok ? '' : `tavily_${response.status}`;
    return {
      status: response.ok && resultCount > 0 ? 'operational' : 'partial',
      verification: response.ok && resultCount > 0 ? 'verified' : 'failed',
      configured,
      ok: response.ok && resultCount > 0,
      latency_ms: latencyMs,
      ...baseDiagnostics,
      tavily_status_code: response.status,
      tavily_response_preview: responsePreview,
      tavily_error: tavilyError,
      detail: response.ok
        ? `Tavily répond à une requête test (${resultCount} résultat).`
        : `Tavily a répondu HTTP ${response.status}.`
    };
  } catch (error) {
    return {
      status: 'unavailable',
      verification: 'failed',
      configured,
      ok: false,
      latency_ms: Date.now() - startedAt,
      ...baseDiagnostics,
      tavily_status_code: 0,
      tavily_response_preview: '',
      tavily_error: error?.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      detail: error?.name === 'AbortError' ? 'Timeout du contrôle Tavily.' : 'Contrôle Tavily échoué.'
    };
  }
}

async function buildAiHealthPayload(request, env, authMode) {
  const checkedAt = new Date().toISOString();
  const openRouterConfigured = hasUsableOpenRouterKey(env);
  const tavilyConfigured = normalizeTavilyApiKey(env?.TAVILY_API_KEY).length > 0;
  const mistralConfigured = String(env?.MISTRAL_API_KEY || '').trim().length > 0;
  const [openRouterCheck, tavilyCheck] = await Promise.all([
    checkOpenRouterHealth(env),
    checkTavilyHealth(env)
  ]);

  return {
    ok: true,
    worker: 'digitalblueskye-ai',
    openrouter_key_configured: openRouterConfigured,
    tavily_key_configured: tavilyConfigured,
    tavily_key_prefix: tavilyCheck.tavily_key_prefix || '',
    tavily_key_length: tavilyCheck.tavily_key_length || 0,
    tavily_auth_header_built: Boolean(tavilyCheck.tavily_auth_header_built),
    tavily_endpoint: tavilyCheck.tavily_endpoint || TAVILY_SEARCH_ENDPOINT,
    tavily_status_code: tavilyCheck.tavily_status_code ?? null,
    tavily_response_preview: tavilyCheck.tavily_response_preview || '',
    tavily_error: tavilyCheck.tavily_error || '',
    mistral_key_configured: mistralConfigured,
    model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
    provider: 'openrouter',
    timestamp: checkedAt,
    version: '2.0',
    checked_at: checkedAt,
    service: 'digitalblueskye-ai',
    worker_build: WORKER_BUILD,
    health_diagnostics: buildHealthDiagnostics(request, env, authMode),
    configuration: {
      openrouter_api_key_configured: openRouterConfigured,
      tavily_api_key_configured: tavilyConfigured,
      tavily_key_prefix: tavilyCheck.tavily_key_prefix || '',
      tavily_key_length: tavilyCheck.tavily_key_length || 0,
      tavily_auth_header_built: Boolean(tavilyCheck.tavily_auth_header_built),
      tavily_endpoint: tavilyCheck.tavily_endpoint || TAVILY_SEARCH_ENDPOINT,
      tavily_status_code: tavilyCheck.tavily_status_code ?? null,
      tavily_response_preview: tavilyCheck.tavily_response_preview || '',
      tavily_error: tavilyCheck.tavily_error || '',
      mistral_api_key_configured: mistralConfigured,
      source: 'digitalblueskye-ai'
    },
    ai_state: {
      model_active: openRouterCheck.model_active || env.OPENROUTER_MODEL || DEFAULT_MODEL,
      model_configured: openRouterCheck.model_configured || env.OPENROUTER_MODEL || DEFAULT_MODEL,
      health_model_used: openRouterCheck.health_model_used || env.OPENROUTER_HEALTH_MODEL || env.OPENROUTER_MODEL || DEFAULT_MODEL,
      model_resolved: openRouterCheck.model_resolved || '',
      provider: 'openrouter',
      fallback_active: Boolean(env.OPENROUTER_FALLBACK_MODELS || FALLBACK_MODEL),
      last_successful_call_at: openRouterCheck.ok ? checkedAt : null,
      openrouter_error_count: openRouterCheck.verification === 'failed' ? 1 : 0,
      fallback_used_count: 0,
      average_latency_ms: openRouterCheck.latency_ms,
      last_check: openRouterCheck
    },
    checks: {
      openrouter: openRouterCheck,
      tavily: tavilyCheck
    },
    services: [
      {
        name: 'OpenRouter',
        status: openRouterCheck.status,
        verification: openRouterCheck.verification,
        latency_ms: openRouterCheck.latency_ms,
        detail: openRouterCheck.detail,
        last_checked_at: checkedAt,
        priority: openRouterConfigured ? 'Surveiller les erreurs fournisseur et les modèles de repli.' : 'Configurer le secret OPENROUTER_API_KEY.'
      },
      {
        name: 'Tavily',
        status: tavilyCheck.status,
        verification: tavilyCheck.verification,
        latency_ms: tavilyCheck.latency_ms,
        detail: tavilyCheck.detail,
        last_checked_at: checkedAt,
        priority: tavilyConfigured ? 'Surveiller les quotas et la pertinence des résultats.' : 'Configurer le secret TAVILY_API_KEY.'
      },
      {
        name: 'Recherche web',
        status: tavilyCheck.ok ? 'operational' : 'partial',
        verification: tavilyCheck.verification,
        latency_ms: tavilyCheck.latency_ms,
        detail: tavilyCheck.ok ? 'Recherche temps réel vérifiée via Tavily.' : 'Recherche web demandable, mais contrôle Tavily incomplet.',
        last_checked_at: checkedAt,
        priority: tavilyConfigured ? 'Ajouter un contrôle externe de disponibilité.' : 'Brancher Tavily pour les recherches temps réel.'
      }
    ]
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request, env);
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.netlify.app/';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method === 'GET' && url.pathname.replace(/\/+$/, '') === '/admin/health') {
      const healthTokenOk = isHealthAuthorized(request, env);
      const authMode = healthTokenOk ? 'health_check_token' : 'none';
      console.log('admin_health_request', buildHealthDiagnostics(request, env, authMode));
      if (!healthTokenOk) {
        return jsonResponse(
          {
            ok: false,
            error: 'unauthorized',
            health_diagnostics: {
              worker: 'digitalblueskye-ai',
              request_path: url.pathname,
              auth_mode: 'unauthorized',
              source: 'digitalblueskye-ai env bindings',
              secrets_values_exposed: false
            }
          },
          401,
          corsHeaders
        );
      }
      return jsonResponse(await buildAiHealthPayload(request, env, authMode), 200, corsHeaders);
    }

    if (request.method === 'GET') {
      return jsonResponse({
        ok: true,
        service: 'digitalblueskye-ai',
        worker_build: WORKER_BUILD
      }, 200, corsHeaders);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders);
    }

    let body;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      queueAiEvent(ctx, env, request, {
        event_type: 'api_error',
        event_value: 'Invalid JSON payload',
        meta: { error: 'invalid_json', route: url.pathname, mode: 'unknown' }
      });
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, corsHeaders);
    }

    const mode = typeof body?.mode === 'string' ? body.mode : 'chat';
    if (mode === 'event') {
      return jsonResponse({ ok: true, tracked: true }, 200, corsHeaders);
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const language = body?.language === 'en' ? 'en' : 'fr';
    const history = normalizeHistory(body?.history);
    const conversationSummary = normalizeConversationSummary(body?.conversationSummary);
    const shouldSearchWeb = body?.searchWeb === true || body?.searchWeb === 'true';
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : (typeof body?.session_id === 'string' ? body.session_id : '');
    const pageUrl = typeof body?.pageUrl === 'string' ? body.pageUrl : (typeof body?.page_url === 'string' ? body.page_url : '');
    const hasFileContext = body?.hasFileContext === true || body?.has_file_context === true || String(body?.fileContextLength || '') !== '';
    const attachments = Array.isArray(body?.attachments) ? body.attachments.slice(0, 10) : [];
    const debugWeb = isDebugWebEnabled(env, body);
    const webSearchQuery = typeof body?.webSearchQuery === 'string' && body.webSearchQuery.trim()
      ? body.webSearchQuery.trim().slice(0, 500)
      : message.slice(0, 500);

    if (!message) {
      queueAiEvent(ctx, env, request, {
        event_type: 'api_error',
        event_value: 'Empty chat message',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: { error: 'empty_message', route: url.pathname, mode }
      });
      return jsonResponse({ ok: false, error: 'empty_message' }, 400, corsHeaders);
    }

    if (!hasUsableOpenRouterKey(env)) {
      queueAiEvent(ctx, env, request, {
        event_type: 'api_error',
        event_value: 'Missing OpenRouter key',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: { error: 'missing_openrouter_key', route: url.pathname, mode }
      });
      return jsonResponse({ ok: false, error: 'missing_openrouter_key' }, 500, corsHeaders);
    }

    const primaryModel = env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const dateContext = normalizeDateContext(body?.currentDate);
    const systemPrompt = buildSystemPrompt(language, dateContext);
    const configuredMaxTokens = Number(env.OPENROUTER_MAX_TOKENS);
    const requestedMaxTokens = Number(body?.maxTokens);
    const maxTokensFloor = Math.max(
      DEFAULT_MAX_TOKENS,
      Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0 ? requestedMaxTokens : 0
    );
    const maxTokens = Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0
      ? Math.min(Math.max(configuredMaxTokens, maxTokensFloor), 2200)
      : Math.min(maxTokensFloor, 2200);

    let finalSystemPrompt = systemPrompt;
    let webSearchResults = [];
    let webSearchRawResults = [];
    let webSearchAnswer = '';
    let webSearchError = '';
    let webSearchResolvedQuery = webSearchQuery;
    let webSearchPerformed = false;

    queueAiEvent(ctx, env, request, {
      event_type: 'user_message',
      event_value: compactText(body?.messagePreview || message, 120),
      language,
      page_url: pageUrl,
      session_id: sessionId,
      meta: {
        message_length: message.length,
        has_attachments: attachments.length > 0,
        attachment_count: attachments.length,
        mode,
        search_web_requested: shouldSearchWeb,
        history_length: history.length
      }
    });

    for (const attachment of attachments) {
      const kind = normalizeAttachmentKind(attachment);
      if (!kind) continue;
      queueAiEvent(ctx, env, request, {
        event_type: `${kind}_uploaded`,
        event_value: attachmentEventValue(attachment, kind),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          extension: kind,
          size: Number(attachment?.size || 0) || 0,
          extractedTextLength: Number(attachment?.extractedTextLength || 0) || 0
        }
      });
    }

    if (shouldSearchWeb) {
      const webSearchStartedAt = Date.now();
      queueAiEvent(ctx, env, request, {
        event_type: 'web_search',
        event_value: compactText(webSearchQuery, 120),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          query_length: webSearchQuery.length,
          provider: 'tavily',
          requested: true
        }
      });
      const webSearch = await performWebSearch(webSearchQuery, env);
      const webSearchLatencyMs = Date.now() - webSearchStartedAt;
      webSearchResults = webSearch.results || [];
      webSearchRawResults = webSearch.rawResults || [];
      webSearchAnswer = webSearch.answer || '';
      webSearchError = webSearch.error || '';
      webSearchResolvedQuery = webSearch.transformedQuery || webSearchQuery;
      webSearchPerformed = webSearchResults.length > 0;
      const webSearchDiagnostics = webSearch.diagnostics || {};
      queueAiEvent(ctx, env, request, {
        event_type: webSearchError ? 'web_search_error' : 'web_search_success',
        event_value: webSearchError ? compactText(webSearchError, 120) : `${webSearchResults.length} result(s)`,
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: webSearchError
          ? {
            provider: 'tavily',
            error: compactText(webSearchError, 180),
            status_code: webSearchDiagnostics.tavily_status_code ?? extractStatusCode(webSearchError),
            endpoint: webSearchDiagnostics.tavily_endpoint || TAVILY_SEARCH_ENDPOINT,
            response_preview: compactText(webSearchDiagnostics.tavily_response_preview, 300),
            key_prefix: webSearchDiagnostics.tavily_key_prefix || '',
            key_length: webSearchDiagnostics.tavily_key_length || 0,
            auth_header_built: Boolean(webSearchDiagnostics.tavily_auth_header_built),
            latency_ms: webSearchLatencyMs
          }
          : {
            provider: 'tavily',
            results_count: webSearchResults.length,
            latency_ms: webSearchLatencyMs,
            query_preview: compactText(webSearchResolvedQuery, 120)
          }
      });
      console.log('web_search_debug', {
        shouldSearchWeb,
        tavilyApiKey: env.TAVILY_API_KEY ? 'configured' : 'missing',
        searchQuery: webSearchQuery,
        resolvedQuery: webSearchResolvedQuery,
        error: webSearchError || null,
        resultsCount: webSearchResults.length,
        result1: webSearchResults[0] ? { title: webSearchResults[0].title, link: webSearchResults[0].link } : null,
        result2: webSearchResults[1] ? { title: webSearchResults[1].title, link: webSearchResults[1].link } : null
      });
      if (webSearchPerformed) {
        finalSystemPrompt = [
          systemPrompt,
          buildWebContextPrompt(language, webSearchResults, webSearchResolvedQuery, webSearchAnswer)
        ].join('\n\n');
        safeLogJson('WEB_CONTEXT', {
          performed: true,
          query: webSearchResolvedQuery,
          answerLength: webSearchAnswer.length,
          resultsCount: webSearchResults.length,
          sources: webSearchResults.map((result, index) => ({
            index: index + 1,
            title: result.title,
            link: result.link,
            snippetLength: String(result.snippet || '').length
          })),
          prompt: finalSystemPrompt
        });
      } else {
        finalSystemPrompt = [
          systemPrompt,
          language === 'en'
            ? `Live web search was requested, but it did not return usable results. Technical status: ${webSearchError || 'no_results'}. Be transparent about this search failure; do not invent current facts.`
            : `Une recherche web temps reel a ete demandee, mais elle n'a pas retourne de resultats exploitables. Statut technique : ${webSearchError || 'no_results'}. Sois transparent sur cet echec de recherche ; n'invente pas de faits recents.`
        ].join('\n\n');
        safeLogJson('WEB_CONTEXT', {
          performed: false,
          query: webSearchResolvedQuery,
          error: webSearchError || 'no_results',
          prompt: finalSystemPrompt
        });
      }
    }

    function buildOpenRouterPayload(modelName) {
      const memoryMessage = conversationSummary
        ? [{
          role: 'system',
          content: language === 'en'
            ? `Conversation memory from previous turns. Use it only for continuity and do not mention it explicitly:\n${conversationSummary}`
            : `Memoire de conversation issue des echanges precedents. Utilise-la uniquement pour assurer la continuite et ne la mentionne pas explicitement :\n${conversationSummary}`
        }]
        : [];

      return {
        model: modelName,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          ...memoryMessage,
          ...history,
          { role: 'user', content: message }
        ],
        temperature: 0.35,
        max_tokens: maxTokens
      };
    }

    async function callOpenRouter(modelName) {
      let upstream;
      const startedAt = Date.now();
      const openRouterHeaders = buildOpenRouterHeaders(env, allowedOrigin);
      const payload = buildOpenRouterPayload(modelName);
      queueAiEvent(ctx, env, request, {
        event_type: 'openrouter_request',
        event_value: modelName,
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          model: modelName,
          provider: 'openrouter',
          message_count: payload.messages.length,
          has_web_context: webSearchPerformed,
          has_file_context: hasFileContext
        }
      });
      try {
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: openRouterHeaders,
          body: JSON.stringify(payload)
        });
      } catch (error) {
        return {
          upstream: null,
          parsed: null,
          transportError: error instanceof Error ? error.message : 'openrouter_fetch_failed',
          latencyMs: Date.now() - startedAt
        };
      }

      const raw = await upstream.text();
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (error) {
        // Keep raw payload in diagnostic response below.
      }
      return { upstream, parsed, latencyMs: Date.now() - startedAt };
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
        queueAiEvent(ctx, env, request, {
          event_type: 'openrouter_error',
          event_value: compactText(lastError.upstream_error, 120),
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: {
            model: modelName,
            status_code: 0,
            upstream_error: compactText(lastError.upstream_error, 300),
            latency_ms: result.latencyMs || 0
          }
        });
        if (!shouldTryFallback(0, lastError.upstream_error)) break;
        continue;
      }

      if (result.upstream.ok && extractReply(parsed)) {
        upstreamSucceeded = true;
        queueAiEvent(ctx, env, request, {
          event_type: 'openrouter_response',
          event_value: parsed?.model || modelName,
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: {
            model: modelName,
            resolved_model: parsed?.model || modelName,
            latency_ms: result.latencyMs || 0,
            reply_length: extractReply(parsed).length,
            fallback_model_used: modelName !== primaryModel,
            status_code: result.upstream.status
          }
        });
        break;
      }

      if (result.upstream.ok) {
        lastError = {
          model: modelName,
          status_code: result.upstream.status,
          upstream_error: 'empty_openrouter_reply',
          openrouter_key_configured: hasUsableOpenRouterKey(env),
          authorization_header_built: hasAuthorizationHeader(buildOpenRouterHeaders(env, allowedOrigin)),
          diagnostic: buildEmptyReplyDiagnostic(parsed)
        };
        attempts.push(lastError);
        console.warn('openrouter_attempt_empty_reply', lastError);
        queueAiEvent(ctx, env, request, {
          event_type: 'openrouter_error',
          event_value: 'empty_openrouter_reply',
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: {
            model: modelName,
            status_code: result.upstream.status,
            upstream_error: 'empty_openrouter_reply',
            latency_ms: result.latencyMs || 0
          }
        });
        continue;
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
      queueAiEvent(ctx, env, request, {
        event_type: 'openrouter_error',
        event_value: compactText(upstreamError, 120),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          model: modelName,
          status_code: result.upstream.status,
          upstream_error: compactText(upstreamError, 300),
          latency_ms: result.latencyMs || 0
        }
      });

      if (!shouldTryFallback(result.upstream.status, upstreamError)) break;
    }

    if (!upstreamSucceeded && lastError && lastError.upstream_error !== 'empty_openrouter_reply' && (!parsed || !extractReply(parsed))) {
      queueAiEvent(ctx, env, request, {
        event_type: 'api_error',
        event_value: 'OpenRouter request failed',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          error: 'openrouter_error',
          route: url.pathname,
          mode,
          model: lastError.model,
          status_code: lastError.status_code
        }
      });
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

    let reply = extractReply(parsed);
    if (webSearchPerformed && looksLikeToolCall(reply)) {
      console.warn('openrouter_returned_tool_call_for_web_search', {
        resolvedModel,
        webSearchQuery: webSearchResolvedQuery,
        replyPreview: String(reply || '').slice(0, 300)
      });
      queueAiEvent(ctx, env, request, {
        event_type: 'fallback_used',
        event_value: 'deterministic_web_reply',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          fallback_reason: 'tool_call_for_web_search',
          model: resolvedModel,
          provider: 'openrouter'
        }
      });
      reply = buildDeterministicWebReply(language, webSearchResults, webSearchResolvedQuery, webSearchAnswer);
    }

    if (!reply) {
      const deterministicWebReply = webSearchPerformed
        ? buildDeterministicWebReply(language, webSearchResults, webSearchResolvedQuery, webSearchAnswer)
        : '';
      const fallbackReply = deterministicWebReply || (
        language === 'en'
          ? 'I could not generate a complete answer right now. Please try again.'
          : "Je n'ai pas pu generer une reponse complete pour le moment. Reessayez dans un instant."
      );
      const fallbackReason = deterministicWebReply ? 'deterministic_web_reply' : 'empty_openrouter_reply';
      queueAiEvent(ctx, env, request, {
        event_type: 'fallback_used',
        event_value: fallbackReason,
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          fallback_reason: fallbackReason,
          model: resolvedModel,
          provider: 'openrouter'
        }
      });
      queueAiEvent(ctx, env, request, {
        event_type: 'assistant_response',
        event_value: compactText(fallbackReply, 120),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          reply_length: fallbackReply.length,
          provider: 'openrouter',
          model: resolvedModel,
          fallback: true,
          web_search_performed: webSearchPerformed
        }
      });
      return jsonResponse(
        {
          ok: true,
          worker_build: WORKER_BUILD,
          reply: fallbackReply,
          fallback: true,
          fallback_reason: fallbackReason,
          diagnostic: buildEmptyReplyDiagnostic(parsed),
          web_search_requested: shouldSearchWeb,
          web_search_performed: webSearchPerformed,
          web_search_error: webSearchError || '',
          web_search_query: webSearchResolvedQuery,
          web_search_results: webSearchResults.map((r, i) => ({
            index: i + 1,
            title: r.title,
            link: r.link
          }))
        },
        200,
        corsHeaders
      );
    }

    const responseBody = {
      ok: true,
      worker_build: WORKER_BUILD,
      reply,
      provider: 'openrouter',
      model: resolvedModel,
      resolved_model: parsed?.model || resolvedModel,
      fallback_model_used: resolvedModel !== primaryModel
    };

    if (responseBody.fallback_model_used) {
      queueAiEvent(ctx, env, request, {
        event_type: 'fallback_used',
        event_value: resolvedModel,
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          fallback_reason: 'model_fallback',
          model: resolvedModel,
          provider: 'openrouter'
        }
      });
    }

    queueAiEvent(ctx, env, request, {
      event_type: 'assistant_response',
      event_value: compactText(reply, 120),
      language,
      page_url: pageUrl,
      session_id: sessionId,
      meta: {
        reply_length: reply.length,
        provider: 'openrouter',
        model: resolvedModel,
        fallback: responseBody.fallback_model_used,
        web_search_performed: webSearchPerformed
      }
    });

    if (shouldSearchWeb) {
      responseBody.web_search_requested = true;
      responseBody.web_search_performed = webSearchPerformed;
      responseBody.web_search_error = webSearchError || '';
      responseBody.web_search_query = webSearchResolvedQuery;
      responseBody.web_search_results = webSearchResults.map((r, i) => ({
        index: i + 1,
        title: r.title,
        link: r.link
      }));
    }

    return jsonResponse(responseBody, 200, corsHeaders);
  }
};
