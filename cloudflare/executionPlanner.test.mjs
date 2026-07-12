// Tests Execution Planner (Lot 10) — module pur, sans reseau.
// node cloudflare/executionPlanner.test.mjs

import {
  buildExecutionIntent,
  resolveExecutionPlan,
  buildExecutionPolicy,
  isExecutionPlannerEnabled,
  planExecution
} from './executionPlanner.js';

import { planExecution as planCapabilities } from './capabilityPlanner.js';
import { planSourceUsage } from './sourcePlanner.js';

let failures = 0;
function check(label, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok  : ${label}`);
  }
}

function run(userMessage, opts = {}) {
  const capabilityPlan = planCapabilities({ userMessage, ...opts.capabilityInput });
  const sourcePlan = planSourceUsage({ userMessage, ...opts.sourceInput });
  return planExecution({ userMessage, language: 'fr', capabilityPlan, sourcePlan, ...opts.executionInput });
}

// ── 1. Question courte ("Bonjour") ───────────────────────────────────────
{
  const r = run('Bonjour');
  check('1. Bonjour: modelMode/preferredModelTier fast', r.plan.preferredModelTier === 'fast');
  check('1. Bonjour: useWeb false', r.plan.useWeb === false);
  check('1. Bonjour: useRag false', r.plan.useRag === false);
  check('1. Bonjour: preferredMaxTokens 1200', r.plan.preferredMaxTokens === 1200);
  check('1. Bonjour: answerMode short', r.intent.answerMode === 'short');
}

// ── 2. Question simple ───────────────────────────────────────────────────
{
  const r = run('Qui es-tu ? Réponds en trois phrases.');
  check('2. qui es-tu: preferredModelTier fast', r.plan.preferredModelTier === 'fast');
  check('2. qui es-tu: answerMode short', r.intent.answerMode === 'short');
  check('2. qui es-tu: useWeb false', r.plan.useWeb === false);
}

// ── 3. Comparaison technique avec sources ────────────────────────────────
{
  const r = run('Compare Cloudflare Vectorize et un RAG navigateur dans un tableau avec sources.');
  check('3. comparaison: answerMode structured ou source_grounded', ['structured', 'source_grounded'].includes(r.intent.answerMode));
  check('3. comparaison: requireCitations true', r.plan.requireCitations === true);
  check('3. comparaison: useWeb ou useRag actif', r.plan.useWeb === true || r.plan.useRag === true);
  check('3. comparaison: tier balanced/strong', ['balanced', 'strong'].includes(r.plan.preferredModelTier));
}

// ── 4. Question actuelle (cours Nvidia) ──────────────────────────────────
{
  const r = run('Quel est le cours actuel de Nvidia ?');
  check('4. cours nvidia: useWeb true', r.plan.useWeb === true);
  check('4. cours nvidia: requireFreshSources true', r.plan.requireFreshSources === true);
  check('4. cours nvidia: requireCitations true', r.plan.requireCitations === true);
  check('4. cours nvidia: forbidUnsupportedNumbers true', r.plan.forbidUnsupportedNumbers === true);
}

// ── 5. Document long (guide Crète) ───────────────────────────────────────
{
  const r = run("Rédige un guide professionnel complet sur deux semaines en Crète avec tableau, checklist et sources.");
  check('5. guide crete: answerMode long_document', r.intent.answerMode === 'long_document');
  check('5. guide crete: useWeb ou useRag actif', r.plan.useWeb === true || r.plan.useRag === true);
  check('5. guide crete: preferredMaxTokens >= 3200', r.plan.preferredMaxTokens >= 3200);
  check('5. guide crete: useCompletionGuard true', r.plan.useCompletionGuard === true);
}

// ── 6. Question projet ───────────────────────────────────────────────────
{
  const r = run("Dans mon projet Digital Blue Skye, explique l'architecture RAG.", {
    sourceInput: { hasProjectDocuments: true }
  });
  check('6. projet RAG: useRag true', r.plan.useRag === true);
}

// ── 7. Traduction ─────────────────────────────────────────────────────────
{
  const r = run('Traduis ce texte en anglais.');
  check('7. traduction: requiresSources false ou no source', r.intent.requiresSources === false || r.intent.evidenceMode === 'none');
  check('7. traduction: tier fast/balanced', ['fast', 'balanced'].includes(r.plan.preferredModelTier));
  check('7. traduction: outputMode plain/markdown', ['plain', 'markdown'].includes(r.intent.outputMode));
}

// ── 8. Reformulation ──────────────────────────────────────────────────────
{
  const r = run('Réécris ce paragraphe de manière professionnelle.');
  check('8. reformulation: useWeb false', r.plan.useWeb === false);
  check('8. reformulation: useRag false', r.plan.useRag === false);
  check('8. reformulation: requireCitations false', r.plan.requireCitations === false);
}

// ── 9. Demande vague avec chiffres ────────────────────────────────────────
{
  const r = run('Compare les meilleurs outils et donne les prix.');
  check('9. demande vague: clarification ou web', r.intent.evidenceMode === 'clarification' || r.intent.evidenceMode === 'web');
}

// ── 10. Cas conflictuel : Capability=fast, Source=web_required/critical ──
{
  const r = run('Quel est le prix actuel et les quotas de cette API ?', {
    capabilityInput: {},
  });
  check('10. conflit: Source Planner gagne sur useWeb', r.plan.useWeb === true);
  check('10. conflit: tier au moins balanced (jamais fast en mandatory/critical)', ['balanced', 'strong'].includes(r.plan.preferredModelTier));
}

// ── 11. Cas long document : Source optional, Capability long/export ──────
{
  const r = run('Rédige un document complet et détaillé avec export PDF de ce rapport.');
  check('11. long+export: answerMode long_document', r.intent.answerMode === 'long_document');
  check('11. long+export: preferredMaxTokens >= 3200 (priorite Capability)', r.plan.preferredMaxTokens >= 3200);
  check('11. long+export: exportPolicy export_ready', r.plan.exportPolicy === 'export_ready');
}

// ── 12. Flag off ──────────────────────────────────────────────────────────
{
  check('12. flag off (env vide)', isExecutionPlannerEnabled({}) === false);
  check('12. flag off (explicite false)', isExecutionPlannerEnabled({ EXECUTION_PLANNER_ENABLED: 'false' }) === false);
}

// ── 13. Flag true ─────────────────────────────────────────────────────────
{
  check('13. flag true', isExecutionPlannerEnabled({ EXECUTION_PLANNER_ENABLED: 'true' }) === true);
  check('13. flag true insensible a la casse', isExecutionPlannerEnabled({ EXECUTION_PLANNER_ENABLED: 'TRUE' }) === true);
}

// ── 14. Determinisme ──────────────────────────────────────────────────────
{
  const input = { userMessage: 'Compare Cloudflare Vectorize et un RAG navigateur avec des chiffres precis et des sources.' };
  const r1 = run(input.userMessage);
  const r2 = run(input.userMessage);
  check('14. determinisme: deux appels identiques -> meme resultat', JSON.stringify(r1) === JSON.stringify(r2));
}

// ── Structure : toutes les cles attendues sont presentes ────────────────
{
  const intent = buildExecutionIntent({ userMessage: 'Test de structure complet avec un tableau.' });
  check('structure: buildExecutionIntent retourne toutes les cles', [
    'primaryGoal', 'answerMode', 'evidenceMode', 'modelMode', 'outputMode', 'riskLevel',
    'complexity', 'expectedLength', 'requiresSources', 'requiresRag', 'requiresWeb',
    'requiresTable', 'requiresExport', 'requiresLongAnswer', 'requiresClarification',
    'confidence', 'reasons'
  ].every((key) => key in intent));

  const plan = resolveExecutionPlan({ intent });
  check('structure: resolveExecutionPlan retourne toutes les cles', [
    'useCapabilityPlanner', 'useSourcePlanner', 'usePromptOrchestrator', 'useRag', 'useWeb',
    'forceRag', 'forceWeb', 'useProjectMemory', 'useConversationHistory', 'useCompletionGuard',
    'useResponseQuality', 'useMarkdownRenderer', 'requireCitations', 'forbidFabricatedSources',
    'forbidUnsupportedNumbers', 'requireOfficialSources', 'requireFreshSources',
    'preferredModelTier', 'preferredMaxTokens', 'temperature', 'maxContinuations',
    'rqcStrictness', 'exportPolicy', 'fallbackBehavior', 'clarificationBehavior',
    'pipeline', 'confidence', 'reasons'
  ].every((key) => key in plan));

  const policy = buildExecutionPolicy({ intent, plan, language: 'fr' });
  check('structure: buildExecutionPolicy retourne toutes les cles', [
    'policyText', 'promptDirectives', 'sourceDirectives', 'outputDirectives', 'qualityDirectives', 'fallbackDirectives'
  ].every((key) => key in policy));
}

// ── Regle 4 : citations exigees + aucune source -> pas d'invention ───────
{
  const intent = buildExecutionIntent({ userMessage: 'Donne-moi des chiffres precis avec sources.' });
  const sourcePlan = { evidence: { evidenceNeed: 'mandatory', sourceRequirement: 'web_required' }, plan: { requireCitations: true, useWeb: false, useRag: false, forbidFabricatedSources: true, forbidUnsupportedNumbers: true, fallbackBehavior: 'answer_normally' } };
  const plan = resolveExecutionPlan({ intent, sourcePlan });
  check("regle 4: pas de sources dispo + citations requises -> fallback non-'answer_normally'", plan.fallbackBehavior !== 'answer_normally');
  check('regle 4: fallbackBehavior use_available_sources_only ou ask_clarification', ['use_available_sources_only', 'ask_clarification'].includes(plan.fallbackBehavior));
}

// ── Pipeline coherent ──────────────────────────────────────────────────────
{
  const r = run('Bonjour');
  check('pipeline: commence par Execution Planner', r.plan.pipeline[0] === 'Execution Planner');
  check('pipeline: contient Model Router', r.plan.pipeline.includes('Model Router'));
  check('pipeline: ne contient pas Tavily pour un message simple', !r.plan.pipeline.includes('Tavily'));
}

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} test(s) ECHOUE(S)`);
process.exit(failures === 0 ? 0 : 1);
