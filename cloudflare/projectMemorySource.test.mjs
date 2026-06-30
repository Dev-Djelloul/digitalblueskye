import assert from 'node:assert/strict';
import { createProjectMemoryKnowledgeSource } from './knowledge/sources/projectMemorySource.js';

const source = createProjectMemoryKnowledgeSource();
const results = await source.search({}, 'query', { projectContext: { projectId: 'p1', memory: 'Mémoire durable' } });
assert.equal(results.length, 1);
assert.equal(results[0].documentId, 'p1');
