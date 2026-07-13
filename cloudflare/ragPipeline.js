import { getVectorStoreProvider } from './vectorStore/index.js';
import { embedText, embedTexts, getEmbeddingDimensions } from './embeddings.js';

const NAMESPACE = 'rag';
const DEFAULT_SIMILARITY_THRESHOLD = 0.72;
const DEFAULT_MAX_PASSAGES = 5;

function getSimilarityThreshold(env) {
  const configured = Number(env?.RAG_SIMILARITY_THRESHOLD);
  return Number.isFinite(configured) && configured > 0 && configured <= 1 ? configured : DEFAULT_SIMILARITY_THRESHOLD;
}

function chunkVectorId(documentId, chunkIndex) {
  return `${documentId}::${chunkIndex}`;
}

/**
 * Indexe les chunks d'un document : embedding + upsert vectoriel (metadata
 * légère) + texte complet en D1 (le vector store ne stocke jamais de texte
 * long, quel que soit le backend choisi demain).
 */
export async function indexDocumentChunks(env, { documentId, projectId, documentName, chunks, mimeType, sizeBytes, checksum, sourceType }) {
  const provider = getVectorStoreProvider(env);
  if (!provider) return { ok: false, error: 'vector_store_unavailable' };
  if (!documentId || !Array.isArray(chunks) || !chunks.length) {
    return { ok: false, error: 'invalid_payload' };
  }

  const items = [];
  const d1Rows = [];
  // Embeddings calcules par lots (embedTexts) et non plus chunk par chunk :
  // l'indexation d'un long document passait par autant d'appels Workers AI
  // sequentiels que de chunks.
  const embeddableChunks = chunks.filter((chunk) => String(chunk?.text || '').trim());
  const vectors = await embedTexts(env, embeddableChunks.map((chunk) => String(chunk.text).trim()));
  for (let i = 0; i < embeddableChunks.length; i += 1) {
    const chunk = embeddableChunks[i];
    const text = String(chunk.text).trim();
    const vector = vectors[i];
    if (!vector) continue;
    const id = chunkVectorId(documentId, chunk.index);
    items.push({
      id,
      values: vector,
      metadata: {
        documentId,
        projectId: projectId || '',
        documentName: documentName || '',
        chunkIndex: chunk.index,
        locator: chunk.locator || ''
      }
    });
    d1Rows.push({ id, chunkIndex: chunk.index, locator: chunk.locator || '', text });
  }

  if (!items.length) return { ok: false, error: 'no_embeddable_chunks' };

  try {
    await provider.upsert({ namespace: NAMESPACE, items });
    if (env?.DB) {
      await Promise.all(d1Rows.map((row) => env.DB.prepare(
        `INSERT INTO rag_chunks (id, document_id, project_id, document_name, chunk_index, locator, text)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, text = excluded.text, locator = excluded.locator, document_name = excluded.document_name`
      ).bind(row.id, documentId, projectId || null, documentName || '', row.chunkIndex, row.locator, row.text).run()));
      // Granularite documentaire (onglet admin Sources & RAG) : additif,
      // n'affecte jamais la recherche vectorielle (rag_chunks reste la seule
      // source de verite pour queryRag()).
      await env.DB.prepare(
        `INSERT INTO rag_sources (id, project_id, title, source_type, filename, mime_type, size_bytes, checksum, status, chunks_count, indexed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           title = excluded.title,
           source_type = excluded.source_type,
           filename = excluded.filename,
           mime_type = excluded.mime_type,
           size_bytes = excluded.size_bytes,
           checksum = excluded.checksum,
           status = 'indexed',
           chunks_count = excluded.chunks_count,
           indexed_at = datetime('now'),
           updated_at = datetime('now')`
      ).bind(
        documentId,
        projectId || null,
        documentName || documentId,
        sourceType || null,
        documentName || null,
        mimeType || null,
        Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null,
        checksum || null,
        items.length
      ).run();
      // Onglet admin Documents (vue transverse) : additif, separe de
      // rag_sources (specialise Sources & RAG). rag_source_id == documentId
      // car c'est la meme indexation qui a produit la ligne rag_sources
      // ci-dessus. uploaded_at n'est jamais ecrase une fois pose (COALESCE).
      await env.DB.prepare(
        `INSERT INTO documents (id, rag_source_id, project_id, title, filename, mime_type, source_type, size_bytes, checksum, status, chunks_count, indexed_at, uploaded_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           rag_source_id = excluded.rag_source_id,
           project_id = excluded.project_id,
           title = excluded.title,
           filename = excluded.filename,
           mime_type = excluded.mime_type,
           source_type = excluded.source_type,
           size_bytes = excluded.size_bytes,
           checksum = excluded.checksum,
           status = 'indexed',
           chunks_count = excluded.chunks_count,
           indexed_at = datetime('now'),
           updated_at = datetime('now')`
      ).bind(
        documentId,
        documentId,
        projectId || null,
        documentName || documentId,
        documentName || null,
        mimeType || null,
        sourceType || null,
        Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null,
        checksum || null,
        items.length
      ).run();
    }
    return { ok: true, indexed: items.length, skipped: chunks.length - items.length };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('rag_index_failed', detail);
    return { ok: false, error: 'index_failed', detail };
  }
}

