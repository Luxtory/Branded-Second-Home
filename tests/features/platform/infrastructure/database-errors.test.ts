import { describe, expect, it } from 'vitest';
import {
  isDatabaseUnavailable,
  violatedConstraint,
} from '@/features/platform/infrastructure/database/errors';

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('pg'), { code, ...(constraint === undefined ? {} : { constraint }) });

describe('classificação de erros do banco', () => {
  it('[TECH-056] banco inalcançável ou recusando conexões é indisponibilidade (503), não erro interno', () => {
    expect(isDatabaseUnavailable(pgError('ECONNREFUSED'))).toBe(true);
    expect(isDatabaseUnavailable(pgError('ETIMEDOUT'))).toBe(true);
    expect(isDatabaseUnavailable(pgError('08006'))).toBe(true);
    expect(isDatabaseUnavailable(pgError('57P01'))).toBe(true);
    expect(isDatabaseUnavailable(pgError('53300'))).toBe(true);
  });

  it('erros de integridade, de sintaxe ou sem código não são indisponibilidade', () => {
    expect(isDatabaseUnavailable(pgError('23505'))).toBe(false);
    expect(isDatabaseUnavailable(pgError('42601'))).toBe(false);
    expect(isDatabaseUnavailable(new Error('sem código'))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
  });

  it('constraint violada só em erro de integridade (classe 23)', () => {
    expect(violatedConstraint(pgError('23514', 'home_edition_projected_investment_overlap'))).toBe(
      'home_edition_projected_investment_overlap',
    );
    expect(violatedConstraint(pgError('08006', 'qualquer'))).toBeNull();
  });
});
