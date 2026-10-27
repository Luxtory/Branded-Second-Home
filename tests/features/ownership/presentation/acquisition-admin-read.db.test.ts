import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readAcquisitionAdmin } from '@/features/ownership/presentation/acquisition-admin-read';
import { readPartySummary } from '@/features/identity';
import { acquisitionHarness, type AcquisitionHarness } from '../acquisition-support';
import { partyHarness, testProtector, validCpf } from '../../../support/party-fixtures';

describe('W8 audited UI projection [TECH-092] [TECH-040]', () => {
  let h: AcquisitionHarness;
  beforeAll(async () => {
    h = await acquisitionHarness(false);
  });
  afterAll(async () => {
    await h.close();
  });
  const session = () => ({
    userId: h.userId,
    role: 'admin' as const,
    roles: ['admin'] as const,
    authorizationRef: `staff_role:${h.roleId}`,
  });
  it('reads frozen civil facts and original origin without current-brand checks or formalization locks', async () => {
    const { home } = await h.root();
    const input = await h.owner(home.id);
    expect((await h.run(h.handlers.formalizeAcquisition, input)).status).toBe('committed');
    // A later brand termination must never hide the already formalized facts.
    await h.database.pool.query(
      'UPDATE app.brand_partner SET terminated_effective_at=now(), termination_registered_at=now(), termination_basis=$1',
      ['Synthetic later termination'],
    );
    const view = await readAcquisitionAdmin(session(), home.id, { db: h.db });
    expect(view?.origin.version).toBe(1);
    expect(view?.acquisition?.date).toBe('2027-01-01');
    expect(view?.acquisition?.basis_ref).toBe(input.basis_ref);
    expect(view?.holdings).toHaveLength(1);
    expect(view?.ledger).toEqual([]);
    expect(view?.configurations.map((configuration) => configuration.id)).toEqual([10, 8, 4, 2]);
    const { rows: audit } = await h.database.pool.query(
      "SELECT object_id, before, after, role FROM app.audit_log WHERE event_type='admin_read' AND object_type='second_home_acquisition'",
    );
    expect(audit).toContainEqual({ object_id: home.id, before: null, after: null, role: 'admin' });
  });
  it('confirms only a committed W8 operation belonging to the displayed Second Home', async () => {
    const { home } = await h.root();
    const input = await h.owner(home.id);
    const committed = await h.run(h.handlers.formalizeAcquisition, input);
    if (committed.status !== 'committed') throw new Error('Synthetic receipt was not committed');
    const read = (id: string, registeredOperationId: string | null) =>
      readAcquisitionAdmin(session(), id, { db: h.db, registeredOperationId });
    expect((await read(home.id, committed.operationId))?.registrationConfirmed).toBe(true);
    expect((await read(home.id, randomUUID()))?.registrationConfirmed).toBe(false);
    expect((await read(home.id, null))?.registrationConfirmed).toBe(false);
    const otherHome = await h.root();
    expect((await read(otherHome.home.id, committed.operationId))?.registrationConfirmed).toBe(
      false,
    );
    const catalog = await h.db
      .selectFrom('app.second_home')
      .select('operation_id')
      .where('id', '=', home.id)
      .executeTakeFirstOrThrow();
    expect((await read(home.id, catalog.operation_id))?.registrationConfirmed).toBe(false);
    const otherCommandId = randomUUID();
    // Same committed scope/actor, but a catalog command is not a receipt for any W8 form.
    await h.database.pool.query(
      `INSERT INTO app.operation
        (id,command,actor_user_id,acting_party_id,role,second_home_id,idempotency_key,
         correlation_id,authorization_ref,state,created_at,updated_at)
       SELECT $1::uuid,'register_second_home',actor_user_id,acting_party_id,role,second_home_id,$1::text,
              correlation_id,authorization_ref,'committed',created_at,updated_at
       FROM app.operation WHERE id=$2`,
      [otherCommandId, committed.operationId],
    );
    expect((await read(home.id, otherCommandId))?.registrationConfirmed).toBe(false);
    const rejected = await h.run(h.handlers.formalizeAcquisition, input);
    expect(rejected.status).toBe('rejected');
    expect(rejected.operationId).not.toBeNull();
    expect((await read(home.id, rejected.operationId))?.registrationConfirmed).toBe(false);
  });
  it('resolves an older party by id via W7 masking without limiting eligibility to the recent 50', async () => {
    const protector = testProtector();
    const parties = partyHarness(
      h.db,
      { now: () => new Date('2000-01-01T00:00:00Z') },
      { protector },
    );
    const original = await parties.ok(
      parties.handlers.registerParty,
      { document: validCpf('246813579') },
      { actor: { kind: 'user', userId: h.userId, actingPartyId: null, role: 'admin' } },
    );
    // 51 metadata-only rows are valid for a backend fixture but not passed to the document reader.
    for (let i = 0; i < 51; i++) await h.party();
    // The directory would encounter metadata-only fixtures, so prove the recent cutoff directly; lookup uses valid W7 ciphertext.
    const recent = await h.db
      .selectFrom('app.party')
      .select('id')
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
    expect(recent.map((party) => party.id)).not.toContain(original.id);
    const party = await readPartySummary(session(), original.id, { db: h.db, protector });
    expect(party).toMatchObject({
      id: original.id,
      documentType: 'cpf',
      maskedDocument: '***.813.579-**',
    });
    expect(party).not.toHaveProperty('ciphertext');
    expect(party).not.toHaveProperty('document');
    const { rows: audit } = await h.database.pool.query(
      "SELECT object_id, before, after FROM app.audit_log WHERE event_type='admin_read' AND object_type='party' AND object_id=$1",
      [original.id],
    );
    expect(audit).toEqual([{ object_id: original.id, before: null, after: null }]);
    expect(await readPartySummary(session(), randomUUID(), { db: h.db, protector })).toBeNull();
  });
});
