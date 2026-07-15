  /**
 * TODO(securite) — Cet endpoint IA est appelable directement sans preuve
 * d'identite. Le champ `user` eventuellement present dans le payload provient
 * du gate UX front (scripts/dbs-auth.js) et est INDICATIF/forgeable : ne pas
 * l'utiliser comme controle d'acces. A durcir cote serveur (Cloudflare Access
 * / JWT signe verifie ici + rate limiting + quotas). Voir
 * docs/CHATBOT_AUTH_SECURITY.md.
 *
 * Cloudflare Worker - Digital Blue Skye AI via OpenRouter Free
 *
 * Required secrets/vars:
 * - OPENROUTER_API_KEY (secret)
 * - OPENROUTER_MODEL (text, optional but recommended)
 *   Example: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
 *
 * Optional vars:
 * - ALLOWED_ORIGIN (text)
 *   Example: https://digitalblueskye.com
 * - TAVILY_API_KEY (secret) - for real-time web search capability
 */

import { computeProjectPlan, DEFAULT_V3_PLACEHOLDERS } from './aiProjectManager.js';
import { indexDocumentChunks, deleteDocumentVectors, queryRag, diagnoseRagPipeline, checkVectorizeHealth, listIndexedDocuments, reindexChunksBatch, reindexSingleDocument } from './ragPipeline.js';
import { routeChatCompletion, routeChatCompletionStream, diagnoseCloudflareAi, diagnoseOpenAi, diagnoseOpenRouterKey } from './modelRouter.js';
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
  isSourcePlannerEnabled,
  isDocumentBoundQuery,
  detectStructuralQuery,
  resolveDocumentTarget
} from './sourcePlanner.js';
import {
  buildExecutionIntent,
  resolveExecutionPlan,
  buildExecutionPolicy,
  isExecutionPlannerEnabled
} from './executionPlanner.js';
import {
  detectToolNeeds,
  planToolUsage,
  buildToolExecutionPolicy,
  isToolPlannerEnabled
} from './toolPlanner.js';
import { evaluateResponse, repairResponse, buildRetrySystemInstruction, buildImproveSystemInstruction, isRqcEnabled, QUALITY_ACTIONS } from './responseQualityController.js';
import { BUILD_INFO } from './build-info.js';
import { isKnowledgeOrchestratorEnabled, isObsidianEnabled, isFlagEnabled, hashString } from './knowledge/contracts.js';
import { createKnowledgeSourceRegistry, collectSourceHealth } from './knowledge/sourceRegistry.js';
import { runKnowledgeOrchestrator } from './knowledge/knowledgeOrchestrator.js';
import { createRagKnowledgeSource } from './knowledge/sources/ragSource.js';
import { createTavilyKnowledgeSource } from './knowledge/sources/tavilySource.js';
import { createProjectMemoryKnowledgeSource } from './knowledge/sources/projectMemorySource.js';
import { createObsidianKnowledgeSource } from './knowledge/sources/obsidianSource.js';
import { planQuery, compareQueryPlannerWithLegacy } from './queryPlanner.js';

// Aligne sur OPENROUTER_MODEL dans wrangler.ai.toml (Claude Haiku 4.5,
// payant) : ce fallback code ne sert que si la variable d'env est absente.
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const FALLBACK_MODEL = 'openrouter/auto';
const WORKER_BUILD = '2026-07-12-streaming-haiku-v1';
const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_MAX_TOKENS = 2000;
// Plafond absolu du budget de sortie envoye aux modeles. L'ancien plafond de
// 2200 tokens (avec premiere tentative a 700 via TOKEN_RETRY_LEVELS) tronquait
// structurellement les reponses longues et forcait le Completion Guard a
// multiplier les continuations. La cascade de retry 402 vit desormais dans
// modelRouter.js (TOKEN_RETRY_RATIOS, proportionnelle au budget effectif).
const MAX_TOKENS_CEILING = 8192;
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

function buildKnowledgeRegistry(env, { enableTavily = true } = {}) {
  const sources = [
    createRagKnowledgeSource(),
    createProjectMemoryKnowledgeSource()
  ];
  if (enableTavily) sources.push(createTavilyKnowledgeSource({ searchFn: performWebSearch }));
  if (isObsidianEnabled(env)) sources.push(createObsidianKnowledgeSource());
  return createKnowledgeSourceRegistry(sources);
}

