import type {
  OperationalAlertEvent,
  StaffNotificationResult,
  StaffNotificationTransport,
} from '../../application/alerts';

/** API HTTP do Resend, a mesma do contato Brand Partners (TECH-057): sem SDK nem fornecedor novo. */
export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

export interface StaffNotificationText {
  readonly subject: string;
  readonly text: string;
}

export interface ResendStaffNotificationOptions {
  readonly apiKey: string;
  /** Remetente verificado no Resend (configuração do servidor). */
  readonly from: string;
  /** Caixa de operação da staff (configuração do servidor, nunca do client). */
  readonly to: string;
  readonly timeoutMs: number;
  readonly compose: (event: OperationalAlertEvent) => StaffNotificationText;
  readonly fetch?: typeof fetch;
}

/**
 * Notificação de staff por e-mail (W10, TECH-101). `Idempotency-Key` = alerta + `correlation_id`: a mesma execução
 * não envia duas vezes dentro da janela do provedor. Timeout, rede ou status não-2xx viram `failed`; a resposta bruta
 * do provedor nunca sai daqui.
 */
export function createResendStaffNotification({
  apiKey,
  from,
  to,
  timeoutMs,
  compose,
  fetch: request = fetch,
}: ResendStaffNotificationOptions): StaffNotificationTransport {
  return {
    async send(event): Promise<StaffNotificationResult> {
      const { subject, text } = compose(event);
      try {
        const response = await request(RESEND_EMAILS_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': `${event.kind}:${event.scope}:${event.correlationId}`,
          },
          body: JSON.stringify({ from, to: [to], subject, text }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        });
        return response.ok ? 'sent' : 'failed';
      } catch {
        return 'failed';
      }
    },
  };
}
