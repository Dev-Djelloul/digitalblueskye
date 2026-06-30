# Knowledge Orchestrator

Digital Blue Skye Studio V3.2 introduit un composant central entre le Source Planner et le Prompt Orchestrator.

## Rôle

Le Knowledge Orchestrator reçoit la décision documentaire amont, interroge les sources actives, agrège les résultats, supprime les doublons, détecte les conflits, score la confiance et produit un contexte unique pour le Prompt Orchestrator.

Pipeline cible :

```text
Utilisateur
→ Intent Detection
→ Capability Planner
→ Source Planner
→ Knowledge Orchestrator
→ Context Builder
→ Prompt Orchestrator
→ Model Router
→ OpenRouter
→ Réponse finale
```

## Feature flags

```text
KNOWLEDGE_ORCHESTRATOR_ENABLED=true
KNOWLEDGE_OBSIDIAN_ENABLED=true
```

Si `KNOWLEDGE_ORCHESTRATOR_ENABLED` est absent ou faux, le chat conserve le flux historique. Si `KNOWLEDGE_OBSIDIAN_ENABLED` est faux, le connecteur Obsidian n'est pas enregistré.

## Modules

- `cloudflare/knowledge/contracts.js`
- `cloudflare/knowledge/sourceRegistry.js`
- `cloudflare/knowledge/knowledgeOrchestrator.js`
- `cloudflare/knowledge/contextBuilder.js`
- `cloudflare/knowledge/ranking.js`
- `cloudflare/knowledge/deduplication.js`
- `cloudflare/knowledge/conflictResolver.js`
- `cloudflare/knowledge/sources/*`

## Endpoints IA

- `POST /knowledge/query`
- `POST /knowledge/index`
- `POST /knowledge/refresh`
- `GET /knowledge/document/:id`
- `GET /knowledge/health`

## Endpoints admin

- `GET /admin/knowledge`
- `GET /admin/knowledge/sources`
- `GET /admin/knowledge/health`
- `GET /admin/knowledge/sync`
- `GET /admin/knowledge/conflicts`
- `GET /admin/knowledge/queries`
- `POST /admin/knowledge/sources/:id/refresh`

## Stockage

D1 conserve les sources, documents, chunks, tags, liens, conflits, sync states et requêtes. Vectorize conserve les embeddings avec namespaces par source.

Namespaces prévus :

```text
knowledge:obsidian:vault_1
knowledge:rag
knowledge:tavily-cache
knowledge:project-memory
```

## Déploiement

Appliquer le schéma D1 :

```bash
wrangler d1 execute digitalblueskye --config cloudflare/wrangler.api.toml --file cloudflare/d1/schema.sql
```

Déployer :

```bash
wrangler deploy --config cloudflare/wrangler.ai.toml
wrangler deploy --config cloudflare/wrangler.api.toml
```