function buildCorsHeaders(request, env) {
  const fallbackOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.com/';
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
  // Version condensee (2026-07-13) : ecrite pour Claude Haiku 4.5 + renderer
  // marked/DOMPurify. Les ~10 regles defensives de formatage (listes ligne a
  // ligne, titres colles, separateurs parasites, aeration detaillee...) qui
  // babysittaient les petits modeles gratuits et le parser maison ont ete
  // retirees ou reduites a une phrase. Restent les garde-fous PORTEURS :
  // anti-hallucination, liens reels uniquement, contrat de citations
  // [1]/[Sx]/memoire projet (consomme par le front), contrainte GFM des
  // tableaux (une ligne physique par ligne — marked ne repare pas une ligne
  // de tableau cassee), anti-LaTeX (pas de rendu mathematique cote front).
  const currentYear = dateContext.isoDate.slice(0, 4);
  if (language === 'en') {
    return [
      'You are the Digital Blue Skye assistant.',
      `Current date: ${dateContext.isoDate} (${dateContext.timezone}). Treat ${currentYear} as the current year; this date situates the conversation but does not mean you know every event up to it.`,
      'Mission: help the user analyze, research, compare, plan, write and produce professional deliverables in digital project management, product, web, AI, UX, digital marketing and documentation.',
      'Never invent facts, figures, prices, dates, rankings, citations, sources or URLs. When information depends on current or external data and none is provided, say so explicitly instead of guessing. Only output a Markdown link when the URL comes verbatim from provided web results or sources; otherwise name the source in plain text.',
      'When web excerpts, files or documents are provided, use them as raw material: analyze, cross-check and synthesize instead of copying them.',
      'Format: follow the format requested by the user. Long answers: short clearly-titled sections (##/###), paragraphs of 2-4 lines, lists of 4-7 items, and a short closing "Key takeaways" block. Headings and list items each start their own line, with blank lines between sections.',
      'Tables: use a real Markdown table (header row, |---| separator, one item per row, each row on a single physical line; use <br> inside a cell for multiple points — never a bullet list or a real line break inside a cell). Always answer benchmark/comparison requests with such a table. Prefer subheaded sections over a table when content gets too long.',
      'No LaTeX or math syntax ($...$, \\(...\\), \\rightarrow, or any backslash command): this chat renders plain Markdown only — type characters like → directly, and rephrase in plain text any LaTeX found in a source.',
      'Citations: cite numbered web sources as [1], [2] only when a numbered source index is provided, and project documents with their exact given identifiers [S1], [S2]. Never invent citation numbers or identifiers, and never cite an identifier for a document you did not actually use. Project memory is a separate channel: never cite it as [Sx], refer to it as project memory (state both — project memory + [Sx] — when an answer combines them), and point out contradictions between memory and documents instead of silently picking one. If no project document source was used for the reply, say so explicitly.',
      'Deliverables (documents, notes, audits, benchmarks, syntheses): produce a clean hierarchical structure that converts well to HTML, PDF or DOCX, without decorative filler.',
      'Style: professional, pedagogical, constructive and solution-oriented. Answer in English only when the user writes in English or asks for it.'
    ].join(' ');
  }

  return [
    "Tu es l'assistant Digital Blue Skye.",
    `Date actuelle : ${dateContext.isoDate} (${dateContext.timezone}). Considère ${currentYear} comme l'année en cours ; cette date situe la conversation mais ne signifie pas que tu connais tous les événements jusqu'à elle.`,
    "Mission : aider l'utilisateur à analyser, rechercher, comparer, planifier, rédiger et produire des livrables professionnels (gestion de projet digital, produit, web, IA, UX, marketing digital, documentation).",
    "N'invente jamais de faits, chiffres, prix, dates, classements, citations, sources ou URL. Quand une information dépend de données récentes ou externes non fournies, dis-le explicitement au lieu de deviner. Ne produis un lien Markdown que si l'URL provient telle quelle des résultats web ou des sources fournis ; sinon, nomme la source en texte simple.",
    "Quand des extraits web, fichiers ou documents sont fournis, utilise-les comme matière première : analyse, recoupe et synthétise au lieu de les recopier.",
    "Format : respecte le format demandé par l'utilisateur. Réponses longues : sections courtes et titrées (##/###), paragraphes de 2-4 lignes, listes de 4-7 éléments, et un court bloc final « À retenir ». Titres et éléments de liste commencent chacun leur propre ligne, avec des lignes vides entre les sections.",
    "Tableaux : utilise un vrai tableau Markdown (ligne d'en-tête, séparateur |---|, un élément par ligne, chaque ligne du tableau sur UNE seule ligne physique ; <br> dans une cellule pour plusieurs points — jamais de liste à puces ni de vrai saut de ligne dans une cellule). Réponds toujours aux demandes de comparatif/benchmark par un tel tableau. Préfère des sections titrées à un tableau quand le contenu devient trop long.",
    "Pas de LaTeX ni de syntaxe mathématique ($...$, \\(...\\), \\rightarrow, ni aucune commande à backslash) : ce chat rend uniquement du Markdown simple — tape directement les caractères comme →, et reformule en texte simple tout LaTeX présent dans une source.",
    "Citations : cite les sources web numérotées [1], [2] uniquement quand un index numéroté est fourni, et les documents projet avec leurs identifiants exacts [S1], [S2]. N'invente jamais de numéro ni d'identifiant, et ne cite jamais un identifiant pour un document que tu n'as pas réellement utilisé. La mémoire projet est un canal distinct : ne la cite jamais en [Sx], désigne-la comme mémoire projet (indique les deux — mémoire projet + [Sx] — quand une réponse les combine), et signale les contradictions entre mémoire et documents au lieu de trancher silencieusement. Si aucune source documentaire projet n'a été utilisée pour la réponse, indique-le explicitement.",
    "Livrables (documents, notes, audits, benchmarks, synthèses) : produis une structure hiérarchique propre, convertible en HTML, PDF ou DOCX, sans remplissage décoratif.",
    "Style : professionnel, pédagogique, constructif et orienté solution. Réponds en français dès que le message est en français — même si des noms de produits, marques ou termes techniques sont en anglais ; en anglais seulement si l'utilisateur écrit en anglais ou le demande explicitement."
  ].join(' ');
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  // 20 messages x 4000 caracteres : la troncature historique (16 x 1200)
  // amputait le contenu des reponses longues precedentes et degradait les
  // questions de suivi ("developpe le point 2"). ~20k tokens au pire cas,
  // tres en-deca des fenetres de contexte des modeles de la chaine (>=128k).
  return history
    .filter((entry) => entry && typeof entry.content === 'string')
    .slice(-20)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content.trim().slice(0, 4000)
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

// 1200 caracteres par extrait (au lieu de 300) : avec 300, le modele ne
// voyait que ~900 caracteres de contenu web au total et devait extrapoler le
// reste — cause directe de reponses superficielles sur les questions web.
function extractSnippet(result, maxChars = 1200) {
  const text = String(result?.snippet || result?.description || '');
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim() + '...';
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

/**
 * Relais SSE : transforme le flux SSE brut d'OpenRouter (deltas au format
 * OpenAI : choices[0].delta.content, fin sur `data: [DONE]`) en un protocole
 * SSE simple pour le frontend :
 *   data: {"type":"meta", ...}        — 1er evenement, contexte complet
 *                                       (modele, sources web, build...)
 *   data: {"type":"delta","text":..}  — morceaux de texte au fil de l'eau
 *   data: {"type":"error", ...}       — erreur upstream signalee en cours de flux
 *   data: {"type":"done", ...}        — dernier evenement (longueur, finish_reason, usage)
 * `onComplete({ fullText, finishReason, usage })` est appele a la fermeture du
 * flux (telemetrie D1 via queueAiEvent cote appelant). Exportee pour les tests.
 */
// Citations documentaires du Knowledge Orchestrator, mises en forme pour le
// client. Le contexte injecte etiquette chaque passage [K1], [K2]... (voir
// knowledge/contextBuilder.js) et le modele les reprend dans sa reponse : sans
// ce mapping, l'interface affiche des marqueurs opaques. Partage par les DEUX
// chemins de reponse (JSON classique ET meta du flux SSE) — ne l'exposer que
// sur l'un des deux laissait le chat, qui streame, sans citations.
export function buildKnowledgeCitationsPayload(knowledgeResult) {
  const citations = Array.isArray(knowledgeResult?.citations) ? knowledgeResult.citations : [];
  return citations.map((citation) => ({
    id: citation.id,
    title: citation.title || '',
    source: citation.source || '',
    document_id: citation.documentId || '',
    url: citation.url || ''
  }));
}

export function createOpenRouterSseRelay({ upstreamBody, metaPayload, onComplete }) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason = null;
  let usage = null;

  const emitEvent = (controller, payload) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  const transform = new TransformStream({
    start(controller) {
      emitEvent(controller, { type: 'meta', ...(metaPayload || {}) });
    },
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '').trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line || line.startsWith(':')) continue; // keep-alive OpenRouter
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) { continue; }
        if (parsed?.error) {
          emitEvent(controller, {
            type: 'error',
            message: String(parsed.error?.message || 'stream_error').slice(0, 300)
          });
          continue;
        }
        if (parsed?.usage) usage = parsed.usage;
        const choice = parsed?.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const delta = typeof choice?.delta?.content === 'string'
          ? choice.delta.content
          : (typeof choice?.text === 'string' ? choice.text : '');
        if (delta) {
          fullText += delta;
          emitEvent(controller, { type: 'delta', text: delta });
        }
      }
    },
    flush(controller) {
      emitEvent(controller, {
        type: 'done',
        reply_length: fullText.length,
        finish_reason: finishReason,
        usage
      });
      if (typeof onComplete === 'function') {
        try { onComplete({ fullText, finishReason, usage }); } catch (_) { /* best effort */ }
      }
    }
  });

  return { readable: upstreamBody.pipeThrough(transform) };
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
  // Matching a LIMITES DE MOTS, plus jamais en sous-chaine libre (bug reel
  // observe en production, 2026-07-13) : les forbiddenKeywords 'ux' et 'ui'
  // matchaient en sous-chaine une enorme partie des phrases francaises
  // ("peux", "deux", "mieux", "oui", "lui", "je suis", "aujourd hui"...),
  // donc forbidden=true quasi systematiquement — ce qui bloquait le
  // declenchement web par mandatoryKeywords et le chemin par defaut, meme
  // sur des demandes legitimes. Idem 'cours' (mandatory) qui matchait
  // "concours"/"discours". La normalisation amont garantit de l'ASCII
  // minuscule sans accents, donc [a-z0-9] suffit comme definition de
  // caractere de mot ; un 's' final optionnel tolere les pluriels
  // ("classements", "actualites"...).
  const normalized = normalizeForKeywordMatching(value);
  return keywords.some((keyword) => {
    const needle = normalizeForKeywordMatching(keyword);
    if (!needle) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z0-9])${escaped}s?(?![a-z0-9])`).test(normalized);
  });
}

export function detectWebSearchIntent(message, body = {}) {
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
    // "dernier/dernière" seuls RETIRES (2026-07-13) : bug reel observe en
    // production — "une derniere liste", "une derniere question", "en
    // dernier lieu" declenchaient a tort une recherche web (Tavily recevait
    // ensuite la phrase francaise brute et renvoyait des definitions du mot
    // anglais "list"). "dernier/derniere" signifie "last/final" dans
    // l'immense majorite des phrases francaises, pas "recent". Ne garder que
    // des locutions non ambigues, ou le sens temporel est le seul possible.
    'dernières annonces',
    'dernieres annonces',
    'dernières nouvelles',
    'dernieres nouvelles',
    'dernières tendances',
    'dernieres tendances',
    'dernière version disponible',
    'derniere version disponible',
    'dernière mise à jour',
    'derniere mise a jour',
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
    'recherche internet',
    'recherche sur internet',
    'recherche en ligne',
    'cherche sur internet',
    'vérifie sur internet',
    'verifie sur internet',
    'consulte le web',
    // "fais une recherche" (imperatif) couvrait deja l'ordre direct, mais pas
    // le tour de phrase interrogatif tres courant "peux-tu faire une
    // recherche..." (bug reel observe en production, 2026-07-13) — ajoute la
    // forme infinitive et quelques variantes frequentes.
    'fais une recherche',
    'faire une recherche',
    'fait une recherche',
    'peux-tu chercher',
    'peux tu chercher',
    'peux-tu faire une recherche',
    'peux tu faire une recherche',
    'cherche des informations',
    'trouve des informations',
    'recherche des sources',
    'recherche des informations récentes',
    'recherche des informations recentes',
    'cherche sur le web',
    'consulte internet',
    'recherche internet et plus poussée',
    'recherche plus poussée',
    'recherche plus poussee',
    'va sur internet',
    'va chercher sur internet',
    // Demande de reponse SOURCEE depuis le web ("avec des sources internet
    // sur lesquelles s'appuyer", "appuie-toi sur des sources web"...) :
    // c'est une demande explicite de recherche web meme sans le verbe
    // "chercher" (bug reel observe en production, 2026-07-13, sur une
    // demande de mini-benchmark sourcé).
    'sources internet',
    'sources web',
    'sources en ligne',
    'sources fiables sur internet',
    'appuie-toi sur internet',
    'appuie toi sur internet'
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
  const deepMatch = containsAnyKeyword(haystack, deepSearchKeywords);
  // "recherche approfondie/détaillée" est deja une demande de recherche, pas
  // seulement un reglage d'intensite a appliquer APRES coup — sans ce OR, un
  // message ne contenant que deepSearchKeywords (aucune des explicitKeywords)
  // ne declenchait jamais aucune recherche du tout (buildTavilyOptions
  // n'ajuste `deep` que si shouldSearch est deja vrai par ailleurs).
  const explicit = !noWebSearchRequested && (requestedExplicitly || explicitKeywordMatch || deepMatch);
  const mandatory = containsAnyKeyword(haystack, mandatoryKeywords) && !noWebSearchRequested;

  return {
    explicit,
    mandatory,
    forbidden: containsAnyKeyword(haystack, forbiddenKeywords),
    deep: deepMatch,
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
    // 5 resultats (au lieu de 3) : le nombre de resultats ne change pas le
    // cout Tavily (credits factures par recherche, pas par resultat), mais
    // double presque la matiere premiere donnee au modele.
    max_results: ultraEconomy ? 1 : 5,
    // include_answer est inclus dans le credit de base de la recherche : la
    // synthese Tavily donne au modele une vue d'ensemble recoupee que les
    // extraits seuls ne fournissent pas (elle transite deja par
    // buildWebContextPrompt via webSearchAnswer, plomberie existante).
    include_answer: true,
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

export async function decideWebSearch({ message, body, env, sessionId, hasFileContext, attachments }) {
  // Garde-fou prioritaire, independant du flag SOURCE_PLANNER_ENABLED : une
  // requete explicitement liee a un document ("ce document", "ce PDF", "du
  // document"...) ne doit jamais declencher Tavily/web, meme si le message
  // contient par ailleurs un mot-cle de fraicheur ("derniers", "recent"...)
  // qui activerait normalement mandatoryKeywords ci-dessous. Verifie avant
  // tout calcul de quota/credits pour court-circuiter au plus tot.
  if (isDocumentBoundQuery(message)) {
    const intent = detectWebSearchIntent(message, body);
    return { shouldSearch: false, intent, ultraEconomy: false, reason: 'skipped_document_bound_query' };
  }
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

// Pipeline documentaire (onglet admin Documents, cf. cloudflare/worker-api.js
// buildDocument*) : seuls ces event_type peuvent etre journalises via
// `mode: 'event'`, ailleurs ce mode est rejete (pas de logger D1 generique
// exposable publiquement).
const DOCUMENT_TRACKED_EVENT_TYPES = [
  'document_uploaded',
  'document_parse_started',
  'document_parsed',
  'document_chunked',
  'document_indexed',
  'document_index_failed',
  'document_used',
  'document_exported',
  'document_deleted'
];

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

const KNOWLEDGE_INDEX_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
const KNOWLEDGE_QUERY_MAX_LENGTH = 2000;

// Auth des routes /knowledge/index, /knowledge/refresh et /knowledge/document/:id :
// un Bearer token valide (KNOWLEDGE_ADMIN_TOKEN dedie ou ADMIN_TOKEN partage) est requis.
// 401 = aucun header Authorization fourni ; 403 = token present mais invalide.
export function getKnowledgeAuthStatus(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match ? match[1].trim() : '';
  if (!token) return 401;
  const knowledgeToken = String(env.KNOWLEDGE_ADMIN_TOKEN || '').trim();
  const adminToken = String(env.ADMIN_TOKEN || '').trim();
  const authorized =
    (knowledgeToken.length > 0 && token === knowledgeToken) ||
    (adminToken.length > 0 && token === adminToken);
  return authorized ? 0 : 403;
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

// BUILD_INFO est genere par scripts/generate-build-info.mjs a partir de Git
// local (jamais de secret) ; les variables d'environnement restent
// prioritaires si definies. Memes regles de fallback que system.* dans
// buildAdminHealthPayload() (worker-api.js), pour que les deux Workers
// exposent un versioning coherent meme si BUILD_INFO est absent/partiel.
function buildAiWorkerVersioning(env, checkedAt) {
  const appVersion = env.APP_VERSION || '1.5.0';
  const buildNumber = env.BUILD_NUMBER || checkedAt.slice(0, 10);
  const commitSha = env.COMMIT_SHA || BUILD_INFO?.commit || 'unknown';
  const commitFull = env.COMMIT_SHA_FULL || BUILD_INFO?.commitFull || commitSha;
  const gitBranch = env.BUILD_BRANCH || BUILD_INFO?.branch || 'unknown';
  const deployedAt = env.LAST_DEPLOYED_AT || BUILD_INFO?.buildDate || checkedAt;
  const buildDateLabel = BUILD_INFO?.buildDateLabel || 'unknown';
  const buildTimeLabel = BUILD_INFO?.buildTimeLabel || 'non disponible';
  const githubCommitUrl = env.GITHUB_COMMIT_URL || BUILD_INFO?.githubCommitUrl || null;
  const githubBranchUrl = env.GITHUB_BRANCH_URL || BUILD_INFO?.githubBranchUrl || null;

  return {
    version: appVersion,
    build: buildNumber,
    commit: commitSha,
    commitFull,
    branch: gitBranch,
    buildDateLabel,
    buildTimeLabel,
    githubCommitUrl,
    githubBranchUrl,
    last_deployed_at: deployedAt,
    worker: 'digitalblueskye-ai'
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
      headers: buildOpenRouterHeaders(env, env.ALLOWED_ORIGIN || 'https://digitalblueskye.com/'),
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
  const [openRouterCheck, tavilyCheck, vectorizeCheck] = await Promise.all([
    checkOpenRouterHealth(env),
    checkTavilyHealth(env),
    checkVectorizeHealth(env)
  ]);
  const tavilyMetrics = buildTavilyRuntimeMetrics(env);
  const knowledgeRegistry = buildKnowledgeRegistry(env, { enableTavily: false });
  const knowledgeHealth = await collectSourceHealth(env, knowledgeRegistry);
  const knowledgeEnabled = isKnowledgeOrchestratorEnabled(env);

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
    versioning: buildAiWorkerVersioning(env, checkedAt),
    health_diagnostics: buildHealthDiagnostics(request, env, authMode),
    knowledge_orchestrator: {
      enabled: knowledgeEnabled,
      obsidian_enabled: isObsidianEnabled(env),
      sources: knowledgeHealth.sources,
      documents_count: knowledgeHealth.sources.reduce((sum, source) => sum + (Number(source.documents_count) || 0), 0),
      chunks_count: knowledgeHealth.sources.reduce((sum, source) => sum + (Number(source.chunks_count) || 0), 0),
      last_sync_at: knowledgeHealth.sources.map((source) => source.last_sync_at).filter(Boolean).sort().pop() || null,
      health_score: knowledgeEnabled ? knowledgeHealth.health_score : null,
      errors: knowledgeHealth.sources.filter((source) => source.error || source.status === 'error'),
      // Best-effort : instantane de la derniere requete traitee par CET isolate
      // Workers (non garanti entre deux requetes, jamais expose hors DEBUG=true).
      debug_last_query: isKnowledgeDebugEnabled(env) ? lastKnowledgeDebugSnapshot : undefined
    },
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
      tavily: tavilyCheck,
      vectorize: vectorizeCheck
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
        name: 'Knowledge Orchestrator',
        status: knowledgeEnabled ? (knowledgeHealth.health_score >= 50 ? 'operational' : 'partial') : 'disabled',
        verification: knowledgeEnabled ? 'partial' : 'partial',
        latency_ms: null,
        detail: knowledgeEnabled ? `${knowledgeHealth.healthy}/${knowledgeHealth.total} source(s) disponibles.` : 'Feature flag KNOWLEDGE_ORCHESTRATOR_ENABLED désactivé.',
        last_checked_at: checkedAt,
        priority: knowledgeEnabled ? 'Surveiller les connecteurs et la latence de recherche.' : 'Activer le flag pour utiliser la couche documentaire transverse.'
      },
      {
        name: 'Recherche web',
        status: tavilyCheck.ok ? 'operational' : 'partial',
        verification: tavilyCheck.verification,
        latency_ms: tavilyCheck.latency_ms,
        detail: tavilyCheck.ok ? 'Recherche temps réel vérifiée via Tavily.' : 'Recherche web demandable, mais contrôle Tavily incomplet.',
        last_checked_at: checkedAt,
        priority: tavilyConfigured ? 'Ajouter un contrôle externe de disponibilité.' : 'Brancher Tavily pour les recherches temps réel.'
      },
      {
        name: 'Vectorize (RAG)',
        status: vectorizeCheck.status,
        verification: vectorizeCheck.verification,
        latency_ms: vectorizeCheck.latency_ms,
        detail: vectorizeCheck.detail,
        last_checked_at: checkedAt,
        priority: vectorizeCheck.configured ? 'Surveiller la latence des requêtes Vectorize.' : 'Activer le binding VECTOR_INDEX (cf. wrangler.ai.toml).'
      }
    ]
  };
}

// Note : "aujourd'hui", "cette semaine" et "v3" ont ete retires de cette liste
// le 2026-07-06 — trop generiques, ils declenchaient le mode pilotage sur de
// simples questions de synthese de projet client (ex. "fiche synthetique de
// ce projet ... jusqu'a aujourd'hui"), faisant repondre le modele avec la
// sante interne de la plateforme (OpenRouter/Tavily/RAG) au lieu du contenu
// reel du projet actif. Voir aussi le garde-fou sur body?.projectId ci-dessous.
const PILOTAGE_KEYWORDS = [
  'que dois-je faire', 'priorités', 'priorite', 'plan d\'action', 'roadmap',
  'améliorer', 'ameliorer', 'risques', 'prochaine étape', 'prochaine etape',
  'avant publication', 'maturité', 'maturite',
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

// ── Inventaire de la base de connaissances (questions méta) ────────────────
//
// Bug corrigé (2026-07-13) : à la question « quelles sources as-tu / as-tu
// enregistré les documents ? », le modèle répondait avec son réflexe LLM
// générique (« je ne mémorise rien, chaque conversation repart de zéro »)
// alors que la plateforme indexe bien les documents de façon PERSISTANTE
// (Vectorize + D1 rag_chunks, 70 documents au moment du correctif). Une
// question méta sur la base ne déclenche ni RAG ni aucun contexte : le
// modèle n'avait aucun moyen de connaître son propre inventaire. On détecte
// donc ces questions et on injecte l'inventaire RÉEL (listIndexedDocuments)
// dans le prompt système, avec une consigne de véracité explicite.

// Patterns resserrés après revue adverse (faux positifs mesurés sur des
// messages ordinaires de chef de projet) : jamais de « base »/« mémoire »
// nus (base de données, base clients...), verbes bornés par \b (« enregistrer
// un podcast » ne matche plus), objet documentaire exigé après le verbe, et
// « bibliothèque » restreint aux formes documentaires (« bibliothèque de
// composants React » exclue).
const KNOWLEDGE_INVENTORY_PATTERNS = [
  // « quelles sources/documents as-tu / possèdes-tu / reconnais-tu... »
  /\b(quelles?|quels?|liste(?:[- ]moi)?|montre(?:[- ]moi)?|combien\s+de)\b[^.?!]{0,80}\b(documents?|sources?|fichiers?)\b[^.?!]{0,80}\b(as[- ]tu|avez[- ]vous|poss[e]des?|reconnais(?:[- ]tu)?|disposes?[- ]tu|tu\s+disposes?|indexe[es]?\b|enregistre[es]?\b|dans\s+ta\s+base|en\s+memoire)/i,
  // « as-tu enregistré / mémorisé / indexé ... <objet documentaire> »
  /\b(as[- ]tu|avez[- ]vous|est[- ]ce\s+que\s+tu\s+as)\b[^.?!]{0,50}\b(enregistre[es]?|memorise[es]?|indexe[es]?|retenu[es]?|sauvegarde[es]?|stocke[es]?|garde[es]?\s+en\s+memoire)\b[^.?!]{0,60}\b(documents?|sources?|fichiers?|rapports?|notes?|pdf|pieces?\s+jointes?|donnees|informations?)\b/i,
  // « ta base de connaissances / documentaire »
  /\b(ta|ton|votre)\s+(base\s+de\s+connaissances?|base\s+documentaire)\b/i,
  // « ta bibliothèque (globale / de documents...) » — mais pas « votre
  // bibliothèque de composants/scripts/... » (lookahead négatif sur « de »).
  /\b(ta|ton|votre)\s+bibliotheque(?:\s+(?:globale|de\s+(?:documents?|sources?|fichiers?)))?\b(?!\s+de\b)/i,
  // « documents indexés / persistants ... dans ta base / le rag / la plateforme »
  /\b(documents?|sources?|fichiers?)\b[^.?!]{0,50}\b(indexes?|enregistres?|persistants?|stockes?)\b[^.?!]{0,50}\b(ta\s+base|base\s+de\s+connaissances?|base\s+documentaire|rag|plateforme|ta\s+memoire|index\s+vectoriel)/i,
  // Anglais.
  /\bwhat\s+(documents?|sources?|files?)\b[^.?!]{0,70}\b(do\s+you\s+(have|know|recognize|remember)|are\s+(indexed|stored|available|saved))/i,
  /\b(did|have|do)\s+you\s+(save[d]?|store[d]?|index(ed)?|memoriz\w*|remember|record(ed)?)\b[^.?!]{0,60}\b(documents?|sources?|files?|knowledge)/i,
  /\byour\s+knowledge\s+base\b/i
];

export function detectKnowledgeInventoryIntent(message) {
  // Les retours à la ligne deviennent des fins de phrase AVANT la
  // normalisation (qui écrase \n en espace) : sans cela, les gardes de
  // portée [^.?!] des patterns traversaient les puces d'une liste.
  const normalized = normalizeForKeywordMatching(String(message || '').replace(/[\r\n]+/g, '. '));
  return KNOWLEDGE_INVENTORY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export async function buildKnowledgeInventoryBlock(env, { projectId, projectName, hasProjectMemory, language } = {}) {
  const en = language === 'en';
  let projectDocs = [];
  let globalDocs = [];
  try {
    [globalDocs, projectDocs] = await Promise.all([
      listIndexedDocuments(env, { includeGlobalLibrary: true }),
      projectId ? listIndexedDocuments(env, { projectId }) : Promise.resolve([])
    ]);
  } catch (error) {
    console.warn('knowledge_inventory_failed', error instanceof Error ? error.message : String(error));
    return '';
  }

  // Les noms de documents sont saisis par l'utilisateur (et la route
  // rag_index n'est pas authentifiée) : neutralise sauts de ligne/tabulations
  // et borne la longueur pour qu'un nom ne puisse pas injecter de fausses
  // directives dans ce bloc systeme presente comme factuel.
  const formatDoc = (doc) => {
    const safeName = String(doc.name || '').replace(/[\r\n\t]+/g, ' ').slice(0, 150);
    return `- ${safeName}${doc.indexedAt ? ` (${new Date(doc.indexedAt).toISOString().slice(0, 10)})` : ''}`;
  };
  const MAX_LISTED = 30;
  const listed = (projectId ? projectDocs : globalDocs).slice(0, MAX_LISTED);
  const scopeCount = projectId ? projectDocs.length : globalDocs.length;
  const truncatedNote = scopeCount > MAX_LISTED
    ? (en ? `\n… and ${scopeCount - MAX_LISTED} more document(s).` : `\n… et ${scopeCount - MAX_LISTED} autre(s) document(s).`)
    : '';

  const lines = en ? [
    '',
    '',
    'FACTUAL INVENTORY OF YOUR KNOWLEDGE BASE (real data, just read from the platform database):',
    `- This platform DOES persistently index documents (vector store + database). Total indexed documents across all projects: ${globalDocs.length}.`,
    projectId
      ? `- Active project${projectName ? ` "${projectName}"` : ''}: ${projectDocs.length} indexed document(s)${projectDocs.length ? ':' : '.'}`
      : '- This conversation is not linked to a project: no project-scoped documents apply here, but the global library above exists.',
    ...(listed.length ? [listed.map(formatDoc).join('\n') + truncatedNote] : []),
    `- Persistent project memory: ${hasProjectMemory ? 'present for this project' : 'not set for this conversation'}.`,
    'Answer the user\'s question about your knowledge base from THIS inventory only. Never claim that nothing is saved or that every conversation starts from zero: indexed documents and project memory ARE persistent across conversations. What is NOT persisted automatically: files attached ad hoc to a message (they must be imported into the project or library to be indexed). If document excerpts are also provided in the context, they complement this inventory — they never contradict it.'
  ] : [
    '',
    '',
    'INVENTAIRE FACTUEL DE TA BASE DE CONNAISSANCES (données réelles, lues à l\'instant dans la base de la plateforme) :',
    `- Cette plateforme indexe bien les documents de façon PERSISTANTE (index vectoriel + base de données). Total de documents indexés tous projets confondus : ${globalDocs.length}.`,
    projectId
      ? `- Projet actif${projectName ? ` « ${projectName} »` : ''} : ${projectDocs.length} document(s) indexé(s)${projectDocs.length ? ' :' : '.'}`
      : '- Cette conversation n\'est liée à aucun projet : aucun document de projet ne s\'applique ici, mais la bibliothèque globale ci-dessus existe.',
    ...(listed.length ? [listed.map(formatDoc).join('\n') + truncatedNote] : []),
    `- Mémoire projet persistante : ${hasProjectMemory ? 'présente pour ce projet' : 'non renseignée pour cette conversation'}.`,
    'Réponds à la question de l\'utilisateur sur ta base de connaissances à partir de CET inventaire uniquement. Ne prétends jamais que rien n\'est enregistré ou que chaque conversation repart de zéro : les documents indexés et la mémoire projet SONT persistants d\'une conversation à l\'autre. Ce qui n\'est PAS persisté automatiquement : les fichiers joints ponctuellement à un message (ils doivent être importés dans le projet ou la bibliothèque pour être indexés). Si des passages documentaires sont également fournis dans le contexte, ils complètent cet inventaire — ils ne le contredisent jamais.'
  ];
  return lines.join('\n');
}

function effectiveKnowledgeTokenBudget(body, maxTokens) {
  const requested = Number(body?.knowledgeTokenBudget || body?.tokenBudget);
  if (Number.isFinite(requested) && requested > 0) return requested;
  return Math.max(1800, Math.min(6000, Number(maxTokens || DEFAULT_MAX_TOKENS) * 2));
}

// Instrumentation temporaire (Phase 3 activation progressive) : visible
// uniquement dans les logs Workers et dans /admin/health quand DEBUG=true.
// Snapshot best-effort, conserve en memoire pour l'isolate courant
// uniquement (pas de persistance D1, pas d'exposition cote utilisateur final).
export function isKnowledgeDebugEnabled(env) {
  return isFlagEnabled(env, 'DEBUG', false);
}

let lastKnowledgeDebugSnapshot = null;

export function buildKnowledgeDebugSnapshot(result, { startedAt = null } = {}) {
  const telemetry = result?.telemetry || {};
  return {
    captured_at: new Date().toISOString(),
    sources_selected: telemetry.sources_requested || [],
    sources_queried: (telemetry.sources_queried || []).map((item) => ({
      source: item.source,
      ok: item.ok,
      results_count: item.results_count,
      latency_ms: item.latency_ms,
      error: item.error || ''
    })),
    confidence: result?.confidence ?? null,
    chunks_selected: telemetry.chunks_selected ?? null,
    token_budget: telemetry.token_budget ?? null,
    token_budget_used: telemetry.token_budget_used ?? null,
    duplicates_removed: telemetry.duplicates_removed ?? null,
    conflicts_detected: Array.isArray(result?.conflicts) ? result.conflicts.length : 0,
    total_latency_ms: telemetry.latency_ms ?? (startedAt != null ? Date.now() - startedAt : null)
  };
}

function recordKnowledgeDebugSnapshot(env, snapshot) {
  if (!isKnowledgeDebugEnabled(env)) return;
  lastKnowledgeDebugSnapshot = snapshot;
  console.log('knowledge_orchestrator_debug', JSON.stringify(snapshot));
}

async function persistKnowledgeQuery(env, { sessionId, query, result }) {
  if (!env?.DB || !query) return;
  try {
    await env.DB.prepare(
      `INSERT INTO knowledge_queries (session_id, query, selected_sources_json, latency_ms, confidence)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      sessionId || null,
      String(query).slice(0, 4000),
      JSON.stringify(result?.selectedSources || []),
      Number(result?.telemetry?.latency_ms || 0),
      result?.confidence == null ? null : Number(result.confidence)
    ).run();
    for (const conflict of result?.conflicts || []) {
      await env.DB.prepare(
        `INSERT INTO knowledge_conflicts (query_hash, document_a, document_b, conflict_type, detail_json)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        hashString(query),
        conflict.documentA || null,
        conflict.documentB || null,
        conflict.type || 'possible_conflict',
        JSON.stringify(conflict)
      ).run();
    }
  } catch (error) {
    console.warn('knowledge_query_persist_failed', error instanceof Error ? error.message : String(error));
  }
}

async function handleKnowledgeQuery(request, env, body = {}) {
  if (!isKnowledgeOrchestratorEnabled(env)) {
    return { ok: false, error: 'knowledge_orchestrator_disabled', status: 403 };
  }
  const registry = buildKnowledgeRegistry(env, { enableTavily: true });
  const query = String(body.query || body.message || '').trim();
  if (!query) return { ok: false, error: 'empty_query', status: 400 };
  if (query.length > KNOWLEDGE_QUERY_MAX_LENGTH) {
    return { ok: false, error: 'query_too_long', status: 400 };
  }
  const result = await runKnowledgeOrchestrator(env, registry, {
    query,
    sourcePlan: body.sourcePlan || null,
    capabilityPlan: body.capabilityPlan || null,
    executionPlan: body.executionPlan || null,
    projectContext: {
      projectId: body.projectId || body.project_id || '',
      projectMemory: body.projectMemory || '',
      memory: body.projectMemory || '',
      obsidianVaultId: body.obsidianVaultId || body.vaultId || 'vault_1'
    },
    history: normalizeHistory(body.history),
    tokenBudget: body.tokenBudget,
    language: body.language === 'en' ? 'en' : 'fr',
    sources: Array.isArray(body.sources) ? body.sources : null,
    allSources: body.allSources === true,
    tavilyIntent: body.tavilyIntent || null
  });
  await persistKnowledgeQuery(env, { sessionId: body.sessionId || body.session_id || '', query, result });
  return result;
}

async function handleKnowledgeIndex(env, body = {}, rawBodyText = '') {
  if (!isObsidianEnabled(env)) return { ok: false, error: 'obsidian_disabled', status: 403 };
  const payloadSize = rawBodyText ? rawBodyText.length : JSON.stringify(body || {}).length;
  if (payloadSize > KNOWLEDGE_INDEX_MAX_PAYLOAD_BYTES) {
    return { ok: false, error: 'payload_too_large', status: 413 };
  }
  return await createObsidianKnowledgeSource().index(env, body);
}

async function handleKnowledgeRefresh(env, body = {}) {
  const registry = buildKnowledgeRegistry(env, { enableTavily: false });
  const sourceKey = String(body.source || body.sourceId || 'obsidian');
  const source = registry.get(sourceKey);
  if (!source) return { ok: false, error: 'source_not_found', status: 404 };
  return await source.refresh(env, body.cursor || {});
}

async function handleKnowledgeDocument(env, documentId) {
  const registry = buildKnowledgeRegistry(env, { enableTavily: false });
  for (const source of registry.list()) {
    const document = await source.getDocument(env, documentId);
    if (document) return { ok: true, document, metadata: await source.getMetadata(env, documentId) };
  }
  return { ok: false, error: 'document_not_found', status: 404 };
}

async function handleKnowledgeHealth(env) {
  const registry = buildKnowledgeRegistry(env, { enableTavily: true });
  const health = await collectSourceHealth(env, registry);
  return {
    ok: true,
    enabled: isKnowledgeOrchestratorEnabled(env),
    obsidian_enabled: isObsidianEnabled(env),
    ...health
  };
}

const KNOWLEDGE_AUTH_REQUIRED_PATHS = new Set(['/knowledge/index', '/knowledge/refresh']);

export async function handleKnowledgeRoute(request, env, url, body = null, rawBodyText = '') {
  const pathname = url.pathname.replace(/\/+$/, '');
  if (request.method === 'GET' && pathname === '/knowledge/health') {
    return await handleKnowledgeHealth(env);
  }
  const requiresAuth =
    (request.method === 'GET' && pathname.startsWith('/knowledge/document/')) ||
    (request.method === 'POST' && KNOWLEDGE_AUTH_REQUIRED_PATHS.has(pathname));
  if (requiresAuth) {
    const authStatus = getKnowledgeAuthStatus(request, env);
    if (authStatus === 401) return { ok: false, error: 'unauthorized', status: 401 };
    if (authStatus === 403) return { ok: false, error: 'forbidden', status: 403 };
  }
  if (request.method === 'GET' && pathname.startsWith('/knowledge/document/')) {
    return await handleKnowledgeDocument(env, decodeURIComponent(pathname.slice('/knowledge/document/'.length)));
  }
  if (request.method !== 'POST') return { ok: false, error: 'method_not_allowed', status: 405 };
  const payload = body || {};
  if (pathname === '/knowledge/query') return await handleKnowledgeQuery(request, env, payload);
  if (pathname === '/knowledge/index') return await handleKnowledgeIndex(env, payload, rawBodyText);
  if (pathname === '/knowledge/refresh') return await handleKnowledgeRefresh(env, payload);
  return { ok: false, error: 'not_found', status: 404 };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request, env);
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://digitalblueskye.com/';

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

    if (request.method === 'GET' && url.pathname.startsWith('/knowledge/')) {
      const result = await handleKnowledgeRoute(request, env, url);
      return jsonResponse(result, result?.status || 200, corsHeaders);
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
    let rawBodyText = '';
    try {
      rawBodyText = await request.text();
      body = rawBodyText ? JSON.parse(rawBodyText) : {};
    } catch (error) {
      queueAiEvent(ctx, env, request, {
        event_type: 'api_error',
        event_value: 'Invalid JSON payload',
        meta: { error: 'invalid_json', route: url.pathname, mode: 'unknown' }
      });
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, corsHeaders);
    }

    if (url.pathname.startsWith('/knowledge/')) {
      const result = await handleKnowledgeRoute(request, env, url, body, rawBodyText);
      return jsonResponse(result, result?.status || (result?.error === 'not_found' ? 404 : 200), corsHeaders);
    }

    const mode = typeof body?.mode === 'string' ? body.mode : 'chat';
    if (mode === 'event') {
      // Pipeline documentaire (onglet admin Documents) : seul un allowlist
      // explicite d'event_type peut etre journalise par ce canal cote
      // client, pour eviter d'exposer un logger D1 arbitraire sur un
      // endpoint public. Aucune autre valeur n'est acceptee.
      const eventType = String(body?.event_type || '');
      if (!DOCUMENT_TRACKED_EVENT_TYPES.includes(eventType)) {
        return jsonResponse({ ok: false, error: 'event_type_not_allowed' }, 400, corsHeaders);
      }
      queueAiEvent(ctx, env, request, {
        session_id: body?.sessionId || body?.session_id,
        event_type: eventType,
        event_value: body?.event_value,
        page_url: body?.pageUrl || body?.page_url,
        meta: body?.meta || {}
      });
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
        chunks: Array.isArray(body?.chunks) ? body.chunks : [],
        mimeType: typeof body?.mimeType === 'string' ? body.mimeType.slice(0, 128) : null,
        sizeBytes: body?.sizeBytes,
        checksum: typeof body?.checksum === 'string' ? body.checksum.slice(0, 128) : null,
        sourceType: typeof body?.sourceType === 'string' ? body.sourceType.slice(0, 64) : null
      });
      return jsonResponse(result, 200, corsHeaders);
    }

    if (mode === 'rag_delete') {
      const result = await deleteDocumentVectors(env, { documentId: body?.documentId });
      return jsonResponse(result, 200, corsHeaders);
    }

    // Réindexation serveur (migration d'embeddings, cf. reindexChunksBatch) —
    // protégée par Bearer token admin (KNOWLEDGE_ADMIN_TOKEN ou ADMIN_TOKEN),
    // comme les routes /knowledge/*. Boucler : repartir de nextCursor tant
    // que done=false ; si failed > 0, rejouer le même cursor.
    if (mode === 'rag_reindex') {
      const authStatus = getKnowledgeAuthStatus(request, env);
      if (authStatus !== 0) {
        return jsonResponse({ ok: false, error: authStatus === 401 ? 'missing_token' : 'invalid_token' }, authStatus, corsHeaders);
      }
      const result = await reindexChunksBatch(env, { cursor: body?.cursor, limit: body?.limit });
      return jsonResponse(result, 200, corsHeaders);
    }

    // Reindexation d'UN SEUL document (bouton "Reindexer" de l'admin
    // Documents) — meme garde-fou d'auth que rag_reindex ci-dessus. Appelee
    // par worker-api.js via le binding de service AI_WORKER (jamais exposee
    // publiquement autrement) : handleAdminDocumentReindex y transmet le
    // meme Authorization Bearer que l'admin a utilise pour /admin/*, donc
    // KNOWLEDGE_ADMIN_TOKEN/ADMIN_TOKEN doivent avoir la MEME valeur sur les
    // deux Workers (digitalblueskye-api et digitalblueskye-ai) pour que ce
    // bouton fonctionne — cf. commentaire dans wrangler.ai.toml.
    if (mode === 'rag_reindex_document') {
      const authStatus = getKnowledgeAuthStatus(request, env);
      if (authStatus !== 0) {
        return jsonResponse({ ok: false, error: authStatus === 401 ? 'missing_token' : 'invalid_token' }, authStatus, corsHeaders);
      }
      const result = await reindexSingleDocument(env, { documentId: body?.documentId });
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
      ? body.projectMemory.trim().slice(0, 10000)
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

    // Signal RAG fiable (2026-07-13) : jusqu'ici, toute la chaine de decision
    // RAG (Capability/Source/Execution/Tool Planner, Prompt Orchestrator)
    // reposait UNIQUEMENT sur des heuristiques faillibles — ragTelemetry
    // envoyee par le front (vide au premier message d'un fil, probleme
    // d'oeuf-et-poule) et des regex de mots-cles sur le message
    // (isDocumentBoundQuery, needsRag...) qui ne matchent pas une formulation
    // naturelle ("tu peux voir le document que je viens d'ajouter ?"). Un
    // projet pouvait avoir des documents indexes et disponibles sans que le
    // RAG soit jamais interroge. On verifie ici, une seule fois, l'etat REEL
    // de l'index pour ce projet (meme table que ragSource.js health()) et on
    // OR-additionne ce signal a chaque hint hasRagSources/hasProjectDocuments
    // plus bas — jamais de retrait d'un signal deja detecte, donc aucune
    // regression sur le comportement existant si la requete echoue.
    let projectHasIndexedDocuments = false;
    if (body?.projectId && env?.DB) {
      try {
        const chunkCount = await env.DB
          .prepare('SELECT COUNT(*) AS count FROM rag_chunks WHERE project_id = ? LIMIT 1')
          .bind(body.projectId)
          .first();
        projectHasIndexedDocuments = Number(chunkCount?.count || 0) > 0;
      } catch (error) {
        console.warn('project_rag_check_failed', error instanceof Error ? error.message : String(error));
        projectHasIndexedDocuments = false;
      }
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
        const hasRagSourcesHint = projectHasIndexedDocuments
          || ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type));
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
        const hasRagSourcesHint = projectHasIndexedDocuments
          || ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type));
        const hasProjectDocumentsHint = projectHasIndexedDocuments || ragTelemetry.length > 0 || attachments.length > 0;
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

    // ── Tool Planner (Lot 11) ────────────────────────────────────────────
    // Couche additive, JUSTE APRES l'Execution Planner et AVANT
    // decideWebSearch/Prompt Orchestrator :
    //
    //   ... -> Source Planner -> Execution Planner -> Tool Planner ->
    //   Prompt Orchestrator -> Dynamic Model Selection -> Model Router ->
    //   LLM -> Completion Guard -> Response Quality Controller -> Renderer
    //
    // Traduit les signaux deja arbitres (capabilityPlan/sourcePlan/
    // executionPlan) en un PLAN D'OUTILLAGE explicite et journalisable. Ne
    // remplace ni n'execute aucun outil : se contente de produire un signal
    // additif lu plus bas (shouldSearchWeb, finalSystemPrompt) sans jamais
    // retirer une decision deja prise par les modules en amont (pur OR
    // additif, comme le Lot 9/10). Flag-gate (TOOL_PLANNER_ENABLED, defaut:
    // desactive) + try/catch : toute erreur ou flag desactive => toolPlan
    // reste null et le reste du pipeline se comporte exactement comme avant
    // ce Lot.
    let toolPlan = null;
    if (isToolPlannerEnabled(env)) {
      try {
        const detection = detectToolNeeds({
          userMessage: message,
          language,
          capabilityPlan,
          sourcePlan,
          executionPlan,
          hasUploadedFiles: hasFileContext || attachments.length > 0,
          hasRagSources: projectHasIndexedDocuments
            || ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type)),
          hasWebAccess: true,
          hasExports: true,
          hasCalculator: true,
          hasDocumentParser: true,
          hasOcr: true,
          hasImageTools: true
        });
        const plan = planToolUsage({ detection });
        const policy = buildToolExecutionPolicy({ plan, language });
        toolPlan = { detection, plan, policy };

        const toolMeta = {
          toolsNeeded: plan.toolsNeeded,
          toolsOptional: plan.toolsOptional,
          toolsForbidden: plan.toolsForbidden,
          primaryTool: plan.primaryTool,
          toolSequence: plan.toolSequence,
          parallelTools: plan.parallelTools,
          requiresToolExecution: plan.requiresToolExecution,
          requiresClarification: plan.requiresClarification,
          requiresUserFile: plan.requiresUserFile,
          requiresUserImage: plan.requiresUserImage,
          confidence: plan.confidence,
          reasons: plan.reasons
        };
        queueAiEvent(ctx, env, request, { event_type: 'tool_needs_detected', event_value: plan.primaryTool, language, page_url: pageUrl, session_id: sessionId, meta: toolMeta });
        queueAiEvent(ctx, env, request, { event_type: 'tool_plan_created', event_value: plan.toolsNeeded.join(','), language, page_url: pageUrl, session_id: sessionId, meta: toolMeta });
        queueAiEvent(ctx, env, request, { event_type: 'tool_policy_built', event_value: plan.requiresClarification ? 'clarification' : 'proceed', language, page_url: pageUrl, session_id: sessionId, meta: toolMeta });
      } catch (error) {
        console.warn('tool_planner_failed', error instanceof Error ? error.message : String(error));
        toolPlan = null;
        queueAiEvent(ctx, env, request, {
          event_type: 'tool_planner_error',
          event_value: 'tool_planner_failed',
          language, page_url: pageUrl, session_id: sessionId,
          meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
        });
      }
    }

    // Requete explicitement liee a un document ("ce document", "ce PDF",
    // "bibliographie du document"...) : RAG obligatoire, web/Tavily/memoire
    // projet desactives sans exception (cf. isDocumentBoundQuery). Calcule
    // une seule fois ici et reutilise pour shouldSearchWeb + l'appel au
    // Knowledge Orchestrator plus bas.
    const documentBound = isDocumentBoundQuery(message);
    // Retrieval structurel (bibliographie / chercheurs / derniers
    // paragraphes / table des matieres) : determine le mode de recuperation
    // a privilegier (lexical/tail) en complement du vectoriel. Inerte hors
    // requete documentaire.
    const structuralQuery = documentBound ? detectStructuralQuery(message) : { isStructural: false, kind: null, retrieval: null, lexicalTerms: [] };
    // Document targeting : sur une requete « ce document / le document », on
    // cible un document precis. Mono-document -> ce document ; multi-document
    // -> dernier indexe, sinon clarification (jamais une reponse hallucinee
    // ni « aucune information » premature). includeGlobalLibrary quand aucun
    // projet n'est attache a la conversation (mode global).
    let documentTarget = { documentId: null, status: 'none', candidates: [], reason: 'not_document_bound' };
    if (documentBound) {
      const candidateDocs = await listIndexedDocuments(env, {
        projectId: body?.projectId || '',
        includeGlobalLibrary: !body?.projectId
      });
      documentTarget = resolveDocumentTarget({
        documents: candidateDocs,
        message,
        lastConsultedDocumentId: body?.lastConsultedDocumentId || null,
        lastIndexedDocumentId: candidateDocs[0]?.id || null
      });
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
    // Lot 11 : le Tool Planner peut additivement confirmer le besoin de
    // web_search (ex. citations exigees sans RAG disponible) — jamais le
    // retirer si deja decide par un module en amont. Pur OR additif, sans
    // effet quand toolPlan est null (flag desactive/erreur).
    // documentBound l'emporte sur tous les signaux additifs ci-dessus (Lot 9/
    // 10/11 inclus) : une requete liee a un document precis ne doit jamais
    // declencher le web, meme si un planificateur amont l'aurait force.
    const shouldSearchWeb = !documentBound && (
      webSearchDecision.shouldSearch
      || Boolean(executionPlan ? executionPlan.plan.forceWeb : sourcePlan?.plan?.forceWeb)
      || Boolean(toolPlan?.plan?.toolsNeeded?.includes('web_search'))
    );
    if (!shouldSearchWeb) {
      tavilyRuntimeStats.skipped += 1;
    }

    // Phase 1 simplification documentaire : queryPlanner tourne en mode
    // ombre uniquement. Sa sortie n'est jamais consommee par le pipeline de
    // reponse ; elle sert a mesurer les divergences avec l'empilement actuel
    // avant toute bascule comportementale.
    try {
      const legacyForceWeb = !documentBound && (
        Boolean(webSearchDecision?.intent?.explicit || webSearchDecision?.intent?.mandatory)
        || Boolean(executionPlan ? executionPlan.plan.forceWeb : sourcePlan?.plan?.forceWeb)
        || Boolean(toolPlan?.plan?.toolsNeeded?.includes('web_search'))
      );
      const legacyForceRag = documentBound
        || Boolean(executionPlan ? executionPlan.plan.forceRag : sourcePlan?.plan?.forceRag);
      const legacyUseRag = documentBound
        || projectHasIndexedDocuments
        || Boolean(capabilityPlan?.capabilities?.needsRag)
        || Boolean(sourcePlan?.plan?.useRag || sourcePlan?.plan?.forceRag)
        || Boolean(executionPlan?.plan?.useRag || executionPlan?.plan?.forceRag)
        || Boolean(toolPlan?.plan?.toolsNeeded?.includes('rag'));
      const queryPlan = planQuery({
        userMessage: message,
        language,
        attachments,
        hasProjectDocuments: projectHasIndexedDocuments || ragTelemetry.length > 0 || attachments.length > 0,
        hasRagSources: projectHasIndexedDocuments
          || ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type)),
        hasProjectMemory: Boolean(projectMemory && projectMemory.trim()),
        documents: documentTarget?.candidates || [],
        lastConsultedDocumentId: body?.lastConsultedDocumentId || null,
        lastIndexedDocumentId: documentTarget?.documentId || null,
        webAvailable: true,
        ragAvailable: true
      });
      const comparison = compareQueryPlannerWithLegacy({
        queryPlan,
        legacyPlan: {
          useRag: legacyUseRag,
          useWeb: shouldSearchWeb,
          forceRag: legacyForceRag,
          forceWeb: legacyForceWeb,
          sourceBudget: sourcePlan?.plan?.maxSources || (shouldSearchWeb || legacyUseRag ? 4 : 0),
          documentTarget,
          retrievalMode: documentBound
            ? (structuralQuery?.retrieval === 'tail' ? 'tail' : (structuralQuery?.retrieval ? 'section' : 'normal'))
            : 'none'
        }
      });
      const queryPlannerMeta = {
        hasDivergence: comparison.hasDivergence,
        divergences: comparison.divergences,
        legacy: comparison.legacy,
        queryPlanner: comparison.queryPlanner,
        reasons: queryPlan.reasons
      };
      queueAiEvent(ctx, env, request, {
        event_type: 'query_planner_shadow_compared',
        event_value: comparison.hasDivergence ? 'divergence' : 'aligned',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: queryPlannerMeta
      });
      if (comparison.hasDivergence) {
        queueAiEvent(ctx, env, request, {
          event_type: 'query_planner_shadow_divergence',
          event_value: comparison.divergences.map((item) => item.field).join(',').slice(0, 255),
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: queryPlannerMeta
        });
      }
    } catch (error) {
      console.warn('query_planner_shadow_failed', error instanceof Error ? error.message : String(error));
      queueAiEvent(ctx, env, request, {
        event_type: 'query_planner_shadow_error',
        event_value: 'query_planner_failed',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
      });
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
      ? Math.min(Math.max(configuredMaxTokens, maxTokensFloor), MAX_TOKENS_CEILING)
      : Math.min(maxTokensFloor, MAX_TOKENS_CEILING);
    // La cascade de niveaux de tokens (700/500/350 par defaut) est desormais
    // calculee a l'interieur de routeChatCompletion() a partir de ce
    // maxTokens effectif (cf. cloudflare/modelRouter.js).

    // Garde-fou (2026-07-06) : le mode pilotage renvoie la sante interne de la
    // plateforme (OpenRouter/Tavily/RAG/etc.), pas le contenu d'un projet
    // client. Il n'a de sens que hors contexte projet ; sinon il ecrasait les
    // documents reels du projet actif par des donnees de monitoring hors sujet.
    let pilotageBlock = '';
    if (!body?.projectId && detectPilotageIntent(message)) {
      try {
        const pilotageSnapshot = await buildPilotageSnapshot(request, env);
        const pilotagePlan = computeProjectPlan(pilotageSnapshot);
        pilotageBlock = buildPilotagePromptBlock(pilotagePlan, language);
      } catch (error) {
        console.warn('pilotage_snapshot_failed', error instanceof Error ? error.message : String(error));
      }
    }

    // Question méta sur la base de connaissances (« quelles sources as-tu ?»,
    // « as-tu enregistré ces documents ? ») : injecte l'inventaire REEL des
    // documents indexés pour que le modèle ne réponde plus avec son réflexe
    // générique « je ne mémorise rien » (cf. buildKnowledgeInventoryBlock).
    // Declenche aussi, independamment de l'intention detectee dans le
    // message, des que le projet actif a reellement des documents indexes
    // (projectHasIndexedDocuments) : sans ce second declencheur, un message
    // court/informel ("je viens de l'ajouter !") qui ne matche aucun mot-cle
    // de KNOWLEDGE_INVENTORY_PATTERNS laissait le modele sans aucune
    // conscience des documents du projet et il affirmait a tort n'y avoir
    // pas acces, meme quand le RAG les avait deja indexes avec succes.
    let knowledgeInventoryBlock = '';
    if (detectKnowledgeInventoryIntent(message) || projectHasIndexedDocuments) {
      knowledgeInventoryBlock = await buildKnowledgeInventoryBlock(env, {
        projectId: body?.projectId || null,
        projectName: typeof body?.projectName === 'string' ? body.projectName.slice(0, 120) : '',
        hasProjectMemory: Boolean(projectMemory),
        language
      });
      if (knowledgeInventoryBlock) {
        queueAiEvent(ctx, env, request, {
          event_type: 'knowledge_inventory_used',
          event_value: body?.projectId ? 'project_scope' : 'global_scope',
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: { project_id: body?.projectId || null }
        });
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
        const hasRagSources = projectHasIndexedDocuments
          || ragTelemetry.some((evt) => ['rag_match', 'rag_context_used'].includes(evt?.event_type))
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
    // Lot 11 : politique d'outillage (fichier/image requis, clarification,
    // export pret) ajoutee comme bloc additionnel supplementaire — n'ecrase
    // jamais sourcePolicyBlock, vient toujours en complement. Sans toolPlan
    // (flag desactive/erreur), bloc vide, comportement inchange.
    const toolPolicyBlock = toolPlan?.policy?.policyText ? ` ${toolPlan.policy.policyText}` : '';
    let finalSystemPrompt = promptBasePrompt + pilotageBlock + knowledgeInventoryBlock + sourcePolicyBlock + toolPolicyBlock;
    let knowledgeResult = null;
    if (isKnowledgeOrchestratorEnabled(env)) {
      try {
        const registry = buildKnowledgeRegistry(env, { enableTavily: false });
        knowledgeResult = await runKnowledgeOrchestrator(env, registry, {
          query: message,
          sourcePlan,
          capabilityPlan,
          executionPlan,
          projectContext: {
            projectId: body?.projectId || '',
            // Fuite inter-projets corrigee (2026-07-13, cf. ragSource.js) :
            // le RAG scope desormais STRICTEMENT au projet actif par defaut.
            // Il ne deborde sur la bibliotheque globale que si l'utilisateur
            // l'a choisi explicitement pour ce projet (ragScope 'library' ou
            // 'multi_project', envoye par le front — cf. payload.ragScope
            // dans scripts/ai-assistant.js, defaut 'project'). Sans projet
            // actif (conversation autonome), ragSource.js applique deja son
            // propre defaut (recherche globale), independamment de ce flag.
            includeGlobalLibrary: (body?.ragScope || 'project') !== 'project',
            // Requete liee a un document : la memoire de projet ne doit
            // jamais servir a repondre au contenu de la question (regle
            // explicite), seulement l'historique de conversation peut aider
            // a identifier QUEL document est vise (gere cote frontend).
            projectMemory: documentBound ? '' : projectMemory,
            memory: documentBound ? '' : projectMemory,
            obsidianVaultId: body?.obsidianVaultId || body?.vaultId || 'vault_1'
          },
          history,
          tokenBudget: Math.max(1200, Math.min(6000, effectiveKnowledgeTokenBudget(body, maxTokens))),
          language,
          // documentBound force sourceFamilies = ['rag'] exactement et
          // desactive project_memory/tavily/obsidian, sans toucher au
          // comportement par defaut des autres requetes (sources: null ->
          // inchangee, includeProjectMemory: true -> inchangee).
          sources: documentBound ? ['rag'] : null,
          includeProjectMemory: !documentBound,
          // Recall RAG elargi pour les requetes documentaires strictes
          // (bibliographie, liste de chercheurs, fin de document) : plus de
          // passages candidats, uniquement dans ce cas precis — comportement
          // par defaut (maxPassages=8) inchange sinon. Le seuil de similarite
          // documentBound etait fige a 0.5 (héritage de la calibration
          // initiale RAG_SIMILARITY_THRESHOLD=0.50, cf. wrangler.ai.toml) :
          // recalibre le 2026-07-13 a 0.35 en meme temps que le defaut
          // global, sinon ce cas precis — celui des requetes explicitement
          // liees a un document — restait bloque sur l'ancien seuil trop
          // strict pour des chunks longs/denses (PDF), exactement le
          // scenario qui a motive la recalibration.
          maxPassages: documentBound ? 16 : 8,
          similarityThreshold: documentBound ? 0.35 : undefined,
          // Retrieval structurel + document cible (inertes hors documentBound).
          structural: structuralQuery.isStructural ? structuralQuery : null,
          targetDocumentId: documentBound ? documentTarget.documentId : null
        });
        if (knowledgeResult?.contextBlock) {
          finalSystemPrompt = `${finalSystemPrompt}\n\n${knowledgeResult.contextBlock}`;
        }
        // Phase 1 simplification documentaire : les consignes strictes
        // strictDocInstruction (repondre UNIQUEMENT depuis les passages,
        // phrase exacte en cas d'absence, demande de clarification multi-doc)
        // sont retirees. documentBound continue de forcer sources=['rag'], de
        // couper la memoire projet et d'elargir le recall : le ciblage
        // documentaire reste (garde-fou), la decision de la forme de la
        // reponse retourne au LLM via le prompt systeme.
        recordKnowledgeDebugSnapshot(env, buildKnowledgeDebugSnapshot(knowledgeResult));
        await persistKnowledgeQuery(env, { sessionId, query: message, result: knowledgeResult });
        queueAiEvent(ctx, env, request, {
          event_type: 'knowledge_orchestrator_used',
          event_value: `${knowledgeResult?.selectedSources?.length || 0} source(s)`,
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: {
            confidence: knowledgeResult?.confidence ?? null,
            telemetry: knowledgeResult?.telemetry || {},
            citations_count: knowledgeResult?.citations?.length || 0,
            conflicts_count: knowledgeResult?.conflicts?.length || 0
          }
        });
      } catch (error) {
        console.warn('knowledge_orchestrator_failed', error instanceof Error ? error.message : String(error));
        recordKnowledgeDebugSnapshot(env, {
          captured_at: new Date().toISOString(),
          error: compactText(error instanceof Error ? error.message : String(error), 300)
        });
        queueAiEvent(ctx, env, request, {
          event_type: 'knowledge_orchestrator_error',
          event_value: 'knowledge_orchestrator_failed',
          language,
          page_url: pageUrl,
          session_id: sessionId,
          meta: { error: compactText(error instanceof Error ? error.message : String(error), 300) }
        });
        // Phase 1 : le fallbackSentence force (phrase exacte en cas d'erreur
        // d'orchestrateur sur requete documentaire) est retire. Le LLM
        // retrouve la main ; le ciblage documentaire reste actif plus haut.
      }
    }
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
          promptBasePrompt + pilotageBlock + knowledgeInventoryBlock,
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
          promptBasePrompt + pilotageBlock + knowledgeInventoryBlock,
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
            status_code: payload?.status_code,
            // usage tel que renvoye par OpenRouter (prompt_tokens/completion_tokens/
            // total_tokens, et cost si fourni) — jamais recalcule ni fabrique.
            usage: payload?.usage || null
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
    // Les hints des planners restent des indications de LONGUEUR CIBLE, mais
    // ne peuvent plus rabaisser le budget sous la moitie du maxTokens global :
    // un hint "reponse courte" (1200) reste utile, un hint errone ne tronque
    // plus une reponse riche. Plafond commun MAX_TOKENS_CEILING.
    const plannerMaxTokensHint = Number(
      executionPlan?.plan?.preferredMaxTokens
      ?? capabilityPlan?.plan?.preferredMaxTokens
      ?? orchestratorPlan?.maxTokensHint
    ) || 0;
    const effectiveMaxTokens = plannerMaxTokensHint > 0
      ? Math.min(Math.max(plannerMaxTokensHint, Math.round(maxTokens / 2), DEFAULT_MAX_TOKENS / 2), MAX_TOKENS_CEILING)
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

    // ── Streaming SSE opt-in (body.stream === true) ─────────────────────
    // Ouvre un flux OpenRouter et le relaie tel quel au navigateur : le
    // premier token part des que le modele l'emet, au lieu d'attendre la
    // reponse complete + Completion Guard + RQC. Ces deux garde-fous exigent
    // le texte entier et sont donc VOLONTAIREMENT ignores en mode streaming
    // (moins critiques avec les budgets de tokens debloques et Claude Haiku).
    // Tout echec AVANT le premier octet (cle absente, 402/429 sur toute la
    // chaine...) retombe silencieusement sur le chemin non-streame ci-dessous
    // — aucun nouveau mode d'echec pour l'utilisateur.
    if (body?.stream === true) {
      const streamAttempt = await routeChatCompletionStream({
        messages: conversationMessages,
        systemPrompt: finalSystemPrompt,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        env,
        metadata: { language, allowedOrigin },
        modelTier: effectiveModelTier,
        onEvent: onRouterEvent
      });
      if (streamAttempt.ok) {
        const metaPayload = {
          ok: true,
          worker_build: WORKER_BUILD,
          provider: 'openrouter',
          model: streamAttempt.model,
          resolved_model: streamAttempt.model,
          fallback_model_used: streamAttempt.model !== primaryModel,
          streamed: true,
          web_search_requested: shouldSearchWeb,
          web_search_performed: webSearchPerformed,
          web_search_error: webSearchError || '',
          web_search_query: webSearchResolvedQuery,
          web_search_results: (webSearchPerformed ? webSearchResults : []).map((r, i) => ({
            index: i + 1,
            title: r.title,
            link: r.link,
            snippet: r.snippet || '',
            publishedDate: r.publishedDate || ''
          })),
          knowledge_citations: buildKnowledgeCitationsPayload(knowledgeResult)
        };
        const relay = createOpenRouterSseRelay({
          upstreamBody: streamAttempt.body,
          metaPayload,
          onComplete: ({ fullText, finishReason, usage }) => {
            queueAiEvent(ctx, env, request, {
              event_type: 'assistant_response',
              event_value: compactText(fullText, 120),
              language,
              page_url: pageUrl,
              session_id: sessionId,
              meta: {
                reply_length: fullText.length,
                provider: 'openrouter',
                model: streamAttempt.model,
                streamed: true,
                finish_reason: finishReason,
                fallback: streamAttempt.model !== primaryModel,
                web_search_performed: webSearchPerformed,
                usage: usage || null
              }
            });
          }
        });
        return new Response(relay.readable, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
          }
        });
      }
      queueAiEvent(ctx, env, request, {
        event_type: 'stream_fallback_to_json',
        event_value: streamAttempt.errorType || 'stream_unavailable',
        language,
        page_url: pageUrl,
        session_id: sessionId,
        meta: { attempts_count: streamAttempt.attempts?.length || 0 }
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
            action: rqcAction || QUALITY_ACTIONS.SEND,
            // citations.present : deja calcule par analyzeCitations() dans
            // responseQualityController.js (regex CITATION_PATTERN sur la
            // reponse finale envoyee), jusqu'ici utilise uniquement pour le
            // scoring/issue "citation_requested_but_missing" puis jete sans
            // etre journalise. Expose ici tel quel (booleen brut, jamais
            // recalcule cote agregateur) pour alimenter un taux de citation
            // reel cote back-office (cf. buildResponseQualityStatsFromEvents
            // dans worker-api.js).
            citations_present: rqcAnalysis?.citations?.present ?? null
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

    const knowledgeCitationsPayload = buildKnowledgeCitationsPayload(knowledgeResult);
    if (knowledgeCitationsPayload.length) {
      responseBody.knowledge_citations = knowledgeCitationsPayload;
    }

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
        web_search_performed: webSearchPerformed,
        // usage tel que renvoye par le provider (OpenRouter/OpenAI), jamais
        // recalcule — permet un vrai KPI cout/tokens cote conversation sans
        // toucher au comportement du Model Router.
        usage: routerResult.usage || null
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
