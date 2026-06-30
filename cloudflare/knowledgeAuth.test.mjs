import assert from 'node:assert/strict';
import { getKnowledgeAuthStatus, handleKnowledgeRoute } from './worker-openrouter.js';

function makeRequest(method, pathOrUrl, { headers = {}, body } = {}) {
  return new Request(`https://worker.test${pathOrUrl}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

// getKnowledgeAuthStatus -------------------------------------------------

{
  const request = makeRequest('POST', '/knowledge/index');
  assert.equal(getKnowledgeAuthStatus(request, { ADMIN_TOKEN: 'secret' }), 401, 'no Authorization header -> 401');
}

{
  const request = makeRequest('POST', '/knowledge/index', { headers: { Authorization: 'Bearer wrong' } });
  assert.equal(getKnowledgeAuthStatus(request, { ADMIN_TOKEN: 'secret' }), 403, 'wrong token -> 403');
}

{
  const request = makeRequest('POST', '/knowledge/index', { headers: { Authorization: 'Bearer secret' } });
  assert.equal(getKnowledgeAuthStatus(request, { ADMIN_TOKEN: 'secret' }), 0, 'ADMIN_TOKEN match -> authorized');
}

{
  const request = makeRequest('POST', '/knowledge/index', { headers: { Authorization: 'Bearer k-secret' } });
  assert.equal(
    getKnowledgeAuthStatus(request, { ADMIN_TOKEN: 'secret', KNOWLEDGE_ADMIN_TOKEN: 'k-secret' }),
    0,
    'KNOWLEDGE_ADMIN_TOKEN match -> authorized'
  );
}

// handleKnowledgeRoute -----------------------------------------------------

{
  const url = new URL('https://worker.test/knowledge/index');
  const request = makeRequest('POST', '/knowledge/index', { body: { vault: [] } });
  const result = await handleKnowledgeRoute(request, { ADMIN_TOKEN: 'secret' }, url, { vault: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unauthorized');
  assert.equal(result.status, 401);
}

{
  const url = new URL('https://worker.test/knowledge/refresh');
  const request = makeRequest('POST', '/knowledge/refresh', { headers: { Authorization: 'Bearer wrong' } });
  const result = await handleKnowledgeRoute(request, { ADMIN_TOKEN: 'secret' }, url, {});
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
  assert.equal(result.status, 403);
}

{
  const url = new URL('https://worker.test/knowledge/document/abc');
  const request = makeRequest('GET', '/knowledge/document/abc');
  const result = await handleKnowledgeRoute(request, { ADMIN_TOKEN: 'secret' }, url);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unauthorized');
  assert.equal(result.status, 401);
}

{
  // Payload too large for /knowledge/index, even with a valid token.
  const url = new URL('https://worker.test/knowledge/index');
  const request = makeRequest('POST', '/knowledge/index', { headers: { Authorization: 'Bearer secret' } });
  const hugeBody = { content: 'x'.repeat(3 * 1024 * 1024) };
  const rawBodyText = JSON.stringify(hugeBody);
  const result = await handleKnowledgeRoute(
    request,
    { ADMIN_TOKEN: 'secret', KNOWLEDGE_OBSIDIAN_ENABLED: 'true' },
    url,
    hugeBody,
    rawBodyText
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'payload_too_large');
  assert.equal(result.status, 413);
}

{
  // /knowledge/query stays reachable without auth, but refuses when the orchestrator flag is off,
  // and rejects oversized queries to avoid abuse even when enabled.
  const url = new URL('https://worker.test/knowledge/query');
  const request = makeRequest('POST', '/knowledge/query', { body: { query: 'hello' } });
  const result = await handleKnowledgeRoute(request, {}, url, { query: 'hello' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'knowledge_orchestrator_disabled');
  assert.equal(result.status, 403);
}

{
  const url = new URL('https://worker.test/knowledge/query');
  const request = makeRequest('POST', '/knowledge/query');
  const tooLongQuery = 'a'.repeat(2001);
  const result = await handleKnowledgeRoute(
    request,
    { KNOWLEDGE_ORCHESTRATOR_ENABLED: 'true' },
    url,
    { query: tooLongQuery }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'query_too_long');
  assert.equal(result.status, 400);
}

console.log('knowledgeAuth.test.mjs: all assertions passed');
