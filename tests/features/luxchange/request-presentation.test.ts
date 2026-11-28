import { describe, expect, it } from 'vitest';
import type { DepositBookingFacts, DepositNightFacts } from '@/features/luxchange/domain/deposit';
import { requestableCapacity, type RequestHolding } from '@/features/luxchange/domain/request';
import { requestNotificationCopy } from '@/features/luxchange/notifications';
import { formatFee } from '@/features/luxchange/presentation/request-format';

/**
 * W21 E3 — peças puras das telas da Request: a capacidade solicitável do calendário (mesmas regras do envio), a Taxa em
 * reais sem `Number` e os avisos da central (REQ-097) — devolução da Taxa sempre "solicitada", nunca "concluída".
 */
const NOW = Date.parse('2027-03-01T12:00:00Z');
const night = (
  stayDate: string,
  custody: DepositNightFacts['custody'],
  occupancy: DepositNightFacts['occupancy'] = null,
): DepositNightFacts => ({ stayDate, checkinAt: `${stayDate}T17:00:00Z`, custody, occupancy });
const owner: RequestHolding = {
  id: 'h-owner',
  partyId: 'p-owner',
  secondHomeId: 's',
  modality: 'owner',
  stakeId: null,
};
const coOwner: RequestHolding = {
  id: 'h-co',
  partyId: 'p-co',
  secondHomeId: 's',
  modality: 'co_owner',
  stakeId: 'stake',
};
const ownerCustody = { holderKind: 'owner', stakeId: null, basis: null, inventoryOrigin: null };
const reserved = {
  holderKind: 'use_right',
  stakeId: 'stake',
  basis: 'reserved_right',
  inventoryOrigin: null,
};
const booking = (id: string, checkinDate: string, checkoutDate: string): DepositBookingFacts => ({
  id,
  holdingId: 'h-co',
  stakeId: 'stake',
  channel: 'own_use',
  state: 'confirmed',
  checkinDate,
  checkoutDate,
});

describe('W21 E3 — capacidade solicitável do calendário (TECH-022–024; ADR-0037 §4)', () => {
  it('[REQ-062] Owner: só noites livres e futuras, sem compromisso efetivo', () => {
    const capacity = requestableCapacity({
      owner,
      holdings: new Map(),
      nights: [
        night('2027-02-28', ownerCustody),
        night('2027-03-02', ownerCustody),
        night('2027-03-03', ownerCustody, { bookingId: 'b', channel: 'own_use' }),
        night('2027-03-04', ownerCustody),
        night('2027-03-05', null),
      ],
      bookings: [],
      committed: new Set(['2027-03-04']),
      nowMs: NOW,
    });
    expect([...capacity]).toEqual([['2027-03-02', null]]);
  });

  it('[REQ-062] Co-Owner: só reservas confirmadas que entram inteiras; parcial (noite comprometida ou passada) sai inteira', () => {
    const nights = [
      night('2027-03-02', reserved, { bookingId: 'b1', channel: 'own_use' }),
      night('2027-03-03', reserved, { bookingId: 'b1', channel: 'own_use' }),
      night('2027-03-10', reserved, { bookingId: 'b2', channel: 'own_use' }),
      night('2027-03-11', reserved, { bookingId: 'b2', channel: 'own_use' }),
      night('2027-02-28', reserved, { bookingId: 'b3', channel: 'own_use' }),
      night('2027-03-01', reserved, { bookingId: 'b3', channel: 'own_use' }),
    ];
    const capacity = requestableCapacity({
      owner: null,
      holdings: new Map([[coOwner.id, coOwner]]),
      nights,
      bookings: [
        booking('b1', '2027-03-02', '2027-03-04'),
        booking('b2', '2027-03-10', '2027-03-12'),
        booking('b3', '2027-02-28', '2027-03-02'),
      ],
      committed: new Set(['2027-03-11']),
      nowMs: NOW,
    });
    expect([...capacity]).toEqual([
      ['2027-03-02', 'b1'],
      ['2027-03-03', 'b1'],
    ]);
    // Holding fora da lista (quem lê a representa): nada aparece.
    expect(
      requestableCapacity({
        owner: null,
        holdings: new Map(),
        nights,
        bookings: [booking('b1', '2027-03-02', '2027-03-04')],
        committed: new Set(),
        nowMs: NOW,
      }).size,
    ).toBe(0);
  });
});

