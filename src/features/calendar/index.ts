import { civilCalendar } from './domain/civil-calendar';
import type { CivilCalendar } from './domain/civil-calendar';
import { temporalCivilTime } from './infrastructure/temporal-civil-time';

export type {
  CivilCalendar,
  CivilDate,
  ExerciseNightsInput,
  FutureCapacity,
  FutureCapacityInput,
  NightClassification,
  SealedNight,
  Season,
} from './domain/civil-calendar';
// W10: o job `open_exercise` sai por `@/features/calendar/jobs`, mantendo este índice sem dependências de servidor.

export function createCivilCalendar(): CivilCalendar {
  return civilCalendar(temporalCivilTime);
}
