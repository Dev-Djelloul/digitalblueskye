---
title: "Index documentaire — Voyage en Crète"
project: "Voyage en Crète"
destination: "Crète"
country: "Grèce"
language: "fr"
content_type: "index_rag"
tags: ["index", "RAG", "Crète", "Digital Blue Skye"]
priority: "haute"
last_verified: "2026-06-24"
status: "document de pilotage"
---

# Index documentaire — Voyage en Crète

Ce corpus est conçu pour alimenter le RAG Digital Blue Skye sur le projet “Voyage en Crète”.

## Documents inclus

1. `01-presentation-generale-crete.md` — Présentation générale de la Crète — type: destination — priorité: haute
2. `02-meilleure-periode-crete.md` — Meilleure période pour voyager en Crète — type: climat_saisonnalite — priorité: haute
3. `03-formalites-securite-grece.md` — Formalités et sécurité pour un voyageur français en Grèce — type: formalites_securite — priorité: haute
4. `04-transports-crete.md` — Transports en Crète — type: mobilite — priorité: haute
5. `05-heraklion-knossos.md` — Héraklion et Knossos — type: patrimoine_ville — priorité: haute
6. `06-chania-la-canee.md` — La Canée / Chania — type: ville_sejour — priorité: haute
7. `07-rethymnon.md` — Réthymnon — type: ville_base_intermediaire — priorité: moyenne
8. `08-plages-sites-naturels.md` — Plages et sites naturels majeurs — type: nature_plages — priorité: haute
9. `09-gorges-samaria.md` — Gorges de Samaria — type: randonnee_nature — priorité: haute
10. `10-gastronomie-cretoise.md` — Gastronomie crétoise — type: culture_gastronomie — priorité: moyenne
11. `11-itineraire-7-jours-crete.md` — Itinéraire conseillé de 7 jours en Crète — type: itineraire — priorité: haute
12. `12-erreurs-a-eviter-crete.md` — Erreurs fréquentes à éviter lors d’un voyage en Crète — type: conseils_pratiques — priorité: haute


## Règles d’utilisation par l’assistant

- Utiliser ces documents comme base prioritaire pour les questions liées à la Crète.
- Distinguer les informations stables des informations évolutives.
- Ne pas inventer les horaires, tarifs, ouvertures, conditions d’accès ou prix.
- Recommander une vérification officielle avant réservation ou départ.
- Adapter les réponses selon durée, saison, budget, transport, ville d’arrivée et profil voyageur.

## Découpage RAG recommandé

- Taille de chunk : 500 à 900 mots.
- Overlap : 80 à 120 mots.
- Préserver les titres H1, H2 et H3 comme signaux sémantiques.
- Conserver les métadonnées YAML comme métadonnées de document.
