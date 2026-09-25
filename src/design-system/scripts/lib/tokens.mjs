// Token loading, reference resolution and CSS generation for the Luxtory Design System.
// Zero dependencies (Node 22). Source of truth: src/design-system/tokens/tokens.json (W3C DTCG).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TOKENS_JSON = join(DS_ROOT, 'tokens', 'tokens.json');
export const TOKENS_CSS = join(DS_ROOT, 'tokens', 'tokens.css');
export const GROUNDS = ['paper', 'wash', 'night'];

const REFERENCE = /^\{([a-z0-9-]+)\.([a-z0-9-]+)\}$/;

export function loadTokens(path = TOKENS_JSON) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const isMeta = (key) => key.startsWith('$');

/** Entries of a token group, skipping $-prefixed metadata. */
export function entries(group) {
  return Object.entries(group).filter(([key]) => !isMeta(key));
}

/** Resolves a token value to its final literal, following {group.name} references. */
export function resolveValue(tokens, value, seen = new Set()) {
  const match = typeof value === 'string' ? value.match(REFERENCE) : null;
  if (!match) return value;
  const [, group, name] = match;
  const ref = `${group}.${name}`;
  if (seen.has(ref)) throw new Error(`Circular token reference: ${ref}`);
  const target = tokens[group]?.[name];
  if (!target) throw new Error(`Unresolved token reference: {${ref}}`);
  return resolveValue(tokens, target.$value, new Set([...seen, ref]));
}

/** Resolved hex value of a semantic color for a ground, e.g. groundColor(tokens, 'night', 'fg'). */
export function groundColor(tokens, ground, name) {
  const token = tokens.ground?.[ground]?.[name];
  if (!token) throw new Error(`Missing ground token: ground.${ground}.${name}`);
  return resolveValue(tokens, token.$value);
}

function cssValue(value) {
  const match = typeof value === 'string' ? value.match(REFERENCE) : null;
  return match ? `var(--lx-${match[1]}-${match[2]})` : String(value);
}

function declarations(pairs, indent) {
  return pairs.map(([name, value]) => `${indent}${name}: ${value};`).join('\n');
}

/** Generates tokens.css from the token tree. Deterministic: same input → same output. */
export function buildCss(tokens) {
  const root = [];
  for (const [groupName, group] of entries(tokens)) {
    if (groupName === 'ground') continue;
    for (const [name, token] of entries(group)) {
      if (token.$value === undefined) throw new Error(`Token without $value: ${groupName}.${name}`);
      root.push([`--lx-${groupName}-${name}`, cssValue(token.$value)]);
    }
  }
  const grounds = GROUNDS.map((ground) => {
    const selector = ground === 'paper' ? ':root,\n  [data-ground="paper"]' : `[data-ground="${ground}"]`;
    const pairs = entries(tokens.ground[ground]).map(([name, token]) => [`--lx-color-${name}`, cssValue(token.$value)]);
    return `  ${selector} {\n${declarations(pairs, '    ')}\n  }`;
  });
  return [
    '/* GENERATED FILE — do not edit.',
    ' * Source: src/design-system/tokens/tokens.json',
    ' * Regenerate: node src/design-system/scripts/build-tokens.mjs',
    ' * Spec: docs/specs/design-system.md */',
    '@layer lx.tokens {',
    `  :root {\n${declarations(root, '    ')}\n  }`,
    '',
    grounds.join('\n\n'),
    '}',
    '',
  ].join('\n');
}
