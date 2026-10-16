import { notFound } from 'next/navigation';
import { isPublicSiteOpen } from '@/features/platform';
import { AboutContent } from '@/features/catalog/presentation/about/content';
import { aboutMetadata } from '@/features/catalog/presentation/about/metadata';
import { DiscoverySite } from '@/features/catalog/presentation/discovery/site';

export default function AboutRoute() {
  if (!isPublicSiteOpen()) notFound();
  return (
    <DiscoverySite current="about">
      <AboutContent journey="discovery" />
    </DiscoverySite>
  );
}

// Guard both entry points: App Router can render metadata in parallel with the layout.
export function generateMetadata() {
  if (!isPublicSiteOpen()) notFound();
  return aboutMetadata('discovery');
}
