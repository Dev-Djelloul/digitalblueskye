export function createProjectMemoryKnowledgeSource() {
  return {
    key: 'project_memory',
    type: 'project_memory',
    async connect() {
      return { ok: true };
    },
    async index() {
      return { ok: false, error: 'ephemeral_source' };
    },
    async search(env, query, options = {}) {
      const memory = String(options.projectContext?.memory || options.projectContext?.projectMemory || '').trim();
      if (!memory) return [];
      return [{
        source: 'project_memory',
        sourceId: options.projectContext?.projectId || 'active_project',
        documentId: options.projectContext?.projectId || 'project_memory',
        chunkId: `${options.projectContext?.projectId || 'project_memory'}::memory`,
        title: 'Mémoire projet',
        text: memory,
        score: 0.72,
        confidence: 0.78,
        citation: '[Mémoire projet]',
        metadata: { projectId: options.projectContext?.projectId || '' }
      }];
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
    async health() {
      return { ok: true, status: 'ephemeral', documents_count: null, chunks_count: null };
    }
  };
}
