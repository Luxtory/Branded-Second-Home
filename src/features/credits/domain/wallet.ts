import { compareQuantities, sumQuantities } from './credit';

/**
 * Estados do Crédito na Carteira (REQ-096; `03` §6): Disponível · Em Garantia · Consumido · Expirado · Indisponível por
 * Membership. "Indisponível por Membership" = saldo válido com uso bloqueado. O saldo de lote vencido ainda não
 * materializado pelo job já é Expirado (TECH-044: uso exige `now < expires_at`, independentemente de job).
 */
export const WALLET_STATES = [
  'available',
  'membership_blocked',
  'held',
  'consumed',
  'expired',
] as const;
export type WalletState = (typeof WALLET_STATES)[number];

export interface WalletLot {
  readonly id: string;
  readonly quantity: string;
  readonly held: string;
  readonly consumed: string;
  readonly expired: string;
  readonly available: string;
  readonly originatedAt: Date;
  readonly expiresAt: Date;
  readonly originCommand: string;
}

/** Situação de um lote na lista (a principal; os totais por estado ficam no saldo). */
export type LotSituation = 'usable' | 'membership_blocked' | 'held' | 'used' | 'expired';

export type WalletTotals = Readonly<Record<WalletState, string>>;

const isPositive = (value: string) => compareQuantities(value, '0') > 0;

export function isLotValid(lot: Pick<WalletLot, 'expiresAt'>, now: Date): boolean {
  return now.getTime() < lot.expiresAt.getTime();
}

/** Parte de cada estado num lote. */
export function lotStates(lot: WalletLot, membershipActive: boolean, now: Date): WalletTotals {
  const valid = isLotValid(lot, now);
  return {
    available: valid && membershipActive ? lot.available : '0',
    membership_blocked: valid && !membershipActive ? lot.available : '0',
    held: lot.held,
    consumed: lot.consumed,
    expired: valid ? lot.expired : sumQuantities([lot.expired, lot.available]),
  };
}

export function walletTotals(
  lots: readonly WalletLot[],
  membershipActive: boolean,
  now: Date,
): WalletTotals {
  const parts = lots.map((lot) => lotStates(lot, membershipActive, now));
  const total = (state: WalletState) => sumQuantities(parts.map((part) => part[state]));
  return {
    available: total('available'),
    membership_blocked: total('membership_blocked'),
    held: total('held'),
    consumed: total('consumed'),
    expired: total('expired'),
  };
}

export function lotSituation(lot: WalletLot, membershipActive: boolean, now: Date): LotSituation {
  if (!isLotValid(lot, now)) return 'expired';
  if (isPositive(lot.available)) return membershipActive ? 'usable' : 'membership_blocked';
  if (isPositive(lot.held)) return 'held';
  return 'used';
}

/** Lotes na ordem de uso (FEFO, PD-008): vencimento mais próximo, depois a originação mais antiga, depois `id`. */
export function fefoOrder<T extends Pick<WalletLot, 'id' | 'originatedAt' | 'expiresAt'>>(
  lots: readonly T[],
): T[] {
  return [...lots].sort(
    (a, b) =>
      a.expiresAt.getTime() - b.expiresAt.getTime() ||
      a.originatedAt.getTime() - b.originatedAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Tipo de movimento exibido no extrato (REQ-054), derivado do par do TECH-070. */
export type EntryKind =
  | 'originated'
  | 'held'
  | 'released'
  | 'released_expired'
  | 'consumed'
  | 'expired'
  | 'reversed'
  | 'reversed_expired';

export function entryKind(movement: string, toBucket: string): EntryKind {
  switch (movement) {
    case 'originate':
      return 'originated';
    case 'hold':
      return 'held';
    case 'release':
      return toBucket === 'expired' ? 'released_expired' : 'released';
    case 'consume':
      return 'consumed';
    case 'expire':
      return 'expired';
    case 'reverse':
      return toBucket === 'expired' ? 'reversed_expired' : 'reversed';
    default:
      throw new RangeError(`Unknown credit movement: ${movement}`);
  }
}

/** Sentido do movimento para o saldo utilizável: entra, sai ou só muda de estado. */
export function entryDirection(kind: EntryKind): 'in' | 'out' | 'neutral' {
  if (kind === 'originated' || kind === 'released' || kind === 'reversed') return 'in';
  if (kind === 'held' || kind === 'consumed' || kind === 'expired') return 'out';
  return 'neutral';
}
