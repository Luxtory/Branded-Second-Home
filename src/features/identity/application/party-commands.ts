import { z } from 'zod';
import { CommandRejection, type Actor, type CommandHandler } from '@/features/platform';
import { delegationStatus } from '../domain/party-delegation';
import { normalizePartyDocument, type PartyDocument } from '../domain/party-document';
import { isStaffRole, type StaffRole } from '../domain/staff';
import { createPartyDocumentResolver } from './party-resolver';
import {
  AccountAlreadyConfirmedError,
  type DelegationRecord,
  type PartyDocumentProtector,
  type PartyStore,
  type RepresentativeAccounts,
} from './party-ports';

const DOCUMENT_INPUT_MAX = 32;
const EMAIL_MAX = 254;
const TEXT_MAX = 255;

/** Texto digitado → documento normalizado; inválido vira erro do campo (spec identity §13.3). */
export const partyDocumentInput = z
  .string()
  .min(1)
  .max(DOCUMENT_INPUT_MAX)
  .transform((value, context): PartyDocument => {
    const document = normalizePartyDocument(value);
    if (document === null) {
      context.addIssue({ code: 'custom', message: 'invalid_document' });
      return z.NEVER;
    }
    return document;
  });

export const registerPartyInput = z.strictObject({ document: partyDocumentInput });
export type RegisterPartyInput = z.infer<typeof registerPartyInput>;

export const createPartyDelegationInput = z.strictObject({
  party_id: z.uuid(),
  // Espaços e maiúsculas não mudam o endereço: normalizado antes de validar e de procurar a conta.
  email: z.string().trim().toLowerCase().pipe(z.email().max(EMAIL_MAX)),
  valid_until: z.iso.datetime({ offset: true }).optional(),
  basis: z.string().trim().min(1).max(TEXT_MAX),
});
export type CreatePartyDelegationInput = z.infer<typeof createPartyDelegationInput>;

export const revokePartyDelegationInput = z.strictObject({
  party_delegation_id: z.uuid(),
  revocation_basis: z.string().trim().min(1).max(TEXT_MAX),
});
export type RevokePartyDelegationInput = z.infer<typeof revokePartyDelegationInput>;

export const activatePartyDelegationInput = z.strictObject({ party_delegation_id: z.uuid() });
export type ActivatePartyDelegationInput = z.infer<typeof activatePartyDelegationInput>;

/** Resposta (OpenAPI `Party`): nunca o documento, o HMAC ou a cifra. */
export function partyResult(party: {
  readonly id: string;
  readonly documentType: string;
  readonly operationId: string;
  readonly createdAt: Date;
}) {
  return {
    id: party.id,
    document_type: party.documentType,
    operation_id: party.operationId,
    created_at: party.createdAt.toISOString(),
  };
}
export type PartyResult = ReturnType<typeof partyResult>;

const iso = (value: Date | null) => (value === null ? null : value.toISOString());

/** Resposta (OpenAPI `PartyDelegation`): ids, estado, vigência e base; nunca o e-mail. */
export function delegationResult(delegation: DelegationRecord) {
  return {
    id: delegation.id,
    party_id: delegation.partyId,
    user_id: delegation.userId,
    scope: delegation.scope,
    state: delegation.state,
    valid_from: delegation.validFrom.toISOString(),
    valid_until: iso(delegation.validUntil),
    basis: delegation.basis,
    operation_id: delegation.operationId,
    created_at: delegation.createdAt.toISOString(),
    activated_at: iso(delegation.activatedAt),
    revoked_at: iso(delegation.revokedAt),
    revocation_basis: delegation.revocationBasis,
  };
}
export type DelegationResult = ReturnType<typeof delegationResult>;

export interface PartyCommandDependencies<Tx> {
  readonly store: PartyStore<Tx>;
  readonly protector: PartyDocumentProtector;
  readonly newId: () => string;
}

export interface DelegationCommandDependencies<Tx> extends PartyCommandDependencies<Tx> {
  readonly accounts: RepresentativeAccounts<Tx>;
}

function staffOf(actor: Actor, command: string): { userId: string; role: StaffRole } {
  if (actor.kind !== 'user' || !isStaffRole(actor.role)) {
    throw new Error(`${command} reached the handler without a staff actor`);
  }
  return { userId: actor.userId, role: actor.role };
}

function found<T>(value: T | null): T {
  if (value === null) throw new CommandRejection('ERR_NOT_FOUND');
  return value;
}

function requireState(allowed: boolean): void {
  if (!allowed) throw new CommandRejection('ERR_STATE_TRANSITION');
}

/**
 * `register_party` (REQ-095, TECH-100): documento já cadastrado em qualquer chave do anel → `ERR_STATE_TRANSITION`; a
 * corrida entre cadastros concorrentes cai no `UNIQUE` (`conflict_party_document_hmac`, mesmo código).
 */
