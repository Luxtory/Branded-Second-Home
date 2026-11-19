/**
 * Parâmetros versionados (TECH-030; REQ-095; ADR-0030 §3). Na W14 a lista fechada de chaves tem só `guest_rules`: texto
 * por Second Home, cujo conteúdo é definido pela Luxtory (P-5). Nenhum valor é presumido (TECH-001).
 */
export const PARAMETER_KEYS = ['guest_rules'] as const;
export type ParameterKey = (typeof PARAMETER_KEYS)[number];

/** Limite técnico do texto (mesmo do banco, `parameter_guest_rules_text`); não é regra de negócio. */
export const GUEST_RULES_MAX_LENGTH = 20_000;

export interface ParameterVersion {
  readonly id: string;
  readonly key: ParameterKey;
  readonly secondHomeId: string;
  readonly value: string;
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
