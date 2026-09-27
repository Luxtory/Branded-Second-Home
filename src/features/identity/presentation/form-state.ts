/** Estados dos formulários de login e MFA (compartilhados entre Server Actions e componentes de cliente). */
export type LoginMessage =
  | 'code_sent'
  | 'code_resent'
  | 'invalid_email'
  | 'invalid_code'
  | 'rate_limited'
  | 'resend_rate_limited'
  | 'unavailable';

export interface LoginState {
  readonly step: 'email' | 'code';
  readonly email: string;
  readonly message: LoginMessage | null;
}

export const INITIAL_LOGIN_STATE: LoginState = { step: 'email', email: '', message: null };

export type MfaMessage = 'invalid_code' | 'enrollment_failed' | 'unavailable';

export interface MfaState {
  readonly enrollment: {
    readonly factorId: string;
    readonly qrCode: string;
    readonly secret: string;
  } | null;
  readonly message: MfaMessage | null;
}

export const INITIAL_MFA_STATE: MfaState = { enrollment: null, message: null };
