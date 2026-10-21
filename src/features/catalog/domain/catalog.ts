/**
 * Objetos do catálogo (`03` v3.15 §3.1; `docs/specs/catalog.md` §17): Brand Partner, Home Concept e versões,
 * autorização do Investor, Home Edition e Second Home — distintos e vinculados (REQ-020, BR-001…004). Nenhum dado
 * pessoal.
 */

/** Papel de staff que registrou uma aprovação ou autorização (o guard já conferiu; ADR-0008). */
export type StaffRoleName = 'admin' | 'super_admin';

export const HOME_CONCEPT_VERSION_STATES = ['not_approved', 'approved'] as const;
/** Estados do REQ-096: "Não aprovado" · "Aprovado (versão N)". */
export type HomeConceptVersionState = (typeof HOME_CONCEPT_VERSION_STATES)[number];

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

export interface HomeConcept {
  readonly id: string;
  readonly brandPartnerId: string;
  readonly title: string;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface HomeConceptVersionApproval {
  readonly approvalRefs: readonly string[];
  readonly approvedAt: Date;
  readonly approvedByUserId: string;
  readonly approvedRole: StaffRoleName;
  readonly approvalOperationId: string;
}

/** Atributos editoriais da versão (Coleção, spec §13.12). A versão não tem atributo físico: eles são da Home Edition. */
export interface HomeConceptVersionAttributes {
  readonly summary: string | null;
}

export interface HomeConceptVersion {
  readonly id: string;
  readonly homeConceptId: string;
  readonly version: number;
  readonly essentialElements: readonly string[];
  readonly preservationPremises: readonly string[];
  readonly specification: string;
  /** Opcionais, gravados com a versão e imutáveis como o resto do conteúdo. */
  readonly attributes: HomeConceptVersionAttributes;
  /** Ids dos termos de `lifestyle` (até 3) e `architectural_style` (até 2), em ordem; o primeiro é o principal. */
  readonly lifestyleIds: readonly string[];
  readonly architecturalStyleIds: readonly string[];
  readonly state: HomeConceptVersionState;
  readonly approval: HomeConceptVersionApproval | null;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface InvestorAuthorization {
  readonly id: string;
  readonly homeConceptId: string;
  /** Party do Investor (W7, D-W3-1): sempre uma party existente, resolvida pelo HMAC do CPF/CNPJ. */
  readonly partyId: string;
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

/**
 * Definição material da Home Edition (BR-031, BR-036): editável em preparação, imutável depois da finalização —
 * alteração material posterior é uma nova Home Edition. Sem localização, modalidade, estrutura nem condições.
 */
export interface HomeEditionMaterial {
  readonly typology: string;
  readonly spatialConfiguration: string;
  readonly projectedAreaM2: number;
  readonly suites: number;
  readonly guestsMax: number;
  /** Programa (ambientes), amenidades e características: listas opcionais. */
  readonly rooms: readonly string[] | null;
  readonly amenities: readonly string[] | null;
  readonly characteristics: readonly string[] | null;
}

/** Textos editoriais: em preparação mudam com a definição; depois da finalização, só por correção editorial. */
export interface HomeEditionEditorial {
  readonly name: string;
  readonly description: string;
}

export const HOME_EDITION_MATERIAL_STATES = ['draft', 'finalized'] as const;
/** Preparação (`draft`) → definição material finalizada (`finalized`), uma vez e sem volta. */
export type HomeEditionMaterialState = (typeof HOME_EDITION_MATERIAL_STATES)[number];

export const HOME_EDITION_VISIBILITIES = ['hidden', 'public'] as const;
/** Visibilidade pública, separada do estado material; `public` exige `finalized`. */
export type HomeEditionVisibility = (typeof HOME_EDITION_VISIBILITIES)[number];

export interface HomeEditionFinalization {
  readonly at: Date;
  readonly byUserId: string;
  readonly role: StaffRoleName;
  readonly operationId: string;
}

export interface HomeEdition extends HomeEditionMaterial, HomeEditionEditorial {
  readonly id: string;
  readonly homeConceptId: string;
  readonly materialState: HomeEditionMaterialState;
  readonly finalization: HomeEditionFinalization | null;
  readonly visibility: HomeEditionVisibility;
  /** Base da última retirada do público; nula enquanto pública ou se nunca foi retirada. */
  readonly withdrawalBasis: string | null;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface SecondHome {
  readonly id: string;
  readonly homeEditionId: string;
  readonly homeConceptId: string;
  readonly homeConceptVersionId: string;
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
export function currentVersion<V extends Pick<HomeConceptVersion, 'state' | 'version'>>(
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
  target: Pick<HomeConceptVersion, 'state' | 'version'>,
  current: Pick<HomeConceptVersion, 'version'> | null,
): boolean {
  return target.state === 'not_approved' && (current === null || target.version > current.version);
}

/** REQ-027: autorização do mesmo Home Concept, não revogada e vigente no instante da aprovação comercial. */
export function authorizationCovers(
  authorization: Pick<
    InvestorAuthorization,
    'homeConceptId' | 'validFrom' | 'validUntil' | 'revokedAt'
  >,
  homeConceptId: string,
  at: Date,
): boolean {
  return (
    authorization.homeConceptId === homeConceptId &&
    authorization.revokedAt === null &&
    authorization.validFrom <= at &&
    (authorization.validUntil === null || at < authorization.validUntil)
  );
}

type Lifecycle = Pick<HomeEdition, 'materialState' | 'visibility'>;

/** Em preparação, a definição material e os textos podem ser completados e corrigidos (BR-036). */
export const isInPreparation = (edition: Lifecycle): boolean => edition.materialState === 'draft';

/** A finalização acontece uma vez e não volta. */
export const canFinalize = (edition: Lifecycle): boolean => edition.materialState === 'draft';

/** Só Home Edition finalizada vai a público; publicar o que já é público não tem efeito e é recusado. */
export const canPublish = (edition: Lifecycle): boolean =>
  edition.materialState === 'finalized' && edition.visibility === 'hidden';

/** Retirar do público só o que é público; nunca reabre a definição material. */
export const canWithdraw = (edition: Lifecycle): boolean => edition.visibility === 'public';

/** Correção editorial (nome, descrição) depois da finalização; em preparação, a edição da preparação cobre isso. */
export const canCorrectEditorial = (edition: Lifecycle): boolean =>
  edition.materialState === 'finalized';

/** Second Home só de Home Edition finalizada — definição material estável (BR-025, BR-036); visibilidade não conta. */
export const canOriginateSecondHome = (edition: Lifecycle): boolean =>
  edition.materialState === 'finalized';
