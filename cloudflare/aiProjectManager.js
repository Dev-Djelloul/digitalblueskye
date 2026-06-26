/**
 * aiProjectManager.js
 *
 * Couche de pilotage décisionnel partagée entre digitalblueskye-api
 * (worker-api.js, back-office) et digitalblueskye-ai (worker-openrouter.js, chat).
 *
 * Entrée : un "snapshot" de santé réel (même forme que la réponse /admin/health :
 * services[], maturity/scorecard, rag_usage, tavily_usage, documents, statistics).
 * Sortie : un plan d'action structuré et hiérarchisé. Aucune donnée n'est inventée :
 * si une métrique manque, elle est simplement absente du snapshot et l'appelant
 * (le LLM côté chat) doit l'indiquer comme non disponible.
 */

// Connaissance produit stable, partagée pour éviter de la dupliquer entre les
// deux workers. Reflète l'état réel actuel du produit (cf. back-office).
export const DEFAULT_V3_PLACEHOLDERS = [
  { name: 'RAG documentaire', status: 'prévu', detail: "Indexer les documents validés et produire des réponses sourcées avec citations contrôlées.", next_step: 'Définir le corpus pilote et la stratégie de citation.' },
  { name: 'Base vectorielle', status: 'prévu', detail: 'Préparer embeddings, stockage, réindexation et seuils de similarité.', next_step: "Choisir le stockage et le cycle d'indexation." },
  { name: 'Mémoire persistante', status: 'prévu', detail: "Mémoriser uniquement les préférences utiles avec règles d'effacement et minimisation.", next_step: 'Lister les champs mémorisables et leurs durées de conservation.' },
  { name: 'Agents spécialisés', status: 'prévu', detail: 'Créer des parcours guidés pour veille, audit, rédaction et gestion projet.', next_step: 'Définir rôles, outils autorisés et reprise humaine.' },
  { name: 'Monitoring avancé', status: 'prévu', detail: 'Suivre erreurs fournisseur, latences, fallback, recherche web et volumes par session.', next_step: "Brancher alertes Tavily/OpenRouter et taux d'échec." },
  { name: 'Analytics IA', status: 'prévu', detail: "Transformer les événements D1 en indicateurs d'usage, qualité et fiabilité.", next_step: 'Créer les vues 7j/30j et la segmentation par type d\'événement.' },
];

