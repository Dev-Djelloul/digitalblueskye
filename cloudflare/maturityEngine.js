function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function roundPercent(value) {
  return Math.round(Number(value || 0) * 1000) / 10;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function parseMeta(row) {
  if (!row?.meta) return {};
  if (typeof row.meta === "object") return row.meta;
  try {
    const parsed = JSON.parse(row.meta);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function countEvents(rows, matcher) {
  return rows.filter((row) => matcher(String(row?.event_type || ""), parseMeta(row), row)).length;
}

function eventText(row) {
  return [row?.event_type, row?.event_value, row?.meta]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function scoreRate(success, total) {
  if (!total) return null;
  return clamp((success / total) * 10, 0, 10);
}

function scoreInverseRate(failures, total) {
  if (!total) return null;
  return clamp((1 - failures / total) * 10, 0, 10);
}

function scoreLatency(latencyMs, targetMs, maxMs) {
  const value = Number(latencyMs);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= targetMs) return 10;
  if (value >= maxMs) return 0;
  return clamp(10 - ((value - targetMs) / (maxMs - targetMs)) * 10, 0, 10);
}

function scorePresence(count, expectedCount) {
  if (!count) return null;
  return clamp((Number(count) / expectedCount) * 10, 0, 10);
}

function combineSignals(signals) {
  const usable = signals.filter((item) => Number.isFinite(Number(item?.score)) && Number(item?.weight || 0) > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, item) => sum + Number(item.weight), 0);
  const total = usable.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return roundOne(total / totalWeight);
}

function calculateDynamicWeight(score, evidenceCount) {
  const scoreValue = Number(score);
  if (!Number.isFinite(scoreValue)) return 0;
  return Math.max(1, Math.log10(Math.max(1, Number(evidenceCount || 0)) + 1));
}

function calculateSuccessRate(success, total) {
  if (!total) return null;
  return roundPercent(success / total);
}

function calculateDomainScores(input = {}) {
  const rows = Array.isArray(input.events) ? input.events : [];
  const tavilyUsage = input.tavilyUsage || {};
  const ragUsage = input.ragUsage || {};
  const aiState = input.aiState || {};
  const services = Array.isArray(input.services) ? input.services : [];
  const statistics = input.statistics || {};
  const checks = input.checks || {};
  const runtime = input.runtime || {};

  const modelRouter = aiState.model_router || {};
  const responseQuality = aiState.response_quality || {};
  const promptOrchestrator = aiState.prompt_orchestrator || {};
  const capabilityPlanner = aiState.capability_planner || {};
  const sourcePlanner = aiState.source_planner || {};
  const executionPlanner = aiState.execution_planner || {};

  const openRouterAttempts = (modelRouter.success_rate_by_model || []).reduce((sum, item) => sum + Number(item.attempts || 0), 0);
  const openRouterSuccesses = (modelRouter.success_rate_by_model || []).reduce((sum, item) => sum + Number(item.successes || 0), 0);
  const cloudflareAiAttempts = Number(modelRouter.cloudflare_ai_attempts || 0);
  const cloudflareAiSuccesses = Number(modelRouter.cloudflare_ai_successes || 0);
  const aiSuccesses = openRouterSuccesses + cloudflareAiSuccesses + countEvents(rows, (type) => type === "assistant_response" || type === "openrouter_response");
  const aiFailures = Number(modelRouter.all_models_failed_count || 0)
    + Number(modelRouter.credit_limit_count || 0)
    + Number(modelRouter.cloudflare_ai_failures || 0)
    + countEvents(rows, (type) => type.includes("error") && (type.includes("openrouter") || type.includes("cloudflare_ai") || type.includes("assistant")));
  const aiAttempts = openRouterAttempts + cloudflareAiAttempts + aiSuccesses + aiFailures;
  const rqcAverage = Number(responseQuality.recent_24h_average_score ?? responseQuality.average_score);
  const completionGuardSignals = countEvents(rows, (type) => type.includes("completion_guard"));
  const interruptions = countEvents(rows, (type, meta, row) => {
    const text = eventText(row);
    return text.includes("interrupted") || text.includes("truncated") || text.includes("max_tokens") || meta.finish_reason === "length";
  });
  const aiLatency = Number(statistics.average_response_ms ?? aiState.average_latency_ms ?? checks.openrouter?.latency_ms ?? 0);
  const aiScore = combineSignals([
    { score: scoreRate(aiSuccesses, aiAttempts), weight: aiAttempts },
    { score: Number.isFinite(rqcAverage) ? clamp(rqcAverage / 10, 0, 10) : null, weight: Number(responseQuality.analyzed_count || 0) || 1 },
    { score: scoreInverseRate(interruptions, aiSuccesses + interruptions), weight: aiSuccesses + interruptions },
    { score: scoreLatency(aiLatency, 1200, 8000), weight: aiLatency ? 1 : 0 },
    { score: scorePresence(completionGuardSignals, Math.max(1, aiAttempts)), weight: completionGuardSignals },
  ]);

  const webExecuted = Number(tavilyUsage.searches_executed || 0);
  const webErrors = countEvents(rows, (type) => type === "web_search_error");
  const webSuccess = webExecuted;
  const citations = countEvents(rows, (type, meta) => type.includes("citation") || Number(meta.citations_count || meta.sources_count || 0) > 0);
  const forcedSearches = Number(sourcePlanner.web_forced_count || 0) + countEvents(rows, (type) => type === "source_web_forced");
  const cacheHit = Number(tavilyUsage.cache_hit_count ?? tavilyUsage.searches_avoided_cache ?? 0);
  const cacheMiss = Number(tavilyUsage.cache_miss_count ?? webExecuted);
  const dedupe = Number(tavilyUsage.searches_avoided_deduplication || 0);
  const webScore = combineSignals([
    { score: scoreRate(webSuccess, webSuccess + webErrors), weight: webSuccess + webErrors },
    { score: scoreLatency(tavilyUsage.average_latency_ms, 350, 3500), weight: webSuccess },
    { score: scorePresence(cacheHit + dedupe, Math.max(1, cacheMiss)), weight: cacheHit + dedupe },
    { score: scorePresence(citations, Math.max(1, webSuccess)), weight: citations },
    { score: forcedSearches ? 10 : null, weight: forcedSearches },
  ]);

  const documentEventRows = rows.filter((row) => /(pdf|docx|xlsx|csv|html|markdown|export|renderer|ast)/i.test(eventText(row)));
  const documentErrors = documentEventRows.filter((row) => /error|failed|exception/i.test(eventText(row))).length;
  const exportsCount = countEvents(rows, (type) => type.includes("export"));
  const rendererAst = countEvents(rows, (type, meta, row) => eventText(row).includes("ast") || eventText(row).includes("renderer"));
  const documentCounters = Number(runtime.pdfCount || 0) + Number(runtime.docxCount || 0) + Number(runtime.xlsxCount || 0);
  const documentEvidence = documentEventRows.length + documentCounters;
  const usedDocumentFormats = [
    Number(runtime.pdfCount || 0) > 0 || documentEventRows.some((row) => eventText(row).includes("pdf")),
    Number(runtime.docxCount || 0) > 0 || documentEventRows.some((row) => eventText(row).includes("docx")),
    Number(runtime.xlsxCount || 0) > 0 || documentEventRows.some((row) => eventText(row).includes("xlsx")),
    documentEventRows.some((row) => eventText(row).includes("html")),
    documentEventRows.some((row) => eventText(row).includes("markdown")),
  ].filter(Boolean).length;
  const documentScore = combineSignals([
    { score: scoreInverseRate(documentErrors, documentEvidence), weight: documentEvidence },
    { score: scorePresence(exportsCount, documentEvidence || exportsCount), weight: exportsCount },
    { score: scorePresence(rendererAst, documentEvidence || rendererAst), weight: rendererAst },
    { score: scorePresence(usedDocumentFormats, documentEvidence || usedDocumentFormats), weight: usedDocumentFormats },
  ]);

  const memorySignals = Number(runtime.conversationCount || 0)
    + Number(ragUsage.searches_performed || 0)
    + countEvents(rows, (type, meta, row) => /memory|history|summary|conversation|context/i.test(eventText(row)) || Boolean(meta.summary || meta.context_length));
  const memoryErrors = countEvents(rows, (type, meta, row) => /memory|history|summary|conversation|context|rag/i.test(eventText(row)) && /error|failed/i.test(eventText(row)));
  const memoryScore = combineSignals([
    { score: scorePresence(runtime.conversationCount, Math.max(1, runtime.aiEventCount || runtime.conversationCount || 0)), weight: Number(runtime.conversationCount || 0) },
    { score: ragUsage.searches_performed ? clamp(Number(ragUsage.match_rate || 0) / 10, 0, 10) : null, weight: Number(ragUsage.searches_performed || 0) },
    { score: scoreInverseRate(memoryErrors, memorySignals), weight: memorySignals },
    { score: Number(ragUsage.contexts_used || 0) ? 10 : null, weight: Number(ragUsage.contexts_used || 0) },
  ]);

  const uxService = services.find((service) => /netlify|frontend/i.test(service.name || ""));
  const uxEvents = rows.filter((row) => /markdown|renderer|ast|scroll|export|frontend|ui|ux|js_error|javascript/i.test(eventText(row)));
  const uxErrors = uxEvents.filter((row) => /error|failed|exception/i.test(eventText(row))).length;
  const uxScore = combineSignals([
    { score: uxService ? (uxService.status === "operational" ? 10 : uxService.status === "partial" ? 5 : 0) : null, weight: uxService ? 1 : 0 },
    { score: scoreInverseRate(uxErrors, uxEvents.length), weight: uxEvents.length },
    { score: scorePresence(rendererAst, uxEvents.length || rendererAst), weight: rendererAst },
    { score: scorePresence(exportsCount, uxEvents.length || exportsCount), weight: exportsCount },
  ]);

  const securityEvents = rows.filter((row) => /guard|policy|token|auth|consent|unsupported|forbid|security|moderation/i.test(eventText(row)));
  const securityFailures = securityEvents.filter((row) => /error|failed|unauthorized|unsupported/i.test(eventText(row))).length
    + (runtime.dbConfigured ? 0 : 1)
    + (runtime.adminConfigured ? 0 : 1);
  const configuredChecks = [runtime.dbConfigured, runtime.adminConfigured].filter(Boolean).length;
  const securityScore = combineSignals([
    { score: scoreRate(configuredChecks, 2), weight: 2 },
    { score: scoreInverseRate(securityFailures, securityEvents.length + securityFailures), weight: securityEvents.length + securityFailures },
    { score: Number(sourcePlanner.last_forbid_unsupported_numbers) ? 10 : null, weight: Number(sourcePlanner.analyses_count || 0) },
  ]);

  const plannerAnalyses = Number(promptOrchestrator.intents_detected || 0)
    + Number(capabilityPlanner.analyses_count || 0)
    + Number(sourcePlanner.analyses_count || 0)
    + Number(executionPlanner.plans_created_count || 0);
  const plannerErrors = Number(promptOrchestrator.error_count || 0)
    + Number(capabilityPlanner.error_count || 0)
    + Number(sourcePlanner.error_count || 0)
    + Number(executionPlanner.error_count || 0);
  const observabilityEvents = rows.length + plannerAnalyses + Number(responseQuality.analyzed_count || 0);
  const observabilityScore = combineSignals([
    { score: scoreInverseRate(plannerErrors, plannerAnalyses + plannerErrors), weight: plannerAnalyses + plannerErrors },
    { score: scorePresence(observabilityEvents, Math.max(1, runtime.aiEventCount || observabilityEvents)), weight: observabilityEvents },
    { score: responseQuality.analyzed_count ? 10 : null, weight: Number(responseQuality.analyzed_count || 0) },
    { score: modelRouter.success_rate_by_model?.length ? 10 : null, weight: openRouterAttempts + cloudflareAiAttempts },
  ]);

  const agentEvents = rows.filter((row) => /agent|tool|pipeline|planner|orchestrator|capability|execution/i.test(eventText(row)));
  const agentErrors = agentEvents.filter((row) => /error|failed/i.test(eventText(row))).length;
  const appliedPlans = Number(executionPlanner.applied_count || 0);
  const agentScore = combineSignals([
    { score: scoreInverseRate(agentErrors, agentEvents.length), weight: agentEvents.length },
    { score: scorePresence(appliedPlans, Math.max(1, Number(executionPlanner.plans_created_count || 0))), weight: appliedPlans },
    { score: scorePresence(plannerAnalyses, Math.max(1, rows.length)), weight: plannerAnalyses },
  ]);

  const domainSpecs = [
    {
      domain: "IA",
      score: aiScore,
      evidence_count: aiAttempts + Number(responseQuality.analyzed_count || 0),
      metrics: {
        success_rate: calculateSuccessRate(aiSuccesses, aiAttempts),
        responses: aiSuccesses,
        average_latency_ms: aiLatency || null,
        rqc_grade: responseQuality.last_grade || "",
        rqc_average_score: responseQuality.average_score ?? null,
        completion_guard_events: completionGuardSignals,
        interrupted_responses: interruptions,
      },
    },
    {
      domain: "Recherche Web",
      score: webScore,
      evidence_count: webSuccess + webErrors + cacheHit + dedupe + forcedSearches,
      metrics: {
        searches: webExecuted,
        success_rate: calculateSuccessRate(webSuccess, webSuccess + webErrors),
        average_latency_ms: tavilyUsage.average_latency_ms ?? null,
        cache_hit_rate: tavilyUsage.cache_hit_rate ?? null,
        cache_miss_count: cacheMiss,
        deduplication_rate: tavilyUsage.deduplication_rate ?? null,
        citations,
        forced_searches: forcedSearches,
        errors: webErrors,
      },
    },
    {
      domain: "Documents",
      score: documentScore,
      evidence_count: documentEvidence,
      metrics: {
        events: documentEventRows.length,
        uploaded_documents: documentCounters,
        exports: exportsCount,
        errors: documentErrors,
        renderer_ast_events: rendererAst,
        used_formats: usedDocumentFormats,
      },
    },
    {
      domain: "Mémoire",
      score: memoryScore,
      evidence_count: memorySignals,
      metrics: {
        conversations: runtime.conversationCount ?? null,
        rag_searches: ragUsage.searches_performed ?? null,
        rag_match_rate: ragUsage.match_rate ?? null,
        contexts_used: ragUsage.contexts_used ?? null,
        project_rag_active: Boolean(ragUsage.project_rag_active),
      },
    },
    {
      domain: "UX",
      score: uxScore,
      evidence_count: uxEvents.length + (uxService ? 1 : 0),
      metrics: {
        frontend_status: uxService?.status || "",
        ux_events: uxEvents.length,
        js_errors: uxErrors,
        renderer_ast_events: rendererAst,
        exports: exportsCount,
      },
    },
    {
      domain: "Sécurité",
      score: securityScore,
      evidence_count: securityEvents.length + 2,
      metrics: {
        db_configured: Boolean(runtime.dbConfigured),
        admin_token_configured: Boolean(runtime.adminConfigured),
        guard_policy_events: securityEvents.length,
        failures: securityFailures,
        forbid_unsupported_numbers: Boolean(sourcePlanner.last_forbid_unsupported_numbers),
      },
    },
    {
      domain: "Observabilité",
      score: observabilityScore,
      evidence_count: observabilityEvents,
      metrics: {
        events_window: rows.length,
        planner_analyses: plannerAnalyses,
        planner_errors: plannerErrors,
        rqc_analyses: responseQuality.analyzed_count ?? null,
        model_router_models: modelRouter.success_rate_by_model?.length || 0,
      },
    },
    {
      domain: "Agents",
      score: agentScore,
      evidence_count: agentEvents.length + appliedPlans,
      metrics: {
        agent_events: agentEvents.length,
        planner_analyses: plannerAnalyses,
        applied_plans: appliedPlans,
        errors: agentErrors,
      },
    },
  ];

  return domainSpecs.map((item) => {
    const score = Number.isFinite(Number(item.score)) ? roundOne(item.score) : 0;
    const weight = calculateDynamicWeight(score, item.evidence_count);
    return {
      ...item,
      score,
      weight,
      data_status: item.evidence_count > 0 ? "observed" : "no_data",
    };
  });
}

function weightedAverage(domains) {
  const usable = domains.filter((item) => Number(item.weight || 0) > 0 && Number.isFinite(Number(item.score)));
  if (!usable.length) return 0;
  const totalWeight = usable.reduce((sum, item) => sum + Number(item.weight), 0);
  const total = usable.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return roundOne(total / totalWeight);
}

function calculateGlobalMaturity(domains = []) {
  return weightedAverage(domains);
}

function calculateLevel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "Non mesuré";
  if (value >= 9) return "Maîtrisé";
  if (value >= 7) return "Stable";
  if (value >= 5) return "À renforcer";
  if (value > 0) return "Fragile";
  return "Non mesuré";
}

function calculateTrend(currentScore, previousScore) {
  if (currentScore === null || currentScore === undefined || previousScore === null || previousScore === undefined) {
    return { trend: "non mesuré", delta: "n/a", delta_value: null, previous_score: null };
  }
  const current = Number(currentScore);
  const previous = Number(previousScore);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { trend: "non mesuré", delta: "n/a", delta_value: null, previous_score: null };
  }
  const delta = roundOne(current - previous);
  return {
    trend: delta > 0 ? "hausse" : (delta < 0 ? "baisse" : "stable"),
    delta: `${delta > 0 ? "+" : ""}${delta}`,
    delta_value: delta,
    previous_score: roundOne(previous),
  };
}

