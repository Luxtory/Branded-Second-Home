import type { EditionModality } from '../domain/catalog';
import type { CropStep, ReferenceValueBasis, ReferenceValueCurrency } from '../domain/collection';

/**
 * Leitura pública da Coleção (spec catalog §13.12 item 7): só o publicável, lido como `anon` sob RLS (ADR-0014) —
 * termos ativos, atributos da versão vigente, capa aprovada, curadoria e valores vigentes. Nada é calculado aqui.
 */
export interface PublicTerm {
  readonly slug: string;
  readonly label: string;
}

export interface PublicCover {
  readonly mediaId: string;
  readonly alt: string;
  readonly credit: string | null;
  readonly cropX: CropStep;
  readonly cropY: CropStep;
  /** Larguras de exibição (crescentes) para o `srcset`; o master nunca é público. */
  readonly widths: readonly { readonly width: number; readonly height: number }[];
}

/** Valor de referência vigente, como registrado pela Luxtory (BR-031); `acao` = uma Ação Co-Owner, nunca por dia. */
export interface PublicReferenceValue {
  readonly basis: ReferenceValueBasis;
  readonly amountMinor: bigint;
  readonly currency: ReferenceValueCurrency;
}

export interface PublicCollectionEdition {
  readonly id: string;
  readonly region: string;
  readonly modality: EditionModality;
  /** Só as bases que a modalidade oferece, no máximo um valor por base (vigências não se sobrepõem). */
  readonly values: readonly PublicReferenceValue[];
}

/** Um Home Concept da Coleção — a unidade do card, nunca duplicada por ter várias Editions. */
export interface PublicCollectionEntry {
  readonly id: string;
  readonly title: string;
  readonly brandPartnerId: string;
  readonly brandName: string;
  readonly createdAt: Date;
  readonly summary: string | null;
  readonly guestsMax: number | null;
  readonly suites: number | null;
  readonly builtAreaM2: number | null;
  /** Em ordem; o primeiro é o principal. Termos desativados não aparecem. */
  readonly lifestyles: readonly PublicTerm[];
  readonly styles: readonly PublicTerm[];
  readonly cover: PublicCover | null;
  readonly rank: number | null;
  readonly featured: boolean;
  /** Na ordem de registro; vazio = Concept sem Edition, sem oferta (REQ-020/022). */
  readonly editions: readonly PublicCollectionEdition[];
}

/** Uma largura de exibição da capa aprovada de um Concept público: o objeto fica no Storage (ADR-0015). */
export interface PublicRendition {
  readonly contentType: string;
  readonly storageKey: string;
}

/** Leituras públicas da Coleção, dentro de uma transação como `anon` (ADR-0014, ADR-0015). */
export interface PublicCollectionReader<Db> {
  entries(db: Db): Promise<readonly PublicCollectionEntry[]>;
  coverRendition(db: Db, mediaId: string, width: number): Promise<PublicRendition | null>;
}