// Règles métier par nom de service. Chaque règle produit une "action" candidate.
// status -> {impact, risk, urgency, effort (0-10, 10 = lourd), dependencyWeight,
// domain, reasonTpl, recommendedAction, acceptanceCriteria, timeframe}
const SERVICE_RULES = {
  'OpenRouter': {
    domain: 'OpenRouter',
    byStatus: {
      operational: { impact: 7, risk: 3, urgency: 3, effort: 4, dependencyWeight: 8, timeframe: 'Cette semaine',
        reason: 'Service IA opérationnel : maintenir la fiabilité plutôt que de la reconstruire.',
        recommendedAction: 'Surveiller les erreurs fournisseur, la latence et les modèles de repli en continu.',
        acceptanceCriteria: ['0 erreur fournisseur non journalisée sur 7 jours', 'Latence moyenne suivie et alertée', 'Chaîne de fallback testée au moins une fois par semaine'] },
      partial: { impact: 9, risk: 8, urgency: 8, effort: 4, dependencyWeight: 9, timeframe: 'Aujourd\'hui',
        reason: "OpenRouter est partiel ou dégradé : risque direct sur la disponibilité du chat, qui est le cœur du produit.",
        recommendedAction: 'Vérifier le fournisseur, tester les modèles de repli, journaliser les erreurs, comparer latence/modèle et prévoir un modèle de secours stable.',
        acceptanceCriteria: ["Cause de la dégradation identifiée", 'Fallback déclenché et validé en conditions réelles', 'Latence revenue sous le seuil cible'] },
      unconfigured: { impact: 9, risk: 9, urgency: 9, effort: 2, dependencyWeight: 9, timeframe: 'Aujourd\'hui',
        reason: "OpenRouter non configuré : le chat IA est indisponible.",
        recommendedAction: 'Configurer le secret OPENROUTER_API_KEY puis vérifier /admin/health.',
        acceptanceCriteria: ['Clé configurée', 'Premier appel de contrôle réussi'] },
    },
  },
  'Tavily': {
    domain: 'Tavily',
    byStatus: {
      operational: { impact: 5, risk: 4, urgency: 5, effort: 3, dependencyWeight: 5, timeframe: 'Cette semaine',
        reason: "Tavily fonctionne mais sans appel réseau direct côté monitoring : la disponibilité réelle n'est pas vérifiée en continu.",
        recommendedAction: "Vérifier l'usage de l'endpoint, suivre le quota, suivre la latence et ajouter un seuil d'alerte à 80 %.",
        acceptanceCriteria: ["Seuil d'alerte 80% du quota en place", 'Latence moyenne suivie', "Dernier échec connu et daté"] },
      unconfigured: { impact: 7, risk: 6, urgency: 6, effort: 2, dependencyWeight: 5, timeframe: 'Cette semaine',
        reason: 'Tavily non configuré : pas de recherche web temps réel.',
        recommendedAction: 'Configurer le secret TAVILY_API_KEY puis vérifier /admin/health.',
        acceptanceCriteria: ['Clé configurée', 'Premier appel de contrôle réussi'] },
    },
  },
  'Recherche web': {
    domain: 'Recherche web',
    byStatus: {
      operational: { impact: 4, risk: 3, urgency: 3, effort: 3, dependencyWeight: 4, timeframe: 'Cette semaine',
        reason: 'Recherche web vérifiée via Tavily.',
        recommendedAction: 'Ajouter un suivi de quotas et de qualité des sources retournées.',
        acceptanceCriteria: ['Quota suivi', 'Échantillon de pertinence des résultats revu mensuellement'] },
      partial: { impact: 5, risk: 5, urgency: 5, effort: 3, dependencyWeight: 4, timeframe: 'Cette semaine',
        reason: 'Recherche web disponible côté interface mais le contrôle Tavily est incomplet.',
        recommendedAction: 'Finaliser la configuration Tavily et le contrôle de disponibilité.',
        acceptanceCriteria: ['Contrôle Tavily vert', 'Recherche testée en conditions réelles'] },
    },
  },
  'RAG documentaire': {
    domain: 'RAG',
    byStatus: {
      partial: { impact: 8, risk: 5, urgency: 6, effort: 7, dependencyWeight: 6, timeframe: 'V3',
        reason: 'Le RAG documentaire est partiel : bibliothèque locale disponible mais sans pipeline vectoriel serveur dédié, ce qui limite la fiabilité des réponses sourcées.',
        recommendedAction: 'Indexer les documents sources, ajouter des citations, définir une stratégie de chunking, créer des seuils de similarité et tracer les sources utilisées.',
        acceptanceCriteria: ['Pipeline d\'indexation en place', 'Citations systématiques sur les réponses RAG', 'Seuil de similarité défini et documenté'] },
      development: { impact: 8, risk: 4, urgency: 5, effort: 8, dependencyWeight: 6, timeframe: 'V3',
        reason: 'RAG documentaire encore en développement.',
        recommendedAction: 'Prioriser le corpus pilote et la stratégie de citation avant extension.',
        acceptanceCriteria: ['Corpus pilote validé', 'Citations contrôlées en place'] },
    },
  },
  'Mémoire conversationnelle': {
    domain: 'Mémoire',
    byStatus: {
      operational: { impact: 5, risk: 4, urgency: 4, effort: 5, dependencyWeight: 3, timeframe: 'Cette semaine',
        reason: 'La mémoire est conservée uniquement en local navigateur : utile mais sans garde-fous formels ni sauvegarde.',
        recommendedAction: "Définir les champs mémorisables, prévoir export/restauration, éviter le stockage de données sensibles et ajouter une synchronisation optionnelle.",
        acceptanceCriteria: ['Liste des champs mémorisables documentée', 'Export/restauration disponible', 'Aucune donnée sensible mémorisée par défaut'] },
    },
  },
  'Agents spécialisés': {
    domain: 'Agents spécialisés',
    byStatus: {
      development: { impact: 6, risk: 3, urgency: 2, effort: 8, dependencyWeight: 4, timeframe: 'V3',
        reason: 'Les agents spécialisés sont en développement : pas encore exposés comme orchestration agentique dédiée.',
        recommendedAction: 'Définir les rôles, les outils autorisés, les garde-fous et les traces d\'exécution avant toute mise en production.',
        acceptanceCriteria: ['Rôles et outils définis', 'Garde-fous documentés', 'Traces d\'exécution journalisées'] },
    },
  },
  'Upload XLSX': {
    domain: 'Documents',
    byStatus: {
      partial: { impact: 5, risk: 4, urgency: 4, effort: 5, dependencyWeight: 3, timeframe: 'Cette semaine',
        reason: 'Les documents XLSX (et formats proches comme PPTX) sont partiellement supportés : la consolidation multi-feuilles reste fragile.',
        recommendedAction: 'Stabiliser l\'extraction multi-feuilles, améliorer la conversion des tableaux et ajouter des tests sur les formats volumineux.',
        acceptanceCriteria: ['Multi-feuilles testé sur fichiers réels', 'Tableaux convertis sans perte', 'Fichiers volumineux couverts par un test'] },
    },
  },
};

