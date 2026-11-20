import { CommandRejection, type LockSequence } from '@/features/platform';
import { MAX_PRL_NIGHTS } from '../domain/prl';
import { sumMinor, type Currency } from '../domain/money';

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
}

export interface PrlNightInForce {
  readonly stayDate: string;
  readonly prlId: string | null;
  readonly amountMinor: string | null;
  readonly currency: string | null;
}

export interface EconomicTermsStore<Tx> {
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
const nightsBetween = (checkin: string, checkout: string) =>
  (Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / DAY_MS;

/**
 * Resolve os termos econômicos dentro da transação do command (TECH-030/031/053/054): travas compartilhadas dos
 * parâmetros em ordem crescente, depois a do PRL; um único `resolvedAt` lido do banco depois de todas as travas; todas as
 * versões consultadas nesse instante. As travas seguem até o fim da transação: nenhuma publicação concorrente confirma
 * entre a resolução e o efeito. Noite sem PRL → `ERR_PRL_MISSING`; parâmetro exigido ausente → `ERR_PARAMETER_MISSING`.
 * Nada é presumido nem resolvido pela metade.
 */
export async function resolveEconomicTerms<Tx>(
  tx: Tx,
  locks: LockSequence,
  store: EconomicTermsStore<Tx>,
  request: EconomicTermsRequest,
): Promise<EconomicTerms> {
  const { period } = request;
  if (period !== undefined) {
    const count = nightsBetween(period.checkin, period.checkout);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PRL_NIGHTS)
      throw new CommandRejection('ERR_VALIDATION');
  }
  const keys = locks
    .claim(
      'parameter',
      request.parameters.map((key) => [key, 'global'] as const),
    )
    .map(([key]) => key as EconomicParameterKey);
  await store.lockParameters(tx, keys);

  let resolvedAt: string;
  let nights: EconomicTermsNight[] = [];
  if (period === undefined) {
    resolvedAt = await store.databaseInstant(tx);
  } else {
    // A trava compartilhada do PRL é tomada pela própria função do banco, nesta posição da ordem total.
    locks.claim('prl', [period.secondHomeId]);
    const inForce = await store.prlPeriodInForce(
      tx,
      period.secondHomeId,
      period.checkin,
      period.checkout,
    );
    resolvedAt = inForce.resolvedAt;
    if (inForce.nights.some((night) => night.prlId === null))
      throw new CommandRejection('ERR_PRL_MISSING');
    nights = inForce.nights.map((night) => ({
      stayDate: night.stayDate,
      prlId: night.prlId!,
      amountMinor: night.amountMinor!,
      currency: night.currency as Currency,
    }));
  }

  const found = await store.parametersAt(tx, keys, resolvedAt);
  if (keys.some((key) => !found.has(key))) throw new CommandRejection('ERR_PARAMETER_MISSING');
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
    secondHomeId: period?.secondHomeId ?? null,
    nights,
    prlTotal:
      period === undefined
        ? null
        : {
            amountMinor: sumMinor(nights.map((night) => BigInt(night.amountMinor))).toString(),
            currency: 'BRL',
          },
    parameters,
  };
}
