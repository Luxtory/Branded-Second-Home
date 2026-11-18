import { describe, expect, it } from 'vitest';
import {
  AuthorizerRefusal,
  connectionConfig,
  parseInputs,
  refusalCode,
  runAuthorizer,
  supabaseRootCa,
} from '../../scripts/booking-authorizer.mjs';
import { SUPABASE_ROOT_CA } from '@/features/platform/infrastructure/database/supabase-root-ca';

// W13 E5 (spec booking §10.16; ADR-0027 §4; plano W13 critérios 4 e 5): o programa do workflow do autorizador recusa
// entrada fora do schema fechado antes de conectar, só aceita a conexão do papel autorizador e só imprime o código do
// resultado — nunca mensagem de erro, conexão ou dado da reserva (repositório público).
const REQUEST = '0b6f2f0e-6c1d-4f0a-9a57-3d1f2b9c8e71';
const REF = 'github-run:44204312585:1';
const DSN =
  'postgresql://luxtory_booking_authorizer.abcdefghijklmnopqrst:p%40ss%2Fw0rd@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
const valid = {
  AUTHORIZER_ACTION: 'authorize',
  AUTHORIZER_ID: REQUEST,
  AUTHORIZER_APPROVAL_REF: REF,
};

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
  it('[TECH-051][ADR-0027 §4] entrada válida: ação fechada, id UUID e referência do run no schema da função', () => {
    expect(parseInputs(valid)).toEqual({ action: 'authorize', id: REQUEST, approvalRef: REF });
    expect(parseInputs({ ...valid, AUTHORIZER_ACTION: 'revoke' }).action).toBe('revoke');
  });

  it.each([
    ['ação fora da lista', { AUTHORIZER_ACTION: 'drop' }],
    ['ação herdada do protótipo', { AUTHORIZER_ACTION: 'constructor' }],
    ['id ausente', { AUTHORIZER_ID: undefined }],
    ['id com SQL', { AUTHORIZER_ID: `${REQUEST}'; DROP TABLE app.booking; --` }],
    ['id com substituição de shell', { AUTHORIZER_ID: '$(touch /tmp/pwned)' }],
    ['id com quebra de linha', { AUTHORIZER_ID: `${REQUEST}\nresult=authorized` }],
    ['id com espaço', { AUTHORIZER_ID: ` ${REQUEST}` }],
    ['referência livre', { AUTHORIZER_APPROVAL_REF: 'run 1; DROP TABLE x' }],
    ['referência com tentativa zero', { AUTHORIZER_APPROVAL_REF: 'github-run:44204312585:0' }],
  ])('[TECH-051][A4] %s → input_invalid', (_case, override) => {
    expect(refusal(() => parseInputs({ ...valid, ...override }))).toBe('input_invalid');
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

  it('[TECH-051][A4] entrada inválida: uma linha de resultado, saída 1, nenhuma conexão tentada', async () => {
    const lines: string[] = [];

    const status = await runAuthorizer(
      {
        ...valid,
        AUTHORIZER_ID: "x'; DROP TABLE app.booking; --",
        // Porta fechada: se o programa conectasse, o resultado seria connection_failed.
        BOOKING_AUTHORIZER_DATABASE_URL:
          'postgresql://luxtory_booking_authorizer:x@127.0.0.1:1/postgres?sslmode=disable',
      },
      (line: string) => lines.push(line),
    );

    expect(status).toBe(1);
    expect(lines).toEqual(['result=input_invalid']);
  });

  it('[TECH-051] sem o secret do Environment: configuration_missing, saída 1', async () => {
    const lines: string[] = [];

    const status = await runAuthorizer(valid, (line: string) => lines.push(line));

    expect(status).toBe(1);
    expect(lines).toEqual(['result=configuration_missing']);
  });
});
