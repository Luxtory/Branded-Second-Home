// npm run trace — rastreabilidade (03 §12): IDs cobertos por testes APROVADOS, lidos das tags nos títulos.
//   npm run trace                      lista as tags cobertas
//   npm run trace -- --expect A,B,…   falha se alguma tag não estiver coberta
//   npm run trace -- --gate            falha se o gate do 03 §12 não estiver cumprido
// Fontes: reports/vitest.json (npm run coverage) e reports/playwright.json (npm run test:e2e).
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPORTS = ['reports/vitest.json', 'reports/playwright.json'];
const PRODUCT_SPEC = 'docs/specs/canonical/02-product-spec.md';
const TECHNICAL_SPEC = 'docs/specs/canonical/03-technical-spec.md';
const TAG = /\[((?:REQ|PD|TECH|BR)-\d{3}|INV-\d+|ADR-\d{3,4}|EC-\d+|CONC-\d+)\]/g;

export class TraceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TraceError';
  }
}

/** Títulos completos dos testes aprovados num relatório JSON do Vitest. */
export function vitestPassedTitles(report) {
  return (report.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? [])
      .filter((test) => test.status === 'passed')
      .map((test) => [...(test.ancestorTitles ?? []), test.title].join(' ')),
  );
}

/** Títulos completos dos testes aprovados num relatório JSON do Playwright. */
export function playwrightPassedTitles(report) {
  const walk = (suite, parents) => {
    const path = suite.title ? [...parents, suite.title] : parents;
    const specs = (suite.specs ?? [])
      .filter((spec) => (spec.tests ?? []).length > 0)
      .filter((spec) => spec.tests.every((test) => test.status === 'expected'))
      .map((spec) => [...path, spec.title].join(' '));
    return [...specs, ...(suite.suites ?? []).flatMap((child) => walk(child, path))];
  };
  return (report.suites ?? []).flatMap((suite) => walk(suite, []));
}

export function tagsIn(titles) {
  return new Set(titles.flatMap((title) => [...title.matchAll(TAG)].map((match) => match[1])));
}

/** Itens exigidos pelo gate, derivados dos canônicos (nada presumido — TECH-001). */
export function gateRequirements(productSpec, technicalSpec) {
  const ids = (pattern) => [...new Set(productSpec.match(pattern) ?? [])];
  const edgeCases = productSpec.split(/^## 15\./m)[1]?.split(/^## /m)[0] ?? '';
  const edgeCaseCount = (edgeCases.match(/^\d+\. /gm) ?? []).length;
  const concurrencyLine =
    technicalSpec
      .split(/^Concorrência:\s*$/m)[1]
      ?.trim()
      .split('\n')[0] ?? '';
  const concurrencyCount = concurrencyLine.split(' · ').filter(Boolean).length;
  const numbered = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);
  return {
    REQ: ids(/\bREQ-\d{3}\b/g),
    PD: ids(/\bPD-\d{3}\b/g),
    INV: ids(/\bINV-\d+\b/g),
    EC: numbered('EC', edgeCaseCount),
    CONC: numbered('CONC', concurrencyCount),
  };
}

function readReports() {
  const found = REPORTS.filter((file) => existsSync(file));
  if (found.length === 0) {
    throw new TraceError(
      'No test report found: run `npm run coverage` and/or `npm run test:e2e` first.',
    );
  }
  return found.flatMap((file) => {
    const report = JSON.parse(readFileSync(file, 'utf8'));
    return file.includes('playwright')
      ? playwrightPassedTitles(report)
      : vitestPassedTitles(report);
  });
}

function main(argv) {
  const covered = tagsIn(readReports());
  const expectIndex = argv.indexOf('--expect');
  if (expectIndex !== -1) {
    const expected = (argv[expectIndex + 1] ?? '').split(',').filter(Boolean);
    if (expected.length === 0)
      throw new TraceError('--expect needs a comma-separated list of tags');
    const missing = expected.filter((tag) => !covered.has(tag));
    console.log(`trace --expect: ${expected.length - missing.length}/${expected.length} covered`);
    if (missing.length > 0) {
      console.error(`Missing (no passing test tagged): ${missing.join(', ')}`);
      return 1;
    }
    return 0;
  }
  if (argv.includes('--gate')) {
    const required = gateRequirements(
      readFileSync(PRODUCT_SPEC, 'utf8'),
      readFileSync(TECHNICAL_SPEC, 'utf8'),
    );
    let failed = false;
    for (const [kind, items] of Object.entries(required)) {
      const missing = items.filter((tag) => !covered.has(tag));
      console.log(`${kind}: ${items.length - missing.length}/${items.length}`);
      if (missing.length > 0) {
        failed = true;
        console.error(`  missing: ${missing.join(', ')}`);
      }
    }
    return failed ? 1 : 0;
  }
  console.log([...covered].sort().join('\n') || '(no tagged passing test)');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
