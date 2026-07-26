# Sécurité & authentification du chatbot IA

## 1. Architecture cible

```
Front (https://digitalblueskye.com, hébergé sur Netlify)
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

Décision produit : les fournisseurs de connexion définitifs sont Google,
GitHub et email générique par magic link. Facebook / Meta n'est pas intégré
comme fournisseur de connexion et ne doit pas être recommandé comme extension
future.

## 2. État actuel de l'implémentation

- ✅ Connexion Google, GitHub et email générique (magic link) : `cloudflare/auth.js`.
- ✅ Sessions serveur : cookie HttpOnly, seul le SHA-256 du token est stocké en D1.
- ✅ Proxy IA protégé `POST /ai/chat` : session + rate limit + journalisation + service binding.
- ✅ Migration D1 : `cloudflare/d1/auth-schema.sql` (+ création idempotente au runtime).
- ✅ Front : `scripts/dbs-auth.js` interroge `/auth/me`, modale OAuth, fallback dev localhost.
- ✅ `profile.html` : session serveur (avatar, provider, préférences, paramètres IA, logout).
- ⏳ **À faire par l'exploitant** : créer les apps OAuth, poser les secrets, appliquer la migration, (optionnel) basculer le front sur le proxy `/ai/chat`.

Tant que les secrets OAuth ne sont pas posés, `/auth/providers` renvoie tous les
providers à `false`, la modale l'indique, et le fallback dev reste utilisable en
localhost. **Rien n'est cassé** : l'endpoint IA direct historique reste actif par
défaut (voir §7).

## 3. Routes backend (Worker API)

| Route | Méthode | Rôle |
|---|---|---|
| `/auth/providers` | GET | Fournisseurs OAuth activés côté UX : Google / GitHub |
| `/auth/login/:provider` | GET | Génère state (+PKCE Google), redirige vers l'OAuth |
| `/auth/callback/:provider` | GET | Vérifie state, échange le code, crée la session, pose le cookie, redirige vers `/profile.html?auth=success` |
| `/auth/email/request` | POST | `{ email }` → crée un token à usage unique et envoie le lien de connexion par email |
| `/auth/email/verify` | GET | `?token=...` → consomme le token, crée la session, redirige vers `/profile.html?auth=success` |
| `/auth/me` | GET | État de session (source de vérité) |
| `/auth/logout` | POST | Révoque la session en D1 + supprime le cookie |
| `/auth/profile` | PATCH | Modifie `displayName` / `preference.tone` / `preference.theme` |
| `/auth/preferences` | GET / PATCH | Lit / écrit les préférences assistant complètes (`user_preferences`) |
| `/auth/usage` | GET | Quotas IA (fenêtre horaire courante) + dernière activité (`ai_usage_events`) |
| `/auth/sessions` | GET | Historique des sessions (`user_sessions`) + dernière connexion (`users.last_login_at`) |
| `/auth/sessions/revoke` | POST | `{ sessionId }` → révoque une session précise (jamais la session courante) |
| `/auth/sessions/revoke-others` | POST | Révoque toutes les sessions sauf la session courante |
| `/ai/chat` | POST | Proxy IA protégé (401 `AUTH_REQUIRED` si non connecté) |

## 4. Variables & secrets Cloudflare (Worker API)

Variables (dans `cloudflare/wrangler.api.toml`, valeurs non sensibles) :
`FRONTEND_ORIGIN`, `AUTH_BASE_URL`, `EMAIL_FROM_ADDRESS`, `AI_RATE_LIMIT_USER`,
`AI_RATE_LIMIT_IP`, `EMAIL_LOGIN_RATE_LIMIT`, `AUTH_COOKIE_SAMESITE` (optionnel).

Secrets (jamais en clair) :

```
wrangler secret put GOOGLE_CLIENT_ID     -c cloudflare/wrangler.api.toml
wrangler secret put GOOGLE_CLIENT_SECRET  -c cloudflare/wrangler.api.toml
wrangler secret put GITHUB_CLIENT_ID      -c cloudflare/wrangler.api.toml
wrangler secret put GITHUB_CLIENT_SECRET  -c cloudflare/wrangler.api.toml
wrangler secret put AUTH_SESSION_SECRET   -c cloudflare/wrangler.api.toml
```

`AUTH_SESSION_SECRET` : chaîne aléatoire longue (ex. `openssl rand -hex 32`),
utilisée pour signer le state OAuth (anti-CSRF) et les tokens.

## 5. Fournisseurs définitifs — configuration

`AUTH_BASE_URL = https://api.digitalblueskye.com` (domaine API canonique,
`cloudflare/wrangler.api.toml` → `[[routes]] pattern = "api.digitalblueskye.com"`).

L'ancienne URL `https://digitalblueskye-api.djelloulabid75.workers.dev` reste
active (`workers_dev = true`) comme **fallback technique temporaire** le temps
de la transition ; elle ne doit plus être utilisée comme référence dans le
code front ni dans les nouvelles configurations OAuth.

| Provider | Callback URL | Scopes | Variables |
|---|---|---|---|
| Google | `AUTH_BASE_URL/auth/callback/google` | `openid email profile` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | `AUTH_BASE_URL/auth/callback/github` | `read:user user:email` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Email (magic link) | `AUTH_BASE_URL/auth/email/verify?token=...` | — | `EMAIL_FROM_ADDRESS` + binding `send_email` |

### Checklist création des apps OAuth

