import { z } from 'zod';
const id = z.uuid().transform((value) => value.toLowerCase());
const text = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const date = z.iso.date().refine((value) => value >= '0001-01-01');
const configuration = z.union([z.literal(10), z.literal(8), z.literal(4), z.literal(2)]);
const common = { second_home_id: id, location: text, operation_start_date: date, basis_ref: text };
export const formalizeAcquisitionInput = z
  .discriminatedUnion('modality', [
    z.strictObject({
      ...common,
      modality: z.literal('owner'),
      acquirer_party_ids: z.array(id).length(1),
    }),
    z.strictObject({
      ...common,
      modality: z.literal('co_owner'),
      acquirer_party_ids: z.array(id).min(2).max(10),
      configuration_id: configuration,
      spe_party_id: id,
      initial_allocation_id: id.optional(),
    }),
  ])
  .refine(
    (input) =>
      input.modality === 'owner' || input.acquirer_party_ids.length === input.configuration_id,
    { path: ['configuration_id'], message: 'acquirerCount' },
  )
  .refine(
    (input) =>
      input.modality === 'owner' ||
      new Set(input.acquirer_party_ids).size === input.acquirer_party_ids.length,
    { path: ['acquirer_party_ids', 0], message: 'duplicateAcquirer' },
  )
  .refine(
    (input) =>
      input.modality === 'owner' ||
      (input.operation_start_date.slice(5) !== '01-01') ===
        (input.initial_allocation_id !== undefined),
    { path: ['operation_start_date'], message: 'allocationDate' },
  );
const quantity = z.strictObject({
  alta: z.number().int().min(0).max(103),
  media: z.number().int().min(0).max(262),
});
const grant = z.strictObject({
  position: z.number().int().min(1).max(10),
  alta: z.number().int().min(0).max(48),
  media: z.number().int().min(0).max(128),
});
export const initialAllocationInput = z.strictObject({
  second_home_id: id,
  configuration_id: configuration,
  operation_start_date: date.refine((value) => value.slice(5) !== '01-01'),
  grants: z.array(grant).min(2).max(10),
  luxtory_capacity: quantity,
  basis_ref: text,
});
const coverage = z
  .strictObject({
    provider_party_id: id,
    professional: z.literal(true),
    scope: z.enum(['professional_administration', 'full_luxtory_administration']),
    valid_from: date,
    valid_until: date.optional(),
    replaces_id: id.optional(),
  })
  .refine((input) => input.valid_until === undefined || input.valid_until > input.valid_from, {
    path: ['valid_until'],
    message: 'endBeforeStart',
  });
export const administrationInput = z.strictObject({
  second_home_id: id,
  coverages: z.array(coverage).min(1).max(20),
  basis_ref: text,
});
export const operationStartInput = z.strictObject({
  second_home_id: id,
  effective_start_date: date,
  basis_ref: text,
});
export type FormalizeAcquisitionInput = z.infer<typeof formalizeAcquisitionInput>;
export type InitialAllocationInput = z.infer<typeof initialAllocationInput>;
export type AdministrationInput = z.infer<typeof administrationInput>;
export type OperationStartInput = z.infer<typeof operationStartInput>;
