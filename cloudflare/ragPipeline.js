import { getVectorStoreProvider } from './vectorStore/index.js';
import { embedText } from './embeddings.js';

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
export async function indexDocumentChunks(env, { documentId, projectId, documentName, chunks }) {
  const provider = getVectorStoreProvider(env);
  if (!provider) return { ok: false, error: 'vector_store_unavailable' };
  if (!documentId || !Array.isArray(chunks) || !chunks.length) {
    return { ok: false, error: 'invalid_payload' };
  }

  const items = [];
  const d1Rows = [];
  for (const chunk of chunks) {
    const text = String(chunk?.text || '').trim();
    if (!text) continue;
    const vector = await embedText(env, text);
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
         ON CONFLICT(id) DO UPDATE SET text = excluded.text, locator = excluded.locator, document_name = excluded.document_name`
      ).bind(row.id, documentId, projectId || null, documentName || '', row.chunkIndex, row.locator, row.text).run()));
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
    if (env?.DB) await env.DB.prepare('DELETE FROM rag_chunks WHERE document_id = ?').bind(documentId).run();
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
export async function queryRag(env, { query, projectId, includeGlobalLibrary, maxPassages, similarityThreshold }) {
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
    const filter = includeGlobalLibrary
      ? undefined
      : { projectId: projectId || '' };
    const { matches, filterApplied } = await provider.query({ namespace: NAMESPACE, vector, topK, filter });
    // Si Vectorize a ignore le filtre (champ de metadata pas encore indexe
    // via `wrangler vectorize create-metadata-index`), on re-filtre cote
    // code pour ne pas mélanger les documents d'autres projets.
    const scoped = (filter && !filterApplied)
      ? matches.filter((match) => match.metadata?.projectId === (projectId || ''))
      : matches;
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
