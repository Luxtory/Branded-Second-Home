// Terminology guardrails (REQ-100, REQ-101): no "cota"/derivatives, no "diária(s)", no return promises
// anywhere in the design system's user-facing material (Lab, styles, docs next to the code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DS_ROOT } from './lib/tokens.mjs';

const FORBIDDEN = [
  /\bcot(a|as|ista|istas|izar|ização)\b/i,
  /\bdi[aá]rias?\b/i,
  /\b(rentabilidade|valoriza[çc][ãa]o|renda) garantid[ao]s?\b/i,
  /\bretorno garantido\b/i,
];

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'scripts' || name === 'fonts' ? [] : files(path);
    return /\.(html|css|md|json|js|svg)$/.test(name) ? [path] : [];
  });
}

test('no forbidden terms in design-system material (REQ-100, REQ-101)', () => {
  const hits = files(DS_ROOT).flatMap((path) => readFileSync(path, 'utf8').split('\n').flatMap((line, i) =>
    FORBIDDEN.filter((re) => re.test(line)).map((re) => `${relative(DS_ROOT, path)}:${i + 1} ${re}`)));
  assert.deepEqual(hits, []);
});
