import assert from 'node:assert/strict';
import { createTavilyKnowledgeSource } from './knowledge/sources/tavilySource.js';

const source = createTavilyKnowledgeSource({ searchFn: async () => ({ results: [{ title: 'A', link: 'https://a.test', snippet: 'Snippet' }] }) });
const results = await source.search({ TAVILY_API_KEY: 'x' }, 'query');
assert.equal(results.length, 1);
assert.equal(results[0].source, 'tavily');
