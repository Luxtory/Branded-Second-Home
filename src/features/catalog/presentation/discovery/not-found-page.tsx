import { Scene } from '@/design-system/react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { ActionLink } from './parts';
import { discoveryPaths } from './paths';
import { DiscoverySite } from './site';

/** 404 dentro do site público: Concept inexistente, não público (spec catalog §13.1) ou endereço que mudou. */
export function DiscoveryNotFoundPage() {
  return (
    <DiscoverySite current="none">
      <Scene titleId="nao-encontrada" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h1 id="nao-encontrada" className="lx-display-l">
            <HeadlineText headline={text.notFound.title} />
          </h1>
          <p className="lx-lead">{text.notFound.text}</p>
          <div className="lx-scene__actions">
            <ActionLink primary href={discoveryPaths.collection} label={text.actions.collection} />
          </div>
        </div>
      </Scene>
    </DiscoverySite>
  );
}
