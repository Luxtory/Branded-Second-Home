// Servidor PostgreSQL 17 real para testes e desenvolvimento, sem Docker (ADR-0005, TECH-110).
// ATENÇÃO: o pacote `embedded-postgres` registra `async-exit-hook` ao ser importado, que chama `process.exit(0)` no
// `beforeExit` e apaga o código de saída do processo. Só importar este módulo num processo dedicado
// (scripts/pg-server.mjs, scripts/db-start.mjs); os demais usam scripts/lib/postgres-process.mjs.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseUrl, PostgresHarnessError } from './pg.mjs';

const PG_USER = 'postgres';
// Senha do PostgreSQL local descartável, ouvindo só em loopback. Nunca é credencial de ambiente real.
const PG_PASSWORD = 'postgres';
const INITDB_FLAGS = ['--encoding=UTF8', '--locale=C.UTF-8'];
const MAX_BUFFERED_LOG_LINES = 50;

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/**
 * Sobe um PostgreSQL local. A pasta de dados precisa estar num sistema de arquivos com permissões POSIX
 * (ext4/tmpfs do WSL), nunca em /mnt/c (drvfs): o padrão é uma pasta temporária descartável.
 * `trackCommitTimestamp` (padrão: ligado): carimbo de COMMIT do servidor exigido pelo sorteio (T-910, ADR-0023); só os
 * testes de recusa segura sobem um servidor com ele desligado.
 * @param {{ dataDir?: string, port?: number, persistent?: boolean, trackCommitTimestamp?: boolean }} [options]
 * @returns {Promise<{ adminUrl: string, stop: () => Promise<void> }>}
 */
export async function startPostgres(options = {}) {
  const persistent = options.persistent ?? false;
  const dataDir = options.dataDir ?? join(await mkdtemp(join(tmpdir(), 'luxtory-pg-')), 'data');
  const port = options.port ?? (await freePort());
  /** @type {string[]} */
  const recentLog = [];
  const remember = (/** @type {unknown} */ line) => {
    recentLog.push(String(line));
    if (recentLog.length > MAX_BUFFERED_LOG_LINES) recentLog.shift();
  };
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: PG_USER,
    password: PG_PASSWORD,
    persistent,
    initdbFlags: INITDB_FLAGS,
    postgresFlags: [
      '-c',
      `track_commit_timestamp=${options.trackCommitTimestamp === false ? 'off' : 'on'}`,
    ],
    onLog: remember,
    onError: remember,
  });
  try {
    if (!existsSync(join(dataDir, 'PG_VERSION'))) await server.initialise();
    await server.start();
  } catch (error) {
    throw new PostgresHarnessError(
      `PostgreSQL did not start (dataDir=${dataDir}, port=${port}):\n${recentLog.join('\n')}`,
      { cause: error },
    );
  }
  // Servidor só em loopback: sem TLS (o driver do dbmate exige TLS por padrão).
  const serverUrl = `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${port}/postgres?sslmode=disable`;
  return { adminUrl: databaseUrl(serverUrl, 'postgres'), stop: () => server.stop() };
}
