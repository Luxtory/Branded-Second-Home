// Design System Lab: references resolve, critical fonts preloaded, R1 compositions present, one h1.
// [docs/specs/design-system.md §6 — Lab]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DS_ROOT } from './lib/tokens.mjs';

const LAB = join(DS_ROOT, 'lab');
const html = readFileSync(join(LAB, 'index.html'), 'utf8');

test('every local href/src in the Lab resolves to a file', () => {
  const refs = [...html.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((ref) => !/^[a-z]+:/i.test(ref));
  const missing = refs.filter((ref) => !existsSync(resolve(LAB, ref)));
  assert.deepEqual(missing, []);
});

test('the Lab preloads exactly the critical fonts of the manifest', () => {
  const manifest = JSON.parse(readFileSync(join(DS_ROOT, 'fonts', 'manifest.json'), 'utf8'));
  const expected = manifest.files.filter((f) => f.preload).map((f) => `../fonts/${f.path}`).sort();
  const preloaded = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"[^>]*crossorigin>/g)].map((m) => m[1]).sort();
  assert.deepEqual(preloaded, expected);
});

test('the three R1 reference compositions exist', () => {
  for (const id of ['composicao-opening', 'composicao-concept', 'composicao-interesse']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('the Lab has exactly one h1 and declares pt-BR', () => {
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.match(html, /<html lang="pt-BR">/);
});

test('every in-page anchor points to an existing id', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...html.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(anchors.filter((a) => !ids.has(a)), []);
});

test('B2C CP1 references resolve inside the existing Lab and declare private evaluation', () => {
  const file = join(LAB, 'b2c.html');
  assert.ok(existsSync(file), 'the authorized B2C checkpoint must be available in the Lab');
  const checkpoint = readFileSync(file, 'utf8');
  assert.match(checkpoint, /name="robots" content="noindex, nofollow"/);
  assert.equal((checkpoint.match(/<h1[\s>]/g) ?? []).length, 1);
  const refs = [...checkpoint.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)]
    .map((match) => match[1]).filter((ref) => !/^[a-z]+:|^\//i.test(ref));
  assert.deepEqual(refs.filter((ref) => !existsSync(resolve(LAB, ref))), []);
  const ids = new Set([...checkpoint.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const anchors = [...checkpoint.matchAll(/\shref="#([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(anchors.filter((anchor) => !ids.has(anchor)), []);
});
