// Response Quality Controller (RQC) -- Lot 7.
//
// Module pur, 100% local, aucune dependance DOM, aucun appel reseau/LLM.
// Intervient UNIQUEMENT entre la reponse finale du modele (deja passee par
// le Completion Guard) et l'envoi au frontend :
//
//   Prompt Orchestrator -> Model Router -> Completion Guard -> RQC -> Frontend
//
// Ne remplace ni ne modifie le renderer AST, le RAG, le Completion Guard ou
// les exports -- cf. cloudflare/worker-openrouter.js pour le point d'appel
// unique (apres `reply` final, avant construction de responseBody).

// --------------------------------------------------------------------------
// 1. Analyse qualite
// --------------------------------------------------------------------------

const EXPECTED_LENGTH_BY_FORMAT = {
  short_answer: 220,
  table: 500,
  list: 500,
  comparison_table: 700,
  long_document: 2200,
  code: 400,
  plan: 900,
  summary: 500,
  default: 250
};

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function analyzeMarkdownShape(text) {
  const headings = countMatches(text, /^#{1,6}\s+\S.*$/gm);
  const lists = countMatches(text, /^[ \t]*(?:[-*+]|\d+[.)])\s+\S.*$/gm);
  const tableRows = countMatches(text, /^[ \t]*\|.*\|[ \t]*$/gm);
  const quotes = countMatches(text, /^[ \t]*>\s?.*$/gm);
  const codeFences = countMatches(text, /^[ \t]*```/gm);
  const bold = countMatches(text, /\*\*[^*\n]+\*\*/g);
  const italic = countMatches(text, /(?<!\*)\*[^*\n]+\*(?!\*)/g);

  return {
    headings,
    lists,
    tables: tableRows >= 2 ? 1 : 0,
    quotes,
    code: Math.floor(codeFences / 2),
    bold,
    italic
  };
}

function resolveExpectedLength(expectedFormat) {
  return EXPECTED_LENGTH_BY_FORMAT[expectedFormat] || EXPECTED_LENGTH_BY_FORMAT.default;
}

// Ratio minimal (actual/expected) en-dessous duquel une reponse est jugee
// "trop courte". Plus bas pour les formats naturellement brefs (reponse
// courte) que pour les formats ou la longueur attendue est un vrai signal
// de completude (document long, plan d'action...).
const MIN_LENGTH_RATIO_BY_FORMAT = {
  short_answer: 0.05,
  table: 0.2,
  list: 0.2,
  comparison_table: 0.25,
  long_document: 0.35,
  code: 0.15,
  plan: 0.3,
  summary: 0.2,
  default: 0.15
};

function resolveMinLengthRatio(expectedFormat) {
  return MIN_LENGTH_RATIO_BY_FORMAT[expectedFormat] ?? MIN_LENGTH_RATIO_BY_FORMAT.default;
}

function analyzeLength(text, expectedFormat) {
  const expected = resolveExpectedLength(expectedFormat);
  const actual = text.length;
  const ratio = expected > 0 ? Math.round((actual / expected) * 100) / 100 : null;
  return { expected, actual, ratio };
}

function analyzeStructure(text, markdown) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const intro = blocks.length > 0 && !/^#{1,6}\s/.test(blocks[0]);
  const sections = markdown.headings >= 1 || blocks.length >= 2;
  const lastBlock = blocks[blocks.length - 1] || '';
  const conclusion = blocks.length >= 2 && lastBlock.length > 0 && !/^[ \t]*\|/.test(lastBlock);
  return { intro, sections, conclusion };
}

const CITATION_PATTERN = /\(\d+\)|\[\d+\]/;
const SOURCES_PATTERN = /(^|\n)\s*(#{1,6}\s*)?(sources?|r[ée]f[ée]rences?)\s*:?\s*(\n|$)|https?:\/\//i;

function analyzeCitations(text, { requiresSources = false } = {}) {
  return {
    requested: Boolean(requiresSources),
    present: CITATION_PATTERN.test(text)
  };
}

function analyzeSources(text, { needsRag = false, needsWeb = false } = {}) {
  return {
    requested: Boolean(needsRag || needsWeb),
    present: SOURCES_PATTERN.test(text)
  };
}

// Plus de 3 lignes "pleines" consecutives sans aucune ligne vide entre elles
// (heuristique "aucun saut de ligne" / paragraphe geant non structure).
function hasTooManyConsecutiveLines(text, threshold = 3) {
  const lines = text.split('\n');
  let streak = 0;
  for (const line of lines) {
    if (line.trim().length > 0) {
      streak += 1;
      if (streak > threshold) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

function hasGiantParagraph(text, charThreshold = 600) {
  const blocks = text.split(/\n{2,}/);
  return blocks.some((block) => block.replace(/\n/g, ' ').trim().length > charThreshold && !/^[ \t]*[|#>-]/.test(block.trim()));
}

const TRUNCATION_TRAILING_CHARS = [':', '-', '*', '|', '(', ',', ';', '--', '/'];

function endsAbruptly(text) {
  const trimmed = text.trimEnd();
  if (!trimmed) return true;
  const lastChar = trimmed[trimmed.length - 1];
  if (TRUNCATION_TRAILING_CHARS.includes(lastChar)) return true;
  // Mot manifestement coupe : dernier "mot" suivi d'aucune ponctuation finale
  // et tronque par un caractere non alphabetique inhabituel, ou se termine
  // sans aucune ponctuation de fin de phrase alors que le texte est long.
  const lastWordMatch = trimmed.match(/([A-Za-zÀ-ÿ]{1,2})$/);
  if (lastWordMatch && trimmed.length > 40 && !/[.!?…)”"'`]$/.test(trimmed)) {
    const before = trimmed.slice(0, -lastWordMatch[0].length);
    if (/\s$/.test(before) === false && before.length > 0) return true;
  }
  return false;
}

