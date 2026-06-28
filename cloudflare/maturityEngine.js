function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function roundPercent(value) {
  return Math.round(Number(value || 0) * 1000) / 10;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function parseMeta(row) {
  if (!row?.meta) return {};
  if (typeof row.meta === "object") return row.meta;
  try {
    const parsed = JSON.parse(row.meta);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function countEvents(rows, matcher) {
  return rows.filter((row) => matcher(String(row?.event_type || ""), parseMeta(row), row)).length;
}

function eventText(row) {
  return [row?.event_type, row?.event_value, row?.meta]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function scoreRate(success, total) {
  if (!total) return null;
  return clamp((success / total) * 10, 0, 10);
}

function scoreInverseRate(failures, total) {
  if (!total) return null;
  return clamp((1 - failures / total) * 10, 0, 10);
}

function scoreLatency(latencyMs, targetMs, maxMs) {
  const value = Number(latencyMs);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= targetMs) return 10;
  if (value >= maxMs) return 0;
  return clamp(10 - ((value - targetMs) / (maxMs - targetMs)) * 10, 0, 10);
}

function scorePresence(count, expectedCount) {
  if (!count) return null;
  return clamp((Number(count) / expectedCount) * 10, 0, 10);
}

function combineSignals(signals) {
  const usable = signals.filter((item) => Number.isFinite(Number(item?.score)) && Number(item?.weight || 0) > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, item) => sum + Number(item.weight), 0);
  const total = usable.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return roundOne(total / totalWeight);
}

function calculateDynamicWeight(score, evidenceCount) {
  const scoreValue = Number(score);
  if (!Number.isFinite(scoreValue)) return 0;
  return Math.max(1, Math.log10(Math.max(1, Number(evidenceCount || 0)) + 1));
}

function calculateSuccessRate(success, total) {
  if (!total) return null;
  return roundPercent(success / total);
}

// ─── Modele a 3 dimensions (Disponibilite / Qualite / Maturite) ────────────
// Avant ce lot, chaque domaine melangeait disponibilite technique, qualite
// du resultat et maturite fonctionnelle dans un seul signal combine, ce qui
// produisait des scores trompeurs (ex: un incident de quota fournisseur
// 429/402, absorbe par le fallback, faisait chuter tout le score IA comme si
// le pipeline etait casse ; une fonctionnalite non encore developpee comme
// les agents specialises faisait chuter le score "Agents" comme si les
// planners eux-memes etaient en panne). Desormais chaque domaine calcule
// separement :
//   - availability_score : le service repond-il reellement (hors incidents
//     fournisseur ponctuels deja absorbes par un fallback) ?
//   - quality_score      : parmi les operations reussies, quelle est la
//     qualite du resultat (latence, score RQC, taux de citation...) ?
//   - maturity_score     : l'etendue fonctionnelle du domaine est-elle
//     reellement construite (couverture des modules, profondeur du
//     pipeline) ? Une maturite null (aucune instrumentation pour cette
//     fonctionnalite) n'est JAMAIS remplacee par une estimation — elle reste
//     null et se traduit par un statut "not_developed" explicite, jamais par
//     une penalite chiffree inventee.
// `score` reste le champ retro-compatible consomme par admin/index.html
// (moyenne ponderee des 3 dimensions presentes), mais son calcul ne peut
// plus etre ecrase par une seule dimension defaillante quand les autres
// sont mesurees et bonnes.
function blendDimensions({ availability, quality, maturity, weights = { availability: 0.45, quality: 0.35, maturity: 0.2 } }) {
  // Number(null) vaut 0, qui est lui-meme Number.isFinite() === true : un
  // filtre naif via Number.isFinite(Number(value)) laisserait donc passer une
  // dimension volontairement null (non mesurable, ex. maturite "Agents" tant
  // qu'aucun agent autonome specialise n'est instrumente) comme un vrai 0,
  // penalisant le score d'un module par ailleurs operationnel — exactement
  // l'effet que ce lot doit supprimer. On exclut explicitement null/undefined
  // avant toute conversion numerique.
  const usable = [
    { value: availability, weight: weights.availability },
    { value: quality, weight: weights.quality },
    { value: maturity, weight: weights.maturity },
  ].filter((item) => item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value)));
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return null;
  const total = usable.reduce((sum, item) => sum + Number(item.value) * item.weight, 0);
  return roundOne(total / totalWeight);
}

// Statut categoriel independant du score chiffre : permet de distinguer
// "en panne" (availability mauvaise) de "fonctionnalite non construite"
// (maturity structurellement absente, jamais mesuree) de "qualite a
// surveiller" (le service repond mais le resultat est mediocre). Une
// maturite null ne degrade jamais ce statut vers "degraded" — elle ne peut
// produire que "not_developed", pour ne pas faire croire qu'un module
// operationnel est casse a cause d'une fonctionnalite pas encore batie.
function computeDomainStatus({ availabilityScore, qualityScore, maturityScore, evidenceCount }) {
  if (!evidenceCount) return "no_data";
  if (availabilityScore !== null && availabilityScore < 4) return "degraded";
  if (qualityScore !== null && qualityScore < 4) return "quality_issue";
  if (maturityScore !== null && maturityScore < 4) return "limited_maturity";
  if (maturityScore === null && availabilityScore !== null && availabilityScore >= 7) return "not_developed";
  return "operational";
}

