import type { PriorAttempt, PublicAttempt } from '@/features/platform';
import type { Interest, InterestModality, OfferedModality } from '../domain/interest';

/** Concept publicado e as modalidades das suas Editions publicadas (consulta pública do módulo `catalog`). */
export interface InterestTarget {
  readonly conceptId: string;
  readonly editions: readonly { readonly id: string; readonly modality: OfferedModality }[];
}

/** Resolve o alvo público do interesse; Concept não publicado ou inexistente → `null` (ADR-0014). */
export interface InterestTargets {
  find(conceptId: string): Promise<InterestTarget | null>;
}

export interface NewInterest extends Interest {
  readonly id: string;
  readonly createdAt: Date;
}

/** `modality_not_offered`: o gatilho do banco recusou a modalidade (a Edition mudou depois da checagem pública). */
export type InterestWrite = 'registered' | PriorAttempt | 'modality_not_offered';

/** Persistência do interesse com a idempotência pública (ADR-0017); implementação PostgreSQL em `infrastructure/`. */
export interface InterestStore {
  /** Repetição ou conflito de uma chave já usada; `null` = chave nova. */
  priorAttempt(attempt: PublicAttempt): Promise<PriorAttempt | null>;
  /** Reserva a chave e grava o interesse numa só transação; corrida com a mesma chave → uma única linha. */
  register(interest: NewInterest, attempt: PublicAttempt): Promise<InterestWrite>;
}

/** Contagem de interesses por Concept, região, modalidade e valor exato de `approx_days` (BR-062). */
export interface InterestCount {
  readonly conceptId: string;
  readonly region: string;
  readonly modality: InterestModality;
  readonly approxDays: number | null;
  readonly count: number;
}

/** Leitura agregada para o Admin, na transação que grava o `admin_read` (TECH-092). */
export interface InterestReader<Tx> {
  counts(tx: Tx): Promise<readonly InterestCount[]>;
}
