/** Estado do formulário de confirmação do cancelamento (compartilhado entre a Server Action e o componente de cliente). */
export type OwnUseCancelOutcome = 'closed' | 'unavailable' | 'permission' | 'unexpected';

/**
 * A chave de idempotência nasce com a prévia acionável (D7): o reenvio na mesma página (duplo clique, resultado incerto)
 * é replay; uma recusa gravada troca a chave. Termos alterados e reserva alterada saem por redirecionamento (nova
 * prévia com chave nova, ou o detalhe).
 */
export interface OwnUseCancelState {
  readonly key: string;
  readonly outcome: OwnUseCancelOutcome | null;
}
