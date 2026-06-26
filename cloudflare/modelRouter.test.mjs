import { routeChatCompletion } from './modelRouter.js';

function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

const baseEnv = { OPENROUTER_API_KEY: 'test-key' };
const events = [];
const onEvent = (type, payload) => events.push({ type, payload });

function commonArgs(fetchImpl) {
  events.length = 0;
  return {
    messages: [{ role: 'user', content: 'Bonjour' }],
    systemPrompt: 'system',
    env: baseEnv,
    metadata: { language: 'fr' },
    onEvent,
    fetchImpl
  };
}

async function scenarioPrimaryOk() {
  const fetchImpl = async () => fakeResponse(200, { model: 'google/gemini-2.5-flash-lite', choices: [{ message: { content: 'Reponse OK' } }] });
  const result = await routeChatCompletion(commonArgs(fetchImpl));
  console.assert(result.ok === true, 'scenario1: should succeed');
  console.assert(result.model === 'google/gemini-2.5-flash-lite', 'scenario1: should use primary model');
  console.log('scenario1 (modele principal OK):', result.ok, result.model);
}

async function scenario429ThenFallback() {
  let call = 0;
  const fetchImpl = async (url, opts) => {
    call += 1;
    const model = JSON.parse(opts.body).model;
    if (model === 'google/gemini-2.5-flash-lite') return fakeResponse(429, { error: { message: 'free-models-per-day limit' } });
    return fakeResponse(200, { model, choices: [{ message: { content: 'Reponse fallback' } }] });
  };
  const result = await routeChatCompletion(commonArgs(fetchImpl));
  console.assert(result.ok === true, 'scenario2: should eventually succeed');
  console.assert(result.model !== 'google/gemini-2.5-flash-lite', 'scenario2: should have moved to next model');
  console.log('scenario2 (429 puis fallback):', result.ok, result.model, 'calls=', call);
}

async function scenario402ThenReducedTokens() {
  const fetchImpl = async (url, opts) => {
    const payload = JSON.parse(opts.body);
    if (payload.max_tokens === 700) return fakeResponse(402, { error: { message: 'This request requires more credits, or fewer max_tokens. You can only afford 400.' } });
    return fakeResponse(200, { model: payload.model, choices: [{ message: { content: 'Reponse a tokens reduits' } }] });
  };
  const result = await routeChatCompletion(commonArgs(fetchImpl));
  console.assert(result.ok === true, 'scenario3: should succeed at reduced tokens');
  console.assert(result.tokensRequested < 700, 'scenario3: tokens should be reduced');
  const retryEvent = events.find((e) => e.type === 'openrouter_retry_reduced_tokens');
  console.assert(Boolean(retryEvent), 'scenario3: should log retry_reduced_tokens');
  console.log('scenario3 (402 puis reduction tokens):', result.ok, 'tokens=', result.tokensRequested);
}

async function scenarioAllModelsFail() {
  const fetchImpl = async () => fakeResponse(429, { error: { message: 'free-models-per-day limit' } });
  const result = await routeChatCompletion(commonArgs(fetchImpl));
  console.assert(result.ok === false, 'scenario4: should fail');
  console.assert(typeof result.userMessage === 'string' && result.userMessage.length > 0, 'scenario4: should have userMessage');
  const allFailedEvent = events.find((e) => e.type === 'openrouter_all_models_failed');
  console.assert(Boolean(allFailedEvent), 'scenario4: should log all_models_failed');
  console.log('scenario4 (tous modeles KO):', result.ok, result.errorType, '-', result.userMessage.slice(0, 40) + '...');
}

async function scenarioCloudflareAiFallback() {
  const fetchImpl = async () => fakeResponse(429, { error: { message: 'free-models-per-day limit' } });
  const args = commonArgs(fetchImpl);
  args.env = { ...baseEnv, AI: { run: async () => ({ response: 'Reponse Cloudflare AI' }) } };
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'scenario6: should succeed via Cloudflare AI');
  console.assert(result.provider === 'cloudflare_ai', 'scenario6: provider should be cloudflare_ai');
  const successEvent = events.find((e) => e.type === 'cloudflare_ai_success');
  console.assert(Boolean(successEvent), 'scenario6: should log cloudflare_ai_success');
  console.log('scenario6 (fallback Cloudflare AI apres echec OpenRouter):', result.ok, result.provider, result.model);
}

