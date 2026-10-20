import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aboutMessages } from '../src/features/catalog/presentation/i18n/about-pt-br';
import { brandPartnersMessages as bp } from '../src/features/catalog/presentation/i18n/brand-partners-pt-br';
import { collectionMessages } from '../src/features/catalog/presentation/i18n/collection-pt-br';
import { discoveryMessages as b2c } from '../src/features/catalog/presentation/i18n/discovery-pt-br';
import { messages as admin } from '../src/features/catalog/presentation/i18n/pt-br';

// Regressões semânticas da W4.2 (`D-LX-11`, `D-B2C-27`, `D-BP-28`; `01` v10.2 BR-030 a BR-032) na copy vigente e nas
// fontes superiores (Frameworks e BR-030): a guarda terminológica da BR-377 vê nomes, não ordem nem atribuição. Dois
// mecanismos de validação que nunca se confundem: a Pesquisa de Descoberta & Validação do Home Concept, antes da Home
// Edition (Product Discovery, não comercial), e a manifestação de interesse comercial, que parte de uma Home Edition. A
// Home Edition não tem nem define modalidade; "DNA" não nomeia o conceito vigente de identidade da marca.

/** Todos os textos de um nó do i18n, sem a marcação de destaque (`**`). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value.replaceAll('**', '')];
  if (typeof value === 'function') return [];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

const SURFACES = {
  b2c: strings(b2c),
  brandPartners: strings(bp),
  about: strings(aboutMessages),
  admin: [...strings(admin), ...strings(collectionMessages)],
};
const ALL = Object.values(SURFACES).flat();

const COMMUNICATION = join('docs', 'specs', 'communication');
/** Linhas dos Frameworks ativos, sem a marcação Markdown de ênfase. */
const frameworkLines = (name: string) =>
  readFileSync(join(COMMUNICATION, name), 'utf8').replaceAll('**', '').split('\n');
const FRAMEWORKS = {
  b2c: frameworkLines('framework-b2c.md'),
  brandPartners: frameworkLines('framework-brand-partners.md'),
};
const FRAMEWORK_LINES = Object.values(FRAMEWORKS).flat();
const BR_030 =
  readFileSync(join('docs', 'specs', 'canonical', '01-business-model-business-rules.md'), 'utf8')
    .split('\n')
    .find((line) => line.startsWith('**BR-030**')) ?? '';

/** Frases (o `;` também separa afirmações) — a atribuição é lida dentro de uma afirmação, não no parágrafo todo. */
const clauses = (text: string) => text.split(/[.;]\s+/);

/** A posição de cada título na lista, para provar a ordem do mecanismo. */
function order(titles: readonly string[], expected: readonly string[]): number[] {
  return expected.map((title) => titles.indexOf(title));
}

const ascending = (positions: readonly number[]) =>
  positions.every(
    (position, index) => position >= 0 && (index === 0 || position > positions[index - 1]!),
  );

/** Interesse comercial afirmado antes da Home Edition (a Pesquisa de Descoberta não é interesse e não casa aqui). */
const INTEREST_BEFORE_EDITION =
  /interesse[^.;]*antes (?:de um lançamento|de lançar|da Home Edition|de criar a Home Edition)/i;
/** A Home Edition como quem apresenta, oferece, define ou contempla modalidade. */
const EDITION_WITH_MODALITY =
  /\bHome Editions?\b[^.;]*\b(?:apresenta|apresentam|oferece|oferecem|define|definem|contempla|contemplam|pode ser|podem ser|permite|permitem)\b[^.;]*\b(?:Owner|Co-Owner|modalidades?|formas de aquisição)\b/i;

