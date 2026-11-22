import { describe, expect, it } from 'vitest';
import { reviewParameterVersion } from '@/features/admin/application/review-parameter';
import type { ParameterVersion } from '@/features/admin/domain/parameter';

/**
 * W16 E4 — revisão de parâmetro antes da confirmação (REQ-095, TECH-030; D3): mesmas regras do command
 * (`successorConflict`) e da leitura (`versionInForce`). Valores de teste arbitrários.
 */
const NOW = new Date('2026-11-20T12:00:00Z');
const at = (iso: string) => new Date(iso);
let next = 0;
const version = (value: string, from: string, to: string | null = null): ParameterVersion => ({
  id: `v${(next += 1)}`,
  key: 'credit_multiplier',
  secondHomeId: null,
  value,
  currency: null,
  effectiveFrom: at(from),
  effectiveTo: to === null ? null : at(to),
  effectiveUntil: to === null ? null : at(to),
});

const current = version('2', '2026-11-01T00:00:00Z');
const scheduled = version('2.5', '2026-12-01T00:00:00Z');

describe('parâmetros — revisão da nova versão (vigência D3)', () => {
  it('[REQ-095][TECH-030] depois de uma agendada: vigente 2,0; agendada 2,5; antes da nova vigência 2,5 → novo', () => {
    const review = reviewParameterVersion(
      [current, scheduled],
      at('2026-12-02T00:00:00Z'),
      null,
      NOW,
    );
    expect(review.conflict).toBeNull();
    expect(review.current?.value).toBe('2');
    expect(review.scheduled.map((item) => item.value)).toEqual(['2.5']);
    expect(review.previous?.value).toBe('2.5');
  });

  it('[TECH-030] publicação imediata com versão futura agendada é recusada antes da confirmação', () => {
    expect(reviewParameterVersion([current, scheduled], null, null, NOW).conflict).toBe('overlap');
    expect(
      reviewParameterVersion([current, scheduled], at('2026-12-01T00:00:00Z'), null, NOW).conflict,
    ).toBe('overlap');
    expect(reviewParameterVersion([current], at('2026-11-19T00:00:00Z'), null, NOW).conflict).toBe(
      'retroactive',
    );
  });

  it('[TECH-030] término explícito: começar exatamente nele é aceito; antes dele, recusado', () => {
    const ending = version('3', '2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z');
    const exact = reviewParameterVersion([ending], at('2026-12-10T00:00:00Z'), null, NOW);
    expect(exact.conflict).toBeNull();
    expect(exact.previous?.value).toBe('3');
    expect(reviewParameterVersion([ending], at('2026-12-09T23:00:00Z'), null, NOW).conflict).toBe(
      'overlap',
    );
  });

  it('[TECH-001] lacuna depois de um término explícito: antes da nova vigência fica ausente, não a versão encerrada', () => {
    const ended = version('3', '2026-11-10T00:00:00Z', '2026-11-15T00:00:00Z');
    const review = reviewParameterVersion([ended], at('2026-12-01T00:00:00Z'), null, NOW);
    expect(review.conflict).toBeNull();
    expect(review.current).toBeNull();
    expect(review.previous).toBeNull();
    // Primeira versão da chave: também ausente antes dela.
    expect(reviewParameterVersion([], null, null, NOW)).toMatchObject({
      conflict: null,
      current: null,
      previous: null,
    });
  });

  it('[TECH-030] término sem início deve ser futuro', () => {
    expect(reviewParameterVersion([current], null, at('2026-11-20T11:00:00Z'), NOW).conflict).toBe(
      'end_not_future',
    );
  });

  it('[TECH-054] mudança concorrente entre revisão e confirmação: o histórico relido recusa a mesma proposta', () => {
    const proposal = at('2026-11-25T00:00:00Z');
    expect(reviewParameterVersion([current], proposal, null, NOW).conflict).toBeNull();
    const concurrent = version('2.2', '2026-11-26T00:00:00Z');
    expect(reviewParameterVersion([current, concurrent], proposal, null, NOW).conflict).toBe(
      'overlap',
    );
  });
});