function hasUnbalancedCodeFences(text) {
  const fenceCount = countMatches(text, /^[ \t]*```/gm);
  return fenceCount % 2 !== 0;
}

function hasUnclosedTable(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^\|.*\|$/.test(line)) {
      const next = (lines[i + 1] || '').trim();
      const isHeaderRow = i === 0 || (lines[i - 1] || '').trim() === '' || !/^\|.*\|$/.test((lines[i - 1] || '').trim());
      if (isHeaderRow && !/^\|?[\s:-]+\|[\s:|-]*$/.test(next)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Detecte automatiquement les problemes listes dans le cahier des charges
 * Lot 7 (point 3). Chaque issue est un identifiant stable (string), utilise
 * a la fois pour le scoring et pour l'agregation back-office (top problemes).
 */
function detectIssues(text, markdown, length, structure, citations, sources, intent = {}) {
  const issues = [];
  const trimmed = String(text || '').trim();

  if (!trimmed) {
    issues.push('empty_response');
    return issues;
  }

  if (markdown.headings === 0 && length.expected >= EXPECTED_LENGTH_BY_FORMAT.long_document) {
    issues.push('no_heading');
  }

  if (intent.requiresTable && markdown.tables === 0) {
    issues.push('table_requested_but_missing');
  }
  if ((intent.expectedFormat === 'list') && markdown.lists === 0) {
    issues.push('list_requested_but_missing');
  }
  if (citations.requested && !citations.present) {
    issues.push('citation_requested_but_missing');
  }
  if (intent.expectedFormat === 'code' && markdown.code === 0) {
    issues.push('code_requested_but_missing');
  }
  if (sources.requested && !sources.present) {
    issues.push('sources_requested_but_missing');
  }

  if (length.ratio !== null && length.ratio < resolveMinLengthRatio(intent.expectedFormat)) {
    issues.push('response_too_short');
  }

  if (hasGiantParagraph(trimmed)) {
    issues.push('giant_paragraph');
  }

  if (!trimmed.includes('\n') && trimmed.length > 400) {
    issues.push('no_line_break');
  }

  if (hasTooManyConsecutiveLines(trimmed, 3)) {
    issues.push('too_many_consecutive_lines');
  }

  if (hasUnbalancedCodeFences(trimmed) || hasUnclosedTable(trimmed)) {
    issues.push('broken_markdown');
  }

  if (endsAbruptly(trimmed)) {
    issues.push('incomplete_ending');
  }

  // Conclusion manquante : uniquement pertinent pour les formats structures
  // ou une fermeture est explicitement attendue (document long, plan
  // d'action) ET ou plusieurs sections existent deja (sinon rien a
  // conclure). Detecte l'ABSENCE d'un titre de cloture identifiable, pas
  // juste "le dernier paragraphe existe" (heuristique trop permissive).
  // Sert au routage IMPROVE_WITH_MODEL ("reponse utile mais incomplete")
  // plutot qu'a un simple repair local (qui ne peut pas inventer de texte).
  const expectsConclusion = (intent.expectedFormat === 'long_document' || intent.expectedFormat === 'plan') && markdown.headings >= 2;
  if (expectsConclusion) {
    const headingTexts = text.match(/^#{1,6}\s+.*$/gm) || [];
    const hasConcludingHeading = headingTexts.some((heading) => /conclusion|synth[eè]se|r[eé]sum[eé]|summary|closing/i.test(heading));
    if (!hasConcludingHeading) {
      issues.push('missing_conclusion');
    }
  }

  return issues;
}

// Issues qui signalent un CONTENU manquant/incomplet (format non respecte)
// plutot qu'un simple defaut mecanique de mise en forme. Une reponse qui
// porte au moins une de ces issues, mais qui contient par ailleurs du
// contenu utile, est candidate a IMPROVE_WITH_MODEL plutot qu'a un simple
// repair local (qui ne peut pas faire apparaitre un tableau/une conclusion
// manquante) ni a un retry complet (le contenu existant n'est pas a jeter).
const MISSING_REQUIREMENT_ISSUES = [
  'no_heading',
  'table_requested_but_missing',
  'list_requested_but_missing',
  'citation_requested_but_missing',
  'code_requested_but_missing',
  'sources_requested_but_missing',
  'missing_conclusion'
];

// Issues purement mecaniques (mise en forme), reparables localement sans
// jamais avoir besoin de regenerer ou completer du contenu.
const REPAIRABLE_ISSUES = [
  'giant_paragraph',
  'no_line_break',
  'too_many_consecutive_lines',
  'broken_markdown',
  'incomplete_ending'
];

const ISSUE_LABELS_FR = {
  no_heading: 'Aucun titre alors qu’un document structuré est attendu',
  table_requested_but_missing: 'Tableau demandé mais absent',
  list_requested_but_missing: 'Liste demandée mais absente',
  citation_requested_but_missing: 'Citation demandée mais absente',
  code_requested_but_missing: 'Extrait de code demandé mais absent',
  sources_requested_but_missing: 'Sources demandées mais absentes',
  missing_conclusion: 'Conclusion manquante',
  response_too_short: 'Réponse trop courte par rapport au format attendu',
  giant_paragraph: 'Paragraphe trop long, non structuré',
  no_line_break: 'Aucun saut de ligne dans une réponse longue',
  too_many_consecutive_lines: 'Plus de 3 lignes consécutives sans retour à la ligne',
  broken_markdown: 'Markdown cassé (bloc de code ou tableau non fermé)',
  incomplete_ending: 'La réponse semble se terminer de façon incomplète'
};

const ISSUE_LABELS_EN = {
  no_heading: 'No heading even though a structured document is expected',
  table_requested_but_missing: 'Table requested but missing',
  list_requested_but_missing: 'List requested but missing',
  citation_requested_but_missing: 'Citation requested but missing',
  code_requested_but_missing: 'Code snippet requested but missing',
  sources_requested_but_missing: 'Sources requested but missing',
  missing_conclusion: 'Missing conclusion',
  response_too_short: 'Response too short for the expected format',
  giant_paragraph: 'Paragraph too long, not structured',
  no_line_break: 'No line break in a long response',
  too_many_consecutive_lines: 'More than 3 consecutive lines without a line break',
  broken_markdown: 'Broken Markdown (unclosed code block or table)',
  incomplete_ending: 'The response appears to end incompletely'
};

function labelForIssue(issue, language) {
  const labels = language === 'en' ? ISSUE_LABELS_EN : ISSUE_LABELS_FR;
  return labels[issue] || issue;
}

/**
 * Separe une liste d'issues en "contraintes manquantes" (contenu/format non
 * respecte -- candidates a IMPROVE_WITH_MODEL) et "problemes mecaniques"
 * (mise en forme -- reparables localement). Utilise par decideQualityAction
 * ET par buildImproveSystemInstruction (memes categories, une seule source
 * de verite).
 */
export function classifyIssues(issues = []) {
  const missingRequirements = issues.filter((issue) => MISSING_REQUIREMENT_ISSUES.includes(issue));
  const repairable = issues.filter((issue) => REPAIRABLE_ISSUES.includes(issue) || !MISSING_REQUIREMENT_ISSUES.includes(issue));
  return { missingRequirements, repairable };
}

/**
 * Version "label humain" des contraintes manquantes/problemes detectes,
 * pretes a etre injectees dans une instruction systeme ou affichees dans le
 * back-office.
 */
export function deriveMissingRequirements(issues = [], language = 'fr') {
  return issues.filter((issue) => MISSING_REQUIREMENT_ISSUES.includes(issue)).map((issue) => labelForIssue(issue, language));
}

/**
 * Analyse complete d'une reponse, sans aucun appel reseau/IA -- purement
 * deterministe (memes entrees => meme sortie, toujours).
 */
export function analyzeResponseQuality(text, { intent = {}, promptProfile = '', expectedFormat = '' } = {}) {
  const safeText = String(text || '');
  const effectiveExpectedFormat = expectedFormat || intent?.expectedFormat || '';

  const markdown = analyzeMarkdownShape(safeText);
  const length = analyzeLength(safeText, effectiveExpectedFormat);
  const structure = analyzeStructure(safeText, markdown);
  const citations = analyzeCitations(safeText, intent);
  const sources = analyzeSources(safeText, intent);
  const issues = detectIssues(safeText, markdown, length, structure, citations, sources, { ...intent, expectedFormat: effectiveExpectedFormat });

  const score = computeQualityScore({ markdown, length, structure, citations, sources, issues });
  const grade = computeGrade(score);
  const { missingRequirements, repairable } = classifyIssues(issues);

  return {
    score,
    grade,
    text: safeText,
    promptProfile: promptProfile || '',
    markdown,
    length,
    structure,
    citations,
    sources,
    issues,
    missingRequirements,
    repairableIssues: repairable
  };
}

// --------------------------------------------------------------------------
// 4. Score global (deterministe, aucun appel IA)
// --------------------------------------------------------------------------

const ISSUE_PENALTIES = {
  empty_response: 100,
  no_heading: 8,
  table_requested_but_missing: 20,
  list_requested_but_missing: 18,
  citation_requested_but_missing: 15,
  code_requested_but_missing: 20,
  sources_requested_but_missing: 12,
  response_too_short: 25,
  giant_paragraph: 10,
  no_line_break: 12,
  too_many_consecutive_lines: 8,
  broken_markdown: 20,
  incomplete_ending: 20,
  missing_conclusion: 10
};

export function computeQualityScore({ issues = [] } = {}) {
  if (issues.includes('empty_response')) return 0;
  let score = 100;
  for (const issue of issues) {
    score -= ISSUE_PENALTIES[issue] || 5;
  }
  return Math.max(0, Math.min(100, score));
}

export function computeGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  return 'D';
}

// --------------------------------------------------------------------------
// 5. Politique de decision
// --------------------------------------------------------------------------

export const QUALITY_ACTIONS = {
  SEND: 'SEND',
  AUTO_REPAIR: 'AUTO_REPAIR',
  IMPROVE_WITH_MODEL: 'IMPROVE_WITH_MODEL',
  // RETRY_FULL : reponse vide ou trop pauvre pour etre amelioree --
  // regeneration complete. RETRY_MODEL est conserve comme alias historique
  // (Lot 7 initial) pour ne rien casser cote appelants existants.
  RETRY_FULL: 'RETRY_FULL'
};
QUALITY_ACTIONS.RETRY_MODEL = QUALITY_ACTIONS.RETRY_FULL;

// Longueur en-dessous de laquelle une reponse non vide est neanmoins
// consideree trop pauvre pour etre "amelioree" (rien de substantiel a
// reecrire) -- bascule sur RETRY_FULL plutot que IMPROVE_WITH_MODEL.
const USELESS_RESPONSE_MAX_LENGTH = 20;

function isUselessResponse(text, issues) {
  const trimmed = String(text || '').trim();
  if (!trimmed || issues.includes('empty_response')) return true;
  return trimmed.length <= USELESS_RESPONSE_MAX_LENGTH;
}

/**
 * Decide quoi faire d'une analyse (Lot 7 + Lot 7.1 Auto-Improver) :
 *
 *  - reponse vide / hors sujet (rien d'exploitable)      -> RETRY_FULL
 *  - reponse utile mais format non respecte (contraintes
 *    manquantes : titre/tableau/liste/citation/code/
 *    sources/conclusion)                                 -> IMPROVE_WITH_MODEL
 *  - reponse correcte sur le fond, juste des defauts
 *    mecaniques de mise en forme                         -> AUTO_REPAIR
 *  - grade A/B                                            -> SEND
 *
 * `alreadyRetried` et `alreadyImproved` empechent toute boucle : un seul
 * retry complet ET une seule amelioration modele au maximum par requete
 * (cf. points 7 et "maximum 1 amelioration" du cahier des charges).
 */
export function decideQualityAction(analysis, { alreadyRetried = false, alreadyImproved = false } = {}) {
  const issues = analysis?.issues || [];
  const score = analysis?.score ?? 0;
  const grade = analysis?.grade || computeGrade(score);
  const hasText = typeof analysis?.text === 'string';

  // Rien d'exploitable : texte vide/quasi-vide, ou grade D sans le moindre
  // signal de cause connue (cas d'usage degrade : analyse minimale fournie
  // sans `text`/`issues`) -- on suppose une reponse hors sujet/irrecuperable.
  const useless = issues.includes('empty_response')
    || (hasText && isUselessResponse(analysis.text, issues))
    || (grade === 'D' && issues.length === 0);

  if (useless) {
    return alreadyRetried ? QUALITY_ACTIONS.AUTO_REPAIR : QUALITY_ACTIONS.RETRY_FULL;
  }

  // Une contrainte de format manquante (titre/tableau/liste/citation/code/
  // sources/conclusion) n'est jamais un simple SEND, meme si le score reste
  // eleve par ailleurs : le format demande n'est pas respecte, ce qui
  // justifie une amelioration ciblee plutot qu'un envoi tel quel.
  const { missingRequirements } = classifyIssues(issues);
  if (missingRequirements.length > 0) {
    return alreadyImproved ? QUALITY_ACTIONS.AUTO_REPAIR : QUALITY_ACTIONS.IMPROVE_WITH_MODEL;
  }

  if (grade === 'A' || grade === 'B') return QUALITY_ACTIONS.SEND;

  // grade C/D sans contrainte de format manquante : uniquement des defauts
  // mecaniques (markdown casse, paragraphe geant, fin abrupte...) -> repair
  // local suffit, pas besoin de solliciter le modele de nouveau.
  return QUALITY_ACTIONS.AUTO_REPAIR;
}

// --------------------------------------------------------------------------
// 6. Auto Repair -- uniquement des traitements locaux, jamais de contenu
// metier modifie, jamais de nouvel appel LLM.
// --------------------------------------------------------------------------

function closeUnbalancedCodeFences(text) {
  const fenceCount = countMatches(text, /^[ \t]*```/gm);
  if (fenceCount % 2 === 0) return text;
  return `${text.trimEnd()}\n\`\`\``;
}

