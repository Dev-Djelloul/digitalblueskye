import assert from "node:assert/strict";
import {
  plannerEventTypesSqlClause,
  fetchPlannerEventsWindow,
  buildPlannerEventsDebugInfo,
} from "./worker-api.js";

// 1. plannerEventTypesSqlClause() doit couvrir exactement les 7 prefixes
// attendus, joints par OR, dans cet ordre.
{
  const clause = plannerEventTypesSqlClause();
  const expected = [
    "event_type LIKE 'capability_%'",
    "event_type LIKE 'source_%'",
    "event_type LIKE 'execution_%'",
    "event_type LIKE 'tool_%'",
    "event_type LIKE 'prompt_%'",
    "event_type LIKE 'response_quality_%'",
    "event_type LIKE 'completion_%'",
  ].join(" OR ");
  assert.equal(clause, expected, "clause SQL exacte attendue");
  assert.equal((clause.match(/ OR /g) || []).length, 6, "6 OR pour 7 clauses LIKE");
}

// 2. fetchPlannerEventsWindow() avec un mock D1 : verifie que la requete
// prepare() recoit bien la clause WHERE generee par plannerEventTypesSqlClause(),
// que LIMIT est bind() avec la valeur demandee, et que les lignes retournees
// par all() ressortent inchangees.
{
  const mockRows = [
    { id: 3, event_type: "capability_detected", event_value: "", meta: "{}", created_at: "2026-06-28T10:02:00Z" },
    { id: 2, event_type: "prompt_intent_detected", event_value: "", meta: "{}", created_at: "2026-06-28T10:01:00Z" },
    { id: 1, event_type: "source_evidence_detected", event_value: "", meta: "{}", created_at: "2026-06-28T10:00:00Z" },
  ];

  let capturedSql = null;
  let capturedLimit = null;
  const mockEnv = {
    DB: {
      prepare(sql) {
        capturedSql = sql;
        return {
          bind(limit) {
            capturedLimit = limit;
            return {
              async all() {
                return { results: mockRows };
              },
            };
          },
        };
      },
    },
  };

  const rows = await fetchPlannerEventsWindow(mockEnv, 500);

  assert.ok(capturedSql.includes(plannerEventTypesSqlClause()), "la requete SQL doit contenir la clause WHERE des planners");
  assert.ok(capturedSql.includes("FROM ai_assistant_events"), "doit interroger ai_assistant_events");
  assert.ok(capturedSql.includes("ORDER BY created_at DESC, id DESC"), "doit trier par recence");
  assert.equal(capturedLimit, 500, "LIMIT doit etre bind() avec la valeur demandee");
  assert.deepEqual(rows, mockRows, "les lignes doivent ressortir inchangees");
}

// 2b. fetchPlannerEventsWindow() doit renvoyer [] (jamais throw/undefined)
// si all() ne renvoie aucun resultat (table vide ou requete sans match).
{
  const mockEnv = {
    DB: {
      prepare() {
        return { bind() { return { async all() { return { results: null }; } }; } };
      },
    },
  };
  const rows = await fetchPlannerEventsWindow(mockEnv, 500);
  assert.deepEqual(rows, []);
}

// 3. buildPlannerEventsDebugInfo() : count/event_types/latest_at/sample
// corrects, et sample ne doit jamais exposer meta (uniquement event_type +
// created_at), conformement a la demande "jamais meta complet".
{
  const rows = [
    { id: 5, event_type: "capability_detected", meta: "{\"secret\":\"should_not_leak\"}", created_at: "2026-06-28T10:05:00Z" },
    { id: 4, event_type: "capability_plan_created", meta: "{\"secret\":\"should_not_leak\"}", created_at: "2026-06-28T10:04:00Z" },
    { id: 3, event_type: "source_evidence_detected", meta: "{}", created_at: "2026-06-28T10:03:00Z" },
    { id: 2, event_type: "tool_needs_detected", meta: "{}", created_at: "2026-06-28T10:02:00Z" },
    { id: 1, event_type: "prompt_intent_detected", meta: "{}", created_at: "2026-06-28T10:01:00Z" },
    { id: 0, event_type: "prompt_intent_detected", meta: "{}", created_at: "2026-06-28T10:00:00Z" },
  ];

  const debugInfo = buildPlannerEventsDebugInfo(rows);

  assert.equal(debugInfo.count, 6);
  assert.deepEqual(
    [...debugInfo.event_types].sort(),
    ["capability_detected", "capability_plan_created", "prompt_intent_detected", "source_evidence_detected", "tool_needs_detected"].sort(),
    "event_types doit etre la liste unique des event_type presents"
  );
  assert.equal(debugInfo.latest_at, "2026-06-28T10:05:00Z", "latest_at doit etre le max(created_at)");
  assert.equal(debugInfo.sample.length, 5, "sample limite a 5 entrees");
  debugInfo.sample.forEach((entry) => {
    assert.deepEqual(Object.keys(entry).sort(), ["created_at", "event_type"], "sample ne doit jamais contenir meta");
  });
  assert.equal(debugInfo.sample[0].event_type, "capability_detected");
  assert.equal(debugInfo.sample[0].created_at, "2026-06-28T10:05:00Z");
}

// 3b. Cas vide : aucun event planner -> debug honnete, pas de valeur fabriquee.
{
  const debugInfo = buildPlannerEventsDebugInfo([]);
  assert.equal(debugInfo.count, 0);
  assert.deepEqual(debugInfo.event_types, []);
  assert.equal(debugInfo.latest_at, null);
  assert.deepEqual(debugInfo.sample, []);
}

console.log("plannerEventsWindow.test.mjs: all assertions passed");
