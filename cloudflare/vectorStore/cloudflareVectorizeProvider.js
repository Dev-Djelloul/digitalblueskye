/**
 * Implémentation du contrat vectorStore/provider.js pour Cloudflare Vectorize.
 * Vectorize n'a pas de namespaces natifs : on filtre/marque par un champ de
 * metadata `namespace` pour simuler la même sémantique que les autres
 * backends possibles.
 */
export function createCloudflareVectorizeProvider(index) {
  return {
    async upsert({ namespace, items }) {
      if (!items?.length) return;
      const vectors = items.map((item) => ({
        id: item.id,
        values: item.values,
        metadata: { ...item.metadata, namespace }
      }));
      await index.upsert(vectors);
    },

    async query({ vector, topK, filter }) {
      // Vectorize exige un index de metadata cree explicitement
      // (`wrangler vectorize create-metadata-index ... --property-name=X`)
      // pour filtrer sur un champ. Si le filtre echoue (champ non indexe),
      // on retente une seule fois sans filtre plutot que de faire echouer
      // toute la recherche silencieusement.
      const runQuery = (withFilter) => index.query(vector, {
        topK: topK || 10,
        ...(withFilter && filter ? { filter } : {}),
        returnMetadata: true
      });

      let result;
      let filterApplied = Boolean(filter);
      try {
        result = await runQuery(true);
      } catch (error) {
        if (!filter) throw error;
        console.warn('vectorize_filtered_query_failed_retrying_without_filter', error instanceof Error ? error.message : String(error));
        filterApplied = false;
        result = await runQuery(false);
      }

      return {
        matches: (result?.matches || []).map((match) => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata || {}
        })),
        filterApplied
      };
    },

    async deleteByIds({ ids }) {
      if (!ids?.length) return;
      await index.deleteByIds(ids);
    },

    async deleteByNamespace({ namespace, knownIds }) {
      // Vectorize ne supporte pas un delete-by-filter direct : on s'appuie
      // sur la liste d'ids déjà connue par l'appelant (ex. depuis D1).
      if (knownIds?.length) await index.deleteByIds(knownIds);
    }
  };
}
