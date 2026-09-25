// Tokens: immutable brand palette, resolvable references, generated CSS in sync. [docs/specs/design-system.md §5]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCss, entries, GROUNDS, groundColor, loadTokens, resolveValue, TOKENS_CSS } from './lib/tokens.mjs';

const tokens = loadTokens();

test('brand palette is exactly the immutable Luxtory palette', () => {
  const palette = Object.fromEntries(entries(tokens.palette).map(([name, t]) => [name, t.$value]));
  assert.deepEqual(palette, {
    'moroccan-blue': '#0F4E67',
    'dark-moroccan-blue': '#003D52',
    'warm-sand': '#CDAD8E',
    'dark-warm-sand': '#9E8567',
    'pure-white': '#FFFFFF',
  });
});

test('every ground defines the same semantic color names', () => {
  const names = (ground) => entries(tokens.ground[ground]).map(([name]) => name).sort();
  for (const ground of GROUNDS) assert.deepEqual(names(ground), names('paper'), `ground "${ground}" diverges`);
});

test('every semantic color resolves to a palette or derived hex', () => {
  for (const ground of GROUNDS) {
    for (const [name] of entries(tokens.ground[ground])) {
      assert.match(groundColor(tokens, ground, name), /^#[0-9A-F]{6}$/i, `${ground}.${name}`);
    }
  }
});

test('reference resolution fails loudly on unknown tokens', () => {
  assert.throws(() => resolveValue(tokens, '{palette.gold}'), /Unresolved token reference/);
});

test('tokens.css is in sync with tokens.json', () => {
  assert.equal(readFileSync(TOKENS_CSS, 'utf8'), buildCss(tokens), 'run: node src/design-system/scripts/build-tokens.mjs');
});

test('motion respects WCAG 2.2.2: drift is at most 5 seconds', () => {
  const ms = Number.parseInt(tokens.duration.drift.$value, 10);
  assert.ok(ms <= 5000, `drift ${ms}ms > 5000ms`);
});
