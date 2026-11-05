import { z } from 'zod';
import { isNonPersonalReference } from '@/features/platform';

/**
 * Entradas comuns dos commands do ciclo (spec booking §10.12). A base registrada e a referência de incidente são
 * referências não pessoais a registros verificáveis (D11); ficam só na linha de domínio e na auditoria.
 */
export const civilDate = z.iso.date().refine((value) => value >= '0001-01-01');

export const referenceBasis = z.string().trim().min(1).max(255).refine(isNonPersonalReference);

/** Mesmo formato do banco (`booking_exception_incident_ref_format`), sem identificador pessoal. */
export const incidentReference = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/)
  .refine(isNonPersonalReference);

export const bookingTarget = {
  second_home_id: z.uuid(),
  booking_id: z.uuid(),
};
