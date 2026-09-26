import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// `npm run db:migrate` como a CI o executa (job migrate): o preflight precisa reprovar uma URL existente porém
// inválida já no primeiro push para main, mesmo sem nenhuma migration.
const SCRIPT = 'scripts/db-migrate.mjs';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(async () => {
  await db.drop();
});

function migrate(url: string | undefined) {
  const env = { ...process.env, DATABASE_URL_MIGRATIONS: url };
  if (url === undefined) delete env.DATABASE_URL_MIGRATIONS;
  const result = spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function variant(edit: (url: URL) => void) {
  const url = new URL(db.url);
  edit(url);
  return url.toString();
}

describe('db:migrate — preflight de DATABASE_URL_MIGRATIONS', () => {
  it('conexão válida: passa, segue para as migrations e não altera o banco', async () => {
    const { status, output } = migrate(db.url);
    const { rows } = await db.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'dbmate'",
    );

    expect(status).toBe(0);
    expect(output).toContain('preflight ok');
    expect(output).toContain('No migration files');
    expect(rows[0]?.n).toBe(0);
  });

  it.each([
    [
      'senha errada',
      (url: URL) => void (url.password = 'senha-errada'),
      'password authentication failed',
    ],
    [
      'banco inexistente',
      (url: URL) => void (url.pathname = '/banco_inexistente'),
      'does not exist',
    ],
    ['porta sem servidor', (url: URL) => void (url.port = '1'), 'connection refused'],
  ])('URL existente porém inválida (%s): falha sem expor a URL', (_case, edit, reason) => {
    const url = variant(edit);
    const { status, output } = migrate(url);

    expect(status).toBe(1);
    expect(output).toContain(reason);
    expect(output).not.toContain(url);
    expect(output).not.toContain(`:${new URL(url).password}@`);
    expect(output).not.toContain('preflight ok');
  });

  it('variável ausente: falha de forma explícita', () => {
    const { status, output } = migrate(undefined);

    expect(status).toBe(1);
    expect(output).toContain('DATABASE_URL_MIGRATIONS is not set');
  });
});
