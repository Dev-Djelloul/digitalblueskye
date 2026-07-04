# Sécurité & authentification du chatbot IA

## 1. Architecture cible

```
Front Netlify (digitalblueskye.netlify.app)
  │  fetch(credentials: include)  +  redirections OAuth
  ▼
digitalblueskye-api  (Worker API, cloudflare/worker-api.js + cloudflare/auth.js)
  │  vérifie la session serveur (cookie HttpOnly → D1)
  ▼
D1  users / user_identities / user_sessions / user_preferences /
    ai_usage_events / ai_rate_limits
  │  si session valide + rate limit OK
  ▼
Service binding AI_WORKER
  ▼
digitalblueskye-ai  (Worker IA, cloudflare/worker-openrouter.js)
```

Le front ne considère plus `localStorage` comme une preuve de sécurité.
**Source de vérité = `GET /auth/me`** sur le Worker API.

## 2. État actuel de l'implémentation

- ✅ Backend OAuth complet (Google / GitHub / Facebook) : `cloudflare/auth.js`.
- ✅ Sessions serveur : cookie HttpOnly, seul le SHA-256 du token est stocké en D1.
- ✅ Proxy IA protégé `POST /ai/chat` : session + rate limit + journalisation + service binding.
- ✅ Migration D1 : `cloudflare/d1/auth-schema.sql` (+ création idempotente au runtime).
- ✅ Front : `scripts/dbs-auth.js` interroge `/auth/me`, modale OAuth, fallback dev localhost.
- ✅ `profile.html` : session serveur (avatar, provider, préférences, logout).
- ⏳ **À faire par l'exploitant** : créer les apps OAuth, poser les secrets, appliquer la migration, (optionnel) basculer le front sur le proxy `/ai/chat`.

Tant que les secrets OAuth ne sont pas posés, `/auth/providers` renvoie tous les
providers à `false`, la modale l'indique, et le fallback dev reste utilisable en
localhost. **Rien n'est cassé** : l'endpoint IA direct historique reste actif par
défaut (voir §7).

## 3. Routes backend (Worker API)

| Route | Méthode | Rôle |
|---|---|---|
| `/auth/providers` | GET | Fournisseurs activés (booléens) |
| `/auth/login/:provider` | GET | Génère state (+PKCE Google), redirige vers l'OAuth |
| `/auth/callback/:provider` | GET | Vérifie state, échange le code, crée la session, pose le cookie, redirige vers `/profile.html?auth=success` |
| `/auth/me` | GET | État de session (source de vérité) |
| `/auth/logout` | POST | Révoque la session en D1 + supprime le cookie |
| `/auth/profile` | PATCH | Modifie `displayName` / `preference.tone` / `preference.theme` |
| `/ai/chat` | POST | Proxy IA protégé (401 `AUTH_REQUIRED` si non connecté) |

## 4. Variables & secrets Cloudflare (Worker API)

Variables (dans `cloudflare/wrangler.api.toml`, valeurs non sensibles) :
`FRONTEND_ORIGIN`, `AUTH_BASE_URL`, `AI_RATE_LIMIT_USER`, `AI_RATE_LIMIT_IP`,
`AUTH_COOKIE_SAMESITE` (optionnel).

Secrets (jamais en clair) :

```
wrangler secret put GOOGLE_CLIENT_ID     -c cloudflare/wrangler.api.toml
wrangler secret put GOOGLE_CLIENT_SECRET  -c cloudflare/wrangler.api.toml
wrangler secret put GITHUB_CLIENT_ID      -c cloudflare/wrangler.api.toml
wrangler secret put GITHUB_CLIENT_SECRET  -c cloudflare/wrangler.api.toml
wrangler secret put FACEBOOK_CLIENT_ID    -c cloudflare/wrangler.api.toml
wrangler secret put FACEBOOK_CLIENT_SECRET -c cloudflare/wrangler.api.toml
wrangler secret put AUTH_SESSION_SECRET   -c cloudflare/wrangler.api.toml
```

`AUTH_SESSION_SECRET` : chaîne aléatoire longue (ex. `openssl rand -hex 32`),
utilisée pour signer le state OAuth (anti-CSRF).

## 5. Fournisseurs OAuth — configuration

`AUTH_BASE_URL = https://digitalblueskye-api.djelloulabid75.workers.dev`

