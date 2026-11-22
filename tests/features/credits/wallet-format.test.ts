import { describe, expect, it } from 'vitest';
import {
  STATEMENT_PAGE_SIZE,
  formatCreditQuantity,
  isOneCredit,
  pageCount,
  parseWalletQuery,
  shortCode,
  walletHref,
} from '@/features/credits/presentation/wallet-format';
import { walletMessages } from '@/features/credits/presentation/i18n/wallet-pt-br';

const PARTY = '0b9f3c1e-6a2d-4f7b-9c1e-2d3f4a5b6c7d';

describe('Carteira — formatação exata e parâmetros de URL [REQ-053][REQ-054]', () => {
  it('quantidade em número pt-BR exato, sem moeda nem arredondamento [REQ-053]', () => {
    expect(formatCreditQuantity('0')).toBe('0');
    expect(formatCreditQuantity('12.50')).toBe('12,5');
    expect(formatCreditQuantity('1234567.000000000001')).toBe('1.234.567,000000000001');
    expect(formatCreditQuantity('999')).toBe('999');
    expect(formatCreditQuantity('1000')).toBe('1.000');
    expect(walletMessages.credits(formatCreditQuantity('1'), isOneCredit('1'))).toBe('1 Crédito');
    expect(walletMessages.credits(formatCreditQuantity('1.5'), isOneCredit('1.5'))).toBe(
      '1,5 Créditos',
    );
    for (const sample of ['12.5', '1000', '0.25'])
      expect(walletMessages.credits(formatCreditQuantity(sample), false)).not.toMatch(/R\$|BRL|\$/);
  });

  it('referência curta estável do lote e da operação', () => {
    expect(shortCode(PARTY)).toBe('0B9F3C1E');
  });

  it('parâmetros válidos são lidos; inválidos são ignorados, nunca erro', () => {
    expect(parseWalletQuery({})).toEqual({ partyId: null, movement: null, page: 1 });
    expect(parseWalletQuery({ pessoa: PARTY.toUpperCase(), tipo: 'hold', pagina: '3' })).toEqual({
      partyId: PARTY,
      movement: 'hold',
      page: 3,
    });
    expect(parseWalletQuery({ pessoa: 'x', tipo: 'withdraw', pagina: '0' })).toEqual({
      partyId: null,
      movement: null,
      page: 1,
    });
    expect(parseWalletQuery({ pagina: ['2', '3'], tipo: '-1' })).toMatchObject({ page: 1 });
    expect(parseWalletQuery({ pagina: '1e3' }).page).toBe(1);
  });

  it('paginação de 20 por página e URL só com o que não é padrão', () => {
    expect(STATEMENT_PAGE_SIZE).toBe(20);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    const base = '/titular/carteira';
    expect(walletHref({ partyId: null, movement: null, page: 1 }, base)).toBe(base);
    expect(walletHref({ partyId: PARTY, movement: 'consume', page: 2 }, base)).toBe(
      `${base}?pessoa=${PARTY}&tipo=consume&pagina=2`,
    );
  });
});
