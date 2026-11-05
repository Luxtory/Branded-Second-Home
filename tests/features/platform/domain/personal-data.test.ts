import { describe, expect, it } from 'vitest';
import {
  isNonPersonalReference,
  REDACTED,
  redactPersonalData,
} from '@/features/platform/domain/personal-data';

describe('redactPersonalData', () => {
  it('[TECH-100] redige chaves sensíveis em qualquer profundidade, inclusive dentro de listas', () => {
    const snapshot = {
      party_id: 'p-1',
      holder: { cpf: '12345678901', nome: 'Fulano', contacts: [{ email: 'x@y.z', kind: 'main' }] },
      nights: [1, 2],
    };

    expect(redactPersonalData(snapshot)).toEqual({
      party_id: 'p-1',
      holder: { cpf: REDACTED, nome: REDACTED, contacts: [{ email: REDACTED, kind: 'main' }] },
      nights: [1, 2],
    });
  });

  it('não altera o valor original e preserva primitivos e nulos', () => {
    const snapshot = { token: 'abc', count: 3, note: null };

    redactPersonalData(snapshot);

    expect(snapshot.token).toBe('abc');
    expect(redactPersonalData('texto')).toBe('texto');
    expect(redactPersonalData(null)).toBeNull();
  });
});

describe('isNonPersonalReference (W13, spec booking §10.12 D11)', () => {
  it('aceita referências de protocolo, ticket e documento interno, inclusive com datas', () => {
    for (const text of [
      'Ticket OPS-4821',
      'Relatório da administração 2026-11-04 nº 17',
      'OS-2026-1104',
      'Protocolo ADM/2026/0042 — ausência constatada',
      'INC-2026-001',
    ])
      expect(isNonPersonalReference(text), text).toBe(true);
  });

  it('recusa forma de e-mail, CPF, CNPJ, telefone com DDD e caractere de controle', () => {
    for (const text of [
      'contato fulano@exemplo.com',
      'CPF 123.456.789-01',
      'doc 12345678901',
      'CNPJ 12.345.678/0001-90',
      'tel (11) 98765-4321',
      'tel 11987654321',
      'linha\u0007sino',
      'quebra\nde linha',
    ])
      expect(isNonPersonalReference(text), text).toBe(false);
  });
});
