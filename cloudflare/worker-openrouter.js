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

import { computeProjectPlan, DEFAULT_V3_PLACEHOLDERS } from './aiProjectManager.js';
import { indexDocumentChunks, deleteDocumentVectors, queryRag, diagnoseRagPipeline } from './ragPipeline.js';
import { routeChatCompletion, diagnoseCloudflareAi, diagnoseOpenAi, diagnoseOpenRouterKey } from './modelRouter.js';
import { detectUserIntent, planCapabilities, composeSystemPrompt, isOrchestratorEnabled } from './promptOrchestrator.js';
import {
  detectCapabilities,
  planCapabilities as planCapabilityPlan,
  buildExecutionPlan,
  isCapabilityPlannerEnabled
} from './capabilityPlanner.js';
import {
  detectEvidenceNeed,
  planEvidence,
  buildSourcePolicy,
  isSourcePlannerEnabled
} from './sourcePlanner.js';
import {
  buildExecutionIntent,
  resolveExecutionPlan,
  buildExecutionPolicy,
  isExecutionPlannerEnabled
} from './executionPlanner.js';
import { evaluateResponse, repairResponse, buildRetrySystemInstruction, buildImproveSystemInstruction, isRqcEnabled, QUALITY_ACTIONS } from './responseQualityController.js';

const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const FALLBACK_MODEL = 'openrouter/auto';
const WORKER_BUILD = '2026-06-20-tavily-economy-v4';
const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_MAX_TOKENS = 700;
// Niveaux de tokens essayes en cascade quand un modele renvoie 402 (credit
// insuffisant pour le nombre de tokens demande) : on reduit avant de changer
// de modele, plutot que d'abandonner directement.
const TOKEN_RETRY_LEVELS = [700, 500, 350];
const WEB_SEARCH_TIMEOUT = 8000; // 8 secondes max par recherche web
const WEB_SEARCH_CACHE_TTL = 21600000; // 6 heures de cache
const WEB_SEARCH_DEDUPE_WINDOW = 60000; // 60 secondes
const WEB_SEARCH_MAX_PER_SESSION = 5;
const TAVILY_DEFAULT_QUOTA = 1000;

