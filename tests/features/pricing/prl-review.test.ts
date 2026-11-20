import { describe, expect, it } from 'vitest';
import {
  reviewPrlPublication,
  type PrlNightState,
} from '@/features/pricing/application/prl-review';

/** W16 E4 — revisão do lote no servidor (REQ-013, REQ-052; TECH-033). Valores de teste arbitrários. */
const NOW = new Date('2026-11-20T12:00:00Z');
const at = (iso: string) => new Date(iso);
const state = (stayDate: string, extra: Partial<PrlNightState> = {}): PrlNightState => ({
  stayDate,
  season: 'media',
  inForceMinor: null,
  scheduled: [],
  hasVersion: false,
  latest: null,
  ...extra,
});
const states = new Map<string, PrlNightState>([
  ['2027-01-01', state('2027-01-01', { season: 'alta' })],
  ['2027-01-02', state('2027-01-02')],
  [
    '2027-01-03',
    state('2027-01-03', {
      hasVersion: true,
      inForceMinor: 50_000n,
      latest: { amountMinor: 50_000n, effectiveFrom: at('2026-11-01T00:00:00Z') },
    }),
  ],
  // Vigente R$ 500,00 e versão agendada de R$ 600,00 a partir de 01/12.
  [
    '2027-01-04',
    state('2027-01-04', {
      hasVersion: true,
      inForceMinor: 50_000n,
      scheduled: [{ amountMinor: 60_000n, effectiveFrom: at('2026-12-01T00:00:00Z') }],
      latest: { amountMinor: 60_000n, effectiveFrom: at('2026-12-01T00:00:00Z') },
    }),
  ],
  // Só versão agendada (PRL inicial com início futuro): nada vigente agora.
  [
    '2027-01-05',
    state('2027-01-05', {
      hasVersion: true,
      scheduled: [{ amountMinor: 70_000n, effectiveFrom: at('2026-12-10T00:00:00Z') }],
      latest: { amountMinor: 70_000n, effectiveFrom: at('2026-12-10T00:00:00Z') },
    }),
  ],
]);

