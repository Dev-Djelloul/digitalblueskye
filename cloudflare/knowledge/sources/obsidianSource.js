import { embedText } from '../../embeddings.js';
import { getVectorStoreProvider } from '../../vectorStore/index.js';
import { hashString, safeJsonParse } from '../contracts.js';

const SOURCE_TYPE = 'obsidian';

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function titleFromPath(path) {
  const file = normalizePath(path).split('/').pop() || 'Note Obsidian';
  return file.replace(/\.(md|markdown)$/i, '');
}

export function parseFrontmatter(text) {
  const raw = String(text || '');
  if (!raw.startsWith('---')) return { yaml: {}, body: raw };
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { yaml: {}, body: raw };
  const yaml = {};
  match[1].split(/\n/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx <= 0) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) yaml[key] = value;
  });
  return { yaml, body: raw.slice(match[0].length) };
}

export function extractTags(text, yaml = {}) {
  const tags = new Set();
  const yamlTags = yaml.tags || yaml.tag;
  if (typeof yamlTags === 'string') {
    yamlTags.replace(/[\[\]]/g, '').split(/[,\s]+/).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean).forEach((tag) => tags.add(tag));
  }
  String(text || '').replace(/(^|\s)#([\p{L}\p{N}_/-]+)/gu, (_, __, tag) => {
    tags.add(tag);
    return '';
  });
  return Array.from(tags);
}

export function extractWikiLinks(text) {
  const links = [];
  String(text || '').replace(/!?\[\[([^\]]+)\]\]/g, (match, target) => {
    const embed = match.startsWith('!');
    const [path, alias] = String(target).split('|').map((part) => part.trim());
    links.push({ target: path, alias: alias || '', embed });
    return '';
  });
  return links;
}

export function chunkMarkdown(body, path) {
  const lines = String(body || '').split(/\n/);
  const chunks = [];
  let currentTitle = titleFromPath(path);
  let current = [];
  const flush = () => {
    const text = current.join('\n').trim();
    if (text) {
      chunks.push({
        index: chunks.length,
        locator: currentTitle,
        text
      });
    }
    current = [];
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading && current.length) flush();
    if (heading) currentTitle = heading[2].trim();
    current.push(line);
    if (current.join('\n').length > 2800) flush();
  }
  flush();
  return chunks.length ? chunks : [{ index: 0, locator: titleFromPath(path), text: String(body || '').trim() }];
}

async function sha256(text) {
  const data = new TextEncoder().encode(String(text || ''));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return hashString(text);
}

function vectorNamespace(sourceId) {
  return `knowledge:obsidian:${sourceId || 'vault_1'}`;
}