function closeUnclosedTables(text) {
  const lines = text.split('\n');
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    output.push(lines[i]);
    const trimmedLine = lines[i].trim();
    if (/^\|.*\|$/.test(trimmedLine)) {
      const next = (lines[i + 1] || '').trim();
      const prev = (lines[i - 1] || '').trim();
      const isHeaderRow = i === 0 || prev === '' || !/^\|.*\|$/.test(prev);
      if (isHeaderRow && !/^\|?[\s:-]+\|[\s:|-]*$/.test(next)) {
        const columnCount = trimmedLine.split('|').filter((part, idx, arr) => !(idx === 0 && part === '') && !(idx === arr.length - 1 && part === '')).length;
        output.push(`|${' --- |'.repeat(Math.max(1, columnCount))}`);
      }
    }
  }
  return output.join('\n');
}

function removeConsecutiveDuplicateLines(text) {
  const lines = text.split('\n');
  const output = [];
  for (const line of lines) {
    const prev = output[output.length - 1];
    const isMeaningful = line.trim().length > 0;
    if (isMeaningful && prev !== undefined && prev.trim() === line.trim()) continue;
    output.push(line);
  }
  return output.join('\n');
}

function removeEmptyHeadings(text) {
  return text
    .split('\n')
    .filter((line) => !/^[ \t]*#{1,6}[ \t]*$/.test(line))
    .join('\n');
}

function removeEmptyListItems(text) {
  return text
    .split('\n')
    .filter((line) => !/^[ \t]*(?:[-*+]|\d+[.)])[ \t]*$/.test(line))
    .join('\n');
}

