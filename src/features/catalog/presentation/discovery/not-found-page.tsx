import { Scene } from '@/design-system/react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { discoveryPaths } from './paths';
import { DiscoverySite } from './site';

/** 404 dentro do site público: Concept inexistente, oculto (D-W4-02) ou endereço que mudou — com caminho de volta. */
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
            <a className="lx-button lx-button--primary" href={discoveryPaths.collection}>
              {text.actions.collection}
            </a>
          </div>
        </div>
      </Scene>
    </DiscoverySite>
  );
}
