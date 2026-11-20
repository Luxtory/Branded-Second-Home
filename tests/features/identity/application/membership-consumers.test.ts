import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildMembershipConsumers,
  MEMBERSHIP_CHANGED_NOTIFICATION,
} from '@/features/identity/application/membership-consumers';
import { MEMBERSHIP_STATE_CHANGED } from '@/features/identity/domain/membership';
import { createOutboxConsumers } from '@/features/platform/infrastructure/jobs/job-registry';
import { eventValidator } from '../../../support/asyncapi';

const PARTY = '33333333-3333-4333-8333-333333333333';
const AT = new Date('2027-03-01T12:00:00.000Z');

const envelope = (payload: Record<string, unknown>) => ({
  id: randomUUID(),
  type: MEMBERSHIP_STATE_CHANGED,
  dedup_key: `${MEMBERSHIP_STATE_CHANGED}:${randomUUID()}`,
  operation_id: randomUUID(),
  occurred_at: '2027-03-01T12:00:00.000000Z',
  payload,
});

function setup() {
  const notified: { eventId: string; recipientPartyId: string; kind: string; data: unknown }[] = [];
  const [consumer] = buildMembershipConsumers<null>({
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
  return { consumer: consumer!, notified };
}

describe('notificação de mudança do Membership (REQ-097, TECH-091; W15)', () => {
  it('[REQ-097] evento conforme o AsyncAPI → uma notificação à party, só estados e instante', async () => {
    const { consumer, notified } = setup();
    for (const [from, to] of [
      [null, 'active'],
      ['active', 'suspended'],
      ['suspended', 'ended'],
      ['ended', 'active'],
    ] as const) {
      const payload = {
        membership_id: randomUUID(),
        recipient_party_id: PARTY,
        from_state: from,
        to_state: to,
        changed_at: '2027-03-01T12:00:00.123456Z',
      };
      const message = envelope(payload);
      expect(eventValidator(MEMBERSHIP_STATE_CHANGED)(message)).toBe(true);
      await consumer.handle({ ...message, payload } as never, null);
      expect(notified.at(-1)).toEqual({
        eventId: message.id,
        recipientPartyId: PARTY,
        kind: MEMBERSHIP_CHANGED_NOTIFICATION,
        data: { from_state: from, to_state: to, changed_at: '2027-03-01T12:00:00.123456Z' },
      });
    }
  });

  it('[TECH-091] payload fora do contrato é recusado sem notificar; o consumidor está registrado no job do outbox', async () => {
    const { consumer, notified } = setup();
    const base = {
      membership_id: randomUUID(),
      recipient_party_id: PARTY,
      from_state: 'active',
      to_state: 'suspended',
      changed_at: '2027-03-01T12:00:00Z',
    };
    for (const payload of [
      { ...base, to_state: 'paused' },
      { ...base, recipient_party_id: 'x' },
      { ...base, from_state: undefined },
    ]) {
      expect(eventValidator(MEMBERSHIP_STATE_CHANGED)(envelope(payload))).toBe(false);
      await expect(consumer.handle(envelope(payload) as never, null)).rejects.toThrow();
    }
    expect(notified).toEqual([]);
    expect(createOutboxConsumers({}).eventTypes()).toContain(MEMBERSHIP_STATE_CHANGED);
  });
});
