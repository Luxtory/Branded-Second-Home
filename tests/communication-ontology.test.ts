import { describe, expect, it } from 'vitest';
import { aboutMessages } from '../src/features/catalog/presentation/i18n/about-pt-br';
import { brandPartnersMessages as bp } from '../src/features/catalog/presentation/i18n/brand-partners-pt-br';
import { collectionMessages } from '../src/features/catalog/presentation/i18n/collection-pt-br';
import { discoveryMessages as b2c } from '../src/features/catalog/presentation/i18n/discovery-pt-br';
import { messages as admin } from '../src/features/catalog/presentation/i18n/pt-br';

// Regressões semânticas da W4.2 na copy vigente (`D-LX-11`, `D-B2C-27`, `D-BP-28`; `01` v10.2 BR-030 a BR-032): a guarda
// terminológica da BR-377 vê nomes, não ordem nem atribuição. Aqui, as decisões aprovadas no checkpoint de 2026-10-20:
// a demanda é apresentada e validada sobre uma Home Edition já criada; a Home Edition não tem nem define modalidade;
// "DNA" não nomeia o conceito vigente de identidade da marca.

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

describe('comunicação — ontologia da W4.2 (regressões semânticas)', () => {
  it('[BR-030] [D-BP-28] Brand Partners: Home Edition criada → demanda apresentada e validada sobre ela → Second Home estruturada', () => {
    const mechanism = bp.home.mechanism.steps.map((step) => step.title);
    expect(
      ascending(
        order(mechanism, [
          'Da identidade da marca ao Home Concept.',
          'Criar a Home Edition.',
          'Apresentar e validar a demanda.',
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
          'Nasce uma Home Edition.',
          'Apresentar e validar a demanda.',
          'Estruturar cada Second Home.',
        ]),
      ),
    ).toBe(true);

    // Redação aprovada: o interessado indica localização pretendida e modalidade desejada; a Second Home recebe a
    // modalidade definitiva na estruturação.
    for (const line of [
      'A marca apresenta a Home Edition principalmente por seus próprios canais.',
      'A Luxtory conversa com os interessados, que indicam onde gostariam de ter aquela Home Edition e se seu interesse é Owner ou Co-Owner.',
      'A manifestação ajuda a avaliar a oportunidade, mas não constitui aquisição.',
      'Quando demanda e viabilidade justificam avançar, a Luxtory estrutura uma Second Home para uma localização concreta, definindo sua modalidade, estrutura patrimonial e condições comerciais.',
    ]) {
      expect(SURFACES.brandPartners).toContain(line);
    }
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
    const interestFirst =
      /interesse[^.;]*antes (?:de um lançamento|de lançar|da Home Edition|de criar a Home Edition)/i;
    expect(ALL.filter((text) => interestFirst.test(text))).toEqual([]);
    for (const title of [
      'Ouvir a comunidade.',
      'Ouvir antes de lançar.',
      'Lançar uma Home Edition.',
    ]) {
      expect(ALL).not.toContain(title);
    }
  });

  it('[BR-031] [BR-032] nenhuma copy vigente atribui, oferece ou define modalidade na Home Edition', () => {
    const editionWithModality =
      /\bHome Editions?\b[^.;]*\b(?:apresenta|apresentam|oferece|oferecem|define|definem|contempla|contemplam|pode ser|podem ser|permite|permitem)\b[^.;]*\b(?:Owner|Co-Owner|modalidades?|formas de aquisição)\b/i;
    expect(ALL.flatMap(clauses).filter((clause) => editionWithModality.test(clause))).toEqual([]);
    expect(ALL.filter((text) => /formas de aquisição autorizadas/i.test(text))).toEqual([]);
  });

  it('[D-LX-11] "DNA" não nomeia o conceito vigente de identidade da marca', () => {
    expect(ALL.filter((text) => /\bDNA\b/.test(text))).toEqual([]);
  });
});
