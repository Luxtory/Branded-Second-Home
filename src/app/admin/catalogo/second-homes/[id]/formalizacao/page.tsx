import type { Metadata } from 'next';
import { AcquisitionAdminPage } from '@/features/ownership/presentation/acquisition-admin-page';
import { acquisitionMessages } from '@/features/ownership/presentation/i18n/acquisition-pt-br';
export const metadata: Metadata = {
  title: acquisitionMessages.title,
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
  const registered =
    typeof query.registered === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.registered)
      ? query.registered
      : null;
  return <AcquisitionAdminPage id={id} registered={registered} />;
}
