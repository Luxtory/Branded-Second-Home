// Superfície pública do módulo admin (TECH-011) para os outros slices: o shell do Admin e o portão de acesso das
// páginas. O shell (`src/app/`) importa os módulos de `presentation/` diretamente.
export { AdminShell } from './presentation/admin-shell';
export {
  adminGate,
  adminRoleGate,
  type AdminSession,
  type ExercisedAdminSession,
} from './presentation/admin-gate';
