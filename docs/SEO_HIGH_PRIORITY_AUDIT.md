# Audit SEO Priorités Hautes - Digital Blue Skye

## 1. Résumé exécutif

Audit local réalisé sur `assets/`, `blog/`, `pages/`, `projects/` et `share/`, sans appel Lighthouse ni outil externe. Les constats ci-dessous sont donc des risques techniques déduits du code et des fichiers du dépôt, pas des mesures réelles de terrain.

Les priorités hautes sont claires :

- le parc image est encore majoritairement en formats historiques : 135 `jpg`, 42 `jpeg`, 116 `png`, contre 19 `webp` et aucun `avif` détecté ;
- plusieurs images sources sont très lourdes, notamment dans les projets Arcadia Zoo, les fonds visuels, les articles IA et les inspirations voyage ;
- 737 balises `img` ont été détectées dans les pages HTML auditées ; 525 n'ont pas à la fois `width` et `height`, ce qui augmente le risque CLS ;
- 673 balises `img` ne déclarent pas `loading`, avec un risque de chargement excessif sur les pages listes, galeries et projets ;
- les scripts globaux sont chargés très largement : `ai-assistant.js` pèse environ 500 Ko et apparaît sur 53 pages ; `style.css` pèse environ 363 Ko ;
- le maillage interne est robuste pour les hubs (`index.html`, `blogArticles.html`, `pages/about.html`, `pages/contact.html`, `pages/projects.html`), mais certains articles et projets restent faiblement liés hors navigation globale ;
- le multilingue repose sur une traduction client via `translator.js`, `translations/fr.json` et `translations/en.json`, sans URLs séparées FR/EN. L'ajout de `hreflang` ne doit pas être fait immédiatement sans architecture d'URLs dédiée.

## 2. Images et optimisation WebP/AVIF

Formats détectés localement :

| Format | Nombre de fichiers | Lecture SEO/performance |
| --- | ---: | --- |
| jpg | 135 | Format dominant, nombreux candidats WebP/AVIF |
| png | 116 | À conserver pour transparence/UI si nécessaire, sinon convertir |
| jpeg | 42 | Même logique que JPG |
| webp | 19 | Déjà optimisé partiellement |
| svg | 4 | Adapté aux logos/icônes vectoriels |
| avif | 0 | Aucun usage détecté |

Images lourdes et candidats prioritaires :

