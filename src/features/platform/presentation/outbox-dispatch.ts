import { after } from 'next/server';
import type { LogPort } from '../application/log';

/**
 * Depois da resposta de um command comitado, entrega o outbox sem esperar pela varredura do cron (TECH-091). Falha
 * aqui só vira log: o evento continua pendente e a varredura o entrega depois.
 */
export function scheduleOutboxDispatch(dispatch: () => Promise<unknown>, log: LogPort): void {
  after(async () => {
    try {
      await dispatch();
    } catch (error) {
      log.error('outbox dispatch after commit failed', {
        error_name: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  });
}
