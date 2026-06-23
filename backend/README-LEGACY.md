# backend/ — Pile PHP/MariaDB legacy

> **Statut : déprécié.** Ce dossier correspond à une ancienne cible
> d'hébergement PHP/MariaDB (InfinityFree en mutualisé, XAMPP en local),
> conservée uniquement pour mémoire historique. Voir `backend/README.md`
> pour la documentation technique d'origine.

## Pourquoi ce dossier existe encore

`backend/` implémente un backend PHP complet (commentaires, consentements,
assistant IA) pensé pour un hébergement mutualisé classique (InfinityFree)
avec une base MariaDB, avant la bascule vers l'architecture actuelle :

```
Netlify (front statique) → Cloudflare Workers (worker-api.js, worker-openrouter.js) → Cloudflare D1
```

Dans cette architecture actuelle, **aucun fichier de `backend/` n'est exécuté
en production** : Netlify ne fait tourner aucun runtime PHP.

## Routes encore "vues" côté front

Le front-end (`pages/contact.html`, `scripts/comments.js`,
`scripts/translator.js`, `scripts/theme-switcher.js`, `scripts/loader.js`)
appelle encore des chemins qui ressemblent à des routes PHP
(`/backend/comments.php`, `/backend/consent.php`, ...). Ce ne sont que des
noms de route conservés par compatibilité : les requêtes partent en réalité
vers le Worker Cloudflare (`digitalblueskye-api`), qui implémente lui-même
ces routes dans `cloudflare/worker-api.js`. Les fichiers `.php` de ce dossier
ne sont jamais sollicités par le site en ligne.

Détails complets : voir la section "Pile PHP/MySQL legacy" de
`docs/ARCHITECTURE.md`.
