import assert from 'node:assert/strict';
import { buildKnowledgeDebugSnapshot, isKnowledgeDebugEnabled } from './worker-openrouter.js';

// isKnowledgeDebugEnabled --------------------------------------------------

assert.equal(isKnowledgeDebugEnabled({}), false, 'no DEBUG var -> disabled');
assert.equal(isKnowledgeDebugEnabled({ DEBUG: 'false' }), false, 'DEBUG=false -> disabled');
assert.equal(isKnowledgeDebugEnabled({ DEBUG: 'true' }), true, 'DEBUG=true -> enabled');
assert.equal(isKnowledgeDebugEnabled({ DEBUG: '1' }), true, 'DEBUG=1 -> enabled');

// buildKnowledgeDebugSnapshot ----------------------------------------------

{
  const result = {
    confidence: 0.82,
    conflicts: [{ type: 'possible_conflict' }],
    telemetry: {
      sources_requested: ['rag', 'project_memory'],
      sources_queried: [
        { source: 'rag', ok: true, results_count: 3, latency_ms: 120 },
        { source: 'project_memory', ok: true, results_count: 1, latency_ms: 5 }
      ],
      chunks_selected: 4,
      token_budget: 4000,
      token_budget_used: 1200,
      duplicates_removed: 2,
      latency_ms: 150
    }
  };
  const snapshot = buildKnowledgeDebugSnapshot(result);
  assert.equal(snapshot.sources_selected.length, 2);
  assert.equal(snapshot.sources_queried.length, 2);
  assert.equal(snapshot.sources_queried[0].source, 'rag');
  assert.equal(snapshot.confidence, 0.82);
  assert.equal(snapshot.chunks_selected, 4);
  assert.equal(snapshot.token_budget, 4000);
  assert.equal(snapshot.token_budget_used, 1200);
  assert.equal(snapshot.duplicates_removed, 2);
  assert.equal(snapshot.conflicts_detected, 1);
  assert.equal(snapshot.total_latency_ms, 150);
  assert.ok(typeof snapshot.captured_at === 'string');

  // No internal text/content should ever leak into the debug snapshot.
  assert.equal(JSON.stringify(snapshot).includes('contextBlock'), false);
}

{
  // Null/failed orchestrator result must not throw.
  const snapshot = buildKnowledgeDebugSnapshot(null);
  assert.deepEqual(snapshot.sources_selected, []);
  assert.deepEqual(snapshot.sources_queried, []);
  assert.equal(snapshot.confidence, null);
  assert.equal(snapshot.conflicts_detected, 0);
}

console.log('knowledgeDebugTelemetry.test.mjs: all assertions passed');
