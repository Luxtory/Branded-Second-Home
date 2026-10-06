// Contrast: WCAG 2.2 AA on every ground and under the minimum scrim. [docs/specs/design-system.md §6]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composite, contrast, runContrast, runSurfaceContrast } from './check-contrast.mjs';
import { loadTokens, SURFACES } from './lib/tokens.mjs';

test('contrast() matches WCAG reference values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrast('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  assert.equal(contrast('#003D52', '#FFFFFF').toFixed(2), '11.74');
});

test('composite() blends a color over another', () => {
  assert.deepEqual(composite('#000000', '#FFFFFF', 0.5), [127.5, 127.5, 127.5]);
});

test('Warm Sand is never valid text on Pure White (guards the matrix)', () => {
  assert.ok(contrast('#CDAD8E', '#FFFFFF') < 3);
});

test('every declared pair passes on paper, wash and night, including the scrim', () => {
  const failures = runContrast().filter((r) => !r.pass).map((r) => `${r.check} = ${r.ratio.toFixed(2)} (< ${r.min})`);
  assert.deepEqual(failures, []);
});

// Core matrix (docs/specs/design-system.md §13.3, §13.8): semantic role × surface for white, sand, blue, deep and wash.
test('Core: every permitted role passes on every surface (text 4.5, large 3, ui 3)', () => {
  const results = runSurfaceContrast();
  for (const surface of SURFACES) {
    assert.ok(results.some((r) => r.check.startsWith(`surface ${surface}:`)), `no checks for surface ${surface}`);
  }
  const failures = results.filter((r) => !r.pass).map((r) => `${r.check} = ${r.ratio.toFixed(2)} (< ${r.min})`);
  assert.deepEqual(failures, []);
});

test('Core: body roles are checked as normal text and headlines as large text only', () => {
  const rules = loadTokens().$extensions['lx.contrast.surface'];
  const text = rules.text.map(([fg]) => fg);
  for (const role of ['fg', 'fg-muted', 'link', 'action-fg', 'field-fg', 'error', 'success']) assert.ok(text.includes(role), role);
  assert.deepEqual(rules.large.map(([fg]) => fg).sort(), ['accent', 'headline']);
});

test('Core: states that fail on sand are declared as not permitted there, never silently skipped', () => {
  const { notPermitted } = loadTokens().$extensions['lx.contrast.surface'];
  assert.deepEqual(Object.keys(notPermitted), ['sand']);
  assert.deepEqual([...notPermitted.sand].sort(), ['error', 'warning']);
  // The reason: the existing error value is legible on light and dark surfaces, but not on Warm Sand.
  assert.ok(contrast('#9B2226', '#CDAD8E') < 4.5);
});
