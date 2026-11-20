import type { EconomicParameterKey } from '../domain/parameter';

/** Estado do formulário de um parâmetro econômico (Server Action + componente de cliente). */
export type EconomicParameterField = 'value' | 'effective_from' | 'effective_to' | 'basis';

export interface EconomicParameterState {
  readonly key: string;
  readonly parameter: EconomicParameterKey;
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Partial<Record<EconomicParameterField, true>>>;
  readonly rejection: string | null;
}
