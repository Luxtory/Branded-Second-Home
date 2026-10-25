export interface SeasonalQuantity {
  readonly alta: number;
  readonly media: number;
}
export interface AcquisitionConfiguration extends SeasonalQuantity {
  readonly id: number;
  readonly participationBps: number;
  readonly luxtoryAlta: number;
  readonly luxtoryMedia: number;
}
export interface AllocationGrant extends SeasonalQuantity {
  readonly position: number;
}
/** BR-071/081/107: explicit equality, independent seasonal limits and only future capacity. */
export function allocationFits(
  configuration: AcquisitionConfiguration,
  grants: readonly AllocationGrant[],
  luxtory: SeasonalQuantity,
  capacity: SeasonalQuantity,
): boolean {
  if (
    grants.length !== configuration.id ||
    new Set(grants.map((g) => g.position)).size !== configuration.id
  )
    return false;
  const first = grants[0];
  if (first === undefined) return false;
  if (
    grants.some(
      (g) =>
        !Number.isInteger(g.position) ||
        g.position < 1 ||
        g.position > configuration.id ||
        g.alta !== first.alta ||
        g.media !== first.media,
    )
  )
    return false;
  for (const bucket of ['alta', 'media'] as const) {
    const quantity = first[bucket];
    const institutionLimit =
      bucket === 'alta' ? configuration.luxtoryAlta : configuration.luxtoryMedia;
    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > configuration[bucket] ||
      !Number.isInteger(luxtory[bucket]) ||
      luxtory[bucket] < 0 ||
      luxtory[bucket] > institutionLimit ||
      configuration.id * quantity + luxtory[bucket] > capacity[bucket]
    )
      return false;
  }
  return true;
}
export function validAcquirers(
  parties: readonly string[],
  count: number,
  institution: string | null,
): boolean {
  return (
    parties.length === count &&
    new Set(parties).size === count &&
    (institution === null || !parties.includes(institution))
  );
}
