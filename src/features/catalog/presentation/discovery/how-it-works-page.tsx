import { Evidence, Scene } from '@/design-system/react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { discoveryPaths } from './paths';
import { Qualification } from './qualification';
import { DiscoverySite } from './site';
import { nb } from './no-break';

const { howItWorks: page, actions, modality } = text;
const DIMENSIONS = ['holding', 'use', 'administration', 'personalization'] as const;

function Paragraphs({ items }: { readonly items: readonly string[] }) {
  return items.map((paragraph) => (
    <p className="lx-body" key={paragraph}>
      {nb(paragraph)}
    </p>
  ));
}

function ItemList({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="lx-prose">
      {items.map((item) => (
        <li className="lx-body" key={item}>
          {nb(item)}
        </li>
      ))}
    </ul>
  );
}

/** Owner e Co-Owner nas mesmas dimensões, lado a lado (REQ-103, BR-376). */
function Modality({ side }: { readonly side: 'owner' | 'coOwner' }) {
  const values = page.modalities[side];
  return (
    <div className="lx-pair__item">
      <h3 className="lx-display-m">{side === 'owner' ? modality.owner : modality.co_owner}</h3>
      <dl className="lx-prose">
        {DIMENSIONS.map((dimension) => (
          <div key={dimension}>
            <dt className="lx-label">{page.modalities.dimensions[dimension]}</dt>
            <dd className="lx-body">{nb(values[dimension])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Como funciona (brief: docs/specs/catalog.md §13.4) — PROMISE breve → PROOF → PUSH, com condições e limites junto de
 * cada benefício. Estática: não lê o catálogo. O Luxtory Club só aqui, com as condições (D-B2C-11).
 */
export function HowItWorksPage() {
  const use = page.coOwnerUse;
  return (
    <DiscoverySite current="howItWorks">
      <Scene titleId="como-titulo" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h1 id="como-titulo" className="lx-display-xl">
            <HeadlineText headline={page.opening.title} />
          </h1>
          <p className="lx-lead">{nb(page.opening.lead)}</p>
        </div>
      </Scene>

      <Scene titleId="como-cadeia" ground="wash">
        <div className="lx-col-content lx-scene__body">
          <h2 id="como-cadeia" className="lx-display-l">
            <HeadlineText headline={page.chain.title} />
          </h2>
          <ol className="lx-blocks lx-blocks--rows">
            {page.chain.steps.map((step) => (
              <li className="lx-blocks__item" key={step.title}>
                <h3 className="lx-display-s">{step.title}</h3>
                <p className="lx-body">{nb(step.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </Scene>

      <Scene titleId="como-modalidades" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h2 id="como-modalidades" className="lx-display-l">
            <HeadlineText headline={page.modalities.title} />
          </h2>
          <p className="lx-lead">{nb(page.modalities.lead)}</p>
          <div className="lx-pair">
            <Modality side="owner" />
            <Modality side="coOwner" />
          </div>
        </div>
      </Scene>

      <Scene titleId="como-uso" ground="wash">
        <div className="lx-col-content lx-scene__body">
          <h2 id="como-uso" className="lx-display-l">
            <HeadlineText headline={use.title} />
          </h2>
          <p className="lx-lead">{nb(use.lead)}</p>
          <h3 className="lx-display-s">{use.configurationsTitle}</h3>
          <p className="lx-body">{nb(use.configurationsText)}</p>
          <ul className="lx-blocks">
            {use.configurations.map((configuration) => (
              <li className="lx-blocks__item" key={configuration.title}>
                <h4 className="lx-display-s">{configuration.title}</h4>
                <Evidence
                  inline
                  items={[
                    { label: use.configurationLabels.share, value: configuration.share },
                    { label: use.configurationLabels.annual, value: configuration.annual },
                    { label: use.configurationLabels.high, value: configuration.high },
                    { label: use.configurationLabels.regular, value: configuration.regular },
                  ]}
                />
              </li>
            ))}
          </ul>
          <h3 className="lx-display-s">{use.rulesTitle}</h3>
          <ItemList items={use.rules} />
        </div>
      </Scene>

      <Scene titleId="como-condicoes" ground="paper" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h2 id="como-condicoes" className="lx-display-l">
            <HeadlineText headline={page.offer.title} />
          </h2>
          <Paragraphs items={page.offer.paragraphs} />
        </div>
      </Scene>

      <Scene titleId="como-club" ground="wash">
        <div className="lx-col-content lx-scene__body">
          <h2 id="como-club" className="lx-display-l">
            <HeadlineText headline={page.club.title} />
          </h2>
          <p className="lx-lead">{nb(page.club.lead)}</p>
          <ul className="lx-blocks">
            {page.club.mechanisms.map((mechanism) => (
              <li className="lx-blocks__item" key={mechanism.title}>
                <h3 className="lx-display-s">{mechanism.title}</h3>
                <p className="lx-body">{nb(mechanism.text)}</p>
              </li>
            ))}
          </ul>
          <h3 className="lx-display-s">{page.club.conditionsTitle}</h3>
          <ItemList items={page.club.conditions} />
        </div>
      </Scene>

      <Scene titleId="como-limites" ground="paper" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h2 id="como-limites" className="lx-display-l">
            <HeadlineText headline={page.limits.title} />
          </h2>
          <Paragraphs items={page.limits.paragraphs} />
        </div>
      </Scene>

      <Qualification
        titleId="como-para-quem"
        actions={
          <a className="lx-button lx-button--primary" href={discoveryPaths.collection}>
            {actions.collection}
          </a>
        }
      />
    </DiscoverySite>
  );
}
