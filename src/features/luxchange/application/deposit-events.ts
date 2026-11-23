import type { OutboxEventDraft } from '@/features/platform';

/**
 * Evento da originação de Créditos pelo depósito (AsyncAPI; REQ-097, TECH-091): um por lote,
 * `dedup_key = luxchange.credits_originated:<lot_id>`. Só ids, datas, contagem e quantidade — nunca PRL nem dado pessoal.
 */
export const CREDITS_ORIGINATED = 'luxchange.credits_originated';

export interface CreditsOriginatedPayload {
  readonly lot_id: string;
  readonly recipient_party_id: string;
  readonly second_home_id: string;
  readonly nights: number;
  readonly first_night: string;
  readonly last_night: string;
  readonly credits: string;
  readonly expires_at: string;
}

export const creditsOriginatedEvent = (payload: CreditsOriginatedPayload): OutboxEventDraft => ({
  type: CREDITS_ORIGINATED,
  dedupKey: `${CREDITS_ORIGINATED}:${payload.lot_id}`,
  payload: { ...payload },
});
