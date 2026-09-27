import { describe, expect, it } from 'vitest';
import { grantCovers, isGrantActive } from '@/features/identity/domain/grant';
import { grant, PARTNER_OPERATION, SCOPE } from '../../../support/identity-fixtures';

const inside = new Date('2026-09-15T00:00:00.000Z');

describe('authorization_grant — vigência, command e escopo (REQ-014)', () => {
  it('[REQ-014] vigência é [valid_from, valid_until): começa no início e termina antes do fim', () => {
    const subject = grant();

    expect(isGrantActive(subject, subject.validFrom)).toBe(true);
    expect(isGrantActive(subject, inside)).toBe(true);
    expect(isGrantActive(subject, new Date(subject.validFrom.getTime() - 1))).toBe(false);
    expect(isGrantActive(subject, subject.validUntil)).toBe(false);
  });

  it('[REQ-014] grant revogado não vale, mesmo dentro da vigência', () => {
    expect(isGrantActive(grant({ revokedAt: new Date('2026-09-10T00:00:00.000Z') }), inside)).toBe(
      false,
    );
  });

  it('[REQ-014] cobre só o command listado e o escopo exato', () => {
    const subject = grant();

    expect(grantCovers(subject, PARTNER_OPERATION.name, SCOPE, inside)).toBe(true);
    expect(grantCovers(subject, 'other_operation', SCOPE, inside)).toBe(false);
    expect(grantCovers(subject, PARTNER_OPERATION.name, { type: 'concept', id: 'x' }, inside)).toBe(
      false,
    );
    expect(
      grantCovers(subject, PARTNER_OPERATION.name, { type: 'edition', id: SCOPE.id }, inside),
    ).toBe(false);
  });
});
