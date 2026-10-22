/** Estados dos formulários de login e MFA (compartilhados entre Server Actions e componentes de cliente). */
export type LoginMessage =
  | 'code_sent'
  | 'code_resent'
  | 'invalid_email'
  | 'invalid_code'
  | 'rate_limited'
  | 'resend_rate_limited'
  | 'unavailable';

/** Para onde o login leva (lista fechada, nunca uma URL vinda do navegador): staff → MFA; Área do Titular → representações (W7). */
export type LoginDestination = 'admin' | 'titular';

export interface LoginState {
  readonly step: 'email' | 'code';
  readonly email: string;
  readonly message: LoginMessage | null;
  readonly destination: LoginDestination;
}

export const INITIAL_LOGIN_STATE: LoginState = {
  step: 'email',
  email: '',
  message: null,
  destination: 'admin',
};

export const initialLoginState = (destination: LoginDestination): LoginState => ({
  ...INITIAL_LOGIN_STATE,
  destination,
});

/** Primeiro acesso pelo código do convite (W7, spec identity §13.4). */
export type InviteMessage = 'invalid_email' | 'invalid_code' | 'unavailable';

export interface InviteState {
  readonly email: string;
  readonly message: InviteMessage | null;
}

export const INITIAL_INVITE_STATE: InviteState = { email: '', message: null };

/** Ativação da delegação pendente na Área do Titular. */
export type ActivationMessage = 'state' | 'permission' | 'unavailable' | 'unexpected';

export interface ActivationState {
  readonly key: string;
  readonly message: ActivationMessage | null;
}

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
