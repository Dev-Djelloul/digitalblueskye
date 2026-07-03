# Cloudflare Worker + OpenRouter Free

Ce guide remplace l'appel OpenAI direct par OpenRouter Free sur le Worker Cloudflare.

## 1) Code Worker
- Le Worker IA source est `/cloudflare/worker-openrouter.js`.
- Le deploiement doit utiliser `/cloudflare/wrangler.ai.toml`.
- Commande de deploiement:

```bash
npx wrangler deploy -c cloudflare/wrangler.ai.toml
```

## 2) Variables et secrets Worker
Ajouter ces variables dans `Settings > Variables`:

- Secret:
  - `OPENROUTER_API_KEY` = votre cle OpenRouter
  - `TAVILY_API_KEY` = votre cle Tavily pour la recherche web temps reel
- Texte:
  - `OPENROUTER_MODEL` = `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
  - `OPENROUTER_FALLBACK_MODELS` = `mistralai/mistral-7b-instruct:free,google/gemma-2-9b-it:free` (optionnel, liste separee par des virgules)
  - `OPENROUTER_MAX_TOKENS` = `1400` (optionnel, minimum applique par le Worker)
  - `TAVILY_MONTHLY_QUOTA` = quota mensuel estime Tavily, `1000` par defaut
  - `ALLOWED_ORIGIN` = `https://digitalblueskye.com/`

## 3) Frontend
Le frontend pointe deja vers le Worker via:
- `scripts/ai-assistant.js`
- `https://digitalblueskye-ai.djelloulabid75.workers.dev`

Important:
- les appels frontend vers le Worker sont envoyes en `Content-Type: application/json`
- tout ancien Worker d'un autre compte Cloudflare est obsolete pour ce projet et ne doit pas etre utilise comme endpoint IA ou recherche web.

### Option: ajout de fichiers Google Drive dans le chat
Le bouton Google Drive de l'assistant IA lit ces variables globales front:

```html
<script>
  window.DBS_GOOGLE_API_KEY = "VOTRE_API_KEY";
  window.DBS_GOOGLE_CLIENT_ID = "VOTRE_CLIENT_ID.apps.googleusercontent.com";
  window.DBS_GOOGLE_APP_ID = "VOTRE_PROJECT_NUMBER"; // optionnel
</script>
```

Ajoute ce bloc **avant** `scripts/ai-assistant.js`.

Pre-requis Google Cloud:
- Activer les API: `Google Picker API` et `Google Drive API`
- Creer un OAuth client ID de type `Web application`
- Ajouter les origines autorisees:
  - `https://digitalblueskye.com`
  - ton futur domaine de prod
- Ajouter une API key restreinte (HTTP referrer) sur tes domaines web

Si non configure, l'assistant affiche: `Google Drive n'est pas encore configuré.`

## 4) Test rapide (console navigateur)
```js
fetch('https://digitalblueskye-ai.djelloulabid75.workers.dev', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'chat',
    language: 'fr',
    message: 'Donne-moi 2 recommandations SEO concretes pour mon site.',
    searchWeb: true,
    webSearchQuery: 'actualites SEO 2026'
  })
}).then(r => r.json()).then(console.log).catch(console.error);
```

Reponse attendue:
- `ok: true`
- `worker_build: "2026-06-20-tavily-economy-v4"`
- `reply: "..."`
- `provider: "openrouter"`
- si `web_search_error` vaut `missing_tavily_key`, ajouter le secret `TAVILY_API_KEY`.
- aucun fallback vers un ancien Worker de recherche web n'est utilise.

## 5) Si erreur
- `missing_openrouter_key`: secret absent.
- `missing_tavily_key`: secret Tavily absent, la recherche web temps reel ne peut pas fonctionner.
- `openrouter_error`: verifier modele `:free` et cle.
- Erreur CORS: verifier `ALLOWED_ORIGIN`.

## 6) Logs propres
- Le Worker journalise chaque tentative OpenRouter echouee avec `openrouter_attempt_failed`.
- Le frontend journalise les erreurs utiles uniquement.
- Pour activer les logs debug frontend dans la console navigateur:

```js
localStorage.setItem('ai_assistant_debug', 'true')
```

Pour les desactiver:

```js
localStorage.removeItem('ai_assistant_debug')
```
