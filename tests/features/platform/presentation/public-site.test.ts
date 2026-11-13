import { describe, expect, it } from 'vitest';
import {
  isBrandPartnersSiteOpen,
  isInterestWriteOpen,
  isSecondHomePartnersSiteOpen,
} from '@/features/platform/presentation/public-site';

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

// Portão da jornada Second Home Partners (SHP1, spec catalog §20.1): independente do site público e do Brand Partners.
describe('portão da jornada Second Home Partners (SHP1)', () => {
  it('[REQ-105] Production fica fechada sem SECOND_HOME_PARTNERS_SITE=open, mesmo com os outros portões abertos', () => {
    const production = {
      VERCEL_ENV: 'production',
      PUBLIC_SITE: 'open',
      BRAND_PARTNERS_SITE: 'open',
    };
    expect(isSecondHomePartnersSiteOpen(production)).toBe(false);
    expect(isSecondHomePartnersSiteOpen({ ...production, SECOND_HOME_PARTNERS_SITE: 'open' })).toBe(
      true,
    );
  });

  it('[REQ-105] fora de Production abre sem a variável; closed fecha em qualquer ambiente; nada afeta Brand Partners', () => {
    expect(isSecondHomePartnersSiteOpen({})).toBe(true);
    expect(isSecondHomePartnersSiteOpen({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(isSecondHomePartnersSiteOpen({ SECOND_HOME_PARTNERS_SITE: 'closed' })).toBe(false);
    expect(isBrandPartnersSiteOpen({ SECOND_HOME_PARTNERS_SITE: 'closed' })).toBe(true);
    expect(
      isSecondHomePartnersSiteOpen({
        VERCEL_ENV: 'production',
        BRAND_PARTNERS_SITE: 'closed',
        SECOND_HOME_PARTNERS_SITE: 'open',
      }),
    ).toBe(true);
  });
});