| Provider | Callback URL | Scopes | Variables |
|---|---|---|---|
| Google | `AUTH_BASE_URL/auth/callback/google` | `openid email profile` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | `AUTH_BASE_URL/auth/callback/github` | `read:user user:email` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Facebook | `AUTH_BASE_URL/auth/callback/facebook` | `email public_profile` | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` |

### Checklist création des apps

**Google** — console.cloud.google.com → APIs & Services → Credentials → OAuth
client ID (type *Web application*) → *Authorized redirect URIs* =
`AUTH_BASE_URL/auth/callback/google` → configurer l'écran de consentement OAuth
(scopes email/profile).

**GitHub** — github.com/settings/developers → New OAuth App → *Authorization
callback URL* = `AUTH_BASE_URL/auth/callback/github`.

**Facebook** — developers.facebook.com → créer une app *Consumer* → produit
*Facebook Login* → *Valid OAuth Redirect URIs* =
`AUTH_BASE_URL/auth/callback/facebook` → passer l'app en *Live* pour ouvrir
le scope `email` au public.

## 6. D1 — tables & migration

Fichier : `cloudflare/d1/auth-schema.sql`. Appliquer :

```
wrangler d1 execute digitalblueskye --file=cloudflare/d1/auth-schema.sql -c cloudflare/wrangler.api.toml
```

Tables : `users`, `user_identities`, `user_sessions`, `user_preferences`,
`ai_usage_events`, `ai_rate_limits`. **Aucun access_token OAuth brut n'est
stocké** (si un stockage devient nécessaire, prévoir un chiffrement).

## 7. Sécuriser les appels IA (bascule progressive)

Par défaut, `scripts/ai-assistant.js` appelle encore le Worker IA en direct
(non régressif). Pour activer l'**enforcement serveur** une fois OAuth prêt,
définir dans les pages (avant `ai-assistant.js`) :

```html
<script>
  window.DBS_AI_ENDPOINT = "https://digitalblueskye-api.djelloulabid75.workers.dev/ai/chat";
</script>
```

Le front passe alors en `credentials: 'include'` ; le Worker API vérifie la
session, applique le rate limit, journalise, puis relaie via `AI_WORKER`. Un
`401 AUTH_REQUIRED` rouvre automatiquement la modale de connexion.

> **Durcissement complémentaire recommandé** : une fois le proxy en place,
> restreindre le Worker IA `digitalblueskye-ai` pour qu'il n'accepte QUE les
> appels du service binding (ex. en-tête partagé secret vérifié), afin de fermer
> l'accès direct résiduel.

## 8. CORS & cookies

- CORS credentials : `Access-Control-Allow-Origin: <FRONTEND_ORIGIN exact>` +
  `Access-Control-Allow-Credentials: true`, réponse `OPTIONS` dédiée.
- Cookie de session : `HttpOnly`, `Secure` (prod), `SameSite=None` (front et
  Worker sur domaines différents), `Path=/`, `Max-Age` = durée de session (7 j).
- En localhost (http), repli automatique `SameSite=Lax` sans `Secure`.

> **Recommandation** : à terme, un domaine API *same-site*
> (`api.digitalblueskye.fr`) permettrait `SameSite=Lax` (plus robuste vis-à-vis
> des navigateurs qui restreignent les cookies tiers).

## 9. Rate limiting

Fenêtre horaire fixe (table `ai_rate_limits`) : `AI_RATE_LIMIT_USER` (défaut 50)
par utilisateur, `AI_RATE_LIMIT_IP` (défaut 10) pour les tentatives anonymes.
Dépassement → `429 RATE_LIMITED`. Fail-open si D1 indisponible.

## 10. Limites restantes

- L'endpoint IA direct reste accessible tant que le Worker IA n'est pas fermé
  au public (voir §7).
- `payload.user` envoyé par le front est ignoré côté proxy (identité réinjectée
  serveur), mais reste indicatif sur l'appel direct.
- Pas de refresh token / rotation de session (session unique 7 j).

## 11. À ne jamais faire

- Exposer un `client_secret` ou tout secret côté front.
- Stocker un token OAuth sensible dans `localStorage`.
- Traiter `payload.user` / un flag `isAuthenticated` client comme une preuve.