**Google** — console.cloud.google.com → APIs & Services → Credentials → OAuth
client ID (type *Web application*) → *Authorized redirect URIs* =
`https://api.digitalblueskye.com/auth/callback/google` → configurer l'écran de
consentement OAuth (scopes email/profile). Google autorise plusieurs redirect
URIs : conserver l'ancienne `https://digitalblueskye-api.djelloulabid75.workers.dev/auth/callback/google`
en plus de la nouvelle tant que la transition n'est pas terminée, pas besoin de
la supprimer immédiatement.

**GitHub** — github.com/settings/developers → New OAuth App → *Authorization
callback URL* = `https://api.digitalblueskye.com/auth/callback/github`. GitHub
n'autorise qu'une seule callback URL par app OAuth : utiliser directement la
nouvelle URL canonique (basculer l'app existante, ou en créer une nouvelle si
l'ancienne doit continuer à servir ailleurs).

### Checklist connexion par email

Digital Blue Skye n'utilise ni mot de passe ni fournisseur tiers pour
l'email : un lien de connexion à usage unique (valable 20 minutes) est envoyé
via Cloudflare Email Sending.

1. Onboarder le domaine d'envoi : `wrangler email sending enable digitalblueskye.com`.
2. Vérifier le binding `send_email` (nom `EMAIL`) dans `cloudflare/wrangler.api.toml`.
3. Ajuster `EMAIL_FROM_ADDRESS` si besoin (doit utiliser le domaine onboardé).
4. Tant que le binding ou le domaine ne sont pas prêts, `/auth/email/request`
   répond quand même `{ ok: true }` (fail-open) mais aucun email ne part —
   voir `sendMagicLinkEmail()` dans `cloudflare/auth.js`.

## 6. D1 — tables & migration

Fichier : `cloudflare/d1/auth-schema.sql`. Appliquer :

```
wrangler d1 execute digitalblueskye --file=cloudflare/d1/auth-schema.sql -c cloudflare/wrangler.api.toml
```

Tables : `users`, `user_identities`, `user_sessions`, `user_preferences`,
`ai_usage_events`, `ai_rate_limits`, `email_login_tokens`. **Aucun access_token
OAuth brut ni mot de passe n'est stocké** (si un stockage devient nécessaire,
prévoir un chiffrement).

## 7. Sécuriser les appels IA (bascule progressive)

Par défaut, `scripts/ai-assistant.js` appelle encore le Worker IA en direct
(non régressif). Pour activer l'**enforcement serveur** une fois OAuth prêt,
définir dans les pages (avant `ai-assistant.js`) :

```html
<script>
  window.DBS_AI_ENDPOINT = "https://api.digitalblueskye.com/ai/chat";
</script>
```

Le front passe alors en `credentials: 'include'` ; le Worker API vérifie la
session, applique le rate limit, journalise, puis relaie via `AI_WORKER`. Un
`401 AUTH_REQUIRED` rouvre automatiquement la modale de connexion.

> **Durcissement complémentaire recommandé** : une fois le proxy en place,
> restreindre le Worker IA `digitalblueskye-ai` pour qu'il n'accepte QUE les
> appels du service binding (ex. en-tête partagé secret vérifié), afin de fermer
> l'accès direct résiduel.

## 7bis. Paramètres IA centralisés

`profile.html` est la source UX des préférences persistantes : préférences de
réponse, compagnon IA, voix, audio, langue vocale, micro, densité d'affichage,
suggestions et sources.

La fenêtre de conversation doit rester centrée sur les actions immédiates :
écrire, envoyer, micro, upload et actions ponctuelles. Les réglages durables ne
doivent plus être ajoutés dans cette barre ; si un ancien contrôle reste visible
pour compatibilité, il doit être considéré comme transitoire.

En V1, les paramètres voix/audio/chat sont stockés localement dans
`dbs_profile_preferences_cache` via `window.DBSAuth.getAssistantPreferences()`
et `window.DBSAuth.saveAssistantPreferences()`. Ils pourront être migrés plus
tard vers D1 `user_preferences`.

Les badges de profil sont indicatifs côté UX : “Compte connecté” et “Session
active” ne s'affichent que dans l'état authentifié. Les métriques d'usage,
l'historique détaillé et certains statuts restent à brancher à la télémétrie
serveur.

## 7ter. Architecture des paramètres Digital Blue Skye AI

Les paramètres sont répartis par niveau de responsabilité :

- **Mon profil (`profile.html`)** : identité, préférences IA personnelles,
  paramètres IA personnels, compagnon IA, sécurité du compte, utilisation IA,
  historique et données locales du navigateur.
- **Projet > Paramètres/RAG** : réglages propres au projet actif, activation du
  RAG projet, nombre de passages documentaires, citations et usage éventuel de
  la bibliothèque globale.
- **Digital Blue Skye Studio / Admin** : réglages techniques avancés et
  supervision : modèles IA, providers IA, fallback, recherche Web/Tavily, RAG
  documentaire global, documents, agents spécialisés, quotas/coûts,
  diagnostics, observabilité et sécurité.

L'ancien panneau de réglages de l'assistant ne doit plus devenir une quatrième
source de vérité. Il sert uniquement de redirection vers le bon espace et garde
temporairement certaines actions locales d'export/sauvegarde tant qu'elles ne
sont pas déplacées dans le Studio.

Facebook / Meta est explicitement exclu de l'UX de connexion. Les seules
options produit sont Google, GitHub et email générique par magic link.

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
