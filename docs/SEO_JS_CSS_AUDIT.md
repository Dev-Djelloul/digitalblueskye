# Audit JS/CSS SEO & Performance - Digital Blue Skye

## 1. Resume executif

Audit realise localement, sans Lighthouse, sans navigateur de mesure et sans outil externe. Les constats ci-dessous identifient des risques potentiels LCP/INP a partir du code HTML, CSS et JS du depot.

Les deux principaux leviers sont :

- `scripts/ai-assistant.js` : environ 500 Ko, charge sur 54 pages, alors que le balisage complet de l'assistant n'a ete detecte que sur `index.html` ;
- `styles/style.css` : environ 363 Ko, charge sur la quasi-totalite des pages publiques et contenant aussi un `@import` Google Fonts.

Les scripts transverses `translator.js`, `theme-switcher.js` et `navbar-dropdown.js` sont charges tres largement. Ils semblent lies a des fonctions globales reelles, mais leur ordre, leur mode de chargement et leur execution initiale doivent etre audites avant tout `defer` systematique.

Les CDN les plus presents sont Google Analytics / Tag Manager, Google Fonts, AOS et Font Awesome. AOS et Font Awesome sont charges sur 36 pages ; Font Awesome semble peu utilise dans le HTML scanne, ce qui en fait un candidat prioritaire pour rationalisation. AOS est utile sur plusieurs templates, mais pas necessairement sur toutes les pages ou il est charge.

Conclusion prudente : la prochaine passe doit viser le chargement conditionnel et le decoupage progressif, pas une suppression globale. Les pages share ne chargent pas le socle global CSS/JS, ce qui est coherent avec leur role d'aperçus sociaux.

## 2. Methode locale

Commandes et inspections utilisees :

- inventaire des balises `<script src>` et `<link rel="stylesheet">` sur 71 fichiers HTML ;
- comptage par famille de pages : racine, `pages/`, `projects/`, `blog/digital/`, `blog/inspirations/`, `share/` ;
- poids locaux via `wc -c scripts/*.js styles/style.css` ;
- recherche locale des usages `ai-assistant`, `data-aos`, `AOS.init`, `font-awesome`, `fa-`, `gtag`, `cdnjs`, `jsdelivr`, `fonts.googleapis` ;
- lecture de `docs/SEO.md` et `docs/SEO_HIGH_PRIORITY_AUDIT.md`.

Limites :

- aucun score Lighthouse reel n'a ete mesure ;
- le poids reseau compresse gzip/brotli n'a pas ete mesure ;
- l'execution JS effective n'a pas ete profilee ;
- les recommandations restent des hypotheses techniques a valider par test navigateur avant implementation.

## 3. Inventaire des scripts globaux

