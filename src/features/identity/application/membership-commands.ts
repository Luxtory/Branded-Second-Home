import { z } from 'zod';
import {
  CommandRejection,
  isNonPersonalReference,
  type CommandContext,
  type CommandHandler,
} from '@/features/platform';
import {
  MEMBERSHIP_STATE_CHANGED,
  membershipTransition,
  type MembershipChange,
  type MembershipState,
} from '../domain/membership';
import { isStaffRole } from '../domain/staff';
import type { MembershipRecord, MembershipStore } from './membership-ports';

const BASIS_MAX = 255;

/**
 * Entrada das quatro operações: a party e a base registrada (TECH-051), sem forma de identificador pessoal (e-mail, CPF,
 * CNPJ, telefone) — a mesma regra das bases dos atos Admin da W13.
 */
export const membershipChangeInput = z.strictObject({
  party_id: z.uuid(),
  basis: z.string().trim().min(1).max(BASIS_MAX).refine(isNonPersonalReference),
});
export type MembershipChangeInput = z.infer<typeof membershipChangeInput>;

export function membershipResult(record: MembershipRecord) {
  return {
    id: record.id,
    party_id: record.partyId,
    state: record.state,
    basis: record.basis,
    changed_at: record.changedAt.toISOString(),
    operation_id: record.operationId,
    created_at: record.createdAt.toISOString(),
  };
}
export type MembershipResult = ReturnType<typeof membershipResult>;

export interface MembershipCommandDependencies<Tx> {
  readonly store: MembershipStore<Tx>;
  readonly newId: () => string;
}

/** Só ids e estados na auditoria (TECH-092): a base fica na linha e no histórico, não no antes/depois. */
const audited = (record: MembershipRecord) => ({
  id: record.id,
  party_id: record.partyId,
  state: record.state,
  operation_id: record.operationId,
});

function requireStaff(
  context: CommandContext<MembershipChangeInput, unknown>,
  command: string,
): void {
  const { actor } = context;
  if (actor.kind !== 'user' || !isStaffRole(actor.role))
    throw new Error(`${command} reached the handler without a staff actor`);
}

/** Registra auditoria e evento da mudança gravada (uma transição por operação: dedup pela operação). */
function record<Tx>(
  context: CommandContext<MembershipChangeInput, Tx>,
  before: MembershipRecord | null,
  after: MembershipRecord,
): MembershipResult {
  context.audit({
    objectType: 'membership',
    objectId: after.id,
    before: before === null ? null : audited(before),
    after: audited(after),
  });
  context.emit({
    type: MEMBERSHIP_STATE_CHANGED,
    dedupKey: `${MEMBERSHIP_STATE_CHANGED}:${context.operationId}`,
    payload: {
      membership_id: after.id,
      recipient_party_id: after.partyId,
      from_state: before?.state ?? null,
      to_state: after.state,
      changed_at: after.changedAt.toISOString(),
    },
  });
  return membershipResult(after);
}

/**
 * `activate_membership` (W15, ADR-0031): ∅ → `active`. Party inexistente → `ERR_NOT_FOUND`; Membership já existente, em
 * qualquer estado → `ERR_STATE_TRANSITION` (a corrida cai em `conflict_membership_party`, mesmo código); party sem holding
 * vigente → `ERR_STATE_TRANSITION` pelo banco (D2).
 */
export function activateMembershipHandler<Tx>(
  deps: MembershipCommandDependencies<Tx>,
): CommandHandler<MembershipChangeInput, MembershipResult, Tx> {
  return {
    command: 'activate_membership',
    input: membershipChangeInput,
    async execute(context) {
      requireStaff(context, 'activate_membership');
      const { input, tx, locks, operationId } = context;
      if (!(await deps.store.partyExists(tx, input.party_id)))
        throw new CommandRejection('ERR_NOT_FOUND');
      for (const key of locks.claim('membership', [input.party_id]))
        if ((await deps.store.lockMembership(tx, key)) !== null)
          throw new CommandRejection('ERR_STATE_TRANSITION');
      const after = await deps.store.insertMembership(tx, {
        id: deps.newId(),
        partyId: input.party_id,
        basis: input.basis,
        operationId,
      });
      return record(context, null, after);
    },
  };
}

/** Mudança sobre Membership existente pela TECH-055; o banco repete a conferência (`conflict_membership_transition`). */
function changeHandler<Tx>(
  command: 'suspend_membership' | 'reactivate_membership' | 'end_membership',
  change: MembershipChange,
  deps: MembershipCommandDependencies<Tx>,
): CommandHandler<MembershipChangeInput, MembershipResult, Tx> {
  return {
    command,
    input: membershipChangeInput,
    async execute(context) {
      requireStaff(context, command);
      const { input, tx, locks, operationId } = context;
      let before: MembershipRecord | null = null;
      for (const key of locks.claim('membership', [input.party_id]))
        before = await deps.store.lockMembership(tx, key);
      if (before === null) throw new CommandRejection('ERR_NOT_FOUND');
      const target: MembershipState | null = membershipTransition(before.state, change);
      if (target === null) throw new CommandRejection('ERR_STATE_TRANSITION');
      const after = await deps.store.changeMembership(tx, {
        partyId: input.party_id,
        state: target,
        basis: input.basis,
        operationId,
      });
      return record(context, before, after);
    },
  };
}

/** `suspend_membership`: `active` → `suspended`; efeito prospectivo (BR-320, BR-321). */
export const suspendMembershipHandler = <Tx>(deps: MembershipCommandDependencies<Tx>) =>
  changeHandler('suspend_membership', 'suspend', deps);

/** `reactivate_membership`: `suspended` | `ended` → `active`, no mesmo Membership; holding vigente exigida (D2). */
export const reactivateMembershipHandler = <Tx>(deps: MembershipCommandDependencies<Tx>) =>
  changeHandler('reactivate_membership', 'reactivate', deps);

/** `end_membership`: `active` | `suspended` → `ended`; a não renovação pode ser a base (D3). */
export const endMembershipHandler = <Tx>(deps: MembershipCommandDependencies<Tx>) =>
  changeHandler('end_membership', 'end', deps);