async function scenarioLowOpenRouterCreditShortCircuitsToCloudflareAi() {
  let openRouterCalls = 0;
  let cloudflareAiMaxTokens = 0;
  const fetchImpl = async () => {
    openRouterCalls += 1;
    return fakeResponse(402, {
      error: {
        message: 'This request requires more credits, or fewer max_tokens. You requested up to 700 tokens, but can only afford 50.'
      }
    });
  };
  const args = commonArgs(fetchImpl);
  args.cloudflareAiMaxTokens = 1600;
  args.env = {
    ...baseEnv,
    AI: {
      run: async (model, payload) => {
        cloudflareAiMaxTokens = payload.max_tokens;
        return { response: 'Reponse Cloudflare AI apres credit bas' };
      }
    }
  };
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'scenario6b: should succeed via Cloudflare AI');
  console.assert(result.provider === 'cloudflare_ai', 'scenario6b: provider should be cloudflare_ai');
  console.assert(openRouterCalls === 1, 'scenario6b: should not cascade OpenRouter when account credit is exhausted');
  console.assert(cloudflareAiMaxTokens === 1600, 'scenario6b: should use dedicated Cloudflare AI token budget');
  const failed = events.find((e) => e.type === 'openrouter_model_failed');
  console.assert(failed?.payload?.affordable_tokens === 50, 'scenario6b: should log affordable token count');
  const allFailed = events.find((e) => e.type === 'openrouter_all_models_failed');
  console.assert(allFailed?.payload?.credit_exhausted === true, 'scenario6b: should log credit_exhausted');
  console.log('scenario6b (credit OpenRouter bas -> Cloudflare AI direct):', result.ok, result.provider, 'openrouterCalls=', openRouterCalls);
}

async function scenarioCloudflareAiUnavailable() {
  const fetchImpl = async () => fakeResponse(429, { error: { message: 'free-models-per-day limit' } });
  const args = commonArgs(fetchImpl);
  args.env = { ...baseEnv }; // pas de binding AI (ex. Workers Paid pas active)
  const result = await routeChatCompletion(args);
  console.assert(result.ok === false, 'scenario7: should still fail cleanly without AI binding');
  console.assert(result.provider === 'openrouter', 'scenario7: provider in failure stays openrouter');
  const failedEvent = events.find((e) => e.type === 'cloudflare_ai_failed');
  console.assert(failedEvent?.payload?.error_type === 'provider_unavailable', 'scenario7: should log provider_unavailable');
  console.log('scenario7 (Cloudflare AI indisponible, echec propre):', result.ok, result.errorType);
}

async function scenarioCloudflareAiModelCascade() {
  const fetchImpl = async () => fakeResponse(429, { error: { message: 'free-models-per-day limit' } });
  const args = commonArgs(fetchImpl);
  let aiCallCount = 0;
  args.env = {
    ...baseEnv,
    AI: {
      run: async (model) => {
        aiCallCount += 1;
        if (model === '@cf/meta/llama-3.1-8b-instruct') {
          const err = new Error('3001: model not found in catalog');
          err.name = 'AiError';
          throw err;
        }
        return { response: `Reponse de ${model}` };
      }
    }
  };
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'scenario8: should succeed on second Cloudflare AI model');
  console.assert(result.model === '@cf/meta/llama-3.2-3b-instruct', 'scenario8: should have moved to second model');
  console.assert(aiCallCount === 2, 'scenario8: should have tried exactly 2 models');
  const failedFirst = events.find((e) => e.type === 'cloudflare_ai_failed');
  console.assert(failedFirst?.payload?.error_detail?.name === 'AiError', 'scenario8: should capture error name in error_detail');
  console.log('scenario8 (cascade modeles Cloudflare AI):', result.ok, result.model, 'error_detail.name=', failedFirst?.payload?.error_detail?.name);
}

async function scenarioInvalidModelExcluded() {
  const envWithInvalid = { ...baseEnv, OPENROUTER_MODEL: 'not-a-valid-model-id', OPENROUTER_FALLBACK_MODELS: 'google/gemini-2.5-flash-lite' };
  const fetchImpl = async (url, opts) => {
    const payload = JSON.parse(opts.body);
    return fakeResponse(200, { model: payload.model, choices: [{ message: { content: 'ok' } }] });
  };
  const args = commonArgs(fetchImpl);
  args.env = envWithInvalid;
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'scenario5: should succeed with valid fallback');
  console.assert(result.model === 'google/gemini-2.5-flash-lite', 'scenario5: invalid model should be skipped');
  const invalidEvent = events.find((e) => e.type === 'model_invalid');
  console.assert(Boolean(invalidEvent), 'scenario5: should log model_invalid');
  console.log('scenario5 (modele invalide exclu):', result.ok, result.model);
}

