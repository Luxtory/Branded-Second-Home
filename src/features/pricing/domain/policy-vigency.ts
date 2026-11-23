import type { PolicyConfig, PolicyMechanism } from './commercial-policy';

/**
 * Vigência das versões de política (TECH-030; ADR-0034 §3): a mesma regra de `app.parameter` (ADR-0030 §3) e do gatilho
 * `app.commercial_policy_insert` — só por inserção, nunca retroativa, depois de todos os inícios do mecanismo e nunca
 * antes de um término explícito; sem término, vale até o início da seguinte.
 */
export interface PolicyVersion {
  readonly id: string;
  readonly mechanism: PolicyMechanism;
  readonly config: PolicyConfig;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export type PolicyVigencyConflict = 'retroactive' | 'overlap';

export function policyVigencyConflict(
  latest: Pick<PolicyVersion, 'effectiveFrom' | 'effectiveTo'> | null,
  effectiveFrom: Date,
  now: Date,
): PolicyVigencyConflict | null {
  if (effectiveFrom.getTime() < now.getTime()) return 'retroactive';
  if (latest === null) return null;
  if (effectiveFrom.getTime() <= latest.effectiveFrom.getTime()) return 'overlap';
  if (latest.effectiveTo !== null && effectiveFrom.getTime() < latest.effectiveTo.getTime())
    return 'overlap';
  return null;
}

/** Versão vigente no instante, numa lista ordenada pelo início (mesma regra de `app.commercial_policy_at`). */
export function policyInForce<V extends Pick<PolicyVersion, 'effectiveFrom' | 'effectiveTo'>>(
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

/** Versões que começam depois do instante (agendadas), na ordem de início. */
export function scheduledPolicies<V extends Pick<PolicyVersion, 'effectiveFrom'>>(
  versions: readonly V[],
  at: Date,
): readonly V[] {
  return versions.filter((version) => version.effectiveFrom.getTime() > at.getTime());
}
