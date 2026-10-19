import { PageHeader, RecordList, type RecordListItem } from '@/design-system/react';
import type { StaffRole } from '@/features/identity';
import { adminGate } from './admin-gate';
import { AdminShell, availableSections, roleNames } from './admin-shell';
import { messages } from './i18n/pt-br';

/** Início do Admin (`02` §2): resumo da sessão e os módulos disponíveis — nenhum dado presumido (TECH-001). */
function AdminHome({ roles }: { readonly roles: readonly StaffRole[] }) {
  const text = messages.home;
  const modules: RecordListItem[] = availableSections(roles).flatMap((section) => {
    if (section.id === 'home') return [];
    const entry = text.modules[section.id];
    return [
      {
        id: section.id,
        href: section.href,
        title: section.label,
        attributes: [{ label: entry.includesLabel, value: entry.includes }],
      },
    ];
  });
  return (
    <AdminShell roles={roles} current="home">
      <div className="lx-container">
        <PageHeader title={text.title} lead={text.lead} />
        <section className="lx-page-section" aria-labelledby="admin-session">
          <h2 className="lx-display-s" id="admin-session">
            {text.sessionTitle}
          </h2>
          <dl className="lx-evidence">
            <div className="lx-evidence__item">
              <dt className="lx-evidence__label">{text.rolesLabel}</dt>
              <dd className="lx-evidence__value">{roleNames(roles)}</dd>
            </div>
            <div className="lx-evidence__item">
              <dt className="lx-evidence__label">{text.mfaLabel}</dt>
              <dd className="lx-evidence__value">{text.mfaValue}</dd>
            </div>
          </dl>
        </section>
        <section className="lx-page-section" aria-labelledby="admin-modules">
          <h2 className="lx-display-s" id="admin-modules">
            {text.modulesTitle}
          </h2>
          {modules.length === 0 ? (
            <div className="lx-empty">
              <p className="lx-body">{text.modulesEmpty}</p>
            </div>
          ) : (
            <RecordList label={text.modulesLabel} items={modules} />
          )}
        </section>
      </div>
    </AdminShell>
  );
}

/** `/admin`: o acesso é resolvido a cada request, no servidor, pelo módulo identity. */
export async function AdminHomePage() {
  const gate = await adminGate();
  if (gate.kind === 'blocked') return gate.page;
  return <AdminHome roles={gate.session.roles} />;
}
