/**
 * PRL por Second Home e data (REQ-013, REQ-052; TECH-030; ADR-0032 §1–§4). O banco decide procedência, autoridade e
 * vigência; aqui ficam só as regras puras usadas antes da gravação e na leitura.
 */
export const PRL_KINDS = ['initial', 'change'] as const;
export type PrlKind = (typeof PRL_KINDS)[number];

/** Limite técnico por publicação e por leitura de período (o mesmo do banco). */
export const MAX_PRL_NIGHTS = 366;

/** Command do TECH-051 de cada tipo de publicação. */
export const PRL_COMMAND: Readonly<Record<PrlKind, string>> = {
  initial: 'publish_initial_prl',
  change: 'change_published_prl',
};

export interface PrlVersion {
  readonly id: string;
  readonly stayDate: string;
  readonly amountMinor: bigint;
  readonly currency: 'BRL';
  readonly effectiveFrom: Date;
  /** `effective_to` derivado (TECH-030): início da versão seguinte da noite; `null` = sem sucessora. */
  readonly effectiveTo: Date | null;
  readonly kind: PrlKind;
  readonly authority: 'admin' | 'super_admin';
  readonly authorizationRef: string;
  readonly createdAt: Date;
}

export interface PrlNightStatus {
  /** Versão vigente no instante; `null` = noite sem PRL aplicável (não ofertável, REQ-052). */
  readonly inForce: PrlVersion | null;
  /** Versões com início futuro, em ordem de início. */
  readonly scheduled: readonly PrlVersion[];
}

/** Vigente e agendadas de uma noite no instante, a partir das versões em ordem de início (mesma regra de `prl_at`). */
export function nightStatus(versions: readonly PrlVersion[], at: Date): PrlNightStatus {
  let inForce: PrlVersion | null = null;
  const scheduled: PrlVersion[] = [];
  for (const version of versions) {
    if (version.effectiveFrom.getTime() <= at.getTime()) inForce = version;
    else scheduled.push(version);
  }
  return { inForce, scheduled };
}

/**
 * Regra por noite do tipo de publicação (a mesma dos gatilhos): a inicial só cabe em noite sem PRL; a alteração só em
 * noite publicada. Devolve as noites que violam a regra.
 */
export function nightsOutsideKind(
  kind: PrlKind,
  nights: readonly string[],
  published: ReadonlySet<string>,
): string[] {
  return nights.filter((night) => (kind === 'initial') === published.has(night));
}
