#!/usr/bin/env node
// Enforces WCAG 2.2 AA contrast for every semantic pair declared in tokens.json ($extensions["lx.contrast"]),
// on every ground, plus white text over the minimum scrim on a worst-case (white) image pixel.
// Core (docs/specs/design-system.md §13.3): the full matrix semantic role × surface ($extensions["lx.contrast.surface"]),
// with roles that a surface does not permit listed in `notPermitted` (e.g. error states on sand).
// Usage: node src/design-system/scripts/check-contrast.mjs
import { fileURLToPath } from 'node:url';
import { GROUNDS, groundColor, loadTokens, resolveValue, SURFACES, surfaceColor } from './lib/tokens.mjs';

export const MIN_TEXT = 4.5;
export const MIN_UI = 3;
/** Large text (≥ 24 px regular): display roles such as headline and accent numerals. */
export const MIN_LARGE = 3;

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
  // Uniform scrim (lx-hero--uniform): Warm Sand display text over the display scrim on a worst-case (white) pixel.
  const sand = resolveValue(tokens, tokens.palette['warm-sand'].$value);
  // The browser stores the alpha in 8 bits (0.79 renders as 201/255 = 0.788): check the value as rendered.
  const displayAlpha = Math.round(tokens.scrim['display-alpha'].$value * 255) / 255;
  const displayPixel = composite(scrimColor, white, displayAlpha);
  const displayRatio = contrast(sand, displayPixel);
  results.push({ check: 'scrim: Warm Sand display text over display scrim on white pixel', kind: 'large', min: MIN_LARGE, ratio: displayRatio, pass: displayRatio >= MIN_LARGE });
  return results;
}

/** Core matrix: every permitted (role, background-role) pair on every surface. */
export function runSurfaceContrast(tokens = loadTokens()) {
  const rules = tokens.$extensions['lx.contrast.surface'];
  const notPermitted = rules.notPermitted ?? {};
  const results = [];
  for (const surface of SURFACES) {
    const blocked = new Set(notPermitted[surface] ?? []);
    for (const [kind, min] of [['text', MIN_TEXT], ['large', MIN_LARGE], ['ui', MIN_UI]]) {
      for (const [fg, bg] of rules[kind]) {
        if (blocked.has(fg) || blocked.has(bg)) continue;
        const ratio = contrast(surfaceColor(tokens, surface, fg), surfaceColor(tokens, surface, bg));
        results.push({ check: `surface ${surface}: ${fg} on ${bg}`, kind, min, ratio, pass: ratio >= min });
      }
    }
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = [...runContrast(), ...runSurfaceContrast()];
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.ratio.toFixed(2).padStart(5)} ≥ ${r.min}  ${r.check}`);
  }
  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.error(`${failures.length} contrast check(s) failed.`);
    process.exit(1);
  }
}
