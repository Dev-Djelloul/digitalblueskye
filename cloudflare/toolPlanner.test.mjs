import assert from "node:assert/strict";
import {
  TOOLS,
  detectToolNeeds,
  planToolUsage,
  buildToolExecutionPolicy,
  isToolPlannerEnabled,
  planTools,
} from "./toolPlanner.js";

// 1. Bonjour -> internal_knowledge uniquement
{
  const result = planTools({ userMessage: "Bonjour" });
  assert.deepEqual(result.plan.toolsNeeded, [TOOLS.INTERNAL_KNOWLEDGE]);
  assert.equal(result.plan.requiresToolExecution, false);
}

// 2. Combien coûte Tavily aujourd'hui ? -> web_search obligatoire
{
  const result = planTools({ userMessage: "Combien coûte Tavily aujourd'hui ?" });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.WEB_SEARCH), "web_search doit être présent");
}

// 3. Dans mon projet Digital Blue Skye, résume mes documents RAG -> rag + project_memory
{
  const result = planTools({
    userMessage: "Dans mon projet Digital Blue Skye, résume mes documents RAG",
    capabilityPlan: { capabilities: { needsRag: true, useProjectMemory: true } },
  });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.RAG), "rag doit être présent");
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.PROJECT_MEMORY), "project_memory doit être présent");
}

// 4. Analyse ce PDF -> pdf_parser + document_parser + requiresUserFile si aucun fichier
{
  const result = planTools({ userMessage: "Analyse ce PDF", hasUploadedFiles: false });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.PDF_PARSER), "pdf_parser doit être présent");
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.DOCUMENT_PARSER), "document_parser doit être présent");
  assert.equal(result.plan.requiresUserFile, true);
}

{
  const result = planTools({ userMessage: "Analyse ce PDF", hasUploadedFiles: true });
  assert.equal(result.plan.requiresUserFile, false, "fichier déjà fourni -> pas de demande de clarification");
}

// 5. Calcule 245 * 17 -> calculator
{
  const result = planTools({ userMessage: "Calcule 245 * 17" });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.CALCULATOR));
  assert.equal(result.plan.primaryTool, TOOLS.CALCULATOR);
}

// 6. Exporte cette réponse en PDF -> export_pdf
{
  const result = planTools({ userMessage: "Exporte cette réponse en PDF" });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.EXPORT_PDF));
}

// 7. Génère une image de dashboard -> image_generation
{
  const result = planTools({ userMessage: "Génère une image de dashboard" });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.IMAGE_GENERATION));
}

// 8. Analyse cette capture d'écran -> image_analysis + requiresUserImage si absent
{
  const result = planTools({ userMessage: "Analyse cette capture d'écran", hasUploadedFiles: false });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.IMAGE_ANALYSIS));
  assert.equal(result.plan.requiresUserImage, true);
}

{
  const result = planTools({ userMessage: "Analyse cette capture d'écran", hasUploadedFiles: true });
  assert.equal(result.plan.requiresUserImage, false);
}

// 9. Debug ce code JavaScript -> code_analyzer
{
  const result = planTools({ userMessage: "Debug ce code JavaScript" });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.CODE_ANALYZER));
}

// 10. Compare mes documents avec le web récent -> rag + web_search
{
  const result = planTools({ userMessage: "Compare mes documents avec le web récent" });
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.RAG), "rag attendu");
  assert.ok(result.plan.toolsNeeded.includes(TOOLS.WEB_SEARCH), "web_search attendu");
}

// 11. Source Planner requireCitations=true sans sources disponibles -> requiresClarification ou source tool mandatory
{
  const result = planTools({
    userMessage: "Quelle est la dernière info ?",
    sourcePlan: { plan: { requireCitations: true } },
    hasWebAccess: true,
  });
  assert.ok(
    result.plan.toolsNeeded.includes(TOOLS.WEB_SEARCH) || result.plan.requiresClarification,
    "citations exigées doivent forcer web_search ou une clarification, jamais une invention silencieuse"
  );
}

{
  const result = planTools({
    userMessage: "Quelle est la dernière info ?",
    sourcePlan: { plan: { requireCitations: true } },
    hasWebAccess: false,
  });
  assert.equal(result.plan.requiresClarification, true, "sans aucun outil de source disponible -> clarification obligatoire");
}

// 12. flag off
{
  assert.equal(isToolPlannerEnabled({}), false);
  assert.equal(isToolPlannerEnabled({ TOOL_PLANNER_ENABLED: "false" }), false);
  assert.equal(isToolPlannerEnabled(undefined), false);
}

// 13. flag true -> uniquement avec "true"
{
  assert.equal(isToolPlannerEnabled({ TOOL_PLANNER_ENABLED: "true" }), true);
  assert.equal(isToolPlannerEnabled({ TOOL_PLANNER_ENABLED: "TRUE" }), true);
  assert.equal(isToolPlannerEnabled({ TOOL_PLANNER_ENABLED: "1" }), false);
  assert.equal(isToolPlannerEnabled({ TOOL_PLANNER_ENABLED: "yes" }), false);
}

// 14. déterminisme : deux appels identiques retournent le même résultat
{
  const input = {
    userMessage: "Compare mes documents avec le web récent et exporte en PDF",
    capabilityPlan: { capabilities: { needsRag: true, needsExport: true } },
    sourcePlan: { plan: { requireCitations: true, useWeb: true } },
    hasUploadedFiles: false,
  };
  const a = planTools(input);
  const b = planTools(input);
  assert.deepEqual(a, b, "deux appels identiques doivent produire un résultat strictement identique");
}

// --- detectToolNeeds isolé : pas d'invention sans signal ---------------------

{
  const detection = detectToolNeeds({ userMessage: "Bonjour" });
  assert.equal(detection.needs[TOOLS.WEB_SEARCH], undefined, "aucun besoin web inventé pour un simple bonjour");
  assert.equal(detection.needs[TOOLS.RAG], undefined);
}

// --- planToolUsage : availableTools restreint correctement ------------------

{
  const detection = detectToolNeeds({ userMessage: "Recherche le prix actuel de Tavily" });
  const plan = planToolUsage({ detection, availableTools: [TOOLS.INTERNAL_KNOWLEDGE] });
  assert.ok(plan.toolsForbidden.includes(TOOLS.WEB_SEARCH), "web_search doit être listé comme interdit si non disponible");
  assert.ok(!plan.toolsNeeded.includes(TOOLS.WEB_SEARCH));
}

// --- buildToolExecutionPolicy : directives cohérentes -----------------------

{
  const plan = { requiresUserFile: true, toolsNeeded: [], toolsForbidden: [] };
  const policy = buildToolExecutionPolicy({ plan, language: "fr" });
  assert.ok(policy.policyText.length > 0);
  assert.ok(policy.directives.some((d) => d.includes("fichier")));
}

console.log("toolPlanner.test.mjs: all assertions passed");
