import type { PaymentGateway } from '@/features/billing';
import type { Clock, Database, EnvSource, JobRunner, LogPort } from '@/features/platform';

export interface ExpireRequestsJobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  /** Banco da aplicação; padrão: `getDatabase(source)`. */
  readonly database?: Database;
  /** PSP; padrão: o configurado. Sem PSP, o encerramento acontece e o estorno fica `pending` para a conciliação. */
  readonly gateway?: PaymentGateway | null;
  readonly timeBudgetMs?: number;
}

/**
 * Job `expire_requests` (W21; ADR-0037 §7) para o registro de jobs do platform: a fábrica não importa nada em tempo de
 * execução, e a implementação (handlers e dependências de billing, booking, credits e pricing) é carregada na primeira
 * execução — o registro não forma ciclo de inicialização com esses slices.
 */
export function createExpireRequestsJob(env: ExpireRequestsJobEnvironment): JobRunner {
  return async (context) => {
    const { runExpireRequestsJob } = await import('./request-job-runtime');
    return runExpireRequestsJob(env, context);
  };
}
