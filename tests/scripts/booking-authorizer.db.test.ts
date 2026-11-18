import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scramVerifier } from '../../scripts/lib/scram.mjs';
import {
  addDays,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
} from '../features/booking/booking-support';
import {
  activate,
  addAdmin,
  historicBooking,
  historicCoOwnerScenario,
  lastStartedNight,
  requestAuthorization,
  unstartedNights,
  withAuthorizerLogin,
  type Admin,
} from '../features/booking/lifecycle-support';

// W13 E5 (spec booking §10.16; plano W13 critérios 4, 5 e 11): o programa do passo protegido do workflow, executado
// como o job o executa (processo próprio, entradas só por variáveis de ambiente), com o login real do papel autorizador
// num PostgreSQL descartável. Prova a emissão e a revogação ponta a ponta, as recusas nomeadas da função e que nada além
// do código do resultado e do id da autorização chega à saída (o log do run é público).
const SCRIPT = 'scripts/booking-authorizer.mjs';
const RESULT_LINE = /^result=[a-z][a-z0-9_]*$/;
const AUTHORIZATION_LINE = /^authorization_id=[0-9a-f-]{36}$/;
const run = promisify(execFile);
let runId = 0;

interface Outcome {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Executa o passo `Authorize` com o env que o workflow monta (referência do run sintética e única). */
async function authorizerStep(env: {
  action: string;
  id: string;
  url: string;
  attempt?: number;
}): Promise<Outcome> {
  runId += 1;
  const stepEnv = {
    PATH: process.env.PATH ?? '',
    NODE_ENV: 'test' as const,
    AUTHORIZER_ACTION: env.action,
    AUTHORIZER_ID: env.id,
    AUTHORIZER_APPROVAL_REF: `github-run:${Date.now()}${runId}:${env.attempt ?? 1}`,
    BOOKING_AUTHORIZER_DATABASE_URL: env.url,
  };
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT], {
      env: stepEnv,
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { status: failed.code ?? -1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
  }
}

/** A saída pública tem só as linhas permitidas — e nada dos fatos, da conexão ou da senha. */
function expectPublicOutput(outcome: Outcome, secrets: readonly string[]) {
  expect(outcome.stderr).toBe('');
  const lines = outcome.stdout.split('\n');
  expect(lines.pop()).toBe('');
  expect(lines[0]).toMatch(RESULT_LINE);
  for (const line of lines.slice(1)) expect(line).toMatch(AUTHORIZATION_LINE);
  for (const secret of secrets) expect(outcome.stdout).not.toContain(secret);
}

describe('W13 E5 — programa do workflow do autorizador com login real (plano W13 critérios 4, 5 e 11)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let admin: Admin;
  let start: string;

  beforeAll(async () => {
    h = await bookingHarness();
    co = await historicCoOwnerScenario(h);
    admin = await addAdmin(h);
    start = await lastStartedNight(h, co.homeId);
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
  }, 300_000);
  afterAll(() => h.close());

  it('[TECH-051][TECH-046][ADR-0027 §4] emite, recusa a repetição e revoga pelo workflow: só código e id na saída', async () => {
    const titular = co.titulares[0]!;
    const booking = await historicBooking(h, {
      homeId: co.homeId,
      titular,
      checkin: addDays(start, -1),
      checkout: addDays(start, 3),
    });
    const nights = await unstartedNights(h.database.pool, booking);
    const request = await requestAuthorization(h, admin, {
      bookingId: booking,
      purpose: 'no_show',
      expectedDates: nights,
    });

    await withAuthorizerLogin(h, async (url, password) => {
      const sensitive = [booking, password, new URL(url).host, ...nights, titular.partyId];

      const emitted = await authorizerStep({ action: 'authorize', id: request, url });
      expect(emitted.status).toBe(0);
      expectPublicOutput(emitted, sensitive);
      const [, authorization] = /authorization_id=(\S+)/.exec(emitted.stdout)!;
      const { rows } = await h.database.pool.query<{
        request_id: string;
        approval_ref: string;
        dates: string[];
      }>(
        `SELECT request_id, approval_ref, scope_dates::text[] AS dates FROM app.booking_authorization WHERE id = $1`,
        [authorization],
      );
      expect(rows).toEqual([
        {
          request_id: request,
          approval_ref: expect.stringMatching(/^github-run:\d+:1$/),
          dates: nights,
        },
      ]);

      // Re-execução do run (tentativa 2): a solicitação já foi autorizada; nada novo.
      const again = await authorizerStep({ action: 'authorize', id: request, url, attempt: 2 });
      expect(again).toMatchObject({
        status: 1,
        stdout: 'result=authorization_request_already_authorized\n',
      });
      expectPublicOutput(again, sensitive);

      const revoked = await authorizerStep({ action: 'revoke', id: authorization!, url });
      expect(revoked).toMatchObject({ status: 0, stdout: 'result=revoked\n' });
      const revocation = await h.database.pool.query(
        `SELECT approval_ref FROM app.booking_authorization_revocation WHERE authorization_id = $1`,
        [authorization],
      );
      expect(revocation.rows).toEqual([
        { approval_ref: expect.stringMatching(/^github-run:\d+:1$/) },
      ]);
      const twice = await authorizerStep({ action: 'revoke', id: authorization!, url });
      expect(twice).toMatchObject({ status: 1, stdout: 'result=authorization_already_revoked\n' });
    });
  });

  it('[TECH-051][A4] recusas pela função e antes de conectar: código nomeado, nenhuma autorização gravada', async () => {
    const count = async () =>
      (
        await h.database.pool.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM app.booking_authorization',
        )
      ).rows[0]!.n;
    const before = await count();

    await withAuthorizerLogin(h, async (url, password) => {
      const unknown = await authorizerStep({ action: 'authorize', id: randomUUID(), url });
      expect(unknown).toMatchObject({
        status: 1,
        stdout: 'result=authorization_request_unknown\n',
        stderr: '',
      });

      const injected = await authorizerStep({
        action: 'authorize',
        id: "x'); SELECT app.booking_authorization; --",
        url,
      });
      expect(injected).toMatchObject({ status: 1, stdout: 'result=input_invalid\n', stderr: '' });

      const wrongPassword = new URL(url);
      wrongPassword.password = `${password}x`;
      const denied = await authorizerStep({
        action: 'authorize',
        id: randomUUID(),
        url: wrongPassword.toString(),
      });
      expect(denied).toMatchObject({ status: 1, stdout: 'result=sqlstate_28P01\n', stderr: '' });
    });
    expect(await count()).toBe(before);
  });

  it('[TECH-051][ADR-0027 §4] outro papel que passe pelo nome não executa: o servidor confirma o papel antes da chamada', async () => {
    // Nome aceito pelo formato do Supavisor (`<papel>.<sufixo>`), mas papel distinto no servidor.
    const impostor = `luxtory_booking_authorizer.e5${randomBytes(4).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    await h.database.pool.query(
      `CREATE ROLE "${impostor}" LOGIN PASSWORD '${scramVerifier(password)}'`,
    );
    try {
      const url = new URL(h.database.url);
      url.username = impostor;
      url.password = password;
      url.search = '?sslmode=disable';
      const outcome = await authorizerStep({
        action: 'authorize',
        id: randomUUID(),
        url: url.toString(),
      });
      expect(outcome).toMatchObject({ status: 1, stdout: 'result=role_mismatch\n', stderr: '' });
    } finally {
      await h.database.pool.query(`DROP ROLE "${impostor}"`);
    }
  });
});
