const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Calcule un embedding via Workers AI. Indépendant du vector store choisi :
 * changer de modèle d'embedding n'a aucun rapport avec changer de backend
 * vectoriel (Vectorize/Pinecone/Qdrant/...). Ne lève jamais : retourne `null`
 * si `env.AI` est absent ou en erreur, pour ne jamais casser le chat.
 */
export async function embedText(env, text) {
  if (!env?.AI || !text) return null;
  try {
    const result = await env.AI.run(EMBEDDING_MODEL, { text: [String(text).slice(0, 4000)] });
    const vector = result?.data?.[0];
    return Array.isArray(vector) && vector.length ? vector : null;
  } catch (error) {
    console.warn('embed_text_failed', error instanceof Error ? error.message : String(error));
    return null;
  }
}
