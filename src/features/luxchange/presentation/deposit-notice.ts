import { DEPOSIT_MIN_NOTICE_HOURS, withinNotice } from '../domain/deposit';
import type { DepositNightView } from './deposit-read';

const HOUR_MS = 3_600_000;
/** Reavaliação de segurança do calendário aberto (relógio do aparelho suspenso, aba em segundo plano). */
export const NOTICE_RECHECK_MS = 60_000;

/** Último instante em que a noite ainda pode ser depositada: check-in oficial − 336 h (BR-200, TECH-043). */
export const noticeDeadline = (checkinAt: string) =>
  Date.parse(checkinAt) - DEPOSIT_MIN_NOTICE_HOURS * HOUR_MS;

const selectable = (night: DepositNightView) =>
  night.status === 'eligible' || night.status === 'no_reference';

/**
 * Antecedência reaplicada no instante `nowMs` (W20; regra da Luxtory de 336 h): a tela lida pelo servidor não deixa uma
 * noite selecionável depois do prazo. Noite que passou do prazo vira `notice` (sem Créditos nem reserva); no Co-Owner, a
 * reserva inteira deixa de ser cedível se qualquer noite dela passou. Só apresentação: o command e o banco revalidam com
 * o relógio do banco.
 */
export function applyNotice(
  nights: readonly DepositNightView[],
  nowMs: number,
): readonly DepositNightView[] {
  const late = (night: DepositNightView) =>
    selectable(night) && !withinNotice(night.checkinAt, nowMs);
  const lateBookings = new Set(
    nights.flatMap((night) => (night.bookingId !== null && late(night) ? [night.bookingId] : [])),
  );
  return nights.map((night) =>
    late(night) || (night.bookingId !== null && lateBookings.has(night.bookingId))
      ? { ...night, status: 'notice', credits: null, bookingId: null }
      : night,
  );
}

/** Próximo instante em que uma noite hoje selecionável deixa de ser (`null` se nenhuma): reavaliar exatamente ali. */
export function nextNoticeChange(
  nights: readonly DepositNightView[],
  nowMs: number,
): number | null {
  let next: number | null = null;
  for (const night of nights) {
    if (!selectable(night)) continue;
    const deadline = noticeDeadline(night.checkinAt);
    if (deadline >= nowMs && (next === null || deadline < next)) next = deadline;
  }
  return next === null ? null : next + 1;
}
