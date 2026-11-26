// Superfície pública do módulo luxchange (TECH-011). W20: depósito de capacidade (`deposit_capacity`; ADR-0036). W21:
// Request — envio, prévia, pagamento da Taxa, retirada e encerramentos pré-aceite (ADR-0037). O shell (`src/app/`)
// importa as telas de `presentation/` diretamente; os consumidores do outbox e o job saem por `./jobs`.
export {
  createDepositCapacityHandler,
  depositCapacityInput,
  DepositWriteError,
  MAX_DEPOSIT_NIGHTS,
  type DepositCapacityInput,
  type DepositCapacityResult,
  type DepositDependencies,
} from './application/deposit-capacity';
export { CREDITS_ORIGINATED, type CreditsOriginatedPayload } from './application/deposit-events';
export { DEPOSIT_COMPLETED_NOTIFICATION } from './application/deposit-consumers';
export { CREDITS_CAPABILITY, LUXCHANGE_DEPOSIT_CAPABILITY } from './application/ports';
export { createDepositHandler } from './presentation/deposit-handler';
export {
  createSendRequestHandler,
  quoteRequest,
  sendRequestInput,
  type RequestQuote,
  type RequestShape,
  type SendRequestDependencies,
  type SendRequestInput,
  type SendRequestResult,
} from './application/send-request';
export {
  createSystemClosingHandler,
  createWithdrawRequestHandler,
  withdrawRequestInput,
  type RequestClosingResult,
  type WithdrawRequestInput,
} from './application/close-request';
export {
  payRequestFee,
  submitRequest,
  type RequestFeePayment,
  type RequestFlowDependencies,
  type RequestViewer,
} from './application/request-flow';
export { REQUEST_CLOSED, REQUEST_SENT } from './application/request-events';
export {
  REQUEST_CLOSED_NOTIFICATION,
  REQUEST_RECEIVED_CLOSED_NOTIFICATION,
  REQUEST_RECEIVED_NOTIFICATION,
  REQUEST_SENT_NOTIFICATION,
} from './application/request-consumers';
export {
  createSendRequestProductionHandler,
  createSystemClosingProductionHandler,
  createWithdrawRequestProductionHandler,
  requestDependencies,
} from './presentation/request-handlers';
