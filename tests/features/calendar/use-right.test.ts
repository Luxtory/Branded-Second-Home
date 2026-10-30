import { describe, expect, it } from 'vitest';
import {
  bucketOfNight,
  firstLeapExercise,
  isLeapYear,
  leapDayBeneficiary,
  leapYearsBetween,
  nonNegativeModulo,
  ordinaryOrder,
  ordinaryPosition,
  type DrawnStake,
} from '@/features/calendar/domain/use-right';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';

const STAKE_COUNTS = [2, 4, 8, 10] as const;

function permutations(n: number): number[][] {
  if (n === 1) return [[1]];
  return permutations(n - 1).flatMap((rest) =>
    Array.from({ length: n }, (_, at) => [...rest.slice(0, at), n, ...rest.slice(at)]),
  );
}

/** PRNG determinístico (mulberry32) para sortear ordens de N = 8 e 10 sem depender da execução. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(n: number, seed: number): number[] {
  const random = seeded(seed);
  const values = Array.from({ length: n }, (_, index) => index + 1);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

/** Ações `s1..sN`, com a posição sorteada de cada uma. */
const drawnFrom = (positions: readonly number[]): DrawnStake[] =>
  positions.map((position, index) => ({ stakeId: `s${index + 1}`, position }));

const orders = (n: number): DrawnStake[][] =>
  n <= 4
    ? permutations(n).map(drawnFrom)
    : [1, 2, 3, 4, 5].map((seed) => drawnFrom(shuffled(n, seed * 7919 + n)));

/** Oráculo independente da BR-093/BR-094: congela a lista em Y_L e avança um índice a cada ano bissexto. */
function frozenListOracle(drawn: readonly DrawnStake[], start: string, untilYear: number) {
  const fixedIn = firstLeapExercise(start);
  const frozen = [...ordinaryOrder(drawn, start, fixedIn)];
  const expected = new Map<number, string | null>();
  let index = 0;
  for (let year = Number(start.slice(0, 4)); year <= untilYear; year += 1) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    if (!leap || year < fixedIn) {
      expected.set(year, null);
      continue;
    }
    expected.set(year, frozen[index % frozen.length]!);
    index += 1;
  }
  return { fixedIn, frozen, expected };
}

