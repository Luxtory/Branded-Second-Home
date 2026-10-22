import { randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { AppShell, FocusedLayout, PageHeader, RecordList } from '@/design-system/react';
import { unavailableKeys } from '@/features/platform';
import type { VerifiedSession } from '../domain/session';
import { AuthUnavailable } from './auth-unavailable';
import { titularMessages as text } from './i18n/titular-pt-br';
import { Instant } from './instant';
import { LoginForm } from './login-form';
import { titularPaths } from './party-paths';
import { currentSession } from './server-auth';
import { SignOutButton } from './sign-out-button';
import { ActivateDelegationForm, InviteCodeForm } from './titular-forms';
import { readRepresentation, readTitularOverview, type TitularOverview } from './titular-read';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sessão do request; sem sessão → login do Titular. Sem MFA obrigatório: o TECH-050 o exige só do staff. */
async function requireSession(): Promise<VerifiedSession | 'unavailable'> {
  const session = await currentSession();
  if (session === null) redirect(titularPaths.login);
  return session;
}

/** Leitura sob RLS; configuração ausente (banco, anéis `PII_*`) → "indisponível", nomeando só as chaves no log. */
async function readOrUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

/** `/titular/entrar`: login por código com o texto do Titular; quem já tem sessão vai para a Área. */
export async function TitularLoginPage() {
  const session = await currentSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  if (session !== null) redirect(titularPaths.area);
  return (
    <FocusedLayout brand={text.brand}>
      <h1 className="lx-display-s">{text.login.title}</h1>
      <p className="lx-lead">{text.login.lead}</p>
      <LoginForm destination="titular" />
      <a className="lx-link" href={titularPaths.activate}>
        {text.login.firstAccess}
      </a>
    </FocusedLayout>
  );
}

/** `/titular/ativar`: primeiro acesso de conta convidada, pelo código do convite. */
export async function TitularActivatePage() {
  const session = await currentSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  if (session !== null) redirect(titularPaths.area);
  return (
    <FocusedLayout brand={text.brand}>
      <h1 className="lx-display-s">{text.activate.title}</h1>
      <p className="lx-lead">{text.activate.lead}</p>
      <InviteCodeForm />
      <a className="lx-link" href={titularPaths.login}>
        {text.activate.loginLink}
      </a>
    </FocusedLayout>
  );
}

/** Sem representação vigente nem convite: nenhum dado, só a saída. */
function TitularForbidden() {
  return (
    <FocusedLayout brand={text.brand}>
      <p className="lx-label">{text.forbidden.marker}</p>
      <h1 className="lx-display-s">{text.forbidden.title}</h1>
      <p className="lx-body">{text.forbidden.body}</p>
      <SignOutButton destination="titular" />
    </FocusedLayout>
  );
}

/** Área do Titular no App Shell do DS (ADR-0009): um só destino na W7, sem navegação inferior. */
function TitularShell({ children }: { readonly children: ReactNode }) {
  return (
    <AppShell
      homeHref={titularPaths.area}
      labels={text.shell}
      navItems={[{ href: titularPaths.area, label: text.area.navHome, current: true }]}
      account={<SignOutButton destination="titular" />}
    >
      <div className="lx-container">{children}</div>
    </AppShell>
  );
}

function Representations({ overview }: { readonly overview: TitularOverview }) {
  const area = text.area;
  return (
    <section className="lx-page-section" aria-labelledby="titular-representations">
      <h2 className="lx-display-s" id="titular-representations">
        {area.representationsTitle}
      </h2>
      <RecordList
        label={area.representationsTitle}
        items={overview.representations.map((item) => ({
          id: item.partyId,
          href: titularPaths.representation(item.partyId),
          title: `${text.documentType[item.documentType]} ${item.maskedDocument}`,
          attributes: [
            ...(item.activatedAt === null
              ? []
              : [
                  {
                    label: area.sinceLabel,
                    value: <Instant iso={item.activatedAt.toISOString()} />,
                  },
                ]),
            {
              label: area.untilLabel,
              value:
                item.validUntil === null ? (
                  area.noEnd
                ) : (
                  <Instant iso={item.validUntil.toISOString()} />
                ),
            },
          ],
        }))}
      />
    </section>
  );
}

function PendingInvitations({ overview }: { readonly overview: TitularOverview }) {
  const area = text.area;
  return (
    <section className="lx-page-section" aria-labelledby="titular-pending">
      <h2 className="lx-display-s" id="titular-pending">
        {area.pendingTitle}
      </h2>
      {overview.pending.map((item) => (
        <article key={item.delegationId} aria-label={area.pendingItem}>
          <h3 className="lx-title">{area.pendingItem}</h3>
          <p className="lx-body">
            {area.invitedLabel} <Instant iso={item.invitedAt.toISOString()} />. {area.pendingBody}
          </p>
          <ActivateDelegationForm delegationId={item.delegationId} idempotencyKey={randomUUID()} />
        </article>
      ))}
    </section>
  );
}

/** `/titular`: quem o usuário representa (RLS) e os convites pendentes dele. */
export async function TitularAreaPage({ activated }: { readonly activated: boolean }) {
  const session = await requireSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const overview = await readOrUnavailable(() => readTitularOverview(session));
  if (overview === 'unavailable') return <AuthUnavailable />;
  if (overview.representations.length === 0 && overview.pending.length === 0) {
    return <TitularForbidden />;
  }
  return (
    <TitularShell>
      <PageHeader title={text.area.title} lead={text.area.lead} />
      {activated ? (
        <div className="lx-message lx-message--success" role="status">
          <p className="lx-message__title">{text.area.activated}</p>
        </div>
      ) : null}
      {overview.representations.length === 0 ? null : <Representations overview={overview} />}
      {overview.pending.length === 0 ? null : <PendingInvitations overview={overview} />}
    </TitularShell>
  );
}

/** `/titular/representacoes/[partyId]`: só a party representada; qualquer outra (ou id inválido) → 404, sem oráculo. */
export async function TitularRepresentationPage({ partyId }: { readonly partyId: string }) {
  const session = await requireSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const representation = UUID.test(partyId)
    ? await readOrUnavailable(() => readRepresentation(session, partyId))
    : null;
  if (representation === 'unavailable') return <AuthUnavailable />;
  if (representation === null) notFound();
  const detail = text.detail;
  return (
    <TitularShell>
      <PageHeader
        title={`${text.documentType[representation.documentType]} ${representation.maskedDocument}`}
        lead={detail.lead}
        context={{ href: titularPaths.area, label: detail.contextLink }}
      />
      <section className="lx-page-section" aria-labelledby="titular-representation">
        <h2 className="lx-display-s" id="titular-representation">
          {detail.sectionTitle}
        </h2>
        <dl className="lx-evidence lx-evidence--inline">
          <div className="lx-evidence__item">
            <dt className="lx-evidence__label">{detail.typeLabel}</dt>
            <dd className="lx-evidence__value">{text.documentType[representation.documentType]}</dd>
          </div>
          <div className="lx-evidence__item">
            <dt className="lx-evidence__label">{detail.documentLabel}</dt>
            <dd className="lx-evidence__value">{representation.maskedDocument}</dd>
          </div>
          <div className="lx-evidence__item">
            <dt className="lx-evidence__label">{text.area.untilLabel}</dt>
            <dd className="lx-evidence__value">
              {representation.validUntil === null ? (
                text.area.noEnd
              ) : (
                <Instant iso={representation.validUntil.toISOString()} />
              )}
            </dd>
          </div>
        </dl>
      </section>
    </TitularShell>
  );
}
