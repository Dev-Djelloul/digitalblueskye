// Capability Planner — Lot 8.
//
// Nouvelle premiere etape du pipeline, EN AMONT du Prompt Orchestrator :
//
//   Utilisateur -> Capability Planner -> Prompt Orchestrator ->
//   Dynamic Model Selection -> Model Router -> LLM
//
// Role : decider QUOI utiliser (capacites necessaires : RAG, web, memoire,
// tableau, export, raisonnement...) avant que le Prompt Orchestrator decide
// COMMENT repondre (profil de prompt, texte systeme). Les deux modules
// restent distincts et complementaires — celui-ci ne compose aucun prompt et
// ne remplace pas promptOrchestrator.planCapabilities()/composeSystemPrompt().
//
// Module 100% pur et deterministe, comme promptOrchestrator.js :
// - Aucun acces reseau (pas d'OpenRouter, OpenAI, Cloudflare AI, Vectorize,
//   Tavily, D1).
// - Aucune dependance horaire/aleatoire (Date.now()/Math.random() interdits)
//   afin de rester testable et rejouable a l'identique.
// - Reutilise les motifs de detection deja valides de promptOrchestrator.js
//   (RX) plutot que de les redefinir, conformement a la contrainte
//   "aucune duplication de code".
//
// Architecture pensee pour accueillir de futures capacites (vision, audio,
// OCR, generation d'images, agents specialises, workflows) sans modifier les
// modules existants : chaque nouvelle capacite est un (a) motif de
// detection + (b) entree dans CAPABILITY_DEFINITIONS, le reste (plan,
// pipeline, telemetrie, carte back-office) se met a jour automatiquement.

import { RX as ORCHESTRATOR_RX } from './promptOrchestrator.js';

// ─────────────────────────────────────────────────────────────────────────
// 0. Motifs de detection additionnels (capacites non couvertes par
//    promptOrchestrator.RX, propres au Lot 8).
// ─────────────────────────────────────────────────────────────────────────

