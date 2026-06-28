import assert from "node:assert/strict";
import {
  buildExportFormatDistributionFromRows,
  buildExportActivitySeries,
  isExportErrorStatus,
  buildExportErrors,
  buildExportHealth,
} from "./worker-api.js";

// --- aucun export / aucune donnée -------------------------------------------

{
  const distribution = buildExportFormatDistributionFromRows([]);
  assert.deepEqual(distribution, [], "aucun format fabriqué sans export");
}

{
  const activity = buildExportActivitySeries([]);
  assert.deepEqual(activity, [], "aucune activité simulée sans export");
}

{
  const health = buildExportHealth([]);
  assert.equal(health.status, "not_configured");
}

{
  const errors = buildExportErrors([]);
  assert.equal(errors.total_error_count, 0);
  assert.equal(errors.status, "aucune_erreur_recente");
}

// --- distribution par format : réelle, pas de PDF/CSV/XLSX figés -----------

{
  const rows = [
    { export_format: "json" },
    { export_format: "json" },
    { export_format: "csv" },
  ];
  const distribution = buildExportFormatDistributionFromRows(rows);
  assert.equal(distribution.length, 2);
  assert.equal(distribution[0].label, "json");
  assert.equal(distribution[0].value, 2);
  assert.equal(distribution[1].label, "csv");
  assert.equal(distribution[1].value, 1);
}

// --- export réussi -----------------------------------------------------------

const now = "2026-06-28T10:00:00.000Z";
const completedRows = [
  { status: "completed", generated_at: now, size_bytes: 2048, duration_ms: 120, download_count: 1 },
];

{
  const activity = buildExportActivitySeries(completedRows, 30);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].date, now.slice(0, 10));
  assert.equal(activity[0].completed, 1);
  assert.equal(activity[0].failed, 0);
  assert.equal(activity[0].downloaded, 1);
  assert.equal(activity[0].volume_bytes, 2048);
  assert.equal(activity[0].average_duration_ms, 120);
}

{
  const health = buildExportHealth(completedRows);
  assert.equal(health.status, "operational");
  assert.equal(health.completed_count, 1);
}

// --- export échoué -> dégradé/indisponible ----------------------------------

{
  assert.equal(isExportErrorStatus("failed"), true);
  assert.equal(isExportErrorStatus("completed"), false);
}

const mixedRows = [
  { status: "completed", generated_at: now, size_bytes: 1024, duration_ms: 80, download_count: 0 },
  { status: "failed", generated_at: now, error_message: "table_not_allowed", id: 7 },
];

{
  const health = buildExportHealth(mixedRows);
  assert.equal(health.status, "degraded");
}

{
  const errors = buildExportErrors(mixedRows);
  assert.equal(errors.total_error_count, 1);
  assert.equal(errors.status, "des_erreurs_recentes");
  assert.equal(errors.recent[0].exportId, 7);
  assert.equal(errors.recent[0].detail, "table_not_allowed");
}

const onlyFailures = [
  { status: "failed", generated_at: now, error_message: "timeout", id: 9 },
];

{
  const health = buildExportHealth(onlyFailures);
  assert.equal(health.status, "unavailable");
}

// --- volume nul (size_bytes absent) -----------------------------------------

{
  const rows = [{ status: "completed", generated_at: now, size_bytes: null, duration_ms: null, download_count: 0 }];
  const activity = buildExportActivitySeries(rows, 30);
  assert.equal(activity[0].volume_bytes, 0);
  assert.equal(activity[0].average_duration_ms, null, "non mesuré attendu sans durée");
}

console.log("exportsAdmin.test.mjs: all assertions passed");
