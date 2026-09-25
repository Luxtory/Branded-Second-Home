/** Relógio injetável (TECH-110): todo código que depende do instante atual recebe um `Clock`. */
export interface Clock {
  now(): Date;
}
