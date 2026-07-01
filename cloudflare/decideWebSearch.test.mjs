// Non-regression : decideWebSearch() ne doit jamais declencher Tavily/web
// sur une requete explicitement liee a un document ("ce document", "ce
// PDF", "du document"...), meme quand detectWebSearchIntent() detecterait
// par ailleurs un mot-cle de fraicheur ("derniers", "recent"...).
// Bug report origine : "Donne-moi les 10 derniers paragraphes du document."
// declenchait a tort une recherche web (mandatoryKeywords contient
// "dernier"), citant des sources sans rapport (Bonbache, Microsoft Learn...).
// node cloudflare/decideWebSearch.test.mjs
import assert from 'node:assert/strict';
import { decideWebSearch, detectWebSearchIntent } from './worker-openrouter.js';

let failures = 0;
function check(label, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok  : ${label}`);
  }
}

// Sanity check : "derniers" est bien un mot-cle obligatoire de detectWebSearchIntent
// (confirme la cause racine du bug avant verification du correctif).
{
  const intent = detectWebSearchIntent('Donne-moi les 10 derniers paragraphes du document.', {});
  check('detectWebSearchIntent: "derniers" declenche mandatory (cause racine du bug)', intent.mandatory === true);
}

{
  const decision = await decideWebSearch({
    message: 'Donne-moi les 10 derniers paragraphes du document.',
    body: {},
    env: {},
    sessionId: 'test-session',
    hasFileContext: false,
    attachments: []
  });
  check('bug#2 derniers paragraphes: shouldSearch false malgre "derniers"', decision.shouldSearch === false);
  check('bug#2 derniers paragraphes: reason skipped_document_bound_query', decision.reason === 'skipped_document_bound_query');
}

{
  const decision = await decideWebSearch({
    message: 'Quels chercheurs sont mentionnés dans ce document ?',
    body: {},
    env: {},
    sessionId: 'test-session',
    hasFileContext: false,
    attachments: []
  });
  check('bug#1 chercheurs: shouldSearch false', decision.shouldSearch === false);
  check('bug#1 chercheurs: reason skipped_document_bound_query', decision.reason === 'skipped_document_bound_query');
}

{
  const decision = await decideWebSearch({
    message: 'Que contient la bibliographie du document ?',
    body: {},
    env: {},
    sessionId: 'test-session',
    hasFileContext: false,
    attachments: []
  });
  check('bug#3 bibliographie: shouldSearch false', decision.shouldSearch === false);
}

// Non-regression : une requete sans reference documentaire avec un mot-cle
// de fraicheur doit continuer a declencher le web normalement.
{
  const decision = await decideWebSearch({
    message: 'Quelles sont les dernières actualités sur l\'IA cette semaine ?',
    body: {},
    env: {},
    sessionId: 'test-session',
    hasFileContext: false,
    attachments: []
  });
  check('non-regression: requete fraicheur sans document declenche toujours le web', decision.shouldSearch === true);
}

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} test(s) ECHOUE(S)`);
process.exit(failures === 0 ? 0 : 1);