| Script | Poids local approx. | Occurrences HTML | Usage probable | Risque LCP/INP | Recommandation |
| --- | ---: | ---: | --- | --- | --- |
| `scripts/ai-assistant.js` | 500 Ko | 54 | Assistant IA, sessions, fichiers, voix, bibliotheque, exports | Eleve : parsing/execution large, nombreux listeners, logique riche sur pages SEO | Charger conditionnellement, ou extraire un bootstrap minimal puis charger le module complet a l'ouverture |
| `scripts/translator.js` | 13 Ko | 55 | Traductions client FR/EN via `data-i18n` | Moyen : modifie le DOM, depend du contenu visible | Conserver prudemment ; envisager `defer` seulement apres verification anti-flash et ordre d'execution |
| `scripts/navbar-dropdown.js` | 12 Ko | 54 | Menu / navigation globale | Faible a moyen | Garder global si la navigation en depend ; verifier qu'il est `defer`-compatible |
| `scripts/theme-switcher.js` | 4 Ko | 54 | Theme clair/sombre | Moyen si le theme est applique trop tard | Ne pas differer aveuglement si cela provoque un flash de theme ; isoler un mini script critique si besoin |
| `scripts/loader.js` | 18 Ko | 23 | Loader, consentement, initialisation AOS possible | Moyen : risque d'effet visuel initial et logique non necessaire partout | Limiter aux pages qui utilisent reellement le loader / consentement / hooks associes |
| `scripts/likes.js` | 8 Ko | 32 | Likes blog digital et inspirations | Faible a moyen, selon appels reseau | Charger uniquement sur les pages avec UI de likes |
| `scripts/comments.js` | 19 Ko | 14 | Commentaires articles digitaux | Moyen : interactions, fetch, DOM dynamique | Rester limite aux articles ; lazy-init sous la zone de commentaire possible |
| `scripts/jsonld-injector.js` | 7 Ko | 14 | Donnees structurees Article | Faible INP, SEO important | Ne pas retirer sans remplacer par JSON-LD statique equivalent |
| `scripts/share-links.js` | 3 Ko | 14 | Boutons de partage articles | Faible | Charger uniquement sur les articles avec boutons de partage |
| `scripts/detail-zoom.js` | 4 Ko | 18 | Zoom images inspirations detail | Faible a moyen | Charger uniquement sur pages inspiration detail, ce qui est deja le cas |
| `scripts/scroll-animations.js` | 3 Ko | 18 | Animations au scroll | Moyen si listeners scroll frequents | Verifier usage et impact ; preferer IntersectionObserver si non deja fait |
| `scripts/blog.js` | 18 Ko | 1 | Page liste blog digital | Faible car cible unique | Rien d'urgent |
| `scripts/contact-validation.js` | 3 Ko | 1 | Validation formulaire contact | Faible car cible unique | Rien d'urgent |
| `scripts/about-animations.js` | 2 Ko | 1 | Animations page about | Faible car cible unique | Rien d'urgent |
| `scripts/skills-parallax.js` | 2 Ko | 2 | Effets pages skills/projects | Moyen si scroll | Auditer l'utilite reelle sur chaque page |
| `scripts/parallax-effect.js` | 2 Ko | 2 | Effets pages skills/projects | Moyen si scroll | Auditer l'utilite reelle sur chaque page |
| `scripts/explore.js` | 1 Ko | 1 | Page visualTourProjects | Faible | Rien d'urgent |

## 4. Focus `ai-assistant.js`

Constats locaux :

- `ai-assistant.js` est reference sur 54 pages : accueil, pages principales, pages projets, blog digital et blog inspirations ;
- le balisage complet de l'assistant (`ai-assistant-launcher`, `ai-assistant-panel`, `ai-assistant-form`, etc.) n'a ete detecte que sur `index.html` ;
- le script contient de nombreuses initialisations DOM, listeners, gestion de sessions, fichiers, voix, recherche, bibliotheque et projets ;
- le script charge dynamiquement des bibliotheques lourdes a la demande : `html2pdf`, `jspdf`, `tesseract.js`, `pdf.js`, `mammoth`, `xlsx`, `jszip`.

Lecture prudente :

- sur `index.html`, l'assistant semble etre une experience fonctionnelle de premier plan ;
- sur les autres pages, le script peut etre necessaire seulement si l'interface est injectee ailleurs par JS, par un include serveur ou par une logique non visible dans le HTML scanne ;
- en l'etat du scan statique, charger 500 Ko sur des articles, pages projet, pages legales et inspirations detail presente un risque INP inutile.

Pages ou l'assistant est probablement justifie :

- `index.html`, car le balisage complet y est present ;
- eventuellement `pages/contact.html`, `pages/projects.html`, `pages/skills.html`, si l'assistant est un service transverse voulu sur les pages de conversion ;
- pages projet ou articles uniquement si l'objectif produit est d'offrir l'assistant partout.

Pages ou le chargement complet semble a challenger :

- `pages/privacy.html`, `pages/terms.html`, `pages/cookies-policy.html` ;
- articles `blog/digital/article-*.html` ;
- pages `blog/inspirations/*.html` ;
- pages projet si l'assistant n'est pas visible ou utilise.

