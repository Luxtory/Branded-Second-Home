import type {
  BrandPartner,
  Concept,
  ConceptVersion,
  ConceptVersionApproval,
  Edition,
  InvestorAuthorization,
  Residence,
} from '../domain/catalog';
import type {
  CatalogTerm,
  CatalogTermKind,
  ConceptCuration,
  ConceptMedia,
  EditionReferenceValue,
  MediaApproval,
  MediaRendition,
  MediaWithdrawal,
  ReferenceValueSeries,
} from '../domain/collection';

/**
 * Trava de linha do catálogo (ADR-0010 §8): `share` para verificar um uso (vários ao mesmo tempo), `exclusive` para
 * mudar o estado ou serializar versões. Ordem: Brand Partner → autorização de Investor.
 */
export type LockMode = 'share' | 'exclusive';

/** Persistência do catálogo dentro da transação do command (implementação PostgreSQL em `infrastructure/`). */
export interface CatalogStore<Tx> {
  brandPartner(tx: Tx, id: string, lock: LockMode): Promise<BrandPartner | null>;
  concept(tx: Tx, id: string): Promise<Concept | null>;
  conceptVersion(tx: Tx, id: string): Promise<ConceptVersion | null>;
  latestVersionNumber(tx: Tx, conceptId: string): Promise<number | null>;
  currentApprovedVersion(tx: Tx, conceptId: string): Promise<ConceptVersion | null>;
  edition(tx: Tx, id: string): Promise<Edition | null>;
  investorAuthorization(tx: Tx, id: string, lock: LockMode): Promise<InvestorAuthorization | null>;

  insertBrandPartner(tx: Tx, partner: BrandPartner): Promise<void>;
  recordExposure(tx: Tx, id: string, ref: string, at: Date): Promise<BrandPartner>;
  recordTermination(
    tx: Tx,
    id: string,
    termination: {
      readonly effectiveAt: Date;
      readonly basis: string;
      readonly registeredAt: Date;
    },
  ): Promise<BrandPartner>;
  insertConcept(tx: Tx, concept: Concept): Promise<void>;
  insertConceptVersion(tx: Tx, version: ConceptVersion): Promise<void>;
  approveConceptVersion(
    tx: Tx,
    id: string,
    approval: ConceptVersionApproval,
  ): Promise<ConceptVersion>;
  insertInvestorAuthorization(tx: Tx, authorization: InvestorAuthorization): Promise<void>;
  revokeInvestorAuthorization(
    tx: Tx,
    id: string,
    revocation: { readonly at: Date; readonly basis: string },
  ): Promise<InvestorAuthorization>;
  insertEdition(tx: Tx, edition: Edition): Promise<void>;
  insertResidence(tx: Tx, residence: Residence): Promise<void>;

  /** Termos pelos ids (os que existirem), travados — `share` para classificar, `exclusive` para mudar. */
  catalogTerms(tx: Tx, ids: readonly string[], lock: LockMode): Promise<CatalogTerm[]>;
  /**
   * Outro termo do vocabulário com o mesmo rótulo (sem diferenciar maiúsculas) ou, se informado, o mesmo slug.
   */
  conflictingTerm(tx: Tx, candidate: TermCandidate): Promise<CatalogTerm | null>;
  insertCatalogTerm(tx: Tx, term: CatalogTerm): Promise<void>;
  updateCatalogTerm(
    tx: Tx,
    id: string,
    change: { readonly label: string; readonly active: boolean },
  ): Promise<CatalogTerm>;

  conceptMedia(tx: Tx, id: string): Promise<ConceptMedia | null>;
  /** Capa aprovada (vigente) do Concept, se houver. */
  currentCover(tx: Tx, conceptId: string): Promise<ConceptMedia | null>;
  insertConceptMedia(
    tx: Tx,
    media: ConceptMedia,
    renditions: readonly StoredRendition[],
  ): Promise<void>;
  approveConceptMedia(tx: Tx, id: string, approval: MediaApproval): Promise<ConceptMedia>;
  withdrawConceptMedia(tx: Tx, id: string, withdrawal: MediaWithdrawal): Promise<ConceptMedia>;

  conceptCuration(tx: Tx, conceptId: string): Promise<ConceptCuration | null>;
  /** Serializa as trocas de destaque (no máximo um Concept em destaque), até o fim da transação. */
  lockFeaturedSlot(tx: Tx): Promise<void>;
  featuredCuration(tx: Tx): Promise<ConceptCuration | null>;
  saveConceptCuration(tx: Tx, curation: ConceptCuration): Promise<void>;

  editionReferenceValue(tx: Tx, id: string): Promise<EditionReferenceValue | null>;
  /** Valores de uma série (Edition + base + moeda), por início de vigência. */
  editionReferenceValues(tx: Tx, series: ReferenceValueSeries): Promise<EditionReferenceValue[]>;
  insertEditionReferenceValue(tx: Tx, value: EditionReferenceValue): Promise<void>;
  endEditionReferenceValue(tx: Tx, id: string, at: Date): Promise<EditionReferenceValue>;
}

export interface TermCandidate {
  readonly kind: CatalogTermKind;
  readonly label: string;
  /** `null` ao renomear: o slug não muda. */
  readonly slug: string | null;
  /** O próprio termo, ao renomear. */
  readonly exceptId: string | null;
}

/** Uma versão reencodada da capa (WebP, sem metadados), com o SHA-256 dos bytes (chave do objeto no Storage). */
export interface ProcessedRendition extends MediaRendition {
  readonly contentType: 'image/webp';
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface ProcessedImage {
  /** SHA-256 do arquivo recebido (rastreio; o arquivo cru nunca é guardado). */
  readonly sourceSha256: string;
  /** O master sanitizado e as larguras de exibição. */
  readonly renditions: readonly ProcessedRendition[];
}

/** Versão guardada no Storage: o banco fica só com a referência e os metadados (ADR-0015). */
export interface StoredRendition extends MediaRendition {
  readonly contentType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageKey: string;
}

/**
 * Reencoda a capa enviada (ADR-0015): conteúdo real JPEG, PNG ou WebP (decodificado, não pela extensão), até 3 MiB e
 * 40 megapixels, com pelo menos `COVER_MIN_WIDTH` × `COVER_MIN_HEIGHT`. `null` quando o arquivo não é uma imagem aceita —
 * o command recusa com `ERR_VALIDATION`.
 */
export interface CoverImageProcessor {
  process(imageBase64: string): Promise<ProcessedImage | null>;
}

/**
 * Armazenamento de objetos da mídia (Supabase Storage privado; diretório local em teste). Chaves por conteúdo: gravar
 * de novo a mesma chave é inofensivo, e uma transação desfeita deixa no máximo um objeto sem referência.
 */
export interface MediaStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** `null` quando o objeto não existe. */
  get(key: string): Promise<Uint8Array | null>;
}
