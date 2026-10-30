import type { OperationalAlertEvent, StaffNotificationTransport } from '../../application/alerts';

/**
 * Transporte simulado (local e CI, `OPS_ALERT_MODE=fake`; recusado na Vercel): guarda as notificações em memória, sem
 * e-mail real. Testes leem `sent` para conferir o contrato.
 */
export function createFakeStaffNotification(): StaffNotificationTransport & {
  readonly sent: OperationalAlertEvent[];
} {
  const sent: OperationalAlertEvent[] = [];
  return {
    sent,
    send(event) {
      sent.push(event);
      return Promise.resolve('sent');
    },
  };
}
