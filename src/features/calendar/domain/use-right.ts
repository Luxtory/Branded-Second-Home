import { parseCivilDate, validateYear } from './civil-date';
import type { CivilDate } from './civil-calendar';

/**
 * Direito de Uso (W11; spec calendar §6): rotação ordinária (BR-101/BR-102), lista própria do 29/02 (BR-092 a BR-095,
 * TECH-042) e buckets do TECH-026/TECH-027. Funções puras sobre fatos imutáveis — posição sorteada na W9, data-base e
 * número de Ações da configuração (BR-077) —, sem estado mutável: nada consegue alterar a rotação (BR-106, REQ-032).
 */

export type UseRightBucket = 'alta' | 'media' | 'leap';

/** Configurações canônicas do `01` §8.1: o número de Ações nunca muda depois da formalização (BR-076, BR-077). */
const CANONICAL_STAKE_COUNTS: ReadonlySet<number> = new Set([2, 4, 8, 10]);

/** Ação com a posição inicial do sorteio auditável (W9, TECH-093): 1..N, sem repetição. */
export interface DrawnStake {
  readonly stakeId: string;
  readonly position: number;
}

export class InvalidDrawnOrderError extends RangeError {
  constructor(reason: string) {
    super(`Invalid drawn order: ${reason}`);
    this.name = 'InvalidDrawnOrderError';
  }
}

/** Módulo matemático não negativo: `-1 mod 4 = 3` (o `%` do JavaScript devolveria `-1`). */
export function nonNegativeModulo(value: number, modulus: number): number {
  if (!Number.isInteger(value) || !Number.isInteger(modulus) || modulus <= 0) {
    throw new RangeError('nonNegativeModulo requires integers and a positive modulus');
  }
  return ((value % modulus) + modulus) % modulus;
}

export function isLeapYear(year: number): boolean {
  validateYear(year);
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Anos bissextos gregorianos até `year` inclusive (`year ≥ 0`). */
function leapYearsThrough(year: number): number {
  return Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400);
}

/** Anos bissextos gregorianos em `[from, to)`. */
export function leapYearsBetween(from: number, to: number): number {
  validateYear(from);
  validateYear(to);
  if (to <= from) return 0;
  return leapYearsThrough(to - 1) - leapYearsThrough(from - 1);
}

function validateDrawnOrder(drawn: readonly DrawnStake[]): void {
  const n = drawn.length;
  if (!CANONICAL_STAKE_COUNTS.has(n)) throw new InvalidDrawnOrderError(`${n} stakes`);
  const positions = new Set(drawn.map((stake) => stake.position));
  const stakes = new Set(drawn.map((stake) => stake.stakeId));
  if (positions.size !== n || stakes.size !== n) throw new InvalidDrawnOrderError('duplicates');
  for (const position of positions) {
    if (!Number.isInteger(position) || position < 1 || position > n) {
      throw new InvalidDrawnOrderError(`position ${position}`);
    }
  }
}

function firstExercise(operationStartDate: CivilDate): number {
  return parseCivilDate(operationStartDate).year;
}

/**
 * BR-101: a cada exercício, a posição 1 passa à última e as demais avançam uma. No primeiro exercício (o ano da
 * data-base) vale a posição sorteada (BR-100, BR-109). Ao fim de N exercícios cada Ação ocupou cada posição uma vez
 * (BR-102).
 */
export function ordinaryPosition(input: {
  readonly initialPosition: number;
  readonly stakes: number;
  readonly operationStartDate: CivilDate;
  readonly exerciseYear: number;
}): number {
  const { initialPosition, stakes, exerciseYear } = input;
  validateYear(exerciseYear);
  const start = firstExercise(input.operationStartDate);
  if (exerciseYear < start) throw new RangeError('Exercise precedes the operation base date');
  if (!Number.isInteger(initialPosition) || initialPosition < 1 || initialPosition > stakes) {
    throw new InvalidDrawnOrderError(`position ${initialPosition}`);
  }
  return nonNegativeModulo(initialPosition - 1 - (exerciseYear - start), stakes) + 1;
}

/** Ordem ordinária do exercício: o índice `i` é a Ação da posição `i + 1`. */
export function ordinaryOrder(
  drawn: readonly DrawnStake[],
  operationStartDate: CivilDate,
  exerciseYear: number,
): readonly string[] {
  validateDrawnOrder(drawn);
  const order: string[] = new Array<string>(drawn.length);
  for (const stake of drawn) {
    const position = ordinaryPosition({
      initialPosition: stake.position,
      stakes: drawn.length,
      operationStartDate,
      exerciseYear,
    });
    order[position - 1] = stake.stakeId;
  }
  return order;
}

/**
 * BR-093: a primeira ocorrência de 29/02 da operação — o primeiro ano bissexto com 29/02 na data-base ou depois dela
 * (uma data-base em 29/02 conta: a noite é selada e operacional). Saltos de oito anos (2096 → 2104) são cobertos.
 */
export function firstLeapExercise(operationStartDate: CivilDate): number {
  const start = parseCivilDate(operationStartDate);
  for (let year = start.year; year <= start.year + 8; year += 1) {
    if (isLeapYear(year) && `${String(year).padStart(4, '0')}-02-29` >= operationStartDate)
      return year;
  }
  throw new RangeError('No February 29 within eight years of the operation base date');
}

/**
 * BR-093 a BR-095 (TECH-042): a lista bissexta é a ordem ordinária do primeiro exercício com 29/02 (`Y_L`) e nunca se
 * rederiva; no k-ésimo ano bissexto seguinte o direito é de `lista[k mod N]`, reiniciando na mesma ordem. Depende só
 * da posição sorteada, da data-base e de N — fatos imutáveis —, nunca da ordem ordinária de um ano bissexto posterior.
 * `null`: o exercício não tem 29/02 da operação.
 */
export function leapDayBeneficiary(input: {
  readonly drawn: readonly DrawnStake[];
  readonly operationStartDate: CivilDate;
  readonly exerciseYear: number;
}): string | null {
  const { drawn, operationStartDate, exerciseYear } = input;
  if (!isLeapYear(exerciseYear)) return null;
  const fixedIn = firstLeapExercise(operationStartDate);
  if (exerciseYear < fixedIn) return null;
  const list = ordinaryOrder(drawn, operationStartDate, fixedIn);
  return list[nonNegativeModulo(leapYearsBetween(fixedIn, exerciseYear), list.length)]!;
}

/** Bucket que uma noite consome (TECH-027): o 29/02 é Média/Baixa, mas só consome o saldo extraordinário. */
export function bucketOfNight(night: {
  readonly season: 'alta' | 'media';
  readonly isLeapDay: boolean;
}): UseRightBucket {
  return night.isLeapDay ? 'leap' : night.season;
}