// Défauts par statut générique pour tout service non couvert explicitement ci-dessus.
const GENERIC_STATUS_DEFAULTS = {
  operational: { impact: 3, risk: 2, urgency: 2, effort: 2, dependencyWeight: 3, timeframe: 'Cette semaine',
    reason: 'Service opérationnel : maintenance courante.',
    recommendedAction: 'Conserver une supervision de routine et journaliser les anomalies.',
    acceptanceCriteria: ['Aucune régression détectée sur 30 jours'] },
  partial: { impact: 5, risk: 5, urgency: 5, effort: 4, dependencyWeight: 4, timeframe: 'Cette semaine',
    reason: 'Service partiellement fiable : vérification ou consolidation nécessaire.',
    recommendedAction: 'Identifier la cause du statut partiel et la corriger.',
    acceptanceCriteria: ['Statut passé à opérationnel et vérifié'] },
  degraded: { impact: 7, risk: 7, urgency: 7, effort: 4, dependencyWeight: 5, timeframe: "Aujourd'hui",
    reason: 'Service dégradé : impact direct sur l\'expérience utilisateur.',
    recommendedAction: 'Diagnostiquer et corriger en priorité.',
    acceptanceCriteria: ['Statut revenu à opérationnel'] },
  unconfigured: { impact: 6, risk: 6, urgency: 6, effort: 2, dependencyWeight: 4, timeframe: 'Cette semaine',
    reason: 'Service non configuré.',
    recommendedAction: 'Compléter la configuration manquante (secret ou variable).',
    acceptanceCriteria: ['Configuration complétée et vérifiée'] },
  development: { impact: 5, risk: 3, urgency: 2, effort: 7, dependencyWeight: 3, timeframe: 'V3',
    reason: 'Fonctionnalité en développement.',
    recommendedAction: 'Cadrer le périmètre avant mise en production.',
    acceptanceCriteria: ['Périmètre cadré et documenté'] },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function priorityScore({ impact, risk, urgency, effort, dependencyWeight }) {
  const effortInverse = 10 - effort;
  return round1(
    impact * 0.35 +
    risk * 0.25 +
    urgency * 0.20 +
    effortInverse * 0.15 +
    dependencyWeight * 0.05
  );
}

function effortLabel(effort) {
  if (effort <= 3) return 'Faible';
  if (effort <= 6) return 'Moyen';
  return 'Élevé';
}

function impactLabel(impact) {
  if (impact >= 7) return 'Élevé';
  if (impact >= 4) return 'Moyen';
  return 'Faible';
}

function buildActionFromService(service) {
  const name = String(service?.name || '').trim();
  if (!name) return null;
  const status = String(service?.status || 'partial').toLowerCase();
  const rule = SERVICE_RULES[name];
  const ruleForStatus = rule?.byStatus?.[status];
  const fallback = GENERIC_STATUS_DEFAULTS[status] || GENERIC_STATUS_DEFAULTS.partial;
  const picked = ruleForStatus || fallback;
  const domain = rule?.domain || name;

  const scores = {
    impact: clamp(picked.impact, 0, 10),
    risk: clamp(picked.risk, 0, 10),
    urgency: clamp(picked.urgency, 0, 10),
    effort: clamp(picked.effort, 0, 10),
    dependencyWeight: clamp(picked.dependencyWeight, 0, 10),
  };

  return {
    title: ruleForStatus ? `Stabiliser ${name}` : `Faire évoluer ${name}`,
    domain,
    status,
    reason: picked.reason,
    impact: scores.impact,
    risk: scores.risk,
    urgency: scores.urgency,
    effort: scores.effort,
    priorityScore: priorityScore(scores),
    expectedBenefit: impactLabel(scores.impact),
    recommendedAction: picked.recommendedAction,
    acceptanceCriteria: picked.acceptanceCriteria || [],
    owner: 'Digital Blue Skye',
    timeframe: picked.timeframe || 'Cette semaine',
    effortLabel: effortLabel(scores.effort),
    serviceDetail: service?.detail || '',
  };
}

function summarizeEffort(actions) {
  if (!actions.length) return 'Donnée non disponible dans le monitoring actuel.';
  const avg = actions.reduce((sum, a) => sum + a.effort, 0) / actions.length;
  return effortLabel(avg);
}

function summarizeImpact(actions) {
  if (!actions.length) return 'Donnée non disponible dans le monitoring actuel.';
  const avg = actions.reduce((sum, a) => sum + a.impact, 0) / actions.length;
  return impactLabel(avg);
}

/**
 * @param {object} snapshot - même forme que /admin/health : { services, maturity,
 *   scorecard, rag_usage, tavily_usage, documents, statistics, v3_placeholders, checked_at }
 */
export function computeProjectPlan(snapshot) {
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  const actions = services.map(buildActionFromService).filter(Boolean);
  const sorted = [...actions].sort((a, b) => b.priorityScore - a.priorityScore);

  const topPriorities = sorted.slice(0, 3);
  const quickWins = actions
    .filter((a) => a.effort <= 4 && a.impact >= 5)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);
  const risks = actions
    .filter((a) => a.risk >= 6)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 5);
  const opportunities = actions
    .filter((a) => a.impact >= 7 && a.status !== 'operational')
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);
  const blockers = actions.filter((a) => a.status === 'unconfigured' || a.status === 'degraded');

  const v3Source = Array.isArray(snapshot?.v3_placeholders) && snapshot.v3_placeholders.length
    ? snapshot.v3_placeholders
    : DEFAULT_V3_PLACEHOLDERS;

  const roadmap = {
    today: blockers.length
      ? blockers.map((a) => a.recommendedAction)
      : (sorted[0] ? [sorted[0].recommendedAction] : ['Donnée non disponible dans le monitoring actuel.']),
    thisWeek: sorted.slice(blockers.length ? 0 : 1, 4).map((a) => a.title),
    v3: v3Source.map((item) => `${item.name} — ${item.next_step || item.detail || ''}`.trim()),
  };

  const maturityScore = Number.isFinite(Number(snapshot?.maturity?.score))
    ? Number(snapshot.maturity.score)
    : null;

  return {
    globalStatus: snapshot?.system?.version
      ? `Digital Blue Skye AI v${snapshot.system.version}`
      : 'Donnée non disponible dans le monitoring actuel.',
    maturityScore: maturityScore !== null ? maturityScore : 'Donnée non disponible dans le monitoring actuel.',
    topPriorities,
    risks,
    opportunities,
    quickWins,
    roadmap,
    recommendedNextActions: topPriorities.map((a) => a.recommendedAction),
    blockers,
    estimatedEffort: summarizeEffort(actions),
    expectedImpact: summarizeImpact(actions),
    allActions: sorted,
    generatedFrom: {
      checkedAt: snapshot?.checked_at || snapshot?.timestamp || null,
      serviceCount: services.length,
    },
  };
}
