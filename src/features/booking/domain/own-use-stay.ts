/** BR-111, TECH-045: uma permanência de uso próprio do Co-Owner tem no máximo 14 noites consecutivas. */
export const MAX_STAY_NIGHTS = 14;

/** Janela de vizinhança que basta para ver uma permanência acima do limite que toque a reserva (spec booking §4). */
export const STAY_NEIGHBORHOOD_DAYS = MAX_STAY_NIGHTS + 1;

const DAY_MS = 86_400_000;
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class InvalidCivilDateError extends RangeError {
  constructor(value: string) {
    super(`Invalid civil date: ${value}`);
    this.name = 'InvalidCivilDateError';
  }
}

/** Dia civil `YYYY-MM-DD` como contagem de dias desde 1970-01-01 (sem fuso: a data já é a civil da Second Home). */
function epochDay(date: string): number {
  const match = CIVIL_DATE.exec(date);
  if (match === null) throw new InvalidCivilDateError(date);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) {
    throw new InvalidCivilDateError(date);
  }
  return Math.round(at.getTime() / DAY_MS);
}

function civilDate(day: number): string {
  const at = new Date(day * DAY_MS);
  const year = String(at.getUTCFullYear()).padStart(4, '0');
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const date = String(at.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

/** `date` + `days` dias civis. */
export function addCivilDays(date: string, days: number): string {
  return civilDate(epochDay(date) + days);
}

/**
 * PD-002 (ADR-003 do `03`): cada data reservada é a noite iniciada nela e a de check-out não consome — de 10 a 12/03
 * são as noites de 10 e 11/03. `[]` quando o check-out não é posterior ao check-in.
 */
export function stayNights(checkinDate: string, checkoutDate: string): readonly string[] {
  const first = epochDay(checkinDate);
  const last = epochDay(checkoutDate);
  const nights: string[] = [];
  for (let day = first; day < last; day += 1) nights.push(civilDate(day));
  return nights;
}

/**
 * BR-112, TECH-045: reservas consecutivas ou adjacentes da mesma Ação formam uma permanência. Devolve o tamanho da maior
 * sequência de noites consecutivas da união (noites já ocupadas pela Ação + noites novas) que contém alguma noite nova
 * — uma reserva que preenche o intervalo entre duas soma as três.
 */
export function longestStayThrough(
  occupiedNights: readonly string[],
  newNights: readonly string[],
): number {
  const fresh = new Set(newNights.map(epochDay));
  const days = [...new Set([...occupiedNights.map(epochDay), ...fresh])].sort((a, b) => a - b);
  let longest = 0;
  let start = 0;
  for (let i = 0; i <= days.length; i += 1) {
    const broken = i === days.length || (i > 0 && days[i]! - days[i - 1]! !== 1);
    if (!broken) continue;
    const run = days.slice(start, i);
    if (run.some((day) => fresh.has(day))) longest = Math.max(longest, run.length);
    start = i;
  }
  return longest;
}
