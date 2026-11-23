import { describe, expect, it } from 'vitest';
import { isSecondHomeDevelopmentSiteOpen } from '../../../../src/features/platform/presentation/public-site';

describe('portão de Second Home Development (catalog §23)', () => {
  it('abre em revisão e exige ativação explícita em produção', () => {
    expect(isSecondHomeDevelopmentSiteOpen({})).toBe(true);
    expect(isSecondHomeDevelopmentSiteOpen({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(isSecondHomeDevelopmentSiteOpen({ VERCEL_ENV: 'production' })).toBe(false);
    expect(
      isSecondHomeDevelopmentSiteOpen({
        VERCEL_ENV: 'production',
        SECOND_HOME_DEVELOPMENT_SITE: 'open',
        BRAND_PARTNERS_SITE: 'closed',
        SECOND_HOME_PARTNERS_SITE: 'closed',
      }),
    ).toBe(true);
  });

  it('respeita o fechamento explícito mesmo em revisão', () => {
    expect(
      isSecondHomeDevelopmentSiteOpen({
        VERCEL_ENV: 'preview',
        SECOND_HOME_DEVELOPMENT_SITE: 'closed',
        PUBLIC_SITE: 'open',
      }),
    ).toBe(false);
  });
});
