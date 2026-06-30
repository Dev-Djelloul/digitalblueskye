import { queryRag } from '../../ragPipeline.js';

export function createRagKnowledgeSource() {
  return {
    key: 'rag',
    type: 'rag',
    async connect() {
      return { ok: true };
    },
    async index() {
      return { ok: false, error: 'use_existing_rag_index_endpoint' };
    },
    async search() {
      return [];
    },
    async semanticSearch(env, query, options = {}) {
      const result = await queryRag(env, {
        query,
        projectId: options.projectContext?.projectId,
        includeGlobalLibrary: true,
        maxPassages: options.maxPassages || 8
      });
      if (!result?.ok) return [];
      return (result.selected || []).map((item) => ({
        source: 'rag',
        sourceId: 'rag',
        documentId: item.documentId,
        chunkId: `${item.documentId}::${item.chunkIndex}`,
        title: item.documentName,
        text: item.text,
        score: item.score,
        citation: `[RAG: ${item.documentName}]`,
        metadata: {
          locator: item.locator,
          chunkIndex: item.chunkIndex,
          projectId: options.projectContext?.projectId || ''
        }
      }));
    },
    async getDocument(env, id) {
      if (!env?.DB || !id) return null;
      return await env.DB.prepare('SELECT * FROM rag_sources WHERE id = ?').bind(id).first();
    },
    async getMetadata(env, id) {
      return this.getDocument(env, id);
    },
    async getEmbeddings() {
      return null;
    },
    async refresh() {
      return { ok: true, refreshed: false, detail: 'RAG is refreshed through existing document indexing.' };
    },
    async health(env) {
      if (!env?.DB) return { ok: false, status: 'unavailable', documents_count: 0, chunks_count: 0 };
      const [docs, chunks] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS count FROM rag_sources').first(),
        env.DB.prepare('SELECT COUNT(*) AS count FROM rag_chunks').first()
      ]);
      const chunksCount = Number(chunks?.count || 0);
      return {
        ok: chunksCount > 0,
        status: chunksCount > 0 ? 'available' : 'empty',
        documents_count: Number(docs?.count || 0),
        chunks_count: chunksCount
      };
    }
  };
}
