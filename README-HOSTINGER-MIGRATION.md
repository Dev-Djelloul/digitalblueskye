# Migration du site vers Hostinger

Ce guide documente la bascule de `digitalblueskye` vers un hébergement Hostinger, tout en conservant les services Cloudflare déjà en place (Worker IA + APIs).

## 1) Architecture cible

- Frontend statique (HTML/CSS/JS) hébergé sur Hostinger.
- Domaine principal pointé vers Hostinger.
- Services backend/IA conservés sur Cloudflare:
  - Worker IA: `digitalblueskye-ai.djelloulabid75.workers.dev`
  - API Worker (si activé): endpoints `backend/consent.php`, `backend/comments.php`, `contact-submit.php`, `export-csv.php`
- OAuth Google Drive côté front (Google Picker + Drive API).

## 2) Pré-requis avant bascule

- Sauvegarde du site actuel.
- Vérifier que tous les fichiers frontend sont versionnés.
- Vérifier les variables front dans `index.html` avant `scripts/ai-assistant.js`:
  - `window.DBS_GOOGLE_API_KEY`
  - `window.DBS_GOOGLE_CLIENT_ID`
  - `window.DBS_GOOGLE_APP_ID`
- Vérifier la politique CORS côté Cloudflare Worker:
  - `ALLOWED_ORIGIN` doit inclure le domaine final Hostinger.

## 3) Déploiement des fichiers sur Hostinger

Option A (simple): via File Manager hPanel
1. Ouvrir hPanel > `Website` > `File Manager`.
2. Aller dans `public_html`.
3. Uploader le contenu du site (racine du projet).
4. Vérifier que `index.html` est bien à la racine `public_html`.

Option B (propre): via Git/CI
1. Connecter le dépôt GitHub dans Hostinger.
2. Définir le dossier de publication sur la racine web.
3. Déployer depuis la branche `master`.

## 4) Configuration domaine + DNS

Dans Hostinger, configurer le domaine principal (`@`) et `www`.

Cas le plus courant:
- `@` -> A record vers l’IP Hostinger.
- `www` -> CNAME vers `@` (ou vers cible fournie par Hostinger).

Attendre la propagation DNS (souvent rapide, jusqu’à 24h max).

## 5) SSL et HTTPS

1. Activer SSL dans hPanel (`SSL` > activer certificat).
2. Forcer HTTPS.
3. Vérifier qu’aucun contenu mixte (HTTP) ne subsiste.

## 6) Cloudflare Worker et API après migration

### Assistant IA
- Le front appelle déjà:
  - `https://digitalblueskye-ai.djelloulabid75.workers.dev`
- Côté Worker IA, définir:
  - `ALLOWED_ORIGIN=https://<domaine-final>`

### API Worker (si utilisé)
- Si API sur sous-domaine (ex: `api.<domaine>`), conserver/régler les routes Cloudflare.
- Si appels relatifs côté front, vérifier `window.DBS_API_BASE` si nécessaire.

## 7) Google OAuth / Drive en production

- APIs actives:
  - `Google Drive API`
  - `Google Picker API`
- OAuth Client (Web application):
  - Ajouter les origines JavaScript autorisées:
    - `https://<domaine-final>`
    - `https://www.<domaine-final>` (si utilisé)
    - origins locales de dev (`http://127.0.0.1:5500`, `http://localhost:5500`)
- API Key (browser key):
  - Referrers autorisés:
    - `https://<domaine-final>/*`
    - `https://www.<domaine-final>/*`
    - dev local si nécessaire
- État OAuth:
  - Mode `Production`
  - Vérification en cours/validée pour `drive.readonly`

## 8) Tests de recette après mise en ligne

Checklist minimale:
- Accès homepage en HTTPS sans erreur.
- Navigation pages principales.
- Formulaire de contact OK.
- Commentaires/consentement OK (si backend actif).
- Assistant IA:
  - réponse texte OK
  - import Google Drive OK
- SEO technique:
  - `robots.txt` accessible
  - `sitemap.xml` accessible
  - balises de vérification (`google...html`, `pinterest...html`) accessibles

## 9) Plan de rollback

Si incident:
1. Repointer DNS vers l’hébergement précédent.
2. Vider cache navigateur/CDN.
3. Vérifier `ALLOWED_ORIGIN` côté Worker.
4. Refaire une bascule planifiée hors pic trafic.

## 10) Notes projet Digital Blue Skye

- Correctifs déjà intégrés:
  - support Google Drive Picker dans `scripts/ai-assistant.js`
  - `setOrigin(...)` pour stabiliser le Picker
  - gestion des événements intermédiaires Picker (pas de faux message d’erreur)
- La clé API Google et le client OAuth doivent rester dans le même projet GCP.
