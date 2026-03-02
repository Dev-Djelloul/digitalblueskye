# Cloudflare API Worker (consent/comments/contact/export)

Ce Worker remplace les endpoints PHP suivants:
- `POST /backend/consent.php`
- `GET|POST /backend/comments.php`
- `POST /contact-submit.php`
- `GET /export-csv.php`

## 1) Pre-requis
- Cloudflare account
- `wrangler` installe
- Une base D1 creee

## 2) Configurer Wrangler
1. Ouvrir `cloudflare/wrangler.api.toml`.
2. Remplacer `database_id`.
3. Ajuster `ALLOWED_ORIGIN` (ton domaine final).
4. Ajouter le secret export:
   - `wrangler secret put EXPORT_TOKEN -c cloudflare/wrangler.api.toml`

## 3) Initialiser la base D1
- `wrangler d1 execute digitalblueskye --file=cloudflare/d1/schema.sql -c cloudflare/wrangler.api.toml`

Reset total des donnees (optionnel):
- `wrangler d1 execute digitalblueskye --file=cloudflare/d1/reset.sql -c cloudflare/wrangler.api.toml`

## 4) Deployer
- `wrangler deploy -c cloudflare/wrangler.api.toml`

## 5) Routes
Sur Cloudflare, router ton domaine vers le Worker:
- `https://api.tondomaine.com/backend/consent.php`
- `https://api.tondomaine.com/backend/comments.php`
- `https://api.tondomaine.com/contact-submit.php`
- `https://api.tondomaine.com/export-csv.php`

## 6) Integration front
Deux options:
1. Rewrites/proxy pour garder les URLs relatives existantes (`/backend/...`).
2. Basculer les appels front vers `https://api.tondomaine.com/...`.

Le Worker garde les formats de reponses attendus par ton front actuel.

Pour l'option 2, tu peux definir:
```html
<script>
  window.DBS_API_BASE = "https://api.tondomaine.com";
</script>
```
avant les scripts front.

Si `window.DBS_API_BASE` n'est pas defini, le front inferera automatiquement:
- `https://api.<domaine>` quand le site tourne sur `https://www.<domaine>`
