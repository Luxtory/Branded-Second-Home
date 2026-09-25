// Brand integrity: the official logo kit is used verbatim and only through manifest keys.
// [docs/specs/design-system.md §5 Identidade imutável; src/design-system/brand/logo/README.md]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DS_ROOT, entries, loadTokens } from './lib/tokens.mjs';

const LOGO_DIR = join(DS_ROOT, 'brand', 'logo');
const manifest = JSON.parse(readFileSync(join(LOGO_DIR, 'manifest.json'), 'utf8'));
const logos = Object.entries(manifest.logos);
const read = (file) => readFileSync(join(LOGO_DIR, file), 'utf8');
const pathData = (svg) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);

test('every SVG in brand/logo is in the manifest and vice versa', () => {
  const onDisk = readdirSync(LOGO_DIR).filter((f) => f.endsWith('.svg')).sort();
  assert.deepEqual(logos.map(([, l]) => l.file).sort(), onDisk);
});

test('logo files are byte-for-byte the official kit (sha256 pinned)', () => {
  for (const [key, logo] of logos) {
    const hash = createHash('sha256').update(readFileSync(join(LOGO_DIR, logo.file))).digest('hex');
    assert.equal(hash, logo.sha256, `${key} (${logo.file}) was modified — logos are never redrawn or recolored`);
  }
});

test('logo files are safe vectors: no script, raster, external reference or live text', () => {
  for (const [key, logo] of logos) {
    const svg = read(logo.file);
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|<text[\s>]|\son[a-z]+=|href="https?:/i, key);
  }
});

test('visible fills use only the brand palette', () => {
  const palette = new Set(entries(loadTokens().palette).map(([, t]) => t.$value.toLowerCase()));
  for (const [key, logo] of logos) {
    const fills = [...read(logo.file).matchAll(/fill:(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
    for (const fill of fills) assert.ok(palette.has(fill), `${key}: ${fill} is not a palette color`);
  }
});

test('color variants of each lockup share the exact same geometry', () => {
  const byLockup = Map.groupBy(logos, ([key]) => key.split('/')[0]);
  for (const [lockup, variants] of byLockup) {
    const [first, ...rest] = variants.map(([, l]) => pathData(read(l.file)));
    for (const other of rest) assert.deepEqual(other, first, `${lockup}: variants diverge`);
  }
});

test('declared viewBox matches each file', () => {
  for (const [key, logo] of logos) {
    const [, , w, h] = read(logo.file).match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    assert.deepEqual([w, h], logo.viewBox, key);
  }
});

test('the Lab uses only manifest logo files, always as <img>', () => {
  const html = readFileSync(join(DS_ROOT, 'lab', 'index.html'), 'utf8');
  const files = new Set(logos.map(([, l]) => l.file));
  const used = [...html.matchAll(/brand\/logo\/([^"'\s)]+\.svg)/g)].map((m) => m[1]);
  assert.ok(used.length > 0, 'the Lab should show the official logos');
  assert.deepEqual(used.filter((f) => !files.has(f)), []);
  assert.doesNotMatch(html, /<svg[^>]*id="svg1"/, 'logo SVGs must not be inlined (mix-blend-mode breaks the wordmark)');
});
