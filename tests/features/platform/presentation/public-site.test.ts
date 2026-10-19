import { describe, expect, it } from 'vitest';
import { isInterestWriteOpen } from '@/features/platform/presentation/public-site';

// Portão da escrita pública de interesse (W5, spec ownership §5): depende do site público e de INTEREST_WRITES.
describe('portão da escrita de interesse (W5)', () => {
  it('[TECH-100] Production fica fechada sem INTEREST_WRITES=open, mesmo com o site público aberto', () => {
    expect(isInterestWriteOpen({ VERCEL_ENV: 'production', PUBLIC_SITE: 'open' })).toBe(false);
    expect(
      isInterestWriteOpen({
        VERCEL_ENV: 'production',
        PUBLIC_SITE: 'open',
        INTEREST_WRITES: 'open',
      }),
    ).toBe(true);
  });

  it('[TECH-100] site público fechado em Production fecha a escrita, mesmo com INTEREST_WRITES=open', () => {
    expect(isInterestWriteOpen({ VERCEL_ENV: 'production', INTEREST_WRITES: 'open' })).toBe(false);
  });

  it('fora de Production abre sem a variável; closed fecha em qualquer ambiente', () => {
    expect(isInterestWriteOpen({})).toBe(true);
    expect(isInterestWriteOpen({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(isInterestWriteOpen({ INTEREST_WRITES: 'closed' })).toBe(false);
    expect(isInterestWriteOpen({ VERCEL_ENV: 'preview', INTEREST_WRITES: 'closed' })).toBe(false);
  });
});
