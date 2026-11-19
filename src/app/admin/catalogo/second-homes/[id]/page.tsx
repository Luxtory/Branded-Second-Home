import type { Metadata } from 'next';
import { SecondHomePage } from '@/features/catalog/presentation/home-edition-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';
import { acquisitionMessages } from '@/features/ownership/presentation/i18n/acquisition-pt-br';
import { statusKey } from '@/features/catalog/presentation/paths';
import { luxtorySelectionMessages } from '@/features/calendar/presentation/i18n/luxtory-selection-pt-br';
import { guestRulesMessages } from '@/features/admin/presentation/i18n/guest-rules-pt-br';

export const metadata: Metadata = {
  title: messages.metadata.secondHome,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <SecondHomePage
      id={id}
      status={statusKey(query.status)}
      actions={
        <>
          <a
            className="lx-button lx-button--secondary"
            href={`/admin/catalogo/second-homes/${encodeURIComponent(id)}/formalizacao`}
          >
            {acquisitionMessages.entry}
          </a>
          <a
            className="lx-button lx-button--secondary"
            href={`/admin/catalogo/second-homes/${encodeURIComponent(id)}/selecao-luxtory`}
          >
            {luxtorySelectionMessages.entry}
          </a>
          <a
            className="lx-button lx-button--secondary"
            href={`/admin/catalogo/second-homes/${encodeURIComponent(id)}/regras-de-convidados`}
          >
            {guestRulesMessages.entry}
          </a>
        </>
      }
    />
  );
}
