export const KNOWLEDGE_SOURCE_METHODS = Object.freeze([
  'connect',
  'index',
  'search',
  'semanticSearch',
  'getDocument',
  'getMetadata',
  'getEmbeddings',
  'refresh',
  'health'
]);

export const KNOWLEDGE_FEATURE_FLAGS = Object.freeze({
  orchestrator: 'KNOWLEDGE_ORCHESTRATOR_ENABLED',
  obsidian: 'KNOWLEDGE_OBSIDIAN_ENABLED'
});

export function isFlagEnabled(env, name, defaultValue = false) {
  const value = String(env?.[name] ?? '').trim().toLowerCase();
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value);
}

export function isKnowledgeOrchestratorEnabled(env) {
  return isFlagEnabled(env, KNOWLEDGE_FEATURE_FLAGS.orchestrator, false);
}

export function isObsidianEnabled(env) {
  return isFlagEnabled(env, KNOWLEDGE_FEATURE_FLAGS.obsidian, false);
}

export function normalizeKnowledgeSource(source) {
  if (!source || typeof source !== 'object') return null;
  const key = String(source.key || source.id || source.type || '').trim();
  if (!key) return null;
  const normalized = { ...source, key };
  for (const method of KNOWLEDGE_SOURCE_METHODS) {
    if (typeof normalized[method] !== 'function') {
      normalized[method] = async () => method === 'health'
        ? { ok: false, status: 'not_implemented', source: key }
        : method === 'search' || method === 'semanticSearch'
          ? []
          : null;
    }
  }
  return normalized;
}

export function normalizeKnowledgeResult(item, fallback = {}) {
  const source = String(item?.source || fallback.source || 'unknown').trim();
  const documentId = String(item?.documentId || item?.document_id || fallback.documentId || '').trim();
  const chunkId = String(item?.chunkId || item?.chunk_id || item?.id || fallback.chunkId || `${source}:${documentId}`).trim();
  const text = String(item?.text || item?.content || '').trim();
  if (!text) return null;
  const title = String(item?.title || item?.documentName || item?.document_name || fallback.title || documentId || source).trim();
  return {
    source,
    sourceId: String(item?.sourceId || item?.source_id || fallback.sourceId || source).trim(),
    documentId,
    chunkId,
    title,
    text,
    url: String(item?.url || item?.link || '').trim(),
    citation: String(item?.citation || `[${source}: ${title}]`).trim(),
    score: Number.isFinite(Number(item?.score)) ? Number(item.score) : 0,
    confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : null,
    freshness: item?.freshness || item?.updated_at || item?.updatedAt || null,
    metadata: item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  };
}

export function safeJsonParse(value, fallback = null) {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function estimateTokens(text) {
  const chars = String(text || '').length;
  return Math.max(1, Math.ceil(chars / 4));
}

export function hashString(input) {
  const text = String(input || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
