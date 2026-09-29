import { z } from 'zod';
import type { EditionModality } from '../domain/catalog';

/**
 * Visões do Discovery público (spec catalog §13.2, D-W4-03): só o conteúdo publicável — nenhum dado de aprovação,
 * Residence ou Investor, nenhum número nem preço calculado (ADR-001 do `03`). A visibilidade é decidida pela RLS
 * (`anon`), não aqui.
 */
export interface PublicEdition {
  readonly id: string;
  readonly region: string;
  readonly modality: EditionModality;
  /** Como registradas pela Luxtory (BR-031); o software não calcula valores. */
  readonly commercialConditions: string;
}

export interface PublicConceptCard {
  readonly id: string;
  readonly title: string;
  readonly brandName: string;
  /** Regiões das Editions, sem repetição, na ordem de registro; vazio = Concept sem Edition (REQ-022). */
  readonly regions: readonly string[];
}

export interface PublicConcept {
  readonly id: string;
  readonly title: string;
  readonly brandName: string;
  /** Especificação da versão vigente (maior aprovada), como registrada (BR-013). */
  readonly specification: string;
  readonly editions: readonly PublicEdition[];
}

/** Leitura pública, dentro de uma transação como `anon` (ADR-0012). */
export interface PublicCatalogReader<Db> {
  collection(db: Db): Promise<readonly PublicConceptCard[]>;
  concept(db: Db, id: string): Promise<PublicConcept | null>;
}

const conceptId = z.uuid();

/** Id de Concept vindo da URL; `null` quando não é um uuid (a página responde 404 sem consultar o banco). */
export function publicConceptId(value: string): string | null {
  const parsed = conceptId.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Regiões sem repetição, na ordem em que aparecem. */
export function distinctRegions(editions: readonly { readonly region: string }[]): string[] {
  return [...new Set(editions.map((edition) => edition.region))];
}
