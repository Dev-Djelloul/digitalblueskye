# Plan de résorption des violations Stylelint

## Objectif

Ramener progressivement le lint strict du CSS à zéro erreur, sans modifier le rendu ou les comportements du site par des corrections mécaniques non vérifiées.

Le contrôle CI actuel compare les diagnostics des fichiers CSS modifiés à ceux de la branche de base. Il empêche l’ajout de nouvelles violations, mais ne remplace pas la résorption du passif. Ce plan suit le rapport strict complet et traite les familles de règles par lots indépendants et vérifiables.

## État de référence

Au 25 octobre 2026, le lint strict de `styles/style.css` relève **996 diagnostics**, dans un seul fichier CSS :

| Règle Stylelint | Diagnostics |
| --- | ---: |
| `no-descending-specificity` | 659 |
| `selector-class-pattern` | 163 |
| `no-duplicate-selectors` | 61 |
| `order/properties-order` | 43 |
| `declaration-block-single-line-max-declarations` | 14 |
| `selector-id-pattern` | 12 |
| `keyframes-name-pattern` | 11 |
| `declaration-property-value-no-unknown` | 5 |
| `color-function-notation` | 4 |
| `comment-empty-line-before` | 4 |
| `custom-property-pattern` | 4 |
| `declaration-property-value-keyword-no-deprecated` | 4 |
| `property-no-deprecated` | 3 |
| `declaration-block-no-redundant-longhand-properties` | 2 |
| `media-feature-range-notation` | 2 |
| `shorthand-property-no-redundant-values` | 2 |
| `declaration-block-no-duplicate-properties` | 1 |
| `property-no-vendor-prefix` | 1 |
| `rule-empty-line-before` | 1 |
| **Total** | **996** |

Ce décompte est un instantané : il faudra le recalculer au début de chaque lot. Les lignes se déplacent à mesure que le fichier change ; les règles et leurs décomptes sont les repères de suivi.

## Principes de travail

1. Traiter un lot à la fois, dans un commit ou une PR cohérente et de taille revue.
2. Lire le bloc CSS et ses règles voisines avant de le modifier. Ne pas considérer un diagnostic Stylelint comme une preuve automatique de bug ou comme une instruction de réécriture aveugle.
3. Éviter `stylelint --fix` sur l’ensemble du fichier : il peut réordonner ou reformater des règles sans résoudre les conflits de cascade, les références du site ou les changements de rendu.
4. Après chaque lot, exécuter le lint strict, le contrôle anti-régression et `git diff --check`. Comparer le total aux 996 diagnostics de référence et expliquer toute variation inattendue.
5. Pour toute modification de sélecteur, vérifier les références HTML, JavaScript, tests, attributs `data-*` et éventuels styles injectés. Préserver les alias ou sélecteurs de compatibilité quand ils sont encore utilisés.
6. Pour les changements susceptibles d’affecter la cascade ou l’affichage, vérifier les pages concernées en thème clair/sombre et aux largeurs mobile et bureau avant de fusionner.
7. Ne pas masquer une règle globalement pour faire baisser artificiellement le compteur. Une exception Stylelint doit être locale, justifiée et limitée au cas où la règle ne peut pas être satisfaite sans régression.

## Lots proposés

### Lot 1 — Format et modernisation à faible risque (72 diagnostics)

Règles visées :

- `order/properties-order` (43)
- `declaration-block-single-line-max-declarations` (14)
- `comment-empty-line-before` (4)
- `color-function-notation` (4)
- `media-feature-range-notation` (2)
- `declaration-block-no-redundant-longhand-properties` (2)
- `shorthand-property-no-redundant-values` (2)
- `rule-empty-line-before` (1)

Approche :

- Réordonner uniquement les déclarations dont l’ordre ne porte pas un fallback ou une intention de surcharge.
- Mettre en forme les blocs trop longs sans changer leurs valeurs.
- Moderniser la notation des couleurs et des media queries en vérifiant la compatibilité avec les navigateurs ciblés.
- Remplacer les longhands redondants par des raccourcis seulement lorsque toutes les valeurs calculées restent identiques.

Validation particulière : examiner les déclarations répétées avant de les réordonner et contrôler les media queries touchées sur mobile et bureau.

### Lot 2 — Valeurs, propriétés et doublons de déclarations (14 diagnostics)

Règles visées :

- `declaration-property-value-no-unknown` (5)
- `declaration-property-value-keyword-no-deprecated` (4)
- `property-no-deprecated` (3)
- `declaration-block-no-duplicate-properties` (1)
- `property-no-vendor-prefix` (1)

Approche :

- Examiner chaque valeur inconnue dans son contexte ; déterminer si elle est invalide, mal orthographiée ou intentionnelle pour un navigateur précis.
- Remplacer les propriétés et mots-clés dépréciés par leurs équivalents actuels lorsque le comportement est bien établi.
- Conserver un fallback préfixé uniquement s’il est encore requis, avec une exception locale documentée si la règle le permet.
- Résoudre les déclarations dupliquées en préservant les fallbacks utiles ; supprimer uniquement les déclarations réellement redondantes.

