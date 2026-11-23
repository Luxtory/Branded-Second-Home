import { sql } from 'kysely';
import { PageHeader } from '@/design-system/react';
import { adminRoleGate, AdminShell } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, unavailableKeys, type Database } from '@/features/platform';
import { minorToDecimal, type Currency } from '@/features/pricing';
import type { ReconciliationSummary } from '../application/ports';
import {
  settlementReport,
  type SettlementReportLine,
  type SettlementReportSection,
} from '../domain/settlement';
import { configuredPaymentGateway } from '../infrastructure/payment-gateway';
import { createPostgresBillingStore } from '../infrastructure/postgres-billing-store';
import { financeMessages as text } from './i18n/finance-pt-br';

const money = (amountMinor: bigint, currency: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(
    minorToDecimal(amountMinor, currency as Currency) as `${number}`,
  );

async function paymentsActivated(db: Database): Promise<boolean> {
  const { rows } = await sql<{ active: boolean }>`SELECT EXISTS (
    SELECT 1 FROM app.capability_activation WHERE capability = 'payments') AS active`.execute(db);
  return rows[0]?.active === true;
}

function CategoryCard({ line }: { readonly line: SettlementReportLine }) {
  return (
    <section className="lx-parameter" aria-labelledby={`${line.kind}-titulo`} id={line.kind}>
      <div className="lx-parameter__head">
        <h3 className="lx-pricing__title" id={`${line.kind}-titulo`}>
          {text.kinds[line.kind]}
        </h3>
        <p className="lx-pricing__text">{line.enabled ? text.open : text.closed}</p>
      </div>
      <div className="lx-parameter__status" data-ground="wash">
        {line.totals.length === 0 ? (
          <p className="lx-pricing__eyebrow">{text.empty}</p>
        ) : (
          line.totals.map((total) => (
            <div key={total.currency}>
              <p className="lx-parameter__value">{money(total.amountMinor, total.currency)}</p>
              <p className="lx-pricing__text">{text.entries(total.entries)}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function GroupSection({ section }: { readonly section: SettlementReportSection }) {
  return (
    <section className="lx-page-section lx-parameters" aria-labelledby={`grupo-${section.group}`}>
      <h2 className="lx-display-s" id={`grupo-${section.group}`}>
        {text.groups[section.group]}
      </h2>
      <div className="lx-parameters__grid">
        {section.lines.map((line) => (
          <CategoryCard key={line.kind} line={line} />
        ))}
      </div>
    </section>
  );
}

function OperationSection(props: {
  readonly summary: ReconciliationSummary;
  readonly gateway: boolean;
  readonly activated: boolean;
}) {
  const counters = Object.entries(text.counters) as [keyof ReconciliationSummary, string][];
  return (
    <section className="lx-page-section lx-parameters" aria-labelledby="operacao-pagamentos">
      <div className="lx-parameters__grid">
        <section className="lx-parameter">
          <div className="lx-parameter__head">
            <h2 className="lx-pricing__title" id="operacao-pagamentos">
              {text.operationTitle}
            </h2>
            <p className="lx-pricing__text">{text.operationAbout}</p>
            <p className="lx-parameter__ref">{text.reference}</p>
          </div>
          <div className="lx-parameter__status" data-ground="wash">
            <p className="lx-pricing__eyebrow">
              {`${text.charging}: ${props.gateway ? text.chargingTest : text.chargingOff}`}
            </p>
            <p className="lx-pricing__text">
              {props.gateway ? text.chargingTestBody : text.chargingOffBody}
            </p>
          </div>
          <dl className="lx-pricing__facts">
            <div className="lx-pricing__fact">
              <dt>{text.capability}</dt>
              <dd>{props.activated ? text.capabilityOn : text.capabilityOff}</dd>
            </div>
            {counters.map(([key, label]) => (
              <div className="lx-pricing__fact" key={key}>
                <dt>{label}</dt>
                <dd>{props.summary[key]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}

/**
 * `/admin/financeiro` (W19; REQ-094, TECH-083, TECH-101; spec billing §4.4): só leitura. Settlement por categoria e
 * moeda dentro do grupo fixo, sem total consolidado; estado da conciliação. Nenhuma ação financeira nesta tela.
 */
export async function AdminFinancePage() {
  const gate = await adminRoleGate('admin');
  if (gate.kind === 'blocked') return gate.page;
  let data: {
    readonly sections: SettlementReportSection[];
    readonly summary: ReconciliationSummary;
    readonly activated: boolean;
    readonly gateway: boolean;
  };
  try {
    const db = getDatabase();
    const store = createPostgresBillingStore(db);
    const [totals, summary, activated] = await Promise.all([
      store.settlementTotals(),
      store.reconciliationSummary(null),
      paymentsActivated(db),
    ]);
    data = {
      sections: settlementReport(totals),
      summary,
      activated,
      gateway: configuredPaymentGateway() !== null,
    };
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return <AuthUnavailable />;
  }
  return (
    <AdminShell roles={gate.session.roles} current="finance">
      <div className="lx-container">
        <PageHeader title={text.title} lead={text.lead} />
        <OperationSection
          summary={data.summary}
          gateway={data.gateway}
          activated={data.activated}
        />
        <div className="lx-page-section">
          <h2 className="lx-display-s">{text.settlementTitle}</h2>
          <p className="lx-pricing__text">{text.noTotal}</p>
        </div>
        {data.sections.map((section) => (
          <GroupSection key={section.group} section={section} />
        ))}
      </div>
    </AdminShell>
  );
}
