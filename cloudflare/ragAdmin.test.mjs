import assert from "node:assert/strict";
import {
  buildRagSearchStats,
  buildRagHealth,
  buildRagCoverage,
  buildRagFreshness,
  buildRagErrors,
  buildRagActivitySeries,
  isRagErrorEventType,
} from "./worker-api.js";

// --- aucune source / aucune donnée -----------------------------------------

{
  const coverage = buildRagCoverage(0, 0);
  assert.equal(coverage.coverage_rate, null);
  assert.equal(coverage.label, "aucune source indexée");
}

{
  const freshness = buildRagFreshness(null, null);
  assert.equal(freshness.label, "aucune donnée récente");
  assert.equal(freshness.last_indexed_at, null);
}

{
  const searches = buildRagSearchStats([]);
  assert.equal(searches.searches_performed, 0);
  assert.equal(searches.match_rate, null, "non mesuré attendu sans recherche");
}

{
  const health = buildRagHealth([], 0, 0);
  assert.equal(health.status, "not_configured");
}

// --- événements rag_query / rag_match réels --------------------------------

const now = "2026-06-27T10:00:00.000Z";
const realEvents = [
  { event_type: "rag_query", created_at: now, meta: JSON.stringify({ vector_search: true, duration_ms: 120, projectName: "voyage-crete" }) },
  { event_type: "rag_match", created_at: now, meta: JSON.stringify({ top_score: 0.91 }) },
  { event_type: "rag_no_match", created_at: now, meta: JSON.stringify({}) },
  { event_type: "rag_context_used", created_at: now, meta: JSON.stringify({ documentId: "doc-1", documentName: "Guide Crète" }) },
];

{
  const searches = buildRagSearchStats(realEvents);
  assert.equal(searches.searches_performed, 1);
  assert.equal(searches.matches, 1);
  assert.equal(searches.no_matches, 1);
  assert.equal(searches.match_rate, 100);
  assert.equal(searches.top_sources_cited[0].name, "Guide Crète");
  assert.equal(searches.top_projects_queried[0].name, "voyage-crete");
}

{
  const health = buildRagHealth(realEvents, 3, 10);
  assert.equal(health.status, "operational");
  assert.equal(health.engine, "vectorize");
}

// --- erreurs rag_* => statut dégradé/erreur --------------------------------

{
  assert.equal(isRagErrorEventType("rag_index_failed"), true);
  assert.equal(isRagErrorEventType("rag_query"), false);
  assert.equal(isRagErrorEventType("openrouter_error"), false);
}

const eventsWithErrors = [
  { event_type: "rag_query", created_at: now, meta: JSON.stringify({ vector_search: true }) },
  { event_type: "rag_index_failed", created_at: now, event_value: "index_failed", session_id: "s1" },
];

{
  const health = buildRagHealth(eventsWithErrors, 1, 1);
  assert.equal(health.status, "degraded");
}

{
  const errors = buildRagErrors(eventsWithErrors);
  assert.equal(errors.total_error_count, 1);
  assert.equal(errors.status, "des_erreurs_recentes");
  assert.equal(errors.recent[0].type, "rag_index_failed");
}

{
  const errors = buildRagErrors([{ event_type: "rag_query", created_at: now }]);
  assert.equal(errors.total_error_count, 0);
  assert.equal(errors.status, "aucune_erreur_recente");
}

// --- chunks présents => affichage réel (pas de génération) -----------------

{
  const activity = buildRagActivitySeries(realEvents, 30);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].date, now.slice(0, 10));
  assert.equal(activity[0].queries, 1);
  assert.equal(activity[0].matches, 1);
  assert.equal(activity[0].no_matches, 1);
}

{
  const activity = buildRagActivitySeries([]);
  assert.deepEqual(activity, [], "aucune activité simulée si aucun événement");
}

console.log("ragAdmin.test.mjs: all assertions passed");
