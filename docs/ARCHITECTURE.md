# Architecture Cloudflare — Digital Blue Skye

## Workers actifs

| Worker | Fichier | Déploiement | Rôle |
|---|---|---|---|
| `digitalblueskye-api` | `cloudflare/worker-api.js` | `cloudflare/wrangler.api.toml` | Routes métier : commentaires (`article_comments`), contact, consentements, export, back-office admin (`/admin/*`), proxy santé vers le worker IA. Binding D1 `env.DB`. |
| `digitalblueskye-ai` | `cloudflare/worker-openrouter.js` | `cloudflare/wrangler.ai.toml` | Appels OpenRouter (LLM) et Tavily (recherche web) pour l'assistant IA. Appelé par `worker-api.js` via le binding de service `AI_WORKER`. |

`worker-api.js` et `worker-openrouter.js` communiquent via le binding `[[services]]` défini dans `wrangler.api.toml` (`binding = "AI_WORKER"`, `service = "digitalblueskye-ai"`).

## Fichiers legacy

| Fichier | Statut | Détails |
|---|---|---|
| `cloudflare/worker1.js` | **Déprécié** | Prototype créé dans le même commit initial que `worker2.js` (`5999843`). Non référencé par `wrangler.api.toml` ni `wrangler.ai.toml`. CORS reflète l'origine sans validation (vulnérabilité non corrigée, car non déployé). Référence en dur l'ancien hébergeur `digitalblueskye.infinityfreeapp.com` (pré-migration Netlify). |
| `cloudflare/worker2.js` | **Déprécié** | Version intermédiaire monolithique (API + appel OpenRouter dans un seul fichier), avant la scission en deux Workers séparés. Non référencé par aucune config Wrangler. |

Ces deux fichiers n'ont jamais fait l'objet de commits de développement dédiés après leur création — uniquement des remplacements mécaniques globaux (ex. renommage de domaine) qui les ont embarqués incidemment. Ils sont conservés pour mémoire historique mais peuvent être supprimés en toute sécurité après confirmation qu'ils ne servent à aucun rollback prévu.

## Base de données D1

Binding `env.DB` (database `digitalblueskye`), schéma défini dans `cloudflare/d1/schema.sql` :

- `article_comments` — commentaires du blog (réponses via `parent_id`, statuts `approved`/`pending`/`hidden`)
- `contact_messages` — formulaire de contact
- `consent_logs` — historique des consentements RGPD
- `ai_assistant_events` — télémétrie de l'assistant IA
- `tavily_search_dedupe` — cache de déduplication des recherches web Tavily

## Pile legacy non-Cloudflare

`backend/*.php`, `db/`, `config/` constituent une ancienne pile PHP/MySQL (héritage Hostinger, cf. `README-HOSTINGER-MIGRATION.md`) qui duplique une partie de la logique (commentaires, contact) sur un schéma distinct de celui de D1. Son statut exact (encore active en parallèle, ou totalement remplacée par la pile Cloudflare) reste à clarifier séparément.
