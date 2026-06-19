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
 *   Example: https://digitalblueskye.infinityfreeapp.com
 * - TAVILY_API_KEY (secret) - for real-time web search capability
 */

const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const FALLBACK_MODEL = 'openrouter/auto';
const WORKER_BUILD = '2026-06-18-web-search-openrouter-v3';
const LEGACY_WEB_SEARCH_ENDPOINT = 'https://digitalblueskye-ai.digitalblueskye.workers.dev';
const DEFAULT_MAX_TOKENS = 1400;
const WEB_SEARCH_TIMEOUT = 8000; // 8 secondes max par recherche web
const WEB_SEARCH_CACHE_TTL = 3600000; // 1 heure de cache

// Cache simple pour débounce et réutilisation des résultats
const webSearchCache = new Map();
const webSearchDebounce = new Map();

function buildCorsHeaders(request, env) {
  const fallbackOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.infinityfreeapp.com';
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
  return String(apiKey || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^TAVILY_API_KEY\s*=\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '')
    .trim();
}

function shouldUseNewsTopic(query) {
  const lower = String(query || '').toLowerCase();
  return [
    'news',
    'latest',
    'announcement',
    'annonce',
    'annonces',
    'actualité',
    'actualités',
    'aujourd',
    'temps réel',
    'recent',
    'récent'
  ].some((keyword) => lower.includes(keyword));
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

async function performLegacyWebSearch(query, endpoint = LEGACY_WEB_SEARCH_ENDPOINT) {
  const normalizedEndpoint = String(endpoint || '').trim();
  if (!normalizedEndpoint) return { results: [], answer: '', error: 'missing_tavily_key', transformedQuery: query };

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
  if (!normalizedApiKey) return performLegacyWebSearch(query, env?.TAVILY_FALLBACK_ENDPOINT);
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

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizedApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: transformedQuery,
        max_results: 5,
        search_depth: 'basic',
        topic: shouldUseNewsTopic(transformedQuery) ? 'news' : 'general',
        include_answer: 'basic',
        include_raw_content: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('web_search_error', { status: response.status, statusText: response.statusText, errorText: errorText.slice(0, 240) });
      return { results: [], answer: '', error: `tavily_${response.status}`, transformedQuery };
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

    return { results: formattedResults, answer, rawResults: results, error: '', transformedQuery };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('web_search_timeout', { originalQuery: query, transformedQuery, timeoutMs: WEB_SEARCH_TIMEOUT });
      return { results: [], answer: '', error: 'web_search_timeout', transformedQuery };
    } else {
      console.warn('web_search_failed', { error: error.message, originalQuery: query });
      return { results: [], answer: '', error: 'web_search_failed', transformedQuery };
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
    .filter((name) => /^(OPENROUTER|TAVILY|SERPER|MISTRAL|ADMIN|HEALTH|ALLOWED|DEBUG|OPENAI|AI_|WORKER)/i.test(name))
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
  if (!configured) {
    return {
      status: 'unconfigured',
      verification: 'partial',
      configured,
      ok: false,
      latency_ms: null,
      detail: 'OPENROUTER_API_KEY configurée: non.'
    };
  }

  const startedAt = Date.now();
  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: buildOpenRouterHeaders(env, env.ALLOWED_ORIGIN || 'https://digitalblueskye.netlify.app'),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Health check. Reply with OK only.' },
          { role: 'user', content: 'OK?' }
        ],
        max_tokens: 8,
        temperature: 0
      })
    }, 3000);
    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {}
    const reply = extractReply(parsed);
    return {
      status: response.ok && reply ? 'operational' : 'partial',
      verification: response.ok && reply ? 'verified' : 'failed',
      configured,
      ok: response.ok && Boolean(reply),
      latency_ms: latencyMs,
      model_active: model,
      model_resolved: parsed?.model || model,
      provider: 'openrouter',
      detail: response.ok && reply
        ? 'OpenRouter répond à une requête de contrôle minimale.'
        : `OpenRouter a répondu HTTP ${response.status}, sans réponse exploitable.`
    };
  } catch (error) {
    return {
      status: 'unavailable',
      verification: 'failed',
      configured,
      ok: false,
      latency_ms: Date.now() - startedAt,
      model_active: model,
      model_resolved: '',
      provider: 'openrouter',
      detail: error?.name === 'AbortError' ? 'Timeout du contrôle OpenRouter.' : 'Contrôle OpenRouter échoué.'
    };
  }
}

