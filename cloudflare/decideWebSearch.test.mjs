// Non-regression : decideWebSearch() ne doit jamais declencher Tavily/web
// sur une requete explicitement liee a un document ("ce document", "ce
// PDF", "du document"...), meme quand detectWebSearchIntent() detecterait
// par ailleurs un mot-cle de fraicheur ("recent"...).
// Bug report origine : "Donne-moi les 10 derniers paragraphes du document."
// declenchait a tort une recherche web (mandatoryKeywords contenait alors
// "dernier" en mot nu), citant des sources sans rapport (Bonbache, Microsoft
// Learn...). Corrige une premiere fois par le garde-fou document-bound
// ci-dessous (bug#2).
//
// Suite (2026-07-13) : "dernier/derniere" nus ont ete RETIRES de
// mandatoryKeywords a la racine — un bug PLUS LARGE, non couvert par le
// garde-fou document-bound (qui ne reconnait qu'une reference a UN document
// singulier), a ete observe en production : "Peux-tu me lancer une derniere
// liste de tous les documents qui sont actuellement dans le projet que j'ai
// appele Vincle ?" (question d'inventaire PROJET, pas "ce document") a
// declenche une vraie recherche Tavily sur la phrase francaise brute, qui a
// renvoye des definitions du mot anglais "list" (dictionary.com, Wikipedia
// "List", Play Store "Make-A-List") — totalement hors sujet. "dernier" au
// sens de "last/final" (une DERNIERE fois, un DERNIER essai, une DERNIERE
// liste) est bien plus frequent en francais que le sens temporel ("les
// dernieres nouvelles") : ne restent que des locutions non ambigues (cf.
// mandatoryKeywords dans worker-openrouter.js).
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

// "derniers" seul (sans locution de fraicheur explicite) ne declenche plus
// mandatory : le garde-fou document-bound (bug#2 ci-dessous) reste une
// defense en profondeur, mais la cause racine est desormais corrigee au
// niveau du mot-cle lui-meme.
{
  const intent = detectWebSearchIntent('Donne-moi les 10 derniers paragraphes du document.', {});
  check('detectWebSearchIntent: "derniers" seul ne declenche plus mandatory (correctif racine)', intent.mandatory === false);
}

// Reproduction exacte du bug de production (2026-07-13) : question
// d'inventaire PROJET (pas "ce document"), donc HORS PERIMETRE du garde-fou
// document-bound — seul le retrait du mot-cle nu protege contre ce cas.
{
  const message = "Peux-tu me lancer une dernière liste de tous les documents qui sont actuellement dans le projet que j'ai appelé Vincle ?";
  const intent = detectWebSearchIntent(message, {});
  check('bug production "derniere liste" (inventaire projet): mandatory false', intent.mandatory === false);
  const decision = await decideWebSearch({
    message,
    body: {},
    env: {},
    sessionId: 'test-session',
    hasFileContext: false,
    attachments: []
  });
  check('bug production "derniere liste": shouldSearch false', decision.shouldSearch === false);
  check('bug production "derniere liste": pas de recherche web sur du bruit hors sujet', decision.reason !== 'mandatory_freshness_keyword');
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
