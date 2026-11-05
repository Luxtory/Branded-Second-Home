import type { Micros } from '../domain/own-use-lifecycle';

export { isoFromMicros as microsToIso } from '../domain/own-use-lifecycle';

/**
 * Instantes do ciclo da reserva entre o banco e o domínio, sem `Date` (spec booking §10.12, D10): lidos como
 * `(extract(epoch FROM x) * 1000000)::bigint` — `extract` devolve `numeric` exato no PostgreSQL 17 — e escritos como ISO
 * com 6 casas (`isoFromMicros`), o que o `timestamptz` guarda sem arredondar. Este é o valor lido.
 */
export const microsFromText = (value: string): Micros => BigInt(value);
