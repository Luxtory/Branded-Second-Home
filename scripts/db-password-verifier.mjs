// npm run db:password-verifier — imprime o `ALTER ROLE luxtory_app … PASSWORD '<verificador SCRAM>'` para o SQL
// Editor do Supabase (runbook: docs/how-to/operacao.md). A senha é lida sem eco e nunca é impressa nem gravada.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { scramVerifier } from './lib/scram.mjs';

const ROLE = 'luxtory_app';
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

const password = await readSecret(`Senha do papel ${ROLE} (não aparece na tela): `);
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`A senha precisa de ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  process.exit(1);
}
console.log(`ALTER ROLE ${ROLE} WITH PASSWORD '${scramVerifier(password)}';`);
