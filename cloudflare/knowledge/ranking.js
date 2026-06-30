function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function freshnessScore(value) {
  if (!value) return 0.4;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return 0.4;
  const ageDays = Math.max(0, (Date.now() - ts) / 86400000);
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.85;
  if (ageDays <= 180) return 0.65;
  if (ageDays <= 365) return 0.45;
  return 0.25;
}

export function sourceReliability(source) {
  const key = String(source || '').toLowerCase();
  if (key === 'project_memory') return 0.9;
  if (key === 'obsidian') return 0.88;
  if (key === 'rag') return 0.84;
  if (key === 'github') return 0.82;
  if (key === 'google_drive') return 0.78;
  if (key === 'notion') return 0.76;
  if (key === 'confluence') return 0.76;
  if (key === 'tavily') return 0.72;
  return 0.55;
}

export function scoreKnowledgeResult(result, query = '', options = {}) {
  const semantic = clamp01(result?.score);
  const lexical = clamp01(result?.metadata?.bm25Score || result?.metadata?.lexicalScore || 0);
  const reliability = sourceReliability(result?.source);
  const freshness = freshnessScore(result?.freshness || result?.metadata?.updated_at);
  const graph = clamp01(result?.metadata?.graphScore || 0);
  const projectBoost = options.projectId && result?.metadata?.projectId === options.projectId ? 1 : 0;
  const finalScore =
    semantic * 0.35 +
    lexical * 0.25 +
    reliability * 0.15 +
    freshness * 0.10 +
    graph * 0.10 +
    projectBoost * 0.05;
  return {
    ...result,
    score: Math.round(clamp01(finalScore || semantic || lexical || reliability * 0.5) * 10000) / 10000,
    confidence: result?.confidence == null
      ? Math.round(clamp01((semantic || lexical || 0.5) * 0.6 + reliability * 0.4) * 10000) / 10000
      : result.confidence
  };
}

export function rankKnowledgeResults(results, query = '', options = {}) {
  return (Array.isArray(results) ? results : [])
    .map((result) => scoreKnowledgeResult(result, query, options))
    .sort((a, b) => b.score - a.score);
}
