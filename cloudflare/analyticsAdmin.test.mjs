import assert from "node:assert/strict";
import {
  analyticsEventCategory,
  buildAnalyticsKpis,
  buildAnalyticsActivitySeries,
  buildAnalyticsSessionsPerDay,
  classifyUserAgent,
  buildAnalyticsDeviceDistribution,
  buildAnalyticsMessageDistribution,
  buildAnalyticsResponseTime,
  buildAnalyticsHeatmap,
  buildAnalyticsEventDistribution,
  buildAnalyticsModelDistribution,
  buildAnalyticsIntentions,
  buildAnalyticsRealtime,
} from "./worker-api.js";

// --- aucune donnée -----------------------------------------------------------

{
  const kpis = buildAnalyticsKpis([]);
  assert.equal(kpis.sessions_total, 0);
  assert.equal(kpis.success_rate, null, "non mesuré attendu sans événement");
  assert.equal(kpis.rag_usage_rate, null);
}

{
  assert.deepEqual(buildAnalyticsActivitySeries([]), [], "aucune série simulée sans événement");
  assert.deepEqual(buildAnalyticsSessionsPerDay([]), []);
  assert.deepEqual(buildAnalyticsDeviceDistribution([]), []);
  assert.deepEqual(buildAnalyticsMessageDistribution([]), []);
  assert.deepEqual(buildAnalyticsEventDistribution([]), []);
  assert.deepEqual(buildAnalyticsModelDistribution([]), []);
  assert.deepEqual(buildAnalyticsIntentions([]), []);
  assert.deepEqual(buildAnalyticsRealtime([]), []);
}

{
  const rt = buildAnalyticsResponseTime([]);
  assert.deepEqual(rt.series, []);
  assert.equal(rt.average_latency_ms, null);
  assert.equal(rt.sample_size, 0);
}

{
  const heatmap = buildAnalyticsHeatmap([]);
  assert.equal(heatmap.has_data, false);
  assert.deepEqual(heatmap.matrix, [], "aucune heatmap générée sans événement");
}

// --- classification user_agent réelle, pas de catégorie inventée -----------

{
  assert.equal(classifyUserAgent(""), "non mesuré");
  assert.equal(classifyUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS)"), "Mobile");
  assert.equal(classifyUserAgent("Mozilla/5.0 (iPad; CPU OS)"), "Tablet");
  assert.equal(classifyUserAgent("curl/8.0.1"), "API / Script");
  assert.equal(classifyUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Desktop");
}

// --- événements réels --------------------------------------------------------

const now = "2026-06-28T14:00:00.000Z";
const realRows = [
  { event_type: "user_message", session_id: "s1", created_at: now, user_agent: "Mozilla/5.0 (Windows NT 10.0)" },
  { event_type: "assistant_response", session_id: "s1", created_at: now, user_agent: "Mozilla/5.0 (Windows NT 10.0)" },
  { event_type: "rag_query", session_id: "s1", created_at: now },
  { event_type: "rag_match", session_id: "s1", created_at: now },
  { event_type: "web_search_success", session_id: "s2", created_at: now, user_agent: "Mozilla/5.0 (iPhone)" },
  { event_type: "openrouter_model_success", session_id: "s1", created_at: now, meta: JSON.stringify({ resolved_model: "gpt-4o", latency_ms: 1200 }) },
];

{
  const kpis = buildAnalyticsKpis(realRows);
  assert.equal(kpis.sessions_total, 2);
  assert.equal(kpis.messages_sent, 1);
  assert.equal(kpis.assistant_responses, 1);
  assert.equal(kpis.rag_usage_rate, 100);
  assert.equal(kpis.success_rate, 100);
}

{
  const activity = buildAnalyticsActivitySeries(realRows, 30);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].date, now.slice(0, 10));
  assert.equal(activity[0].messages, 1);
  assert.equal(activity[0].responses, 1);
  assert.equal(activity[0].rag_queries, 1);
  assert.equal(activity[0].web_searches, 1);
}

{
  const sessions = buildAnalyticsSessionsPerDay(realRows, 30);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessions, 2);
}

{
  const devices = buildAnalyticsDeviceDistribution(realRows);
  assert.ok(devices.some((d) => d.label === "Desktop"));
  assert.ok(devices.some((d) => d.label === "Mobile"));
}

{
  const messages = buildAnalyticsMessageDistribution(realRows);
  assert.ok(messages.some((m) => m.label === "Messages"));
  assert.ok(messages.some((m) => m.label === "RAG"));
}

{
  assert.equal(analyticsEventCategory("user_message"), "Messages");
  assert.equal(analyticsEventCategory("rag_query"), "RAG");
  assert.equal(analyticsEventCategory("export_completed"), "Exports");
  assert.equal(analyticsEventCategory("unknown_type"), "Autres");
}

{
  const rt = buildAnalyticsResponseTime(realRows, 30);
  assert.equal(rt.sample_size, 1);
  assert.equal(rt.average_latency_ms, 1200);
  assert.equal(rt.series[0].average_latency_ms, 1200);
}

{
  const models = buildAnalyticsModelDistribution(realRows);
  assert.equal(models.length, 1);
  assert.equal(models[0].label, "gpt-4o");
  assert.equal(models[0].value, 1);
}

{
  const heatmap = buildAnalyticsHeatmap(realRows);
  assert.equal(heatmap.has_data, true);
  const total = heatmap.matrix.flat().reduce((a, b) => a + b, 0);
  assert.equal(total, realRows.length);
}

{
  const realtime = buildAnalyticsRealtime(realRows, 3);
  assert.equal(realtime.length, 3);
  assert.equal(realtime[0].event_type, "user_message");
}

console.log("analyticsAdmin.test.mjs: all assertions passed");
