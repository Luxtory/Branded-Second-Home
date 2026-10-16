import { discoveryPaths } from '../discovery/paths';
import { brandPartnersPaths } from '../brand-partners/paths';

export type AboutJourney = 'discovery' | 'brandPartners';

/** Context is supplied by the route; never inferred from the browser or shared across requests. */
export function aboutContext(journey: AboutJourney) {
  const paths = journey === 'discovery' ? discoveryPaths : brandPartnersPaths;
  return { about: paths.about, howItWorks: paths.howItWorks };
}
