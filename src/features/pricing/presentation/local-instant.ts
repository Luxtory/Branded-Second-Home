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

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

/** Noites civis de `[first, last]` (inclusive), ou `null` se inválido ou acima do limite. */
export function nightsBetween(first: string, last: string, limit: number): string[] | null {
  if (!NIGHT.test(first) || !NIGHT.test(last)) return null;
  try {
    const start = Temporal.PlainDate.from(first, { overflow: 'reject' });
    const end = Temporal.PlainDate.from(last, { overflow: 'reject' });
    const count = start.until(end, { largestUnit: 'days' }).days + 1;
    if (count < 1 || count > limit) return null;
    return Array.from({ length: count }, (_, i) => start.add({ days: i }).toString());
  } catch {
    // Data inexistente: recusa de entrada do formulário.
    return null;
  }
}