| Fichier | Format | Usage probable | Risque | Recommandation |
| --- | --- | --- | --- | --- |
| `assets/images/projects/imagesArcadiaZoo/high-angle-shot-zebra-eating-hay-zoo.jpg` | JPG, 24.49 Mo | Galerie/projet Arcadia Zoo | Très lourd si servi tel quel | Créer dérivés WebP/AVIF responsive et conserver l'original hors chemin public si possible |
| `assets/images/projects/imagesArcadiaZoo/view-two-zebras-zoo-with-wooden-fence-surface.jpg` | JPG, 21.42 Mo | Galerie/projet Arcadia Zoo | Très lourd | Même recommandation, priorité haute |
| `assets/images/projects/imagesArcadiaZoo/vertical-shot-giraffe-tree.jpg` | JPG, 21.10 Mo | Galerie/projet Arcadia Zoo | Très lourd | Même recommandation, priorité haute |
| `assets/images/backgrounds/robotic-hand-pointing-against-black.jpg` | JPG, 14.45 Mo | Fond / visuel décoratif | Risque LCP si chargé au-dessus de la ligne de flottaison | Convertir, réduire aux dimensions réellement affichées |
| `assets/images/projects/imagesArcadiaZoo/endangered-bornean-orangutan-rocky-habitat-pongo-pygmaeus-wild-animal-bars-beautiful-cute-creature.jpg` | JPG, 13.09 Mo | Galerie/projet Arcadia Zoo | Très lourd | Générer version optimisée |
| `assets/images/projects/imagesArcadiaZoo/monkey.jpeg` | JPEG, 12.86 Mo | Galerie/projet Arcadia Zoo | Très lourd | Générer WebP/AVIF |
| `assets/images/projects/imagesArcadiaZoo/american-jaguar-nature-habitat-south-american-jungle.jpg` | JPG, 11.13 Mo | Galerie/projet Arcadia Zoo | Très lourd | Générer WebP/AVIF |
| `assets/images/projects/imagesTetrisWindsurf/Tetris-cover-page.jpg` | JPG, 9.84 Mo | Carte et page projet Tetris | Risque LCP sur listes projets | Créer miniature optimisée distincte de l'image détail |
| `assets/images/blog/IA agentique/robot-performing-human-job.jpg` | JPG, 8.31 Mo | Article IA agentique | Très lourd si utilisé dans contenu ou partage | Créer image article WebP/AVIF |
| `assets/images/blog/IA et gestion de projets/Futuristic-concept-of-artificial-intelligence-in-business.jpg` | JPG, 8.08 Mo | Carte article / visuel blog | Risque fort sur index et blog | Remplacer par dérivé optimisé |
| `share/assets/card-images/article-ia-gestion-projet.jpg` | JPG, 8.08 Mo | Carte sociale share | Trop lourd pour aperçu social | Exporter une carte sociale compressée autour de 1200px |
| `assets/images/portrait/Djelloul Galicia.jpg` | JPG, 7.51 Mo | Photo profil about | Risque LCP sur page about | Créer version profil WebP avec dimensions fixes |
| `assets/images/travel inspirations/Espana/Vanupieds.jpg` | JPG, 4.24 Mo | Inspiration voyage | Lourd pour galerie et page détail | Créer miniatures et version détail optimisée |
| `assets/images/travel inspirations/Turkey/Theatre de Hierapolis.jpg` | JPG, 3.89 Mo | Inspiration voyage | Lourd | Convertir et dimensionner |
| `assets/images/projects/imagesRidingCities/header.png` | PNG, 2.10 Mo | Carte/projet Riding Cities | PNG probablement convertible | Tester WebP ; garder PNG seulement si transparence nécessaire |
| `assets/images/projects/imagesSophieBluel/sophie-bluel.png` | PNG, 1.65 Mo | Carte/projet Sophie Bluel | PNG lourd | Convertir en WebP si pas de besoin de transparence |

Usage constaté :

- les pages projet et listes projet utilisent plusieurs images JPG/PNG lourdes comme visuels de carte ou hero ;
- les articles blog digital utilisent des images de bannière avec `loading="lazy"` mais souvent sans dimensions ;
- les pages inspirations utilisent des photos JPG en hero détail et en grille ;
- les pages `/share/` référencent des images sociales, majoritairement JPG/JPEG/PNG/WebP selon les articles.

Chemin suspect détecté :

| Référence | Problème | Recommandation |
| --- | --- | --- |
| `blog/digital/article-cone-apprentissage.html` référence `/assets/images/blog/cone-apprentissage.jpg` dans un attribut image/social | Le fichier n'existe pas localement | Vérifier si c'est une ancienne image OG/canonical social et remplacer par une image existante lors d'une future correction |

## 3. Attributs img : width, height, alt, loading

Synthèse locale :

- 737 balises `img` détectées ;
- 0 balise `img` sans `alt` détectée par le scan local ;
- 525 balises sans couple `width` + `height` ;
- 673 balises sans attribut `loading`.

Le fait qu'une image n'ait pas `loading="lazy"` n'est pas toujours un défaut : une image hero visible immédiatement peut rester eager. En revanche, les images de listes, galeries, footers, icônes répétées et contenus sous la ligne de flottaison devraient être traitées de façon cohérente.

