// Source Planner (Evidence Planner) — Lot 9.
//
// Nouvelle etape du pipeline, EN AMONT du Prompt Orchestrator, JUSTE APRES le
// Capability Planner :
//
//   Utilisateur -> Capability Planner -> Source Planner -> Prompt
//   Orchestrator -> Dynamic Model Selection -> Model Router -> LLM ->
//   Completion Guard -> Response Quality Controller -> Renderer AST
//
// Role : decider AVANT la reponse si l'assistant peut repondre avec ses
// connaissances internes ou s'il DOIT obligatoirement s'appuyer sur des
// preuves externes (Tavily, RAG projet, bibliotheque globale, memoire
// projet) ou demander une clarification — afin d'empecher des reponses
// jolies mais non verifiees (chiffres, prix, limites, dates inventes).
//
// Complete le Capability Planner, ne le remplace pas : le Capability
// Planner decide QUOI utiliser comme capacites (tableau, export, RAG,
// web...), le Source Planner decide QUEL NIVEAU DE PREUVE est exige pour
// satisfaire ces capacites sans halluciner.
//
// Module 100% pur et deterministe :
// - Aucun acces reseau (pas de Tavily, RAG/Vectorize, D1, LLM).
// - Aucune dependance horaire/aleatoire.
// - Reutilise les motifs de detection deja valides de promptOrchestrator.js
//   (RX, export additif) plutot que de les redefinir.

import { RX as ORCHESTRATOR_RX } from './promptOrchestrator.js';

// ─────────────────────────────────────────────────────────────────────────
// 0. Motifs de detection specifiques au besoin de preuve.
// ─────────────────────────────────────────────────────────────────────────

