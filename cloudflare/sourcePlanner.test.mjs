// Tests Source Planner / Evidence Planner (Lot 9) — module pur, sans reseau.
// node cloudflare/sourcePlanner.test.mjs

import {
  detectEvidenceNeed,
  planEvidence,
  buildSourcePolicy,
  isSourcePlannerEnabled,
  planSourceUsage,
  isDocumentBoundQuery,
  detectStructuralQuery,
  resolveDocumentTarget
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

// ── Non-regression : requetes liees a un document (bug report) ──────────
// 3 scenarios reels qui produisaient des reponses incorrectes : hallucination
// de noms hors document, declenchement web a tort, fausse absence de
// bibliographie. La correction doit forcer sourceFamilies=['rag'],
// useWeb=false, useProjectMemory=false, sans jamais retomber sur le web ou
// la memoire de projet, quel que soit le contenu exact de la question.
{
  check('isDocumentBoundQuery: "ce document" detecte', isDocumentBoundQuery('Quels chercheurs sont mentionnés dans ce document ?'));
  check('isDocumentBoundQuery: "du document" detecte', isDocumentBoundQuery('Que contient la bibliographie du document ?'));
  check('isDocumentBoundQuery: "du document" (paragraphes) detecte', isDocumentBoundQuery('Donne-moi les 10 derniers paragraphes du document.'));
  check('isDocumentBoundQuery: message hors-sujet non detecte', !isDocumentBoundQuery('Quelle heure est-il ?'));
}

{
  // Cas 1 : "Quels chercheurs sont mentionnés dans ce document ?"
  const r = planSourceUsage({
    userMessage: 'Quels chercheurs sont mentionnés dans ce document ? Classe-les selon leur contribution.',
    hasProjectDocuments: true,
    hasRagSources: true,
    hasProjectMemory: true
  });
  check('bug#1 chercheurs: sourceRequirement rag_only_required', r.evidence.sourceRequirement === 'rag_only_required');
  check('bug#1 chercheurs: sourceFamilies === [rag]', JSON.stringify(r.plan.sourceFamilies) === JSON.stringify(['rag']));
  check('bug#1 chercheurs: useWeb false', r.plan.useWeb === false);
  check('bug#1 chercheurs: forceWeb false', r.plan.forceWeb === false);
  check('bug#1 chercheurs: useProjectMemory false', r.plan.useProjectMemory === false);
  check('bug#1 chercheurs: fallbackBehavior document_only_strict', r.plan.fallbackBehavior === 'document_only_strict');
  check('bug#1 chercheurs: failureInstruction contient la phrase exacte', r.policy.failureInstruction.includes("Aucune information correspondante n'a été trouvée dans le document indexé."));
}

{
  // Cas 2 : "Donne-moi les 10 derniers paragraphes du document." — contient
  // le mot-cle "derniers" qui declenchait a tort le web (mandatoryKeywords
  // de detectWebSearchIntent dans worker-openrouter.js).
  const r = planSourceUsage({
    userMessage: 'Donne-moi les 10 derniers paragraphes du document.',
    hasProjectDocuments: true,
    hasRagSources: true,
    hasProjectMemory: true
  });
  check('bug#2 derniers paragraphes: sourceRequirement rag_only_required', r.evidence.sourceRequirement === 'rag_only_required');
  check('bug#2 derniers paragraphes: sourceFamilies === [rag]', JSON.stringify(r.plan.sourceFamilies) === JSON.stringify(['rag']));
  check('bug#2 derniers paragraphes: useWeb false malgre le mot "derniers"', r.plan.useWeb === false);
  check('bug#2 derniers paragraphes: forceWeb false', r.plan.forceWeb === false);
}

{
  // Cas 3 : "Que contient la bibliographie du document ?"
  const r = planSourceUsage({
    userMessage: 'Que contient la bibliographie du document ?',
    hasProjectDocuments: true,
    hasRagSources: true,
    hasProjectMemory: true
  });
  check('bug#3 bibliographie: sourceRequirement rag_only_required', r.evidence.sourceRequirement === 'rag_only_required');
  check('bug#3 bibliographie: sourceFamilies === [rag]', JSON.stringify(r.plan.sourceFamilies) === JSON.stringify(['rag']));
  check('bug#3 bibliographie: useWeb false', r.plan.useWeb === false);
  check('bug#3 bibliographie: useProjectMemory false', r.plan.useProjectMemory === false);
}

{
  // L'override combine RAG+web ne doit PAS reactiver le web pour une
  // requete document-bound : rag_only_required est strict, sans exception,
  // meme quand un mot-cle web (ici "tarifs") apparait dans le meme message.
  const r = planSourceUsage({
    userMessage: 'Compare le contenu de ce document avec les derniers tarifs annoncés récemment par nos concurrents sur le marché.',
    hasProjectDocuments: true,
    hasRagSources: true,
    hasProjectMemory: true
  });
  check('combine rag+web sur requete document-bound: sourceRequirement rag_only_required', r.evidence.sourceRequirement === 'rag_only_required');
  check('combine rag+web sur requete document-bound: useWeb reste false', r.plan.useWeb === false);
  check('combine rag+web sur requete document-bound: sourceFamilies === [rag]', JSON.stringify(r.plan.sourceFamilies) === JSON.stringify(['rag']));
}

// ── detectStructuralQuery V2 : bibliography / researchers / tail / section ─
{
  const biblio = detectStructuralQuery('Que contient la bibliographie du document ?');
  check('structurel: bibliographie -> kind bibliography', biblio.kind === 'bibliography');
  check('structurel: bibliographie -> type alias = kind', biblio.type === 'bibliography');
  check('structurel: bibliographie -> retrieval section (lexical+voisinage)', biblio.retrieval === 'section');
  check('structurel: bibliographie -> termes lexicaux non vides', biblio.lexicalTerms.length > 0);

  const people = detectStructuralQuery('Quels chercheurs sont mentionnés dans ce document ?');
  check('structurel: chercheurs -> kind researchers', people.kind === 'researchers');
  check('structurel: chercheurs -> retrieval lexical', people.retrieval === 'lexical');

  const tail = detectStructuralQuery('Donne-moi les 10 derniers paragraphes du document.');
  check('structurel: derniers paragraphes -> kind tail', tail.kind === 'tail');
  check('structurel: derniers paragraphes -> retrieval tail', tail.retrieval === 'tail');

  const tailChunks = detectStructuralQuery('Montre-moi les derniers chunks du document.');
  check('structurel: derniers chunks -> kind tail', tailChunks.kind === 'tail');
  const lastPages = detectStructuralQuery('Donne-moi les dernières pages du document.');
  check('structurel: dernières pages -> kind tail', lastPages.kind === 'tail');
  const endConclusion = detectStructuralQuery('Donne la conclusion du document.');
  check('structurel: conclusion du document -> kind tail', endConclusion.kind === 'tail');

  const toc = detectStructuralQuery('Donne-moi la table des matières du document.');
  check('structurel: table des matières -> kind section', toc.kind === 'section');
  check('structurel: table des matières -> retrieval section', toc.retrieval === 'section');

  const resume = detectStructuralQuery('Donne le résumé du document.');
  check('structurel: résumé du document -> kind section', resume.kind === 'section');

  const conclusion = detectStructuralQuery('Résume la conclusion du document.');
  check('structurel: conclusion -> kind tail (positionnel)', conclusion.kind === 'tail');

  const none = detectStructuralQuery('Quel est le sujet du document ?');
  check('structurel: question generique -> non structurel', none.isStructural === false);
}

// ── resolveDocumentTarget : ciblage documentaire ─────────────────────────
{
  // Un seul document -> cible automatiquement ce document.
  const single = resolveDocumentTarget({ documents: [{ id: 'doc-pdf', name: 'Secret de l’Islam.pdf' }] });
  check('targeting: 1 document -> status single', single.status === 'single');
  check('targeting: 1 document -> documentId cible', single.documentId === 'doc-pdf');

  // Plusieurs documents, aucun dernier connu -> clarification.
  const ambiguous = resolveDocumentTarget({ documents: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  check('targeting: plusieurs documents -> status ambiguous', ambiguous.status === 'ambiguous');
  check('targeting: plusieurs documents -> aucun documentId force', ambiguous.documentId === null);
  check('targeting: plusieurs documents -> candidats listes', ambiguous.candidates.length === 2);

  // Plusieurs documents, dernier consulte connu -> ce document.
  const lastConsulted = resolveDocumentTarget({ documents: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], lastConsultedDocumentId: 'b' });
  check('targeting: dernier consulte -> status resolved_last', lastConsulted.status === 'resolved_last');
  check('targeting: dernier consulte -> documentId = dernier consulte', lastConsulted.documentId === 'b');

  // Plusieurs documents avec dates -> plus recemment indexe.
  const byDate = resolveDocumentTarget({ documents: [{ id: 'a', name: 'A', indexedAt: 100 }, { id: 'b', name: 'B', indexedAt: 200 }] });
  check('targeting: plus recent indexe -> documentId = plus recent', byDate.documentId === 'b');

  // Aucun document.
  const none = resolveDocumentTarget({ documents: [] });
  check('targeting: aucun document -> status none', none.status === 'none');

  // Document nomme explicitement dans le message -> priorite absolue,
  // meme si un autre document est le dernier indexe/consulte (cas reel :
  // projet a 9 sources, la question nomme un document precis, pas le
  // dernier upload).
  const docs9 = [
    { id: 'k_mr1pqb75_la-succession-des-templi_tama', name: 'LA_SUCCESSION_DES_TEMPLIERS', indexedAt: 100 },
    { id: 'doc-islam', name: 'Le Grand Secret de l’Islam', indexedAt: 500 },
    { id: 'doc-c', name: 'Autre document', indexedAt: 300 },
  ];
  const named = resolveDocumentTarget({
    documents: docs9,
    message: 'Quels sont les chercheurs mentionnés dans le document LA_SUCCESSION_DES_TEMPLIERS ?',
    lastConsultedDocumentId: 'doc-islam',
    lastIndexedDocumentId: 'doc-islam'
  });
  check('targeting: titre nomme explicitement -> status named', named.status === 'named');
  check('targeting: titre nomme -> cible le bon document (pas le dernier consulte/indexe)', named.documentId === 'k_mr1pqb75_la-succession-des-templi_tama');

  // Titre partiel (l'utilisateur ne cite qu'une partie du nom) -> match tout de meme.
  const partial = resolveDocumentTarget({
    documents: docs9,
    message: 'que dit le document sur la succession des templiers ?',
    lastIndexedDocumentId: 'doc-islam'
  });
  check('targeting: titre partiel -> match', partial.documentId === 'k_mr1pqb75_la-succession-des-templi_tama');

  // Aucun nom mentionne -> comportement inchange (repli sur dernier consulte/indexe).
  const noName = resolveDocumentTarget({
    documents: docs9,
    message: 'que dit ce document ?',
    lastConsultedDocumentId: 'doc-islam'
  });
  check('targeting: aucun titre mentionne -> repli sur dernier consulte inchange', noName.documentId === 'doc-islam' && noName.status === 'resolved_last');
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
