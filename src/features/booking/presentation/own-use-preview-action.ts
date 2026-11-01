'use server';

import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { createPostgresOwnUseRights, createUseWindowResolver } from '@/features/calendar/booking';
import { requireTitularSession } from '@/features/identity';
import { createOwnUseInventory } from '@/features/inventory';
import { findUseRightFacts } from '@/features/ownership';
import { getDatabase, rootLogger, unavailableKeys, withUserRead } from '@/features/platform';
import { previewOwnUseBooking, type OwnUsePreview } from '../application/preview-own-use-booking';
import { createPostgresBookingStore } from '../infrastructure/postgres-booking-store';
import { readRepresentedHolding } from './own-use-calendar-read';

const civilDate = z.iso.date();
const DAY_MS = 86_400_000;
/** Teto do intervalo da prévia: dois exercícios selados (P-14, D3) com folga — nada além disso existe como capacidade. */
const MAX_PREVIEW_NIGHTS = 800;
const nightsBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const previewInput = z
  .strictObject({ holdingId: z.uuid(), checkinDate: civilDate, checkoutDate: civilDate })
  .refine((value) => nightsBetween(value.checkinDate, value.checkoutDate) <= MAX_PREVIEW_NIGHTS);

export type OwnUsePreviewResponse =
  | { readonly status: 'ok'; readonly preview: OwnUsePreview; readonly key: string | null }
  | { readonly status: 'invalid' | 'unauthenticated' | 'forbidden' | 'unavailable' };

const deps = {
  store: createPostgresBookingStore(),
  inventory: createOwnUseInventory(),
  rights: createPostgresOwnUseRights(),
  findFacts: findUseRightFacts,
  windowOpensAt: createUseWindowResolver(),
};

/**
 * Prévia da reserva (spec booking §7, ADR-0026 D6): a RLS prova que o usuário representa a holding agora; depois o
 * servidor confere as regras do command numa transação só de leitura, sem travas nem escrita. A chave de idempotência
 * nasce aqui, só para uma prévia válida (a mesma intenção = a mesma chave). Nunca decide: a confirmação revalida tudo.
 */
export async function previewOwnUseBookingAction(raw: unknown): Promise<OwnUsePreviewResponse> {
  const parsed = previewInput.safeParse(raw);
  if (!parsed.success) return { status: 'invalid' };
  const input = parsed.data;
  const session = await requireTitularSession();
  if (session === 'unavailable') return { status: 'unauthenticated' };
  const db = getDatabase();
  try {
    const holding = await withUserRead(db, { sub: session.userId, role: 'authenticated' }, (tx) =>
      readRepresentedHolding(tx, input.holdingId),
    );
    if (holding === null) return { status: 'forbidden' };
    const preview = await db.transaction().execute(async (tx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      return previewOwnUseBooking(deps, tx, {
        holding: {
          secondHomeId: holding.second_home_id,
          role: holding.role === 'owner' ? 'owner' : 'co_owner',
          stakeId: holding.stake_id,
        },
        checkinDate: input.checkinDate,
        checkoutDate: input.checkoutDate,
        now: new Date(),
      });
    });
    return { status: 'ok', preview, key: preview.ok ? randomUUID() : null };
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    rootLogger.warn('own use booking preview unavailable', { command: 'create_own_use_booking' });
    return { status: 'unavailable' };
  }
}
