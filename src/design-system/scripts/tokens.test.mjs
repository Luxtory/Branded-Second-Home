// Tokens: immutable brand palette, resolvable references, generated CSS in sync. [docs/specs/design-system.md §5]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCss, entries, GROUNDS, groundColor, loadTokens, resolveValue, SURFACES, surfaceColor, TOKENS_CSS } from './lib/tokens.mjs';

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

// Core Design System (docs/specs/design-system.md §13.3).
const BRAND = new Set(entries(tokens.palette).map(([, t]) => t.$value.toUpperCase()));
const FUNCTIONAL = new Set(entries(tokens.derived).map(([, t]) => t.$value.toUpperCase()));

test('Core: the five surfaces exist and define the same semantic roles', () => {
  const names = (surface) => entries(tokens.surface[surface]).map(([name]) => name).sort();
  for (const surface of SURFACES) assert.deepEqual(names(surface), names('white'), `surface "${surface}" diverges`);
  // Superset of the legacy ground roles, so legacy markup inside a Core shell stays legible until it is re-expressed.
  const legacy = entries(tokens.ground.paper).map(([name]) => name);
  for (const role of legacy) assert.ok(names('white').includes(role), `surface roles miss legacy role "${role}"`);
});

test('Core: every surface role references the brand palette or a functional color, never a literal', () => {
  for (const surface of SURFACES) {
    for (const [name, token] of entries(tokens.surface[surface])) {
      assert.match(token.$value, /^\{(palette|derived)\.[a-z0-9-]+\}$/, `surface.${surface}.${name} must be a reference`);
      const color = resolveValue(tokens, token.$value).toUpperCase();
      assert.ok(BRAND.has(color) || FUNCTIONAL.has(color), `surface.${surface}.${name} = ${color}`);
      const alpha = token.$extensions?.['lx.alpha'];
      if (alpha !== undefined) assert.ok(alpha > 0 && alpha < 1, `surface.${surface}.${name} alpha ${alpha}`);
      assert.match(surfaceColor(tokens, surface, name), /^#[0-9A-F]{6}$/);
    }
  }
});

test('Core: no text role on sand uses transparency (Dark Blue 100%)', () => {
  for (const role of ['fg', 'fg-muted', 'headline', 'link', 'outline-fg', 'action-fg']) {
    assert.equal(tokens.surface.sand[role].$extensions?.['lx.alpha'], undefined, `surface.sand.${role}`);
  }
});

test('Core: headline on Blue and Deep is Warm Sand (D1-A); body stays Pure White', () => {
  for (const surface of ['blue', 'deep']) {
    assert.equal(surfaceColor(tokens, surface, 'headline'), '#CDAD8E', surface);
    assert.equal(surfaceColor(tokens, surface, 'fg'), '#FFFFFF', surface);
  }
});

test('Core: contexts never get their own foundations (no b2c/admin/auth/club/public groups)', () => {
  const groups = entries(tokens).map(([name]) => name);
  const contextual = groups.filter((name) => /^(b2c|admin|auth|club|clube|public|publico)([.-]|$)/.test(name));
  assert.deepEqual(contextual, []);
});

test('Core: tokens that alias another token are pure references (no duplicated values)', () => {
  // A contextual or role alias is allowed only as a reference to the Core (e.g. type.page-title → {type.ordinal}).
  for (const [group, value] of entries(tokens)) {
    if (group === 'ground' || group === 'surface') continue;
    for (const [name, token] of entries(value)) {
      if (typeof token.$value === 'string' && token.$value.startsWith('{')) {
        assert.match(token.$value, /^\{[a-z0-9-]+\.[a-z0-9-]+\}$/, `${group}.${name}`);
      }
    }
  }
});

test('Core: the type scale defines every role of the contract', () => {
  const roles = entries(tokens.type).map(([name]) => name).sort();
  assert.deepEqual(roles, [
    'body', 'button', 'button-large', 'closing', 'compact', 'eyebrow', 'headline', 'label', 'meta', 'ordinal',
    'page-title', 'section-title', 'statement', 'subheadline', 'title',
  ]);
});
