import { describe, expect, it } from 'vitest';
import {
  reviewPrlPublication,
  type PrlNightState,
} from '@/features/pricing/application/prl-review';

/** W16 E4 — revisão do lote no servidor (REQ-013, REQ-052; TECH-033). Valores de teste arbitrários. */
const NOW = new Date('2026-11-20T12:00:00Z');
const state = (stayDate: string, extra: Partial<PrlNightState> = {}): PrlNightState => ({
  stayDate,
  season: 'media',
  inForceMinor: null,
  hasVersion: false,
  latestStart: null,
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
      latestStart: new Date('2026-11-01T00:00:00Z'),
    }),
  ],
  [
    '2027-01-04',
    state('2027-01-04', {
      hasVersion: true,
      inForceMinor: 60_000n,
      latestStart: new Date('2026-12-01T00:00:00Z'),
    }),
  ],
]);

describe('PRL — revisão do lote (seleção, estados e totais)', () => {
  it('[REQ-052][TECH-033] valor comum e valores individuais por noite: linhas, totais exatos e prévia de Créditos', () => {
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
        proposedMinor: '123456',
        credits: '8950.56',
      },
      {
        stayDate: '2027-01-02',
        season: 'media',
        currentMinor: null,
        proposedMinor: '100001',
        credits: '7250.0725',
      },
    ]);
    expect(review).toMatchObject({
      totalProposedMinor: '223457',
      totalCurrentMinor: null,
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

  it('[REQ-052][BR-182] alteração compara vigente × novo e só começa depois da última versão de cada noite', () => {
    const immediate = reviewPrlPublication(
      {
        kind: 'change',
        nights: [
          { stayDate: '2027-01-03', amount: '510,00' },
          { stayDate: '2027-01-04', amount: '620,00' },
        ],
        effectiveFrom: null,
      },
      states,
      null,
      NOW,
    );
    expect(immediate.rows.map((row) => [row.currentMinor, row.proposedMinor])).toEqual([
      ['50000', '51000'],
      ['60000', '62000'],
    ]);
    expect(immediate.totalCurrentMinor).toBe('110000');
    // A noite 04 tem versão agendada para depois de agora: a alteração imediata a anteciparia.
    expect(immediate.issues).toEqual([{ issue: 'not_after_latest', nights: ['2027-01-04'] }]);
    const later = reviewPrlPublication(
      {
        kind: 'change',
        nights: [{ stayDate: '2027-01-04', amount: '620,00' }],
        effectiveFrom: '2026-12-02T00:00:00Z',
      },
      states,
      null,
      NOW,
    );
    expect(later.issues).toEqual([]);
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
});
