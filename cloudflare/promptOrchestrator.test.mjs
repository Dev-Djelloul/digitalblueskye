import {
  detectUserIntent,
  planCapabilities,
  composeSystemPrompt,
  orchestrate
} from './promptOrchestrator.js';

let failures = 0;
function check(label, cond) {
  if (!cond) { failures += 1; console.log(`FAIL: ${label}`); }
  else console.log(`ok  : ${label}`);
}

function run(userMessage, opts = {}) {
  const intent = detectUserIntent({ userMessage, ...opts });
  const plan = planCapabilities(intent, opts.runtimeContext || {});
  return { intent, plan };
}

// 1. Question courte
{
  const { intent, plan } = run('Quelle est la capitale de la Crète ?');
  check('q-courte: intent question', intent.primaryIntent === 'question');
  check('q-courte: format short_answer', intent.expectedFormat === 'short_answer');
  check('q-courte: pas de RAG/web', intent.needsRag === false && intent.needsWeb === false);
  check('q-courte: profil default', plan.promptProfile === 'default');
  check('q-courte: maxTokens court (700)', plan.maxTokensHint === 700);
}

// 2. Demande long document
{
  const { intent, plan } = run('Rédige un guide complet et détaillé sur la gestion de projet Agile.');
  check('long-doc: intent document_generation', intent.primaryIntent === 'document_generation');
  check('long-doc: format long_document', intent.expectedFormat === 'long_document');
  check('long-doc: requiresLongAnswer', intent.requiresLongAnswer === true);
  check('long-doc: profil long_document', plan.promptProfile === 'long_document');
  check('long-doc: maxTokens eleve (2200)', plan.maxTokensHint === 2200);
  check('long-doc: tier strong', plan.preferredModelTier === 'strong');
  check('long-doc: completion guard actif', plan.useCompletionGuard === true);
}

// 3. Demande tableau
{
  const { intent, plan } = run('Fais un tableau des frameworks JS avec leurs avantages.');
  check('tableau: requiresTable', intent.requiresTable === true);
  check('tableau: format table', intent.expectedFormat === 'table');
  const prompt = composeSystemPrompt({ intent, plan });
  check('tableau: prompt contient regle tableau', /tableau Markdown|Markdown table/i.test(prompt));
}

// 4. Demande RAG projet
{
  const { intent, plan } = run('Que dit le projet Vincle sur la roadmap ?', { hasRagSources: true });
  check('rag: intent rag_query', intent.primaryIntent === 'rag_query');
  check('rag: needsRag', intent.needsRag === true);
  check('rag: profil rag_grounded', plan.promptProfile === 'rag_grounded');
  check('rag: requiresSources', intent.requiresSources === true);
}

// 5. Demande web récente
{
  const { intent, plan } = run('Quelles sont les dernières actualités sur l\'IA aujourd\'hui ?', { hasWebIntent: true });
  check('web: intent web_research', intent.primaryIntent === 'web_research');
  check('web: needsWeb', intent.needsWeb === true);
  check('web: profil web_grounded', plan.promptProfile === 'web_grounded');
  check('web: useWeb', plan.useWeb === true);
}

// 6. Demande comparaison
{
  const { intent, plan } = run('Compare React et Vue aujourd\'hui.');
  check('comparaison: intent comparison', intent.primaryIntent === 'comparison');
  check('comparaison: needsWeb (aujourd\'hui)', intent.needsWeb === true);
  check('comparaison: requiresTable', intent.requiresTable === true);
  check('comparaison: profil comparison', plan.promptProfile === 'comparison');
}

// 7. Demande technique
{
  const { intent, plan } = run('Corrige ce bug dans ma fonction JavaScript qui lève une exception.');
  check('technique: intent technical_help', intent.primaryIntent === 'technical_help');
  check('technique: format step_by_step', intent.expectedFormat === 'step_by_step');
  check('technique: profil technical', plan.promptProfile === 'technical');
  check('technique: temperature basse', plan.temperatureHint === 0.2);
}

// 8. Demande plan d'action
{
  const { intent, plan } = run('Que dois-je faire aujourd\'hui sur le projet ?');
  check('plan: intent planning', intent.primaryIntent === 'planning');
  check('plan: profil project_manager', plan.promptProfile === 'project_manager');
  check('plan: format checklist', intent.expectedFormat === 'checklist');
}

// 9. Demande résumé
{
  const { intent } = run('Résume ce document en quelques points clés.');
  check('resume: intent summary', intent.primaryIntent === 'summary');
  check('resume: format structured_answer', intent.expectedFormat === 'structured_answer');
}

// 10. Demande ambiguë
{
  const { intent, plan } = run('hmm');
  check('ambigu: intent unknown', intent.primaryIntent === 'unknown');
  check('ambigu: confiance basse', intent.confidence <= 0.3);
  check('ambigu: profil default', plan.promptProfile === 'default');
}

// composeSystemPrompt : compacite + blocs conditionnels
{
  const shortQ = orchestrate({ userMessage: 'Quelle heure est-il ?' });
  const longDoc = orchestrate({ userMessage: 'Rédige un rapport complet et détaillé sur la cybersécurité.' });
  check('compose: prompt court < prompt long', shortQ.systemPrompt.length < longDoc.systemPrompt.length);
  check('compose: court sans bloc document long', !/Document long|Long document/i.test(shortQ.systemPrompt));
  check('compose: long avec bloc document long', /Document long|Long document/i.test(longDoc.systemPrompt));
  check('compose: identite presente', /Digital Blue Skye/.test(shortQ.systemPrompt));
  check('compose: anti-LaTeX present', /LaTeX/i.test(shortQ.systemPrompt));
  check('compose: rappel web non declenche', /recherche web n'a été déclenchée|No web search was triggered/i.test(shortQ.systemPrompt));
  // RAG -> bloc sources present
  const ragRun = orchestrate({ userMessage: 'Que dit le projet sur X ?', hasRagSources: true });
  check('compose: RAG -> bloc sources', /Sources :|Sources:/i.test(ragRun.systemPrompt));
  // Pas de RAG/web -> pas de bloc sources
  check('compose: pas de RAG -> pas de bloc sources citations', !/\[S1\], \[S2\]/.test(shortQ.systemPrompt));
}

// Robustesse : entree vide / nulle ne casse jamais
{
  const empty = detectUserIntent({ userMessage: '' });
  check('robuste: message vide -> unknown', empty.primaryIntent === 'unknown');
  const noArg = detectUserIntent();
  check('robuste: aucun argument', noArg.primaryIntent === 'unknown');
  const planNull = planCapabilities(null);
  check('robuste: planCapabilities(null)', typeof planNull.promptProfile === 'string');
  const composeEmpty = composeSystemPrompt({});
  check('robuste: composeSystemPrompt({})', typeof composeEmpty === 'string' && composeEmpty.length > 0);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : failures + ' TEST(S) EN ECHEC'}`);
if (failures) process.exitCode = 1;
