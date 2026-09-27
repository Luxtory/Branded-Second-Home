import { redirect } from 'next/navigation';
import { FocusedLayout, PageHeader } from '@/design-system/react';
import {
  AuthUnavailable,
  getStaffAccess,
  SignOutButton,
  type StaffRole,
} from '@/features/identity';
import { AdminShell, roleNames } from './admin-shell';
import { messages } from './i18n/pt-br';

/** Início do Admin (`02` §2): resumo da sessão e os módulos disponíveis — nenhum dado presumido (TECH-001). */
function AdminHome({ roles }: { readonly roles: readonly StaffRole[] }) {
  const text = messages.home;
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
          <div className="lx-empty">
            <p className="lx-body">{text.modulesEmpty}</p>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function AdminForbidden() {
  const text = messages.forbidden;
  return (
    <FocusedLayout brand={messages.brand}>
      <p className="lx-label">{text.marker}</p>
      <h1 className="lx-display-s">{text.title}</h1>
      <p className="lx-body">{text.body}</p>
      <SignOutButton />
    </FocusedLayout>
  );
}

/** `/admin`: o acesso é resolvido a cada request, no servidor, pelo módulo identity. */
export async function AdminHomePage() {
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable') return <AuthUnavailable />;
  if (access.kind === 'forbidden') return <AdminForbidden />;
  return <AdminHome roles={access.roles} />;
}
