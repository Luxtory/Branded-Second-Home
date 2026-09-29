import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Integridade mecânica da camada de comunicação (ADR-0011): só o que o Git e a revisão humana não pegam sozinhos.
const DIR = join('docs', 'specs', 'communication');
const CONTRACT = join('docs', 'specs', 'communication.md');
const BASE = join(DIR, 'luxtory.md');
const PROTAGONISTS = [join(DIR, 'b2c.md'), join(DIR, 'brand-partners.md')];
const DOCUMENTS = [CONTRACT, BASE, ...PROTAGONISTS];
const CANONICAL = [
  '01-business-model-business-rules.md',
  '02-product-spec.md',
  '03-technical-spec.md',
].map((file) => join('docs', 'specs', 'canonical', file));

const CANONICAL_ID = /\b(?:BR|REQ|PD|TECH)-\d{3}\b|\bINV-\d+\b/g;
const REGISTER_REFERENCE = /\b[DHP]-(?:LX|B2C|BP)-\d{2}\b/g;
const REGISTER_ROW = /^\| ([DHP]-(?:LX|B2C|BP)-\d{2}) \|/gm;
const RELATIVE_LINK = /\]\((?!https?:|mailto:|#)([^)\s]+)\)/g;

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

const read = (path: string) => readFileSync(path, 'utf8');
const matches = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].map((m) => m[1] ?? m[0]);
const sections = (path: string) =>
  read(path)
    .split('\n')
    .filter((line) => line.startsWith('## '));

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

  it('[ADR-0011] base e preenchimentos têm as seções mínimas', () => {
    const missing = [
      ...BASE_SECTIONS.map((section) => ({ path: BASE, section })),
      ...PROTAGONISTS.flatMap((path) => PROTAGONIST_SECTIONS.map((section) => ({ path, section }))),
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
});
