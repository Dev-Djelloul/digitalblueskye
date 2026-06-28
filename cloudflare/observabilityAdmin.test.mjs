import assert from "node:assert/strict";
import {
  buildSingleServiceHealth,
  buildServiceHealth,
  buildObservabilityKpis,
  observabilitySeverity,
  buildRealtimeLogs,
  buildRealtimeAlerts,
  buildSystemEvents,
  buildErrorDistribution,
  buildRequestsPerMinute,
  buildServiceLatencySeries,
  buildServiceErrorRateSeries,
  buildResourceUsage,
} from "./worker-api.js";
import { computeServiceHealthScore } from "./serviceHealth.js";

// --- module partagé serviceHealth.js : aucune donnée -> non configuré ------

{
  const health = computeServiceHealthScore({});
  assert.equal(health.status, "not_configured");
  assert.equal(health.score, null);
  assert.equal(health.availability_percent, null);
}

{
  const health = computeServiceHealthScore({ totalRequests: 100, errorCount: 0, lastActivityAt: new Date().toISOString() });
  assert.equal(health.status, "operational");
  assert.equal(health.availability_percent, 100);
}

{
  const health = computeServiceHealthScore({ totalRequests: 10, errorCount: 8, lastActivityAt: new Date().toISOString() });
  assert.equal(health.status, "unavailable");
}

// --- aucun événement -> aucun service avec données fabriquées --------------

{
  const services = buildServiceHealth([]);
  assert.ok(services.length > 0, "la liste des services candidats existe");
  services.forEach((s) => {
    assert.equal(s.status, "not_configured", `${s.label} doit être non_configuré sans événement`);
    assert.equal(s.score, null);
  });
}

{
  const kpis = buildObservabilityKpis([], buildServiceHealth([]));
  assert.equal(kpis.global_status, "not_configured");
  assert.equal(kpis.global_score, null);
  assert.equal(kpis.total_requests, 0);
}

{
  assert.deepEqual(buildRealtimeLogs([]), [], "aucun log généré sans événement");
  assert.deepEqual(buildRealtimeAlerts([], []), [], "aucune alerte simulée sans erreur réelle");
  assert.deepEqual(buildRequestsPerMinute([]).filter((b) => b.requests > 0), [], "aucune requête fabriquée");
}

{
  const events = buildSystemEvents([]);
  assert.equal(events.total, 0);
  assert.deepEqual(events.by_severity, []);
}

{
  const resources = buildResourceUsage();
  assert.equal(resources.cpu_percent, null);
  assert.equal(resources.status, "non_mesure");
}

// --- classification de sévérité réelle --------------------------------------

{
  assert.equal(observabilitySeverity("openrouter_model_failed"), "error");
  assert.equal(observabilitySeverity("web_search_skipped"), "warning");
  assert.equal(observabilitySeverity("rag_match"), "info");
}

// --- événements réels : service opérationnel --------------------------------

const now = "2026-06-28T15:00:00.000Z";
const realRows = [
  { event_type: "openrouter_model_success", created_at: now, meta: JSON.stringify({ latency_ms: 500 }) },
  { event_type: "openrouter_model_success", created_at: now, meta: JSON.stringify({ latency_ms: 700 }) },
  { event_type: "web_search_success", created_at: now, meta: JSON.stringify({ latency_ms: 300 }) },
  { event_type: "web_search_error", created_at: now },
];

{
  const services = buildServiceHealth(realRows);
  const aiWorker = services.find((s) => s.key === "ai_worker");
  assert.equal(aiWorker.status, "operational");
  assert.equal(aiWorker.total_requests, 2);
  assert.equal(aiWorker.average_latency_ms, 600);

  const tavily = services.find((s) => s.key === "tavily");
  assert.equal(tavily.total_requests, 2);
  assert.equal(tavily.error_count, 1);
}

{
  const services = buildServiceHealth(realRows);
  const alerts = buildRealtimeAlerts(realRows, services);
  // 1 erreur tavily sur l'heure < seuil "élevée" (5) -> alerte "Moyenne" réelle
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "Moyenne");
  assert.equal(alerts[0].service, "Recherche Web (Tavily)");
}

{
  const services = buildServiceHealth(realRows);
  const dist = buildErrorDistribution(realRows, services);
  assert.equal(dist.total_errors, 1);
  assert.equal(dist.by_service[0].label, "Recherche Web (Tavily)");
}

{
  const logs = buildRealtimeLogs(realRows, 10);
  assert.equal(logs.length, 4);
  assert.equal(logs.find((l) => l.event_type === "web_search_error").level, "ERROR");
}

{
  const latency = buildServiceLatencySeries(realRows, 30);
  const aiLatency = latency.find((l) => l.service === "AI Worker (OpenRouter)");
  assert.equal(aiLatency.series[0].average_latency_ms, 600);
}

{
  const errorRate = buildServiceErrorRateSeries(realRows, 30);
  const tavilyRate = errorRate.find((l) => l.service === "Recherche Web (Tavily)");
  assert.equal(tavilyRate.series[0].error_rate_percent, 50);
}

console.log("observabilityAdmin.test.mjs: all assertions passed");
