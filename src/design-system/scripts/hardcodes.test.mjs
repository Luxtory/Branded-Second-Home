// Hardcodes: visual decisions only through tokens. [docs/specs/design-system.md §5 Contrato de CSS]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cssFromHtml, runHardcodes, scanCss } from './check-hardcodes.mjs';

const rules = (css) => scanCss(css, { breakpoints: ['48rem'] }).map((v) => v.rule);

test('detects color, font, duration, easing and z-index literals', () => {
  assert.deepEqual(rules('a{color:#0F4E67}'), ['color-hex']);
  assert.deepEqual(rules('a{background:rgb(0 0 0)}'), ['color-function']);
  assert.deepEqual(rules('a{border-color:white}'), ['color-named']);
  assert.deepEqual(rules('a{font-family:Georgia}'), ['font-family']);
  assert.deepEqual(rules('a{transition:opacity 200ms}'), ['duration']);
  assert.deepEqual(rules('a{transition-timing-function:ease-in-out}'), ['easing']);
  assert.deepEqual(rules('a{z-index:999}'), ['z-index']);
  assert.deepEqual(rules('@media (min-width: 50rem){a{top:0}}'), ['media-breakpoint']);
});

test('width media queries are mobile-first: max-width is refused even on a breakpoint token (ADR-0009)', () => {
  assert.deepEqual(rules('@media (max-width: 48rem){a{top:0}}'), ['media-max-width']);
  assert.deepEqual(rules('@media (max-width: 50rem){a{top:0}}'), ['media-max-width', 'media-breakpoint']);
  assert.deepEqual(rules('@media (prefers-reduced-motion: reduce){a{top:0}}'), []);
});

test('accepts token usage, font definitions and neutral values', () => {
  assert.deepEqual(rules('a{color:var(--lx-color-fg);transition:opacity var(--lx-duration-base) var(--lx-ease-settle)}'), []);
  assert.deepEqual(rules('@font-face{font-family:"X";src:url(x.woff2)}'), []);
  assert.deepEqual(rules('a{z-index:var(--lx-z-sticky);animation-duration:0s;background:transparent}'), []);
  assert.deepEqual(rules('@media (min-width: 48rem){a{top:0}}'), []);
  assert.deepEqual(rules('/* #FFF */ a{fill:currentColor}'), []);
});

test('Core: radius and shadow are tokens; 0, 50% and token-built inset rings stay allowed', () => {
  assert.deepEqual(rules('a{border-radius:6px}'), ['radius']);
  assert.deepEqual(rules('a{border-top-left-radius:0.375rem}'), ['radius']);
  assert.deepEqual(rules('a{box-shadow:0 4px 12px var(--lx-color-rule)}'), ['shadow']);
  assert.deepEqual(rules('a{border-radius:var(--lx-radius-hairline);box-shadow:var(--lx-shadow-overlay)}'), []);
  assert.deepEqual(rules('a{border-radius:50%;box-shadow:inset 0 0 0 var(--lx-border-hairline) var(--lx-color-fg)}'), []);
  assert.deepEqual(rules('a{border-radius:0;box-shadow:none}'), []);
});

test('the max-width property is allowed; only the max-width media query is refused', () => {
  assert.deepEqual(rules('a{max-width:45rem}'), []);
  assert.deepEqual(rules('a{max-width:calc(var(--lx-layout-measure) + 2rem)}'), []);
  assert.deepEqual(rules('@media (max-width: 48rem){a{max-width:45rem}}'), ['media-max-width']);
});

test('extracts CSS from <style> and style="" in HTML', () => {
  const css = cssFromHtml('<style>a{color:red}</style><p style="color:#fff"></p>');
  assert.deepEqual(scanCss(css).map((v) => v.rule).sort(), ['color-hex', 'color-named']);
});

test('design-system styles and Lab have zero hardcoded visual values', () => {
  const violations = runHardcodes().map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`);
  assert.deepEqual(violations, []);
});
