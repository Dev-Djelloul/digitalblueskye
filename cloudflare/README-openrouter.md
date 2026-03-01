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
  - `OPENROUTER_MODEL` = `google/gemma-2-9b-it:free`
  - `ALLOWED_ORIGIN` = `https://digitalblueskye.infinityfreeapp.com`

## 3) Frontend
Le frontend pointe deja vers le Worker via:
- `scripts/ai-assistant.js`
- `CLOUDFLARE_WORKER_ENDPOINT`

Important:
- les appels frontend vers le Worker sont envoyes en `Content-Type: text/plain;charset=UTF-8`
- cela evite le preflight `OPTIONS` bloque en 403 sur certains contextes InfinityFree

## 4) Test rapide (console navigateur)
```js
fetch('https://digitalblueskye-ai.djelloulabid75.workers.dev', {
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
