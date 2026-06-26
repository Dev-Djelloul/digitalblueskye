import {
  analyzeResponseQuality,
  computeGrade,
  decideQualityAction,
  repairResponse,
  evaluateResponse,
  buildImproveSystemInstruction,
  deriveMissingRequirements,
  QUALITY_ACTIONS
} from './responseQualityController.js';

let failures = 0;
function check(label, condition) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok  : ${label}`);
  }
}

// 1. Question courte — reponse breve, bien formee, pas de structure attendue.
{
  const text = 'Le délai moyen est de 48 heures ouvrées pour ce type de demande.';
  const result = analyzeResponseQuality(text, { intent: { expectedFormat: 'short_answer' }, expectedFormat: 'short_answer' });
  check('short-answer: grade A ou B (reponse complete et correcte)', result.grade === 'A' || result.grade === 'B');
  check('short-answer: pas de probleme incomplete_ending', !result.issues.includes('incomplete_ending'));
}

// 2. Guide long — doit avoir des titres, sinon issue no_heading.
{
  const noHeadingLongText = 'Paragraphe. '.repeat(250);
  const result = analyzeResponseQuality(noHeadingLongText, { intent: { expectedFormat: 'long_document' }, expectedFormat: 'long_document' });
  check('long-guide sans titres: issue no_heading detectee', result.issues.includes('no_heading'));

  const withHeadingsText = `# Introduction\n\n${'Texte de section. '.repeat(80)}\n\n## Étape 1\n\n${'Détail. '.repeat(80)}\n\n## Conclusion\n\n${'Synthèse finale. '.repeat(40)}`;
  const result2 = analyzeResponseQuality(withHeadingsText, { intent: { expectedFormat: 'long_document' }, expectedFormat: 'long_document' });
  check('long-guide avec titres: pas de no_heading', !result2.issues.includes('no_heading'));
  check('long-guide avec titres: markdown.headings >= 3', result2.markdown.headings >= 3);
}

// 3. Tableau demande mais absent.
{
  const text = 'Voici une explication sans aucun tableau, juste du texte continu sur le sujet demandé.';
  const result = analyzeResponseQuality(text, { intent: { requiresTable: true, expectedFormat: 'table' } });
  check('table demandee absente: issue detectee', result.issues.includes('table_requested_but_missing'));
  check('table demandee absente: markdown.tables === 0', result.markdown.tables === 0);

  const withTable = '| Colonne A | Colonne B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';
  const resultOk = analyzeResponseQuality(withTable, { intent: { requiresTable: true, expectedFormat: 'table' } });
  check('table demandee presente: pas de table_requested_but_missing', !resultOk.issues.includes('table_requested_but_missing'));
  check('table demandee presente: markdown.tables === 1', resultOk.markdown.tables === 1);
}

// 4. Liste demandee mais absente / presente.
{
  const text = 'Premier point sans aucune mise en forme de liste, deuxieme point toujours en prose continue.';
  const result = analyzeResponseQuality(text, { intent: { expectedFormat: 'list' } });
  check('liste demandee absente: issue detectee', result.issues.includes('list_requested_but_missing'));

  const withList = '- Premier élément\n- Deuxième élément\n- Troisième élément';
  const resultOk = analyzeResponseQuality(withList, { intent: { expectedFormat: 'list' } });
  check('liste demandee presente: pas de list_requested_but_missing', !resultOk.issues.includes('list_requested_but_missing'));
  check('liste demandee presente: markdown.lists === 3', resultOk.markdown.lists === 3);
}

// 5. Citation demandee mais absente / presente.
{
  const text = 'Voici une affirmation sans aucune source citée dans le texte de la réponse.';
  const result = analyzeResponseQuality(text, { intent: { requiresSources: true } });
  check('citation demandee absente: issue detectee', result.issues.includes('citation_requested_but_missing'));

  const withCitation = 'Voici une affirmation sourcée (1) directement dans le texte de la réponse.';
  const resultOk = analyzeResponseQuality(withCitation, { intent: { requiresSources: true } });
  check('citation demandee presente: pas de citation_requested_but_missing', !resultOk.issues.includes('citation_requested_but_missing'));
}

// 6. Code demande mais absent / present.
{
  const text = 'Voici comment faire, sans aucun extrait de code dans la réponse fournie ici.';
  const result = analyzeResponseQuality(text, { intent: { expectedFormat: 'code' } });
  check('code demande absent: issue detectee', result.issues.includes('code_requested_but_missing'));

  const withCode = 'Voici le code :\n```js\nconsole.log("ok");\n```';
  const resultOk = analyzeResponseQuality(withCode, { intent: { expectedFormat: 'code' } });
  check('code demande present: pas de code_requested_but_missing', !resultOk.issues.includes('code_requested_but_missing'));
  check('code demande present: markdown.code === 1', resultOk.markdown.code === 1);
}