export async function deleteDocumentVectors(env, { documentId }) {
  const provider = getVectorStoreProvider(env);
  if (!provider) return { ok: false, error: 'vector_store_unavailable' };
  if (!documentId) return { ok: false, error: 'invalid_payload' };

  try {
    let knownIds = [];
    if (env?.DB) {
      const rows = await env.DB.prepare('SELECT id FROM rag_chunks WHERE document_id = ?').bind(documentId).all();
      knownIds = (rows?.results || []).map((row) => row.id);
    }
    if (knownIds.length) await provider.deleteByIds({ namespace: NAMESPACE, ids: knownIds });
    if (env?.DB) {
      await env.DB.prepare('DELETE FROM rag_chunks WHERE document_id = ?').bind(documentId).run();
      await env.DB.prepare('DELETE FROM rag_sources WHERE id = ?').bind(documentId).run();
      await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(documentId).run();
    }
    return { ok: true, deleted: knownIds.length };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('rag_delete_failed', detail);
    return { ok: false, error: 'delete_failed', detail };
  }
}

/**
 * Recherche vectorielle. Retourne une forme proche de ce que le client
 * attend déjà de searchProjectRag() côté navigateur : `selected` (passages
 * retenus au-dessus du seuil de similarité) + `telemetry`, pour que
 * l'intégration côté client soit un branchement, pas une réécriture.
 */
