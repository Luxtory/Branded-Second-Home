import type { JsonObject } from '../domain/json';
import type { LogPort } from './log';

/** Alertas do TECH-101. A W10 emite só `open_exercise_failure`; os demais chegam com as waves donas. */
export const OPERATIONAL_ALERTS = [
  'invariant_breach',
  'drift',
  'audit_chain_failure',
  'payment_without_outcome',
  'open_exercise_failure',
] as const;
export type OperationalAlertKind = (typeof OPERATIONAL_ALERTS)[number];

/**
 * Alerta operacional (TECH-101): fora do outbox, para não depender do banco que pode ser a causa. Só identificadores
 * técnicos e códigos — nunca PII, payload de usuário ou mensagem bruta de driver/provedor (TECH-100).
 */
export interface OperationalAlertEvent {
  readonly kind: OperationalAlertKind;
  readonly correlationId: string;
  /** `item`: falha de unidades de trabalho com a execução concluída; `run`: a execução inteira falhou. */
  readonly scope: 'item' | 'run';
  readonly details: JsonObject;
}

export type StaffNotificationResult = 'sent' | 'failed';

/** Transporte da notificação de staff (roadmap W10). Nunca lança: falha vira `failed`. */
export interface StaffNotificationTransport {
  send(event: OperationalAlertEvent): Promise<StaffNotificationResult>;
}

export interface OperationalAlert {
  /** Registra e notifica; nunca lança, para não interromper quem alerta. */
  raise(event: OperationalAlertEvent): Promise<void>;
}

/**
 * Log estruturado sempre; notificação de staff quando há transporte configurado. Sem transporte (configuração ausente
 * ou inválida) a notificação é recusada com segurança: o alerta continua no log, marcado como não notificado.
 */
export function createOperationalAlert(deps: {
  readonly log: LogPort;
  readonly transport: StaffNotificationTransport | null;
}): OperationalAlert {
  return {
    async raise(event) {
      const fields = {
        alert: event.kind,
        scope: event.scope,
        correlation_id: event.correlationId,
        ...event.details,
      };
      deps.log.error('operational alert', fields);
      if (deps.transport === null) {
        deps.log.error('staff notification unavailable', {
          alert: event.kind,
          reason: 'not_configured',
        });
        return;
      }
      const result = await deps.transport.send(event);
      if (result === 'failed') deps.log.error('staff notification failed', { alert: event.kind });
    },
  };
}
