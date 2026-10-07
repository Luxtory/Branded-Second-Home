// Core Design System contracts (docs/specs/design-system.md §13): Core rules live only behind the generation flag,
// load after the legacy layer, no product shell enables the flag before its checkpoint, the two original diagrams keep
// their geometry, and the Core Lab demonstrates the official patterns and the Public, Auth and Admin contexts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { DS_ROOT } from './lib/tokens.mjs';

const ROOT = resolve(DS_ROOT, '..', '..');
const CORE_STYLES = join(DS_ROOT, 'styles', 'core');
const LAB = join(DS_ROOT, 'lab');
const PUBLIC = join(ROOT, 'public');
const FLAG = '[data-lx="core"]';

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Splits a selector list at top-level commas (commas inside :is()/:where()/:has() belong to the selector). */
function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** Style-rule selectors of a stylesheet, skipping at-rule preludes and keyframe steps. */
function selectorsOf(css) {
  const clean = stripComments(css);
  const selectors = [];
  let inKeyframes = 0;
  let depth = 0;
  for (const match of clean.matchAll(/([^{};]*)([{}])/g)) {
    const [, prelude, brace] = match;
    if (brace === '}') {
      if (inKeyframes && depth === inKeyframes) inKeyframes = 0;
      depth -= 1;
      continue;
    }
    depth += 1;
    const head = prelude.trim();
    if (head.startsWith('@')) {
      if (/^@keyframes/.test(head)) inKeyframes = depth;
      continue;
    }
    if (inKeyframes) continue;
    selectors.push(...splitSelectors(head));
  }
  return selectors;
}

const coreFiles = () => readdirSync(CORE_STYLES).filter((name) => name.endsWith('.css')).sort();

test('every Core rule is scoped behind the generation flag, except the surface paint', () => {
  const unscoped = coreFiles()
    .filter((name) => name !== 'surfaces.css')
    .flatMap((name) => selectorsOf(readFileSync(join(CORE_STYLES, name), 'utf8')).map((selector) => [name, selector]))
    .filter(([, selector]) => !selector.startsWith(FLAG))
    .map(([name, selector]) => `${name}: ${selector}`);
  assert.deepEqual(unscoped, []);
});

test('surfaces.css only paints [data-surface] (an attribute the legacy never uses)', () => {
  const selectors = selectorsOf(readFileSync(join(CORE_STYLES, 'surfaces.css'), 'utf8'));
  assert.ok(selectors.length > 0);
  assert.deepEqual(selectors.filter((selector) => !/^\[data-surface(="[a-z]+")?\]/.test(selector)), []);
});

