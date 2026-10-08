/**
 * Objetos do catálogo (`03` §3.1; `docs/specs/catalog.md`): Brand Partner, Residence Concept e versões, autorização do
 * Investor, Residence Edition e Residence — distintos e vinculados (REQ-020, BR-001…004). Nenhum dado pessoal.
 */

/** Papel de staff que registrou uma aprovação ou autorização (o guard já conferiu; ADR-0008). */
export type StaffRoleName = 'admin' | 'super_admin';

export const EDITION_MODALITIES = ['owner', 'co_owner', 'owner_and_co_owner'] as const;
/** Owner, Co-Owner ou as duas alternativas enquanto a estrutura estiver aberta (BR-032). */
export type EditionModality = (typeof EDITION_MODALITIES)[number];

export const CONCEPT_VERSION_STATES = ['not_approved', 'approved'] as const;
/** Estados do REQ-096: "Não aprovado" · "Aprovado (versão N)". */
export type ConceptVersionState = (typeof CONCEPT_VERSION_STATES)[number];

export interface BrandPartner {
  readonly id: string;
  readonly brandName: string;
  readonly exposureAuthorizationRef: string | null;
  readonly exposureAuthorizedAt: Date | null;
  readonly terminatedEffectiveAt: Date | null;
  readonly terminationBasis: string | null;
  readonly terminationRegisteredAt: Date | null;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface Concept {
  readonly id: string;
  readonly brandPartnerId: string;
  readonly title: string;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface ConceptVersionApproval {
  readonly approvalRefs: readonly string[];
  readonly approvedAt: Date;
  readonly approvedByUserId: string;
  readonly approvedRole: StaffRoleName;
  readonly approvalOperationId: string;
}

export interface ConceptVersionAttributes {
  readonly summary: string | null;
  readonly guestsMax: number | null;
  readonly suites: number | null;
  readonly builtAreaM2: number | null;
}

export interface ConceptVersion {
  readonly id: string;
  readonly conceptId: string;
  readonly version: number;
  readonly essentialElements: readonly string[];
  readonly preservationPremises: readonly string[];
  readonly specification: string;
  /** Atributos da Coleção (spec §13.12): opcionais, gravados com a versão e imutáveis como o resto do conteúdo. */
  readonly attributes: ConceptVersionAttributes;
  /** Ids dos termos de `lifestyle` (até 3) e `architectural_style` (até 2), em ordem; o primeiro é o principal. */
  readonly lifestyleIds: readonly string[];
  readonly architecturalStyleIds: readonly string[];
  readonly state: ConceptVersionState;
  readonly approval: ConceptVersionApproval | null;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface InvestorAuthorization {
  readonly id: string;
  readonly conceptId: string;
  readonly instrumentRef: string;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly registeredByUserId: string;
  readonly registeredRole: StaffRoleName;
  readonly operationId: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
  readonly revocationBasis: string | null;
}

export interface Edition {
  readonly id: string;
  readonly conceptId: string;
  readonly region: string;
  readonly modality: EditionModality;
  readonly commercialConditions: string;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface Residence {
  readonly id: string;
  readonly editionId: string;
  readonly conceptId: string;
  readonly conceptVersionId: string;
  readonly commerciallyApprovedAt: Date;
  readonly label: string;
  readonly timezone: string;
  readonly investorAuthorizationId: string | null;
  readonly operationId: string;
}

/**
 * BR-021: depois da eficácia do encerramento, nenhum novo uso da marca. Direitos sobreviventes (BR-022/023) ainda não
 * são modelados — fechado para falhas como limitação temporária, não regra nova (ADR-0010 §4).
 */
export function isBrandInUse(
  partner: Pick<BrandPartner, 'terminatedEffectiveAt'>,
  at: Date,
): boolean {
  return partner.terminatedEffectiveAt === null || at < partner.terminatedEffectiveAt;
}

/** Versão vigente = a aprovada de maior número (ADR-0010 §1). */
export function currentVersion<V extends Pick<ConceptVersion, 'state' | 'version'>>(
  versions: readonly V[],
): V | null {
  return versions
    .filter((version) => version.state === 'approved')
    .reduce<V | null>(
      (best, version) => (best === null || version.version > best.version ? version : best),
      null,
    );
}

/** Só se aprova uma versão ainda não aprovada e maior que a vigente (REQ-096). */
export function canApprove(
  target: Pick<ConceptVersion, 'state' | 'version'>,
  current: Pick<ConceptVersion, 'version'> | null,
): boolean {
  return target.state === 'not_approved' && (current === null || target.version > current.version);
}

/** REQ-027: autorização do mesmo Concept, não revogada e vigente no instante da aprovação comercial. */
export function authorizationCovers(
  authorization: Pick<
    InvestorAuthorization,
    'conceptId' | 'validFrom' | 'validUntil' | 'revokedAt'
  >,
  conceptId: string,
  at: Date,
): boolean {
  return (
    authorization.conceptId === conceptId &&
    authorization.revokedAt === null &&
    authorization.validFrom <= at &&
    (authorization.validUntil === null || at < authorization.validUntil)
  );
}
