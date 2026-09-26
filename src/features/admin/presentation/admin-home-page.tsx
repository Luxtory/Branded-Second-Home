import { redirect } from 'next/navigation';
import {
  AuthUnavailable,
  getStaffAccess,
  SignOutButton,
  type StaffRole,
} from '@/features/identity';
import { messages } from './i18n/pt-br';

/** Estrutura do Admin (`02` §2): cabeçalho com sessão e conteúdo, só para staff AAL2 com papel ativo (TECH-050). */
function AdminShell({ roles }: { readonly roles: readonly StaffRole[] }) {
  const text = messages.shell;
  return (
    <>
      <a className="lx-skip-link" href="#conteudo">
        {text.skipLink}
      </a>
      <header className="lx-header">
        <div className="lx-header__inner">
          <p className="lx-label">{text.brand}</p>
          <div className="lx-header__actions">
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="conteudo" className="lx-container">
        <h1 className="lx-display-s">{text.title}</h1>
        <p className="lx-lead">{text.lead}</p>
        <dl className="lx-evidence">
          <div className="lx-evidence__item">
            <dt className="lx-evidence__label">{text.rolesLabel}</dt>
            <dd className="lx-evidence__value">
              {roles.map((role) => messages.roles[role]).join(', ')}
            </dd>
          </div>
        </dl>
      </main>
    </>
  );
}

function AdminForbidden() {
  const text = messages.forbidden;
  return (
    <main id="conteudo" className="lx-container">
      <div className="lx-empty">
        <p className="lx-marker">
          <span>{text.marker}</span>
        </p>
        <h1 className="lx-display-s">{text.title}</h1>
        <p className="lx-body">{text.body}</p>
        <SignOutButton />
      </div>
    </main>
  );
}

/** `/admin`: o acesso é resolvido a cada request, no servidor, pelo módulo identity. */
export async function AdminHomePage() {
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable') return <AuthUnavailable />;
  if (access.kind === 'forbidden') return <AdminForbidden />;
  return <AdminShell roles={access.roles} />;
}