| Page | Image | Problème détecté | Recommandation |
| --- | --- | --- | --- |
| `blog/digital/article-ia-gestion-projet.html` | `/assets/images/blog/IA et gestion de projets/vecteezy_ai-driven-diversity-and-inclusion-initiatives_63581501.jpg` | Pas de `width`/`height`; `loading="lazy"` sur bannière article | Ajouter dimensions ou ratio CSS ; vérifier si la bannière est LCP et doit être eager |
| `blog/digital/article-tech-2026.html` | `/assets/images/blog/2026 Future Tech/12744-en-entertainment-with-technology-in-2025-next-gen-games-and-events.jpg` | Pas de `width`/`height`; bannière lazy | Ajouter dimensions ; arbitrer lazy/eager selon position réelle |
| `blog/digital/article-seo-chef-projet.html` | `/assets/images/blog/SEO/Best-Tools-For-SEO-Task-Management.webp` | Pas de `width`/`height`; bannière lazy | Ajouter dimensions intrinsèques ou `aspect-ratio` |
| `blog/digital/blogArticles.html` | Images `.blog-card-image` | Pas de `width`/`height`; pas de `loading` sur plusieurs cartes | Ajouter dimensions et lazy sur cartes non prioritaires ; garder éventuellement les premières cartes eager |
| `blog/inspirations/carnets-inspirations.html` | Grille inspirations voyage | Pas de `width`/`height`; pas de `loading` | Ajouter dimensions/ratio et lazy sur les cartes hors premier écran |
| `blog/inspirations/*.html` | `.detail-hero-image` | Pas de `width`/`height`; pas de `loading` | Ajouter dimensions ou ratio. Ne pas lazy-loader si l'image est le LCP de la page détail |
| `pages/about.html` | `/assets/images/portrait/Djelloul Galicia.jpg` | Pas de `width`/`height`; pas de `loading`; image lourde | Créer version optimisée et réserver l'espace rendu |
| `pages/projects.html` | Cartes projets | Pas de `width`/`height`; pas de `loading` | Ajouter miniatures optimisées, dimensions et lazy sur cartes sous le premier écran |
| `pages/visualTourProjects.html` | `.project-display-image` | Pas de `width`/`height`; pas de `loading` | Réserver un ratio stable et lazy-loader les éléments non visibles |
| `projects/*.html` | Images hero et galeries | Pas de `width`/`height`; pas de `loading` sur de nombreuses images | Hero potentiellement eager, galerie lazy avec dimensions |
| `share/*.html` | Images sociales dans meta, peu de contenu visible | Pas un problème `img` direct sur la plupart des pages | Priorité sur poids des fichiers `share/assets/card-images/` |

Images critiques à ne pas lazy-loader sans test :

- hero de `index.html` si l'image est visible dans le premier viewport ;
- photo principale de `pages/about.html` si elle apparaît au-dessus de la ligne de flottaison ;
- hero des pages projet (`projects/*.html`) ;
- hero détail des inspirations (`blog/inspirations/*.html`) ;
- première ou deux premières cartes visibles dans `blog/digital/blogArticles.html` et `pages/projects.html`.

## 4. Risques Core Web Vitals

### LCP

Risques probables :

- images hero ou cartes très lourdes, notamment Arcadia Zoo, Tetris, portrait about, inspirations voyage et articles IA ;
- `styles/style.css` pèse environ 363 Ko et est global ;
- Google Fonts sont chargées sur de nombreuses pages, avec plusieurs familles ;
- AOS CSS/JS et Font Awesome CDN sont chargés sur beaucoup de pages ;
- `ai-assistant.js` pèse environ 500 Ko et est chargé sur 53 pages auditées ;
- certaines bannières d'article sont en `loading="lazy"`, ce qui peut retarder le LCP si elles sont visibles immédiatement.

Information non mesurable localement : l'élément LCP réel par page, le TTFB, la compression Netlify, le cache CDN et les timings navigateur.

### CLS

Risques probables :

- 525 balises `img` sans dimensions explicites ;
- galeries projet et inspirations sans réservation d'espace image ;
- contenus injectés ou traduits par `translator.js` via `innerHTML`, pouvant modifier la hauteur des blocs après chargement JSON ;
- panneaux dynamiques : assistant IA, commentaires, likes, boutons de partage, loader, animations AOS ;
- polices Google pouvant modifier les métriques typographiques au chargement.

Points positifs :

- toutes les balises `img` scannées ont un `alt` ;
- plusieurs petites icônes critiques ont déjà `width` et `height`.

### INP

Risques probables :

