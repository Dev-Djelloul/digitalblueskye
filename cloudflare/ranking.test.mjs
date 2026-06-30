import assert from 'node:assert/strict';
import { rankKnowledgeResults, sourceReliability } from './knowledge/ranking.js';

assert.ok(sourceReliability('obsidian') > sourceReliability('tavily'));
const ranked = rankKnowledgeResults([
  { source: 'tavily', text: 'a', score: 0.2 },
  { source: 'obsidian', text: 'b', score: 0.9 }
]);
assert.equal(ranked[0].source, 'obsidian');
