import { describe, expect, it } from 'vitest';
import { availableSections } from '@/features/admin/presentation/admin-shell';

describe('seções do Admin (ADR-0008, ADR-0009)', () => {
  it('[TECH-050] o Catálogo só aparece com o papel Admin ativo: Super Admin sozinho não o vê (sem hierarquia)', () => {
    const ids = (roles: Parameters<typeof availableSections>[0]) =>
      availableSections(roles).map((section) => section.id);

    expect(ids(['admin'])).toEqual(['home', 'catalog', 'interests', 'parties']);
    expect(ids(['admin', 'super_admin'])).toEqual(['home', 'catalog', 'interests', 'parties']);
    expect(ids(['super_admin'])).toEqual(['home']);
  });

  it('[TECH-050] Interesses (W5) segue a mesma regra: só com o papel Admin exercido', () => {
    const interests = availableSections(['admin']).find((section) => section.id === 'interests');

    expect(interests).toMatchObject({ href: '/admin/interesses', role: 'admin' });
    expect(availableSections(['super_admin']).some((section) => section.id === 'interests')).toBe(
      false,
    );
  });

  it('[TECH-050] Partes (W7) segue a mesma regra: só com o papel Admin exercido', () => {
    const parties = availableSections(['admin']).find((section) => section.id === 'parties');

    expect(parties).toMatchObject({ href: '/admin/pessoas-e-empresas', role: 'admin' });
    expect(availableSections(['super_admin']).some((section) => section.id === 'parties')).toBe(
      false,
    );
  });
});
