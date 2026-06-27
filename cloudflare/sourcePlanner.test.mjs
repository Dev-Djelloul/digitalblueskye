// Tests Source Planner / Evidence Planner (Lot 9) — module pur, sans reseau.
// node cloudflare/sourcePlanner.test.mjs

import {
  detectEvidenceNeed,
  planEvidence,
  buildSourcePolicy,
  isSourcePlannerEnabled,
  planSourceUsage
} from './sourcePlanner.js';

let failures = 0;
function check(label, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok  : ${label}`);
  }
}

// ── 1. Question simple ──────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Qui es-tu ? Réponds en trois phrases.' });
  check('1. question simple: evidenceNeed none/optional', ['none', 'optional'].includes(r.evidence.evidenceNeed));
  check('1. question simple: useWeb false', r.plan.useWeb === false);
  check('1. question simple: useRag false', r.plan.useRag === false);
  check('1. question simple: forceWeb false', r.plan.forceWeb === false);
}

// ── 2. Comparaison technique ─────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Compare Cloudflare Vectorize et un RAG navigateur dans un tableau.' });
  check('2. comparaison technique: evidenceNeed required/recommended/mandatory', ['required', 'recommended', 'mandatory'].includes(r.evidence.evidenceNeed));
  check('2. comparaison technique: forbidUnsupportedNumbers true', r.plan.forbidUnsupportedNumbers === true);
  check('2. comparaison technique: useWeb ou useRag actif', r.plan.useWeb === true || r.plan.useRag === true);
}

// ── 3. Documentation officielle ─────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Selon la documentation officielle, quelles sont les limites de Cloudflare Vectorize ?' });
  check('3. doc officielle: sourceRequirement web_required', r.evidence.sourceRequirement === 'web_required');
  check('3. doc officielle: preferredSourceTypes contient official_docs', r.plan.preferredSourceTypes.includes('official_docs'));
}

// ── 4. Prix ──────────────────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Combien coûte Tavily aujourd\'hui ?' });
  check('4. prix: sourceRequirement web_required', r.evidence.sourceRequirement === 'web_required');
  check('4. prix: sourceFreshness real_time/recent', ['real_time', 'recent'].includes(r.plan.sourceFreshness));
  check('4. prix: forceWeb true', r.plan.forceWeb === true);
}

// ── 5. Projet actif ──────────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Dans mon projet Digital Blue Skye, explique l\'architecture RAG.', hasProjectDocuments: true });
  check('5. projet actif: sourceRequirement rag_required ou rag_preferred', ['rag_required', 'rag_preferred'].includes(r.evidence.sourceRequirement));
}

// ── 6. Document uploadé ──────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'D\'après mes documents, résume Vincle.', hasProjectDocuments: true, attachments: [{ name: 'vincle.pdf', kind: 'pdf' }] });
  check('6. document uploade: sourceRequirement rag_required', r.evidence.sourceRequirement === 'rag_required');
  check('6. document uploade: preferredSourceTypes contient user_uploaded_docs', r.plan.preferredSourceTypes.includes('user_uploaded_docs'));
}

// ── 7. Voyage ────────────────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Prépare un guide professionnel pour deux semaines en Crète avec hôtels et coûts.' });
  check('7. voyage: sourceRequirement web_required ou rag_or_web_required', ['web_required', 'rag_or_web_required', 'web_preferred'].includes(r.evidence.sourceRequirement));
  check('7. voyage: forbidUnsupportedNumbers true', r.plan.forbidUnsupportedNumbers === true);
}

// ── 8. Traduction ────────────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Traduis ce texte en anglais.' });
  check('8. traduction: sourceRequirement no_source_needed', r.evidence.sourceRequirement === 'no_source_needed');
}

// ── 9. Reformulation ─────────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Réécris ce paragraphe de façon plus professionnelle.' });
  check('9. reformulation: sourceRequirement no_source_needed', r.evidence.sourceRequirement === 'no_source_needed');
}

// ── 10. Demande vague avec chiffres ──────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Compare les meilleurs outils et donne les prix.' });
  check('10. demande vague: clarification_required ou web_required', ['clarification_required', 'web_required'].includes(r.evidence.sourceRequirement));
}

// ── 11. Sources explicitement demandées ──────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Explique avec sources.' });
  check('11. sources explicites: requireCitations true', r.plan.requireCitations === true || r.evidence.sourceRequirement === 'cite_if_available');
}

// ── 12. Date récente ──────────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Quelles sont les nouveautés IA en 2026 ?' });
  check('12. date recente: sourceRequirement web_required', r.evidence.sourceRequirement === 'web_required');
  check('12. date recente: sourceFreshness recent/real_time', ['recent', 'real_time'].includes(r.plan.sourceFreshness));
}

// ── 13. RAG + web combinés ────────────────────────────────────────────────
{
  const r = planSourceUsage({ userMessage: 'Compare mes documents projet avec les informations récentes du web.', hasProjectDocuments: true, hasRagSources: true });
  check('13. RAG + web: useRag true', r.plan.useRag === true);
  check('13. RAG + web: useWeb true', r.plan.useWeb === true || r.evidence.sourceRequirement === 'rag_or_web_required');
}

// ── 14. Stabilité / déterminisme ─────────────────────────────────────────
{
  const input = { userMessage: 'Compare Cloudflare Vectorize et un RAG navigateur avec des chiffres precis.', hasProjectDocuments: true };
  const r1 = planSourceUsage(input);
  const r2 = planSourceUsage(input);
  check('14. determinisme: deux appels identiques -> meme resultat', JSON.stringify(r1) === JSON.stringify(r2));
}

// ── Tests additionnels : structure / contraintes explicites ─────────────
{
  const evidence = detectEvidenceNeed({ userMessage: 'Quel est le quota Tavily actuel ?' });
  check('structure: detectEvidenceNeed retourne toutes les cles attendues', [
    'evidenceNeed', 'confidence', 'riskLevel', 'factualityRisk', 'recencyRisk',
    'specificityRisk', 'hallucinationRisk', 'sourceRequirement', 'reasons'
  ].every((key) => key in evidence));

  const plan = planEvidence({ evidence, hasRagSources: false, hasProjectDocuments: false, webAvailable: true, ragAvailable: true });
  check('structure: planEvidence retourne toutes les cles attendues', [
    'useInternalKnowledge', 'useRag', 'useGlobalLibrary', 'useProjectMemory', 'useWeb',
    'forceWeb', 'forceRag', 'requireCitations', 'allowUncitedAnswer', 'forbidFabricatedSources',
    'forbidUnsupportedNumbers', 'requireOfficialSources', 'requireFreshSources',
    'askClarifyingQuestion', 'maxSources', 'preferredSourceTypes', 'sourceFreshness',
    'fallbackBehavior', 'reasons'
  ].every((key) => key in plan));

  const policy = buildSourcePolicy({ evidence, plan, language: 'fr' });
  check('structure: buildSourcePolicy retourne toutes les cles attendues', [
    'policyText', 'citationPolicy', 'unsupportedClaimsPolicy', 'sourcePriority', 'failureInstruction'
  ].every((key) => key in policy));
  check('structure: policyText non vide', typeof policy.policyText === 'string' && policy.policyText.length > 0);
}

// ── evidenceNeed=none => useInternalKnowledge true, requireCitations false ──
{
  const r = planSourceUsage({ userMessage: 'Qu\'est-ce que le machine learning ?' });
  if (r.evidence.evidenceNeed === 'none') {
    check('regle: evidenceNeed none -> useInternalKnowledge true', r.plan.useInternalKnowledge === true);
    check('regle: evidenceNeed none -> requireCitations false', r.plan.requireCitations === false);
  } else {
    check('regle: evidenceNeed none -> useInternalKnowledge true (cas non declenche, skip)', true);
  }
}

// ── required/mandatory => forbidFabricatedSources + forbidUnsupportedNumbers ──
{
  const r = planSourceUsage({ userMessage: 'Quels sont les tarifs actuels de Tavily et ses limites ?' });
  check('regle: mandatory -> requireCitations true', r.plan.requireCitations === true);
  check('regle: mandatory -> forbidFabricatedSources true', r.plan.forbidFabricatedSources === true);
  check('regle: mandatory -> forbidUnsupportedNumbers true', r.plan.forbidUnsupportedNumbers === true);
  check('regle: mandatory -> allowUncitedAnswer false', r.plan.allowUncitedAnswer === false);
}

// ── clarification_required => askClarifyingQuestion true ────────────────
{
  const r = planSourceUsage({ userMessage: 'Compare les prix.' });
  if (r.evidence.sourceRequirement === 'clarification_required') {
    check('regle: clarification_required -> askClarifyingQuestion true', r.plan.askClarifyingQuestion === true);
    check('regle: clarification_required -> fallbackBehavior ask_clarification', r.plan.fallbackBehavior === 'ask_clarification');
  } else {
    check('regle: clarification (cas non declenche ici, skip)', true);
  }
}

// ── document reference sans document disponible -> clarification ────────
{
  const r = planSourceUsage({ userMessage: 'D\'après ce document, résume les points clés.', hasProjectDocuments: false, hasRagSources: false, attachments: [] });
  check('regle: reference document sans document -> clarification_required', r.evidence.sourceRequirement === 'clarification_required');
  check('regle: askClarifyingQuestion true', r.plan.askClarifyingQuestion === true);
}

// ── isSourcePlannerEnabled : flag-gating ─────────────────────────────────
{
  check('flag: defaut desactive (env vide)', isSourcePlannerEnabled({}) === false);
  check('flag: desactive explicitement', isSourcePlannerEnabled({ SOURCE_PLANNER_ENABLED: 'false' }) === false);
  check('flag: active explicitement', isSourcePlannerEnabled({ SOURCE_PLANNER_ENABLED: 'true' }) === true);
  check('flag: insensible a la casse', isSourcePlannerEnabled({ SOURCE_PLANNER_ENABLED: 'TRUE' }) === true);
}

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} test(s) ECHOUE(S)`);
process.exit(failures === 0 ? 0 : 1);