describe('PRL — revisão do lote (seleção, estados e totais)', () => {
  it('[REQ-052][TECH-033] valor comum e exceção individual na mesma categoria: linhas, totais exatos e prévia de Créditos', () => {
    const review = reviewPrlPublication(
      {
        kind: 'initial',
        nights: [
          { stayDate: '2027-01-02', amount: '1.000,01' },
          { stayDate: '2027-01-01', amount: '1.234,56' },
        ],
        effectiveFrom: null,
      },
      states,
      '7.25',
      NOW,
    );
    expect(review.issues).toEqual([]);
    expect(review.rows).toEqual([
      {
        stayDate: '2027-01-01',
        season: 'alta',
        currentMinor: null,
        scheduled: [],
        previousMinor: null,
        proposedMinor: '123456',
        credits: '8950.56',
      },
      {
        stayDate: '2027-01-02',
        season: 'media',
        currentMinor: null,
        scheduled: [],
        previousMinor: null,
        proposedMinor: '100001',
        credits: '7250.0725',
      },
    ]);
    expect(review).toMatchObject({
      totalProposedMinor: '223457',
      totalPreviousMinor: null,
      totalCredits: '16200.6325',
      multiplierConfigured: true,
    });
  });

  it('[TECH-001] sem multiplicador vigente, nenhuma prévia de Créditos é presumida', () => {
    const review = reviewPrlPublication(
      { kind: 'initial', nights: [{ stayDate: '2027-01-01', amount: '100' }], effectiveFrom: null },
      states,
      null,
      NOW,
    );
    expect(review).toMatchObject({ multiplierConfigured: false, totalCredits: null });
    expect(review.rows[0]?.credits).toBeNull();
  });

  it('[REQ-013] o lote nunca mistura inicial e alteração: noite publicada recusa a inicial; noite sem PRL recusa a alteração', () => {
    const initial = reviewPrlPublication(
      {
        kind: 'initial',
        nights: [
          { stayDate: '2027-01-01', amount: '1' },
          { stayDate: '2027-01-03', amount: '1' },
        ],
        effectiveFrom: null,
      },
      states,
      null,
      NOW,
    );
    expect(initial.issues).toEqual([{ issue: 'already_published', nights: ['2027-01-03'] }]);
    const change = reviewPrlPublication(
      {
        kind: 'change',
        nights: [
          { stayDate: '2027-01-02', amount: '1' },
          { stayDate: '2027-01-03', amount: '510,00' },
        ],
        effectiveFrom: null,
      },
      states,
      null,
      NOW,
    );
    expect(change.issues).toEqual([{ issue: 'not_published', nights: ['2027-01-02'] }]);
  });

  it('[REQ-052][BR-182] com versão agendada, a alteração substitui o preço agendado — vigente R$ 500, agendado R$ 600, novo R$ 650', () => {
    const review = reviewPrlPublication(
      {
        kind: 'change',
        nights: [{ stayDate: '2027-01-04', amount: '650,00' }],
        effectiveFrom: '2026-12-02T00:00:00Z',
      },
      states,
      null,
      NOW,
    );
    expect(review.issues).toEqual([]);
    expect(review.rows).toEqual([
      {
        stayDate: '2027-01-04',
        season: 'media',
        currentMinor: '50000',
        scheduled: [{ amountMinor: '60000', effectiveFrom: '2026-12-01T00:00:00.000Z' }],
        previousMinor: '60000',
        proposedMinor: '65000',
        credits: null,
      },
    ]);
    expect(review.totalPreviousMinor).toBe('60000');
    // Imediata: anteciparia a versão agendada — recusada.
    const immediate = reviewPrlPublication(
      {
        kind: 'change',
        nights: [{ stayDate: '2027-01-04', amount: '650,00' }],
        effectiveFrom: null,
      },
      states,
      null,
      NOW,
    );
    expect(immediate.issues).toEqual([{ issue: 'not_after_latest', nights: ['2027-01-04'] }]);
  });

  it('[REQ-052] noite só com versão agendada: nada vigente agora; o anterior é o agendado; sem agendada, o anterior é o vigente', () => {
    const review = reviewPrlPublication(
      {
        kind: 'change',
        nights: [
          { stayDate: '2027-01-05', amount: '720,00' },
          { stayDate: '2027-01-03', amount: '510,00' },
        ],
        effectiveFrom: '2026-12-11T00:00:00Z',
      },
      states,
      null,
      NOW,
    );
    expect(review.issues).toEqual([]);
    expect(
      review.rows.map((row) => [
        row.stayDate,
        row.currentMinor,
        row.previousMinor,
        row.proposedMinor,
      ]),
    ).toEqual([
      ['2027-01-03', '50000', '50000', '51000'],
      ['2027-01-05', null, '70000', '72000'],
    ]);
    expect(review.totalPreviousMinor).toBe('120000');
  });

  it('[TECH-033][TECH-030] recusas explícitas: vazio, duplicada, não selada, valor inválido, início retroativo, mais de 366', () => {
    const review = reviewPrlPublication(
      {
        kind: 'initial',
        nights: [
          { stayDate: '2027-01-01', amount: '1,234' },
          { stayDate: '2027-01-01', amount: '1' },
          { stayDate: '2028-06-01', amount: '1' },
        ],
        effectiveFrom: '2026-11-19T00:00:00Z',
      },
      states,
      null,
      NOW,
    );
    expect(review.issues).toEqual([
      { issue: 'retroactive', nights: [] },
      { issue: 'invalid_amount', nights: ['2027-01-01'] },
      { issue: 'duplicate', nights: ['2027-01-01'] },
      { issue: 'not_sealed', nights: ['2028-06-01'] },
    ]);
    expect(
      reviewPrlPublication({ kind: 'initial', nights: [], effectiveFrom: null }, states, null, NOW)
        .issues,
    ).toEqual([{ issue: 'empty', nights: [] }]);
    const many = Array.from({ length: 367 }, (_, i) => ({ stayDate: `x-${i}`, amount: '1' }));
    expect(
      reviewPrlPublication(
        { kind: 'initial', nights: many, effectiveFrom: null },
        states,
        null,
        NOW,
      ).issues[0],
    ).toEqual({ issue: 'too_many', nights: [] });
  });

  it('[TECH-054] a confirmação refaz a revisão: noite publicada por outro operador depois da revisão é recusada', () => {
    const before = reviewPrlPublication(
      { kind: 'initial', nights: [{ stayDate: '2027-01-02', amount: '100' }], effectiveFrom: null },
      states,
      null,
      NOW,
    );
    expect(before.issues).toEqual([]);
    const concurrent = new Map(states).set(
      '2027-01-02',
      state('2027-01-02', {
        hasVersion: true,
        inForceMinor: 9_900n,
        latest: { amountMinor: 9_900n, effectiveFrom: NOW },
      }),
    );
    const after = reviewPrlPublication(
      { kind: 'initial', nights: [{ stayDate: '2027-01-02', amount: '100' }], effectiveFrom: null },
      concurrent,
      null,
      NOW,
    );
    expect(after.issues).toEqual([{ issue: 'already_published', nights: ['2027-01-02'] }]);
  });
});
