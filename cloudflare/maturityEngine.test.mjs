import assert from "node:assert/strict";
import {
  buildMaturityDashboardPayload,
  calculateDomainScores,
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

// Regression dediee (fixture isolee pour ne pas alterer le score du payload
// principal teste ci-dessus) : les vrais event_type emis par
// completionGuard.js (cf. GUARD_EVENT_TYPES) sont completion_truncated /
// completion_continued / completion_continuation_failed /
// completion_structure_closed — aucun ne contient le substring
// "completion_guard", seulement le prefixe "completion_". Couvre le bug de
// correspondance corrige (type.includes("completion_guard") ->
// type.startsWith("completion_")).
const completionGuardEvents = [
  {
    id: 101,
    event_type: "completion_truncated",
    meta: JSON.stringify({ initial_length: 1800, finish_reason: "length" }),
    created_at: "2026-06-27T10:04:00Z",
  },
  {
    id: 102,
    event_type: "completion_continued",
    meta: JSON.stringify({ continuations: 1 }),
    created_at: "2026-06-27T10:04:30Z",
  },
];
const completionGuardPayload = buildMaturityDashboardPayload({
  events: completionGuardEvents,
  tavilyUsage: {},
  ragUsage: {},
  aiState: {},
  services: [],
  documents: [],
  runtime: { dbConfigured: true, adminConfigured: true, conversationCount: 0, aiEventCount: completionGuardEvents.length },
});
const iaDomain = completionGuardPayload.scorecard.domains.find((domain) => domain.domain === "IA");
assert.equal(iaDomain.metrics.completion_guard_events, 2);
assert.deepEqual(calculateTrend(7.2, null), {
  trend: "non mesuré",
  delta: "n/a",
  delta_value: null,
  previous_score: null,
});

// ─── Regression dediee : Disponibilite / Qualite / Maturite separees ──────
// Couvre les 3 constats du rapport "le score IA tombe bas sur un 429/402",
// "Observabilite faible malgre beaucoup d'evenements reels", "Agents faible
// alors que les planners fonctionnent mais que les agents specialises ne
// sont pas developpes".

// 1. IA : un incident de quota fournisseur (credit_limit_count/rate_limit_count,
// le signal reel derriere un 429/402 cote OpenRouter) absorbe par un succes
// ne doit plus faire chuter la disponibilite IA comme un echec reel.
{
  const quotaEvents = [
    { id: 1, event_type: "openrouter_model_success", meta: JSON.stringify({ model: "m1" }), created_at: "2026-06-28T10:00:00Z" },
    { id: 2, event_type: "openrouter_model_success", meta: JSON.stringify({ model: "m1" }), created_at: "2026-06-28T10:00:10Z" },
    { id: 3, event_type: "openrouter_model_success", meta: JSON.stringify({ model: "m1" }), created_at: "2026-06-28T10:00:20Z" },
  ];
  const domains = calculateDomainScores({
    events: quotaEvents,
    aiState: {
      model_router: {
        success_rate_by_model: [{ model: "m1", attempts: 3, successes: 3, failures: 0 }],
        credit_limit_count: 5,
        rate_limit_count: 5,
        all_models_failed_count: 0,
      },
    },
    runtime: {},
  });
  const ia = domains.find((domain) => domain.domain === "IA");
  assert.equal(ia.availability_score, 10, "10 incidents de quota absorbes (succes 3/3 reel) ne doivent pas faire chuter la disponibilite IA");
  assert.equal(ia.metrics.quota_incidents, 10);
  assert.equal(ia.metrics.hard_failures, 0);
}

// 2. Observabilite : un volume d'evenements historiques tres important
// (runtime.aiEventCount) ne doit plus ecraser le score quand la fenetre
// analysee contient bel et bien des evenements reels.
{
  const observabilityEvents = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    event_type: "capability_detected",
    meta: "{}",
    created_at: `2026-06-28T10:${String(index).padStart(2, "0")}:00Z`,
  }));
  const domains = calculateDomainScores({
    events: observabilityEvents,
    aiState: {
      capability_planner: { analyses_count: 20, error_count: 0 },
    },
    // Volume historique cumule tres superieur a la fenetre analysee : avant
    // le correctif, ce ratio (20 / 50000) ecrasait le score a quasi 0.
    runtime: { aiEventCount: 50000 },
  });
  const observability = domains.find((domain) => domain.domain === "Observabilité");
  assert.equal(observability.availability_score, 10, "20 evenements reels dans la fenetre = telemetrie vivante, peu importe le total historique");
  assert.ok(observability.score >= 5, `score Observabilite ne doit plus etre ecrase par le total historique (obtenu ${observability.score})`);
}

// 3. Agents : la maturite doit rester null (aucun agent autonome specialise
// instrumente) sans penaliser le score des fondations (planners) qui, elles,
// fonctionnent reellement — et le statut doit le dire explicitement.
{
  const agentEvents = [
    { id: 1, event_type: "capability_plan_created", meta: "{}", created_at: "2026-06-28T10:00:00Z" },
    { id: 2, event_type: "execution_plan_applied", meta: "{}", created_at: "2026-06-28T10:00:10Z" },
  ];
  const domains = calculateDomainScores({
    events: agentEvents,
    aiState: {
      capability_planner: { analyses_count: 5, error_count: 0 },
      execution_planner: { plans_created_count: 5, applied_count: 5, error_count: 0 },
    },
    runtime: {},
  });
  const agents = domains.find((domain) => domain.domain === "Agents");
  assert.equal(agents.maturity_score, null, "aucune instrumentation d'agent autonome specialise n'existe : maturite non mesurable, jamais estimee a 0");
  assert.equal(agents.status, "not_developed");
  assert.equal(agents.availability_score, 10, "aucune erreur planner -> fondations disponibles");
  assert.equal(agents.quality_score, 10, "5/5 plans crees ont ete appliques -> qualite des fondations elevee");
  assert.equal(agents.score, 10, "la maturite null ne doit pas etre comptee comme un 0 et faire chuter le score des fondations operationnelles");
}

console.log("maturityEngine tests passed");
