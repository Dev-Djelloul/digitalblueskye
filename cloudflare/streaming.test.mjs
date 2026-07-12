// Tests du chemin streaming SSE : routeChatCompletionStream (modelRouter.js)
// + createOpenRouterSseRelay (worker-openrouter.js). Meme style que les autres
// tests du dossier : node cloudflare/streaming.test.mjs, console.assert.
import { routeChatCompletionStream } from './modelRouter.js';
import { createOpenRouterSseRelay } from './worker-openrouter.js';

const baseEnv = { OPENROUTER_API_KEY: 'test-key' };
const events = [];
const onEvent = (type, payload) => events.push({ type, payload });

function sseBody(lines) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    }
  });
}

function fakeStreamResponse(lines) {
  return { ok: true, status: 200, body: sseBody(lines) };
}

function fakeErrorResponse(status, body) {
  return { ok: false, status, body: null, text: async () => JSON.stringify(body) };
}

async function readAllRelayEvents(readable) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5).trim()));
}

// ── 1. Ouverture de flux OK sur le premier modele ─────────────────────────
async function scenarioStreamOk() {
  events.length = 0;
  const fetchImpl = async (url, opts) => {
    const payload = JSON.parse(opts.body);
    console.assert(payload.stream === true, 'stream1: la requete doit demander stream:true');
    console.assert(payload.max_tokens === 2000, 'stream1: premiere tentative au budget complet (2000)');
    return fakeStreamResponse(['data: {"choices":[{"delta":{"content":"Bonjour"}}]}\n\n']);
  };
  const result = await routeChatCompletionStream({
    messages: [{ role: 'user', content: 'Bonjour' }],
    systemPrompt: 'system',
    env: baseEnv,
    metadata: { language: 'fr' },
    onEvent,
    fetchImpl
  });
  console.assert(result.ok === true, 'stream1: doit reussir');
  console.assert(Boolean(result.body), 'stream1: doit exposer le body du flux');
  console.log('stream1 (ouverture flux OK):', result.ok, result.model);
}

// ── 2. 429 sur le premier modele, flux ouvert sur le second ───────────────
async function scenarioStreamFallbackModel() {
  events.length = 0;
  const fetchImpl = async (url, opts) => {
    const model = JSON.parse(opts.body).model;
    if (model === 'anthropic/claude-haiku-4.5' || model === 'google/gemini-2.5-flash-lite') {
      return fakeErrorResponse(429, { error: { message: 'rate limit' } });
    }
    return fakeStreamResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']);
  };
  const result = await routeChatCompletionStream({
    messages: [{ role: 'user', content: 'Bonjour' }],
    systemPrompt: 'system',
    env: baseEnv,
    metadata: { language: 'fr' },
    onEvent,
    fetchImpl
  });
  console.assert(result.ok === true, 'stream2: doit finir par ouvrir un flux');
  console.assert(result.attempts.length >= 1, 'stream2: doit journaliser les echecs');
  console.log('stream2 (fallback de modele):', result.ok, result.model, 'echecs=', result.attempts.length);
}

// ── 3. Tous les modeles en echec → ok:false (l'appelant repasse en JSON) ──
async function scenarioStreamAllFail() {
  events.length = 0;
  const fetchImpl = async () => fakeErrorResponse(429, { error: { message: 'rate limit' } });
  const result = await routeChatCompletionStream({
    messages: [{ role: 'user', content: 'Bonjour' }],
    systemPrompt: 'system',
    env: baseEnv,
    metadata: { language: 'fr' },
    onEvent,
    fetchImpl
  });
  console.assert(result.ok === false, 'stream3: doit echouer proprement');
  console.assert(result.errorType === 'rate_limit', 'stream3: doit remonter le type d erreur');
  console.log('stream3 (tous modeles KO):', result.ok, result.errorType);
}

// ── 4. Relais SSE : meta -> deltas -> done, texte accumule, usage capture ──
async function scenarioRelayTransform() {
  let completed = null;
  const upstreamBody = sseBody([
    ': OPENROUTER PROCESSING\n\n',
    'data: {"choices":[{"delta":{"content":"Bonjour "}}]}\n\n',
    // Chunk SSE coupe en plein milieu d une ligne (cas reel de framing TCP) :
    'data: {"choices":[{"delta":{"content":"le mon',
    'de"}}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":42}}\n\n',
    'data: [DONE]\n\n'
  ]);
  const { readable } = createOpenRouterSseRelay({
    upstreamBody,
    metaPayload: { model: 'anthropic/claude-haiku-4.5', web_search_performed: false },
    onComplete: (info) => { completed = info; }
  });
  const relayEvents = await readAllRelayEvents(readable);
  console.assert(relayEvents[0]?.type === 'meta', 'relay: premier evenement = meta');
  console.assert(relayEvents[0]?.model === 'anthropic/claude-haiku-4.5', 'relay: meta porte le modele');
  const deltas = relayEvents.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  console.assert(deltas === 'Bonjour le monde', `relay: texte accumule correct (recu: "${deltas}")`);
  const done = relayEvents.find((e) => e.type === 'done');
  console.assert(done?.reply_length === 'Bonjour le monde'.length, 'relay: done.reply_length correct');
  console.assert(done?.finish_reason === 'stop', 'relay: finish_reason capture');
  console.assert(done?.usage?.total_tokens === 42, 'relay: usage capture');
  console.assert(completed?.fullText === 'Bonjour le monde', 'relay: onComplete recoit le texte complet');
  console.log('relay (transformation SSE):', deltas, '| done:', JSON.stringify(done));
}

// ── 5. Relais SSE : erreur upstream signalee en cours de flux ─────────────
async function scenarioRelayUpstreamError() {
  const upstreamBody = sseBody([
    'data: {"choices":[{"delta":{"content":"Debut"}}]}\n\n',
    'data: {"error":{"message":"upstream exploded"}}\n\n'
  ]);
  const { readable } = createOpenRouterSseRelay({ upstreamBody, metaPayload: {} });
  const relayEvents = await readAllRelayEvents(readable);
  const errorEvent = relayEvents.find((e) => e.type === 'error');
  console.assert(Boolean(errorEvent), 'relay-err: doit relayer un evenement error');
  console.assert(errorEvent.message.includes('upstream exploded'), 'relay-err: message transmis');
  const done = relayEvents.find((e) => e.type === 'done');
  console.assert(done?.reply_length === 'Debut'.length, 'relay-err: le texte partiel reste comptabilise');
  console.log('relay-err (erreur upstream):', errorEvent?.message, '| partiel:', done?.reply_length);
}

await scenarioStreamOk();
await scenarioStreamFallbackModel();
await scenarioStreamAllFail();
await scenarioRelayTransform();
await scenarioRelayUpstreamError();
console.log('Tous les scenarios streaming ont ete executes (voir asserts ci-dessus pour les echecs).');