- `ai-assistant.js` est le script local le plus lourd, environ 500 Ko, et contient de nombreuses fonctionnalités : chat, pièces jointes, export, voix, bibliothèque, rendu de sources ;
- scripts globaux chargés largement : `translator.js`, `theme-switcher.js`, `navbar-dropdown.js`, `ai-assistant.js` sur 53 pages ;
- AOS est chargé sur environ 35 pages ;
- Google Analytics est chargé sur environ 36 pages ;
- les pages articles chargent souvent `comments.js`, `likes.js`, `share-links.js`, `scroll-animations.js`, parfois `carousel.js` et `parallax.js`.

Information non mesurable localement : tâches longues réelles, temps d'exécution JS, coût main thread mobile et INP terrain.

Scripts/CDN présents :

- `https://www.googletagmanager.com/gtag/js` ;
- `https://unpkg.com/aos@2.3.1/dist/aos.js` et CSS associé ;
- `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css` ;
- Google Fonts via `fonts.googleapis.com` et `fonts.gstatic.com` ;
- `https://cdn.emailjs.com/dist/email.min.js` sur une page.

## 5. Maillage interne

Pages fortes selon le nombre de liens entrants internes détectés :

- `blog/digital/blogArticles.html` : 123 liens entrants ;
- `index.html` : 108 liens entrants ;
- `pages/about.html` : 106 liens entrants ;
- `pages/contact.html` : 106 liens entrants ;
- `pages/projects.html` : 87 liens entrants ;
- `blog/inspirations/carnets-inspirations.html` : 67 liens entrants.

Pages faibles ou à surveiller :

- `blog/digital/article-rse-digital.html` : 0 lien entrant HTML détecté dans le scan local hors cas non résolu par JS ;
- `blog/digital/article-ia-gestion-projet.html` : 2 liens entrants ;
- plusieurs inspirations Espagne ont 2 liens entrants ;
- la plupart des pages projet ont 3 liens entrants, sauf `projects/riding-cities.html` avec 4 ;
- les articles digitaux récents ont 4 liens entrants, ce qui reste faible hors hub blog.

Lien interne cassé ou suspect :

| Page source | Lien | Problème |
| --- | --- | --- |
| `pages/privacy.html` | `/export-csv.html` | Le fichier existe à la racine, mais il n'était pas dans le périmètre HTML audité pour le graphe. À vérifier fonctionnellement avant de le considérer cassé. |

Articles à relier en priorité :

- `article-rse-digital.html` vers `article-pue-datacenters.html`, `article-rgpd-2025.html` et `pages/gouvernance-ia.html` ;
- `article-ia-gestion-projet.html` vers `article-ia-agentique-gestion-projet.html`, `article-menaces-ia-cybersecurite-2026.html` et `pages/gouvernance-ia.html` ;
- `article-seo-chef-projet.html` vers `pages/projects.html`, `pages/skills.html` et les articles sur veille/signaux faibles ;
- `article-signaux-faibles.html` vers `article-outils-veille.html` et `article-connector-dots.html` ;
- `article-pue-datacenters.html` vers `article-rse-digital.html` et `article-tech-2026.html`.

Opportunités pages projet / compétences :

- depuis chaque page projet, ajouter un lien contextuel vers `pages/skills.html` avec une ancre liée à la compétence démontrée ;
- depuis `pages/skills.html`, créer des liens profonds vers 3 à 5 projets représentatifs par compétence ;
- depuis `pages/projects.html`, enrichir les ancres de cartes avec le bénéfice projet, pas seulement le nom ;
- depuis les articles blog, ajouter des liens vers les projets qui illustrent le sujet : performance, accessibilité, gouvernance, données, front-end.

Recommandations d'ancres internes :

- préférer `compétences front-end appliquées au projet Booki` à `voir le projet` ;
- préférer `gouvernance IA et risques cybersécurité` à `en savoir plus` ;
- préférer `optimisation SEO pour chef de projet digital` à `lire l'article` ;
- préférer `retours d'expérience projets web` à `mes projets`.

## 6. Hreflang FR/EN

État actuel :

