import type { StaffRoleName } from './catalog';

/**
 * Objetos da Coleção e da Home Edition (spec catalog §13.12, §17): vocabulários controlados, capa do Home Concept,
 * curadoria, mídia da Home Edition e média projetada de investimento. Nenhum dado pessoal; nenhum valor calculado pelo
 * software (BR-031, BR-034, ADR-001 do `03`).
 */

export const CATALOG_TERM_KINDS = ['lifestyle', 'architectural_style'] as const;
export type CatalogTermKind = (typeof CATALOG_TERM_KINDS)[number];

/** Classificações por versão: o primeiro termo é o principal (mostrado no card). */
export const MAX_TERMS_PER_KIND: Readonly<Record<CatalogTermKind, number>> = {
  lifestyle: 3,
  architectural_style: 2,
};

export interface CatalogTerm {
  readonly id: string;
  readonly kind: CatalogTermKind;
  /** Derivado do rótulo no registro e imutável: as URLs da Coleção não quebram quando o rótulo muda. */
  readonly slug: string;
  readonly label: string;
  readonly active: boolean;
  readonly operationId: string;
  readonly createdAt: Date;
}

const COMBINING_MARKS = /\p{M}/gu;
const NON_SLUG_RUNS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/** Slug estável de um rótulo: minúsculas ASCII, sem acento, palavras unidas por hífen ("Bem-estar & Natureza" → "bem-estar-natureza"). */
export function termSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG_RUNS, '-')
    .replace(EDGE_HYPHENS, '');
}

