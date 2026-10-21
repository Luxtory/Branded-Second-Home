import { describe, expect, it } from 'vitest';
import { interestPaths, recordId } from '@/features/ownership/presentation/interest-admin-paths';

// Rotas do drill-down (spec ownership §14.10): só ids na URL — nunca localização pretendida ou dado de contato.
const ID = '0F8B8A4E-3C1D-4F6A-9B2E-7D5C4B3A2F10';

describe('rotas do Admin de interesses', () => {
  it('id fora do formato UUID → null; UUID em minúsculas', () => {
    expect(recordId(ID)).toBe(ID.toLowerCase());
    expect(recordId('1')).toBeNull();
    expect(recordId(`${ID}/contato`)).toBeNull();
  });

  it('grupo pelo id da Home Edition; interesse e contato pelo id do interesse', () => {
    expect(interestPaths.homeEdition('h')).toBe('/admin/interesses/home-editions/h');
    expect(interestPaths.interest('i')).toBe('/admin/interesses/i');
    expect(interestPaths.contact('i')).toBe('/admin/interesses/i/contato');
  });
});
