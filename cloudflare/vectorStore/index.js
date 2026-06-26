import { createCloudflareVectorizeProvider } from './cloudflareVectorizeProvider.js';

/**
 * Factory de provider vectoriel. Retourne `null` si aucun backend n'est
 * disponible/configuré — c'est le signal explicite pour les appelants
 * (ragPipeline.js) de retomber sur le fallback (RAG navigateur côté client).
 *
 * Pour ajouter un nouveau backend demain (Pinecone, Qdrant, Weaviate,
 * pgvector...) : créer `<nom>Provider.js` implémentant le contrat de
 * `provider.js`, puis ajouter un `case` ici. Aucune autre fonction du repo
 * n'a besoin de changer.
 */
export function getVectorStoreProvider(env) {
  const providerName = String(env?.VECTOR_STORE_PROVIDER || 'cloudflare-vectorize').trim();

  switch (providerName) {
    case 'cloudflare-vectorize': {
      if (!env?.VECTOR_INDEX) return null;
      return createCloudflareVectorizeProvider(env.VECTOR_INDEX);
    }
    default:
      return null;
  }
}
