import type { EconomicParameterKey } from '../domain/parameter';

/** Estado do formulário de um parâmetro econômico (Server Action + componente de cliente). */
export type EconomicParameterField = 'value' | 'effective_from' | 'effective_to' | 'basis';

/** Revisão antes de confirmar (padrão "anterior → novo" com motivo do legado), calculada no servidor. */
export interface EconomicParameterReview {
  /** Vigente no instante atual; `null` = ausente. */
  readonly current: string | null;
  readonly scheduled: readonly string[];
  /** Situação imediatamente anterior à nova vigência; `null` = ausente (nenhuma versão ou lacuna após término). */
  readonly previous: string | null;
  readonly proposed: string;
  readonly from: string;
  readonly to: string;
  readonly basis: string;
}

export interface EconomicParameterState {
  readonly key: string;
  readonly parameter: EconomicParameterKey;
  readonly stage?: 'edit' | 'review';
  readonly review?: EconomicParameterReview | null;
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Partial<Record<EconomicParameterField, true>>>;
  readonly rejection: string | null;
}