export async function queryRag(env, { query, projectId, includeGlobalLibrary, maxPassages, similarityThreshold, documentId }) {
  const startedAt = Date.now();
  const provider = getVectorStoreProvider(env);
  if (!provider) return { ok: false, error: 'vector_store_unavailable' };
  const text = String(query || '').trim();
  if (!text) return { ok: false, error: 'empty_query' };

  const vector = await embedText(env, text);
  if (!vector) return { ok: false, error: 'embedding_failed' };

  const threshold = Number.isFinite(Number(similarityThreshold)) ? Number(similarityThreshold) : getSimilarityThreshold(env);
  // rag_diagnose a montre qu'un topK trop bas (5) peut ne pas retrouver un
  // vecteur tres recemment upserte alors que topK=20 le retrouve en
  // premiere position (cf. discussion). On interroge donc large cote
  // Vectorize, puis on filtre/seuil/limite cote Worker (cf. plus bas).
  const topK = Math.max(20, Math.min(30, Math.max(1, Number(maxPassages) || DEFAULT_MAX_PASSAGES) * 3));

  try {
    const filter = documentId
      ? { documentId }
      : (includeGlobalLibrary ? undefined : { projectId: projectId || '' });
    const { matches, filterApplied } = await provider.query({ namespace: NAMESPACE, vector, topK, filter });
    // Ciblage documentaire strict : re-filtre TOUJOURS cote code par
    // documentId, independamment de filterApplied — un chunk d'un autre
    // document ne doit jamais fuiter dans une reponse liee a un document
    // precis, meme si l'index de metadata Vectorize pour `documentId` n'a
    // pas encore ete cree (wrangler vectorize create-metadata-index).
    // Sinon (pas de documentId cible), re-filtre par projectId si Vectorize
    // a ignore le filtre, pour ne pas melanger les documents d'autres
    // projets.
    const scoped = documentId
      ? matches.filter((match) => match.metadata?.documentId === documentId)
      : ((filter && !filterApplied)
        ? matches.filter((match) => match.metadata?.projectId === (projectId || ''))
        : matches);
    const aboveThreshold = scoped.filter((match) => match.score >= threshold);

    let textsById = new Map();
    if (env?.DB && aboveThreshold.length) {
      const placeholders = aboveThreshold.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT id, text FROM rag_chunks WHERE id IN (${placeholders})`
      ).bind(...aboveThreshold.map((m) => m.id)).all();
      textsById = new Map((rows?.results || []).map((row) => [row.id, row.text]));
    }

    const selected = aboveThreshold
      .map((match) => ({
        documentId: match.metadata.documentId,
        documentName: match.metadata.documentName,
        chunkIndex: match.metadata.chunkIndex,
        locator: match.metadata.locator,
        score: match.score,
        text: textsById.get(match.id) || ''
      }))
      .filter((item) => item.text)
      .slice(0, Math.max(1, Math.min(20, Number(maxPassages) || DEFAULT_MAX_PASSAGES)));

    return {
      ok: true,
      selected,
      telemetry: {
        vector_search: true,
        chunks_searched: matches.length,
        chunks_selected: selected.length,
        documents_used: new Set(selected.map((item) => item.documentId)).size,
        similarity_threshold: threshold,
        filter_applied: filterApplied,
        duration_ms: Date.now() - startedAt
      }
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('rag_query_failed', detail);
    return { ok: false, error: 'query_failed', detail };
  }
}

/**
 * Liste les documents indexes (un par document_id) pour le ciblage
 * documentaire : projet courant, ou bibliotheque entiere si
 * includeGlobalLibrary. Lit rag_chunks (source de verite de l'indexation).
 * Le indexedAt est approxime par le created_at le plus recent des chunks.
 */
export async function listIndexedDocuments(env, { projectId, includeGlobalLibrary } = {}) {
  if (!env?.DB) return [];
  try {
    let sql = `SELECT document_id, document_name, MAX(created_at) AS indexed_at
               FROM rag_chunks`;
    const binds = [];
    if (!includeGlobalLibrary) {
      sql += ' WHERE project_id = ?';
      binds.push(projectId || '');
    }
    sql += ' GROUP BY document_id ORDER BY indexed_at DESC';
    const rows = await env.DB.prepare(sql).bind(...binds).all();
    return (rows?.results || []).map((row) => ({
      id: row.document_id,
      name: row.document_name || row.document_id,
      indexedAt: Date.parse(row.indexed_at || '') || 0
    }));
  } catch (error) {
    console.warn('rag_list_documents_failed', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Recuperation positionnelle (« derniers paragraphes », « fin du
 * document », « conclusion ») : les N derniers chunks d'un document par
 * chunk_index, lus directement en D1 (rag_chunks est la source de verite,
 * cf. indexDocumentChunks). Aucune dependance au vectoriel : la similarite
 * semantique ne sait pas repondre a une requete purement positionnelle.
 * Retourne les chunks re-tries par ordre croissant de chunk_index pour une
 * lecture naturelle (le plus ancien d'abord parmi les derniers).
 */
export async function queryDocumentTail(env, { documentId, projectId, limit } = {}) {
  if (!env?.DB) return { ok: false, error: 'db_unavailable', selected: [] };
  if (!documentId) return { ok: false, error: 'missing_document_id', selected: [] };
  const startedAt = Date.now();
  const max = Math.max(1, Math.min(30, Number(limit) || 10));
  try {
    const rows = await env.DB.prepare(
      `SELECT id, document_id, document_name, chunk_index, locator, text
       FROM rag_chunks
       WHERE document_id = ?
       ORDER BY chunk_index DESC
       LIMIT ?`
    ).bind(documentId, max).all();
    const selected = (rows?.results || [])
      .map((row) => ({
        documentId: row.document_id,
        documentName: row.document_name,
        chunkIndex: Number(row.chunk_index),
        locator: row.locator || '',
        score: 1,
        text: String(row.text || '')
      }))
      .filter((item) => item.text)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
    return {
      ok: true,
      selected,
      telemetry: {
        retrieval: 'document_tail',
        document_id: documentId,
        chunks_selected: selected.length,
        duration_ms: Date.now() - startedAt
      }
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('rag_tail_failed', detail);
    return { ok: false, error: 'tail_failed', detail, selected: [] };
  }
}

/**
 * Recuperation de chunks precis par (document_id, chunk_index) — sert au
 * « chunk voisinage » du document_section_retrieval : une fois un chunk
 * trouve par recherche lexicale (ex. la ligne « Bibliographie »), on
 * recupere les chunks immediatement avant/apres pour ne pas tronquer la
 * section. Lecture seule sur rag_chunks (source de verite de l'indexation).
 */
export async function getChunksByIndices(env, { documentId, indices } = {}) {
  if (!env?.DB || !documentId) return [];
  const wanted = Array.from(new Set((Array.isArray(indices) ? indices : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0)))
    .slice(0, 60);
  if (!wanted.length) return [];
  try {
    const placeholders = wanted.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT id, document_id, document_name, chunk_index, locator, text
       FROM rag_chunks
       WHERE document_id = ? AND chunk_index IN (${placeholders})
       ORDER BY chunk_index ASC`
    ).bind(documentId, ...wanted).all();
    return (rows?.results || [])
      .map((row) => ({
        documentId: row.document_id,
        documentName: row.document_name,
        chunkIndex: Number(row.chunk_index),
        locator: row.locator || '',
        score: 0.5,
        text: String(row.text || '')
      }))
      .filter((item) => item.text);
  } catch (error) {
    console.warn('rag_neighbors_failed', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Recherche lexicale (LIKE) sur le texte des chunks, pour les requetes
 * structurelles (bibliographie, chercheurs, auteurs...) que la similarite
 * vectorielle seule rate (une liste de references score mal contre « Que
 * contient la bibliographie ? »). Score = nombre de termes distincts
 * trouves dans le chunk. A combiner avec le vectoriel en aval, jamais a
 * utiliser seule comme nouveau pipeline.
 */
export async function lexicalSearchChunks(env, { terms, projectId, includeGlobalLibrary, documentId, limit } = {}) {
  if (!env?.DB) return { ok: false, error: 'db_unavailable', selected: [] };
  const cleanTerms = (Array.isArray(terms) ? terms : [])
    .map((t) => String(t || '').trim().toLowerCase())
    .filter((t) => t.length >= 3)
    .slice(0, 16);
  if (!cleanTerms.length) return { ok: false, error: 'no_terms', selected: [] };
  const startedAt = Date.now();
  const max = Math.max(1, Math.min(40, Number(limit) || 16));
  // Sur-echantillonne en SQL (les termes peuvent co-occurrer dans un meme
  // chunk) puis score/limite cote Worker.
  const sqlLimit = Math.min(200, max * 6);
  try {
    const conditions = [];
    const binds = [];
    cleanTerms.forEach((term) => {
      conditions.push('LOWER(text) LIKE ?');
      binds.push(`%${term}%`);
    });
    let scopeClause = '';
    if (documentId) {
      scopeClause = ' AND document_id = ?';
      binds.push(documentId);
    } else if (!includeGlobalLibrary) {
      scopeClause = ' AND project_id = ?';
      binds.push(projectId || '');
    }
    const rows = await env.DB.prepare(
      `SELECT id, document_id, document_name, chunk_index, locator, text
       FROM rag_chunks
       WHERE (${conditions.join(' OR ')})${scopeClause}
       LIMIT ?`
    ).bind(...binds, sqlLimit).all();
    const selected = (rows?.results || [])
      .map((row) => {
        const lower = String(row.text || '').toLowerCase();
        const matched = cleanTerms.filter((term) => lower.includes(term));
        return {
          documentId: row.document_id,
          documentName: row.document_name,
          chunkIndex: Number(row.chunk_index),
          locator: row.locator || '',
          score: matched.length,
          matchedTerms: matched,
          text: String(row.text || '')
        };
      })
      .filter((item) => item.text && item.score > 0)
      .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)
      .slice(0, max);
    return {
      ok: true,
      selected,
      telemetry: {
        retrieval: 'lexical',
        terms: cleanTerms,
        chunks_selected: selected.length,
        duration_ms: Date.now() - startedAt
      }
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('rag_lexical_failed', detail);
    return { ok: false, error: 'lexical_failed', detail, selected: [] };
  }
}

/**
 * Reindexe UN document a partir du texte deja stocke en D1 (rag_chunks est
 * la source de verite du texte, cf. indexDocumentChunks) : recalcule les
 * embeddings avec le modele actuellement configure et upsert (idempotent,
 * memes ids chunkVectorId). Sert au bouton "Reindexer" de l'admin Documents —
 * utile apres un changement de modele d'embedding, ou si un document semble
 * mal retrouve par le RAG.
 */
export async function reindexSingleDocument(env, { documentId }) {
  const provider = getVectorStoreProvider(env);
  if (!provider) return { ok: false, error: 'vector_store_unavailable' };
  if (!documentId) return { ok: false, error: 'invalid_payload' };
  if (!env?.DB) return { ok: false, error: 'db_unavailable' };
  try {
    const rows = await env.DB.prepare(
      `SELECT id, document_id, project_id, document_name, chunk_index, locator, text
       FROM rag_chunks WHERE document_id = ?`
    ).bind(documentId).all();
    const chunks = (rows?.results || []).filter((row) => String(row.text || '').trim());
    if (!chunks.length) return { ok: false, error: 'document_not_found' };
    const vectors = await embedTexts(env, chunks.map((row) => String(row.text).trim()));
    const items = [];
    let failed = 0;
    chunks.forEach((row, index) => {
      const vector = vectors[index];
      if (!vector) { failed += 1; return; }
      items.push({
        id: row.id,
        values: vector,
        metadata: {
          documentId: row.document_id,
          projectId: row.project_id || '',
          documentName: row.document_name || '',
          chunkIndex: Number(row.chunk_index),
          locator: row.locator || ''
        }
      });
    });
    if (items.length) await provider.upsert({ namespace: NAMESPACE, items });
    return { ok: true, indexed: items.length, failed, total: chunks.length };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('rag_reindex_document_failed', detail);
    return { ok: false, error: 'reindex_failed', detail };
  }
}

/**
 * Réindexation serveur par lots — migration de modèle d'embedding (ex.
 * bge-base-en 768 dims → bge-m3 1024 dims sur un NOUVEL index Vectorize).
 * Lit les chunks depuis D1 (rag_chunks, source de vérité du TEXTE), recalcule
 * les embeddings avec le modèle configuré (env.EMBEDDING_MODEL, cf.
 * embeddings.js) et upsert dans l'index actuellement lié (VECTOR_INDEX).
 * Paginé pour rester sous les limites CPU/sous-requêtes d'un Worker :
 * l'appelant boucle avec nextOffset jusqu'à done=true. Idempotent (upsert).
 */
export async function reindexChunksBatch(env, { cursor, limit } = {}) {
  const provider = getVectorStoreProvider(env);
  if (!provider) return { ok: false, error: 'vector_store_unavailable' };
  if (!env?.DB) return { ok: false, error: 'db_unavailable' };
  const startedAt = Date.now();
  const safeCursor = Math.max(0, Number(cursor) || 0);
  // 40 max : 2 lots d'embeddings (embedTexts par 20) + 1 upsert + 2 D1 par
  // appel, et le repli unitaire d'embedTexts reste sous la limite de
  // sous-requetes du plan Workers Free meme en cas d'echec des lots.
  const safeLimit = Math.max(1, Math.min(40, Number(limit) || 40));
  try {
    const totalRow = await env.DB.prepare('SELECT COUNT(*) AS total FROM rag_chunks').all();
    const total = Number(totalRow?.results?.[0]?.total || 0);
    // Pagination KEYSET (WHERE rowid > cursor), pas OFFSET : une suppression
    // concurrente de document (mode rag_delete) ferait glisser des lignes
    // sous un OFFSET et elles seraient sautees silencieusement ; le curseur
    // rowid, lui, est insensible aux suppressions avant le curseur.
    const rows = await env.DB.prepare(
      `SELECT rowid AS row_id, id, document_id, project_id, document_name, chunk_index, locator, text
       FROM rag_chunks WHERE rowid > ? ORDER BY rowid LIMIT ?`
    ).bind(safeCursor, safeLimit).all();
    const pageRows = rows?.results || [];
    if (!pageRows.length) {
      return { ok: true, processed: 0, indexed: 0, failed: 0, failedIds: [], total, nextCursor: safeCursor, done: true, duration_ms: Date.now() - startedAt };
    }
    const chunks = pageRows.filter((row) => String(row.text || '').trim());
    const vectors = await embedTexts(env, chunks.map((row) => String(row.text).trim()));
    const items = [];
    const failedIds = [];
    chunks.forEach((row, index) => {
      const vector = vectors[index];
      if (!vector) { failedIds.push(row.id); return; }
      items.push({
        id: row.id,
        values: vector,
        metadata: {
          documentId: row.document_id,
          projectId: row.project_id || '',
          documentName: row.document_name || '',
          chunkIndex: Number(row.chunk_index),
          locator: row.locator || ''
        }
      });
    });
    if (items.length) await provider.upsert({ namespace: NAMESPACE, items });
    const nextCursor = Number(pageRows[pageRows.length - 1].row_id);
    return {
      ok: true,
      processed: pageRows.length,
      indexed: items.length,
      failed: failedIds.length,
      // failed > 0 : rejouer le MEME cursor (idempotent) avant de poursuivre,
      // sinon ces ids resteront absents du nouvel index.
      failedIds,
      total,
      nextCursor,
      done: pageRows.length < safeLimit,
      duration_ms: Date.now() - startedAt
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('rag_reindex_failed', detail);
    return { ok: false, error: 'reindex_failed', detail, cursor: safeCursor };
  }
}

/**
 * Probe de sante active et en lecture seule pour Vectorize (aucun
 * upsert/delete, contrairement a diagnoseRagPipeline ci-dessous) : confirme
 * que l'index repond reellement a une requete, independamment de toute
 * activite recente de recherche RAG. Sert a distinguer "le pipeline est
 * casse" de "personne n'a fait de recherche RAG recemment" cote
 * Observabilite (cf. buildSingleServiceHealth() dans worker-api.js, qui
 * decotait jusqu'ici le score rag_pipeline a la seule recence des
 * evenements rag_query/rag_match, meme quand Vectorize repondait
 * normalement). N'embarque jamais de cle d'embedding reelle : un vecteur
 * nul de la bonne dimension suffit a tester la connectivite/latence.
 */
export async function checkVectorizeHealth(env) {
  const provider = getVectorStoreProvider(env);
  if (!provider) {
    return {
      status: 'unconfigured',
      verification: 'partial',
      configured: false,
      ok: false,
      latency_ms: null,
      vectorize_error: 'missing_vector_index_binding',
      detail: 'VECTOR_INDEX non lié : binding Vectorize absent de ce Worker.'
    };
  }
  const startedAt = Date.now();
  try {
    const probeVector = new Array(getEmbeddingDimensions(env)).fill(0);
    await provider.query({ namespace: NAMESPACE, vector: probeVector, topK: 1 });
    return {
      status: 'operational',
      verification: 'partial',
      configured: true,
      ok: true,
      latency_ms: Date.now() - startedAt,
      vectorize_error: '',
      detail: 'Requête de lecture Vectorize (topK=1, vecteur nul) réussie — aucune écriture effectuée.'
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: 'degraded',
      verification: 'partial',
      configured: true,
      ok: false,
      latency_ms: Date.now() - startedAt,
      vectorize_error: detail,
      detail: `Requête de lecture Vectorize en échec : ${detail}`
    };
  }
}

/**
 * Diagnostic bout-en-bout, totalement independant d'OpenRouter : embedding,
 * upsert, requete, suppression d'un vecteur de test. Permet de valider le
 * pipeline RAG meme quand le LLM est indisponible (429/402 OpenRouter).
 */
function summarizeMatches(matches) {
  return (matches || []).map((match) => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata
  }));
}

export async function diagnoseRagPipeline(env) {
  const steps = {};
  const provider = getVectorStoreProvider(env);
  steps.provider = provider ? { ok: true } : { ok: false, error: 'vector_store_unavailable' };
  if (!provider) return { ok: false, steps };

  const testId = `__rag_diagnose__::${Date.now()}`;
  const testText = 'Ceci est un texte de test pour valider le pipeline RAG vectoriel.';
  const testMetadata = { documentId: testId, projectId: '__diagnose__', documentName: 'diagnose', chunkIndex: 0, locator: '' };

  let vector;
  try {
    vector = await embedText(env, testText);
    steps.embedding = vector ? { ok: true, dimensions: vector.length, vector_preview: vector.slice(0, 5) } : { ok: false, error: 'embedding_returned_null' };
  } catch (error) {
    steps.embedding = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!vector) return { ok: false, steps };

  const upsertPayload = { namespace: NAMESPACE, items: [{ id: testId, values: `[${vector.length} floats]`, metadata: testMetadata }] };
  steps.upsert_payload_sent = upsertPayload;

  try {
    await provider.upsert({
      namespace: NAMESPACE,
      items: [{ id: testId, values: vector, metadata: testMetadata }]
    });
    steps.upsert = { ok: true, id_sent: testId };
  } catch (error) {
    steps.upsert = { ok: false, error: error instanceof Error ? error.message : String(error), id_sent: testId };
    return { ok: false, steps };
  }

  // Vectorize est en coherence eventuelle : on attend 8s avant d'interroger,
  // comme demande, pour ecarter un simple probleme de delai de propagation.
  await new Promise((resolve) => setTimeout(resolve, 8000));

  steps.query_payload_sent = { namespace: NAMESPACE, vector_dimensions: vector.length, filter: null };

  // topK=5 est garde a titre INFORMATIF/regression uniquement : confirme
  // (cf. session de debug) qu'un topK trop bas peut ne pas retrouver un
  // vecteur tres recemment upserte alors qu'un topK plus large le retrouve
  // en premiere position. Ce n'est PAS un echec du pipeline en soi — voir
  // query_topk20, qui fait foi pour le statut `ok` global et pour
  // queryRag() en production (cf. const topK dans queryRag ci-dessus).
  try {
    const { matches, filterApplied } = await provider.query({ namespace: NAMESPACE, vector, topK: 5 });
    steps.query_topk5_informational = {
      matches_returned: matches.length,
      filter_applied: filterApplied,
      test_vector_found: matches.some((match) => match.id === testId),
      match_ids: matches.map((m) => m.id)
    };
  } catch (error) {
    steps.query_topk5_informational = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  // Requete faisant foi : topK large, exactement la strategie utilisee par
  // queryRag() en production. Le filtrage par projectId, le seuil de
  // similarite et la limite a maxPassages sont appliques APRES, cote
  // Worker (cf. queryRag) — jamais cote Vectorize avec un topK restrictif.
  try {
    const { matches, filterApplied } = await provider.query({ namespace: NAMESPACE, vector, topK: 20 });
    steps.query_topk20 = {
      ok: matches.some((match) => match.id === testId),
      matches_returned: matches.length,
      filter_applied: filterApplied,
      test_vector_found: matches.some((match) => match.id === testId),
      match_ids: matches.map((m) => m.id),
      matches: summarizeMatches(matches)
    };
  } catch (error) {
    steps.query_topk20 = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  try {
    await provider.deleteByIds({ namespace: NAMESPACE, ids: [testId] });
    steps.cleanup = { ok: true };
  } catch (error) {
    steps.cleanup = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const ok = Boolean(steps.embedding?.ok && steps.upsert?.ok && steps.query_topk20?.test_vector_found);
  return { ok, steps };
}