export function createObsidianKnowledgeSource() {
  return {
    key: 'obsidian',
    type: SOURCE_TYPE,
    async connect(env) {
      return { ok: Boolean(env?.DB), status: env?.DB ? 'available' : 'unavailable' };
    },
    async index(env, payload = {}) {
      if (!env?.DB) return { ok: false, error: 'missing_db' };
      const sourceId = String(payload.sourceId || payload.vaultId || 'vault_1');
      const sourceName = String(payload.name || payload.vaultName || 'Obsidian Vault');
      const files = Array.isArray(payload.files) ? payload.files : [];
      const provider = getVectorStoreProvider(env);
      let indexed = 0;
      let skipped = 0;
      let chunksIndexed = 0;
      const seenDocumentIds = new Set();
      await env.DB.prepare(
        `INSERT INTO knowledge_sources (id, type, name, status, config_json, last_sync_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = 'active', last_sync_at = datetime('now'), updated_at = datetime('now')`
      ).bind(sourceId, SOURCE_TYPE, sourceName, JSON.stringify({ vaultId: sourceId })).run();

      for (const file of files) {
        const path = normalizePath(file.path || file.name);
        const content = String(file.content || file.text || '');
        if (!path || !/\.(md|markdown)$/i.test(path)) continue;
        const checksum = await sha256(content);
        const documentId = `${sourceId}:${path}`;
        seenDocumentIds.add(documentId);
        const existing = await env.DB.prepare('SELECT checksum FROM knowledge_documents WHERE id = ?').bind(documentId).first();
        if (existing?.checksum === checksum && payload.force !== true) {
          skipped += 1;
          continue;
        }
        const { yaml, body } = parseFrontmatter(content);
        const title = yaml.title || titleFromPath(path);
        const tags = extractTags(body, yaml);
        const links = extractWikiLinks(body);
        const chunks = chunkMarkdown(body, path);
        await env.DB.prepare(
          `INSERT INTO knowledge_documents (id, source_id, external_id, title, path, type, checksum, version_hash, status, metadata_json, updated_at)
           VALUES (?, ?, ?, ?, ?, 'markdown', ?, ?, 'indexed', ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, path = excluded.path, checksum = excluded.checksum, version_hash = excluded.version_hash, status = 'indexed', metadata_json = excluded.metadata_json, updated_at = datetime('now')`
        ).bind(documentId, sourceId, path, title, path, checksum, checksum, JSON.stringify({ yaml, tags, links })).run();
        await env.DB.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').bind(documentId).run();
        await env.DB.prepare('DELETE FROM knowledge_tags WHERE document_id = ?').bind(documentId).run();
        await env.DB.prepare('DELETE FROM knowledge_links WHERE from_document_id = ?').bind(documentId).run();
        const vectorItems = [];
        for (const chunk of chunks) {
          const chunkId = `${documentId}::${chunk.index}`;
          const chunkHash = await sha256(chunk.text);
          await env.DB.prepare(
            `INSERT INTO knowledge_chunks (id, document_id, source_id, chunk_index, text, hash, token_count, locator, metadata_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(chunkId, documentId, sourceId, chunk.index, chunk.text, chunkHash, Math.ceil(chunk.text.length / 4), chunk.locator, JSON.stringify({ path, title })).run();
          const vector = await embedText(env, chunk.text);
          if (vector) {
            vectorItems.push({
              id: chunkId,
              values: vector,
              metadata: { namespace: vectorNamespace(sourceId), source: SOURCE_TYPE, sourceId, documentId, title, path, chunkIndex: chunk.index, locator: chunk.locator }
            });
          }
        }
        if (provider && vectorItems.length) {
          await provider.upsert({ namespace: vectorNamespace(sourceId), items: vectorItems });
        }
        for (const tag of tags) {
          await env.DB.prepare('INSERT INTO knowledge_tags (source_id, document_id, tag) VALUES (?, ?, ?)').bind(sourceId, documentId, tag).run();
        }
        for (const link of links) {
          await env.DB.prepare(
            'INSERT INTO knowledge_links (source_id, from_document_id, to_document_id, link_type, anchor_text) VALUES (?, ?, ?, ?, ?)'
          ).bind(sourceId, documentId, `${sourceId}:${normalizePath(link.target)}${/\.(md|markdown)$/i.test(link.target) ? '' : '.md'}`, link.embed ? 'embed' : 'wikilink', link.alias || link.target).run();
        }
        indexed += 1;
        chunksIndexed += chunks.length;
      }
      if (payload.deleteMissing === true) {
        const rows = await env.DB.prepare('SELECT id FROM knowledge_documents WHERE source_id = ?').bind(sourceId).all();
        for (const row of rows.results || []) {
          if (!seenDocumentIds.has(row.id)) {
            await env.DB.prepare("UPDATE knowledge_documents SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
          }
        }
      }
      await env.DB.prepare(
        `INSERT INTO knowledge_sync_state (source_id, cursor_json, last_incremental_sync_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(source_id) DO UPDATE SET cursor_json = excluded.cursor_json, last_incremental_sync_at = datetime('now'), updated_at = datetime('now')`
      ).bind(sourceId, JSON.stringify({ indexed, skipped, chunksIndexed })).run();
      return { ok: true, sourceId, indexed, skipped, chunks_indexed: chunksIndexed };
    },
    async search(env, query, options = {}) {
      if (!env?.DB || !query) return [];
      const term = `%${String(query).trim().slice(0, 80).replace(/[%_]/g, '')}%`;
      const rows = await env.DB.prepare(
        `SELECT c.id, c.document_id, c.source_id, c.chunk_index, c.text, c.locator, d.title, d.path, d.updated_at, d.metadata_json
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
         WHERE d.type = 'markdown' AND d.status = 'indexed' AND (c.text LIKE ? OR d.title LIKE ? OR d.path LIKE ?)
         ORDER BY d.updated_at DESC LIMIT ?`
      ).bind(term, term, term, Math.max(1, Math.min(20, Number(options.maxPassages) || 8))).all();
      return (rows.results || []).map((row) => {
        const meta = safeJsonParse(row.metadata_json, {});
        return {
          source: SOURCE_TYPE,
          sourceId: row.source_id,
          documentId: row.document_id,
          chunkId: row.id,
          title: row.title,
          text: row.text,
          score: 0.62,
          freshness: row.updated_at,
          citation: `[Obsidian: ${row.title}]`,
          metadata: { path: row.path, locator: row.locator, tags: meta.tags || [], bm25Score: 0.62 }
        };
      });
    },
    async semanticSearch(env, query, options = {}) {
      const provider = getVectorStoreProvider(env);
      if (!provider || !env?.DB || !query) return [];
      const vector = await embedText(env, query);
      if (!vector) return [];
      const sourceId = options.sourceId || options.projectContext?.obsidianVaultId || 'vault_1';
      const { matches } = await provider.query({ namespace: vectorNamespace(sourceId), vector, topK: Math.max(5, Math.min(20, Number(options.maxPassages) || 8)) });
      const ids = (matches || []).map((match) => match.id);
      if (!ids.length) return [];
      const placeholders = ids.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT c.id, c.document_id, c.source_id, c.text, c.locator, d.title, d.path, d.updated_at, d.metadata_json
         FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id
         WHERE c.id IN (${placeholders})`
      ).bind(...ids).all();
      const byId = new Map((rows.results || []).map((row) => [row.id, row]));
      return matches.map((match) => {
        const row = byId.get(match.id);
        if (!row) return null;
        const meta = safeJsonParse(row.metadata_json, {});
        return {
          source: SOURCE_TYPE,
          sourceId: row.source_id,
          documentId: row.document_id,
          chunkId: row.id,
          title: row.title,
          text: row.text,
          score: match.score,
          freshness: row.updated_at,
          citation: `[Obsidian: ${row.title}]`,
          metadata: { path: row.path, locator: row.locator, tags: meta.tags || [], graphScore: Array.isArray(meta.links) ? Math.min(1, meta.links.length / 10) : 0 }
        };
      }).filter(Boolean);
    },
    async getDocument(env, id) {
      if (!env?.DB || !id) return null;
      return await env.DB.prepare('SELECT * FROM knowledge_documents WHERE id = ?').bind(id).first();
    },
    async getMetadata(env, id) {
      const doc = await this.getDocument(env, id);
      return doc ? safeJsonParse(doc.metadata_json, {}) : null;
    },
    async getEmbeddings(env, documentId) {
      if (!env?.DB || !documentId) return [];
      const rows = await env.DB.prepare(
        'SELECT id, source_id, document_id, chunk_index, hash, token_count, locator FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index ASC'
      ).bind(documentId).all();
      return rows.results || [];
    },
    async refresh(env, cursor = {}) {
      return { ok: true, refreshed: false, cursor, detail: 'Use index() with changed files for incremental sync.' };
    },
    async health(env) {
      if (!env?.DB) return { ok: false, status: 'unavailable' };
      const [docs, chunks, sync] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS count FROM knowledge_documents WHERE type = 'markdown' AND status = 'indexed'").first(),
        env.DB.prepare("SELECT COUNT(*) AS count FROM knowledge_chunks WHERE source_id IN (SELECT id FROM knowledge_sources WHERE type = 'obsidian')").first(),
        env.DB.prepare("SELECT MAX(last_incremental_sync_at) AS last_sync_at FROM knowledge_sync_state WHERE source_id IN (SELECT id FROM knowledge_sources WHERE type = 'obsidian')").first()
      ]);
      const documentsCount = Number(docs?.count || 0);
      return {
        ok: documentsCount > 0,
        status: documentsCount > 0 ? 'available' : 'empty',
        documents_count: documentsCount,
        chunks_count: Number(chunks?.count || 0),
        last_sync_at: sync?.last_sync_at || null
      };
    }
  };
}
