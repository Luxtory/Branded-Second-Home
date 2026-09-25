import type { TestProject } from 'vitest/node';
import { migrateUp } from '../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat, startPostgres } from '../../scripts/lib/embedded-pg.mjs';

const TEMPLATE_DATABASE = 'luxtory_template';

/**
 * Projeto `db` do Vitest (ADR-0005): um PostgreSQL real por execução e um banco-modelo com as migrations do
 * repositório; cada arquivo de teste clona o modelo (tests/support/test-database.ts).
 */
export default async function setup(project: TestProject) {
  const server = await startPostgres();
  try {
    const url = await server.createDatabase(TEMPLATE_DATABASE);
    await applySupabaseCompat(url);
    await migrateUp(url);
  } catch (error) {
    await server.stop();
    throw error;
  }
  project.provide('postgres', { adminUrl: server.url('postgres'), template: TEMPLATE_DATABASE });
  return async () => {
    await server.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    postgres: { adminUrl: string; template: string };
  }
}
