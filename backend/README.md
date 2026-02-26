# Backend (PHP + MariaDB)

Cette application ajoute un backend simple pour :
- Enregistrer les consentements cookies (RGPD).
- Publier et afficher les commentaires des articles.

## Installation locale (XAMPP)
1. Démarrez Apache + MySQL (MariaDB) dans XAMPP.
2. Créez la base `digitalblueskye` dans phpMyAdmin.
3. Importez `backend/schema.sql`.
4. Mettez à jour `backend/config.php` si besoin (user/password).

## Correctif emoji (utf8mb4)
Si les emojis s'affichent en `?` dans les commentaires, exécutez une fois :

- `backend/migrations/2026-02-23-utf8mb4-comments.sql`

Note : les caractères déjà stockés en `?` ne peuvent pas être restaurés automatiquement.

## Production
XAMPP sert au dev local. En production, utilisez un hébergement PHP + MySQL/MariaDB
(mutualisé, VPS LAMP, etc.). Renseignez les variables d'environnement si possible :

- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
- `COMMENTS_REQUIRE_APPROVAL` (true/false)
- `OPENAI_API_KEY` (pour l'assistant IA)
- `OPENAI_MODEL` (optionnel, ex: `gpt-4.1-mini`)
- `OPENAI_PROJECT` (optionnel, requis pour certaines clés `sk-proj`)

## Endpoints
- `POST /backend/consent.php`
  - JSON : `consent_id`, `analytics`, `marketing`, `page_url`
  - Champ dérivé en base : `consent_given` (`yes` si analytics ou marketing = 1, sinon `no`)
  - Optionnel : `viewport_width`, `viewport_height`, `device_pixel_ratio`,
    `screen_width`, `screen_height`, `navigator_language`, `ua_data`, `in_app_browser`
- `GET /backend/comments.php?article=slug`
  - Retourne les commentaires approuvés (avec `id`, `parent_id`, `likes_count`, `reactions`)
- `POST /backend/comments.php`
  - Publier commentaire/réponse :
    - JSON : `name`, `email`, `message`, `article`, `page_url`, `website` (honeypot), `parent_id` (optionnel)
  - Liker un commentaire :
    - JSON : `action="like"`, `article`, `comment_id`
- `POST /backend/ai-assistant.php`
  - Chat assistant IA :
    - JSON : `mode="chat"`, `message`, `history[]`, `language`, `session_id`, `page_url`
    - Retour : `reply`, `cta`, `fallback`
  - Tracking analytics assistant :
    - JSON : `mode="event"`, `event_type`, `event_value`, `language`, `session_id`, `page_url`, `meta`

## Modération
Activez `COMMENTS_REQUIRE_APPROVAL=true` pour passer les commentaires en `pending`.
Ils n'apparaissent pas tant que leur statut n'est pas passé à `approved`.

## Migrations SQL
Pour activer les fonctionnalités commentaires avancées sur une base existante :

- `backend/migrations/2026-02-23-utf8mb4-comments.sql`
- `backend/migrations/2026-02-23-comments-replies-likes.sql`
- `backend/migrations/2026-02-23-comment-reactions.sql`
- `backend/migrations/2026-02-23-comment-positive-reactions.sql`
- `backend/migrations/2026-02-24-drop-legacy-reaction-columns.sql`
- `backend/migrations/2026-02-26-ai-assistant-events.sql`
