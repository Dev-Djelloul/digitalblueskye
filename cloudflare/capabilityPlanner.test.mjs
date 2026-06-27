// Tests Capability Planner (Lot 8) — module pur, sans reseau.
// node cloudflare/capabilityPlanner.test.mjs

import {
  detectCapabilities,
  planCapabilities,
  buildExecutionPlan,
  isCapabilityPlannerEnabled,
  planExecution
} from './capabilityPlanner.js';

let failures = 0;
function check(label, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok  : ${label}`);
  }
}

// ── 1. Question courte ──────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'C\'est quoi le SEO ?' });
  check('question courte: complexity low ou medium (jamais high)', caps.complexity !== 'high');
  check('question courte: needsLongAnswer false', caps.needsLongAnswer === false);
  check('question courte: reasons.complexity rempli', Array.isArray(caps.reasons.complexity) && caps.reasons.complexity.length > 0);
  const plan = planCapabilities(caps, {});
  check('question courte: tier pas force a strong', plan.preferredModelTier !== 'strong' || caps.complexity === 'high');
}

// ── 2. Document long ────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Rédige un rapport complet et détaillé sur la transition energétique.' });
  check('document long: needsLongAnswer true', caps.needsLongAnswer === true);
  check('document long: complexity high', caps.complexity === 'high');
  check('document long: needsMarkdown true', caps.needsMarkdown === true);
  const plan = planCapabilities(caps, {});
  check('document long: useCompletionGuard true', plan.useCompletionGuard === true);
  check('document long: preferredMaxTokens eleve', plan.preferredMaxTokens >= 1100);
  const exec = buildExecutionPlan(caps, plan);
  check('document long: expectedAnswerLength long', exec.expectedAnswerLength === 'long');
}

// ── 3. Comparaison ──────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Compare React vs Vue pour un projet d\'entreprise.' });
  check('comparaison: needsComparison true', caps.needsComparison === true);
  check('comparaison: needsTable true', caps.needsTable === true);
  check('comparaison: reasons.needsTable explique', caps.reasons.needsTable.includes('comparison_implies_table'));
}

// ── 4. Traduction ───────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Traduis ce texte en anglais : Bonjour le monde.' });
  check('traduction: needsTranslation true', caps.needsTranslation === true);
}

// ── 5. Génération de code ───────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Écris une fonction Python qui trie une liste.' });
  check('code: needsCode true', caps.needsCode === true);
  const plan = planCapabilities(caps, {});
  check('code: temperature basse', plan.temperature <= 0.2);
  check('code: tier strong', plan.preferredModelTier === 'strong');
}

// ── 6. Plan d'action ────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Quelles sont les prochaines étapes pour lancer mon produit ?' });
  check('plan d\'action: needsPlanning true', caps.needsPlanning === true);
}

// ── 7. RAG ───────────────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Que dit le projet sur le budget ?', hasRagSources: true });
  check('RAG: needsRag true', caps.needsRag === true);
  check('RAG: needsSources true', caps.needsSources === true);
  const plan = planCapabilities(caps, { ragAvailable: true });
  check('RAG: useRag true quand disponible', plan.useRag === true);
  const planUnavailable = planCapabilities(caps, { ragAvailable: false });
  check('RAG: useRag false si indisponible', planUnavailable.useRag === false);
}

// ── 8. Recherche web ────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Quel est le cours actuel du Bitcoin aujourd\'hui ?' });
  check('web: needsWeb true', caps.needsWeb === true);
  const plan = planCapabilities(caps, { webAvailable: true });
  check('web: useWeb true', plan.useWeb === true);
  const exec = buildExecutionPlan(caps, plan);
  check('web: pipeline contient Tavily', exec.pipeline.includes('Tavily'));
  check('web: latence superieure au cas de base', exec.estimatedLatency > 1500);
}

// ── 9. Export ────────────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Génère-moi un export PDF de ce rapport.' });
  check('export: needsExport true', caps.needsExport === true);
  const plan = planCapabilities(caps, {});
  check('export: allowExports true', plan.allowExports === true);
  check('export: allowPdf true', plan.allowPdf === true);
  check('export: useCompletionGuard true', plan.useCompletionGuard === true);
}

// ── 10. Tableau ──────────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Présente ça sous forme de tableau avec les colonnes prix et date.' });
  check('tableau: needsTable true', caps.needsTable === true);
  check('tableau: needsMarkdown true', caps.needsMarkdown === true);
}

// ── 11. Chronologie ──────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Fais-moi la chronologie complète du projet depuis son lancement.' });
  check('chronologie: needsTimeline true', caps.needsTimeline === true);
  check('chronologie: needsLongAnswer true (timeline implique long)', caps.needsLongAnswer === true);
}

// ── 12. Résumé ───────────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Résume-moi ce document en quelques points clés.' });
  check('resume: needsSummarization true', caps.needsSummarization === true);
}

// ── 13. Calcul ───────────────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Calcule le ROI si on investit 10000 euros à 5% par an.' });
  check('calcul: needsCalculations true', caps.needsCalculations === true);
  check('calcul: needsReasoning true (calcul implique raisonnement)', caps.needsReasoning === true);
  const plan = planCapabilities(caps, {});
  check('calcul: reasoningEffort high', plan.reasoningEffort === 'high');
}

// ── 14. Question ambiguë ─────────────────────────────────────────────────
{
  const caps = detectCapabilities({ userMessage: '' });
  check('ambigue/vide: confidence basse', caps.confidence <= 0.2);
  check('ambigue/vide: complexity low', caps.complexity === 'low');
  const caps2 = detectCapabilities({ userMessage: 'ok' });
  check('ambigue courte: confidence basse', caps2.confidence <= 0.5);
}

// ── Historique de conversation / mémoire projet ─────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Et ensuite ?', history: [{ role: 'user', content: 'hello' }] });
  check('historique: needsConversationHistory true', caps.needsConversationHistory === true);

  const capsMem = detectCapabilities({ userMessage: 'Continue', projectMemory: 'Le projet X vise a...' });
  check('memoire projet: needsProjectMemory true', capsMem.needsProjectMemory === true);
}

// ── buildExecutionPlan : pipeline coherent ──────────────────────────────
{
  const caps = detectCapabilities({ userMessage: 'Bonjour' });
  const plan = planCapabilities(caps, {});
  const exec = buildExecutionPlan(caps, plan);
  check('pipeline: contient toujours Capability Planner', exec.pipeline[0] === 'Capability Planner');
  check('pipeline: contient toujours Model Router', exec.pipeline.includes('Model Router'));
  check('pipeline: ne contient pas RAG si non requis', !exec.pipeline.includes('RAG'));
  check('pipeline: ne contient pas Tavily si non requis', !exec.pipeline.includes('Tavily'));
}

// ── planExecution : convenience tout-en-un ──────────────────────────────
{
  const result = planExecution({ userMessage: 'Compare les offres A et B dans un tableau.' });
  check('planExecution: retourne capabilities/plan/executionPlan', Boolean(result.capabilities && result.plan && result.executionPlan));
  check('planExecution: coherence needsTable -> pipeline', result.capabilities.needsTable === true);
}

// ── isCapabilityPlannerEnabled : flag-gating ────────────────────────────
{
  check('flag: defaut desactive (env vide)', isCapabilityPlannerEnabled({}) === false);
  check('flag: desactive explicitement', isCapabilityPlannerEnabled({ CAPABILITY_PLANNER_ENABLED: 'false' }) === false);
  check('flag: active explicitement', isCapabilityPlannerEnabled({ CAPABILITY_PLANNER_ENABLED: 'true' }) === true);
  check('flag: insensible a la casse', isCapabilityPlannerEnabled({ CAPABILITY_PLANNER_ENABLED: 'TRUE' }) === true);
}

// ── Determinisme : meme input -> meme output (rejouable) ────────────────
{
  const input = { userMessage: 'Analyse comparative des architectures avec un tableau et des sources.', hasRagSources: true };
  const r1 = planExecution(input);
  const r2 = planExecution(input);
  check('determinisme: deux appels identiques produisent le meme resultat', JSON.stringify(r1) === JSON.stringify(r2));
}

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} test(s) ECHOUE(S)`);
process.exit(failures === 0 ? 0 : 1);
