import { Scene, TypographicFrame } from '@/design-system/react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { discoveryPaths } from './paths';
import { Qualification } from './qualification';
import { DiscoverySite } from './site';
import { nb } from './no-break';

const { home, actions, modality } = text;

/**
 * Home (brief: docs/specs/catalog.md §13.4) — arco completo dos 5Ps; o Hero cumpre PICTURE. Estática: não lê o
 * catálogo. Owner e Co-Owner com o mesmo peso (REQ-103).
 */
export function HomePage() {
  return (
    <DiscoverySite current="home">
      <Scene
        titleId="home-titulo"
        ground="night"
        variant="opening"
        backdrop={<TypographicFrame kind="establishing" />}
      >
        <div className="lx-col-content lx-scene__body">
          <h1 id="home-titulo" className="lx-display-xl">
            <HeadlineText headline={home.hero.title} />
          </h1>
          <p className="lx-lead">{nb(home.hero.lead)}</p>
          <div className="lx-scene__actions">
            <a className="lx-button lx-button--primary" href={discoveryPaths.collection}>
              {actions.collection}
            </a>
            <a className="lx-link lx-link--standalone" href={discoveryPaths.howItWorks}>
              {actions.howItWorks}
            </a>
          </div>
        </div>
      </Scene>

      <Scene titleId="home-problema" ground="paper" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h2 id="home-problema" className="lx-display-l">
            <HeadlineText headline={home.problem.title} />
          </h2>
          {home.problem.paragraphs.map((paragraph) => (
            <p className="lx-body" key={paragraph}>
              {nb(paragraph)}
            </p>
          ))}
        </div>
      </Scene>

      <Scene titleId="home-logica" ground="wash">
        <div className="lx-col-content lx-scene__body">
          <h2 id="home-logica" className="lx-display-l">
            <HeadlineText headline={home.promise.title} />
          </h2>
          <ol className="lx-blocks">
            {home.promise.steps.map((step) => (
              <li className="lx-blocks__item" key={step.title}>
                <h3 className="lx-display-s">{step.title}</h3>
                <p className="lx-body">{nb(step.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </Scene>

      <Scene titleId="home-modalidades" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h2 id="home-modalidades" className="lx-display-l">
            <HeadlineText headline={home.modalities.title} />
          </h2>
          <div className="lx-pair">
            <div className="lx-pair__item">
              <h3 className="lx-display-m">{modality.owner}</h3>
              <ul className="lx-prose">
                {home.modalities.owner.map((item) => (
                  <li className="lx-body" key={item}>
                    {nb(item)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lx-pair__item">
              <h3 className="lx-display-m">{modality.co_owner}</h3>
              <ul className="lx-prose">
                {home.modalities.coOwner.map((item) => (
                  <li className="lx-body" key={item}>
                    {nb(item)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p>
            <a className="lx-link lx-link--standalone" href={discoveryPaths.howItWorks}>
              {actions.howItWorks}
            </a>
          </p>
        </div>
      </Scene>

      <Qualification
        titleId="home-para-quem"
        actions={
          <>
            <a className="lx-button lx-button--primary" href={discoveryPaths.collection}>
              {actions.collection}
            </a>
            <a className="lx-link lx-link--standalone" href={discoveryPaths.howItWorks}>
              {actions.howItWorks}
            </a>
          </>
        }
      />
    </DiscoverySite>
  );
}
