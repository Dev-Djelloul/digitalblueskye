import assert from 'node:assert/strict';
import { createKnowledgeSourceRegistry } from './knowledge/sourceRegistry.js';

const registry = createKnowledgeSourceRegistry([{ key: 'a', search: async () => [] }]);
assert.equal(registry.get('a').key, 'a');
assert.equal(registry.enabled(['a']).length, 1);
assert.equal(registry.enabled(['b']).length, 0);
assert.equal(registry.register({ key: 'b' }), true);
assert.equal(registry.list().length, 2);
