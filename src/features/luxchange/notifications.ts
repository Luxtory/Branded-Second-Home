// Superfície pública do luxchange para a central de avisos do Titular (W20): o texto do aviso do depósito, sem o resto
// do módulo (sem ciclo de inicialização com `booking`, que monta a central).
export {
  depositNotificationCopy,
  type DepositNotificationCopy,
} from './presentation/deposit-notification-copy';
