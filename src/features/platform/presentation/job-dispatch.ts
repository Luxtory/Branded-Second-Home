import { after } from 'next/server';
import type { JobName } from '../application/jobs/names';
import type { LogPort } from '../application/log';

/**
 * Depois de um commit novo, executa um job do TECH-090 sem esperar o cron (W10: `open_exercise` após a formalização,
 * ADR-0024 §2). Melhor esforço, como o disparo do outbox: falha aqui só vira log, e o cron diário recupera.
 *
 * O registro de jobs é importado só na execução: ele compõe módulos que importam o próprio platform, e um import
 * estático daqui criaria um ciclo na inicialização do índice público (o sorteio da W9 perderia `recordSystemAudit`).
 */
export function dispatchJobAfterCommit(job: JobName, log: LogPort, correlationId: string): void {
  after(async () => {
    try {
      const { createJobRegistry } = await import('../infrastructure/jobs/job-registry');
      const run = createJobRegistry({ log }).get(job);
      if (run === undefined) throw new Error(`Job not registered: ${job}`);
      await run({ correlationId });
    } catch (error) {
      log.error('job after commit failed', {
        job,
        error_name: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  });
}
