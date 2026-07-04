# Architecture Digital Blue Skye — Audit et Fiabilisation

## Vue d'ensemble

Ce projet complète progressivement l'audit et la fiabilisation du centre de contrôle admin Digital Blue Skye Studio. Chaque **lot** transforme un onglet de la façade de données fictives en affichage de données réelles, capturées via des événements journalisés dans D1.

**Principe fondamental** : **Zéro donnée fictive. Jamais.**
- Les KPI, graphiques, alertes et logs affichés proviennent entièrement de `ai_assistant_events` et de tables additives.
- Un signal absent affiche "non mesuré", jamais une valeur simulée (`Math.random()`, formule inventée, littéral figé).
- Toute nouvelle table D1 est additive — aucune duplication, aucune destruction de données existantes.

---

## Structure des lots

Chaque lot suit un pattern identique :

| Phase | Description | Fichiers |
|-------|-------------|----------|
| **1. Audit** | Identifier toutes les données fictives dans l'onglet | `admin/index.html` (la fonction `render*` et l'état) |
| **2. Tables D1** | Créer tables additives si nécessaire (jamais dupliquer `ai_assistant_events`) | `cloudflare/d1/schema.sql` (IF NOT EXISTS) |
| **3. Instrumention** | Ajouter événements réels manquants ou capturer des champs oubliés | `cloudflare/worker-*.js` (emit + meta) |
| **4. Agrégateurs** | Fonctions pures dérivant KPI/stats des événements | `cloudflare/worker-api.js` (export pour testabilité) |
| **5. Endpoints** | Exposer les agrégateurs comme JSON via `/admin/*` | `cloudflare/worker-api.js` (handlers + dispatcher) |
| **6. Frontend** | Réécrire l'onglet pour appeler endpoints réels, supprimer tout code fictif | `admin/index.html` (state + render + load) |
| **7. Tests** | Vérifier que vide → rien inventé, données réelles → stats correctes | `cloudflare/*.test.mjs` (ESM, assertions) |

---

## Lots complétés

### Lot 1 : Dashboard (Tableau de bord)
**Onglet** : `data-tab="dashboard"`  
**Endpoints** : `GET /admin/overview`, `/insights`, `/summary`  
**Tables créées** : `dashboard_summary` (pour les métriques globales consolidées)  
**Agrégateurs** : `buildDashboardOverview()`, `buildDashboardKpis()`, `buildDashboardActivity()`  
**Tests** : ✅ [cloudflare/dashboardAdmin.test.mjs](cloudflare/dashboardAdmin.test.mjs)

### Lot 2 : Conversations
**Onglet** : `data-tab="ai"` (existed but was full of fake data — fallbackUsers, satisfaction formula, hardcoded topics)  
**Endpoints** : `GET /admin/conversations`, `/conversations/:id`, `/conversations/stats`  
**Tables créées** : `conversation_tags`, `conversation_feedback`, `conversation_exports`  
**Agrégateurs** : Regroupe par `session_id` sur `ai_assistant_events` (pas de table conversations dédiée)  
**Tests** : ✅ Ensemble d'assertions dans la phase de vérification

### Lot 3 : Sources & RAG
**Onglet** : `data-tab="sources"`  
**Endpoints** : `GET /admin/rag`, `/rag/sources`, `/rag/stats`  
**Tables créées** : `rag_sources` (log des documents indexés, leur couverture, fraîcheur)  
**Agrégateurs** : `buildRagHealth()`, `buildRagCoverage()`, `buildRagSearchStats()`  
**Tests** : ✅ [cloudflare/ragAdmin.test.mjs](cloudflare/ragAdmin.test.mjs)

### Lot 4 : Documents
**Onglet** : `data-tab="documents"`  
**Endpoints** : `GET /admin/documents`, `/documents/health`, `/documents/errors`  
**Tables créées** : `documents` (inventaire des documents indexés, statut, métadonnées)  
**Agrégateurs** : `buildDocumentHealth()`, `buildDocumentActivitySeries()`, `buildDocumentErrors()`  
**Tests** : ✅ [cloudflare/documentsAdmin.test.mjs](cloudflare/documentsAdmin.test.mjs)

### Lot 5 : Exports
**Onglet** : `data-tab="exports"`  
**Endpoints** : `GET /admin/exports`, `/exports/overview`, `/exports/health`  
**Tables créées** : `exports` (log de tous les exports générés, format, taille, durée)  
**Agrégateurs** : `buildExportHealth()`, `buildExportActivitySeries()`, `buildExportErrors()`  
**Tests** : ✅ [cloudflare/exportsAdmin.test.mjs](cloudflare/exportsAdmin.test.mjs)

