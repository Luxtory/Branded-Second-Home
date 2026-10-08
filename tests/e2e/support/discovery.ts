import { readFileSync } from 'node:fs';

// Catálogo fictício do E2E do Discovery (docs/specs/catalog.md §13): semeado por tests/e2e/catalog.seed.ts pela API do
// Admin, antes dos testes paralelos. Nomes e textos são de teste — nenhum dado real da Luxtory.
export const SEED_FILE = 'reports/e2e-catalog-seed.json';

export interface SeededConcept {
  readonly id: string;
  readonly title: string;
}

export interface CatalogSeed {
  /** Público, com Edition Owner e Co-Owner. */
  readonly withEdition: SeededConcept & {
    readonly brandName: string;
    readonly brandPartnerId: string;
    readonly region: string;
  };
  /** Público, sem Edition (REQ-022). */
  readonly withoutEdition: SeededConcept;
  /** Público, de outra marca, com Edition só Co-Owner. */
  readonly coOwnerOnly: SeededConcept;
  /** Não públicos: marca sem exposição (BR-015), encerramento eficaz (BR-021), sem versão aprovada (REQ-096). */
  readonly hidden: readonly SeededConcept[];
  /** Coleção (spec catalog §13.12): capa aprovada e pendente de Casa Alpendre. */
  readonly collection: {
    readonly approvedCoverId: string;
    readonly pendingCoverId: string;
  };
}

export function readSeed(): CatalogSeed {
  return JSON.parse(readFileSync(SEED_FILE, 'utf8')) as CatalogSeed;
}

export const CONCEPT_CONTENT = {
  essential_elements: ['Pátio central com espelho d’água', 'Fachada em pedra regional'],
  preservation_premises: ['Proporção do pátio preservada', 'Materiais de origem regional'],
} as const;

export const SPECIFICATION = [
  'Uma casa organizada em volta de um pátio central, com espelho d’água e a sombra de árvores nativas. Os ambientes',
  'sociais se abrem para o pátio; os quartos ficam na ala mais reservada, voltados para o nascente.',
  '',
  'Pedra, madeira de reflorestamento e cal, com aberturas amplas que deixam a luz variar ao longo do dia.',
].join('\n');

export const CONDITIONS = [
  'Lançamento com Residences para Owner e para Co-Owner. Cronograma de obra, forma de pagamento e valores são',
  'apresentados pela equipe comercial da Luxtory a cada interessado.',
  '',
  'No Co-Owner, as despesas da casa e a Taxa de Administração seguem os instrumentos da SPE.',
].join('\n');
