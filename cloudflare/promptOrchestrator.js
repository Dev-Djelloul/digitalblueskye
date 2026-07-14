// Prompt Orchestrator — couche de DECISION en amont du Model Router.
//
// Role : analyser l'intention utilisateur (regles, sans LLM), planifier les
// capacites necessaires (RAG/web/memoire/tokens/profil), puis composer un
// prompt systeme MODULAIRE et compact (seulement les blocs utiles) au lieu du
// gros prompt monolithique. Ne touche a rien d'autre : RAG, Tavily, Vectorize,
// Model Router, Completion Guard et le renderer restent inchanges.
//
// 100% pur et testable (cf. promptOrchestrator.test.mjs) : aucune dependance
// reseau, aucun acces D1. L'integration cote worker est gated par un flag et
// retombe sur le comportement actuel en cas d'erreur.

// ─────────────────────────────────────────────────────────────────────────
// 1. detectUserIntent — analyse par regles
// ─────────────────────────────────────────────────────────────────────────

const RX = {
  document: /\b(r[ée]dige|r[ée]diger|[ée]cris|[ée]crire|r[ée]dactionn?e|produis|g[ée]n[èe]re\s+(?:un|une|le|la|moi)|draft|write\s+(?:me|a|an)|compose|fiche\s+projet|guide\s+complet|document\s+complet|rapport\s+complet|note\s+de\s+synth[èe]se|livrable)\b/i,
  longHint: /\b(complet|complete|d[ée]taill[ée]|exhaustif|exhaustive|approfondi|long|in-?depth|comprehensive|thorough|step[-\s]?by[-\s]?step|guide|manuel|tutoriel|tutorial|rapport|report|dossier|white\s*paper)\b/i,
  comparison: /\b(compare|comparer|comparaison|comparatif|versus|\bvs\b|diff[ée]rence[s]?\s+entre|avantages?\s+et\s+inconv[ée]nients|pros?\s+and\s+cons|benchmark)\b/i,
  summary: /\b(r[ée]sume|r[ée]sumer|r[ée]sum[ée]|synth[èe]tise|synth[èe]se|summari[sz]e|summary|tl;?dr|en\s+bref|points?\s+cl[ée]s)\b/i,
  planning: /\b(que\s+(?:dois|doit|devrais)[-\s]?je\s+faire|que\s+faire|plan\s+d['e\s]action|roadmap|feuille\s+de\s+route|planifie[rz]?|planning|priorit[ée]s?|prioriser|prochaines?\s+[ée]tapes?|next\s+steps?|what\s+should\s+i\s+do|to-?do|backlog)\b/i,
  // Formulation de RECUPERATION d'information depuis une source/projet
  // (verbe "dire/contenir/indiquer..."), distincte d'une demande d'action.
  ragQuestion: /\b(que\s+(?:dit|disent|contient|contiennent|indique|pr[ée]cise|mentionne|raconte)|selon\s+(?:le|la|ce|mon|mes|cette)|d['e]apr[èe]s\s+(?:le|la|ce|mon|mes|cette))\b/i,
  technical: /\b(corrige|corriger|bug|d[ée]bogue|debug|erreur|exception|stack\s*trace|refactor|optimise\s+le\s+code|code|fonction|m[ée]thode|api|endpoint|regex|sql|requ[êe]te|compile|typescript|javascript|python|deploy|d[ée]ploie)\b/i,
  table: /\b(tableau|table|grille|matrice|colonnes?|en\s+ligne[s]?\s+et\s+colonnes?|sous\s+forme\s+de\s+tableau|in\s+a\s+table)\b/i,
  webRecency: /\b(aujourd['\s]hui|maintenant|actuel|actuelle|actuellement|r[ée]cent|r[ée]cente|derni[èe]res?\s+(?:nouvelles?|actualit[ée]s?|infos?)|actualit[ée]s?|en\s+202\d|cette\s+ann[ée]e|ce\s+mois|prix\s+actuel|cours\s+(?:de|du)|latest|current|recent|today|right\s+now|breaking|news|live)\b/i,
  ragProject: /\b(le\s+projet|ce\s+projet|du\s+projet|dans\s+le\s+projet|ce\s+document|ce\s+fichier|cette\s+source|selon\s+(?:le\s+projet|la\s+doc|le\s+document)|que\s+dit\s+(?:le|la|ce)|d['e]apr[èe]s\s+(?:le|la|ce|mes)\s+(?:projet|document|source|fichier|note)|in\s+(?:the|my)\s+project|the\s+document\s+says)\b/i,
  projectAnalysis: /\b(analyse\s+(?:le|du|ce)\s+projet|[ée]tat\s+du\s+projet|maturit[ée]\s+du\s+projet|audit\s+(?:du|de)\s+projet|sant[ée]\s+du\s+projet|diagnostic\s+projet)\b/i,
  creative: /\b(imagine|invente|histoire|nouvelle|po[èe]me|po[ée]sie|fiction|sc[ée]nario|cr[ée]atif|brainstorm|id[ée]es?\s+originales?|creative|story|poem)\b/i,
  question: /(\?|^\s*(qu[e'i]|comment|pourquoi|quel|quelle|quels|quelles|o[ùu]|quand|combien|est-ce|peux-tu|peut-on|what|how|why|which|where|when|who|can\s+you|is\s+it|are\s+there|do\s+you))/i,
  frenchSignal: /[àâäéèêëîïôöùûüçœ]|\b(le|la|les|un|une|des|du|de|et|est|que|qui|pour|avec|dans|sur|je|tu|vous|nous|ceci|cela|quoi|comment|pourquoi)\b/i,
  englishSignal: /\b(the|and|is|are|of|to|for|with|in|on|what|how|why|which|please|can|you|this|that|should|i|we)\b/i
};

// Export additif (zero changement de comportement) : permet a d'autres
// modules purs (ex. capabilityPlanner.js, Lot 8) de reutiliser ces motifs au
// lieu de les redefinir — evite la duplication de regex entre couches de
// detection qui partagent des concepts (tableau, comparaison, planning...).
export { RX };

function detectLanguage(userMessage, providedLanguage) {
  if (providedLanguage === 'fr' || providedLanguage === 'en') return providedLanguage;
  const msg = String(userMessage || '');
  const fr = RX.frenchSignal.test(msg);
  const en = RX.englishSignal.test(msg);
  if (fr && !en) return 'fr';
  if (en && !fr) return 'en';
  return 'auto';
}

export function detectUserIntent({ userMessage = '', projectContext = null, hasRagSources = false, hasWebIntent = false, language } = {}) {
  const msg = String(userMessage || '');
  const trimmed = msg.trim();
  const reasons = [];
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;

  const flags = {
    document: RX.document.test(msg),
    longHint: RX.longHint.test(msg),
    comparison: RX.comparison.test(msg),
    summary: RX.summary.test(msg),
    planning: RX.planning.test(msg),
    technical: RX.technical.test(msg),
    table: RX.table.test(msg),
    webRecency: RX.webRecency.test(msg),
    ragProject: RX.ragProject.test(msg),
    projectAnalysis: RX.projectAnalysis.test(msg),
    creative: RX.creative.test(msg),
    question: RX.question.test(msg),
    ragQuestion: RX.ragQuestion.test(msg)
  };

  const needsWeb = Boolean(hasWebIntent || flags.webRecency);
  const needsRag = Boolean(hasRagSources || flags.ragProject || flags.projectAnalysis);
  // Vraie question de recuperation projet/source : "que dit le projet ...".
  const isRagRetrievalQuestion = Boolean(flags.ragQuestion && (needsRag || flags.ragProject));

  // Choix de l'intention primaire — ordre de priorite explicite (du plus
  // specifique/contraignant au plus generique).
  let primaryIntent = 'unknown';
  if (flags.technical) { primaryIntent = 'technical_help'; reasons.push('technical_keyword'); }
  else if (flags.projectAnalysis) { primaryIntent = 'project_analysis'; reasons.push('project_analysis_keyword'); }
  else if (isRagRetrievalQuestion) { primaryIntent = 'rag_query'; reasons.push('rag_retrieval_question'); }
  else if (flags.planning) { primaryIntent = 'planning'; reasons.push('planning_keyword'); }
  else if (flags.document) { primaryIntent = 'document_generation'; reasons.push('document_keyword'); }
  else if (flags.comparison) { primaryIntent = 'comparison'; reasons.push('comparison_keyword'); }
  else if (flags.summary) { primaryIntent = 'summary'; reasons.push('summary_keyword'); }
  else if (needsRag) { primaryIntent = 'rag_query'; reasons.push('rag_signal'); }
  else if (needsWeb) { primaryIntent = 'web_research'; reasons.push('web_signal'); }
  else if (flags.creative) { primaryIntent = 'creative'; reasons.push('creative_keyword'); }
  else if (flags.question) { primaryIntent = 'question'; reasons.push('interrogative'); }
  else if (trimmed && wordCount > 2) { primaryIntent = 'question'; reasons.push('default_statement'); }
  else if (trimmed) { primaryIntent = 'unknown'; reasons.push('too_short_ambiguous'); }

  // Format attendu.
  const requiresTable = Boolean(flags.table || flags.comparison);
  let expectedFormat = 'structured_answer';
  if (primaryIntent === 'document_generation') expectedFormat = 'long_document';
  else if (requiresTable) expectedFormat = 'table';
  else if (primaryIntent === 'planning') expectedFormat = 'checklist';
  else if (primaryIntent === 'technical_help') expectedFormat = 'step_by_step';
  else if (primaryIntent === 'summary') expectedFormat = 'structured_answer';
  else if (primaryIntent === 'project_analysis') expectedFormat = 'markdown_report';
  else if (primaryIntent === 'question' && wordCount <= 12 && !flags.longHint) expectedFormat = 'short_answer';

  if (requiresTable) reasons.push('table_requested');

  // Reponse longue attendue.
  const requiresLongAnswer = Boolean(
    primaryIntent === 'document_generation' ||
    primaryIntent === 'project_analysis' ||
    flags.longHint ||
    (primaryIntent === 'planning' && flags.longHint)
  );
  if (flags.longHint) reasons.push('long_hint');

  // Complexite.
  let complexity = 'medium';
  if (requiresLongAnswer || expectedFormat === 'long_document' || expectedFormat === 'markdown_report') complexity = 'high';
  else if (expectedFormat === 'short_answer' || (wordCount <= 8 && primaryIntent === 'question')) complexity = 'low';

  const requiresExportQuality = Boolean(
    primaryIntent === 'document_generation' ||
    primaryIntent === 'project_analysis' ||
    expectedFormat === 'long_document' ||
    expectedFormat === 'markdown_report'
  );

  const requiresSources = Boolean(needsRag || needsWeb);

  // Confiance : combien de signaux forts ont matche.
  const strongSignals = Object.values(flags).filter(Boolean).length + (needsRag ? 1 : 0) + (needsWeb ? 1 : 0);
  let confidence = 0.4;
  if (primaryIntent === 'unknown' || !trimmed) confidence = 0.15;
  else if (strongSignals >= 3) confidence = 0.9;
  else if (strongSignals === 2) confidence = 0.75;
  else if (strongSignals === 1) confidence = 0.6;
  if (!trimmed) { primaryIntent = 'unknown'; reasons.push('empty_message'); }

  return {
    primaryIntent,
    expectedFormat,
    complexity,
    needsRag,
    needsWeb,
    needsHistory: true,
    needsProjectMemory: Boolean(projectContext),
    requiresSources,
    requiresLongAnswer,
    requiresTable,
    requiresExportQuality,
    language: detectLanguage(userMessage, language),
    confidence,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. planCapabilities — du quoi (intent) au comment (capacites)
// ─────────────────────────────────────────────────────────────────────────

export function planCapabilities(intent, runtimeContext = {}) {
  const safeIntent = intent || {};
  const ragAvailable = runtimeContext.ragAvailable !== false;
  const webAvailable = runtimeContext.webAvailable !== false;

  const useRag = Boolean(safeIntent.needsRag && ragAvailable);
  const useWeb = Boolean(safeIntent.needsWeb && webAvailable);
  const useProjectMemory = Boolean(safeIntent.needsProjectMemory);
  const useHistory = safeIntent.needsHistory !== false;

  let preferredResponseLength = 'medium';
  if (safeIntent.requiresLongAnswer || safeIntent.expectedFormat === 'long_document' || safeIntent.expectedFormat === 'markdown_report') {
    preferredResponseLength = 'long';
  } else if (safeIntent.expectedFormat === 'short_answer' || safeIntent.complexity === 'low') {
    preferredResponseLength = 'short';
  }

  let preferredModelTier = 'balanced';
  if (preferredResponseLength === 'long' || safeIntent.complexity === 'high') preferredModelTier = 'strong';
  else if (preferredResponseLength === 'short' && safeIntent.complexity === 'low') preferredModelTier = 'fast';

  // Bornes alignees sur le worker (defaut 2000, plafond MAX_TOKENS_CEILING 8192).
  let maxTokensHint = 2200;
  if (preferredResponseLength === 'long') maxTokensHint = 4000;
  else if (preferredResponseLength === 'short') maxTokensHint = 1200;

  let temperatureHint = 0.35;
  if (safeIntent.primaryIntent === 'technical_help') temperatureHint = 0.2;
  else if (safeIntent.primaryIntent === 'creative') temperatureHint = 0.7;
  else if (safeIntent.primaryIntent === 'document_generation' || safeIntent.primaryIntent === 'project_analysis') temperatureHint = 0.3;

  // Completion Guard : utile des qu'on attend une reponse longue ou complexe.
  const useCompletionGuard = Boolean(
    preferredResponseLength === 'long' ||
    safeIntent.complexity === 'high' ||
    safeIntent.requiresExportQuality
  );

  // Profil de prompt — priorite explicite (un seul profil retenu).
  let promptProfile = 'default';
  if (safeIntent.primaryIntent === 'technical_help') promptProfile = 'technical';
  else if (safeIntent.primaryIntent === 'planning' || safeIntent.primaryIntent === 'project_analysis') promptProfile = 'project_manager';
  else if (safeIntent.primaryIntent === 'document_generation' || preferredResponseLength === 'long') promptProfile = 'long_document';
  else if (safeIntent.primaryIntent === 'comparison') promptProfile = 'comparison';
  else if (useRag) promptProfile = 'rag_grounded';
  else if (useWeb) promptProfile = 'web_grounded';

  return {
    useRag,
    useWeb,
    useProjectMemory,
    useHistory,
    useCompletionGuard,
    preferredResponseLength,
    preferredModelTier,
    maxTokensHint,
    temperatureHint,
    promptProfile
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. composeSystemPrompt — assemblage modulaire compact
// ─────────────────────────────────────────────────────────────────────────

function pickLang(language) {
  return language === 'en' ? 'en' : 'fr';
}

// Blocs de prompt compacts (FR/EN). Fideles aux regles critiques du prompt
// monolithique existant (cf. buildSystemPrompt dans worker-openrouter.js), mais
// condenses et inclus uniquement quand pertinents.
const BLOCKS = {
  identity: {
    fr: (date) => `Tu es l'assistant Digital Blue Skye. Date actuelle : ${date}. Tu aides à analyser, rechercher, comparer, planifier, rédiger et produire des livrables professionnels (chef de projet digital, produit, web, IA, UX, veille).`,
    en: (date) => `You are the Digital Blue Skye assistant. Current date: ${date}. You help analyze, research, compare, plan, write and produce professional deliverables (digital project, product, web, AI, UX, monitoring).`
  },
  language: {
    fr: "Langue : réponds en français si le message est en français ; en anglais seulement si le message l'est ou si l'utilisateur le demande.",
    en: 'Language: answer in the user\'s language; reply in English only when the user writes in or asks for English.'
  },
  styleShort: {
    fr: 'Style : réponse courte, directe et factuelle. Va droit au but, sans remplissage ni titres superflus.',
    en: 'Style: short, direct, factual answer. Get to the point, no filler or needless headings.'
  },
  styleMedium: {
    fr: 'Style : réponse structurée, professionnelle et directement exploitable. Paragraphes courts, listes utiles, sois précis et pédagogique.',
    en: 'Style: structured, professional, directly usable answer. Short paragraphs, useful lists, be precise and pedagogical.'
  },
  styleLong: {
    fr: 'Style : réponse longue et hiérarchisée. Titres clairs (##/###), sections aérées, listes 4-7 éléments, et un court bloc « À retenir » en fin.',
    en: 'Style: long, hierarchical answer. Clear headings (##/###), well-spaced sections, 4-7 item lists, and a short "Key takeaways" block at the end.'
  },
  markdown: {
    fr: "Markdown : un titre commence toujours sa propre ligne, avec une ligne vide avant et après — jamais collé à une phrase. Chaque élément numéroté (1., 2., 3.) sur sa propre ligne. Une ligne vide entre les sections.",
    en: 'Markdown: a heading always starts its own line, with a blank line before and after — never glued to a sentence. Each numbered item (1., 2., 3.) on its own line. A blank line between sections.'
  },
  table: {
    fr: "Tableaux : un vrai tableau Markdown avec ligne d'en-tête, ligne de séparation |---|, puis une ligne par élément. Chaque ligne du tableau tient sur UNE seule ligne physique (utilise <br> dans une cellule si besoin), jamais de liste à puces dans une cellule.",
    en: 'Tables: a real Markdown table with a header row, a |---| separator row, then one row per item. Each table row fits on ONE physical line (use <br> inside a cell if needed), never a bullet list inside a cell.'
  },
  comparison: {
    fr: 'Comparatif : présente la comparaison sous forme de vrai tableau Markdown (une ligne par élément, une colonne par critère), jamais une liste à puces qui tiendrait lieu de tableau.',
    en: 'Comparison: present it as a real Markdown table (one row per item, one column per criterion), never a bullet list standing in for a table.'
  },
  antiLatex: {
    fr: "Pas de LaTeX : n'écris jamais $...$, \\(...\\), \\rightarrow, \\cdot ni aucune commande à backslash. Pour une flèche, tape directement → en clair. N'insère pas de séparateur « --- » parasite au milieu d'une réponse.",
    en: 'No LaTeX: never write $...$, \\(...\\), \\rightarrow, \\cdot or any backslash command. For an arrow, type → directly. Do not insert stray "---" separators in the middle of a reply.'
  },
  noInvention: {
    fr: "N'invente jamais de faits, chiffres, prix, dates, sources, citations ou références. Si une information dépend de données récentes ou externes non fournies, dis-le clairement.",
    en: 'Never invent facts, figures, prices, dates, sources, citations or references. If information depends on recent or external data not provided, say so clearly.'
  },
  sources: {
    // Les identifiants doivent etre repris VERBATIM du contexte injecte : le
    // Knowledge Orchestrator etiquette ses passages [K1], [K2]... tandis que
    // les documents projet fournis par le client utilisent [S1], [S2]. Nommer
    // un seul de ces schemas poussait le modele a citer un identifiant absent
    // du contexte (ex. [S1] alors que seuls des [Kx] etaient fournis).
    fr: "Sources : cite les documents fournis avec leurs identifiants exacts, repris tels quels du contexte ci-dessous (par exemple [K1], [K2] ou [S1], [S2] selon ce qui t'est fourni). N'invente jamais d'identifiant, n'en utilise jamais un qui n'apparaît pas dans le contexte, et n'en cite jamais un pour un document que tu n'as pas réellement utilisé. Cite les sources web avec leur numéro [1], [2] uniquement quand un index numéroté est fourni. La mémoire projet est un canal distinct : ne la cite pas avec un identifiant de document.",
    en: 'Sources: cite provided documents with their exact identifiers, copied verbatim from the context below (for example [K1], [K2] or [S1], [S2] depending on what you are given). Never invent an identifier, never use one that does not appear in the context, and never cite one for a document you did not actually use. Cite web sources with their number [1], [2] only when a numbered index is provided. Project memory is a separate channel: do not cite it with a document identifier.'
  },
  noSourceReminder: {
    fr: "Si aucune source documentaire n'a réellement été utilisée pour la réponse, indique-le explicitement plutôt que de laisser croire le contraire.",
    en: 'If no document source was actually used for the answer, state it explicitly rather than implying otherwise.'
  },
  webNotTriggered: {
    fr: "Aucune recherche web n'a été déclenchée pour ce message : ne prétends jamais avoir consulté le web ou des sources en temps réel.",
    en: 'No web search was triggered for this message: never claim to have browsed the web or real-time sources.'
  },
  longDocument: {
    fr: 'Document long : produis une structure hiérarchique propre et exportable (titres, sous-titres, listes, tableaux si utiles), facilement convertible en HTML/PDF/DOCX. Évite les formulations décoratives.',
    en: 'Long document: produce a clean, exportable hierarchical structure (headings, subheadings, lists, tables when useful), easily convertible to HTML/PDF/DOCX. Avoid decorative wording.'
  },
  technical: {
    fr: 'Aide technique : sois précis et concret. Donne des étapes reproductibles, des blocs de code en ``` avec le langage, et signale les hypothèses ou prérequis. Ne devine pas une API ou une signature : dis-le si tu n\'es pas sûr.',
    en: 'Technical help: be precise and concrete. Give reproducible steps, code blocks in ``` with the language, and flag assumptions or prerequisites. Do not guess an API or signature: say so if unsure.'
  },
  projectManager: {
    fr: "Pilotage projet : raisonne comme un chef de projet. Donne des priorités claires, des actions concrètes, des risques et des prochaines étapes. Appuie-toi uniquement sur les données réelles fournies, sans rien inventer.",
    en: 'Project steering: reason like a project manager. Give clear priorities, concrete actions, risks and next steps. Rely only on the real data provided, inventing nothing.'
  }
};

export function composeSystemPrompt({
  intent = {},
  plan = {},
  dateContext = null,
  webPerformed = false,
  hasRagContext = false,
  hasWebContext = false
} = {}) {
  const lang = pickLang(intent.language === 'en' ? 'en' : (intent.language === 'fr' ? 'fr' : (plan.language || 'fr')));
  const dateLabel = dateContext?.isoDate
    ? `${dateContext.isoDate}${dateContext.timezone ? ` (${dateContext.timezone})` : ''}`
    : new Date().toISOString().slice(0, 10);

  const get = (block) => (typeof block[lang] === 'function' ? block[lang] : block[lang]);
  const parts = [];

  // Toujours : identite + langue.
  parts.push(BLOCKS.identity[lang](dateLabel));
  parts.push(BLOCKS.language[lang]);

  // Style selon la longueur attendue.
  if (plan.preferredResponseLength === 'long') parts.push(BLOCKS.styleLong[lang]);
  else if (plan.preferredResponseLength === 'short') parts.push(BLOCKS.styleShort[lang]);
  else parts.push(BLOCKS.styleMedium[lang]);

  // Toujours : regles Markdown + anti-LaTeX + non-invention.
  parts.push(BLOCKS.markdown[lang]);
  parts.push(BLOCKS.antiLatex[lang]);
  parts.push(BLOCKS.noInvention[lang]);

  // Conditionnels.
  if (intent.requiresTable || plan.promptProfile === 'comparison') {
    parts.push(BLOCKS.table[lang]);
    if (plan.promptProfile === 'comparison') parts.push(BLOCKS.comparison[lang]);
  }
  if (plan.promptProfile === 'long_document' || intent.requiresLongAnswer) {
    parts.push(BLOCKS.longDocument[lang]);
  }
  if (plan.promptProfile === 'technical') {
    parts.push(BLOCKS.technical[lang]);
  }
  if (plan.promptProfile === 'project_manager') {
    parts.push(BLOCKS.projectManager[lang]);
  }

  // Sources / citations si RAG ou web mobilises.
  if (plan.useRag || plan.useWeb || hasRagContext || hasWebContext) {
    parts.push(BLOCKS.sources[lang]);
    if (intent.requiresSources) parts.push(BLOCKS.noSourceReminder[lang]);
  }

  // Rappel : web non declenche.
  if (!webPerformed && !hasWebContext) {
    parts.push(BLOCKS.webNotTriggered[lang]);
  }

  // Prompt compact : une regle par phrase, separees par un espace (comme le
  // monolithe, mais sans les blocs inutiles a cette requete).
  return parts.filter(Boolean).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────
// orchestrate — convenience : intent + plan + prompt en un appel.
// ─────────────────────────────────────────────────────────────────────────

export function orchestrate(input = {}) {
  const intent = detectUserIntent(input);
  const plan = planCapabilities(intent, input.runtimeContext || {});
  const systemPrompt = composeSystemPrompt({
    intent,
    plan,
    dateContext: input.dateContext || null,
    webPerformed: Boolean(input.webPerformed),
    hasRagContext: Boolean(input.hasRagSources),
    hasWebContext: Boolean(input.webPerformed)
  });
  return { intent, plan, systemPrompt };
}

export function isOrchestratorEnabled(env) {
  return String(env?.PROMPT_ORCHESTRATOR_ENABLED ?? 'true').toLowerCase() !== 'false';
}
