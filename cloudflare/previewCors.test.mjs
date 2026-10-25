import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authOptionsResponse, handleAuthRoutes } from './auth.js';
import apiWorker from './worker-api.js';

const previewOrigin = 'https://deploy-preview-1--digitalblueskye.netlify.app';

function makeRequest(path, method = 'GET') {
  return new Request(`https://api.test${path}`, {
    method,
    headers: { Origin: previewOrigin }
  });
}

test('API CORS allows only the configured preview origin', async () => {
  const request = makeRequest('/backend/comments.php', 'OPTIONS');
  const allowed = await apiWorker.fetch(request, { PREVIEW_ALLOWED_ORIGIN: previewOrigin });
  const denied = await apiWorker.fetch(request, {});

  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), previewOrigin);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('auth routes allow the configured preview origin', async () => {
  const request = makeRequest('/auth/providers');
  const url = new URL(request.url);
  const allowed = await handleAuthRoutes(request, { PREVIEW_ALLOWED_ORIGIN: previewOrigin }, url);
  const denied = await handleAuthRoutes(request, {}, url);

  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), previewOrigin);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('auth preflight allows the configured preview origin', () => {
  const response = authOptionsResponse(makeRequest('/auth/providers', 'OPTIONS'), {
    PREVIEW_ALLOWED_ORIGIN: previewOrigin
  });

  assert.equal(response.headers.get('Access-Control-Allow-Origin'), previewOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
});
