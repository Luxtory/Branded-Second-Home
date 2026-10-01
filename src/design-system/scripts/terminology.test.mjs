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
  // Alinhados a src/features/catalog/domain/terminology.ts (ADR-0012, ADR-0013): promessa de retorno e disponibilidade
  // sem limite.
  /(?<![\p{L}\p{N}])(rentabilidade|valoriza[çc][ãa]o|renda|retorno|lucro|rendimento|liquidez|receitas?|vendas|demanda|escala|royalt(?:y|ies)|remunera[çc][ãa]o)\s+(garantid|assegurad)[ao]s?(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(disponibilidade|uso)s?\s+(garantid|irrestrit|ilimitad)[ao]s?(?![\p{L}\p{N}])/iu,
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