function splitEventsForEvolution(rows) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));
  if (sorted.length < 2) return { previous: [], current: sorted };
  const midpoint = Math.floor(sorted.length / 2);
  return {
    previous: sorted.slice(0, midpoint),
    current: sorted.slice(midpoint),
  };
}

function calculateHistoricalEvolution(input = {}) {
  const rows = Array.isArray(input.events) ? input.events : [];
  const { previous, current } = splitEventsForEvolution(rows);
  if (!previous.length || !current.length) {
    return {
      previous_score: null,
      current_score: null,
      trend: "non mesuré",
      delta: "n/a",
      points: [],
    };
  }
  const previousDomains = calculateDomainScores({ ...input, events: previous });
  const currentDomains = calculateDomainScores({ ...input, events: current });
  const previousScore = calculateGlobalMaturity(previousDomains);
  const currentScore = calculateGlobalMaturity(currentDomains);
  const trend = calculateTrend(currentScore, previousScore);
  return {
    previous_score: previousScore,
    current_score: currentScore,
    ...trend,
    points: [
      { label: "Fenêtre précédente", score: previousScore, events: previous.length },
      { label: "Fenêtre actuelle", score: currentScore, events: current.length },
    ],
  };
}

function buildDashboardMetrics(domains = []) {
  return domains.map((domain) => ({
    domain: domain.domain,
    score: domain.score,
    level: calculateLevel(domain.score),
    data_status: domain.data_status,
    evidence_count: domain.evidence_count,
    metrics: domain.metrics,
  }));
}

