import {
  configuredPaymentGateway,
  createPostgresBillingStore,
  createReconcilePaymentHandler,
  initiatePayment,
  processRefund,
  reconcilePayment,
} from '@/features/billing';
import {
  createProductionExecutor,
  systemCommandGuard,
  type Database,
  type EnvSource,
  type LogPort,
} from '@/features/platform';
import type { RequestFlowDependencies } from '../application/request-flow';
import { quoteRequest } from '../application/send-request';
import { requestDependencies } from './request-handlers';

/**
 * Dependências de produção do fluxo da Request (prévia, pagamento da Taxa, recuperação e estornos), sem o envio — que
 * cada superfície executa pelo próprio caminho (rota REST ou Server Action). Sem PSP configurado, o pagamento recusa
 * (`PaymentsUnavailableError`) e estorno/recuperação ficam para a conciliação.
 */
export function productionRequestFlow(
  db: Database,
  log: LogPort,
  source?: EnvSource,
): Omit<RequestFlowDependencies, 'send'> {
  const store = createPostgresBillingStore(db);
  const gateway = configuredPaymentGateway(source);
  const deps = requestDependencies(db);
  return {
    quote: (viewer, request) =>
      db
        .transaction()
        .execute((tx) =>
          quoteRequest(deps, tx, { userId: viewer.userId, now: new Date() }, request),
        ),
    initiatePayment: (request) => initiatePayment({ store, gateway, log }, request),
    findPayment: (paymentId) => store.findPayment(paymentId),
    reconcile: async (paymentId, correlationId) => {
      if (gateway === null) return null;
      const executor = createProductionExecutor({
        guard: systemCommandGuard,
        log,
        source,
        database: db,
      });
      const handler = createReconcilePaymentHandler({ store });
      return reconcilePayment(
        { store, gateway, log, execute: (request) => executor.execute(handler, request) },
        paymentId,
        correlationId,
      );
    },
    processRefund: async (refundId) =>
      gateway === null ? null : processRefund({ store, gateway, log }, refundId),
    log,
  };
}
