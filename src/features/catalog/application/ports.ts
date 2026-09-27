import type {
  BrandPartner,
  Concept,
  ConceptVersion,
  ConceptVersionApproval,
  Edition,
  InvestorAuthorization,
  Residence,
} from '../domain/catalog';

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
}