describe('Direito de Uso — rotação ordinária (W11)', () => {
  it('[TECH-110] módulo não negativo também para posições intermediárias negativas', () => {
    expect(nonNegativeModulo(-1, 4)).toBe(3);
    expect(nonNegativeModulo(-11, 10)).toBe(9);
    expect(nonNegativeModulo(-20, 10)).toBe(0);
    expect(nonNegativeModulo(7, 4)).toBe(3);
    expect(() => nonNegativeModulo(1, 0)).toThrow(RangeError);
    // Muito à frente da data-base o deslocamento é muito negativo; a posição continua em 1..N.
    expect(
      ordinaryPosition({
        initialPosition: 1,
        stakes: 10,
        operationStartDate: '2027-01-01',
        exerciseYear: 9999,
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it.each(STAKE_COUNTS)(
    '[REQ-032] N = %i: a posição 1 passa à última, as demais avançam e o ciclo completo cobre todas as posições',
    (n) => {
      for (const drawn of orders(n)) {
        const start = '2027-03-01';
        const seen = new Map(drawn.map((stake) => [stake.stakeId, new Set<number>()]));
        for (let k = 0; k < n; k += 1) {
          const year = 2027 + k;
          const order = ordinaryOrder(drawn, start, year);
          const next = ordinaryOrder(drawn, start, year + 1);
          // BR-101: o primeiro vai para o fim; os demais sobem uma posição.
          expect(next).toEqual([...order.slice(1), order[0]]);
          order.forEach((stake, index) => seen.get(stake)!.add(index + 1));
        }
        // BR-102: em N exercícios cada Ação ocupou cada posição exatamente uma vez; depois o ciclo recomeça.
        for (const positions of seen.values()) expect(positions.size).toBe(n);
        expect(ordinaryOrder(drawn, start, 2027 + n)).toEqual(ordinaryOrder(drawn, start, 2027));
      }
    },
  );

  it('[REQ-032][REQ-033] no primeiro exercício (parcial ou completo) vale exatamente a ordem sorteada', () => {
    const drawn = drawnFrom([3, 1, 4, 2]);
    for (const start of ['2027-01-01', '2027-11-01', '2027-12-31']) {
      expect(ordinaryOrder(drawn, start, 2027)).toEqual(['s2', 's4', 's1', 's3']);
    }
    expect(() =>
      ordinaryPosition({
        initialPosition: 1,
        stakes: 4,
        operationStartDate: '2027-11-01',
        exerciseYear: 2026,
      }),
    ).toThrow(RangeError);
  });

  it('[REQ-032] ordem sorteada inválida falha fechada (posição repetida, fora de 1..N ou N fora da configuração)', () => {
    expect(() => ordinaryOrder(drawnFrom([1, 1]), '2027-01-01', 2027)).toThrow(RangeError);
    expect(() => ordinaryOrder(drawnFrom([1, 3]), '2027-01-01', 2027)).toThrow(RangeError);
    expect(() => ordinaryOrder(drawnFrom([1, 2, 3]), '2027-01-01', 2027)).toThrow(RangeError);
  });
});

describe('Direito de Uso — 29 de fevereiro (W11)', () => {
  it('[TECH-110] anos bissextos gregorianos: 2100, 2200 e 2300 comuns; 2000 e 2400 bissextos', () => {
    for (const year of [2000, 2024, 2028, 2096, 2104, 2400]) expect(isLeapYear(year)).toBe(true);
    for (const year of [2026, 2027, 2100, 2200, 2300, 2500]) expect(isLeapYear(year)).toBe(false);
    for (let from = 1; from <= 2500; from += 37) {
      let count = 0;
      for (let year = from; year < from + 450; year += 1) if (isLeapYear(year)) count += 1;
      expect(leapYearsBetween(from, from + 450)).toBe(count);
    }
    expect(leapYearsBetween(2028, 2028)).toBe(0);
  });

  it.each([
    ['2028-01-01', 2028],
    ['2028-02-10', 2028],
    // Data-base igual a 29/02: a noite é a primeira da operação e conta (D5).
    ['2028-02-29', 2028],
    ['2028-03-01', 2032],
    ['2027-11-01', 2028],
    ['2096-03-01', 2104],
    ['2196-03-01', 2204],
    ['2296-03-01', 2304],
    ['2397-05-01', 2400],
  ])(
    '[REQ-031] data-base %s → lista fixada no primeiro 29/02 da operação, em %i',
    (start, year) => {
      expect(firstLeapExercise(start)).toBe(year);
    },
  );

  it.each(STAKE_COUNTS)(
    '[REQ-031] N = %i: a lista derivada é idêntica à congelada na primeira ocorrência, por ciclos completos até 2500',
    (n) => {
      const starts = ['2027-11-01', '2028-02-10', '2028-02-29', '2028-03-01', '2096-03-01'];
      for (const drawn of orders(n)) {
        for (const start of starts) {
          const { fixedIn, frozen, expected } = frozenListOracle(drawn, start, 2500);
          for (const [year, beneficiary] of expected) {
            expect(
              leapDayBeneficiary({ drawn, operationStartDate: start, exerciseYear: year }),
            ).toBe(beneficiary);
          }
          // BR-095: depois de N anos bissextos a lista recomeça na mesma ordem.
          const leapYears = [...expected].filter(([, beneficiary]) => beneficiary !== null);
          expect(leapYears[0]![0]).toBe(fixedIn);
          expect(leapYears[n]![1]).toBe(frozen[0]);
          expect(leapYears.slice(0, n).map(([, stake]) => stake)).toEqual(frozen);
        }
      }
    },
  );

  it('[REQ-031] a lista nunca se rederiva da ordem ordinária de um ano bissexto posterior (N = 2 e 4)', () => {
    for (const n of [2, 4]) {
      for (const drawn of orders(n)) {
        const start = '2028-01-01';
        const fixed = ordinaryOrder(drawn, start, 2028);
        // Quatro anos depois a ordem ordinária volta a ser a mesma (4 ≡ 0 mod N): rederivar daria sempre a mesma Ação.
        expect(ordinaryOrder(drawn, start, 2032)[0]).toBe(fixed[0]);
        expect(leapDayBeneficiary({ drawn, operationStartDate: start, exerciseYear: 2028 })).toBe(
          fixed[0],
        );
        expect(leapDayBeneficiary({ drawn, operationStartDate: start, exerciseYear: 2032 })).toBe(
          fixed[1],
        );
      }
    }
  });

  it('[REQ-031] N = 8 e 10: o beneficiário difere da lista rederivada da ordem ordinária corrente', () => {
    for (const n of [8, 10]) {
      for (const drawn of orders(n)) {
        const start = '2028-01-01';
        const rederived = (year: number, k: number) => ordinaryOrder(drawn, start, year)[k % n];
        const actual = (year: number) =>
          leapDayBeneficiary({ drawn, operationStartDate: start, exerciseYear: year });
        expect(actual(2032)).not.toBe(rederived(2032, 1));
        // Entre 2096 e 2104 a ordem ordinária anda 8 posições; a lista bissexta anda uma.
        const k2096 = leapYearsBetween(2028, 2096);
        expect(actual(2104)).toBe(ordinaryOrder(drawn, start, 2028)[(k2096 + 1) % n]);
      }
    }
  });

  it('[REQ-031][REQ-033] exercício parcial: com 29/02 depois da data-base, a lista é a ordem sorteada; depois, a do 1º 29/02', () => {
    const drawn = drawnFrom([2, 4, 1, 3]);
    // Data-base em 10/02/2028: 2028 é o primeiro exercício e tem 29/02 → lista = ordem sorteada; direito da posição 1.
    expect(
      leapDayBeneficiary({ drawn, operationStartDate: '2028-02-10', exerciseYear: 2028 }),
    ).toBe('s3');
    // Data-base em 01/11/2027 (cenário do fundador): a lista é a ordem de 2028, já rotacionada uma vez.
    expect(ordinaryOrder(drawn, '2027-11-01', 2028)[0]).toBe('s1');
    expect(
      leapDayBeneficiary({ drawn, operationStartDate: '2027-11-01', exerciseYear: 2028 }),
    ).toBe('s1');
    // Data-base em 01/03/2028: o 29/02 de 2028 é anterior à operação; a lista é a ordem de 2032.
    expect(
      leapDayBeneficiary({ drawn, operationStartDate: '2028-03-01', exerciseYear: 2028 }),
    ).toBeNull();
    expect(
      leapDayBeneficiary({ drawn, operationStartDate: '2028-03-01', exerciseYear: 2032 }),
    ).toBe(ordinaryOrder(drawn, '2028-03-01', 2032)[0]);
  });

  it('[REQ-031] transferência posterior da titularidade não altera a lista: a posição pertence à Ação (TECH-042)', () => {
    const drawn = drawnFrom([1, 2, 3, 4]);
    const holders = new Map([
      ['s1', 'party-a'],
      ['s2', 'party-b'],
      ['s3', 'party-c'],
      ['s4', 'party-d'],
    ]);
    const before = [2028, 2032, 2036, 2040].map((year) =>
      leapDayBeneficiary({ drawn, operationStartDate: '2028-01-01', exerciseYear: year }),
    );
    holders.set('s2', 'party-e');
    const after = [2028, 2032, 2036, 2040].map((year) =>
      leapDayBeneficiary({ drawn, operationStartDate: '2028-01-01', exerciseYear: year }),
    );
    expect(after).toEqual(before);
    expect(holders.get(after[1]!)).toBe('party-e');
  });

  it('[TECH-110] o 29/02 é Média/Baixa, mas consome só o bucket leap', () => {
    expect(bucketOfNight({ season: 'media', isLeapDay: true })).toBe('leap');
    expect(bucketOfNight({ season: 'media', isLeapDay: false })).toBe('media');
    expect(bucketOfNight({ season: 'alta', isLeapDay: false })).toBe('alta');
  });
});

describe('Direito de Uso — janelas e fim efetivo (W11)', () => {
  const calendar = createUseRightCalendar(temporalCivilTime);
  const tz = 'America/Sao_Paulo';

  it('[REQ-032] base em 15/09 00:00 local do ano anterior; cada posição abre 7 dias depois; a Luxtory é a posição N+1', () => {
    const input = {
      exerciseYear: 2028,
      stakes: 4,
      formalizedAt: new Date('2027-03-10T12:00:00Z'),
      timezone: tz,
    };
    expect(calendar.windowBase(input).toISOString()).toBe('2027-09-15T03:00:00.000Z');
    const opens = [1, 2, 3, 4, 5].map((position) =>
      calendar.windowOpensAt({ ...input, position }).toISOString(),
    );
    expect(opens).toEqual([
      '2027-09-15T03:00:00.000Z',
      '2027-09-22T03:00:00.000Z',
      '2027-09-29T03:00:00.000Z',
      '2027-10-06T03:00:00.000Z',
      '2027-10-13T03:00:00.000Z',
    ]);
    expect(() => calendar.windowOpensAt({ ...input, position: 6 })).toThrow(RangeError);
    expect(() => calendar.windowOpensAt({ ...input, position: 0 })).toThrow(RangeError);
  });

  it('[REQ-033] formalização depois de 15/09: a ordem vale imediatamente e os intervalos contam da formalização', () => {
    const formalizedAt = new Date('2027-10-20T15:30:00Z');
    for (const exerciseYear of [2027, 2028]) {
      const input = { exerciseYear, stakes: 4, formalizedAt, timezone: tz };
      expect(calendar.windowBase(input)).toEqual(formalizedAt);
      expect(calendar.windowOpensAt({ ...input, position: 3 }).toISOString()).toBe(
        '2027-11-03T15:30:00.000Z',
      );
    }
    // No exercício seguinte a base volta a ser 15/09 do ano anterior.
    expect(
      calendar.windowBase({ exerciseYear: 2029, formalizedAt, timezone: tz }).toISOString(),
    ).toBe('2028-09-15T03:00:00.000Z');
  });

  it('[REQ-032] abertura cumulativa: posições seguintes abrem depois, e nenhuma janela fecha antes do fim do exercício', () => {
    for (const stakes of STAKE_COUNTS) {
      const input = {
        exerciseYear: 2030,
        stakes,
        formalizedAt: new Date('2028-01-01T00:00:00Z'),
        timezone: tz,
      };
      const opens = Array.from({ length: stakes + 1 }, (_, index) =>
        calendar.windowOpensAt({ ...input, position: index + 1 }).getTime(),
      );
      for (let i = 1; i < opens.length; i += 1) expect(opens[i]).toBeGreaterThan(opens[i - 1]!);
      expect(Math.max(...opens)).toBeLessThan(calendar.effectiveEnd('media', 2029, tz).getTime());
    }
  });

  it('[TECH-110] hora local inexistente na abertura é recusada (fail-closed), como o check-in da W10', () => {
    // 20/10/2013 00:00 não existiu em São Paulo (início do horário de verão): 15/09/2013 + 35 dias, posição 6.
    expect(() =>
      calendar.windowOpensAt({
        exerciseYear: 2014,
        position: 6,
        stakes: 10,
        formalizedAt: new Date('2013-01-01T00:00:00Z'),
        timezone: tz,
      }),
    ).toThrow(RangeError);
  });

  it('[PD-004][INV-5] fim efetivo: o 29/02 vence às 00:00 de 01/03; Alta e Média às 00:00 de 01/01 seguinte, no fuso', () => {
    expect(calendar.effectiveEnd('leap', 2028, tz).toISOString()).toBe('2028-03-01T03:00:00.000Z');
    expect(calendar.effectiveEnd('alta', 2028, tz).toISOString()).toBe('2029-01-01T03:00:00.000Z');
    expect(calendar.effectiveEnd('media', 2028, 'America/Noronha').toISOString()).toBe(
      '2029-01-01T02:00:00.000Z',
    );
    expect(calendar.effectiveEnd('media', 2028, 'America/Rio_Branco').toISOString()).toBe(
      '2029-01-01T05:00:00.000Z',
    );
    expect(() => calendar.effectiveEnd('leap', 2100, tz)).toThrow(RangeError);
  });
});
