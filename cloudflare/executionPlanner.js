// Execution Planner — Lot 10.
//
// Couche centrale de coordination, EN AMONT du Prompt Orchestrator, JUSTE
// APRES le Source Planner :
//
//   Utilisateur -> Capability Planner -> Source Planner -> Execution
//   Planner -> Prompt Orchestrator -> Dynamic Model Selection -> Model
//   Router -> LLM -> Completion Guard -> Response Quality Controller ->
//   Renderer AST
//
// Role : fusionner et arbitrer les signaux deja produits par le Capability
// Planner, le Source Planner, le contexte runtime et les contraintes
// utilisateur, afin de produire UN plan d'execution unique, lisible et
// journalise — source de verite pour tout le reste du pipeline. Ne
// remplace AUCUN des modules en amont : il les lit et arbitre leurs
// eventuels desaccords selon des regles de priorite explicites (cf.
// resolveExecutionPlan).
//
// Module 100% pur et deterministe :
// - Aucun acces reseau (pas de Tavily, RAG/Vectorize, D1, LLM).
// - Aucune dependance horaire/aleatoire.
// - Ne fait que lire des signaux deja calcules (capabilityPlan, sourcePlan,
//   runtimeContext...), jamais de nouvelle detection de bas niveau — cette
//   responsabilite reste au Capability Planner / Source Planner.

// ─────────────────────────────────────────────────────────────────────────
// 0. Tables de correspondance.
// ─────────────────────────────────────────────────────────────────────────

const MODEL_TIER_RANK = { fast: 0, balanced: 1, strong: 2 };

function maxTier(a, b) {
  if (!a) return b;
  if (!b) return a;
  return MODEL_TIER_RANK[a] >= MODEL_TIER_RANK[b] ? a : b;
}