- les pages HTML déclarent majoritairement `<html lang="fr">` ;
- le contenu multilingue est géré côté client via `scripts/translator.js` ;
- les dictionnaires `translations/fr.json` et `translations/en.json` existent ;
- `translator.js` lit la langue depuis cookie/localStorage, charge `/translations/{lang}.json`, remplace les contenus via `data-i18n`, puis met à jour `document.documentElement.lang` ;
- aucune architecture d'URLs séparées FR/EN n'a été détectée (`/fr/`, `/en/`, paramètres canoniques ou pages HTML dédiées) ;
- une même URL peut donc servir une version FR ou EN selon l'état client.

Conclusion : ne pas implémenter `hreflang` maintenant.

Raison : `hreflang` doit pointer vers des URLs alternatives stables, crawlables et indexables. Avec l'architecture actuelle, les variantes linguistiques ne sont pas représentées par des URLs distinctes. Ajouter `hreflang="fr"` et `hreflang="en"` vers la même URL ou vers une variante non canonique risquerait d'envoyer un signal ambigu à Google.

Stratégie prudente recommandée :

1. décider si les versions EN doivent être indexées ou seulement disponibles en UX ;
2. si l'indexation EN est souhaitée, créer une architecture stable, par exemple `/fr/...` et `/en/...`, ou à défaut des URLs paramétrées explicitement gérées et canoniques ;
3. rendre chaque version directement crawlable avec contenu serveur/statique déjà dans le HTML, pas uniquement injecté après JS ;
4. aligner canonical, `og:url`, sitemap et `hreflang` ;
5. ajouter ensuite des liens `hreflang` réciproques et `x-default`.

## 7. Plan d'action recommandé

### Actions rapides

- Lister les images réellement utilisées au-dessus de la ligne de flottaison par template.
- Ajouter `width`/`height` ou un `aspect-ratio` CSS aux images de cartes blog, projets et inspirations.
- Ajouter `loading="lazy"` aux images de listes et galeries hors premier écran.
- Vérifier la référence suspecte `/assets/images/blog/cone-apprentissage.jpg`.
- Identifier les pages où `ai-assistant.js` est indispensable et celles où il pourrait être différé.

### Actions moyennes

- Créer des dérivés WebP pour les images JPG/JPEG/PNG les plus lourdes.
- Créer des miniatures dédiées pour `pages/projects.html`, `blogArticles.html` et `carnets-inspirations.html`.
- Réduire les images de partage dans `share/assets/card-images/` à une taille sociale maîtrisée.
- Rationaliser le chargement des scripts par type de page : projet, article, inspiration, page légale, page contact.
- Renforcer le maillage interne des articles faibles, notamment `article-rse-digital.html` et `article-ia-gestion-projet.html`.

### Actions complexes

- Mettre en place une stratégie responsive images avec `srcset` et `sizes`.
- Découper ou charger conditionnellement `ai-assistant.js`.
- Extraire le CSS critique et réduire le CSS global non utilisé.
- Repenser l'architecture multilingue si les contenus EN doivent être indexés.
- Générer des pages statiques FR/EN distinctes avant d'ajouter `hreflang`.

### Actions à reporter

- Implémentation `hreflang` tant qu'il n'existe pas d'URLs FR/EN stables.
- Conversion AVIF généralisée avant validation de la chaîne de build et des fallbacks.
- Suppression de bibliothèques ou scripts sans mesure navigateur réelle.
- Objectifs chiffrés Core Web Vitals sans données Lighthouse, PageSpeed Insights ou terrain Search Console.

## 8. Première passe d'implémentation

Passe réalisée localement à partir des dimensions intrinsèques des fichiers images, sans conversion, suppression, renommage ni modification de `sitemap.xml`, `robots.txt`, `docs/SEO.md` ou des Workers Cloudflare.

Fichiers modifiés :

- `blog/digital/blogArticles.html` ;
- `blog/digital/article-*.html` ;
- `blog/inspirations/carnets-inspirations.html` ;
- `blog/inspirations/*.html` ;
- `pages/about.html` ;
- `pages/projects.html` ;
- `pages/visualTourProjects.html` ;
- `projects/*.html`.

