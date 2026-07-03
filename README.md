 🌐 Digital Blue Skye – Personal Digital Ecosystem

Bienvenue sur DigitalBlueSkye, mon site web personnel, portfolio professionnel et laboratoire digital.

Ce projet présente mon parcours, mes réalisations, mes articles et mes expérimentations autour du web, de l’intelligence artificielle, de la gestion de projet digital, de l’UX, du contenu et des technologies modernes.

DigitalBlueSkye n’est plus seulement un portfolio statique : c’est un écosystème évolutif qui combine front-end, blog, assistant IA, backend serverless, base de données Cloudflare D1 et back-office d’administration.

⸻

👨‍💻 À propos de moi

Je m’appelle Djelloul ABID.

Passionné par le web, le digital, l’intelligence artificielle et la création de projets utiles, j’ai conçu et développé DigitalBlueSkye avec l’aide de l’IA, tout en consolidant progressivement mes compétences techniques et méthodologiques.

Mon parcours m’a amené à explorer plusieurs dimensions du numérique :

* intégration web ;
* développement front-end ;
* design d’interface ;
* WordPress et CMS ;
* UX/UI ;
* gestion de projet digital ;
* méthodes agiles ;
* stratégie éditoriale ;
* automatisation et intelligence artificielle ;
* architecture serverless.

Je poursuis actuellement une formation de Chef de projet digital, avec l’objectif de renforcer ma capacité à piloter des projets numériques complets, de la phase de cadrage jusqu’à la livraison.

⸻

🚀 Vision du projet

DigitalBlueSkye est pensé comme un espace hybride :

* un portfolio professionnel pour présenter mes projets ;
* un blog digital pour publier des articles, analyses et réflexions ;
* un laboratoire IA pour expérimenter un assistant intelligent intégré au site ;
* un socle technique évolutif avec backend, base de données et back-office ;
* un support de progression dans mon parcours vers le métier de Chef de projet digital.

Ce site me permet de documenter mon évolution, de tester des idées, de produire du contenu, d’expérimenter des fonctionnalités et de construire progressivement un véritable environnement digital personnel.

⸻

💼 Projets et contenus présentés

Le site regroupe plusieurs types de contenus et réalisations :

* 🎨 Sites vitrines réalisés en HTML5, CSS3 et JavaScript ;
* ⚙️ Interfaces web dynamiques et composants interactifs ;
* 📱 Pages responsive optimisées pour mobile, tablette et desktop ;
* 🔧 Intégrations à partir de maquettes Figma ;
* 🧭 Projets réalisés dans le cadre de ma formation Chef de projet digital ;
* 📝 Articles de blog sur les tendances digitales, l’IA, le RGPD, l’UX, la transformation numérique et les sujets émergents ;
* 🤖 Assistant IA intégré au site ;
* 🛠️ Back-office d’administration pour gérer les données du site.

⸻

🤖 Assistant IA intégré

DigitalBlueSkye intègre une fenêtre de chatbot IA connectée à un backend Cloudflare Worker.

L’architecture permet de faire transiter les requêtes de l’utilisateur par un Worker serverless avant d’interroger un fournisseur de modèle IA, notamment via OpenRouter.

L’objectif est d’expérimenter progressivement un assistant capable de :

* répondre aux visiteurs ;
* accompagner la navigation ;
* présenter les projets ;
* fournir des informations contextuelles ;
* évoluer vers un agent IA plus structuré.

Le système prévoit également une logique de journalisation technique afin de mieux comprendre les erreurs éventuelles, notamment les échecs d’appel à OpenRouter.

⸻

🗄️ Backend et base de données

Le site utilise une architecture serverless basée sur Cloudflare Workers et Cloudflare D1.

Architecture générale :

Site Netlify
→ Scripts front-end
→ Cloudflare Worker digitalblueskye-api
→ Binding D1 env.DB
→ Cloudflare D1 digitalblueskye

La base de données Cloudflare D1 permet de stocker plusieurs types de données :

Table	Fonction
article_comments	Commentaires des articles de blog
contact_messages	Messages envoyés via le formulaire de contact
consent_logs	Historique des consentements utilisateurs
ai_assistant_events	Événements et logs liés à l’assistant IA

⸻

💬 Système de commentaires

Le blog dispose d’un système de commentaires relié à Cloudflare D1.

Fonctionnalités principales :

* ajout de commentaires sur les articles ;
* réponses à des commentaires via parent_id ;
* statut de modération avec approved, pending ou hidden ;
* réactions et compteurs ;
* stockage des métadonnées techniques nécessaires à la modération.

