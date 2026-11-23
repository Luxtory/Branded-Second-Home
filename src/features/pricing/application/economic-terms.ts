import { CommandRejection, type LockSequence } from '@/features/platform';
import { MAX_PRL_NIGHTS } from '../domain/prl';
import { sumMinor, type Currency } from '../domain/money';
import type { PolicyConfig, PolicyMechanism } from '../domain/commercial-policy';

/** Chaves econômicas globais (spec admin §14), com a unidade de cada valor canônico. */
export const ECONOMIC_PARAMETER_UNITS = {
  credit_multiplier: 'decimal',
  credit_validity_months: 'months',
  luxchange_fee_rate: 'fraction',
  luxchange_fee_minimum: 'money',
  request_deadline_hours: 'hours',
  membership_base_annual_price: 'money',
} as const;
export type EconomicParameterKey = keyof typeof ECONOMIC_PARAMETER_UNITS;
export type EconomicParameterUnit = (typeof ECONOMIC_PARAMETER_UNITS)[EconomicParameterKey];

export interface EconomicTermsRequest {
  readonly parameters: readonly EconomicParameterKey[];
  /** Período `[checkin, checkout)` de uma Second Home, quando o mecanismo usa PRL. */
  readonly period?: {
    readonly secondHomeId: string;
    readonly checkin: string;
    readonly checkout: string;
  };
  /**
   * Conjunto explícito de noites de uma Second Home (W20, ADR-0036 §4), em alternativa ao período: datas civis distintas
   * em ordem crescente, consecutivas ou não. Só elas são precificadas e somadas; noite intermediária não entra.
   */
  readonly nights?: {
    readonly secondHomeId: string;
    readonly dates: readonly string[];
  };
  /**
   * Política comercial do mecanismo (TECH-032, PD-009): a versão apresentada e aceita pelo usuário. Sem versão vigente,
   * ou com a aceita diferente da vigente no instante da resolução → `ERR_POLICY_MISSING`.
   */
  readonly policy?: {
    readonly mechanism: PolicyMechanism;
    readonly acceptedPolicyId: string;
  };
}

/** Versão da política vigente no instante da resolução (imutável; vínculo persistente na W21). */
export interface EconomicTermsPolicy {
  readonly policyId: string;
  readonly mechanism: PolicyMechanism;
  readonly config: PolicyConfig;
  readonly effectiveFrom: string;
}

export interface EconomicTermsNight {
  readonly stayDate: string;
  readonly prlId: string;
  /** Unidade mínima como string (TECH-033). */
  readonly amountMinor: string;
  readonly currency: Currency;
}

export interface EconomicTermsParameter {
  readonly parameterId: string;
  /** Texto canônico gravado no banco. */
  readonly value: string;
  readonly unit: EconomicParameterUnit;
  /** Só nas chaves monetárias. */
  readonly currency: Currency | null;
}

/**
 * Contrato do snapshot (TECH-031; ADR-0032 §8): o que formou a operação, resolvido num único instante do banco. Os ids
 * apontam versões imutáveis; a persistência é da wave que produzir o efeito econômico, na mesma transação.
 */
export interface EconomicTerms {
  readonly resolvedAt: string;
  readonly secondHomeId: string | null;
  readonly nights: readonly EconomicTermsNight[];
  readonly prlTotal: { readonly amountMinor: string; readonly currency: Currency } | null;
  readonly parameters: Readonly<Partial<Record<EconomicParameterKey, EconomicTermsParameter>>>;
  readonly policy: EconomicTermsPolicy | null;
}

export interface PrlNightInForce {
  readonly stayDate: string;
  readonly prlId: string | null;
  readonly amountMinor: string | null;
  readonly currency: string | null;
}

export interface EconomicTermsStore<Tx> {
  /** Trava compartilhada `app.commercial_policy:<mecanismo>` (a mesma do gatilho, em modo compartilhado). */
  lockPolicy(tx: Tx, mechanism: PolicyMechanism): Promise<void>;
  /** Versão vigente no instante exato (`app.commercial_policy_at`); nenhuma → `null`. */
  policyAt(tx: Tx, mechanism: PolicyMechanism, at: string): Promise<EconomicTermsPolicy | null>;
  /** Travas compartilhadas `app.parameter:<chave>:global`, na ordem recebida. */
  lockParameters(tx: Tx, keys: readonly EconomicParameterKey[]): Promise<void>;
  /** `app.prl_period_in_force`: trava compartilhada do PRL e instante do banco depois dela; uma linha por noite. */
  prlPeriodInForce(
    tx: Tx,
    secondHomeId: string,
    checkin: string,
    checkout: string,
  ): Promise<{ readonly resolvedAt: string; readonly nights: readonly PrlNightInForce[] }>;
  /** Instante do banco (`clock_timestamp()`), para resolução sem PRL. */
  databaseInstant(tx: Tx): Promise<string>;
  /** Versões vigentes no instante exato (`app.parameter_at`); chave ausente não aparece. */
  parametersAt(
    tx: Tx,
    keys: readonly EconomicParameterKey[],
    at: string,
  ): Promise<
    ReadonlyMap<
      EconomicParameterKey,
      { readonly id: string; readonly value: string; readonly currency: string | null }
    >
  >;
}