Types de corrections :

- ajout de `width` et `height` sur les images locales lorsque les dimensions ont pu être déterminées avec les fichiers du dépôt ;
- ajout de `loading="lazy"` sur des images de cartes, listes et galeries placées après les premiers éléments visibles ;
- conservation des images hero/projet/inspiration détail sans lazy-loading ajouté automatiquement ;
- préservation des attributs `alt` existants ;
- ajout de dimensions aux icônes sociales présentes dans les pages modifiées afin de réserver leur espace.

Références corrigées :

- remplacement du lien cassé `/assets/images/blog/cone-apprentissage.jpg` dans `blog/digital/article-cone-apprentissage.html` par l'image locale existante `/assets/images/blog/Cone apprentissage/Ppyramide-ou-cone-de-lapprentissage-768x1024-1.jpg`.

Cas laissés à arbitrer :

- plusieurs bannières d'articles (`.article-banner-image`) conservent `loading="lazy"` alors qu'elles pourraient être candidates LCP selon le rendu réel ; ce point nécessite un test navigateur ou Lighthouse avant retrait ;
- les premières cartes de `blog/digital/blogArticles.html`, `pages/projects.html`, `pages/visualTourProjects.html` et `blog/inspirations/carnets-inspirations.html` restent sans lazy-loading ajouté afin d'éviter de retarder un éventuel LCP ;
- les images restent dans leurs formats d'origine, y compris les fichiers JPG/PNG lourds identifiés dans l'audit.

Limites de cette passe :

- aucune optimisation de poids image n'a été réalisée ;
- aucune stratégie `srcset` / `sizes` n'a été ajoutée ;
- aucun score Core Web Vitals réel n'a été mesuré ;
- aucun changement de maillage interne, de scripts globaux ou de stratégie multilingue n'a été effectué.

## 9. Deuxième passe d'implémentation : images optimisées

Passe réalisée avec `cwebp` disponible localement (`/Applications/XAMPP/xamppfiles/bin/cwebp`). Aucun outil externe en ligne, aucune nouvelle dépendance, aucune suppression ou conversion massive n'a été effectué. Les originaux sont conservés en place.

| Image originale | Taille originale | Image optimisée | Taille optimisée | Gain | Références mises à jour |
| --- | ---: | --- | ---: | ---: | --- |
| `assets/images/portrait/Djelloul Galicia.jpg` | 7.51 Mo | `assets/images/portrait/Djelloul Galicia-optimized.webp` | 52 Ko | 99.3% | `pages/about.html` |
| `assets/images/projects/imagesTetrisWindsurf/Tetris-cover-page.jpg` | 9.84 Mo | `assets/images/projects/imagesTetrisWindsurf/Tetris-cover-page-optimized.webp` | 415 Ko | 95.9% | `pages/projects.html`, `pages/visualTourProjects.html`, `projects/tetris-windsurf.html` |
| `assets/images/blog/IA agentique/robot-performing-human-job.jpg` | 8.31 Mo | `assets/images/blog/IA agentique/robot-performing-human-job-optimized.webp` | 75 Ko | 99.1% | Aucune référence HTML directe détectée dans cette passe |
| `assets/images/blog/IA et gestion de projets/Futuristic-concept-of-artificial-intelligence-in-business.jpg` | 8.08 Mo | `assets/images/blog/IA et gestion de projets/Futuristic-concept-of-artificial-intelligence-in-business-optimized.webp` | 57 Ko | 99.3% | `blog/digital/blogArticles.html` |
| `share/assets/card-images/article-ia-gestion-projet.jpg` | 8.08 Mo | `share/assets/card-images/article-ia-gestion-projet-card.webp` | 39 Ko | 99.5% | `share/article-ia-gestion-projet.html` (`og:image`, `twitter:image`) |
| `assets/images/projects/imagesRidingCities/header.png` | 2.10 Mo | `assets/images/projects/imagesRidingCities/header-optimized.webp` | 249 Ko | 88.4% | `pages/projects.html`, `pages/visualTourProjects.html`, `projects/riding-cities.html` |
| `assets/images/projects/imagesSophieBluel/sophie-bluel.png` | 1.65 Mo | `assets/images/projects/imagesSophieBluel/sophie-bluel-optimized.webp` | 83 Ko | 95.1% | `pages/projects.html`, `pages/visualTourProjects.html`, `projects/sophie-bluel.html` |