describe('comunicação — ontologia da W4.2 na copy vigente (regressões semânticas)', () => {
  it('[BR-030] [D-BP-28] Brand Partners: descobrir e validar o Home Concept → criar a Home Edition → captar interesse sobre ela → estruturar a Second Home', () => {
    const mechanism = bp.home.mechanism.steps.map((step) => step.title);
    expect(
      ascending(
        order(mechanism, [
          'Da identidade da marca ao Home Concept.',
          'Descobrir e validar o Home Concept.',
          'Criar a Home Edition.',
          'Apresentar a Home Edition e captar interesse.',
          'Estruturar cada Second Home.',
          'Design & Build.',
        ]),
      ),
    ).toBe(true);

    const path = bp.howItWorks.path.phases.flatMap((phase) =>
      phase.steps.map((step) => step.title),
    );
    expect(
      ascending(
        order(path, [
          'Da identidade da marca ao Home Concept.',
          'Descobrir e validar o Home Concept.',
          'Nasce uma Home Edition.',
          'Apresentar a Home Edition e captar interesse.',
          'Estruturar cada Second Home.',
        ]),
      ),
    ).toBe(true);

    // A descoberta se declara não comercial; o interesse comercial traz localização pretendida e modalidade desejada; a
    // Second Home recebe a modalidade definitiva na estruturação.
    for (const line of [
      'É pesquisa de descoberta, não manifestação de interesse comercial nem aquisição. O resultado orienta se o Home Concept segue, é refinado ou não avança.',
      'Não é manifestação de interesse comercial nem aquisição: o resultado orienta se o Home Concept segue para uma Home Edition, é refinado ou não avança.',
      'A marca apresenta a Home Edition principalmente por seus próprios canais.',
      'A Luxtory conversa com os interessados, que indicam onde gostariam de ter aquela Home Edition e se seu interesse é Owner ou Co-Owner.',
      'A manifestação ajuda a avaliar a oportunidade, mas não constitui aquisição.',
      'Quando demanda e viabilidade justificam avançar, a Luxtory estrutura uma Second Home para uma localização concreta, definindo sua modalidade, estrutura patrimonial e condições comerciais.',
    ]) {
      expect(SURFACES.brandPartners).toContain(line);
    }
    // O mesmo verbo não nomeia as duas etapas.
    expect(ALL).not.toContain('Apresentar e validar a demanda.');
  });

  it('[BR-030] [D-B2C-27] B2C: a jornada da Coleção conhece as Home Editions antes de manifestar interesse e estrutura a Second Home depois', () => {
    const journey = b2c.collection.journey.steps.map((step) => step.title);
    expect(
      ascending(
        order(journey, [
          'Escolha o Home Concept',
          'Conheça as Home Editions',
          'Manifeste interesse numa Home Edition',
          'A Luxtory estrutura a Second Home',
        ]),
      ),
    ).toBe(true);
  });

  it('[BR-030] nenhuma copy vigente põe a manifestação de interesse antes da Home Edition', () => {
    expect(ALL.filter((text) => INTEREST_BEFORE_EDITION.test(text))).toEqual([]);
    for (const title of [
      'Ouvir a comunidade.',
      'Ouvir antes de lançar.',
      'Lançar uma Home Edition.',
    ]) {
      expect(ALL).not.toContain(title);
    }
  });

  it('[BR-031] [BR-032] nenhuma copy vigente atribui, oferece ou define modalidade na Home Edition', () => {
    expect(ALL.flatMap(clauses).filter((clause) => EDITION_WITH_MODALITY.test(clause))).toEqual([]);
    expect(ALL.filter((text) => /formas de aquisição autorizadas/i.test(text))).toEqual([]);
  });

  it('[D-LX-11] "DNA" não nomeia o conceito vigente de identidade da marca', () => {
    expect(ALL.filter((text) => /\bDNA\b/.test(text))).toEqual([]);
  });
});

describe('comunicação — ontologia da W4.2 nas fontes superiores (Frameworks e BR-030)', () => {
  /** As cadeias do mecanismo: linhas com setas que passam pelo Home Concept e pela Home Edition. */
  const chains = FRAMEWORK_LINES.filter(
    (line) => line.includes('→') && line.includes('Home Concept') && line.includes('Home Edition'),
  );

  it('[BR-030] [BR-032] cadeias dos Frameworks: Home Edition → manifestação de interesse → estruturação da Second Home; nunca Home Edition → Owner/Co-Owner', () => {
    // Três ocorrências por Framework (§2, §8 P4 e §15).
    expect(chains).toHaveLength(6);
    for (const chain of chains) {
      expect(chain, chain).not.toMatch(/Home Edition\s*→\s*Owner/);
      const at = (node: string) => chain.indexOf(node);
      expect(at('Home Concept'), chain).toBeLessThan(at('Home Edition'));
      expect(at('Home Edition'), chain).toBeLessThan(at('manifestação de interesse'));
      expect(at('manifestação de interesse'), chain).toBeLessThan(
        at('estruturação da Second Home'),
      );
      expect(at('estruturação da Second Home'), chain).toBeLessThan(at('Design & Build'));
    }
  });

  it('[BR-030] Brand Partners: a Pesquisa de Descoberta & Validação vem antes da Home Edition e nunca é chamada de interesse comercial', () => {
    const brandPartnerChains = chains.filter((line) => FRAMEWORKS.brandPartners.includes(line));
    expect(brandPartnerChains).toHaveLength(3);
    for (const chain of brandPartnerChains) {
      const discovery = chain.indexOf('Pesquisa de Descoberta & Validação');
      expect(discovery, chain).toBeGreaterThan(chain.indexOf('Home Concept'));
      expect(discovery, chain).toBeLessThan(chain.indexOf('Home Edition'));
    }
    // Toda menção à pesquisa fora das cadeias a qualifica como não comercial.
    const mentions = FRAMEWORK_LINES.filter(
      (line) => line.includes('Pesquisa de Descoberta') && !chains.includes(line),
    );
    expect(mentions.length).toBeGreaterThan(0);
    for (const line of mentions) {
      expect(line).toMatch(/não é manifestação de interesse comercial/);
    }
  });

  it('[BR-030] [BR-031] [BR-032] Frameworks: sem interesse comercial antes da Home Edition nem modalidade na Home Edition', () => {
    expect(
      FRAMEWORK_LINES.filter((line) => /captar interesse antes da Home Edition/i.test(line)),
    ).toEqual([]);
    expect(
      FRAMEWORK_LINES.flatMap(clauses).filter((clause) => INTEREST_BEFORE_EDITION.test(clause)),
    ).toEqual([]);
    expect(
      FRAMEWORK_LINES.flatMap(clauses).filter((clause) => EDITION_WITH_MODALITY.test(clause)),
    ).toEqual([]);
  });

  it('[BR-030] o 01 distingue a Pesquisa de Descoberta & Validação (antes da Home Edition) da manifestação de interesse comercial', () => {
    expect(BR_030).toContain(
      'Toda manifestação de interesse comercial DEVE referir-se a uma Home Edition',
    );
    expect(BR_030).toContain('Pesquisa de Descoberta & Validação de um Home Concept');
    expect(BR_030).toContain('NÃO é manifestação de interesse comercial');
    expect(BR_030).not.toContain('se vier a existir');
  });
});
