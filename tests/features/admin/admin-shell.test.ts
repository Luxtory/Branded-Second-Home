import { describe, expect, it } from 'vitest';
import { availableSections } from '@/features/admin/presentation/admin-shell';

describe('seções do Admin (ADR-0008, ADR-0009)', () => {
  it('[TECH-050] o Catálogo só aparece com o papel Admin ativo: Super Admin sozinho não o vê (sem hierarquia)', () => {
    const ids = (roles: Parameters<typeof availableSections>[0]) =>
      availableSections(roles).map((section) => section.id);

    expect(ids(['admin'])).toEqual([
      'home',
      'catalog',
      'interests',
      'parties',
      'bookings',
      'prl',
      'parameters',
      'policies',
    ]);
    expect(ids(['admin', 'super_admin'])).toEqual([
      'home',
      'catalog',
      'interests',
      'parties',
      'bookings',
      'prl',
      'parameters',
      'policies',
    ]);
    // W16: o PRL aceita Admin ou Super Admin (TECH-051); os parâmetros econômicos, só o Admin.
    expect(ids(['super_admin'])).toEqual(['home', 'prl']);
  });

  it('[TECH-050] Interesses (W5) segue a mesma regra: só com o papel Admin exercido', () => {
    const interests = availableSections(['admin']).find((section) => section.id === 'interests');

    expect(interests).toMatchObject({ href: '/admin/interesses', roles: ['admin'] });
    expect(availableSections(['super_admin']).some((section) => section.id === 'interests')).toBe(
      false,
    );
  });

  it('[TECH-050] Pessoas e empresas (W7) segue a mesma regra: só com o papel Admin exercido', () => {
    const parties = availableSections(['admin']).find((section) => section.id === 'parties');

    expect(parties).toMatchObject({ href: '/admin/pessoas-e-empresas', roles: ['admin'] });
    expect(availableSections(['super_admin']).some((section) => section.id === 'parties')).toBe(
      false,
    );
  });

  it('[REQ-013][TECH-051] PRL (W16): Admin ou Super Admin; parâmetros econômicos: só Admin', () => {
    expect(
      availableSections(['super_admin']).find((section) => section.id === 'prl'),
    ).toMatchObject({ href: '/admin/prl', roles: ['admin', 'super_admin'] });
    expect(availableSections(['super_admin']).some((section) => section.id === 'parameters')).toBe(
      false,
    );
  });

  it('[TECH-051] Políticas comerciais (W18): publish_policy só com o papel Admin exercido', () => {
    expect(availableSections(['admin']).find((section) => section.id === 'policies')).toMatchObject(
      { href: '/admin/politicas', roles: ['admin'] },
    );
    expect(availableSections(['super_admin']).some((section) => section.id === 'policies')).toBe(
      false,
    );
  });

  it('[REQ-094] Financeiro (W19): relatório por categoria só com o papel Admin exercido', () => {
    expect(availableSections(['admin']).find((section) => section.id === 'finance')).toMatchObject({
      href: '/admin/financeiro',
      roles: ['admin'],
    });
    expect(availableSections(['super_admin']).some((section) => section.id === 'finance')).toBe(
      false,
    );
  });
});
