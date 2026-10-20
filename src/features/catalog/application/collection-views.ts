import type { CropStep, ProjectedInvestmentCurrency } from '../domain/collection';

/**
 * Leitura pública da Coleção (spec catalog §13.12 item 7, §17.7): só o publicável, lido como `anon` sob RLS (ADR-0014)
 * — termos ativos, resumo da versão vigente, capa aprovada, curadoria e, por Home Edition pública, a definição, a
 * imagem principal e a média projetada vigente. Nada é calculado aqui.
 */
export interface PublicTerm {
  readonly slug: string;
  readonly label: string;
}

/** Uma mídia aprovada (capa do Home Concept ou imagem da Home Edition): metadados de exibição, nunca o master. */
export interface PublicCover {
  readonly mediaId: string;
  readonly alt: string;
  readonly credit: string | null;
  readonly cropX: CropStep;
  readonly cropY: CropStep;
  /** Larguras de exibição (crescentes) para o `srcset`; o master nunca é público. */
  readonly widths: readonly { readonly width: number; readonly height: number }[];
}

/**
 * Média projetada de investimento vigente (BR-034): ordem de grandeza do investimento total projetado para materializar
 * uma Second Home da Home Edition — nunca preço, proposta, condição ou valor individual; sem modalidade nem Ação.
 */
export interface PublicProjectedInvestment {
  readonly amountMinor: bigint;
  readonly currency: ProjectedInvestmentCurrency;
}

/** Uma Home Edition pública no card do Home Concept (sem localização, modalidade nem condições — BR-031). */
export interface PublicCollectionHomeEdition {
  readonly id: string;
  readonly name: string;
  readonly typology: string;
  readonly guestsMax: number;
  readonly suites: number;
  readonly projectedAreaM2: number;
  readonly projectedInvestment: PublicProjectedInvestment | null;
  /** Imagem principal (a primeira imagem ou render aprovado), se houver. */
  readonly cover: PublicCover | null;
  readonly createdAt: Date;
}

/** Um Home Concept da Coleção — a unidade do card, nunca duplicada por ter várias Home Editions. */
export interface PublicCollectionEntry {
  readonly id: string;
  readonly title: string;
  readonly brandPartnerId: string;
  readonly brandName: string;
  readonly createdAt: Date;
  readonly summary: string | null;
  /** Em ordem; o primeiro é o principal. Termos desativados não aparecem. */
  readonly lifestyles: readonly PublicTerm[];
  readonly styles: readonly PublicTerm[];
  readonly cover: PublicCover | null;
  readonly rank: number | null;
  readonly featured: boolean;
  /** Home Editions públicas, na ordem de registro; vazio = ainda sem Home Edition publicada. */
  readonly homeEditions: readonly PublicCollectionHomeEdition[];
}

/** Uma largura de exibição de mídia pública: o objeto fica no Storage (ADR-0015). */
export interface PublicRendition {
  readonly contentType: string;
  readonly storageKey: string;
}

/** Leituras públicas da Coleção e da mídia, dentro de uma transação como `anon` (ADR-0014, ADR-0015). */
export interface PublicCollectionReader<Db> {
  entries(db: Db): Promise<readonly PublicCollectionEntry[]>;
  coverRendition(db: Db, mediaId: string, width: number): Promise<PublicRendition | null>;
  homeEditionMediaRendition(
    db: Db,
    mediaId: string,
    width: number,
  ): Promise<PublicRendition | null>;
}
