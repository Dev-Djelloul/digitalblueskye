# Stratégie SEO & Indexation - Digital Blue Skye

## 1. Résumé exécutif

Digital Blue Skye dispose désormais d'un socle SEO consolidé autour du domaine officiel `https://digitalblueskye.com`. La migration vers ce domaine principal est prise en compte dans les fichiers publics SEO du dépôt : le sitemap référence le domaine officiel, `robots.txt` déclare ce sitemap, et les pages publiques principales utilisent des URLs canoniques et des URLs Open Graph alignées sur `digitalblueskye.com`.

Le sitemap officiel `https://digitalblueskye.com/sitemap.xml` contient 54 URLs découvertes dans le dépôt au 3 juillet 2026. Il couvre la page d'accueil, les pages principales, les pages projets, le blog digital et le blog inspirations. Les pages techniques de partage social sous `/share/` sont volontairement exclues du sitemap principal afin de ne pas pousser ces aperçus dans l'index principal.

Les deux anciens documents SEO ont été fusionnés dans ce document. Les recommandations centrées sur un seul article sont conservées uniquement lorsqu'elles restent utiles pour l'ensemble du site : suivi Search Console, contrôle des métadonnées, qualité des canonicals, performance, maillage interne et maintenance mensuelle.

## 2. État actuel de l'écosystème

| Élément | État actuel |
| --- | --- |
| Domaine officiel | `https://digitalblueskye.com` |
| Registrar / DNS | Cloudflare |
| Hébergement | Netlify |
| Search Console | Propriété `digitalblueskye.com` validée |
| Sitemap officiel | `https://digitalblueskye.com/sitemap.xml` |
| robots.txt | `https://digitalblueskye.com/robots.txt` |
| Ancien hébergement mutualisé | Supprimé / désactivé pour le site public actuel |
| Ancien share Netlify | Migré vers `/share/` sur le domaine officiel |
| Ancien `sitemap-v2.xml` | Supprimé |

Le dépôt contient les familles de contenus suivantes :

- pages principales du portfolio ;
- pages projets dans `/projects/` ;
- articles du blog digital dans `/blog/digital/` ;
- articles inspirations dans `/blog/inspirations/` ;
- pages de partage social dans `/share/`, hors sitemap principal ;
- exports et données collectées dans `Personal-Data-Users.Digitalblueskye/`, à ne pas exposer dans les fichiers SEO publics.

## 3. Sitemap et robots.txt

Le site utilise un sitemap XML unique : `https://digitalblueskye.com/sitemap.xml`. Le fichier local `sitemap.xml` référence 54 URLs sous le domaine officiel. Il inclut les pages principales, les pages projets, les articles du blog digital et les articles inspirations.

Les pages `/share/` ne sont pas incluses dans le sitemap principal. Ce choix évite de pousser dans l'index Google des pages conçues comme aperçus sociaux ou cartes de partage, tout en conservant leur capacité à générer de bons aperçus sur les réseaux.

Le fichier `robots.txt` autorise l'exploration globale et indique explicitement le sitemap officiel :

```txt
User-agent: *
Allow: /

Sitemap: https://digitalblueskye.com/sitemap.xml
```

Commandes de vérification :

```bash
curl -I https://digitalblueskye.com/sitemap.xml
curl -s https://digitalblueskye.com/sitemap.xml | head -20
curl -s https://digitalblueskye.com/robots.txt
```

Points de contrôle :

- le sitemap doit répondre en HTTP 200 ;
- les URLs doivent rester sur `https://digitalblueskye.com` ;
- `robots.txt` doit continuer à pointer vers `https://digitalblueskye.com/sitemap.xml` ;
- toute nouvelle page stratégique doit être ajoutée au sitemap si elle doit être indexée.

## 4. Canonicals, Open Graph et Twitter Cards

Les pages publiques doivent conserver une cohérence stricte entre :

- la balise canonical ;
- `og:url` ;
- `og:image` ;
- `twitter:image` ;
- le domaine principal `https://digitalblueskye.com`.

Les canonicals indiquent à Google l'URL officielle à indexer. Les balises Open Graph et Twitter Cards pilotent les aperçus sociaux sur LinkedIn, Facebook, X/Twitter et autres plateformes compatibles. Les images déclarées doivent être accessibles en HTTPS et suffisamment qualitatives pour le partage.

Les pages de partage sont désormais servies sous `https://digitalblueskye.com/share`. Elles doivent conserver des métadonnées sociales propres, même si elles ne figurent pas dans le sitemap principal.

Contrôles utiles :

```bash
grep -Rni '<link rel="canonical"' index.html pages blog projects share
grep -Rni 'property="og:url"' index.html pages blog projects share
grep -Rni 'name="twitter:image"' index.html pages blog projects share
```

## 5. Blog digital

