import { describe, expect, it } from 'vitest';
import {
  notificationCopy,
  type NotificationData,
} from '@/features/booking/presentation/own-use-notification-copy';
import {
  NOTIFICATION_VARIANTS as VARIANTS,
  OWN_USE_CANCELLED_KIND as C,
  VARIANT_IDS as ids,
} from '../../support/own-use-notification-variants';

// W13 E4b (spec booking §10.15): as 19 variações dos seis eventos, com os campos gravados pelo consumidor da E3
// (fonte única em tests/support/own-use-notification-variants.ts, também usada pelo E2E da central).
const format = {
  date: (civil: string) => `${civil.slice(8, 10)}/${civil.slice(5, 7)}/${civil.slice(0, 4)}`,
  instant: () => '26/11/2026 às 14:00',
};
const copy = (kind: string, data: NotificationData) => notificationCopy(kind, data, format);

describe('W13 E4b — avisos do ciclo da reserva (título curto + "O que mudou")', () => {
  it.each(VARIANTS)('[REQ-097] %s', (_name, kind, data, title, what, extra) => {
    expect(copy(kind, data)).toEqual({ title, what, extra });
  });

  it('[REQ-097] cobre as 19 variações aprovadas na E4a v2.1 (+ a confirmação da W12)', () => {
    expect(VARIANTS).toHaveLength(20);
  });

  it('[REQ-100][PD-010] nenhum texto usa termo proibido nem promete restituição ou compensação', () => {
    const all = VARIANTS.map(([, kind, data]) => JSON.stringify(copy(kind, data))).join(' ');
    expect(all).not.toMatch(/\bcota|di[aá]ria|party|compensa|indeniza|restitu|garantid/i);
  });

  it('[REQ-097] tipo desconhecido ou dados incompletos → aviso genérico (null), nunca texto inventado', () => {
    expect(copy('booking.unknown', ids)).toBeNull();
    expect(copy(C, { ...ids, cause: 'titular' })).toBeNull();
    expect(
      copy('booking.own_use_exception_opened', {
        ...ids,
        exception_type: 'operational',
        reason: 'x',
      }),
    ).toBeNull();
  });
});
