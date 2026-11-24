import type { EntryKind, LotSituation, WalletState } from '../../domain/wallet';

/**
 * Textos da Carteira (W17, spec credits §5.4; pt-BR, único locale). Créditos são unidade operacional interna, não
 * financeira (BR-190, REQ-053): nenhum formato monetário, nenhuma promessa de valor, resgate, venda, cessão ou
 * transferência (REQ-101). Estados do Crédito do REQ-096. O nome do produto na Carteira é "Créditos Luxchange" (`02` §1).
 */
export const CREDIT_MOVEMENTS = [
  'originate',
  'hold',
  'release',
  'consume',
  'expire',
  'reverse',
] as const;
export type CreditMovement = (typeof CREDIT_MOVEMENTS)[number];

export const walletMessages = {
  metadataTitle: 'Carteira',
  title: 'Carteira',
  /** W20: entrada do depósito Luxchange (Créditos originados pela cessão de datas). */
  depositLink: 'Depositar datas no Luxchange',
  lead: 'Seus Créditos Luxchange: quanto pode usar agora, de onde vieram e até quando valem.',
  backToArea: 'Área do Titular',
  nature:
    'Créditos são uma unidade de uso interna da Luxtory. Não são dinheiro nem investimento e não podem ser resgatados, vendidos, cedidos ou transferidos.',
  partiesLabel: 'Pessoa ou empresa da Carteira',
  partyTitle: (documentType: 'cpf' | 'cnpj', masked: string) =>
    `${documentType === 'cpf' ? 'CPF' : 'CNPJ'} ${masked}`,
  noRepresentation: {
    title: 'Nenhuma representação vigente',
    body: 'A Carteira mostra os Créditos das pessoas e empresas que você representa agora.',
  },
  balance: {
    title: 'Saldo',
    labels: {
      available: 'Disponível',
      membership_blocked: 'Indisponível por Membership',
      held: 'Em Garantia',
      consumed: 'Consumido',
      expired: 'Expirado',
    } satisfies Record<WalletState, string>,
    blockedTitle: 'Uso indisponível enquanto o Membership não estiver vigente',
    blockedBody:
      'Os Créditos continuam na Carteira e a validade de cada lote segue correndo. A reativação do Membership antes do vencimento restabelece o saldo ainda válido.',
    heldHint:
      'Créditos em Garantia ficam reservados para uma operação em andamento e não podem ser usados em outra.',
  },
  lots: {
    title: 'Lotes',
    lead: 'Na ordem em que são usados: primeiro o que vence antes; em empate, o originado antes.',
    empty: 'Nenhum lote de Créditos.',
    itemTitle: (code: string) => `Lote ${code}`,
    origin: 'Origem',
    quantity: 'Quantidade originada',
    available: 'Disponível no lote',
    originatedAt: 'Originado em',
    expiresAt: 'Válido até',
    situation: 'Situação',
    origins: {
      deposit_capacity: 'Depósito Luxchange',
      accept_request: 'Cessão em Request aceita',
    } as Readonly<Record<string, string>>,
    situations: {
      usable: 'Disponível',
      membership_blocked: 'Indisponível por Membership',
      held: 'Em Garantia',
      used: 'Sem saldo disponível',
      expired: 'Expirado',
    } satisfies Record<LotSituation, string>,
  },
  statement: {
    title: 'Extrato',
    lead: 'Cada movimento com data, tipo, quantidade, lote e operação de origem, do mais recente ao mais antigo.',
    empty: 'Nenhum movimento.',
    emptyFiltered: 'Nenhum movimento deste tipo.',
    filterLabel: 'Tipo de movimento',
    filterAll: 'Todos',
    filterSubmit: 'Filtrar',
    filters: {
      originate: 'Originação',
      hold: 'Entrada em Garantia',
      release: 'Liberação da Garantia',
      consume: 'Consumo',
      expire: 'Expiração',
      reverse: 'Reversão',
    } satisfies Record<CreditMovement, string>,
    date: 'Data',
    kind: 'Tipo',
    quantity: 'Quantidade',
    lot: 'Lote',
    operation: 'Operação',
    kinds: {
      originated: 'Originação',
      held: 'Entrada em Garantia',
      released: 'Liberação da Garantia',
      released_expired: 'Liberação da Garantia (lote vencido)',
      consumed: 'Consumo',
      expired: 'Expiração',
      reversed: 'Reversão de consumo',
      reversed_expired: 'Reversão de consumo (lote vencido)',
    } satisfies Record<EntryKind, string>,
    commands: {
      deposit_capacity: 'Depósito Luxchange',
      accept_request: 'Aceite de Request',
      send_request: 'Envio de Request',
      withdraw_request: 'Retirada de Request',
      reject_request: 'Recusa de Request',
      create_direct: 'Reserva Direct',
      expire_credit_lots: 'Vencimento do lote',
      reverse_credit: 'Correção pela Luxtory',
    } as Readonly<Record<string, string>>,
    operationValue: (command: string, code: string) => `${command} · ${code}`,
    paginationLabel: 'Páginas do extrato',
    previous: 'Mais recentes',
    next: 'Mais antigos',
    pageOf: (page: number, pages: number) => `Página ${page} de ${pages}`,
  },
  unknown: 'Outro',
  credits: (formatted: string, isOne: boolean) => `${formatted} ${isOne ? 'Crédito' : 'Créditos'}`,
  area: {
    title: 'Créditos Luxchange',
    lead: 'Saldo, lotes e extrato dos Créditos das pessoas e empresas que você representa.',
    available: 'Disponível agora',
    link: 'Abrir a Carteira',
  },
} as const;
