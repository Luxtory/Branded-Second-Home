export type AcquisitionFormKind = 'formalize' | 'allocation' | 'administration' | 'start';
export const formField = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};
const optional = (value: string) => (value.trim() === '' ? undefined : value);
/** Blank is absent, never zero. Invalid numbers remain invalid input for the command schema. */
const integer = (value: string) =>
  value.trim() === '' ? undefined : /^\d{1,9}$/.test(value) ? Number(value) : value;
const countOf = (value: string) => (['10', '8', '4', '2'].includes(value) ? Number(value) : 0);

/** Only presentation mapping. The reviewed command schemas and transaction remain authoritative. */
export function acquisitionFormInput(
  kind: AcquisitionFormKind,
  form: FormData,
): Record<string, unknown> {
  const field = (name: string) => formField(form, name);
  const common = { second_home_id: field('second_home_id'), basis_ref: field('basis_ref') };
  if (kind === 'start') return { ...common, effective_start_date: field('effective_start_date') };
  if (kind === 'administration')
    return {
      ...common,
      coverages: [
        {
          provider_party_id: field('provider_party_id'),
          professional: field('professional') === 'on' ? true : undefined,
          scope: field('scope'),
          valid_from: field('valid_from'),
          valid_until: field('end_kind') === 'defined' ? field('valid_until') : undefined,
          replaces_id: optional(field('replaces_id')),
        },
      ],
    };
  const count = countOf(field('configuration_id'));
  const dated = { ...common, operation_start_date: field('operation_start_date') };
  if (kind === 'allocation')
    return {
      ...dated,
      configuration_id: integer(field('configuration_id')),
      grants: Array.from({ length: count }, (_, i) => ({
        position: i + 1,
        alta: integer(field('alta')),
        media: integer(field('media')),
      })),
      luxtory_capacity: {
        alta: integer(field('luxtory_alta')),
        media: integer(field('luxtory_media')),
      },
    };
  const modality = field('modality');
  return {
    ...dated,
    location: field('location'),
    modality,
    acquirer_party_ids: Array.from({ length: modality === 'owner' ? 1 : count }, (_, i) =>
      field(`acquirer_${i + 1}`),
    ),
    ...(modality === 'co_owner'
      ? {
          configuration_id: integer(field('configuration_id')),
          spe_party_id: field('spe_party_id'),
          initial_allocation_id: optional(field('initial_allocation_id')),
        }
      : {}),
  };
}
