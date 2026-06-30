import { hashString } from './contracts.js';

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeText(text).split(' ').filter((token) => token.length > 2));
}

export function textSimilarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

export function deduplicateKnowledgeResults(results, threshold = 0.88) {
  const unique = [];
  const seenHashes = new Set();
  const duplicates = [];
  for (const result of Array.isArray(results) ? results : []) {
    const normalized = normalizeText(result.text);
    const hash = hashString(normalized);
    if (seenHashes.has(hash)) {
      duplicates.push({ duplicate: result, reason: 'exact_hash' });
      continue;
    }
    const similar = unique.find((item) => textSimilarity(item.text, result.text) >= threshold);
    if (similar) {
      duplicates.push({ duplicate: result, kept: similar, reason: 'similar_text' });
      if ((result.score || 0) > (similar.score || 0)) Object.assign(similar, result);
      continue;
    }
    seenHashes.add(hash);
    unique.push({ ...result, metadata: { ...(result.metadata || {}), contentHash: hash } });
  }
  return { results: unique, duplicates };
}
