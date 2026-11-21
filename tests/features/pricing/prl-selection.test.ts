import { describe, expect, it } from 'vitest';
import {
  addNights,
  MAX_PRL_NIGHTS,
  ownPriced,
  resetToCommon,
  selectionPayload,
  type PrlSelection,
} from '@/features/pricing/presentation/prl-selection';

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

describe('PRL — preço comum e preço próprio no lote', () => {
  // Três noites novas seguem o comum; uma recebe preço próprio pelo campo da noite.
  const base = (): PrlSelection =>
    new Map(addNights(new Map<string, string | null>(), nights(3), null).next).set(
      '2027-01-02',
      '150,00',
    );

  it('[REQ-052] noites sem preço próprio seguem o preço comum; mudar o comum nunca sobrescreve o preço próprio', () => {
    const selection = base();
    expect(ownPriced(selection)).toEqual(['2027-01-02']);
    expect(selectionPayload(selection, '100,00').map(({ amount }) => amount)).toEqual([
      '100,00',
      '150,00',
      '100,00',
    ]);
    expect(selectionPayload(selection, '120,00').map(({ amount }) => amount)).toEqual([
      '120,00',
      '150,00',
      '120,00',
    ]);
  });

  it('[REQ-052] substituir preço próprio só por ação explícita: uma noite ou todas, com a contagem substituída', () => {
    const one = resetToCommon(base(), ['2027-01-02']);
    expect(one.replaced).toBe(1);
    expect(ownPriced(one.next)).toEqual([]);
    const withTwo = new Map(base()).set('2027-01-03', '90,00');
    const all = resetToCommon(withTwo);
    expect(all.replaced).toBe(2);
    expect(selectionPayload(all.next, '100,00').every(({ amount }) => amount === '100,00')).toBe(
      true,
    );
    // Noite já no comum ou fora da seleção não conta.
    expect(resetToCommon(base(), ['2027-01-01', '2030-01-01']).replaced).toBe(0);
  });

  it('[REQ-052] preço próprio apagado continua próprio (vazio): o campo não volta sozinho ao comum e o servidor recusa o vazio', () => {
    const selection = new Map(base()).set('2027-01-02', '');
    expect(ownPriced(selection)).toEqual(['2027-01-02']);
    expect(selectionPayload(selection, '100,00')[1]).toEqual({
      stay_date: '2027-01-02',
      amount: '',
    });
  });
});