function wordCount(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. buildExecutionIntent — fusion des signaux en une intention unique.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fusionne les signaux du Capability Planner, du Source Planner et du
 * contexte runtime en une intention d'execution unique. Ne tranche pas
 * encore les conflits entre modules (cf. resolveExecutionPlan) : se
 * contente de lire/agreger ce qui est deja disponible.
 *
 * Pur : ne depend que des arguments fournis.
 */
export function buildExecutionIntent({
  userMessage = '',
  language,
  capabilityPlan = null,
  sourcePlan = null,
  orchestratorPlan = null,
  runtimeContext = {},
  projectContext = null,
  webDecision = null,
  ragTelemetry = [],
  providerStatus = null
} = {}) {
  const caps = capabilityPlan?.capabilities || null;
  const capPlan = capabilityPlan?.plan || null;
  const capExec = capabilityPlan?.executionPlan || null;
  const evidence = sourcePlan?.evidence || null;
  const srcPlan = sourcePlan?.plan || null;

  const reasons = {};
  const push = (key, reason) => {
    if (!reasons[key]) reasons[key] = [];
    reasons[key].push(reason);
  };

  const words = wordCount(userMessage);

  // ── primaryGoal ──────────────────────────────────────────────────────
  let primaryGoal = 'answer';
  if (srcPlan?.askClarifyingQuestion) { primaryGoal = 'clarify'; push('primaryGoal', 'source_planner_clarification'); }
  else if (caps?.needsTranslation) { primaryGoal = 'translate'; push('primaryGoal', 'capability_needs_translation'); }
  else if (caps?.needsCode) { primaryGoal = 'code'; push('primaryGoal', 'capability_needs_code'); }
  else if (caps?.needsPlanning) { primaryGoal = 'plan'; push('primaryGoal', 'capability_needs_planning'); }
  else if (caps?.needsComparison) { primaryGoal = 'compare'; push('primaryGoal', 'capability_needs_comparison'); }
  else if (caps?.needsSummarization) { primaryGoal = 'summarize'; push('primaryGoal', 'capability_needs_summarization'); }
  else if (caps?.needsLongAnswer && (caps?.needsExport || caps?.needsTable)) { primaryGoal = 'generate_document'; push('primaryGoal', 'capability_long_export_or_table'); }
  else if (evidence?.reasons?.evidenceNeed?.some((r) => ['definition_stable_keyword', 'methodology_advice_keyword'].includes(r))) { primaryGoal = 'explain'; push('primaryGoal', 'source_planner_explanation_signal'); }
  else if (caps?.needsReasoning || caps?.needsCalculations) { primaryGoal = 'diagnose'; push('primaryGoal', 'capability_needs_reasoning_or_calculations'); }
  else { push('primaryGoal', 'default_answer'); }

  // ── answerMode ───────────────────────────────────────────────────────
  let answerMode = 'standard';
  if (caps?.needsLongAnswer) { answerMode = 'long_document'; push('answerMode', 'capability_needs_long_answer'); }
  else if (caps?.needsCode) { answerMode = 'technical'; push('answerMode', 'capability_needs_code'); }
  else if (caps?.needsTable || caps?.needsComparison) { answerMode = 'structured'; push('answerMode', 'capability_needs_table_or_comparison'); }
  else if (evidence && ['required', 'mandatory'].includes(evidence.evidenceNeed)) { answerMode = 'source_grounded'; push('answerMode', 'source_planner_evidence_required'); }
  else if (caps?.complexity === 'low' || words <= 6) { answerMode = 'short'; push('answerMode', 'low_complexity_or_short_message'); }
  else { push('answerMode', 'default_standard'); }

  // ── evidenceMode ─────────────────────────────────────────────────────
  let evidenceMode = 'none';
  const sourceRequirement = evidence?.sourceRequirement || 'no_source_needed';
  if (sourceRequirement === 'clarification_required') { evidenceMode = 'clarification'; push('evidenceMode', 'source_requirement_clarification'); }
  else if (sourceRequirement === 'rag_or_web_required') {
    evidenceMode = (srcPlan?.useRag && srcPlan?.useWeb) ? 'rag_and_web' : (srcPlan?.useRag ? 'rag' : 'web');
    push('evidenceMode', 'source_requirement_rag_or_web');
  } else if (['rag_required', 'rag_preferred'].includes(sourceRequirement)) { evidenceMode = 'rag'; push('evidenceMode', 'source_requirement_rag'); }
  else if (['web_required', 'web_preferred'].includes(sourceRequirement)) { evidenceMode = 'web'; push('evidenceMode', 'source_requirement_web'); }
  else if (sourceRequirement === 'cite_if_available') { evidenceMode = 'optional'; push('evidenceMode', 'source_requirement_cite_if_available'); }
  else if (srcPlan?.useRag && srcPlan?.useWeb) { evidenceMode = 'rag_and_web'; push('evidenceMode', 'both_rag_and_web_active'); }
  else { push('evidenceMode', 'no_source_needed'); }

  // ── riskLevel / complexity ───────────────────────────────────────────
  const riskLevel = evidence?.riskLevel || 'low';
  const complexity = caps?.complexity || (words <= 6 ? 'low' : 'medium');

  // ── modelMode ────────────────────────────────────────────────────────
  let modelMode = capPlan?.preferredModelTier || 'balanced';
  if ((evidence?.evidenceNeed === 'mandatory' || riskLevel === 'critical') && modelMode === 'fast' && words > 8) {
    modelMode = 'balanced';
    push('modelMode', 'evidence_mandatory_or_risk_critical_bumps_tier');
  }
  if (answerMode === 'long_document' && modelMode === 'fast') {
    modelMode = 'balanced';
    push('modelMode', 'long_document_bumps_tier');
  }

  // ── outputMode ───────────────────────────────────────────────────────
  let outputMode = 'plain';
  if (caps?.needsExport) { outputMode = 'export_ready'; push('outputMode', 'capability_needs_export'); }
  else if (answerMode === 'long_document') { outputMode = 'document'; push('outputMode', 'long_document_answer_mode'); }
  else if (caps?.needsTable) { outputMode = 'table'; push('outputMode', 'capability_needs_table'); }
  else if (caps?.needsMarkdown) { outputMode = 'markdown'; push('outputMode', 'capability_needs_markdown'); }
  else { push('outputMode', 'default_plain'); }

  const expectedLength = capExec?.expectedAnswerLength || (answerMode === 'long_document' ? 'long' : (answerMode === 'short' ? 'short' : 'medium'));

  const requiresSources = Boolean(caps?.needsSources || (evidence && evidence.evidenceNeed !== 'none'));
  const requiresRag = Boolean(caps?.needsRag || srcPlan?.useRag || srcPlan?.forceRag);
  const requiresWeb = Boolean(caps?.needsWeb || srcPlan?.useWeb || srcPlan?.forceWeb);
  const requiresTable = Boolean(caps?.needsTable);
  const requiresExport = Boolean(caps?.needsExport);
  const requiresLongAnswer = Boolean(caps?.needsLongAnswer);
  const requiresClarification = Boolean(srcPlan?.askClarifyingQuestion);

  // ── confidence : moyenne ponderee des confiances amont disponibles ────
  const confidenceSamples = [];
  if (Number.isFinite(caps?.confidence)) confidenceSamples.push(caps.confidence);
  if (Number.isFinite(evidence?.confidence)) confidenceSamples.push(evidence.confidence);
  const confidence = confidenceSamples.length
    ? Math.round((confidenceSamples.reduce((sum, v) => sum + v, 0) / confidenceSamples.length) * 100) / 100
    : 0.4;
  push('confidence', confidenceSamples.length ? `averaged_${confidenceSamples.length}_upstream_signal(s)` : 'no_upstream_signal_default');

  return {
    primaryGoal,
    answerMode,
    evidenceMode,
    modelMode,
    outputMode,
    riskLevel,
    complexity,
    expectedLength,
    requiresSources,
    requiresRag,
    requiresWeb,
    requiresTable,
    requiresExport,
    requiresLongAnswer,
    requiresClarification,
    confidence,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. resolveExecutionPlan — arbitrage final, source de verite du pipeline.
// ─────────────────────────────────────────────────────────────────────────

const MAX_CONTINUATIONS_BY_LENGTH = { short: 1, medium: 2, long: 3 };

/**
 * Arbitre les signaux fusionnes par buildExecutionIntent() en un plan
 * d'execution unique, en appliquant des regles de priorite explicites
 * entre Capability Planner et Source Planner (cf. commentaires inline).
 */
export function resolveExecutionPlan({ intent, capabilityPlan = null, sourcePlan = null, runtimeContext = {} } = {}) {
  const i = intent || {};
  const caps = capabilityPlan?.capabilities || null;
  const capPlan = capabilityPlan?.plan || null;
  const evidence = sourcePlan?.evidence || null;
  const srcPlan = sourcePlan?.plan || null;

  const reasons = [];
  const push = (r) => reasons.push(r);

  const useCapabilityPlanner = Boolean(capabilityPlan);
  const useSourcePlanner = Boolean(sourcePlan);
  const usePromptOrchestrator = runtimeContext.promptOrchestratorAvailable !== false;

  // Regle 1 — le Source Planner a priorite sur le Capability Planner pour
  // tout ce qui touche aux sources/citations/repli. S'il est absent (flag
  // desactive/erreur), on retombe sur les signaux du Capability Planner,
  // puis sur des valeurs neutres.
  let useWeb = srcPlan ? Boolean(srcPlan.useWeb) : Boolean(capPlan?.useWeb);
  let forceWeb = Boolean(srcPlan?.forceWeb);
  let useRag = srcPlan ? Boolean(srcPlan.useRag) : Boolean(capPlan?.useRag);
  let forceRag = Boolean(srcPlan?.forceRag);
  let requireCitations = Boolean(srcPlan?.requireCitations);
  let forbidFabricatedSources = Boolean(srcPlan?.forbidFabricatedSources);
  let forbidUnsupportedNumbers = Boolean(srcPlan?.forbidUnsupportedNumbers);
  let fallbackBehavior = srcPlan?.fallbackBehavior || 'answer_normally';
  if (srcPlan) push('source_planner_priority_on_sources_and_citations');

  const useProjectMemory = Boolean(srcPlan?.useProjectMemory || capPlan?.useProjectMemory);
  const useConversationHistory = capPlan?.useConversationHistory !== false;

  // Regle 2 — le Capability Planner a priorite sur expectedLength,
  // requiresTable, requiresExport, outputMode, et sur preferredMaxTokens
  // quand la demande est documentaire/longue.
  const requiresTable = Boolean(caps?.needsTable ?? i.requiresTable);
  const requiresExport = Boolean(caps?.needsExport ?? i.requiresExport);
  const outputMode = i.outputMode;
  const expectedLength = i.expectedLength;
  if (caps) push('capability_planner_priority_on_length_table_export_output');

  const isDocumentaryOrLong = Boolean(
    caps?.needsLongAnswer || expectedLength === 'long' || i.answerMode === 'long_document'
  );

  // Regle 4 — citations exigees mais aucune source disponible : ne jamais
  // inventer, repli explicite + avertissement transmis (via reasons, lu par
  // l'integration worker pour avertir le Prompt Orchestrator).
  const sourcesAvailable = Boolean(useRag || useWeb);
  if (requireCitations && !sourcesAvailable) {
    fallbackBehavior = srcPlan?.fallbackBehavior === 'ask_clarification' ? 'ask_clarification' : 'use_available_sources_only';
    push('citations_required_but_no_source_available_no_invention');
  }

  // Regle 5 — demande courte et stable : tier fast, 700 tokens, pas de
  // web, pas de RAG sauf demande projet explicite (deja capturee par
  // useRag si le Source Planner l'a force/recommande).
  const isShortStable = Boolean(
    i.answerMode === 'short' && (i.evidenceMode === 'none' || i.evidenceMode === 'optional') && !requiresTable && !requiresExport
  );
  let preferredModelTier = capPlan?.preferredModelTier || i.modelMode || 'balanced';
  let preferredMaxTokens = Number(capPlan?.preferredMaxTokens) || 2200;
  let temperature = Number.isFinite(capPlan?.temperature) ? capPlan.temperature : 0.35;

  if (isShortStable) {
    preferredModelTier = 'fast';
    preferredMaxTokens = 1200;
    if (!forceWeb) useWeb = false;
    if (!forceWeb) { /* forceWeb reste source de verite, jamais ecrase */ }
    if (!forceRag && !(evidence?.sourceRequirement === 'rag_required' || evidence?.sourceRequirement === 'rag_preferred')) {
      useRag = false;
    }
    push('short_stable_demand_fast_minimal_tokens');
  }

  // Regle 6 — demande documentaire longue : tier strong/balanced, tokens
  // >= 3200, Completion Guard actif, RQC strict.
  if (isDocumentaryOrLong) {
    preferredModelTier = maxTier(preferredModelTier === 'fast' ? 'balanced' : preferredModelTier, 'balanced');
    preferredMaxTokens = Math.max(preferredMaxTokens, 3200);
    push('long_document_strong_or_balanced_high_tokens');
  }

  // Regle 7 — demande factuelle recente : web actif, sources fraiches,
  // citations exigees, chiffres non justifies interdits.
  const isRecentFactual = Boolean(
    i.evidenceMode === 'web' || i.evidenceMode === 'rag_and_web' || (evidence?.recencyRisk ?? 0) >= 0.5
  );
  let requireFreshSources = Boolean(srcPlan?.requireFreshSources);
  if (isRecentFactual) {
    useWeb = true;
    requireFreshSources = true;
    requireCitations = true;
    forbidUnsupportedNumbers = true;
    push('recent_factual_demand_web_fresh_citations');
  }

  // Regle 8 — demande projet/document : RAG actif si sources disponibles ;
  // ne pas mixer RAG projet et bibliotheque globale sans autorisation
  // explicite (capture dans reasons — applique au niveau politique/prompt,
  // ce module ne mute pas le contenu des sources lui-meme).
  const requireOfficialSources = Boolean(srcPlan?.requireOfficialSources);
  if ((i.evidenceMode === 'rag' || i.evidenceMode === 'rag_and_web') && (srcPlan?.useRag || srcPlan?.forceRag)) {
    useRag = true;
    if (!srcPlan?.useGlobalLibrary) push('project_rag_priority_no_mixing_without_explicit_consent');
  }

  const useCompletionGuard = Boolean(
    isDocumentaryOrLong || requiresTable || requireCitations || i.riskLevel === 'high' || i.riskLevel === 'critical'
  );
  const useResponseQuality = runtimeContext.responseQualityAvailable !== false;
  const useMarkdownRenderer = Boolean(caps?.needsMarkdown || requiresTable || isDocumentaryOrLong || outputMode !== 'plain');

  const rqcStrictness = (isDocumentaryOrLong || requireCitations)
    ? 'strict'
    : (i.riskLevel === 'medium' ? 'standard' : 'lenient');

  const exportPolicy = requiresExport
    ? 'export_ready'
    : (outputMode === 'document' ? 'allowed_on_request' : 'not_applicable');

  const askClarification = Boolean(srcPlan?.askClarifyingQuestion || i.requiresClarification);
  const clarificationBehavior = askClarification ? 'ask_before_answering' : 'none';
  if (askClarification) fallbackBehavior = fallbackBehavior === 'answer_normally' ? 'ask_clarification' : fallbackBehavior;

  const maxContinuations = MAX_CONTINUATIONS_BY_LENGTH[expectedLength] ?? 2;

  const pipeline = ['Execution Planner'];
  if (useCapabilityPlanner) pipeline.push('Capability Planner');
  if (useSourcePlanner) pipeline.push('Source Planner');
  if (usePromptOrchestrator) pipeline.push('Prompt Orchestrator');
  if (useRag || forceRag) pipeline.push('RAG');
  if (useWeb || forceWeb) pipeline.push('Tavily');
  if (useConversationHistory || useProjectMemory) pipeline.push('Conversation');
  pipeline.push('Model Router');
  if (useCompletionGuard) pipeline.push('Completion Guard');
  if (useResponseQuality) pipeline.push('Response Quality');
  if (useMarkdownRenderer) pipeline.push('Renderer');

  const confidenceSamples = [];
  if (Number.isFinite(i.confidence)) confidenceSamples.push(i.confidence);
  if (Number.isFinite(caps?.confidence)) confidenceSamples.push(caps.confidence);
  if (Number.isFinite(evidence?.confidence)) confidenceSamples.push(evidence.confidence);
  const confidence = confidenceSamples.length
    ? Math.round((confidenceSamples.reduce((sum, v) => sum + v, 0) / confidenceSamples.length) * 100) / 100
    : (i.confidence ?? 0.4);

  return {
    useCapabilityPlanner,
    useSourcePlanner,
    usePromptOrchestrator,
    useRag,
    useWeb,
    forceRag,
    forceWeb,
    useProjectMemory,
    useConversationHistory,
    useCompletionGuard,
    useResponseQuality,
    useMarkdownRenderer,
    requireCitations,
    forbidFabricatedSources,
    forbidUnsupportedNumbers,
    requireOfficialSources,
    requireFreshSources,
    preferredModelTier,
    preferredMaxTokens,
    temperature,
    maxContinuations,
    rqcStrictness,
    exportPolicy,
    fallbackBehavior,
    clarificationBehavior,
    pipeline,
    confidence,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. buildExecutionPolicy — bloc court destine au system prompt.
// ─────────────────────────────────────────────────────────────────────────

function pickLang(language) {
  return language === 'en' ? 'en' : 'fr';
}

const DIRECTIVES = {
  sourcesRequired: {
    fr: "Les informations factuelles doivent être appuyées par des sources disponibles. N'invente aucun chiffre, prix, nom d'outil, limitation, document, hôtel, coût, citation ou lien.",
    en: 'Factual claims must be backed by available sources. Never invent a figure, price, tool name, limitation, document, hotel, cost, citation or link.'
  },
  ragPriority: {
    fr: 'Utilise prioritairement les sources du projet actif. Ne mélange pas les sources globales et les sources projet sauf autorisation explicite.',
    en: "Prioritize the active project's sources. Do not mix global sources with project sources unless explicitly authorized."
  },
  shortAnswer: {
    fr: 'Réponds directement, sans sur-structuration inutile.',
    en: 'Answer directly, without unnecessary over-structuring.'
  },
  longDocument: {
    fr: 'Produis une réponse structurée, lisible, exportable, avec titres, listes, tableau si pertinent et conclusion.',
    en: 'Produce a structured, readable, exportable answer, with headings, lists, a table when relevant, and a conclusion.'
  },
  noInvent: {
    fr: "Si aucune source n'est disponible alors qu'une preuve est exigée, indique-le clairement plutôt que d'inventer.",
    en: 'If no source is available while evidence is required, state it clearly rather than inventing one.'
  }
};

/**
 * Construit la politique consolidee destinee au Prompt Orchestrator (texte
 * court, injectable dans le system prompt) a partir du plan resolu.
 */
export function buildExecutionPolicy({ intent, plan, language } = {}) {
  const i = intent || {};
  const p = plan || {};
  const lang = pickLang(language);

  const promptDirectives = [];
  const sourceDirectives = [];
  const outputDirectives = [];
  const qualityDirectives = [];
  const fallbackDirectives = [];

  if (i.answerMode === 'short') promptDirectives.push(DIRECTIVES.shortAnswer[lang]);
  if (i.answerMode === 'long_document') promptDirectives.push(DIRECTIVES.longDocument[lang]);

  if (p.requireCitations) sourceDirectives.push(DIRECTIVES.sourcesRequired[lang]);
  if (p.useRag || p.forceRag) sourceDirectives.push(DIRECTIVES.ragPriority[lang]);

  if (p.exportPolicy === 'export_ready') outputDirectives.push(lang === 'en' ? 'Prepare content ready for export (PDF/DOCX).' : 'Prépare un contenu prêt pour export (PDF/DOCX).');
  if (p.useMarkdownRenderer) outputDirectives.push(lang === 'en' ? 'Use clean, well-spaced Markdown.' : 'Utilise un Markdown propre et bien espacé.');

  if (p.rqcStrictness === 'strict') qualityDirectives.push(lang === 'en' ? 'Quality bar: strict — no shortcuts on structure or sourcing.' : 'Exigence qualité : stricte — aucun raccourci sur la structure ou les sources.');

  if (p.fallbackBehavior === 'ask_clarification') fallbackDirectives.push(lang === 'en' ? 'Ask a clarifying question before answering in full.' : 'Pose une question de clarification avant de répondre en détail.');
  else if (p.fallbackBehavior === 'use_available_sources_only' || p.fallbackBehavior === 'refuse_to_invent') fallbackDirectives.push(DIRECTIVES.noInvent[lang]);

  const policyText = [...promptDirectives, ...sourceDirectives, ...outputDirectives, ...qualityDirectives, ...fallbackDirectives]
    .filter(Boolean)
    .join(' ');

  return {
    policyText,
    promptDirectives,
    sourceDirectives,
    outputDirectives,
    qualityDirectives,
    fallbackDirectives
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Flag gate + convenience
// ─────────────────────────────────────────────────────────────────────────

export function isExecutionPlannerEnabled(env) {
  return String(env?.EXECUTION_PLANNER_ENABLED || 'false').toLowerCase() === 'true';
}

/**
 * Convenience : buildExecutionIntent + resolveExecutionPlan +
 * buildExecutionPolicy en un seul appel. Pure, sans reseau.
 */
export function planExecution(input = {}) {
  const intent = buildExecutionIntent(input);
  const plan = resolveExecutionPlan({
    intent,
    capabilityPlan: input.capabilityPlan || null,
    sourcePlan: input.sourcePlan || null,
    runtimeContext: input.runtimeContext || {}
  });
  const policy = buildExecutionPolicy({ intent, plan, language: input.language });
  return { intent, plan, policy };
}
