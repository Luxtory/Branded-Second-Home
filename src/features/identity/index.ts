// Superfície pública do módulo identity (TECH-011) para os outros slices. O shell (`src/app/`, `src/proxy.ts`) importa
// os módulos de `presentation/` diretamente.
export type { StaffRole } from './domain/staff';
export type { StaffAccess } from './application/staff-access';
export { getStaffAccess, type AdminAccess } from './presentation/staff-access';
export { SignOutButton } from './presentation/sign-out-button';
export { AuthUnavailable } from './presentation/auth-unavailable';
export { exercisedRole } from './application/staff-access';
export type { StaffRoleRecord } from './domain/staff';
export {
  createAdminCommandRoute,
  executeAdminCommand,
  type AdminCommand,
  type AdminCommandDependencies,
  type AdminCommandResult,
} from './presentation/admin-command';
