import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { asOperation, type Admin, type OperationActor } from '../booking/lifecycle-support';

/**
 * W15 E2 — fixtures SQL do Membership. As escritas são as que os commands da E3 farão, gravadas pelo papel da aplicação
 * (`luxtory_app`) com a operação `pending` do command (sem Second Home, como o executor grava uma operação Admin), ou o
 * que um forjador com a credencial conseguiria.
 */
type Queryable = Pick<pg.Client | pg.Pool, 'query'>;

export type MembershipState = 'active' | 'suspended' | 'ended';
export type MembershipCommand =
  'activate_membership' | 'suspend_membership' | 'reactivate_membership' | 'end_membership';

/** Command de cada estado de destino numa mudança (a criação é `activate_membership`). */
export const COMMAND_FOR: Readonly<Record<MembershipState, MembershipCommand>> = {
  active: 'reactivate_membership',
  suspended: 'suspend_membership',
  ended: 'end_membership',
};

export async function insertMembership(
  client: Queryable,
  op: string,
  partyId: string,
  options: { state?: string; basis?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.membership (id, party_id, state, basis, operation_id) VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      partyId,
      options.state ?? 'active',
      options.basis ?? 'Contrato de adesão ao Luxtory Club',
      op,
    ],
  );
  return id;
}

export async function updateMembership(
  client: Queryable,
  op: string,
  partyId: string,
  state: string,
  basis = 'Decisão registrada da Luxtory',
): Promise<number> {
  const result = await client.query(
    `UPDATE app.membership SET state = $2, basis = $3, operation_id = $4 WHERE party_id = $1`,
    [partyId, state, basis, op],
  );
  return result.rowCount ?? 0;
}

const adminActor = (admin: Admin): OperationActor => ({ kind: 'admin', admin });

export interface ForgedOperation {
  readonly command: string;
  readonly role: string;
  readonly actorUserId: string;
  readonly authorizationRef: string;
  readonly actingPartyId?: string | null;
  readonly secondHomeId?: string | null;
}

/**
 * Operação `pending` com campos escolhidos, gravada pelo papel da aplicação na transação de `work` — o que um forjador
 * com a credencial conseguiria (o papel só insere operações e atualiza `state`).
 */
export async function inForgedOperation<T>(
  url: string,
  forged: ForgedOperation,
  work: (client: pg.Client, op: string) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const op = randomUUID();
    await client.query(
      `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
         correlation_id, authorization_ref, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', now(), now())`,
      [
        op,
        forged.command,
        forged.actorUserId,
        forged.actingPartyId ?? null,
        forged.role,
        forged.secondHomeId ?? null,
        `w15:${op}`,
        randomUUID(),
        forged.authorizationRef,
      ],
    );
    const result = await work(client, op);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** `activate_membership` como a E3 gravará: transação própria com a operação Admin `pending`, `committed` no fim. */
export function activateMembership(url: string, admin: Admin, partyId: string): Promise<string> {
  return asOperation(url, 'activate_membership', adminActor(admin), (client, op) =>
    insertMembership(client, op, partyId),
  );
}

/** Mudança de estado pelo command da transição (TECH-055). */
export function changeMembership(
  url: string,
  admin: Admin,
  partyId: string,
  state: MembershipState,
  command: MembershipCommand = COMMAND_FOR[state],
): Promise<number> {
  return asOperation(url, command, adminActor(admin), (client, op) =>
    updateMembership(client, op, partyId, state),
  );
}

export interface MembershipRow {
  readonly id: string;
  readonly state: MembershipState;
  readonly basis: string;
  readonly operation_id: string;
  readonly changed_by: string;
  readonly authority: string;
  readonly changed_at: Date;
  readonly created_operation_id: string;
}

export async function membershipOf(db: Queryable, partyId: string): Promise<MembershipRow | null> {
  const { rows } = await db.query<MembershipRow>(
    `SELECT id, state, basis, operation_id, changed_by, authority, changed_at, created_operation_id
       FROM app.membership WHERE party_id = $1`,
    [partyId],
  );
  return rows[0] ?? null;
}

export interface TransitionRow {
  readonly operation_id: string;
  readonly command: string;
  readonly from_state: MembershipState | null;
  readonly to_state: MembershipState;
  readonly recorded_by: string;
  readonly authority: string;
  readonly recorded_at: Date;
}

/** Histórico com o command da operação de cada linha, em ordem de gravação. */
export async function transitionsOf(db: Queryable, partyId: string): Promise<TransitionRow[]> {
  const { rows } = await db.query<TransitionRow>(
    `SELECT t.operation_id, o.command, t.from_state, t.to_state, t.recorded_by, t.authority, t.recorded_at
       FROM app.membership_transition t JOIN app.operation o ON o.id = t.operation_id
      WHERE t.party_id = $1 ORDER BY t.recorded_at`,
    [partyId],
  );
  return rows;
}

/** Tabelas que uma mudança de Membership grava; todas as outras do schema `app` têm de ficar idênticas. */
const MEMBERSHIP_WRITES = ['membership', 'membership_transition', 'operation'];

/**
 * Impressão digital de todo o schema `app` fora do que o Membership grava: holdings, Ações, Direito de Uso e rotação,
 * reservas e transições, custódias e ocupações, convidados, parâmetros, ativações, parties e delegações. Lida pelo dono
 * do schema (sem RLS).
 */
export async function rightsFingerprint(owner: Queryable): Promise<Record<string, string>> {
  const { rows: tables } = await owner.query<{ name: string }>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'app' AND NOT (tablename = ANY($1::text[]))
      ORDER BY tablename`,
    [MEMBERSHIP_WRITES],
  );
  const fingerprint: Record<string, string> = {};
  for (const { name } of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected table name: ${name}`);
    const { rows } = await owner.query<{ digest: string }>(
      `SELECT md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) AS digest FROM app.${name} t`,
    );
    fingerprint[name] = rows[0]!.digest;
  }
  return fingerprint;
}
