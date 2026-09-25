#!/usr/bin/env node
// Generates src/design-system/tokens/tokens.css from tokens.json.
// Usage: node src/design-system/scripts/build-tokens.mjs [--check]
//   --check  exits 1 when tokens.css is out of sync (used by tests/CI), writes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCss, loadTokens, TOKENS_CSS } from './lib/tokens.mjs';

const css = buildCss(loadTokens());

if (process.argv.includes('--check')) {
  const current = readFileSync(TOKENS_CSS, 'utf8');
  if (current !== css) {
    console.error('tokens.css is out of sync with tokens.json. Run: node src/design-system/scripts/build-tokens.mjs');
    process.exit(1);
  }
  console.log('tokens.css is in sync.');
} else {
  writeFileSync(TOKENS_CSS, css);
  console.log(`Wrote ${TOKENS_CSS}`);
}
