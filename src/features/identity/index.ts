// Superfície pública do módulo identity (TECH-011) para os outros slices. O shell (`src/app/`, `src/proxy.ts`) importa
// os módulos de `presentation/` diretamente.
export type { StaffRole } from './domain/staff';
export type { StaffAccess } from './application/staff-access';
export { getStaffAccess, type AdminAccess } from './presentation/staff-access';
export { SignOutButton } from './presentation/sign-out-button';
export { AuthUnavailable } from './presentation/auth-unavailable';
export { exercisedRole } from './application/staff-access';
export { assertTransactionalAdminAuthority } from './infrastructure/transactional-admin-authority';
export { readPartyReference } from './infrastructure/party-reference';
export type { StaffRoleRecord } from './domain/staff';
export {
  createAdminCommandRoute,
  executeAdminCommand,
  type AdminCommand,
  type AdminCommandDependencies,
  type AdminCommandResult,
} from './presentation/admin-command';

// W7 — pessoas e empresas (party) e representações (spec identity §13): validação do CPF/CNPJ e resolução da party pelo HMAC para outros módulos (D-W3-1).
export { partyDocumentInput } from './contracts';
export type { PartyDocument } from './contracts';
export type { PartyDocumentResolver } from './application/party-resolver';
export { partyDocumentResolver } from './presentation/party-resolver';
// W8 Admin selectors only receive authorized masked labels, never a sealed or full document.
export {
  readPartyDirectory,
  readPartySummary,
  type PartySummary,
} from './presentation/party-admin-read';
