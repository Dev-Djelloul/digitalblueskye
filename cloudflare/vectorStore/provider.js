/**
 * Contrat que tout backend vectoriel doit respecter (Cloudflare Vectorize
 * aujourd'hui, Pinecone/Weaviate/Qdrant/pgvector demain). aiProjectManager.js
 * et ragPipeline.js ne dépendent jamais d'un provider concret, seulement de
 * cette forme :
 *
 * {
 *   upsert({ namespace, items }): Promise<void>
 *     items: Array<{ id: string, values: number[], metadata: object }>
 *
 *   query({ namespace, vector, topK, filter }): Promise<{ matches: Array<{ id, score, metadata }>, filterApplied: boolean }>
 *     filterApplied: false si le backend a ignore/echoue le filtre (ex.
 *     champ de metadata pas encore indexe cote Vectorize) et est retombe
 *     sur une recherche non filtree — l'appelant doit re-filtrer cote code
 *     si la precision exacte par filtre est requise.
 *
 *   deleteByIds({ namespace, ids }): Promise<void>
 *
 *   deleteByNamespace({ namespace }): Promise<void>
 * }
 *
 * `namespace` isole les vecteurs par usage (ex. "rag"). Un provider sans
 * support natif des namespaces le simule via un champ de metadata.
 */
export const VECTOR_STORE_CONTRACT_METHODS = ['upsert', 'query', 'deleteByIds', 'deleteByNamespace'];
