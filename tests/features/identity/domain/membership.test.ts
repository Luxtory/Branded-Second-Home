import { describe, expect, it } from 'vitest';
import {
  isMembershipEligible,
  MEMBERSHIP_STATES,
  membershipTransition,
  type MembershipChange,
} from '@/features/identity/domain/membership';

describe('Membership — TECH-055 e elegibilidade (W15)', () => {
  it('[TECH-055] cada mudança só a partir dos estados da TECH-055; o resto é recusado', () => {
    const table = Object.fromEntries(
      (['suspend', 'reactivate', 'end'] as const).map((change: MembershipChange) => [
        change,
        Object.fromEntries(
          MEMBERSHIP_STATES.map((from) => [from, membershipTransition(from, change)]),
        ),
      ]),
    );
    expect(table).toEqual({
      suspend: { active: 'suspended', suspended: null, ended: null },
      reactivate: { active: null, suspended: 'active', ended: 'active' },
      end: { active: 'ended', suspended: 'ended', ended: null },
    });
  });

  it('[TECH-050][REQ-011] elegível = active; suspenso, encerrado ou sem Membership não', () => {
    expect(isMembershipEligible('active')).toBe(true);
    for (const state of ['suspended', 'ended', null] as const)
      expect(isMembershipEligible(state)).toBe(false);
  });
});
