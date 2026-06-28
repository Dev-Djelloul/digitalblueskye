// Tool Planner — Lot 11.
//
// Nouvelle etape du pipeline, EN AMONT du Prompt Orchestrator, JUSTE APRES
// l'Execution Planner :
//
//   Utilisateur -> Capability Planner -> Source Planner -> Execution
//   Planner -> Tool Planner -> Prompt Orchestrator -> Model Router -> LLM
//   -> Completion Guard -> Response Quality Controller
//
// Role : decider QUELS OUTILS/CAPACITES doivent etre mobilises pour
// repondre a la requete (RAG, web, parseurs de fichiers, calculatrice,
// export, generation/analyse d'image, analyseur de code, etc.). Le Tool
// Planner ne remplace AUCUN module en amont : il lit leurs signaux deja
// calcules (capabilityPlan, sourcePlan, executionPlan) et les traduit en un
// PLAN D'OUTILLAGE explicite et journalisable.
//
// Le Tool Planner NE PEUT PAS executer les outils. Il produit uniquement
// une intention/policy lue ensuite par le Prompt Orchestrator et par le
// pipeline d'execution reel (RAG/Tavily/exports/etc. restent pilotes comme
// avant ; ce module ajoute seulement un signal additif coherent).
//
// Module 100% pur et deterministe :
// - Aucun acces reseau (pas de Tavily, RAG/Vectorize, D1, LLM).
// - Aucune dependance horaire/aleatoire.
// - Deux appels avec les memes arguments retournent EXACTEMENT le meme
//   resultat (pas de Math.random, pas de Date.now, pas d'ordre de Map
//   instable).

// ─────────────────────────────────────────────────────────────────────────
// 0. Catalogue des outils possibles.
// ─────────────────────────────────────────────────────────────────────────

export const TOOLS = Object.freeze({
  INTERNAL_KNOWLEDGE: 'internal_knowledge',
  RAG: 'rag',
  WEB_SEARCH: 'web_search',
  PROJECT_MEMORY: 'project_memory',
  CONVERSATION_HISTORY: 'conversation_history',
  DOCUMENT_PARSER: 'document_parser',
  PDF_PARSER: 'pdf_parser',
  DOCX_PARSER: 'docx_parser',
  SPREADSHEET_PARSER: 'spreadsheet_parser',
  OCR: 'ocr',
  CALCULATOR: 'calculator',
  EXPORT_HTML: 'export_html',
  EXPORT_PDF: 'export_pdf',
  EXPORT_DOCX: 'export_docx',
  EXPORT_MARKDOWN: 'export_markdown',
  CODE_ANALYZER: 'code_analyzer',
  IMAGE_ANALYSIS: 'image_analysis',
  IMAGE_GENERATION: 'image_generation',
  EMAIL: 'email',
  CALENDAR: 'calendar',
  CONTACTS: 'contacts',
  GITHUB: 'github',
  NOTION: 'notion',
  SLACK: 'slack'
});

// ─────────────────────────────────────────────────────────────────────────
// 1. Motifs de detection (purs, regex deterministes).
// ─────────────────────────────────────────────────────────────────────────