La table principale utilisée est :

article_comments

La colonne contenant le texte du commentaire est :

message

⸻

🔐 Back-office d’administration

Un back-office global a été créé pour administrer les données principales du site.

Il permet de consulter et gérer :

* les commentaires ;
* les messages de contact ;
* les consentements ;
* les logs liés à l’assistant IA.

Fonctionnalités prévues ou disponibles :

* connexion par token administrateur ;
* tableau de bord avec compteurs ;
* filtres par table ;
* consultation des données ;
* masquage partiel des emails et adresses IP ;
* export JSON ;
* actions de modération ;
* suppression ciblée de certaines données ;
* consultation des logs techniques.

L’accès opérationnel est protégé par un token administrateur configuré côté Cloudflare Worker via ADMIN_TOKEN.

⸻

🔒 Sécurité et confidentialité

Le projet prend progressivement en compte plusieurs enjeux liés à la sécurité et à la protection des données :

* protection des routes d’administration par token ;
* absence de route SQL libre côté front-end ;
* limitation des tables exportables ;
* non-exposition de la table technique sqlite_sequence ;
* masquage partiel des emails et adresses IP dans l’interface admin ;
* conservation des logs de consentement ;
* séparation entre front-end public, backend Worker et base D1.

Certaines données techniques peuvent être collectées pour assurer le bon fonctionnement du site, la modération, la sécurité ou la traçabilité des consentements.

⸻

🛠️ Technologies utilisées

Front-end

* HTML5
* CSS3
* JavaScript ES6+
* Responsive design
* Bootstrap
* Intégration de maquettes
* Interfaces autonomes HTML/CSS/JS

CMS et design

* WordPress
* Figma
* Gamma
* Design responsive
* UX/UI

Backend et cloud

* Cloudflare Workers
* Cloudflare D1
* Wrangler
* Netlify
* API serverless
* Variables d’environnement et secrets

IA et automatisation

* OpenRouter
* Assistant IA intégré
* Logs d’événements IA
* Expérimentations autour des agents conversationnels

Méthodologies

* Git / GitHub
* Méthodes agiles
* SCRUM
* Kanban
* Documentation projet
* Cadrage fonctionnel
* Recette et amélioration continue

⸻

🎯 Objectifs du projet

DigitalBlueSkye poursuit plusieurs objectifs :

* centraliser mes travaux dans un espace clair et professionnel ;
* montrer mon évolution dans les métiers du digital ;
* démontrer mes compétences en conception, intégration, développement et pilotage de projet ;
* publier des articles liés aux tendances digitales ;
* expérimenter l’intégration d’un assistant IA dans un site personnel ;
* construire un backend serverless simple, évolutif et administrable ;
* mettre en place un back-office pour gérer les données du site ;
* relater mes inspirations, mes apprentissages et mes voyages ;
* faire évoluer progressivement le site vers une plateforme personnelle plus complète.

⸻

📁 Structure fonctionnelle du projet

Structure simplifiée :

DigitalBlueSkye
├── admin/
│   └── index.html
├── blog/
│   └── digital/
├── cloudflare/
│   ├── worker-api.js
│   ├── worker-openrouter.js
│   ├── wrangler.api.toml
│   └── d1/
├── scripts/
├── styles/
├── assets/
└── pages/

⸻

⚙️ Déploiement

Le front-end du site est hébergé sur Netlify :

https://digitalblueskye.com

Le backend API est hébergé sur Cloudflare Workers :

digitalblueskye-api

La base de données utilisée est Cloudflare D1 :

digitalblueskye

⸻

🔗 Liens utiles

* Mon profil LinkedIn
* Mon GitHub
* Me contacter

⸻

🧭 Évolution prévue

Le projet est en amélioration continue. Les prochaines évolutions possibles incluent :

* amélioration du back-office ;
* ajout d’une authentification plus robuste ;
* meilleure gestion des rôles administrateur ;
* amélioration de l’assistant IA ;
* ajout de fonctionnalités de recherche ;
* enrichissement du blog ;
* optimisation SEO ;
* renforcement RGPD ;
* création d’exports avancés ;
* documentation technique plus détaillée.

⸻

🙏 Remerciements

Merci pour votre visite.

DigitalBlueSkye est à la fois mon portfolio, mon carnet de bord, mon terrain d’expérimentation et mon espace de progression dans l’univers du digital ! 