async function scenarioCompletionGuardContinues() {
  // 1er appel : tronque (finish_reason length) avec un bloc de code ouvert.
  // 2e appel (continuation) : termine (stop) et ferme le code.
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    if (call === 1) {
      return fakeResponse(200, {
        model: 'google/gemini-2.5-flash-lite',
        choices: [{ message: { content: 'Introduction détaillée. '.repeat(12) + '\n```js\nconst x = 1;' }, finish_reason: 'length' }]
      });
    }
    return fakeResponse(200, {
      model: 'google/gemini-2.5-flash-lite',
      choices: [{ message: { content: '\nconst y = 2;\n```\nFin.' }, finish_reason: 'stop' }]
    });
  };
  const result = await routeChatCompletion(commonArgs(fetchImpl));
  console.assert(result.ok === true, 'guard: should succeed');
  console.assert(call === 2, 'guard: should have made exactly 1 continuation call');
  console.assert(result.completionGuard?.continuations === 1, 'guard: should report 1 continuation');
  console.assert(result.content.includes('const x = 1;') && result.content.includes('const y = 2;'), 'guard: should merge both parts');
  console.assert(!result.content.includes('Voici un exemple :\nVoici'), 'guard: should not duplicate');
  console.log('scenario9 (completion guard continue + fusionne):', result.completionGuard?.continuations, 'continuation(s), longueur=', result.content.length);
}

async function scenarioCompletionGuardClosesWhenExhausted() {
  // Toujours tronque -> apres maxContinuations (2 par defaut), ferme le code fence.
  const fetchImpl = async () => fakeResponse(200, {
    model: 'google/gemini-2.5-flash-lite',
    choices: [{ message: { content: 'x'.repeat(220) + '\n```js\nconst a = 1;' }, finish_reason: 'length' }]
  });
  const result = await routeChatCompletion(commonArgs(fetchImpl));
  console.assert(result.ok === true, 'guard-exhaust: should succeed');
  console.assert(result.completionGuard?.continuations === 2, 'guard-exhaust: should stop at 2 continuations');
  console.assert(result.completionGuard?.still_truncated === true, 'guard-exhaust: still truncated flagged');
  console.assert(result.content.trim().endsWith('```'), 'guard-exhaust: should close the code fence');
  console.log('scenario10 (guard borne + ferme structure):', result.completionGuard?.continuations, 'continuation(s), fence fermee=', result.content.trim().endsWith('```'));
}

async function scenarioCompletionGuardDisabled() {
  const fetchImpl = async () => fakeResponse(200, {
    model: 'google/gemini-2.5-flash-lite',
    choices: [{ message: { content: 'x'.repeat(220) + '\n```js\nconst a = 1;' }, finish_reason: 'length' }]
  });
  const args = commonArgs(fetchImpl);
  args.env = { ...baseEnv, COMPLETION_GUARD_ENABLED: 'false' };
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'guard-off: should succeed');
  console.assert(result.completionGuard === null, 'guard-off: no guard meta');
  console.assert(!result.content.trim().endsWith('```'), 'guard-off: no structure closing');
  console.log('scenario11 (guard desactive via env):', result.completionGuard);
}

// --- Lot 6 : Dynamic Model Selection (preferredModelTier) ---

async function scenarioFastTierUsesCloudflareAiFirst() {
  let openRouterCalled = false;
  const fetchImpl = async () => { openRouterCalled = true; return fakeResponse(200, { choices: [{ message: { content: 'ne devrait pas etre appele' } }] }); };
  const args = commonArgs(fetchImpl);
  args.env = { ...baseEnv, AI: { run: async () => ({ response: 'Reponse rapide Cloudflare AI' }) } };
  args.modelTier = 'fast';
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'lot6-scenario1: should succeed');
  console.assert(result.provider === 'cloudflare_ai', 'lot6-scenario1: fast tier should prefer Cloudflare AI');
  console.assert(openRouterCalled === false, 'lot6-scenario1: OpenRouter should not be called when fast+CloudflareAI succeeds');
  const requested = events.find((e) => e.type === 'model_tier_requested');
  const used = events.find((e) => e.type === 'model_tier_used');
  console.assert(requested?.payload?.tier === 'fast', 'lot6-scenario1: should log model_tier_requested=fast');
  console.assert(used?.payload?.tier_used === 'fast' && used?.payload?.success === true, 'lot6-scenario1: should log model_tier_used=fast/success');
  console.log('lot6-scenario1 (fast -> Cloudflare AI direct):', result.ok, result.provider);
}

