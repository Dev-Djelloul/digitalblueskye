import assert from 'node:assert/strict';
import { parseFrontmatter, extractTags, extractWikiLinks, chunkMarkdown } from './knowledge/sources/obsidianSource.js';

const note = '---\ntitle: Test Note\ntags: [ia, rag]\n---\n# Intro\nTexte #obsidian avec [[Autre Note]] et ![[image.png]]';
const parsed = parseFrontmatter(note);
assert.equal(parsed.yaml.title, 'Test Note');
assert.deepEqual(extractTags(parsed.body, parsed.yaml).sort(), ['ia', 'obsidian', 'rag']);
assert.equal(extractWikiLinks(parsed.body).length, 2);
assert.equal(chunkMarkdown(parsed.body, 'folder/test.md')[0].locator, 'Intro');
