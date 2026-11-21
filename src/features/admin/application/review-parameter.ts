import {
  predecessorInForce,
  successorConflict,
  versionInForce,
  type ParameterVersion,
  type SuccessorConflict,
} from '../domain/parameter';

/**
 * Revisão de uma nova versão de parâmetro antes da confirmação (W16 E4; REQ-095; spec admin §14). Pura e no servidor,
 * com as mesmas regras do command (`successorConflict`, D3) e da leitura (`versionInForce`): recusa antecipadamente a
 * proposta incompatível e mostra a sequência — vigente agora, agendadas e a situação imediatamente anterior à nova
 * vigência (que pode ser uma versão agendada ou uma lacuna) → novo. O command e o banco revalidam na confirmação.
 */
export type ParameterReviewConflict = SuccessorConflict | 'end_not_future';

export interface ParameterReview<V extends ParameterVersion = ParameterVersion> {
  readonly conflict: ParameterReviewConflict | null;
  readonly current: V | null;
  readonly scheduled: readonly V[];
  /** Antes da nova vigência: `null` = ausente (nenhuma versão, ou lacuna depois de um término explícito). */
  readonly previous: V | null;
}

export function reviewParameterVersion<V extends ParameterVersion>(
  versions: readonly V[],
  effectiveFrom: Date | null,
  effectiveTo: Date | null,
  now: Date,
): ParameterReview<V> {
  const latest = versions.at(-1) ?? null;
  const start = effectiveFrom ?? now;
  const conflict =
    successorConflict(latest, start, now) ??
    (effectiveFrom === null && effectiveTo !== null && effectiveTo.getTime() <= now.getTime()
      ? 'end_not_future'
      : null);
  return {
    conflict,
    current: versionInForce(versions, now),
    scheduled: versions.filter((version) => version.effectiveFrom.getTime() > now.getTime()),
    previous: conflict === null ? predecessorInForce(latest, start) : null,
  };
}
