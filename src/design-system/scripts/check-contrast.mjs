#!/usr/bin/env node
// Enforces WCAG 2.2 AA contrast for every semantic pair declared in tokens.json ($extensions["lx.contrast"]),
// on every ground, plus white text over the minimum scrim on a worst-case (white) image pixel.
// Usage: node src/design-system/scripts/check-contrast.mjs
import { fileURLToPath } from 'node:url';
import { GROUNDS, groundColor, loadTokens, resolveValue } from './lib/tokens.mjs';

export const MIN_TEXT = 4.5;
export const MIN_UI = 3;

function parseHex(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected #RRGGBB color, got: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16));
}

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb) {
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (hex strings or [r,g,b] arrays). */
export function contrast(a, b) {
  const [la, lb] = [a, b].map((c) => luminance(Array.isArray(c) ? c : parseHex(c)));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Color of `top` at `alpha` composited over `bottom`. */
export function composite(top, bottom, alpha) {
  const [t, b] = [parseHex(top), parseHex(bottom)];
  return t.map((value, i) => value * alpha + b[i] * (1 - alpha));
}

export function runContrast(tokens = loadTokens()) {
  const rules = tokens.$extensions['lx.contrast'];
  const results = [];
  for (const ground of GROUNDS) {
    for (const [kind, min] of [['text', MIN_TEXT], ['ui', MIN_UI]]) {
      for (const [fg, bg] of rules[kind]) {
        const ratio = contrast(groundColor(tokens, ground, fg), groundColor(tokens, ground, bg));
        results.push({ check: `${ground}: ${fg} on ${bg}`, kind, min, ratio, pass: ratio >= min });
      }
    }
  }
  const white = resolveValue(tokens, tokens.palette['pure-white'].$value);
  const scrimColor = resolveValue(tokens, tokens.scrim.color.$value);
  const worstPixel = composite(scrimColor, white, tokens.scrim['min-alpha'].$value);
  const ratio = contrast(white, worstPixel);
  results.push({ check: 'scrim: white text over min scrim on white pixel', kind: 'text', min: MIN_TEXT, ratio, pass: ratio >= MIN_TEXT });
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = runContrast();
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.ratio.toFixed(2).padStart(5)} ≥ ${r.min}  ${r.check}`);
  }
  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.error(`${failures.length} contrast check(s) failed.`);
    process.exit(1);
  }
}
