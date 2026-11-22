import { canonicalQuantity, compareQuantities } from '../domain/credit';
import { CREDIT_MOVEMENTS, type CreditMovement } from './i18n/wallet-pt-br';

/** Movimentos por página do extrato (spec credits §5.4). */
export const STATEMENT_PAGE_SIZE = 20;
const SHORT_CODE_LENGTH = 8;
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = /^[1-9][0-9]{0,5}$/;

/**
 * Quantidade exata em número pt-BR (milhar com ponto, decimal com vírgula), sem moeda nem arredondamento (BR-190,
 * TECH-033): o texto do banco é tratado como texto — nunca vira `number`.
 */
export function formatCreditQuantity(value: string): string {
  const canonical = canonicalQuantity(value);
  const negative = canonical.startsWith('-');
  const [integer = '0', fraction] = (negative ? canonical.slice(1) : canonical).split('.');
  const grouped = integer.replace(THOUSANDS, '.');
  return `${negative ? '-' : ''}${grouped}${fraction === undefined ? '' : `,${fraction}`}`;
}

export const isOneCredit = (value: string) => compareQuantities(value, '1') === 0;

/** Referência curta e estável de um id opaco (lote, operação) para a leitura humana; o id inteiro fica no `title`. */
export function shortCode(id: string): string {
  return id.replaceAll('-', '').slice(0, SHORT_CODE_LENGTH).toUpperCase();
}

export interface WalletQuery {
  /** Party pedida pela URL; a leitura só a aceita se for representada agora (RLS). */
  readonly partyId: string | null;
  readonly movement: CreditMovement | null;
  readonly page: number;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;
const single = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/** Parâmetros da URL (`pessoa`, `tipo`, `pagina`); valor inválido é ignorado, nunca erro. */
export function parseWalletQuery(params: SearchParams): WalletQuery {
  const party = single(params['pessoa']);
  const movement = single(params['tipo']);
  const page = single(params['pagina']);
  return {
    partyId: party !== undefined && UUID.test(party) ? party.toLowerCase() : null,
    movement: CREDIT_MOVEMENTS.find((item) => item === movement) ?? null,
    page: page !== undefined && PAGE.test(page) ? Number(page) : 1,
  };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / STATEMENT_PAGE_SIZE));
}

/** URL da Carteira com os parâmetros não padrão (página 1 e "Todos" ficam fora). */
export function walletHref(
  query: { partyId: string | null; movement: CreditMovement | null; page: number },
  base: string,
): string {
  const params = new URLSearchParams();
  if (query.partyId !== null) params.set('pessoa', query.partyId);
  if (query.movement !== null) params.set('tipo', query.movement);
  if (query.page > 1) params.set('pagina', String(query.page));
  const search = params.toString();
  return search === '' ? base : `${base}?${search}`;
}