Validation particulière : vérifier les navigateurs ciblés et les composants qui utilisent les propriétés concernées. Ne pas supprimer un fallback au seul motif que Stylelint signale un doublon ou un préfixe.

### Lot 3 — Regroupement des sélecteurs dupliqués (61 diagnostics)

Règle visée :

- `no-duplicate-selectors` (61)

Approche :

- Pour chaque sélecteur répété, comparer l’ordre dans la cascade, les conditions `@media`, les thèmes, les pseudo-classes et les déclarations.
- Regrouper les blocs uniquement si cela conserve le même ordre d’application et les mêmes comportements responsives.
- Si deux règles identiques sont intentionnellement séparées par des conditions ou par l’ordre de cascade, réorganiser avec prudence ou documenter une exception locale plutôt que de les fusionner arbitrairement.

Validation particulière : inspecter les différences visuelles des composants regroupés en thème clair/sombre, aux points de rupture concernés et dans leurs états interactifs.

### Lot 4 — Nommage et références de sélecteurs (190 diagnostics)

Règles visées :

- `selector-class-pattern` (163)
- `selector-id-pattern` (12)
- `keyframes-name-pattern` (11)
- `custom-property-pattern` (4)

Approche :

- Définir une convention de nommage unique, cohérente avec le format kebab-case demandé par la configuration Stylelint.
- Produire une liste de renommages ciblés, puis rechercher chaque nom dans tout le dépôt avant modification.
- Renommer ensemble les sélecteurs CSS et leurs usages dans HTML, JavaScript, tests et templates ; vérifier aussi les sélecteurs construits dynamiquement.
- Renommer les keyframes avec toutes leurs références `animation` / `animation-name`.
- Renommer les propriétés personnalisées avec toutes leurs références `var(...)`, valeurs de fallback comprises.
- Éviter les renommages massifs par expression régulière sans contrôle individuel.

Validation particulière : rechercher les anciens et nouveaux noms dans le dépôt ; confirmer qu’aucun hook DOM, test ou animation ne perd sa cible. Vérifier les pages principales et les composants interactifs concernés.

### Lot 5 — Spécificité et ordre de la cascade (659 diagnostics)

Règle visée :

- `no-descending-specificity` (659)

Cette famille représente la majorité du passif et comporte le risque visuel le plus élevé. Le diagnostic indique qu’une règle de spécificité plus faible arrive après une règle plus forte qui cible un élément comparable ; une réorganisation globale peut donc changer le résultat rendu.

Approche :

- Traiter les diagnostics par zones cohérentes du fichier ou par composant, jamais par tri global des sélecteurs.
- Examiner les sélecteurs en conflit et déterminer si la cascade actuelle est intentionnelle, accidentelle ou devenue redondante.
- Préférer des sélecteurs locaux et explicites à une augmentation systématique de la spécificité.
- Réorganiser les règles seulement après avoir établi que les propriétés calculées restent inchangées.
- Ajouter une exception de règle au plus petit périmètre si l’ordre est intentionnel et que la réécriture serait plus risquée.

Validation particulière : comparer les vues avant/après pour chaque composant touché, y compris thèmes, états hover/focus, responsive et variantes de pages. Ne pas réduire artificiellement la spécificité en supprimant les styles particuliers d’un composant.

## Commandes de suivi

Lint strict de l’ensemble du CSS :

```sh
npm run lint:css:strict
```

Rapport détaillé en JSON pour compter les violations par règle et par fichier :

```sh
npx stylelint "styles/**/*.css" --formatter json
```

Contrôle anti-régression par rapport à la branche de base (remplacer le SHA par celui de la base du lot) :

```sh
npm run lint:css -- <SHA_DE_BASE>
```

Vérification des espaces et du patch :

```sh
git diff --check
```

Le lint strict retourne actuellement une erreur tant que le passif n’est pas entièrement résorbé ; c’est attendu. Le contrôle anti-régression doit rester vert à chaque lot.

## Critères de fin

- `npm run lint:css:strict` ne rapporte plus aucune erreur sur `styles/**/*.css`.
- Le contrôle anti-régression CI reste actif jusqu’à ce que le lint strict soit propre.
- Les éventuelles exceptions restantes sont locales, expliquées et réévaluées ; elles ne servent pas à cacher un grand groupe de diagnostics.
- Les pages et composants affectés ont été vérifiés visuellement sur les thèmes et tailles d’écran concernés.
- Une fois le strict à zéro, faire évoluer le contrôle principal pour exécuter directement le lint strict, puis supprimer le mécanisme de comparaison au baseline devenu inutile.

## Suivi des lots

| Lot | Périmètre | Diagnostics de départ | Diagnostics restants après lot | Validation visuelle | État |
| --- | --- | ---: | ---: | --- | --- |
| 1 | Format et modernisation à faible risque | 72 | À mesurer | À faire | À planifier |
| 2 | Valeurs, propriétés et doublons de déclarations | 14 | À mesurer | À faire | À planifier |
| 3 | Sélecteurs dupliqués | 61 | À mesurer | À faire | À planifier |
| 4 | Nommage et références | 190 | À mesurer | À faire | À planifier |
| 5 | Spécificité et cascade | 659 | À mesurer | À faire | À planifier |
