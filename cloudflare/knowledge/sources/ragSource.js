import { queryRag, queryDocumentTail, lexicalSearchChunks, getChunksByIndices } from '../../ragPipeline.js';

function mapRagItem(item, projectId) {
  return {
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
      projectId: projectId || ''
    }
  };
}

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
      const projectId = options.projectContext?.projectId;
      const structural = options.structural || null;
      const targetDocumentId = options.targetDocumentId || null;
      const maxPassages = options.maxPassages || 8;
      const byChunk = new Map();
      const addItems = (items) => {
        (items || []).forEach((item) => {
          if (!item || !item.documentId) return;
          const key = `${item.documentId}::${item.chunkIndex}`;
          const existing = byChunk.get(key);
          // Conserve le meilleur score si un chunk remonte par plusieurs voies.
          if (!existing || Number(item.score || 0) > Number(existing.score || 0)) {
            byChunk.set(key, mapRagItem(item, projectId));
          }
        });
      };

      // 1. Recuperation structurelle PRIORITAIRE (positionnelle, lexicale,
      //    ou section avec voisinage) — comble les angles morts du vectoriel.
      if (structural?.retrieval === 'tail' && targetDocumentId) {
        // document_tail_retrieval : derniers chunks par chunk_index.
        const tail = await queryDocumentTail(env, { documentId: targetDocumentId, projectId, limit: Math.max(10, maxPassages) });
        if (tail?.ok) addItems(tail.selected);
      } else if ((structural?.retrieval === 'lexical' || structural?.retrieval === 'section') && Array.isArray(structural.lexicalTerms) && structural.lexicalTerms.length) {
        const lexical = await lexicalSearchChunks(env, {
          terms: structural.lexicalTerms,
          projectId,
          includeGlobalLibrary: true,
          documentId: targetDocumentId || undefined,
          limit: Math.max(12, maxPassages)
        });
        if (lexical?.ok) {
          addItems(lexical.selected);
          // document_section_retrieval : ajoute les chunks voisins (avant /
          // apres) de chaque chunk trouve pour ne pas tronquer la section
          // (bibliographie, table des matieres...). Borne au document du
          // chunk trouve, jamais croise entre documents.
          if (structural.retrieval === 'section') {
            const neighborsByDoc = new Map();
            (lexical.selected || []).slice(0, 8).forEach((item) => {
              const list = neighborsByDoc.get(item.documentId) || [];
              list.push(item.chunkIndex - 1, item.chunkIndex + 1);
              neighborsByDoc.set(item.documentId, list);
            });
            for (const [docId, indices] of neighborsByDoc.entries()) {
              const neighbors = await getChunksByIndices(env, { documentId: docId, indices });
              addItems(neighbors);
            }
          }
        }
      }

      // 2. Vectoriel TOUJOURS execute en complement (jamais remplace) — sauf
      //    tail pur, ou la position prime sur la similarite.
      if (structural?.retrieval !== 'tail') {
        const result = await queryRag(env, {
          query,
          projectId,
          includeGlobalLibrary: true,
          maxPassages,
          similarityThreshold: options.similarityThreshold,
          // Ciblage documentaire strict : quand un document precis est vise
          // (requete liee a un document), le vectoriel ne doit jamais faire
          // remonter un chunk d'un autre document du projet/de la
          // bibliotheque, meme s'il est semantiquement plus proche.
          documentId: targetDocumentId || undefined
        });
        if (result?.ok) addItems(result.selected);
      }

      return Array.from(byChunk.values());
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
