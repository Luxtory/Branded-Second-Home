import type { ReactNode } from 'react';
import { PageHeader } from '@/design-system/react';
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
