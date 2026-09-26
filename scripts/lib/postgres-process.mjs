// PostgreSQL embutido num processo filho: o processo chamador (Vitest, db:check) nunca importa `embedded-postgres`
// e mantém o próprio código de saída (ver scripts/lib/embedded-pg.mjs).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { PostgresHarnessError } from './pg.mjs';

const SERVER_ENTRY = fileURLToPath(new URL('../pg-server.mjs', import.meta.url));
const START_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 30_000;

/** @returns {Promise<{ adminUrl: string, stop: () => Promise<void> }>} */
export function startPostgresProcess() {
  const child = spawn(process.execPath, [SERVER_ENTRY], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const stop = async () => {
    if (child.exitCode !== null) return;
    child.stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS);
    await exited;
    clearTimeout(timer);
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new PostgresHarnessError(`PostgreSQL process did not start within ${START_TIMEOUT_MS} ms`),
      );
    }, START_TIMEOUT_MS);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(
        new PostgresHarnessError(`PostgreSQL process exited before becoming ready (code ${code})`),
      );
    });
    createInterface({ input: child.stdout }).once('line', (line) => {
      clearTimeout(timer);
      resolve({ adminUrl: JSON.parse(line).adminUrl, stop });
    });
  });
}
