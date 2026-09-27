/** Nível de garantia da sessão: `aal2` = segundo fator (TOTP) confirmado (TECH-050). */
export type AssuranceLevel = 'aal1' | 'aal2';

/** Sessão cuja assinatura o servidor verificou; nada vindo do navegador sem essa verificação decide acesso. */
export interface VerifiedSession {
  readonly userId: string;
  readonly assurance: AssuranceLevel;
}

export function isAssuranceLevel(value: unknown): value is AssuranceLevel {
  return value === 'aal1' || value === 'aal2';
}
