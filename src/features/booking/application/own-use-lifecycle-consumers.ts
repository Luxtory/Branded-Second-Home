import { z } from 'zod';
import type { OutboxConsumer } from '@/features/platform';
import type { OwnUseConsumerDependencies } from './own-use-consumers';
import {
  OWN_USE_BOOKING_CANCELLED,
  OWN_USE_BOOKING_INVALIDATED,
  OWN_USE_EXCEPTION_OPENED,
  OWN_USE_EXCEPTION_RESOLVED,
  OWN_USE_NO_SHOW_DECLARED,
  type LifecycleEventType,
} from './own-use-lifecycle-events';

/**
 * Notificações do ciclo da reserva (W13 E3; REQ-097, TECH-091; spec booking §10.14): um consumidor por evento do
 * AsyncAPI, validação igual ao contrato (campos exatos, enums, nulos), destinatário = party fixada no COMMIT. Os dados
 * são escolhidos campo a campo — nunca o payload inteiro, nunca base registrada, referência de incidente ou dado pessoal
 * — e o nulo vira ausência, com a distinção explícita onde o contrato a define (`modality`). Copy e telas: E4.
 * Notificação não cria direito, prazo nem consequência econômica.
 */
const uuid = z.uuid();
const count = z.number().int().min(0);
const date = z.iso.date();
const exceptionType = z.enum(['operational', 'unauthorized_booking']);
const nights = z.strictObject({ alta: count, media: count, leap: count });
const target = { booking_id: uuid, second_home_id: uuid, recipient_party_id: uuid };

const cancelled = z.strictObject({
  ...target,
  cause: z.enum(['titular', 'exception']),
  exception_id: uuid.nullable(),
  exception_type: exceptionType.nullable(),
  cancellation_class: z.enum(['timely', 'late']).nullable(),
  released_nights: z.number().int().min(1),
  first_released_date: date,
  restored: nights.nullable(),
  forfeited_nights: count.nullable(),
});

const noShow = z.strictObject({
  ...target,
  released_nights: count,
  first_released_date: date.nullable(),
  forfeited_nights: count.nullable(),
});

const opened = z.strictObject({
  ...target,
  exception_id: uuid,
  exception_type: exceptionType,
  reason: z
    .enum(['emergency_maintenance', 'security', 'casualty', 'fortuitous_event', 'force_majeure'])
    .nullable(),
  timely_until: z.iso.datetime().nullable(),
});

const resolved = z.strictObject({
  ...target,
  exception_id: uuid,
  exception_type: exceptionType,
  outcome: z.enum(['confirmed', 'completed']),
});

const invalidated = z.strictObject({
  ...target,
  exception_id: uuid,
  released_nights: z.number().int().min(1),
  first_released_date: date,
  corrected: nights.nullable(),
});

type Data = Record<string, string | number>;

/** Campos presentes; nulo vira ausência (o tipo da central não guarda nulo). */
const present = (fields: Readonly<Record<string, string | number | null>>): Data =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null)) as Data;

const byBucket = (prefix: string, value: z.infer<typeof nights> | null) =>
  value === null
    ? {}
    : {
        [`${prefix}_alta`]: value.alta,
        [`${prefix}_media`]: value.media,
        [`${prefix}_leap`]: value.leap,
      };

/** Co-Owner sempre tem classe, perdas e correção nestes eventos; o Owner nunca (REQ-081; contrato AsyncAPI). */
const modality = (coOwnerFact: unknown) => (coOwnerFact === null ? 'owner' : 'co_owner');

interface Mapping<S extends z.ZodType> {
  readonly name: string;
  readonly type: LifecycleEventType;
  readonly schema: S;
  readonly data: (payload: z.infer<S>) => Data;
}

const mapping = <S extends z.ZodType>(m: Mapping<S>) => m;

const MAPPINGS = [
  mapping({
    name: 'booking_own_use_cancellation_notification',
    type: OWN_USE_BOOKING_CANCELLED,
    schema: cancelled,
    data: (p) => ({
      ...present({
        booking_id: p.booking_id,
        second_home_id: p.second_home_id,
        cause: p.cause,
        modality: modality(p.cancellation_class),
        cancellation_class: p.cancellation_class,
        exception_type: p.exception_type,
        released_nights: p.released_nights,
        first_released_date: p.first_released_date,
        forfeited_nights: p.forfeited_nights,
      }),
      ...byBucket('restored', p.restored),
    }),
  }),
  mapping({
    name: 'booking_own_use_no_show_notification',
    type: OWN_USE_NO_SHOW_DECLARED,
    schema: noShow,
    data: (p) =>
      present({
        booking_id: p.booking_id,
        second_home_id: p.second_home_id,
        modality: modality(p.forfeited_nights),
        released_nights: p.released_nights,
        first_released_date: p.first_released_date,
        forfeited_nights: p.forfeited_nights,
      }),
  }),
  mapping({
    name: 'booking_own_use_exception_opened_notification',
    type: OWN_USE_EXCEPTION_OPENED,
    schema: opened,
    data: (p) =>
      present({
        booking_id: p.booking_id,
        second_home_id: p.second_home_id,
        exception_type: p.exception_type,
        reason: p.reason,
        timely_until: p.timely_until,
      }),
  }),
  mapping({
    name: 'booking_own_use_exception_resolved_notification',
    type: OWN_USE_EXCEPTION_RESOLVED,
    schema: resolved,
    data: (p) => ({
      booking_id: p.booking_id,
      second_home_id: p.second_home_id,
      exception_type: p.exception_type,
      outcome: p.outcome,
    }),
  }),
  mapping({
    name: 'booking_own_use_invalidation_notification',
    type: OWN_USE_BOOKING_INVALIDATED,
    schema: invalidated,
    data: (p) => ({
      ...present({
        booking_id: p.booking_id,
        second_home_id: p.second_home_id,
        modality: modality(p.corrected),
        released_nights: p.released_nights,
        first_released_date: p.first_released_date,
      }),
      ...byBucket('corrected', p.corrected),
    }),
  }),
];

/** Os cinco consumidores; recuperação e solicitação de autorização não emitem evento, logo não notificam (BR-284). */
export function buildOwnUseLifecycleConsumers<Tx>(
  deps: OwnUseConsumerDependencies<Tx>,
): readonly OutboxConsumer<Tx>[] {
  return MAPPINGS.map((m) => ({
    name: m.name,
    eventTypes: [m.type],
    async handle(event, tx) {
      const payload = m.schema.parse(event.payload) as { readonly recipient_party_id: string };
      await deps.notify(tx, {
        eventId: event.id,
        recipientPartyId: payload.recipient_party_id,
        kind: m.type,
        data: (m.data as (p: unknown) => Data)(payload),
        at: deps.clock.now(),
      });
    },
  }));
}