// Cache mémoire Worker: économique, non persistant, partagé tant que l'isolat Cloudflare reste chaud.
const webSearchCache = new Map();
const webSearchInFlight = new Map();
const webSearchRecentRequests = new Map();
let tavilyDedupeTableReady = false;
const tavilyRuntimeStats = {
  searchesExecuted: 0,
  cacheHits: 0,
  cacheMisses: 0,
  deduplicatedRequests: 0,
  savedByDedupe: 0,
  skipped: 0,
  errors: 0,
  totalLatencyMs: 0,
  estimatedCreditsUsed: 0,
  lastCallAt: null,
  lastLatencyMs: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: '',
  lastEndpoint: TAVILY_SEARCH_ENDPOINT
};

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
      'Mission: help the user analyze, understand, research, compare, plan, write, and produce professional deliverables in digital project management, product, web, AI, UX, digital marketing, strategic monitoring, documentation, and project steering.',
      'Answering principles: be precise, factual, structured, directly usable, and transparent about information limits. Never invent facts, figures, citations, prices, dates, rankings, references, or sources. When information depends on current or external data, clearly state that web search or a provided source is required if no reliable data is available.',
      'Time context: the current date provided by the system is only used to situate the conversation. It does not mean you automatically know all events up to that date. If a web search has been performed or external data is provided, use it. Otherwise, clearly distinguish general knowledge, user context, and information that must be verified.',
      'Format: always respect the format requested by the user. For long answers, use clear headings, concise paragraphs, useful lists, and tables only when they improve readability.',
      'Markdown formatting: for structured answers, use clean Markdown: a short title; subheadings with ## or ###; bullet lists only when useful; a blank line between each section; never paste a sentence immediately after a heading or a numbered item; for tables, use a valid Markdown table with headers.',
      'Markdown heading rules: never glue a heading to a sentence. A heading marker (#, ##, ###) must always start its own line, with a blank line before it and a blank line after it. Use ## or ### only to create real Markdown headings, never as decorative characters inside a sentence.',
      'Numbered sections rule: when you use numbered steps or sections (1., 2., 3.), put each numbered item on its own line with a blank line before it; never continue a numbered item with the next number on the same line, and never glue a numbered item to the end of a previous sentence. If a numbered section has sub-points, make it a real subheading (### N. Title) followed by a bullet list.',
      'No LaTeX or math notation rule: this is a plain Markdown chat, never produce LaTeX or math-mode syntax such as $...$, $$...$$, \\(...\\), \\rightarrow, \\Rightarrow, \\cdot, or any backslash command. For an arrow, type the plain Unicode character → directly (e.g. "Heraklion → Rethymnon → Chania"), never "$\\rightarrow$" or similar. This applies even when citing a source file that itself contains LaTeX: reformulate it in plain text instead of copying the LaTeX syntax.',
      'No stray separators rule: never insert a standalone "---" line in the middle of a reply to mark a transition; "---" is only acceptable as a genuine Markdown horizontal rule on its own paragraph, surrounded by blank lines, and should be used sparingly. Never write a heading-like phrase (e.g. "Key takeaways") glued inline after a sentence without a line break — it must start on its own line as a real heading or its own paragraph.',
      'Strict Markdown table rules: if you produce a Markdown table, it must always include a header row, a separator row, and body rows with exactly the same number of cells. Example: | Column 1 | Column 2 | then |---|---|. Put EACH table row on its OWN line, starting and ending with a | character; never put two rows on the same line and never put a table cell or row on the same line as a heading or a sentence. Never use bullet lists inside a Markdown table. To separate several items inside one cell, use <br>. Never leave an isolated | character at the end of a line. CRITICAL: each table row must fit ENTIRELY on ONE single physical line — never break a cell over several lines, never insert a real line break, a sub-list, or a colon-introduced enumeration inside a cell; if a cell needs several points, join them on the SAME line with <br> or " ; ". If a row would be too long for one line, shorten the wording rather than wrapping it. Once a table has started, every following row must keep the same | structure until the table ends; never let a row spill out as a plain paragraph with stray | characters. If the content is too long or complex, prefer sections with subheadings instead of a table.',
      'Comparisons and benchmarks: when the user asks for a benchmark, a comparison, a comparatif, or to compare several items across multiple criteria, ALWAYS answer with a real Markdown table (header row, separator row |---|, then one row per item), never with a bullet list standing in for a table.',
      'Link rules: only output a Markdown link [text](url) when the url is a real, verified address that comes from provided web search results or a provided source. Never invent a URL and never use placeholder or example domains (such as example.com or any made-up address). If you do not have a real URL, write the source name as plain text, or use a numbered citation such as [1], instead of a fake link.',
      'Response aeration for long answers: break long answers into short, clearly-titled sections; keep paragraphs to 2-4 lines; keep lists to 4-7 items, splitting into several lists if there are more; use a table only when it genuinely improves readability, never to fill space; end long structured answers with a short closing block titled "Key takeaways" summarizing the essential points in 2-4 bullets.',
      'Exports and deliverables: when the user asks for a document, note, project sheet, audit, benchmark, synthesis, or professional support material, produce a clean, hierarchical, exportable structure. Avoid decorative filler. The content must be easy to convert cleanly to HTML, PDF, or DOCX.',
      'External data: when web excerpts, files, documents, or search results are provided, use them as raw material. Do not mechanically reproduce raw data: analyze, synthesize, cross-check, and reformulate.',
      'Source citations: use numbered citations such as [1], [2], [3] only when a web search context explicitly provides a numbered source index. Never invent citation numbers, never cite non-existent sources, and never output references such as [11] if only three sources are available.',
      'Project document citations: when project document sources are provided with stable identifiers such as [S1], [S2], use exactly those identifiers to cite information drawn from a document, never invent an identifier that was not provided, and never cite an identifier for a document you did not actually use. Persistent project memory is a separate channel: information coming only from project memory must never be cited with [Sx] — refer to it as project memory; if an answer combines project memory and a cited document, state both explicitly (project memory + [Sx]); if project memory and a document source contradict each other, point out the contradiction instead of silently picking one. If no project document source was used for a reply, state this explicitly, for example: "No project document source was used for this reply."',
      'Style: answer in English only when the user asks in English or requests it. Use a professional, pedagogical, constructive, solution-oriented tone.'
    ].join(' ');
  }

  return [
    "Tu es l'assistant Digital Blue Skye.",
    `Date actuelle : ${dateContext.isoDate} (${dateContext.timezone}). Considère ${currentYear} comme l'année en cours.`,
    "Mission : aider l'utilisateur à analyser, comprendre, rechercher, comparer, planifier, rédiger et produire des livrables professionnels dans un contexte de chef de projet digital, produit, web, IA, UX, marketing digital, veille, documentation et pilotage projet.",
    "Principes de réponse : sois précis, factuel, structuré, directement exploitable et transparent sur tes limites. N'invente jamais de faits, chiffres, sources, citations, prix, dates, classements ou références. Lorsque l'information dépend de données récentes ou externes, indique clairement qu'une recherche web ou une source fournie est nécessaire si aucune donnée fiable n'est disponible.",
    "Contexte temporel : la date courante fournie par le système sert uniquement à situer la conversation. Elle ne signifie pas que tu possèdes automatiquement toutes les actualités jusqu'à cette date. Si une recherche web a été effectuée ou si des données externes sont fournies, utilise-les. Sinon, distingue clairement connaissances générales, contexte utilisateur et informations à vérifier.",
    "Format : respecte toujours le format demandé par l'utilisateur. Pour les réponses longues, utilise des titres clairs, des paragraphes courts, des listes utiles et des tableaux uniquement lorsqu'ils améliorent réellement la lisibilité.",
    "Mise en forme Markdown : pour les réponses structurées, utilise un Markdown propre : un titre court ; des sous-titres avec ## ou ### ; des listes à puces uniquement si elles sont utiles ; une ligne vide entre chaque section ; ne colle jamais une phrase immédiatement après un titre ou un élément numéroté ; pour les tableaux, utilise un tableau Markdown valide avec en-têtes.",
    "Règles sur les titres Markdown : ne colle jamais un titre à une phrase. Un marqueur de titre (#, ##, ###) doit toujours commencer sa propre ligne, avec une ligne vide avant et une ligne vide après. N'utilise ## ou ### que pour créer de vrais titres Markdown, jamais comme caractères décoratifs au milieu d'une phrase.",
    "Règle sur les sections numérotées : lorsque tu utilises des étapes ou sections numérotées (1., 2., 3.), place chaque élément numéroté sur sa propre ligne, précédé d'une ligne vide ; ne poursuis jamais un élément numéroté par le numéro suivant sur la même ligne, et ne colle jamais un élément numéroté à la fin de la phrase précédente. Si une section numérotée comporte des sous-points, fais-en un vrai sous-titre (### N. Titre) suivi d'une liste à puces.",
    "Règle anti-LaTeX / notation mathématique : ceci est un chat Markdown simple, ne produis jamais de syntaxe LaTeX ou de mode mathématique comme $...$, $$...$$, \\(...\\), \\rightarrow, \\Rightarrow, \\cdot, ou toute commande commençant par un backslash. Pour une flèche, tape directement le caractère Unicode → en clair (exemple : « Héraklion → Réthymnon → Chania »), jamais « $\\rightarrow$ » ou équivalent. Cela vaut aussi quand tu t'appuies sur une source qui contient elle-même du LaTeX : reformule en texte simple plutôt que de copier la syntaxe LaTeX.",
    "Règle anti-séparateurs parasites : n'insère jamais une ligne « --- » isolée au milieu d'une réponse pour marquer une transition ; « --- » n'est acceptable que comme vrai séparateur horizontal Markdown, sur son propre paragraphe entouré de lignes vides, et de façon rare. Ne colle jamais une expression qui ressemble à un titre (ex. « À retenir ») directement après une phrase sans saut de ligne — elle doit commencer sur sa propre ligne, en vrai titre ou en paragraphe séparé.",
    "Règles strictes pour les tableaux Markdown : si tu produis un tableau Markdown, il doit toujours avoir une ligne d'en-tête, une ligne de séparation, puis des lignes ayant exactement le même nombre de cellules. Exemple : | Colonne 1 | Colonne 2 | puis |---|---|. Place CHAQUE ligne du tableau sur sa PROPRE ligne, en commençant et finissant par un caractère | ; ne mets jamais deux lignes sur la même ligne et ne mets jamais une cellule ou une ligne de tableau sur la même ligne qu'un titre ou une phrase. N'utilise jamais de listes à puces à l'intérieur d'un tableau Markdown. Pour séparer plusieurs éléments dans une cellule, utilise <br>. Ne laisse jamais de caractère | isolé en fin de ligne. CRITIQUE : chaque ligne du tableau doit tenir ENTIÈREMENT sur UNE seule ligne physique — ne découpe jamais une cellule sur plusieurs lignes, n'insère jamais de vrai saut de ligne, de sous-liste ou d'énumération introduite par deux-points à l'intérieur d'une cellule ; si une cellule nécessite plusieurs points, regroupe-les sur la MÊME ligne avec <br> ou « ; ». Si une ligne est trop longue pour tenir sur une ligne, raccourcis la formulation au lieu de la faire déborder. Une fois le tableau commencé, chaque ligne suivante doit conserver la même structure de | jusqu'à la fin du tableau ; ne laisse jamais une ligne ressortir en paragraphe avec des | isolés. Si le contenu est trop long ou complexe, préfère des sections avec sous-titres plutôt qu'un tableau.",
    "Comparatifs et benchmarks : lorsque l'utilisateur demande un benchmark, une comparaison, un comparatif, ou de comparer plusieurs éléments selon plusieurs critères, réponds TOUJOURS par un vrai tableau Markdown (ligne d'en-tête, ligne de séparation |---|, puis une ligne par élément), jamais par une liste à puces qui tiendrait lieu de tableau.",
    "Règles sur les liens : ne produis un lien Markdown [texte](url) que lorsque l'url est une adresse réelle et vérifiée provenant de résultats de recherche web fournis ou d'une source fournie. N'invente jamais d'URL et n'utilise jamais de domaine factice ou d'exemple (comme example.com ou toute adresse inventée). Si tu n'as pas d'URL réelle, écris le nom de la source en texte simple, ou utilise une citation numérotée comme [1], au lieu d'un faux lien.",
    "Aération des réponses longues : découpe les réponses longues en sections courtes et clairement titrées ; limite les paragraphes à 2-4 lignes ; limite les listes à 4-7 éléments, en les scindant en plusieurs listes si besoin ; n'utilise un tableau que lorsqu'il améliore réellement la lisibilité, jamais pour remplir de l'espace ; termine les réponses longues et structurées par un court bloc de clôture intitulé « À retenir » résumant les points essentiels en 2 à 4 puces.",
    "Exports et livrables : lorsque l'utilisateur demande un document, une note, une fiche projet, un audit, un benchmark, une synthèse ou un support professionnel, produis une structure propre, hiérarchisée et exportable. Évite les formulations décoratives inutiles. Les contenus doivent pouvoir être convertis proprement en HTML, PDF ou DOCX.",
    "Données externes : lorsque des extraits web, fichiers, documents ou résultats de recherche sont fournis, utilise-les comme matière première. Ne reproduis pas mécaniquement les données brutes : analyse, synthétise, recoupe et reformule.",
    "Citations de sources : utilise des citations numérotées comme [1], [2], [3] uniquement lorsqu’un contexte de recherche web fournit explicitement un index de sources numéroté. N’invente jamais de numéros de citations, ne cite jamais de sources inexistantes et n’affiche jamais des références comme [11] si seules trois sources sont disponibles.",
    "Citations de documents projet : lorsque des sources documentaires du projet sont fournies avec des identifiants stables comme [S1], [S2], utilise exactement ces identifiants pour citer une information tirée d'un document, sans jamais inventer un identifiant qui n'a pas été fourni, et sans jamais citer un identifiant pour un document que tu n'as pas réellement utilisé. La mémoire persistante du projet est un canal distinct : une information provenant uniquement de la mémoire projet ne doit jamais être citée avec [Sx] — désigne-la comme mémoire projet ; si une réponse combine mémoire projet et document cité, indique les deux explicitement (mémoire projet + [Sx]) ; si la mémoire projet et une source documentaire se contredisent, signale la contradiction au lieu de trancher silencieusement. Si aucune source documentaire projet n'a été utilisée pour la réponse, indique-le explicitement avec exactement la phrase : « Aucune source documentaire projet n'a été utilisée pour cette réponse. »",
    "Langue : si le message utilisateur est rédigé en français, réponds toujours en français, même si certains noms de produits, marques ou termes techniques sont en anglais. Ne réponds en anglais que si l'utilisateur le demande explicitement ou si le paramètre de langue indique clairement l'anglais et que le message utilisateur n'est pas en français.",
    "Style : réponds en français par défaut, sauf demande contraire. Ton ton doit être professionnel, pédagogique, constructif et orienté solution."
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

// Modeles gratuits a essayer en premier, EXCLUT openrouter/auto : ce routeur
// paye a echoue en 402 (credit insuffisant) plutot qu'en 429, donc l'essayer
// "immediatement" en fallback ne fait qu'ajouter un echec garanti. Il n'est
// tente qu'en tout dernier recours, une seule fois, avec le plus petit
// niveau de tokens (cf. boucle d'appel ci-dessous).
function getFreeModelChain(env) {
  return getModelFallbackChain(env).filter((model) => model !== FALLBACK_MODEL);
}

// classifyOpenRouterFailure() / shouldTryFallback() : logique deplacee dans
// cloudflare/modelRouter.js (classifyFailure) pour la boucle de completion.
// hasUsableOpenRouterKey reste ici, utilise par le health-check ci-dessous.
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
      'Use only the source identifiers present in the internal source index below. If there are 3 sources, valid citations are only [1], [2], and [3].',
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
    'Utilise uniquement les identifiants présents dans l’index interne des sources ci-dessous. S’il y a 3 sources, les seules citations valides sont [1], [2] et [3].',
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

function normalizeForKeywordMatching(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAnyKeyword(value, keywords) {
  const normalized = normalizeForKeywordMatching(value);
  return keywords.some((keyword) => normalized.includes(normalizeForKeywordMatching(keyword)));
}

function detectWebSearchIntent(message, body = {}) {
  const requestedExplicitly = body?.searchWeb === true || body?.searchWeb === 'true';
  const haystack = [
    message,
    body?.webSearchQuery,
    body?.messagePreview
  ].filter(Boolean).join(' ');

  const mandatoryKeywords = [
    'actualité',
    'actualite',
    'news',
    "aujourd'hui",
    'aujourdhui',
    'cette semaine',
    'cette année',
    'cette annee',
    'récent',
    'recent',
    'récente',
    'recente',
    'dernier',
    'dernière',
    'derniere',
    'dernières',
    'dernieres',
    'dernières annonces',
    'dernieres annonces',
    'prix actuel',
    'cours',
    'disponibilité',
    'disponibilite',
    'sortie produit',
    'évolution réglementaire',
    'evolution reglementaire',
    'classement',
    'comparatif récent',
    'comparatif recent',
    'évolution du marché',
    'evolution du marche'
  ];
  const explicitKeywords = [
    'recherche web',
    'cherche sur internet',
    'vérifie sur internet',
    'verifie sur internet',
    'consulte le web',
    'fais une recherche',
    'recherche des sources',
    'recherche des informations récentes',
    'recherche des informations recentes',
    'cherche sur le web',
    'consulte internet'
  ];
  const forbiddenKeywords = [
    'définition',
    'definition',
    'concept théorique',
    'concept theorique',
    'gestion de projet',
    'agile',
    'marketing digital',
    'ux/ui',
    'ux',
    'ui',
    'développement web',
    'developpement web',
    'programmation',
    'html',
    'css',
    'javascript',
    'rédaction',
    'redaction',
    'synthèse',
    'synthese',
    'analyse de documents',
    'analyse de fichiers',
    'fichier uploadé',
    'fichier uploade'
  ];
  const deepSearchKeywords = [
    'recherche approfondie',
    'analyse approfondie',
    'deep research',
    'recherche détaillée',
    'recherche detaillee',
    'sources nombreuses',
    'comparatif complet'
  ];

  const noWebSearchKeywords = [
    'sans recherche web',
    'sans faire de recherche web',
    'aucune recherche web',
    'si aucune recherche web',
    "si tu n'as pas de sources web",
    'si tu n as pas de sources web',
    'sans sources web',
    'sans recherche internet',
    'pas de recherche web',
    'ne fais pas de recherche web',
    'ne lance pas de recherche web',
    'sans recherche en ligne',
    'pas de sources web',
    'aucune source web',
    'pas d acces web',
    'pas d’accès web',
    'connaissances générales',
    'connaissances generales'
  ];

  const explicitKeywordMatch = containsAnyKeyword(haystack, explicitKeywords);
  const noWebSearchRequested = containsAnyKeyword(haystack, noWebSearchKeywords);
  const explicit = !noWebSearchRequested && (requestedExplicitly || explicitKeywordMatch);
  const mandatory = containsAnyKeyword(haystack, mandatoryKeywords) && !noWebSearchRequested;

  return {
    explicit,
    mandatory,
    forbidden: containsAnyKeyword(haystack, forbiddenKeywords),
    deep: containsAnyKeyword(haystack, deepSearchKeywords),
    no_web_search_requested: noWebSearchRequested,
    matched_reason: explicit
      ? 'explicit_web_search_request'
      : (mandatory ? 'mandatory_freshness_keyword' : (noWebSearchRequested ? 'no_web_search_requested' : 'no_web_search_intent'))
  };
}

function getTavilyQuota(env) {
  const configured = Number(env?.TAVILY_MONTHLY_QUOTA || env?.TAVILY_CREDIT_QUOTA || 0);
  return Number.isFinite(configured) && configured > 0 ? configured : TAVILY_DEFAULT_QUOTA;
}

function getTavilyUsageRatio(env) {
  const quota = getTavilyQuota(env);
  return quota > 0 ? tavilyRuntimeStats.estimatedCreditsUsed / quota : 0;
}

function isTavilyUltraEconomyActive(env) {
  return getTavilyUsageRatio(env) >= 0.95;
}

async function getPersistentTavilyCreditsUsed(env) {
  if (!env?.DB) return tavilyRuntimeStats.estimatedCreditsUsed;
  try {
    const row = await env.DB.prepare(
      `SELECT SUM(
         COALESCE(
           CAST(json_extract(meta, '$.estimated_credits') AS REAL),
           CAST(json_extract(meta, '$.credits_estimated') AS REAL),
           1
         )
       ) AS credits
       FROM ai_assistant_events
       WHERE event_type IN ('web_search_success', 'web_search_error')
         AND json_valid(meta)
         AND COALESCE(json_extract(meta, '$.provider'), 'tavily') = 'tavily'`
    ).first();
    const persisted = Number(row?.credits || 0);
    return Math.max(persisted, tavilyRuntimeStats.estimatedCreditsUsed);
  } catch (error) {
    console.warn('tavily_persistent_usage_failed', error instanceof Error ? error.message : String(error));
    return tavilyRuntimeStats.estimatedCreditsUsed;
  }
}

function buildTavilyOptions(env, intent) {
  const ultraEconomy = Boolean(intent?.ultraEconomyActive) || isTavilyUltraEconomyActive(env);
  const allowDeep = Boolean(intent?.deep) && !ultraEconomy;
  return {
    search_depth: allowDeep ? 'advanced' : 'basic',
    max_results: ultraEconomy ? 1 : (allowDeep ? 3 : 3),
    include_answer: false,
    include_raw_content: false,
    mode: ultraEconomy ? 'ultra_economy' : 'economy',
    estimated_credits: allowDeep ? 2 : 1
  };
}

async function countSessionWebSearches(env, sessionId) {
  if (!env?.DB || !sessionId) return 0;
  try {
    const result = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM ai_assistant_events
       WHERE session_id = ?
         AND event_type = 'web_search_success'
         AND json_valid(meta)
         AND COALESCE(
           CAST(json_extract(meta, '$.estimated_credits') AS REAL),
           CAST(json_extract(meta, '$.credits_estimated') AS REAL),
           1
         ) > 0`
    ).bind(sessionId).first();
    return Number(result?.count || 0) || 0;
  } catch (error) {
    console.warn('web_search_session_count_failed', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

function normalizeSkipReason(reason) {
  if (reason === 'skipped_local_document_context') return 'file_context';
  if (reason === 'skipped_session_limit') return 'limit_reached';
  if (reason === 'skipped_forbidden_local_or_general_topic') return 'local_question';
  return 'not_needed';
}

async function ensureTavilyDedupeTable(env) {
  if (!env?.DB || tavilyDedupeTableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tavily_search_dedupe (
      cache_key TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      result_json TEXT
    )`
  ).run();
  tavilyDedupeTableReady = true;
}

async function acquireTavilyDedupeLock(env, cacheKey, now) {
  if (!env?.DB) return { acquired: true, existing: null };
  await ensureTavilyDedupeTable(env);
  await env.DB.prepare(
    `DELETE FROM tavily_search_dedupe WHERE created_at < ?`
  ).bind(now - WEB_SEARCH_DEDUPE_WINDOW).run();
  try {
    await env.DB.prepare(
      `INSERT INTO tavily_search_dedupe (cache_key, created_at, completed_at, result_json)
       VALUES (?, ?, NULL, NULL)`
    ).bind(cacheKey, now).run();
    return { acquired: true, existing: null };
  } catch (error) {
    const existing = await env.DB.prepare(
      `SELECT cache_key, created_at, completed_at, result_json
       FROM tavily_search_dedupe
       WHERE cache_key = ?`
    ).bind(cacheKey).first();
    return { acquired: false, existing };
  }
}

async function completeTavilyDedupeLock(env, cacheKey, result) {
  if (!env?.DB) return;
  await ensureTavilyDedupeTable(env);
  const serializable = {
    results: result?.results || [],
    answer: result?.answer || '',
    rawResults: result?.rawResults || [],
    error: result?.error || '',
    transformedQuery: result?.transformedQuery || '',
    diagnostics: result?.diagnostics || {},
    latencyMs: result?.latencyMs || 0,
    endpoint: result?.endpoint || TAVILY_SEARCH_ENDPOINT,
    options: result?.options || {},
    timestamp: Date.now()
  };
  await env.DB.prepare(
    `UPDATE tavily_search_dedupe
     SET completed_at = ?, result_json = ?
     WHERE cache_key = ?`
  ).bind(Date.now(), JSON.stringify(serializable), cacheKey).run();
}

async function waitForTavilyDedupeResult(env, cacheKey) {
  if (!env?.DB) return null;
  await ensureTavilyDedupeTable(env);
  const deadline = Date.now() + WEB_SEARCH_TIMEOUT + 1000;
  while (Date.now() < deadline) {
    const row = await env.DB.prepare(
      `SELECT result_json FROM tavily_search_dedupe
       WHERE cache_key = ?
         AND completed_at IS NOT NULL
         AND result_json IS NOT NULL`
    ).bind(cacheKey).first();
    if (row?.result_json) {
      try {
        return JSON.parse(row.result_json);
      } catch (error) {
        return null;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function decideWebSearch({ message, body, env, sessionId, hasFileContext, attachments }) {
  const intent = detectWebSearchIntent(message, body);
  const persistentCreditsUsed = await getPersistentTavilyCreditsUsed(env);
  const quota = getTavilyQuota(env);
  const ultraEconomy = quota > 0 ? (persistentCreditsUsed / quota) >= 0.95 : isTavilyUltraEconomyActive(env);
  intent.ultraEconomyActive = ultraEconomy;
  intent.estimatedCreditsUsed = persistentCreditsUsed;
  intent.estimatedQuota = quota;
  const hasDocumentContext = Boolean(hasFileContext || (Array.isArray(attachments) && attachments.length > 0));
  if (hasDocumentContext) {
    return { shouldSearch: false, intent, ultraEconomy, reason: 'skipped_local_document_context' };
  }
  if (ultraEconomy && !intent.explicit) {
    return { shouldSearch: false, intent, ultraEconomy, reason: 'skipped_ultra_economy_explicit_only' };
  }
  if (intent.explicit) {
    const sessionSearchCount = await countSessionWebSearches(env, sessionId);
    if (sessionSearchCount >= WEB_SEARCH_MAX_PER_SESSION) {
      return { shouldSearch: false, intent, ultraEconomy, reason: 'skipped_session_limit', sessionSearchCount };
    }
    return { shouldSearch: true, intent, ultraEconomy, reason: 'explicit_web_search_request', sessionSearchCount };
  }
  if (intent.mandatory && !intent.forbidden) {
    const sessionSearchCount = await countSessionWebSearches(env, sessionId);
    if (sessionSearchCount >= WEB_SEARCH_MAX_PER_SESSION) {
      return { shouldSearch: false, intent, ultraEconomy, reason: 'skipped_session_limit', sessionSearchCount };
    }
    return { shouldSearch: true, intent, ultraEconomy, reason: 'mandatory_freshness_keyword', sessionSearchCount };
  }
  if (intent.forbidden) {
    return { shouldSearch: false, intent, ultraEconomy, reason: 'skipped_forbidden_local_or_general_topic' };
  }
  return { shouldSearch: false, intent, ultraEconomy, reason: 'skipped_model_knowledge_sufficient' };
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

async function performWebSearch(query, env, intent = {}) {
  const normalizedApiKey = normalizeTavilyApiKey(env?.TAVILY_API_KEY);
  if (!normalizedApiKey) {
    tavilyRuntimeStats.errors += 1;
    tavilyRuntimeStats.lastErrorAt = new Date().toISOString();
    tavilyRuntimeStats.lastError = 'missing_tavily_key';
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
  const stableQueryKey = transformedQuery.toLowerCase().trim();
  const cacheKey = hashQuery(stableQueryKey);
  const now = Date.now();
  const options = buildTavilyOptions(env, intent);

  const cached = webSearchCache.get(cacheKey);
  if (cached && now - cached.timestamp < WEB_SEARCH_CACHE_TTL) {
    tavilyRuntimeStats.cacheHits += 1;
    console.log('web_search_cached', { originalQuery: query, transformedQuery, cacheAge: now - cached.timestamp });
    return {
      ...cached,
      error: '',
      transformedQuery,
      cacheHit: true,
      cacheMiss: false,
      deduplicated: false,
      deduplicatedAvoided: 0,
      latencyMs: 0,
      endpoint: TAVILY_SEARCH_ENDPOINT,
      options,
      creditsEstimated: 0,
      estimatedCredits: 0
    };
  }
  tavilyRuntimeStats.cacheMisses += 1;

  const inFlight = webSearchInFlight.get(cacheKey);
  if (inFlight && now - inFlight.startedAt < WEB_SEARCH_DEDUPE_WINDOW) {
    inFlight.duplicates += 1;
    tavilyRuntimeStats.deduplicatedRequests += 1;
    tavilyRuntimeStats.savedByDedupe += 1;
    console.log('web_search_deduplicated', { originalQuery: query, transformedQuery, duplicates: inFlight.duplicates });
    const result = await inFlight.promise;
    return {
      ...result,
      transformedQuery,
      cacheHit: false,
      cacheMiss: true,
      deduplicated: true,
      deduplicatedAvoided: inFlight.duplicates,
      creditsEstimated: 0,
      estimatedCredits: 0
    };
  }

  const recent = webSearchRecentRequests.get(cacheKey);
  if (recent && now - recent.timestamp < WEB_SEARCH_DEDUPE_WINDOW && recent.result) {
    tavilyRuntimeStats.deduplicatedRequests += 1;
    tavilyRuntimeStats.savedByDedupe += 1;
    console.log('web_search_deduplicated_recent', { originalQuery: query, transformedQuery, age: now - recent.timestamp });
    return {
      ...recent.result,
      transformedQuery,
      cacheHit: false,
      cacheMiss: true,
      deduplicated: true,
      deduplicatedAvoided: 1,
      creditsEstimated: 0,
      estimatedCredits: 0
    };
  }

  let acquiredD1DedupeLock = false;
  if (env?.DB) {
    const lock = await acquireTavilyDedupeLock(env, cacheKey, now);
    acquiredD1DedupeLock = Boolean(lock.acquired);
    if (!lock.acquired) {
      tavilyRuntimeStats.deduplicatedRequests += 1;
      tavilyRuntimeStats.savedByDedupe += 1;
      console.log('web_search_deduplicated_d1', { originalQuery: query, transformedQuery, cacheKey });
      const dedupedResult = await waitForTavilyDedupeResult(env, cacheKey);
      if (dedupedResult) {
        return {
          ...dedupedResult,
          transformedQuery: dedupedResult.transformedQuery || transformedQuery,
          cacheHit: false,
          cacheMiss: true,
          deduplicated: true,
          deduplicatedAvoided: 1,
          creditsEstimated: 0,
          estimatedCredits: 0
        };
      }
      return {
        results: [],
        answer: '',
        rawResults: [],
        error: 'web_search_deduplicated_wait_timeout',
        transformedQuery,
        diagnostics: buildTavilyDiagnostics(normalizedApiKey, {
          tavily_status_code: 0,
          tavily_response_preview: '',
          tavily_error: 'web_search_deduplicated_wait_timeout'
        }),
        cacheHit: false,
        cacheMiss: true,
        deduplicated: true,
        deduplicatedAvoided: 1,
        latencyMs: WEB_SEARCH_TIMEOUT,
        endpoint: TAVILY_SEARCH_ENDPOINT,
        options,
        creditsEstimated: 0,
        estimatedCredits: 0
      };
    }
  }

  const executeSearch = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT);
    const startedAt = Date.now();

    const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizedApiKey}`
      },
      body: JSON.stringify({
        query: transformedQuery,
        search_depth: options.search_depth,
        max_results: options.max_results,
        include_answer: options.include_answer,
        include_raw_content: options.include_raw_content
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startedAt;
    tavilyRuntimeStats.lastCallAt = new Date().toISOString();
    tavilyRuntimeStats.lastLatencyMs = latencyMs;
    tavilyRuntimeStats.totalLatencyMs += latencyMs;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const responsePreview = errorText.slice(0, 300);
      const diagnostics = buildTavilyDiagnostics(normalizedApiKey, {
        tavily_status_code: response.status,
        tavily_response_preview: responsePreview,
        tavily_error: `tavily_${response.status}`
      });
      console.warn('web_search_error', diagnostics);
      tavilyRuntimeStats.searchesExecuted += 1;
      tavilyRuntimeStats.estimatedCreditsUsed += options.estimated_credits;
      tavilyRuntimeStats.errors += 1;
      tavilyRuntimeStats.lastErrorAt = new Date().toISOString();
      tavilyRuntimeStats.lastError = `tavily_${response.status}`;
      const result = {
        results: [],
        answer: '',
        error: `tavily_${response.status}`,
        transformedQuery,
        diagnostics,
        cacheHit: false,
        cacheMiss: true,
        deduplicated: false,
        deduplicatedAvoided: 0,
        latencyMs,
        endpoint: TAVILY_SEARCH_ENDPOINT,
        options,
        creditsEstimated: options.estimated_credits,
        estimatedCredits: options.estimated_credits
      };
      if (acquiredD1DedupeLock) await completeTavilyDedupeLock(env, cacheKey, result);
      return result;
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
      description: r.content,
      publishedDate: r.published_date || r.publishedDate || ''
    }));

    const result = {
      results: formattedResults,
      answer,
      rawResults: results,
      timestamp: Date.now(),
      error: '',
      transformedQuery,
      diagnostics: buildTavilyDiagnostics(normalizedApiKey, {
        tavily_status_code: response.status,
        tavily_response_preview: '',
        tavily_error: ''
      }),
      cacheHit: false,
      cacheMiss: true,
      deduplicated: false,
      deduplicatedAvoided: 0,
      latencyMs,
      endpoint: TAVILY_SEARCH_ENDPOINT,
      options,
      creditsEstimated: options.estimated_credits,
      estimatedCredits: options.estimated_credits
    };

    webSearchCache.set(cacheKey, result);
    webSearchRecentRequests.set(cacheKey, { timestamp: Date.now(), result });
    if (acquiredD1DedupeLock) await completeTavilyDedupeLock(env, cacheKey, result);
    tavilyRuntimeStats.searchesExecuted += 1;
    tavilyRuntimeStats.estimatedCreditsUsed += options.estimated_credits;
    tavilyRuntimeStats.lastSuccessAt = new Date().toISOString();
    tavilyRuntimeStats.lastError = '';

    console.log('web_search_success', {
      originalQuery: query,
      transformedQuery,
      resultsCount: formattedResults.length,
      options,
      result1: formattedResults[0] ? { title: formattedResults[0].title, link: formattedResults[0].link } : null,
      result2: formattedResults[1] ? { title: formattedResults[1].title, link: formattedResults[1].link } : null
    });

    return result;
  };

  const promise = executeSearch().catch(async (error) => {
    const diagnostics = buildTavilyDiagnostics(normalizedApiKey, {
      tavily_status_code: 0,
      tavily_response_preview: '',
      tavily_error: error?.name === 'AbortError' ? 'web_search_timeout' : 'web_search_failed'
    });
    tavilyRuntimeStats.errors += 1;
    tavilyRuntimeStats.searchesExecuted += 1;
    tavilyRuntimeStats.estimatedCreditsUsed += options.estimated_credits;
    tavilyRuntimeStats.lastErrorAt = new Date().toISOString();
    tavilyRuntimeStats.lastError = diagnostics.tavily_error;
    if (error.name === 'AbortError') {
      console.warn('web_search_timeout', { originalQuery: query, transformedQuery, timeoutMs: WEB_SEARCH_TIMEOUT, ...diagnostics });
      const result = { results: [], answer: '', rawResults: [], error: 'web_search_timeout', transformedQuery, diagnostics, cacheHit: false, cacheMiss: true, deduplicated: false, deduplicatedAvoided: 0, latencyMs: WEB_SEARCH_TIMEOUT, endpoint: TAVILY_SEARCH_ENDPOINT, options, creditsEstimated: options.estimated_credits, estimatedCredits: options.estimated_credits };
      if (acquiredD1DedupeLock) await completeTavilyDedupeLock(env, cacheKey, result);
      return result;
    } else {
      console.warn('web_search_failed', { error: error.message, originalQuery: query, ...diagnostics });
      const result = { results: [], answer: '', rawResults: [], error: 'web_search_failed', transformedQuery, diagnostics, cacheHit: false, cacheMiss: true, deduplicated: false, deduplicatedAvoided: 0, latencyMs: 0, endpoint: TAVILY_SEARCH_ENDPOINT, options, creditsEstimated: options.estimated_credits, estimatedCredits: options.estimated_credits };
      if (acquiredD1DedupeLock) await completeTavilyDedupeLock(env, cacheKey, result);
      return result;
    }
  }).finally(() => {
    webSearchInFlight.delete(cacheKey);
  });

  webSearchInFlight.set(cacheKey, { startedAt: now, duplicates: 0, promise });
  return promise;
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

function buildTavilyRuntimeMetrics(env) {
  const cacheTotal = tavilyRuntimeStats.cacheHits + tavilyRuntimeStats.cacheMisses;
  const cacheHitRate = cacheTotal ? Math.round((tavilyRuntimeStats.cacheHits / cacheTotal) * 1000) / 10 : 0;
  const cacheMissRate = cacheTotal ? Math.round((tavilyRuntimeStats.cacheMisses / cacheTotal) * 1000) / 10 : 0;
  const dedupeBase = tavilyRuntimeStats.searchesExecuted + tavilyRuntimeStats.deduplicatedRequests;
  const dedupeRate = dedupeBase ? Math.round((tavilyRuntimeStats.deduplicatedRequests / dedupeBase) * 1000) / 10 : 0;
  const quota = getTavilyQuota(env);
  const creditsUsed = tavilyRuntimeStats.estimatedCreditsUsed;
  const quotaUsedPercent = quota ? Math.min(100, Math.round((creditsUsed / quota) * 1000) / 10) : 0;
  const averageLatencyMs = tavilyRuntimeStats.searchesExecuted
    ? Math.round(tavilyRuntimeStats.totalLatencyMs / tavilyRuntimeStats.searchesExecuted)
    : null;
  return {
    endpoint: TAVILY_SEARCH_ENDPOINT,
    economy_mode_active: true,
    ultra_economy_mode_active: isTavilyUltraEconomyActive(env),
    searches_executed: tavilyRuntimeStats.searchesExecuted,
    searches_skipped: tavilyRuntimeStats.skipped,
    searches_avoided_cache: tavilyRuntimeStats.cacheHits,
    searches_avoided_deduplication: tavilyRuntimeStats.savedByDedupe,
    cache_hit_count: tavilyRuntimeStats.cacheHits,
    cache_miss_count: tavilyRuntimeStats.cacheMisses,
    cache_hit_rate: cacheHitRate,
    cache_miss_rate: cacheMissRate,
    deduplication_rate: dedupeRate,
    average_latency_ms: averageLatencyMs,
    credits_estimated_consumed: creditsUsed,
    credits_estimated_remaining: Math.max(0, quota - creditsUsed),
    quota_estimated_total: quota,
    quota_source: (env?.TAVILY_MONTHLY_QUOTA || env?.TAVILY_CREDIT_QUOTA) ? 'env_configured' : 'fallback_default',
    quota_estimated_used_percent: quotaUsedPercent,
    daily_average: 0,
    weekly_average: 0,
    last_call_at: tavilyRuntimeStats.lastCallAt,
    last_latency_ms: tavilyRuntimeStats.lastLatencyMs,
    last_success_at: tavilyRuntimeStats.lastSuccessAt,
    last_error_at: tavilyRuntimeStats.lastErrorAt,
    last_error: tavilyRuntimeStats.lastError,
    configured_options: {
      search_depth: 'basic',
      max_results: isTavilyUltraEconomyActive(env) ? 1 : 3,
      include_answer: false,
      include_raw_content: false
    }
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

async function pingOpenRouterHealth(env, { configured, configuredModel, healthModel, timeoutMs }) {
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

  const firstAttempt = await pingOpenRouterHealth(env, { configured, configuredModel, healthModel, timeoutMs });
  if (firstAttempt.ok) return firstAttempt;

  // Un seul ping isolé sur un modèle :free peut échouer ponctuellement (réponse
  // vide, throttling) sans refléter une vraie panne. On retente une fois avec
  // le premier modèle de la chaîne de fallback réellement utilisée par le chat,
  // avant de déclarer le service dégradé.
  const retryModel = getModelFallbackChain(env).find((model) => model !== healthModel) || FALLBACK_MODEL;
  const retryAttempt = await pingOpenRouterHealth(env, {
    configured,
    configuredModel,
    healthModel: retryModel,
    timeoutMs
  });

  if (retryAttempt.ok) {
    return {
      ...retryAttempt,
      detail: `Premier contrôle (${healthModel}) instable, confirmé opérationnel via le modèle de repli ${retryModel}.`
    };
  }

  return {
    ...firstAttempt,
    detail: `${firstAttempt.detail} Retry via ${retryModel} également non concluant : ${retryAttempt.detail}`
  };
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

  return {
    status: 'operational',
    verification: 'partial',
    configured,
    ok: true,
    latency_ms: tavilyRuntimeStats.lastLatencyMs,
    ...baseDiagnostics,
    tavily_status_code: null,
    tavily_response_preview: '',
    tavily_error: tavilyRuntimeStats.lastError || '',
    detail: 'TAVILY_API_KEY configurée. Contrôle sans appel réseau pour préserver les crédits; la disponibilité réelle est suivie par les derniers événements de recherche.'
  };
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
  const tavilyMetrics = buildTavilyRuntimeMetrics(env);

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
    tavily_usage: tavilyMetrics,
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

const PILOTAGE_KEYWORDS = [
  'que dois-je faire', 'priorités', 'priorite', 'plan d\'action', 'roadmap',
  'améliorer', 'ameliorer', 'risques', 'prochaine étape', 'prochaine etape',
  'aujourd\'hui', 'cette semaine', 'avant publication', 'v3', 'maturité', 'maturite',
  'chantier', 'décision', 'decision', 'arbitrage'
];

function detectPilotageIntent(message) {
  const normalized = String(message || '').toLowerCase();
  return PILOTAGE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function dbCount(env, sql, params = []) {
  if (!env?.DB) return null;
  try {
    const row = await env.DB.prepare(sql).bind(...params).first();
    return Number(row?.count ?? 0);
  } catch (error) {
    console.warn('pilotage_db_count_failed', error instanceof Error ? error.message : String(error));
    return null;
  }
}

const MATURITY_STATUS_WEIGHT = {
  operational: 9,
  partial: 6,
  degraded: 3,
  unconfigured: 2,
  development: 5
};

function estimateMaturityScore(services) {
  const known = services.filter((s) => MATURITY_STATUS_WEIGHT[s.status] !== undefined);
  if (!known.length) return null;
  const avg = known.reduce((sum, s) => sum + MATURITY_STATUS_WEIGHT[s.status], 0) / known.length;
  return Math.round(avg * 10) / 10;
}

// Construit un snapshot réel (aucune métrique inventée) à partir des contrôles
// déjà disponibles dans ce worker (OpenRouter/Tavily) et des événements D1
// réellement journalisés, pour alimenter aiProjectManager côté chat.
async function buildPilotageSnapshot(request, env) {
  const baseHealth = await buildAiHealthPayload(request, env, 'internal');
  const services = [...(baseHealth.services || [])];

  const ragQueryCount = await dbCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'rag_query'");
  const ragMatchCount = await dbCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'rag_match'");
  const xlsxCount = await dbCount(env, "SELECT COUNT(*) AS count FROM ai_assistant_events WHERE event_type = 'xlsx_uploaded'");

  services.push({
    name: 'RAG documentaire',
    status: ragQueryCount ? 'partial' : 'development',
    detail: ragQueryCount
      ? `${ragQueryCount} recherche(s) RAG journalisée(s), ${ragMatchCount || 0} avec correspondance.`
      : 'Aucune recherche RAG journalisée pour le moment.',
    last_checked_at: baseHealth.checked_at
  });
  services.push({
    name: 'Mémoire conversationnelle',
    status: 'operational',
    detail: 'Résumé et historique conservés localement côté navigateur, sans synchronisation serveur.',
    last_checked_at: baseHealth.checked_at
  });
  services.push({
    name: 'Agents spécialisés',
    status: 'development',
    detail: 'Non exposé comme orchestration agentique dédiée dans l\'interface actuelle.',
    last_checked_at: baseHealth.checked_at
  });
  services.push({
    name: 'Upload XLSX',
    status: 'partial',
    detail: xlsxCount !== null
      ? `${xlsxCount} fichier(s) XLSX traité(s) ; consolidation multi-feuilles encore fragile.`
      : 'Lecture XLSX côté navigateur présente, consolidation encore en cours.',
    last_checked_at: baseHealth.checked_at
  });

  return {
    checked_at: baseHealth.checked_at,
    system: { version: '1.5.0' },
    maturity: { score: estimateMaturityScore(services) },
    services,
    v3_placeholders: DEFAULT_V3_PLACEHOLDERS
  };
}

function buildPilotagePromptBlock(plan, language) {
  const en = language === 'en';
  const json = JSON.stringify(plan, null, 2);
  return en
    ? `\n\nThe user is asking a project-steering / prioritization question. Use ONLY the following real, pre-computed data to answer — never invent metrics or statuses. If a field is missing, literally write "Data not available in current monitoring." Follow this structure: Synthesis (global status, maturity, top priority), Top 3 recommended actions (each with domain, why, impact, effort, risk, recommended action, acceptance criteria), Quick wins table, Risks table, Roadmap (Today / This week / V3).\n\nDECISION DATA (JSON):\n${json}`
    : `\n\nL'utilisateur pose une question de pilotage projet / priorisation. Utilise UNIQUEMENT les données réelles et déjà calculées ci-dessous pour répondre — n'invente jamais de métrique ou de statut. Si une donnée manque, écris littéralement "Donnée non disponible dans le monitoring actuel." Suis cette structure : Synthèse (état global, maturité, priorité principale), Top 3 actions recommandées (domaine, pourquoi, impact, effort, risque, action recommandée, critères d'acceptation), tableau Quick wins, tableau Risques, Feuille de route (Aujourd'hui / Cette semaine / V3).\n\nDONNÉES DE DÉCISION (JSON) :\n${json}`;
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

    if (mode === 'rag_diagnose') {
      // Bout-en-bout, sans toucher OpenRouter : testable meme si le LLM est
      // en 429/402.
      const result = await diagnoseRagPipeline(env);
      return jsonResponse(result, 200, corsHeaders);
    }

    if (mode === 'openai_diagnose') {
      const result = await diagnoseOpenAi(env, {
        prompt: body?.prompt || 'OpenAI diagnostic test.'
      });

      return jsonResponse(result, 200, corsHeaders);
    }

    if (mode === 'openrouter_key_diagnose') {
      const result = await diagnoseOpenRouterKey(env);
      return jsonResponse(result, 200, corsHeaders);
    }

    if (mode === 'rag_index') {
      const result = await indexDocumentChunks(env, {
        documentId: body?.documentId,
        projectId: body?.projectId,
        documentName: body?.documentName,
        chunks: Array.isArray(body?.chunks) ? body.chunks : []
      });
      return jsonResponse(result, 200, corsHeaders);
    }

    if (mode === 'rag_delete') {
      const result = await deleteDocumentVectors(env, { documentId: body?.documentId });
      return jsonResponse(result, 200, corsHeaders);
    }

    if (mode === 'rag_query') {
      const result = await queryRag(env, {
        query: body?.query,
        projectId: body?.projectId,
        includeGlobalLibrary: Boolean(body?.includeGlobalLibrary),
        maxPassages: body?.maxPassages,
        similarityThreshold: body?.similarityThreshold
      });
      return jsonResponse(result, 200, corsHeaders);
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const language = body?.language === 'en' ? 'en' : 'fr';
    const history = normalizeHistory(body?.history);
    const conversationSummary = normalizeConversationSummary(body?.conversationSummary);
    const projectMemory = typeof body?.projectMemory === 'string'
      ? body.projectMemory.trim().slice(0, 2500)
      : '';
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : (typeof body?.session_id === 'string' ? body.session_id : '');
    const pageUrl = typeof body?.pageUrl === 'string' ? body.pageUrl : (typeof body?.page_url === 'string' ? body.page_url : '');
    const hasFileContext = body?.hasFileContext === true || body?.has_file_context === true || String(body?.fileContextLength || '') !== '';
    const attachments = Array.isArray(body?.attachments) ? body.attachments.slice(0, 10) : [];
    const ragTelemetry = Array.isArray(body?.ragTelemetry) ? body.ragTelemetry.slice(0, 6) : [];
    const debugWeb = isDebugWebEnabled(env, body);
    const webSearchQuery = typeof body?.webSearchQuery === 'string' && body.webSearchQuery.trim()
      ? body.webSearchQuery.trim().slice(0, 500)
      : message.slice(0, 500);

    if (!message) {
      return jsonResponse({ ok: false, error: 'empty_message' }, 400, corsHeaders);
    }

    // ── Capability Planner (Lot 8) ───────────────────────────────────────
    // Nouvelle PREMIERE etape du pipeline, executee immediatement apres
    // reception de la requete, avant tout autre module (web search decision,
    // RAG, Prompt Orchestrator) :
    //
    //   Utilisateur -> Capability Planner -> Prompt Orchestrator ->
    //   Dynamic Model Selection -> Model Router -> LLM
    //
    // Decide QUOI utiliser (capacites necessaires) avant que le Prompt
    // Orchestrator decide COMMENT repondre (texte du prompt systeme).
    // Flag-gate (CAPABILITY_PLANNER_ENABLED, defaut: desactive) + try/catch :
    // toute erreur ou flag desactive => capabilityPlan reste null et TOUT le
    // reste du pipeline se comporte exactement comme avant ce Lot.
    let capabilityPlan = null;
    if (isCapabilityPlannerEnabled(env)) {
      try {
        const hasRagSourcesHint = ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type));
        const capabilities = detectCapabilities({
          userMessage: message,
          language,
          history,
          projectMemory,
          attachments,
          hasRagSources: hasRagSourcesHint
        });
        const plan = planCapabilityPlan(capabilities, { ragAvailable: true, webAvailable: true });
        const executionPlan = buildExecutionPlan(capabilities, plan);
        capabilityPlan = { capabilities, plan, executionPlan };

        const capabilityMeta = {
          complexity: capabilities.complexity,
          needsRag: capabilities.needsRag,
          needsWeb: capabilities.needsWeb,
          needsTable: capabilities.needsTable,
          needsSources: capabilities.needsSources,
          needsMarkdown: capabilities.needsMarkdown,
          needsExport: capabilities.needsExport,
          needsLongAnswer: capabilities.needsLongAnswer,
          confidence: capabilities.confidence,
          preferredModelTier: plan.preferredModelTier,
          preferredMaxTokens: plan.preferredMaxTokens,
          reasoningEffort: plan.reasoningEffort,
          pipeline: executionPlan.pipeline,
          estimatedCost: executionPlan.estimatedCost,
          estimatedLatency: executionPlan.estimatedLatency,
          expectedAnswerLength: executionPlan.expectedAnswerLength
        };
        queueAiEvent(ctx, env, request, { event_type: 'capability_detected', event_value: capabilities.complexity, language, page_url: pageUrl, session_id: sessionId, meta: capabilityMeta });
        queueAiEvent(ctx, env, request, { event_type: 'capability_plan_created', event_value: plan.preferredModelTier, language, page_url: pageUrl, session_id: sessionId, meta: capabilityMeta });
        queueAiEvent(ctx, env, request, { event_type: 'capability_pipeline_built', event_value: executionPlan.pipeline.join(' > '), language, page_url: pageUrl, session_id: sessionId, meta: capabilityMeta });
      } catch (error) {
        console.warn('capability_planner_failed', error instanceof Error ? error.message : String(error));
        capabilityPlan = null;
        queueAiEvent(ctx, env, request, {
          event_type: 'capability_error',
          event_value: 'capability_planner_failed',
          language, page_url: pageUrl, session_id: sessionId,
          meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
        });
      }
    }

    // ── Source Planner / Evidence Planner (Lot 9) ────────────────────────
    // Etape suivante du pipeline, JUSTE APRES le Capability Planner et AVANT
    // decideWebSearch/RAG/Prompt Orchestrator :
    //
    //   ... -> Capability Planner -> Source Planner -> Prompt Orchestrator ->
    //   Dynamic Model Selection -> Model Router -> LLM -> Completion Guard ->
    //   Response Quality Controller -> Renderer AST
    //
    // Decide si une reponse purement interne est suffisante ou si des
    // preuves externes (Tavily, RAG projet, bibliotheque, memoire projet)
    // sont recommandees/obligatoires, afin d'empecher des reponses jolies
    // mais non verifiees (chiffres, prix, limites, dates inventes).
    // Flag-gate (SOURCE_PLANNER_ENABLED, defaut: desactive) + try/catch :
    // toute erreur ou flag desactive => sourcePlan reste null et TOUT le
    // reste du pipeline se comporte exactement comme avant ce Lot.
    let sourcePlan = null;
    if (isSourcePlannerEnabled(env)) {
      try {
        const hasRagSourcesHint = ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type));
        const hasProjectDocumentsHint = Boolean(body?.projectId) || ragTelemetry.length > 0 || attachments.length > 0;
        const hasProjectMemoryHint = Boolean(projectMemory && projectMemory.trim());
        const hasWebIntentHint = Boolean(capabilityPlan?.capabilities?.needsWeb);

        const evidence = detectEvidenceNeed({
          userMessage: message,
          language,
          hasRagSources: hasRagSourcesHint,
          hasProjectDocuments: hasProjectDocumentsHint,
          hasProjectMemory: hasProjectMemoryHint,
          hasWebIntent: hasWebIntentHint,
          capabilitySignals: capabilityPlan?.capabilities || null,
          orchestratorSignals: null,
          attachments
        });
        const plan = planEvidence({
          evidence,
          hasRagSources: hasRagSourcesHint,
          hasProjectDocuments: hasProjectDocumentsHint,
          hasProjectMemory: hasProjectMemoryHint,
          webAvailable: true,
          ragAvailable: true
        });
        const policy = buildSourcePolicy({ evidence, plan, language });
        sourcePlan = { evidence, plan, policy };

        const sourceMeta = {
          evidenceNeed: evidence.evidenceNeed,
          riskLevel: evidence.riskLevel,
          sourceRequirement: evidence.sourceRequirement,
          confidence: evidence.confidence,
          useRag: plan.useRag,
          useWeb: plan.useWeb,
          forceWeb: plan.forceWeb,
          forceRag: plan.forceRag,
          requireCitations: plan.requireCitations,
          forbidUnsupportedNumbers: plan.forbidUnsupportedNumbers,
          fallbackBehavior: plan.fallbackBehavior,
          reasons: evidence.reasons
        };
        queueAiEvent(ctx, env, request, { event_type: 'source_evidence_detected', event_value: evidence.evidenceNeed, language, page_url: pageUrl, session_id: sessionId, meta: sourceMeta });
        queueAiEvent(ctx, env, request, { event_type: 'source_plan_created', event_value: evidence.sourceRequirement, language, page_url: pageUrl, session_id: sessionId, meta: sourceMeta });
        queueAiEvent(ctx, env, request, { event_type: 'source_policy_built', event_value: plan.fallbackBehavior, language, page_url: pageUrl, session_id: sessionId, meta: sourceMeta });
        if (plan.forceWeb) {
          queueAiEvent(ctx, env, request, { event_type: 'source_web_forced', event_value: evidence.sourceRequirement, language, page_url: pageUrl, session_id: sessionId, meta: sourceMeta });
        }
        if (plan.forceRag) {
          queueAiEvent(ctx, env, request, { event_type: 'source_rag_forced', event_value: evidence.sourceRequirement, language, page_url: pageUrl, session_id: sessionId, meta: sourceMeta });
        }
        if (plan.askClarifyingQuestion) {
          queueAiEvent(ctx, env, request, { event_type: 'source_clarification_required', event_value: evidence.sourceRequirement, language, page_url: pageUrl, session_id: sessionId, meta: sourceMeta });
        }
      } catch (error) {
        console.warn('source_planner_failed', error instanceof Error ? error.message : String(error));
        sourcePlan = null;
        queueAiEvent(ctx, env, request, {
          event_type: 'source_planner_error',
          event_value: 'source_planner_failed',
          language, page_url: pageUrl, session_id: sessionId,
          meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
        });
      }
    }

    // ── Execution Planner (Lot 10) ───────────────────────────────────────
    // Couche centrale de coordination, JUSTE APRES le Source Planner et
    // AVANT decideWebSearch/RAG/Prompt Orchestrator :
    //
    //   ... -> Capability Planner -> Source Planner -> Execution Planner ->
    //   Prompt Orchestrator -> Dynamic Model Selection -> Model Router ->
    //   LLM -> Completion Guard -> Response Quality Controller -> Renderer
    //
    // Fusionne et arbitre les signaux du Capability Planner et du Source
    // Planner en UN plan d'execution unique (source de verite). Le Prompt
    // Orchestrator n'a pas encore tourne a ce stade du pipeline : il est
    // toujours passe a null ici (orchestratorPlan n'existe qu'apres ce
    // point) — l'arbitrage repose donc sur Capability Planner + Source
    // Planner, exactement les deux entrees deja disponibles a cet instant.
    // Flag-gate (EXECUTION_PLANNER_ENABLED, defaut: desactive) + try/catch :
    // toute erreur ou flag desactive => executionPlan reste null et TOUT le
    // reste du pipeline se comporte exactement comme avant ce Lot.
    let executionPlan = null;
    if (isExecutionPlannerEnabled(env)) {
      try {
        const intent = buildExecutionIntent({
          userMessage: message,
          language,
          capabilityPlan,
          sourcePlan,
          orchestratorPlan: null,
          runtimeContext: { ragAvailable: true, webAvailable: true },
          projectContext: body?.projectId ? { projectId: body.projectId } : null,
          webDecision: null,
          ragTelemetry,
          providerStatus: null
        });
        const plan = resolveExecutionPlan({ intent, capabilityPlan, sourcePlan, runtimeContext: { ragAvailable: true, webAvailable: true } });
        const policy = buildExecutionPolicy({ intent, plan, language });
        executionPlan = { intent, plan, policy };

        const executionMeta = {
          primaryGoal: intent.primaryGoal,
          answerMode: intent.answerMode,
          evidenceMode: intent.evidenceMode,
          modelMode: intent.modelMode,
          outputMode: intent.outputMode,
          riskLevel: intent.riskLevel,
          complexity: intent.complexity,
          useWeb: plan.useWeb,
          useRag: plan.useRag,
          requireCitations: plan.requireCitations,
          preferredModelTier: plan.preferredModelTier,
          preferredMaxTokens: plan.preferredMaxTokens,
          maxContinuations: plan.maxContinuations,
          rqcStrictness: plan.rqcStrictness,
          fallbackBehavior: plan.fallbackBehavior,
          pipeline: plan.pipeline,
          confidence: plan.confidence,
          reasons: plan.reasons
        };
        queueAiEvent(ctx, env, request, { event_type: 'execution_intent_built', event_value: intent.primaryGoal, language, page_url: pageUrl, session_id: sessionId, meta: executionMeta });
        queueAiEvent(ctx, env, request, { event_type: 'execution_plan_resolved', event_value: plan.preferredModelTier, language, page_url: pageUrl, session_id: sessionId, meta: executionMeta });
        queueAiEvent(ctx, env, request, { event_type: 'execution_policy_built', event_value: plan.fallbackBehavior, language, page_url: pageUrl, session_id: sessionId, meta: executionMeta });
      } catch (error) {
        console.warn('execution_planner_failed', error instanceof Error ? error.message : String(error));
        executionPlan = null;
        queueAiEvent(ctx, env, request, {
          event_type: 'execution_planner_error',
          event_value: 'execution_planner_failed',
          language, page_url: pageUrl, session_id: sessionId,
          meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
        });
      }
    }

    const webSearchDecision = await decideWebSearch({
      message,
      body,
      env,
      sessionId,
      hasFileContext,
      attachments
    });
    // Lot 9 : si le Source Planner a determine que le web est OBLIGATOIRE
    // (sources factuelles/tarifaires/recentes), il rend la recherche web
    // obligatoire meme si l'ancien detecteur l'aurait jugee superflue — sans
    // jamais la retirer si elle etait deja jugee necessaire. Pur OR additif,
    // donc sans effet quand sourcePlan est null (flag desactive/erreur).
    // Lot 10 : l'Execution Planner devient la source de verite finale pour
    // forceWeb quand il est actif (il a deja arbitre les signaux Capability
    // Planner + Source Planner) ; sinon on retombe sur le Source Planner
    // seul (Lot 9), puis sur la decision historique (comportement inchange
    // si les deux flags sont desactives).
    const shouldSearchWeb = webSearchDecision.shouldSearch
      || Boolean(executionPlan ? executionPlan.plan.forceWeb : sourcePlan?.plan?.forceWeb);
    if (!shouldSearchWeb) {
      tavilyRuntimeStats.skipped += 1;
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
    // La cascade de niveaux de tokens (700/500/350 par defaut) est desormais
    // calculee a l'interieur de routeChatCompletion() a partir de ce
    // maxTokens effectif (cf. cloudflare/modelRouter.js).

    let pilotageBlock = '';
    if (detectPilotageIntent(message)) {
      try {
        const pilotageSnapshot = await buildPilotageSnapshot(request, env);
        const pilotagePlan = computeProjectPlan(pilotageSnapshot);
        pilotageBlock = buildPilotagePromptBlock(pilotagePlan, language);
      } catch (error) {
        console.warn('pilotage_snapshot_failed', error instanceof Error ? error.message : String(error));
      }
    }

    // ── Prompt Orchestrator (Lot 5) ─────────────────────────────────────
    // Couche de decision en amont du Model Router : detecte l'intention,
    // planifie les capacites, et compose un prompt systeme MODULAIRE compact
    // a la place du monolithe buildSystemPrompt(). Flag-gate
    // (PROMPT_ORCHESTRATOR_ENABLED) + try/catch : toute erreur => repli sur le
    // prompt monolithique existant, jamais de blocage utilisateur.
    let promptBasePrompt = systemPrompt; // monolithe par defaut (fallback)
    let orchestratorPlan = null;
    let orchestratorIntent = null;
    if (isOrchestratorEnabled(env)) {
      try {
        // Signaux additifs (OR) issus du Capability Planner (Lot 8), du
        // Source Planner (Lot 9) et de l'Execution Planner (Lot 10, source
        // de verite finale quand actif) : ne peuvent qu'AJOUTER un signal
        // rag/web, jamais en retirer un deja detecte par les systemes
        // existants — tous ces plans sont null si leur flag est desactive
        // ou en cas d'erreur, donc comportement identique a avant ces Lots.
        const hasRagSources = ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type))
          || Boolean(capabilityPlan?.capabilities?.needsRag)
          || Boolean(sourcePlan?.plan?.useRag || sourcePlan?.plan?.forceRag)
          || Boolean(executionPlan?.plan?.useRag || executionPlan?.plan?.forceRag);
        const hasWebIntent = Boolean(shouldSearchWeb || webSearchDecision?.intent?.explicit || webSearchDecision?.intent?.mandatory)
          || Boolean(capabilityPlan?.capabilities?.needsWeb)
          || Boolean(sourcePlan?.plan?.useWeb || sourcePlan?.plan?.forceWeb)
          || Boolean(executionPlan?.plan?.useWeb || executionPlan?.plan?.forceWeb);
        const projectContext = projectMemory ? { hasMemory: true } : (body?.projectId ? { projectId: body.projectId } : null);

        const intent = detectUserIntent({ userMessage: message, projectContext, hasRagSources, hasWebIntent, language });
        const plan = planCapabilities(intent, { ragAvailable: true, webAvailable: true });
        const composed = composeSystemPrompt({
          intent,
          plan,
          dateContext,
          webPerformed: shouldSearchWeb,
          hasRagContext: hasRagSources,
          hasWebContext: shouldSearchWeb
        });
        orchestratorIntent = intent;
        if (composed && composed.length > 0) {
          promptBasePrompt = composed;
          orchestratorPlan = plan;
        }

        const orchestratorMeta = {
          primaryIntent: intent.primaryIntent,
          expectedFormat: intent.expectedFormat,
          complexity: intent.complexity,
          needsRag: intent.needsRag,
          needsWeb: intent.needsWeb,
          promptProfile: plan.promptProfile,
          preferredModelTier: plan.preferredModelTier,
          maxTokensHint: plan.maxTokensHint,
          confidence: intent.confidence,
          reasons: intent.reasons
        };
        queueAiEvent(ctx, env, request, { event_type: 'prompt_intent_detected', event_value: intent.primaryIntent, language, page_url: pageUrl, session_id: sessionId, meta: orchestratorMeta });
        queueAiEvent(ctx, env, request, { event_type: 'prompt_capabilities_planned', event_value: plan.promptProfile, language, page_url: pageUrl, session_id: sessionId, meta: orchestratorMeta });
        queueAiEvent(ctx, env, request, { event_type: 'prompt_profile_used', event_value: plan.promptProfile, language, page_url: pageUrl, session_id: sessionId, meta: orchestratorMeta });
      } catch (error) {
        console.warn('prompt_orchestrator_failed', error instanceof Error ? error.message : String(error));
        promptBasePrompt = systemPrompt; // repli explicite
        orchestratorPlan = null;
        orchestratorIntent = null;
        queueAiEvent(ctx, env, request, {
          event_type: 'prompt_orchestrator_error',
          event_value: 'orchestrator_failed',
          language, page_url: pageUrl, session_id: sessionId,
          meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
        });
      }
    }

    // Lot 9/10 : politique de sources injectee comme bloc additionnel du
    // prompt systeme (meme pattern que pilotageBlock). Quand l'Execution
    // Planner est actif, sa politique CONSOLIDEE (Capability + Source)
    // prend le pas sur celle du Source Planner seul — c'est la "politique
    // consolidee" attendue par le Prompt Orchestrator (cf. regle 3). Sans
    // executionPlan (flag desactive/erreur), comportement Lot 9 inchange.
    const sourcePolicyBlock = executionPlan?.policy?.policyText
      ? ` ${executionPlan.policy.policyText}`
      : (sourcePlan?.policy?.policyText ? ` ${sourcePlan.policy.policyText}` : '');
    let finalSystemPrompt = promptBasePrompt + pilotageBlock + sourcePolicyBlock;
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
        web_search_decision_reason: webSearchDecision.reason,
        web_search_intent: webSearchDecision.intent,
        tavily_ultra_economy_active: webSearchDecision.ultraEconomy,
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

    for (const ragEvent of ragTelemetry) {
      const eventType = String(ragEvent?.event_type || '').trim();
      if (!['rag_query', 'rag_match', 'rag_no_match', 'rag_context_used'].includes(eventType)) continue;
      queueAiEvent(ctx, env, request, {
        event_type: eventType,
        event_value: compactText(ragEvent?.event_value || '', 120),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          ...(ragEvent?.meta && typeof ragEvent.meta === 'object' ? ragEvent.meta : {}),
          source: 'browser_project_rag'
        }
      });
    }

    if (webSearchDecision.reason === 'skipped_session_limit') {
      const limitedReply = language === 'en'
        ? 'Web search is temporarily limited to preserve resources.'
        : 'Recherche web temporairement limitée afin de préserver les ressources.';
      queueAiEvent(ctx, env, request, {
        event_type: 'web_search_skipped',
        event_value: 'limit_reached',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          timestamp: new Date().toISOString(),
          provider: 'tavily',
          reason: 'limit_reached',
          raw_reason: webSearchDecision.reason,
          endpoint: TAVILY_SEARCH_ENDPOINT,
          requested: true,
          session_search_count: webSearchDecision.sessionSearchCount ?? null,
          session_limit: WEB_SEARCH_MAX_PER_SESSION,
          estimated_credits: 0,
          credits_estimated: 0,
          cache_used: false,
          deduplicated: false
        }
      });
      queueAiEvent(ctx, env, request, {
        event_type: 'assistant_response',
        event_value: limitedReply,
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          reply_length: limitedReply.length,
          provider: 'local_policy',
          model: 'none',
          fallback: false,
          web_search_performed: false,
          web_search_decision_reason: webSearchDecision.reason
        }
      });
      return jsonResponse({
        ok: true,
        worker_build: WORKER_BUILD,
        reply: limitedReply,
        provider: 'local_policy',
        web_search_requested: true,
        web_search_performed: false,
        web_search_error: 'web_search_session_limit',
        web_search_query: webSearchResolvedQuery,
        web_search_results: []
      }, 200, corsHeaders);
    }

    if (!shouldSearchWeb) {
      queueAiEvent(ctx, env, request, {
        event_type: 'web_search_skipped',
        event_value: normalizeSkipReason(webSearchDecision.reason),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          timestamp: new Date().toISOString(),
          provider: 'tavily',
          reason: normalizeSkipReason(webSearchDecision.reason),
          raw_reason: webSearchDecision.reason,
          endpoint: TAVILY_SEARCH_ENDPOINT,
          requested: Boolean(webSearchDecision.intent?.explicit || webSearchDecision.intent?.mandatory),
          mandatory_intent: Boolean(webSearchDecision.intent?.mandatory),
          explicit_intent: Boolean(webSearchDecision.intent?.explicit),
          forbidden_intent: Boolean(webSearchDecision.intent?.forbidden),
          has_file_context: Boolean(hasFileContext || attachments.length),
          session_search_count: webSearchDecision.sessionSearchCount ?? null,
          session_limit: WEB_SEARCH_MAX_PER_SESSION,
          ultra_economy_mode_active: Boolean(webSearchDecision.ultraEconomy),
          estimated_credits: 0,
          credits_estimated: 0,
          cache_used: false,
          deduplicated: false
        }
      });
    }

    if (shouldSearchWeb) {
      const webSearchStartedAt = Date.now();
      queueAiEvent(ctx, env, request, {
        event_type: 'web_search_requested',
        event_value: compactText(webSearchQuery, 120),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: {
          timestamp: new Date().toISOString(),
          query_length: webSearchQuery.length,
          provider: 'tavily',
          endpoint: TAVILY_SEARCH_ENDPOINT,
          requested: true,
          reason: webSearchDecision.reason,
          mandatory_intent: Boolean(webSearchDecision.intent?.mandatory),
          explicit_intent: Boolean(webSearchDecision.intent?.explicit),
          deep_search_requested: Boolean(webSearchDecision.intent?.deep),
          economy_mode_active: true,
          ultra_economy_mode_active: Boolean(webSearchDecision.ultraEconomy),
          session_search_count: webSearchDecision.sessionSearchCount ?? null,
          session_limit: WEB_SEARCH_MAX_PER_SESSION
        }
      });
      const webSearch = await performWebSearch(webSearchQuery, env, webSearchDecision.intent);
      const webSearchLatencyMs = Date.now() - webSearchStartedAt;
      webSearchResults = webSearch.results || [];
      webSearchRawResults = webSearch.rawResults || [];
      webSearchAnswer = webSearch.answer || '';
      webSearchError = webSearch.error || '';
      webSearchResolvedQuery = webSearch.transformedQuery || webSearchQuery;
      webSearchPerformed = webSearchResults.length > 0;
      const webSearchDiagnostics = webSearch.diagnostics || {};
      if (webSearch.cacheHit) {
        queueAiEvent(ctx, env, request, {
          event_type: 'web_search_cached',
          event_value: 'cache_hit',
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: {
            timestamp: new Date().toISOString(),
            provider: 'tavily',
            endpoint: webSearch.endpoint || TAVILY_SEARCH_ENDPOINT,
            query_preview: compactText(webSearchResolvedQuery, 120),
            cache_hit: true,
            cache_miss: false,
            cache_used: true,
            deduplicated: false,
            duration_ms: webSearchLatencyMs,
            latency_ms: webSearchLatencyMs,
            results_count: webSearchResults.length,
            search_depth: webSearch.options?.search_depth || 'basic',
            tavily_max_results: webSearch.options?.max_results || 3,
            include_answer: Boolean(webSearch.options?.include_answer),
            estimated_credits: 0,
            credits_estimated: 0
          }
        });
      }
      if (webSearch.deduplicated) {
        queueAiEvent(ctx, env, request, {
          event_type: 'web_search_deduplicated',
          event_value: `${webSearch.deduplicatedAvoided || 1} request(s) avoided`,
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: {
            timestamp: new Date().toISOString(),
            provider: 'tavily',
            endpoint: webSearch.endpoint || TAVILY_SEARCH_ENDPOINT,
            query_preview: compactText(webSearchResolvedQuery, 120),
            cache_hit: false,
            cache_miss: Boolean(webSearch.cacheMiss),
            cache_used: false,
            deduplicated: true,
            deduplicated_avoided_count: webSearch.deduplicatedAvoided || 1,
            duration_ms: webSearchLatencyMs,
            latency_ms: webSearchLatencyMs,
            results_count: webSearchResults.length,
            search_depth: webSearch.options?.search_depth || 'basic',
            tavily_max_results: webSearch.options?.max_results || 3,
            include_answer: Boolean(webSearch.options?.include_answer),
            estimated_credits: 0,
            credits_estimated: 0
          }
        });
      }
      if (!webSearch.cacheHit && !webSearch.deduplicated) {
        queueAiEvent(ctx, env, request, {
          event_type: webSearchError ? 'web_search_error' : 'web_search_success',
          event_value: webSearchError ? compactText(webSearchError, 120) : `${webSearchResults.length} result(s)`,
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: webSearchError
            ? {
            timestamp: new Date().toISOString(),
            provider: 'tavily',
            error: compactText(webSearchError, 180),
            status_code: webSearchDiagnostics.tavily_status_code ?? extractStatusCode(webSearchError),
            endpoint: webSearch.endpoint || webSearchDiagnostics.tavily_endpoint || TAVILY_SEARCH_ENDPOINT,
            response_preview: compactText(webSearchDiagnostics.tavily_response_preview, 300),
            key_prefix: webSearchDiagnostics.tavily_key_prefix || '',
            key_length: webSearchDiagnostics.tavily_key_length || 0,
            auth_header_built: Boolean(webSearchDiagnostics.tavily_auth_header_built),
            duration_ms: webSearchLatencyMs,
            latency_ms: webSearchLatencyMs,
            results_count: webSearchResults.length,
            cache_hit: Boolean(webSearch.cacheHit),
            cache_miss: Boolean(webSearch.cacheMiss),
            cache_used: Boolean(webSearch.cacheHit),
            deduplicated: Boolean(webSearch.deduplicated),
            deduplicated_avoided_count: webSearch.deduplicatedAvoided || 0,
            estimated_credits: webSearch.estimatedCredits ?? webSearch.creditsEstimated ?? 0,
            credits_estimated: webSearch.estimatedCredits ?? webSearch.creditsEstimated ?? 0,
            search_depth: webSearch.options?.search_depth || 'basic',
            tavily_max_results: webSearch.options?.max_results || 3,
            max_results: webSearch.options?.max_results || 3,
            include_answer: Boolean(webSearch.options?.include_answer),
            include_raw_content: Boolean(webSearch.options?.include_raw_content)
          }
            : {
            timestamp: new Date().toISOString(),
            provider: 'tavily',
            results_count: webSearchResults.length,
            duration_ms: webSearchLatencyMs,
            latency_ms: webSearchLatencyMs,
            endpoint: webSearch.endpoint || TAVILY_SEARCH_ENDPOINT,
            query_preview: compactText(webSearchResolvedQuery, 120),
            cache_hit: Boolean(webSearch.cacheHit),
            cache_miss: Boolean(webSearch.cacheMiss),
            cache_used: Boolean(webSearch.cacheHit),
            deduplicated: Boolean(webSearch.deduplicated),
            deduplicated_avoided_count: webSearch.deduplicatedAvoided || 0,
            estimated_credits: webSearch.estimatedCredits ?? webSearch.creditsEstimated ?? 0,
            credits_estimated: webSearch.estimatedCredits ?? webSearch.creditsEstimated ?? 0,
            search_depth: webSearch.options?.search_depth || 'basic',
            tavily_max_results: webSearch.options?.max_results || 3,
            max_results: webSearch.options?.max_results || 3,
            include_answer: Boolean(webSearch.options?.include_answer),
            include_raw_content: Boolean(webSearch.options?.include_raw_content),
            economy_mode_active: true,
            ultra_economy_mode_active: webSearch.options?.mode === 'ultra_economy'
          }
        });
      }
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
          promptBasePrompt + pilotageBlock,
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
          promptBasePrompt + pilotageBlock,
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

    // Construction des messages de conversation (hors message systeme, gere
    // par le Model Router) : memoire projet, resume, historique, message
    // utilisateur. Le routeur (cloudflare/modelRouter.js) ne connait que la
    // selection de modeles/retries/tokens — il ignore tout du RAG, de Tavily
    // et du prompt metier, qui restent ici, inchanges.
    const projectMemoryMessage = projectMemory
      ? [{
        role: 'system',
        content: language === 'en'
          ? `Persistent project memory: durable context provided by the user for the active project. Use this information as priority context to understand the project. If document sources are available and contradict this memory, explicitly mention the contradiction instead of silently overriding it.\n${projectMemory}`
          : `Memoire persistante du projet : contexte durable fourni par l'utilisateur pour le projet actif. Utilise ces informations comme contexte prioritaire pour comprendre le projet. Si des sources documentaires sont disponibles et contredisent cette memoire, signale la contradiction au lieu d'ecraser silencieusement l'information.\n${projectMemory}`
      }]
      : [];
    const memoryMessage = conversationSummary
      ? [{
        role: 'system',
        content: language === 'en'
          ? `Conversation memory from previous turns. Use it only for continuity and do not mention it explicitly:\n${conversationSummary}`
          : `Memoire de conversation issue des echanges precedents. Utilise-la uniquement pour assurer la continuite et ne la mentionne pas explicitement :\n${conversationSummary}`
      }]
      : [];

    const conversationMessages = [
      ...projectMemoryMessage,
      ...memoryMessage,
      ...history,
      { role: 'user', content: message }
    ];

    // Pont evenementiel : le routeur ignore D1/queueAiEvent (decouplage
    // multi-provider), il se contente d'appeler onEvent(type, payload). On
    // traduit ici vers les evenements legacy (openrouter_request/response,
    // utilises par le back-office, cf. worker-api.js latestOpenRouterResponseInfo)
    // ET vers les nouveaux evenements demandes (openrouter_model_attempt,
    // openrouter_model_success, etc.), sans rien retirer de l'existant.
    function onRouterEvent(eventType, payload) {
      const baseMeta = {
        model: payload?.model,
        provider: payload?.provider || 'openrouter',
        status_code: payload?.status_code ?? null,
        tokens_requested: payload?.tokens_requested ?? null,
        attempt_index: payload?.attempt_index ?? null,
        latency_ms: payload?.latency_ms ?? null,
        error_type: payload?.error_type ?? null
      };
      queueAiEvent(ctx, env, request, {
        event_type: eventType,
        event_value: compactText(payload?.model || payload?.upstream_error || eventType, 120),
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: { ...baseMeta, ...payload }
      });

      if (eventType === 'openrouter_model_attempt') {
        queueAiEvent(ctx, env, request, {
          event_type: 'openrouter_request',
          event_value: payload?.model,
          language, page_url: pageUrl, session_id: sessionId,
          meta: { model: payload?.model, provider: 'openrouter', max_tokens: payload?.tokens_requested, has_web_context: webSearchPerformed, has_file_context: hasFileContext }
        });
      } else if (eventType === 'openrouter_model_success') {
        queueAiEvent(ctx, env, request, {
          event_type: 'openrouter_response',
          event_value: payload?.resolved_model || payload?.model,
          language, page_url: pageUrl, session_id: sessionId,
          meta: {
            model: payload?.model,
            resolved_model: payload?.resolved_model || payload?.model,
            latency_ms: payload?.latency_ms || 0,
            reply_length: payload?.content_length || 0,
            fallback_model_used: payload?.model !== primaryModel,
            max_tokens: payload?.tokens_requested,
            status_code: payload?.status_code
          }
        });
      } else if (eventType === 'openrouter_model_failed') {
        queueAiEvent(ctx, env, request, {
          event_type: 'openrouter_error',
          event_value: compactText(payload?.upstream_error || payload?.error_type || 'openrouter_request_failed', 120),
          language, page_url: pageUrl, session_id: sessionId,
          meta: { model: payload?.model, status_code: payload?.status_code, upstream_error: compactText(payload?.upstream_error || '', 300), latency_ms: payload?.latency_ms || 0, max_tokens: payload?.tokens_requested }
        });
      }
    }

    // Quand l'orchestrateur a planifie, on aligne tokens/temperature sur son
    // plan (borne au plafond 2200 / plancher DEFAULT_MAX_TOKENS deja garantis
    // par le routeur). Sinon, comportement actuel inchange.
    //
    // Lot 10 : l'Execution Planner devient la source de verite finale pour
    // preferredModelTier/maxTokens/temperature/maxContinuations quand il est
    // actif (il a deja arbitre Capability Planner vs Source Planner selon
    // les regles de priorite documentees dans executionPlanner.js). A
    // defaut (flag desactive ou erreur), on retombe exactement sur la
    // cascade Lot 8/9 existante — comportement identique a avant ce Lot.
    const effectiveMaxTokens = executionPlan
      ? Math.min(Math.max(Number(executionPlan.plan.preferredMaxTokens) || maxTokens, DEFAULT_MAX_TOKENS), 2200)
      : capabilityPlan
        ? Math.min(Math.max(Number(capabilityPlan.plan.preferredMaxTokens) || maxTokens, DEFAULT_MAX_TOKENS), 2200)
        : orchestratorPlan
          ? Math.min(Math.max(Number(orchestratorPlan.maxTokensHint) || maxTokens, DEFAULT_MAX_TOKENS), 2200)
          : maxTokens;
    const effectiveTemperature = executionPlan && Number.isFinite(executionPlan.plan.temperature)
      ? executionPlan.plan.temperature
      : (capabilityPlan && Number.isFinite(capabilityPlan.plan.temperature)
        ? capabilityPlan.plan.temperature
        : (orchestratorPlan && Number.isFinite(orchestratorPlan.temperatureHint)
          ? orchestratorPlan.temperatureHint
          : 0.35));
    let effectiveModelTier = executionPlan?.plan?.preferredModelTier
      || capabilityPlan?.plan?.preferredModelTier
      || orchestratorPlan?.preferredModelTier;

    // Lot 9 (repli si l'Execution Planner est desactive) : un besoin de
    // preuve "mandatory" ou un risque "critical" justifie un modele plus
    // capable qu'un tier "fast" — sauf question courte. Quand l'Execution
    // Planner est actif, cette regle est deja appliquee dans
    // resolveExecutionPlan() ; ce bloc ne s'execute donc que dans le cas de
    // repli (executionPlan null), pour ne rien changer au comportement
    // Lot 9 existant dans ce cas.
    const isShortQuestion = message.trim().split(/\s+/).filter(Boolean).length <= 8;
    if (!executionPlan && sourcePlan && effectiveModelTier === 'fast' && !isShortQuestion) {
      const { evidenceNeed, riskLevel } = sourcePlan.evidence || {};
      if (evidenceNeed === 'mandatory' || riskLevel === 'critical') {
        effectiveModelTier = 'balanced';
      }
    }

    // expectedAnswerLength -> budget de continuations du Completion Guard
    // (DEFAULT_MAX_CONTINUATIONS=2, HARD_MAX_CONTINUATIONS=3, cf.
    // completionGuard.js) : une reponse courte n'a quasiment jamais besoin de
    // continuation, une reponse longue beneficie du plafond complet. Lot 10 :
    // l'Execution Planner fournit directement maxContinuations (deja borne).
    const maxContinuationsHint = executionPlan
      ? executionPlan.plan.maxContinuations
      : (capabilityPlan
        ? ({ short: 1, medium: 2, long: 3 }[capabilityPlan.executionPlan.expectedAnswerLength] ?? undefined)
        : undefined);

    if (executionPlan) {
      queueAiEvent(ctx, env, request, {
        event_type: 'execution_plan_applied',
        event_value: effectiveModelTier,
        language, page_url: pageUrl, session_id: sessionId,
        meta: {
          preferredModelTier: effectiveModelTier,
          preferredMaxTokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
          maxContinuations: maxContinuationsHint,
          shouldSearchWeb
        }
      });
    }

    const routerResult = await routeChatCompletion({
      messages: conversationMessages,
      systemPrompt: finalSystemPrompt,
      maxTokens: effectiveMaxTokens,
      cloudflareAiMaxTokens: effectiveMaxTokens,
      temperature: effectiveTemperature,
      env,
      metadata: { language, allowedOrigin },
      modelTier: effectiveModelTier,
      maxContinuationsHint,
      onEvent: onRouterEvent
    });

    if (!routerResult.ok) {
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
          error_type: routerResult.errorType,
          attempts_count: routerResult.attempts.length
        }
      });
      return jsonResponse(
        {
          ok: false,
          error: 'openrouter_error',
          errorType: routerResult.errorType,
          userMessage: routerResult.userMessage,
          diagnostic: {
            attempts: routerResult.attempts
          }
        },
        502,
        corsHeaders
      );
    }

    const resolvedModel = routerResult.model;
    let reply = routerResult.content;
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
          diagnostic: { router_attempts: routerResult.attempts },
          web_search_requested: shouldSearchWeb,
          web_search_performed: webSearchPerformed,
          web_search_error: webSearchError || '',
          web_search_query: webSearchResolvedQuery,
          web_search_results: webSearchResults.map((r, i) => ({
            index: i + 1,
            title: r.title,
            link: r.link,
            snippet: r.snippet || '',
            publishedDate: r.publishedDate || ''
          }))
        },
        200,
        corsHeaders
      );
    }

    // Lot 7 (+ Lot 7.1 Auto-Improver) — Response Quality Controller (RQC).
    // Intervient UNIQUEMENT entre la reponse finale (deja passee par le
    // Completion Guard, cf. modelRouter.js) et l'envoi au frontend.
    // Flag-gate (RESPONSE_QUALITY_CONTROLLER_ENABLED) + try/catch : toute
    // erreur => `reply` reste inchange, comportement actuel garanti, jamais
    // de blocage utilisateur.
    let rqcAnalysis = null;
    let rqcAction = null;
    let rqcScoreBefore = null;
    if (isRqcEnabled(env)) {
      try {
        const rqcIntentContext = {
          expectedFormat: orchestratorIntent?.expectedFormat,
          requiresTable: orchestratorIntent?.requiresTable,
          requiresSources: orchestratorIntent?.requiresSources,
          needsRag: orchestratorIntent?.needsRag,
          needsWeb: orchestratorIntent?.needsWeb,
          // Lot 8 (Capability Planner) : champs additifs, non consommes par
          // analyzeResponseQuality() aujourd'hui (donc aucun changement de
          // comportement/score), exposes pour permettre a la logique RQC de
          // s'en servir plus finement dans un lot ulterieur sans avoir a
          // retoucher ce point d'integration.
          expectedAnswerLength: capabilityPlan?.executionPlan?.expectedAnswerLength,
          needsTableHint: capabilityPlan?.capabilities?.needsTable,
          needsSourcesHint: capabilityPlan?.capabilities?.needsSources,
          needsMarkdownHint: capabilityPlan?.capabilities?.needsMarkdown,
          // Lot 9 (Source Planner) : memes garanties — champs additifs, non
          // consommes par analyzeResponseQuality() aujourd'hui, donc aucun
          // changement de score/action RQC. Le controle reel "citations
          // exigees mais aucune source utilisee" est fait explicitement
          // ci-dessous (cf. source_evidence_missing), sans toucher au coeur
          // du RQC.
          requireCitationsHint: executionPlan ? executionPlan.plan.requireCitations : sourcePlan?.plan?.requireCitations,
          requireSourcesHint: sourcePlan?.evidence?.evidenceNeed,
          forbidUnsupportedNumbersHint: executionPlan ? executionPlan.plan.forbidUnsupportedNumbers : sourcePlan?.plan?.forbidUnsupportedNumbers,
          sourcePriorityHint: sourcePlan?.policy?.sourcePriority,
          // Lot 10 : hints additifs, non consommes par analyzeResponseQuality()
          // aujourd'hui (donc aucun changement de score/action RQC) — la
          // "rigueur RQC" et l'"export readiness" consolidees sont exposees
          // pour un lot ulterieur, sans avoir a retoucher ce point d'integration.
          rqcStrictnessHint: executionPlan?.plan?.rqcStrictness,
          exportPolicyHint: executionPlan?.plan?.exportPolicy
        };
        const rqcLogMeta = (extra = {}) => ({
          intent: orchestratorIntent?.primaryIntent || '',
          profile: orchestratorPlan?.promptProfile || '',
          ...extra
        });
        const pinnedRetryEnv = routerResult.provider === 'openrouter'
          ? { ...env, OPENROUTER_MODEL: routerResult.model }
          : env;

        const firstPass = evaluateResponse(reply, {
          intent: rqcIntentContext,
          promptProfile: orchestratorPlan?.promptProfile,
          expectedFormat: rqcIntentContext.expectedFormat,
          alreadyRetried: false,
          alreadyImproved: false
        });
        rqcAnalysis = firstPass.analysis;
        rqcAction = firstPass.action;
        rqcScoreBefore = rqcAnalysis.score;

        queueAiEvent(ctx, env, request, {
          event_type: 'response_quality_analyzed',
          event_value: rqcAnalysis.grade,
          language, page_url: pageUrl, session_id: sessionId,
          meta: rqcLogMeta({ score: rqcAnalysis.score, grade: rqcAnalysis.grade, issues: rqcAnalysis.issues, action: rqcAction })
        });

        // Lot 9 : citations exigees par le Source Planner mais aucune source
        // reellement mobilisee pour cette reponse (ni RAG ni web) -> reponse
        // a considerer degradee. On ne modifie pas rqcAction/reply (risque
        // de regression sur le RQC, deja teste/verrouille) : on journalise
        // uniquement, pour visibilite back-office (cf. carte Source Planner).
        if (sourcePlan?.plan?.requireCitations && !hasRagSources && !webSearchPerformed) {
          queueAiEvent(ctx, env, request, {
            event_type: 'source_evidence_missing',
            event_value: sourcePlan.evidence.sourceRequirement,
            language, page_url: pageUrl, session_id: sessionId,
            meta: { evidenceNeed: sourcePlan.evidence.evidenceNeed, riskLevel: sourcePlan.evidence.riskLevel, fallbackBehavior: sourcePlan.plan.fallbackBehavior }
          });
        }

        // RETRY_FULL : reponse vide/irrecuperable -> regeneration complete.
        // Meme modele (pin via OPENROUTER_MODEL pour la chaine OpenRouter),
        // meme temperature, meme contexte conversationnel, instruction
        // systeme additionnelle. Maximum 1 retry — jamais de boucle
        // (alreadyRetried=true bloque tout 2e retry, cf. decideQualityAction()).
        if (rqcAction === QUALITY_ACTIONS.RETRY_FULL) {
          try {
            const retrySystemPrompt = `${finalSystemPrompt}\n\n${buildRetrySystemInstruction(language)}`;
            const retryResult = await routeChatCompletion({
              messages: conversationMessages,
              systemPrompt: retrySystemPrompt,
              maxTokens: effectiveMaxTokens,
              cloudflareAiMaxTokens: effectiveMaxTokens,
              temperature: effectiveTemperature,
              env: pinnedRetryEnv,
              metadata: { language, allowedOrigin },
              modelTier: orchestratorPlan?.preferredModelTier,
              onEvent: onRouterEvent
            });

            if (retryResult.ok && retryResult.content) {
              const secondPass = evaluateResponse(retryResult.content, {
                intent: rqcIntentContext,
                promptProfile: orchestratorPlan?.promptProfile,
                expectedFormat: rqcIntentContext.expectedFormat,
                alreadyRetried: true,
                alreadyImproved: false
              });
              queueAiEvent(ctx, env, request, {
                event_type: 'response_quality_retry',
                event_value: secondPass.analysis.grade,
                language, page_url: pageUrl, session_id: sessionId,
                meta: rqcLogMeta({ score: secondPass.analysis.score, grade: secondPass.analysis.grade, issues: secondPass.analysis.issues, action: secondPass.action, previous_score: rqcAnalysis.score })
              });
              reply = retryResult.content;
              rqcAnalysis = secondPass.analysis;
              rqcAction = secondPass.action;
            } else {
              queueAiEvent(ctx, env, request, {
                event_type: 'response_quality_retry_failed',
                event_value: 'retry_call_failed',
                language, page_url: pageUrl, session_id: sessionId,
                meta: rqcLogMeta({ score: rqcAnalysis.score, grade: rqcAnalysis.grade, issues: rqcAnalysis.issues, action: QUALITY_ACTIONS.AUTO_REPAIR })
              });
              rqcAction = QUALITY_ACTIONS.AUTO_REPAIR; // retry indisponible -> reparation locale plutot que blocage
            }
          } catch (retryError) {
            console.warn('response_quality_retry_failed', retryError instanceof Error ? retryError.message : String(retryError));
            queueAiEvent(ctx, env, request, {
              event_type: 'response_quality_retry_failed',
              event_value: compactText(retryError instanceof Error ? retryError.message : String(retryError), 200),
              language, page_url: pageUrl, session_id: sessionId,
              meta: rqcLogMeta({ score: rqcAnalysis?.score ?? null, grade: rqcAnalysis?.grade || '', action: QUALITY_ACTIONS.AUTO_REPAIR })
            });
            rqcAction = QUALITY_ACTIONS.AUTO_REPAIR;
          }
        }

        // IMPROVE_WITH_MODEL (Lot 7.1 — Auto-Improver) : la reponse contient
        // du contenu utile mais ne respecte pas le format demande. On
        // demande au MEME modele de reecrire la reponse existante (passee en
        // contexte, jamais regeneree de zero) en corrigeant uniquement les
        // problemes identifies. Maximum 1 amelioration — jamais de boucle
        // (alreadyImproved=true bloque toute 2e amelioration, cf.
        // decideQualityAction()). Si l'appel echoue, repli sur repairResponse()
        // puis envoi de la meilleure version disponible (jamais de blocage).
        if (rqcAction === QUALITY_ACTIONS.IMPROVE_WITH_MODEL) {
          queueAiEvent(ctx, env, request, {
            event_type: 'response_quality_improve_requested',
            event_value: rqcAnalysis.grade,
            language, page_url: pageUrl, session_id: sessionId,
            meta: rqcLogMeta({
              score: rqcAnalysis.score,
              grade: rqcAnalysis.grade,
              issues: rqcAnalysis.issues,
              missing_requirements: rqcAnalysis.missingRequirements,
              action: rqcAction
            })
          });
          try {
            const improveInstruction = buildImproveSystemInstruction(language, {
              repairableIssues: rqcAnalysis.repairableIssues,
              missingRequirements: rqcAnalysis.missingRequirements
            });
            const improveMessages = [
              ...conversationMessages,
              { role: 'assistant', content: reply },
              { role: 'user', content: improveInstruction }
            ];
            const improveResult = await routeChatCompletion({
              messages: improveMessages,
              systemPrompt: finalSystemPrompt,
              maxTokens: effectiveMaxTokens,
              cloudflareAiMaxTokens: effectiveMaxTokens,
              temperature: effectiveTemperature,
              env: pinnedRetryEnv,
              metadata: { language, allowedOrigin },
              modelTier: orchestratorPlan?.preferredModelTier,
              onEvent: onRouterEvent
            });

            if (improveResult.ok && improveResult.content) {
              const improvedPass = evaluateResponse(improveResult.content, {
                intent: rqcIntentContext,
                promptProfile: orchestratorPlan?.promptProfile,
                expectedFormat: rqcIntentContext.expectedFormat,
                alreadyRetried: true,
                alreadyImproved: true
              });
              queueAiEvent(ctx, env, request, {
                event_type: 'response_quality_improved',
                event_value: improvedPass.analysis.grade,
                language, page_url: pageUrl, session_id: sessionId,
                meta: rqcLogMeta({
                  score_before: rqcAnalysis.score,
                  score_after: improvedPass.analysis.score,
                  score_gain: improvedPass.analysis.score - rqcAnalysis.score,
                  grade: improvedPass.analysis.grade,
                  issues: improvedPass.analysis.issues,
                  action: improvedPass.action
                })
              });
              reply = improveResult.content;
              rqcAnalysis = improvedPass.analysis;
              rqcAction = improvedPass.action;
            } else {
              queueAiEvent(ctx, env, request, {
                event_type: 'response_quality_improve_failed',
                event_value: 'improve_call_failed',
                language, page_url: pageUrl, session_id: sessionId,
                meta: rqcLogMeta({ score: rqcAnalysis.score, grade: rqcAnalysis.grade, issues: rqcAnalysis.issues, action: QUALITY_ACTIONS.AUTO_REPAIR })
              });
              rqcAction = QUALITY_ACTIONS.AUTO_REPAIR; // amelioration indisponible -> reparation locale, jamais de blocage
            }
          } catch (improveError) {
            console.warn('response_quality_improve_failed', improveError instanceof Error ? improveError.message : String(improveError));
            queueAiEvent(ctx, env, request, {
              event_type: 'response_quality_improve_failed',
              event_value: compactText(improveError instanceof Error ? improveError.message : String(improveError), 200),
              language, page_url: pageUrl, session_id: sessionId,
              meta: rqcLogMeta({ score: rqcAnalysis?.score ?? null, grade: rqcAnalysis?.grade || '', action: QUALITY_ACTIONS.AUTO_REPAIR })
            });
            rqcAction = QUALITY_ACTIONS.AUTO_REPAIR;
          }
        }

        if (rqcAction === QUALITY_ACTIONS.AUTO_REPAIR) {
          const repaired = repairResponse(reply, rqcAnalysis);
          if (repaired && repaired !== reply) {
            reply = repaired;
            queueAiEvent(ctx, env, request, {
              event_type: 'response_quality_repaired',
              event_value: rqcAnalysis?.grade || '',
              language, page_url: pageUrl, session_id: sessionId,
              meta: rqcLogMeta({ score: rqcAnalysis?.score ?? null, grade: rqcAnalysis?.grade || '', issues: rqcAnalysis?.issues || [], action: QUALITY_ACTIONS.AUTO_REPAIR })
            });
          }
        }

        queueAiEvent(ctx, env, request, {
          event_type: 'response_quality_final_sent',
          event_value: rqcAnalysis?.grade || '',
          language, page_url: pageUrl, session_id: sessionId,
          meta: rqcLogMeta({
            score_before: rqcScoreBefore,
            score_after: rqcAnalysis?.score ?? null,
            score: rqcAnalysis?.score ?? null,
            grade: rqcAnalysis?.grade || '',
            issues: rqcAnalysis?.issues || [],
            action: rqcAction || QUALITY_ACTIONS.SEND
          })
        });
      } catch (error) {
        console.warn('response_quality_controller_failed', error instanceof Error ? error.message : String(error));
        queueAiEvent(ctx, env, request, {
          event_type: 'response_quality_retry_failed',
          event_value: 'rqc_failed',
          language, page_url: pageUrl, session_id: sessionId,
          meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
        });
        // reply reste inchange (comportement actuel) — aucune interruption de service.
      }
    }

    const resolvedProvider = routerResult.provider;
    const responseBody = {
      ok: true,
      worker_build: WORKER_BUILD,
      reply,
      provider: resolvedProvider,
      model: resolvedModel,
      resolved_model: resolvedModel,
      fallback_model_used: resolvedModel !== primaryModel
    };

    if (resolvedProvider !== 'openrouter') {
      // Bascule reelle vers le second provider : journalise explicitement
      // pour que le back-office puisse distinguer "OpenRouter a repondu via
      // un fallback de modele" de "OpenRouter a totalement echoue, Cloudflare
      // AI a pris le relais".
      queueAiEvent(ctx, env, request, {
        event_type: 'provider_fallback_used',
        event_value: resolvedProvider,
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: { provider: resolvedProvider, model: resolvedModel, reason: 'openrouter_all_models_failed' }
      });
    }

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
          provider: resolvedProvider
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
        provider: resolvedProvider,
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
        link: r.link,
        snippet: r.snippet || '',
        publishedDate: r.publishedDate || ''
      }));
    }

    return jsonResponse(responseBody, 200, corsHeaders);
  }
};