function buildRadarMetrics(domains = []) {
  return domains.map((domain) => ({
    label: domain.domain,
    value: domain.score,
    weight: domain.weight,
    evidence_count: domain.evidence_count,
  }));
}

function buildMiniCharts(domains = [], evolution = {}) {
  return {
    maturity_evolution: evolution.points || [],
    domain_scores: domains.map((domain) => ({
      label: domain.domain,
      value: domain.score,
      status: domain.data_status,
    })),
  };
}

function buildDashboardScorecard(input = {}) {
  const domains = calculateDomainScores(input);
  const globalScore = calculateGlobalMaturity(domains);
  const evolution = calculateHistoricalEvolution(input);
  const trend = calculateTrend(globalScore, evolution.previous_score);
  return {
    domains: domains.map((domain) => ({
      domain: domain.domain,
      score: domain.score,
      weight: roundOne(domain.weight),
      trend: trend.trend,
      delta_since_last_audit: trend.delta,
      evidence_count: domain.evidence_count,
      data_status: domain.data_status,
      metrics: domain.metrics,
    })),
    global_score: globalScore,
    trend: trend.trend,
    delta_since_last_audit: trend.delta,
    last_audit_score: trend.previous_score,
    level: calculateLevel(globalScore),
    method: "Moyenne pondérée dynamique calculée depuis D1, statistiques Workers et composants réellement observés.",
    dashboard_metrics: buildDashboardMetrics(domains),
    radar_metrics: buildRadarMetrics(domains),
    mini_charts: buildMiniCharts(domains, evolution),
    historical_evolution: evolution,
  };
}

function buildMaturityEngineInput(payload = {}) {
  return {
    events: payload.events || [],
    tavilyUsage: payload.tavilyUsage,
    ragUsage: payload.ragUsage,
    aiState: payload.aiState,
    services: payload.services,
    documents: payload.documents,
    checks: payload.checks,
    statistics: payload.statistics,
    runtime: payload.runtime,
  };
}

function buildMaturityDashboardPayload(input = {}) {
  const scorecard = buildDashboardScorecard(buildMaturityEngineInput(input));
  return {
    maturity: {
      score: scorecard.global_score,
      max: 10,
      level: scorecard.level,
      detail: "Score global calculé dynamiquement depuis les événements D1 et les statistiques Workers.",
    },
    scorecard,
  };
}

export {
  calculateGlobalMaturity,
  calculateDomainScores,
  calculateTrend,
  calculateHistoricalEvolution,
  calculateLevel,
  buildDashboardMetrics,
  buildRadarMetrics,
  buildMiniCharts,
  buildMaturityDashboardPayload,
};
