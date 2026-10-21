import type { ReactNode } from 'react';
import { Evidence, PageHeader, RecordList } from '@/design-system/react';
import { AdminShell, adminRoleGate, type ExercisedAdminSession } from '@/features/admin';
import { formatMoney, type HomeEditionLabel } from '@/features/catalog';
import type { LocationInterests } from '../application/interest-group';
import type { InterestRecord } from '../application/ports';
import { daysValue, instantLabel, messages } from './i18n/pt-br';
import { interestRequestMessages } from './i18n/interest-request-pt-br';
import {
  readHomeEditionInterests,
  readInterestContact,
  readInterestRecord,
  type ContactView,
} from './interest-admin-read';
import { interestPaths as paths, recordId } from './interest-admin-paths';

/** Papel exercido que o drill-down exige, como a visão agregada (sem hierarquia, ADR-0008). */
const INTEREST_ROLE = 'admin';

const modalities = messages.overview.modalities;
const request = interestRequestMessages;

function InterestShell({
  session,
  children,
}: {
  readonly session: ExercisedAdminSession;
  readonly children: ReactNode;
}) {
  return (
    <AdminShell roles={session.roles} current="interests">
      <div className="lx-container">{children}</div>
    </AdminShell>
  );
}

function NotFound({ session }: { readonly session: ExercisedAdminSession }) {
  return (
    <InterestShell session={session}>
      <PageHeader
        title={messages.notFound.title}
        lead={messages.notFound.body}
        context={{ href: paths.overview, label: messages.group.context }}
      />
    </InterestShell>
  );
}

const homeEditionTitle = (label: HomeEditionLabel | null) =>
  label?.homeEditionName ?? messages.overview.homeEditionUnavailable;

function interestItem(interest: InterestRecord) {
  return {
    id: interest.id,
    href: paths.interest(interest.id),
    title: instantLabel(interest.createdAt),
    attributes:
      interest.approxDays === null
        ? []
        : [{ label: messages.group.days, value: daysValue(interest.approxDays) }],
  };
}

function LocationSection({
  location,
  index,
}: {
  readonly location: LocationInterests;
  readonly index: number;
}) {
  // A localização pretendida é texto livre: o id do título usa a posição (espaços quebrariam o `aria-labelledby`).
  const headingId = `interest-location-${index}`;
  return (
    <section className="lx-page-section" aria-labelledby={headingId}>
      <h2 className="lx-display-s" id={headingId}>
        {location.desiredLocation}
      </h2>
      {location.modalities.map((group) => (
        <RecordList
          key={group.modality}
          label={`${messages.group.listLabel} ${location.desiredLocation} · ${modalities[group.modality]}`}
          items={group.interests.map(interestItem)}
        />
      ))}
    </section>
  );
}

