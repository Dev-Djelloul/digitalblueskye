const NEGATION_PATTERNS = [
  /\b(ne\s+.+\s+pas|n['’].+\s+pas|jamais|aucun|impossible|désactivé|desactive|inactive|false)\b/i,
  /\b(oui|possible|activé|active|enabled|true|disponible)\b/i
];

function hasOppositePolarity(a, b) {
  const leftNeg = NEGATION_PATTERNS[0].test(a);
  const rightNeg = NEGATION_PATTERNS[0].test(b);
  const leftPos = NEGATION_PATTERNS[1].test(a);
  const rightPos = NEGATION_PATTERNS[1].test(b);
  return (leftNeg && rightPos) || (leftPos && rightNeg);
}

function sharedTerms(a, b) {
  const terms = (text) => new Set(String(text || '').toLowerCase().split(/\W+/).filter((token) => token.length > 4));
  const left = terms(a);
  const right = terms(b);
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

export function detectKnowledgeConflicts(results) {
  const items = Array.isArray(results) ? results : [];
  const conflicts = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.source === b.source && a.documentId === b.documentId) continue;
      if (sharedTerms(a.text, b.text) >= 2 && hasOppositePolarity(a.text, b.text)) {
        conflicts.push({
          type: 'possible_contradiction',
          documentA: a.documentId,
          documentB: b.documentId,
          sourceA: a.source,
          sourceB: b.source,
          detail: 'Passages proches avec polarité opposée détectée.',
          confidence: 0.55
        });
      }
    }
  }
  return conflicts;
}
