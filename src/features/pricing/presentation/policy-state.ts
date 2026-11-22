import type { PolicyConfig, PolicyIssueAt, PolicyMechanism } from '../domain/commercial-policy';

/** Revisão antes de confirmar (W18; padrão da W16 e do legado: consequências explícitas), calculada no servidor. */
export interface PolicyReview {
  readonly config: PolicyConfig;
  /** Vigente agora (rótulo da versão e início) ou `null` = ausente. */
  readonly current: string | null;
  readonly from: string;
  readonly to: string;
  readonly basis: string;
}

/** Estado do formulário de política (Server Action + componente de cliente). */
export interface PolicyFormState {
  readonly key: string;
  readonly mechanism: PolicyMechanism;
  readonly stage?: 'edit' | 'review';
  readonly review?: PolicyReview | null;
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: readonly string[];
  readonly issues: readonly PolicyIssueAt[];
  readonly rejection: string | null;
}
