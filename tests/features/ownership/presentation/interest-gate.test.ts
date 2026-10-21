import { describe, expect, it } from 'vitest';
import {
  PRIVACY_NOTICE_TOPICS,
  type PrivacyNotice,
} from '@/features/ownership/domain/privacy-notice';
import { hasInterestConfiguration } from '@/features/ownership/presentation/interest-config';
import {
  isInterestCollectionOpen,
  isInterestFormAvailable,
  isPrivacyNoticePageOpen,
} from '@/features/ownership/presentation/interest-gate';

// Portões da coleta em defesa em profundidade (spec ownership §14.9): nenhum sozinho abre.
const PENDING: PrivacyNotice = { status: 'pending' };
/** Fixture estrutural de teste (texto fictício), só para exercitar os portões. */
const APPROVED: PrivacyNotice = {
  status: 'approved',
  version: 'fixture-1',
  approvedOn: '2026-10-20',
  sections: PRIVACY_NOTICE_TOPICS.map((topic) => ({
    topic,
    title: `Título de teste ${topic}`,
    paragraphs: [`Parágrafo de teste ${topic}.`],
    links: topic === 'channel' ? [{ label: 'Canal', href: 'mailto:canal@example.com' }] : [],
  })),
};

const CONFIG = {
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: 'h'.repeat(32),
  INTEREST_REQUEST_HMAC_SECRET: 'i'.repeat(32),
  INTEREST_CONTEXT_HMAC_SECRET: 'c'.repeat(32),
  INTEREST_NETWORK_LIMIT: '5',
  INTEREST_NETWORK_WINDOW_SECONDS: '60',
  INTEREST_GLOBAL_LIMIT: '100',
  INTEREST_GLOBAL_WINDOW_SECONDS: '60',
  UPSTASH_REDIS_REST_URL: 'https://upstash.example',
  UPSTASH_REDIS_REST_TOKEN: 't'.repeat(24),
  INTEREST_LIMITER_TIMEOUT_MS: '500',
  DATABASE_URL: 'postgres://luxtory_app:segredo@db.example:5432/postgres',
};
const PRODUCTION = {
  ...CONFIG,
  VERCEL_ENV: 'production',
  PUBLIC_SITE: 'open',
  INTEREST_WRITES: 'open',
};

describe('portões da coleta de interesse (spec ownership §14.9)', () => {
  it('[TECH-100] Production: INTEREST_WRITES=open com Aviso pendente não abre — nem escrita, nem seção', () => {
    expect(isInterestCollectionOpen(PRODUCTION, PENDING)).toBe(false);
    expect(isInterestFormAvailable(PRODUCTION, PENDING)).toBe(false);
  });

  it('[TECH-100] Production: Aviso aprovado sozinho não abre (escrita ausente, fechada ou site fechado)', () => {
    expect(isInterestCollectionOpen({ ...PRODUCTION, INTEREST_WRITES: 'closed' }, APPROVED)).toBe(
      false,
    );
    expect(isInterestCollectionOpen({ ...PRODUCTION, INTEREST_WRITES: undefined }, APPROVED)).toBe(
      false,
    );
    expect(isInterestCollectionOpen({ ...PRODUCTION, PUBLIC_SITE: undefined }, APPROVED)).toBe(
      false,
    );
  });

  it('[TECH-100] Production: todos os portões e a configuração completa → seção disponível; sem um segredo, não', () => {
    expect(isInterestCollectionOpen(PRODUCTION, APPROVED)).toBe(true);
    expect(isInterestFormAvailable(PRODUCTION, APPROVED)).toBe(true);
    for (const key of ['INTEREST_REQUEST_HMAC_SECRET', 'INTEREST_CONTEXT_HMAC_SECRET']) {
      expect(isInterestFormAvailable({ ...PRODUCTION, [key]: undefined }, APPROVED), key).toBe(
        false,
      );
    }
  });

  it('fora de Production o Aviso pendente não fecha; a escrita fechada ou a falta de configuração fecham', () => {
    expect(isInterestCollectionOpen(CONFIG, PENDING)).toBe(true);
    expect(isInterestFormAvailable(CONFIG, PENDING)).toBe(true);
    expect(isInterestCollectionOpen({ ...CONFIG, INTEREST_WRITES: 'closed' }, PENDING)).toBe(false);
    expect(isInterestFormAvailable({ ...CONFIG, DATABASE_URL: undefined }, PENDING)).toBe(false);
  });

  it('Preview: o banco é recusado (ADR-0007) → sem a seção do formulário', () => {
    expect(isInterestFormAvailable({ ...CONFIG, VERCEL_ENV: 'preview' }, APPROVED)).toBe(false);
  });

  it('modo fake local dispensa Upstash; configuração inválida = indisponível, nunca um default', () => {
    const fake = {
      ...CONFIG,
      INTEREST_LIMITER_MODE: 'fake',
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
      INTEREST_LIMITER_TIMEOUT_MS: undefined,
    };
    expect(hasInterestConfiguration(fake)).toBe(true);
    expect(hasInterestConfiguration({ ...CONFIG, INTEREST_NETWORK_LIMIT: 'zero' })).toBe(false);
    expect(hasInterestConfiguration({ ...CONFIG, INTEREST_REQUEST_HMAC_SECRET: 'curto' })).toBe(
      false,
    );
    expect(hasInterestConfiguration({ ...CONFIG, INTEREST_CONTEXT_HMAC_SECRET: 'curto' })).toBe(
      false,
    );
  });

  it('/privacidade: em Production só com o site aberto e o Aviso aprovado; fora dela, o pendente aparece', () => {
    expect(isPrivacyNoticePageOpen(PRODUCTION, PENDING)).toBe(false);
    expect(isPrivacyNoticePageOpen(PRODUCTION, APPROVED)).toBe(true);
    expect(isPrivacyNoticePageOpen({ ...PRODUCTION, PUBLIC_SITE: undefined }, APPROVED)).toBe(
      false,
    );
    expect(isPrivacyNoticePageOpen(CONFIG, PENDING)).toBe(true);
  });
});
