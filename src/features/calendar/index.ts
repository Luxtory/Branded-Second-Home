import { civilCalendar } from './domain/civil-calendar';
import type { CivilCalendar } from './domain/civil-calendar';
import { temporalCivilTime } from './infrastructure/temporal-civil-time';

export type {
  CivilCalendar,
  CivilDate,
  FutureCapacity,
  FutureCapacityInput,
  NightClassification,
  Season,
} from './domain/civil-calendar';

export function createCivilCalendar(): CivilCalendar {
  return civilCalendar(temporalCivilTime);
}
