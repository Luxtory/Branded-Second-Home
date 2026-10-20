import type {
  BrandPartner,
  HomeConcept,
  HomeConceptVersion,
  HomeConceptVersionApproval,
  HomeEdition,
  HomeEditionEditorial,
  HomeEditionFinalization,
  HomeEditionMaterial,
  InvestorAuthorization,
  SecondHome,
} from '../domain/catalog';
import type {
  CatalogTerm,
  CatalogTermKind,
  HomeConceptCuration,
  HomeConceptMedia,
  HomeEditionMedia,
  HomeEditionProjectedInvestment,
  MediaApproval,
  MediaRendition,
  MediaWithdrawal,
} from '../domain/collection';

/**
 * Trava de linha do catálogo (ADR-0010 §8): `share` para verificar um uso (vários ao mesmo tempo), `exclusive` para
 * mudar o estado ou serializar versões. Ordem: Brand Partner → autorização de Investor.
 */
export type LockMode = 'share' | 'exclusive';

/** Persistência do catálogo dentro da transação do command (implementação PostgreSQL em `infrastructure/`). */
export interface CatalogStore<Tx> {
  brandPartner(tx: Tx, id: string, lock: LockMode): Promise<BrandPartner | null>;
  homeConcept(tx: Tx, id: string): Promise<HomeConcept | null>;
  homeConceptVersion(tx: Tx, id: string): Promise<HomeConceptVersion | null>;
  latestVersionNumber(tx: Tx, homeConceptId: string): Promise<number | null>;
  currentApprovedVersion(tx: Tx, homeConceptId: string): Promise<HomeConceptVersion | null>;
  /** Home Edition; `exclusive` trava a linha para mudar estado, visibilidade ou textos. */
  homeEdition(tx: Tx, id: string, lock?: LockMode): Promise<HomeEdition | null>;
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
  insertHomeConcept(tx: Tx, homeConcept: HomeConcept): Promise<void>;
  insertHomeConceptVersion(tx: Tx, version: HomeConceptVersion): Promise<void>;
  approveHomeConceptVersion(
    tx: Tx,
    id: string,
    approval: HomeConceptVersionApproval,
  ): Promise<HomeConceptVersion>;
  insertInvestorAuthorization(tx: Tx, authorization: InvestorAuthorization): Promise<void>;
  revokeInvestorAuthorization(
    tx: Tx,
    id: string,
    revocation: { readonly at: Date; readonly basis: string },
  ): Promise<InvestorAuthorization>;
  insertHomeEdition(tx: Tx, homeEdition: HomeEdition): Promise<void>;
  /** Substitui a definição material e os textos de uma Home Edition em preparação. */
  updateHomeEditionDraft(
    tx: Tx,
    id: string,
    content: HomeEditionMaterial & HomeEditionEditorial,
  ): Promise<HomeEdition>;
  finalizeHomeEdition(
    tx: Tx,
    id: string,
    finalization: HomeEditionFinalization,
  ): Promise<HomeEdition>;
  /** Visibilidade pública: `public` (base nula) ou `hidden` com a base da retirada. */
  setHomeEditionVisibility(
    tx: Tx,
    id: string,
    visibility: {
      readonly visibility: HomeEdition['visibility'];
      readonly withdrawalBasis: string | null;
    },
  ): Promise<HomeEdition>;
  correctHomeEditionEditorial(
    tx: Tx,
    id: string,
    editorial: HomeEditionEditorial,
  ): Promise<HomeEdition>;
  insertSecondHome(tx: Tx, secondHome: SecondHome): Promise<void>;

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

  homeConceptMedia(tx: Tx, id: string): Promise<HomeConceptMedia | null>;
  /** Capa aprovada (vigente) do Home Concept, se houver. */
  currentCover(tx: Tx, homeConceptId: string): Promise<HomeConceptMedia | null>;
  insertHomeConceptMedia(
    tx: Tx,
    media: HomeConceptMedia,
    renditions: readonly StoredRendition[],
  ): Promise<void>;
  approveHomeConceptMedia(tx: Tx, id: string, approval: MediaApproval): Promise<HomeConceptMedia>;
  withdrawHomeConceptMedia(
    tx: Tx,
    id: string,
    withdrawal: MediaWithdrawal,
  ): Promise<HomeConceptMedia>;

  homeEditionMedia(tx: Tx, id: string): Promise<HomeEditionMedia | null>;
  insertHomeEditionMedia(
    tx: Tx,
    media: HomeEditionMedia,
    renditions: readonly StoredRendition[],
  ): Promise<void>;
  approveHomeEditionMedia(tx: Tx, id: string, approval: MediaApproval): Promise<HomeEditionMedia>;
  withdrawHomeEditionMedia(
    tx: Tx,
    id: string,
    withdrawal: MediaWithdrawal,
  ): Promise<HomeEditionMedia>;

  homeConceptCuration(tx: Tx, homeConceptId: string): Promise<HomeConceptCuration | null>;
  /** Serializa as trocas de destaque (no máximo um Home Concept em destaque), até o fim da transação. */
  lockFeaturedSlot(tx: Tx): Promise<void>;
  featuredCuration(tx: Tx): Promise<HomeConceptCuration | null>;
  saveHomeConceptCuration(tx: Tx, curation: HomeConceptCuration): Promise<void>;

  homeEditionProjectedInvestment(
    tx: Tx,
    id: string,
  ): Promise<HomeEditionProjectedInvestment | null>;
  /** Médias projetadas de uma Home Edition, por início de vigência (uma vigente por Home Edition). */
  homeEditionProjectedInvestments(
    tx: Tx,
    homeEditionId: string,
  ): Promise<HomeEditionProjectedInvestment[]>;
  insertHomeEditionProjectedInvestment(
    tx: Tx,
    value: HomeEditionProjectedInvestment,
  ): Promise<void>;
  endHomeEditionProjectedInvestment(
    tx: Tx,
    id: string,
    at: Date,
  ): Promise<HomeEditionProjectedInvestment>;
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
