import assert from "node:assert/strict";
import {
  buildCapabilityPlannerStatsFromEvents,
  buildSourcePlannerStatsFromEvents,
  buildExecutionPlannerStatsFromEvents,
  buildToolPlannerStatsFromEvents,
  buildPromptOrchestratorStatsFromEvents,
  buildResponseQualityStatsFromEvents,
  buildCompletionGuardStatsFromEvents,
} from "./worker-api.js";

// Rows minimales (meta vide "{}") reproduisant exactement le constat de
// production : ai_state.*.{analyses_count,plans_created_count,
// intents_detected,analyzed_count} a 0 alors que les event_type existent.
// Avec meta = "{}", aucun champ avance (last_*, breakdowns...) ne peut etre
// derive — seuls les compteurs fondamentaux bases sur event_type doivent
// rester non nuls.
const rows = [
  { event_type: "capability_detected", meta: "{}", created_at: "2026-06-28T10:00:00Z" },
  { event_type: "capability_plan_created", meta: "{}", created_at: "2026-06-28T10:00:01Z" },
  { event_type: "source_plan_created", meta: "{}", created_at: "2026-06-28T10:00:02Z" },
  { event_type: "execution_plan_resolved", meta: "{}", created_at: "2026-06-28T10:00:03Z" },
  { event_type: "execution_plan_applied", meta: "{}", created_at: "2026-06-28T10:00:04Z" },
  { event_type: "tool_plan_created", meta: "{}", created_at: "2026-06-28T10:00:05Z" },
  { event_type: "prompt_intent_detected", meta: "{}", created_at: "2026-06-28T10:00:06Z" },
  { event_type: "response_quality_analyzed", meta: "{}", created_at: "2026-06-28T10:00:07Z" },
  { event_type: "completion_truncated", meta: "{}", created_at: "2026-06-28T10:00:08Z" },
  { event_type: "completion_continued", meta: "{}", created_at: "2026-06-28T10:00:09Z" },
];

// 1. capability_planner.analyses_count : pas de "capability_detected" direct
// dans ce jeu (si si, il y en a un) -> doit etre >= 1 via le signal primaire.
{
  const stats = buildCapabilityPlannerStatsFromEvents(rows);
  assert.equal(stats.analyses_count, 1, "capability_detected present -> analyses_count = 1");
}

// 1b. Repli : si capability_detected est absent mais capability_plan_created
// existe, analyses_count ne doit jamais retomber a 0.
{
  const onlyPlanCreated = rows.filter((row) => row.event_type !== "capability_detected");
  const stats = buildCapabilityPlannerStatsFromEvents(onlyPlanCreated);
  assert.equal(stats.analyses_count, 1, "repli sur capability_plan_created si capability_detected absent");
}

// 2. source_planner.analyses_count : seul source_plan_created est present
// dans le jeu (pas de source_evidence_detected) -> doit utiliser le repli.
{
  const stats = buildSourcePlannerStatsFromEvents(rows);
  assert.equal(stats.analyses_count, 1, "repli sur source_plan_created si source_evidence_detected absent");
}

// 3. execution_planner.plans_created_count : doit compter
// execution_plan_resolved (BUG CORRIGE : comptait avant execution_intent_built,
// absent de ce jeu, ce qui aurait donne 0).
{
  const stats = buildExecutionPlannerStatsFromEvents(rows);
  assert.equal(stats.plans_created_count, 1, "plans_created_count doit compter execution_plan_resolved");
  assert.equal(stats.applied_count, 1, "applied_count doit compter execution_plan_applied");
}

// 4. tool_planner.plans_created_count : doit compter tool_plan_created
// (BUG CORRIGE : comptait avant tool_needs_detected, absent de ce jeu, ce
// qui aurait donne 0).
{
  const stats = buildToolPlannerStatsFromEvents(rows);
  assert.equal(stats.plans_created_count, 1, "plans_created_count doit compter tool_plan_created");
}

// 5. prompt_orchestrator.intents_detected (deja correct avant ce lot, non
// regresse).
{
  const stats = buildPromptOrchestratorStatsFromEvents(rows);
  assert.equal(stats.intents_detected, 1);
}

// 6. response_quality.analyzed_count (deja correct avant ce lot, non
// regresse).
{
  const stats = buildResponseQualityStatsFromEvents(rows);
  assert.equal(stats.analyzed_count, 1);
}

// 7. completion_guard.truncated_count / continued_count (deja corrects
// depuis le lot precedent, non regresses).
{
  const stats = buildCompletionGuardStatsFromEvents(rows);
  assert.equal(stats.truncated_count, 1);
  assert.equal(stats.continued_count, 1);
}

// 8. Cas vide honnete : aucun event -> tous les compteurs fondamentaux a 0,
// jamais une valeur fabriquee.
{
  assert.equal(buildCapabilityPlannerStatsFromEvents([]).analyses_count, 0);
  assert.equal(buildSourcePlannerStatsFromEvents([]).analyses_count, 0);
  assert.equal(buildExecutionPlannerStatsFromEvents([]).plans_created_count, 0);
  assert.equal(buildToolPlannerStatsFromEvents([]).plans_created_count, 0);
  assert.equal(buildPromptOrchestratorStatsFromEvents([]).intents_detected, 0);
  assert.equal(buildResponseQualityStatsFromEvents([]).analyzed_count, 0);
  assert.equal(buildCompletionGuardStatsFromEvents([]).truncated_count, 0);
}

console.log("plannerBuildersCounters.test.mjs: all assertions passed");
