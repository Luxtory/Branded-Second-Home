import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Integridade mecânica da camada de comunicação (ADR-0011, ADR-0012): só o que o Git e a revisão humana não pegam
// sozinhos.
const DIR = join('docs', 'specs', 'communication');
const CONTRACT = join('docs', 'specs', 'communication.md');
const BASE = join(DIR, 'luxtory.md');
const B2C = join(DIR, 'b2c.md');
const BRAND_PARTNERS = join(DIR, 'brand-partners.md');
const DOCUMENTS = [CONTRACT, BASE, B2C, BRAND_PARTNERS];
// Framework B2C: fonte canônica congelada, recebida da Luxtory em 2026-09-30 (ADR-0012). Nova versão troca o arquivo
// inteiro e este hash no mesmo PR.
const FRAMEWORK_B2C = join(DIR, 'framework-b2c.md');
const FRAMEWORK_B2C_SHA256 = '7b0ec6c1b8eb828f509b46e77c1c8f2205825190412c9f4aa5176e7a4dab5577';
const CANONICAL = [
  '01-business-model-business-rules.md',
  '02-product-spec.md',
  '03-technical-spec.md',
].map((file) => join('docs', 'specs', 'canonical', file));

const CANONICAL_ID = /\b(?:BR|REQ|PD|TECH)-\d{3}\b|\bINV-\d+\b/g;
const REGISTER_REFERENCE = /\b[DHP]-(?:LX|B2C|BP)-\d{2}\b/g;
const REGISTER_ROW = /^\| ([DHP]-(?:LX|B2C|BP)-\d{2}) \|/gm;
const REGISTER_ROW_START = /^\| [DHP]-(?:LX|B2C|BP)-\d{2} \|/;
const RELATIVE_LINK = /\]\((?!https?:|mailto:|#)([^)\s]+)\)/g;
const FRAMEWORK_REFERENCE = /\[FW-B2C: ([^\]]+)\]/g;
const FRAMEWORK_TOKEN = /§(\d+(?:\.\d+)?)|\b(P[1-5])\b/g;
const FRAMEWORK_NUMBERED_HEADING = /^# (\d+(?:\.\d+)?)\.?\s/gm;
const FRAMEWORK_STAGE_HEADING = /^# (P[1-5]) —/gm;
const SUPERSEDED = 'substituída';
const BRAND_PARTNERS_ONLY = 'só Brand Partners';
// Âncoras verbatim do Framework que a aplicação B2C precisa carregar no mapa de páginas.
const B2C_ANCHORS = ['Conheça as Residence Editions.', 'Unaware → Product Aware'];

const BASE_SECTIONS = ['Mentor', 'Personalidade', 'Tom-base', 'Guardrails', 'Registro'];
const PROTAGONIST_SECTIONS = [
  'Posicionamento',
  'Narrativa',
  'Personagens',
  'Crenças',
  'Jornada e 5Ps',
  'Tom',
  'Input mínimo',
  'Registro',
];
const B2C_SECTIONS = [
  'Escopo e precedência',
  'Leitura canônica',
  'Posicionamento',
  'Narrativa',
  'Personagens',
  'Crenças',
  'Variações por modalidade',
  'Jornada e 5Ps',
  'Tom',
  'Input mínimo',
  'Registro',
];

const read = (path: string) => readFileSync(path, 'utf8');
const matches = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].map((m) => m[1] ?? m[0]);
const sections = (path: string) =>
  read(path)
    .split('\n')
    .filter((line) => line.startsWith('## '));
const lines = (path: string) => read(path).split('\n');
// IDs cuja linha de registro traz o marcador de status informado.
const registeredWith = (marker: string) =>
  new Set(
    DOCUMENTS.flatMap((path) =>
      lines(path)
        .filter((line) => line.includes(marker))
        .flatMap((line) => matches(line, REGISTER_ROW)),
    ),
  );
// Citações de um ID fora da sua própria linha de registro.
const citationsOutsideRegister = (paths: string[], ids: Set<string>) =>
  paths.flatMap((path) =>
    lines(path).flatMap((line, index) =>
      matches(line, REGISTER_REFERENCE)
        .filter((id) => ids.has(id) && !REGISTER_ROW_START.test(line))
        .map((id) => ({ path, line: index + 1, id })),
    ),
  );

