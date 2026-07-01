// Document Engine V2 — utilitaires PURS de nettoyage documentaire
// (normalisation des noms propres cassés par l'extraction PDF, dédup des
// références bibliographiques). Aucun reseau, aucune dependance D1/Vectorize :
// testables en isolation et reutilisables cote Worker ET cote client (le
// client en duplique une version compacte, ce module restant la reference).

// Prénoms français fréquemment composés (première ou seconde partie d'un
// prénom à trait d'union). Sert à détecter « Edouard Marie Gallez » →
// « Edouard-Marie Gallez » sans casser « Jean parle à Marie Gallez » (le
// nom de famille ne doit PAS être un prénom de cette liste).
const FRENCH_GIVEN_NAMES_LIST = [
  'edouard', 'édouard', 'marie', 'jean', 'jacques', 'alfred', 'louis', 'pierre',
  'paul', 'anne', 'claude', 'françois', 'francois', 'michel', 'andré', 'andre',
  'rené', 'rene', 'charles', 'henri', 'georges', 'philippe', 'luc', 'marc',
  'joseph', 'antoine', 'christophe', 'guillaume', 'robert', 'bernard', 'daniel',
  'gérard', 'gerard', 'yves', 'noël', 'noel', 'baptiste', 'olivier', 'thomas',
  'emmanuel', 'françoise', 'francoise', 'thérèse', 'therese', 'madeleine',
  'catherine', 'sophie', 'claire', 'hélène', 'helene', 'paule', 'lou', 'jeanne'
];
const FRENCH_GIVEN_NAMES = new Set(FRENCH_GIVEN_NAMES_LIST);

const NAME_PARTICLES = /^(?:de|du|des|le|la|d['’]|von|van|al|el|ben)\s*/i;

function stripParticle(surname) {
  return String(surname || '').replace(NAME_PARTICLES, '').trim();
}

// Les deux prénoms doivent appartenir à la liste : on les contraint
// directement dans la regex (alternation) pour qu'un mot non-prénom qui
// précède (« Selon Edouard Marie... ») ne consomme pas l'alignement et
// n'empêche pas la détection du vrai prénom composé.
const GIVEN_ALT = FRENCH_GIVEN_NAMES_LIST.join('|');
const PROPER_NAME_RX = new RegExp(
  `\\b(${GIVEN_ALT})[ \\t\\r\\n\\/]+(${GIVEN_ALT})[ \\t\\r\\n]+((?:de|du|des|le|la|d['’]|von|van|al|el|ben)[ \\t]+)?([A-ZÉÈÀÂÎÔÛ][\\wÀ-ÿ'’-]+)`,
  'gi'
);

/**
 * Fusionne les prénoms composés cassés par l'extraction PDF :
 *   « Edouard Marie Gallez »  -> « Edouard-Marie Gallez »
 *   « Jean / Jacques Walter » -> « Jean-Jacques Walter »
 *   « Alfred\nLouis de Prémare » -> « Alfred-Louis de Prémare »
 *
 * Règle : deux prénoms connus consécutifs (séparés par espace, retour à la
 * ligne ou « / »), tous deux capitalisés, suivis d'un nom de famille qui
 * n'est PAS lui-même un prénom de la liste. Idempotent (un nom déjà à
 * trait d'union n'est pas re-traité). Préserve la casse d'origine.
 */
export function normalizeProperNames(text) {
  if (!text) return '';
  PROPER_NAME_RX.lastIndex = 0;
  return String(text).replace(PROPER_NAME_RX, (match, g1, g2, particle, surnameCore) => {
    // Exige une initiale majuscule sur les deux prénoms (le flag 'i' de la
    // regex autorise sinon « marie dupont » en minuscules).
    if (!/^[A-ZÉÈÀÂÎÔÛ]/.test(g1) || !/^[A-ZÉÈÀÂÎÔÛ]/.test(g2)) return match;
    const surnameIsGiven = FRENCH_GIVEN_NAMES.has(stripParticle(surnameCore).toLowerCase());
    if (surnameIsGiven) return match;
    const surname = `${particle ? particle.trim() + ' ' : ''}${surnameCore}`;
    return `${g1}-${g2} ${surname}`;
  });
}

// Normalise une ligne de reference pour comparaison de doublons (casse,
// espaces, ponctuation terminale). Ne sert qu'a la deduplication, jamais
// affichee telle quelle.
function referenceFingerprint(line) {
  return String(line || '')
    .toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/[^a-z0-9à-ÿ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Déduplique les lignes de références bibliographiques répétées (l'extraction
 * PDF + le chevauchement de chunks produit des répétitions massives).
 * Conserve l'ordre d'apparition, applique au passage la normalisation des
 * noms propres. `minLength` ignore les lignes trop courtes (titres, puces).
 */
export function dedupeReferenceLines(text, { minLength = 8 } = {}) {
  const normalized = normalizeProperNames(text);
  const seen = new Set();
  const out = [];
  for (const rawLine of String(normalized).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { out.push(''); continue; }
    const fp = referenceFingerprint(line);
    if (fp.length >= minLength && seen.has(fp)) continue;
    if (fp.length >= minLength) seen.add(fp);
    out.push(line);
  }
  // Compacte les lignes vides multiples laissees par la dedup.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Nettoyage applique aux passages d'un type structurel donne :
 * - bibliography : normalisation des noms + dedup des lignes de references.
 * - researchers  : normalisation des noms (pas de dedup ligne a ligne, le
 *   regroupement par personne est laisse au modele guide par le contexte).
 * - autres       : texte inchange.
 */
export function cleanStructuralText(text, kind) {
  if (!text) return '';
  if (kind === 'bibliography') return dedupeReferenceLines(text);
  if (kind === 'researchers' || kind === 'people') return normalizeProperNames(text);
  return String(text);
}
