import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, PageHeader, RecordList } from '@/design-system/react';
import { adminRoleGate, AdminShell } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, unavailableKeys } from '@/features/platform';
import { readLuxtorySelectionOverview, type LuxtorySelectionOverview } from '../luxtory-selection';
import { luxtorySelectionMessages as text } from './i18n/luxtory-selection-pt-br';
import { LuxtorySelectionForm } from './luxtory-selection-form';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SearchParams = Record<string, string | string[] | undefined>;

const homePath = (id: string) => `/admin/catalogo/second-homes/${id}`;
const dateOf = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
const instantOf = (at: Date, timeZone: string) =>
  at.toLocaleString('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' });

function Message(props: {
  readonly kind: 'info' | 'success' | 'warning';
  readonly title: string;
  readonly body: string;
  readonly live?: 'status';
}) {
  return (
    <div className={`lx-message lx-message--${props.kind}`} role={props.live}>
      <Icon name={props.kind === 'success' ? 'check' : 'alert'} className="lx-message__icon" />
      <p className="lx-message__title">{props.title}</p>
      <p className="lx-message__body">{props.body}</p>
    </div>
  );
}

function Section(props: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-page-section" aria-labelledby={props.id}>
      <h2 className="lx-display-s" id={props.id}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function windowLabel(opensAt: Date | null, timezone: string, now: Date): string {
  if (opensAt === null) return text.windowPending;
  const instant = instantOf(opensAt, timezone);
  return opensAt.getTime() <= now.getTime() ? text.windowOpen(instant) : text.windowOpens(instant);
}

function Capacity({
  overview,
  now,
}: {
  readonly overview: LuxtorySelectionOverview;
  readonly now: Date;
}) {
  if (overview.exercises.length === 0) return <p className="lx-body">{text.capacityNone}</p>;
  return (
    <RecordList
      label={text.capacityTitle}
      items={overview.exercises.map((exercise) => ({
        id: String(exercise.year),
        title: text.exercise(exercise.year),
        attributes: [
          { label: text.window, value: windowLabel(exercise.opensAt, overview.timezone, now) },
          { label: text.alta, value: text.usage(exercise.used.alta, exercise.capacity.alta) },
          { label: text.media, value: text.usage(exercise.used.media, exercise.capacity.media) },
        ],
      }))}
    />
  );
}

function Selections({ overview }: { readonly overview: LuxtorySelectionOverview }) {
  if (overview.selections.length === 0) return <p className="lx-body">{text.selectionsNone}</p>;
  return (
    <RecordList
      label={text.selectionsTitle}
      items={overview.selections.map((selection) => ({
        id: selection.stayDate,
        title: text.selectionItem(
          dateOf(selection.stayDate),
          text.purposes[selection.purpose] ?? selection.purpose,
          selection.season === 'alta' ? text.alta : text.media,
        ),
        attributes: [{ label: text.basis, value: selection.basis }],
      }))}
    />
  );
}

/**
 * `/admin/catalogo/second-homes/[id]/selecao-luxtory` (W14; REQ-016, REQ-036; spec calendar §9): capacidade e uso por
 * exercício e categoria, janela N+1, seleções e o formulário. Com a K3 fechada, só a leitura (estado fechado).
 */
export async function AdminLuxtorySelectionPage(props: {
  readonly secondHomeId: string;
  readonly searchParams: SearchParams;
}) {
  const gate = await adminRoleGate('admin');
  if (gate.kind === 'blocked') return gate.page;
  const now = new Date();
  let overview: LuxtorySelectionOverview | null = null;
  if (UUID.test(props.secondHomeId)) {
    try {
      overview = await readLuxtorySelectionOverview(getDatabase(), props.secondHomeId, now);
    } catch (error) {
      if (unavailableKeys(error) === null) throw error;
      return <AuthUnavailable />;
    }
  }
  if (overview === null) notFound();
  const done = props.searchParams.feito === '1';
  return (
    <AdminShell roles={gate.session.roles} current="catalog">
      <div className="lx-container">
        <PageHeader
          title={text.title}
          lead={text.lead(overview.label)}
          context={{ href: homePath(overview.secondHomeId), label: text.back }}
        />
        {done || overview.modality !== 'co_owner' || !overview.activated ? (
          <div className="lx-page-section">
            {done ? (
              <Message kind="success" title={text.doneTitle} body={text.doneBody} live="status" />
            ) : null}
            {overview.modality === null ? (
              <Message kind="info" title={text.notFormalizedTitle} body={text.notFormalizedBody} />
            ) : null}
            {overview.modality === 'owner' ? (
              <Message kind="info" title={text.ownerTitle} body={text.ownerBody} />
            ) : null}
            {overview.modality === 'co_owner' && !overview.activated ? (
              <Message kind="warning" title={text.closedTitle} body={text.closedBody} />
            ) : null}
          </div>
        ) : null}
        {overview.modality === 'co_owner' ? (
          <>
            <Section id="capacidade" title={text.capacityTitle}>
              <Capacity overview={overview} now={now} />
            </Section>
            <Section id="selecionadas" title={text.selectionsTitle}>
              <Selections overview={overview} />
            </Section>
            {overview.activated ? (
              <Section id="selecionar" title={text.formTitle}>
                <p className="lx-body">{text.formIntro}</p>
                <LuxtorySelectionForm
                  secondHomeId={overview.secondHomeId}
                  idempotencyKey={randomUUID()}
                  backHref={homePath(overview.secondHomeId)}
                />
              </Section>
            ) : null}
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
