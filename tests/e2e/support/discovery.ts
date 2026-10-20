import { readFileSync } from 'node:fs';

// Catálogo fictício do E2E do Discovery (docs/specs/catalog.md §13, §17): semeado por tests/e2e/catalog.seed.ts pela API do
// Admin, antes dos testes paralelos. Nomes e textos são de teste — nenhum dado real da Luxtory.
export const SEED_FILE = 'reports/e2e-catalog-seed.json';

export interface SeededHomeConcept {
  readonly id: string;
  readonly title: string;
}

export interface SeededHomeEdition {
  readonly id: string;
  readonly name: string;
}

export interface CatalogSeed {
  /** Público, com uma Home Edition publicada (com média projetada e imagem) e uma em preparação (não pública). */
  readonly withHomeEdition: SeededHomeConcept & {
    readonly brandName: string;
    readonly brandPartnerId: string;
    readonly homeEdition: SeededHomeEdition;
    readonly draftHomeEdition: SeededHomeEdition;
  };
  /** Público, sem Home Edition publicada (REQ-022): só uma finalizada, ainda fora do site. */
  readonly withoutHomeEdition: SeededHomeConcept & {
    readonly hiddenHomeEdition: SeededHomeEdition;
  };
  /** Público, de outra marca, com Home Edition publicada sem média projetada nem mídia. */
  readonly secondBrand: SeededHomeConcept & { readonly homeEdition: SeededHomeEdition };
  /** Não públicos: marca sem exposição (BR-015), encerramento eficaz (BR-021), sem versão aprovada (REQ-096). */
  readonly hidden: readonly SeededHomeConcept[];
  /** Coleção (spec catalog §13.12): capa aprovada e pendente de Casa Alpendre; mídia aprovada da Home Edition. */
  readonly collection: {
    readonly approvedCoverId: string;
    readonly pendingCoverId: string;
    readonly homeEditionMediaId: string;
  };
}

export function readSeed(): CatalogSeed {
  return JSON.parse(readFileSync(SEED_FILE, 'utf8')) as CatalogSeed;
}

export const HOME_CONCEPT_CONTENT = {
  essential_elements: ['Pátio central com espelho d’água', 'Fachada em pedra regional'],
  preservation_premises: ['Proporção do pátio preservada', 'Materiais de origem regional'],
} as const;

export const SPECIFICATION = [
  'Uma casa organizada em volta de um pátio central, com espelho d’água e a sombra de árvores nativas. Os ambientes',
  'sociais se abrem para o pátio; os quartos ficam na ala mais reservada, voltados para o nascente.',
  '',
  'Pedra, madeira de reflorestamento e cal, com aberturas amplas que deixam a luz variar ao longo do dia.',
].join('\n');

/** Definição material e textos de uma Home Edition de teste (BR-031): sem localização, modalidade nem condições. */
export const HOME_EDITION_CONTENT = {
  description: [
    'Uma configuração térrea em torno do pátio, com varandas largas e a ala das suítes voltada para o nascente.',
    '',
    'Os ambientes sociais se abrem para o jardim; a cozinha conversa com a varanda.',
  ].join('\n'),
  typology: 'Casa térrea com pátio central',
  spatial_configuration:
    'Estar, jantar e cozinha integrados ao pátio; quatro suítes em ala reservada; área de serviço independente.',
  projected_area_m2: 520,
  suites: 5,
  guests_max: 10,
  rooms: ['Estar', 'Jantar', 'Cozinha gourmet', 'Varanda'],
  amenities: ['Piscina', 'Spa'],
  characteristics: ['Pátio com espelho d’água'],
} as const;
