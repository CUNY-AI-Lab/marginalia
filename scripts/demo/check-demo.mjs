#!/usr/bin/env node
// Validate the demo workspace bundles in public/demo/.
//
// Usage: node scripts/demo/check-demo.mjs
//
// Checks each <slug>.json against the WorkspaceBundle shape in src/lib/r2.ts,
// the identity-layer rules from IDENTITY_EXTRACTION_PROMPT in src/lib/prompts.ts
// (section lengths, `raw` built exactly as parseIdentityLayerResponse builds it,
// every voice sample an exact substring of the paper's fullText), and the
// size/shape rules for the demo (fullText equals the joined paragraphs, sizes
// under the localStorage budget). Exits non-zero on any failure.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEMO = join(ROOT, 'public', 'demo');
const SLUGS = ['minds-and-machines', 'education-debate', 'women-and-reason'];
const SHARED_AT = Date.UTC(2026, 10, 17);
const MAX_BYTES = 400 * 1024;
const WORDS_SOFT = [2000, 12000]; // "roughly" — outside this only warns
const WORDS_HARD = [1500, 12500];
const PAPER_TYPES = new Set(['article', 'book', 'chapter', 'other']);
const PARA_TYPES = new Set(['h1', 'h2', 'h3', 'body']);
const LAYER_KEYS = ['coreCommitments', 'antagonists', 'characteristicMoves', 'vocabulary', 'triggers', 'voiceSamples', 'raw'];
const DESCRIPTION_TAIL = 'Public-domain texts from Project Gutenberg/Wikisource; some are excerpts.';
const LEFTOVERS = [/\[MATH/, /\{\d+\}/, /\[Illustration\]/, /--/, /\r/, / {2,}/, /⁣/, / /, /(^|\W)_[^_\s][^_]*_(\W|$)/];

let failures = 0;
let warnings = 0;
const fail = (where, msg) => { failures++; console.log(`  FAIL ${where}: ${msg}`); };
const warn = (where, msg) => { warnings++; console.log(`  warn ${where}: ${msg}`); };
const isText = (s) => typeof s === 'string' && s.trim().length > 0;
const paras = (s) => s.split('\n\n').filter((p) => p.trim());
const words = (s) => s.split(/\s+/).filter(Boolean).length;

// Same template as parseIdentityLayerResponse() in src/lib/prompts.ts.
function buildRaw(l) {
  return `CORE COMMITMENTS:
${l.coreCommitments}

ANTAGONISTS:
${l.antagonists}

CHARACTERISTIC MOVES:
${l.characteristicMoves}

KEY VOCABULARY:
${l.vocabulary.join(', ')}

TRIGGERS:
${l.triggers}

CHARACTERISTIC PASSAGES:
${l.voiceSamples.map((q) => `"${q}"`).join('\n')}`;
}

function checkLayer(where, layer, fullText) {
  if (!layer || typeof layer !== 'object') return fail(where, 'missing identityLayer');
  const keys = Object.keys(layer).sort().join();
  if (keys !== [...LAYER_KEYS].sort().join()) fail(where, `identityLayer keys are ${keys}`);
  for (const k of ['coreCommitments', 'antagonists', 'characteristicMoves', 'triggers', 'raw']) {
    if (!isText(layer[k])) fail(where, `${k} is empty`);
  }
  const count = (k, lo, hi) => {
    const n = isText(layer[k]) ? paras(layer[k]).length : 0;
    if (n < lo || n > hi) fail(where, `${k} has ${n} paragraphs (want ${lo}-${hi})`);
  };
  count('coreCommitments', 2, 3);
  count('antagonists', 1, 2);
  count('characteristicMoves', 1, 1);
  count('triggers', 1, 1);
  const vocab = layer.vocabulary;
  if (!Array.isArray(vocab) || vocab.length < 10 || vocab.length > 20 || !vocab.every(isText)) {
    fail(where, `vocabulary must be 10-20 non-empty strings (got ${Array.isArray(vocab) ? vocab.length : typeof vocab})`);
  }
  const samples = layer.voiceSamples;
  if (!Array.isArray(samples) || samples.length < 3 || samples.length > 5 || !samples.every(isText)) {
    fail(where, `voiceSamples must be 3-5 non-empty strings (got ${Array.isArray(samples) ? samples.length : typeof samples})`);
  } else {
    samples.forEach((q, i) => {
      if (!fullText.includes(q)) fail(where, `voiceSamples[${i}] is not a substring of fullText: "${q.slice(0, 70)}…"`);
    });
    if (new Set(samples).size !== samples.length) fail(where, 'duplicate voiceSamples');
  }
  if (Array.isArray(vocab) && Array.isArray(samples) && layer.raw !== buildRaw(layer)) {
    fail(where, 'raw does not match the parseIdentityLayerResponse template');
  }
}

function checkPaper(slug, i, paper) {
  const where = `${slug}[${i}] ${paper?.title ?? '(untitled)'}`;
  if (!isText(paper.title)) fail(where, 'title is empty');
  if (!isText(paper.author)) fail(where, 'author is empty');
  if (!PAPER_TYPES.has(paper.type)) fail(where, `bad type ${paper.type}`);
  const ps = paper.paragraphs;
  if (!Array.isArray(ps) || ps.length === 0) return fail(where, 'no paragraphs');
  if (ps[0].type !== 'h1') fail(where, 'first paragraph is not h1');
  if (ps.filter((p) => p.type === 'h1').length !== 1) fail(where, 'expected exactly one h1');
  ps.forEach((p, j) => {
    if (!PARA_TYPES.has(p.type)) fail(where, `paragraph ${j} has bad type ${p.type}`);
    if (Object.keys(p).sort().join() !== 'content,type') fail(where, `paragraph ${j} has extra keys`);
    if (!isText(p.content)) fail(where, `paragraph ${j} is empty`);
    else {
      if (p.content !== p.content.trim()) fail(where, `paragraph ${j} has surrounding whitespace`);
      if (p.content.includes('\n')) fail(where, `paragraph ${j} contains a newline`);
      if (p.type === 'body' && /^#{1,3} /.test(p.content)) fail(where, `body paragraph ${j} starts like a heading`);
      for (const re of LEFTOVERS) if (re.test(p.content)) fail(where, `paragraph ${j} has leftover markup ${re}: "${p.content.slice(0, 60)}…"`);
    }
  });
  const marks = { h1: '# ', h2: '## ', h3: '### ', body: '' };
  const joined = ps.map((p) => `${marks[p.type] ?? ''}${p.content}`).join('\n\n');
  if (paper.fullText !== joined) fail(where, 'fullText does not equal the paragraphs joined with "\\n\\n"');
  const body = ps.filter((p) => p.type === 'body');
  if (body.length === 0) fail(where, 'no body paragraphs');
  const n = body.reduce((a, p) => a + words(p.content), 0);
  if (n < WORDS_HARD[0] || n > WORDS_HARD[1]) fail(where, `${n} words (outside ${WORDS_HARD.join('-')})`);
  else if (n < WORDS_SOFT[0] || n > WORDS_SOFT[1]) warn(where, `${n} words (outside the rough ${WORDS_SOFT.join('-')} range)`);
  checkLayer(where, paper.identityLayer, paper.fullText);
  return n;
}

const index = JSON.parse(readFileSync(join(DEMO, 'index.json'), 'utf8'));
if (!Array.isArray(index)) fail('index.json', 'not an array');
if (index.map((e) => e.slug).join() !== SLUGS.join()) fail('index.json', `slugs are ${index.map((e) => e.slug).join()}`);

for (const [k, slug] of SLUGS.entries()) {
  const path = join(DEMO, `${slug}.json`);
  const text = readFileSync(path, 'utf8');
  const bytes = statSync(path).size;
  console.log(`${slug}.json — ${bytes.toLocaleString()} bytes, ${text.length.toLocaleString()} chars`);
  if (bytes > MAX_BYTES) fail(slug, `${bytes} bytes is over ${MAX_BYTES}`);
  const b = JSON.parse(text);
  if (Object.keys(b).sort().join() !== 'papers,sharedAt,version,workspace') fail(slug, `top-level keys are ${Object.keys(b)}`);
  if (b.version !== 1) fail(slug, 'version is not 1');
  if (b.sharedAt !== SHARED_AT) fail(slug, `sharedAt ${b.sharedAt} != ${SHARED_AT}`);
  if (!isText(b.workspace?.name)) fail(slug, 'workspace.name is empty');
  if (!isText(b.workspace?.description) || !b.workspace.description.endsWith(DESCRIPTION_TAIL)) {
    fail(slug, 'workspace.description missing or lacks the source note');
  }
  if (!Array.isArray(b.papers) || b.papers.length < 2) { fail(slug, 'needs at least two papers'); continue; }
  if (new Set(b.papers.map((p) => p.title)).size !== b.papers.length) fail(slug, 'duplicate paper titles');
  let total = 0;
  b.papers.forEach((p, i) => {
    const n = checkPaper(slug, i, p) ?? 0;
    total += n;
    console.log(`  ${String(n).padStart(6)} words  ${p.type.padEnd(8)} ${p.author} — ${p.title}`);
  });
  const entry = index[k] ?? {};
  const where = `index.json[${k}]`;
  if (entry.name !== b.workspace.name) fail(where, 'name differs from bundle');
  if (entry.description !== b.workspace.description) fail(where, 'description differs from bundle');
  if (entry.words !== total) fail(where, `words ${entry.words} != ${total}`);
  if (!Array.isArray(entry.papers) || entry.papers.length !== b.papers.length) fail(where, 'papers length differs');
  else entry.papers.forEach((m, i) => {
    if (m.title !== b.papers[i].title || m.author !== b.papers[i].author) fail(where, `paper ${i} title/author differ`);
    if (!Number.isInteger(m.year)) fail(where, `paper ${i} year is not an integer`);
    if (Object.keys(m).sort().join() !== 'author,title,year') fail(where, `paper ${i} keys are ${Object.keys(m)}`);
  });
  if (Object.keys(entry).sort().join() !== 'description,name,papers,slug,words') fail(where, `keys are ${Object.keys(entry)}`);
  console.log(`  ${String(total).padStart(6)} words total`);
}

console.log(failures ? `\n${failures} failure(s), ${warnings} warning(s)` : `\nOK — all checks passed (${warnings} warning(s))`);
process.exit(failures ? 1 : 0);
