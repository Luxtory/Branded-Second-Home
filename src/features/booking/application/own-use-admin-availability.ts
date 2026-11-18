import type { BookingState, ExceptionType, Modality } from '../domain/own-use-lifecycle';
import type { AuthorizationPurpose } from './own-use-lifecycle-ports';

/**
 * Atos do Admin disponíveis numa reserva e o motivo de cada indisponível (W13 E4b; spec booking §10.2, §10.5, §10.15).
 * Pura e só para a tela: o handler e o banco revalidam tudo na escrita (estado, janela, K2, autorização viva). O
 * padrão do legado aproveitado é o da disponibilidade decidida no servidor com o motivo da restrição.
 */
export type AdminAct =
  'resolve' | 'open_exception' | 'no_show' | 'invalidation' | 'recovery' | 'request';

export type Unavailability =
  | 'lifecycle_closed'
  | 'not_in_exception'
  | 'exception_open'
  | 'after_checkout'
  | 'state'
  | 'no_show_window'
  | 'not_unauthorized_co_owner'
  | 'nothing_unstarted'
  | 'nothing_recoverable'
  | 'nothing_to_request';

export interface AdminFacts {
  readonly state: BookingState;
  readonly modality: Modality;
  readonly exceptionType: ExceptionType | null;
  readonly lifecycleOpen: boolean;
  readonly beforeCheckout: boolean;
  readonly noShowWindowOpen: boolean;
  readonly unstartedDates: readonly string[];
  readonly recoverableCustodies: number;
}

export interface ActAvailability {
  readonly act: AdminAct;
  readonly available: boolean;
  readonly reason: Unavailability | null;
}

const ACTIVE: readonly BookingState[] = ['confirmed', 'in_use'];

/** Finalidades que fariam sentido solicitar agora (a autorização é emitida só nessas condições, ADR-0027 §4). */
export function requestablePurposes(facts: AdminFacts): AuthorizationPurpose[] {
  const purposes: AuthorizationPurpose[] = [];
  if (ACTIVE.includes(facts.state) && facts.noShowWindowOpen) purposes.push('no_show');
  if (facts.exceptionType === 'operational' && facts.unstartedDates.length > 0)
    purposes.push('exception_cancellation');
  if (facts.exceptionType === 'unauthorized_booking' && facts.unstartedDates.length > 0)
    purposes.push('invalidation');
  if (facts.recoverableCustodies > 0) purposes.push('recovery');
  return purposes;
}

function reasonFor(act: AdminAct, facts: AdminFacts): Unavailability | null {
  switch (act) {
    case 'resolve':
      return facts.state === 'in_exception' ? null : 'not_in_exception';
    case 'open_exception':
      if (facts.state === 'in_exception') return 'exception_open';
      if (!ACTIVE.includes(facts.state)) return 'state';
      return facts.beforeCheckout ? null : 'after_checkout';
    case 'no_show':
      if (!ACTIVE.includes(facts.state))
        return facts.state === 'in_exception' ? 'exception_open' : 'state';
      return facts.noShowWindowOpen ? null : 'no_show_window';
    case 'invalidation':
      if (facts.exceptionType !== 'unauthorized_booking' || facts.modality !== 'co_owner')
        return 'not_unauthorized_co_owner';
      return facts.unstartedDates.length > 0 ? null : 'nothing_unstarted';
    case 'recovery':
      return facts.recoverableCustodies > 0 ? null : 'nothing_recoverable';
    case 'request':
      return requestablePurposes(facts).length > 0 ? null : 'nothing_to_request';
  }
}

const ACTS: readonly AdminAct[] = [
  'resolve',
  'invalidation',
  'no_show',
  'recovery',
  'request',
  'open_exception',
];

export function adminActAvailability(facts: AdminFacts): readonly ActAvailability[] {
  return ACTS.map((act) => {
    // Sem a K2 nenhum ato executa; a solicitação seria inútil (a autorização não teria ato a liberar).
    const reason = facts.lifecycleOpen ? reasonFor(act, facts) : 'lifecycle_closed';
    return { act, available: reason === null, reason };
  });
}
