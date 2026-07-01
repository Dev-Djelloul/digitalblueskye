import assert from 'node:assert/strict';
import { createKnowledgeSourceRegistry } from './knowledge/sourceRegistry.js';
import { runKnowledgeOrchestrator } from './knowledge/knowledgeOrchestrator.js';

const registry = createKnowledgeSourceRegistry([
  {
    key: 'fake',
    search: async () => [{ source: 'fake', documentId: 'd', chunkId: 'c', title: 'Doc', text: 'Digital Blue Skye Studio knowledge', score: 0.9 }],
    semanticSearch: async () => []
  }
]);
const result = await runKnowledgeOrchestrator({}, registry, { query: 'knowledge', sources: ['fake'], tokenBudget: 500 });
assert.equal(result.ok, true);
assert.equal(result.citations.length, 1);
assert.equal(result.telemetry.chunks_selected, 1);

// Requete liee a un document ("ce document"...) : sources:['rag'] +
// includeProjectMemory:false doit interroger UNIQUEMENT rag, jamais
// project_memory ni tavily, meme si ces sources sont enregistrees.
{
  const receivedOptions = [];
  const docRegistry = createKnowledgeSourceRegistry([
    {
      key: 'rag',
      search: async () => [],
      semanticSearch: async (env, query, options) => {
        receivedOptions.push(options);
        return [{ source: 'rag', documentId: 'd1', chunkId: 'c1', title: 'PDF', text: 'Chercheurs cites dans le document', score: 0.95 }];
      }
    },
    {
      key: 'project_memory',
      search: async () => [{ source: 'project_memory', documentId: 'pm', chunkId: 'pm1', title: 'Memoire', text: 'ne doit jamais etre utilisee ici', score: 0.99 }],
      semanticSearch: async () => []
    }
  ]);
  const docResult = await runKnowledgeOrchestrator({}, docRegistry, {
    query: 'Quels chercheurs sont mentionnés dans ce document ?',
    sources: ['rag'],
    includeProjectMemory: false,
    maxPassages: 16,
    similarityThreshold: 0.5,
    tokenBudget: 1500
  });
  assert.equal(docResult.ok, true);
  assert.deepEqual(docResult.telemetry.sources_requested.sort(), ['rag']);
  assert.ok(!docResult.citations.some((c) => String(c).includes('project_memory')), 'project_memory ne doit jamais etre cite sur une requete document-bound');
  assert.equal(receivedOptions[0].maxPassages, 16, 'maxPassages doit etre transmis a la source rag');
  assert.equal(receivedOptions[0].similarityThreshold, 0.5, 'similarityThreshold doit etre transmis a la source rag');
}

// Requete structurelle (bibliographie/chercheurs) : structural + targetDocumentId
// doivent etre transmis a la source rag, et le contextBlock doit deduplicquer
// les passages identiques (anti-repetition) + instruire le modele.
{
  const received = [];
  const structRegistry = createKnowledgeSourceRegistry([
    {
      key: 'rag',
      search: async () => [],
      semanticSearch: async (env, query, options) => {
        received.push(options);
        // Deux passages identiques (doivent etre dedupliques) + un distinct.
        return [
          { source: 'rag', documentId: 'pdf', chunkId: 'pdf::5', chunkIndex: 5, title: 'PDF', text: 'Bibliographie : Patricia Crone, Michael Cook.', score: 3 },
          { source: 'rag', documentId: 'pdf', chunkId: 'pdf::5b', chunkIndex: 6, title: 'PDF', text: 'Bibliographie : Patricia Crone, Michael Cook.', score: 2 },
          { source: 'rag', documentId: 'pdf', chunkId: 'pdf::7', chunkIndex: 7, title: 'PDF', text: 'Robert Hoyland, Alfred-Louis de Prémare.', score: 1 }
        ];
      }
    }
  ]);
  const structResult = await runKnowledgeOrchestrator({}, structRegistry, {
    query: 'Que contient la bibliographie du document ?',
    sources: ['rag'],
    includeProjectMemory: false,
    structural: { isStructural: true, kind: 'bibliography', type: 'bibliography', retrieval: 'section', lexicalTerms: ['bibliographie', 'sources'] },
    targetDocumentId: 'pdf',
    maxPassages: 16,
    tokenBudget: 2000
  });
  assert.equal(structResult.ok, true);
  assert.equal(received[0].structural?.kind, 'bibliography', 'structural.kind transmis a la source');
  assert.equal(received[0].targetDocumentId, 'pdf', 'targetDocumentId transmis a la source');
  // Le passage duplique ne doit etre compte qu'une fois.
  assert.equal(structResult.telemetry.chunks_selected, 2, 'passages identiques dedupliques (2 retenus sur 3)');
  // Phase 1 simplification documentaire : les consignes dediees (forme du
  // tableau, anti-confusion fichiers/bibliographie) sont retirees du
  // contextBlock. On verifie desormais que le bloc ne porte PLUS ces
  // instructions specifiques — le LLM decide de la forme de sa reponse.
  assert.ok(!structResult.contextBlock.includes('fichiers du projet'), 'plus de consigne anti-confusion fichiers/bibliographie (retiree en Phase 1)');
  assert.ok(!/file names/i.test(structResult.contextBlock), 'plus de consigne file names (retiree en Phase 1)');
  assert.ok(!/tableau propre/i.test(structResult.contextBlock), 'plus de consigne de forme tableau (retiree en Phase 1)');
}
