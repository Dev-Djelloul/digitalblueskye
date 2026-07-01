// Tests retrieval structurel : queryDocumentTail (positionnel par
// chunk_index) + lexicalSearchChunks (LIKE) + listIndexedDocuments.
// DB factice : simule rag_chunks et le comportement SQL utile (ORDER BY
// chunk_index DESC + LIMIT pour le tail, LIKE pour le lexical, GROUP BY pour
// la liste). node cloudflare/ragRetrieval.test.mjs
import assert from 'node:assert/strict';
import { queryDocumentTail, lexicalSearchChunks, listIndexedDocuments, getChunksByIndices } from './ragPipeline.js';
import { createRagKnowledgeSource } from './knowledge/sources/ragSource.js';

let failures = 0;
function check(label, condition) {
  if (!condition) { failures += 1; console.error(`FAIL: ${label}`); }
  else console.log(`ok  : ${label}`);
}

// Fabrique une DB factice a partir de lignes rag_chunks.
function makeDB(rows) {
  const captured = { sql: [] };
  const handler = (sql, binds) => {
    captured.sql.push(sql);
    if (/ORDER BY chunk_index DESC/i.test(sql)) {
      // tail : binds = [documentId, limit]
      const [documentId, limit] = binds;
      return rows
        .filter((r) => r.document_id === documentId)
        .sort((a, b) => b.chunk_index - a.chunk_index)
        .slice(0, limit);
    }
    if (/LOWER\(text\) LIKE/i.test(sql)) {
      // lexical : binds = [...%term%, scope?, sqlLimit]
      const likes = binds.filter((b) => typeof b === 'string' && b.startsWith('%') && b.endsWith('%')).map((b) => b.slice(1, -1).toLowerCase());
      const tail = binds.slice(likes.length);
      let scopeVal = null;
      if (/document_id = \?/i.test(sql) || /project_id = \?/i.test(sql)) scopeVal = tail[0];
      const scopeField = /document_id = \?/i.test(sql) ? 'document_id' : (/project_id = \?/i.test(sql) ? 'project_id' : null);
      return rows.filter((r) => {
        const lower = String(r.text || '').toLowerCase();
        const matchesTerm = likes.some((t) => lower.includes(t));
        const matchesScope = !scopeField || r[scopeField] === scopeVal;
        return matchesTerm && matchesScope;
      });
    }
    if (/rag_chunks WHERE id IN \(/i.test(sql)) {
      // queryRag() : recupere le texte des chunks selectionnes par le
      // vectoriel, binds = [...ids]
      const ids = new Set(binds);
      return rows.filter((r) => ids.has(r.id));
    }
    if (/chunk_index IN \(/i.test(sql)) {
      // getChunksByIndices : binds = [documentId, ...indices]
      const [documentId, ...indices] = binds;
      const wanted = new Set(indices.map((n) => Number(n)));
      return rows
        .filter((r) => r.document_id === documentId && wanted.has(Number(r.chunk_index)))
        .sort((a, b) => a.chunk_index - b.chunk_index);
    }
    if (/GROUP BY document_id/i.test(sql)) {
      const byDoc = new Map();
      const scoped = /project_id = \?/i.test(sql) ? rows.filter((r) => r.project_id === binds[0]) : rows;
      scoped.forEach((r) => {
        const cur = byDoc.get(r.document_id);
        if (!cur || String(r.created_at) > String(cur.indexed_at)) {
          byDoc.set(r.document_id, { document_id: r.document_id, document_name: r.document_name, indexed_at: r.created_at });
        }
      });
      return Array.from(byDoc.values()).sort((a, b) => String(b.indexed_at).localeCompare(String(a.indexed_at)));
    }
    return [];
  };
  return {
    captured,
    prepare(sql) {
      return {
        _binds: [],
        bind(...args) { this._binds = args; return this; },
        async all() { return { results: handler(sql, this._binds) }; },
        async first() { return handler(sql, this._binds)[0] || null; },
        async run() { return { success: true }; }
      };
    }
  };
}

// Document de 12 chunks ; le dernier paragraphe (chunk 11) contient la
// conclusion. Un chunk bibliographie au milieu.
const rows = [];
for (let i = 0; i < 12; i += 1) {
  rows.push({
    id: `pdf::${i}`,
    document_id: 'pdf',
    project_id: 'proj-islam',
    document_name: 'Secret de l’Islam.pdf',
    chunk_index: i,
    locator: `page ${i + 1}`,
    text: i === 5
      ? 'Bibliographie — sélection d’ouvrages : Patricia Crone, Michael Cook, Robert Hoyland (chercheurs et auteurs cités).'
      : i === 11
        ? 'Conclusion finale du document : synthèse des travaux des chercheurs.'
        : `Paragraphe ${i} de contenu courant.`,
    created_at: `2026-06-${String(10 + i).padStart(2, '0')}T00:00:00Z`
  });
}

// ── queryDocumentTail : derniers chunks par chunk_index ──────────────────
{
  const res = await queryDocumentTail({ DB: makeDB(rows) }, { documentId: 'pdf', limit: 3 });
  check('tail: ok', res.ok === true);
  check('tail: 3 chunks', res.selected.length === 3);
  check('tail: derniers chunks (9,10,11) par chunk_index', JSON.stringify(res.selected.map((s) => s.chunkIndex)) === JSON.stringify([9, 10, 11]));
  check('tail: re-tries en ordre de lecture croissant', res.selected[0].chunkIndex < res.selected[2].chunkIndex);
  check('tail: contient la conclusion', res.selected.some((s) => /conclusion/i.test(s.text)));
}

// ── lexicalSearchChunks : bibliographie / chercheurs ─────────────────────
{
  const res = await lexicalSearchChunks({ DB: makeDB(rows) }, {
    terms: ['bibliographie', 'chercheurs', 'auteurs', 'ouvrages', 'sources'],
    projectId: 'proj-islam',
    includeGlobalLibrary: false,
    limit: 5
  });
  check('lexical: ok', res.ok === true);
  check('lexical: trouve au moins un chunk', res.selected.length >= 1);
  check('lexical: le chunk bibliographie remonte', res.selected.some((s) => /Patricia Crone|Michael Cook/.test(s.text)));
  check('lexical: score = nombre de termes trouves (>1 sur le chunk biblio)', Math.max(...res.selected.map((s) => s.score)) >= 2);
}

// ── lexicalSearchChunks : scope au document cible ────────────────────────
{
  const extra = rows.concat([{ id: 'autre::0', document_id: 'autre', project_id: 'proj-islam', document_name: 'Autre.pdf', chunk_index: 0, locator: 'page 1', text: 'Bibliographie de l’autre document avec auteurs.', created_at: '2026-07-01T00:00:00Z' }]);
  const res = await lexicalSearchChunks({ DB: makeDB(extra) }, { terms: ['bibliographie', 'auteurs'], documentId: 'pdf', limit: 5 });
  check('lexical scope: ne renvoie que le document cible', res.selected.every((s) => s.documentId === 'pdf'));
}

// ── listIndexedDocuments : un par document_id ────────────────────────────
{
  const extra = rows.concat([{ id: 'autre::0', document_id: 'autre', project_id: 'proj-islam', document_name: 'Autre.pdf', chunk_index: 0, locator: '', text: 'x', created_at: '2026-07-01T00:00:00Z' }]);
  const docs = await listIndexedDocuments({ DB: makeDB(extra) }, { projectId: 'proj-islam', includeGlobalLibrary: false });
  check('list: 2 documents distincts', docs.length === 2);
  check('list: plus recent en premier (Autre.pdf)', docs[0].id === 'autre');
}

// ── getChunksByIndices : voisinage par (document_id, chunk_index) ─────────
{
  const neighbors = await getChunksByIndices({ DB: makeDB(rows) }, { documentId: 'pdf', indices: [4, 6] });
  check('voisinage: 2 chunks demandes', neighbors.length === 2);
  check('voisinage: indices 4 et 6 (autour du chunk biblio 5)', JSON.stringify(neighbors.map((n) => n.chunkIndex)) === JSON.stringify([4, 6]));
}

// ── ragSource (réel) : retrieval section = lexical + voisinage ───────────
// Pas de VECTOR_INDEX dans env -> queryRag renvoie ok:false (provider null),
// donc seul le retrieval structurel D1 alimente le résultat.
{
  const source = createRagKnowledgeSource();
  const items = await source.semanticSearch({ DB: makeDB(rows) }, 'Que contient la bibliographie du document ?', {
    projectContext: { projectId: 'proj-islam' },
    structural: { isStructural: true, kind: 'bibliography', type: 'bibliography', retrieval: 'section', lexicalTerms: ['bibliographie', 'sources', 'ouvrages'] },
    targetDocumentId: 'pdf',
    maxPassages: 16
  });
  const indices = items.map((it) => it.metadata.chunkIndex).sort((a, b) => a - b);
  check('section: le chunk bibliographie (5) est récupéré', indices.includes(5));
  check('section: les voisins (4 et 6) sont ajoutés', indices.includes(4) && indices.includes(6));
  check('section: ne sort pas du document cible', items.every((it) => it.documentId === 'pdf'));
}

// ── ragSource (réel) : retrieval tail = derniers chunks par chunk_index ──
{
  const source = createRagKnowledgeSource();
  const items = await source.semanticSearch({ DB: makeDB(rows) }, 'Donne-moi les 10 derniers paragraphes du document.', {
    projectContext: { projectId: 'proj-islam' },
    structural: { isStructural: true, kind: 'tail', type: 'tail', retrieval: 'tail', lexicalTerms: [] },
    targetDocumentId: 'pdf',
    maxPassages: 10
  });
  const maxIndex = Math.max(...items.map((it) => it.metadata.chunkIndex));
  check('tail: contient le dernier chunk (11)', maxIndex === 11);
  check('tail: ne renvoie que la fin (>= 10 chunks parmi 12)', items.length >= 10);
}

// ── ragSource (réel) : le vectoriel ne doit JAMAIS sortir du document
// cible, meme si un autre document du projet est semantiquement plus
// pertinent (score plus eleve) et meme si le provider vectoriel ignore le
// filtre de metadata (index Vectorize `documentId` pas encore cree). ───────
{
  // Document A (demande explicitement, chunk peu pertinent lexicalement/
  // semantiquement) et document B (non demande, chunk que le moteur de
  // similarite juge plus proche de la question -> score plus eleve).
  const fakeAi = { async run() { return { data: [[0.1, 0.2, 0.3]] }; } };
  const fakeVectorIndex = {
    async query(_vector, { filter }) {
      // Simule un provider qui IGNORE le filtre de metadata (cas reel :
      // index Vectorize pour `documentId` pas encore cree) -> renvoie les
      // deux documents quel que soit le filtre demande. C'est exactement le
      // cas que le re-filtrage code-side doit couvrir.
      void filter;
      return {
        matches: [
          { id: 'A::0', score: 0.75, metadata: { documentId: 'doc-a', documentName: 'LA_SUCCESSION_DES_TEMPLIERS', chunkIndex: 0, locator: 'p1', projectId: 'proj-erudition' } },
          { id: 'B::0', score: 0.97, metadata: { documentId: 'doc-b', documentName: 'Le Grand Secret de l’Islam', chunkIndex: 0, locator: 'p1', projectId: 'proj-erudition' } }
        ]
      };
    }
  };
  const env = {
    AI: fakeAi,
    VECTOR_INDEX: fakeVectorIndex,
    DB: makeDB([
      { id: 'A::0', document_id: 'doc-a', project_id: 'proj-erudition', document_name: 'LA_SUCCESSION_DES_TEMPLIERS', chunk_index: 0, locator: 'p1', text: 'Les chercheurs Patricia Crone et Michael Cook sont cites dans ce document.', created_at: '2026-01-01T00:00:00Z' },
      { id: 'B::0', document_id: 'doc-b', project_id: 'proj-erudition', document_name: 'Le Grand Secret de l’Islam', chunk_index: 0, locator: 'p1', text: 'Chapitre sur les origines historiques, tres pertinent semantiquement pour la question posee.', created_at: '2026-02-01T00:00:00Z' }
    ])
  };

  const source = createRagKnowledgeSource();
  const items = await source.semanticSearch(env, 'Quels sont les chercheurs mentionnés dans le document LA_SUCCESSION_DES_TEMPLIERS ?', {
    projectContext: { projectId: 'proj-erudition' },
    structural: { isStructural: false, kind: null, type: null, retrieval: null, lexicalTerms: [] },
    targetDocumentId: 'doc-a',
    maxPassages: 8
  });

  check('cible strict: au moins un chunk retrouve', items.length > 0);
  check('cible strict: reste exclusivement sur le document demande (A)', items.every((it) => it.documentId === 'doc-a'));
  check('cible strict: ne fait JAMAIS fuiter le document B, meme mieux score', items.every((it) => it.documentId !== 'doc-b'));
}

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} test(s) ECHOUE(S)`);
process.exit(failures === 0 ? 0 : 1);
