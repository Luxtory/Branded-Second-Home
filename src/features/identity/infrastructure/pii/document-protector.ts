import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { EnvSource } from '@/features/platform';
import type { PartyDocumentProtector } from '../../application/party-ports';
import { isDocumentType, type PartyDocument } from '../../domain/party-document';
import { loadPiiKeys, PiiKeyUnavailableError, type KeyRing, type PiiKeys } from './keyring';

const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
// Separação de domínio (ADR-0020): o mesmo segredo nunca produz o mesmo valor para finalidades diferentes.
const DOCUMENT_CONTEXT = 'luxtory:party.document:v1';
const FINGERPRINT_CONTEXT = 'luxtory:idempotency.fingerprint:v1';

/** Cifra adulterada, truncada ou de outra linha: a tag GCM não confere. Sem valor na mensagem. */
export class PiiIntegrityError extends Error {
  constructor() {
    super('Party document failed authentication');
    this.name = 'PiiIntegrityError';
  }
}

function keyOf(
  ring: KeyRing,
  keyId: string,
  ringKey: 'PII_ENCRYPTION_KEYRING' | 'PII_HMAC_KEYRING',
) {
  const key = ring.keys.get(keyId);
  if (key === undefined) throw new PiiKeyUnavailableError(ringKey, keyId);
  return key;
}

const aad = (partyId: string, keyId: string) =>
  Buffer.from(`${DOCUMENT_CONTEXT}|${partyId}|${keyId}`);

function seal(key: Buffer, partyId: string, keyId: string, plaintext: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(partyId, keyId));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

function open(key: Buffer, partyId: string, keyId: string, sealed: Uint8Array): string {
  const bytes = Buffer.from(sealed);
  if (bytes.length <= IV_BYTES + TAG_BYTES) throw new PiiIntegrityError();
  const decipher = createDecipheriv(CIPHER, key, bytes.subarray(0, IV_BYTES), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(aad(partyId, keyId));
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
  try {
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new PiiIntegrityError();
  }
}

const documentDigest = (key: Buffer, document: PartyDocument) =>
  createHmac('sha256', key)
    .update(`${DOCUMENT_CONTEXT}|${document.type}|${document.value}`)
    .digest();

/**
 * Proteção do CPF/CNPJ (ADR-0020): AES-256-GCM com IV aleatório e AAD amarrado à party e ao `key_id`; HMAC-SHA-256 com
 * o anel próprio. As chaves vêm dos anéis já validados; nada aqui registra ou devolve o documento.
 */
export function createDocumentProtector(keys: PiiKeys): PartyDocumentProtector {
  const { encryption, hmac } = keys;
  return {
    protect(partyId, document) {
      const encryptionKey = keyOf(encryption, encryption.activeId, 'PII_ENCRYPTION_KEYRING');
      return {
        type: document.type,
        ciphertext: seal(encryptionKey, partyId, encryption.activeId, document.value),
        keyId: encryption.activeId,
        // Um digest por chave do anel do HMAC (ADR-0020 §2): a unicidade sobrevive a versões com anéis diferentes.
        digests: [...hmac.keys.entries()].map(([keyId, key]) => ({
          keyId,
          digest: documentDigest(key, document),
        })),
      };
    },
    reveal(partyId, sealed) {
      const key = keyOf(encryption, sealed.keyId, 'PII_ENCRYPTION_KEYRING');
      const value = open(key, partyId, sealed.keyId, sealed.ciphertext);
      if (!isDocumentType(sealed.type)) throw new PiiIntegrityError();
      return { type: sealed.type, value };
    },
    lookupDigests(document) {
      return [...hmac.keys.values()].map((key) => documentDigest(key, document));
    },
    activeHmacKeyId: () => hmac.activeId,
    fingerprint(purpose, value, keyId) {
      const key = keyOf(hmac, keyId, 'PII_HMAC_KEYRING');
      return createHmac('sha256', key)
        .update(`${FINGERPRINT_CONTEXT}|${purpose}|${value}`)
        .digest('hex');
    },
  };
}

/**
 * Protetor do ambiente atual, com os anéis lidos no primeiro uso — dentro do command ou da leitura, onde anéis ausentes
 * ou inválidos viram "indisponível" nomeando só a variável (TECH-001).
 */
export function environmentDocumentProtector(
  source: EnvSource = process.env,
): PartyDocumentProtector {
  let protector: PartyDocumentProtector | null = null;
  const current = () => (protector ??= createDocumentProtector(loadPiiKeys(source)));
  return {
    protect: (partyId, document) => current().protect(partyId, document),
    reveal: (partyId, sealed) => current().reveal(partyId, sealed),
    lookupDigests: (document) => current().lookupDigests(document),
    activeHmacKeyId: () => current().activeHmacKeyId(),
    fingerprint: (purpose, value, keyId) => current().fingerprint(purpose, value, keyId),
  };
}
