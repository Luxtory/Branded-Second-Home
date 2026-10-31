/** Estado do formulário de confirmação da reserva (compartilhado entre a Server Action e o componente de cliente). */
export type OwnUseBookingMessage =
  | 'closed'
  | 'unavailable'
  | 'permission'
  | 'stay_length'
  | 'capacity'
  | 'conflict'
  | 'window'
  | 'balance'
  | 'already_confirmed'
  | 'invalid'
  | 'unexpected';

/**
 * A chave de idempotência nasce na prévia (a mesma intenção = a mesma chave, ADR-0026 D6): duplo clique e reenvio na
 * mesma página repetem o resultado; uma recusa gravada troca a chave (a próxima tentativa é intenção nova).
 */
export interface OwnUseBookingState {
  readonly key: string;
  readonly message: OwnUseBookingMessage | null;
  /** Reserva confirmada encontrada pela consulta de recuperação (resultado incerto), visível ao Titular por RLS. */
  readonly bookingId?: string;
}
