import { describe, expect, it } from 'vitest';
import { commandRegistry, LockSequence, type AuditRecord } from '@/features/platform';
import {
  createGrantAuthorizationHandler,
  grantAuthorizationInput,
} from '@/features/identity/application/grant-authorization';
import type { NewAuthorizationGrant } from '@/features/identity/application/ports';
import {
  PARTNER_OPERATION,
  PARTNER_REGISTRY,
  PARTY,
  SCOPE,
  STAFF_USER,
  staffActor,
} from '../../../support/identity-fixtures';

const body = {
  grantee_party_id: PARTY,
  commands: [PARTNER_OPERATION.name],
  scope: SCOPE,
  valid_from: '2026-09-01T00:00:00Z',
  valid_until: '2026-10-01T00:00:00-03:00',
  basis: 'Instrumento de parceria 2026-09',
};

describe('grant_authorization — entrada (REQ-014, D-W2-1)', () => {
  it('[REQ-014] na W2 nenhuma operação é concedível: todo pedido do registro de produção é recusado', () => {
    expect(commandRegistry.grantable()).toEqual([]);
    expect(grantAuthorizationInput(commandRegistry).safeParse(body).success).toBe(false);
    expect(
      grantAuthorizationInput(commandRegistry).safeParse({
        ...body,
        commands: ['formalize_acquisition'],
      }).success,
    ).toBe(false);
  });

  it('[REQ-014] aceita só operações concedíveis, sem repetição, com vigência crescente e sem campo extra', () => {
    const schema = grantAuthorizationInput(PARTNER_REGISTRY);

    expect(schema.safeParse(body).success).toBe(true);
    expect(schema.safeParse({ ...body, commands: ['grant_authorization'] }).success).toBe(false);
    expect(
      schema.safeParse({ ...body, commands: [PARTNER_OPERATION.name, PARTNER_OPERATION.name] })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ ...body, valid_until: body.valid_from }).success).toBe(false);
    expect(schema.safeParse({ ...body, extra: true }).success).toBe(false);
    expect(schema.safeParse({ ...body, scope: { ...SCOPE, type: 'Concept' } }).success).toBe(false);
    expect(schema.safeParse({ ...body, basis: '' }).success).toBe(false);
  });
});

describe('grant_authorization — execução (REQ-015)', () => {
  it('[REQ-015] grava o grant com concedente e papel exercido e audita o depois', async () => {
    const inserted: NewAuthorizationGrant[] = [];
    const audit: AuditRecord[] = [];
    const handler = createGrantAuthorizationHandler<'tx'>({
      registry: PARTNER_REGISTRY,
      grants: { insert: (_tx, grant) => Promise.resolve(void inserted.push(grant)) },
      newId: () => '00000000-0000-4000-8000-0000000000e1',
    });
    const input = handler.input.parse(body);
    const now = new Date('2026-09-15T00:00:00.000Z');

    const result = await handler.execute({
      input,
      actor: staffActor('admin'),
      operationId: '00000000-0000-4000-8000-0000000000f1',
      now,
      tx: 'tx',
      locks: new LockSequence(),
      audit: (record) => void audit.push(record),
      emit: () => undefined,
    });

    expect(result).toEqual({
      id: '00000000-0000-4000-8000-0000000000e1',
      grantee_party_id: PARTY,
      commands: [PARTNER_OPERATION.name],
      scope: SCOPE,
      valid_from: '2026-09-01T00:00:00.000Z',
      valid_until: '2026-10-01T03:00:00.000Z',
      basis: body.basis,
      granted_by_user_id: STAFF_USER,
      granted_role: 'admin',
      operation_id: '00000000-0000-4000-8000-0000000000f1',
      created_at: now.toISOString(),
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ grantedRole: 'admin', operationId: result.operation_id });
    expect(audit).toEqual([
      { objectType: 'authorization_grant', objectId: result.id, before: null, after: result },
    ]);
  });

  it('[TECH-051] recusa execução sem ator de staff (o guard deveria ter negado antes)', async () => {
    const handler = createGrantAuthorizationHandler<'tx'>({
      registry: PARTNER_REGISTRY,
      grants: { insert: () => Promise.resolve() },
      newId: () => 'x',
    });

    await expect(
      handler.execute({
        input: handler.input.parse(body),
        actor: { kind: 'system', job: 'outbox' },
        operationId: 'op',
        now: new Date(),
        tx: 'tx',
        locks: new LockSequence(),
        audit: () => undefined,
        emit: () => undefined,
      }),
    ).rejects.toThrow(/without a staff actor/);
  });
});
