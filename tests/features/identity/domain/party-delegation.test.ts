import { describe, expect, it } from 'vitest';
import { delegationStatus, isDelegationCurrent } from '@/features/identity/domain/party-delegation';
import { delegation } from '../../../support/identity-fixtures';

const at = new Date('2026-09-15T00:00:00.000Z');

describe('party_delegation — vigência derivada (TECH-050, spec identity §13.3)', () => {
  it('[TECH-050] só a delegação ativa, iniciada e antes do fim é vigente', () => {
    expect(isDelegationCurrent(delegation(), at)).toBe(true);
    expect(
      isDelegationCurrent(delegation({ validUntil: new Date('2026-09-16T00:00:00Z') }), at),
    ).toBe(true);
  });

  it.each([
    [
      'pendente (convite enviado ≠ delegação ativa)',
      delegation({ state: 'pending', activatedAt: null }),
    ],
    ['revogada', delegation({ state: 'revoked', revokedAt: at })],
    ['expirada no próprio instante do fim', delegation({ validUntil: at })],
    ['ainda não iniciada', delegation({ validFrom: new Date('2026-09-20T00:00:00Z') })],
  ])('[TECH-050] não é vigente: %s', (_case, item) => {
    expect(isDelegationCurrent(item, at)).toBe(false);
  });

  it('[TECH-050] a situação exibida deriva a expiração, nunca gravada', () => {
    expect(delegationStatus(delegation({ state: 'pending', activatedAt: null }), at)).toBe(
      'pending',
    );
    expect(
      delegationStatus(delegation({ state: 'pending', activatedAt: null, validUntil: at }), at),
    ).toBe('expired');
    expect(delegationStatus(delegation({ validUntil: at }), at)).toBe('expired');
    expect(
      delegationStatus(delegation({ state: 'revoked', revokedAt: at, validUntil: at }), at),
    ).toBe('revoked');
  });
});
