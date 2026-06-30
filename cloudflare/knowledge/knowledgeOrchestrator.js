import { normalizeKnowledgeResult } from './contracts.js';
import { buildKnowledgeContext } from './contextBuilder.js';
import { deduplicateKnowledgeResults } from './deduplication.js';
import { detectKnowledgeConflicts } from './conflictResolver.js';
import { rankKnowledgeResults } from './ranking.js';

function sourceKeysFromPlans(sourcePlan, executionPlan, options = {}) {
  const keys = new Set();
  const forceAll = options.allSources === true;
  if (forceAll) ['obsidian', 'rag', 'tavily', 'project_memory'].forEach((key) => keys.add(key));
  if (Array.isArray(sourcePlan?.plan?.sourceFamilies)) {
    sourcePlan.plan.sourceFamilies.forEach((key) => keys.add(String(key)));
  }
  const useRag = sourcePlan?.plan?.useRag || sourcePlan?.plan?.forceRag || executionPlan?.plan?.useRag || executionPlan?.plan?.forceRag;
  const useWeb = sourcePlan?.plan?.useWeb || sourcePlan?.plan?.forceWeb || executionPlan?.plan?.useWeb || executionPlan?.plan?.forceWeb;
  if (useRag) {
    keys.add('rag');
    keys.add('obsidian');
    keys.add('project_memory');
  }
  if (useWeb) keys.add('tavily');
  if (options.includeProjectMemory !== false) keys.add('project_memory');
  if (Array.isArray(options.sources)) options.sources.forEach((key) => keys.add(String(key)));
  return Array.from(keys);
}

async function querySource(source, env, query, options) {
  const startedAt = Date.now();
  try {
    const lexical = await source.search(env, query, options);
    const semantic = await source.semanticSearch(env, query, options);
    const results = [...(Array.isArray(lexical) ? lexical : []), ...(Array.isArray(semantic) ? semantic : [])]
      .map((item) => normalizeKnowledgeResult(item, { source: source.key }))
      .filter(Boolean);
    return {
      source: source.key,
      ok: true,
      latency_ms: Date.now() - startedAt,
      results
    };
  } catch (error) {
    return {
      source: source.key,
      ok: false,
      latency_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      results: []
    };
  }
}

export async function runKnowledgeOrchestrator(env, registry, {
  query = '',
  sourcePlan = null,
  capabilityPlan = null,
  executionPlan = null,
  projectContext = null,
  history = [],
  tokenBudget = 4000,
  language = 'fr',
  sources = null,
  allSources = false,
  includeProjectMemory = true,
  tavilyIntent = null
} = {}) {
  const startedAt = Date.now();
  const selectedSourceKeys = sourceKeysFromPlans(sourcePlan, executionPlan, { sources, allSources, includeProjectMemory });
  const activeSources = registry.enabled(selectedSourceKeys);
  const sourceOptions = {
    sourcePlan,
    capabilityPlan,
    executionPlan,
    projectContext,
    history,
    language,
    tavilyIntent,
    maxPassages: 8
  };
  const sourceResponses = await Promise.all(activeSources.map((source) => querySource(source, env, query, sourceOptions)));
  const rawResults = sourceResponses.flatMap((response) => response.results);
  const ranked = rankKnowledgeResults(rawResults, query, { projectId: projectContext?.projectId });
  const deduped = deduplicateKnowledgeResults(ranked);
  const conflicts = detectKnowledgeConflicts(deduped.results);
  const context = buildKnowledgeContext({ query, results: deduped.results, conflicts, tokenBudget, language });
  return {
    ok: true,
    contextBlock: context.contextBlock,
    citations: context.citations,
    selectedSources: context.selected.map((item) => ({
      source: item.source,
      documentId: item.documentId,
      chunkId: item.chunkId,
      title: item.title,
      score: item.score,
      confidence: item.confidence,
      citationId: item.citationId
    })),
    discardedSources: ranked.length - context.selected.length,
    conflicts,
    confidence: context.confidence,
    telemetry: {
      sources_requested: selectedSourceKeys,
      sources_queried: sourceResponses.map((item) => ({ source: item.source, ok: item.ok, latency_ms: item.latency_ms, results_count: item.results.length, error: item.error || '' })),
      raw_results: rawResults.length,
      duplicates_removed: deduped.duplicates.length,
      chunks_selected: context.selected.length,
      token_budget: context.tokenBudget,
      token_budget_used: context.tokenBudgetUsed,
      latency_ms: Date.now() - startedAt
    }
  };
}
