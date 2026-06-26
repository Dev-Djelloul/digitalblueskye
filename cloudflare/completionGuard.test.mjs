import {
  isTruncated,
  mergeContinuation,
  closeOpenMarkdownStructures,
  resolveMaxContinuations,
  applyCompletionGuard
} from './completionGuard.js';

let failures = 0;
function check(label, cond) {
  if (!cond) { failures += 1; console.log(`FAIL: ${label}`); }
  else console.log(`ok  : ${label}`);
}

// --- isTruncated ---
check('isTruncated length', isTruncated('length') === true);
check('isTruncated max_tokens', isTruncated('max_tokens') === true);
check('isTruncated stop=false', isTruncated('stop') === false);
check('isTruncated null=false', isTruncated(null) === false);

// --- resolveMaxContinuations (borne 0..3) ---
check('max default', resolveMaxContinuations(undefined) === 2);
check('max clamp high', resolveMaxContinuations(99) === 3);
check('max clamp neg', resolveMaxContinuations(-5) === 0);
check('max parse', resolveMaxContinuations('1') === 1);

// --- mergeContinuation : fusion intelligente ---
check('merge overlap mot coupe', mergeContinuation('Limitez-vous a l\'axe Réthym', 'Réthymnon → Chania') === 'Limitez-vous a l\'axe Réthymnon → Chania');
check('merge overlap phrase', mergeContinuation('Voici la suite du ', 'du texte.') === 'Voici la suite du texte.');
check('merge sans overlap', mergeContinuation('Fin de phrase.', ' Nouvelle phrase.') === 'Fin de phrase. Nouvelle phrase.');
check('merge prev vide', mergeContinuation('', 'abc') === 'abc');
check('merge next vide', mergeContinuation('abc', '') === 'abc');

// --- closeOpenMarkdownStructures ---
const codeFence = closeOpenMarkdownStructures('Voici du code :\n```js\nconst x = 1;\nfunction f() {');
check('ferme code fence', codeFence.text.endsWith('```') && codeFence.meta.closed_code_fence === true);

const emptyHeading = closeOpenMarkdownStructures('Texte complet.\n\n###');
check('retire titre vide', emptyHeading.text === 'Texte complet.' && emptyHeading.meta.dropped_empty_heading === true);

const emptyMarker = closeOpenMarkdownStructures('- Item un\n- Item deux\n-');
check('retire marqueur liste vide', emptyMarker.text === '- Item un\n- Item deux' && emptyMarker.meta.dropped_empty_list_marker === true);

const partialTable = closeOpenMarkdownStructures('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | inco');
check('retire ligne tableau partielle', !partialTable.text.includes('inco') && partialTable.meta.dropped_partial_table_row === true);

const danglingCite = closeOpenMarkdownStructures('Selon la source [S12');
check('retire citation ouverte', danglingCite.text === 'Selon la source' && danglingCite.meta.dropped_dangling_citation === true);

const inlineCode = closeOpenMarkdownStructures('Utilise la fonction `parseMarkdown');
check('ferme code inline', inlineCode.text.endsWith('`') && inlineCode.meta.balanced_inline_code === true);

const clean = closeOpenMarkdownStructures('## Titre\n\nParagraphe complet avec `code` ferme.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
check('texte complet inchange (idempotent)', clean.text === '## Titre\n\nParagraphe complet avec `code` ferme.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |' && Object.values(clean.meta).every((v) => v === false));

// citation complete non touchee
const completeCite = closeOpenMarkdownStructures('Voir [S1] pour details.');
check('citation complete preservee', completeCite.text === 'Voir [S1] pour details.' && completeCite.meta.dropped_dangling_citation === false);

// --- applyCompletionGuard : orchestration ---
async function run() {
  // Cas 1 : pas tronque -> aucune continuation, fermeture no-op.
  const r1 = await applyCompletionGuard({
    initialContent: 'Reponse complete.',
    initialFinishReason: 'stop',
    requestContinuation: async () => { throw new Error('ne doit pas etre appele'); },
    maxContinuations: 2
  });
  check('guard: pas de continuation si finish=stop', r1.continuations === 0 && r1.content === 'Reponse complete.');

  // Cas 2 : tronque, 2 continuations jusqu'a finish=stop.
  const longBase = 'x'.repeat(250);
  let calls = 0;
  const r2 = await applyCompletionGuard({
    initialContent: longBase + ' partie 1',
    initialFinishReason: 'length',
    requestContinuation: async () => {
      calls += 1;
      if (calls === 1) return { ok: true, content: ' partie 2', finishReason: 'length' };
      return { ok: true, content: ' partie 3', finishReason: 'stop' };
    },
    maxContinuations: 3
  });
  check('guard: continue jusqu\'a stop', r2.continuations === 2 && r2.content.endsWith('partie 3') && r2.stillTruncated === false);

  // Cas 3 : tronque mais budget = 2, modele continue de tronquer -> stoppe a 2 + ferme.
  let calls3 = 0;
  const r3 = await applyCompletionGuard({
    initialContent: 'x'.repeat(250) + '\n```js\nconst a = 1;',
    initialFinishReason: 'length',
    requestContinuation: async () => {
      calls3 += 1;
      return { ok: true, content: `\nconst b${calls3} = 2;`, finishReason: 'length' };
    },
    maxContinuations: 2
  });
  check('guard: borne a maxContinuations', r3.continuations === 2 && calls3 === 2);
  check('guard: ferme code fence apres continuations epuisees', r3.content.trim().endsWith('```') && r3.stillTruncated === true);

  // Cas 4 : contenu trop court -> pas de continuation meme si tronque.
  const r4 = await applyCompletionGuard({
    initialContent: 'court',
    initialFinishReason: 'length',
    requestContinuation: async () => { throw new Error('ne doit pas etre appele'); },
    maxContinuations: 2
  });
  check('guard: pas de continuation si contenu trop court', r4.continuations === 0);

  // Cas 5 : continuation echoue -> stoppe proprement, ferme structures.
  const r5 = await applyCompletionGuard({
    initialContent: 'x'.repeat(250) + '\n- item un\n-',
    initialFinishReason: 'length',
    requestContinuation: async () => ({ ok: false, reason: 'rate_limit' }),
    maxContinuations: 2
  });
  check('guard: echec continuation non bloquant', r5.continuations === 0 && !r5.content.endsWith('\n-'));

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : failures + ' TEST(S) EN ECHEC'}`);
  if (failures) process.exitCode = 1;
}

run();
