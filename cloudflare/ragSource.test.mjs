import assert from 'node:assert/strict';
import { createRagKnowledgeSource } from './knowledge/sources/ragSource.js';

const source = createRagKnowledgeSource();
assert.equal(source.key, 'rag');
const health = await source.health({});
assert.equal(health.status, 'unavailable');

// ── Fuite inter-projets corrigee (2026-07-13) ───────────────────────────────
// Bug reel en production : un projet tout juste cree et VIDE ("Trippe")
// recevait des chunks d'AUTRES projets (SAFE, Vincle...) et le modele
// hallucinait un inventaire a partir de leur contenu. Cause : semanticSearch
// passait `includeGlobalLibrary: true` EN DUR a queryRag()/lexicalSearchChunks(),
// qui desactive alors tout filtre projectId cote Vectorize/D1 (cf.
// ragPipeline.js : filter = includeGlobalLibrary ? undefined : { projectId }).
// Ces tests figent le nouveau contrat : projectId fourni => scope strict par
// defaut, ne deborde que si projectContext.includeGlobalLibrary est
// explicitement `true` ; sans projectId => comportement global inchange.

function recordingQueryRag() {
  const calls = [];
  const fn = async (env, args) => { calls.push(args); return { ok: true, selected: [] }; };
  fn.calls = calls;
  return fn;
}

function recordingLexical() {
  const calls = [];
  const fn = async (env, args) => { calls.push(args); return { ok: true, selected: [] }; };
  fn.calls = calls;
  return fn;
}

// 1. Projet actif, AUCUNE preference explicite -> scope strict (le bug :
//    c'etait `true` avant le correctif).
{
  const queryRagFn = recordingQueryRag();
  const src = createRagKnowledgeSource({ queryRagFn });
  await src.semanticSearch({}, 'question', {
    projectContext: { projectId: 'p_trippe' },
    maxPassages: 5
  });
  assert.equal(queryRagFn.calls.length, 1);
  assert.equal(queryRagFn.calls[0].includeGlobalLibrary, false, 'projet actif sans preference explicite => includeGlobalLibrary=false (scope strict)');
  assert.equal(queryRagFn.calls[0].projectId, 'p_trippe');
  console.log('ok  : projet actif sans preference -> scope strict (regression corrigee)');
}

// 2. Projet actif, includeGlobalLibrary explicitement demande (ragScope
//    'library'/'multi_project' cote worker) -> autorise a deborder.
{
  const queryRagFn = recordingQueryRag();
  const src = createRagKnowledgeSource({ queryRagFn });
  await src.semanticSearch({}, 'question', {
    projectContext: { projectId: 'p_trippe', includeGlobalLibrary: true },
    maxPassages: 5
  });
  assert.equal(queryRagFn.calls[0].includeGlobalLibrary, true, 'preference explicite respectee');
  console.log('ok  : projet actif + preference explicite -> bibliotheque globale autorisee');
}

// 3. Aucun projet actif (conversation autonome) -> comportement inchange
//    (recherche globale, il n'y a pas de perimetre projet a proteger).
{
  const queryRagFn = recordingQueryRag();
  const src = createRagKnowledgeSource({ queryRagFn });
  await src.semanticSearch({}, 'question', { maxPassages: 5 });
  assert.equal(queryRagFn.calls[0].includeGlobalLibrary, true, 'sans projet actif, recherche globale par defaut');
  console.log('ok  : aucun projet actif -> recherche globale (comportement inchange)');
}

// 4. Meme contrat pour la recherche lexicale structurelle (bibliographie,
//    chercheurs...) quand le document cible n'a pas pu etre resolu :
//    ne doit pas non plus fuiter sur toute la bibliotheque.
{
  const lexicalSearchChunksFn = recordingLexical();
  const src = createRagKnowledgeSource({ lexicalSearchChunksFn });
  await src.semanticSearch({}, 'bibliographie', {
    projectContext: { projectId: 'p_trippe' },
    structural: { retrieval: 'lexical', lexicalTerms: ['bibliographie'] },
    targetDocumentId: null,
    maxPassages: 5
  });
  assert.equal(lexicalSearchChunksFn.calls[0].includeGlobalLibrary, false, 'lexical scope strict quand aucun document cible resolu');
  console.log('ok  : recherche lexicale structurelle sans document cible -> scope strict');
}

console.log('\nTous les tests ragSource passent.');
