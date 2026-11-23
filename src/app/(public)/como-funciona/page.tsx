import { notFound, permanentRedirect } from 'next/navigation';
import { discoveryPaths } from '@/features/catalog/presentation/discovery/paths';
import { isPublicSiteOpen } from '@/features/platform';

/** The historical HowItWorksPage stays in the catalog feature. */
export default function LegacyHowItWorksRoute() {
  if (!isPublicSiteOpen()) notFound();
  permanentRedirect(discoveryPaths.howItWorks);
}
