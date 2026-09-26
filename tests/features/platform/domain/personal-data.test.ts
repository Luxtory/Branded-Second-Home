import { describe, expect, it } from 'vitest';
import { REDACTED, redactPersonalData } from '@/features/platform/domain/personal-data';

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