function normalizeWhitespace(text) {
  return text
    .replace(/[ \t]+/g, (match) => (match.includes('\t') ? ' ' : match.length > 1 ? ' ' : match))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]+$/g, '');
}

function ensureBlankLineBeforeHeadings(text) {
  const lines = text.split('\n');
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isHeading = /^#{1,6}\s+\S/.test(line);
    if (isHeading && output.length > 0 && output[output.length - 1].trim() !== '') {
      output.push('');
    }
    output.push(line);
  }
  return output.join('\n');
}

function ensureBlankLineBeforeTables(text) {
  const lines = text.split('\n');
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isTableRow = /^[ \t]*\|.*\|[ \t]*$/.test(line);
    const prevWasTableRow = output.length > 0 && /^[ \t]*\|.*\|[ \t]*$/.test(output[output.length - 1]);
    if (isTableRow && !prevWasTableRow && output.length > 0 && output[output.length - 1].trim() !== '') {
      output.push('');
    }
    output.push(line);
  }
  return output.join('\n');
}

function closeAbruptEnding(text) {
  const trimmed = text.trimEnd();
  if (!trimmed) return text;
  const lastChar = trimmed[trimmed.length - 1];
  if (TRUNCATION_TRAILING_CHARS.includes(lastChar)) {
    return `${trimmed.slice(0, -1).trimEnd()}…`;
  }
  return text;
}

