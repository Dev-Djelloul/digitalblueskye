// Tests Query Planner Phase 1 — module pur, sans reseau.
// node cloudflare/queryPlanner.test.mjs
import assert from 'node:assert/strict';
import {
  planQuery,
  compareQueryPlannerWithLegacy,
  normalizeLegacyPlannerDecision
} from './queryPlanner.js';

{
  const plan = planQuery({ userMessage: 'Qui es-tu ?' });
  assert.equal(plan.useRag, false);
  assert.equal(plan.useWeb, false);
  assert.equal(plan.forceRag, false);
  assert.equal(plan.forceWeb, false);
  assert.equal(plan.retrievalMode, 'none');
  assert.equal(plan.sourceBudget, 0);
}

{
  const plan = planQuery({
    userMessage: 'Donne-moi les 10 derniers paragraphes du document.',
    documents: [{ id: 'doc-1', name: 'Rapport.pdf' }]
  });
  assert.equal(plan.useRag, true);
  assert.equal(plan.useWeb, false);
  assert.equal(plan.forceRag, true);
  assert.equal(plan.forceWeb, false);
  assert.equal(plan.retrievalMode, 'tail');
  assert.equal(plan.documentTarget.documentId, 'doc-1');
}

{
  const plan = planQuery({
    userMessage: 'Que contient la bibliographie du document ?',
    documents: [{ id: 'doc-1' }, { id: 'doc-2' }],
    lastIndexedDocumentId: 'doc-2'
  });
  assert.equal(plan.useRag, true);
  assert.equal(plan.useWeb, false);
  assert.equal(plan.retrievalMode, 'section');
  assert.equal(plan.documentTarget.documentId, 'doc-2');
}

{
  const plan = planQuery({ userMessage: 'Combien coûte Tavily aujourd’hui ?' });
  assert.equal(plan.useWeb, true);
  assert.equal(plan.forceWeb, true);
  assert.equal(plan.useRag, false);
}

{
  const plan = planQuery({
    userMessage: 'Compare mes documents projet avec les informations récentes du web.',
    hasProjectDocuments: true,
    hasRagSources: true
  });
  assert.equal(plan.useRag, true);
  assert.equal(plan.useWeb, true);
  assert.equal(plan.forceWeb, true);
}

{
  const plan = planQuery({
    userMessage: 'Résume mes documents.',
    attachments: [{ name: 'brief.pdf', kind: 'pdf' }]
  });
  assert.equal(plan.useRag, true);
  assert.equal(plan.forceRag, true);
  assert.equal(plan.sourceBudget > 0, true);
}

{
  const a = planQuery({ userMessage: 'Compare mes documents projet avec le web actuel.', hasProjectDocuments: true });
  const b = planQuery({ userMessage: 'Compare mes documents projet avec le web actuel.', hasProjectDocuments: true });
  assert.deepEqual(a, b);
}

{
  const comparison = compareQueryPlannerWithLegacy({
    queryPlan: planQuery({ userMessage: 'Combien coûte Tavily aujourd’hui ?' }),
    legacyPlan: normalizeLegacyPlannerDecision({ useWeb: false, sourceBudget: 0 })
  });
  assert.equal(comparison.hasDivergence, true);
  assert.equal(comparison.divergences.some((d) => d.field === 'useWeb'), true);
}

console.log('queryPlanner.test.mjs OK');
