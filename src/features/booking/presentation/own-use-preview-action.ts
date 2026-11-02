'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createPostgresOwnUseRights, createUseWindowResolver } from '@/features/calendar/booking';
import { requireTitularSession } from '@/features/identity';
import { createOwnUseInventory } from '@/features/inventory';
import { findUseRightFacts } from '@/features/ownership';
import {
  getDatabase,
  rootLogger,
  unavailableKeys,
  withUserThenServerRead,
} from '@/features/platform';
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
  | {
      readonly status: 'ok';
      readonly preview: OwnUsePreview;
      /** Ativação privilegiada no mesmo instantâneo (ADR-0026): fechada, não há confirmação a oferecer. */
      readonly bookingOpen: boolean;
      /** Só numa prévia válida com as reservas abertas (a mesma intenção = a mesma chave). */
      readonly key: string | null;
    }
  | { readonly status: 'invalid' | 'unauthenticated' | 'forbidden' | 'unavailable' };

const deps = {
  store: createPostgresBookingStore(),
  inventory: createOwnUseInventory(),
  rights: createPostgresOwnUseRights(),
  findFacts: findUseRightFacts,
  windowOpensAt: createUseWindowResolver(),
};

/**
 * Prévia da reserva (spec booking §7, ADR-0026 D6): numa única transação só de leitura e num único instantâneo, a RLS
 * prova que o usuário representa a holding e o servidor confere as regras do command, sem travas nem escrita, e lê o
 * estado da ativação. A saída é só desta holding (motivos com datas, nunca quem ocupa) — nada além do que o usuário já
 * lê pela RLS, exceto o resultado da regra. A chave de idempotência nasce aqui, só para uma prévia válida com as
 * reservas abertas. Nunca decide: a confirmação revalida tudo no banco.
 */
export async function previewOwnUseBookingAction(raw: unknown): Promise<OwnUsePreviewResponse> {
  const parsed = previewInput.safeParse(raw);
  if (!parsed.success) return { status: 'invalid' };
  const input = parsed.data;
  const session = await requireTitularSession();
  if (session === 'unavailable') return { status: 'unauthenticated' };
  const db = getDatabase();
  try {
    const result = await withUserThenServerRead(
      db,
      { sub: session.userId, role: 'authenticated' },
      (tx) => readRepresentedHolding(tx, input.holdingId),
      async (tx, holding) => ({
        bookingOpen: await deps.store.isActivated(tx),
        preview: await previewOwnUseBooking(deps, tx, {
          holding: {
            holdingId: holding.id,
            secondHomeId: holding.second_home_id,
            role: holding.role === 'owner' ? 'owner' : 'co_owner',
            stakeId: holding.stake_id,
          },
          checkinDate: input.checkinDate,
          checkoutDate: input.checkoutDate,
          now: new Date(),
        }),
      }),
    );
    if (result === null) return { status: 'forbidden' };
    const { preview, bookingOpen } = result;
    return {
      status: 'ok',
      preview,
      bookingOpen,
      key: preview.ok && bookingOpen ? randomUUID() : null,
    };
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    rootLogger.warn('own use booking preview unavailable', { command: 'create_own_use_booking' });
    return { status: 'unavailable' };
  }
}
