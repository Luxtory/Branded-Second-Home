import { createPostgresOwnUseRights, createUseWindowResolver } from '@/features/calendar/booking';
import { createOwnUseInventory } from '@/features/inventory';
import { findUseRightFacts } from '@/features/ownership';
import type { CommandHandler, DatabaseTransaction } from '@/features/platform';
import {
  createCreateOwnUseBookingHandler,
  type CreateOwnUseBookingInput,
  type CreateOwnUseBookingResult,
} from '../application/create-own-use-booking';
import { createPostgresBookingStore } from '../infrastructure/postgres-booking-store';

/** `create_own_use_booking` com as dependências de produção (superfícies públicas de calendar, inventory e ownership). */
export function createOwnUseBookingHandler(): CommandHandler<
  CreateOwnUseBookingInput,
  CreateOwnUseBookingResult,
  DatabaseTransaction
> {
  return createCreateOwnUseBookingHandler<DatabaseTransaction>({
    store: createPostgresBookingStore(),
    inventory: createOwnUseInventory(),
    rights: createPostgresOwnUseRights(),
    findFacts: findUseRightFacts,
    windowOpensAt: createUseWindowResolver(),
  });
}