describe('camada de comunicação (docs/specs/communication)', () => {
  it('[ADR-0011] todo ID canônico citado existe nos canônicos 01/02/03', () => {
    const canonical = new Set(CANONICAL.flatMap((path) => matches(read(path), CANONICAL_ID)));
    const cited = DOCUMENTS.flatMap((path) =>
      matches(read(path), CANONICAL_ID).map((id) => ({ path, id })),
    );

    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter(({ id }) => !canonical.has(id))).toEqual([]);
  });

  it('[ADR-0011] toda decisão, hipótese e pendência citada está definida num registro', () => {
    const defined = new Set(DOCUMENTS.flatMap((path) => matches(read(path), REGISTER_ROW)));
    const cited = DOCUMENTS.flatMap((path) =>
      matches(read(path), REGISTER_REFERENCE).map((id) => ({ path, id })),
    );

    expect(defined.size).toBeGreaterThan(0);
    expect(cited.filter(({ id }) => !defined.has(id))).toEqual([]);
  });

  it('[ADR-0011] [ADR-0012] base, aplicação B2C e preenchimentos têm as seções mínimas', () => {
    const missing = [
      ...BASE_SECTIONS.map((section) => ({ path: BASE, section })),
      ...B2C_SECTIONS.map((section) => ({ path: B2C, section })),
      ...PROTAGONIST_SECTIONS.map((section) => ({ path: BRAND_PARTNERS, section })),
    ].filter(({ path, section }) => !sections(path).some((line) => line.includes(section)));

    expect(missing).toEqual([]);
  });

  it('[ADR-0011] links relativos dos documentos de comunicação resolvem', () => {
    const broken = DOCUMENTS.flatMap((path) =>
      matches(read(path), RELATIVE_LINK)
        .map((link) => join(dirname(path), decodeURI(link.replace(/#.*$/, ''))))
        .filter((target) => !existsSync(target))
        .map((target) => ({ path, target })),
    );

    expect(broken).toEqual([]);
  });

  it('[ADR-0012] o Framework B2C é a cópia congelada recebida da Luxtory (sha256 fixado)', () => {
    const hash = createHash('sha256').update(readFileSync(FRAMEWORK_B2C)).digest('hex');

    expect(hash).toBe(FRAMEWORK_B2C_SHA256);
  });

  it('[ADR-0012] toda referência [FW-B2C: …] aponta para uma seção existente do Framework B2C', () => {
    const framework = read(FRAMEWORK_B2C);
    const headings = new Set([
      ...matches(framework, FRAMEWORK_NUMBERED_HEADING),
      ...matches(framework, FRAMEWORK_STAGE_HEADING),
    ]);
    const references = DOCUMENTS.flatMap((path) =>
      matches(read(path), FRAMEWORK_REFERENCE).map((body) => ({ path, body })),
    );
    const unresolved = references.flatMap(({ path, body }) => {
      const tokens = [...body.matchAll(FRAMEWORK_TOKEN)].map((m) => m[1] ?? m[2] ?? m[0]);
      if (tokens.length === 0) return [{ path, body, token: '(nenhuma seção)' }];
      return tokens.filter((token) => !headings.has(token)).map((token) => ({ path, body, token }));
    });

    expect(references.some(({ path }) => path === B2C)).toBe(true);
    expect(unresolved).toEqual([]);
  });

  it('[ADR-0012] decisão ou hipótese substituída só aparece na própria linha de registro', () => {
    const superseded = registeredWith(SUPERSEDED);

    expect(superseded.size).toBeGreaterThan(0);
    expect(citationsOutsideRegister(DOCUMENTS, superseded)).toEqual([]);
  });

  it('[ADR-0012] a aplicação B2C não usa decisões que valem só para Brand Partners', () => {
    const brandPartnersOnly = registeredWith(BRAND_PARTNERS_ONLY);

    expect(brandPartnersOnly.size).toBeGreaterThan(0);
    expect(citationsOutsideRegister([B2C], brandPartnersOnly)).toEqual([]);
  });

  it('[ADR-0012] o mapa de páginas B2C carrega as âncoras do Framework', () => {
    const b2c = read(B2C);

    expect(B2C_ANCHORS.filter((anchor) => !b2c.includes(anchor))).toEqual([]);
  });
});
