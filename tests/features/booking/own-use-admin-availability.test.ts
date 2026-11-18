import { describe, expect, it } from 'vitest';
import {
  adminActAvailability,
  requestablePurposes,
  type AdminFacts,
} from '@/features/booking/application/own-use-admin-availability';

// W13 E4b (spec booking §10.15): disponibilidade dos atos do Admin com o motivo; o servidor revalida tudo na escrita.
const facts = (over: Partial<AdminFacts> = {}): AdminFacts => ({
  state: 'confirmed',
  modality: 'co_owner',
  exceptionType: null,
  lifecycleOpen: true,
  beforeCheckout: true,
  noShowWindowOpen: false,
  unstartedDates: ['2026-12-11'],
  recoverableCustodies: 0,
  ...over,
});
const map = (f: AdminFacts) =>
  Object.fromEntries(adminActAvailability(f).map((a) => [a.act, a.reason ?? 'ok']));

describe('W13 E4b — atos do Admin disponíveis', () => {
  it('[ADR-0027 §5] K2 ausente: nenhum ato, nem a solicitação', () => {
    expect(new Set(Object.values(map(facts({ lifecycleOpen: false }))))).toEqual(
      new Set(['lifecycle_closed']),
    );
  });

  it('[TECH-055] confirmada antes do check-in: só abrir exceção', () => {
    expect(map(facts())).toEqual({
      resolve: 'not_in_exception',
      invalidation: 'not_unauthorized_co_owner',
      no_show: 'no_show_window',
      recovery: 'nothing_recoverable',
      request: 'nothing_to_request',
      open_exception: 'ok',
    });
  });

  it('[TECH-046] janela de comparecimento aberta: no-show e solicitação de no-show', () => {
    const f = facts({ state: 'in_use', noShowWindowOpen: true });
    expect(map(f)).toMatchObject({ no_show: 'ok', request: 'ok', open_exception: 'ok' });
    expect(requestablePurposes(f)).toEqual(['no_show']);
  });

  it('[PD-010] exceção operacional: resolver e solicitar cancelamento por exceção; no-show indisponível', () => {
    const f = facts({ state: 'in_exception', exceptionType: 'operational' });
    expect(map(f)).toMatchObject({
      resolve: 'ok',
      request: 'ok',
      no_show: 'exception_open',
      open_exception: 'exception_open',
      invalidation: 'not_unauthorized_co_owner',
    });
    expect(requestablePurposes(f)).toEqual(['exception_cancellation']);
  });

  it('[REQ-084] apuração de Co-Owner: invalidação; de Owner, pela resolução (cancelar com autorização)', () => {
    const co = facts({ state: 'in_exception', exceptionType: 'unauthorized_booking' });
    expect(map(co)).toMatchObject({ invalidation: 'ok', resolve: 'ok' });
    expect(requestablePurposes(co)).toEqual(['invalidation']);
    expect(map({ ...co, modality: 'owner' })).toMatchObject({
      invalidation: 'not_unauthorized_co_owner',
    });
    expect(map({ ...co, unstartedDates: [] })).toMatchObject({
      invalidation: 'nothing_unstarted',
      request: 'nothing_to_request',
    });
  });

  it('[BR-284] capacidade futura recuperável: recuperação e solicitação de recuperação, mesmo com a reserva encerrada', () => {
    const f = facts({ state: 'cancelled', recoverableCustodies: 3, unstartedDates: [] });
    expect(map(f)).toMatchObject({
      recovery: 'ok',
      request: 'ok',
      open_exception: 'state',
      no_show: 'state',
    });
    expect(requestablePurposes(f)).toEqual(['recovery']);
  });

  it('[TECH-055] depois do check-out não se abre exceção', () => {
    expect(map(facts({ state: 'in_use', beforeCheckout: false }))).toMatchObject({
      open_exception: 'after_checkout',
    });
  });
});
