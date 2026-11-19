import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CommandRejection,
  isNonPersonalReference,
  type Actor,
  type CommandHandler,
} from '@/features/platform';
import {
  GUEST_RULES_MAX_LENGTH,
  PARAMETER_KEYS,
  successorConflict,
  type ParameterKey,
  type ParameterVersion,
} from '../domain/parameter';

const instant = z.iso.datetime({ offset: true });

export const setParameterInput = z
  .strictObject({
    second_home_id: z.uuid(),
    key: z.enum(PARAMETER_KEYS),
    value: z.string().trim().min(1).max(GUEST_RULES_MAX_LENGTH),
    /** Sem início: vale no instante da gravação, carimbado pelo banco. */
    effective_from: instant.nullable(),
    effective_to: instant.nullable(),
    /** Base registrada (TECH-051): referência não pessoal a um registro verificável. */
    basis: z.string().trim().min(1).max(255).refine(isNonPersonalReference),
  })
  .refine(
    (input) =>
      input.effective_to === null ||
      input.effective_from === null ||
      new Date(input.effective_to).getTime() > new Date(input.effective_from).getTime(),
    { path: ['effective_to'], message: 'effectiveToAfterStart' },
  );

export type SetParameterInput = z.infer<typeof setParameterInput>;

export type SetParameterResult = {
  readonly parameter_id: string;
  readonly key: ParameterKey;
  readonly effective_from: string;
  readonly effective_to: string | null;
};

export interface ParameterDraft {
  readonly id: string;
  readonly key: ParameterKey;
  readonly secondHomeId: string;
  readonly value: string;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly authority: string;
  readonly authorizationRef: string;
  readonly createdBy: string;
  readonly operationId: string;
}

export interface ParameterStore<Tx> {
  secondHomeExists(tx: Tx, secondHomeId: string): Promise<boolean>;
  /** Trava exclusiva do escopo (`app.parameter:<chave>:<Second Home>`, a mesma do gatilho). */
  lockScope(tx: Tx, key: ParameterKey, secondHomeId: string): Promise<void>;
  latest(tx: Tx, key: ParameterKey, secondHomeId: string): Promise<ParameterVersion | null>;
  /** Grava a versão; devolve o início efetivo (o do banco quando o início não foi informado). */
  insert(tx: Tx, draft: ParameterDraft): Promise<Date>;
}

export interface SetParameterDependencies<Tx> {
  readonly store: ParameterStore<Tx>;
  assertAdmin(tx: Tx, actor: Actor, authorizationRef: string): Promise<void>;
}

/**
 * `set_parameter` (REQ-095; TECH-030, TECH-051, TECH-052; ADR-0030 §3; spec admin §13): Admin + base registrada.
 * Autoridade e autor vêm do guard; a vigência segue D3 (só por inserção, sem antecipar término explícito). O banco
 * revalida tudo no gatilho; aqui as recusas funcionais saem antes, com o código do REQ-098.
 */
export function createSetParameterHandler<Tx>(
  deps: SetParameterDependencies<Tx>,
): CommandHandler<SetParameterInput, SetParameterResult, Tx> {
  return {
    command: 'set_parameter',
    input: setParameterInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx, actor } = context;
      await deps.assertAdmin(tx, actor, context.authorizationRef);
      if (actor.kind !== 'user') throw new CommandRejection('ERR_PERMISSION');
      if (!(await deps.store.secondHomeExists(tx, input.second_home_id)))
        throw new CommandRejection('ERR_NOT_FOUND');
      for (const [key, home] of context.locks.claim('parameter', [
        [input.key, input.second_home_id],
      ]))
        await deps.store.lockScope(tx, key as ParameterKey, home!);
      const latest = await deps.store.latest(tx, input.key, input.second_home_id);
      const requested = input.effective_from === null ? null : new Date(input.effective_from);
      const effectiveTo = input.effective_to === null ? null : new Date(input.effective_to);
      if (successorConflict(latest, requested ?? context.now, context.now) !== null)
        throw new CommandRejection('ERR_STATE_TRANSITION');
      if (
        requested === null &&
        effectiveTo !== null &&
        effectiveTo.getTime() <= context.now.getTime()
      )
        throw new CommandRejection('ERR_VALIDATION');
      const id = randomUUID();
      const effectiveFrom = await deps.store.insert(tx, {
        id,
        key: input.key,
        secondHomeId: input.second_home_id,
        value: input.value,
        effectiveFrom: requested,
        effectiveTo,
        authority: actor.role,
        authorizationRef: input.basis,
        createdBy: actor.userId,
        operationId: context.operationId,
      });
      context.audit({
        objectType: 'parameter',
        objectId: id,
        before: latest === null ? null : { parameter_id: latest.id },
        after: {
          key: input.key,
          second_home_id: input.second_home_id,
          effective_from: effectiveFrom.toISOString(),
          effective_to: effectiveTo?.toISOString() ?? null,
          value_length: input.value.length,
          basis: input.basis,
        },
      });
      return {
        parameter_id: id,
        key: input.key,
        effective_from: effectiveFrom.toISOString(),
        effective_to: effectiveTo?.toISOString() ?? null,
      };
    },
  };
}
