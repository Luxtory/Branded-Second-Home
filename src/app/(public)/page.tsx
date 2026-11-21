import { notFound } from 'next/navigation';
import { isPublicSiteOpen } from '@/features/platform';
import {
  ClubHomePage,
  generateClubHomeMetadata,
} from '@/features/catalog/presentation/discovery/club-home-page';

export { generateClubHomeMetadata as generateMetadata };

export default function HomeRoute() {
  // The App Router can render the page in parallel with the public layout.
  if (!isPublicSiteOpen()) notFound();
  return <ClubHomePage />;
}
