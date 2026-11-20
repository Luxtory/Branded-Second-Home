/**
 * Parâmetros versionados (TECH-030; REQ-095; ADR-0030 §3, ADR-0032 §6). `guest_rules` é texto por Second Home (P-5); as
 * seis chaves econômicas da W16 são globais, com valor canônico tipado também no banco. Nenhum valor é presumido
 * (TECH-001): sem versão vigente, quem depende recusa com ERR_PARAMETER_MISSING.
 */
export const ECONOMIC_PARAMETER_KEYS = [
  'credit_multiplier',
  'credit_validity_months',
  'luxchange_fee_rate',
  'luxchange_fee_minimum',
  'request_deadline_hours',
  'membership_base_annual_price',
] as const;
export type EconomicParameterKey = (typeof ECONOMIC_PARAMETER_KEYS)[number];

export const PARAMETER_KEYS = ['guest_rules', ...ECONOMIC_PARAMETER_KEYS] as const;
export type ParameterKey = (typeof PARAMETER_KEYS)[number];

/** Tipo do valor canônico de cada chave econômica (o mesmo CHECK do banco, `admin_parameter_economic_keys`). */
export const ECONOMIC_PARAMETER_TYPES: Readonly<
  Record<EconomicParameterKey, 'decimal' | 'months' | 'fraction' | 'money' | 'hours'>
> = {
  credit_multiplier: 'decimal',
  credit_validity_months: 'months',
  luxchange_fee_rate: 'fraction',
  luxchange_fee_minimum: 'money',
  request_deadline_hours: 'hours',
  membership_base_annual_price: 'money',
};

const VALUE_FORMAT: Readonly<
  Record<(typeof ECONOMIC_PARAMETER_TYPES)[EconomicParameterKey], RegExp>
> = {
  // Decimal positivo canônico: até 9 dígitos inteiros e 6 casas, sem zero à direita.
  decimal: /^(0|[1-9][0-9]{0,8})(\.[0-9]{0,5}[1-9])?$/,
  // Fração em (0, 1], até 6 casas, canônica.
  fraction: /^(0\.[0-9]{0,5}[1-9]|1)$/,
  // Dinheiro em unidade mínima, inteiro positivo (limite técnico de 15 dígitos).
  money: /^[1-9][0-9]{0,14}$/,
  months: /^[1-9][0-9]{0,3}$/,
  hours: /^[1-9][0-9]{0,3}$/,
};

export function isEconomicParameterKey(key: string): key is EconomicParameterKey {
  return (ECONOMIC_PARAMETER_KEYS as readonly string[]).includes(key);
}

/** Valor canônico válido para a chave econômica (zero e negativo recusados, BR-361). */
export function isEconomicParameterValue(key: EconomicParameterKey, value: string): boolean {
  return VALUE_FORMAT[ECONOMIC_PARAMETER_TYPES[key]].test(value) && value !== '0';
}

/** Moeda das chaves monetárias (só BRL no `01`); `null` nas demais. */
export function parameterCurrency(key: ParameterKey): 'BRL' | null {
  return isEconomicParameterKey(key) && ECONOMIC_PARAMETER_TYPES[key] === 'money' ? 'BRL' : null;
}

/** Limite técnico do texto (mesmo do banco, `parameter_guest_rules_text`); não é regra de negócio. */
export const GUEST_RULES_MAX_LENGTH = 20_000;

export interface ParameterVersion {
  readonly id: string;
  readonly key: ParameterKey;
  /** `null` = escopo global (chaves econômicas). */
  readonly secondHomeId: string | null;
  readonly value: string;
  readonly currency: 'BRL' | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  /** Fim efetivo: o `effectiveTo` explícito ou o início da versão seguinte; `null` = sem fim. */
  readonly effectiveUntil: Date | null;
}

export interface ParameterVersionRecord extends ParameterVersion {
  readonly authority: string;
  readonly authorizationRef: string;
  readonly createdAt: Date;
}

export type SuccessorConflict = 'retroactive' | 'overlap';

/**
 * Regra de vigência da sucessora (D3, mesma do gatilho `app.parameter_insert`): não começa antes do instante da
 * gravação, nem no início ou antes do início da versão mais recente, nem antes do `effective_to` explícito dela —
 * uma publicação nunca antecipa um término expressamente estabelecido. Começar exatamente no término é aceito.
 */
export function successorConflict(
  latest: Pick<ParameterVersion, 'effectiveFrom' | 'effectiveTo'> | null,
  effectiveFrom: Date,
  now: Date,
): SuccessorConflict | null {
  if (effectiveFrom.getTime() < now.getTime()) return 'retroactive';
  if (latest === null) return null;
  if (effectiveFrom.getTime() <= latest.effectiveFrom.getTime()) return 'overlap';
  if (latest.effectiveTo !== null && effectiveFrom.getTime() < latest.effectiveTo.getTime())
    return 'overlap';
  return null;
}

/** Versão vigente no instante, numa lista ordenada pelo início (mesma regra de `app.parameter_at`). */
export function versionInForce<V extends Pick<ParameterVersion, 'effectiveFrom' | 'effectiveTo'>>(
  versions: readonly V[],
  at: Date,
): V | null {
  let candidate: V | null = null;
  for (const version of versions)
    if (version.effectiveFrom.getTime() <= at.getTime()) candidate = version;
  if (candidate === null) return null;
  return candidate.effectiveTo === null || at.getTime() < candidate.effectiveTo.getTime()
    ? candidate
    : null;
}
