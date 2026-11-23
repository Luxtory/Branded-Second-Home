import type { SettlementGroup, SettlementKind } from '../../domain/settlement';

/** Textos do relatório financeiro do Admin (W19; REQ-094, TECH-083; spec billing §4.4). */
export const financeMessages = {
  metadataTitle: 'Financeiro — Administração Luxtory',
  title: 'Financeiro',
  lead: 'Apuração por categoria e beneficiário e estado da conciliação de pagamentos. Cada categoria é lida separadamente: nenhuma soma entre categorias ou grupos.',
  operationTitle: 'Operação de pagamentos',
  operationAbout:
    'Pagamento nunca reserva capacidade. Um pagamento aprovado sem desfecho é estornado pela conciliação.',
  reference: 'TECH-080 · TECH-101',
  charging: 'Cobrança',
  chargingOff: 'Desativada',
  chargingOffBody:
    'Nenhum PSP contratado neste ambiente: nenhuma cobrança é feita. A ativação depende de contratação e autorização da Luxtory.',
  chargingTest: 'Ambiente de teste',
  chargingTestBody: 'PSP simulado para testes e desenvolvimento. Nenhum dinheiro é movimentado.',
  capability: 'Registro de pagamentos',
  capabilityOn: 'Ativado',
  capabilityOff: 'Fechado',
  counters: {
    pendingPayments: 'Pagamentos aguardando o PSP',
    approvedWithoutOutcome: 'Aprovados sem desfecho',
    pendingRefunds: 'Estornos em andamento',
    failedRefundsWithoutRetry: 'Estornos falhos sem nova tentativa',
  },
  settlementTitle: 'Apuração por categoria',
  noTotal:
    'Valores de categorias diferentes não se somam. Brand Partner e margem do Investor nunca são receita Luxtory.',
  groups: {
    luxtory_revenue: 'Receitas da Luxtory',
    second_home_expenses: 'Despesas',
    third_party_obligations: 'Obrigações com terceiros',
  } satisfies Record<SettlementGroup, string>,
  kinds: {
    membership: 'Membership',
    administration_fee: 'Taxa de Administração',
    design_build: 'Design & Build',
    property_services: 'Property Services',
    luxchange_fee: 'Luxchange Fee',
    luxplus: 'Luxplus',
    rental: 'Taxas e comissões de locação',
    structuring_commercialization: 'Estruturação e comercialização',
    second_home_expenses: 'Despesas da Second Home',
    brand_partner_obligation: 'Obrigação com a Brand Partner',
    investor_margin: 'Margem do Investor',
    titular_net: 'Valor líquido devido ao Titular',
  } satisfies Record<SettlementKind, string>,
  empty: 'Sem lançamentos',
  entries: (count: number) => (count === 1 ? '1 lançamento' : `${count} lançamentos`),
  closed: 'Sem lançamento possível até a Luxtory definir valores e beneficiários.',
  open: 'Apurado quando a Request é aceita ou o Direct é confirmado.',
} as const;
