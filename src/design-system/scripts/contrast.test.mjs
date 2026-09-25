// Contrast: WCAG 2.2 AA on every ground and under the minimum scrim. [docs/specs/design-system.md §6]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composite, contrast, runContrast } from './check-contrast.mjs';

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
