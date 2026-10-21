import type { AuthorizationGrant } from '../domain/grant';
import type { VerifiedSession } from '../domain/session';
import type { StaffRole, StaffRoleRecord } from '../domain/staff';

/** Papéis de staff ativos de um usuário (`app.staff_role`), lidos a cada decisão: revogar vale na hora. */
export interface StaffDirectory {
  activeRoles(userId: string, at: Date): Promise<readonly StaffRoleRecord[]>;
}

/** Grants vigentes de uma party que listam `command` (`app.authorization_grant`). */
export interface GrantDirectory {
  activeGrants(partyId: string, command: string, at: Date): Promise<readonly AuthorizationGrant[]>;
}

export interface NewAuthorizationGrant extends AuthorizationGrant {
  readonly basis: string;
  readonly grantedByUserId: string;
  readonly grantedRole: StaffRole;
  readonly operationId: string;
  readonly createdAt: Date;
}

/** Grava o grant na transação do command. */
export interface GrantWriter<Tx> {
  /** A party beneficiária existe (D-W2-1 encerrada: erro funcional antes da FK). */
  partyExists(tx: Tx, partyId: string): Promise<boolean>;
  insert(tx: Tx, grant: NewAuthorizationGrant): Promise<void>;
}

/** Cadastro de um fator TOTP ainda não verificado: QR code (data URI) e segredo para digitação manual. */
export interface TotpEnrollment {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
}

/**
 * Supabase Auth (TECH-050) visto pelo resto do código: só login por código, MFA TOTP e sessão verificada (ADR-0008).
 * Adapters: Supabase (`@supabase/ssr`) e o de teste (ADR-0005 §7).
 */
export interface AuthGateway {
  session(): Promise<VerifiedSession | null>;
  /** `sent` também para e-mail sem conta: a resposta não enumera usuários. */
  sendLoginCode(email: string): Promise<'sent' | 'rate_limited'>;
  verifyLoginCode(email: string, code: string): Promise<boolean>;
  /** Código do convite (W7): conta convidada e não confirmada; inválido, expirado ou sem convite → `false`. */
  verifyInviteCode(email: string, code: string): Promise<boolean>;
  /** Id do fator TOTP já verificado, se houver. */
  verifiedTotpFactor(): Promise<string | null>;
  startTotpEnrollment(): Promise<TotpEnrollment>;
  verifyTotp(factorId: string, code: string): Promise<boolean>;
  signOut(): Promise<void>;
}