Strategie recommandee :

1. conserver un petit bootstrap global, inferieur a quelques Ko, qui detecte la presence d'un point d'ancrage ou affiche un bouton si l'assistant est voulu ;
2. charger `ai-assistant.js` seulement au premier clic, a l'ouverture du panneau, ou uniquement sur une liste blanche de pages ;
3. extraire les fonctions lourdes en modules chargeables a la demande : fichiers, OCR, PDF, tableurs, exports ;
4. garder les CDN deja dynamiques dans l'assistant en chargement strictement utilisateur, pas au chargement initial ;
5. tester les pages avec et sans assistant pour verifier qu'aucune fonctionnalite transverse n'en depend silencieusement.

## 5. Scripts CDN

| CDN / ressource | Occurrences | Usage | Risque | Recommandation |
| --- | ---: | --- | --- | --- |
| `https://www.googletagmanager.com/gtag/js?id=G-XJ51Y4QD25` | 36 | Analytics GA4 | Faible a moyen : tiers, reseau, confidentialite, ordre consentement | Garder si mesure necessaire ; verifier consentement et chargement async |
| Google Fonts `Roboto Condensed` | 54 | Typographie principale | Moyen LCP : CSS tiers + polices bloquantes potentielles | Rationaliser les familles et graisses ; envisager auto-hebergement si prioritaire |
| Google Fonts `Iceland` | 54 | Titres / style visuel | Moyen si charge partout | Verifier pages qui l'utilisent reellement |
| Google Fonts `Gelasio` | 1 en HTML + `@import` CSS | Assistant / accueil | Moyen : doublon potentiel via HTML et CSS | Eviter les doubles chargements ; retirer `@import` a terme au profit de liens HTML controles |
| `https://unpkg.com/aos@2.3.1/dist/aos.css` | 36 | Animations scroll | Moyen : CSS/JS tiers sur pages sans besoin clair | Charger seulement si `data-aos` existe ou remplacer par CSS/IntersectionObserver local |
| `https://unpkg.com/aos@2.3.1/dist/aos.js` | 35 | Animations scroll | Moyen INP : init + observers/classes | Charger conditionnellement sur pages avec animations |
| `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css` | 36 | Icones | Moyen : CSS tiers large ; usage HTML direct faible detecte | Remplacer progressivement par SVG/icones locales ou charger seulement sur pages avec icones Font Awesome |
| `https://cdn.emailjs.com/dist/email.min.js` | 1 | Contact/email | Moyen mais cible unique | Garder cible page contact si necessaire ; verifier defer et consentement |
| `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js` | 1 | Graphique | Moyen mais cible unique | Garder uniquement sur la page qui affiche le graphique |
| CDN dynamiques dans `ai-assistant.js` | A la demande | PDF, OCR, DOCX, XLSX, ZIP | Eleve si precharges ; acceptable si interaction utilisateur | Conserver en lazy-load strict et gerer erreurs reseau |

## 6. CSS global

Constats :

- `styles/style.css` pese environ 363 Ko ;
- il est charge sur 54 pages via `/styles/style.css`, plus une occurrence versionnee sur `index.html` ;
- `admin/index.html` charge aussi le style global selon le scan ;
- le fichier contient des styles tres varies : base, navigation, pages, blog, projets, assistant IA, animations, responsive ;
- un `@import` Google Fonts est present dans le CSS, en plus des liens Google Fonts declares dans les HTML.

Risques :

- CSS global volumineux potentiellement bloquant pour le rendu initial ;
- styles de l'assistant servis sur des pages ou l'assistant complet n'est peut-etre pas disponible ;
- `@import` dans CSS moins controlable que des `<link>` avec preconnect/preload ;
- risque de CSS inutilise important par famille de page.

Opportunites :

