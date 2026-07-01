import { estimateTokens } from './contracts.js';
import { cleanStructuralText } from '../documentStructure.js';

// Empreinte normalisee d'un passage : sert a ecarter les doublons quasi
// identiques (memes premiers mots) qui produisent des reponses repetitives.
function passageFingerprint(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôöùûüç\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function buildKnowledgeContext({
  query = '',
  results = [],
  conflicts = [],
  tokenBudget = 4000,
  language = 'fr',
  structural = null
} = {}) {
  const budget = Math.max(600, Math.min(12000, Number(tokenBudget) || 4000));
  const citations = [];
  const selected = [];
  const seenFingerprints = new Set();
  let usedTokens = 0;

  const structuralKind = structural?.kind || structural?.type || null;

  for (const result of Array.isArray(results) ? results : []) {
    // Nettoyage V2 : fusion des noms propres casses par l'extraction PDF
    // (bibliography/researchers) + dedup des lignes de references
    // (bibliography). Inerte pour les autres types.
    const text = cleanStructuralText(String(result.text || '').trim(), structuralKind);
    if (!text) continue;
    // Deduplication : ignore un passage dont l'empreinte a deja ete retenue
    // (chunk identique remonte par plusieurs voies lexical/vectoriel/tail).
    const fingerprint = passageFingerprint(text);
    if (fingerprint && seenFingerprints.has(fingerprint)) continue;
    const citationId = `K${citations.length + 1}`;
    const cost = estimateTokens(text) + 40;
    if (usedTokens + cost > budget) continue;
    if (fingerprint) seenFingerprints.add(fingerprint);
    citations.push({
      id: citationId,
      source: result.source,
      title: result.title,
      documentId: result.documentId,
      url: result.url || '',
      confidence: result.confidence,
      citation: result.citation
    });
    selected.push({ ...result, text, citationId });
    usedTokens += cost;
  }

  const intro = language === 'en'
    ? 'Knowledge context selected by the Knowledge Orchestrator. Use only these cited passages for source-grounded claims.'
    : 'Contexte documentaire sélectionné par le Knowledge Orchestrator. Utilise uniquement ces passages cités pour les affirmations sourcées.';
  // Phase 1 simplification documentaire : les consignes dediees aux requetes
  // structurelles (forme du tableau, ordre de restitution, etc.) sont
  // retirees. Le LLM decide de la forme de sa reponse ; le ciblage
  // documentaire (cleanStructuralText + dedup ci-dessus) reste, c'est un
  // garde-fou de qualite de donnees, pas une couche de decision sur l'intention.
  const conflictBlock = conflicts.length
    ? [
        language === 'en' ? 'Potential conflicts detected:' : 'Conflits potentiels détectés :',
        ...conflicts.slice(0, 5).map((conflict, index) => `${index + 1}. ${conflict.sourceA}/${conflict.documentA} ↔ ${conflict.sourceB}/${conflict.documentB}: ${conflict.detail}`)
      ].join('\n')
    : '';
  const passages = selected.map((item) => [
    `[${item.citationId}] ${item.title} (${item.source})`,
    item.text
  ].join('\n')).join('\n\n');
  const contextBlock = selected.length
    ? [intro, passages, conflictBlock].filter(Boolean).join('\n\n')
    : '';
  const confidence = selected.length
    ? Math.round((selected.reduce((sum, item) => sum + Number(item.confidence || item.score || 0), 0) / selected.length) * 10000) / 10000
    : null;

  return {
    contextBlock,
    citations,
    selected,
    tokenBudget: budget,
    tokenBudgetUsed: usedTokens,
    confidence
  };
}
