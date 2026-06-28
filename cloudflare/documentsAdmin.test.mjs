import assert from "node:assert/strict";
import {
  documentIdFromEvent,
  buildDocumentTypeDistributionFromRows,
  buildDocumentActivitySeries,
  isDocumentErrorEventType,
  buildDocumentErrors,
  buildDocumentHealth,
} from "./worker-api.js";

// --- aucune donnée / aucun document -----------------------------------------

{
  const distribution = buildDocumentTypeDistributionFromRows([]);
  assert.deepEqual(distribution, [], "aucun type fabriqué sans documents");
}

{
  const activity = buildDocumentActivitySeries([]);
  assert.deepEqual(activity, [], "aucune activité simulée sans événement");
}

{
  const health = buildDocumentHealth([]);
  assert.equal(health.status, "not_configured");
}

{
  const errors = buildDocumentErrors([]);
  assert.equal(errors.total_error_count, 0);
  assert.equal(errors.status, "aucune_erreur_recente");
}

// --- documentIdFromEvent : lit meta.documentId réel -------------------------

{
  const row = { meta: JSON.stringify({ documentId: "doc-42" }) };
  assert.equal(documentIdFromEvent(row), "doc-42");
}

{
  const row = { meta: JSON.stringify({}) };
  assert.equal(documentIdFromEvent(row), "");
}

// --- distribution par type : réelle, pas de PDF/DOCX/MD figés ---------------

{
  const rows = [
    { source_type: "pdf", mime_type: "application/pdf" },
    { source_type: "pdf", mime_type: "application/pdf" },
    { source_type: "docx", mime_type: "application/msword" },
  ];
  const distribution = buildDocumentTypeDistributionFromRows(rows);
  assert.equal(distribution.length, 2);
  assert.equal(distribution[0].label, "pdf");
  assert.equal(distribution[0].value, 2);
  assert.equal(distribution[1].label, "docx");
  assert.equal(distribution[1].value, 1);
}

// --- événements document_* réels -> stats à jour ----------------------------

const now = "2026-06-28T10:00:00.000Z";
const realEvents = [
  { event_type: "document_uploaded", created_at: now, meta: JSON.stringify({ documentId: "doc-1" }) },
  { event_type: "document_indexed", created_at: now, meta: JSON.stringify({ documentId: "doc-1" }) },
  { event_type: "document_used", created_at: now, meta: JSON.stringify({ documentId: "doc-1" }) },
];

{
  const activity = buildDocumentActivitySeries(realEvents, 30);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].date, now.slice(0, 10));
  assert.equal(activity[0].uploaded, 1);
  assert.equal(activity[0].indexed, 1);
  assert.equal(activity[0].used, 1);
  assert.equal(activity[0].failed, 0);
}

{
  const health = buildDocumentHealth(realEvents);
  assert.equal(health.status, "operational");
  assert.equal(health.indexed_count, 1);
}

// --- échec d'indexation => statut dégradé/indisponible ----------------------

{
  assert.equal(isDocumentErrorEventType("document_index_failed"), true);
  assert.equal(isDocumentErrorEventType("document_indexed"), false);
}

const eventsWithFailure = [
  { event_type: "document_indexed", created_at: now, meta: JSON.stringify({ documentId: "doc-1" }) },
  { event_type: "document_index_failed", created_at: now, meta: JSON.stringify({ documentId: "doc-2", error: "embedding_failed" }) },
];

{
  const health = buildDocumentHealth(eventsWithFailure);
  assert.equal(health.status, "degraded");
}

{
  const errors = buildDocumentErrors(eventsWithFailure);
  assert.equal(errors.total_error_count, 1);
  assert.equal(errors.status, "des_erreurs_recentes");
  assert.equal(errors.recent[0].documentId, "doc-2");
  assert.equal(errors.recent[0].detail, "embedding_failed");
}

const onlyFailures = [
  { event_type: "document_index_failed", created_at: now, meta: JSON.stringify({ documentId: "doc-3" }) },
];

{
  const health = buildDocumentHealth(onlyFailures);
  assert.equal(health.status, "unavailable");
}

console.log("documentsAdmin.test.mjs: all assertions passed");
