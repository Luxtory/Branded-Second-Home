import { isJobName, type JobName } from './names';

/** Contagens de uma execução de job (schema `JobResult` do OpenAPI). */
export type JobResult = Readonly<Record<string, number>>;
/** Contexto da invocação (W10): o `correlation_id` do request que disparou o job (cron, `after()` ou manual). */
export interface JobContext {
  readonly correlationId: string;
}
export type JobRunner = (context?: JobContext) => Promise<JobResult>;

/** Registro de jobs implementados, separado do registro de consumidores do outbox. */
export class JobRegistry {
  constructor(private readonly runners: Partial<Readonly<Record<JobName, JobRunner>>>) {}

  /** Runner do job, só para nomes do TECH-090 implementados. */
  get(name: string): JobRunner | undefined {
    return isJobName(name) ? this.runners[name] : undefined;
  }

  names(): readonly JobName[] {
    return Object.keys(this.runners).filter(isJobName);
  }
}
