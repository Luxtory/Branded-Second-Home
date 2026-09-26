import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { scramVerifier } from '../../scripts/lib/scram.mjs';

// `npm run db:password-verifier` (runbook, passo 3): a senha chega pelo stdin e só o verificador SCRAM é impresso.
const SCRIPT = 'scripts/db-password-verifier.mjs';
// Cada caso executa um processo node; com a suíte inteira em paralelo passa dos 5 s padrão.
const SCRIPT_PROCESS_TIMEOUT_MS = 30_000;
const OUTPUT =
  /^ALTER ROLE luxtory_app WITH PASSWORD 'SCRAM-SHA-256\$(\d+):([A-Za-z0-9+/=]+)\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+';\n$/;

const password = (length: number) => randomBytes(length).toString('base64url').slice(0, length);

function run(input: string) {
  const result = spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('db:password-verifier', { timeout: SCRIPT_PROCESS_TIMEOUT_MS }, () => {
  it.each([
    ['com quebra de linha', '\n'],
    ['colada sem quebra de linha', ''],
  ])(
    '[ADR-0006] senha com 32+ caracteres (%s) é recebida e gera o ALTER ROLE dela',
    (_case, end) => {
      const secret = password(40);

      const { status, stdout, stderr } = run(`${secret}${end}`);

      expect(status).toBe(0);
      const [, iterations, salt] = OUTPUT.exec(stdout) ?? [];
      // O verificador impresso é o desta senha (mesmo salt e iterações), não o de uma string vazia.
      expect(stdout).toBe(
        `ALTER ROLE luxtory_app WITH PASSWORD '${scramVerifier(secret, {
          salt: Buffer.from(salt ?? '', 'base64'),
          iterations: Number(iterations),
        })}';\n`,
      );
      expect(stdout + stderr).not.toContain(secret);
    },
  );

  it.each([
    ['31 caracteres', `${password(31)}\n`],
    ['entrada vazia', ''],
  ])('[ADR-0006] senha curta (%s) continua recusada, sem ALTER ROLE', (_case, input) => {
    const { status, stdout, stderr } = run(input);

    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('ao menos 32 caracteres');
  });
});
