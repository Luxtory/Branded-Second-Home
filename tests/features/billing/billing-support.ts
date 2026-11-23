import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  chargeLuxchangeFee,
  createFakePaymentGateway,
  createPostgresBillingStore,
  initiatePayment,
  recordFeeSettlement,
  reverseLuxchangeFee,
  type FakePaymentGateway,
} from '@/features/billing';
import {
  CommandRejection,
  type CommandHandler,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  recordEconomicSnapshot,
  resolveEconomicTerms,
} from '@/features/pricing';
import { captureLogger } from '../../support/capture-logger';
import { activate, asOperation } from '../booking/lifecycle-support';
import {
  creditsHarness,
  secondTitular,
  titularExecutor,
  type CreditTitular,
  type CreditsHarness,
} from '../credits/credits-support';

/**
 * W19 — fixtures do billing (ADR-0035). Valores de teste parametrizados por cenário: o percentual de referência atual
 * (12%) aparece onde a regra comercial é provada; os demais cenários usam valores deliberadamente diferentes.
 */
export const WEBHOOK_SECRET = 'w19-db-test-webhook-secret-0123456789abcdef';

export interface BillingHarness {
  readonly c: CreditsHarness;
  readonly titular: CreditTitular;
  readonly store: ReturnType<typeof createPostgresBillingStore>;
  readonly gateway: FakePaymentGateway;
  readonly log: ReturnType<typeof captureLogger>;
}

