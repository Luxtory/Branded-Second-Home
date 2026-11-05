import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildOwnUseConsumers } from '@/features/booking/application/own-use-consumers';
import {
  OWN_USE_BOOKING_CANCELLED,
  OWN_USE_BOOKING_INVALIDATED,
  OWN_USE_EXCEPTION_OPENED,
  OWN_USE_EXCEPTION_RESOLVED,
  OWN_USE_NO_SHOW_DECLARED,
} from '@/features/booking';
import type { OutboxConsumer } from '@/features/platform';
import { createOutboxConsumers } from '@/features/platform/infrastructure/jobs/job-registry';
import { eventValidator } from '../../support/asyncapi';

const BOOKING = '11111111-1111-4111-8111-111111111111';
const HOME = '22222222-2222-4222-8222-222222222222';
const PARTY = '33333333-3333-4333-8333-333333333333';
const EXCEPTION = '44444444-4444-4444-8444-444444444444';
const AT = new Date('2027-03-01T12:00:00.000Z');
const target = { booking_id: BOOKING, second_home_id: HOME, recipient_party_id: PARTY };

type Notified = {
  eventId: string;
  recipientPartyId: string;
  kind: string;
  data: Record<string, string | number>;
};

function consumers() {
  const notified: Notified[] = [];
  const list = buildOwnUseConsumers<null>({
    clock: { now: () => AT },
    notify: (_tx, draft) => {
      notified.push({
        eventId: draft.eventId,
        recipientPartyId: draft.recipientPartyId,
        kind: draft.kind,
        data: draft.data,
      });
      return Promise.resolve(true);
    },
  });
  return { list, notified };
}

const consumerFor = (list: readonly OutboxConsumer<null>[], type: string) => {
  const found = list.filter((consumer) => consumer.eventTypes.includes(type));
  expect(found).toHaveLength(1);
  return found[0]!;
};

/** Mensagem do outbox como o AsyncAPI a descreve (envelope + payload). */
const envelope = (type: string, payload: Record<string, unknown>) => ({
  id: randomUUID(),
  type,
  dedup_key: `${type}:${randomUUID()}`,
  operation_id: randomUUID(),
  occurred_at: '2027-03-01T12:00:00.000000Z',
  payload,
});

const SAMPLES: readonly (readonly [
  string,
  Record<string, unknown>,
  Record<string, string | number>,
])[] = [
  [
    OWN_USE_BOOKING_CANCELLED,
    {
      ...target,
      cause: 'titular',
      exception_id: null,
      exception_type: null,
      cancellation_class: 'timely',
      released_nights: 3,
      first_released_date: '2027-04-10',
      restored: { alta: 2, media: 1, leap: 0 },
      forfeited_nights: null,
    },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      cause: 'titular',
      modality: 'co_owner',
      cancellation_class: 'timely',
      released_nights: 3,
      first_released_date: '2027-04-10',
      restored_alta: 2,
      restored_media: 1,
      restored_leap: 0,
    },
  ],
  [
    OWN_USE_BOOKING_CANCELLED,
    {
      ...target,
      cause: 'exception',
      exception_id: EXCEPTION,
      exception_type: 'operational',
      cancellation_class: null,
      released_nights: 2,
      first_released_date: '2027-04-11',
      restored: null,
      forfeited_nights: null,
    },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      cause: 'exception',
      modality: 'owner',
      exception_type: 'operational',
      released_nights: 2,
      first_released_date: '2027-04-11',
    },
  ],
  [
    OWN_USE_BOOKING_CANCELLED,
    {
      ...target,
      cause: 'titular',
      exception_id: EXCEPTION,
      exception_type: 'unauthorized_booking',
      cancellation_class: 'late',
      released_nights: 1,
      first_released_date: '2027-04-12',
      restored: null,
      forfeited_nights: 1,
    },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      cause: 'titular',
      modality: 'co_owner',
      cancellation_class: 'late',
      exception_type: 'unauthorized_booking',
      released_nights: 1,
      first_released_date: '2027-04-12',
      forfeited_nights: 1,
    },
  ],
  [
    OWN_USE_NO_SHOW_DECLARED,
    { ...target, released_nights: 0, first_released_date: null, forfeited_nights: 0 },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      modality: 'co_owner',
      released_nights: 0,
      forfeited_nights: 0,
    },
  ],
  [
    OWN_USE_NO_SHOW_DECLARED,
    { ...target, released_nights: 2, first_released_date: '2027-04-13', forfeited_nights: null },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      modality: 'owner',
      released_nights: 2,
      first_released_date: '2027-04-13',
    },
  ],
  [
    OWN_USE_EXCEPTION_OPENED,
    {
      ...target,
      exception_id: EXCEPTION,
      exception_type: 'operational',
      reason: 'casualty',
      timely_until: '2027-03-26T17:00:00.000000Z',
    },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      exception_type: 'operational',
      reason: 'casualty',
      timely_until: '2027-03-26T17:00:00.000000Z',
    },
  ],
  [
    OWN_USE_EXCEPTION_OPENED,
    {
      ...target,
      exception_id: EXCEPTION,
      exception_type: 'unauthorized_booking',
      reason: null,
      timely_until: null,
    },
    { booking_id: BOOKING, second_home_id: HOME, exception_type: 'unauthorized_booking' },
  ],
  [
    OWN_USE_EXCEPTION_RESOLVED,
    { ...target, exception_id: EXCEPTION, exception_type: 'operational', outcome: 'completed' },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      exception_type: 'operational',
      outcome: 'completed',
    },
  ],
  [
    OWN_USE_BOOKING_INVALIDATED,
    {
      ...target,
      exception_id: EXCEPTION,
      released_nights: 2,
      first_released_date: '2027-04-14',
      corrected: { alta: 1, media: 1, leap: 0 },
    },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      modality: 'co_owner',
      released_nights: 2,
      first_released_date: '2027-04-14',
      corrected_alta: 1,
      corrected_media: 1,
      corrected_leap: 0,
    },
  ],
  [
    OWN_USE_BOOKING_INVALIDATED,
    {
      ...target,
      exception_id: EXCEPTION,
      released_nights: 1,
      first_released_date: '2027-04-15',
      corrected: null,
    },
    {
      booking_id: BOOKING,
      second_home_id: HOME,
      modality: 'owner',
      released_nights: 1,
      first_released_date: '2027-04-15',
    },
  ],
];

