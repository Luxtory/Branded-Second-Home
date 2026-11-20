import type { Metadata } from 'next';
import { membershipAdminMessages } from '@/features/identity/presentation/i18n/membership-pt-br';
import { MembershipChangePage } from '@/features/identity/presentation/party-admin-pages';
import { membershipActionOf } from '@/features/identity/presentation/party-paths';

export const metadata: Metadata = {
  title: membershipAdminMessages.sectionTitle,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string; acao: string }> }) {
  const { id, acao } = await params;
  return <MembershipChangePage id={id} action={membershipActionOf(acao)} />;
}
