// Module partage de calcul de sante de service — reutilisable par
// Observabilite, Dashboard et tout futur module de monitoring. Aucune
// dependance a une table ou un worker specifique : prend des signaux deja
// agreges (requests/errors/latency/last_activity) et retourne un score 0-10,
// un statut et une disponibilite estimee. N'invente jamais de valeur : si un
// signal est absent, il est ignore (poids 0) plutot que substitue par une
// valeur par defaut optimiste.

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function scoreFromErrorRate(errorCount, totalCount) {
  if (!totalCount) return null;
  return clamp((1 - errorCount / totalCount) * 10, 0, 10);
}

function scoreFromLatency(averageLatencyMs, targetMs, maxMs) {
  const value = Number(averageLatencyMs);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= targetMs) return 10;
  if (value >= maxMs) return 0;
  return clamp(10 - ((value - targetMs) / (maxMs - targetMs)) * 10, 0, 10);
}

function scoreFromRecency(lastActivityAt, freshWindowMs, staleWindowMs) {
  if (!lastActivityAt) return null;
  const age = Date.now() - new Date(lastActivityAt).getTime();
  if (!Number.isFinite(age) || age < 0) return null;
  if (age <= freshWindowMs) return 10;
  if (age >= staleWindowMs) return 0;
  return clamp(10 - ((age - freshWindowMs) / (staleWindowMs - freshWindowMs)) * 10, 0, 10);
}

function scoreFromRecentFailures(recentFailureCount, toleratedCount) {
  if (recentFailureCount == null) return null;
  if (recentFailureCount === 0) return 10;
  return clamp(10 - (recentFailureCount / Math.max(1, toleratedCount)) * 10, 0, 10);
}

// Combine les signaux disponibles en moyenne ponderee — un signal absent
// (score null) ne participe pas au calcul, il n'abaisse jamais le score
// artificiellement.
function combineServiceSignals(signals) {
  const usable = signals.filter((s) => s.score != null && Number.isFinite(Number(s.score)) && Number(s.weight || 0) > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, s) => sum + s.weight, 0);
  const weighted = usable.reduce((sum, s) => sum + s.score * s.weight, 0);
  return totalWeight > 0 ? weighted / totalWeight : null;
}

function statusFromScore(score, hasAnyData) {
  if (!hasAnyData) return "not_configured";
  if (score == null) return "unknown";
  if (score >= 8.5) return "operational";
  if (score >= 6) return "degraded";
  return "unavailable";
}

// Point d'entree principal : a partir de signaux reels deja agreges
// (requests totaux, erreurs, latence moyenne, derniere activite, echecs
// recents), calcule un score de sante 0-10 et un statut. Tous les champs
// sont optionnels — un service sans aucune donnee renvoie status
// "not_configured" et score null, jamais une valeur fabriquee.
export function computeServiceHealthScore({
  totalRequests = 0,
  errorCount = 0,
  averageLatencyMs = null,
  latencyTargetMs = 800,
  latencyMaxMs = 5000,
  lastActivityAt = null,
  freshWindowMs = 15 * 60 * 1000,
  staleWindowMs = 24 * 60 * 60 * 1000,
  recentFailureCount = null,
  toleratedFailureCount = 5,
} = {}) {
  const hasAnyData = totalRequests > 0 || lastActivityAt != null;

  const errorRateScore = scoreFromErrorRate(errorCount, totalRequests);
  const latencyScore = scoreFromLatency(averageLatencyMs, latencyTargetMs, latencyMaxMs);
  const recencyScore = scoreFromRecency(lastActivityAt, freshWindowMs, staleWindowMs);
  const failureScore = scoreFromRecentFailures(recentFailureCount, toleratedFailureCount);

  const score = combineServiceSignals([
    { score: errorRateScore, weight: 3 },
    { score: latencyScore, weight: 2 },
    { score: recencyScore, weight: 2 },
    { score: failureScore, weight: 2 },
  ]);

  const errorRatePercent = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 1000) / 10 : null;
  const availabilityPercent = totalRequests > 0 ? Math.round((1 - errorCount / totalRequests) * 1000) / 10 : null;

  return {
    score: score != null ? Math.round(score * 10) / 10 : null,
    status: statusFromScore(score, hasAnyData),
    availability_percent: availabilityPercent,
    error_rate_percent: errorRatePercent,
    total_requests: totalRequests,
    error_count: errorCount,
    average_latency_ms: averageLatencyMs ?? null,
    last_activity_at: lastActivityAt,
  };
}
