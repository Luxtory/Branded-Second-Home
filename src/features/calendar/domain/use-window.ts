import { parseCivilDate } from './civil-date';
import type { CivilDate } from './civil-calendar';
import { ordinaryPosition, type DrawnStake } from './use-right';
import type { UseRightCalendar } from './use-right-calendar';

/** Fatos imutáveis que decidem a janela de uma Ação (formalização W8 e sorteio W9). */
export interface UseWindowFacts {
  readonly operationStartDate: CivilDate;
  readonly formalizedAt: Date;
  readonly timezone: string;
  /** `null` enquanto o sorteio não foi revelado. */
  readonly drawn: readonly DrawnStake[] | null;
}

/**
 * TECH-042 (spec calendar §6, W12): abertura da janela de uso da Ação no exercício — posição ordinária da BR-101 a partir
 * da sorteada, `base + (p − 1) × 7 dias` civis; o 29/02 abre na base para a Ação contemplada. Gêmea do SQL
 * `app.use_window_opens_at` (equivalência testada). `null` = sem sorteio revelado, Ação fora dele, exercício anterior
 * ao primeiro ou horário local inexistente/ambíguo — falha fechada, como no banco.
 */
export function stakeWindowOpensAt(
  calendar: UseRightCalendar,
  facts: UseWindowFacts,
  stakeId: string,
  exerciseYear: number,
  isLeapDay: boolean,
): Date | null {
  const stake = facts.drawn?.find((candidate) => candidate.stakeId === stakeId);
  if (facts.drawn === null || stake === undefined) return null;
  if (exerciseYear < parseCivilDate(facts.operationStartDate).year) return null;
  const base = { exerciseYear, formalizedAt: facts.formalizedAt, timezone: facts.timezone };
  try {
    if (isLeapDay) return calendar.windowBase(base);
    const position = ordinaryPosition({
      initialPosition: stake.position,
      stakes: facts.drawn.length,
      operationStartDate: facts.operationStartDate,
      exerciseYear,
    });
    return calendar.windowOpensAt({ ...base, position, stakes: facts.drawn.length });
  } catch (error) {
    // Horário local rejeitado (Temporal) ou fatos fora do domínio: sem janela, nunca uma janela presumida.
    if (error instanceof RangeError) return null;
    throw error;
  }
}
