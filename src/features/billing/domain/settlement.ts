/**
 * Categorias de settlement (TECH-083, REQ-094; ADR-0035 §5) e o grupo fixo de cada uma. Grupos organizam a leitura;
 * nenhum relatório soma categorias nem grupos.
 */
export const SETTLEMENT_GROUPS = {
  luxtory_revenue: [
    'membership',
    'administration_fee',
    'design_build',
    'property_services',
    'luxchange_fee',
    'luxplus',
    'rental',
    'structuring_commercialization',
  ],
  second_home_expenses: ['second_home_expenses'],
  third_party_obligations: ['brand_partner_obligation', 'investor_margin', 'titular_net'],
} as const;

export type SettlementGroup = keyof typeof SETTLEMENT_GROUPS;
export type SettlementKind = (typeof SETTLEMENT_GROUPS)[SettlementGroup][number];

export const SETTLEMENT_KINDS: readonly SettlementKind[] = Object.values(SETTLEMENT_GROUPS).flat();

/** Categorias graváveis nesta wave: só o Luxchange Fee (BR-352: as demais não têm valor nem beneficiário definidos). */
export const ENABLED_SETTLEMENT_KINDS: readonly SettlementKind[] = ['luxchange_fee'];

export function settlementGroup(kind: SettlementKind): SettlementGroup {
  const entry = Object.entries(SETTLEMENT_GROUPS).find(([, kinds]) =>
    (kinds as readonly string[]).includes(kind),
  );
  return entry![0] as SettlementGroup;
}

export interface SettlementTotal {
  readonly kind: SettlementKind;
  readonly currency: string;
  readonly entries: number;
  readonly amountMinor: bigint;
}

export interface SettlementReportLine {
  readonly kind: SettlementKind;
  readonly enabled: boolean;
  /** Uma linha por moeda; vazio = sem lançamentos. */
  readonly totals: readonly {
    readonly currency: string;
    readonly entries: number;
    readonly amountMinor: bigint;
  }[];
}

export interface SettlementReportSection {
  readonly group: SettlementGroup;
  readonly lines: readonly SettlementReportLine[];
}

/**
 * Relatório por categoria (REQ-094): toda categoria aparece no seu grupo, com os totais por moeda dela mesma. Não há
 * total por grupo nem total geral — o tipo nem os expõe.
 */
export function settlementReport(totals: readonly SettlementTotal[]): SettlementReportSection[] {
  return (Object.keys(SETTLEMENT_GROUPS) as SettlementGroup[]).map((group) => ({
    group,
    lines: SETTLEMENT_GROUPS[group].map((kind) => ({
      kind,
      enabled: ENABLED_SETTLEMENT_KINDS.includes(kind),
      totals: totals
        .filter((total) => total.kind === kind)
        .sort((a, b) => a.currency.localeCompare(b.currency))
        .map(({ currency, entries, amountMinor }) => ({ currency, entries, amountMinor })),
    })),
  }));
}
