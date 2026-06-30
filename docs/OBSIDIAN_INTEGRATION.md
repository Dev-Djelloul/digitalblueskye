# Intégration Obsidian

Obsidian est traité comme une source documentaire native, pas comme un simple dossier Markdown.

## Données extraites

- fichiers Markdown ;
- frontmatter YAML ;
- titres Markdown ;
- tags `#tag` et `tags:` YAML ;
- liens `[[Wiki Links]]` ;
- embeds `![[file]]` ;
- backlinks via table `knowledge_links` ;
- pièces jointes référencées ;
- checksum SHA-256 ;
- métadonnées `path`, `title`, `tags`, `links`, `updated_at`.

## Indexation

Endpoint :

```http
POST /knowledge/index
```

Payload minimal :

```json
{
  "sourceId": "vault_1",
  "name": "Vault principal",
  "files": [
    {
      "path": "Projects/AI/Architecture.md",
      "content": "---\ntitle: Architecture\n---\n# Intro\nTexte..."
    }
  ]
}
```

L'indexation est incrémentale : si le checksum d'une note n'a pas changé, elle est ignorée. Les chunks d'une note modifiée sont remplacés, puis les embeddings sont recalculés uniquement pour cette note.

## Suppressions

Pour marquer comme supprimées les notes absentes du lot transmis :

```json
{
  "sourceId": "vault_1",
  "deleteMissing": true,
  "files": []
}
```

## Recherche

Obsidian expose deux modes :

- `search()` : recherche lexicale D1 sur titre, path et chunks ;
- `semanticSearch()` : recherche Vectorize si `env.AI` et `env.VECTOR_INDEX` sont disponibles.

## Limites connues

Le parsing YAML est volontairement léger pour rester compatible Cloudflare Workers sans dépendance lourde. Si le vault contient du YAML complexe, ajouter un parseur dédié compatible bundle Worker.