const RX = {
  calculation: /\b(\d+(?:[.,]\d+)?\s*[*x×+\-\/]\s*\d+(?:[.,]\d+)?|calcule[rz]?|calcul\s+de|combien\s+font|combien\s+vaut|résous\s+cette\s+équation|solve\s+this\s+equation|compute|what\s+is\s+\d)/i,
  exportPdf: /\b(export(?:e|er)?\s+(?:en\s+|au\s+format\s+)?pdf|en\s+pdf|export\s+to\s+pdf|generate\s+a\s+pdf)\b/i,
  exportDocx: /\b(export(?:e|er)?\s+(?:en\s+|au\s+format\s+)?word|export(?:e|er)?\s+(?:en\s+|au\s+format\s+)?docx|en\s+docx|export\s+to\s+(?:word|docx))\b/i,
  exportHtml: /\b(export(?:e|er)?\s+(?:en\s+|au\s+format\s+)?html|en\s+html|export\s+to\s+html)\b/i,
  exportMarkdown: /\b(export(?:e|er)?\s+(?:en\s+|au\s+format\s+)?markdown|en\s+markdown|export\s+to\s+markdown)\b/i,
  exportGeneric: /\b(exporte[rz]?\s+(?:cette\s+|la\s+)?r[ée]ponse|export\s+this|t[ée]l[ée]charge[rz]?\s+(?:ce|cette)|download\s+this)\b/i,
  imageGeneration: /\b(g[ée]n[èe]re[rz]?\s+(?:une\s+|moi\s+une\s+)?image|cr[ée][ée]?\s+(?:une\s+|moi\s+une\s+)?image|dessine[rz]?|illustre[rz]?\s+(?:moi\s+)?|generate\s+an?\s+image|create\s+an?\s+image|draw\s+(?:me\s+)?an?\s+image)\b/i,
  imageAnalysis: /\b(analyse[rz]?\s+(?:cette\s+|la\s+)?(?:image|capture\s+d['e]?[ée]cran|screenshot|photo)|que\s+vois[-\s]tu\s+sur\s+(?:cette\s+image|cette\s+photo)|what['e]?s?\s+in\s+this\s+image|describe\s+this\s+image|analyze\s+this\s+screenshot)\b/i,
  codeRequest: /\b(d[ée]bogue[rz]?|debug|refactor(?:ise[rz]?)?|audit(?:e[rz]?)?\s+ce\s+code|analyse[rz]?\s+ce\s+code|relis\s+ce\s+code|review\s+this\s+code|fix\s+this\s+(?:code|bug)|cette\s+fonction\s+javascript|ce\s+code\s+(?:javascript|python|php|sql))\b/i,
  pdfFile: /\b(ce\s+pdf|ce\s+fichier\s+pdf|cette?\s+document\s+pdf|this\s+pdf|the\s+pdf\s+file)\b/i,
  docxFile: /\b(ce\s+document\s+word|ce\s+fichier\s+(?:docx|word)|this\s+word\s+document|the\s+docx\s+file)\b/i,
  spreadsheetFile: /\b(ce\s+(?:fichier\s+)?(?:excel|xlsx|csv|tableur)|this\s+(?:excel|spreadsheet|csv)\s+file)\b/i,
  genericFileReference: /\b(ce\s+fichier|ce\s+document|le\s+fichier\s+joint|le\s+document\s+joint|this\s+file|this\s+document|the\s+attached\s+file)\b/i,
  scannedLikely: /\b(scann[ée]e?|num[ée]ris[ée]e?|capture\s+d['e]?[ée]cran|photo\s+d['e]?un\s+document|scanned|screenshot\s+of\s+a\s+document)\b/i,
  projectExplicit: /\b(dans\s+mon\s+projet|mon\s+projet\s+actif|mes\s+documents?|selon\s+le\s+rag|biblioth[èe]que(?:\s+globale)?|résume\s+mes\s+documents?|résumé\s+de\s+mes\s+documents?)\b/i,
  webRecency: /\b(aujourd['\s]hui|maintenant|actuel\b|actuelle\b|actuellement|derni[èe]re?\s+version|r[ée]cents?|r[ée]centes?|en\s+202[4-9]|cette\s+ann[ée]e|nouveaut[ée]s?|latest|current|recent|today|now)\b/i,
  pricing: /\b(prix|tarifs?|coûte?\b|co[ûu]t[s]?|combien\s+(?:coûte|ça\s+coûte)|pricing|price[s]?|cost[s]?|how\s+much\s+(?:does|is))\b/i,
  quotaOfficialDocs: /\b(quota[s]?|limites?|documentation\s+officielle|official\s+docs?|official\s+documentation)\b/i,
  compareWithWeb: /\b(compare[rz]?\s+(?:mes?\s+documents?|mon\s+projet).{0,40}(?:web|internet|en\s+ligne)|compare\s+my\s+documents?\s+with\s+(?:the\s+)?(?:web|recent\s+web))\b/i,
  greeting: /^\s*(bonjour|salut|hello|hi|coucou|hey)[\s!.,?]*$/i,
  simpleQuestion: /\b(qu['e]est[-\s]ce\s+que|c['e]est\s+quoi|que\s+signifie|what\s+is|define|qui\s+es[-\s]tu|who\s+are\s+you)\b/i
};

function wordCount(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// ─────────────────────────────────────────────────────────────────────────
// 2. detectToolNeeds — analyse pure des besoins d'outillage.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Detecte, a partir du message utilisateur et des signaux amont, quels
 * outils sont potentiellement necessaires. Pur : ne depend que des
 * arguments fournis, aucune detection de bas niveau dupliquee (reutilise
 * capabilityPlan/sourcePlan/executionPlan quand disponibles).
 */
export function detectToolNeeds({
  userMessage = '',
  language,
  capabilityPlan = null,
  sourcePlan = null,
  executionPlan = null,
  hasUploadedFiles = false,
  hasRagSources = false,
  hasWebAccess = true,
  hasExports = true,
  hasCalculator = true,
  hasDocumentParser = true,
  hasOcr = true,
  hasImageTools = true
} = {}) {
  const text = String(userMessage || '');
  const words = wordCount(text);
  const caps = capabilityPlan?.capabilities || null;
  const evidence = sourcePlan?.evidence || null;
  const srcPlan = sourcePlan?.plan || null;
  const execPlan = executionPlan?.plan || null;

  const reasons = {};
  const push = (key, reason) => {
    if (!reasons[key]) reasons[key] = [];
    reasons[key].push(reason);
  };

  const needs = {};
  const mark = (tool, reasonKey, reasonValue) => {
    needs[tool] = true;
    push(reasonKey, reasonValue);
  };

  // ── Regle 1 : question simple -> internal_knowledge uniquement ─────────
  const isGreeting = RX.greeting.test(text.trim());
  const isSimpleQuestion = RX.simpleQuestion.test(text) && words <= 12;
  const isTrivial = (isGreeting || isSimpleQuestion) && !caps?.needsRag && !caps?.needsWeb && !hasUploadedFiles;
  if (isTrivial) {
    mark(TOOLS.INTERNAL_KNOWLEDGE, 'internal_knowledge', isGreeting ? 'greeting_detected' : 'simple_definition_question');
  } else {
    mark(TOOLS.INTERNAL_KNOWLEDGE, 'internal_knowledge', 'always_available_baseline');
  }

  // ── Regle 2 : factuel recent/prix/quota/doc officielle -> web ──────────
  const recentFactual = RX.webRecency.test(text) || RX.pricing.test(text) || RX.quotaOfficialDocs.test(text)
    || evidence?.sourceRequirement === 'web_required' || evidence?.sourceRequirement === 'web_preferred'
    || Boolean(caps?.needsWeb) || Boolean(srcPlan?.useWeb || srcPlan?.forceWeb) || Boolean(execPlan?.useWeb || execPlan?.forceWeb);
  if (recentFactual && hasWebAccess) {
    mark(TOOLS.WEB_SEARCH, 'web_search', 'recent_factual_pricing_or_quota_signal');
  }

  // ── Regle 3 : projet actif / documents -> rag + project_memory ─────────
  const projectRelated = RX.projectExplicit.test(text) || Boolean(caps?.needsRag) || Boolean(srcPlan?.useRag || srcPlan?.forceRag)
    || Boolean(execPlan?.useRag || execPlan?.forceRag) || hasRagSources;
  if (projectRelated) {
    mark(TOOLS.RAG, 'rag', 'project_or_document_reference_detected');
    if (caps?.useProjectMemory || srcPlan?.useProjectMemory) {
      mark(TOOLS.PROJECT_MEMORY, 'project_memory', 'project_memory_signal_from_upstream');
    }
  }

  // ── Regle 4 : fichier uploade -> parseur selon type, OCR si scan ───────
  const fileReferenced = hasUploadedFiles || RX.genericFileReference.test(text)
    || RX.pdfFile.test(text) || RX.docxFile.test(text) || RX.spreadsheetFile.test(text);
  let requiresUserFile = false;
  if (fileReferenced && hasDocumentParser) {
    mark(TOOLS.DOCUMENT_PARSER, 'document_parser', 'file_reference_detected');
    if (RX.pdfFile.test(text)) mark(TOOLS.PDF_PARSER, 'document_parser', 'pdf_keyword_detected');
    if (RX.docxFile.test(text)) mark(TOOLS.DOCX_PARSER, 'document_parser', 'docx_keyword_detected');
    if (RX.spreadsheetFile.test(text)) mark(TOOLS.SPREADSHEET_PARSER, 'document_parser', 'spreadsheet_keyword_detected');
    if (hasOcr && RX.scannedLikely.test(text)) mark(TOOLS.OCR, 'document_parser', 'scanned_document_signal');
    if (!hasUploadedFiles) {
      requiresUserFile = true;
      push('document_parser', 'file_referenced_but_not_uploaded');
    }
  }

  // ── Regle 5 : calcul -> calculator ──────────────────────────────────────
  if (RX.calculation.test(text) && hasCalculator) {
    mark(TOOLS.CALCULATOR, 'calculator', 'calculation_pattern_detected');
  }

  // ── Regle 6 : export demande -> outil export correspondant ────────────
  if (hasExports) {
    if (RX.exportPdf.test(text)) mark(TOOLS.EXPORT_PDF, 'export', 'pdf_export_keyword_detected');
    else if (RX.exportDocx.test(text)) mark(TOOLS.EXPORT_DOCX, 'export', 'docx_export_keyword_detected');
    else if (RX.exportHtml.test(text)) mark(TOOLS.EXPORT_HTML, 'export', 'html_export_keyword_detected');
    else if (RX.exportMarkdown.test(text)) mark(TOOLS.EXPORT_MARKDOWN, 'export', 'markdown_export_keyword_detected');
    else if (RX.exportGeneric.test(text) || caps?.needsExport) mark(TOOLS.EXPORT_PDF, 'export', 'generic_export_request_defaults_to_pdf');
  }

  // ── Regle 7 : image -> generation si creation, analysis si existante ───
  let requiresUserImage = false;
  if (hasImageTools) {
    if (RX.imageGeneration.test(text)) {
      mark(TOOLS.IMAGE_GENERATION, 'image', 'image_creation_keyword_detected');
    }
    if (RX.imageAnalysis.test(text)) {
      mark(TOOLS.IMAGE_ANALYSIS, 'image', 'image_analysis_keyword_detected');
      if (!hasUploadedFiles) {
        requiresUserImage = true;
        push('image', 'image_analysis_requested_but_no_image_uploaded');
      }
    }
  }

  // ── Regle 8 : code -> code_analyzer ─────────────────────────────────────
  if (RX.codeRequest.test(text) || caps?.needsCode) {
    mark(TOOLS.CODE_ANALYZER, 'code', 'technical_code_request_detected');
  }

  // ── Regle 10 : citations exigees -> rag ou web doit etre present ───────
  const requireCitations = Boolean(srcPlan?.requireCitations || execPlan?.requireCitations);
  let requiresClarification = false;
  if (requireCitations && !needs[TOOLS.RAG] && !needs[TOOLS.WEB_SEARCH]) {
    if (hasWebAccess) {
      mark(TOOLS.WEB_SEARCH, 'web_search', 'citations_required_no_source_tool_yet_fallback_web');
    } else {
      requiresClarification = true;
      push('clarification', 'citations_required_but_no_source_tool_available');
    }
  }

  // ── Regle 10b : comparaison documents + web ────────────────────────────
  if (RX.compareWithWeb.test(text)) {
    mark(TOOLS.RAG, 'rag', 'compare_documents_with_web_signal');
    if (hasWebAccess) mark(TOOLS.WEB_SEARCH, 'web_search', 'compare_documents_with_web_signal');
  }

  // ── Regle 9 (ambiguite outil indisponible) ─────────────────────────────
  if (fileReferenced && !hasDocumentParser) {
    requiresClarification = true;
    push('clarification', 'document_parser_unavailable_for_referenced_file');
  }

  // ── Confidence : moyenne des signaux amont disponibles ─────────────────
  const confidenceSamples = [];
  if (Number.isFinite(caps?.confidence)) confidenceSamples.push(caps.confidence);
  if (Number.isFinite(evidence?.confidence)) confidenceSamples.push(evidence.confidence);
  if (Number.isFinite(execPlan?.confidence)) confidenceSamples.push(execPlan.confidence);
  const detectionConfidence = confidenceSamples.length
    ? clamp01(confidenceSamples.reduce((sum, v) => sum + v, 0) / confidenceSamples.length)
    : 0.5;

  return {
    needs,
    requiresUserFile,
    requiresUserImage,
    requiresClarification,
    confidence: detectionConfidence,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. planToolUsage — transforme la detection en plan ordonne.
// ─────────────────────────────────────────────────────────────────────────

const TOOL_PRIORITY = [
  TOOLS.CALCULATOR,
  TOOLS.OCR,
  TOOLS.PDF_PARSER,
  TOOLS.DOCX_PARSER,
  TOOLS.SPREADSHEET_PARSER,
  TOOLS.DOCUMENT_PARSER,
  TOOLS.RAG,
  TOOLS.PROJECT_MEMORY,
  TOOLS.WEB_SEARCH,
  TOOLS.IMAGE_ANALYSIS,
  TOOLS.IMAGE_GENERATION,
  TOOLS.CODE_ANALYZER,
  TOOLS.CONVERSATION_HISTORY,
  TOOLS.EXPORT_PDF,
  TOOLS.EXPORT_DOCX,
  TOOLS.EXPORT_HTML,
  TOOLS.EXPORT_MARKDOWN,
  TOOLS.INTERNAL_KNOWLEDGE
];

const PARALLELIZABLE = new Set([TOOLS.RAG, TOOLS.WEB_SEARCH, TOOLS.PROJECT_MEMORY]);

/**
 * Construit le plan d'outillage ordonne (toolsNeeded/optional/forbidden,
 * sequence, parallelisation) a partir de la detection. Pur, deterministe :
 * l'ordre est toujours derive de TOOL_PRIORITY, jamais d'un ordre
 * d'insertion variable (Object.keys n'est pas fiable d'un appel a
 * l'autre selon les moteurs ; on impose explicitement l'ordre ici).
 */
export function planToolUsage({ detection, availableTools = null } = {}) {
  const d = detection || {};
  const detectedTools = TOOL_PRIORITY.filter((tool) => d.needs?.[tool]);

  const allowSet = availableTools ? new Set(availableTools) : null;
  const toolsNeeded = [];
  const toolsForbidden = [];

  detectedTools.forEach((tool) => {
    if (allowSet && !allowSet.has(tool)) {
      toolsForbidden.push(tool);
    } else {
      toolsNeeded.push(tool);
    }
  });

  // internal_knowledge est toujours optionnel/disponible (jamais forbidden,
  // jamais bloquant) — fallback de base du LLM.
  const toolsOptional = toolsNeeded.includes(TOOLS.INTERNAL_KNOWLEDGE)
    ? []
    : [TOOLS.INTERNAL_KNOWLEDGE];

  const primaryTool = toolsNeeded.find((t) => t !== TOOLS.INTERNAL_KNOWLEDGE) || toolsNeeded[0] || TOOLS.INTERNAL_KNOWLEDGE;

  const toolSequence = toolsNeeded.slice();
  const parallelTools = toolsNeeded.filter((t) => PARALLELIZABLE.has(t));

  const requiresToolExecution = toolsNeeded.some((t) => t !== TOOLS.INTERNAL_KNOWLEDGE);

  return {
    toolsNeeded,
    toolsOptional,
    toolsForbidden,
    primaryTool,
    toolSequence,
    parallelTools,
    requiresToolExecution,
    requiresClarification: Boolean(d.requiresClarification),
    requiresUserFile: Boolean(d.requiresUserFile),
    requiresUserImage: Boolean(d.requiresUserImage),
    confidence: Number.isFinite(d.confidence) ? d.confidence : 0.5,
    reasons: d.reasons || {}
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. buildToolExecutionPolicy — bloc court destine au system prompt.
// ─────────────────────────────────────────────────────────────────────────

function pickLang(language) {
  return language === 'en' ? 'en' : 'fr';
}

const POLICY_TEXT = {
  needsUserFile: {
    fr: "Aucun fichier n'a été fourni alors que l'analyse d'un document est demandée : demande explicitement à l'utilisateur de le téléverser plutôt que d'inventer son contenu.",
    en: 'No file was provided although document analysis was requested: explicitly ask the user to upload it rather than inventing its content.'
  },
  needsUserImage: {
    fr: "Aucune image n'a été fournie alors que son analyse est demandée : demande explicitement à l'utilisateur de la fournir plutôt que d'inventer son contenu.",
    en: 'No image was provided although image analysis was requested: explicitly ask the user to provide it rather than inventing its content.'
  },
  clarification: {
    fr: "Pose une question de clarification : l'outil nécessaire n'est pas disponible ou la demande est ambiguë. N'invente jamais un résultat d'outil non exécuté.",
    en: 'Ask a clarifying question: the required tool is unavailable or the request is ambiguous. Never invent the result of an unexecuted tool.'
  },
  exportReady: {
    fr: 'Prépare une réponse structurée prête pour export dans le format demandé.',
    en: 'Prepare a structured answer ready for export in the requested format.'
  },
  calculatorOnly: {
    fr: 'Effectue le calcul avec précision et montre le résultat clairement.',
    en: 'Perform the calculation precisely and show the result clearly.'
  },
  toolsForbiddenNotice: {
    fr: 'Certains outils détectés comme utiles ne sont pas disponibles dans ce contexte : ne simule jamais leur exécution.',
    en: 'Some tools detected as useful are unavailable in this context: never simulate their execution.'
  }
};

/**
 * Construit la politique d'execution d'outils (texte court injectable dans
 * le system prompt) a partir du plan d'outillage resolu.
 */
export function buildToolExecutionPolicy({ plan, language } = {}) {
  const p = plan || {};
  const lang = pickLang(language);
  const directives = [];

  if (p.requiresUserFile) directives.push(POLICY_TEXT.needsUserFile[lang]);
  if (p.requiresUserImage) directives.push(POLICY_TEXT.needsUserImage[lang]);
  if (p.requiresClarification) directives.push(POLICY_TEXT.clarification[lang]);
  if (p.toolsNeeded?.some((t) => String(t).startsWith('export_'))) directives.push(POLICY_TEXT.exportReady[lang]);
  if (p.primaryTool === TOOLS.CALCULATOR) directives.push(POLICY_TEXT.calculatorOnly[lang]);
  if (p.toolsForbidden?.length) directives.push(POLICY_TEXT.toolsForbiddenNotice[lang]);

  return {
    policyText: directives.filter(Boolean).join(' '),
    directives
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Flag gate + convenience.
// ─────────────────────────────────────────────────────────────────────────

export function isToolPlannerEnabled(env) {
  return String(env?.TOOL_PLANNER_ENABLED || 'false').toLowerCase() === 'true';
}

/**
 * Convenience : detectToolNeeds + planToolUsage + buildToolExecutionPolicy
 * en un seul appel. Pure, sans reseau, deterministe.
 */
export function planTools(input = {}) {
  const detection = detectToolNeeds(input);
  const plan = planToolUsage({ detection, availableTools: input.availableTools || null });
  const policy = buildToolExecutionPolicy({ plan, language: input.language });
  return { detection, plan, policy };
}
