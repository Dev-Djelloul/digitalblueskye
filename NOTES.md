# Suivi projet (résumé Codex)

Date: 2025-12-22

## Dernier objectif terminé
- Uniformisation UI sur blog, projets, pages légales et footer.
- Bouton “Voir tous les articles” stylisé.
- Titre home changé en “Digitalblueskye” (FR/EN).
- Taille du titre home réduite.
- Logo animé repositionné sous “Suivez‑moi” + icônes sociaux.

## Backend (prochaine étape)
Objectif: logique backend de récupération/stocker les données utilisateurs via base de données, en cohérence avec RGPD/consentement.

Propositions de prochaines actions:
1. Définir quelles données sont collectées (minimum viable, finalité, durée).
2. Choisir stack (ex: Node/Express + DB) et hébergement.
3. Schéma DB + modèle consentement (versioning des consentements).
4. Endpoints (opt‑in, opt‑out, export, suppression).
5. Mise à jour front pour envoyer les consentements.

## Git
- Dernier commit poussé sur GitHub.
- Remote `origin` mis à jour: https://github.com/Dev-Djelloul/digitalblueskye.git

## Fichiers clés modifiés récemment
- `styles/style.css`
- `index.html`
- `translations/fr.json`
- `translations/en.json`
- `projects/*.html`
- `scripts/loader.js`
- `scripts/blog.js`
- `pages/privacy.html`, `pages/terms.html`, `pages/cookies-policy.html`
- `blog/digital/blogArticles.html`
- `blog/digital/article-rgpd-ia-securite.html`

## TODO
- Démarrer la conception backend (DB + API + consent logging).
