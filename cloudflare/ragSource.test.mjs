import assert from 'node:assert/strict';
import { createRagKnowledgeSource } from './knowledge/sources/ragSource.js';

const source = createRagKnowledgeSource();
assert.equal(source.key, 'rag');
const health = await source.health({});
assert.equal(health.status, 'unavailable');
