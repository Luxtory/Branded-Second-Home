import type { TestProject } from 'vitest/node';
import { migrateUp } from '../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat, createDatabase } from '../../scripts/lib/pg.mjs';
import { startPostgresProcess } from '../../scripts/lib/postgres-process.mjs';

const TEMPLATE_DATABASE = 'luxtory_template';

/**
 * Projeto `db` do Vitest (ADR-0005): um PostgreSQL real por execução, em processo filho, e um banco-modelo com as
 * migrations do repositório; cada teste clona o modelo (tests/support/test-database.ts).
 */
export default async function setup(project: TestProject) {
  const exitListenersBefore = process.listenerCount('beforeExit');
  const server = await startPostgresProcess();
  try {
    const url = await createDatabase(server.adminUrl, TEMPLATE_DATABASE);
    await applySupabaseCompat(url);
    await migrateUp(url);
    // Guarda: um hook de saída no processo do Vitest (ex.: `embedded-postgres` importado aqui) troca o código de
    // saída por 0 e faria a CI passar com testes falhando.
    if (process.listenerCount('beforeExit') !== exitListenersBefore) {
      throw new Error(
        'A module registered a beforeExit hook in the Vitest process: exit codes would be lost',
      );
    }
  } catch (error) {
    await server.stop();
    throw error;
  }
  project.provide('postgres', { adminUrl: server.adminUrl, template: TEMPLATE_DATABASE });
  return async () => {
    await server.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    postgres: { adminUrl: string; template: string };
  }
}