const DOMAIN_STATUS_LABELS = {
  operational: "Opérationnel",
  degraded: "Dégradé",
  quality_issue: "Qualité à surveiller",
  limited_maturity: "Maturité limitée",
  not_developed: "Fonctionnalité non développée",
  no_data: "Aucune donnée",
};

function calculateDomainScores(input = {}) {
  const rows = Array.isArray(input.events) ? input.events : [];
  const tavilyUsage = input.tavilyUsage || {};
  const ragUsage = input.ragUsage || {};
  const aiState = input.aiState || {};
  const services = Array.isArray(input.services) ? input.services : [];
  const statistics = input.statistics || {};
  const checks = input.checks || {};
  const runtime = input.runtime || {};

  const modelRouter = aiState.model_router || {};
  const responseQuality = aiState.response_quality || {};
  const promptOrchestrator = aiState.prompt_orchestrator || {};
  const capabilityPlanner = aiState.capability_planner || {};
  const sourcePlanner = aiState.source_planner || {};
  const executionPlanner = aiState.execution_planner || {};

  const openRouterAttempts = (modelRouter.success_rate_by_model || []).reduce((sum, item) => sum + Number(item.attempts || 0), 0);
  const openRouterSuccesses = (modelRouter.success_rate_by_model || []).reduce((sum, item) => sum + Number(item.successes || 0), 0);
  const cloudflareAiAttempts = Number(modelRouter.cloudflare_ai_attempts || 0);
  const cloudflareAiSuccesses = Number(modelRouter.cloudflare_ai_successes || 0);
  const aiSuccesses = openRouterSuccesses + cloudflareAiSuccesses + countEvents(rows, (type) => type === "assistant_response" || type === "openrouter_response");
  // Incidents fournisseur (quota/rate-limit) : signal informatif distinct,
  // jamais compte comme un echec de disponibilite — un 429/402 absorbe par
  // le fallback ne signifie pas que le pipeline IA est casse.
  const quotaIncidents = Number(modelRouter.credit_limit_count || 0) + Number(modelRouter.rate_limit_count || 0);
  // Echecs reels (disponibilite) : tous les fournisseurs ont echoue, ou une
  // erreur technique hors quota a ete loguee.
  const aiHardFailures = Number(modelRouter.all_models_failed_count || 0)
    + Number(modelRouter.cloudflare_ai_failures || 0)
    + countEvents(rows, (type) => type.includes("error")
      && (type.includes("openrouter") || type.includes("cloudflare_ai") || type.includes("assistant"))
      && !type.includes("rate_limit") && !type.includes("credit_limit"));
  const aiAttempts = openRouterAttempts + cloudflareAiAttempts + aiSuccesses + aiHardFailures;
  const rqcAverage = Number(responseQuality.recent_24h_average_score ?? responseQuality.average_score);
  // Les event_type reels emis par completionGuard.js sont completion_truncated /
  // completion_continued / completion_continuation_failed / completion_structure_closed
  // (aucun ne contient le substring "completion_guard") — prefixe correct ci-dessous.
  const completionGuardSignals = countEvents(rows, (type) => type.startsWith("completion_"));
  const interruptions = countEvents(rows, (type, meta, row) => {
    const text = eventText(row);
    return text.includes("interrupted") || text.includes("truncated") || text.includes("max_tokens") || meta.finish_reason === "length";
  });
  const aiLatency = Number(statistics.average_response_ms ?? aiState.average_latency_ms ?? checks.openrouter?.latency_ms ?? 0);

  // Disponibilite : le pipeline produit-il une reponse, hors incidents
  // fournisseur ponctuels (quota/rate-limit absorbes par le fallback) ?
  const aiAvailabilityScore = scoreRate(aiSuccesses, aiSuccesses + aiHardFailures);
  // Qualite : parmi les reponses produites, quel est le resultat (score RQC,
  // absence d'interruption, latence) ?
  const aiQualityScore = combineSignals([
    { score: Number.isFinite(rqcAverage) ? clamp(rqcAverage / 10, 0, 10) : null, weight: Number(responseQuality.analyzed_count || 0) || 1 },
    { score: scoreInverseRate(interruptions, aiSuccesses + interruptions), weight: aiSuccesses + interruptions },
    { score: scoreLatency(aiLatency, 1200, 8000), weight: aiLatency ? 1 : 0 },
  ]);
  // Maturite : la profondeur du pipeline (completion guard + modules
  // planners produisant reellement des analyses) est-elle construite ?
  const aiMaturityModulesPresent = [
    Number(capabilityPlanner.analyses_count || 0),
    Number(sourcePlanner.analyses_count || 0),
    Number(executionPlanner.plans_created_count || 0),
    Number(promptOrchestrator.intents_detected || 0),
    Number(responseQuality.analyzed_count || 0),
  ].filter((value) => value > 0).length;
  const aiMaturityScore = combineSignals([
    { score: scorePresence(completionGuardSignals, Math.max(1, aiAttempts)), weight: completionGuardSignals },
    { score: scoreRate(aiMaturityModulesPresent, 5), weight: aiMaturityModulesPresent || 1 },
  ]);
  const aiScore = blendDimensions({ availability: aiAvailabilityScore, quality: aiQualityScore, maturity: aiMaturityScore });
  const aiExplanationParts = [];
  if (aiSuccesses > 0) aiExplanationParts.push(`${aiSuccesses} réponse(s) IA générée(s) avec succès.`);
  if (quotaIncidents > 0) aiExplanationParts.push(`${quotaIncidents} incident(s) de quota fournisseur (429/402) absorbé(s), non comptés comme indisponibilité.`);
  if (aiHardFailures > 0) aiExplanationParts.push(`${aiHardFailures} échec(s) réel(s) (tous fournisseurs) détecté(s).`);
  if (!aiExplanationParts.length) aiExplanationParts.push("Aucune donnée IA observée sur la fenêtre analysée.");
  const aiExplanation = aiExplanationParts.join(" ");

  const webExecuted = Number(tavilyUsage.searches_executed || 0);
  const webErrors = countEvents(rows, (type) => type === "web_search_error");
  const webSuccess = webExecuted;
  const citations = countEvents(rows, (type, meta) => type.includes("citation") || Number(meta.citations_count || meta.sources_count || 0) > 0);
  const forcedSearches = Number(sourcePlanner.web_forced_count || 0) + countEvents(rows, (type) => type === "source_web_forced");
  const cacheHit = Number(tavilyUsage.cache_hit_count ?? tavilyUsage.searches_avoided_cache ?? 0);
  const cacheMiss = Number(tavilyUsage.cache_miss_count ?? webExecuted);
  const dedupe = Number(tavilyUsage.searches_avoided_deduplication || 0);
  // Disponibilite : les recherches web aboutissent-elles ?
  const webAvailabilityScore = scoreRate(webSuccess, webSuccess + webErrors);
  // Qualite : parmi les recherches reussies, latence et presence de citations.
  const webQualityScore = combineSignals([
    { score: scoreLatency(tavilyUsage.average_latency_ms, 350, 3500), weight: webSuccess },
    { score: scorePresence(citations, Math.max(1, webSuccess)), weight: citations },
  ]);
  // Maturite : la couche d'optimisation (cache/dedup/forcage de recherche)
  // est-elle reellement active, independamment du volume brut de recherches ?
  const webMaturityScore = combineSignals([
    { score: scorePresence(cacheHit + dedupe, Math.max(1, cacheMiss)), weight: cacheHit + dedupe },
    { score: forcedSearches ? 10 : null, weight: forcedSearches },
  ]);
  const webScore = blendDimensions({ availability: webAvailabilityScore, quality: webQualityScore, maturity: webMaturityScore });
  const webExplanationParts = [];
  if (webSuccess > 0) webExplanationParts.push(`${webSuccess} recherche(s) web exécutée(s) avec succès.`);
  if (webErrors > 0) webExplanationParts.push(`${webErrors} échec(s) de recherche détecté(s).`);
  if (cacheHit + dedupe > 0) webExplanationParts.push(`${cacheHit + dedupe} requête(s) évitée(s) via cache/déduplication.`);
  if (!webExplanationParts.length) webExplanationParts.push("Aucune recherche web observée sur la fenêtre analysée.");
  const webExplanation = webExplanationParts.join(" ");

  const documentEventRows = rows.filter((row) => /(pdf|docx|xlsx|csv|html|markdown|export|renderer|ast)/i.test(eventText(row)));
  const documentErrors = documentEventRows.filter((row) => /error|failed|exception/i.test(eventText(row))).length;
  const exportsCount = countEvents(rows, (type) => type.includes("export"));
  const rendererAst = countEvents(rows, (type, meta, row) => eventText(row).includes("ast") || eventText(row).includes("renderer"));
  const documentCounters = Number(runtime.pdfCount || 0) + Number(runtime.docxCount || 0) + Number(runtime.xlsxCount || 0);
  const documentEvidence = documentEventRows.length + documentCounters;
  const usedDocumentFormats = [
    Number(runtime.pdfCount || 0) > 0 || documentEventRows.some((row) => eventText(row).includes("pdf")),
    Number(runtime.docxCount || 0) > 0 || documentEventRows.some((row) => eventText(row).includes("docx")),
    Number(runtime.xlsxCount || 0) > 0 || documentEventRows.some((row) => eventText(row).includes("xlsx")),
    documentEventRows.some((row) => eventText(row).includes("html")),
    documentEventRows.some((row) => eventText(row).includes("markdown")),
  ].filter(Boolean).length;
  // Disponibilite : les documents traites le sont-ils sans erreur ?
  const documentAvailabilityScore = scoreInverseRate(documentErrors, documentEvidence);
  // Qualite : la chaine de rendu AST/export produit-elle un resultat propre ?
  const documentQualityScore = scorePresence(rendererAst, Math.max(1, documentEvidence));
  // Maturite : combien de formats differents sont reellement couverts (sur 5
  // formats suivis : PDF/DOCX/XLSX/HTML/Markdown) et l'export est-il actif ?
  const documentMaturityScore = combineSignals([
    { score: scoreRate(usedDocumentFormats, 5), weight: usedDocumentFormats || 1 },
    { score: scorePresence(exportsCount, Math.max(1, documentEvidence)), weight: exportsCount },
  ]);
  const documentScore = blendDimensions({ availability: documentAvailabilityScore, quality: documentQualityScore, maturity: documentMaturityScore });
  const documentExplanationParts = [];
  if (documentEvidence > 0) documentExplanationParts.push(`${documentEvidence} signal(aux) document(s) observé(s).`);
  if (documentErrors > 0) documentExplanationParts.push(`${documentErrors} erreur(s) de traitement document détectée(s).`);
  documentExplanationParts.push(`${usedDocumentFormats}/5 format(s) document réellement utilisé(s).`);
  const documentExplanation = documentExplanationParts.join(" ");

  const memorySignals = Number(runtime.conversationCount || 0)
    + Number(ragUsage.searches_performed || 0)
    + countEvents(rows, (type, meta, row) => /memory|history|summary|conversation|context/i.test(eventText(row)) || Boolean(meta.summary || meta.context_length));
  const memoryErrors = countEvents(rows, (type, meta, row) => /memory|history|summary|conversation|context|rag/i.test(eventText(row)) && /error|failed/i.test(eventText(row)));
  // Disponibilite : la memoire/le RAG fonctionnent-ils sans erreur ?
  const memoryAvailabilityScore = scoreInverseRate(memoryErrors, memorySignals);
  // Qualite : quand le RAG est utilise, quel est son taux de correspondance ?
  const memoryQualityScore = ragUsage.searches_performed ? clamp(Number(ragUsage.match_rate || 0) / 10, 0, 10) : null;
  // Maturite : les sous-systemes memoire (historique, RAG, contexte projet)
  // sont-ils reellement actives, plutot qu'un ratio contre un total
  // historique sans rapport avec la fenetre observee ?
  const memoryMaturityScore = combineSignals([
    { score: runtime.conversationCount ? 10 : null, weight: Number(runtime.conversationCount || 0) },
    { score: Number(ragUsage.contexts_used || 0) ? 10 : null, weight: Number(ragUsage.contexts_used || 0) },
    { score: ragUsage.project_rag_active ? 10 : null, weight: ragUsage.project_rag_active ? 1 : 0 },
  ]);
  const memoryScore = blendDimensions({ availability: memoryAvailabilityScore, quality: memoryQualityScore, maturity: memoryMaturityScore });
  const memoryExplanationParts = [];
  if (runtime.conversationCount) memoryExplanationParts.push(`${runtime.conversationCount} conversation(s) avec historique.`);
  if (ragUsage.searches_performed) memoryExplanationParts.push(`${ragUsage.searches_performed} recherche(s) RAG, taux de correspondance ${ragUsage.match_rate ?? "non mesuré"}.`);
  if (memoryErrors > 0) memoryExplanationParts.push(`${memoryErrors} erreur(s) mémoire/RAG détectée(s).`);
  if (!memoryExplanationParts.length) memoryExplanationParts.push("Aucune donnée mémoire observée sur la fenêtre analysée.");
  const memoryExplanation = memoryExplanationParts.join(" ");

  const uxService = services.find((service) => /netlify|frontend/i.test(service.name || ""));
  const uxEvents = rows.filter((row) => /markdown|renderer|ast|scroll|export|frontend|ui|ux|js_error|javascript/i.test(eventText(row)));
  const uxErrors = uxEvents.filter((row) => /error|failed|exception/i.test(eventText(row))).length;
  // Disponibilite : le frontend (Netlify) est-il operationnel ?
  const uxAvailabilityScore = uxService ? (uxService.status === "operational" ? 10 : uxService.status === "partial" ? 5 : 0) : null;
  // Qualite : taux d'erreurs JS/rendu parmi les evenements UX observes.
  const uxQualityScore = scoreInverseRate(uxErrors, uxEvents.length);
  // Maturite : les fonctionnalites UX avancees (rendu AST, export) sont-elles
  // reellement utilisees ?
  const uxMaturityScore = combineSignals([
    { score: scorePresence(rendererAst, Math.max(1, uxEvents.length)), weight: rendererAst },
    { score: scorePresence(exportsCount, Math.max(1, uxEvents.length)), weight: exportsCount },
  ]);
  const uxScore = blendDimensions({ availability: uxAvailabilityScore, quality: uxQualityScore, maturity: uxMaturityScore });
  const uxExplanationParts = [];
  if (uxService) uxExplanationParts.push(`Frontend ${uxService.name || ""} : statut ${uxService.status || "non mesuré"}.`);
  if (uxErrors > 0) uxExplanationParts.push(`${uxErrors} erreur(s) JS/rendu détectée(s).`);
  if (!uxExplanationParts.length) uxExplanationParts.push("Aucune donnée UX observée sur la fenêtre analysée.");
  const uxExplanation = uxExplanationParts.join(" ");

  const securityEvents = rows.filter((row) => /guard|policy|token|auth|consent|unsupported|forbid|security|moderation/i.test(eventText(row)));
  const securityFailures = securityEvents.filter((row) => /error|failed|unauthorized|unsupported/i.test(eventText(row))).length
    + (runtime.dbConfigured ? 0 : 1)
    + (runtime.adminConfigured ? 0 : 1);
  const configuredChecks = [runtime.dbConfigured, runtime.adminConfigured].filter(Boolean).length;
  // Disponibilite : l'infrastructure de base (D1, token admin) est-elle
  // configuree ?
  const securityAvailabilityScore = scoreRate(configuredChecks, 2);
  // Qualite : taux d'echecs/acces non autorises parmi les evenements de
  // securite observes.
  const securityQualityScore = scoreInverseRate(securityFailures, securityEvents.length + securityFailures);
  // Maturite : la regle de garde avancee (interdiction des chiffres non
  // soutenus par une source) est-elle active ?
  const securityMaturityScore = Number(sourcePlanner.last_forbid_unsupported_numbers) ? 10 : null;
  const securityScore = blendDimensions({
    availability: securityAvailabilityScore,
    quality: securityQualityScore,
    maturity: securityMaturityScore,
    weights: { availability: 0.5, quality: 0.35, maturity: 0.15 },
  });
  const securityExplanationParts = [];
  securityExplanationParts.push(`${configuredChecks}/2 vérification(s) d'infrastructure de base configurée(s) (D1, token admin).`);
  if (securityFailures > 0) securityExplanationParts.push(`${securityFailures} échec(s)/accès non autorisé(s) détecté(s).`);
  const securityExplanation = securityExplanationParts.join(" ");

  const plannerAnalyses = Number(promptOrchestrator.intents_detected || 0)
    + Number(capabilityPlanner.analyses_count || 0)
    + Number(sourcePlanner.analyses_count || 0)
    + Number(executionPlanner.plans_created_count || 0);
  const plannerErrors = Number(promptOrchestrator.error_count || 0)
    + Number(capabilityPlanner.error_count || 0)
    + Number(sourcePlanner.error_count || 0)
    + Number(executionPlanner.error_count || 0);
  const observabilityEvents = rows.length + plannerAnalyses + Number(responseQuality.analyzed_count || 0);
  // BUG CORRIGE : l'ancien calcul comparait le volume d'evenements de la
  // FENETRE analysee (observabilityEvents, typiquement quelques dizaines) au
  // total CUMULE depuis l'installation (runtime.aiEventCount, qui grandit
  // indefiniment) — un ratio qui tend vers 0 avec le temps meme quand la
  // telemetrie fonctionne parfaitement ("Observabilite faible malgre
  // beaucoup d'evenements reels"). La disponibilite de la telemetrie ne doit
  // dependre que de la presence reelle d'evenements dans la fenetre
  // observee, jamais d'un total historique sans rapport.
  //
  // Disponibilite : la fenetre analysee contient-elle reellement des
  // evenements (le pipeline de telemetrie est-il vivant) ?
  const observabilityAvailabilityScore = rows.length > 0 ? 10 : (observabilityEvents > 0 ? 5 : 0);
  // Qualite : taux d'erreurs parmi les analyses planners de la fenetre.
  const observabilityQualityScore = scoreInverseRate(plannerErrors, plannerAnalyses + plannerErrors);
  // Maturite : combien de modules d'instrumentation distincts emettent
  // reellement un signal (couverture, pas volume) ?
  const observabilityModulesPresent = [
    Number(promptOrchestrator.intents_detected || 0),
    Number(capabilityPlanner.analyses_count || 0),
    Number(sourcePlanner.analyses_count || 0),
    Number(executionPlanner.plans_created_count || 0),
    Number(responseQuality.analyzed_count || 0),
    modelRouter.success_rate_by_model?.length || 0,
  ].filter((value) => value > 0).length;
  const observabilityMaturityScore = scoreRate(observabilityModulesPresent, 6);
  const observabilityScore = blendDimensions({
    availability: observabilityAvailabilityScore,
    quality: observabilityQualityScore,
    maturity: observabilityMaturityScore,
  });
  const observabilityExplanationParts = [];
  observabilityExplanationParts.push(`${rows.length} événement(s) observé(s) dans la fenêtre analysée.`);
  observabilityExplanationParts.push(`${observabilityModulesPresent}/6 module(s) d'instrumentation émettant un signal.`);
  if (plannerErrors > 0) observabilityExplanationParts.push(`${plannerErrors} erreur(s) planner détectée(s).`);
  const observabilityExplanation = observabilityExplanationParts.join(" ");

  // BUG CORRIGE : l'ancien score "Agents" melangeait le fonctionnement reel
  // des planners/orchestrateurs (qui marchent) avec l'absence d'agents
  // autonomes specialises (jamais developpes a ce jour, aucun event_type
  // dedie n'existe) — ce qui faisait chuter le score comme si les planners
  // eux-memes etaient casses ("Agents est faible alors que les planners et
  // modules IA fonctionnent"). On separe desormais :
  //  - disponibilite/qualite : sante reelle de la couche planning/execution
  //    existante (ce qui EST construit) ;
  //  - maturite : volontairement null, car aucune instrumentation pour des
  //    agents autonomes specialises n'existe — jamais remplacee par une
  //    estimation chiffree, le statut "not_developed" porte cette
  //    information a la place d'une penalite numerique inventee.
  const agentEvents = rows.filter((row) => /agent|tool|pipeline|planner|orchestrator|capability|execution/i.test(eventText(row)));
  const agentErrors = agentEvents.filter((row) => /error|failed/i.test(eventText(row))).length;
  const appliedPlans = Number(executionPlanner.applied_count || 0);
  const agentAvailabilityScore = scoreInverseRate(agentErrors, agentEvents.length);
  const agentQualityScore = scorePresence(appliedPlans, Math.max(1, Number(executionPlanner.plans_created_count || 0)));
  const agentMaturityScore = null;
  const agentScore = blendDimensions({ availability: agentAvailabilityScore, quality: agentQualityScore, maturity: agentMaturityScore });
  const agentExplanationParts = [];
  if (plannerAnalyses > 0) agentExplanationParts.push(`Fondations (planners/orchestrateur) opérationnelles : ${plannerAnalyses} analyse(s) réalisée(s), ${agentErrors} erreur(s).`);
  if (appliedPlans > 0) agentExplanationParts.push(`${appliedPlans} plan(s) d'exécution appliqué(s).`);
  agentExplanationParts.push("Aucun agent autonome spécialisé n'est encore développé (aucune instrumentation dédiée) — la maturité de ce domaine reste donc non mesurable, sans pénaliser le score des fondations déjà opérationnelles.");
  const agentExplanation = agentExplanationParts.join(" ");

  const domainSpecs = [
    {
      domain: "IA",
      score: aiScore,
      availability_score: aiAvailabilityScore,
      quality_score: aiQualityScore,
      maturity_score: aiMaturityScore,
      explanation: aiExplanation,
      evidence_count: aiAttempts + Number(responseQuality.analyzed_count || 0),
      metrics: {
        success_rate: calculateSuccessRate(aiSuccesses, aiAttempts),
        responses: aiSuccesses,
        average_latency_ms: aiLatency || null,
        rqc_grade: responseQuality.last_grade || "",
        rqc_average_score: responseQuality.average_score ?? null,
        completion_guard_events: completionGuardSignals,
        interrupted_responses: interruptions,
        quota_incidents: quotaIncidents,
        hard_failures: aiHardFailures,
      },
    },
    {
      domain: "Recherche Web",
      score: webScore,
      availability_score: webAvailabilityScore,
      quality_score: webQualityScore,
      maturity_score: webMaturityScore,
      explanation: webExplanation,
      evidence_count: webSuccess + webErrors + cacheHit + dedupe + forcedSearches,
      metrics: {
        searches: webExecuted,
        success_rate: calculateSuccessRate(webSuccess, webSuccess + webErrors),
        average_latency_ms: tavilyUsage.average_latency_ms ?? null,
        cache_hit_rate: tavilyUsage.cache_hit_rate ?? null,
        cache_miss_count: cacheMiss,
        deduplication_rate: tavilyUsage.deduplication_rate ?? null,
        citations,
        forced_searches: forcedSearches,
        errors: webErrors,
      },
    },
    {
      domain: "Documents",
      score: documentScore,
      availability_score: documentAvailabilityScore,
      quality_score: documentQualityScore,
      maturity_score: documentMaturityScore,
      explanation: documentExplanation,
      evidence_count: documentEvidence,
      metrics: {
        events: documentEventRows.length,
        uploaded_documents: documentCounters,
        exports: exportsCount,
        errors: documentErrors,
        renderer_ast_events: rendererAst,
        used_formats: usedDocumentFormats,
      },
    },
    {
      domain: "Mémoire",
      score: memoryScore,
      availability_score: memoryAvailabilityScore,
      quality_score: memoryQualityScore,
      maturity_score: memoryMaturityScore,
      explanation: memoryExplanation,
      evidence_count: memorySignals,
      metrics: {
        conversations: runtime.conversationCount ?? null,
        rag_searches: ragUsage.searches_performed ?? null,
        rag_match_rate: ragUsage.match_rate ?? null,
        contexts_used: ragUsage.contexts_used ?? null,
        project_rag_active: Boolean(ragUsage.project_rag_active),
      },
    },
    {
      domain: "UX",
      score: uxScore,
      availability_score: uxAvailabilityScore,
      quality_score: uxQualityScore,
      maturity_score: uxMaturityScore,
      explanation: uxExplanation,
      evidence_count: uxEvents.length + (uxService ? 1 : 0),
      metrics: {
        frontend_status: uxService?.status || "",
        ux_events: uxEvents.length,
        js_errors: uxErrors,
        renderer_ast_events: rendererAst,
        exports: exportsCount,
      },
    },
    {
      domain: "Sécurité",
      score: securityScore,
      availability_score: securityAvailabilityScore,
      quality_score: securityQualityScore,
      maturity_score: securityMaturityScore,
      explanation: securityExplanation,
      evidence_count: securityEvents.length + 2,
      metrics: {
        db_configured: Boolean(runtime.dbConfigured),
        admin_token_configured: Boolean(runtime.adminConfigured),
        guard_policy_events: securityEvents.length,
        failures: securityFailures,
        forbid_unsupported_numbers: Boolean(sourcePlanner.last_forbid_unsupported_numbers),
      },
    },
    {
      domain: "Observabilité",
      score: observabilityScore,
      availability_score: observabilityAvailabilityScore,
      quality_score: observabilityQualityScore,
      maturity_score: observabilityMaturityScore,
      explanation: observabilityExplanation,
      evidence_count: observabilityEvents,
      metrics: {
        events_window: rows.length,
        planner_analyses: plannerAnalyses,
        planner_errors: plannerErrors,
        rqc_analyses: responseQuality.analyzed_count ?? null,
        model_router_models: modelRouter.success_rate_by_model?.length || 0,
        modules_with_signal: observabilityModulesPresent,
      },
    },
    {
      domain: "Agents",
      score: agentScore,
      availability_score: agentAvailabilityScore,
      quality_score: agentQualityScore,
      maturity_score: agentMaturityScore,
      explanation: agentExplanation,
      evidence_count: agentEvents.length + appliedPlans,
      metrics: {
        agent_events: agentEvents.length,
        planner_analyses: plannerAnalyses,
        applied_plans: appliedPlans,
        errors: agentErrors,
      },
    },
  ];

  // Number(null) vaut 0, qui est lui-meme Number.isFinite() === true : un
  // garde-fou naif via Number.isFinite(Number(x)) transformerait donc
  // silencieusement un sous-score volontairement null (donnee non mesurable,
  // ex. maturity_score d'Agents) en 0 — exactement la confusion "absence de
  // donnee" vs "donnee mesuree mauvaise" que ce lot doit eliminer. On verifie
  // explicitement null/undefined avant toute conversion numerique.
  const roundScoreOrNull = (value) => (value === null || value === undefined ? null : (Number.isFinite(Number(value)) ? roundOne(value) : null));

  return domainSpecs.map((item) => {
    const score = Number.isFinite(Number(item.score)) ? roundOne(item.score) : 0;
    const weight = calculateDynamicWeight(score, item.evidence_count);
    const availabilityScore = roundScoreOrNull(item.availability_score);
    const qualityScore = roundScoreOrNull(item.quality_score);
    const maturityScore = roundScoreOrNull(item.maturity_score);
    const status = computeDomainStatus({
      availabilityScore,
      qualityScore,
      maturityScore,
      evidenceCount: item.evidence_count,
    });
    return {
      ...item,
      score,
      weight,
      availability_score: availabilityScore,
      quality_score: qualityScore,
      maturity_score: maturityScore,
      status,
      status_label: DOMAIN_STATUS_LABELS[status] || status,
      data_status: item.evidence_count > 0 ? "observed" : "no_data",
    };
  });
}