L'audit historique du 1er décembre 2025 constatait une optimisation des premiers articles du blog digital : meta descriptions, Open Graph, Twitter Cards, canonicals, lazy-loading, attributs de sécurité sur les liens externes et injection JSON-LD Article via `scripts/jsonld-injector.js`.

Le dépôt contient aujourd'hui davantage que les 8 articles historiques. Les articles digitaux identifiés sont :

| Article | URL locale |
| --- | --- |
| IA et gestion de projet | `/blog/digital/article-ia-gestion-projet.html` |
| Outils de veille | `/blog/digital/article-outils-veille.html` |
| RGPD 2025 | `/blog/digital/article-rgpd-2025.html` |
| RSE digital | `/blog/digital/article-rse-digital.html` |
| Tech 2026 | `/blog/digital/article-tech-2026.html` |
| Métavers et projets | `/blog/digital/article-metavers-projets.html` |
| Cône d'apprentissage | `/blog/digital/article-cone-apprentissage.html` |
| SEO chef de projet | `/blog/digital/article-seo-chef-projet.html` |
| RGPD, IA et sécurité | `/blog/digital/article-rgpd-ia-securite.html` |
| PUE et datacenters | `/blog/digital/article-pue-datacenters.html` |
| Connector dots | `/blog/digital/article-connector-dots.html` |
| Signaux faibles | `/blog/digital/article-signaux-faibles.html` |
| Menaces IA cybersécurité 2026 | `/blog/digital/article-menaces-ia-cybersecurite-2026.html` |
| IA agentique et gestion de projet | `/blog/digital/article-ia-agentique-gestion-projet.html` |

Exigences de maintenance pour chaque article :

- conserver un `title` unique ;
- maintenir une meta description claire et non dupliquée ;
- aligner canonical et `og:url` sur l'URL finale ;
- déclarer une image sociale accessible ;
- vérifier que les liens externes ouverts dans un nouvel onglet utilisent `rel="noopener noreferrer"` lorsque pertinent ;
- maintenir l'injection JSON-LD Article si le modèle de page l'utilise ;
- ajouter des liens internes contextuels vers les pages ou articles proches.

## 6. Pages principales et pages projet

Les familles d'URLs principales suivies par le sitemap sont :

- `/` ;
- `/pages/about.html` ;
- `/pages/projects.html` ;
- `/pages/skills.html` ;
- `/pages/contact.html` ;
- `/pages/agilite.html` ;
- `/pages/gouvernance-ia.html` ;
- `/projects/*.html`.

Les pages projet actuellement présentes dans le sitemap sont :

- `/projects/arcadia-zoo.html` ;
- `/projects/booki.html` ;
- `/projects/budget-buddy.html` ;
- `/projects/memory-game.html` ;
- `/projects/ohmyfood.html` ;
- `/projects/print-it.html` ;
- `/projects/riding-cities.html` ;
- `/projects/sophie-bluel.html` ;
- `/projects/tetris-windsurf.html`.

Ces pages doivent rester cohérentes avec le positionnement chef de projet digital : titres explicites, descriptions orientées résultats, balises sociales propres, liens internes vers compétences, contact et projets associés.

## 7. Pages share

Les pages `/share/` servent aux aperçus sociaux et aux cartes de partage. Elles permettent de contrôler finement le titre, la description et l'image utilisés lorsqu'un article est partagé.

Principes de gestion :

- elles sont servies sous `https://digitalblueskye.com/share` ;
- elles ne sont pas incluses dans `sitemap.xml` ;
- elles ne doivent pas remplacer les pages articles comme URLs canoniques de contenu éditorial ;
- elles doivent conserver des balises Open Graph et Twitter Cards propres ;
- les images déclarées dans `/share/assets/card-images/` doivent rester accessibles.

Cette séparation permet de garder le sitemap centré sur les pages éditoriales et commerciales réellement destinées à l'index principal, tout en offrant de bons aperçus sociaux.

## 8. Google Search Console

État connu :

- la propriété `digitalblueskye.com` est validée ;
- le sitemap `https://digitalblueskye.com/sitemap.xml` a été soumis ;
- Search Console indique 54 URLs découvertes pour le sitemap ;
- l'URL d'accueil et les pages stratégiques doivent être inspectées après chaque changement SEO significatif.

Checklist Search Console :

- [ ] Vérifier la prise en compte du sitemap
- [ ] Inspecter `https://digitalblueskye.com/`
- [ ] Inspecter `/pages/about.html`
- [ ] Inspecter `/pages/projects.html`
- [ ] Inspecter `/pages/skills.html`
- [ ] Inspecter `/blog/digital/blogArticles.html`
- [ ] Surveiller les erreurs d'exploration
- [ ] Surveiller les pages "Découverte, actuellement non indexée"

Actions recommandées après ajout ou refonte de pages :

