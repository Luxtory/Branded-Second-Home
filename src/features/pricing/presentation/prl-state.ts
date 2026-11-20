/** Estado dos formulários de publicação do PRL (Server Action + componente de cliente). */
export type PrlFormKind = 'initial' | 'change';
export type PrlField = 'first_night' | 'last_night' | 'amount' | 'effective_from' | 'basis';

export interface PrlFormState {
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Partial<Record<PrlField, true>>>;
  readonly rejection: string | null;
}
