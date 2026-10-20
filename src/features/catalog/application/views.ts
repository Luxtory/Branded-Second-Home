import type {
  BrandPartner,
  HomeConcept,
  HomeConceptVersion,
  HomeEdition,
  InvestorAuthorization,
  SecondHome,
} from '../domain/catalog';
import type {
  CatalogTerm,
  HomeConceptCuration,
  HomeConceptMedia,
  HomeEditionMedia,
  HomeEditionProjectedInvestment,
} from '../domain/collection';

/** Visões das telas do Admin (leitura; nenhuma decisão de negócio sai daqui — o command revalida tudo). */
export interface BrandPartnerSummary {
  readonly id: string;
  readonly brandName: string;
  readonly terminatedEffectiveAt: Date | null;
  readonly exposureAuthorizedAt: Date | null;
  readonly homeConceptCount: number;
}

export interface HomeConceptSummary {
  readonly id: string;
  readonly title: string;
  /** Número da versão vigente (maior aprovada); `null` = "Não aprovado". */
  readonly currentVersion: number | null;
  readonly versionCount: number;
  readonly homeEditionCount: number;
}

export interface BrandPartnerDetail {
  readonly partner: BrandPartner;
  readonly homeConcepts: readonly HomeConceptSummary[];
}

export interface HomeEditionSummary {
  readonly homeEdition: HomeEdition;
  readonly secondHomeCount: number;
}

export interface HomeConceptDetail {
  readonly homeConcept: HomeConcept;
  readonly partner: BrandPartner;
  readonly versions: readonly HomeConceptVersion[];
  readonly homeEditions: readonly HomeEditionSummary[];
  readonly investorAuthorizations: readonly InvestorAuthorization[];
  /** Capas do Home Concept, da mais recente para a mais antiga (spec §13.12). */
  readonly media: readonly HomeConceptMedia[];
  readonly curation: HomeConceptCuration | null;
  /** Todos os termos dos vocabulários: rótulos das classificações e opções (ativas) da versão nova. */
  readonly terms: readonly CatalogTerm[];
}

export interface SecondHomeSummary {
  readonly secondHome: SecondHome;
  readonly homeConceptVersion: number;
}

export interface HomeEditionDetail {
  readonly homeEdition: HomeEdition;
  readonly homeConcept: HomeConcept;
  readonly partner: BrandPartner;
  readonly currentVersion: HomeConceptVersion | null;
  readonly secondHomes: readonly SecondHomeSummary[];
  readonly investorAuthorizations: readonly InvestorAuthorization[];
  /** Médias projetadas, da mais recente para a mais antiga (spec §17.4). */
  readonly projectedInvestments: readonly HomeEditionProjectedInvestment[];
  /** Mídia (imagens, renders, plantas), da mais recente para a mais antiga (spec §17.3). */
  readonly media: readonly HomeEditionMedia[];
}

export interface SecondHomeDetail {
  readonly secondHome: SecondHome;
  readonly homeConceptVersion: HomeConceptVersion;
  readonly homeEdition: HomeEdition;
  readonly homeConcept: HomeConcept;
  readonly partner: BrandPartner;
  readonly investorAuthorization: InvestorAuthorization | null;
}

/**
 * Menor largura de exibição de uma mídia — capa do Home Concept ou mídia da Home Edition, em qualquer estado —, para a
 * pré-visualização do Admin; o objeto fica no Storage.
 */
export interface MediaPreview {
  readonly contentType: string;
  readonly storageKey: string;
  readonly width: number;
  readonly height: number;
}

/** Identificação de uma Home Edition para outras telas do Admin (visão de interesses): nome, Home Concept e marca. */
export interface HomeEditionLabel {
  readonly homeEditionName: string;
  readonly homeConceptTitle: string;
  readonly brandName: string;
}

/** Leituras do Admin sobre o catálogo, numa transação que também grava o `admin_read` (TECH-092). */
export interface CatalogReader<Db> {
  brandPartners(db: Db): Promise<readonly BrandPartnerSummary[]>;
  brandPartner(db: Db, id: string): Promise<BrandPartnerDetail | null>;
  homeConcept(db: Db, id: string): Promise<HomeConceptDetail | null>;
  homeEdition(db: Db, id: string): Promise<HomeEditionDetail | null>;
  secondHome(db: Db, id: string): Promise<SecondHomeDetail | null>;
  terms(db: Db): Promise<readonly CatalogTerm[]>;
  mediaPreview(db: Db, mediaId: string): Promise<MediaPreview | null>;
  homeEditionMediaPreview(db: Db, mediaId: string): Promise<MediaPreview | null>;
}
