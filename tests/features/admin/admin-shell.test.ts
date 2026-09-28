import { describe, expect, it } from 'vitest';
import { availableSections } from '@/features/admin/presentation/admin-shell';

describe('seções do Admin (ADR-0008, ADR-0009)', () => {
  it('[TECH-050] o Catálogo só aparece com o papel Admin ativo: Super Admin sozinho não o vê (sem hierarquia)', () => {
    const ids = (roles: Parameters<typeof availableSections>[0]) =>
      availableSections(roles).map((section) => section.id);

    expect(ids(['admin'])).toEqual(['home', 'catalog']);
    expect(ids(['admin', 'super_admin'])).toEqual(['home', 'catalog']);
    expect(ids(['super_admin'])).toEqual(['home']);
  });
});
