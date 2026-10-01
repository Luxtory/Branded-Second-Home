import { z } from 'zod';
import type { EditionModality } from '../domain/catalog';

/**
 * Visões do Discovery público (spec catalog §13.2): só o conteúdo publicável — nenhum dado de aprovação, Residence ou
 * Investor, nenhum número nem preço calculado (ADR-001 do `03`). A visibilidade é decidida pela RLS (`anon`), não aqui.
 */
export interface PublicEditionSummary {
  readonly id: string;
  readonly region: string;
  readonly modality: EditionModality;
}

export interface PublicEdition extends PublicEditionSummary {
  /** Como registradas pela Luxtory (BR-031); o software não calcula valores. */
  readonly commercialConditions: string;
}

export interface PublicConceptCard {
  readonly id: string;
  readonly title: string;
  readonly brandName: string;
  /** Editions na ordem de registro; vazio = Concept sem Edition, sem oferta (REQ-022). */
  readonly editions: readonly PublicEditionSummary[];
}

export interface PublicConcept {
  readonly id: string;
  readonly title: string;
  readonly brandName: string;
  /** Especificação da versão vigente (maior aprovada), como registrada (BR-013). */
  readonly specification: string;
  readonly editions: readonly PublicEdition[];
}

/** O que existe publicado agora — decide o CTA da Home e do Como funciona (D-B2C-13, D-B2C-16). */
export interface PublicAvailability {
  readonly concepts: boolean;
  readonly editions: boolean;
}

/** Leitura pública, dentro de uma transação como `anon` (ADR-0014). */
export interface PublicCatalogReader<Db> {
  collection(db: Db): Promise<readonly PublicConceptCard[]>;
  concept(db: Db, id: string): Promise<PublicConcept | null>;
  availability(db: Db): Promise<PublicAvailability>;
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

/**
 * Coleção em dois grupos, sem repetir Concept: primeiro os que têm ao menos uma Edition (há oferta), depois os que
 * ainda não têm (REQ-022). A ordem de registro se mantém dentro de cada grupo.
 */
export function groupCollection(cards: readonly PublicConceptCard[]): {
  readonly withEditions: readonly PublicConceptCard[];
  readonly withoutEditions: readonly PublicConceptCard[];
} {
  return {
    withEditions: cards.filter((card) => card.editions.length > 0),
    withoutEditions: cards.filter((card) => card.editions.length === 0),
  };
}

/** CTA de catálogo por disponibilidade (D-B2C-13, D-B2C-16). `unknown` = dados indisponíveis, nunca "inexistente". */
export type CatalogCta = 'editions' | 'concepts' | 'none' | 'unknown';

export function catalogCta(availability: PublicAvailability | null): CatalogCta {
  if (availability === null) return 'unknown';
  if (availability.editions) return 'editions';
  if (availability.concepts) return 'concepts';
  return 'none';
}
