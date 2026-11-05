import { Temporal } from 'temporal-polyfill';
import type { Micros } from '../domain/own-use-lifecycle';

/**
 * Instantes do ciclo da reserva entre o banco e o domínio, sem `Date` (spec booking §10.12, D10): lidos como
 * `(extract(epoch FROM x) * 1000000)::bigint` — `extract` devolve `numeric` exato no PostgreSQL 17 — e escritos como ISO
 * com 6 casas, o que o `timestamptz` guarda sem arredondar.
 */
export const microsToIso = (value: Micros): string =>
  Temporal.Instant.fromEpochNanoseconds(value * 1000n).toString({ smallestUnit: 'microsecond' });

/** Valor de `(extract(epoch FROM x) * 1000000)::bigint::text`. */
export const microsFromText = (value: string): Micros => BigInt(value);
