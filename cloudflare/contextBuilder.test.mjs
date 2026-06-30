import assert from 'node:assert/strict';
import { buildKnowledgeContext } from './knowledge/contextBuilder.js';

const result = buildKnowledgeContext({
  query: 'test',
  tokenBudget: 200,
  results: [{ source: 'obsidian', documentId: 'd1', chunkId: 'c1', title: 'Note', text: 'Contenu utile', score: 0.9, confidence: 0.8 }]
});
assert.match(result.contextBlock, /K1/);
assert.equal(result.citations.length, 1);
assert.equal(result.confidence, 0.8);
