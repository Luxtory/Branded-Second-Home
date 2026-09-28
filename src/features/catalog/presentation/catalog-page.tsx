import type { ReactNode } from 'react';
import { PageHeader, type RecordAttribute } from '@/design-system/react';
import { AdminShell, type ExercisedAdminSession } from '@/features/admin';
import { messages } from './i18n/pt-br';
import { Notice } from './notice';
import { paths, type StatusKey } from './paths';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de rota válido para consulta (um id malformado é "não encontrado", nunca erro 500). */
export const isRecordId = (value: string): boolean => UUID.test(value);

/** Página do catálogo no App Shell do Admin, seção "Catálogo" atual (ADR-0009). */
export function CatalogPage({
  session,
  children,
}: {
  readonly session: ExercisedAdminSession;
  readonly children: ReactNode;
}) {
  return (
    <AdminShell roles={session.roles} current="catalog">
      <div className="lx-container">{children}</div>
    </AdminShell>
  );
}

/** Registro inexistente: mesma página do catálogo, com o caminho de volta. */
export function CatalogNotFound({ session }: { readonly session: ExercisedAdminSession }) {
  const text = messages.notFound;
  return (
    <CatalogPage session={session}>
      <PageHeader
        title={text.title}
        lead={text.body}
        context={{ href: paths.catalog, label: messages.brandPartner.contextLink }}
      />
    </CatalogPage>
  );
}

/** Confirmação depois de um registro (PRG: a Server Action redireciona com `?status=`). */
export function StatusNotice({ status }: { readonly status: StatusKey | null }) {
  return status === null ? null : (
    <Notice tone="success" role="status" title={messages.status[status]} />
  );
}

/** Dados chave-valor de um registro (`lx-evidence--inline`: uma coluna no celular, colunas a partir de md). */
export function KeyValues({ items }: { readonly items: readonly RecordAttribute[] }) {
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

/** Lista de textos registrados (elementos essenciais, premissas, referências), uma linha por item. */
export function TextList({ items }: { readonly items: readonly string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Grupo de largura total (um item de `KeyValues` sozinho ocupa a linha): textos longos e listas. */
export function ContentGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return <KeyValues items={[{ label, value: children }]} />;
}

/** Seção de página (`lx-page-section`) com o título `h2` ligado por `aria-labelledby`. */
export function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-page-section" aria-labelledby={id}>
      <h2 className="lx-display-s" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Estado vazio honesto (`lx-empty`). */
export function Empty({ message }: { readonly message: string }) {
  return (
    <div className="lx-empty">
      <p className="lx-body">{message}</p>
    </div>
  );
}
