import type { Metadata } from 'next';
import { HomeEditionPage } from '@/features/catalog/presentation/discovery/home-edition-page';
import { homeEditionMetadata } from '@/features/catalog/presentation/discovery/metadata';
import { discoveryPaths } from '@/features/catalog/presentation/discovery/paths';
import { InterestRequestSection } from '@/features/ownership/presentation/interest-request-section';

interface Props {
  readonly params: Promise<{ homeConceptId: string; homeEditionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { homeConceptId, homeEditionId } = await params;
  return homeEditionMetadata(homeConceptId, homeEditionId);
}

export default async function Page({ params }: Props) {
  const { homeConceptId, homeEditionId } = await params;
  // A seção "Solicitar uma conversa" (W6, spec ownership §14.3) chega à página do `catalog` pelo shell, com o contexto
  // que a própria página leu — sem import entre slices.
  return (
    <HomeEditionPage
      homeConceptId={homeConceptId}
      homeEditionId={homeEditionId}
      conversationRequest={(context) => (
        <InterestRequestSection
          homeEditionId={context.homeEditionId}
          presentedProjectedInvestment={context.presentedProjectedInvestment}
          collectionHref={discoveryPaths.collection}
        />
      )}
    />
  );
}