const RX = {
  ...ORCHESTRATOR_RX,
  // 1. Reponse interne autorisee.
  definitionStable: /\b(qu['e]est[-\s]ce\s+que|c['e]est\s+quoi|d[ée]finis|d[ée]finition\s+de|que\s+signifie|what\s+is|define)\b/i,
  rewriteHelp: /\b(r[ée][ée]cris|reformule|am[ée]liore\s+(?:ce|cette)\s+(?:texte|paragraphe|phrase)|corrige\s+(?:la\s+)?grammaire|professionnalise|simplifie\s+ce\s+texte|rewrite|rephrase|paraphrase)\b/i,
  translationHelp: /\b(traduis|traduction|translate|en\s+anglais|en\s+fran[çc]ais|in\s+english|in\s+french)\b/i,
  whoAreYou: /\b(qui\s+es[-\s]tu|qui\s+êtes[-\s]vous|who\s+are\s+you|que\s+sais[-\s]tu\s+faire|what\s+can\s+you\s+do)\b/i,
  methodologyAdvice: /\b(comment\s+(?:m['e]organiser|structurer|proc[ée]der)|quelle\s+approche|quelle\s+m[ée]thode|conseille[rz]?[-\s]moi\s+(?:une\s+)?(?:approche|m[ée]thode)|best\s+practice[s]?\s+(?:for|to)\s+organize)\b/i,

  // 2. Sources recommandees (signal technique/pratique non forcement daté).
  toolsAndTech: /\b(outils?|technologies?|solutions?\s+saas|biblioth[èe]que\s+technique|framework|stack\s+technique)\b/i,
  performanceAvailability: /\b(performance[s]?|disponibilit[ée]|fiabilit[ée]|temps\s+de\s+r[ée]ponse|throughput|uptime|sla\b)\b/i,
  hostingApi: /\b(h[ée]bergement|hosting|\bapi\b|endpoint|webhook)\b/i,
  securityRegulation: /\b(s[ée]curit[ée]|conformit[ée]|rgpd|gdpr|r[ée]glementation|l[ée]gislation|compliance)\b/i,
  practicalRecommendation: /\b(recommande[rz]?(?:-moi)?|que\s+me\s+conseilles[-\s]tu|quelle\s+solution\s+choisir|lequel\s+choisir)\b/i,

  // 3. Sources obligatoires (factuel volatile / verifiable).
  pricing: /\b(prix|tarifs?|coûte?\b|co[ûu]t[s]?|combien\s+(?:coûte|ça\s+coûte|font|vaut)|pricing|price[s]?|cost[s]?|how\s+much)\b/i,
  quotaLimits: /\b(quota[s]?|limites?|limitations?|rate[-\s]?limit|plafond|seuil)\b/i,
  officialDocs: /\b(documentation\s+officielle|doc(?:s|umentation)?\s+officielle?|official\s+docs?|official\s+documentation)\b/i,
  sourcesExplicit: /\b(avec\s+(?:des\s+)?sources?|cite[zr]?\s+(?:tes|vos|les)\s+sources|r[ée]f[ée]rences?\s+v[ée]rifiables?|with\s+sources|cite\s+your\s+sources)\b/i,
  recency: /\b(aujourd['\s]hui|maintenant|actuel\b|actuelle\b|actuellement|derni[èe]re?\s+version|r[ée]cents?|r[ée]centes?|en\s+202[4-9]|cette\s+ann[ée]e|nouveaut[ée]s?|latest|current|recent|update[ds]?|news)\b/i,
  vendorComparison: ORCHESTRATOR_RX.comparison,
  travel: /\b(voyage|guide\s+(?:de\s+)?voyage|itin[ée]raire|h[ôo]tels?|s[ée]jour|vacances|circuit\s+touristique|cr[èe]te|trip|travel\s+guide)\b/i,

  // 4. RAG obligatoire.
  projectExplicit: /\b(dans\s+mon\s+projet|mon\s+projet\s+actif|mes\s+documents?|selon\s+le\s+rag|d['e]apr[èe]s\s+(?:les\s+sources\s+projet|mes\s+documents?)|biblioth[èe]que(?:\s+globale)?|document\s+upload[ée]|uploaded\s+document)\b/i,
  namedProjectEntity: /\b(vincle|digital\s+blue\s+skye)\b/i,
  architectureInternal: /\b(architecture|rag\b|pipeline|impl[ée]mentation\s+interne|fonctionnement\s+interne)\b/i,

  // 5. Clarification requise.
  documentReferenceVague: /\b(d['e]apr[èe]s\s+ce\s+document|selon\s+ce\s+document|dans\s+ce\s+fichier|d['e]apr[èe]s\s+cette\s+source)\b/i,

  // 6. Requete liee a un document precis (forcage RAG strict, web/memoire
  // projet desactives) : "ce document", "ce PDF", "dans le document",
  // "selon le document", "bibliographie du document", "derniers
  // paragraphes du document", "chercheurs mentionnes dans ce document"...
  // toute formulation contenant "ce document"/"ce pdf"/"le document"/"du
  // document" declenche ce mode, qu'un document soit deja indexe ou non.
  documentBound: /\b(ce\s+document|ce\s+pdf|cette\s+pdf|dans\s+ce\s+fichier|(?:dans|selon|d['e]apr[èe]s)\s+le\s+document|du\s+document|le\s+document|this\s+document|this\s+pdf|in\s+this\s+file)\b/i
};

function wordCount(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// ─────────────────────────────────────────────────────────────────────────
// 1. detectEvidenceNeed — analyse pure du besoin de preuve
// ─────────────────────────────────────────────────────────────────────────

/**
 * Analyse la requete utilisateur et determine si une reponse purement
 * interne (connaissances du modele) est suffisante, ou si des preuves
 * externes (RAG/web) sont recommandees, requises, voire obligatoires — ou
 * si la demande est trop vague pour repondre sans inventer.
 *
 * Pur : ne depend que des arguments fournis.
 */
export function detectEvidenceNeed({
  userMessage = '',
  language,
  hasRagSources = false,
  hasProjectDocuments = false,
  hasProjectMemory = false,
  hasWebIntent = false,
  capabilitySignals = null,
  orchestratorSignals = null,
  attachments = []
} = {}) {
  const msg = String(userMessage || '');
  const trimmed = msg.trim();
  const words = wordCount(msg);
  const reasons = {};
  const push = (key, reason) => {
    if (!reasons[key]) reasons[key] = [];
    reasons[key].push(reason);
  };

  const flags = {
    definitionStable: RX.definitionStable.test(msg),
    rewriteHelp: RX.rewriteHelp.test(msg),
    translationHelp: RX.translationHelp.test(msg),
    whoAreYou: RX.whoAreYou.test(msg),
    methodologyAdvice: RX.methodologyAdvice.test(msg),
    toolsAndTech: RX.toolsAndTech.test(msg),
    performanceAvailability: RX.performanceAvailability.test(msg),
    hostingApi: RX.hostingApi.test(msg),
    securityRegulation: RX.securityRegulation.test(msg),
    practicalRecommendation: RX.practicalRecommendation.test(msg),
    pricing: RX.pricing.test(msg),
    quotaLimits: RX.quotaLimits.test(msg),
    officialDocs: RX.officialDocs.test(msg),
    sourcesExplicit: RX.sourcesExplicit.test(msg),
    recency: RX.recency.test(msg),
    vendorComparison: RX.vendorComparison.test(msg),
    travel: RX.travel.test(msg),
    table: RX.table.test(msg),
    projectExplicit: RX.projectExplicit.test(msg),
    namedProjectEntity: RX.namedProjectEntity.test(msg),
    architectureInternal: RX.architectureInternal.test(msg),
    documentReferenceVague: RX.documentReferenceVague.test(msg),
    documentBound: RX.documentBound.test(msg)
  };

  const internalAllowedSignal = Boolean(
    flags.definitionStable || flags.rewriteHelp || flags.translationHelp ||
    flags.whoAreYou || flags.methodologyAdvice
  );
  if (flags.definitionStable) push('evidenceNeed', 'definition_stable_keyword');
  if (flags.rewriteHelp) push('evidenceNeed', 'rewrite_help_keyword');
  if (flags.translationHelp) push('evidenceNeed', 'translation_keyword');
  if (flags.whoAreYou) push('evidenceNeed', 'who_are_you_keyword');
  if (flags.methodologyAdvice) push('evidenceNeed', 'methodology_advice_keyword');

  const recommendedSignal = Boolean(
    flags.vendorComparison || flags.toolsAndTech || flags.performanceAvailability ||
    flags.hostingApi || flags.securityRegulation || flags.practicalRecommendation ||
    flags.table || flags.travel
  );
  if (flags.vendorComparison) push('sourceRequirement', 'comparison_keyword');
  if (flags.toolsAndTech) push('sourceRequirement', 'tools_tech_keyword');
  if (flags.performanceAvailability) push('sourceRequirement', 'performance_availability_keyword');
  if (flags.hostingApi) push('sourceRequirement', 'hosting_api_keyword');
  if (flags.securityRegulation) push('sourceRequirement', 'security_regulation_keyword');
  if (flags.practicalRecommendation) push('sourceRequirement', 'practical_recommendation_keyword');
  if (flags.table) push('sourceRequirement', 'table_keyword');
  if (flags.travel) push('sourceRequirement', 'travel_keyword');

  const mandatorySignal = Boolean(
    flags.recency || flags.pricing || flags.quotaLimits || flags.officialDocs ||
    flags.sourcesExplicit || hasWebIntent || (flags.vendorComparison && (flags.pricing || flags.recency))
  );
  if (flags.recency) push('evidenceNeed', 'recency_keyword');
  if (flags.pricing) push('evidenceNeed', 'pricing_keyword');
  if (flags.quotaLimits) push('evidenceNeed', 'quota_limits_keyword');
  if (flags.officialDocs) push('evidenceNeed', 'official_docs_keyword');
  if (flags.sourcesExplicit) push('evidenceNeed', 'sources_explicit_keyword');
  if (hasWebIntent) push('evidenceNeed', 'web_intent_provided');

  // RAG obligatoire : intention projet explicite, entite projet nommee
  // discutee sous un angle interne, ou reference a des documents uploades
  // alors que des documents projet existent reellement.
  const ragMandatorySignal = Boolean(
    flags.projectExplicit ||
    flags.documentBound ||
    (flags.namedProjectEntity && flags.architectureInternal) ||
    (hasProjectDocuments && (flags.namedProjectEntity || flags.projectExplicit || flags.documentReferenceVague))
  );
  if (flags.projectExplicit) push('sourceRequirement', 'project_explicit_keyword');
  if (flags.documentBound) push('sourceRequirement', 'document_bound_query_keyword');
  if (flags.namedProjectEntity && flags.architectureInternal) push('sourceRequirement', 'named_entity_architecture');
  if (hasProjectDocuments && (flags.namedProjectEntity || flags.projectExplicit || flags.documentReferenceVague)) {
    push('sourceRequirement', 'project_documents_available_and_referenced');
  }

  // Clarification requise : reference documentaire vague SANS document
  // disponible, ou demande factuelle/chiffree sans aucun perimetre/critere.
  const noDocumentAvailable = !hasProjectDocuments && !hasRagSources && !(Array.isArray(attachments) && attachments.length > 0);
  const vagueDocumentReference = Boolean((flags.documentReferenceVague || flags.documentBound) && noDocumentAvailable);
  if (vagueDocumentReference) push('sourceRequirement', 'document_reference_without_document');

  const vagueFactualDemand = Boolean(
    (flags.pricing || flags.vendorComparison) &&
    words <= 10 &&
    !flags.table &&
    !flags.namedProjectEntity &&
    !/\b(cloudflare|tavily|openai|openrouter|vectorize|aws|azure|gcp|stripe|notion|slack)\b/i.test(msg)
  );
  if (vagueFactualDemand) push('sourceRequirement', 'vague_factual_demand_no_scope');

  const clarificationSignal = Boolean(vagueDocumentReference || vagueFactualDemand);

  // ── evidenceNeed ────────────────────────────────────────────────────────
  let evidenceNeed = 'optional';
  if (clarificationSignal) { evidenceNeed = 'mandatory'; push('evidenceNeed', 'clarification_signal_implies_mandatory'); }
  else if (mandatorySignal || ragMandatorySignal) { evidenceNeed = 'mandatory'; }
  else if (recommendedSignal) { evidenceNeed = 'required'; }
  else if (internalAllowedSignal) { evidenceNeed = 'none'; }
  else if (!trimmed) { evidenceNeed = 'none'; push('evidenceNeed', 'empty_message'); }
  else if (words <= 6) { evidenceNeed = 'none'; push('evidenceNeed', 'very_short_message'); }
  else { evidenceNeed = 'optional'; push('evidenceNeed', 'default_optional'); }

  // Les signaux du Capability Planner / Prompt Orchestrator (s'ils sont
  // fournis) ne peuvent que RENFORCER un besoin deja detecte, jamais
  // l'abaisser — evite qu'une mauvaise classification amont masque un
  // risque factuel reellement present dans le texte.
  if (capabilitySignals?.needsSources && evidenceNeed === 'optional') {
    evidenceNeed = 'recommended';
    push('evidenceNeed', 'capability_planner_needs_sources');
  }
  if (orchestratorSignals?.requiresSources && (evidenceNeed === 'optional' || evidenceNeed === 'none')) {
    evidenceNeed = 'recommended';
    push('evidenceNeed', 'orchestrator_requires_sources');
  }

  // ── sourceRequirement ────────────────────────────────────────────────────
  let sourceRequirement = 'no_source_needed';
  if (clarificationSignal) sourceRequirement = 'clarification_required';
  else if (flags.documentBound) sourceRequirement = 'rag_only_required';
  else if (ragMandatorySignal) sourceRequirement = 'rag_required';
  else if (flags.pricing || flags.recency || flags.officialDocs || flags.quotaLimits || hasWebIntent) sourceRequirement = 'web_required';
  else if (flags.travel) sourceRequirement = hasProjectDocuments ? 'rag_or_web_required' : 'web_preferred';
  else if (recommendedSignal && hasProjectDocuments) sourceRequirement = 'rag_or_web_required';
  else if (recommendedSignal) sourceRequirement = 'web_preferred';
  else if (flags.sourcesExplicit) sourceRequirement = 'cite_if_available';
  else if (evidenceNeed === 'none') sourceRequirement = 'no_source_needed';
  else sourceRequirement = 'cite_if_available';

  // ── risques composites (0..1) ───────────────────────────────────────────
  const factualityRisk = clamp01(
    (flags.pricing ? 0.3 : 0) + (flags.quotaLimits ? 0.25 : 0) + (flags.vendorComparison ? 0.25 : 0) +
    (flags.officialDocs ? 0.3 : 0) + (recommendedSignal ? 0.15 : 0)
  );
  const recencyRisk = clamp01((flags.recency ? 0.6 : 0) + (hasWebIntent ? 0.3 : 0) + (flags.pricing ? 0.2 : 0));
  const specificityRisk = clamp01(
    (vagueFactualDemand ? 0.7 : 0) + (vagueDocumentReference ? 0.6 : 0) + (words <= 4 && (flags.pricing || flags.vendorComparison) ? 0.3 : 0)
  );
  const hallucinationRisk = clamp01(
    (factualityRisk * 0.4) + (recencyRisk * 0.3) + (specificityRisk * 0.3) +
    (ragMandatorySignal && noDocumentAvailable ? 0.3 : 0)
  );

  const combinedRisk = Math.max(factualityRisk, recencyRisk, specificityRisk, hallucinationRisk);
  let riskLevel = 'low';
  if (clarificationSignal || combinedRisk >= 0.75) riskLevel = 'critical';
  else if (combinedRisk >= 0.5) riskLevel = 'high';
  else if (combinedRisk >= 0.25) riskLevel = 'medium';
  push('riskLevel', `combined_risk_${riskLevel}`);

  // ── confidence ───────────────────────────────────────────────────────────
  const signalCount = Object.values(flags).filter(Boolean).length + (hasWebIntent ? 1 : 0) + (hasRagSources ? 1 : 0) + (hasProjectDocuments ? 1 : 0);
  let confidence = 0.4;
  if (!trimmed) confidence = 0.1;
  else if (clarificationSignal) confidence = 0.55;
  else if (signalCount >= 4) confidence = 0.9;
  else if (signalCount === 3) confidence = 0.8;
  else if (signalCount === 2) confidence = 0.65;
  else if (signalCount === 1) confidence = 0.5;
  else confidence = 0.3;
  push('confidence', `${signalCount}_signal(s)`);

  return {
    evidenceNeed,
    confidence,
    riskLevel,
    factualityRisk,
    recencyRisk,
    specificityRisk,
    hallucinationRisk,
    sourceRequirement,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. planEvidence — du besoin de preuve au plan d'activation des sources
// ─────────────────────────────────────────────────────────────────────────

const PREFERRED_SOURCE_TYPES_BY_REQUIREMENT = {
  no_source_needed: [],
  cite_if_available: ['official_docs', 'project_docs'],
  rag_preferred: ['project_docs', 'user_uploaded_docs'],
  web_preferred: ['recent_web', 'vendor_docs'],
  rag_or_web_required: ['project_docs', 'user_uploaded_docs', 'recent_web'],
  web_required: ['recent_web', 'pricing_pages', 'official_docs', 'api_docs'],
  rag_required: ['project_docs', 'user_uploaded_docs'],
  rag_only_required: ['project_docs', 'user_uploaded_docs'],
  clarification_required: []
};

/**
 * Transforme le besoin de preuve detecte en plan d'activation concret :
 * quelles sources mobiliser, quelles exigences de citation appliquer, quel
 * comportement de repli adopter en cas d'indisponibilite des sources.
 */
export function planEvidence({ evidence, hasRagSources = false, hasProjectDocuments = false, hasProjectMemory = false, webAvailable = true, ragAvailable = true } = {}) {
  const e = evidence || {};
  const reasons = [];

  const useInternalKnowledge = e.evidenceNeed === 'none' || e.evidenceNeed === 'optional';
  if (useInternalKnowledge) reasons.push('evidence_need_none_or_optional');

  let useRag = false;
  let useGlobalLibrary = false;
  let useWeb = false;
  let forceWeb = false;
  let forceRag = false;
  let askClarifyingQuestion = false;

  switch (e.sourceRequirement) {
    case 'web_required':
      forceWeb = Boolean(webAvailable);
      useWeb = true;
      reasons.push('source_requirement_web_required');
      break;
    case 'rag_required':
      forceRag = Boolean(ragAvailable && (hasRagSources || hasProjectDocuments));
      useRag = true;
      reasons.push('source_requirement_rag_required');
      break;
    case 'rag_only_required':
      // Requete liee explicitement a un document ("ce document", "ce PDF",
      // "bibliographie du document"...) : RAG obligatoire, web et memoire
      // projet desactives sans exception, meme si un signal web/prix/recence
      // est present par ailleurs dans le meme message (cf. override combine
      // RAG+web plus bas, explicitement court-circuite pour ce cas).
      forceRag = Boolean(ragAvailable);
      useRag = true;
      useWeb = false;
      forceWeb = false;
      reasons.push('source_requirement_rag_only_required');
      break;
    case 'rag_or_web_required':
      if (ragAvailable && (hasRagSources || hasProjectDocuments)) {
        useRag = true;
        reasons.push('rag_or_web_resolved_to_rag_sources_available');
      } else {
        useWeb = Boolean(webAvailable);
        reasons.push('rag_or_web_resolved_to_web_no_rag_sources');
      }
      break;
    case 'rag_preferred':
      useRag = Boolean(ragAvailable && (hasRagSources || hasProjectDocuments));
      useGlobalLibrary = !useRag;
      reasons.push('source_requirement_rag_preferred');
      break;
    case 'web_preferred':
      useWeb = Boolean(webAvailable);
      reasons.push('source_requirement_web_preferred');
      break;
    case 'cite_if_available':
      useRag = Boolean(hasRagSources);
      useWeb = false;
      reasons.push('source_requirement_cite_if_available');
      break;
    case 'clarification_required':
      askClarifyingQuestion = true;
      reasons.push('source_requirement_clarification_required');
      break;
    case 'no_source_needed':
    default:
      reasons.push('source_requirement_no_source_needed');
      break;
  }

  // Lot 9 (RAG+web combine) : si le besoin est explicitement double (signal
  // RAG ET signal web tous deux presents dans le texte — ex. "compare mes
  // documents avec les informations recentes du web"), activer les deux,
  // quel que soit celui retenu en priorite par sourceRequirement.
  const ragSignalPresent = Boolean(
    e.reasons?.sourceRequirement?.some((r) => ['project_explicit_keyword', 'named_entity_architecture', 'project_documents_available_and_referenced'].includes(r))
  );
  const webSignalPresent = Boolean(
    e.reasons?.evidenceNeed?.some((r) => ['recency_keyword', 'pricing_keyword', 'official_docs_keyword', 'quota_limits_keyword', 'web_intent_provided'].includes(r))
  );
  if (ragSignalPresent && webSignalPresent && e.evidenceNeed !== 'none' && e.sourceRequirement !== 'rag_only_required') {
    if (!useRag && (hasRagSources || hasProjectDocuments) && ragAvailable) { useRag = true; reasons.push('combined_rag_signal'); }
    if (!useWeb && webAvailable) { useWeb = true; reasons.push('combined_web_signal'); }
  }

  // rag_only_required interdit explicitement la memoire projet comme
  // fallback (cf. regle "Project Memory desactivee" pour les requetes
  // liees a un document precis) : l'historique/la memoire ne doivent
  // jamais se substituer au contenu reel du document.
  const useProjectMemory = Boolean(hasProjectMemory) && e.sourceRequirement !== 'rag_only_required';

  const requireCitations = e.evidenceNeed === 'required' || e.evidenceNeed === 'mandatory';
  const forbidFabricatedSources = requireCitations;
  const forbidUnsupportedNumbers = requireCitations || e.factualityRisk >= 0.4;
  const allowUncitedAnswer = !requireCitations;
  const requireOfficialSources = Boolean(e.reasons?.evidenceNeed?.includes('official_docs_keyword'));
  const requireFreshSources = Boolean(e.recencyRisk >= 0.5);

  let maxSources = 3;
  if (e.riskLevel === 'critical') maxSources = 6;
  else if (e.riskLevel === 'high') maxSources = 5;
  else if (e.riskLevel === 'medium') maxSources = 4;

  const preferredSourceTypes = PREFERRED_SOURCE_TYPES_BY_REQUIREMENT[e.sourceRequirement] || [];

  let sourceFreshness = 'stable';
  if (useRag || forceRag) sourceFreshness = 'project_bound';
  else if (requireFreshSources || forceWeb) sourceFreshness = 'real_time';
  else if (e.recencyRisk >= 0.25) sourceFreshness = 'recent';

  let fallbackBehavior = 'answer_normally';
  if (askClarifyingQuestion) fallbackBehavior = 'ask_clarification';
  else if (e.sourceRequirement === 'rag_only_required') fallbackBehavior = 'document_only_strict';
  else if (requireCitations && !useRag && !useWeb) fallbackBehavior = 'refuse_to_invent';
  else if (requireCitations) fallbackBehavior = 'use_available_sources_only';
  else if (e.evidenceNeed === 'recommended') fallbackBehavior = 'answer_with_caveat';

  // rag_only_required force sourceFamilies = ['rag'] strictement : ni
  // obsidian, ni tavily, ni project_memory, quel que soit l'etat des autres
  // signaux detectes dans le message.
  const sourceFamilies = [];
  if (e.sourceRequirement === 'rag_only_required') {
    sourceFamilies.push('rag');
  } else {
    if (useRag || forceRag || useGlobalLibrary) {
      sourceFamilies.push('rag', 'obsidian');
    }
    if (useWeb || forceWeb) sourceFamilies.push('tavily');
    if (useProjectMemory) sourceFamilies.push('project_memory');
    if (!sourceFamilies.length && e.sourceRequirement === 'cite_if_available') {
      sourceFamilies.push('rag', 'obsidian', 'project_memory');
    }
  }

  return {
    useInternalKnowledge,
    useRag,
    useGlobalLibrary,
    useProjectMemory,
    useWeb,
    forceWeb,
    forceRag,
    requireCitations,
    allowUncitedAnswer,
    forbidFabricatedSources,
    forbidUnsupportedNumbers,
    requireOfficialSources,
    requireFreshSources,
    askClarifyingQuestion,
    maxSources,
    preferredSourceTypes,
    sourceFamilies: Array.from(new Set(sourceFamilies)),
    sourceFreshness,
    fallbackBehavior,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. buildSourcePolicy — politique textuelle courte pour le Prompt
//    Orchestrator (injectee dans le prompt systeme).
// ─────────────────────────────────────────────────────────────────────────

const POLICY_TEXT = {
  mandatorySources: {
    fr: "Cette réponse exige des sources vérifiables. N'invente aucun chiffre, prix, limitation, lien, nom de document, hôtel, coût ou référence. Si aucune source n'est disponible, indique clairement que la réponse ne peut pas être pleinement vérifiée.",
    en: 'This answer requires verifiable sources. Never invent a figure, price, limitation, link, document name, hotel, cost or reference. If no source is available, clearly state that the answer cannot be fully verified.'
  },
  rag: {
    fr: "Utilise prioritairement les sources du projet actif. Ne mélange pas bibliothèque globale et projet actif sauf si l'utilisateur l'autorise.",
    en: "Prioritize the active project's sources. Do not mix the global library with the active project unless the user allows it."
  },
  web: {
    fr: 'Utilise la recherche web lorsque les informations sont récentes, tarifaires, évolutives ou liées à une documentation officielle.',
    en: 'Use web search when information is recent, price-related, evolving, or tied to official documentation.'
  },
  none: {
    fr: 'Réponse interne autorisée. Aucune citation obligatoire, mais ne présente pas de chiffres précis non vérifiés.',
    en: 'Internal answer allowed. No mandatory citation, but do not present precise unverified figures.'
  },
  clarification: {
    fr: 'La demande est trop vague ou manque de périmètre pour garantir une réponse fiable. Demande une clarification (critères, période, produits concernés) avant de répondre en détail.',
    en: 'The request is too vague or lacks scope to guarantee a reliable answer. Ask for clarification (criteria, time frame, products involved) before answering in detail.'
  },
  documentOnly: {
    fr: "Cette question porte explicitement sur un document indexé (RAG obligatoire). N'utilise jamais le web, la mémoire de projet ou tes connaissances générales pour y répondre. L'historique de conversation peut servir uniquement à identifier de quel document il s'agit, jamais à répondre au contenu de la question.",
    en: "This question explicitly targets an indexed document (RAG mandatory). Never use the web, project memory or general knowledge to answer it. Conversation history may only be used to identify which document is meant, never to answer the question's content."
  }
};

// Phrase exacte exigee quand une requete liee a un document ne trouve aucun
// passage RAG correspondant : source de verite unique, reutilisee telle
// quelle par le worker (system prompt) pour eviter toute divergence de
// formulation entre sourcePlanner.js et worker-openrouter.js.
export const DOCUMENT_NOT_FOUND_MESSAGE = {
  fr: "Aucune information correspondante n'a été trouvée dans le document indexé.",
  en: 'No matching information was found in the indexed document.'
};

function pickLang(language) {
  return language === 'en' ? 'en' : 'fr';
}

/**
 * Construit une politique de sources textuelle courte, destinee a etre
 * injectee dans le prompt systeme par le Prompt Orchestrator.
 */
export function buildSourcePolicy({ evidence, plan, language } = {}) {
  const e = evidence || {};
  const p = plan || {};
  const lang = pickLang(language);
  const parts = [];

  if (p.askClarifyingQuestion) {
    parts.push(POLICY_TEXT.clarification[lang]);
  } else if (e.sourceRequirement === 'rag_only_required') {
    parts.push(POLICY_TEXT.documentOnly[lang]);
  } else if (e.evidenceNeed === 'required' || e.evidenceNeed === 'mandatory') {
    parts.push(POLICY_TEXT.mandatorySources[lang]);
    if (p.useRag || p.forceRag) parts.push(POLICY_TEXT.rag[lang]);
    if (p.useWeb || p.forceWeb) parts.push(POLICY_TEXT.web[lang]);
  } else if (p.useRag || p.forceRag) {
    parts.push(POLICY_TEXT.rag[lang]);
  } else if (p.useWeb || p.forceWeb) {
    parts.push(POLICY_TEXT.web[lang]);
  } else {
    parts.push(POLICY_TEXT.none[lang]);
  }

  const policyText = parts.filter(Boolean).join(' ');

  const citationPolicy = p.requireCitations
    ? (lang === 'en' ? 'Citations required for every factual claim, figure or price.' : 'Citations obligatoires pour chaque affirmation factuelle, chiffre ou prix.')
    : (lang === 'en' ? 'Citations optional.' : 'Citations facultatives.');

  const unsupportedClaimsPolicy = p.forbidUnsupportedNumbers
    ? (lang === 'en' ? 'Never state a number, price or limit without a verifiable source.' : 'Ne jamais énoncer un chiffre, un prix ou une limite sans source vérifiable.')
    : (lang === 'en' ? 'Approximate figures may be flagged as estimates.' : 'Les chiffres approximatifs peuvent être présentés comme des estimations.');

  const sourcePriority = Array.isArray(p.preferredSourceTypes) && p.preferredSourceTypes.length
    ? p.preferredSourceTypes.join(' > ')
    : 'none';

  const failureInstruction = {
    answer_normally: lang === 'en' ? 'Answer normally.' : 'Réponds normalement.',
    answer_with_caveat: lang === 'en' ? 'Answer, but flag any uncertain point as an estimate.' : 'Réponds, mais signale tout point incertain comme une estimation.',
    use_available_sources_only: lang === 'en' ? 'Use only the sources actually available; never fill gaps with invented content.' : 'Utilise uniquement les sources réellement disponibles ; ne comble jamais les manques par du contenu inventé.',
    ask_clarification: lang === 'en' ? 'Ask a clarifying question before answering in full.' : 'Pose une question de clarification avant de répondre en détail.',
    refuse_to_invent: lang === 'en' ? 'If no source is available, explicitly say the answer cannot be verified rather than inventing one.' : "Si aucune source n'est disponible, indique explicitement que la réponse ne peut pas être vérifiée plutôt que d'en inventer une.",
    document_only_strict: lang === 'en'
      ? `Answer strictly from the indexed document passages. Never use the web, project memory or conversation history to answer. If no matching passage exists, reply with EXACTLY and only: "${DOCUMENT_NOT_FOUND_MESSAGE.en}"`
      : `Réponds strictement à partir des passages du document indexé. N'utilise jamais le web, la mémoire de projet ou l'historique de conversation pour répondre. Si aucun passage correspondant n'existe, réponds EXACTEMENT et uniquement : "${DOCUMENT_NOT_FOUND_MESSAGE.fr}"`
  }[p.fallbackBehavior] || (lang === 'en' ? 'Answer normally.' : 'Réponds normalement.');

  return {
    policyText,
    citationPolicy,
    unsupportedClaimsPolicy,
    sourcePriority,
    failureInstruction
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Flag gate + convenience
// ─────────────────────────────────────────────────────────────────────────

export function isSourcePlannerEnabled(env) {
  return String(env?.SOURCE_PLANNER_ENABLED || 'false').toLowerCase() === 'true';
}

/**
 * Detection pure et independante du flag SOURCE_PLANNER_ENABLED : utilisee
 * directement par decideWebSearch() / le Knowledge Orchestrator dans
 * worker-openrouter.js pour desactiver web/memoire-projet sur les requetes
 * explicitement liees a un document, meme quand le pipeline Source Planner
 * complet (Lot 9) reste desactive en production.
 */
export function isDocumentBoundQuery(message) {
  return RX.documentBound.test(String(message || ''));
}

// ─────────────────────────────────────────────────────────────────────────
// Retrieval structurel : certaines questions ne se resument pas a une
// similarite semantique (« bibliographie du document », « derniers
// paragraphes », « chercheurs mentionnes »...). On detecte la nature
// structurelle de la requete pour declencher une recuperation lexicale
// et/ou positionnelle (tail) EN COMPLEMENT du vectoriel — jamais a la place
// de l'architecture existante.
// ─────────────────────────────────────────────────────────────────────────

const STRUCTURAL_RX = {
  // Fin du document / derniers paragraphes / derniers chunks / conclusion.
  // (document_tail_retrieval — positionnel par chunk_index)
  tail: /\b(derniers?\s+(?:paragraphes?|chunks?|extraits?)|derni[èe]res?\s+(?:pages?|lignes?|parties?|sections?)|fin\s+du\s+(?:document|pdf|fichier|texte)|conclusion\s+du\s+(?:document|texte)|conclusion|derni[èe]re\s+partie|last\s+paragraphs?|end\s+of\s+the\s+document)\b/i,
  // Bibliographie / sources citees / references / ouvrages.
  // (document_section_retrieval — lexical + voisinage)
  bibliography: /\b(bibliographie|sources?\s+cit[ée]es?|r[ée]f[ée]rences?(?:\s+bibliographiques?)?|ouvrages?\s+cit[ée]s?|s[ée]lection\s+d['e]ouvrages?|travaux\s+cit[ée]s?|bibliography|cited\s+sources?|references?)\b/i,
  // Chercheurs / auteurs / specialistes mentionnes.
  // (recherche lexicale ciblee)
  researchers: /\b(chercheurs?|chercheuses?|auteurs?|autrices?|sp[ée]cialistes?|historiens?|universitaires?|contributeurs?|pr[ée]curseurs?|contemporains?|researchers?|authors?|scholars?)\b/i,
  // Autres sections nommees : table des matieres / sommaire / resume.
  // (document_section_retrieval — lexical + voisinage)
  section: /\b(table\s+des\s+mati[èe]res|sommaire|plan\s+du\s+document|table\s+of\s+contents|r[ée]sum[ée]\s+du\s+(?:document|texte)|abstract)\b/i
};

// Termes lexicaux a rechercher dans le texte des chunks (LIKE) pour les
// requetes structurelles. Volontairement large : on privilegie le rappel,
// le vectoriel et le nettoyage de contexte se chargeant de la precision.
const STRUCTURAL_LEXICAL_TERMS = {
  bibliography: ['bibliographie', 'sources', 'références', 'references', 'ouvrages', 'travaux', 'sélection d’ouvrages', 'sélection d\'ouvrages', 'bibliography'],
  researchers: ['chercheur', 'chercheurs', 'chercheuse', 'auteur', 'auteurs', 'autrice', 'historien', 'historiens', 'spécialiste', 'spécialistes', 'précurseur', 'précurseurs', 'contemporains', 'travaux', 'ouvrages', 'références'],
  section: ['table des matières', 'sommaire', 'plan', 'résumé', 'abstract']
};

/**
 * Detecte si une requete est structurelle et renvoie le mode de
 * recuperation a privilegier :
 *  - retrieval 'tail'    : positionnel (derniers chunks par chunk_index).
 *  - retrieval 'section' : lexical + voisinage (bibliographie, table des
 *    matieres, resume...).
 *  - retrieval 'lexical' : lexical cible (chercheurs / auteurs).
 *
 * Pure, sans reseau, independante du flag Source Planner. `type` est un
 * alias de `kind` (vocabulaire V2). Utilisee cote Worker (Knowledge
 * Orchestrator) et dupliquee cote client (ai-assistant.js).
 *
 * @returns {{ isStructural: boolean, kind: string|null, type: string|null, retrieval: 'lexical'|'tail'|'section'|null, lexicalTerms: string[] }}
 */
export function detectStructuralQuery(message) {
  const msg = String(message || '');
  const make = (kind, retrieval, lexicalTerms) => ({ isStructural: true, kind, type: kind, retrieval, lexicalTerms: lexicalTerms || [] });
  // L'ordre compte : « conclusion » / « derniers paragraphes » sont
  // positionnels (tail) meme si « sources »/« auteurs » coexistent.
  if (STRUCTURAL_RX.tail.test(msg)) return make('tail', 'tail', []);
  if (STRUCTURAL_RX.bibliography.test(msg)) return make('bibliography', 'section', STRUCTURAL_LEXICAL_TERMS.bibliography);
  if (STRUCTURAL_RX.researchers.test(msg)) return make('researchers', 'lexical', STRUCTURAL_LEXICAL_TERMS.researchers);
  if (STRUCTURAL_RX.section.test(msg)) return make('section', 'section', STRUCTURAL_LEXICAL_TERMS.section);
  return { isStructural: false, kind: null, type: null, retrieval: null, lexicalTerms: [] };
}

/**
 * Normalise un titre/nom de document ou un message pour la comparaison :
 * minuscules, accents retires, extension de fichier retiree, ponctuation/
 * underscores/tirets reduits a des espaces simples.
 */
function normalizeTitleText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.(pdf|docx?|txt|md|xlsx?|pptx?|csv)$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_STOPWORDS = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'the', 'of', 'a', 'an']);

/**
 * Score de correspondance entre un titre de document normalise et un
 * message normalise : 1 si le titre entier apparait tel quel dans le
 * message (correspondance exacte/normalisee), sinon la proportion de mots
 * significatifs du titre (hors stopwords) retrouves comme mots entiers dans
 * le message (correspondance partielle : l'utilisateur ne cite qu'une
 * partie du titre).
 */
function titleMatchScore(normalizedTitle, normalizedMessage) {
  if (!normalizedTitle) return 0;
  if (normalizedMessage.includes(normalizedTitle)) return 1;
  const words = normalizedTitle.split(' ').filter((w) => w && !TITLE_STOPWORDS.has(w));
  if (!words.length) return 0;
  const messageWords = new Set(normalizedMessage.split(' '));
  const found = words.filter((w) => messageWords.has(w)).length;
  return found / words.length;
}

// En dessous de 2 mots significatifs retrouves (ou 100% d'un titre court),
// une correspondance partielle est jugee trop fragile pour cibler un
// document a l'exclusion des autres (evite qu'un seul mot generique du
// titre matche par hasard).
const MIN_PARTIAL_MATCH_RATIO = 0.6;

/**
 * Document targeting : choisit le document a interroger pour une requete
 * « ce document / le document / ce PDF ». Pure, sans reseau.
 *
 * - Le nom d'un document est explicitement mentionne (meme partiellement,
 *   meme avec underscores/casse differente) dans le message -> ce document,
 *   en priorite absolue sur tout le reste (status 'named'). Si plusieurs
 *   documents matchent a egalite, ambiguite restreinte a ces candidats-la.
 * - Sinon, 1 seul document disponible -> ce document (status 'single').
 * - Sinon, plusieurs documents -> dernier consulte, sinon dernier indexe
 *   (status 'resolved_last'), sinon ambiguite -> clarification
 *   (status 'ambiguous', candidats listes).
 * - aucun document -> status 'none'.
 *
 * @param {{ documents?: Array<{id:string,name?:string,indexedAt?:number}>, message?: string, lastConsultedDocumentId?: string|null, lastIndexedDocumentId?: string|null }} input
 * @returns {{ documentId: string|null, status: 'named'|'single'|'resolved_last'|'ambiguous'|'none', candidates: Array, reason: string }}
 */
export function resolveDocumentTarget({ documents = [], message = '', lastConsultedDocumentId = null, lastIndexedDocumentId = null } = {}) {
  const docs = Array.isArray(documents) ? documents.filter((d) => d && d.id) : [];
  if (docs.length === 0) {
    return { documentId: null, status: 'none', candidates: [], reason: 'no_document_available' };
  }

  const normalizedMessage = normalizeTitleText(message);
  if (normalizedMessage) {
    const scored = docs
      .map((doc) => ({ doc, score: titleMatchScore(normalizeTitleText(doc.name || doc.id), normalizedMessage) }))
      .filter((entry) => entry.score >= MIN_PARTIAL_MATCH_RATIO)
      .sort((a, b) => b.score - a.score);
    if (scored.length) {
      const best = scored[0].score;
      const tied = scored.filter((entry) => entry.score === best);
      if (tied.length === 1) {
        return { documentId: tied[0].doc.id, status: 'named', candidates: docs, reason: 'document_named_in_message' };
      }
      return { documentId: null, status: 'ambiguous', candidates: tied.map((entry) => entry.doc), reason: 'multiple_documents_match_named_title' };
    }
  }

  if (docs.length === 1) {
    return { documentId: docs[0].id, status: 'single', candidates: docs, reason: 'single_document_in_scope' };
  }
  const ids = new Set(docs.map((d) => d.id));
  if (lastConsultedDocumentId && ids.has(lastConsultedDocumentId)) {
    return { documentId: lastConsultedDocumentId, status: 'resolved_last', candidates: docs, reason: 'last_consulted_document' };
  }
  if (lastIndexedDocumentId && ids.has(lastIndexedDocumentId)) {
    return { documentId: lastIndexedDocumentId, status: 'resolved_last', candidates: docs, reason: 'last_indexed_document' };
  }
  // Repli deterministe : document avec le indexedAt le plus recent si connu.
  const withDates = docs.filter((d) => Number.isFinite(Number(d.indexedAt)));
  if (withDates.length) {
    const latest = withDates.reduce((a, b) => (Number(b.indexedAt) > Number(a.indexedAt) ? b : a));
    return { documentId: latest.id, status: 'resolved_last', candidates: docs, reason: 'most_recently_indexed' };
  }
  return { documentId: null, status: 'ambiguous', candidates: docs, reason: 'multiple_documents_need_clarification' };
}

/**
 * Convenience : detectEvidenceNeed + planEvidence + buildSourcePolicy en un
 * seul appel, comme capabilityPlanner.planExecution(). Pure, sans reseau.
 */
export function planSourceUsage(input = {}) {
  const evidence = detectEvidenceNeed(input);
  const plan = planEvidence({
    evidence,
    hasRagSources: input.hasRagSources,
    hasProjectDocuments: input.hasProjectDocuments,
    hasProjectMemory: input.hasProjectMemory,
    webAvailable: input.webAvailable !== false,
    ragAvailable: input.ragAvailable !== false
  });
  const policy = buildSourcePolicy({ evidence, plan, language: input.language });
  return { evidence, plan, policy };
}