const RX = {
  ...ORCHESTRATOR_RX,
  timeline: /\b(chronologie|historique|timeline|calendrier|frise\s+chronologique|au\s+fil\s+du\s+temps|history\s+of|over\s+time|jalons?|milestones?|[ée]volution\s+dans\s+le\s+temps)\b/i,
  sourcesExplicit: /\b(sources?|cite[zr]?\s+(?:tes|vos|les)\s+sources|r[ée]f[ée]rences?|avec\s+(?:des\s+)?sources|with\s+sources|cite\s+your\s+sources|d['e]o[ùu]\s+vient\s+cette\s+info)\b/i,
  exportRequest: /\b(exporte[rz]?|\bexport\b|t[ée]l[ée]charge[rz]?|au\s+format\s+(?:pdf|word|docx|excel|xlsx)|en\s+(?:pdf|docx|xlsx|pptx)|g[ée]n[èe]re[-\s]?(?:moi)?\s+(?:un\s+|le\s+)?(?:pdf|docx|word|excel|xlsx|pptx)|export\s+(?:to|as)|download\s+as|\.(?:pdf|docx|xlsx|pptx)\b)/i,
  markdownExplicit: /\b(markdown|en\s+markdown|format[ée]?\s+markdown|avec\s+des?\s+titres?|with\s+headings|bien\s+structur[ée]e?)\b/i,
  reasoning: /\b(pourquoi|explique\s+(?:le\s+)?raisonnement|raisonne|d[ée]montre|prouve|analyse\s+en\s+profondeur|step[-\s]?by[-\s]?step|think\s+through|raisonnement|logique\s+derri[èe]re|justifie)\b/i,
  calculations: /\b(calcule[rz]?|calculs?\b|pourcentage|moyenne|somme|total|combien\s+(?:de|coûte|font|vaut)|\broi\b|budget\s+pr[ée]visionnel|multiplie|divise|[ée]quation|formule\s+math|compute|calculate)\b/i,
  code: /\b(code|fonction|script|impl[ée]mente|programme|classe?\b|algorithme|snippet|regex|requ[êe]te\s+sql|\bapi\b|json|javascript|python|typescript|html|css|repository|repo\b|github|pull\s+request|d[ée]bug(?:ue|ger)?)\b/i,
  images: /\b(image|photo|illustration|sch[ée]ma|diagramme|visuel|g[ée]n[èe]re\s+une\s+image|cr[ée]e\s+une\s+image|dessine|picture|generate\s+an\s+image|draw\s+(?:a|me))\b/i,
  translation: /\b(traduis|traduction|translate|en\s+anglais|en\s+fran[çc]ais|in\s+english|in\s+french|vers\s+l['e]anglais|vers\s+le\s+fran[çc]ais)\b/i,
  historyReference: /\b(comme\s+(?:dit|mentionn[ée]|vu)\s+(?:avant|pr[ée]c[ée]demment)|plus\s+haut|tu\s+(?:avais|as)\s+dit|pr[ée]c[ée]demment|earlier\s+you\s+said|as\s+(?:i|we)\s+(?:said|mentioned)\s+before|previously)\b/i
};

function detectLanguage(userMessage, providedLanguage) {
  if (providedLanguage === 'fr' || providedLanguage === 'en') return providedLanguage;
  const msg = String(userMessage || '');
  const fr = ORCHESTRATOR_RX.frenchSignal.test(msg);
  const en = ORCHESTRATOR_RX.englishSignal.test(msg);
  if (fr && !en) return 'fr';
  if (en && !fr) return 'en';
  return 'auto';
}

// ─────────────────────────────────────────────────────────────────────────
// 1. detectCapabilities — analyse pure de la requete utilisateur
// ─────────────────────────────────────────────────────────────────────────

/**
 * Analyse la requete utilisateur et retourne l'ensemble des capacites
 * potentiellement necessaires pour y repondre, chacune accompagnee de ses
 * raisons de detection (cf. `reasons[capacite]`) pour rester auditable.
 *
 * Pur : ne depend que des arguments fournis, jamais d'horloge/reseau.
 */
export function detectCapabilities({
  userMessage = '',
  language,
  history = [],
  projectMemory = '',
  attachments = [],
  hasRagSources = false,
  hasWebIntent = false
} = {}) {
  const msg = String(userMessage || '');
  const trimmed = msg.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const reasons = {};
  const push = (key, reason) => {
    if (!reasons[key]) reasons[key] = [];
    reasons[key].push(reason);
  };

  const flags = {
    document: RX.document.test(msg),
    longHint: RX.longHint.test(msg),
    comparison: RX.comparison.test(msg),
    summary: RX.summary.test(msg),
    planning: RX.planning.test(msg),
    technical: RX.technical.test(msg),
    table: RX.table.test(msg),
    webRecency: RX.webRecency.test(msg),
    ragProject: RX.ragProject.test(msg),
    projectAnalysis: RX.projectAnalysis.test(msg),
    timeline: RX.timeline.test(msg),
    sourcesExplicit: RX.sourcesExplicit.test(msg),
    exportRequest: RX.exportRequest.test(msg) || attachments.some((a) => ['pdf', 'docx', 'xlsx', 'pptx'].includes(String(a?.kind || '').toLowerCase())),
    markdownExplicit: RX.markdownExplicit.test(msg),
    reasoning: RX.reasoning.test(msg),
    calculations: RX.calculations.test(msg),
    code: RX.code.test(msg),
    images: RX.images.test(msg),
    translation: RX.translation.test(msg),
    historyReference: RX.historyReference.test(msg)
  };

  const needsWeb = Boolean(hasWebIntent || flags.webRecency);
  if (hasWebIntent) push('needsWeb', 'web_intent_provided');
  if (flags.webRecency) push('needsWeb', 'web_recency_keyword');

  const needsRag = Boolean(hasRagSources || flags.ragProject || flags.projectAnalysis);
  if (hasRagSources) push('needsRag', 'rag_sources_provided');
  if (flags.ragProject) push('needsRag', 'rag_project_keyword');
  if (flags.projectAnalysis) push('needsRag', 'project_analysis_keyword');

  const needsConversationHistory = Boolean((Array.isArray(history) && history.length > 0) || flags.historyReference);
  if (Array.isArray(history) && history.length > 0) push('needsConversationHistory', 'history_present');
  if (flags.historyReference) push('needsConversationHistory', 'history_back_reference');

  const needsProjectMemory = Boolean(projectMemory && String(projectMemory).trim());
  if (needsProjectMemory) push('needsProjectMemory', 'project_memory_present');

  const needsTable = Boolean(flags.table || flags.comparison);
  if (flags.table) push('needsTable', 'table_keyword');
  if (flags.comparison) push('needsTable', 'comparison_implies_table');

  const needsComparison = flags.comparison;
  if (flags.comparison) push('needsComparison', 'comparison_keyword');

  const needsTimeline = flags.timeline;
  if (flags.timeline) push('needsTimeline', 'timeline_keyword');

  const needsSources = Boolean(flags.sourcesExplicit || needsRag || needsWeb);
  if (flags.sourcesExplicit) push('needsSources', 'sources_explicit_keyword');
  if (needsRag) push('needsSources', 'rag_implies_sources');
  if (needsWeb) push('needsSources', 'web_implies_sources');

  const needsExport = flags.exportRequest;
  if (flags.exportRequest) push('needsExport', 'export_keyword_or_attachment_kind');

  const needsReasoning = Boolean(flags.reasoning || flags.calculations);
  if (flags.reasoning) push('needsReasoning', 'reasoning_keyword');
  if (flags.calculations) push('needsReasoning', 'calculations_imply_reasoning');

  const needsCalculations = flags.calculations;
  if (flags.calculations) push('needsCalculations', 'calculation_keyword');

  const needsCode = Boolean(flags.code || flags.technical);
  if (flags.code) push('needsCode', 'code_keyword');
  if (flags.technical) push('needsCode', 'technical_keyword');

  const needsImages = flags.images;
  if (flags.images) push('needsImages', 'image_keyword');

  const needsTranslation = flags.translation;
  if (flags.translation) push('needsTranslation', 'translation_keyword');

  const needsSummarization = flags.summary;
  if (flags.summary) push('needsSummarization', 'summary_keyword');

  const needsPlanning = flags.planning;
  if (flags.planning) push('needsPlanning', 'planning_keyword');

  const needsLongAnswer = Boolean(
    flags.document ||
    flags.projectAnalysis ||
    flags.longHint ||
    (flags.planning && flags.longHint) ||
    needsTimeline
  );
  if (flags.document) push('needsLongAnswer', 'document_keyword');
  if (flags.projectAnalysis) push('needsLongAnswer', 'project_analysis_keyword');
  if (flags.longHint) push('needsLongAnswer', 'long_hint_keyword');
  if (needsTimeline) push('needsLongAnswer', 'timeline_implies_long_answer');

  // Markdown : utile dans tous les cas hors reponse triviale/tres courte —
  // le Renderer AST s'appuie sur ce flag pour decider s'il doit interpreter
  // la reponse comme structure riche ou texte brut.
  const needsMarkdown = Boolean(
    flags.markdownExplicit ||
    needsTable ||
    needsComparison ||
    needsTimeline ||
    needsLongAnswer ||
    needsCode ||
    needsExport ||
    needsPlanning ||
    wordCount > 12
  );
  if (flags.markdownExplicit) push('needsMarkdown', 'markdown_explicit_keyword');
  if (needsTable || needsComparison || needsTimeline || needsLongAnswer || needsCode || needsExport || needsPlanning) {
    push('needsMarkdown', 'structured_capability_detected');
  }

  // Complexite : memes seuils que promptOrchestrator.detectUserIntent, plus
  // les nouvelles capacites "lourdes" (raisonnement, calculs, code, export).
  let complexity = 'medium';
  if (needsLongAnswer || needsReasoning || needsCode || needsExport) complexity = 'high';
  else if (!trimmed || wordCount <= 8) complexity = 'low';
  if (complexity === 'high') push('complexity', 'heavy_capability_detected');
  else if (complexity === 'low') push('complexity', 'short_or_empty_message');
  else push('complexity', 'default_medium');

  // Confiance : proportion de signaux forts ayant matche.
  const strongSignalCount = Object.values(flags).filter(Boolean).length + (needsRag ? 1 : 0) + (needsWeb ? 1 : 0);
  let confidence = 0.4;
  if (!trimmed) confidence = 0.1;
  else if (strongSignalCount >= 4) confidence = 0.9;
  else if (strongSignalCount === 3) confidence = 0.8;
  else if (strongSignalCount === 2) confidence = 0.65;
  else if (strongSignalCount === 1) confidence = 0.5;
  else confidence = 0.3;
  push('confidence', `${strongSignalCount}_strong_signal(s)`);

  return {
    language: detectLanguage(userMessage, language),
    complexity,
    needsRag,
    needsWeb,
    needsConversationHistory,
    needsProjectMemory,
    needsLongAnswer,
    needsTable,
    needsComparison,
    needsTimeline,
    needsSources,
    needsExport,
    needsMarkdown,
    needsReasoning,
    needsCalculations,
    needsCode,
    needsImages,
    needsTranslation,
    needsSummarization,
    needsPlanning,
    confidence,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. planCapabilities — du "quoi est necessaire" au "quoi activer"
// ─────────────────────────────────────────────────────────────────────────

/**
 * Transforme les capacites detectees en plan d'activation concret pour les
 * modules en aval (RAG, Tavily, Model Router, Completion Guard, Response
 * Quality, Renderer, exports). Pur : `runtimeContext` ne sert qu'a signaler
 * la disponibilite reelle d'un module (ex. RAG indisponible si Vectorize pas
 * encore active), jamais a faire d'appel reseau ici.
 */
export function planCapabilities(capabilities, runtimeContext = {}) {
  const caps = capabilities || {};

  const useRag = Boolean(caps.needsRag && runtimeContext.ragAvailable !== false);
  const useWeb = Boolean(caps.needsWeb && runtimeContext.webAvailable !== false);
  const useConversationHistory = caps.needsConversationHistory !== false;
  const useProjectMemory = Boolean(caps.needsProjectMemory);

  const useCompletionGuard = Boolean(
    caps.needsLongAnswer ||
    caps.complexity === 'high' ||
    caps.needsExport ||
    caps.needsTable
  );

  const useResponseQuality = runtimeContext.responseQualityAvailable !== false;
  const useMarkdownRenderer = Boolean(caps.needsMarkdown);
  const usePromptOrchestrator = runtimeContext.promptOrchestratorAvailable !== false;

  const allowExports = Boolean(caps.needsExport);
  const allowHtml = allowExports || useMarkdownRenderer;
  const allowPdf = allowExports;
  const allowDocx = allowExports;

  // Tier de modele : les capacites "lourdes" (raisonnement, calculs, code,
  // reponse longue) justifient un modele plus capable ; une question courte
  // et peu ambigue peut etre traitee par un modele rapide.
  let preferredModelTier = 'balanced';
  if (caps.needsReasoning || caps.needsCalculations || caps.needsCode || caps.needsLongAnswer || caps.complexity === 'high') {
    preferredModelTier = 'strong';
  } else if (caps.complexity === 'low' && !caps.needsTable && !caps.needsRag && !caps.needsWeb) {
    preferredModelTier = 'fast';
  }

  // Bornes alignees sur le Model Router existant (plancher 700, plafond 2200
  // — cf. cloudflare/modelRouter.js DEFAULT_MAX_TOKENS/TOKEN_RETRY_LEVELS).
  let preferredMaxTokens = 1100;
  if (caps.needsLongAnswer || caps.needsTimeline || caps.needsExport) preferredMaxTokens = 2200;
  else if (caps.complexity === 'low') preferredMaxTokens = 700;

  let temperature = 0.35;
  if (caps.needsCode || caps.needsCalculations || caps.needsReasoning) temperature = 0.2;
  else if (caps.needsImages) temperature = 0.7;

  // reasoningEffort : dimension nouvelle (Lot 8), pensee pour les modeles
  // exposant un parametre d'effort de raisonnement explicite. N'a pas encore
  // de consommateur direct cote Model Router — exposee pour preparer cette
  // integration future sans devoir retoucher ce module.
  let reasoningEffort = 'low';
  if (caps.needsReasoning || caps.needsCalculations) reasoningEffort = 'high';
  else if (caps.complexity === 'high') reasoningEffort = 'medium';

  return {
    usePromptOrchestrator,
    useRag,
    useWeb,
    useConversationHistory,
    useProjectMemory,
    useCompletionGuard,
    useResponseQuality,
    useMarkdownRenderer,
    allowExports,
    allowHtml,
    allowPdf,
    allowDocx,
    preferredModelTier,
    preferredMaxTokens,
    temperature,
    reasoningEffort
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. buildExecutionPlan — pipeline complet + estimations
// ─────────────────────────────────────────────────────────────────────────

const LATENCY_BY_TIER_MS = { fast: 1500, balanced: 3000, strong: 5500 };
const COST_UNITS_BY_TIER = { fast: 1, balanced: 2, strong: 4 };

/**
 * Construit la description complete du pipeline qui sera execute pour cette
 * requete, a partir des capacites detectees et du plan d'activation. Sert a
 * la fois de tableau de bord interne (back-office) et de contrat partage
 * entre modules (cf. expectedAnswerLength reutilise par Completion Guard et
 * Response Quality).
 */
export function buildExecutionPlan(capabilities, plan) {
  const caps = capabilities || {};
  const p = plan || {};

  const pipeline = ['Capability Planner'];
  if (p.usePromptOrchestrator) pipeline.push('Prompt Orchestrator');
  if (p.useRag) pipeline.push('RAG');
  if (p.useWeb) pipeline.push('Tavily');
  if (p.useConversationHistory || p.useProjectMemory) pipeline.push('Conversation');
  pipeline.push('Model Router');
  if (p.useCompletionGuard) pipeline.push('Completion Guard');
  if (p.useResponseQuality) pipeline.push('Response Quality');
  if (p.useMarkdownRenderer) pipeline.push('Renderer');

  let expectedAnswerLength = 'medium';
  if (caps.needsLongAnswer || caps.needsTimeline || caps.needsExport) expectedAnswerLength = 'long';
  else if (caps.complexity === 'low') expectedAnswerLength = 'short';

  const tier = p.preferredModelTier || 'balanced';
  let estimatedLatency = LATENCY_BY_TIER_MS[tier] || LATENCY_BY_TIER_MS.balanced;
  if (p.useRag) estimatedLatency += 600;
  if (p.useWeb) estimatedLatency += 1800;

  // Cout estime : unite relative (pas une devise) proportionnelle au tier et
  // aux tokens attendus — comparable entre requetes, pas un montant facture.
  const tokensFactor = (p.preferredMaxTokens || 1100) / 1000;
  const estimatedCost = Math.round((COST_UNITS_BY_TIER[tier] || COST_UNITS_BY_TIER.balanced) * tokensFactor * 10) / 10;

  return {
    pipeline,
    estimatedCost,
    estimatedLatency,
    estimatedComplexity: caps.complexity || 'medium',
    estimatedReasoning: p.reasoningEffort || 'low',
    expectedAnswerLength,
    confidence: caps.confidence ?? 0.4
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Flag gate + convenience
// ─────────────────────────────────────────────────────────────────────────

export function isCapabilityPlannerEnabled(env) {
  return String(env?.CAPABILITY_PLANNER_ENABLED || 'false').toLowerCase() === 'true';
}

/**
 * Convenience : capacites + plan + execution plan en un seul appel, comme
 * promptOrchestrator.orchestrate(). Pure, sans acces reseau.
 */
export function planExecution(input = {}) {
  const capabilities = detectCapabilities(input);
  const plan = planCapabilities(capabilities, input.runtimeContext || {});
  const executionPlan = buildExecutionPlan(capabilities, plan);
  return { capabilities, plan, executionPlan };
}
