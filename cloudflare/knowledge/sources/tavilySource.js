export function createTavilyKnowledgeSource({ searchFn = null } = {}) {
  return {
    key: 'tavily',
    type: 'tavily',
    async connect(env) {
      return { ok: Boolean(env?.TAVILY_API_KEY) };
    },
    async index() {
      return { ok: false, error: 'remote_search_source' };
    },
    async search(env, query, options = {}) {
      if (typeof searchFn !== 'function') return [];
      const result = await searchFn(query, env, options.tavilyIntent || {});
      return (result?.results || []).map((item, index) => ({
        source: 'tavily',
        sourceId: 'tavily',
        documentId: item.link || item.url || `tavily:${index}`,
        chunkId: `${item.link || item.url || `tavily:${index}`}::snippet`,
        title: item.title || item.link || 'Résultat web',
        text: item.snippet || item.content || item.raw_content || '',
        url: item.link || item.url || '',
        score: Number(item.score || 0.68),
        confidence: 0.68,
        freshness: item.publishedDate || item.published_date || null,
        citation: `[Web: ${item.title || item.link || index + 1}]`,
        metadata: {
          publishedDate: item.publishedDate || item.published_date || '',
          provider: 'tavily'
        }
      })).filter((item) => item.text);
    },
    async semanticSearch() {
      return [];
    },
    async getDocument() {
      return null;
    },
    async getMetadata() {
      return null;
    },
    async getEmbeddings() {
      return null;
    },
    async refresh() {
      return { ok: true, refreshed: false };
    },
    async health(env) {
      return {
        ok: Boolean(env?.TAVILY_API_KEY),
        status: env?.TAVILY_API_KEY ? 'available' : 'unconfigured'
      };
    }
  };
}