test('Core keyframes are namespaced so they never replace a legacy animation', () => {
  const names = coreFiles().flatMap((name) =>
    [...readFileSync(join(CORE_STYLES, name), 'utf8').matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  assert.deepEqual(names.filter((name) => !name.startsWith('lx-core-')), []);
});

test('styles/index.css imports every Core file, after all legacy files', () => {
  const index = readFileSync(join(DS_ROOT, 'styles', 'index.css'), 'utf8');
  const imports = [...index.matchAll(/@import url\("\.\/([^"]+)"\)/g)].map((m) => m[1]);
  const firstCore = imports.findIndex((path) => path.startsWith('core/'));
  assert.ok(firstCore > 0, 'the Core is imported');
  assert.ok(imports.slice(firstCore).every((path) => path.startsWith('core/')), 'nothing legacy after the Core');
  assert.deepEqual(imports.slice(firstCore).map((path) => path.slice('core/'.length)).sort(), coreFiles());
});

// Checkpoint gate (§13.2): CP1 enables the flag in no product shell. CP2 adds the public shell here, CP3 the focused
// layout, CP4 the app shell; CP5 makes the Core the default.
// CP2 (Wave 4): the public site shell is the first consumer; its client header marks the Core root as JS-enabled.
const APPROVED_FLAG_CONSUMERS = [
  'src/design-system/react/site-shell.tsx',
  'src/design-system/react/site-header.tsx',
];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|mjs)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

test('only the approved shells enable the Core flag (the public site shell since CP2)', () => {
  const consumers = [join(ROOT, 'src', 'features'), join(ROOT, 'src', 'app'), join(DS_ROOT, 'react')]
    .flatMap(sourceFiles)
    .filter((path) => /data-lx|dataLx|'data-lx'/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(ROOT, path));
  assert.deepEqual(consumers.sort(), [...APPROVED_FLAG_CONSUMERS].sort());
});

// Two distinct originals from Luxtory2.0/src/assets (§13.6): only font, canonical paint and contrast were adapted.
const DIAGRAMS = [
  ['triade-valor-desejado.svg', 'bcf3b1f84e2aa87a39ae7bd7035c216cc353d5dc755d156c4c087afc0f901e10'],
  // 2026-10-06 (fundador): sem os rótulos Venda Integral, Aluguel de Temporada e Clube de Lazer; círculos e traços
  // intactos (a assinatura sem os textos não mudou).
  ['diagrama-solucao-luxtory.svg', '97f82e30dc80c097bb5248118f5176ac1db7e62d8d5840c3ef00ed12cd9d1727'],
];

function geometrySignature(svg) {
  const geometry = [...svg.matchAll(/\b(?:d|points|transform|viewBox|cx|cy|r|rx|ry|x|y|width|height)="[^"]*"/g)]
    .map((match) => match[0])
    .join('\n');
  return createHash('sha256').update(geometry).digest('hex');
}

test('the Core diagrams keep the original geometry and are two distinct assets', () => {
  const signatures = DIAGRAMS.map(([name, expected]) => {
    const file = join(PUBLIC, 'diagrams', 'core', name);
    assert.ok(existsSync(file), name);
    const signature = geometrySignature(readFileSync(file, 'utf8'));
    assert.equal(signature, expected, `${name}: geometry changed`);
    return signature;
  });
  assert.notEqual(signatures[0], signatures[1]);
});

test('the Core diagrams use only the approved fonts and canonical paint, with an accessible title', () => {
  for (const [name] of DIAGRAMS) {
    const svg = readFileSync(join(PUBLIC, 'diagrams', 'core', name), 'utf8');
    assert.match(svg, /<title>[^<]{10,}<\/title>/, `${name}: title`);
    assert.doesNotMatch(svg, /Suisse|Playfair|SangBleu/i, `${name}: foreign font`);
    assert.doesNotMatch(svg, /#004e67/i, `${name}: off-palette blue`);
    assert.doesNotMatch(svg, /display:\s*none|visibility:\s*hidden/i, `${name}: hidden content`);
    const families = new Set([...svg.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]));
    assert.deepEqual([...families].filter((f) => !['Newsreader', 'Hanken Grotesk'].includes(f)), [], name);
  }
});

const LAB_PAGES = ['core.html', 'core-auth.html', 'core-admin.html'];
const read = (name) => readFileSync(join(LAB, name), 'utf8');

/** Local references resolve: relative to the Lab folder, root-absolute (/images, /diagrams) to public/. */
function missingRefs(html) {
  return [...html.matchAll(/\s(?:href|src|srcset)="([^"#][^"]*)"/g)]
    .map((m) => m[1].split(/\s+/)[0].split('#')[0])
    .filter((ref) => !/^[a-z]+:/i.test(ref))
    .filter((ref) => !existsSync(ref.startsWith('/') ? join(PUBLIC, ref) : resolve(LAB, ref)));
}

test('the Core Lab pages exist, declare pt-BR and the flag, have one h1 and resolvable references', () => {
  const manifest = JSON.parse(readFileSync(join(DS_ROOT, 'fonts', 'manifest.json'), 'utf8'));
  const critical = manifest.files.filter((f) => f.preload).map((f) => `../fonts/${f.path}`).sort();
  for (const page of LAB_PAGES) {
    const html = read(page);
    assert.match(html, /<html lang="pt-BR" data-lx="core">/, page);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${page}: one h1`);
    assert.deepEqual(missingRefs(html), [], `${page}: missing references`);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const anchors = [...html.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(anchors.filter((a) => !ids.has(a)), [], `${page}: broken anchors`);
    const preloaded = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"[^>]*crossorigin>/g)].map((m) => m[1]).sort();
    assert.deepEqual(preloaded, critical, `${page}: critical fonts`);
  }
});

test('the Core Lab demonstrates the official patterns, the W4 complements, the states and the three contexts', () => {
  const html = read('core.html');
  const required = [
    'foundations', 'primitives', 'states',
    'pattern-cinematic-hero', 'pattern-triad-comparison', 'pattern-triad-statement', 'pattern-editorial-comparison',
    'pattern-panel-comparison', 'pattern-numbered-list', 'pattern-split-text-media', 'pattern-split-media-text',
    'pattern-split-no-media', 'pattern-text-diagram', 'pattern-pause', 'pattern-faq', 'pattern-siblings',
    'pattern-panel-switch', 'pattern-editorial-list',
    'context-public',
  ];
  for (const id of required) assert.ok(html.includes(` id="${id}"`), id);
  assert.match(html, /href="core-auth\.html"/);
  assert.match(html, /href="core-admin\.html"/);
  assert.match(read('core-auth.html'), /class="lx-focused"/);
  assert.match(read('core-admin.html'), /class="lx-app"/);
  assert.match(read('index.html'), /href="core\.html"/, 'the Lab entry links the Core Lab');
});

// New Core blocks must not reuse a legacy class name: legacy rules would leak into them (e.g. the legacy chapter
// index `.lx-index` drew borders on Core numerals). Re-expressed API classes (lx-button, lx-field…) are not listed.
const NEW_CORE_BLOCKS = [
  'lx-statement', 'lx-headline', 'lx-ordinal', 'lx-title', 'lx-closing', 'lx-subheadline', 'lx-eyebrow', 'lx-meta',
  'lx-compact', 'lx-section', 'lx-section-head', 'lx-section-closing', 'lx-hero', 'lx-split', 'lx-diagram', 'lx-pause',
  'lx-faq', 'lx-siblings', 'lx-comparison', 'lx-panels', 'lx-numbered', 'lx-media', 'lx-triad-comparison',
  'lx-triad-statement', 'lx-columns', 'lx-stack', 'lx-panel-switch',
  'lx-editorial-list', 'lx-section-split', 'lx-answers', 'lx-figures',
];

function legacyCss() {
  const dirs = [join(DS_ROOT, 'styles'), join(DS_ROOT, 'styles', 'components')];
  return dirs
    .flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith('.css')).map((name) => join(dir, name)))
    .map((path) => stripComments(readFileSync(path, 'utf8')))
    .join('\n');
}

test('new Core blocks never collide with a legacy class name', () => {
  // Every class token defined by the legacy CSS, reduced to its block (no element/modifier); fixed regex only.
  const legacyBlocks = new Set(
    [...legacyCss().matchAll(/\.(lx-[a-z0-9-]+)/g)].map((match) => match[1].replace(/(__|--).*$/, '')),
  );
  assert.deepEqual(NEW_CORE_BLOCKS.filter((block) => legacyBlocks.has(block)), []);
});

// The production CSP (style-src with nonce) blocks style attributes: the Core Lab must work without them, so what it
// demonstrates (e.g. the crop of each photograph) also works on product pages.
test('the Core Lab pages use no inline style attribute (CSP-compatible)', () => {
  for (const page of LAB_PAGES) assert.doesNotMatch(read(page), /\sstyle="/, page);
});
