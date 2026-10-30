/** Modalidade da aquisição formalizada (W8). */
export type AcquisitionModality = 'owner' | 'co_owner';
export type RootHolder = 'owner' | 'spe_pool';

/** TECH-021: a custódia raiz de cada noite selada é `owner` no Owner e `spe_pool` no Co-Owner. */
export function rootHolderFor(modality: AcquisitionModality): RootHolder {
  return modality === 'owner' ? 'owner' : 'spe_pool';
}