/** `/admin/interesses/home-editions/[homeEditionId]`: grupo da Home Edition, sem PII (spec ownership §14.10). */
export async function HomeEditionInterestsPage({
  homeEditionId,
}: {
  readonly homeEditionId: string;
}) {
  const gate = await adminRoleGate(INTEREST_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const id = recordId(homeEditionId);
  if (id === null) return <NotFound session={gate.session} />;
  const group = await readHomeEditionInterests(gate.session, id);
  return (
    <InterestShell session={gate.session}>
      <PageHeader
        title={homeEditionTitle(group.label)}
        lead={messages.group.lead}
        context={{ href: paths.overview, label: messages.group.context }}
      />
      {group.locations.length === 0 ? (
        <section className="lx-page-section">
          <div className="lx-empty">
            <p className="lx-body">{messages.group.empty}</p>
          </div>
        </section>
      ) : (
        group.locations.map((location, index) => (
          <LocationSection key={location.desiredLocation} location={location} index={index} />
        ))
      )}
    </InterestShell>
  );
}

function InterestEvidence({
  interest,
  label,
}: {
  readonly interest: InterestRecord;
  readonly label: HomeEditionLabel | null;
}) {
  const text = messages.interest;
  return (
    <Evidence
      items={[
        { label: text.homeEdition, value: homeEditionTitle(label) },
        { label: text.homeConcept, value: label?.homeConceptTitle },
        { label: text.desiredLocation, value: interest.desiredLocation },
        { label: text.modality, value: modalities[interest.modality] },
        {
          label: text.days,
          value: interest.approxDays === null ? undefined : daysValue(interest.approxDays),
        },
        { label: text.registeredAt, value: instantLabel(interest.createdAt) },
      ]}
    />
  );
}

/** `/admin/interesses/[interestId]`: a manifestação, sem PII; contato e pré-qualificação só por ação deliberada. */
export async function InterestRecordPage({ interestId }: { readonly interestId: string }) {
  const gate = await adminRoleGate(INTEREST_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const id = recordId(interestId);
  const view = id === null ? null : await readInterestRecord(gate.session, id);
  if (view === null) return <NotFound session={gate.session} />;
  const text = messages.interest;
  return (
    <InterestShell session={gate.session}>
      <PageHeader
        title={text.title}
        lead={homeEditionTitle(view.label)}
        context={{ href: paths.homeEdition(view.interest.homeEditionId), label: text.context }}
      />
      <section className="lx-page-section">
        <InterestEvidence interest={view.interest} label={view.label} />
        <p className="lx-small">{text.contactNote}</p>
        <div className="lx-form__actions">
          <a className="lx-button lx-button--secondary" href={paths.contact(view.interest.id)}>
            {text.openContact}
          </a>
        </div>
      </section>
    </InterestShell>
  );
}

function Unavailable({ message }: { readonly message: string }) {
  return (
    <div className="lx-empty">
      <p className="lx-body">{message}</p>
    </div>
  );
}

/**
 * Pré-qualificação na copy aprovada (spec ownership §14.5, §14.10): recursos para iniciar, a compatibilidade com a média
 * só quando foi perguntada (com a média apresentada pelo histórico imutável, `02` §15 item 14), decisão e momento.
 * Nenhum score, ordem ou interpretação: o SDR lê o que foi declarado.
 */
function QualificationEvidence({ view }: { readonly view: ContactView }) {
  const text = messages.contact;
  const qualification = view.qualification;
  if (qualification === null) return <Unavailable message={text.qualificationUnavailable} />;
  const presented =
    view.presented === null
      ? null
      : formatMoney(view.presented.amountMinor, view.presented.currency);
  return (
    <Evidence
      items={[
        {
          label: text.availableToStart,
          value: request.availableToStart.answers[qualification.availableToStartBand],
        },
        ...(qualification.referenceFit === null
          ? []
          : [
              {
                label: text.referenceFit,
                value: request.referenceFit.answers[qualification.referenceFit],
              },
            ]),
        ...(presented === null ? [] : [{ label: text.presented, value: presented }]),
        {
          label: text.decisionUnit,
          value: request.decisionUnit.answers[qualification.decisionUnit],
        },
        {
          label: text.decisionHorizon,
          value: request.decisionHorizon.answers[qualification.decisionHorizon],
        },
      ]}
    />
  );
}

/** `/admin/interesses/[interestId]/contato`: contato e pré-qualificação, leitura deliberada e registrada. */
export async function InterestContactPage({ interestId }: { readonly interestId: string }) {
  const gate = await adminRoleGate(INTEREST_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const id = recordId(interestId);
  const view = id === null ? null : await readInterestContact(gate.session, id);
  if (view === null) return <NotFound session={gate.session} />;
  const text = messages.contact;
  return (
    <InterestShell session={gate.session}>
      <PageHeader
        title={text.title}
        lead={homeEditionTitle(view.label)}
        context={{ href: paths.interest(view.interest.id), label: text.context }}
      />
      <section className="lx-page-section" aria-labelledby="interest-second-home">
        <h2 className="lx-display-s" id="interest-second-home">
          {text.secondHomeTitle}
        </h2>
        <InterestEvidence interest={view.interest} label={view.label} />
      </section>
      <section className="lx-page-section" aria-labelledby="interest-qualification">
        <h2 className="lx-display-s" id="interest-qualification">
          {text.qualificationTitle}
        </h2>
        <QualificationEvidence view={view} />
        <p className="lx-small">{text.note}</p>
      </section>
      <section className="lx-page-section" aria-labelledby="interest-contact">
        <h2 className="lx-display-s" id="interest-contact">
          {text.contactTitle}
        </h2>
        {view.contact === null ? (
          <Unavailable message={text.contactUnavailable} />
        ) : (
          <Evidence
            items={[
              { label: text.name, value: view.contact.name },
              { label: text.phone, value: view.contact.phone },
              { label: text.email, value: view.contact.email },
            ]}
          />
        )}
      </section>
    </InterestShell>
  );
}
