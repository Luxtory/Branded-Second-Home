import { describe, expect, it } from 'vitest';
import { translateOwnUseOutcome } from '@/features/booking/presentation/own-use-outcome';

// Tradução do desfecho da confirmação (ADR-0026 D6, auditoria do PR #78): resultado incerto só pela idempotência do
// executor; nada inferido por Second Home e datas.
const state = { key: 'k-1', message: null };
const newKey = () => 'k-2';

describe('desfecho da confirmação de uso próprio', () => {
  it('[ADR-0026] confirmada (nova ou replay da mesma chave) → página da reserva', () => {
    expect(
      translateOwnUseOutcome(state, { status: 'committed', result: { booking_id: 'b-1' } }, newKey),
    ).toEqual({ kind: 'redirect', to: '/titular/reservas/b-1' });
  });

  it('[ADR-0026][D6] conflito é conflito: nenhuma reserva de outra holding vira "já confirmada"', () => {
    expect(
      translateOwnUseOutcome(
        state,
        { status: 'rejected', code: 'ERR_BOOKING_CONFLICT', operationId: 'op-1' },
        newKey,
      ),
    ).toEqual({ kind: 'state', state: { key: 'k-2', message: 'conflict' } });
  });

  it('[ADR-006] recusa antes da operação mantém a chave; recusa gravada troca (intenção nova)', () => {
    expect(
      translateOwnUseOutcome(
        state,
        { status: 'rejected', code: 'ERR_PERMISSION', operationId: null },
        newKey,
      ),
    ).toEqual({ kind: 'state', state: { key: 'k-1', message: 'permission' } });
    expect(
      translateOwnUseOutcome(
        state,
        { status: 'rejected', code: 'ERR_IDEMPOTENCY_CONFLICT', operationId: 'op-2' },
        newKey,
      ),
    ).toEqual({ kind: 'state', state: { key: 'k-2', message: 'unexpected' } });
  });

  it('[ADR-0026] incerto ou fechado mantém a chave: o retry é replay do executor; sem sessão → entrar', () => {
    expect(translateOwnUseOutcome(state, 'unavailable', newKey)).toEqual({
      kind: 'state',
      state: { key: 'k-1', message: 'unavailable' },
    });
    expect(translateOwnUseOutcome(state, 'not_activated', newKey)).toEqual({
      kind: 'state',
      state: { key: 'k-1', message: 'closed' },
    });
    expect(translateOwnUseOutcome(state, { status: 'unauthenticated' }, newKey)).toEqual({
      kind: 'redirect',
      to: '/titular/entrar',
    });
  });
});
