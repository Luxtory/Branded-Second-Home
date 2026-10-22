import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createDocumentProtector,
  environmentDocumentProtector,
  PiiIntegrityError,
} from '@/features/identity/infrastructure/pii/document-protector';
import {
  loadPiiKeys,
  parseKeyRing,
  PiiKeyUnavailableError,
} from '@/features/identity/infrastructure/pii/keyring';
import { ConfigurationMissingError, EnvValidationError } from '@/features/platform';
import { unavailableKeys } from '@/features/platform/presentation/unavailable';
import { keysOf, ringEnv, ringSpec, rotated, validCpf } from '../../../support/party-fixtures';

const CPF = { type: 'cpf', value: validCpf('123456789') } as const;
const PARTY = '00000000-0000-4000-8000-0000000000c1';
const OTHER_PARTY = '00000000-0000-4000-8000-0000000000c2';

describe('anéis de chaves PII (ADR-0002, ADR-0020)', () => {
  it('[TECH-100] anel válido: ids e chaves de 32 bytes, ativa no anel', () => {
    const spec = ringSpec(['e1', 'e2'], ['h1']);
    const keys = keysOf(spec);

    expect(keys.encryption.activeId).toBe('e2');
    expect([...keys.encryption.keys.keys()]).toEqual(['e1', 'e2']);
    expect(keys.encryption.keys.get('e1')).toHaveLength(32);
  });

  it.each([
    [
      'id repetido',
      () => `a:${randomBytes(32).toString('base64')},a:${randomBytes(32).toString('base64')}`,
      'a',
    ],
    ['chave de 16 bytes', () => `a:${randomBytes(16).toString('base64')}`, 'a'],
    ['ativa fora do anel', () => `a:${randomBytes(32).toString('base64')}`, 'b'],
  ])('[TECH-100] anel inválido nomeia só a variável, nunca o valor: %s', (_case, ring, active) => {
    const value = ring();
    let error: unknown;
    try {
      parseKeyRing('PII_ENCRYPTION_KEYRING', value, 'PII_ENCRYPTION_ACTIVE_KEY_ID', active);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(EnvValidationError);
    expect(String(error)).not.toContain(value.slice(3, 20));
  });

  it('[TECH-100] segredo do HMAC separado: o mesmo material nos dois anéis é recusado', () => {
    const shared = `k1:${randomBytes(32).toString('base64')}`;
    const env = {
      PII_ENCRYPTION_KEYRING: shared,
      PII_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
      PII_HMAC_KEYRING: shared.replace('k1', 'h1'),
      PII_HMAC_ACTIVE_KEY_ID: 'h1',
    };

    expect(() => loadPiiKeys(env)).toThrow(EnvValidationError);
    expect(loadPiiKeys(ringEnv(ringSpec())).hmac.activeId).toBe('h1');
  });

  it('[TECH-001] anéis ausentes → configuração ausente; o protetor só lê no primeiro uso', () => {
    const protector = environmentDocumentProtector({});

    expect(() => protector.lookupDigests(CPF)).toThrow(ConfigurationMissingError);
    try {
      protector.protect(PARTY, CPF);
    } catch (error) {
      expect(unavailableKeys(error)).toEqual(
        expect.arrayContaining(['PII_ENCRYPTION_KEYRING', 'PII_HMAC_KEYRING']),
      );
    }
  });
});

describe('cifra AES-256-GCM e HMAC do documento (TECH-100, ADR-0020)', () => {
  it('[TECH-100] cifra com IV aleatório e key_id; decifra só na própria party (AAD)', () => {
    const protector = createDocumentProtector(keysOf(ringSpec()));
    const first = protector.protect(PARTY, CPF);
    const second = protector.protect(PARTY, CPF);

    expect(first.keyId).toBe('e1');
    expect(first.ciphertext).toHaveLength(12 + 11 + 16);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
    expect(Buffer.from(first.ciphertext).toString('latin1')).not.toContain(CPF.value);
    expect(
      protector.reveal(PARTY, { type: 'cpf', ciphertext: first.ciphertext, keyId: 'e1' }),
    ).toEqual(CPF);
    expect(() =>
      protector.reveal(OTHER_PARTY, { type: 'cpf', ciphertext: first.ciphertext, keyId: 'e1' }),
    ).toThrow(PiiIntegrityError);
  });

  it('[TECH-100] cifra adulterada ou truncada falha com erro sem valor', () => {
    const protector = createDocumentProtector(keysOf(ringSpec()));
    const sealed = Buffer.from(protector.protect(PARTY, CPF).ciphertext);
    const tampered = Buffer.from(sealed);
    tampered[14] = (tampered[14] ?? 0) ^ 1;

    expect(() =>
      protector.reveal(PARTY, { type: 'cpf', ciphertext: tampered, keyId: 'e1' }),
    ).toThrow(PiiIntegrityError);
    expect(() =>
      protector.reveal(PARTY, { type: 'cpf', ciphertext: sealed.subarray(0, 20), keyId: 'e1' }),
    ).toThrow(PiiIntegrityError);
  });

  it('[ADR-0002] rotação da chave de cifra: valor com key_id antigo continua legível; novas cifras usam a ativa', () => {
    const before = ringSpec(['e1'], ['h1']);
    const sealed = createDocumentProtector(keysOf(before)).protect(PARTY, CPF);
    const next = rotated(before.encryption, 'e2');
    const after = createDocumentProtector(
      keysOf({ ...before, encryption: next.ring, encryptionActive: next.active }),
    );

    expect(
      after.reveal(PARTY, { type: 'cpf', ciphertext: sealed.ciphertext, keyId: 'e1' }),
    ).toEqual(CPF);
    expect(after.protect(PARTY, CPF).keyId).toBe('e2');
  });

  it('[ADR-0002] key_id ausente do anel → erro explícito (indisponível), nunca leitura silenciosa', () => {
    const old = createDocumentProtector(keysOf(ringSpec(['e1'], ['h1'])));
    const sealed = old.protect(PARTY, CPF);
    const withoutOld = createDocumentProtector(keysOf(ringSpec(['e9'], ['h1'])));
    let error: unknown;
    try {
      withoutOld.reveal(PARTY, { type: 'cpf', ciphertext: sealed.ciphertext, keyId: 'e1' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PiiKeyUnavailableError);
    expect(error).toMatchObject({ keyId: 'e1' });
    expect(unavailableKeys(error)).toEqual(['PII_ENCRYPTION_KEYRING']);
  });

  it('[ADR-0002] rotação do segredo do HMAC: a party nova grava um digest por chave do anel; a busca usa todas', () => {
    const before = ringSpec(['e1'], ['h1']);
    const [oldDigest] = createDocumentProtector(keysOf(before)).protect(PARTY, CPF).digests;
    const next = rotated(before.hmac, 'h2');
    const after = createDocumentProtector(
      keysOf({ ...before, hmac: next.ring, hmacActive: next.active }),
    );
    const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
    const written = after.protect(PARTY, CPF).digests;

    expect(oldDigest?.keyId).toBe('h1');
    expect(written.map((item) => item.keyId)).toEqual(['h1', 'h2']);
    // A chave comum (h1) produz o mesmo digest nas duas versões: é nela que a corrida colide.
    expect(hex(written[0]?.digest ?? new Uint8Array())).toBe(
      hex(oldDigest?.digest ?? new Uint8Array()),
    );
    expect(after.lookupDigests(CPF).map(hex)).toEqual(written.map((item) => hex(item.digest)));
    expect(after.activeHmacKeyId()).toBe('h2');
  });

  it('[TECH-100] HMAC determinístico por chave, separado por finalidade, por tipo e por chave', () => {
    const spec = ringSpec(['e1'], ['h1', 'h2']);
    const protector = createDocumentProtector(keysOf(spec));
    const [h1] = protector.protect(PARTY, CPF).digests;
    const digest = Buffer.from(h1?.digest ?? new Uint8Array()).toString('hex');

    expect(
      Buffer.from(
        protector.protect(OTHER_PARTY, CPF).digests[0]?.digest ?? new Uint8Array(),
      ).toString('hex'),
    ).toBe(digest);
    expect(protector.fingerprint('document', `cpf|${CPF.value}`, 'h1')).not.toBe(digest);
    expect(protector.fingerprint('document', 'x', 'h1')).not.toBe(
      protector.fingerprint('email', 'x', 'h1'),
    );
    expect(protector.fingerprint('email', 'x', 'h1')).not.toBe(
      protector.fingerprint('email', 'x', 'h2'),
    );
    expect(protector.fingerprint('email', 'pessoa@exemplo.test', 'h2')).toMatch(/^[0-9a-f]{64}$/);
    expect(() => protector.fingerprint('email', 'x', 'h9')).toThrow(PiiKeyUnavailableError);
  });
});