/**
 * Reparation 100% locale d'une reponse jugee imparfaite (grade C / retry
 * epuise). N'ajoute, ne retire et ne reformule JAMAIS le contenu metier --
 * uniquement de la structure Markdown et des espacements.
 */
export function repairResponse(text, analysis = null) {
  let repaired = String(text || '');
  if (!repaired.trim()) return repaired;

  repaired = removeConsecutiveDuplicateLines(repaired);
  repaired = removeEmptyHeadings(repaired);
  repaired = removeEmptyListItems(repaired);
  repaired = closeUnbalancedCodeFences(repaired);
  repaired = closeUnclosedTables(repaired);
  repaired = ensureBlankLineBeforeHeadings(repaired);
  repaired = ensureBlankLineBeforeTables(repaired);
  repaired = normalizeWhitespace(repaired);
  repaired = closeAbruptEnding(repaired);

  return repaired.trim();
}

// --------------------------------------------------------------------------
// 7. Retry -- instruction systeme supplementaire (le worker appelant decide
// comment relancer le modele ; ce module ne fait aucun appel reseau).
// --------------------------------------------------------------------------

export const RETRY_SYSTEM_INSTRUCTION_FR = 'La réponse précédente ne respecte pas le format demandé.\nRéécris uniquement la réponse en respectant strictement le format attendu.';
export const RETRY_SYSTEM_INSTRUCTION_EN = 'The previous answer does not respect the requested format.\nRewrite only the answer, strictly respecting the expected format.';

