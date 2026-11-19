/** Estado do formulário de declaração de convidados (compartilhado entre a Server Action e o componente de cliente). */
export type GuestNominationOutcome =
  'closed' | 'unavailable' | 'permission' | 'state' | 'missing' | 'unexpected' | 'accept';

/** A chave nasce com a página (mesma intenção = mesma chave); recusa gravada troca a chave. */
export interface GuestNominationState {
  readonly key: string;
  readonly outcome: GuestNominationOutcome | null;
}
