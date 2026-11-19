/** Estado do formulário de publicação de regras de convidados (Server Action + componente de cliente). */
export type GuestRulesField = 'value' | 'effective_from' | 'effective_to' | 'basis';

export interface GuestRulesState {
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Partial<Record<GuestRulesField, true>>>;
  readonly rejection: string | null;
}
