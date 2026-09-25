import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '@/features/platform';

describe('loadEnv', () => {
  it('lê só as chaves do catálogo: outras variáveis não são exigidas, removidas nem alteradas', () => {
    const source = {
      VERCEL_ENV: 'preview',
      ULTRONPX_PURCHASE_EMAIL: 'valor-de-outro-sistema',
      OUTRA_VARIAVEL: 'x',
    };
    const snapshot = { ...source };

    expect(loadEnv(source)).toEqual({ VERCEL_ENV: 'preview' });
    expect(source).toEqual(snapshot);
  });

  it('não exige nenhuma variável e trata string vazia como ausente', () => {
    expect(loadEnv({})).toEqual({});
    expect(loadEnv({ VERCEL_ENV: '', VERCEL_GIT_COMMIT_SHA: '' })).toEqual({});
  });

  it('valor inválido falha com o nome da chave, sem expor o valor', () => {
    const attempt = () => loadEnv({ VERCEL_ENV: 'valor-secreto-invalido' });

    expect(attempt).toThrow(EnvValidationError);
    expect(attempt).toThrow(/VERCEL_ENV/);
    expect(attempt).not.toThrow(/valor-secreto-invalido/);
  });
});