- separer progressivement un socle critique commun : reset, variables, layout, navigation, footer ;
- extraire les styles par famille : `home`, `pages`, `projects`, `blog`, `inspirations`, `assistant` ;
- charger les styles assistant uniquement avec l'assistant si l'experience devient conditionnelle ;
- supprimer les doublons de polices apres audit visuel ;
- eviter une extraction trop agressive sans tests sur les 54 URLs du sitemap.

## 7. Opportunites `defer`, lazy-load et chargement conditionnel

Actions candidates a faible risque, apres test :

- ajouter `defer` aux scripts locaux qui attendent `DOMContentLoaded` ou s'executent en fin de body, en validant l'ordre `translator` / `theme` / navigation ;
- charger AOS uniquement lorsque la page contient `data-aos` ;
- ne pas charger Font Awesome sur les pages sans classe `fa-*` visible ;
- garder `comments.js`, `share-links.js`, `jsonld-injector.js` uniquement sur les articles digitaux ;
- garder `detail-zoom.js` uniquement sur les pages inspirations detail ;
- garder `contact-validation.js`, `blog.js`, `explore.js`, `about-animations.js` sur leurs pages uniques.

Actions a impact plus fort :

- remplacer le chargement global de `ai-assistant.js` par un bootstrap conditionnel ;
- extraire le CSS assistant hors du CSS global ;
- fractionner `style.css` par templates ;
- auto-heberger les polices vraiment utilisees et reduire les graisses ;
- remplacer AOS par une implementation locale minimale si les animations sont simples.

## 8. Risques a ne pas prendre

- Ne pas supprimer `translator.js` tant que l'architecture FR/EN repose sur les dictionnaires client.
- Ne pas differer le theme sans verifier l'absence de flash clair/sombre.
- Ne pas retirer `jsonld-injector.js` des articles sans JSON-LD statique equivalent.
- Ne pas supprimer GA4 / gtag sans decision explicite sur la mesure.
- Ne pas retirer AOS globalement sans verifier les pages qui utilisent `data-aos`.
- Ne pas remplacer Font Awesome globalement sans inventaire visuel des icones rendues.
- Ne pas fractionner `style.css` en aveugle : le risque de regression visuelle est eleve.
- Ne pas charger tardivement des scripts qui gerent consentement, langue ou navigation si cela degrade l'UX initiale.
- Ne pas modifier les pages `share/` pour leur ajouter le socle global : elles doivent rester legeres et controlees pour les aperçus sociaux.

## 9. Plan d'action recommande

### Rapide

- Documenter une liste blanche des pages qui doivent afficher l'assistant IA.
- Verifier si les pages hors `index.html` affichent reellement un bouton/panneau assistant en production.
- Auditer l'usage reel de Font Awesome et retirer le CDN des pages sans icones apres test.
- Charger AOS seulement sur les pages avec `data-aos` ou supprimer son initialisation sur les pages sans animation.
- Supprimer les doublons evidents de polices apres verification visuelle.

### Moyen

- Creer un bootstrap `ai-assistant-loader` leger qui charge `ai-assistant.js` a l'interaction.
- Extraire les styles assistant de `styles/style.css`.
- Decouper un CSS `blog` et un CSS `projects` si les templates sont stables.
- Ajouter des tests de non-regression visuelle simples sur accueil, page projet, article digital, inspiration detail et page contact.

### Complexe

- Remplacer AOS par une logique locale minimale basee sur IntersectionObserver.
- Construire une strategie de CSS critique par template.
- Repenser l'architecture multilingue pour servir des contenus FR/EN crawlables sans dependance forte au JS.
- Mesurer reellement LCP/INP/CLS avec Lighthouse ou Chrome DevTools avant/apres.

### A reporter

- Suppression totale de `ai-assistant.js` hors accueil sans decision produit.
- Suppression de `translator.js` avant architecture i18n statique.
- Suppression massive du CSS global sans couverture visuelle.
- Optimisations basees sur des scores Lighthouse inventes ou non mesures.

## 10. Synthese des priorites

Priorite 1 : traiter `ai-assistant.js` comme un module applicatif lourd, pas comme un script global SEO. Le gain potentiel INP est le plus important.

