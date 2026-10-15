# Instructions pour les agents IA

## Général
- Réponds en français, de façon concise et directe.
- Changements minimaux et ciblés, sans commentaires superflus.
- Vérifie (build, lint, tests existants) avant de conclure ; mets à jour le README si besoin.
- Propose des améliorations utiles à la fin, sans les implémenter sans mon accord.

## Git
- Un commit clair en français par modification logique, puis push.
- Regroupe les modifications en un minimum de commits/pushs.
- Fusion dans `main` uniquement sur ma demande explicite.

## Déploiement
- Hébergement principal : Cloudflare Pages, parfois Netlify.
- Cloudflare Pages : déploiement avec wrangler (`npm run deploy` ou `npx wrangler pages deploy dist --project-name <projet>`). Une branche = preview ; production = `main`, uniquement sur ma demande explicite.
- Netlify (crédits payants, environ 15 crédits par déploiement de production) : jamais de déploiement de production sans mon accord explicite. Ne pousse jamais sur la branche de production : pousse sur une branche et ouvre une Pull Request pour utiliser Deploy Preview. Vérifie en local (build, tests) avant tout push.

## Sécurité
- Jamais de secrets (clés API) dans le code, le dépôt ou les commits. Cloudflare : `wrangler pages secret`.
- Demande avant toute action destructrice (suppression, force push).

## Coûts
- En cas de doute sur la consommation de crédits (déploiement, crédits IA), demande-moi avant d'agir.
- Ne demande pas de revue Copilot (code review) sans mon accord.
