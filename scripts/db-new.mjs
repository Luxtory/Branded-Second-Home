// npm run db:new -- <nome_em_snake_case> — cria migrations/<timestamp>_<nome>.sql com up e down.
import { dbmate } from './lib/dbmate.mjs';

const name = process.argv[2] ?? '';
if (!/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error('Usage: npm run db:new -- <snake_case_name>');
  process.exit(1);
}
const { stdout } = await dbmate(['new', name]);
process.stdout.write(stdout);
