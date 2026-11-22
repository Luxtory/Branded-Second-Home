import { sql } from 'kysely';
import {
  readTitularOverview,
  type TitularRepresentationSummary,
  type VerifiedSession,
} from '@/features/identity';
import {
  getDatabase,
  systemClock,
  withUserRead,
  type Clock,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import { canonicalQuantity, sumQuantities } from '../domain/credit';
import {
  entryKind,
  fefoOrder,
  lotSituation,
  walletTotals,
  type EntryKind,
  type LotSituation,
  type WalletLot,
  type WalletTotals,
} from '../domain/wallet';
import type { CreditMovement } from './i18n/wallet-pt-br';
import { STATEMENT_PAGE_SIZE, pageCount, type WalletQuery } from './wallet-format';

/**
 * Leitura da Carteira (W17, spec credits §5.4; REQ-053, REQ-054, REQ-096) sob RLS (TECH-052): `authenticated` com as
 * claims verificadas só enxerga lotes e movimentos das parties que o usuário representa por delegação vigente — uma party
 * de outra pessoa simplesmente não aparece. Sem base das reversões nem movimento-pai (fora do `GRANT` de coluna).
 */
export interface WalletLotView extends WalletLot {
  readonly situation: LotSituation;
}

export interface WalletEntryView {
  readonly id: string;
  readonly lotId: string;
  readonly operationId: string;
  readonly command: string;
  readonly kind: EntryKind;
  readonly quantity: string;
  readonly createdAt: Date;
}

export interface WalletStatement {
  readonly items: readonly WalletEntryView[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
  readonly movement: CreditMovement | null;
}

export interface WalletView {
  readonly party: TitularRepresentationSummary;
  /** Outras parties representadas (seletor), na ordem da Área do Titular. */
  readonly parties: readonly TitularRepresentationSummary[];
  readonly membershipActive: boolean;
  readonly totals: WalletTotals;
  readonly lots: readonly WalletLotView[];
  readonly statement: WalletStatement;
}

export interface WalletReadDependencies {
  readonly db?: Database;
  readonly clock?: Clock;
  readonly overview?: typeof readTitularOverview;
}

interface LotRow {
  readonly id: string;
  readonly quantity: string;
  readonly held: string;
  readonly consumed: string;
  readonly expired: string;
  readonly available: string;
  readonly originated_at: Date;
  readonly expires_at: Date;
  readonly origin_command: string;
}

interface EntryRow {
  readonly id: string;
  readonly lot_id: string;
  readonly operation_id: string;
  readonly command: string;
  readonly movement: string;
  readonly to_bucket: string;
  readonly quantity: string;
  readonly created_at: Date;
}

const toLot = (row: LotRow): WalletLot => ({
  id: row.id,
  quantity: canonicalQuantity(row.quantity),
  held: canonicalQuantity(row.held),
  consumed: canonicalQuantity(row.consumed),
  expired: canonicalQuantity(row.expired),
  available: canonicalQuantity(row.available),
  originatedAt: new Date(row.originated_at),
  expiresAt: new Date(row.expires_at),
  originCommand: row.origin_command,
});

const toEntry = (row: EntryRow): WalletEntryView => ({
  id: row.id,
  lotId: row.lot_id,
  operationId: row.operation_id,
  command: row.command,
  kind: entryKind(row.movement, row.to_bucket),
  quantity: canonicalQuantity(row.quantity),
  createdAt: new Date(row.created_at),
});

async function partyLots(tx: DatabaseTransaction, partyId: string): Promise<LotRow[]> {
  const { rows } = await sql<LotRow>`
    SELECT id, quantity::text, held::text, consumed::text, expired::text, available::text, originated_at, expires_at,
           origin_command
      FROM app.credit_lot WHERE party_id = ${partyId}`.execute(tx);
  return rows;
}

async function partyEntries(
  tx: DatabaseTransaction,
  partyId: string,
  movement: CreditMovement | null,
  page: number,
): Promise<{ rows: EntryRow[]; total: number }> {
  const byMovement = movement === null ? sql`TRUE` : sql`e.movement = ${movement}`;
  const scope = sql`l.party_id = ${partyId} AND ${byMovement}`;
  const { rows: counted } = await sql<{ total: string }>`
    SELECT count(*)::text AS total
      FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id WHERE ${scope}`.execute(tx);
  const total = Number(counted[0]?.total ?? '0');
  const current = Math.min(page, pageCount(total));
  const { rows } = await sql<EntryRow>`
    SELECT e.id, e.lot_id, e.operation_id, e.command, e.movement, e.to_bucket, e.quantity::text, e.created_at
      FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id
     WHERE ${scope}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ${STATEMENT_PAGE_SIZE} OFFSET ${(current - 1) * STATEMENT_PAGE_SIZE}`.execute(tx);
  return { rows, total };
}

/**
 * Carteira da party pedida (ou da primeira representada). Sem representação vigente → `null`; party pedida que o
 * usuário não representa → a primeira representada (mesma resposta para inexistente e alheia, sem oráculo).
 */
export async function readWallet(
  session: VerifiedSession,
  query: WalletQuery,
  deps: WalletReadDependencies = {},
): Promise<WalletView | null> {
  const db = deps.db ?? getDatabase();
  const now = (deps.clock ?? systemClock).now();
  const overview = await (deps.overview ?? readTitularOverview)(session, { db });
  const parties = overview.representations;
  const party = parties.find((item) => item.partyId === query.partyId) ?? parties[0];
  if (party === undefined) return null;
  const membershipActive = party.membership?.state === 'active';
  const { lots, entries } = await withUserRead(
    db,
    { sub: session.userId, role: 'authenticated' },
    async (tx) => ({
      lots: (await partyLots(tx, party.partyId)).map(toLot),
      entries: await partyEntries(tx, party.partyId, query.movement, query.page),
    }),
  );
  const pages = pageCount(entries.total);
  return {
    party,
    parties,
    membershipActive,
    totals: walletTotals(lots, membershipActive, now),
    lots: fefoOrder(lots).map((lot) => ({
      ...lot,
      situation: lotSituation(lot, membershipActive, now),
    })),
    statement: {
      items: entries.rows.map(toEntry),
      total: entries.total,
      page: Math.min(query.page, pages),
      pages,
      movement: query.movement,
    },
  };
}

/** Saldo disponível agora somado entre as parties representadas (seção da Área do Titular); `null` = nenhum lote. */
export async function readWalletSummary(
  session: VerifiedSession,
  deps: WalletReadDependencies = {},
): Promise<{ readonly available: string } | null> {
  const db = deps.db ?? getDatabase();
  const now = (deps.clock ?? systemClock).now();
  const overview = await (deps.overview ?? readTitularOverview)(session, { db });
  if (overview.representations.length === 0) return null;
  const parties = await withUserRead(
    db,
    { sub: session.userId, role: 'authenticated' },
    async (tx) => {
      const result: { active: boolean; lots: WalletLot[] }[] = [];
      for (const party of overview.representations)
        result.push({
          active: party.membership?.state === 'active',
          lots: (await partyLots(tx, party.partyId)).map(toLot),
        });
      return result;
    },
  );
  if (parties.every((item) => item.lots.length === 0)) return null;
  return {
    available: sumQuantities(
      parties.map((item) => walletTotals(item.lots, item.active, now).available),
    ),
  };
}
