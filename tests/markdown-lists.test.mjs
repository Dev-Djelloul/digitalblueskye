import assert from 'node:assert/strict';

/**
 * normalizeMarkdownLists - corrige les listes compactes collées
 * Préserve blocs de code, tableaux, nombres décimaux, versions et dates.
 */
function normalizeMarkdownLists(rawText) {
  const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n');
  const result = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // Détecte et bascule les blocs de code
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    // Lignes dans les blocs de code : préservées telles quelles
    if (inCodeBlock || trimmed.startsWith('|')) {
      result.push(line);
      continue;
    }

    let processed = line;

    // Ajoute une ligne vide AVANT une liste numérotée collée après un deux-points ou texte
    processed = processed.replace(
      /([.!?:])\s+(?=\d+[.)]\s+[\w*[\-])/g,
      (match, punct) => {
        const beforeMatch = processed.substring(0, processed.indexOf(match));
        if (/\d$/.test(beforeMatch)) return match;
        return `${punct}\n\n`;
      }
    );

    // Ajoute une ligne vide AVANT une liste à puces collée après un deux-points ou texte
    processed = processed.replace(
      /([.!?:])\s+(?=-\s+)/g,
      (match, punct) => {
        const beforeMatch = processed.substring(0, processed.indexOf(match));
        if (/\d$/.test(beforeMatch)) return match;
        return `${punct}\n\n`;
      }
    );

    // Divise les items de liste compacte numérotés
    processed = processed.replace(
      /(\d+[.)]\s+[^\n]*?)\.\s+(?=\d+[.)]\s)/g,
      (match, beforeNum) => {
        const lastChar = beforeNum.trim().charAt(beforeNum.trim().length - 1);
        if (/\d/.test(lastChar)) return match;
        return `${beforeNum}.\n`;
      }
    );

    // Divise les items de liste à puces compactes
    processed = processed.replace(
      /(-\s+[^\n]*?)\.\s+(?=-\s)/g,
      '$1.\n'
    );

    // Ajoute une ligne vide APRÈS une liste compacte si nécessaire
    if (/^\s*(\d+[.)]\s+|-\s+)/.test(processed)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      if (nextLine && !/^\s*(\d+[.)]\s+|-\s+|#{1,6}\s)/.test(nextLine) && nextLine !== '') {
        const isLastListItem = !(/^\s*(\d+[.)]\s+|-\s+)/.test(nextLine));
        if (isLastListItem) {
          result.push(processed);
          result.push('');
          continue;
        }
      }
    }

    result.push(processed);
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Tests
const tests = [
  {
    name: 'compact numbered list after colon',
    input: 'Voici les points: 1. **Premier**: texte. 2. **Deuxième**: texte.',
    expected: /1. \*\*Premier\*\*/,
    shouldHaveBlankBefore: true
  },
  {
    name: 'preserve decimal numbers',
    input: 'Le prix est 3.14 euros pour 1.5 kg.',
    shouldNotContain: '3.\n14'
  },
  {
    name: 'preserve version numbers',
    input: 'Version 1.2.3 est stable. Node v20.11.0 recommandé.',
    shouldNotContain: '1.\n2.'
  },
  {
    name: 'preserve times',
    input: 'Réunion à 13:45, fin vers 15:30.',
    shouldNotContain: '13.\n45'
  },
  {
    name: 'preserve code blocks',
    input: '```js\nconst x = 1; console.log(x);\n```\n\n1. First step',
    shouldContain: '```js'
  },
  {
    name: 'preserve markdown tables',
    input: '| Col1 | Col2 |\n|---|---|\n| 1.5 | 2.3 |\n\n1. Step one',
    shouldContain: '| Col1 | Col2 |'
  },
  {
    name: 'bullet list compact',
    input: 'Items: - Apple. - Banana. - Cherry.',
    shouldContain: ':\\n\\n-'
  },
  {
    name: 'mixed list types should not break',
    input: '1. Number one\n2. Number two\n- Bullet point',
    shouldContain: '1. Number one'
  }
];

tests.forEach((test) => {
  const result = normalizeMarkdownLists(test.input);

  try {
    if (test.expected) {
      assert.match(result, test.expected, `Test "${test.name}": regex not found`);
    }
    if (test.shouldHaveBlankBefore) {
      assert.match(result, /:\n\n\d+\./, `Test "${test.name}": should have blank line before list`);
    }
    if (test.shouldNotContain) {
      assert.doesNotMatch(result, new RegExp(test.shouldNotContain.replace(/\./g, '\\.')), `Test "${test.name}": should not contain "${test.shouldNotContain}"`);
    }
    if (test.shouldContain) {
      assert.match(result, new RegExp(test.shouldContain.replace(/[|]/g, '\\$&')), `Test "${test.name}": should contain "${test.shouldContain}"`);
    }
    console.log(`✓ ${test.name}`);
  } catch (error) {
    console.error(`✗ ${test.name}`);
    console.error(`  Input: ${test.input.substring(0, 60)}...`);
    console.error(`  Output: ${result.substring(0, 60)}...`);
    console.error(`  Error: ${error.message}`);
    throw error;
  }
});

console.log(`\n✓ All ${tests.length} tests passed`);
