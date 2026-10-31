// Superfície pública de servidor do calendar para a reserva de uso próprio (W12, spec booking): janela da Ação, bucket
// da noite e o consumo do Direito de Uso no ledger, na transação do command do booking. Fica fora de `index.ts` para que
// o calendário civil continue sem dependências de servidor (como `jobs.ts`).
import { createUseRightCalendar } from './domain/use-right-calendar';
import { stakeWindowOpensAt, type UseWindowFacts } from './domain/use-window';
import { temporalCivilTime } from './infrastructure/temporal-civil-time';

export { bucketOfNight, type UseRightBucket } from './domain/use-right';
export type { UseWindowFacts } from './domain/use-window';
export {
  balanceKey,
  createPostgresOwnUseRights,
  type BalanceKey,
  type OwnUseConsumption,
} from './infrastructure/postgres-own-use-rights';

export type UseWindowResolver = (
  facts: UseWindowFacts,
  stakeId: string,
  exerciseYear: number,
  isLeapDay: boolean,
) => Date | null;

/** Abertura da janela de uso da Ação no exercício, no fuso da Second Home (TECH-042); `null` = sem janela. */
export function createUseWindowResolver(): UseWindowResolver {
  const calendar = createUseRightCalendar(temporalCivilTime);
  return (facts, stakeId, exerciseYear, isLeapDay) =>
    stakeWindowOpensAt(calendar, facts, stakeId, exerciseYear, isLeapDay);
}
