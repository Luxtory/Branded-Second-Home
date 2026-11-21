/** Limite de noites por publicação de PRL (TECH-033; spec pricing §5): o mesmo que o command e o banco impõem. */
export const MAX_PRL_NIGHTS = 366;

/**
 * Seleção do lote: cada noite segue o preço comum (`null`) ou tem preço próprio (texto — mesmo vazio, enquanto o Admin
 * digita, para o campo nunca voltar sozinho ao comum). O preço comum nunca sobrescreve um preço próprio.
 */
export type PrlSelection = ReadonlyMap<string, string | null>;

export interface SelectionResult<V> {
  readonly next: ReadonlyMap<string, V>;
  /** Noites novas que entraram (as já selecionadas não contam nem mudam de preço). */
  readonly added: number;
  /** O limite impediu ao menos uma noite pedida de entrar. */
  readonly capped: boolean;
}

/**
 * Acrescenta noites à seleção em ordem, cada nova com o valor dado, até o limite: as já selecionadas mantêm o que
 * tinham, e o que não coube fica de fora — quem chama informa o resultado parcial (nunca uma seleção "completa").
 */
export function addNights<V>(
  selected: ReadonlyMap<string, V>,
  dates: readonly string[],
  value: V,
  max: number = MAX_PRL_NIGHTS,
): SelectionResult<V> {
  const next = new Map(selected);
  let added = 0;
  for (const date of dates) {
    if (next.has(date)) continue;
    if (next.size >= max) return { next, added, capped: true };
    next.set(date, value);
    added += 1;
  }
  return { next, added, capped: false };
}

/** Noites com preço próprio, em ordem de data. */
export function ownPriced(selected: PrlSelection): string[] {
  return [...selected.keys()].filter((date) => selected.get(date) !== null).sort();
}

/** O que vai para a revisão no servidor: por noite, em ordem de data, o preço próprio ou, sem ele, o comum. */
export function selectionPayload(selected: PrlSelection, common: string) {
  return [...selected.keys()]
    .sort()
    .map((date) => ({ stay_date: date, amount: selected.get(date) ?? common }));
}

/**
 * Volta as noites com preço próprio ao preço comum — a única forma de substituir um preço próprio, sempre por ação
 * explícita do Admin (uma noite ou todas), com a contagem do que foi substituído.
 */
export function resetToCommon(
  selected: PrlSelection,
  dates: readonly string[] = [...selected.keys()],
): { readonly next: PrlSelection; readonly replaced: number } {
  const next = new Map(selected);
  let replaced = 0;
  for (const date of dates) {
    if (next.get(date) === undefined || next.get(date) === null) continue;
    next.set(date, null);
    replaced += 1;
  }
  return { next, replaced };
}
