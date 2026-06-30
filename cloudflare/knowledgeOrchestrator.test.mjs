import assert from 'node:assert/strict';
import { createKnowledgeSourceRegistry } from './knowledge/sourceRegistry.js';
import { runKnowledgeOrchestrator } from './knowledge/knowledgeOrchestrator.js';

const registry = createKnowledgeSourceRegistry([
  {
    key: 'fake',
    search: async () => [{ source: 'fake', documentId: 'd', chunkId: 'c', title: 'Doc', text: 'Digital Blue Skye Studio knowledge', score: 0.9 }],
    semanticSearch: async () => []
  }
]);
const result = await runKnowledgeOrchestrator({}, registry, { query: 'knowledge', sources: ['fake'], tokenBudget: 500 });
assert.equal(result.ok, true);
assert.equal(result.citations.length, 1);
assert.equal(result.telemetry.chunks_selected, 1);