function weightedAverage(domains) {
  const usable = domains.filter((item) => Number(item.weight || 0) > 0 && Number.isFinite(Number(item.score)));
  if (!usable.length) return 0;
  const totalWeight = usable.reduce((sum, item) => sum + Number(item.weight), 0);
  const total = usable.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return roundOne(total / totalWeight);
}

function calculateGlobalMaturity(domains = []) {
  return weightedAverage(domains);
}

function calculateLevel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "Non mesuré";
  if (value >= 9) return "Maîtrisé";
  if (value >= 7) return "Stable";
  if (value >= 5) return "À renforcer";
  if (value > 0) return "Fragile";
  return "Non mesuré";
}

function calculateTrend(currentScore, previousScore) {
  if (currentScore === null || currentScore === undefined || previousScore === null || previousScore === undefined) {
    return { trend: "non mesuré", delta: "n/a", delta_value: null, previous_score: null };
  }
  const current = Number(currentScore);
  const previous = Number(previousScore);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { trend: "non mesuré", delta: "n/a", delta_value: null, previous_score: null };
  }
  const delta = roundOne(current - previous);
  return {
    trend: delta > 0 ? "hausse" : (delta < 0 ? "baisse" : "stable"),
    delta: `${delta > 0 ? "+" : ""}${delta}`,
    delta_value: delta,
    previous_score: roundOne(previous),
  };
}

