// Document Engine V2 — tests des utilitaires de nettoyage documentaire.
// node cloudflare/documentStructure.test.mjs
import { normalizeProperNames, dedupeReferenceLines, cleanStructuralText } from './documentStructure.js';

let failures = 0;
function check(label, condition) {
  if (!condition) { failures += 1; console.error(`FAIL: ${label}`); }
  else console.log(`ok  : ${label}`);
}

// ── Fusion des noms propres cassés par l'extraction PDF ──────────────────
check('nom: Edouard Marie Gallez -> Edouard-Marie Gallez', normalizeProperNames('Selon Edouard Marie Gallez, ...').includes('Edouard-Marie Gallez'));
check('nom: Jean Jacques Walter -> Jean-Jacques Walter', normalizeProperNames('Les travaux de Jean Jacques Walter montrent').includes('Jean-Jacques Walter'));
check('nom: Alfred Louis de Prémare -> Alfred-Louis de Prémare', normalizeProperNames('cité par Alfred Louis de Prémare en 2002').includes('Alfred-Louis de Prémare'));

// Variantes de séparateur (retour ligne, slash).
check('nom: séparateur retour-ligne', normalizeProperNames('Edouard\nMarie Gallez').includes('Edouard-Marie Gallez'));
check('nom: séparateur slash', normalizeProperNames('Jean / Jacques Walter').includes('Jean-Jacques Walter'));

// Idempotent : un nom déjà correct n'est pas re-traité.
check('nom: idempotent (deja a trait union)', normalizeProperNames('Edouard-Marie Gallez') === 'Edouard-Marie Gallez');

// Pas de faux positif : un prénom seul + nom ordinaire reste intact.
check('nom: pas de faux positif (un seul prénom)', normalizeProperNames('Patricia Crone') === 'Patricia Crone');
check('nom: pas de faux positif (Michael Cook)', normalizeProperNames('Michael Cook') === 'Michael Cook');

// ── Déduplication des références bibliographiques ────────────────────────
{
  const repetitive = [
    'Patricia Crone, Hagarism, 1977.',
    'Patricia Crone, Hagarism, 1977.',
    'Patricia Crone, Hagarism, 1977.',
    'Michael Cook, Muhammad, 1983.',
    'Patricia Crone, Hagarism, 1977.',
    'Michael Cook, Muhammad, 1983.'
  ].join('\n');
  const deduped = dedupeReferenceLines(repetitive);
  const croneCount = (deduped.match(/Hagarism/g) || []).length;
  const cookCount = (deduped.match(/Muhammad/g) || []).length;
  check('biblio: doublons massifs supprimés (Crone une seule fois)', croneCount === 1);
  check('biblio: doublons massifs supprimés (Cook une seule fois)', cookCount === 1);
  check('biblio: les deux références distinctes conservées', /Crone/.test(deduped) && /Cook/.test(deduped));
}

// ── cleanStructuralText : aiguillage par type ────────────────────────────
check('clean: bibliography déduplique', cleanStructuralText('A. B, 1977.\nA. B, 1977.', 'bibliography').split('\n').filter((l) => l.trim()).length === 1);
check('clean: researchers normalise les noms', cleanStructuralText('Jean Jacques Walter', 'researchers').includes('Jean-Jacques Walter'));
check('clean: tail inchangé', cleanStructuralText('Texte de fin.', 'tail') === 'Texte de fin.');

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} test(s) ECHOUE(S)`);
process.exit(failures === 0 ? 0 : 1);
