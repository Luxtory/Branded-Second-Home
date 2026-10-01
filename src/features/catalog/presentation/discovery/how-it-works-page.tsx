import type { ReactNode } from 'react';
import { Evidence, Scene, type Ground } from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text, type Headline } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { AnswerView, Blocks, ModalityPairView } from './parts';
import { Qualification } from './qualification';
import { readAvailability } from './read';
import { DiscoverySite } from './site';

const { howItWorks: page, qualification } = text;
const { patrimony, freedom, belonging } = page;

/** Capítulo de um pilar: marker de capítulo no rail e as perguntas do Protagonista como títulos. */
function Chapter({
  id,
  ground,
  marker,
  title,
  children,
}: {
  readonly id: string;
  readonly ground: Ground;
  readonly marker: readonly string[];
  readonly title: Headline;
  readonly children: ReactNode;
}) {
  return (
    <Scene titleId={id} ground={ground}>
      <div className="lx-col-rail lx-scene__rail">
        <p className="lx-marker">
          {marker.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
      </div>
      <div className="lx-col-content lx-scene__body">
        <h2 id={id} className="lx-display-l">
          <HeadlineText headline={title} />
        </h2>
        {children}
      </div>
    </Scene>
  );
}

/**
 * As quatro configurações Co-Owner (`01` §8.1, sem a capacidade da Luxtory): detalhe secundário do uso, em grupo
 * próprio logo depois da pergunta sobre o uso.
 */
function Configurations() {
  const { configurations } = freedom;
  const { labels } = configurations;
  return (
    <div className="lx-page-section">
      <h4 className="lx-label">{configurations.title}</h4>
      <p className="lx-body">{configurations.text}</p>
      <ul className="lx-blocks">
        {configurations.rows.map((row) => (
          <li className="lx-blocks__item" key={row.title}>
            <h5 className="lx-display-s">
              <span className="lx-nowrap">{row.title}</span>
            </h5>
            <Evidence
              inline
              items={[
                { label: labels.share, value: row.share },
                { label: labels.annual, value: row.annual },
                { label: labels.high, value: row.high },
                { label: labels.low, value: row.low },
              ]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Como funciona `/como-funciona` (spec catalog §13.4): Product Aware → Most Aware, PROOF → PUSH `[FW-B2C: §8.1]`. */
export async function HowItWorksPage() {
  const cta = catalogCta(await readAvailability());
  return (
    <DiscoverySite current="howItWorks">
      <Scene titleId="como-funciona" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h1 id="como-funciona" className="lx-display-xl">
            {page.header.title}
          </h1>
          <p className="lx-lead">{page.header.text}</p>
        </div>
      </Scene>

      <Scene titleId="mecanismo" ground="wash">
        <div className="lx-col-content lx-scene__body">
          <h2 id="mecanismo" className="lx-display-l">
            <HeadlineText headline={page.chain.title} />
          </h2>
          <Blocks items={page.chain.steps} level={3} ordered rows />
        </div>
      </Scene>

      <Chapter id="patrimonio" ground="paper" marker={patrimony.marker} title={patrimony.title}>
        <div className="lx-page-section">
          <h3 className="lx-display-m">{patrimony.own.question}</h3>
          <ModalityPairView pair={patrimony.own.pair} level={4} />
          <p className="lx-body">{patrimony.own.after}</p>
        </div>
        {patrimony.answers.map((answer) => (
          <AnswerView answer={answer} level={3} key={answer.question} />
        ))}
      </Chapter>

      <Chapter id="liberdade" ground="wash" marker={freedom.marker} title={freedom.title}>
        <div className="lx-page-section">
          <h3 className="lx-display-m">{freedom.use.question}</h3>
          <ModalityPairView pair={freedom.use.pair} level={4} />
          <p className="lx-body">{freedom.use.after}</p>
        </div>
        <Configurations />
        {freedom.answers.map((answer) => (
          <AnswerView answer={answer} level={3} key={answer.question} />
        ))}
        <div className="lx-page-section">
          <h3 className="lx-display-m">{freedom.management.question}</h3>
          <ModalityPairView pair={freedom.management.pair} level={4} />
        </div>
        <div className="lx-page-section">
          <h3 className="lx-display-m">{freedom.club.question}</h3>
          <p className="lx-body">{freedom.club.text}</p>
          <Blocks items={freedom.club.items} level={4} />
          <p className="lx-body">{freedom.club.after}</p>
        </div>
        <AnswerView answer={freedom.limits} level={3} />
      </Chapter>

      <Chapter id="pertencimento" ground="paper" marker={belonging.marker} title={belonging.title}>
        {belonging.answers.map((answer) => (
          <AnswerView answer={answer} level={3} key={answer.question} />
        ))}
      </Chapter>

      <Scene titleId="condicoes" ground="night" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h2 id="condicoes" className="lx-display-l">
            <HeadlineText headline={page.conditions.title} />
          </h2>
          <ul className="lx-prose">
            {page.conditions.items.map((item) => (
              <li className="lx-body" key={item}>
                {nb(item)}
              </li>
            ))}
          </ul>
        </div>
      </Scene>

      <Qualification
        titleId="para-quem"
        extraNotFits={[qualification.existingProperty, qualification.coOwnerFit]}
      >
        <CatalogActions
          cta={cta}
          next={{
            editions: qualification.next.editions,
            concepts: qualification.next.concepts,
            none: qualification.nextHowItWorks.none,
          }}
          from="howItWorks"
        />
      </Qualification>
    </DiscoverySite>
  );
}
