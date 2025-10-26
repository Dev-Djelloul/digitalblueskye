## Contexte rapide

Ce dépôt est un site statique (HTML/CSS/JS) servant de portfolio personnel. Il n'y a pas de build tool complexifié : les fichiers principaux sont servables tels quels (`index.html`, `pages/`, `projects/`, `assets/`). Le site est déployé sur Netlify (voir `README.md`).

## Objectif pour un agent IA

Fournir des modifications ciblées, sûres et non invasives : corrections CSS/JS, optimisation responsive, petites améliorations UX et ajouts de contenu. Eviter les changements qui introduisent une nouvelle toolchain (ex : ajout d'un bundler) sans validation humaine.

---

## Big picture / architecture (fichiers-clés)

- page d'entrée : `index.html` — navigation, header, hero full-bleed, inclusion des scripts et du CSS.
- styles globaux : `styles/style.css` — très volumineux ; contient variables CSS, layout, animations et règles spécifiques aux pages.
- scripts JS : `scripts/*.js` — petites dépendances JS vanilla (ex : `translator.js`, `loader.js`, `theme-switcher.js`, `navbar-dropdown.js`).
- contenu et pages : `pages/`, `blog/`, `projects/` — HTML statique par page.
- assets : `assets/` (images, fonts, vidéos) — structure conservatrice ; évitez de renommer fichiers sans mise à jour des références HTML/CSS.
- traductions : `translations/fr.json` & `translations/en.json` — utilisées par `scripts/translator.js` via attributs `data-i18n`.
- lint CSS : `package.json` contient un script `lint:css` (stylelint). Pas de build JS/CSS automatisé.

---

## Conventions et patterns projet (exemples précis)

- Site statique, approche «no-framework» : privilégier le vanilla JS et les sélecteurs DOM simples. Ex : `document.addEventListener('DOMContentLoaded', ...)` est utilisé dans `index.html` inline et dans `scripts/*.js`.
- Traduction : ajouter/mettre à jour clés dans `translations/*.json` et utiliser `data-i18n` dans le HTML — modification centrale dans `scripts/translator.js`.
- Full‑bleed images (hero) : classe `.hero-media` ou `.full-bleed` — ces blocs utilisent `width: 100vw` et `margin-left: calc(50% - 50vw)` pour dépasser le container centré ; ne pas envelopper ces éléments dans conteneurs qui écraseraient cette logique.
- Règles CSS : variables au début de `styles/style.css` (`:root`). Modifiez les variables pour thèmes ou couleurs plutôt que répétitions directes.
- Assets : gardez les chemins relatifs exacts (ex : `/assets/images/...`) — le HTML s'attend à ces chemins depuis la racine.

---

## Workflows et commandes utiles (exécutables localement)

- Linter CSS (vérifier + corriger auto-fixable) :

  npm run lint:css

  ou (fix global) :

  npx stylelint "**/*.css" --fix

- Ouvrir localement : le site est statique — ouvrir `index.html` dans un navigateur ou lancer un serveur léger :

  npx http-server . -p 8080

  (ou `python -m http.server 8080`)

- Extensions recommandées VS Code : Stylelint (stylelint.vscode-stylelint) et formatters si utilisés (Prettier) ; activer `source.fixAll.stylelint` en workspace settings si souhaité.

---

## Ce que l'agent IA peut faire en autonomie

- Corriger l'ordre des préfixes CSS (ex. `-o-object-fit` avant `object-fit`) et appliquer règles stylelint configurées.
- Harmoniser marges/paddings en éditant `styles/style.css` (ex : ajouter variables `--site-max-width` et `padding-inline` global) — vérifier visuellement par l'utilisateur après modification.
- Mettre à jour/patcher des textes statiques (titres, meta description) dans les fichiers HTML.
- Ajouter des images dans `assets/` et mettre à jour les `src` dans HTML/CSS (vérifier que les fichiers sont effectivement ajoutés au repo).

---

## Limitations / opérations à demander explicitement

- Ne pas ajouter de nouvelle toolchain (webpack/rollup/Vite) sans accord. Le projet est volontairement simple.
- Ne pas renommer massivement des fichiers dans `assets/` — cela casse beaucoup de références HTML/CSS statiques.
- Pour actions qui modifient l'accessibilité, les performances (image optimisation), ou les routes HTML (création/suppression de pages), demander une revue humaine.

---

## Emplacement du fichier et merge

Si `.github/copilot-instructions.md` existait déjà, ce fichier doit être fusionné en préservant les sections locales utiles. Ici il est ajouté à la racine `.github/`.

---

Si quelque chose est imprécis ou si vous voulez que j'ajoute des exemples de PR/commit messages ou des tests de non-régression (ex : snapshot visuel), dites-le et j'ajusterai le fichier.
