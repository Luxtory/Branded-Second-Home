// Verificador SCRAM-SHA-256 no formato do PostgreSQL (RFC 5802/7677): o servidor guarda só isto, nunca a senha.
// `ALTER ROLE … PASSWORD '<verificador>'` define a senha sem que o texto puro chegue ao servidor nem aos logs dele.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

// Mesmo padrão do PostgreSQL (`scram_iterations`) e mesmo tamanho de salt que ele gera.
export const SCRAM_ITERATIONS = 4096;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// Só ASCII visível: o SASLprep do PostgreSQL não altera esses caracteres, então o verificador bate com o login.
const PRINTABLE_ASCII = /^[!-~]+$/;

export class ScramInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScramInputError';
  }
}

const hmac = (key, text) => createHmac('sha256', key).update(text).digest();

/**
 * @param {string} password
 * @param {{ salt?: Buffer, iterations?: number }} [options]
 * @returns {string}
 */
export function scramVerifier(password, options = {}) {
  if (!PRINTABLE_ASCII.test(password)) {
    throw new ScramInputError('The password must use only visible ASCII characters (no spaces)');
  }
  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const iterations = options.iterations ?? SCRAM_ITERATIONS;
  const saltedPassword = pbkdf2Sync(password, salt, iterations, KEY_BYTES, 'sha256');
  const storedKey = createHash('sha256').update(hmac(saltedPassword, 'Client Key')).digest();
  const serverKey = hmac(saltedPassword, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
