# Cloudflare Worker + OpenRouter Free

Ce guide remplace l'appel OpenAI direct par OpenRouter Free sur le Worker Cloudflare.

## 1) Code Worker
- Ouvrir le Worker `digitalblueskye-ai` dans Cloudflare.
- Remplacer le code par le contenu de:
  - `/cloudflare/worker-openrouter.js`
- Deployer.

## 2) Variables et secrets Worker
Ajouter ces variables dans `Settings > Variables`:

- Secret:
  - `OPENROUTER_API_KEY` = votre cle OpenRouter
- Texte:
  - `OPENROUTER_MODEL` = `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
  - `OPENROUTER_FALLBACK_MODELS` = `mistralai/mistral-7b-instruct:free,google/gemma-2-9b-it:free` (optionnel, liste separee par des virgules)
  - `OPENROUTER_MAX_TOKENS` = `700` (optionnel, minimum applique par le Worker)
  - `ALLOWED_ORIGIN` = `https://digitalblueskye.infinityfreeapp.com`

## 3) Frontend
Le frontend pointe deja vers le Worker via:
- `scripts/ai-assistant.js`
- `CLOUDFLARE_WORKER_ENDPOINT`

Important:
- les appels frontend vers le Worker sont envoyes en `Content-Type: text/plain;charset=UTF-8`
- cela evite le preflight `OPTIONS` bloque en 403 sur certains contextes InfinityFree

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
  - `https://digitalblueskye.netlify.app`
  - ton futur domaine de prod
- Ajouter une API key restreinte (HTTP referrer) sur tes domaines web

Si non configure, l'assistant affiche: `Google Drive n'est pas encore configuré.`

## 4) Test rapide (console navigateur)
```js
fetch('https://digitalblueskye-ai.digitalblueskye.workers.dev', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'chat',
    language: 'fr',
    message: 'Donne-moi 2 recommandations SEO concretes pour mon site.'
  })
}).then(r => r.json()).then(console.log).catch(console.error);
```

Reponse attendue:
- `ok: true`
- `reply: "..."`
- `provider: "openrouter"`

## 5) Si erreur
- `missing_openrouter_key`: secret absent.
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