function splitEventsForEvolution(rows) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));
  if (sorted.length < 2) return { previous: [], current: sorted };
  const midpoint = Math.floor(sorted.length / 2);
  return {
    previous: sorted.slice(0, midpoint),
    current: sorted.slice(midpoint),
  };
}

function calculateHistoricalEvolution(input = {}) {
  const rows = Array.isArray(input.events) ? input.events : [];
  const { previous, current } = splitEventsForEvolution(rows);
  if (!previous.length || !current.length) {
    return {
      previous_score: null,
      current_score: null,
      trend: "non mesuré",
      delta: "n/a",
      points: [],
    };
  }
  const previousDomains = calculateDomainScores({ ...input, events: previous });
  const currentDomains = calculateDomainScores({ ...input, events: current });
  const previousScore = calculateGlobalMaturity(previousDomains);
  const currentScore = calculateGlobalMaturity(currentDomains);
  const trend = calculateTrend(currentScore, previousScore);
  return {
    previous_score: previousScore,
    current_score: currentScore,
    ...trend,
    points: [
      { label: "Fenêtre précédente", score: previousScore, events: previous.length },
      { label: "Fenêtre actuelle", score: currentScore, events: current.length },
    ],
  };
}

function buildDashboardMetrics(domains = []) {
  return domains.map((domain) => ({
    domain: domain.domain,
    score: domain.score,
    availability_score: domain.availability_score,
    quality_score: domain.quality_score,
    maturity_score: domain.maturity_score,
    status: domain.status,
    status_label: domain.status_label,
    explanation: domain.explanation,
    level: calculateLevel(domain.score),
    data_status: domain.data_status,
    evidence_count: domain.evidence_count,
    metrics: domain.metrics,
  }));
}