describe('W21 E3 — formatação e avisos', () => {
  it('Taxa de intermediação em reais a partir dos centavos (sem Number)', () => {
    expect(formatFee('9876')).toBe('R$ 98,76');
    expect(formatFee('5')).toBe('R$ 0,05');
    expect(formatFee('123456789012345678')).toBe('R$ 1.234.567.890.123.456,78');
  });

  it('[REQ-097] quatro avisos: enviada e encerrada ao solicitante, recebida e encerrada ao solicitado; dados desconhecidos → genérico', () => {
    const format = { date: (civil: string) => civil, instant: (iso: string) => iso };
    const where = {
      request_id: 'r',
      second_home_id: 's',
      checkin: '2027-03-02',
      checkout: '2027-03-04',
      expires_at: '2027-02-01T10:00:00Z',
    };
    const sent = requestNotificationCopy(
      'luxchange.request_sent',
      {
        ...where,
        credits_required: '300',
        guarantee_credits: '270',
        complement_credits: '30',
        complement_nights: 1,
      },
      format,
    );
    expect(sent).toMatchObject({
      title: 'Solicitação enviada',
      href: '/titular/luxchange/solicitacoes/r',
    });
    expect(sent!.what).toContain('Entrada 2027-03-02 · saída 2027-03-04 · 2 noites');
    const single = requestNotificationCopy(
      'luxchange.request_received',
      { ...where, checkout: '2027-03-03' },
      format,
    );
    expect(single!.what).toContain('Noite de 2027-03-02');
    expect(sent!.extra).toContainEqual(['Créditos em Garantia', '270 Créditos']);
    const received = requestNotificationCopy('luxchange.request_received', where, format);
    expect(received).toMatchObject({
      title: 'Solicitação recebida',
      href: '/titular/luxchange/solicitacoes',
    });
    expect(JSON.stringify(received)).not.toMatch(/Garantia|Créditos/);
    const closed = requestNotificationCopy(
      'luxchange.request_closed',
      {
        ...where,
        state: 'cancelled_pre_accept',
        closed_at: '2027-01-01T00:00:00Z',
        reason: 'withdrawn',
        guarantee_released: '270',
      },
      format,
    );
    expect(closed!.extra).toContainEqual(['Taxa de intermediação', 'Devolução solicitada']);
    expect(JSON.stringify(closed)).not.toMatch(/devolvida|concluíd/i);
    expect(
      requestNotificationCopy('luxchange.request_received_closed', where, format),
    ).toMatchObject({ title: 'Solicitação recebida encerrada' });
    expect(
      requestNotificationCopy('luxchange.request_closed', { ...where, reason: 'x' }, format),
    ).toBeNull();
    expect(requestNotificationCopy('outro', where, format)).toBeNull();
  });

  it('[REQ-097] recusa avisa o solicitante com devolução solicitada', () => {
    const copy = requestNotificationCopy(
      'luxchange.request_closed',
      {
        request_id: 'r',
        checkin: '2027-03-02',
        checkout: '2027-03-04',
        state: 'declined',
        reason: 'declined',
        guarantee_released: '270',
      },
      { date: (date) => date, instant: (instant) => instant },
    );
    expect(copy).toMatchObject({ title: 'Solicitação recusada' });
    expect(copy!.extra).toContainEqual(['Taxa de intermediação', 'Devolução solicitada']);
  });
});
