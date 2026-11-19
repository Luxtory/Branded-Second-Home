import type { DatabaseTransaction } from '@/features/platform';
import { createNominateGuestHandler } from '../application/nominate-guest';
import { createPostgresBookingLifecycleStore } from '../infrastructure/postgres-booking-lifecycle-store';
import { createPostgresGuestNominationStore } from '../infrastructure/postgres-guest-nomination-store';

/** `nominate_guest` (W14, ADR-0030 §4) com as dependências de produção; a Server Action da Área do Titular o expõe. */
export function createGuestNominationHandlers() {
  return {
    nominateGuest: createNominateGuestHandler<DatabaseTransaction>({
      store: createPostgresBookingLifecycleStore(),
      nominations: createPostgresGuestNominationStore(),
    }),
  };
}
