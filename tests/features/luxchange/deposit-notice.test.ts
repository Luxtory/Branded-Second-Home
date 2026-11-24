import { describe, expect, it } from 'vitest';
import {
  applyNotice,
  nextNoticeChange,
  noticeDeadline,
} from '@/features/luxchange/presentation/deposit-notice';
import {
  wholeBookings,
  type DepositNightView,
} from '@/features/luxchange/presentation/deposit-read';

// W20 (regra da Luxtory de 336 h; BR-200, TECH-043): o calendário aberto reaplica a antecedência com o passar do tempo.
const HOUR = 3_600_000;
const MINUTE = 60_000;
const view = (date: string, extra: Partial<DepositNightView> = {}): DepositNightView => ({
  date,
  season: 'media',
  status: 'eligible',
  credits: '1000',
  bookingId: null,
  checkinAt: `${date}T15:00:00-03:00`,
  ...extra,
});
const limitOf = (date: string) => Date.parse(`${date}T15:00:00-03:00`) - 336 * HOUR;

describe('W20 — antecedência de 336 h no calendário aberto', () => {
  it('[BR-200][TECH-043] 335h59 bloqueia, 336h e 336h01 mantêm a noite selecionável', () => {
    const limit = limitOf('2026-11-15');
    expect(noticeDeadline('2026-11-15T15:00:00-03:00')).toBe(limit);
    const statusAt = (now: number) => applyNotice([view('2026-11-15')], now)[0]!;
    expect(statusAt(limit - MINUTE).status).toBe('eligible'); // 336h01
    expect(statusAt(limit).status).toBe('eligible'); // 336h
    expect(statusAt(limit + MINUTE)).toMatchObject({ status: 'notice', credits: null }); // 335h59
  });

  it('[REQ-060] Co-Owner: uma noite da reserva fora do prazo bloqueia a reserva inteira', () => {
    const nights = [
      view('2026-11-15', { bookingId: 'b-1' }),
      view('2026-11-16', { bookingId: 'b-1' }),
      view('2026-11-20', { bookingId: 'b-2' }),
    ];
    const after = applyNotice(nights, limitOf('2026-11-15') + MINUTE);
    expect(after.map((night) => [night.status, night.bookingId])).toEqual([
      ['notice', null],
      ['notice', null],
      ['eligible', 'b-2'],
    ]);
  });

  it('[REQ-060] na leitura do servidor, a reserva com a 1ª noite fora do prazo aparece inteira bloqueada pela antecedência', () => {
    const dates = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    const nights = dates.map((date, index) =>
      index === 0
        ? view(date, { status: 'notice', credits: null })
        : view(date, { bookingId: 'b-near' }),
    );
    const blocked = wholeBookings(nights, [
      { id: 'b-near', checkinDate: dates[0]!, checkoutDate: '2026-11-16', nights: dates },
    ]);
    expect(blocked.map((night) => [night.status, night.credits, night.bookingId])).toEqual(
      dates.map(() => ['notice', null, null]),
    );
  });

  it('noites já indisponíveis não mudam de motivo; sem referência também passa a exigir antecedência', () => {
    const now = limitOf('2026-11-15') + MINUTE;
    const [ceded, missing] = applyNotice(
      [
        view('2026-11-15', { status: 'ceded', credits: null }),
        view('2026-11-15', { status: 'no_reference', credits: null }),
      ],
      now,
    );
    expect(ceded!.status).toBe('ceded');
    expect(missing!.status).toBe('notice');
  });

  it('próximo instante de reavaliação: 1 ms depois do prazo mais próximo ainda aberto', () => {
    const nights = [
      view('2026-11-15'),
      view('2026-11-18'),
      view('2026-11-14', { status: 'ceded' }),
    ];
    const now = limitOf('2026-11-15') - HOUR;
    expect(nextNoticeChange(nights, now)).toBe(limitOf('2026-11-15') + 1);
    expect(nextNoticeChange(nights, limitOf('2026-11-15') + 1)).toBe(limitOf('2026-11-18') + 1);
    expect(nextNoticeChange([view('2026-11-15', { status: 'ceded' })], now)).toBeNull();
  });
});
