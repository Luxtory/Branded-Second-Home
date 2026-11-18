import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AuthorizerRefusal,
  connectionConfig,
  parseInputs,
  refusalCode,
  runAuthorizer,
  supabaseRootCa,
} from '../../scripts/booking-authorizer.mjs';
import { SUPABASE_ROOT_CA } from '@/features/platform/infrastructure/database/supabase-root-ca';

// W13 E5 (spec booking §10.16; ADR-0027 §4; plano W13 critérios 4 e 5): o programa do workflow do autorizador lê a
// entrada do arquivo do evento (nunca do `env:` do passo, impresso no log público — T-1321), recusa entrada fora do
// schema fechado antes de conectar, só aceita a conexão do papel autorizador e só imprime o código do resultado.
const REQUEST = '0b6f2f0e-6c1d-4f0a-9a57-3d1f2b9c8e71';
const REF = 'github-run:44204312585:1';
const DSN =
  'postgresql://luxtory_booking_authorizer.abcdefghijklmnopqrst:p%40ss%2Fw0rd@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
const EVENT_PATH = '/runner/event.json';
const run = {
  GITHUB_EVENT_PATH: EVENT_PATH,
  GITHUB_RUN_ID: '44204312585',
  GITHUB_RUN_ATTEMPT: '1',
};
const event = (inputs: unknown) => () => JSON.stringify({ inputs, ref: 'refs/heads/main' });
const dispatch = event({ action: 'authorize', id: REQUEST });
const events = mkdtempSync(join(tmpdir(), 'e5-event-'));
afterAll(() => rmSync(events, { recursive: true, force: true }));

/** Arquivo de evento real em disco (como o runner o escreve), para os testes que executam o programa inteiro. */
function eventFile(inputs: unknown): string {
  const path = join(events, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({ inputs }));
  return path;
}

