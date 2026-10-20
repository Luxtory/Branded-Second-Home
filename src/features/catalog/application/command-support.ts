import { CommandRejection, type Actor } from '@/features/platform';
import { isBrandInUse, type BrandPartner, type StaffRoleName } from '../domain/catalog';
import type { CatalogStore, CoverImageProcessor, LockMode, MediaStorage } from './ports';

/**
 * Dependências dos handlers do catálogo: persistência, reencode da capa, armazenamento dos binários e gerador de ids
 * (injetáveis nos testes).
 */
export interface CatalogDependencies<Tx> {
  readonly store: CatalogStore<Tx>;
  readonly images: CoverImageProcessor;
  readonly media: MediaStorage;
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

/** Conteúdo que só o command consegue validar (ex.: o arquivo da imagem) → `ERR_VALIDATION`. */
export function requireValid(valid: boolean): void {
  if (!valid) throw new CommandRejection('ERR_VALIDATION');
}

/** Resultado de uma validação feita no command; `null` → `ERR_VALIDATION`. */
export function validated<T>(value: T | null): T {
  if (value === null) throw new CommandRejection('ERR_VALIDATION');
  return value;
}

/** Objeto exigido pelo estado (ex.: a versão vigente do Home Concept) ausente → `ERR_STATE_TRANSITION`. */
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

/**
 * Trava exclusiva da Brand Partner sem exigir marca em uso: retirar uma capa ou encerrar um valor reduz a exposição e
 * vale mesmo depois do encerramento (BR-021).
 */
export async function lockBrand<Tx>(
  store: CatalogStore<Tx>,
  tx: Tx,
  brandPartnerId: string,
): Promise<BrandPartner> {
  return found(await store.brandPartner(tx, brandPartnerId, 'exclusive'));
}

/** Staff que exerce o papel (o guard já conferiu papel ativo e AAL2; ADR-0008). */
export function staffActor(actor: Actor, command: string): { userId: string; role: StaffRoleName } {
  if (actor.kind !== 'user' || (actor.role !== 'admin' && actor.role !== 'super_admin')) {
    throw new Error(`${command} reached the handler without a staff actor`);
  }
  return { userId: actor.userId, role: actor.role };
}
