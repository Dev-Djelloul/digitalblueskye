# Knowledge Orchestrator — activation progressive : batterie de tests manuels

État ciblé : `KNOWLEDGE_ORCHESTRATOR_ENABLED=true`, `KNOWLEDGE_OBSIDIAN_ENABLED=false`.
Sources actives dans le chat : RAG (`rag`), Project Memory (`project_memory`).
Tavily continue de fonctionner via le pipeline web-search legacy (séparé de l'orchestrateur, cf. audit).

Pour chaque test : envoyer la requête via le chat, puis lire les logs Workers
(`knowledge_orchestrator_debug`, nécessite `DEBUG=true`) ou `GET /admin/health`
(champ `knowledge_orchestrator.debug_last_query`, même condition).

| # | Scénario | Sources attendues (sélectionnées) | Sources ignorées | Confiance attendue | Citations attendues |
|---|---|---|---|---|---|
| 1 | Question simple, générique, sans contexte projet ("Bonjour, peux-tu te présenter ?") | `project_memory` (toujours inclus par défaut) | `rag` (rien à matcher), `tavily` (pas de requête web) | Faible (peu/pas de chunks pertinents) | Aucune ou minimales |
| 2 | Question ciblant explicitement un document du projet indexé en RAG | `rag`, `project_memory` | `tavily` | Moyenne à élevée selon le score de similarité | Citations `[RAG: <nom_document>]` |
| 3 | Question nécessitant une info récente/web ("actualité de cette semaine") | Aucune côté orchestrateur (RAG/PM peu pertinents) ; `tavily` répond via le pipeline legacy, **hors orchestrateur** | `rag` (si aucun match documentaire) | Faible côté orchestrateur ; la réponse finale dépend du résultat Tavily legacy | Pas de citation orchestrateur ; éventuellement liens Tavily injectés par le pipeline legacy |
| 4 | Question mélangeant un besoin documentaire interne ET une actualité externe | `rag`, `project_memory` (orchestrateur) + `tavily` (legacy, en parallèle conceptuel mais exécuté séquentiellement après) | — | Moyenne (deux contextes combinés dans le prompt final, pas fusionnés par l'orchestrateur) | Citations RAG + résultats Tavily legacy, non dédupliqués entre eux |
| 5 | Question portant sur la mémoire de session/projet ("rappelle-moi ce qu'on a dit sur X plus tôt") | `project_memory` | `rag` (si rien d'indexé sur le sujet), `tavily` | Moyenne, dépend du contenu de `projectMemory` transmis | Pas de citation formelle (project_memory n'a pas de `citation` documentaire au même titre que RAG) |
| 6 | Question sans rapport avec un quelconque corpus interne ni actualité ("calcule 12*7") | Aucune source utile retenue ; `project_memory` reste interrogé (toujours actif) mais vide | `rag`, `tavily` | Très faible / `null` si aucun chunk sélectionné | Aucune |
| 7 | Question nécessitant plusieurs documents RAG différents (synthèse transverse) | `rag` (plusieurs chunks/documents), `project_memory` | `tavily` | Moyenne à élevée si les documents convergent | Plusieurs citations `[RAG: ...]`, une par document distinct |
| 8 | Question avec conflit volontaire (deux passages RAG indexés avec des affirmations contradictoires sur le même sujet) | `rag`, `project_memory` | `tavily` | Doit baisser par rapport à un cas sans conflit (le `contextBuilder` doit signaler l'incertitude) | Citations des deux passages en conflit + entrée dans `conflicts` (vérifiable via `knowledge_conflicts` en D1 ou le debug snapshot `conflicts_detected > 0`) |
| 9 | Question très longue (> 1000 caractères, plusieurs paragraphes) | Dépend du contenu, mais `rag`/`project_memory` doivent rester opérationnels sans timeout | `tavily` (sauf si intention web détectée) | Variable | Selon les passages matchés ; vérifier qu'aucune erreur de timeout n'apparaît dans `sources_queried[].error` |
| 10 | Question avec budget tokens explicitement limité (`tokenBudget` bas côté client, ou contexte déjà volumineux dans `maxTokens`) | `rag`, `project_memory` mais avec **moins de chunks retenus** que pour la même question sans contrainte | `tavily` | Potentiellement plus faible (moins de contexte injecté) | Moins de citations que le test #7 équivalent ; vérifier `telemetry.token_budget_used <= token_budget` et `chunks_selected` réduit |

## Ce qu'il faut vérifier après chaque test (via le debug snapshot)

- `sources_selected` correspond aux sources attendues dans le tableau.
- `sources_queried[].ok === true` pour `rag` et `project_memory` (pas d'erreur réseau/D1/Vectorize).
- `sources_queried[].latency_ms` reste dans un ordre de grandeur raisonnable (quelques centaines de ms pour `rag`, quasi instantané pour `project_memory`). Une latence anormalement haute sur plusieurs tests d'affilée est un signal d'alerte avant la phase 5.
- `conflicts_detected` n'est `> 0` que sur le test #8.
- `token_budget_used <= token_budget` systématiquement.
- Aucune information du snapshot (`knowledge_orchestrator_debug`) n'apparaît dans la réponse visible par l'utilisateur final — seul `contextBlock`/citations doivent influencer la réponse texte, jamais la télémétrie brute.

## Comment activer la visibilité de ces résultats

```bash
# Activer temporairement le mode debug sur le worker IA
wrangler secret put DEBUG -c cloudflare/wrangler.ai.toml
# saisir "true" quand demandé

# Suivre les logs en direct pendant les tests manuels
wrangler tail digitalblueskye-ai --format pretty

# Ou consulter le dernier snapshot capturé par l'isolate courant
curl -s -H "X-Health-Check-Token: $HEALTH_CHECK_TOKEN" \
  https://digitalblueskye-ai.<account>.workers.dev/admin/health \
  | jq '.knowledge_orchestrator.debug_last_query'
```

Penser à repasser `DEBUG` à `false` (ou supprimer le secret) une fois la
batterie de tests validée, pour ne pas garder une télémétrie verbeuse en
production au-delà de la phase de validation.
