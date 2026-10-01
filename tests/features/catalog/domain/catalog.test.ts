import { describe, expect, it } from 'vitest';
import {
  authorizationCovers,
  canApprove,
  currentVersion,
  isBrandInUse,
} from '@/features/catalog/domain/catalog';
import { hasForbiddenTerm } from '@/features/catalog/domain/terminology';
import { ianaTimeZones, isIanaTimeZone } from '@/features/catalog/domain/time-zone';

const AT = new Date('2026-09-15T12:00:00.000Z');
const before = (ms: number) => new Date(AT.getTime() - ms);
const after = (ms: number) => new Date(AT.getTime() + ms);

describe('regras do catálogo (domínio puro)', () => {
  it('[BR-021] a marca aceita novos usos só antes da eficácia do encerramento (no instante exato já não)', () => {
    expect(isBrandInUse({ terminatedEffectiveAt: null }, AT)).toBe(true);
    expect(isBrandInUse({ terminatedEffectiveAt: after(1) }, AT)).toBe(true);
    expect(isBrandInUse({ terminatedEffectiveAt: AT }, AT)).toBe(false);
    expect(isBrandInUse({ terminatedEffectiveAt: before(1) }, AT)).toBe(false);
  });

  it('[REQ-096] versão vigente = a aprovada de maior número; só se aprova versão não aprovada e maior', () => {
    const versions = [
      { version: 1, state: 'approved' },
      { version: 3, state: 'not_approved' },
      { version: 2, state: 'approved' },
    ] as const;
    expect(currentVersion(versions)).toEqual({ version: 2, state: 'approved' });
    expect(currentVersion([{ version: 1, state: 'not_approved' }])).toBeNull();

    expect(canApprove({ version: 3, state: 'not_approved' }, { version: 2 })).toBe(true);
    expect(canApprove({ version: 1, state: 'not_approved' }, null)).toBe(true);
    expect(canApprove({ version: 2, state: 'not_approved' }, { version: 2 })).toBe(false);
    expect(canApprove({ version: 1, state: 'not_approved' }, { version: 2 })).toBe(false);
    expect(canApprove({ version: 3, state: 'approved' }, { version: 2 })).toBe(false);
  });

  it('[REQ-027] autorização do Investor: mesmo Concept, não revogada e vigente no instante', () => {
    const base = {
      conceptId: 'c1',
      validFrom: before(1_000),
      validUntil: after(1_000) as Date | null,
      revokedAt: null as Date | null,
    };
    expect(authorizationCovers(base, 'c1', AT)).toBe(true);
    expect(authorizationCovers({ ...base, validUntil: null }, 'c1', AT)).toBe(true);
    expect(authorizationCovers(base, 'c2', AT)).toBe(false);
    expect(authorizationCovers({ ...base, revokedAt: before(1) }, 'c1', AT)).toBe(false);
    expect(authorizationCovers({ ...base, validFrom: after(1) }, 'c1', AT)).toBe(false);
    expect(authorizationCovers({ ...base, validUntil: AT }, 'c1', AT)).toBe(false);
  });

  it('[REQ-100] [REQ-101] checagem lexical: termos vedados e promessas explícitas, sem falso positivo nas palavras vizinhas', () => {
    for (const text of [
      'Casa por cota',
      'COTAS da residência',
      'Cotista',
      'Diárias no verão',
      'uma diária',
      'Rentabilidade garantida',
      'valorização assegurada',
      'renda garantida',
      'retorno  garantido',
      'Lucro garantido',
      'liquidez garantida',
    ]) {
      expect(hasForbiddenTerm(text), text).toBe(true);
    }
    for (const text of [
      'Cotação do projeto',
      'Uso diariamente acompanhado',
      'Retorno ao lar',
      'Garantia de qualidade da obra',
      'Rentabilidade não é prometida',
    ]) {
      expect(hasForbiddenTerm(text), text).toBe(false);
    }
  });

  it('[REQ-101] checagem de terminologia recusa disponibilidade ou uso garantidos, irrestritos ou ilimitados', () => {
    for (const text of [
      'Disponibilidade garantida',
      'disponibilidades garantidas',
      'USO IRRESTRITO',
      'uso ilimitado da casa',
      'Direito de Uso garantido',
    ]) {
      expect(hasForbiddenTerm(text), text).toBe(true);
    }
    for (const text of [
      'conforme disponibilidade e regras',
      'Créditos não garantem disponibilidade',
      'Uso próprio independe de Membership',
      'Disponibilidade sujeita às regras da Residence',
    ]) {
      expect(hasForbiddenTerm(text), text).toBe(false);
    }
  });

  it('[TECH-001] fuso da Residence: só nomes IANA do runtime, sem padrão', () => {
    expect(isIanaTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isIanaTimeZone('Europe/Lisbon')).toBe(true);
    expect(isIanaTimeZone('Brasilia')).toBe(false);
    expect(isIanaTimeZone('')).toBe(false);
    expect(ianaTimeZones().length).toBeGreaterThan(300);
  });
});