async function checkTavilyHealth(env) {
  const apiKey = normalizeTavilyApiKey(env?.TAVILY_API_KEY);
  const configured = apiKey.length > 0;
  if (!configured) {
    return {
      status: 'unconfigured',
      verification: 'partial',
      configured,
      ok: false,
      latency_ms: null,
      detail: 'TAVILY_API_KEY configurée: non.'
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: 'Digital Blue Skye health check',
        topic: 'general',
        search_depth: 'basic',
        max_results: 1,
        include_answer: false,
        include_raw_content: false
      })
    }, 3000);
    const latencyMs = Date.now() - startedAt;
    const data = await response.json().catch(() => null);
    const resultCount = Array.isArray(data?.results) ? data.results.length : 0;
    return {
      status: response.ok && resultCount > 0 ? 'operational' : 'partial',
      verification: response.ok && resultCount > 0 ? 'verified' : 'failed',
      configured,
      ok: response.ok && resultCount > 0,
      latency_ms: latencyMs,
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
      detail: error?.name === 'AbortError' ? 'Timeout du contrôle Tavily.' : 'Contrôle Tavily échoué.'
    };
  }
}

async function buildAiHealthPayload(request, env, authMode) {
  const checkedAt = new Date().toISOString();
  const openRouterConfigured = hasUsableOpenRouterKey(env);
  const tavilyConfigured = normalizeTavilyApiKey(env?.TAVILY_API_KEY).length > 0;
  const serperConfigured = String(env?.SERPER_API_KEY || '').trim().length > 0;
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
    serper_key_configured: serperConfigured,
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
      serper_api_key_configured: serperConfigured,
      mistral_api_key_configured: mistralConfigured,
      source: 'digitalblueskye-ai'
    },
    ai_state: {
      model_active: openRouterCheck.model_active || env.OPENROUTER_MODEL || DEFAULT_MODEL,
      model_resolved: openRouterCheck.model_resolved || '',
      provider: 'openrouter',
      fallback_active: Boolean(env.OPENROUTER_FALLBACK_MODELS || FALLBACK_MODEL),
      last_successful_call_at: openRouterCheck.ok ? checkedAt : null,
      openrouter_error_count: openRouterCheck.ok ? 0 : 1,
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
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request, env);
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.infinityfreeapp.com';

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
    const debugWeb = isDebugWebEnabled(env, body);
    const webSearchQuery = typeof body?.webSearchQuery === 'string' && body.webSearchQuery.trim()
      ? body.webSearchQuery.trim().slice(0, 500)
      : message.slice(0, 500);

    if (!message) {
      return jsonResponse({ ok: false, error: 'empty_message' }, 400, corsHeaders);
    }

    if (!hasUsableOpenRouterKey(env)) {
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

    if (shouldSearchWeb) {
      const webSearch = await performWebSearch(webSearchQuery, env);
      webSearchResults = webSearch.results || [];
      webSearchRawResults = webSearch.rawResults || [];
      webSearchAnswer = webSearch.answer || '';
      webSearchError = webSearch.error || '';
      webSearchResolvedQuery = webSearch.transformedQuery || webSearchQuery;
      webSearchPerformed = webSearchResults.length > 0;
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

      if (result.upstream.ok && extractReply(parsed)) {
        upstreamSucceeded = true;
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

      if (!shouldTryFallback(result.upstream.status, upstreamError)) break;
    }

    if (!upstreamSucceeded && lastError && lastError.upstream_error !== 'empty_openrouter_reply' && (!parsed || !extractReply(parsed))) {
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
      reply = buildDeterministicWebReply(language, webSearchResults, webSearchResolvedQuery, webSearchAnswer);
    }

    if (!reply) {
      const deterministicWebReply = webSearchPerformed
        ? buildDeterministicWebReply(language, webSearchResults, webSearchResolvedQuery, webSearchAnswer)
        : '';
      return jsonResponse(
        {
          ok: true,
          worker_build: WORKER_BUILD,
          reply: deterministicWebReply || (
            language === 'en'
              ? 'I could not generate a complete answer right now. Please try again.'
              : "Je n'ai pas pu generer une reponse complete pour le moment. Reessayez dans un instant."
          ),
          fallback: true,
          fallback_reason: deterministicWebReply ? 'deterministic_web_reply' : 'empty_openrouter_reply',
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
