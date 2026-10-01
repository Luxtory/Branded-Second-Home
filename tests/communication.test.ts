import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Integridade mecânica da camada de comunicação (ADR-0011, ADR-0012, ADR-0013): só o que o Git e a revisão humana não
// pegam sozinhos.
const DIR = join('docs', 'specs', 'communication');
const CONTRACT = join('docs', 'specs', 'communication.md');
const BASE = join(DIR, 'luxtory.md');
const B2C = join(DIR, 'b2c.md');
const BRAND_PARTNERS = join(DIR, 'brand-partners.md');
const DOCUMENTS = [CONTRACT, BASE, B2C, BRAND_PARTNERS];
const CANONICAL = [
  '01-business-model-business-rules.md',
  '02-product-spec.md',
  '03-technical-spec.md',
].map((file) => join('docs', 'specs', 'canonical', file));

const BASE_SECTIONS = ['Mentor', 'Guardrails', 'Fatos transversais', 'Nomenclatura', 'Registro'];
const APPLICATION_SECTIONS = [
  'Escopo e precedência',
  'Leitura canônica',
  'Posicionamento',
  'Narrativa',
  'Personagens',
  'Crenças',
  'Jornada e 5Ps',
  'Tom',
  'Input mínimo',
  'Registro',
];

// Frameworks: fontes canônicas congeladas, recebidas da Luxtory. Nova versão troca o arquivo inteiro e o hash no mesmo
// PR. Cada aplicação cita só o Framework da própria jornada e carrega âncoras verbatim do mapa de páginas.
const JOURNEYS = [
  {
    mark: 'FW-B2C',
    framework: join(DIR, 'framework-b2c.md'),
    sha256: '7b0ec6c1b8eb828f509b46e77c1c8f2205825190412c9f4aa5176e7a4dab5577',
    application: B2C,
    sections: [...APPLICATION_SECTIONS, 'Variações por modalidade'],
    anchors: ['Conheça as Residence Editions.', 'Unaware → Product Aware'],
  },
  {
    mark: 'FW-BP',
    framework: join(DIR, 'framework-brand-partners.md'),
    sha256: 'b97c8ae37dc911d7fa17d947f7fa5f622c17bd30e913bd672f46bd68ac2364a7',
    application: BRAND_PARTNERS,
    sections: APPLICATION_SECTIONS,
    anchors: ['Explore o potencial residencial da sua marca.', 'Unaware → Product Aware'],
  },
];

const CANONICAL_ID = /\b(?:BR|REQ|PD|TECH)-\d{3}\b|\bINV-\d+\b/g;
const REGISTER_REFERENCE = /\b[DHP]-(?:LX|B2C|BP)-\d{2}\b/g;
const REGISTER_ROW = /^\| ([DHP]-(?:LX|B2C|BP)-\d{2}) \|/gm;
const REGISTER_ROW_START = /^\| [DHP]-(?:LX|B2C|BP)-\d{2} \|/;
const RELATIVE_LINK = /\]\((?!https?:|mailto:|#)([^)\s]+)\)/g;
const FRAMEWORK_REFERENCE = /\[(FW-B2C|FW-BP): ([^\]]+)\]/g;
const FRAMEWORK_TOKEN = /§(\d+(?:\.\d+)?)|\b(P[1-5])\b/g;
const FRAMEWORK_NUMBERED_HEADING = /^# (\d+(?:\.\d+)?)\.?\s/gm;
const FRAMEWORK_STAGE_HEADING = /^# (P[1-5]) —/gm;
const SUPERSEDED = 'substituída';

const read = (path: string) => readFileSync(path, 'utf8');
const matches = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].map((m) => m[1] ?? m[0]);
const sections = (path: string) =>
  read(path)
    .split('\n')
    .filter((line) => line.startsWith('## '));
const lines = (path: string) => read(path).split('\n');
const frameworkReferences = (path: string) =>
  [...read(path).matchAll(FRAMEWORK_REFERENCE)].map((m) => ({
    path,
    mark: m[1] ?? '',
    body: m[2] ?? '',
  }));
const frameworkHeadings = (path: string) => {
  const framework = read(path);
  return new Set([
    ...matches(framework, FRAMEWORK_NUMBERED_HEADING),
    ...matches(framework, FRAMEWORK_STAGE_HEADING),
  ]);
};
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

  it('[ADR-0011] [ADR-0013] base e aplicações têm as seções mínimas', () => {
    const missing = [
      ...BASE_SECTIONS.map((section) => ({ path: BASE, section })),
      ...JOURNEYS.flatMap(({ application, sections: required }) =>
        required.map((section) => ({ path: application, section })),
      ),
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

  it.each(JOURNEYS)(
    '[ADR-0012] [ADR-0013] $mark: o Framework é a cópia congelada recebida da Luxtory (sha256 fixado)',
    ({ framework, sha256 }) => {
      const hash = createHash('sha256').update(readFileSync(framework)).digest('hex');

      expect(hash).toBe(sha256);
    },
  );

  it('[ADR-0012] [ADR-0013] toda referência a um Framework aponta para uma seção existente dele', () => {
    const headings = new Map(
      JOURNEYS.map(({ mark, framework }) => [mark, frameworkHeadings(framework)]),
    );
    const unresolved = DOCUMENTS.flatMap(frameworkReferences).flatMap(({ path, mark, body }) => {
      const tokens = [...body.matchAll(FRAMEWORK_TOKEN)].map((m) => m[1] ?? m[2] ?? m[0]);
      if (tokens.length === 0) return [{ path, mark, body, token: '(nenhuma seção)' }];
      return tokens
        .filter((token) => !headings.get(mark)?.has(token))
        .map((token) => ({ path, mark, body, token }));
    });

    expect(unresolved).toEqual([]);
  });

  it.each(JOURNEYS)(
    '[ADR-0012] [ADR-0013] $mark: a aplicação cita o próprio Framework e nunca o de outra jornada',
    ({ mark, application }) => {
      const marks = frameworkReferences(application).map((reference) => reference.mark);

      expect(marks).toContain(mark);
      expect(marks.filter((cited) => cited !== mark)).toEqual([]);
    },
  );

  it('[ADR-0012] [ADR-0013] decisão ou hipótese substituída só aparece na própria linha de registro', () => {
    const superseded = registeredWith(SUPERSEDED);

    expect(superseded.size).toBeGreaterThan(0);
    expect(citationsOutsideRegister(DOCUMENTS, superseded)).toEqual([]);
  });

  it.each(JOURNEYS)(
    '[ADR-0012] [ADR-0013] $mark: o mapa de páginas carrega as âncoras do Framework',
    ({ application, anchors }) => {
      const text = read(application);

      expect(anchors.filter((anchor) => !text.includes(anchor))).toEqual([]);
    },
  );
});
