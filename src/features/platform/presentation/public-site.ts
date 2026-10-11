import { loadEnv, type EnvSource } from '../infrastructure/env';

/**
 * Portão do site público (ADR-0014, spec catalog §13.3): em Production as páginas públicas só abrem com `PUBLIC_SITE=open`
 * (decisão de go-live); fora de Production — local, CI e Preview — abrem. Fechado, a página responde 404.
 */
export function isPublicSiteOpen(source?: EnvSource): boolean {
  const env = source === undefined ? loadEnv() : loadEnv(source);
  return env.VERCEL_ENV !== 'production' || env.PUBLIC_SITE === 'open';
}

/**
 * Portão da jornada Brand Partners (BP1, spec catalog §14.1), independente de `PUBLIC_SITE`: `closed` fecha em qualquer
 * ambiente; ausente, só Production fica fechada (go-live com `open`). Fechado, páginas e endpoint respondem 404.
 */
export function isBrandPartnersSiteOpen(source?: EnvSource): boolean {
  const env = source === undefined ? loadEnv() : loadEnv(source);
  if (env.BRAND_PARTNERS_SITE !== undefined) return env.BRAND_PARTNERS_SITE === 'open';
  return env.VERCEL_ENV !== 'production';
}