Priorite 2 : rationaliser `styles/style.css` et les polices, car le rendu initial de toutes les pages depend du CSS global.

Priorite 3 : conditionner les CDN AOS et Font Awesome aux pages qui les utilisent vraiment.

Priorite 4 : conserver les scripts SEO/UX essentiels tant que leur remplacement n'est pas pret : `translator.js`, `theme-switcher.js`, `jsonld-injector.js`.

## 11. Etat des modifications

Ce rapport cree uniquement `docs/SEO_JS_CSS_AUDIT.md` pour cette tache. Aucun fichier HTML, CSS, JS, sitemap, robots.txt ou Worker Cloudflare n'a ete modifie dans cette passe.

## 12. Premiere passe d'implementation : chargement conditionnel de l'assistant IA

Passe realisee sans suppression de `scripts/ai-assistant.js`, sans modification des Workers Cloudflare, sans modification de `sitemap.xml`, `robots.txt`, `docs/SEO.md`, des images, des pages `share/`, de `translator.js`, de `theme-switcher.js` ou de `navbar-dropdown.js`.

Fichiers modifies :

- `scripts/ai-assistant-loader.js` cree ;
- `index.html` ;
- pages HTML sous `pages/` qui chargeaient directement l'assistant ;
- pages HTML sous `projects/` qui chargeaient directement l'assistant ;
- pages HTML sous `blog/digital/` qui chargeaient directement l'assistant ;
- pages HTML sous `blog/inspirations/` qui chargeaient directement l'assistant ;
- `docs/SEO_JS_CSS_AUDIT.md`.

Strategie retenue :

- remplacer le chargement direct de `ai-assistant.js` par un loader leger ;
- charger dynamiquement `ai-assistant.js` uniquement si une interface assistant est presente dans le DOM (`#ai-assistant-launcher`, `#ai-assistant-panel`, `#ai-assistant-form`) ou si un declencheur explicite existe (`[data-ai-assistant]`, `[data-ai-assistant-trigger]`) ;
- eviter les doubles chargements via une promesse partagee et une detection des scripts deja presents ;
- journaliser proprement une erreur console si le chargement dynamique echoue ;
- ne pas charger les dependances PDF/OCR/XLSX dans le loader, car elles restent gerees a la demande par `ai-assistant.js`.

Pages ou `ai-assistant.js` reste charge immediatement :

- `index.html`, via `scripts/ai-assistant-loader.js` avec `data-ai-assistant-src="/scripts/ai-assistant.js?v=20260629-chatbot-gradient"`. La home conserve le balisage complet de l'assistant ; le loader charge donc le script principal des que le DOM est pret.

Pages ou seul le loader est charge :

- `pages/*.html` concernees par l'ancien chargement direct ;
- `projects/*.html` ;
- `blog/digital/*.html` ;
- `blog/inspirations/*.html`.

Sur ces pages, le scan local ne detecte pas le balisage complet de l'assistant. Le loader ne charge donc pas `ai-assistant.js` tant qu'aucun ancrage ou declencheur assistant explicite n'est present.

Risques residuels :

- si l'assistant devait etre injecte partout uniquement par l'execution de `ai-assistant.js`, les pages hors home ne l'afficheront plus tant qu'un ancrage ou declencheur explicite n'est pas ajoute ;
- le CSS assistant reste dans `styles/style.css`, donc cette passe reduit le cout JS initial mais pas encore le poids CSS global ;
- la home charge toujours le script complet au demarrage afin de preserver le comportement actuel ;
- aucun test navigateur automatise n'a mesure le gain LCP/INP reel.

Tests manuels a faire :

1. ouvrir `https://digitalblueskye.com/` ;
2. verifier que le bouton et le panneau de l'assistant fonctionnent sur la home ;
3. ouvrir une page article, par exemple `https://digitalblueskye.com/blog/digital/article-ia-gestion-projet.html` ;
4. verifier qu'il n'y a pas d'erreur console ;
5. confirmer si l'assistant est attendu ou non sur cette page ;
6. relancer PageSpeed sur `https://digitalblueskye.com/blog/digital/article-ia-gestion-projet.html` ;
7. relancer PageSpeed sur `https://digitalblueskye.com/pages/projects.html`.

