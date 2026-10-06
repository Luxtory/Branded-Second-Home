#!/usr/bin/env node
// Fails when a visual decision is hardcoded outside tokens.css: color literals, font-family,
// durations, easings, z-index, border-radius, box-shadow lengths, or @media widths that are not breakpoint tokens.
// The CSS *property* max-width (containers, measure) is allowed; only @media (max-width: …) is refused.
// Width media queries are mobile-first (ADR-0009): only min-width. The base style serves the phone and each
// breakpoint only adds; a max-width query would open a second styling path and regressions at the cuts. An
// exception is a deliberate Design System decision (spec + ADR), never a workaround.
// Scans src/design-system/styles/**/*.css and the Lab (lab/*.css, <style> and style="" in lab/*.html).
// Usage: node src/design-system/scripts/check-hardcodes.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DS_ROOT, entries, loadTokens } from './lib/tokens.mjs';

const NAMED_COLORS = ['white', 'black', 'red', 'blue', 'green', 'gray', 'grey', 'navy', 'gold', 'beige', 'ivory', 'silver', 'tan'];

const RULES = [
  { id: 'color-hex', test: (prop, value) => /#[0-9a-f]{3,8}\b/i.test(value) && !/url\(/i.test(value) },
  { id: 'color-function', test: (prop, value) => /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.test(value) },
  {
    id: 'color-named',
    test: (prop, value) => /color|background|border|outline|fill|stroke|shadow|caret|accent/i.test(prop)
      && new RegExp(`(^|[\\s,(])(${NAMED_COLORS.join('|')})($|[\\s,)])`, 'i').test(value),
  },
  { id: 'font-family', test: (prop, value) => /^font(-family)?$/i.test(prop) && !/^(var\(--lx-|inherit$)/.test(value) },
  { id: 'duration', test: (prop, value) => /^(transition|animation)/i.test(prop) && /(^|[\s,])(?!0m?s\b)\d*\.?\d+m?s\b/i.test(value) },
  { id: 'easing', test: (prop, value) => /\b(cubic-bezier|steps)\(|(^|[\s,])(ease|ease-in|ease-out|ease-in-out)($|[\s,])/i.test(value) },
  { id: 'z-index', test: (prop, value) => /^z-index$/i.test(prop) && !/^(var\(--lx-z-|auto$|0$|-1$|calc\(var\(--lx-z-)/.test(value) },
  // Core (§13.3): radius is a system decision — tokens only; 0 and 50% (a geometric circle) stay local.
  {
    id: 'radius',
    test: (prop, value) => /^border(-[a-z]+)*-radius$/i.test(prop) && !/^(var\(--lx-radius-[a-z0-9-]+\)|0|50%|inherit)$/.test(value),
  },
  // Shadows come from tokens; an inset ring may be built only from zeros and tokens (no length literal).
  {
    id: 'shadow',
    test: (prop, value) => /^box-shadow$/i.test(prop) && value !== 'none' && /(^|[\s,(])-?\d*\.?\d+(px|rem|em)\b/.test(value.replace(/var\([^)]*\)/g, '')),
  },
];

const blank = (m) => m.replace(/[^\n]/g, ' ');

// Comments are ignored; @font-face blocks are font definitions (their font-family descriptor is the token source).
function stripIgnored(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/@font-face\s*\{[^}]*\}/g, blank);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Returns violations in a CSS string. `breakpoints` = allowed @media width values. */
export function scanCss(css, { file = '<inline>', breakpoints = [] } = {}) {
  const clean = stripIgnored(css);
  const violations = [];
  for (const m of clean.matchAll(/(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+)(?=[;}])/gi)) {
    const [, prop, rawValue] = m;
    if (prop.startsWith('--')) continue;
    const value = rawValue.trim();
    for (const rule of RULES) {
      if (rule.test(prop, value)) violations.push({ file, line: lineOf(clean, m.index), rule: rule.id, text: `${prop}: ${value}` });
    }
  }
  for (const m of clean.matchAll(/@media[^{]*\((min|max)-width:\s*([^)]+)\)/gi)) {
    const line = lineOf(clean, m.index);
    if (m[1].toLowerCase() === 'max') violations.push({ file, line, rule: 'media-max-width', text: m[0].trim() });
    if (!breakpoints.includes(m[2].trim())) {
      violations.push({ file, line, rule: 'media-breakpoint', text: m[0].trim() });
    }
  }
  return violations;
}

/** Extracts CSS from <style> blocks and style="" attributes of an HTML document. */
export function cssFromHtml(html) {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...html.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => `x{${m[1]};}`);
  return [...blocks, ...inline].join('\n');
}

function walk(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, predicate);
    return predicate(path) ? [path] : [];
  });
}

export function breakpointValues(tokens = loadTokens()) {
  return entries(tokens.breakpoint).map(([, token]) => token.$value);
}

export function runHardcodes() {
  const breakpoints = breakpointValues();
  const cssFiles = [
    ...walk(join(DS_ROOT, 'styles'), (p) => p.endsWith('.css')),
    ...walk(join(DS_ROOT, 'lab'), (p) => p.endsWith('.css')),
  ];
  const htmlFiles = walk(join(DS_ROOT, 'lab'), (p) => p.endsWith('.html'));
  return [
    ...cssFiles.flatMap((p) => scanCss(readFileSync(p, 'utf8'), { file: relative(DS_ROOT, p), breakpoints })),
    ...htmlFiles.flatMap((p) => scanCss(cssFromHtml(readFileSync(p, 'utf8')), { file: relative(DS_ROOT, p), breakpoints })),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = runHardcodes();
  for (const v of violations) console.error(`${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
  if (violations.length) {
    console.error(`${violations.length} hardcoded value(s). Use var(--lx-*) tokens (src/design-system/tokens/tokens.json).`);
    process.exit(1);
  }
  console.log('No hardcoded visual values outside tokens.css.');
}
