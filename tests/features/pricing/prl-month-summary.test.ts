import { describe, expect, it } from 'vitest';
import { monthSummary } from '@/features/pricing/presentation/prl-month-summary';

/** W16 C2 — resumo do mês na consulta do PRL (spec pricing §5): situação agora × alterações programadas. */
type Night = Parameters<typeof monthSummary>[0][number];
const night = (status: Night['status'], scheduled = 0, tier: Night['tier'] = 'media'): Night => ({
  tier,
  status,
  scheduled: Array.from({ length: scheduled }, (_, index) => `versão ${index + 1}`),
});

describe('PRL — resumo do mês', () => {
  it('[REQ-052] situação agora é uma partição que soma o total; versão futura é contada à parte e pode sobrepor a vigente', () => {
    const summary = monthSummary([
      night('in_force'),
      night('in_force', 2),
      night('scheduled_only', 1),
      ...Array.from({ length: 7 }, () => night('absent')),
    ]);
    expect(summary.total).toBe(10);
    expect(summary.now).toEqual({ inForce: 2, scheduledOnly: 1, absent: 7 });
    expect(summary.now.inForce + summary.now.scheduledOnly + summary.now.absent).toBe(
      summary.total,
    );
    // A noite vigente com versão futura e a noite só com versão futura: 2, sem somar à situação agora.
    expect(summary.scheduled).toBe(2);
  });

  it('[PD-003] temporadas do mês em ordem fixa, só as presentes', () => {
    const summary = monthSummary([
      night('absent', 0, 'media'),
      night('absent', 0, 'super_alta'),
      night('absent', 0, 'media'),
    ]);
    expect(summary.tiers).toEqual([
      ['super_alta', 1],
      ['media', 2],
    ]);
  });
});
