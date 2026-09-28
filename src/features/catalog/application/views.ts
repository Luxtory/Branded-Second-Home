import type {
  BrandPartner,
  Concept,
  ConceptVersion,
  Edition,
  InvestorAuthorization,
  Residence,
} from '../domain/catalog';

/** Visões das telas do Admin (leitura; nenhuma decisão de negócio sai daqui — o command revalida tudo). */
export interface BrandPartnerSummary {
  readonly id: string;
  readonly brandName: string;
  readonly terminatedEffectiveAt: Date | null;
  readonly exposureAuthorizedAt: Date | null;
  readonly conceptCount: number;
}

export interface ConceptSummary {
  readonly id: string;
  readonly title: string;
  /** Número da versão vigente (maior aprovada); `null` = "Não aprovado". */
  readonly currentVersion: number | null;
  readonly versionCount: number;
  readonly editionCount: number;
}

export interface BrandPartnerDetail {
  readonly partner: BrandPartner;
  readonly concepts: readonly ConceptSummary[];
}

export interface EditionSummary {
  readonly edition: Edition;
  readonly residenceCount: number;
}

export interface ConceptDetail {
  readonly concept: Concept;
  readonly partner: BrandPartner;
  readonly versions: readonly ConceptVersion[];
  readonly editions: readonly EditionSummary[];
  readonly investorAuthorizations: readonly InvestorAuthorization[];
}

export interface ResidenceSummary {
  readonly residence: Residence;
  readonly conceptVersion: number;
}

export interface EditionDetail {
  readonly edition: Edition;
  readonly concept: Concept;
  readonly partner: BrandPartner;
  readonly currentVersion: ConceptVersion | null;
  readonly residences: readonly ResidenceSummary[];
  readonly investorAuthorizations: readonly InvestorAuthorization[];
}

export interface ResidenceDetail {
  readonly residence: Residence;
  readonly conceptVersion: ConceptVersion;
  readonly edition: Edition;
  readonly concept: Concept;
  readonly partner: BrandPartner;
  readonly investorAuthorization: InvestorAuthorization | null;
}

/** Leituras do Admin sobre o catálogo, numa transação que também grava o `admin_read` (TECH-092). */
export interface CatalogReader<Db> {
  brandPartners(db: Db): Promise<readonly BrandPartnerSummary[]>;
  brandPartner(db: Db, id: string): Promise<BrandPartnerDetail | null>;
  concept(db: Db, id: string): Promise<ConceptDetail | null>;
  edition(db: Db, id: string): Promise<EditionDetail | null>;
  residence(db: Db, id: string): Promise<ResidenceDetail | null>;
}
