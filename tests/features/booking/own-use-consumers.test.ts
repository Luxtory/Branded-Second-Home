import { describe, expect, it } from 'vitest';
import { buildOwnUseConsumers } from '@/features/booking/application/own-use-consumers';

describe('notificação da confirmação (REQ-097, D6)', () => {
  const event = (payload: Record<string, unknown>) => ({
    id: 'event-1',
    type: 'booking.own_use_confirmed',
    payload,
    operationId: 'op-1',
    occurredAt: new Date('2027-03-01T12:00:00Z'),
  });
  const payload = {
    booking_id: '00000000-0000-4000-8000-000000000a01',
    second_home_id: '00000000-0000-4000-8000-000000000a02',
    recipient_party_id: '00000000-0000-4000-8000-000000000a03',
    checkin_date: '2027-03-10',
    checkout_date: '2027-03-12',
    nights: 2,
  };

  it('[REQ-097][D6] notifica a party que reservou (fixada no evento), só com ids, datas e número de noites', async () => {
    const sent: unknown[] = [];
    const [consumer] = buildOwnUseConsumers<object>({
      clock: { now: () => new Date('2027-03-01T12:00:05Z') },
      notify: async (_tx, draft) => {
        sent.push(draft);
        return true;
      },
    });
    expect(consumer).toMatchObject({
      name: 'booking_own_use_confirmation_notification',
      eventTypes: ['booking.own_use_confirmed'],
    });
    await consumer!.handle(event(payload) as never, {});
    expect(sent).toEqual([
      {
        eventId: 'event-1',
        recipientPartyId: payload.recipient_party_id,
        kind: 'booking.own_use_confirmed',
        data: {
          booking_id: payload.booking_id,
          second_home_id: payload.second_home_id,
          checkin_date: '2027-03-10',
          checkout_date: '2027-03-12',
          nights: 2,
        },
        at: new Date('2027-03-01T12:00:05Z'),
      },
    ]);
  });

  it('evento malformado não notifica ninguém (falha na entrega, não cria direito)', async () => {
    const [consumer] = buildOwnUseConsumers<object>({
      clock: { now: () => new Date() },
      notify: async () => true,
    });
    await expect(
      consumer!.handle(event({ ...payload, recipient_party_id: 'x' }) as never, {}),
    ).rejects.toThrow();
  });
});
