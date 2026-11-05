/**
 * Ordem total de locks do TECH-053. Um command trava só as classes de que precisa, nesta ordem, e as linhas de uma
 * mesma classe em ordem crescente da chave indicada.
 */
export const LOCK_CLASSES = [
  'luxchange_request', // por id
  'rental_offer', // por id
  'membership', // por party_id
  'stake', // por id
  'second_home_date', // por (second_home_id, stay_date)
  'balance_and_custody', // mesma ordem de Data-SecondHome
  'credit_lot', // por (expires_at, originated_at, id)
  'payment', // por id
] as const;

export type LockClass = (typeof LOCK_CLASSES)[number];

/**
 * Extensão do ADR-0027 §2 (a TECH-053 não lista a reserva): a trava da reserva de uso próprio (`app.booking:<id>`, a
 * mesma chave dos gatilhos da W13) fica entre `second_home_date` (classe 5) e `balance_and_custody` (classe 6).
 * `LOCK_CLASSES` continua o espelho exato da TECH-053; commands que não travam reserva não mudam.
 */
export const LOCK_ORDER = [
  ...LOCK_CLASSES.slice(0, 5),
  'booking',
  ...LOCK_CLASSES.slice(5),
] as const;

export type OrderedLockClass = (typeof LOCK_ORDER)[number];

/**
 * Chave de uma linha: um valor ou uma tupla, sempre em texto comparável na mesma ordem do PostgreSQL (uuid em hexa
 * minúsculo, datas `YYYY-MM-DD`, instantes ISO 8601 em UTC com a mesma precisão).
 */
export type LockKey = string | readonly string[];

export class LockOrderViolation extends Error {
  constructor(message: string) {
    super(`TECH-053 lock order violated: ${message}`);
    this.name = 'LockOrderViolation';
  }
}

const asTuple = (key: LockKey): readonly string[] => (typeof key === 'string' ? [key] : key);

function compareKeys(left: LockKey, right: LockKey): number {
  const a = asTuple(left);
  const b = asTuple(right);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

/** Controla a ordem dos locks de uma transação de command; erro de ordem é bug, nunca causa de negócio. */
export class LockSequence {
  private classIndex = -1;
  private lastKey: LockKey | null = null;

  /** Registra o lock de `keys` em `lockClass` e devolve as chaves, sem repetição, na ordem em que devem ser travadas. */
  claim<K extends LockKey>(lockClass: OrderedLockClass, keys: readonly K[]): K[] {
    const index = LOCK_ORDER.indexOf(lockClass);
    if (index < this.classIndex) {
      throw new LockOrderViolation(`${lockClass} after ${LOCK_ORDER[this.classIndex]}`);
    }
    const sorted = [...keys]
      .sort(compareKeys)
      .filter((key, i, all) => i === 0 || compareKeys(all[i - 1] as K, key) !== 0);
    const first = sorted[0];
    const last = sorted.at(-1);
    if (first === undefined || last === undefined) return [];
    if (
      index === this.classIndex &&
      this.lastKey !== null &&
      compareKeys(first, this.lastKey) <= 0
    ) {
      throw new LockOrderViolation(`${lockClass} keys must keep ascending across claims`);
    }
    this.classIndex = index;
    this.lastKey = last;
    return sorted;
  }
}
