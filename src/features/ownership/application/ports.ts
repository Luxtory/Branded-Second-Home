import type { PriorAttempt, PublicAttempt } from '@/features/platform';
import type { Interest, InterestModality } from '../domain/interest';

/** Home Edition pública e o seu Home Concept (consulta pública do módulo `catalog`). */
export interface InterestTarget {
  readonly homeEditionId: string;
  readonly homeConceptId: string;
}

/** Resolve o alvo público do interesse; Home Edition fora do público ou inexistente → `null` (ADR-0014). */
export interface InterestTargets {
  find(homeEditionId: string): Promise<InterestTarget | null>;
}

export interface NewInterest extends Interest {
  readonly id: string;
  readonly createdAt: Date;
}

export type InterestWrite = 'registered' | PriorAttempt;

/** Persistência do interesse com a idempotência pública (ADR-0017); implementação PostgreSQL em `infrastructure/`. */
export interface InterestStore {
  /** Repetição ou conflito de uma chave já usada; `null` = chave nova. */
  priorAttempt(attempt: PublicAttempt): Promise<PriorAttempt | null>;
  /** Reserva a chave e grava o interesse numa só transação; corrida com a mesma chave → uma única linha. */
  register(interest: NewInterest, attempt: PublicAttempt): Promise<InterestWrite>;
}

/** Contagem de interesses por Home Edition, localização pretendida, modalidade e `approx_days` exato (BR-062). */
export interface InterestCount {
  readonly homeEditionId: string;
  readonly desiredLocation: string;
  readonly modality: InterestModality;
  readonly approxDays: number | null;
  readonly count: number;
}

/** Leitura agregada para o Admin, na transação que grava o `admin_read` (TECH-092). */
export interface InterestReader<Tx> {
  counts(tx: Tx): Promise<readonly InterestCount[]>;
}