/** Mesmo rótulo para o vocabulário: o banco compara `lower(label)`. */
export function sameLabel(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export const MEDIA_STATES = ['pending', 'approved', 'withdrawn'] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

/** Passos de foco das classes `lx-crop-*` do Core Design System. */
export const CROP_STEPS = [20, 35, 50, 65, 80] as const;
export type CropStep = (typeof CROP_STEPS)[number];

/**
 * Versões guardadas de uma capa (ADR-0015): o `master` sanitizado (orientado, sem metadados, alta resolução, nunca
 * público — permite novos recortes sem novo envio) e as larguras de exibição do `srcset`.
 */
export const RENDITION_ROLES = ['master', 'display'] as const;
export type RenditionRole = (typeof RENDITION_ROLES)[number];

/**
 * Larguras de exibição, tiradas dos quadros reais da Coleção no Core (container de 1440, margens do layout): card 4:5
 * ≈ 416×520 px (3 colunas), 335×419 (2 colunas, md) e 343×257 (4:3, celular); destaque 3:2 ≈ 720×480. Em densidade
 * 2–3× pedem ≈ 670–1440 px: 480 (miniaturas), 800, 1200 e 1600 cobrem todos sem desperdício.
 */
export const DISPLAY_WIDTHS = [480, 800, 1200, 1600] as const;

/**
 * Mínimo aceito: preencher, sem ampliar, o maior quadro da Coleção em 1× — o destaque 3:2 (≈ 720 px de largura) e o
 * card 4:5 (≈ 520 px de altura). Abaixo disso a imagem só apareceria ampliada; a recusa explica o mínimo.
 */
export const COVER_MIN_WIDTH = 720;
export const COVER_MIN_HEIGHT = 520;

/** Lado maior do master guardado: alta resolução para recortes futuros, sem guardar o arquivo cru. */
export const MASTER_MAX_LONG_SIDE = 4096;

export interface MediaRendition {
  readonly role: RenditionRole;
  readonly width: number;
  readonly height: number;
}

/**
 * Elegibilidade por quadro (spec §13.12): toda capa aprovada (≥ 720 × 520) serve ao card. O destaque editorial ocupa
 * ≈ 7/12 do container em 3:2 (≈ 720 × 480 px a 1440) e, em DPR 2, pede ≈ 1440 × 960 px sem ampliar — então só uma capa
 * com uma largura de exibição desse tamanho é promovida a destaque. Derivado das dimensões já guardadas.
 */
export const FEATURED_MIN_WIDTH = 1440;
export const FEATURED_MIN_HEIGHT = 960;

export function supportsFeatured(
  widths: readonly { readonly width: number; readonly height: number }[],
): boolean {
  return widths.some(
    (item) => item.width >= FEATURED_MIN_WIDTH && item.height >= FEATURED_MIN_HEIGHT,
  );
}

/** As larguras de exibição de uma capa (o master nunca é exibido). */
export const displayRenditions = (media: Pick<HomeConceptMedia, 'renditions'>) =>
  media.renditions.filter((rendition) => rendition.role === 'display');

/** Chave do objeto no Storage, decidida pelo conteúdo (SHA-256 dos bytes guardados). */
export const MEDIA_PREFIXES = {
  homeConcept: 'home-concept-media',
  homeEdition: 'home-edition-media',
} as const;
/** De quem é a mídia: a capa do Home Concept ou a mídia da Home Edition (prefixos fixados no banco). */
export type MediaOwner = keyof typeof MEDIA_PREFIXES;

export const mediaObjectKey = (owner: MediaOwner, sha256: string): string =>
  `${MEDIA_PREFIXES[owner]}/${sha256}.webp`;
export const MEDIA_OBJECT_KEY = /^(home-concept-media|home-edition-media)\/[0-9a-f]{64}\.webp$/;

/** Larguras de exibição para uma imagem de `width` px: os passos menores e a própria largura até 1600 — nunca ampliar. */
export function displayWidths(width: number): number[] {
  const largest = DISPLAY_WIDTHS[DISPLAY_WIDTHS.length - 1] ?? width;
  const below = DISPLAY_WIDTHS.filter((step) => step < width);
  return [...new Set([...below, Math.min(width, largest)])];
}

export interface MediaApproval {
  readonly at: Date;
  readonly byUserId: string;
  readonly role: StaffRoleName;
  readonly operationId: string;
}

export interface MediaWithdrawal {
  readonly at: Date;
  readonly basis: string;
  readonly operationId: string;
}

export interface HomeConceptMedia {
  readonly id: string;
  readonly homeConceptId: string;
  readonly state: MediaState;
  readonly alt: string;
  readonly credit: string | null;
  readonly cropX: CropStep;
  readonly cropY: CropStep;
  readonly sourceSha256: string;
  readonly renditions: readonly MediaRendition[];
  readonly approval: MediaApproval | null;
  readonly withdrawal: MediaWithdrawal | null;
  readonly operationId: string;
  readonly createdAt: Date;
}

export const HOME_EDITION_MEDIA_KINDS = ['image', 'render', 'floor_plan'] as const;
/** Imagem, render ou planta da Home Edition (BR-031). */
export type HomeEditionMediaKind = (typeof HOME_EDITION_MEDIA_KINDS)[number];

/** Mídia da Home Edition: mesmo ciclo e armazenamento da capa, várias aprovadas ao mesmo tempo (spec §17.3). */
export interface HomeEditionMedia extends Omit<HomeConceptMedia, 'homeConceptId'> {
  readonly homeEditionId: string;
  readonly kind: HomeEditionMediaKind;
}

/** Base gravada quando a aprovação de uma capa nova retira a anterior. */
export const SUPERSEDED_COVER_BASIS = 'Substituída por nova capa';

export const canApproveMedia = (media: Pick<HomeConceptMedia, 'state'>): boolean =>
  media.state === 'pending';

export const canWithdrawMedia = (media: Pick<HomeConceptMedia, 'state'>): boolean =>
  media.state !== 'withdrawn';

export interface HomeConceptCuration {
  readonly homeConceptId: string;
  /** Ordem "Curadoria Luxtory" (menor primeiro); `null` = depois dos posicionados, na ordem de registro. */
  readonly rank: number | null;
  /** Destaque editorial explícito: no máximo um Home Concept, e só com capa aprovada. */
  readonly featured: boolean;
  readonly operationId: string;
  readonly updatedAt: Date;
}

export const PROJECTED_INVESTMENT_CURRENCIES = ['BRL'] as const;
export type ProjectedInvestmentCurrency = (typeof PROJECTED_INVESTMENT_CURRENCIES)[number];

/**
 * Média projetada de investimento (BR-034): ordem de grandeza do investimento total projetado para materializar uma
 * Second Home da Home Edition. Uma vigente por Home Edition — sem modalidade, base, configuração ou Ação; nunca preço
 * nem condição; nenhum valor individual é derivado dela.
 */
export interface HomeEditionProjectedInvestment {
  readonly id: string;
  readonly homeEditionId: string;
  /** Unidades menores da moeda (TECH-033). */
  readonly amountMinor: bigint;
  readonly currency: ProjectedInvestmentCurrency;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly registeredByUserId: string;
  readonly registeredRole: StaffRoleName;
  readonly operationId: string;
  readonly createdAt: Date;
}

type Period = Pick<HomeEditionProjectedInvestment, 'validFrom' | 'validUntil'>;

/** Vigente = começou e não terminou (`[valid_from, valid_until)`). */
export function isCurrentValue(value: Period, at: Date): boolean {
  return value.validFrom <= at && (value.validUntil === null || at < value.validUntil);
}

/** Vigências semiabertas `[início, fim)` se sobrepõem; fim nulo = em aberto. */
export function periodsOverlap(a: Period, b: Period): boolean {
  const aEndsAfterBStarts = a.validUntil === null || a.validUntil > b.validFrom;
  const bEndsAfterAStarts = b.validUntil === null || b.validUntil > a.validFrom;
  return aEndsAfterBStarts && bEndsAfterAStarts;
}
