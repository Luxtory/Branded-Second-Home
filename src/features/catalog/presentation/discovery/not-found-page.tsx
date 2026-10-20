import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { ActionLink } from './parts';
import { discoveryPaths } from './paths';
import { DiscoverySite } from './site';

/**
 * 404 dentro do site público (receita catalog §13.9: White, Statement/Pause com o link de volta): Home Concept inexistente,
 * não público (spec catalog §13.1) ou endereço que mudou.
 */
export function DiscoveryNotFoundPage() {
  return (
    <DiscoverySite current="none">
      <section className="lx-section" data-surface="white" aria-labelledby="nao-encontrada">
        <div className="lx-container lx-pause lx-pause--start">
          <h1 id="nao-encontrada" className="lx-headline">
            <HeadlineText headline={text.notFound.title} />
          </h1>
          <p className="lx-subheadline">{text.notFound.text}</p>
          <ActionLink primary href={discoveryPaths.collection} label={text.actions.collection} />
        </div>
      </section>
    </DiscoverySite>
  );
}
