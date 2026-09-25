import type { Clock } from '../application/clock';

export const systemClock: Clock = {
  now: () => new Date(),
};
