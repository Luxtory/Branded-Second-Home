import { Temporal } from 'temporal-polyfill';

/**
 * Data e hora local (`YYYY-MM-DDTHH:MM`, do campo `datetime-local`) no fuso da Second Home → instante ISO. Horário
 * inexistente ou ambíguo (mudança de horário) é recusado, como no calendário civil (TECH-040).
 */
export function localToInstant(value: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  try {
    return Temporal.PlainDateTime.from(value)
      .toZonedDateTime(timeZone, { disambiguation: 'reject' })
      .toInstant()
      .toString();
  } catch {
    // Horário inexistente, ambíguo ou fuso inválido: recusa de entrada do formulário, não falha técnica.
    return null;
  }
}
