import { normalizeKnowledgeSource } from './contracts.js';

export function createKnowledgeSourceRegistry(sources = []) {
  const sourceMap = new Map();
  for (const source of sources) {
    const normalized = normalizeKnowledgeSource(source);
    if (normalized) sourceMap.set(normalized.key, normalized);
  }

  return {
    register(source) {
      const normalized = normalizeKnowledgeSource(source);
      if (!normalized) return false;
      sourceMap.set(normalized.key, normalized);
      return true;
    },
    get(key) {
      return sourceMap.get(String(key || '').trim()) || null;
    },
    list() {
      return Array.from(sourceMap.values());
    },
    enabled(keys = []) {
      const wanted = Array.isArray(keys) && keys.length ? new Set(keys.map((key) => String(key))) : null;
      return Array.from(sourceMap.values()).filter((source) => {
        if (source.enabled === false) return false;
        return wanted ? wanted.has(source.key) || wanted.has(source.type) : true;
      });
    }
  };
}

export async function collectSourceHealth(env, registry) {
  const sources = registry?.list ? registry.list() : [];
  const results = await Promise.all(sources.map(async (source) => {
    try {
      return {
        source: source.key,
        ...(await source.health(env))
      };
    } catch (error) {
      return {
        source: source.key,
        ok: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
  const healthy = results.filter((item) => item.ok || ['available', 'operational', 'active'].includes(String(item.status))).length;
  return {
    sources: results,
    total: results.length,
    healthy,
    health_score: results.length ? Math.round((healthy / results.length) * 100) : null
  };
}
