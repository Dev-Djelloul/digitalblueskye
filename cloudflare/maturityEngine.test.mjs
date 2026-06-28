import assert from "node:assert/strict";
import {
  buildMaturityDashboardPayload,
  calculateTrend,
} from "./maturityEngine.js";

const events = [
  {
    id: 1,
    event_type: "openrouter_model_success",
    meta: JSON.stringify({ model: "test-model", latency_ms: 900 }),
    created_at: "2026-06-27T10:00:00Z",
  },
  {
    id: 2,
    event_type: "response_quality_final_sent",
    meta: JSON.stringify({ score: 92, grade: "A" }),
    created_at: "2026-06-27T10:01:00Z",
  },
  {
    id: 3,
    event_type: "web_search_success",
    meta: JSON.stringify({ latency_ms: 280, citations_count: 3 }),
    created_at: "2026-06-27T10:02:00Z",
  },
  {
    id: 4,
    event_type: "execution_plan_applied",
    meta: JSON.stringify({ primaryGoal: "answer" }),
    created_at: "2026-06-27T10:03:00Z",
  },
];

const payload = buildMaturityDashboardPayload({
  events,
  tavilyUsage: {
    searches_executed: 1,
    cache_hit_count: 1,
    cache_miss_count: 1,
    searches_avoided_deduplication: 1,
    average_latency_ms: 280,
    cache_hit_rate: 50,
    deduplication_rate: 50,
  },
  ragUsage: {
    searches_performed: 1,
    match_rate: 100,
    contexts_used: 1,
    project_rag_active: true,
  },
  aiState: {
    model_router: {
      success_rate_by_model: [{ model: "test-model", attempts: 1, successes: 1, failures: 0 }],
    },
    response_quality: {
      average_score: 92,
      analyzed_count: 1,
      last_grade: "A",
    },
    prompt_orchestrator: { intents_detected: 1, error_count: 0 },
    capability_planner: { analyses_count: 1, error_count: 0 },
    source_planner: { analyses_count: 1, error_count: 0, last_forbid_unsupported_numbers: true },
    execution_planner: { plans_created_count: 1, applied_count: 1, error_count: 0 },
  },
  services: [{ name: "Netlify frontend", status: "operational" }],
  documents: [{ format: "PDF", status: "supported" }],
  runtime: {
    dbConfigured: true,
    adminConfigured: true,
    conversationCount: 1,
    aiEventCount: events.length,
  },
});

assert.equal(payload.scorecard.domains.length, 8);
assert.equal(payload.scorecard.domains.some((domain) => domain.domain === "IA"), true);
assert.equal(payload.scorecard.domains.some((domain) => domain.domain === "Recherche Web"), true);
assert.equal(Number.isFinite(payload.maturity.score), true);
assert.equal(payload.maturity.score > 0, true);
assert.equal(payload.scorecard.delta_since_last_audit, "0");
assert.deepEqual(calculateTrend(7.2, null), {
  trend: "non mesuré",
  delta: "n/a",
  delta_value: null,
  previous_score: null,
});

console.log("maturityEngine tests passed");
