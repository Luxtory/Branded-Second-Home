import { describe, expect, it } from 'vitest';
import { timeZoneLabel } from '@/features/booking/presentation/own-use-lifecycle-format';

describe('fuso explícito nos horários sem Second Home na tela (W15, central de notificações)', () => {
  it('[REQ-097] nome curto do fuso no instante; o mesmo instante em fusos diferentes nunca se confunde', () => {
    const at = new Date('2026-11-20T03:04:00Z');
    expect(timeZoneLabel(at, 'America/Sao_Paulo')).toBe('BRT');
    expect(timeZoneLabel(at, 'UTC')).toBe('UTC');
    expect(timeZoneLabel(at, 'America/Manaus')).not.toBe(timeZoneLabel(at, 'America/Sao_Paulo'));
  });
});
