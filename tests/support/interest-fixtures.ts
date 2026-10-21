import {
  PRESENTATION_CONTEXT_KEY_ID,
  signPresentationContext,
} from '@/features/ownership/application/presentation-context';
import { INTEREST_HASH_KEY_ID } from '@/features/ownership/application/register-interest';

// Solicitação de conversa de teste (spec ownership §14): segredos e corpos válidos com contexto assinado. Contato com
// sentinelas fictícias, procuradas nos logs e no `audit_log` pelos testes de PII.
export const CONTEXT_KEY = { id: PRESENTATION_CONTEXT_KEY_ID, secret: 'c'.repeat(32) } as const;
export const HASH_KEY = { id: INTEREST_HASH_KEY_ID, secret: 'i'.repeat(32) } as const;

export const SENTINEL_CONTACT = {
  name: 'Sentinela Nome Teste',
  phone: '(11) 98765-4321',
  email: 'sentinela.teste@example.com',
} as const;

/** Segredos da W6 no ambiente de teste (os demais vêm de cada suíte). */
export const INTEREST_SECRETS = {
  INTEREST_REQUEST_HMAC_SECRET: HASH_KEY.secret,
  INTEREST_CONTEXT_HMAC_SECRET: CONTEXT_KEY.secret,
} as const;

/** Contexto que a página da Home Edition emitiria (a referência apresentada ou `null`). */
export function presentationContext(
  homeEditionId: string,
  presentedProjectedInvestmentId: string | null = null,
): string {
  return signPresentationContext({ homeEditionId, presentedProjectedInvestmentId }, CONTEXT_KEY);
}

/** Co-Owner válido (faixa para iniciar, sem comparação com a média), com o contexto sem referência por padrão. */
export function coOwnerBody(
  homeEditionId: string,
  extra: Record<string, unknown> = {},
  presented: string | null = null,
): Record<string, unknown> {
  return {
    home_edition_id: homeEditionId,
    modality: 'co_owner',
    desired_location: 'Litoral norte de SP',
    approx_days: 21,
    available_to_start_band: 'from_500k_to_1m',
    decision_unit: 'with_partner_or_family',
    decision_horizon: 'six_to_twelve_months',
    ...SENTINEL_CONTACT,
    presentation_context: presentationContext(homeEditionId, presented),
    ...extra,
  };
}

/** Owner válido: faixa para iniciar e, com média apresentada, a comparação com ela (`reference_fit`). */
export function ownerBody(
  homeEditionId: string,
  presented: string | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    home_edition_id: homeEditionId,
    modality: 'owner',
    desired_location: 'Serra da Mantiqueira',
    available_to_start_band: 'from_1m_to_2_5m',
    ...(presented === null ? {} : { reference_fit: 'within' }),
    decision_unit: 'self',
    decision_horizon: 'immediate',
    ...SENTINEL_CONTACT,
    presentation_context: presentationContext(homeEditionId, presented),
    ...extra,
  };
}
