import {
  isDocumentBoundQuery,
  detectStructuralQuery,
  resolveDocumentTarget
} from './sourcePlanner.js';

const NONE_TARGET = Object.freeze({
  documentId: null,
  status: 'none',
  candidates: [],
  reason: 'not_document_bound'
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function clampBudget(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(12, Math.round(n)));
}

const WEB_FORCE_PATTERNS = [
  /\b(web|internet|recherche\s+web|search\s+the\s+web|tavily)\b/i,
  /\b(aujourd'hui|actuel(?:le)?s?|maintenant|temps\s+reel|recent(?:e)?s?|dernieres?\s+(?:actualites|news|nouveautes)|this\s+week|latest|current|today)\b/i,
  /\b(prix|tarifs?|couts?|abonnement|quota|limites?|pricing|cost|rate\s+limit)\b/i,
  /\b(documentation\s+officielle|sources?\s+officielles?|official\s+docs?)\b/i
];

const RAG_FORCE_PATTERNS = [
  /\b(ce\s+(?:document|pdf|fichier)|du\s+(?:document|pdf|fichier)|dans\s+(?:ce|le)\s+(?:document|pdf|fichier))\b/i,
  /\b(mes?\s+documents?|documents?\s+projet|base\s+de\s+connaissances|rag|vault|obsidian|google\s+drive|notion|confluence)\b/i,
  /\b(d'apres|selon)\s+(?:mes\s+)?(?:documents?|sources?|notes?|fichiers?)\b/i
];

const RAG_SOFT_PATTERNS = [
  /\b(mon\s+projet|notre\s+projet|memoire\s+projet|contexte\s+projet|historique)\b/i,
  /\b(resume|synthese|analyse)\s+(?:du|des|de\s+mes)\s+(?:documents?|notes?|fichiers?)\b/i
];

export function planQuery(input = {}) {
  const message = String(input.userMessage || input.message || '');
  const normalized = normalizeText(message);
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const documents = Array.isArray(input.documents) ? input.documents : [];
  const hasProjectDocuments = Boolean(input.hasProjectDocuments || documents.length > 0 || attachments.length > 0);
  const hasRagSources = Boolean(input.hasRagSources || hasProjectDocuments);
  const hasProjectMemory = Boolean(input.hasProjectMemory);
  const webAvailable = input.webAvailable !== false;
  const ragAvailable = input.ragAvailable !== false;

  const documentBound = isDocumentBoundQuery(message);
  const structural = documentBound
    ? detectStructuralQuery(message)
    : { isStructural: false, kind: null, type: null, retrieval: null, lexicalTerms: [] };
  const documentTarget = documentBound
    ? resolveDocumentTarget({
        documents,
        message,
        lastConsultedDocumentId: input.lastConsultedDocumentId || null,
        lastIndexedDocumentId: input.lastIndexedDocumentId || null
      })
    : { ...NONE_TARGET };

  const explicitRag = hasAny(normalized, RAG_FORCE_PATTERNS);
  const softRag = hasAny(normalized, RAG_SOFT_PATTERNS);
  const explicitWeb = hasAny(normalized, WEB_FORCE_PATTERNS);
  const forceRag = ragAvailable && (documentBound || explicitRag || attachments.length > 0);
  const useRag = ragAvailable && (forceRag || (hasRagSources && softRag) || (hasRagSources && hasProjectMemory));
  const forceWeb = webAvailable && !documentBound && explicitWeb;
  const useWeb = webAvailable && !documentBound && forceWeb;
  const retrievalMode = documentBound
    ? (structural.retrieval === 'tail' ? 'tail' : (structural.retrieval ? 'section' : 'normal'))
    : 'none';

  let sourceBudget = 0;
  if (useRag) sourceBudget += retrievalMode === 'tail' ? 10 : 6;
  if (useWeb) sourceBudget += 4;
  if (!useRag && !useWeb && (explicitRag || explicitWeb)) sourceBudget = 3;

  return {
    useRag,
    useWeb,
    forceRag,
    forceWeb,
    sourceBudget: clampBudget(sourceBudget),
    documentTarget,
    retrievalMode,
    reasons: {
      documentBound,
      structuralKind: structural.kind || null,
      explicitRag,
      softRag,
      explicitWeb,
      hasProjectDocuments,
      hasRagSources,
      hasProjectMemory
    }
  };
}

export function normalizeLegacyPlannerDecision(input = {}) {
  const documentTarget = input.documentTarget && typeof input.documentTarget === 'object'
    ? input.documentTarget
    : { ...NONE_TARGET };
  return {
    useRag: Boolean(input.useRag),
    useWeb: Boolean(input.useWeb),
    forceRag: Boolean(input.forceRag),
    forceWeb: Boolean(input.forceWeb),
    sourceBudget: clampBudget(input.sourceBudget),
    documentTarget: {
      documentId: documentTarget.documentId || null,
      status: documentTarget.status || 'none',
      reason: documentTarget.reason || null
    },
    retrievalMode: ['normal', 'tail', 'section', 'none'].includes(input.retrievalMode)
      ? input.retrievalMode
      : 'none'
  };
}

export function compactQueryPlannerDecision(decision = {}) {
  return normalizeLegacyPlannerDecision(decision);
}

export function compareQueryPlannerWithLegacy({ queryPlan, legacyPlan } = {}) {
  const next = compactQueryPlannerDecision(queryPlan);
  const current = normalizeLegacyPlannerDecision(legacyPlan);
  const divergences = [];
  for (const key of ['useRag', 'useWeb', 'forceRag', 'forceWeb', 'sourceBudget', 'retrievalMode']) {
    if (next[key] !== current[key]) {
      divergences.push({ field: key, legacy: current[key], queryPlanner: next[key] });
    }
  }
  for (const key of ['documentId', 'status', 'reason']) {
    if ((next.documentTarget || {})[key] !== (current.documentTarget || {})[key]) {
      divergences.push({
        field: `documentTarget.${key}`,
        legacy: (current.documentTarget || {})[key],
        queryPlanner: (next.documentTarget || {})[key]
      });
    }
  }
  return {
    hasDivergence: divergences.length > 0,
    divergences,
    legacy: current,
    queryPlanner: next
  };
}
