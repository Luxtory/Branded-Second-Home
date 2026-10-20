import { z } from 'zod';
import type { HomeEditionMediaKind } from '../domain/collection';
import type {
  PublicCollectionHomeEdition,
  PublicCover,
  PublicProjectedInvestment,
} from './collection-views';

/**
 * Visões do Discovery público (spec catalog §13.2, §17.7): só o conteúdo publicável — nenhum dado de aprovação,
 * finalização, Second Home ou Investor, nenhum número nem preço calculado (ADR-001 do `03`). A visibilidade é decidida
 * pela RLS (`anon`), não aqui.
 */
export interface PublicHomeConcept {
  readonly id: string;
  readonly title: string;
  readonly brandName: string;
  /** Lifestyle principal da versão vigente (termo ativo); `null` sem classificação. */
  readonly lifestyle: string | null;
  /** Capa aprovada; `null` = abertura tipográfica. */
  readonly cover: PublicCover | null;
  /** Especificação da versão vigente (maior aprovada), como registrada (BR-013). */
  readonly specification: string;
  /** Home Editions públicas, na ordem de registro; vazio = ainda sem Home Edition publicada. */
  readonly homeEditions: readonly PublicCollectionHomeEdition[];
}

/** Uma mídia aprovada da Home Edition: imagem, render ou planta (BR-031). */
export interface PublicHomeEditionMedia extends PublicCover {
  readonly kind: HomeEditionMediaKind;
}

/**
 * A Home Edition pública (página `/colecao/[homeConceptId]/home-editions/[homeEditionId]`, spec §17.8): definição e
 * textos como registrados, mídia aprovada e a média projetada vigente — sem localização, modalidade nem condições.
 */
export interface PublicHomeEdition {
  readonly id: string;
  readonly homeConceptId: string;
  readonly homeConceptTitle: string;
  readonly brandName: string;
  readonly name: string;
  readonly description: string;
  readonly typology: string;
  readonly spatialConfiguration: string;
  readonly projectedAreaM2: number;
  readonly suites: number;
  readonly guestsMax: number;
  readonly rooms: readonly string[];
  readonly amenities: readonly string[];
  readonly characteristics: readonly string[];
  /** Imagens e renders, depois as plantas; na ordem de aprovação. */
  readonly media: readonly PublicHomeEditionMedia[];
  readonly projectedInvestment: PublicProjectedInvestment | null;
}

/** O que existe publicado agora — decide o CTA da Home e do Como funciona (D-B2C-13, D-B2C-16). */
export interface PublicAvailability {
  readonly homeConcepts: boolean;
  readonly homeEditions: boolean;
}

/**
 * Alvo público de uma manifestação de interesse (spec ownership §5, §13): a Home Edition visível no Discovery e o seu
 * Home Concept — a visibilidade é a da RLS (`anon`), como no Discovery.
 */
export interface PublicHomeEditionTarget {
  readonly homeEditionId: string;
  readonly homeConceptId: string;
}

/** Leitura pública, dentro de uma transação como `anon` (ADR-0014). */
export interface PublicCatalogReader<Db> {
  homeConcept(db: Db, id: string): Promise<PublicHomeConcept | null>;
  homeEdition(
    db: Db,
    homeConceptId: string,
    homeEditionId: string,
  ): Promise<PublicHomeEdition | null>;
  availability(db: Db): Promise<PublicAvailability>;
}

const publicIdSchema = z.uuid();

/** Id vindo da URL; `null` quando não é um uuid (a página responde 404 sem consultar o banco). */
export function publicId(value: string): string | null {
  const parsed = publicIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** CTA de catálogo por disponibilidade (D-B2C-13, D-B2C-16). `unknown` = dados indisponíveis, nunca "inexistente". */
export type CatalogCta = 'homeEditions' | 'homeConcepts' | 'none' | 'unknown';

export function catalogCta(availability: PublicAvailability | null): CatalogCta {
  if (availability === null) return 'unknown';
  if (availability.homeEditions) return 'homeEditions';
  if (availability.homeConcepts) return 'homeConcepts';
  return 'none';
}
