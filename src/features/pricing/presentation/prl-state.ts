/** Estado da publicação de PRL em lote (Server Action + componente de cliente), serializável. */
export type PrlFormKind = 'initial' | 'change';

export interface PrlReviewLine {
  readonly date: string;
  readonly night: string;
  readonly season: string;
  readonly current: string | null;
  readonly proposed: string;
  readonly credits: string | null;
}

/** Revisão calculada no servidor: datas, valores, tipo, vigência, totais e prévia de Créditos. */
export interface PrlReviewView {
  readonly kind: PrlFormKind;
  readonly lines: readonly PrlReviewLine[];
  readonly totalProposed: string;
  readonly totalCurrent: string | null;
  readonly totalCredits: string | null;
  readonly multiplierConfigured: boolean;
  readonly validity: string;
}

export type PrlPublicationField = 'nights' | 'effective_from' | 'basis';

export interface PrlPublicationState {
  readonly key: string;
  readonly stage: 'edit' | 'review';
  readonly review: PrlReviewView | null;
  readonly issues: readonly { readonly issue: string; readonly nights: readonly string[] }[];
  readonly fieldErrors: Readonly<Partial<Record<PrlPublicationField, true>>>;
  readonly values: Readonly<Record<string, string>>;
  readonly rejection: string | null;
}
