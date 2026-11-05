import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
  CLOSED_CAPABILITIES,
  PRIVILEGE_REFUSALS,
  TECHNICAL_PRIVILEGE_ERRORS,
} from '@/features/platform/domain/errors';
import {
  isDatabaseUnavailable,
  refusedPrivilege,
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

  it('[TECH-056] recusa por privilégio só em 42501 com nome de regra; "permission denied" sem nome não é recusa', () => {
    expect(refusedPrivilege(pgError('42501', 'permission_authorization_used'))).toBe(
      'permission_authorization_used',
    );
    expect(refusedPrivilege(pgError('42501'))).toBeNull();
    expect(refusedPrivilege(pgError('23514', 'permission_representation'))).toBeNull();
    expect(violatedConstraint(pgError('42501', 'permission_representation'))).toBeNull();
  });

  it('[spec booking §10.12] todo 42501 nomeado das migrations está classificado em exatamente uma lista (D1)', () => {
    const named = new Set<string>();
    for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql'))) {
      const sql = readFileSync(`migrations/${file}`, 'utf8');
      for (const match of sql.matchAll(
        /ERRCODE = 'insufficient_privilege',\s*CONSTRAINT = '([a-z_]+)'/g,
      ))
        named.add(match[1]!);
    }
    const lists = [
      [...PRIVILEGE_REFUSALS.keys()],
      [...CLOSED_CAPABILITIES.keys()],
      [...TECHNICAL_PRIVILEGE_ERRORS],
    ];
    expect(named.size).toBeGreaterThan(0);
    for (const name of named)
      expect(
        lists.filter((list) => list.includes(name)),
        name,
      ).toHaveLength(1);
    // Nenhum nome classificado sem existir nas migrations (lista morta).
    for (const list of lists) for (const name of list) expect(named.has(name), name).toBe(true);
  });
});
