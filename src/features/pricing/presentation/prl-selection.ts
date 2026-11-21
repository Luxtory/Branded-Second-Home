/** Limite de noites por publicação de PRL (TECH-033; spec pricing §5): o mesmo que o command e o banco impõem. */
export const MAX_PRL_NIGHTS = 366;

export interface SelectionResult {
  readonly next: ReadonlyMap<string, string>;
  /** Noites novas que entraram (as já selecionadas não contam nem mudam de preço). */
  readonly added: number;
  /** O limite impediu ao menos uma noite pedida de entrar. */
  readonly capped: boolean;
}

/**
 * Acrescenta noites à seleção em ordem, cada nova com o preço comum, até o limite: as já selecionadas mantêm o preço
 * próprio, e o que não coube fica de fora — quem chama informa o resultado parcial (nunca uma seleção "completa").
 */
export function addNights(
  selected: ReadonlyMap<string, string>,
  dates: readonly string[],
  common: string,
  max: number = MAX_PRL_NIGHTS,
): SelectionResult {
  const next = new Map(selected);
  let added = 0;
  for (const date of dates) {
    if (next.has(date)) continue;
    if (next.size >= max) return { next, added, capped: true };
    next.set(date, common);
    added += 1;
  }
  return { next, added, capped: false };
}
