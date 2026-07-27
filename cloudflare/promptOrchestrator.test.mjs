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
  check('q-courte: maxTokens court (1200)', plan.maxTokensHint === 1200);
}

// 2. Demande long document
{
  const { intent, plan } = run('Rédige un guide complet et détaillé sur la gestion de projet Agile.');
  check('long-doc: intent document_generation', intent.primaryIntent === 'document_generation');
  check('long-doc: format long_document', intent.expectedFormat === 'long_document');
  check('long-doc: requiresLongAnswer', intent.requiresLongAnswer === true);
  check('long-doc: profil long_document', plan.promptProfile === 'long_document');
  check('long-doc: maxTokens eleve (4000)', plan.maxTokensHint === 4000);
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

// 7bis. Revue de code (bloc de code + verbe de revue)
{
  const { intent, plan } = run('Revois ce code et trouve les bugs :\n```js\nfunction add(a, b) { return a + b }\n```');
  check('code-review: intent code_review', intent.primaryIntent === 'code_review');
  check('code-review: format code_review_report', intent.expectedFormat === 'code_review_report');
  check('code-review: requiresLongAnswer', intent.requiresLongAnswer === true);
  check('code-review: profil code_review', plan.promptProfile === 'code_review');
  check('code-review: tier strong', plan.preferredModelTier === 'strong');
  check('code-review: temperature basse (0.15)', plan.temperatureHint === 0.15);
  check('code-review: maxTokens eleve (4000)', plan.maxTokensHint === 4000);
  const prompt = composeSystemPrompt({ intent, plan });
  check('code-review: prompt contient bloc revue de code', /Revue de code|Code review:/i.test(prompt));
  check('code-review: prompt contient bloc technique', /Aide technique|Technical help/i.test(prompt));
}

// 7ter. Bloc de code SANS verbe de revue mais avec signal technique -> code_review
{
  const { intent } = run('```python\ndef f(x):\n  return x/0\n```\ncorrige cette fonction');
  check('code-review-technical: intent code_review', intent.primaryIntent === 'code_review');
}

// 7quater. Meme verbe de revue mais SANS bloc de code -> reste technical_help
{
  const { intent } = run('Peux-tu faire une revue de code de mon projet en general ?');
  check('code-review-sans-code: pas code_review', intent.primaryIntent !== 'code_review');
}

// 7quinquies. Audit de securite (sans bloc de code : architecture/config decrite en texte)
{
  const { intent, plan } = run('Peux-tu faire un audit de sécurité de mon API : gestion des tokens, CORS et secrets stockés en dur ?');
  check('security-audit: intent security_audit', intent.primaryIntent === 'security_audit');
  check('security-audit: format security_audit_report', intent.expectedFormat === 'security_audit_report');
  check('security-audit: requiresLongAnswer', intent.requiresLongAnswer === true);
  check('security-audit: profil security_audit', plan.promptProfile === 'security_audit');
  check('security-audit: tier strong', plan.preferredModelTier === 'strong');
  check('security-audit: temperature tres basse (0.1)', plan.temperatureHint === 0.1);
  const prompt = composeSystemPrompt({ intent, plan });
  check('security-audit: prompt contient bloc audit de securite', /Audit de sécurité|Security audit:/i.test(prompt));
}

// 7sexies. Audit de securite avec bloc de code -> reste security_audit (perimetre plus large que code_review)
{
  const { intent } = run('Fais un audit de sécurité complet de ce endpoint :\n```js\napp.get("/user", (req, res) => db.query("SELECT * FROM users WHERE id=" + req.query.id))\n```');
  check('security-audit-avec-code: intent security_audit (pas code_review)', intent.primaryIntent === 'security_audit');
}

// 7septies. Mention isolee de vulnerabilite/XSS -> security_audit, meme sans le mot "audit"
{
  const { intent } = run('Est-ce que mon application est vulnérable au XSS ?');
  check('security-audit-xss: intent security_audit', intent.primaryIntent === 'security_audit');
}

// 7octies. Revue de code classique (sans signal de securite) -> reste code_review, pas security_audit
{
  const { intent } = run('Revois ce code et dis-moi si la logique est correcte :\n```js\nfunction sum(a, b) { return a - b }\n```');
  check('code-review-non-securite: reste code_review', intent.primaryIntent === 'code_review');
}

// 7nonies. Audit de performance (sans bloc de code : comportement decrit en texte)
{
  const { intent, plan } = run('Mon API est trop lente, peux-tu m\'aider à optimiser les performances ? Il y a beaucoup de requêtes redondantes.');
  check('performance-audit: intent performance_audit', intent.primaryIntent === 'performance_audit');
  check('performance-audit: format performance_audit_report', intent.expectedFormat === 'performance_audit_report');
  check('performance-audit: requiresLongAnswer', intent.requiresLongAnswer === true);
  check('performance-audit: profil performance_audit', plan.promptProfile === 'performance_audit');
  check('performance-audit: tier strong', plan.preferredModelTier === 'strong');
  check('performance-audit: temperature basse (0.15)', plan.temperatureHint === 0.15);
  const prompt = composeSystemPrompt({ intent, plan });
  check('performance-audit: prompt contient bloc audit de performance', /Audit de performance|Performance audit:/i.test(prompt));
}

// 7decies. Audit de performance avec bloc de code -> reste performance_audit (pas code_review generique)
{
  const { intent } = run('Optimise ce code, il a une complexité algorithmique catastrophique :\n```js\nfor (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { for (let k = 0; k < n; k++) { /* ... */ } } }\n```');
  check('performance-audit-avec-code: intent performance_audit (pas code_review)', intent.primaryIntent === 'performance_audit');
}

// 7undecies. Mention isolee de fuite memoire -> performance_audit, meme sans le mot "optimise"
{
  const { intent } = run('Je pense qu\'il y a une fuite mémoire dans mon application Node.');
  check('performance-audit-fuite: intent performance_audit', intent.primaryIntent === 'performance_audit');
}

// 7duodecies. Audit de securite garde la priorite sur performance quand les deux signaux coexistent
{
  const { intent } = run('Ce endpoint est lent ET vulnérable à une injection SQL, peux-tu tout analyser ?');
  check('securite-prioritaire-sur-perf: intent security_audit', intent.primaryIntent === 'security_audit');
}

// 7terdecies. Question RAG explicite mentionnant securite/lenteur/bugs -> rag_query,
// PAS un audit autonome (priorite a la recuperation documentaire reelle).
{
  const { intent } = run('Que dit le projet sur les vulnérabilités de sécurité identifiées ?', { hasRagSources: true });
  check('rag-question-avec-mot-securite: intent rag_query (pas security_audit)', intent.primaryIntent === 'rag_query');
}
{
  const { intent } = run('Selon la documentation du projet, quels bugs de performance ont été trouvés ?', { hasRagSources: true });
  check('rag-question-avec-mot-perf-bug: intent rag_query (pas performance_audit/code_review)', intent.primaryIntent === 'rag_query');
}

// 7quaterdecies. Generation de tests (bloc de code + verbe dedie)
{
  const { intent, plan } = run('Écris des tests unitaires pour cette fonction :\n```js\nfunction add(a, b) { return a + b }\n```');
  check('test-gen: intent test_generation', intent.primaryIntent === 'test_generation');
  check('test-gen: format test_suite', intent.expectedFormat === 'test_suite');
  check('test-gen: requiresLongAnswer', intent.requiresLongAnswer === true);
  check('test-gen: profil test_generation', plan.promptProfile === 'test_generation');
  check('test-gen: tier strong', plan.preferredModelTier === 'strong');
  check('test-gen: temperature basse (0.15)', plan.temperatureHint === 0.15);
  const prompt = composeSystemPrompt({ intent, plan });
  check('test-gen: prompt contient bloc generation de tests', /Génération de tests|Test generation:/i.test(prompt));
}

// 7quindecies. Generation de tests SANS bloc de code -> ne doit PAS declencher test_generation
{
  const { intent } = run('Peux-tu m\'expliquer comment écrire des tests unitaires en général ?');
  check('test-gen-sans-code: pas test_generation', intent.primaryIntent !== 'test_generation');
}

// 7sedecies. Documentation de code (JSDoc explicite, sans bloc de code necessaire)
{
  const { intent, plan } = run('Génère la documentation JSDoc de cette fonction :\n```js\nfunction add(a, b) { return a + b }\n```');
  check('code-doc: intent code_documentation', intent.primaryIntent === 'code_documentation');
  check('code-doc: format code_documentation', intent.expectedFormat === 'code_documentation');
  check('code-doc: profil code_documentation', plan.promptProfile === 'code_documentation');
  check('code-doc: tier strong', plan.preferredModelTier === 'strong');
  check('code-doc: temperature basse (0.15)', plan.temperatureHint === 0.15);
  const prompt = composeSystemPrompt({ intent, plan });
  check('code-doc: prompt contient bloc documentation', /Documentation de code|Code documentation:/i.test(prompt));
}

// 7septdecies. "Génère une JSDoc" ne doit PAS partir vers document_generation
// (collision potentielle avec le pattern generique "génère un/une ...").
{
  const { intent } = run('Peux-tu générer une JSDoc pour ce module ?');
  check('jsdoc-pas-document-generation: reste code_documentation', intent.primaryIntent === 'code_documentation');
}

// 7octodecies. Generation de tests garde priorite sur code_review quand les deux se chevauchent
{
  const { intent } = run('Corrige et génère des tests pour ce code :\n```js\nfunction div(a, b) { return a / b }\n```');
  check('test-gen-prioritaire-sur-code-review: intent test_generation', intent.primaryIntent === 'test_generation');
}

// 7novodecies. Formes infinitives francaises (bug trouve en tests manuels :
// le premier jet ne couvrait que l'imperatif "écris"/"génère", ratant les
// tournures tres courantes "peux-tu écrire..."/"j'aimerais générer...").
{
  const a = run('Peux-tu écrire des tests pour cette fonction ?\n```js\nfunction f(){}\n```');
  check('infinitif-ecrire: intent test_generation', a.intent.primaryIntent === 'test_generation');
  const b = run('J\'aimerais générer des tests pour cette fonction :\n```js\nfunction f(){}\n```');
  check('infinitif-generer: intent test_generation', b.intent.primaryIntent === 'test_generation');
  const c = run('Peux-tu documenter ce code :\n```js\nfunction f(){}\n```');
  check('infinitif-documenter: intent code_documentation', c.intent.primaryIntent === 'code_documentation');
}

// 7vicies. Autres formes infinitives manquantes trouvees par balayage manuel
// systematique sur les 5 regex de detection (revoir/trouver/relire/vérifier/
// analyser/sécuriser/auditer/accélérer/tester) — toutes deja deployees en
// prod pour codeReviewVerb (Phase 1) et securityAuditVerb (Phase 2), le bug
// dormait silencieusement depuis leur premier commit.
{
  const cases = [
    ['Peux-tu revoir ce code ?\n```js\nfunction f(){}\n```', 'code_review'],
    ['Peux-tu trouver les bugs dans ce code ?\n```js\nfunction f(){}\n```', 'code_review'],
    ['Peux-tu relire mon code ?\n```js\nfunction f(){}\n```', 'code_review'],
    ['Peux-tu vérifier mon code ?\n```js\nfunction f(){}\n```', 'code_review'],
    ['Peux-tu analyser ce code ?\n```js\nfunction f(){}\n```', 'code_review'],
    ['Peux-tu sécuriser mon site ?', 'security_audit'],
    ['Peux-tu auditer la sécurité de mon appli ?', 'security_audit'],
    ['Peux-tu accélérer cette fonction ?\n```js\nfunction f(){}\n```', 'performance_audit'],
    ['Peux-tu tester ce code ?\n```js\nfunction f(){}\n```', 'test_generation']
  ];
  for (const [msg, expected] of cases) {
    const { intent } = run(msg);
    check(`infinitif "${msg.slice(0, 40)}...": intent ${expected}`, intent.primaryIntent === expected);
  }
}

// 7unvicies. Analyse d'architecture (verbe dedie, pas besoin de bloc de code)
{
  const { intent, plan } = run('Analyse l\'architecture de ce projet : y a-t-il des dépendances circulaires ?');
  check('architecture: intent architecture_analysis', intent.primaryIntent === 'architecture_analysis');
  check('architecture: format architecture_report', intent.expectedFormat === 'architecture_report');
  check('architecture: requiresLongAnswer', intent.requiresLongAnswer === true);
  check('architecture: profil architecture_analysis', plan.promptProfile === 'architecture_analysis');
  check('architecture: tier strong', plan.preferredModelTier === 'strong');
  const prompt = composeSystemPrompt({ intent, plan });
  check('architecture: prompt contient bloc architecture', /Analyse d'architecture|Architecture analysis:/i.test(prompt));
}

// 7duovicies. "l'architecture" SANS espace apres l'apostrophe (bug trouve en
// test manuel : la regex exigeait a tort un espace apres l' pour la branche
// "analyse l'architecture", cassant l'elision francaise normale).
{
  const cas1 = run('Analyse l\'architecture de ce projet.');
  check('architecture-elision-analyse: intent architecture_analysis', cas1.intent.primaryIntent === 'architecture_analysis');
  const cas2 = run('Peux-tu analyser l\'architecture de ce projet ?');
  check('architecture-elision-analyser: intent architecture_analysis', cas2.intent.primaryIntent === 'architecture_analysis');
}

// 7trevicies. Assistance au debogage : stack trace reelle (sans verbe explicite)
{
  const { intent, plan } = run('TypeError: Cannot read property \'x\' of undefined\n    at foo (app.js:12:5)\n    at bar (app.js:20:3)');
  check('debug: intent debug_assistance', intent.primaryIntent === 'debug_assistance');
  check('debug: format debug_report', intent.expectedFormat === 'debug_report');
  check('debug: profil debug_assistance', plan.promptProfile === 'debug_assistance');
  check('debug: tier strong', plan.preferredModelTier === 'strong');
  check('debug: temperature basse (0.15)', plan.temperatureHint === 0.15);
  const prompt = composeSystemPrompt({ intent, plan });
  check('debug: prompt contient bloc debogage', /Assistance au débogage|Debug assistance:/i.test(prompt));
}

// 7quatervicies. Assistance au debogage : verbe explicite sans stack trace
{
  const { intent } = run('Pourquoi est-ce que ça plante quand je clique sur le bouton ?');
  check('debug-verbe-sans-trace: intent debug_assistance', intent.primaryIntent === 'debug_assistance');
}

// 7quinvicies. "bug"/"erreur" generiques SANS trace ni verbe de diagnostic
// explicite restent technical_help (pas de faux positif debug_assistance).
{
  const { intent } = run('Il y a un bug dans mon code, peux-tu regarder ?');
  check('bug-generique-sans-trace: reste technical_help', intent.primaryIntent === 'technical_help');
}

// 7sexvicies. Refactoring (bloc de code + verbe dedie)
{
  const { intent, plan } = run('Refactor ce code, rends-le plus lisible :\n```js\nfunction f(a,b){var x=a+b;return x}\n```');
  check('refactoring: intent refactoring', intent.primaryIntent === 'refactoring');
  check('refactoring: format refactored_code', intent.expectedFormat === 'refactored_code');
  check('refactoring: profil refactoring', plan.promptProfile === 'refactoring');
  check('refactoring: tier strong', plan.preferredModelTier === 'strong');
  check('refactoring: temperature basse (0.15)', plan.temperatureHint === 0.15);
  const prompt = composeSystemPrompt({ intent, plan });
  check('refactoring: prompt contient bloc refactoring', /Refactoring :|Refactoring:/i.test(prompt));
}

// 7septvicies. Refactoring SANS bloc de code -> ne declenche pas refactoring
{
  const { intent } = run('Peux-tu me parler des bonnes pratiques de refactoring en général ?');
  check('refactoring-sans-code: pas refactoring', intent.primaryIntent !== 'refactoring');
}

// 7octovicies. Verbes irreguliers "rendre"/"nettoyer" (bug trouve en test
// manuel : "rends+r" ne donne pas "rendre" (infinitif irregulier), et
// "nettoie+r" donne "nettoier" qui n'existe pas — le radical devient
// "nettoy-" a l'infinitif comme "employer"/"envoyer").
{
  const cas1 = run('Peux-tu rendre ce code plus lisible ?\n```js\nfunction f(a,b){return a+b}\n```');
  check('refactoring-rendre: intent refactoring', cas1.intent.primaryIntent === 'refactoring');
  const cas2 = run('Peux-tu nettoyer ce code ?\n```js\nfunction f(a,b){return a+b}\n```');
  check('refactoring-nettoyer: intent refactoring', cas2.intent.primaryIntent === 'refactoring');
}

// 7novovicies. Assistant Git (verbe dedie, sans bloc de code)
{
  const { intent, plan } = run('Écris un message de commit pour ces changements : ajout du dark mode.');
  check('git: intent git_assistant', intent.primaryIntent === 'git_assistant');
  check('git: format git_output', intent.expectedFormat === 'git_output');
  check('git: profil git_assistant', plan.promptProfile === 'git_assistant');
  check('git: tier PAS force strong (balanced)', plan.preferredModelTier === 'balanced');
  check('git: temperature moderee (0.3)', plan.temperatureHint === 0.3);
  const prompt = composeSystemPrompt({ intent, plan });
  check('git: prompt contient bloc assistant git', /Assistant Git :|Git assistant:/i.test(prompt));
}

// 7trigies. Nom de branche / description de PR / changelog
{
  const b = run('Quel nom de branche pour cette fonctionnalité de dark mode ?');
  check('git-branche: intent git_assistant', b.intent.primaryIntent === 'git_assistant');
  const c = run('Écris une description de PR pour ces changements.');
  check('git-pr: intent git_assistant', c.intent.primaryIntent === 'git_assistant');
  const d = run('Generate a changelog for this release.');
  check('git-changelog: intent git_assistant', d.intent.primaryIntent === 'git_assistant');
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
