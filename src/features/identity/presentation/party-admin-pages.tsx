import { randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
import { PageHeader, RecordList, type RecordAttribute } from '@/design-system/react';
import { adminRoleGate, AdminShell, type ExercisedAdminSession } from '@/features/admin';
import { systemClock } from '@/features/platform';
import { delegationStatus } from '../domain/party-delegation';
import { partyMessages as text } from './i18n/parties-pt-br';
import { Instant } from './instant';
import {
  readPartyDetail,
  readPartyDirectory,
  readPartyDocument,
  PARTY_LIST_LIMIT,
  type DelegationView,
  type PartyDetail,
} from './party-admin-read';
import {
  InviteRepresentativeForm,
  PartySearchForm,
  RegisterPartyForm,
  RevokeDelegationForm,
} from './party-admin-forms';
import { partyPaths, type PartyStatus } from './party-paths';

/** Autoridade "Admin" (REQ-095): sem hierarquia, Super Admin sozinho não vê as partes (ADR-0008). */
const PARTY_ROLE = 'admin';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function PartyPage({
  session,
  children,
}: {
  readonly session: ExercisedAdminSession;
  readonly children: ReactNode;
}) {
  return (
    <AdminShell roles={session.roles} current="parties">
      <div className="lx-container">{children}</div>
    </AdminShell>
  );
}

function NotFound({ session }: { readonly session: ExercisedAdminSession }) {
  return (
    <PartyPage session={session}>
      <PageHeader
        title={text.rejections.not_found}
        context={{ href: partyPaths.list, label: text.detail.contextLink }}
      />
    </PartyPage>
  );
}

function StatusNotice({ status }: { readonly status: PartyStatus | null }) {
  return status === null ? null : (
    <div className="lx-message lx-message--success" role="status">
      <p className="lx-message__title">{text.status[status]}</p>
    </div>
  );
}

function KeyValues({ items }: { readonly items: readonly RecordAttribute[] }) {
  return (
    <dl className="lx-evidence lx-evidence--inline">
      {items.map((item) => (
        <div className="lx-evidence__item" key={item.label}>
          <dt className="lx-evidence__label">{item.label}</dt>
          <dd className="lx-evidence__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `/admin/partes`: lista mascarada (auditada) e busca por CPF/CNPJ. */
export async function PartiesPage() {
  const gate = await adminRoleGate(PARTY_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const parties = await readPartyDirectory(gate.session);
  return (
    <PartyPage session={gate.session}>
      <PageHeader
        title={text.list.title}
        lead={text.list.lead}
        actions={
          <a className="lx-button lx-button--primary" href={partyPaths.newParty}>
            {text.list.register}
          </a>
        }
      />
      <section className="lx-page-section" aria-labelledby="party-search">
        <h2 className="lx-display-s" id="party-search">
          {text.list.searchTitle}
        </h2>
        <PartySearchForm />
      </section>
      <section className="lx-page-section" aria-labelledby="party-list">
        <h2 className="lx-display-s" id="party-list">
          {text.list.listTitle}
        </h2>
        {parties.length === 0 ? (
          <div className="lx-empty">
            <p className="lx-body">{text.list.empty}</p>
          </div>
        ) : (
          <>
            <p className="lx-body">{text.list.listLimit(PARTY_LIST_LIMIT)}</p>
            <RecordList
              label={text.list.listTitle}
              items={parties.map((party) => ({
                id: party.id,
                href: partyPaths.party(party.id),
                title: party.maskedDocument,
                attributes: [
                  { label: text.list.typeLabel, value: text.documentType[party.documentType] },
                  {
                    label: text.list.createdLabel,
                    value: <Instant iso={party.createdAt.toISOString()} />,
                  },
                ],
              }))}
            />
          </>
        )}
      </section>
    </PartyPage>
  );
}

/** `/admin/partes/nova`. */
export async function NewPartyPage() {
  const gate = await adminRoleGate(PARTY_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  return (
    <PartyPage session={gate.session}>
      <PageHeader
        title={text.newParty.title}
        lead={text.newParty.lead}
        context={{ href: partyPaths.list, label: text.newParty.contextLink }}
      />
      <RegisterPartyForm idempotencyKey={randomUUID()} />
    </PartyPage>
  );
}

function delegationAttributes(delegation: DelegationView, now: Date): RecordAttribute[] {
  const detail = text.detail;
  const account = delegation.account;
  const attributes: RecordAttribute[] = [
    { label: detail.stateLabel, value: detail.states[delegationStatus(delegation, now)] },
    {
      label: detail.accountLabel,
      value: account?.confirmed === true ? detail.accountConfirmed : detail.accountUnconfirmed,
    },
    { label: detail.invitedLabel, value: <Instant iso={delegation.createdAt.toISOString()} /> },
    {
      label: detail.validUntilLabel,
      value:
        delegation.validUntil === null ? (
          detail.noEnd
        ) : (
          <Instant iso={delegation.validUntil.toISOString()} />
        ),
    },
    { label: detail.basisLabel, value: delegation.basis },
  ];
  if (delegation.activatedAt !== null) {
    attributes.splice(3, 0, {
      label: detail.activatedLabel,
      value: <Instant iso={delegation.activatedAt.toISOString()} />,
    });
  }
  return attributes;
}

function Representatives({ party }: { readonly party: PartyDetail }) {
  const now = systemClock.now();
  if (party.delegations.length === 0) {
    return (
      <div className="lx-empty">
        <p className="lx-body">{text.detail.representativesEmpty}</p>
      </div>
    );
  }
  return (
    <RecordList
      label={text.detail.representativesTitle}
      items={party.delegations.map((delegation) => ({
        id: delegation.id,
        ...(delegation.state === 'revoked'
          ? {}
          : { href: partyPaths.revoke(party.id, delegation.id) }),
        title: delegation.account?.maskedEmail ?? text.detail.emailUnavailable,
        attributes: delegationAttributes(delegation, now),
      }))}
    />
  );
}

/** `/admin/partes/[id]`: documento mascarado e representantes (auditado). */
export async function PartyDetailPage({
  id,
  status,
}: {
  readonly id: string;
  readonly status: PartyStatus | null;
}) {
  const gate = await adminRoleGate(PARTY_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const party = UUID.test(id) ? await readPartyDetail(gate.session, id) : null;
  if (party === null) return <NotFound session={gate.session} />;
  const detail = text.detail;
  return (
    <PartyPage session={gate.session}>
      <StatusNotice status={status} />
      <PageHeader
        title={party.maskedDocument}
        lead={detail.lead}
        context={{ href: partyPaths.list, label: detail.contextLink }}
        actions={
          <>
            <a className="lx-button lx-button--primary" href={partyPaths.invite(party.id)}>
              {detail.invite}
            </a>
            <a className="lx-button lx-button--secondary" href={partyPaths.document(party.id)}>
              {detail.reveal}
            </a>
          </>
        }
      />
      <KeyValues
        items={[
          { label: detail.typeLabel, value: text.documentType[party.documentType] },
          { label: detail.documentLabel, value: party.maskedDocument },
          { label: detail.createdLabel, value: <Instant iso={party.createdAt.toISOString()} /> },
        ]}
      />
      <section className="lx-page-section" aria-labelledby="party-representatives">
        <h2 className="lx-display-s" id="party-representatives">
          {detail.representativesTitle}
        </h2>
        <Representatives party={party} />
      </section>
    </PartyPage>
  );
}

/** `/admin/partes/[id]/documento`: documento completo, leitura deliberada e auditada (`party_document`). */
export async function PartyDocumentPage({ id }: { readonly id: string }) {
  const gate = await adminRoleGate(PARTY_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const document = UUID.test(id) ? await readPartyDocument(gate.session, id) : null;
  if (document === null) return <NotFound session={gate.session} />;
  return (
    <PartyPage session={gate.session}>
      <PageHeader
        title={text.document.title}
        lead={text.document.lead}
        context={{ href: partyPaths.party(id), label: text.document.contextLink }}
      />
      <KeyValues
        items={[
          { label: text.detail.typeLabel, value: text.documentType[document.documentType] },
          { label: text.detail.documentLabel, value: document.document },
        ]}
      />
    </PartyPage>
  );
}

/** `/admin/partes/[id]/representantes/novo`: convite em dois passos. */
export async function InviteRepresentativePage({ id }: { readonly id: string }) {
  const gate = await adminRoleGate(PARTY_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const party = UUID.test(id) ? await readPartyDetail(gate.session, id) : null;
  if (party === null) return <NotFound session={gate.session} />;
  return (
    <PartyPage session={gate.session}>
      <PageHeader
        title={text.invite.title}
        lead={text.invite.lead}
        context={{ href: partyPaths.party(id), label: text.invite.contextLink }}
      />
      <InviteRepresentativeForm
        partyId={party.id}
        maskedDocument={party.maskedDocument}
        idempotencyKey={randomUUID()}
      />
    </PartyPage>
  );
}

/** `/admin/partes/[id]/representantes/[delegationId]/revogacao`. */
export async function RevokeDelegationPage({
  id,
  delegationId,
}: {
  readonly id: string;
  readonly delegationId: string;
}) {
  const gate = await adminRoleGate(PARTY_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const party = UUID.test(id) ? await readPartyDetail(gate.session, id) : null;
  const delegation = party?.delegations.find((item) => item.id === delegationId) ?? null;
  if (party === null || delegation === null || delegation.state === 'revoked') {
    return <NotFound session={gate.session} />;
  }
  return (
    <PartyPage session={gate.session}>
      <PageHeader
        title={text.revoke.title}
        lead={text.revoke.lead}
        context={{ href: partyPaths.party(id), label: text.revoke.contextLink }}
      />
      <KeyValues
        items={[
          {
            label: text.detail.emailLabel,
            value: delegation.account?.maskedEmail ?? text.detail.emailUnavailable,
          },
          { label: text.detail.documentLabel, value: party.maskedDocument },
        ]}
      />
      <RevokeDelegationForm
        partyId={party.id}
        delegationId={delegation.id}
        idempotencyKey={randomUUID()}
      />
    </PartyPage>
  );
}