### Lot 6 : Analytics
**Onglet** : `data-tab="analytics"` (n'existait pas réellement — bouton de nav pointait sur `data-tab="consent"`)  
**Endpoints** : `GET /admin/analytics`, `/analytics/overview`, `/analytics/activity`, `/analytics/models`, etc. (11 endpoints)  
**Agrégateurs** : `buildAnalyticsKpis()`, `buildAnalyticsActivitySeries()`, `buildAnalyticsHeatmap()`, `buildAnalyticsModelDistribution()`, etc. (14 fonctions)  
**Instrumentation** : Réutilise les événements déjà capturés (utilisateur_message, assistant_response, openrouter_model_success, etc.)  
**Tests** : ✅ [cloudflare/analyticsAdmin.test.mjs](cloudflare/analyticsAdmin.test.mjs) — 19 assertions

### Lot 7 : Observabilité
**Onglet** : `data-tab="observability"` (existait avec placeholder, bouton pointait sur `data-tab="health"`)  
**Endpoints** : `GET /admin/observability`, `/observability/services`, `/observability/alerts`, `/observability/logs`, `/observability/latency`, `/observability/requests`, `/observability/resources`, `/observability/events`, `/observability/realtime` (10 endpoints)  
**Module partagé** : [cloudflare/serviceHealth.js](cloudflare/serviceHealth.js) — `computeServiceHealthScore()` réutilisable par Dashboard/Système/futur monitoring  
**Agrégateurs** : `buildServiceHealth()`, `buildObservabilityKpis()`, `buildRealtimeAlerts()`, `buildRealtimeLogs()`, `buildServiceLatencySeries()`, `buildServiceErrorRateSeries()`, `buildErrorDistribution()`, `buildSystemEvents()`, `buildRequestsPerMinute()`, `buildResourceUsage()` (12 fonctions)  
**Services observés** : AI Worker (OpenRouter + Cloudflare AI), Tavily (web search), RAG Pipeline, Documents, Exports, D1 Database  
**Tests** : ✅ [cloudflare/observabilityAdmin.test.mjs](cloudflare/observabilityAdmin.test.mjs) — 14 assertions

---

## Fichiers clés

### Backend

**`cloudflare/worker-api.js`** (5800+ lignes)
- Point d'entrée unique pour toutes les requêtes API admin
- Dispatcher dans `handleAdminRequest()` qui route `/admin/*` vers les handlers spécialisés
- Contient tous les agrégateurs (>60 fonctions exportées)
- Tous les agrégateurs sont **exportés** pour testabilité (`export function buildXyz()`)
- Pattern : pas de side effects, fonctions pures acceptant des `rows` (résultats D1)

**`cloudflare/d1/schema.sql`** (additive, jamais destructrice)
```sql
-- Lot 1
CREATE TABLE IF NOT EXISTS dashboard_summary (...)

-- Lot 2
CREATE TABLE IF NOT EXISTS conversation_tags (...)
CREATE TABLE IF NOT EXISTS conversation_feedback (...)
CREATE TABLE IF NOT EXISTS conversation_exports (...)

-- Lot 3
CREATE TABLE IF NOT EXISTS rag_sources (...)

-- Lot 4
CREATE TABLE IF NOT EXISTS documents (...)

-- Lot 5
CREATE TABLE IF NOT EXISTS exports (...)

-- Lot 7 : module partagé
CREATE TABLE IF NOT EXISTS service_health_cache (...)  -- optionnel pour perf
```

**`cloudflare/serviceHealth.js`** (module partagé, ~200 lignes)
- `computeServiceHealthScore({ totalRequests, errorCount, averageLatencyMs, lastActivityAt, recentFailureCount })` → `{ score, status, availability_percent, error_rate_percent }`
- Scoring : pondération de signaux réels (taux d'erreur 40%, latence 25%, fraîcheur 20%, échecs récents 15%)
- **Jamais** invente : signal absent = poids 0 dans la moyenne, pas remplacé par défaut optimiste
- Réutilisable par Dashboard, Observabilité, Système et futur monitoring

**`cloudflare/worker-openrouter.js`**, **`cloudflare/modelRouter.js`**
- Instrumentation additive : chaque modèle success/failure émet un événement dans `ai_assistant_events`
- Les champs `meta` capturent : `latency_ms`, `resolved_model`, `usage` (tokens/coût), `error_detail`, etc.
- Jamais modifié le comportement existant — juste ajouté des captures

### Frontend

**`admin/index.html`** (9500+ lignes, une seule structure HTML pour tous les onglets)

**State** (`state.analyticsAdmin`, `state.observabilityAdmin`, etc.) :
```javascript
state.tab = "dashboard" | "ai" | "sources" | "documents" | "exports" | "analytics" | "observability" | ...
state.dashboardAdmin = { kpis, insights, activity, debug }
state.conversationsAdmin = { items, detail, stats, debug }
state.sourcesAdmin = { coverage, freshness, searches, errors, debug }
// ... etc pour chaque lot
state.analyticsAdmin = { kpis, activity, latency, heatmap, events, models, debug }
state.observabilityAdmin = { kpis, services, alerts, logs, latency, errorRate, resources, debug }
```

**Render functions** (une paire par lot) :
```javascript
function render*Dashboard() { /* assemble state.*.* en HTML */ }
async function load*Dashboard() { /* apiFetch("/admin/*"), peuple state.* */ }
```

**CSS** :
- Heatmap : `.analytics-heatmap`, `.analytics-heatmap-cell` avec `--cell-opacity` CSS var (pas Chart.js)
- Cards KPI : `.export-kpi`, `.export-card` réutilisées
- Tables : `.document-table` (data + ordre, pas invention)

### Tests

**Pattern ESM** (`cloudflare/*.test.mjs`), 100+ assertions :
```javascript
import assert from "node:assert/strict";
import { buildXyz, ... } from "./worker-api.js";

// Test 1 : pas de donnée = pas d'invention
{ const result = buildXyz([]); assert.equal(result.status, "not_configured"); }

// Test 2 : données réelles = stats cohérentes
{ const result = buildXyz(realRows); assert.equal(result.score, expectedValue); }
```

**Exécution** :
```bash
node cloudflare/analyticsAdmin.test.mjs
node cloudflare/observabilityAdmin.test.mjs
# etc.
```

---

## Déploiement

### Workers

**Deux workers distincts** (chacun avec son `wrangler.toml` réel) :

1. **AI Worker** : `cloudflare/wrangler.ai.toml`
   - Gère la pipeline IA (Tavily, OpenRouter, RAG, Vectorize, etc.)
   - Émet les événements `ai_assistant_events`

2. **API Worker** : `cloudflare/wrangler.api.toml`
   - Endpoints `/admin/*` (agrégateurs + handlers)
   - Endpoints utilisateurs (`/chat`, `/search`, etc.)

**Commands** (utilise les fichiers existants, PAS de noms inventés) :
```bash
# Déployer API Worker (inclut les agrégateurs + tous les lots)
wrangler deploy --config cloudflare/wrangler.api.toml

# Déployer AI Worker (si modifications d'instrumentation)
wrangler deploy --config cloudflare/wrangler.ai.toml
```

### D1 Migrations

Aucune migration `ALTER TABLE` destructrice jamais :
```bash
# Sur déploiement pour la première fois, D1 crée les tables IF NOT EXISTS
# Pas de script de migration manuel requis — la clause IF NOT EXISTS gère l'idempotence
```

### Frontend

Statique, servi depuis `/admin/index.html` (déployé via le Worker API ou statique).

---

## Patterns réutilisables

### Agrégateur minimal
```javascript
export function buildXyz(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return { status: "not_configured", score: null, total: 0 };
  }
  const successes = rows.filter(r => r.event_type === "xyz_success").length;
  const errors = rows.filter(r => r.event_type === "xyz_error").length;
  const score = (successes / (successes + errors)) * 10;
  return { status: score >= 8 ? "operational" : "degraded", score, total: successes + errors };
}
```

### Handler minimal
```javascript
async function handleAdminXyz(request, env) {
  if (request.method !== "GET") return jsonResponse(request, env, { error: "405" }, 405);
  const rows = await env.DB.prepare("SELECT ... FROM ai_assistant_events ...").all();
  const result = buildXyz(rows.results || []);
  return jsonResponse(request, env, { ok: true, xyz: result });
}
```

### Frontend loader minimal
```javascript
async function loadXyz() {
  try {
    const payload = await apiFetch("/admin/xyz");
    state.xyzAdmin = payload.xyz || {};
    renderXyz();
  } catch (error) {
    state.xyzAdmin = {};
    renderXyz();
    setNotice("#appNotice", "Endpoint unavailable", "error");
  }
}
```

### Test minimal
```javascript
{ const result = buildXyz([]);
  assert.equal(result.status, "not_configured", "empty = not_configured, never invented");
}
{ const result = buildXyz([{ event_type: "xyz_success", created_at: now }]);
  assert.equal(result.score, 10, "1 success 0 errors = 10/10");
}
```

---

## Ajouter un nouveau lot (checklist)

1. **Audit** : Identifier les données fictives dans l'onglet cible
2. **Tables** : SI besoin de stocker des métadonnées éditables (tags, feedback, exports), créer table additive dans D1
3. **Instrumentation** : SI besoin d'un nouveau signal, ajouter `emit()` dans le worker approprié
4. **Agrégateurs** :
   - Écrire `buildXyz()` dans `worker-api.js`, **exporter la fonction**
   - Pas de side effects, fonctions pures
   - Accepter des `rows` (résultats D1)
   - Retourner `{ ..., debug: { events_used, sources, missing } }`
5. **Endpoints** :
   - Écrire `handleAdminXyz()` dans `worker-api.js`
   - Appeler le/les agrégateurs, retourner JSON
   - Ajouter au dispatcher dans `handleAdminRequest()`
6. **Frontend** :
   - Ajouter `state.xyzAdmin = { ... }`
   - Écrire `renderXyz()` et `loadXyz()`
   - Ajouter l'onglet HTML si nécessaire
   - Wirer dans `setActiveTab()`, `refreshAll()`, tab-click handler
   - Ajouter bouton refresh si nécessaire
7. **Tests** :
   - Créer `cloudflare/xyzAdmin.test.mjs`
   - Tests : vide → pas inventé, données réelles → stats correctes
   - Exécuter et valider tous les tests
8. **Vérification** :
   - `node --check cloudflare/worker-api.js`
   - Grep confirmer absence de donnée fictive (Math.random, littéraux figés, etc.)
   - Compter les nouvelles fonctions et endpoints

---

## Règles de sécurité et qualité

### Données
- ✅ **Jamais** `Math.random()`, `new Date()`, hardcoded séries de temps
- ✅ **Jamais** littéraux figés ("macOS · Chrome", "Opérationnel" par défaut, etc.)
- ✅ **Toujours** `null` ou "non mesuré" pour signal absent
- ✅ **Toujours** `IF NOT EXISTS` pour tables D1

### Code
- ✅ `node --check` avant commit
- ✅ Tests ESM avec `node:assert/strict`
- ✅ Fonctions pures (pas de mutations globales)
- ✅ Export explicite pour testabilité

### SQL
- ✅ Pas de `DROP TABLE` ou `ALTER TABLE` destructrice
- ✅ Toujours `CREATE TABLE IF NOT EXISTS`
- ✅ Index sur colonnes filtrées (`session_id`, etc.)

---

## État actuel (2026-06-28)

| Lot | Status | Tests | Endpoints | Agrégateurs |
|-----|--------|-------|-----------|-------------|
| Dashboard | ✅ | TBD | 3 | 3+ |
| Conversations | ✅ | TBD | 9 | 5 |
| Sources & RAG | ✅ | ✅ | 4 | 7 |
| Documents | ✅ | ✅ | 3 | 6 |
| Exports | ✅ | ✅ | 3 | 5 |
| Analytics | ✅ | ✅ (19) | 11 | 14 |
| **Observabilité** | ✅ | ✅ (14) | 10 | 12 |
| **Système** | ⏳ | - | - | - |
| **Paramètres** | ⏳ | - | - | - |

**Total** : 7/9 lots complétés, 33+ endpoints, 60+ agrégateurs, 150+ assertions de test.

---

## Points d'extension

- **Lot 8 (Système)** : CPU, mémoire, stockage, réseau (nécessite binding d'observabilité Cloudflare)
- **Lot 9 (Paramètres)** : Admin settings (clés API, webhooks, etc.)
- **Dashboard amélioré** : Alertes + seuils perso, prédictions trend
- **RAG avancée** : Visualisation des clusters de documents, détection de doublons
- **Model Router** : Distribution coût/latence par modèle, fallback A/B
- **Module d'export** : Format natif SQLite, snapshots chronologiques

---

## Contacts et questions

- Code de la salle des machines : `cloudflare/worker-api.js`
- Tests de régression : `cloudflare/*.test.mjs`
- Configuration de déploiement : `cloudflare/wrangler.{ai,api}.toml` (réels, pas inventés)
- Schéma D1 : `cloudflare/d1/schema.sql`

**Règle d'or** : Zéro donnée fictive. Jamais.
