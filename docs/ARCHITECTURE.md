# Architecture Cloudflare — Digital Blue Skye

## Workers actifs

| Worker | Fichier | Déploiement | Rôle |
| --- | --- | --- | --- |
| `digitalblueskye-api` | `cloudflare/worker-api.js` | `cloudflare/wrangler.api.toml` | Routes métier : commentaires (`article_comments`), contact, consentements, export, back-office admin (`/admin/*`), proxy santé vers le worker IA. Binding D1 `env.DB`. |
| `digitalblueskye-ai` | `cloudflare/worker-openrouter.js` | `cloudflare/wrangler.ai.toml` | Appels OpenRouter (LLM) et Tavily (recherche web) pour l'assistant IA. Appelé par `worker-api.js` via le binding de service `AI_WORKER`. |

`worker-api.js` et `worker-openrouter.js` communiquent via le binding `[[services]]` défini dans `wrangler.api.toml` (`binding = "AI_WORKER"`, `service = "digitalblueskye-ai"`).

## Fichiers legacy

| Fichier | Statut | Détails |
| --- | --- | --- |
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

## Pile PHP/MySQL legacy

Deux générations distinctes de backend PHP coexistent dans le dépôt. **Aucune des deux n'est exécutée en production** dans l'architecture actuelle (Netlify statique + Cloudflare Workers + D1) : Netlify ne fait tourner aucun runtime PHP, donc ces fichiers ne répondent à aucune requête sur le site live.

### Génération A — racine du projet

- `contact-submit.php`, `export-csv.php`
- `config/contact-db.php`, `config/export-token.php` (connexion DB minimale via variables d'env, pas de secret en dur)
- `db/contact_messages.sql` — schéma de table, orphelin (non référencé par aucun autre fichier)

C'est la version la plus ancienne, antérieure au backend `backend/` plus développé.

### Génération B — `backend/`

- `backend/ai-assistant.php`, `backend/comments.php`, `backend/consent.php`, `backend/db.php`, `backend/config.php`
- `backend/schema.sql` + `backend/migrations/*.sql`
- `backend/README.md` documente explicitement une cible **InfinityFree (hébergement mutualisé PHP) + XAMPP en local**, voir aussi `backend/README-LEGACY.md`

### Précision importante : routes "compatibles" servies par le Worker, pas par PHP

Certains chemins `.php` restent utilisés par le front-end (`pages/contact.html`, `scripts/comments.js`, `scripts/translator.js`, `scripts/theme-switcher.js`, `scripts/loader.js`) :

- `/contact-submit.php`
- `/backend/comments.php`
- `/backend/consent.php`
- `/export-csv.php`

Ces noms de route sont conservés par compatibilité, mais les requêtes sont en réalité envoyées à `https://digitalblueskye-api.djelloulabid75.workers.dev` (ou à `window.DBS_API_BASE`), où **`cloudflare/worker-api.js` implémente lui-même ces routes** (voir son routeur, ex. `if (pathname === "/contact-submit.php") return await handleContactSubmit(...)`). Les fichiers PHP réels ne sont donc jamais appelés par le site en production.

**Exception à surveiller** : `export-csv.html` construit son URL d'export en chemin relatif (`/export-csv.php?...`) sans passer par la base URL du Worker, contrairement aux autres fichiers front cités ci-dessus. Sur le domaine Netlify réel, ce chemin n'existe pas (pas de runtime PHP, pas de redirection `_redirects`/ `netlify.toml` trouvée) — l'export semble donc potentiellement cassé en production. Ce point n'est pas corrigé ici ; à traiter dans une étape fonctionnelle séparée.

### Statut

| Élément | Statut |
| --- | --- |
| Génération A (racine + `config/` + `db/`) | Legacy, non exécutée en prod, bandeau `@deprecated` ajouté sur les fichiers PHP principaux |
| Génération B (`backend/`) | Legacy, non exécutée en prod, bandeau `@deprecated` ajouté sur les fichiers PHP principaux, voir `backend/README-LEGACY.md` |
| Routes compatibles (`/contact-submit.php`, `/backend/*.php`, `/export-csv.php`) | Actives, mais servies par `cloudflare/worker-api.js` |
| `export-csv.html` | Référence un chemin potentiellement cassé en prod — à traiter séparément |

## Dépendances CDN de l'assistant IA (SRI)

`scripts/ai-assistant.js` charge dynamiquement plusieurs librairies tierces versionnées (export PDF, OCR, import PDF/DOCX/XLSX, export ZIP). Une constante `SRI_HASHES` centralise les hash SHA-384 (`integrity` + `crossOrigin="anonymous"`) appliqués à ces scripts au moment de leur injection dans le DOM : html2pdf.js, jsPDF, Tesseract.js, pdf.js (script principal), mammoth.js, SheetJS/xlsx, JSZip.

Deux exceptions volontaires, sans SRI :

- **`apis.google.com/js/api.js`** (Google Picker) — exclu car cette URL peut servir un contenu dynamique côté Google, incompatible avec un hash figé.
- **`pdf.worker.min.js`** — exclu car il n'est jamais chargé via une balise `<script>` : sa seule utilisation est une assignation de chaîne à `pdfjsLib.GlobalWorkerOptions.workerSrc`, c'est pdf.js qui instancie ensuite un `Worker` en interne à partir de cette URL.

## Quota Tavily — fallback de code vs quota réel

`1000` (constante `TAVILY_DEFAULT_QUOTA` dans `cloudflare/worker-openrouter.js` et `cloudflare/worker-api.js`) est un **fallback de code**, pas un quota vérifié auprès de Tavily. Il n'est utilisé que si ni `TAVILY_MONTHLY_QUOTA` ni `TAVILY_CREDIT_QUOTA` ne sont configurés en variable/secret Wrangler — ce qui est le cas par défaut tant que vous n'avez pas exécuté `wrangler secret put TAVILY_MONTHLY_QUOTA` (ou l'équivalent `[vars]`) sur `digitalblueskye-ai`/`digitalblueskye-api`.

Les payloads de santé exposent désormais un champ `quota_source` (`"env_configured"` ou `"fallback_default"`), affiché dans `admin/index.html` ("Quota estimé utilisé : X / 1000 (valeur par défaut non configurée)" quand le fallback est actif) — pour un suivi fiable du quota réel, configurez `TAVILY_MONTHLY_QUOTA` ou `TAVILY_CREDIT_QUOTA`.
