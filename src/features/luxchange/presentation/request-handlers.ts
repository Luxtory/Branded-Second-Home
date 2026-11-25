import { createPostgresBillingStore } from '@/features/billing';
import { createOwnUseCessionPort } from '@/features/booking';
import { createPostgresCreditStore } from '@/features/credits';
import type { CommandHandler, Database, DatabaseTransaction } from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  postgresEconomicSnapshotRecorder,
  recordAcceptedPolicy,
} from '@/features/pricing';
import {
  createSystemClosingHandler,
  createWithdrawRequestHandler,
  type ClosingDependencies,
  type RequestClosingResult,
  type SystemClosingInput,
  type WithdrawRequestInput,
} from '../application/close-request';
import {
  createSendRequestHandler,
  type SendRequestDependencies,
  type SendRequestInput,
  type SendRequestResult,
} from '../application/send-request';
import { createPostgresRequestStore } from '../infrastructure/postgres-request-store';

/** Dependências de produção do envio e da prévia (superfícies públicas de booking, credits, billing e pricing). */
export function requestDependencies(db: Database): SendRequestDependencies<DatabaseTransaction> {
  return {
    store: createPostgresRequestStore(),
    bookings: createOwnUseCessionPort(),
    terms: createPostgresEconomicTermsStore(),
    credits: createPostgresCreditStore(),
    billing: createPostgresBillingStore(db),
    snapshots: {
      record: postgresEconomicSnapshotRecorder.record,
      recordPolicy: recordAcceptedPolicy,
    },
  };
}

function closingDependencies(db: Database): ClosingDependencies<DatabaseTransaction> {
  return {
    store: createPostgresRequestStore(),
    credits: createPostgresCreditStore(),
    billing: createPostgresBillingStore(db),
  };
}

/** `send_request` com as dependências de produção. */
export function createSendRequestProductionHandler(
  db: Database,
): CommandHandler<SendRequestInput, SendRequestResult, DatabaseTransaction> {
  return createSendRequestHandler(requestDependencies(db));
}

/** `withdraw_request` com as dependências de produção. */
export function createWithdrawRequestProductionHandler(
  db: Database,
): CommandHandler<WithdrawRequestInput, RequestClosingResult, DatabaseTransaction> {
  return createWithdrawRequestHandler(closingDependencies(db));
}

/** `expire_requests` ou `close_ineligible_request` com as dependências de produção. */
export function createSystemClosingProductionHandler(
  command: 'expire_requests' | 'close_ineligible_request',
  db: Database,
): CommandHandler<SystemClosingInput, RequestClosingResult, DatabaseTransaction> {
  return createSystemClosingHandler(command, closingDependencies(db));
}