export function buildRetrySystemInstruction(language) {
  return language === 'en' ? RETRY_SYSTEM_INSTRUCTION_EN : RETRY_SYSTEM_INSTRUCTION_FR;
}

// --------------------------------------------------------------------------
// 7.1 Auto-Improver -- IMPROVE_WITH_MODEL : la reponse contient du contenu
// utile mais ne respecte pas le format attendu. Au lieu d'un retry complet
// (qui jetterait le contenu utile), on demande au modele de REECRIRE la
// reponse existante en corrigeant uniquement les problemes identifies.
// Ce module ne fait aucun appel reseau : il construit seulement
// l'instruction systeme ; l'appel est de la responsabilite du worker (cf.
// worker-openrouter.js), qui reutilise le meme modele/temperature/contexte.
// --------------------------------------------------------------------------

function buildIssuesBulletList(issues, language) {
  if (!issues.length) return language === 'en' ? '- (none)' : '- (aucun)';
  return issues.map((issue) => `- ${labelForIssue(issue, language)}`).join('\n');
}

/**
 * Construit l'instruction systeme d'amelioration (texte exact demande dans
 * le cahier des charges, avec les listes de problemes/contraintes injectees
 * dynamiquement). repairableIssues et missingRequirements sont des
 * tableaux d'identifiants d'issues (cf. classifyIssues()).
 */