// 7. Reponse vide.
{
  const result = analyzeResponseQuality('', {});
  check('reponse vide: score 0', result.score === 0);
  check('reponse vide: grade D', result.grade === 'D');
  check('reponse vide: issue empty_response', result.issues.includes('empty_response'));
  const action = decideQualityAction(result, { alreadyRetried: false });
  check('reponse vide: action RETRY_MODEL (premier passage)', action === QUALITY_ACTIONS.RETRY_MODEL);
}

// 8. Reponse tronquee (fin abrupte).
{
  const truncatedEndings = ['Voici la conclusion finale :', 'Le résultat est le suivant -', 'Liste des éléments *', 'Tableau récapitulatif |', 'Une parenthèse ouverte ('];
  for (const ending of truncatedEndings) {
    const result = analyzeResponseQuality(`Texte complet expliquant le contexte avant la coupure. ${ending}`, {});
    check(`reponse tronquee ("${ending.slice(-1)}"): issue incomplete_ending`, result.issues.includes('incomplete_ending'));
  }
}

// 9. Markdown casse (fence/tableau non fermes).
{
  const brokenCode = 'Voici le code :\n```js\nconsole.log("ok");\nsans fermeture';
  const result = analyzeResponseQuality(brokenCode, {});
  check('markdown casse (code fence non ferme): issue broken_markdown', result.issues.includes('broken_markdown'));

  const brokenTable = '| Colonne A | Colonne B |\nLigne sans separateur ni fermeture correcte';
  const result2 = analyzeResponseQuality(brokenTable, {});
  check('markdown casse (tableau non ferme): issue broken_markdown', result2.issues.includes('broken_markdown'));
}

// 10. Paragraphes geants.
{
  const giant = 'Mot '.repeat(200).trim() + '.';
  const result = analyzeResponseQuality(giant, {});
  check('paragraphe geant: issue giant_paragraph', result.issues.includes('giant_paragraph'));
}

// 11. Reponse parfaite — score eleve, action SEND.
{
  const perfect = [
    '# Synthèse',
    '',
    'Voici une réponse structurée et complète qui couvre le sujet demandé avec clarté.',
    '',
    '## Points clés',
    '',
    '- Premier point important',
    '- Deuxième point pertinent',
    '- Troisième point conclusif',
    '',
    '## Conclusion',
    '',
    'En résumé, cette réponse respecte le format attendu et se termine correctement.'
  ].join('\n');
  const result = analyzeResponseQuality(perfect, { intent: { expectedFormat: 'short_answer' } });
  check('reponse parfaite: grade A ou B', result.grade === 'A' || result.grade === 'B');
  const action = decideQualityAction(result, { alreadyRetried: false });
  check('reponse parfaite: action SEND', action === QUALITY_ACTIONS.SEND);
}

// --- Politique de decision (mapping grade -> action) ---
{
  check('grade A -> SEND', decideQualityAction({ grade: 'A' }) === QUALITY_ACTIONS.SEND);
  check('grade B -> SEND', decideQualityAction({ grade: 'B' }) === QUALITY_ACTIONS.SEND);
  check('grade C -> AUTO_REPAIR', decideQualityAction({ grade: 'C' }) === QUALITY_ACTIONS.AUTO_REPAIR);
  check('grade D (1er passage) -> RETRY_MODEL', decideQualityAction({ grade: 'D' }, { alreadyRetried: false }) === QUALITY_ACTIONS.RETRY_MODEL);
  check('grade D (deja retente) -> AUTO_REPAIR (jamais de 2e retry)', decideQualityAction({ grade: 'D' }, { alreadyRetried: true }) === QUALITY_ACTIONS.AUTO_REPAIR);
}

// --- computeGrade deterministe ---
{
  check('computeGrade(95) === A', computeGrade(95) === 'A');
  check('computeGrade(85) === B', computeGrade(85) === 'B');
  check('computeGrade(70) === C', computeGrade(70) === 'C');
  check('computeGrade(40) === D', computeGrade(40) === 'D');
  check('computeGrade deterministe (memes entrees, meme sortie)', computeGrade(82) === computeGrade(82));
}

