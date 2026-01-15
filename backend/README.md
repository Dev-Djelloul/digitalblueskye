# Backend (PHP + MariaDB)

Cette application ajoute un backend simple pour :
- Enregistrer les consentements cookies (RGPD).
- Publier et afficher les commentaires des articles.

## Installation locale (XAMPP)
1. Démarrez Apache + MySQL (MariaDB) dans XAMPP.
2. Créez la base `digitalblueskye` dans phpMyAdmin.
3. Importez `backend/schema.sql`.
4. Mettez à jour `backend/config.php` si besoin (user/password).

## Production
XAMPP sert au dev local. En production, utilisez un hébergement PHP + MySQL/MariaDB
(mutualisé, VPS LAMP, etc.). Renseignez les variables d'environnement si possible :

- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
- `COMMENTS_REQUIRE_APPROVAL` (true/false)

## Endpoints
- `POST /backend/consent.php`
  - JSON : `consent_id`, `analytics`, `marketing`, `page_url`
  - Champ dérivé en base : `consent_given` (`yes` si analytics ou marketing = 1, sinon `no`)
  - Optionnel : `viewport_width`, `viewport_height`, `device_pixel_ratio`,
    `screen_width`, `screen_height`, `navigator_language`, `ua_data`, `in_app_browser`
- `GET /backend/comments.php?article=slug`
  - Retourne les commentaires approuvés
- `POST /backend/comments.php`
  - JSON : `name`, `email`, `message`, `article`, `page_url`, `website` (honeypot)

## Modération
Activez `COMMENTS_REQUIRE_APPROVAL=true` pour passer les commentaires en `pending`.
Ils n'apparaissent pas tant que leur statut n'est pas passé à `approved`.
