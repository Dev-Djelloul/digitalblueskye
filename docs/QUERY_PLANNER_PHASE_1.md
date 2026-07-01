# Query Planner Phase 1

Cette phase ajoute `cloudflare/queryPlanner.js` en mode ombre. Le module est
execute sur chaque requete chat, mais sa sortie n'est pas utilisee pour
repondre a l'utilisateur.

## Decisions prises

`queryPlanner` decide uniquement :

- `useRag`
- `useWeb`
- `forceRag`
- `forceWeb`
- `sourceBudget`
- `documentTarget`
- `retrievalMode`: `normal`, `tail`, `section`, `none`

Il ne decide pas le style, le niveau de detail, le format final, les tableaux,
la conclusion, l'analyse metier ou le raisonnement final. Ces choix restent au
LLM et au prompt systeme existant.

## Mode ombre

Le Worker calcule l'ancien pipeline normalement, puis calcule `queryPlanner`.
Il journalise une comparaison dans `ai_assistant_events` :

- `query_planner_shadow_compared`
- `query_planner_shadow_divergence` si au moins un champ differe
- `query_planner_shadow_error` si le module echoue

Aucun comportement utilisateur ne change pendant cette phase.

## Modules candidats a suppression ulterieure

Apres une periode de mesure stable, les decisions suivantes pourront etre
progressivement basculees vers `queryPlanner` :

- decision RAG / Web issue de `decideWebSearch`
- decisions redondantes de `capabilityPlanner`
- decisions redondantes de `sourcePlanner`
- arbitrage `executionPlanner`
- traduction d'outils `toolPlanner`

Ces suppressions ne font pas partie de la Phase 1.