// --- repairResponse : jamais de modification du contenu metier ---
{
  const broken = 'Titre sans saut de ligne avant\n# Titre\nTexte juste après.\n\n\n\nTrop de lignes vides.\n```js\nconsole.log(1)';
  const repaired = repairResponse(broken);
  check('repair: ferme le code fence non ferme', (repaired.match(/```/g) || []).length % 2 === 0);
  check('repair: reduit les lignes vides excessives', !/\n{3,}/.test(repaired));
  check('repair: ajoute une ligne vide avant le titre', repaired.includes('\n\n# Titre'));
  check('repair: conserve le texte metier "console.log(1)"', repaired.includes('console.log(1)'));
  check('repair: conserve le texte metier "Texte juste après."', repaired.includes('Texte juste après.'));

  const duplicated = 'Ligne A\nLigne A\nLigne B';
  const repairedDup = repairResponse(duplicated);
  check('repair: supprime les doublons consecutifs', repairedDup === 'Ligne A\nLigne B');

  const emptyHeading = 'Texte avant.\n#\nTexte après.';
  const repairedHeading = repairResponse(emptyHeading);
  check('repair: supprime les titres vides', !/^\s*#\s*$/m.test(repairedHeading));

  const emptyList = 'Texte.\n-\nAutre texte.';
  const repairedList = repairResponse(emptyList);
  check('repair: supprime les listes vides', !/^\s*-\s*$/m.test(repairedList));

  const unclosedTable = '| A | B |\n| 1 | 2 |';
  const repairedTable = repairResponse(unclosedTable);
  check('repair: ferme le tableau non ferme (ajout separateur)', /\|\s*---\s*\|/.test(repairedTable));

  const empty = '';
  check('repair: reponse vide reste vide (rien a reparer)', repairResponse(empty) === '');
}

// --- evaluateResponse (pipeline pur complet) ---
{
  const { analysis, action } = evaluateResponse('', { alreadyRetried: false });
  check('evaluateResponse: reponse vide => RETRY_MODEL', action === QUALITY_ACTIONS.RETRY_MODEL && analysis.score === 0);

  const { analysis: analysisOk, action: actionOk } = evaluateResponse('Réponse correcte et complète sur le sujet demandé.', {});
  check('evaluateResponse: reponse correcte => SEND', actionOk === QUALITY_ACTIONS.SEND);
}

// --------------------------------------------------------------------------
// Lot 7.1 — Auto-Improver (IMPROVE_WITH_MODEL)
// --------------------------------------------------------------------------

// 1. Guide long sans tableau demandé -> IMPROVE_WITH_MODEL (contenu utile,
// format non respecté).
{
  const text = `# Introduction\n\n${'Ce guide explique en détail la procédure complète à suivre. '.repeat(60)}\n\n## Étapes\n\n${'Voici une étape détaillée du processus décrit ici. '.repeat(60)}`;
  const { analysis, action } = evaluateResponse(text, {
    intent: { expectedFormat: 'table', requiresTable: true },
    expectedFormat: 'table'
  });
  check('guide long sans tableau: issue table_requested_but_missing', analysis.issues.includes('table_requested_but_missing'));
  check('guide long sans tableau: action IMPROVE_WITH_MODEL', action === QUALITY_ACTIONS.IMPROVE_WITH_MODEL);
}

// 2. Réponse utile mais sans conclusion (document long) -> IMPROVE_WITH_MODEL.
{
  const text = `# Plan du projet\n\n${'Première phase détaillée avec son contenu complet ici. '.repeat(50)}\n\n## Phase suivante\n\n${'Deuxième phase détaillée avec son contenu complet ici. '.repeat(50)}`;
  const { analysis, action } = evaluateResponse(text, { intent: { expectedFormat: 'long_document' }, expectedFormat: 'long_document' });
  check('reponse sans conclusion: issue missing_conclusion', analysis.issues.includes('missing_conclusion'));
  check('reponse sans conclusion: action IMPROVE_WITH_MODEL', action === QUALITY_ACTIONS.IMPROVE_WITH_MODEL);
}

// 3. Réponse vide -> RETRY_FULL.
{
  const { analysis, action } = evaluateResponse('', {});
  check('reponse vide (lot 7.1): action RETRY_FULL', action === QUALITY_ACTIONS.RETRY_FULL);
  check('reponse vide (lot 7.1): RETRY_FULL === RETRY_MODEL (alias)', QUALITY_ACTIONS.RETRY_FULL === QUALITY_ACTIONS.RETRY_MODEL);
  check('reponse vide (lot 7.1): score 0', analysis.score === 0);
}

// 4. Markdown cassé simple (pas de contrainte de format manquante) -> AUTO_REPAIR (REPAIR).
{
  const text = 'Voici une explication complète et utile, qui se termine de façon abrupte par :\n\n```js\nconsole.log("test");\nsans fermeture du bloc de code ici :';
  const { analysis, action } = evaluateResponse(text, {});
  check('markdown casse simple: issue broken_markdown', analysis.issues.includes('broken_markdown'));
  check('markdown casse simple: aucune contrainte manquante', analysis.missingRequirements.length === 0);
  check('markdown casse simple: action AUTO_REPAIR (REPAIR)', action === QUALITY_ACTIONS.AUTO_REPAIR);
}

// 5. Réponse parfaite -> SEND (déjà couvert plus haut, reconfirmé avec le nouveau pipeline).
{
  const perfect = [
    '# Synthèse',
    '',
    'Voici une réponse structurée et complète qui couvre le sujet demandé avec clarté.',
    '',
    '## Points clés',
    '',
    '- Premier point important',
    '- Deuxième point pertinent',
    '- Troisième point conclusif',
    '',
    '## Conclusion',
    '',
    'En résumé, cette réponse respecte le format attendu et se termine correctement.'
  ].join('\n');
  const { action } = evaluateResponse(perfect, { intent: { expectedFormat: 'short_answer' } });
  check('reponse parfaite (lot 7.1): action SEND', action === QUALITY_ACTIONS.SEND);
}

// --- alreadyImproved bloque tout 2e IMPROVE_WITH_MODEL ---
{
  const text = 'Voici une explication sans aucun tableau, juste du texte continu sur le sujet demandé.';
  const analysis = analyzeResponseQuality(text, { intent: { requiresTable: true, expectedFormat: 'table' } });
  const firstAction = decideQualityAction(analysis, { alreadyImproved: false });
  const secondAction = decideQualityAction(analysis, { alreadyImproved: true });
  check('1ere passe: IMPROVE_WITH_MODEL', firstAction === QUALITY_ACTIONS.IMPROVE_WITH_MODEL);
  check('2e passe (deja amelioree): AUTO_REPAIR, jamais une 2e amelioration', secondAction === QUALITY_ACTIONS.AUTO_REPAIR);
}

// --- Cas journalise (production) : score 25 / grade D, missing requirements
// table+citation+sources, repairable incomplete_ending, alreadyImproved=true
// -> REPAIR malgre les contraintes manquantes encore presentes. Ce n'est PAS
// un bug : 1 seule amelioration modele max par requete (anti-boucle), donc le
// 2e passage retombe sur une reparation locale et envoie la meilleure version
// disponible plutot que de resolliciter le modele. Verrouille ce comportement.
{
  const analysis = {
    score: 25,
    grade: 'D',
    text: 'Voici une réponse partielle qui ne fournit ni tableau, ni citation, ni source, et qui se termine de façon incomplète :',
    issues: ['table_requested_but_missing', 'citation_requested_but_missing', 'sources_requested_but_missing', 'incomplete_ending'],
    missingRequirements: ['table_requested_but_missing', 'citation_requested_but_missing', 'sources_requested_but_missing'],
    repairableIssues: ['incomplete_ending']
  };
  const action = decideQualityAction(analysis, { alreadyRetried: true, alreadyImproved: true });
  check('cas journalise (score 25/D, deja ameliore): action REPAIR (anti-boucle, pas un bug)', action === QUALITY_ACTIONS.AUTO_REPAIR);

  // Sans alreadyImproved (1ere passe), le meme profil d'issues doit donner
  // IMPROVE_WITH_MODEL — confirme que REPAIR n'est du qu'au garde-fou anti-boucle,
  // pas a un defaut de detection des contraintes manquantes.
  const actionFirstPass = decideQualityAction(analysis, { alreadyRetried: false, alreadyImproved: false });
  check('meme profil d\'issues, 1ere passe: IMPROVE_WITH_MODEL (confirme que REPAIR vient bien du garde-fou)', actionFirstPass === QUALITY_ACTIONS.IMPROVE_WITH_MODEL);
}

// --- deriveMissingRequirements / buildImproveSystemInstruction ---
{
  const labels = deriveMissingRequirements(['table_requested_but_missing', 'missing_conclusion', 'giant_paragraph'], 'fr');
  check('deriveMissingRequirements: ne garde que les contraintes manquantes', labels.length === 2);
  check('deriveMissingRequirements: labels humains', labels.some((l) => l.toLowerCase().includes('tableau')));

  const instructionFr = buildImproveSystemInstruction('fr', { repairableIssues: ['giant_paragraph'], missingRequirements: ['table_requested_but_missing'] });
  check('buildImproveSystemInstruction (fr): contient le texte attendu', instructionFr.includes('Réécris une version finale complète et mieux structurée.'));
  check('buildImproveSystemInstruction (fr): contient la contrainte manquante', instructionFr.includes('Tableau demandé mais absent'));
  check('buildImproveSystemInstruction (fr): rappelle de ne pas inventer de sources', instructionFr.includes('N’invente pas de sources.'));

  const instructionEn = buildImproveSystemInstruction('en', { repairableIssues: [], missingRequirements: [] });
  check('buildImproveSystemInstruction (en): texte anglais', instructionEn.includes('Rewrite a final, complete and better structured version.'));
}

if (failures > 0) {
  console.error(`\n${failures} test(s) ECHOUE(S).`);
  process.exitCode = 1;
} else {
  console.log('\nTOUS LES TESTS PASSENT');
}
