import assert from 'node:assert/strict';
import { detectKnowledgeConflicts } from './knowledge/conflictResolver.js';

const conflicts = detectKnowledgeConflicts([
  { source: 'obsidian', documentId: 'a', text: 'Le connecteur Obsidian est activé et disponible.' },
  { source: 'rag', documentId: 'b', text: 'Le connecteur Obsidian est désactivé et impossible.' }
]);
assert.equal(conflicts.length, 1);