Images traitées :

- profil `about` ;
- visuel Tetris utilisé en liste projet, galerie et page projet ;
- visuel IA agentique créé en dérivé WebP pour usage futur, sans remplacement car aucune référence HTML directe n'a été détectée ;
- visuel IA gestion de projet utilisé dans la liste du blog digital ;
- carte sociale share de l'article IA gestion de projet ;
- visuels projets Riding Cities et Sophie Bluel, avec gain réel malgré les sources PNG.

Images non traitées et pourquoi :

- images Arcadia Zoo très lourdes : reportées à une passe dédiée avec miniatures, versions détail et stratégie de conservation des originaux ;
- autres images blog, inspirations et projets : hors premier lot demandé ;
- AVIF : non généré dans cette passe afin de garder la maintenance simple et progressive.

Fichiers HTML modifiés :

- `pages/about.html` ;
- `pages/projects.html` ;
- `pages/visualTourProjects.html` ;
- `projects/riding-cities.html` ;
- `projects/sophie-bluel.html` ;
- `projects/tetris-windsurf.html` ;
- `blog/digital/blogArticles.html` ;
- `share/article-ia-gestion-projet.html`.

Prochaines images à traiter :

- lot Arcadia Zoo avec distinction miniatures / images détail ;
- images inspirations voyage les plus lourdes ;
- autres cartes de `blog/digital/blogArticles.html` ;
- images de partage restantes dans `share/assets/card-images/`.

## 10. Troisième passe d'implémentation : maillage interne

Passe réalisée sans modification de `sitemap.xml`, `robots.txt`, `docs/SEO.md`, des Workers Cloudflare, des images ou de la stratégie `hreflang`.

Fichiers modifiés :

- `translations/fr.json` ;
- `translations/en.json` ;
- `pages/skills.html` ;
- `pages/projects.html`.

Liens ajoutés dans les contenus d'articles via i18n :

- `article-rse-digital.html` vers `article-pue-datacenters.html`, `article-rgpd-2025.html` et `pages/gouvernance-ia.html` ;
- `article-ia-gestion-projet.html` vers `article-ia-agentique-gestion-projet.html`, `article-menaces-ia-cybersecurite-2026.html` et `pages/gouvernance-ia.html` ;
- `article-seo-chef-projet.html` vers `pages/projects.html`, `pages/skills.html`, `article-outils-veille.html` et `article-signaux-faibles.html` ;
- `article-signaux-faibles.html` vers `article-outils-veille.html` et `article-connector-dots.html` ;
- `article-pue-datacenters.html` vers `article-rse-digital.html` et `article-tech-2026.html`.

Ancres utilisées :

- `gouvernance IA et risques cybersécurité` ;
- `retours d'expérience projets web` ;
- `compétences front-end, SEO et pilotage digital` ;
- `outils de veille digitale` ;
- `signaux faibles du numérique` ;
- `PUE et de l'empreinte énergétique des datacenters` ;
- `RSE appliquée aux projets web`.

Renforcement projets / compétences :

- `pages/skills.html` ajoute des liens profonds vers `Booki`, `Sophie Bluel`, `Arcadia Zoo` et `Tetris Windsurf` avec des ancres orientées compétences ;
- `pages/projects.html` remplace les ancres génériques `En savoir plus sur ce projet` par des ancres descriptives par projet, pilotées par `translations/fr.json` et `translations/en.json`.

Limites et pages laissées à traiter :

- les pages projet individuelles n'ont pas reçu de nouveaux paragraphes contextuels pour éviter d'alourdir la passe ;
- le maillage des articles inspirations reste inchangé ;
- un prochain passage pourra relier plus finement chaque page projet à une compétence précise et ajouter des liens contextuels depuis les pages projet vers les articles SEO, IA ou RSE pertinents.