function buildRadarMetrics(domains = []) {
  return domains.map((domain) => ({
    label: domain.domain,
    value: domain.score,
    weight: domain.weight,
    evidence_count: domain.evidence_count,
  }));
}

function buildMiniCharts(domains = [], evolution = {}) {
  return {
    maturity_evolution: evolution.points || [],
    domain_scores: domains.map((domain) => ({
      label: domain.domain,
      value: domain.score,
      status: domain.data_status,
    })),
  };
}

function buildDashboardScorecard(input = {}) {
  const domains = calculateDomainScores(input);
  const globalScore = calculateGlobalMaturity(domains);
  const evolution = calculateHistoricalEvolution(input);
  const trend = calculateTrend(globalScore, evolution.previous_score);
  return {
    domains: domains.map((domain) => ({
      domain: domain.domain,
      score: domain.score,
      availability_score: domain.availability_score,
      quality_score: domain.quality_score,
      maturity_score: domain.maturity_score,
      status: domain.status,
      status_label: domain.status_label,
      explanation: domain.explanation,
      weight: roundOne(domain.weight),
      trend: trend.trend,
      delta_since_last_audit: trend.delta,
      evidence_count: domain.evidence_count,
      data_status: domain.data_status,
      metrics: domain.metrics,
    })),
    global_score: globalScore,
    trend: trend.trend,
    delta_since_last_audit: trend.delta,
    last_audit_score: trend.previous_score,
    level: calculateLevel(globalScore),
    method: "Moyenne pondérée dynamique calculée depuis D1, statistiques Workers et composants réellement observés.",
    dashboard_metrics: buildDashboardMetrics(domains),
    radar_metrics: buildRadarMetrics(domains),
    mini_charts: buildMiniCharts(domains, evolution),
    historical_evolution: evolution,
  };
}

function buildMaturityEngineInput(payload = {}) {
  return {
    events: payload.events || [],
    tavilyUsage: payload.tavilyUsage,
    ragUsage: payload.ragUsage,
    aiState: payload.aiState,
    services: payload.services,
    documents: payload.documents,
    checks: payload.checks,
    statistics: payload.statistics,
    runtime: payload.runtime,
  };
}

function buildMaturityDashboardPayload(input = {}) {
  const scorecard = buildDashboardScorecard(buildMaturityEngineInput(input));
  return {
    maturity: {
      score: scorecard.global_score,
      max: 10,
      level: scorecard.level,
      detail: "Score global calculé dynamiquement depuis les événements D1 et les statistiques Workers.",
    },
    scorecard,
  };
}

export {
  calculateGlobalMaturity,
  calculateDomainScores,
  calculateTrend,
  calculateHistoricalEvolution,
  calculateLevel,
  buildDashboardMetrics,
  buildRadarMetrics,
  buildMiniCharts,
  buildMaturityDashboardPayload,
};
