import assert from 'node:assert/strict';
import { deduplicateKnowledgeResults, textSimilarity } from './knowledge/deduplication.js';

assert.ok(textSimilarity('Digital Blue Skye knowledge', 'Digital Blue Skye knowledge platform') > 0.5);
const { results, duplicates } = deduplicateKnowledgeResults([
  { text: 'Même contenu source', score: 0.4 },
  { text: 'Même contenu source', score: 0.9 }
]);
assert.equal(results.length, 1);
assert.equal(duplicates.length, 1);
