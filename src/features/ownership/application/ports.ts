import type { PriorAttempt, PublicAttempt } from '@/features/platform';
import type { Interest, InterestModality } from '../domain/interest';
import type { InterestContact } from '../domain/interest-contact';
import type { InterestQualification } from '../domain/interest-qualification';

/** Home Edition pública e o seu Home Concept (consulta pública do módulo `catalog`). */
export interface InterestTarget {
  readonly homeEditionId: string;
  readonly homeConceptId: string;
}

/** Resolve o alvo público do interesse; Home Edition fora do público ou inexistente → `null` (ADR-0014). */
export interface InterestTargets {
  find(homeEditionId: string): Promise<InterestTarget | null>;
}

/** A solicitação de conversa completa, pronta para gravar (spec ownership §14.7). */
export interface NewInterest {
  readonly id: string;
  readonly createdAt: Date;
  readonly interest: Interest;
  readonly contact: InterestContact;
  readonly qualification: InterestQualification;
}

/** `not_found`: a Home Edition deixou de ser pública durante o registro — nada foi gravado (`02` §15, item 15). */
export type InterestWrite = 'registered' | 'not_found' | PriorAttempt;

/** Persistência do interesse com a idempotência pública (ADR-0017, ADR-0018); implementação em `infrastructure/`. */
export interface InterestStore {
  /** Repetição ou conflito de uma chave já usada; `null` = chave nova. */
  priorAttempt(attempt: PublicAttempt): Promise<PriorAttempt | null>;
  /**
   * Numa só transação: reserva a chave, revalida a Home Edition pública com trava e grava interesse, contato e
   * pré-qualificação. Corrida com a mesma chave → uma única solicitação; qualquer falha → nada gravado.
   */
  register(request: NewInterest, attempt: PublicAttempt): Promise<InterestWrite>;
}

/** Contagem de interesses por Home Edition, localização pretendida, modalidade e `approx_days` exato (BR-062). */
export interface InterestCount {
  readonly homeEditionId: string;
  readonly desiredLocation: string;
  readonly modality: InterestModality;
  readonly approxDays: number | null;
  readonly count: number;
}

/** Um interesse individual para o Admin — só a manifestação, sem PII nem `origin`/`partner_ref` (spec §14.10). */
export interface InterestRecord {
  readonly id: string;
  readonly homeEditionId: string;
  readonly modality: InterestModality;
  readonly desiredLocation: string;
  readonly approxDays: number | null;
  readonly createdAt: Date;
}

/** Leituras do Admin, na transação que grava o `admin_read` (TECH-092). */
export interface InterestReader<Tx> {
  counts(tx: Tx): Promise<readonly InterestCount[]>;
  /** Os interesses de uma Home Edition (drill-down, sem PII). */
  homeEditionInterests(tx: Tx, homeEditionId: string): Promise<readonly InterestRecord[]>;
  interest(tx: Tx, interestId: string): Promise<InterestRecord | null>;
  /** `null` = contato indisponível (eliminado). */
  contact(tx: Tx, interestId: string): Promise<InterestContact | null>;
  /** `null` = pré-qualificação indisponível (eliminada). */
  qualification(tx: Tx, interestId: string): Promise<InterestQualification | null>;
}