1. vérifier que l'URL est dans le sitemap si elle doit être indexée ;
2. inspecter l'URL dans Search Console ;
3. demander l'indexation pour les pages stratégiques ;
4. suivre les statuts découvertes, explorées et indexées ;
5. corriger rapidement les 404, redirections incorrectes ou canonicals incohérents.

## 9. KPIs SEO à suivre

| KPI | Source recommandée | Fréquence | Objectif de pilotage |
| --- | --- | --- | --- |
| Impressions | Google Search Console | Hebdomadaire | Mesurer la visibilité dans les SERP |
| Clics | Google Search Console | Hebdomadaire | Suivre le trafic SEO entrant |
| CTR | Google Search Console | Hebdomadaire | Identifier les snippets à améliorer |
| Position moyenne | Google Search Console | Hebdomadaire | Suivre les requêtes et pages prioritaires |
| Pages indexées | Google Search Console | Mensuelle | Vérifier la couverture réelle du site |
| Erreurs d'exploration | Google Search Console | Mensuelle | Corriger les obstacles techniques |
| Core Web Vitals | PageSpeed Insights / Lighthouse | Mensuelle | Préserver l'expérience et la performance |
| Trafic organique | GA4 si activé | Mensuelle | Mesurer l'acquisition SEO réelle |
| Conversions éventuelles | GA4 ou suivi interne | Mensuelle | Relier SEO, contact et objectifs business |

Les objectifs chiffrés doivent être définis après stabilisation de la collecte Search Console et Analytics. Ne pas figer de cible sans historique fiable.

## 10. Outils recommandés

Outils prioritaires :

- Google Search Console : indexation, requêtes, pages, couverture ;
- PageSpeed Insights : Core Web Vitals et performance réelle ;
- Rich Results Test : validation des données structurées ;
- Lighthouse : audit technique local ou navigateur ;
- Screaming Frog : crawl, titres, descriptions, canonicals, 404 ;
- GA4 : trafic organique, engagement, conversions si nécessaire.

Outils optionnels :

- Ahrefs : backlinks, popularité, opportunités de contenus ;
- Semrush : suivi de positions, concurrence, audit sémantique.

## 11. Checklist de maintenance mensuelle

- [ ] Vérifier que `https://digitalblueskye.com/sitemap.xml` répond correctement
- [ ] Vérifier que `robots.txt` pointe vers le sitemap officiel
- [ ] Contrôler les canonicals des nouvelles pages
- [ ] Contrôler les `og:url`, `og:image` et `twitter:image`
- [ ] Rechercher les 404 et liens cassés
- [ ] Vérifier les pages nouvellement créées
- [ ] Mettre à jour le sitemap si ajout de pages indexables
- [ ] Vérifier les performances avec Lighthouse ou PageSpeed Insights
- [ ] Consulter Search Console pour erreurs et pages non indexées
- [ ] Vérifier les balises OG des pages `/share/`
- [ ] Contrôler le maillage interne des articles récents
- [ ] Vérifier que les données privées ou exports ne sont pas référencés publiquement

## 12. Historique des décisions SEO

- Migration du domaine officiel vers `https://digitalblueskye.com`.
- Achat et gestion du domaine chez Cloudflare.
- Branchement du domaine sur l'hébergement Netlify.
- Ajout du domaine dans les configurations Workers Cloudflare lorsque nécessaire.
- Suppression / désactivation de l'ancien hébergement InfinityFree pour le site public actuel.
- Création d'un sitemap unique `https://digitalblueskye.com/sitemap.xml`.
- Suppression de l'ancien `sitemap-v2.xml`.
- Retrait des anciennes URLs opérationnelles `digitalblueskye.netlify.app` des fichiers publics SEO.
- Migration des pages de partage depuis `digitalblueskye-share.netlify.app` vers `https://digitalblueskye.com/share`.
- Exclusion volontaire des pages `/share/` du sitemap principal.
- Ajout des données collectées dans le dossier `Personal-Data-Users.Digitalblueskye/`, à traiter comme données internes et non comme contenu SEO public.
- Consolidation des anciens documents `SEO_ACTION_GUIDE.md` et `SEO_AUDIT_REPORT_2025-12-01.md` dans `docs/SEO.md`.

## 13. Prochaines améliorations

Améliorations recommandées :

- ajouter un balisage `hreflang` FR/EN si une stratégie multilingue indexable est confirmée ;
- optimiser les images en WebP/AVIF avec dimensions maîtrisées ;
- renforcer le maillage interne entre pages projet, compétences et articles ;
- ajouter éventuellement un JSON-LD `BreadcrumbList` sur les pages profondes ;
- activer ou compléter GA4 si le suivi des conversions devient nécessaire ;
- réaliser un audit Core Web Vitals après chaque évolution visuelle importante ;
- construire une stratégie backlinks progressive et qualitative ;
- auditer régulièrement les pages inspirations pour conserver des titres, descriptions et images sociales cohérents ;
- documenter toute nouvelle décision SEO structurante directement dans ce fichier.
