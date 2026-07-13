// Tests du correctif « inventaire de la base de connaissances » :
// detectKnowledgeInventoryIntent (détection des questions méta) et
// buildKnowledgeInventoryBlock (bloc factuel injecté dans le prompt).
// Contexte : le chatbot répondait « je ne mémorise rien, chaque conversation
// repart de zéro » alors que la base contenait 70 documents indexés.
// Exécution : node cloudflare/knowledgeInventory.test.mjs
import { detectKnowledgeInventoryIntent, buildKnowledgeInventoryBlock } from './worker-openrouter.js';

let failures = 0;
function check(label, condition) {
  if (!condition) {
    failures += 1;
    console.error('Assertion failed:', label);
  } else {
    console.log('ok  :', label);
  }
}

// ── Détection : questions méta qui DOIVENT déclencher l'inventaire ─────────
const POSITIVE = [
  'Quelles sources as-tu dans ta base ?',
  'Quels documents possèdes-tu ?',
  'Quels documents et sources reconnais-tu dans ta base ?',
  'As-tu enregistré les sources que je t\'ai partagées ?',
  'Est-ce que tu as mémorisé le rapport SAFE ?',
  'Liste-moi les documents indexés dans ta base',
  'Que contient ta base de connaissances ?',
  'Montre-moi les fichiers dont tu disposes',
  'Avez-vous sauvegardé ces documents ?',
  'What documents do you have?',
  'Did you save the sources I shared?',
  'What files are indexed in your knowledge base?'
];
POSITIVE.forEach((q) => check(`détecte : « ${q} »`, detectKnowledgeInventoryIntent(q) === true));

// ── Détection : questions normales qui NE DOIVENT PAS déclencher ───────────
const NEGATIVE = [
  'Que dit le document SAFE sur le calendrier ?',
  'Résume ce document',
  'Quelle est la capitale de la Crète ?',
  'Rédige un rapport sur les sources d\'énergie renouvelable',
  'Compare les documents de cadrage agile et cycle en V',
  'Quelles sont les meilleures pratiques UX en 2026 ?',
  'Bonjour, comment vas-tu ?',
  'Analyse le cahier des charges et donne les points clés',
  // Faux positifs identifiés par la revue adverse (vocabulaire ordinaire de
  // chef de projet digital) — ne doivent JAMAIS déclencher l'inventaire :
  'Quels documents dois-je enregistrer dans le CRM ?',
  'Quels documents faut-il prévoir pour la base de données du projet ?',
  'As-tu une idée de comment enregistrer un podcast ?',
  'Avez-vous une recommandation pour sauvegarder WordPress ?',
  'Comment structurer votre bibliothèque de composants React ?',
  'Les documents marketing sont disponibles sur le drive du projet',
  'Do you keep track of the latest SEO files best practices?',
  'Quelles sources de trafic génèrent le plus de conversions ?',
  'Combien de fichiers CSS le site charge-t-il au premier rendu ?',
  // Les puces d\'une liste ne doivent pas se combiner entre lignes :
  '- quels documents livrer\n- la base de recette est prête'
];
NEGATIVE.forEach((q) => check(`ignore : « ${q} »`, detectKnowledgeInventoryIntent(q) === false));

// ── Bloc d'inventaire : construit depuis un faux env.DB ────────────────────
function fakeDb(rowsByQuery) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              // listIndexedDocuments filtre par project_id quand fourni.
              const isProjectScoped = /WHERE project_id/.test(sql);
              return { results: isProjectScoped ? rowsByQuery.project : rowsByQuery.global };
            }
          };
        },
        async all() {
          return { results: rowsByQuery.global };
        }
      };
    }
  };
}

const rows = {
  global: [
    { document_id: 'd1', document_name: 'Cahier des charges SAFE.pdf', indexed_at: '2026-07-01 10:00:00' },
    { document_id: 'd2', document_name: 'Vincle_Suivi_MVP.html', indexed_at: '2026-07-03 09:00:00' },
    { document_id: 'd3', document_name: 'Autre_doc_global.pdf', indexed_at: '2026-06-20 08:00:00' }
  ],
  project: [
    { document_id: 'd1', document_name: 'Cahier des charges SAFE.pdf', indexed_at: '2026-07-01 10:00:00' },
    { document_id: 'd2', document_name: 'Vincle_Suivi_MVP.html', indexed_at: '2026-07-03 09:00:00' }
  ]
};

const envWithDb = { DB: fakeDb(rows) };

const blockProjet = await buildKnowledgeInventoryBlock(envWithDb, {
  projectId: 'p_test',
  projectName: 'SAFE',
  hasProjectMemory: true,
  language: 'fr'
});
check('bloc projet : mentionne la persistance', /PERSISTANTE/.test(blockProjet));
check('bloc projet : total global (3)', /tous projets confondus : 3/.test(blockProjet));
check('bloc projet : compte projet (2)', /2 document\(s\) indexé\(s\)/.test(blockProjet));
check('bloc projet : liste les noms', blockProjet.includes('Cahier des charges SAFE.pdf') && blockProjet.includes('Vincle_Suivi_MVP.html'));
check('bloc projet : mémoire projet présente', /présente pour ce projet/.test(blockProjet));
check('bloc projet : consigne anti-« je ne mémorise rien »', /Ne prétends jamais que rien n'est enregistré/.test(blockProjet));
check('bloc projet : précise le cas des pièces jointes', /pièces? jointes|fichiers joints/i.test(blockProjet));

const blockSansProjet = await buildKnowledgeInventoryBlock(envWithDb, {
  projectId: null,
  hasProjectMemory: false,
  language: 'fr'
});
check('bloc sans projet : signale l\'absence de projet', /liée à aucun projet/.test(blockSansProjet));
check('bloc sans projet : liste la bibliothèque globale', blockSansProjet.includes('Autre_doc_global.pdf'));

const blockEn = await buildKnowledgeInventoryBlock(envWithDb, {
  projectId: 'p_test',
  projectName: 'SAFE',
  hasProjectMemory: false,
  language: 'en'
});
check('bloc EN : anglais et consigne de véracité', /Never claim that nothing is saved/.test(blockEn));

// Robustesse : env sans DB -> listIndexedDocuments retourne [] sans lever.
const blockSansDb = await buildKnowledgeInventoryBlock({}, { projectId: 'p', language: 'fr' });
check('sans DB : ne lève pas et reste exploitable', typeof blockSansDb === 'string');

if (failures) {
  console.error(`\n${failures} échec(s).`);
} else {
  console.log('\nTous les tests knowledgeInventory passent.');
}
