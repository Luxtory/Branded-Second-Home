import { timingSafeEqual } from 'node:crypto';
import {
  ConfigurationMissingError,
  EnvValidationError,
  loadRuntimeConfig,
  type EnvSource,
} from '@/features/platform';

/** Chaves de 32 bytes: AES-256 e HMAC-SHA-256 (ADR-0020). */
export const KEY_BYTES = 32;

/** Anel de chaves com a ativa: valores antigos guardam o `key_id` e continuam legíveis enquanto ele estiver no anel. */
export interface KeyRing {
  readonly activeId: string;
  readonly keys: ReadonlyMap<string, Buffer>;
}

export interface PiiKeys {
  readonly encryption: KeyRing;
  readonly hmac: KeyRing;
}

/**
 * `key_id` gravado que o anel não tem mais: a leitura fica indisponível com erro explícito (TECH-001), nomeando a
 * variável — nunca valor errado nem silencioso. O id (não secreto) vai no campo `keyId`.
 */
export class PiiKeyUnavailableError extends ConfigurationMissingError {
  constructor(
    readonly ringKey: 'PII_ENCRYPTION_KEYRING' | 'PII_HMAC_KEYRING',
    readonly keyId: string,
  ) {
    super([ringKey]);
    this.name = 'PiiKeyUnavailableError';
  }
}

/** `id:base64,…` → anel. Ids repetidos, chave fora de 32 bytes ou ativa ausente → configuração inválida (só o nome). */
export function parseKeyRing(
  ringName: string,
  ring: string,
  activeName: string,
  activeId: string,
): KeyRing {
  const keys = new Map<string, Buffer>();
  for (const entry of ring.split(',')) {
    const separator = entry.indexOf(':');
    const id = entry.slice(0, separator);
    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (separator < 1 || keys.has(id) || key.length !== KEY_BYTES) {
      throw new EnvValidationError([ringName]);
    }
    keys.set(id, key);
  }
  if (!keys.has(activeId)) throw new EnvValidationError([activeName]);
  return { activeId, keys };
}

function sharesMaterial(left: KeyRing, right: KeyRing): boolean {
  for (const a of left.keys.values()) {
    for (const b of right.keys.values()) if (timingSafeEqual(a, b)) return true;
  }
  return false;
}

/**
 * Lê os dois anéis (Vercel Sensitive, só servidor). Segredo do HMAC separado da cifra (TECH-100): material repetido
 * entre os anéis é recusado, não só desaconselhado.
 */
export function loadPiiKeys(source: EnvSource = process.env): PiiKeys {
  const config = loadRuntimeConfig(
    [
      'PII_ENCRYPTION_KEYRING',
      'PII_ENCRYPTION_ACTIVE_KEY_ID',
      'PII_HMAC_KEYRING',
      'PII_HMAC_ACTIVE_KEY_ID',
    ],
    source,
  );
  const encryption = parseKeyRing(
    'PII_ENCRYPTION_KEYRING',
    config.PII_ENCRYPTION_KEYRING,
    'PII_ENCRYPTION_ACTIVE_KEY_ID',
    config.PII_ENCRYPTION_ACTIVE_KEY_ID,
  );
  const hmac = parseKeyRing(
    'PII_HMAC_KEYRING',
    config.PII_HMAC_KEYRING,
    'PII_HMAC_ACTIVE_KEY_ID',
    config.PII_HMAC_ACTIVE_KEY_ID,
  );
  if (sharesMaterial(encryption, hmac)) {
    throw new EnvValidationError(['PII_ENCRYPTION_KEYRING', 'PII_HMAC_KEYRING']);
  }
  return { encryption, hmac };
}