describe('consumidores das notificações do ciclo da reserva (W13 E3)', () => {
  it('[REQ-097][TECH-091] um consumidor por evento; destinatário fixado no evento; dados escolhidos, nulo vira ausência com a distinção explícita', async () => {
    const { list, notified } = consumers();
    for (const [type, payload, data] of SAMPLES) {
      const message = envelope(type, payload);
      expect(eventValidator(type)(message), type).toBe(true);
      await consumerFor(list, type).handle({ ...message, payload } as never, null);
      expect(notified.at(-1), type).toEqual({
        eventId: message.id,
        recipientPartyId: PARTY,
        kind: type,
        data,
      });
    }
    // Nunca o payload inteiro: nem destinatário, nem ids de exceção nos dados.
    for (const { data } of notified) {
      expect(Object.keys(data)).not.toContain('recipient_party_id');
      expect(Object.keys(data)).not.toContain('exception_id');
    }
  });

  it('[spec booking §10.14][D11] payload fora do contrato é recusado pelo consumidor e pelo AsyncAPI (base, campo faltando, enum, nulo)', async () => {
    const { list, notified } = consumers();
    const [type, valid] = SAMPLES[0]!;
    const invalid: readonly Record<string, unknown>[] = [
      { ...valid, basis: 'Contato do hóspede' },
      { ...valid, incident_ref: 'INC-1' },
      Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'cause')),
      { ...valid, cause: 'admin' },
      { ...valid, released_nights: null },
    ];
    for (const payload of invalid) {
      expect(eventValidator(type)(envelope(type, payload))).toBe(false);
      await expect(
        consumerFor(list, type).handle({ ...envelope(type, payload) } as never, null),
      ).rejects.toThrow();
    }
    expect(notified).toEqual([]);
  });

  it('[BR-284] recuperação e solicitação de autorização não têm evento, logo nenhum consumidor', () => {
    const { list } = consumers();
    const types = list.flatMap((consumer) => consumer.eventTypes);
    expect(new Set(types).size).toBe(types.length);
    expect(types.sort()).toEqual(
      [
        'booking.own_use_confirmed',
        OWN_USE_BOOKING_CANCELLED,
        OWN_USE_NO_SHOW_DECLARED,
        OWN_USE_EXCEPTION_OPENED,
        OWN_USE_EXCEPTION_RESOLVED,
        OWN_USE_BOOKING_INVALIDATED,
      ].sort(),
    );
  });

  it('[TECH-091] o registro do job outbox de produção inclui os cinco consumidores', () => {
    const types = createOutboxConsumers({}).eventTypes();
    for (const type of [
      OWN_USE_BOOKING_CANCELLED,
      OWN_USE_NO_SHOW_DECLARED,
      OWN_USE_EXCEPTION_OPENED,
      OWN_USE_EXCEPTION_RESOLVED,
      OWN_USE_BOOKING_INVALIDATED,
    ])
      expect(types).toContain(type);
  });
});
