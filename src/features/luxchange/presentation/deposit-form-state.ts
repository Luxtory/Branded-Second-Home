import type { DepositOutcomeKey } from './i18n/deposit-pt-br';

/**
 * Estado do formulário de confirmação do depósito (compartilhado entre a Server Action e o cliente). A chave de
 * idempotência nasce na prévia válida (a mesma intenção = a mesma chave, precedente ADR-0026 D6): duplo clique e reenvio
 * repetem o resultado; uma recusa gravada pede nova prévia (intenção nova, chave nova).
 */
export interface DepositFormState {
  readonly key: string;
  readonly message: DepositOutcomeKey | null;
}

/** Prévia do servidor para a seleção: os termos que o Titular revisa e confirma. */
export type DepositPreviewResponse =
  | {
      readonly status: 'ok';
      readonly secondHomeId: string;
      readonly secondHomeLabel: string;
      readonly modality: 'owner' | 'co_owner';
      readonly partyId: string;
      readonly nights: readonly string[];
      /** Créditos de cada noite cedida (texto decimal exato), da mesma leitura que soma o total. */
      readonly nightCredits: readonly { readonly date: string; readonly credits: string }[];
      readonly credits: string;
      readonly validityMonths: number;
      readonly balance: string;
      readonly potential: string;
      /** Só com o depósito aberto (K4 e K6): sem ativação, não há confirmação a oferecer. */
      readonly key: string | null;
    }
  | { readonly status: 'refused'; readonly reason: DepositOutcomeKey }
  | { readonly status: 'unauthenticated' | 'unavailable' };
