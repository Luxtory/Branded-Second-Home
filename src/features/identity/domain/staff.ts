/** Papéis de staff da Luxtory (TECH-050/051). Sem hierarquia presumida: um não substitui o outro (ADR-0008). */
export const STAFF_ROLES = ['admin', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Papel ativo em `app.staff_role`: o id vira a base registrada do command (`staff_role:<id>`). */
export interface StaffRoleRecord {
  readonly id: string;
  readonly role: StaffRole;
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}
