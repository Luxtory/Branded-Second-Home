import { describe, expect, it } from 'vitest';
import { formatAmount, formatMoney } from '@/features/pricing/presentation/format';

/** W16 C2 — valor curto da célula do calendário (TECH-033): mesma precisão do valor completo, sem passar por `number`. */
describe('PRL — formatação para leitura', () => {
  it('[TECH-033] a forma curta é o valor completo sem o símbolo, com os centavos exatos', () => {
    expect(formatAmount(150_000n)).toBe('1.500,00');
    expect(formatAmount(123_456n)).toBe('1.234,56');
    expect(formatAmount(5n)).toBe('0,05');
    // Acima do inteiro seguro do JavaScript, sem perda.
    expect(formatAmount(900_719_925_474_099_312n)).toBe('9.007.199.254.740.993,12');
    expect(formatMoney(150_000n).replace(/\s/g, ' ')).toBe('R$ 1.500,00');
  });
});
