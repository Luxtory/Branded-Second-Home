import { CommandRejection, type Actor } from '@/features/platform';
import { isBrandInUse, type BrandPartner, type StaffRoleName } from '../domain/catalog';
import type { CatalogStore, LockMode } from './ports';

/** Dependências dos handlers do catálogo: persistência e gerador de ids (injetável nos testes). */
export interface CatalogDependencies<Tx> {
  readonly store: CatalogStore<Tx>;
  readonly newId: () => string;
}

/** Objeto referenciado inexistente → `ERR_NOT_FOUND` (ADR-0010 §10). */
export function found<T>(value: T | null): T {
  if (value === null) throw new CommandRejection('ERR_NOT_FOUND');
  return value;
}

/** Estado que não permite a operação → `ERR_STATE_TRANSITION`. */
export function requireState(allowed: boolean): void {
  if (!allowed) throw new CommandRejection('ERR_STATE_TRANSITION');
}

/** Objeto exigido pelo estado (ex.: a versão vigente do Concept) ausente → `ERR_STATE_TRANSITION`. */
export function presentInState<T>(value: T | null): T {
  if (value === null) throw new CommandRejection('ERR_STATE_TRANSITION');
  return value;
}

/**
 * Trava a Brand Partner e exige que a marca ainda possa ter novos usos (BR-021; fechado para falhas enquanto os
 * direitos sobreviventes não forem modelados, ADR-0010 §4).
 */
export async function lockBrandInUse<Tx>(
  store: CatalogStore<Tx>,
  tx: Tx,
  brandPartnerId: string,
  lock: LockMode,
  at: Date,
): Promise<BrandPartner> {
  const partner = found(await store.brandPartner(tx, brandPartnerId, lock));
  requireState(isBrandInUse(partner, at));
  return partner;
}

/** Staff que exerce o papel (o guard já conferiu papel ativo e AAL2; ADR-0008). */
export function staffActor(actor: Actor, command: string): { userId: string; role: StaffRoleName } {
  if (actor.kind !== 'user' || (actor.role !== 'admin' && actor.role !== 'super_admin')) {
    throw new Error(`${command} reached the handler without a staff actor`);
  }
  return { userId: actor.userId, role: actor.role };
}
