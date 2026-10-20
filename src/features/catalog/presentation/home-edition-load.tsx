import type { ReactElement } from 'react';
import { PageHeader } from '@/design-system/react';
import { adminRoleGate, type ExercisedAdminSession } from '@/features/admin';
import type { HomeEditionDetail } from '../application/views';
import { postgresCatalogReader as reader } from '../infrastructure/postgres-catalog-reader';
import { CatalogNotFound, isRecordId } from './catalog-page';
import { readCatalog } from './catalog-read';
import { CATALOG_ROLE } from './handlers';
import { previewOf, type Preview } from './media-preview';
import { paths } from './paths';

export interface HomeEditionLoaded {
  readonly session: ExercisedAdminSession;
  readonly detail: HomeEditionDetail;
  readonly preview: Preview | null;
}

/**
 * Portão + leitura auditada da Home Edition (+ a pré-visualização de uma mídia) numa só transação; bloqueio ou "não
 * encontrado" viram a própria página.
 */
export async function loadHomeEdition(
  id: string,
  previewMediaId: string | null = null,
): Promise<HomeEditionLoaded | { readonly page: ReactElement }> {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return { page: gate.page };
  const ids = previewMediaId === null ? [id] : [id, previewMediaId];
  if (!ids.every(isRecordId)) return { page: <CatalogNotFound session={gate.session} /> };
  const { detail, rendition } = await readCatalog(
    gate.session,
    { type: 'home_edition', id },
    async (tx) => ({
      detail: await reader.homeEdition(tx, id),
      rendition:
        previewMediaId === null ? null : await reader.homeEditionMediaPreview(tx, previewMediaId),
    }),
  );
  if (detail === null) return { page: <CatalogNotFound session={gate.session} /> };
  return { session: gate.session, detail, preview: await previewOf(rendition) };
}

/** Cabeçalho das páginas de ação de uma Home Edition: contexto = a Home Edition. */
export function HomeEditionContextHeader({
  detail,
  title,
  lead,
}: {
  readonly detail: HomeEditionDetail;
  readonly title: string;
  readonly lead: string;
}) {
  return (
    <PageHeader
      title={title}
      lead={lead}
      context={{ href: paths.homeEdition(detail.homeEdition.id), label: detail.homeEdition.name }}
    />
  );
}
