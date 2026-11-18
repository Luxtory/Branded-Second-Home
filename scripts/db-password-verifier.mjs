// npm run db:password-verifier [-- <papel>] — imprime o `ALTER ROLE <papel> … PASSWORD '<verificador SCRAM>'` para o
// SQL Editor do Supabase (runbooks: docs/how-to/operacao.md e, para o papel autorizador, docs/how-to/autorizador-de-
// reservas.md). A senha é lida sem eco e nunca é impressa nem gravada.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { scramVerifier } from './lib/scram.mjs';

// Papéis com senha definida por runbook (lista fechada): o da aplicação (padrão) e o autorizador independente (W13 E5).
const ROLES = ['luxtory_app', 'luxtory_booking_authorizer'];
const ROLE = process.argv[2] ?? ROLES[0];
// Senha gerada por gerenciador de senhas; o runbook pede ao menos este tamanho.
const MIN_PASSWORD_LENGTH = 32;

/** Lê uma linha do stdin; num terminal, sem ecoar o que é digitado. */
function readSecret(prompt) {
  const muted = new Writable({ write: (_chunk, _encoding, done) => done() });
  process.stderr.write(prompt);
  const rl = createInterface({
    input: process.stdin,
    output: muted,
    terminal: process.stdin.isTTY,
  });
  return new Promise((resolve) => {
    rl.once('line', (line) => {
      // Resolver antes do close: `rl.close()` emite 'close' de forma síncrona, e o resolve('') abaixo venceria.
      resolve(line);
      rl.close();
      process.stderr.write('\n');
    });
    // Só vale quando nenhuma linha chegou (stdin encerrado vazio): a senha vazia é recusada adiante.
    rl.once('close', () => resolve(''));
  });
}

if (!ROLES.includes(ROLE)) {
  console.error(`Papel não aceito. Use um destes: ${ROLES.join(', ')}.`);
  process.exit(1);
}

const password = await readSecret(`Senha do papel ${ROLE} (não aparece na tela): `);
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`A senha precisa de ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  process.exit(1);
}
console.log(`ALTER ROLE ${ROLE} WITH PASSWORD '${scramVerifier(password)}';`);