## 13. Deuxieme passe d'implementation : rationalisation AOS et Font Awesome

Passe realisee sans modifier `scripts/ai-assistant.js`, sans modifier les references a `/scripts/ai-assistant.js`, sans recreer de loader assistant, sans toucher aux Workers Cloudflare, a `sitemap.xml`, `robots.txt`, aux pages `share/`, aux images ou a `translations/`. Le chatbot reste charge directement comme avant sur les 54 pages concernees.

Font Awesome (`cdnjs` `font-awesome@5.15.4`) :

- retire sur 35 pages qui chargeaient le CDN sans classe `fa-*`/`fas`/`far`/`fab` detectee dans le HTML : `index.html`, `pages/about.html`, `pages/agilite.html`, `pages/contact.html`, `pages/cookies-policy.html`, `pages/gouvernance-ia.html`, `pages/privacy.html`, `pages/projects.html`, `pages/skills.html`, `pages/terms.html`, `projects/arcadia-zoo.html`, `projects/booki.html`, `projects/budget-buddy.html`, `projects/memory-game.html`, `projects/ohmyfood.html`, `projects/print-it.html`, `projects/riding-cities.html`, `projects/sophie-bluel.html`, `projects/tetris-windsurf.html`, `blog/digital/article-cone-apprentissage.html`, `blog/digital/article-connector-dots.html`, `blog/digital/article-ia-agentique-gestion-projet.html`, `blog/digital/article-ia-gestion-projet.html`, `blog/digital/article-menaces-ia-cybersecurite-2026.html`, `blog/digital/article-metavers-projets.html`, `blog/digital/article-outils-veille.html`, `blog/digital/article-pue-datacenters.html`, `blog/digital/article-rgpd-2025.html`, `blog/digital/article-rgpd-ia-securite.html`, `blog/digital/article-rse-digital.html`, `blog/digital/article-seo-chef-projet.html`, `blog/digital/article-signaux-faibles.html`, `blog/digital/article-tech-2026.html`, `blog/digital/blogArticles.html`, `blog/inspirations/carnets-inspirations.html` ;
- conserve sur `pages/visualTourProjects.html`, seule page du perimetre a exposer reellement des classes Font Awesome (`fa-*`) dans son HTML.

AOS (`unpkg` `aos@2.3.1`) :

