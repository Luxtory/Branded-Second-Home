import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CommandRejection, isNonPersonalReference, type CommandHandler } from '@/features/platform';
import { MAX_PRL_NIGHTS, nightsOutsideKind, PRL_COMMAND, type PrlKind } from '../domain/prl';

const instant = z.iso.datetime({ offset: true });
const stayDate = z.iso.date();
/** Unidade mínima como string de inteiro positivo (TECH-033): nunca número em JSON. */
const amountMinor = z.string().regex(/^[1-9][0-9]{0,14}$/);

export const publishPrlInput = z
  .strictObject({
    second_home_id: z.uuid(),
    nights: z
      .array(z.strictObject({ stay_date: stayDate, amount_minor: amountMinor }))
      .min(1)
      .max(MAX_PRL_NIGHTS),
    /** Sem início: vale no instante da gravação, carimbado pelo banco. */
    effective_from: instant.nullable(),
    /** Base registrada (TECH-051): referência não pessoal a um registro verificável. */
    basis: z.string().trim().min(1).max(255).refine(isNonPersonalReference),
  })
  .refine(
    (input) => new Set(input.nights.map((night) => night.stay_date)).size === input.nights.length,
    { path: ['nights'], message: 'distinctNights' },
  );

export type PublishPrlInput = z.infer<typeof publishPrlInput>;

export type PublishPrlResult = {
  readonly publication_id: string;
  readonly second_home_id: string;
  readonly kind: PrlKind;
  readonly currency: 'BRL';
  readonly effective_from: string;
  readonly nights_count: number;
  readonly first_stay_date: string;
  readonly last_stay_date: string;
  readonly operation_id: string;
};

export interface PrlPublicationDraft {
  readonly id: string;
  readonly secondHomeId: string;
  readonly kind: PrlKind;
  readonly effectiveFrom: Date | null;
  readonly authority: 'admin' | 'super_admin';
  readonly authorizationRef: string;
  readonly createdBy: string;
  readonly operationId: string;
  readonly nights: readonly { readonly stayDate: string; readonly amountMinor: bigint }[];
}

export interface PrlStore<Tx> {
  secondHomeExists(tx: Tx, secondHomeId: string): Promise<boolean>;
  /** Trava exclusiva `app.prl:<Second Home>` (a mesma dos gatilhos). */
  lockScope(tx: Tx, secondHomeId: string): Promise<void>;
  /** Noites seladas entre as informadas (Data da Second Home, W10). */
  sealedNights(
    tx: Tx,
    secondHomeId: string,
    nights: readonly string[],
  ): Promise<ReadonlySet<string>>;
  /** Noites com alguma versão de PRL entre as informadas. */
  publishedNights(
    tx: Tx,
    secondHomeId: string,
    nights: readonly string[],
  ): Promise<ReadonlySet<string>>;
  /** Último início de vigência entre as noites informadas (`null` se nenhuma tem versão). */
  latestStart(tx: Tx, secondHomeId: string, nights: readonly string[]): Promise<Date | null>;
  /** Grava cabeçalho e noites; devolve o início efetivo (o do banco quando não informado). */
  insert(tx: Tx, draft: PrlPublicationDraft): Promise<Date>;
}

export interface PublishPrlDependencies<Tx> {
  readonly store: PrlStore<Tx>;
}

/** Papel aceito por tipo (TECH-051, BR-181): o guard e o gatilho do banco revalidam com a atribuição ativa. */
const ACCEPTED: Readonly<Record<PrlKind, readonly string[]>> = {
  initial: ['admin', 'super_admin'],
  change: ['super_admin'],
};

/**
 * `publish_initial_prl` e `change_published_prl` (REQ-013, REQ-052; TECH-030, TECH-051; ADR-0032; spec pricing §5).
 * Recusas funcionais saem antes da gravação, com o código do REQ-098; o banco revalida tudo nos gatilhos.
 */
export function createPublishPrlHandler<Tx>(
  kind: PrlKind,
  deps: PublishPrlDependencies<Tx>,
): CommandHandler<PublishPrlInput, PublishPrlResult, Tx> {
  return {
    command: PRL_COMMAND[kind],
    input: publishPrlInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx, actor } = context;
      if (actor.kind !== 'user' || !ACCEPTED[kind].includes(actor.role))
        throw new CommandRejection('ERR_PERMISSION');
      if (!(await deps.store.secondHomeExists(tx, input.second_home_id)))
        throw new CommandRejection('ERR_NOT_FOUND');
      for (const home of context.locks.claim('prl', [input.second_home_id]))
        await deps.store.lockScope(tx, home);

      const nights = input.nights.map((night) => night.stay_date).sort();
      const sealed = await deps.store.sealedNights(tx, input.second_home_id, nights);
      if (nights.some((night) => !sealed.has(night)))
        throw new CommandRejection('ERR_STATE_TRANSITION');
      const published = await deps.store.publishedNights(tx, input.second_home_id, nights);
      if (nightsOutsideKind(kind, nights, published).length > 0)
        throw new CommandRejection('ERR_STATE_TRANSITION');
      const requested = input.effective_from === null ? null : new Date(input.effective_from);
      if (requested !== null && requested.getTime() < context.now.getTime())
        throw new CommandRejection('ERR_STATE_TRANSITION');
      const latest =
        kind === 'change' ? await deps.store.latestStart(tx, input.second_home_id, nights) : null;
      if (latest !== null && (requested ?? context.now).getTime() <= latest.getTime())
        throw new CommandRejection('ERR_STATE_TRANSITION');

      const id = randomUUID();
      const effectiveFrom = await deps.store.insert(tx, {
        id,
        secondHomeId: input.second_home_id,
        kind,
        effectiveFrom: requested,
        authority: actor.role as 'admin' | 'super_admin',
        authorizationRef: input.basis,
        createdBy: actor.userId,
        operationId: context.operationId,
        nights: input.nights.map((night) => ({
          stayDate: night.stay_date,
          amountMinor: BigInt(night.amount_minor),
        })),
      });
      const first = nights[0]!;
      const last = nights.at(-1)!;
      context.audit({
        objectType: 'prl_publication',
        objectId: id,
        before: kind === 'change' ? { replaced_nights: nights.length } : null,
        after: {
          second_home_id: input.second_home_id,
          kind,
          currency: 'BRL',
          effective_from: effectiveFrom.toISOString(),
          nights_count: nights.length,
          first_stay_date: first,
          last_stay_date: last,
          basis: input.basis,
        },
      });
      return {
        publication_id: id,
        second_home_id: input.second_home_id,
        kind,
        currency: 'BRL',
        effective_from: effectiveFrom.toISOString(),
        nights_count: nights.length,
        first_stay_date: first,
        last_stay_date: last,
        operation_id: context.operationId,
      };
    },
  };
}
