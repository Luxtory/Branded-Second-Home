// npm run db:migrate — aplica as migrations pendentes no banco de DATABASE_URL_MIGRATIONS.
// Usado só pela CI (job migrate, push em main). Passos:
//   1. Preflight: `dbmate status` conecta no banco-alvo com o mesmo cliente (e as mesmas regras de TLS) que aplica
//      as migrations e só lê o histórico — não cria schema, tabela nem banco. Falha com URL ausente ou inválida (host,
//      porta, credencial ou banco) mesmo quando ainda não há migrations.
//   2. Aplica as migrations pendentes, se houver.
// A URL nunca é impressa: o dbmate a recebe por variável de ambiente e as mensagens de erro têm credenciais mascaradas.
import { countMigrationFiles, dbmate } from './lib/dbmate.mjs';

async function main() {
  const url = process.env.DATABASE_URL_MIGRATIONS;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL_MIGRATIONS is not set: no migration was applied.');
  }
  const status = await dbmate(['status'], { url });
  console.log('db:migrate preflight ok — connected to the target database (read-only check).');
  process.stdout.write(status.stdout);

  if (countMigrationFiles() === 0) {
    console.log('No migration files: nothing to apply.');
    return;
  }
  const { stdout } = await dbmate(['up', '--strict'], { url });
  process.stdout.write(stdout);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