export function buildImproveSystemInstruction(language, { repairableIssues = [], missingRequirements = [] } = {}) {
  if (language === 'en') {
    return [
      'The previous answer contains useful information but does not respect all the constraints.',
      'Rewrite a final, complete and better structured version.',
      'Only fix the following issues:',
      buildIssuesBulletList(repairableIssues, language),
      'Missing constraints:',
      buildIssuesBulletList(missingRequirements, language),
      'Keep all the useful information.',
      'Do not invent sources.',
      'Strictly respect the requested Markdown format.'
    ].join('\n');
  }
  return [
    'La réponse précédente contient des informations utiles mais ne respecte pas toutes les contraintes.',
    'Réécris une version finale complète et mieux structurée.',
    'Corrige uniquement les problèmes suivants :',
    buildIssuesBulletList(repairableIssues, language),
    'Contraintes manquantes :',
    buildIssuesBulletList(missingRequirements, language),
    'Conserve les informations utiles.',
    "N’invente pas de sources.",
    'Respecte strictement le Markdown demandé.'
  ].join('\n');
}

// --------------------------------------------------------------------------
// Pipeline complet (sans IO) -- utilise par le worker pour decider quoi
// faire de la reponse, sans dupliquer la logique de decision a chaque appel.
// --------------------------------------------------------------------------

export function isRqcEnabled(env) {
  return String(env?.RESPONSE_QUALITY_CONTROLLER_ENABLED ?? 'true').toLowerCase() !== 'false';
}

/**
 * Evalue une reponse et determine l'action a prendre, sans effectuer
 * l'action elle-meme (le retry necessite un appel reseau, hors de portee de
 * ce module pur -- cf. worker-openrouter.js pour l'orchestration complete).
 */
export function evaluateResponse(text, { intent, promptProfile, expectedFormat, alreadyRetried = false, alreadyImproved = false } = {}) {
  const analysis = analyzeResponseQuality(text, { intent, promptProfile, expectedFormat });
  const action = decideQualityAction(analysis, { alreadyRetried, alreadyImproved });
  return { analysis, action };
}
