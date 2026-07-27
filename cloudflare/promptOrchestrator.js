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
  // Bloc de code fourni par l'utilisateur (```lang ... ``` ou ``` seul) —
  // signal factuel (pas d'interpretation), utilise pour distinguer une revue
  // de code reelle d'une simple question technique sans code a analyser.
  codeBlockFence: /```/,
  // Demande explicite de revue/audit de code (verbe dedie), distincte du
  // signal "technical" plus large (qui matche aussi une simple question sur
  // une API sans code fourni).
  //
  // NOTE : limites Unicode (?<![\p{L}\p{N}_])/(?![\p{L}\p{N}_]) + flag /u au
  // lieu de \b classiques — en JavaScript, \b se base sur \w (= [A-Za-z0-9_]
  // uniquement) et NE reconnait PAS les lettres accentuees comme caracteres
  // de mot. Un \b final apres une alternative se terminant par un accent
  // (ex. "s[ée]curit[ée]" quand la variante accentuee "sécurité" matche, ou
  // "vuln[ée]rabilit[ée]s?" au singulier sans s) echouait donc silencieusement
  // : \bfoo\b ne matchait JAMAIS "...sécurité " car "é" est traite comme
  // non-mot par le moteur, donc aucune "frontiere de mot" n'est detectee
  // entre "é" et l'espace suivant. Les lookarounds \p{L} (letter Unicode)
  // couvrent correctement les caracteres accentues.
  // NOTE additionnelle (trouvee en test manuel systematique) : plusieurs
  // verbes n'existaient qu'a l'imperatif ("revois", "trouve", "cherche",
  // "relis") et ratenaient la tournure tres courante "peux-tu + infinitif"
  // ("peux-tu revoir/trouver/chercher/relire..."). Ajout de la forme
  // infinitive en alternative — aucune n'a d'accent, donc aucun risque du
  // piege è/é rencontre sur générer/accélérer.
  codeReviewVerb: /(?<![\p{L}\p{N}_])((?:revois|revoir)|reviewe?r?|revue\s+de\s+code|code\s*review|audite[rz]?|audit\s+(?:de\s+)?(?:code|s[ée]curit[ée])|(?:trouve|trouver)\s+(?:les\s+|des\s+)?bugs?|(?:trouve|trouver)\s+(?:les\s+|des\s+)?failles|(?:trouve|trouver|cherche|chercher)\s+(?:les\s+|des\s+)?vuln[ée]rabilit[ée]s?|s[ée]curise(?:r)?\s+ce\s+code|(?:relis|relire)\s+(?:mon|ce)\s+code|v[ée]rifie(?:r)?\s+(?:mon|ce)\s+code|analyse(?:r)?\s+(?:mon|ce|cette)\s+code|review\s+this\s+code|find\s+bugs?|find\s+(?:the\s+)?vulnerabilit(?:y|ies)|security\s+audit|check\s+this\s+code)(?![\p{L}\p{N}_])/iu,
  // Demande d'audit de securite au sens large (pas limitee a un extrait de
  // code : porte aussi sur l'architecture, la config, les dependances, les
  // donnees sensibles). Volontairement plus specifique/prioritaire que
  // codeReviewVerb : "audit de securite" matche aussi codeReviewVerb, mais le
  // profil dedie security_audit couvre un perimetre plus large (voir plus
  // bas, priorite explicite dans detectUserIntent). Memes lookarounds
  // Unicode que codeReviewVerb ci-dessus (meme raison : plusieurs
  // alternatives se terminent par un caractere accentue).
  // NOTE : audite[rz]?\s+(?:la\s+)?s[ée]curit[ée] (forme VERBALE, "audite/
  // auditer la sécurité") est distinct de audit\s+(?:de\s+)?s[ée]curit[ée]
  // (forme NOMINALE, "audit de sécurité") — trouve manquant en test manuel
  // ("audite la sécurité de mon appli" ne matchait ni l'un ni l'autre).
  // Idem s[ée]curise(?:r)? : couvre l'imperatif "sécurise" ET l'infinitif
  // "sécuriser" (un seul accent ici, pas de piege de decalage è/é comme
  // "générer"/"accélérer" plus haut).
  securityAuditVerb: /(?<![\p{L}\p{N}_])(audit\s+(?:de\s+)?s[ée]curit[ée]|audite[rz]?\s+(?:la\s+)?s[ée]curit[ée]|security\s+audit|pentest(?:ing)?|test\s+d['e]intrusion|faille[s]?\s+de\s+s[ée]curit[ée]|vuln[ée]rabilit[ée]s?|vulnerabilit(?:y|ies)|owasp|injection\s+sql|sql\s+injection|xss|csrf|s[ée]curise(?:r)?\s+(?:mon|ce|cette|le|la)\s+(?:site|api|application|serveur|projet|backend|worker|code)|check\s+for\s+vulnerabilit(?:y|ies)|security\s+review|harden(?:ing)?\s+(?:my|this)|vulnerability\s+scan)(?![\p{L}\p{N}_])/iu,
  // Demande d'audit/optimisation de performance (perimetre dedie, distinct
  // des categories generiques de codeReviewVerb). Meme technique de
  // lookarounds Unicode que ci-dessus (plusieurs alternatives se terminent
  // par un caractere accentue : "rapidit[ée]", "complexit[ée]").
  //
  // acc[ée]l[éèe]re(?:r)? : piege distinct trouve en test manuel — "accélère"
  // (present, 2e syllabe en È) et "accélérer" (infinitif, 2e syllabe en É)
  // n'ont PAS le meme accent a cette position. Un premier jet [èe] (correct
  // pour le present) faisait donc echouer l'infinitif "accélérer", pourtant
  // tres courant ("peux-tu accélérer ce endpoint ?"). [éèe] couvre les deux
  // graphies (+ la forme non accentuee).
  performanceAuditVerb: /(?<![\p{L}\p{N}_])(optimi[sz]e[rz]?|am[ée]liore[rz]?\s+(?:les?\s+)?(?:performances?|perf|vitesse|rapidit[ée])|acc[ée]l[éèe]re(?:r)?|plus\s+rapide|trop\s+lent[e]?|c['e]est\s+lent|(?:[çc]a)\s+rame|lenteur[s]?|fuite[s]?\s+m[ée]moire|memory\s+leak|complexit[ée]\s+algorithmique|big\s*[- ]?o|requ[êe]tes?\s+redondantes?|requ[êe]tes?\s+n\+1|n\+1\s+quer(?:y|ies)|optimi[sz]e\s+(?:this|my)|speed\s+up|reduce\s+latency|performance\s+(?:audit|review|issue|report)|slow\s+(?:code|query|queries|function|endpoint)|bottleneck[s]?|goulot[s]?\s+d['e]?[ée]tranglement|latence|throughput|scalabilit[ée])(?![\p{L}\p{N}_])/iu,
  // Demande d'analyse d'architecture (patterns, couplage/cohesion,
  // dependances circulaires, scalabilite structurelle) — distinct de
  // projectAnalysis (maturite/sante de PROJET, angle gestion) : ici l'angle
  // est technique/structurel. "scalabilit[ée]" volontairement PAS repris ici
  // seul (deja couvert par performanceAuditVerb) pour eviter toute ambiguite
  // de priorite ; seule la combinaison avec "architecture" est ciblee.
  // NOTE : "l'architecture" s'ecrit SANS espace apres l'apostrophe (elision
  // francaise devant voyelle) — trouve en test manuel : la premiere
  // alternative exigeait a tort un \s+ commun entre (?:l['e]|cette|mon) et
  // "architecture", ce qui cassait le cas "l'" (aucun espace) tout en
  // marchant pour "cette architecture"/"mon architecture" (espace normal).
  // (?:l['’]\s*|cette\s+|mon\s+) traite "l'" separement, sans exiger
  // d'espace apres l'apostrophe.
  architectureAnalysisVerb: /(?<![\p{L}\p{N}_])((?:analyse|analyser)\s+(?:l['’]\s*|cette\s+|mon\s+)architecture|(?:revois|revoir|review)\s+l['e]architecture|architecture\s+review|d[ée]pendances?\s+circulaires?|circular\s+dependenc(?:y|ies)|s[ée]paration\s+des\s+responsabilit[ée]s|separation\s+of\s+concerns|couplage\s+(?:fort|excessif)|high\s+coupling|(?:faible|mauvaise)\s+coh[ée]sion|low\s+cohesion|design\s+pattern[s]?|patron[s]?\s+de\s+conception|(?:bien|mal)\s+structur[ée]e?|is\s+this\s+well[- ]structured|architecture\s+(?:propre|solide|robuste|logicielle))(?![\p{L}\p{N}_])/iu,
  // Demande d'assistance au debogage. Deux signaux independants :
  // hasErrorTrace (stack trace / message d'erreur REELLEMENT colle — signal
  // factuel fort, JS/Python/Java) et debugVerb (formulation explicite de
  // demande de diagnostic, avec ou sans trace). NOTE : erreur/exception/bug
  // seuls restent dans RX.technical (trop generiques pour ce profil dedie
  // sans trace ni verbe de diagnostic explicite).
  hasErrorTrace: /\b(traceback\s*\(most recent call last\)|uncaught\s+\w*error|\w+error:\s|\w+exception(?:\s+in\s+thread)?|file\s+"[^"]+",\s+line\s+\d+|at\s+[\w.$<>]+\s*\([^)]*:\d+:\d+\)|stack\s*trace)\b/i,
  debugVerb: /(?<![\p{L}\p{N}_])(pourquoi\s+(?:est-ce\s+que\s+)?[çc]a\s+(?:plante|crash|bug|casse)|pourquoi\s+(?:mon|ce)\s+code\s+(?:plante|crash|bug)|(?:d[ée]bogue|d[ée]boguer|debug(?:ge)?(?:r)?)\s+(?:ce|cette|mon)|aide[- ]moi\s+[àa]\s+(?:d[ée]boguer|corriger)|quelle\s+est\s+la\s+cause\s+de\s+(?:cette|l['e])\s*erreur|pourquoi\s+j['e]ai\s+cette\s+erreur|root\s+cause|why\s+(?:does|is)\s+(?:this|it)\s+(?:crash|fail|break)|debug\s+this|find\s+the\s+root\s+cause)(?![\p{L}\p{N}_])/iu,
  // Demande de generation de tests (unitaires/integration). Necessite un vrai
  // bloc de code fourni (verifie via hasCodeBlock dans detectUserIntent,
  // meme logique que codeReviewVerb) : on ne peut pas ecrire des tests
  // pertinents sur du code qu'on n'a jamais vu.
  // NOTE : (?:[ée]cris|[ée]crire) et (?:g[ée]n[èe]re|g[ée]n[ée]rer) couvrent a
  // la fois l'imperatif ("écris des tests") et l'infinitif ("peux-tu écrire
  // des tests ?") — meme convention que RX.document ci-dessus, qui liste deja
  // separement "[ée]cris" et "[ée]crire". Un premier jet ne couvrant que
  // l'imperatif ratait silencieusement les tournures tres courantes
  // "peux-tu écrire..."/"j'aimerais générer...". Lookarounds Unicode (meme
  // technique que codeReviewVerb/securityAuditVerb/performanceAuditVerb
  // plus haut) : cette fois le \b defaillant est en DEBUT d'alternative
  // ("écrire", "générer" COMMENCENT par un accent), pas en fin — meme cause
  // (\b se base sur \w = [A-Za-z0-9_], "é" n'est pas un caractere de mot).
  testGenerationVerb: /(?<![\p{L}\p{N}_])((?:[ée]cris|[ée]crire)\s+(?:des\s+|les\s+)?tests?|(?:g[ée]n[èe]re|g[ée]n[ée]rer)\s+(?:des\s+|les\s+)?tests?|teste(?:r)?\s+ce\s+code|couverture\s+de\s+tests?|tests?\s+unitaires?|tests?\s+d['e]int[ée]gration|write\s+(?:unit\s+)?tests?|generate\s+tests?|test\s+coverage|unit\s+tests?\s+for\s+this)(?![\p{L}\p{N}_])/iu,
  // Demande de documentation de code (JSDoc/docstrings/README technique) —
  // volontairement plus specifique que le pattern "document" generique
  // (rapports/guides longs) pour eviter qu'une demande de JSDoc soit
  // aiguillee vers document_generation (mauvais format de sortie).
  // Memes lookarounds Unicode que testGenerationVerb ci-dessus (meme cause :
  // "écris"/"écrire" en debut d'alternative).
  docGenerationVerb: /(?<![\p{L}\p{N}_])((?:documente|documenter)\s+(?:ce|mon|cette)\s+code|jsdoc|docstrings?|(?:g[ée]n[èe]re|g[ée]n[ée]rer)\s+(?:la\s+)?doc(?:umentation)?\s+(?:de\s+ce\s+code|technique|de\s+l['e]api|api)|(?:[ée]cris|[ée]crire)\s+la\s+doc(?:umentation)?\s+(?:de\s+ce\s+code|technique)|document\s+this\s+code|generate\s+(?:jsdoc|docstrings?|documentation\s+for\s+this)|write\s+(?:the\s+)?documentation\s+for\s+this\s+code|api\s+documentation\s+for\s+this)(?![\p{L}\p{N}_])/iu,
  // Demande de refactoring (reecriture propre SANS changement de
  // comportement). Necessite un vrai bloc de code (meme logique que
  // codeReviewVerb/testGenerationVerb) : impossible de refactorer du code
  // qu'on n'a jamais vu. "refactor" seul est deja dans RX.technical (utilise
  // par le fallback technical_help) : cette regex dediee doit donc etre
  // verifiee AVANT isCodeReview dans detectUserIntent, sinon "refactor ce
  // code" tomberait dans le profil code_review generique au lieu du profil
  // refactoring dedie (regles differentes : preserver le comportement,
  // AVANT/APRES, pas de recherche de bugs).
  // NOTE : verbes irreguliers trouves en test manuel — "rendre" (infinitif
  // irregulier de "rends", pas juste "rend"+"s") et "nettoyer" (le radical
  // change de "nettoi-" a "nettoy-" a l'infinitif, verbe en -oyer comme
  // "employer"/"envoyer" : ajouter juste "r" a "nettoie" donne "nettoier",
  // qui n'existe pas). Les deux formes sont donc listees explicitement au
  // lieu d'un suffixe optionnel.
  refactoringVerb: /(?<![\p{L}\p{N}_])(refactor(?:e|es|er|ing)?|(?:rends?|rendre)\s+(?:ce|ton)\s+code\s+(?:plus\s+)?lisible|am[ée]liore(?:r)?\s+la\s+lisibilit[ée]|(?:nettoie|nettoyer)\s+ce\s+code|simplifie(?:r)?\s+ce\s+code|clean\s*up\s+this\s+code|make\s+this\s+(?:more\s+)?readable|simplify\s+this\s+code|rewrite\s+this\s+(?:cleanly|clean))(?![\p{L}\p{N}_])/iu,
  // Assistant Git : message de commit / nom de branche / description de PR /
  // changelog. Ne necessite PAS de bloc de code (le diff/la description
  // suffit en texte). NOTE : (?:g[ée]n[èe]re|g[ée]n[ée]rer) reutilise le
  // meme correctif Unicode que testGenerationVerb/docGenerationVerb
  // (present "génère" en È, infinitif "générer" en É — pas le meme accent).
  gitAssistantVerb: /(?<![\p{L}\p{N}_])((?:[ée]cris|[ée]crire)\s+(?:un\s+)?message\s+de\s+commit|(?:g[ée]n[èe]re|g[ée]n[ée]rer)\s+(?:un\s+)?message\s+de\s+commit|propose(?:r)?\s+(?:un\s+)?message\s+de\s+commit|message\s+de\s+commit\s+pour|commit\s+message\s+for\s+this|write\s+a\s+commit\s+message|nom\s+de\s+branche|branch\s+name\s+for\s+this|suggest\s+a\s+branch\s+name|description\s+de\s+(?:pr|pull\s+request)|pr\s+description|write\s+a\s+pr\s+description|(?:g[ée]n[èe]re|g[ée]n[ée]rer)\s+(?:un\s+)?changelog|generate\s+a\s+changelog|git\s+commit\s+message)(?![\p{L}\p{N}_])/iu,
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
    ragQuestion: RX.ragQuestion.test(msg),
    hasCodeBlock: RX.codeBlockFence.test(msg),
    codeReviewVerb: RX.codeReviewVerb.test(msg),
    securityAuditVerb: RX.securityAuditVerb.test(msg),
    performanceAuditVerb: RX.performanceAuditVerb.test(msg),
    testGenerationVerb: RX.testGenerationVerb.test(msg),
    docGenerationVerb: RX.docGenerationVerb.test(msg),
    architectureAnalysisVerb: RX.architectureAnalysisVerb.test(msg),
    hasErrorTrace: RX.hasErrorTrace.test(msg),
    debugVerb: RX.debugVerb.test(msg),
    refactoringVerb: RX.refactoringVerb.test(msg),
    gitAssistantVerb: RX.gitAssistantVerb.test(msg)
  };

  // Revue de code : necessite un bloc de code REELLEMENT fourni (sinon on ne
  // reviewerait qu'une description sans rien a analyser) + soit un verbe de
  // revue explicite, soit un signal technique generique (corrige/bug/...).
  const isCodeReview = Boolean(flags.hasCodeBlock && (flags.codeReviewVerb || flags.technical));
  // Audit de securite : ne necessite PAS de bloc de code (peut porter sur une
  // architecture, une config, des dependances decrites en texte).
  const isSecurityAudit = Boolean(flags.securityAuditVerb);
  // Audit de performance : idem, ne necessite pas de bloc de code (un site
  // "lent" ou une "fuite memoire" peuvent etre decrits sans extrait de code).
  const isPerformanceAudit = Boolean(flags.performanceAuditVerb);
  // Analyse d'architecture : ne necessite pas de bloc de code (peut porter
  // sur une organisation de modules decrite en texte).
  const isArchitectureAnalysis = Boolean(flags.architectureAnalysisVerb);
  // Debogage : une vraie stack trace/erreur collee suffit seule (signal
  // factuel fort) ; sinon il faut un verbe de diagnostic explicite.
  const isDebugAssistance = Boolean(flags.hasErrorTrace || flags.debugVerb);
  // Generation de tests : necessite un bloc de code REEL (meme logique que
  // isCodeReview) — impossible d'ecrire des tests pertinents sans voir le
  // code a tester.
  const isTestGeneration = Boolean(flags.hasCodeBlock && flags.testGenerationVerb);
  // Documentation de code : le verbe est deja specifique (JSDoc/docstring/
  // "documente ce code"), pas besoin d'exiger un bloc de code en plus.
  const isCodeDocumentation = Boolean(flags.docGenerationVerb);
  // Refactoring : necessite un bloc de code REEL (meme logique que
  // isCodeReview/isTestGeneration) — reecrire "proprement" suppose d'avoir
  // le code source reel sous les yeux.
  const isRefactoring = Boolean(flags.hasCodeBlock && flags.refactoringVerb);
  // Assistant Git : le verbe est deja specifique (message de commit/nom de
  // branche/description de PR/changelog), pas besoin de bloc de code.
  const isGitAssistant = Boolean(flags.gitAssistantVerb);

  const needsWeb = Boolean(hasWebIntent || flags.webRecency);
  const needsRag = Boolean(hasRagSources || flags.ragProject || flags.projectAnalysis);
  // Vraie question de recuperation projet/source : "que dit le projet ...".
  const isRagRetrievalQuestion = Boolean(flags.ragQuestion && (needsRag || flags.ragProject));

  // Choix de l'intention primaire — ordre de priorite explicite (du plus
  // specifique/contraignant au plus generique).
  //
  // isRagRetrievalQuestion est verifie EN PREMIER, avant les audits : une
  // vraie question de recuperation ("que dit le projet sur les
  // vulnérabilités de sécurité ?") doit faire citer les documents projet
  // existants, pas declencher un audit de securite/performance "invente" par
  // le modele sur un sujet qui n'a jamais ete fourni. Sans cette priorite,
  // le simple mot "sécurité"/"lent"/"bug" dans une question de recuperation
  // RAG detournait a tort l'intention vers un audit autonome.
  let primaryIntent = 'unknown';
  if (isRagRetrievalQuestion) { primaryIntent = 'rag_query'; reasons.push('rag_retrieval_question'); }
  else if (isSecurityAudit) { primaryIntent = 'security_audit'; reasons.push('security_audit_signal'); }
  else if (isPerformanceAudit) { primaryIntent = 'performance_audit'; reasons.push('performance_audit_signal'); }
  else if (isArchitectureAnalysis) { primaryIntent = 'architecture_analysis'; reasons.push('architecture_analysis_signal'); }
  else if (isGitAssistant) { primaryIntent = 'git_assistant'; reasons.push('git_assistant_signal'); }
  else if (isDebugAssistance) { primaryIntent = 'debug_assistance'; reasons.push('debug_assistance_signal'); }
  else if (isTestGeneration) { primaryIntent = 'test_generation'; reasons.push('test_generation_signal'); }
  else if (isCodeDocumentation) { primaryIntent = 'code_documentation'; reasons.push('code_documentation_signal'); }
  else if (isRefactoring) { primaryIntent = 'refactoring'; reasons.push('refactoring_signal'); }
  else if (isCodeReview) { primaryIntent = 'code_review'; reasons.push('code_review_signal'); }
  else if (flags.technical) { primaryIntent = 'technical_help'; reasons.push('technical_keyword'); }
  else if (flags.projectAnalysis) { primaryIntent = 'project_analysis'; reasons.push('project_analysis_keyword'); }
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
  else if (primaryIntent === 'security_audit') expectedFormat = 'security_audit_report';
  else if (primaryIntent === 'performance_audit') expectedFormat = 'performance_audit_report';
  else if (primaryIntent === 'architecture_analysis') expectedFormat = 'architecture_report';
  else if (primaryIntent === 'debug_assistance') expectedFormat = 'debug_report';
  else if (primaryIntent === 'test_generation') expectedFormat = 'test_suite';
  else if (primaryIntent === 'code_documentation') expectedFormat = 'code_documentation';
  else if (primaryIntent === 'refactoring') expectedFormat = 'refactored_code';
  else if (primaryIntent === 'git_assistant') expectedFormat = 'git_output';
  else if (primaryIntent === 'code_review') expectedFormat = 'code_review_report';
  else if (primaryIntent === 'technical_help') expectedFormat = 'step_by_step';
  else if (primaryIntent === 'summary') expectedFormat = 'structured_answer';
  else if (primaryIntent === 'project_analysis') expectedFormat = 'markdown_report';
  else if (primaryIntent === 'question' && wordCount <= 12 && !flags.longHint) expectedFormat = 'short_answer';

  if (requiresTable) reasons.push('table_requested');

  // Reponse longue attendue.
  const requiresLongAnswer = Boolean(
    primaryIntent === 'document_generation' ||
    primaryIntent === 'project_analysis' ||
    primaryIntent === 'code_review' ||
    primaryIntent === 'security_audit' ||
    primaryIntent === 'performance_audit' ||
    primaryIntent === 'architecture_analysis' ||
    primaryIntent === 'test_generation' ||
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
  // Revue de code / audit de securite / audit de performance / generation de
  // tests / documentation de code : toujours le modele le plus capable, quel
  // que soit le calcul generique ci-dessus — la fiabilite prime sur le cout
  // ici (un signature de fonction ou un comportement invente est pire qu'une
  // reponse plus couteuse).
  if (['code_review', 'security_audit', 'performance_audit', 'test_generation', 'code_documentation', 'architecture_analysis', 'debug_assistance', 'refactoring'].includes(safeIntent.primaryIntent)) preferredModelTier = 'strong';
  // git_assistant est volontairement EXCLU de ce tier "strong" force : un
  // message de commit/nom de branche est une tache courte et peu risquee
  // (contrairement a un refactoring ou un audit, une erreur ici coute juste
  // une regeneration) — le tier generique base sur la longueur/complexite
  // suffit, pas besoin de payer le surcout systematique du modele le plus
  // capable.

  // Bornes alignees sur le worker (defaut 2000, plafond MAX_TOKENS_CEILING 8192).
  let maxTokensHint = 2200;
  if (preferredResponseLength === 'long') maxTokensHint = 4000;
  else if (preferredResponseLength === 'short') maxTokensHint = 1200;

  let temperatureHint = 0.35;
  if (safeIntent.primaryIntent === 'security_audit') temperatureHint = 0.1;
  else if (['code_review', 'performance_audit', 'test_generation', 'code_documentation', 'debug_assistance', 'refactoring'].includes(safeIntent.primaryIntent)) temperatureHint = 0.15;
  else if (safeIntent.primaryIntent === 'technical_help' || safeIntent.primaryIntent === 'architecture_analysis') temperatureHint = 0.2;
  else if (safeIntent.primaryIntent === 'creative') temperatureHint = 0.7;
  else if (safeIntent.primaryIntent === 'document_generation' || safeIntent.primaryIntent === 'project_analysis' || safeIntent.primaryIntent === 'git_assistant') temperatureHint = 0.3;

  // Completion Guard : utile des qu'on attend une reponse longue ou complexe.
  const useCompletionGuard = Boolean(
    preferredResponseLength === 'long' ||
    safeIntent.complexity === 'high' ||
    safeIntent.requiresExportQuality
  );

  // Profil de prompt — priorite explicite (un seul profil retenu).
  let promptProfile = 'default';
  if (safeIntent.primaryIntent === 'security_audit') promptProfile = 'security_audit';
  else if (safeIntent.primaryIntent === 'performance_audit') promptProfile = 'performance_audit';
  else if (safeIntent.primaryIntent === 'architecture_analysis') promptProfile = 'architecture_analysis';
  else if (safeIntent.primaryIntent === 'debug_assistance') promptProfile = 'debug_assistance';
  else if (safeIntent.primaryIntent === 'test_generation') promptProfile = 'test_generation';
  else if (safeIntent.primaryIntent === 'code_documentation') promptProfile = 'code_documentation';
  else if (safeIntent.primaryIntent === 'refactoring') promptProfile = 'refactoring';
  else if (safeIntent.primaryIntent === 'git_assistant') promptProfile = 'git_assistant';
  else if (safeIntent.primaryIntent === 'code_review') promptProfile = 'code_review';
  else if (safeIntent.primaryIntent === 'technical_help') promptProfile = 'technical';
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
  codeReview: {
    fr: "Revue de code : analyse le code réellement fourni, sans en inventer ni en supposer des parties absentes. Structure ta réponse en quatre catégories, dans cet ordre : (1) Bugs et erreurs de logique, (2) Sécurité (injection, XSS, CSRF, secrets en dur, validation d'entrée manquante), (3) Performance (complexité algorithmique, requêtes redondantes, appels bloquants), (4) Lisibilité et bonnes pratiques. Pour chaque problème réel : sévérité (critique/majeur/mineur), localisation précise (ligne, fonction ou extrait cité), un scénario concret de défaillance (entrée/état → conséquence), et un correctif de code prêt à appliquer. Si une catégorie ne présente aucun problème réel, écris-le explicitement (« Aucun problème détecté ») plutôt que d'inventer un point mineur pour la remplir. Termine par un tableau récapitulatif trié par sévérité décroissante.",
    en: "Code review: analyze only the code actually provided, without inventing or assuming absent parts. Structure your answer into four categories, in this order: (1) Bugs and logic errors, (2) Security (injection, XSS, CSRF, hardcoded secrets, missing input validation), (3) Performance (algorithmic complexity, redundant queries, blocking calls), (4) Readability and best practices. For each real issue: severity (critical/major/minor), precise location (line, function or quoted excerpt), a concrete failure scenario (input/state → consequence), and a ready-to-apply code fix. If a category has no real issue, state it explicitly (\"No issue detected\") instead of inventing a minor point to fill it. End with a summary table sorted by decreasing severity."
  },
  securityAudit: {
    fr: "Audit de sécurité : évalue uniquement les éléments réellement fournis (code, configuration, description d'architecture), sans supposer de contexte absent. Structure ton analyse en cinq axes, dans cet ordre : (1) Authentification et autorisation (contrôle d'accès, gestion de session, tokens), (2) Injection et validation d'entrée (SQL, NoSQL, XSS, injection de commande, path traversal), (3) Configuration et exposition (CORS, en-têtes de sécurité, secrets en dur, variables d'environnement, permissions excessives), (4) Dépendances et chaîne d'approvisionnement (versions obsolètes, CVE connus), (5) Données sensibles (chiffrement, stockage, journalisation, RGPD/PII). Pour chaque faille réelle : sévérité (critique/élevée/moyenne/faible), preuve concrète (extrait cité ou comportement décrit), scénario d'exploitation (comment un attaquant l'utiliserait), et remédiation concrète et applicable. Si un axe ne peut pas être évalué faute d'éléments fournis (par exemple aucune liste de dépendances), dis-le explicitement plutôt que d'inventer un risque générique. Termine par un tableau d'actions prioritaires trié par sévérité décroissante.",
    en: "Security audit: evaluate only the elements actually provided (code, configuration, architecture description), without assuming absent context. Structure your analysis into five axes, in this order: (1) Authentication and authorization (access control, session handling, tokens), (2) Injection and input validation (SQL, NoSQL, XSS, command injection, path traversal), (3) Configuration and exposure (CORS, security headers, hardcoded secrets, environment variables, excessive permissions), (4) Dependencies and supply chain (outdated versions, known CVEs), (5) Sensitive data (encryption, storage, logging, GDPR/PII). For each real flaw: severity (critical/high/medium/low), concrete evidence (quoted excerpt or described behavior), exploitation scenario (how an attacker would use it), and a concrete, applicable remediation. If an axis cannot be assessed due to missing information (e.g. no dependency list provided), state it explicitly instead of inventing a generic risk. End with a priority action table sorted by decreasing severity."
  },
  performanceAudit: {
    fr: "Audit de performance : analyse uniquement les éléments réellement fournis (code, description du comportement observé), sans supposer de volumétrie ou de contexte absent. Structure ton analyse en quatre catégories, dans cet ordre : (1) Complexité algorithmique (boucles imbriquées, récursion coûteuse, structures de données inadaptées), (2) Requêtes et I/O (requêtes redondantes ou n+1, appels réseau synchrones/bloquants, absence de cache), (3) Mémoire et ressources (fuites mémoire, objets non libérés, allocations excessives), (4) Rendu et charge frontend (re-rendus inutiles, bundles surdimensionnés, chargement bloquant), si pertinent. Pour chaque problème réel : sévérité (critique/majeur/mineur), localisation précise (ligne, fonction ou extrait cité), impact estimé (ex. complexité O(n²) au lieu de O(n log n) sur une collection de taille N), et un correctif de code optimisé prêt à appliquer. Si une catégorie ne présente aucun problème réel, écris-le explicitement (« Aucun problème détecté ») plutôt que d'inventer un point mineur pour la remplir. Termine par un tableau récapitulatif trié par sévérité décroissante.",
    en: "Performance audit: analyze only the elements actually provided (code, described observed behavior), without assuming volume or absent context. Structure your analysis into four categories, in this order: (1) Algorithmic complexity (nested loops, costly recursion, unsuitable data structures), (2) Queries and I/O (redundant or n+1 queries, synchronous/blocking network calls, missing cache), (3) Memory and resources (memory leaks, unreleased objects, excessive allocations), (4) Frontend rendering and load (unnecessary re-renders, oversized bundles, blocking load), when relevant. For each real issue: severity (critical/major/minor), precise location (line, function or quoted excerpt), estimated impact (e.g. O(n²) complexity instead of O(n log n) on a collection of size N), and a ready-to-apply optimized code fix. If a category has no real issue, state it explicitly (\"No issue detected\") instead of inventing a minor point to fill it. End with a summary table sorted by decreasing severity."
  },
  testGeneration: {
    fr: "Génération de tests : écris des tests pour le code réellement fourni, sans inventer de fonctions, paramètres ou comportements absents du code. Utilise le framework de test le plus adapté au langage détecté (Jest/Vitest pour JS/TS, Pytest pour Python ; sinon demande lequel utiliser). Structure la suite en trois catégories : (1) cas nominaux (happy path), (2) cas limites (valeurs vides, nulles, extrêmes, tableaux vides), (3) cas d'erreur (entrées invalides, exceptions attendues). Chaque test doit être exécutable tel quel (imports inclus) et porter un nom explicite décrivant le comportement vérifié. Si une dépendance externe (base de données, API, fichier, horloge) doit être mockée pour isoler le test, indique-le explicitement et fournis le mock. Ne prétends jamais qu'un taux de couverture a été mesuré : tu n'exécutes aucun code, tu ne fais que l'écrire.",
    en: "Test generation: write tests for the code actually provided, without inventing functions, parameters or behaviors absent from the code. Use the test framework best suited to the detected language (Jest/Vitest for JS/TS, Pytest for Python; otherwise ask which to use). Structure the suite into three categories: (1) happy path cases, (2) edge cases (empty, null, extreme values, empty arrays), (3) error cases (invalid input, expected exceptions). Each test must be runnable as-is (imports included) and carry an explicit name describing the verified behavior. If an external dependency (database, API, file, clock) needs mocking to isolate the test, state it explicitly and provide the mock. Never claim a coverage rate was measured: you execute no code, you only write it."
  },
  codeDocumentation: {
    fr: "Documentation de code : documente uniquement les éléments réellement fournis (signatures, paramètres, comportements visibles dans le code), sans inventer de paramètre, de valeur de retour ou de comportement absent. Utilise le format natif du langage détecté (JSDoc pour JS/TS, docstrings pour Python, etc.) : description courte, chaque paramètre avec son type et son rôle, la valeur de retour, et les exceptions levées si elles sont identifiables dans le code. Pour une documentation plus large (README, doc d'API), structure en sections claires avec des exemples d'usage réalistes basés sur le code réellement fourni. Si un comportement n'est pas clair depuis le code fourni (ex. effet de bord non visible), dis-le explicitement plutôt que de le deviner.",
    en: "Code documentation: document only the elements actually provided (signatures, parameters, behaviors visible in the code), without inventing a parameter, return value or behavior that is absent. Use the native format of the detected language (JSDoc for JS/TS, docstrings for Python, etc.): short description, each parameter with its type and role, the return value, and thrown exceptions if identifiable from the code. For broader documentation (README, API docs), structure it into clear sections with realistic usage examples based on the code actually provided. If a behavior is unclear from the provided code (e.g. a non-visible side effect), state it explicitly instead of guessing."
  },
  architectureAnalysis: {
    fr: "Analyse d'architecture : évalue uniquement les éléments réellement fournis (code, description de la structure, organisation des fichiers), sans inventer de composants ou de dépendances absents. Structure ton analyse en quatre axes, dans cet ordre : (1) Respect des patterns et principes (séparation des responsabilités, patterns adaptés au contexte), (2) Couplage et cohésion (dépendances entre modules, niveau d'indépendance), (3) Dépendances circulaires ou problématiques (cite précisément les modules concernés), (4) Scalabilité et évolutivité (facilité d'ajout de fonctionnalités, points de rigidité). Pour chaque problème réel identifié : impact concret (quel scénario de développement futur il complique) et une piste de refactoring concrète. Distingue clairement les défauts objectifs (dépendance circulaire, duplication) des choix qui restent une question de compromis (monolithe vs microservices) : pour ces derniers, présente les compromis plutôt qu'un verdict tranché. Si les éléments fournis ne permettent pas d'évaluer un axe (ex. pas assez de code pour juger du couplage global), dis-le explicitement plutôt que de conclure sans base.",
    en: "Architecture analysis: evaluate only the elements actually provided (code, structure description, file organization), without inventing absent components or dependencies. Structure your analysis into four axes, in this order: (1) Adherence to patterns and principles (separation of concerns, patterns suited to the context), (2) Coupling and cohesion (dependencies between modules, level of independence), (3) Circular or problematic dependencies (cite the exact modules involved), (4) Scalability and evolvability (ease of adding features, points of rigidity). For each real issue identified: concrete impact (which future development scenario it complicates) and a concrete refactoring path. Clearly distinguish objective flaws (circular dependency, duplication) from choices that remain a matter of tradeoff (monolith vs microservices): for the latter, present the tradeoffs rather than a blunt verdict. If the provided elements don't allow assessing an axis (e.g. not enough code to judge overall coupling), state it explicitly instead of concluding without basis."
  },
  debugAssistance: {
    fr: "Assistance au débogage : analyse uniquement l'erreur, le message ou la stack trace réellement fournis, sans inventer de cause absente du contexte donné. Structure ta réponse en quatre parties, dans cet ordre : (1) Diagnostic — ce que dit précisément l'erreur (type, message, ligne/fichier si identifiable), (2) Cause probable — l'hypothèse la plus vraisemblable, en citant l'élément du code ou du message qui la justifie, (3) Correctif — le changement de code concret à appliquer, (4) Vérification — comment confirmer que le correctif résout le problème. Si plusieurs causes sont plausibles avec les informations disponibles, présente-les classées par probabilité au lieu d'en choisir une arbitrairement. Si des informations manquent pour diagnostiquer avec certitude (version, contexte d'exécution, code appelant), dis-le explicitement et demande-les plutôt que de deviner.",
    en: "Debug assistance: analyze only the error, message or stack trace actually provided, without inventing a cause absent from the given context. Structure your answer into four parts, in this order: (1) Diagnosis — what the error precisely says (type, message, line/file if identifiable), (2) Probable cause — the most likely hypothesis, citing the element of the code or message that justifies it, (3) Fix — the concrete code change to apply, (4) Verification — how to confirm the fix resolves the issue. If several causes are plausible given the available information, present them ranked by likelihood instead of arbitrarily picking one. If information is missing to diagnose with certainty (version, runtime context, calling code), state it explicitly and ask for it instead of guessing."
  },
  refactoring: {
    fr: "Refactoring : réécris uniquement le code réellement fourni, sans changer son comportement observable (mêmes entrées → mêmes sorties) et sans ajouter de fonctionnalité absente. Explique chaque changement significatif : nommage plus clair, réduction de duplication, simplification de structure de contrôle, extraction de fonction, idiome plus adapté au langage détecté. Donne la version refactorée complète (pas un extrait partiel), avec un AVANT/APRÈS ciblé sur les changements les plus importants si utile à la clarté. Si un changement modifierait le comportement observable (effet de bord, ordre d'exécution, gestion d'erreur), signale-le explicitement plutôt que de le faire silencieusement.",
    en: "Refactoring: rewrite only the code actually provided, without changing its observable behavior (same inputs → same outputs) and without adding an absent feature. Explain each significant change: clearer naming, reduced duplication, simplified control flow, function extraction, an idiom better suited to the detected language. Give the complete refactored version (not a partial excerpt), with a targeted BEFORE/AFTER on the most important changes if useful for clarity. If a change would alter observable behavior (side effect, execution order, error handling), flag it explicitly instead of doing it silently."
  },
  gitAssistant: {
    fr: "Assistant Git : base-toi uniquement sur les changements réellement décrits ou fournis (diff, description, code), sans inventer de fichiers modifiés ou de motivation absente. Pour un message de commit : respecte le format Conventional Commits si le contexte s'y prête (type(scope) : description courte à l'impératif, sous 72 caractères sur la première ligne), sinon une phrase claire à l'impératif décrivant le POURQUOI plus que le COMMENT. Pour un nom de branche : format court en kebab-case (ex. feat/nom-fonctionnalite, fix/nom-bug). Pour une description de PR : résumé des changements, motivation, et un plan de test si pertinent. Propose 2-3 alternatives quand la formulation est ambiguë plutôt qu'une seule option arbitraire.",
    en: "Git assistant: rely only on the changes actually described or provided (diff, description, code), without inventing modified files or an absent motivation. For a commit message: follow Conventional Commits format when the context fits (type(scope): short imperative description, under 72 characters on the first line), otherwise a clear imperative sentence describing WHY more than HOW. For a branch name: short kebab-case format (e.g. feat/feature-name, fix/bug-name). For a PR description: summary of changes, motivation, and a test plan if relevant. Offer 2-3 alternatives when the phrasing is ambiguous instead of one arbitrary option."
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
  if (plan.promptProfile === 'code_review') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.codeReview[lang]);
  }
  if (plan.promptProfile === 'security_audit') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.securityAudit[lang]);
  }
  if (plan.promptProfile === 'performance_audit') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.performanceAudit[lang]);
  }
  if (plan.promptProfile === 'test_generation') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.testGeneration[lang]);
  }
  if (plan.promptProfile === 'code_documentation') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.codeDocumentation[lang]);
  }
  if (plan.promptProfile === 'architecture_analysis') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.architectureAnalysis[lang]);
  }
  if (plan.promptProfile === 'debug_assistance') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.debugAssistance[lang]);
  }
  if (plan.promptProfile === 'refactoring') {
    parts.push(BLOCKS.technical[lang]);
    parts.push(BLOCKS.refactoring[lang]);
  }
  if (plan.promptProfile === 'git_assistant') {
    parts.push(BLOCKS.gitAssistant[lang]);
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