function refusal(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    if (error instanceof AuthorizerRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('W13 E5 — programa do workflow do autorizador (plano W13 critérios 4 e 5)', () => {
  it('[TECH-051][ADR-0027 §4] entrada do evento: ação fechada, id UUID e referência montada do run', () => {
    expect(parseInputs(run, dispatch)).toEqual({
      action: 'authorize',
      id: REQUEST,
      approvalRef: REF,
    });
    expect(parseInputs(run, event({ action: 'revoke', id: REQUEST })).action).toBe('revoke');
  });

  it.each([
    ['ação fora da lista', { action: 'drop', id: REQUEST }],
    ['ação herdada do protótipo', { action: 'constructor', id: REQUEST }],
    ['ação não textual', { action: ['authorize'], id: REQUEST }],
    ['id ausente', { action: 'authorize' }],
    ['id com SQL', { action: 'authorize', id: `${REQUEST}'; DROP TABLE app.booking; --` }],
    ['id com substituição de shell', { action: 'authorize', id: '$(touch /tmp/pwned) `id`' }],
    ['id com quebra de linha', { action: 'authorize', id: `${REQUEST}\nresult=authorized` }],
    ['id com espaço', { action: 'authorize', id: ` ${REQUEST}` }],
    ['id com dado pessoal', { action: 'authorize', id: 'maria@example.com 11987654321' }],
  ])('[TECH-051][A4] %s → input_invalid', (_case, inputs) => {
    expect(refusal(() => parseInputs(run, event(inputs)))).toBe('input_invalid');
  });

  it.each([
    ['referência livre', { GITHUB_RUN_ID: 'run 1; DROP TABLE x' }],
    ['tentativa zero', { GITHUB_RUN_ATTEMPT: '0' }],
  ])('[TECH-051][A4] referência do run fora do schema (%s) → input_invalid', (_case, override) => {
    expect(refusal(() => parseInputs({ ...run, ...override }, dispatch))).toBe('input_invalid');
  });

  it.each([
    ['sem arquivo do evento', { ...run, GITHUB_EVENT_PATH: undefined }, dispatch],
    ['sem id do run', { ...run, GITHUB_RUN_ID: undefined }, dispatch],
    ['sem tentativa do run', { ...run, GITHUB_RUN_ATTEMPT: undefined }, dispatch],
    ['evento sem inputs', run, () => JSON.stringify({ ref: 'refs/heads/main' })],
    ['evento ilegível', run, () => '{not json'],
    [
      'arquivo inexistente',
      run,
      () => {
        throw new Error('ENOENT');
      },
    ],
  ])('[TECH-051][A4] %s → input_missing', (_case, env, read) => {
    expect(refusal(() => parseInputs(env, read))).toBe('input_missing');
  });

  it('[ADR-0027 §4] conexão do Supavisor: papel autorizador, senha decodificada, verify-full com a CA fixada', () => {
    const config = connectionConfig(DSN);

    expect(config).toMatchObject({
      host: 'aws-0-sa-east-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'luxtory_booking_authorizer.abcdefghijklmnopqrst',
      password: 'p@ss/w0rd',
      ssl: {
        ca: SUPABASE_ROOT_CA.trim(),
        rejectUnauthorized: true,
        servername: 'aws-0-sa-east-1.pooler.supabase.com',
      },
    });
  });

  it('[ADR-0027 §4] PostgreSQL descartável em loopback aceita sslmode=disable', () => {
    const config = connectionConfig(
      'postgresql://luxtory_booking_authorizer:secret@127.0.0.1:55432/luxtory_e2e?sslmode=disable',
    );

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 55432,
      database: 'luxtory_e2e',
      ssl: false,
    });
  });

  it.each([
    ['ausente', undefined, 'configuration_missing'],
    ['vazia', '', 'configuration_missing'],
    ['malformada', 'not a url', 'configuration_invalid'],
    [
      'outro protocolo',
      'mysql://luxtory_booking_authorizer:x@db.example:5432/postgres?sslmode=verify-full',
      'configuration_invalid',
    ],
    [
      'papel da aplicação',
      'postgresql://luxtory_app:x@db.example:5432/postgres?sslmode=verify-full',
      'configuration_invalid',
    ],
    [
      'dono do schema',
      'postgresql://postgres:x@db.example:5432/postgres?sslmode=verify-full',
      'configuration_invalid',
    ],
    [
      'sem senha',
      'postgresql://luxtory_booking_authorizer@db.example:5432/postgres?sslmode=verify-full',
      'configuration_invalid',
    ],
    [
      'sem sslmode',
      'postgresql://luxtory_booking_authorizer:x@db.example:5432/postgres',
      'configuration_invalid',
    ],
    [
      'TLS sem conferir o host',
      'postgresql://luxtory_booking_authorizer:x@db.example:5432/postgres?sslmode=require',
      'configuration_invalid',
    ],
    [
      'sem TLS fora do loopback',
      'postgresql://luxtory_booking_authorizer:x@db.example:5432/postgres?sslmode=disable',
      'configuration_invalid',
    ],
    [
      'parâmetro extra (troca de papel)',
      `${DSN}&options=-c%20role%3Dpostgres`,
      'configuration_invalid',
    ],
  ])('[ADR-0027 §4] conexão %s → %s, sem conectar', (_case, value, code) => {
    expect(refusal(() => connectionConfig(value))).toBe(code);
  });

  it('[ADR-0006] a CA lida pelo programa é a mesma fixada no código da aplicação', () => {
    expect(supabaseRootCa()).toBe(SUPABASE_ROOT_CA.trim());
  });

  it('[TECH-051][A4] código público: constraint nomeada, SQLSTATE ou falha de conexão — nunca a mensagem', () => {
    expect(refusalCode(new AuthorizerRefusal('input_invalid'))).toBe('input_invalid');
    expect(
      refusalCode(
        Object.assign(new Error('booking 123 on 2027-01-02'), {
          code: '23514',
          constraint: 'authorization_scope_mismatch',
        }),
      ),
    ).toBe('authorization_scope_mismatch');
    expect(
      refusalCode(Object.assign(new Error('too many connections for role'), { code: '53300' })),
    ).toBe('sqlstate_53300');
    expect(
      refusalCode(
        Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }),
      ),
    ).toBe('connection_failed');
    expect(refusalCode(Object.assign(new Error('x'), { constraint: 'Bad Name; --' }))).toBe(
      'connection_failed',
    );
    expect(refusalCode('unexpected')).toBe('connection_failed');
  });

  it('[TECH-051][A4] payload de SQL e shell no evento: uma linha, sem eco da entrada, nenhuma conexão tentada', async () => {
    const lines: string[] = [];
    const payload = "x'; DROP TABLE app.booking; -- $(id) `uname -a`";

    const status = await runAuthorizer(
      {
        ...run,
        GITHUB_EVENT_PATH: eventFile({ action: 'authorize', id: payload }),
        // Porta fechada: se o programa conectasse, o resultado seria connection_failed.
        BOOKING_AUTHORIZER_DATABASE_URL:
          'postgresql://luxtory_booking_authorizer:x@127.0.0.1:1/postgres?sslmode=disable',
      },
      (line: string) => lines.push(line),
    );

    expect(status).toBe(1);
    expect(lines).toEqual(['result=input_invalid']);
  });

  it('[TECH-051][A4] sem a entrada do disparo: input_missing, saída 1', async () => {
    const lines: string[] = [];

    const status = await runAuthorizer(
      { ...run, GITHUB_EVENT_PATH: join(events, 'absent.json') },
      (line: string) => lines.push(line),
    );

    expect(status).toBe(1);
    expect(lines).toEqual(['result=input_missing']);
  });

  it('[TECH-051] sem o secret do Environment: configuration_missing, saída 1', async () => {
    const lines: string[] = [];

    const status = await runAuthorizer(
      { ...run, GITHUB_EVENT_PATH: eventFile({ action: 'authorize', id: REQUEST }) },
      (line: string) => lines.push(line),
    );

    expect(status).toBe(1);
    expect(lines).toEqual(['result=configuration_missing']);
  });
});
