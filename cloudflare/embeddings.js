// Modele d'embedding configurable via env.EMBEDDING_MODEL. Le defaut reste
// bge-base-en-v1.5 (768 dims) tant que l'index Vectorize historique
// digitalblueskye-rag (cree en 768 dims) est actif : les dimensions d'un
// index Vectorize sont immuables, changer de modele exige un NOUVEL index +
// reindexation complete (cf. procedure de migration bge-m3 dans
// cloudflare/wrangler.ai.toml). bge-m3 (1024 dims) est fortement recommande
// pour ce site : il est multilingue, alors que bge-base-en-v1.5 est un
// modele anglais qui degrade la similarite sur les contenus francais.
const DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const MODEL_DIMENSIONS = {
  '@cf/baai/bge-base-en-v1.5': 768,
  '@cf/baai/bge-m3': 1024,
  '@cf/baai/bge-large-en-v1.5': 1024,
  '@cf/baai/bge-small-en-v1.5': 384
};

// Compat : dimension du modele par defaut. Prefere getEmbeddingDimensions(env)
// partout ou env est disponible.
export const EMBEDDING_DIMENSIONS = MODEL_DIMENSIONS[DEFAULT_EMBEDDING_MODEL];

export function getEmbeddingModel(env) {
  const configured = String(env?.EMBEDDING_MODEL || '').trim();
  return configured || DEFAULT_EMBEDDING_MODEL;
}

export function getEmbeddingDimensions(env) {
  const configured = Number(env?.EMBEDDING_DIMENSIONS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return MODEL_DIMENSIONS[getEmbeddingModel(env)] || EMBEDDING_DIMENSIONS;
}

/**
 * Calcule un embedding via Workers AI. Indépendant du vector store choisi :
 * changer de modèle d'embedding n'a aucun rapport avec changer de backend
 * vectoriel (Vectorize/Pinecone/Qdrant/...). Ne lève jamais : retourne `null`
 * si `env.AI` est absent ou en erreur, pour ne jamais casser le chat.
 */
export async function embedText(env, text) {
  if (!env?.AI || !text) return null;
  try {
    const result = await env.AI.run(getEmbeddingModel(env), { text: [String(text).slice(0, 4000)] });
    const vector = result?.data?.[0];
    return Array.isArray(vector) && vector.length ? vector : null;
  } catch (error) {
    console.warn('embed_text_failed', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Taille de lot alignee sur la limite Workers AI (100 textes max par appel
// pour les modeles bge) tout en restant prudente sur la taille de payload.
const EMBEDDING_BATCH_SIZE = 20;

/**
 * Version batch d'embedText pour l'indexation : un appel Workers AI par lot
 * de EMBEDDING_BATCH_SIZE textes au lieu d'un appel par chunk (l'ancienne
 * boucle sequentielle rendait l'indexation d'un document de 100 chunks ~20x
 * plus lente que necessaire). Retourne un tableau de la MEME longueur que
 * `texts` : chaque entree est le vecteur correspondant, ou `null` si ce texte
 * n'a pas pu etre vectorise (lot en erreur, texte vide...). Ne lève jamais.
 */
export async function embedTexts(env, texts) {
  const list = Array.isArray(texts) ? texts : [];
  if (!env?.AI || !list.length) return list.map(() => null);
  const vectors = new Array(list.length).fill(null);
  for (let start = 0; start < list.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = list.slice(start, start + EMBEDDING_BATCH_SIZE)
      .map((text) => String(text || '').slice(0, 4000));
    try {
      const result = await env.AI.run(getEmbeddingModel(env), { text: batch });
      const data = Array.isArray(result?.data) ? result.data : [];
      data.forEach((vector, offset) => {
        if (Array.isArray(vector) && vector.length) vectors[start + offset] = vector;
      });
    } catch (error) {
      console.warn('embed_texts_batch_failed', error instanceof Error ? error.message : String(error));
      // Repli unitaire : un lot en echec ne condamne pas tout le document.
      for (let offset = 0; offset < batch.length; offset += 1) {
        vectors[start + offset] = await embedText(env, batch[offset]);
      }
    }
  }
  return vectors;
}
