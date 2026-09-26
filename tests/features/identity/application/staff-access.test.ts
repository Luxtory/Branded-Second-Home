import { describe, expect, it } from 'vitest';
import { resolveStaffAccess } from '@/features/identity/application/staff-access';
import { STAFF_USER, staffDirectory } from '../../../support/identity-fixtures';

const clock = { now: () => new Date('2026-09-15T00:00:00.000Z') };

describe('acesso à superfície Admin (TECH-050)', () => {
  it('[TECH-050] sem sessão → anônimo; AAL1 → segundo fator antes de revelar o papel', async () => {
    const staff = staffDirectory({ [STAFF_USER]: [{ id: 'r1', role: 'admin' }] });

    await expect(resolveStaffAccess(null, staff, clock)).resolves.toEqual({ kind: 'anonymous' });
    await expect(
      resolveStaffAccess({ userId: STAFF_USER, assurance: 'aal1' }, staff, clock),
    ).resolves.toEqual({ kind: 'mfa_required' });
  });

  it('[TECH-050] AAL2 sem papel ativo → proibido; com papéis → lista sem repetição', async () => {
    const session = { userId: STAFF_USER, assurance: 'aal2' } as const;
    const both = staffDirectory({
      [STAFF_USER]: [
        { id: 'r2', role: 'super_admin' },
        { id: 'r1', role: 'admin' },
      ],
    });

    await expect(resolveStaffAccess(session, staffDirectory({}), clock)).resolves.toEqual({
      kind: 'forbidden',
    });
    await expect(resolveStaffAccess(session, both, clock)).resolves.toEqual({
      kind: 'granted',
      userId: STAFF_USER,
      roles: ['admin', 'super_admin'],
    });
  });
});