const DAY_MS = 86_400_000;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const nightsBetween = (checkin: string, checkout: string) =>
  (Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / DAY_MS;
const dayAfter = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * Intervalo `[primeira, última + 1)` lido de uma vez e as noites pedidas dentro dele. Conjunto vazio, fora de ordem,
 * repetido, inválido ou que cobre mais de 366 noites → `ERR_VALIDATION` (o mesmo limite do período).
 */
function pricedSpan(request: EconomicTermsRequest) {
  if (request.period !== undefined && request.nights !== undefined)
    throw new CommandRejection('ERR_VALIDATION');
  if (request.period !== undefined) {
    const { secondHomeId, checkin, checkout } = request.period;
    const count = nightsBetween(checkin, checkout);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PRL_NIGHTS)
      throw new CommandRejection('ERR_VALIDATION');
    return { secondHomeId, checkin, checkout, wanted: null };
  }
  if (request.nights === undefined) return null;
  const { secondHomeId, dates } = request.nights;
  const valid =
    dates.length > 0 &&
    dates.every(
      (date, index) =>
        CIVIL_DATE.test(date) &&
        // Data civil real (`2027-02-30` não existe): ida e volta pelo calendário UTC.
        !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date &&
        (index === 0 || dates[index - 1]! < date),
    );
  if (!valid) throw new CommandRejection('ERR_VALIDATION');
  const checkin = dates[0]!;
  const checkout = dayAfter(dates.at(-1)!);
  if (nightsBetween(checkin, checkout) > MAX_PRL_NIGHTS)
    throw new CommandRejection('ERR_VALIDATION');
  return { secondHomeId, checkin, checkout, wanted: new Set(dates) };
}

/**
 * Resolve os termos econômicos dentro da transação do command (TECH-030/031/053/054): travas compartilhadas dos
 * parâmetros em ordem crescente, depois a do PRL; um único `resolvedAt` lido do banco depois de todas as travas; todas as
 * versões consultadas nesse instante. As travas seguem até o fim da transação: nenhuma publicação concorrente confirma
 * entre a resolução e o efeito. Noite sem PRL → `ERR_PRL_MISSING`; parâmetro exigido ausente → `ERR_PARAMETER_MISSING`;
 * política ausente ou diferente da aceita → `ERR_POLICY_MISSING` (W18; a trava da política vem antes das demais).
 * Nada é presumido nem resolvido pela metade.
 */
export async function resolveEconomicTerms<Tx>(
  tx: Tx,
  locks: LockSequence,
  store: EconomicTermsStore<Tx>,
  request: EconomicTermsRequest,
): Promise<EconomicTerms> {
  const span = pricedSpan(request);
  if (request.policy !== undefined)
    for (const [mechanism] of locks.claim('commercial_policy', [request.policy.mechanism]))
      await store.lockPolicy(tx, mechanism as PolicyMechanism);
  const keys = locks
    .claim(
      'parameter',
      request.parameters.map((key) => [key, 'global'] as const),
    )
    .map(([key]) => key as EconomicParameterKey);
  await store.lockParameters(tx, keys);

  let resolvedAt: string;
  let nights: EconomicTermsNight[] = [];
  if (span === null) {
    resolvedAt = await store.databaseInstant(tx);
  } else {
    // A trava compartilhada do PRL é tomada pela própria função do banco, nesta posição da ordem total; o conjunto de
    // noites usa a mesma leitura (um instante) e descarta as noites não pedidas antes de qualquer decisão.
    locks.claim('prl', [span.secondHomeId]);
    const inForce = await store.prlPeriodInForce(
      tx,
      span.secondHomeId,
      span.checkin,
      span.checkout,
    );
    resolvedAt = inForce.resolvedAt;
    const priced = inForce.nights.filter(
      (night) => span.wanted === null || span.wanted.has(night.stayDate),
    );
    if (span.wanted !== null && priced.length !== span.wanted.size)
      throw new CommandRejection('ERR_VALIDATION');
    if (priced.some((night) => night.prlId === null)) throw new CommandRejection('ERR_PRL_MISSING');
    nights = priced.map((night) => ({
      stayDate: night.stayDate,
      prlId: night.prlId!,
      amountMinor: night.amountMinor!,
      currency: night.currency as Currency,
    }));
  }

  const found = await store.parametersAt(tx, keys, resolvedAt);
  if (keys.some((key) => !found.has(key))) throw new CommandRejection('ERR_PARAMETER_MISSING');
  let policy: EconomicTermsPolicy | null = null;
  if (request.policy !== undefined) {
    policy = await store.policyAt(tx, request.policy.mechanism, resolvedAt);
    if (policy === null || policy.policyId !== request.policy.acceptedPolicyId)
      throw new CommandRejection('ERR_POLICY_MISSING');
  }
  const parameters: Partial<Record<EconomicParameterKey, EconomicTermsParameter>> = {};
  for (const key of keys) {
    const version = found.get(key)!;
    parameters[key] = {
      parameterId: version.id,
      value: version.value,
      unit: ECONOMIC_PARAMETER_UNITS[key],
      currency: (version.currency as Currency | null) ?? null,
    };
  }
  return {
    resolvedAt,
    secondHomeId: span?.secondHomeId ?? null,
    nights,
    prlTotal:
      span === null
        ? null
        : {
            amountMinor: sumMinor(nights.map((night) => BigInt(night.amountMinor))).toString(),
            currency: 'BRL',
          },
    parameters,
    policy,
  };
}
