import { estimateTokens } from './contracts.js';

export function buildKnowledgeContext({
  query = '',
  results = [],
  conflicts = [],
  tokenBudget = 4000,
  language = 'fr'
} = {}) {
  const budget = Math.max(600, Math.min(12000, Number(tokenBudget) || 4000));
  const citations = [];
  const selected = [];
  let usedTokens = 0;

  for (const result of Array.isArray(results) ? results : []) {
    const citationId = `K${citations.length + 1}`;
    const text = String(result.text || '').trim();
    const cost = estimateTokens(text) + 40;
    if (!text || usedTokens + cost > budget) continue;
    citations.push({
      id: citationId,
      source: result.source,
      title: result.title,
      documentId: result.documentId,
      url: result.url || '',
      confidence: result.confidence,
      citation: result.citation
    });
    selected.push({ ...result, citationId });
    usedTokens += cost;
  }

  const intro = language === 'en'
    ? 'Knowledge context selected by the Knowledge Orchestrator. Use only these cited passages for source-grounded claims.'
    : 'Contexte documentaire sélectionné par le Knowledge Orchestrator. Utilise uniquement ces passages cités pour les affirmations sourcées.';
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
