import { randomUUID } from 'node:crypto';
import { CompiledQuery } from 'kysely';
import type pg from 'pg';
import {
  createFakePaymentGateway,
  createPostgresBillingStore,
  initiatePayment,
} from '@/features/billing';
import { createPolicyHandlers } from '@/features/pricing/policies';
import { createPrlHandlers } from '@/features/pricing/prl';
import { addDays, bookableStart } from '../booking/booking-support';
import {
  activate,
  asOperation,
  connect,
  openOperation,
  type OperationActor,
} from '../booking/lifecycle-support';
import type { DatabaseTransaction } from '@/features/platform';
import { publishParameter, WEBHOOK_SECRET } from '../billing/billing-support';
import {
  TEST_VALIDITY_MONTHS,
  insertEntry,
  publishValidity,
  secondTitular,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { staffRunner, type Staff } from '../pricing/pricing-support';
import { TEST_POLICIES } from '../pricing/policy-fixtures';
import { captureLogger } from '../../support/capture-logger';
import { openDepositOperation, publishMultiplier } from './luxchange-support';

/**
 * W21 — fixtures da Request (ADR-0037; TECH-073). Gravam, pelo papel da aplicação e na operação `pending` do command, o
 * que o envio grava: snapshot só com as noites solicitadas, os cinco parâmetros e a política; Request, noites com a
 * custódia do detentor, complemento por datas, Fee pago, Garantia e o consentimento. Os valores (`N`, `P`, Créditos de
 * cada noite) vêm do PRL publicado e do multiplicador vigentes, lidos do banco como o resolvedor `EconomicTerms` faz; o
 * banco confere tudo no COMMIT. Prazo de teste deliberadamente fora do canônico.
 */
type Queryable = Pick<pg.Client | pg.Pool, 'query'>;

export const TEST_DEADLINE_HOURS = '30';
export const CONSENT_VERSION = 'request-consent.v1';

export interface RequestFixture {
  readonly c: CreditsHarness;
  /** Owner da Second Home solicitada, com Membership ativo (outra party, outro usuário). */
  readonly holder: CreditTitular;
  readonly multiplier: string;
  readonly store: ReturnType<typeof createPostgresBillingStore>;
  readonly gateway: ReturnType<typeof createFakePaymentGateway>;
  readonly log: ReturnType<typeof captureLogger>;
  /** Próximas `count` noites livres (nunca reutilizadas) a partir do primeiro dia com folga de depósito. */
  freshNights(count?: number): string[];
}

async function inForce(db: Queryable, sql: string, params: unknown[]): Promise<string | null> {
  const { rows } = await db.query<{ value: string | null }>(sql, params);
  return rows[0]?.value ?? null;
}

const parameterNow = (db: Queryable, key: string) =>
  inForce(db, `SELECT (SELECT v.value FROM app.parameter_at($1, NULL, now()) v) AS value`, [key]);

/** As escritas da fixture dentro da transação do executor (handlers de teste que compõem com o slice). */
export function transactionQueryable(tx: DatabaseTransaction): Queryable {
  return {
    query: (async (text: string, params: unknown[] = []) => {
      const { rows } = await tx.executeQuery(CompiledQuery.raw(text, params));
      return { rows };
    }) as unknown as Queryable['query'],
  };
}

/** `set_parameter` global de `request_deadline_hours`, confirmado. */
export async function publishDeadline(c: CreditsHarness, hours: string): Promise<void> {
  await asOperation(
    c.h.database.appUrl,
    'set_parameter',
    { kind: 'admin', admin: c.admin },
    (client, op) =>
      client.query(
        `INSERT INTO app.parameter (id, key, second_home_id, value, currency, effective_from, effective_to, authority,
         authorization_ref, created_at, created_by, operation_id)
       VALUES ($1, 'request_deadline_hours', NULL, $2, NULL, NULL, NULL, 'admin', 'Ata Luxtory W21', now(), $3, $4)`,
        [randomUUID(), hours, c.admin.userId, op],
      ),
  );
}

/**
 * Prepara o envio sobre um harness dos Créditos: K4, K5 e K7; validade, multiplicador, percentual e mínimo do Fee, prazo
 * e política `luxchange_request` vigentes (publica só o que faltar); detentor com Membership ativo.
 */
export async function requestFixture(
  c: CreditsHarness,
  options: { holder?: CreditTitular; deadlineHours?: string } = {},
): Promise<RequestFixture> {
  const pool = c.h.database.pool;
  await activate(c.h, 'credits', 'payments', 'luxchange_exchange');
  if ((await parameterNow(pool, 'credit_validity_months')) === null)
    await publishValidity(c.h, c.admin, TEST_VALIDITY_MONTHS);
  if ((await parameterNow(pool, 'credit_multiplier')) === null) await publishMultiplier(c, '10');
  if ((await parameterNow(pool, 'luxchange_fee_rate')) === null)
    await publishParameter(c, 'luxchange_fee_rate', '0.12');
  if ((await parameterNow(pool, 'luxchange_fee_minimum')) === null)
    await publishParameter(c, 'luxchange_fee_minimum', '9876');
  if (
    options.deadlineHours !== undefined ||
    (await parameterNow(pool, 'request_deadline_hours')) === null
  )
    await publishDeadline(c, options.deadlineHours ?? TEST_DEADLINE_HOURS);
  const policy = await inForce(
    pool,
    `SELECT (SELECT p.id::text FROM app.commercial_policy_at('luxchange_request', now()) p) AS value`,
    [],
  );
  if (policy === null) await publishRequestPolicy(c);
  const holder = options.holder ?? (await secondTitular(c));
  const multiplier = (await parameterNow(pool, 'credit_multiplier'))!;
  let offset = 0;
  return {
    c,
    holder,
    multiplier,
    store: createPostgresBillingStore(c.h.db),
    gateway: createFakePaymentGateway({ webhookSecret: WEBHOOK_SECRET }),
    log: captureLogger(),
    freshNights(count = 1) {
      const first = addDays(bookableStart().first, 30 + offset);
      offset += count + 1;
      return Array.from({ length: count }, (_, index) => addDays(first, index));
    },
  };
}

const adminStaff = (c: CreditsHarness): Staff => ({ ...c.admin, role: 'admin' }) as Staff;

/** Política `luxchange_request` de teste (Admin), pelo command real da W18. */
export async function publishRequestPolicy(c: CreditsHarness): Promise<void> {
  const outcome = await staffRunner(c.h).as(adminStaff(c), createPolicyHandlers().publishPolicy, {
    mechanism: 'luxchange_request',
    config: TEST_POLICIES.luxchange_request,
    effective_from: null,
    effective_to: null,
    basis: 'Ata Luxtory W21 (teste)',
  });
  if (outcome.status !== 'committed') throw new Error(`policy fixture: ${JSON.stringify(outcome)}`);
}

/** PRL inicial (Admin) das noites, em unidade mínima, pelo command real da W16. */
export async function publishNights(
  c: CreditsHarness,
  homeId: string,
  nights: Readonly<Record<string, bigint>>,
): Promise<void> {
  const outcome = await staffRunner(c.h).as(adminStaff(c), createPrlHandlers().publishInitialPrl, {
    second_home_id: homeId,
    nights: Object.entries(nights).map(([stay_date, amount]) => ({
      stay_date,
      amount_minor: amount.toString(),
    })),
    effective_from: null,
    basis: 'Ata Luxtory W21',
  });
  if (outcome.status !== 'committed') throw new Error(`PRL fixture: ${JSON.stringify(outcome)}`);
}

/** Noites novas da Second Home com o PRL informado (unidade mínima), publicado agora. */
export async function pricedNights(
  f: RequestFixture,
  amounts: readonly bigint[],
  homeId: string = f.holder.homeId,
): Promise<string[]> {
  const nights = f.freshNights(amounts.length);
  await publishNights(
    f.c,
    homeId,
    Object.fromEntries(nights.map((night, i) => [night, amounts[i]!])),
  );
  return nights;
}

/** PRL (unidade mínima) de uma noite que vale `credits` Créditos pelo multiplicador vigente. */
export function prlForCredits(f: RequestFixture, credits: string): bigint {
  const [whole, fraction = ''] = credits.split('.');
  const scaled = BigInt(`${whole}${fraction.padEnd(2, '0')}`); // Créditos × 100
  const multiplier = BigInt(f.multiplier);
  if (fraction.length > 2 || scaled % multiplier !== 0n)
    throw new Error(
      `fixture: ${credits} Créditos não é PRL inteiro com multiplicador ${f.multiplier}`,
    );
  return scaled / multiplier;
}

/** Fee calculado como o banco calcula agora (HALF_UP do percentual, mínimo por operação). */
export async function feeFor(f: RequestFixture, prlTotalMinor: bigint): Promise<bigint> {
  const value = await inForce(
    f.c.h.database.pool,
    `SELECT greatest(round($1::numeric * (SELECT v.value FROM app.parameter_at('luxchange_fee_rate', NULL, now()) v)::numeric),
                     (SELECT v.value FROM app.parameter_at('luxchange_fee_minimum', NULL, now()) v)::bigint)::text AS value`,
    [prlTotalMinor.toString()],
  );
  return BigInt(value!);
}

/** Pagamento aprovado do Fee pela party solicitante, no fake. */
export async function payFee(
  f: RequestFixture,
  amountMinor: bigint,
  requester: CreditTitular = f.c.titular,
): Promise<string> {
  const payment = await initiatePayment(
    { store: f.store, gateway: f.gateway, log: f.log.logger },
    {
      actorUserId: requester.userId,
      payerPartyId: requester.partyId,
      purpose: 'luxchange_fee',
      amountMinor,
      currency: 'BRL',
      idempotencyKey: randomUUID(),
    },
  );
  if (payment.state !== 'approved') throw new Error(`fee payment fixture: ${payment.state}`);
  return payment.id;
}

export interface ComplementUnitSpec {
  readonly kind: 'owner_night' | 'co_owner_booking';
  readonly holdingId: string;
  readonly homeId: string;
  readonly nights: readonly string[];
  readonly bookingId?: string;
}

export interface HoldSpec {
  readonly lotId: string;
  readonly quantity: string;
}

export interface RequestSpec {
  readonly requester?: CreditTitular;
  readonly holder?: CreditTitular;
  /** Noites solicitadas (contíguas, PRL publicado) da Second Home do detentor. */
  readonly nights: readonly string[];
  /** Reserva Co-Owner do detentor, quando a capacidade solicitada é uma reserva. */
  readonly holderBookingId?: string;
  readonly holds: readonly HoldSpec[];
  readonly complement?: readonly ComplementUnitSpec[];
  readonly paymentId?: string;
  /**
   * Fato histórico (só fixture do dono do schema, com o gatilho de abertura desligado na transação, como as reservas
   * históricas da W13): `sent_at` informado e `expires_at = sent_at + prazo do snapshot`; a completude no COMMIT vale.
   */
  readonly historicalSentAt?: Date;
  /** Requests do mesmo solicitante que não podem mais ser aceitas, encerradas nesta transação antes do novo compromisso. */
  readonly materialize?: readonly SentRequest[];
  /** Desvios deliberados (testes de recusa): cada um troca só o valor indicado. */
  readonly tamper?: {
    readonly creditsRequired?: string;
    readonly complementCredits?: string;
    readonly guaranteeCredits?: string;
    /** Créditos potenciais gravados em cada noite do complemento (o total da unidade segue a soma). */
    readonly nightCredits?: string;
    /** PRL total informado no Fee (o pagamento acompanha o Fee calculado sobre ele). */
    readonly prlTotalMinor?: bigint;
    readonly terms?: (terms: Record<string, unknown>) => Record<string, unknown>;
    readonly skip?: readonly ('consent' | 'fee' | 'policy' | 'nights' | 'holds')[];
  };
}

export interface SentRequest {
  readonly requestId: string;
  readonly operationId: string;
  readonly holdIds: readonly string[];
  readonly feeChargeId: string | null;
  readonly paymentId: string;
  readonly unitIds: readonly string[];
}

const PARAMETERS = [
  'credit_multiplier',
  'credit_validity_months',
  'luxchange_fee_rate',
  'luxchange_fee_minimum',
  'request_deadline_hours',
] as const;

async function scalar(client: Queryable, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await client.query<{ value: string }>(sql, params);
  return rows[0]!.value;
}

/** Créditos exatos (texto canônico) de PRL × multiplicador do snapshot da operação. */
const creditsOf = (client: Queryable, op: string, amountsSql: string, params: unknown[]) =>
  scalar(
    client,
    `SELECT trim_scale(coalesce((${amountsSql}), 0)::numeric
              * (SELECT p.value FROM app.economic_snapshot_parameter sp JOIN app.parameter p ON p.id = sp.parameter_id
                  WHERE sp.operation_id = $1 AND sp.parameter_key = 'credit_multiplier')::numeric / 100)::text AS value`,
    [op, ...params],
  );

/**
 * Grava o envio inteiro na operação `op` (já aberta, `pending`, na transação de `client`). Devolve os ids; quem chama
 * marca a operação e confirma — o banco confere a completude no COMMIT.
 */
export async function writeRequest(
  client: Queryable,
  op: string,
  f: RequestFixture,
  spec: RequestSpec,
): Promise<SentRequest> {
  const requester = spec.requester ?? f.c.titular;
  const holder = spec.holder ?? f.holder;
  const skip = new Set(spec.tamper?.skip ?? []);
  const nights = [...spec.nights].sort();
  for (const previous of spec.materialize ?? []) await writeClosing(client, op, previous);
  await client.query(
    `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`,
    [op],
  );
  for (const key of PARAMETERS)
    await client.query(
      `INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
       SELECT $1, $2, v.id FROM app.economic_snapshot s, app.parameter_at($2, NULL, s.resolved_at) v
        WHERE s.operation_id = $1`,
      [op, key],
    );
  if (!skip.has('policy'))
    await client.query(
      `INSERT INTO app.economic_snapshot_policy (operation_id, policy_id)
       SELECT $1, p.id FROM app.economic_snapshot s, app.commercial_policy_at('luxchange_request', s.resolved_at) p
        WHERE s.operation_id = $1`,
      [op],
    );
  for (const night of nights)
    await client.query(
      `INSERT INTO app.economic_snapshot_night (operation_id, second_home_id, stay_date, prl_id)
       SELECT $1, $2, $3::date, v.id
         FROM app.economic_snapshot s, app.prl_at($2, $3::date, s.resolved_at) v WHERE s.operation_id = $1`,
      [op, holder.homeId, night],
    );
  const required =
    spec.tamper?.creditsRequired ??
    (await creditsOf(
      client,
      op,
      `SELECT sum(l.amount_minor) FROM app.economic_snapshot_night n JOIN app.prl l ON l.id = n.prl_id
        WHERE n.operation_id = $1`,
      [],
    ));
  // P: Créditos potenciais das noites do complemento pelo PRL vigente na resolução (fora do snapshot de noites).
  const unitPotentials: string[][] = [];
  for (const unit of spec.complement ?? []) {
    const perNight: string[] = [];
    for (const night of unit.nights)
      perNight.push(
        spec.tamper?.nightCredits ??
          (await creditsOf(
            client,
            op,
            `SELECT v.amount_minor FROM app.economic_snapshot s, app.prl_at($2, $3::date, s.resolved_at) v
            WHERE s.operation_id = $1`,
            [unit.homeId, night],
          )),
      );
    unitPotentials.push(perNight);
  }
  const complement =
    spec.tamper?.complementCredits ??
    (await scalar(
      client,
      `SELECT trim_scale(coalesce(sum(x), 0))::text AS value FROM unnest($1::numeric[]) x`,
      [unitPotentials.flat()],
    ));
  const guarantee =
    spec.tamper?.guaranteeCredits ??
    (await scalar(
      client,
      `SELECT trim_scale(greatest($1::numeric - $2::numeric, 0))::text AS value`,
      [required, complement],
    ));
  const requestId = randomUUID();
  const historical = spec.historicalSentAt !== undefined;
  await client.query(
    `INSERT INTO app.luxchange_request (id, operation_id, requester_party_id, holder_party_id, holder_holding_id,
       second_home_id, checkin, checkout, credits_required, guarantee_credits, complement_credits${
         historical ? ', sent_at, expires_at, state' : ''
       })
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11${
       historical
         ? `, $12::timestamptz, $12::timestamptz
              + make_interval(hours => app.luxchange_snapshot_parameter($2, 'request_deadline_hours')::integer), 'pending'`
         : ''
     })`,
    [
      requestId,
      op,
      requester.partyId,
      holder.partyId,
      holder.holdingId,
      holder.homeId,
      nights[0],
      addDays(nights.at(-1)!, 1),
      required,
      guarantee,
      complement,
      ...(historical ? [spec.historicalSentAt!.toISOString()] : []),
    ],
  );
  if (!skip.has('nights'))
    for (const night of nights)
      await client.query(
        `INSERT INTO app.luxchange_request_night (request_id, second_home_id, stay_date, custody_id, booking_id)
         SELECT $1, $2, $3::date, c.id, $4
           FROM app.date_custody c WHERE c.second_home_id = $2 AND c.stay_date = $3::date AND c.closed_at IS NULL`,
        [requestId, holder.homeId, night, spec.holderBookingId ?? null],
      );
  const unitIds: string[] = [];
  for (const [index, unit] of (spec.complement ?? []).entries()) {
    const unitId = randomUUID();
    const potentials = unitPotentials[index]!;
    const total = await scalar(
      client,
      `SELECT trim_scale(sum(x))::text AS value FROM unnest($1::numeric[]) x`,
      [potentials],
    );
    await client.query(
      `INSERT INTO app.luxchange_request_complement_unit (id, request_id, kind, holding_id, booking_id, potential_credits)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [unitId, requestId, unit.kind, unit.holdingId, unit.bookingId ?? null, total],
    );
    for (const [i, night] of unit.nights.entries())
      await client.query(
        `INSERT INTO app.luxchange_request_complement_night (unit_id, request_id, second_home_id, stay_date, custody_id,
           prl_id, potential_credits)
         SELECT $1, $2, $3, $4::date, c.id, v.id, $5
           FROM app.date_custody c, app.economic_snapshot s, app.prl_at($3, $4::date, s.resolved_at) v
          WHERE c.second_home_id = $3 AND c.stay_date = $4::date AND c.closed_at IS NULL AND s.operation_id = $6`,
        [unitId, requestId, unit.homeId, night, potentials[i], op],
      );
    unitIds.push(unitId);
  }
  const prlTotal =
    spec.tamper?.prlTotalMinor ??
    BigInt(
      await scalar(
        client,
        `SELECT sum(l.amount_minor)::text AS value FROM app.economic_snapshot_night n JOIN app.prl l ON l.id = n.prl_id
        WHERE n.operation_id = $1`,
        [op],
      ),
    );
  const paymentId = spec.paymentId ?? (await payFee(f, await feeFor(f, prlTotal), requester));
  let feeChargeId: string | null = null;
  if (!skip.has('fee')) {
    feeChargeId = randomUUID();
    await client.query(
      `INSERT INTO app.fee_charge (id, operation_id, payment_id, payer_party_id, prl_total_minor, amount_minor, currency)
       SELECT $1, $2, p.id, $3, $4, p.amount_minor, 'BRL' FROM app.payment p WHERE p.id = $5`,
      [feeChargeId, op, requester.partyId, prlTotal.toString(), paymentId],
    );
  }
  const holdIds: string[] = [];
  if (!skip.has('holds'))
    for (const hold of spec.holds)
      holdIds.push(
        await insertEntry(client, op, {
          lotId: hold.lotId,
          movement: 'hold',
          from: 'available',
          to: 'held',
          quantity: hold.quantity,
        }),
      );
  if (!skip.has('consent')) {
    const terms = await client.query<{ terms: Record<string, unknown> }>(
      `SELECT app.luxchange_request_terms($1) AS terms`,
      [requestId],
    );
    const presented = spec.tamper?.terms
      ? spec.tamper.terms(terms.rows[0]!.terms)
      : terms.rows[0]!.terms;
    await client.query(
      `INSERT INTO app.luxchange_request_consent (request_id, text_version, terms) VALUES ($1, $2, $3::jsonb)`,
      [requestId, CONSENT_VERSION, JSON.stringify(presented)],
    );
  }
  return { requestId, operationId: op, holdIds, feeChargeId, paymentId, unitIds };
}

/** Envio completo, confirmado (operação `send_request` do solicitante para a Second Home solicitada). */
export async function sendRequest(f: RequestFixture, spec: RequestSpec): Promise<SentRequest> {
  const requester = spec.requester ?? f.c.titular;
  const holder = spec.holder ?? f.holder;
  const client = await connect(f.c.h.database.appUrl);
  try {
    await client.query('BEGIN');
    const op = await openDepositOperation(client, requester, holder.homeId, 'send_request');
    const sent = await writeRequest(client, op, f, spec);
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
    await client.query('COMMIT');
    return sent;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Solicitante novo (Owner de outra Second Home, Membership ativo): lotes isolados dos outros testes para o FEFO. */
export const newRequester = (f: RequestFixture) => secondTitular(f.c);

/** Request de `credits` Créditos numa noite nova, com a Garantia inteira no lote informado (sem complemento). */
export async function sendGuaranteedRequest(
  f: RequestFixture,
  lotId: string,
  credits: string,
  requester: CreditTitular = f.c.titular,
): Promise<SentRequest> {
  const nights = await pricedNights(f, [prlForCredits(f, credits)]);
  return sendRequest(f, { requester, nights, holds: [{ lotId, quantity: credits }] });
}

export type ClosingCommand = 'withdraw_request' | 'expire_requests' | 'close_ineligible_request';

/**
 * Grava o encerramento pré-aceite em `op` (transação de `client`): evento (o banco decide estado, motivo e prova),
 * liberação da Garantia inteira (para `available` ou, vencido o lote, `expired`) e reversão do Fee com estorno integral.
 */
export async function writeClosing(
  client: Queryable,
  op: string,
  request: SentRequest,
  options: { skip?: readonly ('release' | 'fee')[] } = {},
): Promise<string> {
  const skip = new Set(options.skip ?? []);
  const transitionId = randomUUID();
  await client.query(
    `INSERT INTO app.luxchange_request_transition (id, request_id, operation_id, reason) VALUES ($1, $2, $3, 'withdrawn')`,
    [transitionId, request.requestId, op],
  );
  if (!skip.has('release')) {
    const { rows } = await client.query<{
      id: string;
      lot_id: string;
      quantity: string;
      valid: boolean;
    }>(
      `SELECT e.id, e.lot_id, e.quantity::text, clock_timestamp() < l.expires_at AS valid
         FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id
        WHERE e.operation_id = $1 AND e.movement = 'hold' ORDER BY e.id`,
      [request.operationId],
    );
    for (const hold of rows)
      await insertEntry(client, op, {
        lotId: hold.lot_id,
        movement: 'release',
        from: 'held',
        to: hold.valid ? 'available' : 'expired',
        quantity: hold.quantity,
        parent: hold.id,
      });
  }
  if (!skip.has('fee') && request.feeChargeId !== null) {
    await client.query(
      `INSERT INTO app.fee_charge_reversal (fee_charge_id, operation_id) VALUES ($1, $2)`,
      [request.feeChargeId, op],
    );
    await client.query(
      `INSERT INTO app.refund (id, payment_id, operation_id, amount_minor, currency, state)
       SELECT $1, f.payment_id, $2, f.amount_minor, f.currency, 'pending' FROM app.fee_charge f WHERE f.id = $3`,
      [randomUUID(), op, request.feeChargeId],
    );
  }
  return transitionId;
}

/** Encerramento confirmado: retirada pelo solicitante, ou expiração/inelegibilidade pelo sistema. */
export async function closeRequest(
  f: RequestFixture,
  request: SentRequest,
  command: ClosingCommand,
  requester: CreditTitular = f.c.titular,
): Promise<string> {
  const actor: OperationActor =
    command === 'withdraw_request' ? { kind: 'titular', titular: requester } : { kind: 'system' };
  const client = await connect(f.c.h.database.appUrl);
  try {
    await client.query('BEGIN');
    const op = await openOperation(client, command, actor);
    await writeClosing(client, op, request);
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
    await client.query('COMMIT');
    return op;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export interface RequestRow {
  readonly state: string;
  readonly closure_reason: string | null;
  readonly credits_required: string;
  readonly guarantee_credits: string;
  readonly complement_credits: string;
  readonly complement_consumption: string;
  readonly complement_excess: string;
  readonly sent_at: Date;
  readonly expires_at: Date;
}

export async function requestRow(db: Queryable, id: string): Promise<RequestRow> {
  const { rows } = await db.query<RequestRow>(
    `SELECT state, closure_reason, trim_scale(credits_required)::text AS credits_required,
            trim_scale(guarantee_credits)::text AS guarantee_credits,
            trim_scale(complement_credits)::text AS complement_credits,
            trim_scale(complement_consumption)::text AS complement_consumption,
            trim_scale(complement_excess)::text AS complement_excess, sent_at, expires_at
       FROM app.luxchange_request WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

/**
 * Envelhece uma Request pendente (dono do schema, gatilhos desligados): `sent_at` e `expires_at` andam juntos — o prazo
 * vence pelo relógio do banco sem esperar e sem alterar a duração vinculada.
 */
export async function ageRequest(
  f: RequestFixture,
  requestId: string,
  hoursPastDeadline = 1,
): Promise<void> {
  const client = await f.c.h.database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    // Um deslocamento só (instante fixo da transação), aplicado aos dois: a duração vinculada não muda.
    await client.query(
      `UPDATE app.luxchange_request
          SET sent_at = sent_at - (expires_at - now() + make_interval(hours => $2)),
              expires_at = expires_at - (expires_at - now() + make_interval(hours => $2))
        WHERE id = $1`,
      [requestId, hoursPastDeadline],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