/** `set_parameter` global confirmado (Admin), vigência imediata carimbada pelo banco. */
export async function publishParameter(
  c: CreditsHarness,
  key: 'luxchange_fee_rate' | 'luxchange_fee_minimum',
  value: string,
): Promise<string> {
  return asOperation(
    c.h.database.appUrl,
    'set_parameter',
    { kind: 'admin', admin: c.admin },
    async (client, op) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO app.parameter (id, key, second_home_id, value, currency, effective_from, effective_to, authority,
         authorization_ref, created_at, created_by, operation_id)
       VALUES ($1, $2, NULL, $3, $4, NULL, NULL, 'admin', 'Ata Luxtory W19', now(), $5, $6)`,
        [id, key, value, key === 'luxchange_fee_minimum' ? 'BRL' : null, c.admin.userId, op],
      );
      return id;
    },
  );
}

/** Titular com Membership, percentual e mínimo publicados e a K5 ligada (o dono do schema ativa). */
export async function billingHarness(
  options: {
    rate?: string;
    minimum?: string;
    activated?: boolean;
    gateway?: FakePaymentGateway;
  } = {},
): Promise<BillingHarness> {
  const c = await creditsHarness({ validityMonths: null, activated: false });
  await publishParameter(c, 'luxchange_fee_rate', options.rate ?? '0.12');
  await publishParameter(c, 'luxchange_fee_minimum', options.minimum ?? '9876');
  if (options.activated !== false) await activate(c.h, 'payments');
  return {
    c,
    titular: c.titular,
    store: createPostgresBillingStore(c.h.db),
    gateway: options.gateway ?? createFakePaymentGateway({ webhookSecret: WEBHOOK_SECRET }),
    log: captureLogger(),
  };
}

export { secondTitular };

/** Pagamento do Fee pela party do Titular, cobrado no fake. */
export function pay(
  b: BillingHarness,
  amountMinor: bigint,
  titular: CreditTitular = b.titular,
  key = randomUUID(),
) {
  return initiatePayment(
    { store: b.store, gateway: b.gateway, log: b.log.logger },
    {
      actorUserId: titular.userId,
      payerPartyId: titular.partyId,
      purpose: 'luxchange_fee',
      amountMinor,
      currency: 'BRL',
      idempotencyKey: key,
    },
  );
}

type Tx = DatabaseTransaction;
const homeScope = z.strictObject({ second_home_id: z.uuid() });
const feeInput = homeScope.extend({
  payment_id: z.uuid(),
  prl_total_minor: z.string(),
  fail_after_charge: z.boolean().optional(),
});
const feeChargeInput = homeScope.extend({ fee_charge_id: z.uuid() });

type FeeResult = { readonly fee_charge_id: string; readonly amount_minor: string };

function scoped<I extends { second_home_id: string }, R extends FeeResult | Record<string, string>>(
  command: string,
  input: z.ZodType<I>,
  body: CommandHandler<I, R, Tx>['execute'],
): CommandHandler<I, R, Tx> {
  return {
    command,
    input,
    secondHomeId: (value) => value.second_home_id,
    scope: (value) => ({ type: 'second_home', id: value.second_home_id }),
    async execute(context) {
      context.audit({ objectType: 'billing_test', objectId: command, before: null, after: null });
      return body(context);
    },
  };
}

/**
 * Handler de teste com o command consumidor (W21 `send_request`, W23 `create_direct`): resolve percentual e mínimo
 * vigentes, usa o PRL total do período informado (as noites chegam com a W20), grava o snapshot e vincula o pagamento.
 * `fail_after_charge` simula a recusa do domínio depois do vínculo (ROLLBACK de tudo).
 */
export function feeHandler(
  b: BillingHarness,
  command: 'send_request' | 'create_direct',
  settleInSameOperation = false,
) {
  return scoped<z.infer<typeof feeInput>, FeeResult>(
    command,
    feeInput,
    async ({ input, tx, locks, operationId, actor, requireEligibleMembership }) => {
      const party = (actor as { actingPartyId: string }).actingPartyId;
      await requireEligibleMembership([party]);
      const resolved = await resolveEconomicTerms(tx, locks, createPostgresEconomicTermsStore(), {
        parameters: ['luxchange_fee_minimum', 'luxchange_fee_rate'],
      });
      await recordEconomicSnapshot(tx, operationId, resolved);
      const terms = {
        ...resolved,
        prlTotal: { amountMinor: input.prl_total_minor, currency: 'BRL' as const },
      };
      const context = { tx, locks, operationId };
      const fee = await chargeLuxchangeFee(
        context,
        { store: b.store },
        {
          paymentId: input.payment_id,
          payerPartyId: party,
          terms,
        },
      );
      if (settleInSameOperation)
        await recordFeeSettlement(context, { store: b.store }, { feeChargeId: fee.feeChargeId });
      if (input.fail_after_charge === true) throw new CommandRejection('ERR_CAPACITY_UNAVAILABLE');
      return { fee_charge_id: fee.feeChargeId, amount_minor: fee.amountMinor.toString() };
    },
  );
}

/** Desfecho pré-aceite (W21/W22): reversão integral do Fee. */
export function reversalHandler(b: BillingHarness, command: 'withdraw_request' | 'reject_request') {
  return scoped<z.infer<typeof feeChargeInput>, { refund_id: string }>(
    command,
    feeChargeInput,
    async ({ input, tx, locks, operationId }) => {
      const { refundId } = await reverseLuxchangeFee(
        { tx, locks, operationId },
        { store: b.store },
        {
          feeChargeId: input.fee_charge_id,
        },
      );
      return { refund_id: refundId };
    },
  );
}

/** Aceite (W22): apuração do Fee como receita Luxtory. */
export function settleHandler(b: BillingHarness) {
  return scoped<z.infer<typeof feeChargeInput>, { settlement_id: string }>(
    'accept_request',
    feeChargeInput,
    async ({ input, tx, locks, operationId, actor, requireEligibleMembership }) => {
      await requireEligibleMembership([(actor as { actingPartyId: string }).actingPartyId]);
      const { settlementId } = await recordFeeSettlement(
        { tx, locks, operationId },
        { store: b.store },
        {
          feeChargeId: input.fee_charge_id,
        },
      );
      return { settlement_id: settlementId };
    },
  );
}

export const executorFor = titularExecutor;

/** Contagem das tabelas de capacidade e Créditos (ADR-008: pagamento não toca custódia, ocupação nem Créditos). */
export async function capacityFootprint(b: BillingHarness) {
  const { rows } = await b.c.h.database.pool.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM app.date_custody)::text AS custody,
            (SELECT count(*) FROM app.date_occupancy)::text AS occupancy,
            (SELECT count(*) FROM app.credit_lot)::text AS lots,
            (SELECT count(*) FROM app.credit_entry)::text AS entries,
            (SELECT count(*) FROM app.booking)::text AS bookings`,
  );
  return rows[0]!;
}
