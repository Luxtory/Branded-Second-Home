import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import allowlist from './terminology-allowlist.json';

// Mesmas regras de src/design-system/scripts/terminology.test.mjs (REQ-100, REQ-101), estendidas a todo o
// código em src/ e aos contratos em docs/api/.
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
const ROOTS = ['src', 'docs/api'];
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.md',
  '.svg',
  '.yaml',
  '.yml',
]);
// Fora da varredura: o arquivo ultron e os testes do Design System, que definem estas mesmas regras.
// Varre centenas de arquivos: no drvfs (/mnt/c) a leitura pode passar do limite padrão de 5 s.
const SCAN_TIMEOUT_MS = 30_000;
const NEVER_SCANNED = new Set(['activate-ultronpx.mjs', join('src', 'design-system', 'scripts')]);

function textFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (NEVER_SCANNED.has(name) || NEVER_SCANNED.has(path)) return [];
    if (statSync(path).isDirectory()) return textFiles(path);
    return TEXT_EXTENSIONS.has(extname(name)) ? [path] : [];
  });
}

describe('terminologia (02 §1)', () => {
  it(
    '[REQ-100] varredura de terminologia cobre src/ e docs/api',
    () => {
      const files = ROOTS.flatMap(textFiles);
      const hits = files.flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            FORBIDDEN.filter((rule) => rule.test(line)).map(
              (rule) => `${path}:${index + 1} ${rule}`,
            ),
          ),
      );

      expect(files.some((path) => path.startsWith('docs/api'))).toBe(true);
      expect(files.some((path) => path.startsWith(join('src', 'features')))).toBe(true);
      expect(hits).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});

// Ontologia (BR-377, `01` v10.2; ADR-0019): Residence, residência ou residencial nunca nomeiam nem enquadram o produto,
// "Brand DNA" virou "identidade da marca" e os identificadores anteriores à W4.2 saíram — denylist explícita, sem regex
// sobre `concept`/`edition` genéricos. A allowlist (caminho + trecho + motivo) cobre só registros datados ou superados,
// o texto da própria regra, a exceção da alternativa convencional e os testes que provam a ausência do nome anterior.
const ONTOLOGY_ROOTS = [
  'src',
  'tests',
  'docs/api',
  'docs/specs',
  'docs/reference',
  'docs/how-to',
  'docs/security',
  'docs/adr',
  'docs/plan',
  'CLAUDE.md',
];
const ONTOLOGY_DENYLIST = [
  /Residence Concepts?\b/,
  /Residence Editions?\b/,
  /(?<![\w-])Residences?\b/,
  /(?<![\w])[Rr]esid[eê]ncias?\b/,
  /(?<![\w])[Rr]esidencia(?:l|is)\b/,
  /Brand DNA/,
  /(?<![\w-])concept_version/,
  /(?<![\w-])concept_id\b/,
  /(?<![\w-])edition_id\b/,
  /\bresidence_id\b/,
  /\bedition_reference_value/,
  /\bregister_residence\b/,
  /\bcreate_concept_version\b/,
  /\bConceptCredit\b/,
  /\blx-concept-/,
  /\blx-edition__/,
  /\bfindPublicConceptOffer\b/,
  /\bEditionModality\b/,
  /\bOfferedModality\b/,
  /\bisModalityOffered\b/,
  /\/v1\/admin\/(?:concepts|concept-|editions|edition-|residences)/,
  /(?<![\w-])concept-media\b/,
  /\binterest_modality_offered\b/,
];
// Os arquivos que definem a própria regra e a sua allowlist ficam fora da varredura.
const RULE_FILES = new Set([
  join('tests', 'terminology-allowlist.json'),
  join('tests', 'terminology.test.ts'),
]);

interface AllowedOccurrence {
  readonly path: string;
  readonly excerpt: string;
  readonly reason: string;
}

function ontologyFiles(): string[] {
  return ONTOLOGY_ROOTS.flatMap((root) =>
    statSync(root).isDirectory() ? textFiles(root) : [root],
  ).filter((path) => !RULE_FILES.has(path));
}

describe('ontologia Home Concept → Home Edition → Second Home (BR-377)', () => {
  it(
    '[REQ-100] nenhum nome nem identificador da ontologia anterior nas superfícies ativas, salvo a allowlist justificada',
    () => {
      const allowed = allowlist as readonly AllowedOccurrence[];
      const used = new Set<AllowedOccurrence>();
      const hits = ontologyFiles().flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .flatMap((line, index) => {
            if (!ONTOLOGY_DENYLIST.some((rule) => rule.test(line))) return [];
            const entry = allowed.find((item) => item.path === path && line.includes(item.excerpt));
            if (entry !== undefined) {
              used.add(entry);
              return [];
            }
            return [`${path}:${index + 1} ${line.trim().slice(0, 120)}`];
          }),
      );

      expect(hits).toEqual([]);
      expect(allowed.every((item) => item.reason.trim().length > 0)).toBe(true);
      // Entrada que não casa mais com nenhuma linha é removida: a allowlist só encolhe.
      expect(allowed.filter((item) => !used.has(item))).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
