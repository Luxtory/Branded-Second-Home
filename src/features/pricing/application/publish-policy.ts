import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CommandRejection,
  isNonPersonalReference,
  type Actor,
  type CommandHandler,
  type JsonValue,
} from '@/features/platform';
import {
  POLICY_MECHANISMS,
  POLICY_SCHEMA_VERSION,
  validatePolicyConfig,
  type PolicyConfig,
  type PolicyMechanism,
} from '../domain/commercial-policy';
import { policyVigencyConflict, type PolicyVersion } from '../domain/policy-vigency';

const instant = z.iso.datetime({ offset: true });
const effects = z.record(z.string().max(16), z.string().max(32));

/** Forma do documento (Zod); as regras do REQ-104 ficam em `validatePolicyConfig` e no CHECK do banco. */
const policyConfig = z.strictObject({
  cancellation: z
    .array(z.strictObject({ min_notice_hours: z.number().int(), effects }))
    .min(1)
    .max(5),
  no_show: effects,
  exception: effects,
});

export const publishPolicyInput = z
  .strictObject({
    mechanism: z.enum(POLICY_MECHANISMS),
    config: policyConfig,
    /** Sem início: vale no instante da gravação, carimbado pelo banco. */
    effective_from: instant.nullable(),
    effective_to: instant.nullable(),
    /** Base registrada (TECH-051): referência não pessoal a um registro verificável. */
    basis: z.string().trim().min(1).max(255).refine(isNonPersonalReference),
  })
  .refine((input) => validatePolicyConfig(input.mechanism, input.config).length === 0, {
    path: ['config'],
    message: 'policyRules',
  })
  .refine(
    (input) =>
      input.effective_to === null ||
      input.effective_from === null ||
      Date.parse(input.effective_to) > Date.parse(input.effective_from),
    { path: ['effective_to'], message: 'effectiveToAfterStart' },
  );

export type PublishPolicyInput = z.infer<typeof publishPolicyInput>;

export type PublishPolicyResult = {
  readonly policy_id: string;
  readonly mechanism: PolicyMechanism;
  readonly schema_version: number;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly operation_id: string;
};

export interface PolicyDraft {
  readonly id: string;
  readonly mechanism: PolicyMechanism;
  readonly config: PolicyConfig;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly authority: string;
  readonly authorizationRef: string;
  readonly createdBy: string;
  readonly operationId: string;
}

export interface PolicyStore<Tx> {
  /** Trava exclusiva `app.commercial_policy:<mecanismo>` (a mesma do gatilho). */
  lockMechanism(tx: Tx, mechanism: PolicyMechanism): Promise<void>;
  latest(tx: Tx, mechanism: PolicyMechanism): Promise<PolicyVersion | null>;
  /** Grava a versão; devolve o início efetivo (o do banco quando o início não foi informado). */
  insert(tx: Tx, draft: PolicyDraft): Promise<Date>;
}

export interface PublishPolicyDependencies<Tx> {
  readonly store: PolicyStore<Tx>;
  assertAdmin(tx: Tx, actor: Actor, authorizationRef: string): Promise<void>;
}

/**
 * `publish_policy` (TECH-032, TECH-051; PD-009, REQ-104; ADR-0034 §3): Admin + base registrada. Autoridade e autor vêm
 * do guard; a vigência segue a do `app.parameter` (só por inserção, sem retroatividade nem sobreposição). O esquema é
 * validado na entrada e o banco revalida tudo no CHECK e no gatilho. Publicar não ativa mecanismo.
 */
export function createPublishPolicyHandler<Tx>(
  deps: PublishPolicyDependencies<Tx>,
): CommandHandler<PublishPolicyInput, PublishPolicyResult, Tx> {
  return {
    command: 'publish_policy',
    input: publishPolicyInput,
    secondHomeId: () => null,
    scope: (input) => ({ type: 'commercial_policy', id: input.mechanism }),
    async execute(context) {
      const { input, tx, actor } = context;
      await deps.assertAdmin(tx, actor, context.authorizationRef);
      if (actor.kind !== 'user') throw new CommandRejection('ERR_PERMISSION');
      for (const [key] of context.locks.claim('commercial_policy', [input.mechanism]))
        await deps.store.lockMechanism(tx, key as PolicyMechanism);
      const latest = await deps.store.latest(tx, input.mechanism);
      const requested = input.effective_from === null ? null : new Date(input.effective_from);
      const effectiveTo = input.effective_to === null ? null : new Date(input.effective_to);
      if (policyVigencyConflict(latest, requested ?? context.now, context.now) !== null)
        throw new CommandRejection('ERR_STATE_TRANSITION');
      if (effectiveTo !== null && effectiveTo.getTime() <= (requested ?? context.now).getTime())
        throw new CommandRejection('ERR_VALIDATION');
      const id = randomUUID();
      const config = input.config as PolicyConfig;
      const effectiveFrom = await deps.store.insert(tx, {
        id,
        mechanism: input.mechanism,
        config,
        effectiveFrom: requested,
        effectiveTo,
        authority: actor.role,
        authorizationRef: input.basis,
        createdBy: actor.userId,
        operationId: context.operationId,
      });
      context.audit({
        objectType: 'commercial_policy',
        objectId: id,
        before: latest === null ? null : { policy_id: latest.id },
        after: {
          mechanism: input.mechanism,
          schema_version: POLICY_SCHEMA_VERSION,
          // Configuração comercial, não pessoal (T-1805).
          config: input.config as JsonValue,
          effective_from: effectiveFrom.toISOString(),
          effective_to: effectiveTo?.toISOString() ?? null,
          basis: input.basis,
        },
      });
      return {
        policy_id: id,
        mechanism: input.mechanism,
        schema_version: POLICY_SCHEMA_VERSION,
        effective_from: effectiveFrom.toISOString(),
        effective_to: effectiveTo?.toISOString() ?? null,
        operation_id: context.operationId,
      };
    },
  };
}
