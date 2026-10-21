import type { ExercisedAdminSession } from '@/features/admin';
import {
  readHomeEditionLabels,
  readProjectedInvestmentReferences,
  type HomeEditionLabel,
  type ProjectedInvestmentReference,
} from '@/features/catalog';
import {
  getDatabase,
  recordAdminRead,
  systemClock,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import { groupHomeEditionInterests, type LocationInterests } from '../application/interest-group';
import type { InterestRecord } from '../application/ports';
import type { InterestContact } from '../domain/interest-contact';
import type { InterestQualification } from '../domain/interest-qualification';
import { postgresInterestReader as reader } from '../infrastructure/postgres-interest-reader';

/**
 * Drill-down do Admin (spec ownership §14.10, ADR-0010 §7): cada leitura roda como `luxtory_app`, depois do portão com o
 * papel exercido, na mesma transação que grava o `admin_read` (TECH-092) — o `audit_log` leva só ids, nunca PII. Só o
 * nível "contato e pré-qualificação" devolve dado pessoal, e grava uma leitura de cada objeto.
 */
type AuditedObject = 'interest_group' | 'interest' | 'interest_contact' | 'interest_qualification';

async function recordRead(
  tx: DatabaseTransaction,
  session: ExercisedAdminSession,
  objectType: AuditedObject,
  objectId: string,
): Promise<void> {
  await recordAdminRead(tx, {
    actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
    objectType,
    objectId,
    authorizationRef: session.authorizationRef,
    at: systemClock.now(),
  });
}

async function labelOf(
  tx: DatabaseTransaction,
  homeEditionId: string,
): Promise<HomeEditionLabel | null> {
  return (await readHomeEditionLabels(tx, [homeEditionId])).get(homeEditionId) ?? null;
}

export interface HomeEditionInterests {
  readonly homeEditionId: string;
  /** Nome da Home Edition, título do Home Concept e marca vindos do catálogo; `null` se indisponível. */
  readonly label: HomeEditionLabel | null;
  readonly locations: readonly LocationInterests[];
}

/** Grupo da Home Edition: os interesses individuais, sem PII (`admin_read` `interest_group`, id da Home Edition). */
export function readHomeEditionInterests(
  session: ExercisedAdminSession,
  homeEditionId: string,
  db: Database = getDatabase(),
): Promise<HomeEditionInterests> {
  return db.transaction().execute(async (tx) => {
    await recordRead(tx, session, 'interest_group', homeEditionId);
    return {
      homeEditionId,
      label: await labelOf(tx, homeEditionId),
      locations: groupHomeEditionInterests(await reader.homeEditionInterests(tx, homeEditionId)),
    };
  });
}

export interface InterestView {
  readonly interest: InterestRecord;
  readonly label: HomeEditionLabel | null;
}

/** Interesse individual, sem PII (`admin_read` `interest`, id do interesse); inexistente → `null`. */
export function readInterestRecord(
  session: ExercisedAdminSession,
  interestId: string,
  db: Database = getDatabase(),
): Promise<InterestView | null> {
  return db.transaction().execute(async (tx) => {
    await recordRead(tx, session, 'interest', interestId);
    const interest = await reader.interest(tx, interestId);
    if (interest === null) return null;
    return { interest, label: await labelOf(tx, interest.homeEditionId) };
  });
}

export interface ContactView extends InterestView {
  /** `null` = "contato indisponível" (eliminado). */
  readonly contact: InterestContact | null;
  /** `null` = "pré-qualificação indisponível" (eliminada). */
  readonly qualification: InterestQualification | null;
  /** A média projetada que a página apresentou, pelo histórico imutável; `null` = nenhuma apresentada. */
  readonly presented: ProjectedInvestmentReference | null;
}

/**
 * Contato e pré-qualificação de um interesse, leitura deliberada: grava `admin_read` de `interest_contact` e de
 * `interest_qualification` (id do interesse), na mesma transação.
 */
export function readInterestContact(
  session: ExercisedAdminSession,
  interestId: string,
  db: Database = getDatabase(),
): Promise<ContactView | null> {
  return db.transaction().execute(async (tx) => {
    await recordRead(tx, session, 'interest_contact', interestId);
    await recordRead(tx, session, 'interest_qualification', interestId);
    const interest = await reader.interest(tx, interestId);
    if (interest === null) return null;
    const qualification = await reader.qualification(tx, interestId);
    const presentedId = qualification?.presentedProjectedInvestmentId ?? null;
    const references =
      presentedId === null ? null : await readProjectedInvestmentReferences(tx, [presentedId]);
    return {
      interest,
      label: await labelOf(tx, interest.homeEditionId),
      contact: await reader.contact(tx, interestId),
      qualification,
      presented: presentedId === null ? null : (references?.get(presentedId) ?? null),
    };
  });
}