export function registerPartyHandler<Tx>(
  deps: PartyCommandDependencies<Tx>,
): CommandHandler<RegisterPartyInput, PartyResult, Tx> {
  return {
    command: 'register_party',
    input: registerPartyInput,
    fingerprint: (input) => ({
      document: createPartyDocumentResolver(deps.protector, deps.store).fingerprint(input.document),
    }),
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffOf(actor, 'register_party');
      const existing = await deps.store.findPartyIdByDigests(
        tx,
        deps.protector.lookupDigests(input.document),
      );
      requireState(existing === null);
      const id = deps.newId();
      await deps.store.insertParty(tx, {
        id,
        document: deps.protector.protect(id, input.document),
        registeredByUserId: staff.userId,
        registeredRole: staff.role,
        operationId,
        createdAt: now,
      });
      const result = partyResult({
        id,
        documentType: input.document.type,
        operationId,
        createdAt: now,
      });
      audit({ objectType: 'party', objectId: id, before: null, after: result });
      return result;
    },
  };
}

/** Conta do e-mail para a delegação: confirmada → a própria; inexistente ou não confirmada → convite (ADR-0020 §8). */
async function representativeAccount<Tx>(
  deps: DelegationCommandDependencies<Tx>,
  tx: Tx,
  email: string,
  partyId: string,
): Promise<string> {
  const account = await deps.accounts.find(tx, email);
  if (account !== null) {
    requireState((await deps.store.openDelegation(tx, account.userId, partyId)) === null);
    if (account.confirmed) return account.userId;
  }
  try {
    return await deps.accounts.invite(email);
  } catch (error) {
    // Confirmada entre a busca e o convite: segue com a conta, sem convite (e sem duplicar a delegação).
    if (!(error instanceof AccountAlreadyConfirmedError)) throw error;
    const confirmed = await deps.accounts.find(tx, email);
    if (confirmed === null || !confirmed.confirmed) throw error;
    requireState((await deps.store.openDelegation(tx, confirmed.userId, partyId)) === null);
    return confirmed.userId;
  }
}

/**
 * `create_party_delegation` (decisões do fundador de 2026-10-21): delegação `pending` — não representa a party até o
 * próprio usuário ativá-la. A party travada serializa convites do mesmo par; o conflito é recusado antes do e-mail.
 */
export function createPartyDelegationHandler<Tx>(
  deps: DelegationCommandDependencies<Tx>,
): CommandHandler<CreatePartyDelegationInput, DelegationResult, Tx> {
  return {
    command: 'create_party_delegation',
    input: createPartyDelegationInput,
    fingerprint: (input) => ({ ...input, email: deps.protector.fingerprint('email', input.email) }),
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffOf(actor, 'create_party_delegation');
      const validUntil = input.valid_until === undefined ? null : new Date(input.valid_until);
      if (validUntil !== null && validUntil.getTime() <= now.getTime()) {
        throw new CommandRejection('ERR_VALIDATION');
      }
      const party = found(await deps.store.lockParty(tx, input.party_id));
      const userId = await representativeAccount(deps, tx, input.email, party.id);
      const delegation = await deps.store.insertDelegation(tx, {
        id: deps.newId(),
        partyId: party.id,
        userId,
        validFrom: now,
        validUntil,
        basis: input.basis,
        invitedByUserId: staff.userId,
        invitedRole: staff.role,
        operationId,
        createdAt: now,
      });
      const result = delegationResult(delegation);
      audit({
        objectType: 'party_delegation',
        objectId: delegation.id,
        before: null,
        after: result,
      });
      return result;
    },
  };
}

/** `revoke_party_delegation`: pendente ou ativa → revogada, com base; efeito imediato (RLS e guard releem). */
export function revokePartyDelegationHandler<Tx>(
  deps: PartyCommandDependencies<Tx>,
): CommandHandler<RevokePartyDelegationInput, DelegationResult, Tx> {
  return {
    command: 'revoke_party_delegation',
    input: revokePartyDelegationInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffOf(actor, 'revoke_party_delegation');
      const id = input.party_delegation_id;
      const before = found(await deps.store.lockDelegation(tx, id));
      requireState(before.state !== 'revoked');
      const after = await deps.store.revokeDelegation(tx, id, {
        at: now,
        basis: input.revocation_basis,
        userId: staff.userId,
        role: staff.role,
        operationId,
      });
      const result = delegationResult(after);
      audit({
        objectType: 'party_delegation',
        objectId: id,
        before: delegationResult(before),
        after: result,
      });
      return result;
    },
  };
}

/**
 * `activate_party_delegation`: o próprio convidado, autenticado, ativa a delegação pendente (regra central do fundador).
 * O guard (`invitee`) já conferiu a sessão e o dono; aqui revalida com a linha travada.
 */
export function activatePartyDelegationHandler<Tx>(
  deps: PartyCommandDependencies<Tx>,
): CommandHandler<ActivatePartyDelegationInput, DelegationResult, Tx> {
  return {
    command: 'activate_party_delegation',
    input: activatePartyDelegationInput,
    scope: (input) => ({ type: 'party_delegation', id: input.party_delegation_id }),
    async execute({ input, actor, operationId, now, tx, audit }) {
      const id = input.party_delegation_id;
      const before = await deps.store.lockDelegation(tx, id);
      if (actor.kind !== 'user' || before === null || before.userId !== actor.userId) {
        throw new CommandRejection('ERR_PERMISSION');
      }
      requireState(delegationStatus(before, now) === 'pending');
      const after = await deps.store.activateDelegation(tx, id, now, operationId);
      const result = delegationResult(after);
      audit({
        objectType: 'party_delegation',
        objectId: id,
        before: delegationResult(before),
        after: result,
      });
      return result;
    },
  };
}
