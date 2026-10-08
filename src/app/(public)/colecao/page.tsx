import { CollectionPage } from '@/features/catalog/presentation/discovery/collection-page';

export { collectionMetadata as metadata } from '@/features/catalog/presentation/discovery/metadata';

/** `/colecao`: a busca vem da URL (formulário GET), lida no servidor (spec catalog §13.12). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CollectionPage searchParams={await searchParams} />;
}