async function scenarioStrongTierPrioritizesStrongModel() {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    return fakeResponse(200, { model: body.model, choices: [{ message: { content: 'Reponse OK' } }] });
  };
  const args = commonArgs(fetchImpl);
  args.modelTier = 'strong';
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'lot6-scenario2: should succeed');
  console.assert(['qwen/qwen3-30b-a3b', 'mistralai/mistral-small-3.2-24b-instruct'].includes(result.model), 'lot6-scenario2: strong tier should try a strong model first');
  const used = events.find((e) => e.type === 'model_tier_used');
  console.assert(used?.payload?.tier_used === 'strong', 'lot6-scenario2: should infer tier_used=strong');
  console.log('lot6-scenario2 (strong -> modele robuste priorise):', result.ok, result.model);
}

async function scenarioBalancedTierUsesStandardChain() {
  const fetchImpl = async () => fakeResponse(200, { model: 'google/gemini-2.5-flash-lite', choices: [{ message: { content: 'Reponse OK' } }] });
  const args = commonArgs(fetchImpl);
  args.modelTier = 'balanced';
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'lot6-scenario3: should succeed');
  console.assert(result.model === 'google/gemini-2.5-flash-lite', 'lot6-scenario3: balanced tier keeps standard chain order');
  console.log('lot6-scenario3 (balanced -> chaine standard):', result.ok, result.model);
}

async function scenarioStrongModelFailsFallsBackToBalancedThenCloudflareAi() {
  // Tous les modeles OpenRouter (y compris la strong reordonnee et openrouter/auto)
  // echouent en 429 -> doit retomber sur Cloudflare AI, fallback complet conserve.
  const fetchImpl = async () => fakeResponse(429, { error: { message: 'free-models-per-day limit' } });
  const args = commonArgs(fetchImpl);
  args.env = { ...baseEnv, AI: { run: async () => ({ response: 'Reponse de secours Cloudflare AI' }) } };
  args.modelTier = 'strong';
  const result = await routeChatCompletion(args);
  console.assert(result.ok === true, 'lot6-scenario4: should still succeed via Cloudflare AI fallback');
  console.assert(result.provider === 'cloudflare_ai', 'lot6-scenario4: should fall back to cloudflare_ai when strong model KO');
  const usedEvent = events.find((e) => e.type === 'model_tier_used');
  console.assert(usedEvent?.payload?.tier_requested === 'strong', 'lot6-scenario4: tier_requested should remain strong');
  console.assert(usedEvent?.payload?.tier_used === 'fast', 'lot6-scenario4: tier_used should reflect actual cloudflare_ai (fast)');
  console.log('lot6-scenario4 (strong KO -> fallback Cloudflare AI):', result.ok, result.provider);
}

async function run() {
  await scenarioPrimaryOk();
  await scenario429ThenFallback();
  await scenario402ThenReducedTokens();
  await scenarioAllModelsFail();
  await scenarioCloudflareAiFallback();
  await scenarioLowOpenRouterCreditShortCircuitsToCloudflareAi();
  await scenarioCloudflareAiUnavailable();
  await scenarioCloudflareAiModelCascade();
  await scenarioInvalidModelExcluded();
  await scenarioCompletionGuardContinues();
  await scenarioCompletionGuardClosesWhenExhausted();
  await scenarioCompletionGuardDisabled();
  await scenarioFastTierUsesCloudflareAiFirst();
  await scenarioStrongTierPrioritizesStrongModel();
  await scenarioBalancedTierUsesStandardChain();
  await scenarioStrongModelFailsFallsBackToBalancedThenCloudflareAi();
  console.log('\nTous les scenarios ont ete executes (voir asserts ci-dessus pour les echecs).');
}

run();