- retire (CSS, script, et l'appel `AOS.init(...)` associe) sur 19 pages sans aucun attribut `data-aos` : `index.html`, `pages/cookies-policy.html`, `pages/privacy.html`, `pages/terms.html`, `pages/visualTourProjects.html`, `blog/digital/article-cone-apprentissage.html`, `blog/digital/article-connector-dots.html`, `blog/digital/article-ia-agentique-gestion-projet.html`, `blog/digital/article-ia-gestion-projet.html`, `blog/digital/article-menaces-ia-cybersecurite-2026.html`, `blog/digital/article-metavers-projets.html`, `blog/digital/article-outils-veille.html`, `blog/digital/article-pue-datacenters.html`, `blog/digital/article-rgpd-2025.html`, `blog/digital/article-rgpd-ia-securite.html`, `blog/digital/article-rse-digital.html`, `blog/digital/article-seo-chef-projet.html`, `blog/digital/article-signaux-faibles.html`, `blog/digital/article-tech-2026.html` ;
- conserve sur 17 pages ou `data-aos` est bien present dans le HTML : `pages/about.html`, `pages/agilite.html`, `pages/contact.html`, `pages/gouvernance-ia.html`, `pages/projects.html`, `pages/skills.html`, `projects/arcadia-zoo.html`, `projects/booki.html`, `projects/budget-buddy.html`, `projects/memory-game.html`, `projects/ohmyfood.html`, `projects/print-it.html`, `projects/riding-cities.html`, `projects/sophie-bluel.html`, `projects/tetris-windsurf.html`, `blog/digital/blogArticles.html`, `blog/inspirations/carnets-inspirations.html` ;
- point d'attention traite : sur les 19 pages ou AOS a ete retire, le HTML appelait systematiquement `AOS.init({...})` juste apres le script AOS, dans le meme bloc `<script>` que la logique du bouton « retour en haut ». Laisser cet appel sans la librairie aurait leve une `ReferenceError` et casse ce bouton sur chaque page. L'appel `AOS.init(...)` a donc ete retire avec le CDN, en laissant intact le reste du bloc (bouton retour en haut). Aucun fichier sous `scripts/` n'a ete modifie ;
- verification faite que ces 19 pages ne chargent pas `loader.js` avec un `#loader-wrapper` (le seul autre point d'appel `AOS.init` du depot, dans `scripts/loader.js`), donc aucun autre risque de `ReferenceError` residuel.

Fichiers modifies dans cette passe (AOS uniquement, cote script inline HTML) :

- les 19 fichiers HTML listes ci-dessus pour AOS ;
- `docs/SEO_JS_CSS_AUDIT.md`.

Le retrait de Font Awesome sur les 35 pages listees ci-dessus preexistait dans l'arbre de travail au demarrage de cette passe (modifications non commitees) ; il a ete verifie et documente ici sans etre refait.

Pages ou les ressources ont ete conservees par prudence :

- `pages/visualTourProjects.html` pour Font Awesome (icones `fa-*` reellement presentes) ;
- les 17 pages listees ci-dessus pour AOS (`data-aos` reellement present) ;
- toutes les autres pages hors perimetre (`share/`, `admin/`, etc.) n'ont pas ete scannees ni modifiees.

Google Fonts :

- aucune modification effectuee dans cette passe, conformement au perimetre ;
- doublon deja documente en section 5 : `Gelasio` est charge a la fois via `@import` dans `styles/style.css` (ligne ~42) et potentiellement via un lien HTML sur certaines pages ; aucun nouveau doublon evident n'a ete confirme lors de ce scan cible AOS/Font Awesome.

Limites de cette passe :

- verification faite uniquement par recherche statique de motifs (`fa-`, `fas`, `far`, `fab`, `data-aos`, `AOS.init`) dans le HTML source, sans rendu navigateur ni verification visuelle reelle ;
- les classes Font Awesome ou attributs `data-aos` injectes dynamiquement par JavaScript (hors HTML source) n'auraient pas ete detectes par ce scan ;
- aucune mesure Lighthouse/PageSpeed avant/apres n'a ete effectuee ;
- le CSS global `styles/style.css` continue de contenir les styles lies aux animations et n'a pas ete modifie.

Tests manuels a faire :

1. ouvrir une page ou Font Awesome a ete retire (ex. `pages/about.html`) et verifier l'absence d'icone manquante ou de carre vide ;
2. ouvrir `pages/visualTourProjects.html` et verifier que les icones Font Awesome s'affichent toujours correctement ;
3. ouvrir une page ou AOS a ete retire (ex. `blog/digital/article-rse-digital.html`) et verifier l'absence d'erreur console, ainsi que le bon fonctionnement du bouton « retour en haut » ;
4. ouvrir une page ou AOS est conserve (ex. `pages/about.html`) et verifier que les animations au scroll fonctionnent toujours ;
5. ouvrir `index.html` et confirmer que le chatbot (bouton et panneau assistant) est toujours visible et fonctionnel, et que le bouton « retour en haut » fonctionne sans AOS ;
6. verifier sur 2-3 pages `blog/digital/` et `blog/inspirations/` que le chatbot reste present comme avant cette passe ;
7. relancer PageSpeed sur une page ayant perdu AOS et Font Awesome (ex. `pages/privacy.html`) pour comparer au releve initial.
