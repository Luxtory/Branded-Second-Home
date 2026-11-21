import { describe, expect, it } from 'vitest';
import { addNights, MAX_PRL_NIGHTS } from '@/features/pricing/presentation/prl-selection';

/** W16 C2 — seleção de noites do PRL até 366 por publicação (TECH-033; spec pricing §5). Valores de teste arbitrários. */
const nights = (count: number, from = Date.UTC(2027, 0, 1)) =>
  Array.from({ length: count }, (_, index) =>
    new Date(from + index * 86_400_000).toISOString().slice(0, 10),
  );

describe('PRL — limite de 366 noites na seleção', () => {
  it('[TECH-033] 365 selecionadas: a 366ª entra; a 367ª fica de fora e o resultado diz que foi parcial', () => {
    const base = addNights(new Map(), nights(365), '100').next;
    expect(base.size).toBe(365);
    const [day366, day367] = nights(2, Date.UTC(2028, 0, 1));
    const with366 = addNights(base, [day366!], '100');
    expect(with366).toMatchObject({ added: 1, capped: false });
    expect(with366.next.size).toBe(MAX_PRL_NIGHTS);
    const with367 = addNights(with366.next, [day367!], '100');
    expect(with367).toMatchObject({ added: 0, capped: true });
    expect(with367.next.has(day367!)).toBe(false);
  });

  it('[TECH-033] mês inteiro no limite: entram só as que cabem, em ordem; as já selecionadas mantêm o preço próprio', () => {
    const base = new Map(addNights(new Map(), nights(360), '100').next).set('2027-01-01', '250,00');
    const month = nights(31, Date.UTC(2028, 0, 1));
    const result = addNights(base, ['2027-01-01', ...month], '120');
    expect(result).toMatchObject({ added: 6, capped: true });
    expect(result.next.size).toBe(366);
    expect([...result.next.keys()].slice(-6)).toEqual(month.slice(0, 6));
    expect(result.next.get('2028-01-06')).toBe('120');
    expect(result.next.has('2028-01-07')).toBe(false);
    expect(result.next.get('2027-01-01')).toBe('250,00');
    // O mapa original não muda (a tela só troca a seleção pelo resultado).
    expect(base.size).toBe(360);
  });

  it('[TECH-033] noites repetidas no pedido não contam nem ocupam lugar', () => {
    const result = addNights(
      new Map([['2027-01-01', '90']]),
      ['2027-01-01', '2027-01-02', '2027-01-02'],
      '100',
    );
    expect(result).toMatchObject({ added: 1, capped: false });
    expect([...result.next]).toEqual([
      ['2027-01-01', '90'],
      ['2027-01-02', '100'],
    ]);
  });
});
