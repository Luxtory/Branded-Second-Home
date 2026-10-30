import {
  createOperationalAlert,
  type OperationalAlert,
  type OperationalAlertEvent,
  type StaffNotificationTransport,
} from '../application/alerts';
import type { LogPort } from '../application/log';
import { createFakeStaffNotification } from '../infrastructure/alerts/fake-staff-notification';
import {
  createResendStaffNotification,
  type StaffNotificationText,
} from '../infrastructure/alerts/resend-staff-notification';
import { loadEnv, loadRuntimeConfig, type EnvSource } from '../infrastructure/env';
import { messages } from './i18n/pt-br';
import { unavailableKeys } from './unavailable';

/** Texto da notificação de staff: alerta, escopo, correlation id e detalhes técnicos (ids e códigos). */
export function composeStaffNotification(event: OperationalAlertEvent): StaffNotificationText {
  const text = messages.operationalAlert;
  const details = Object.entries(event.details).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`,
  );
  return {
    subject: `${text.subject}: ${event.kind}`,
    text: [
      `${text.alert}: ${event.kind}`,
      `${text.scope}: ${text.scopes[event.scope]}`,
      `${text.correlation}: ${event.correlationId}`,
      '',
      `${text.details}:`,
      ...details,
      '',
      text.footer,
    ].join('\n'),
  };
}

// Transporte simulado do processo (OPS_ALERT_MODE=fake, só local e CI).
const fakeTransport = createFakeStaffNotification();

type TransportResolution =
  | { readonly transport: StaffNotificationTransport }
  | { readonly unavailableKeys: readonly string[] };

/** Transporte a partir do ambiente; configuração ausente ou inválida → indisponível, com as chaves nomeadas. */
export function resolveStaffNotification(source: EnvSource = process.env): TransportResolution {
  try {
    if (loadEnv(source).OPS_ALERT_MODE === 'fake') return { transport: fakeTransport };
    const config = loadRuntimeConfig(
      [
        'OPS_ALERT_RESEND_API_KEY',
        'OPS_ALERT_EMAIL_FROM',
        'OPS_ALERT_EMAIL_TO',
        'OPS_ALERT_SEND_TIMEOUT_MS',
      ],
      source,
    );
    return {
      transport: createResendStaffNotification({
        apiKey: config.OPS_ALERT_RESEND_API_KEY,
        from: config.OPS_ALERT_EMAIL_FROM,
        to: config.OPS_ALERT_EMAIL_TO,
        timeoutMs: config.OPS_ALERT_SEND_TIMEOUT_MS,
        compose: composeStaffNotification,
      }),
    };
  } catch (error) {
    const keys = unavailableKeys(error);
    if (keys === null) throw error;
    return { unavailableKeys: keys };
  }
}

/**
 * Alerta operacional de produção: o transporte é resolvido só quando há o que alertar, então a ausência da
 * configuração não gera ruído diário. Nunca lança — falha inesperada vira log com o nome do erro.
 */
export function createProductionOperationalAlert({
  log,
  source = process.env,
}: {
  readonly log: LogPort;
  readonly source?: EnvSource;
}): OperationalAlert {
  return {
    async raise(event) {
      try {
        const resolution = resolveStaffNotification(source);
        if ('unavailableKeys' in resolution) {
          log.error('staff notification configuration unavailable', {
            alert: event.kind,
            keys: resolution.unavailableKeys,
          });
        }
        const transport = 'transport' in resolution ? resolution.transport : null;
        await createOperationalAlert({ log, transport }).raise(event);
      } catch (error) {
        log.error('operational alert failed', {
          alert: event.kind,
          error_name: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    },
  };
}
