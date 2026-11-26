import type { OutboxEventDraft } from '@/features/platform';
import type { RequestClosureReason } from '../domain/request';

/**
 * Eventos da Request (AsyncAPI; REQ-097, TECH-091; spec luxchange §13.6): um envio e um encerramento por Request,
 * `dedup_key = <tipo>:<request_id>`. Só ids, datas, quantidades e motivo — nunca PRL, valores em reais nem dado pessoal.
 */
export const REQUEST_SENT = 'luxchange.request_sent';
export const REQUEST_CLOSED = 'luxchange.request_closed';

export interface RequestSentPayload {
  readonly request_id: string;
  readonly requester_party_id: string;
  readonly holder_party_id: string;
  readonly second_home_id: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly credits_required: string;
  readonly guarantee_credits: string;
  readonly complement_credits: string;
  readonly complement_nights: number;
  readonly expires_at: string;
}

export interface RequestClosedPayload {
  readonly request_id: string;
  readonly requester_party_id: string;
  readonly holder_party_id: string;
  readonly second_home_id: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly state: 'expired' | 'cancelled_pre_accept';
  readonly reason: RequestClosureReason;
  readonly guarantee_released: string;
  readonly closed_at: string;
}

export const requestSentEvent = (payload: RequestSentPayload): OutboxEventDraft => ({
  type: REQUEST_SENT,
  dedupKey: `${REQUEST_SENT}:${payload.request_id}`,
  payload: { ...payload },
});

export const requestClosedEvent = (payload: RequestClosedPayload): OutboxEventDraft => ({
  type: REQUEST_CLOSED,
  dedupKey: `${REQUEST_CLOSED}:${payload.request_id}`,
  payload: { ...payload },
});
