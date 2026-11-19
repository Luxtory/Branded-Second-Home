/** Estado do formulário da seleção Luxtory (compartilhado entre a Server Action e o componente de cliente). */
export type LuxtorySelectionField = 'first' | 'last' | 'purpose' | 'basis' | 'confirm';

/** A chave nasce com a página; recusa gravada troca a chave; recusa sem operação mantém a chave utilizável. */
export interface LuxtorySelectionState {
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Partial<Record<LuxtorySelectionField, true>>>;
  readonly rejection: string | null;
}
