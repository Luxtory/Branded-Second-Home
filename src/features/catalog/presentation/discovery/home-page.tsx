import type { ReactNode } from 'react';
import { Icon, Scene, TypographicFrame, type Ground } from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { ActionLink, ModalityPairView, Paragraphs } from './parts';
import { discoveryPaths, HOME_SECTIONS } from './paths';
import { readAvailability } from './read';
import { DiscoverySite } from './site';

const { home, triad } = text;
const { hero, renunciation, rule, possibility, luxtory, belonging, patrimony, freedom } = home;
const { management, push, faq } = home;

const [
  HERO,
  RENUNCIATION,
  RULE,
  POSSIBILITY,
  LUXTORY,
  BELONGING,
  PATRIMONY,
  FREEDOM,
  MANAGEMENT,
  PUSH,
  FAQ,
] = HOME_SECTIONS;

/** O título nomeia a seção; a seção leva a âncora (o marker fica visível ao chegar por link). */
const titleOf = (section: string) => `${section}-titulo`;

function Marker({ parts }: { readonly parts: string | readonly string[] }) {
  const list = typeof parts === 'string' ? [parts] : parts;
  return (
    <p className="lx-marker">
      {list.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </p>
  );
}

/** Scene com o marker na margem (rail, a partir do `lg`) e o texto na coluna larga. */
function RailScene({
  id,
  ground,
  marker,
  children,
}: {
  readonly id: string;
  readonly ground: Ground;
  readonly marker: string | readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <Scene id={id} titleId={titleOf(id)} ground={ground}>
      <div className="lx-col-rail lx-scene__rail">
        <Marker parts={marker} />
      </div>
      <div className="lx-col-content lx-scene__body">{children}</div>
    </Scene>
  );
}

/** Scene de afirmação: coluna central, o marker abre o texto. */
function StatementScene({
  id,
  ground,
  marker,
  children,
}: {
  readonly id: string;
  readonly ground: Ground;
  readonly marker: string;
  readonly children: ReactNode;
}) {
  return (
    <Scene id={id} titleId={titleOf(id)} ground={ground} variant="statement">
      <div className="lx-col-text lx-scene__body">
        <Marker parts={marker} />
        {children}
      </div>
    </Scene>
  );
}

function LineList({
  lines,
  className,
}: {
  readonly lines: readonly string[];
  readonly className: string;
}) {
  return (
    <ul className="lx-prose">
      {lines.map((line) => (
        <li className={className} key={line}>
          {nb(line)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Home `/` (spec catalog §13.4): a copy do fundador (D-B2C-18), Unaware → Product Aware. PICTURE = Hero, sem ação
 * comercial — o convite só desce até a renúncia; PUSH com o CTA por disponibilidade (D-B2C-16).
 */
export async function HomePage() {
  const cta = catalogCta(await readAvailability());
  return (
    <DiscoverySite current="home">
      {/* PICTURE */}
      <Scene
        id={HERO}
        titleId={titleOf(HERO)}
        ground="night"
        variant="opening"
        backdrop={<TypographicFrame kind="establishing" scrim />}
      >
        <div className="lx-col-content lx-scene__body">
          <h1 id={titleOf(HERO)} className="lx-display-xl">
            <HeadlineText headline={hero.title} />
          </h1>
          <p className="lx-lead">{nb(hero.text)}</p>
          <div className="lx-scene__actions">
            <ActionLink primary href={`#${RENUNCIATION}`} label={hero.action} />
          </div>
        </div>
      </Scene>

      {/* PROBLEM — antagonista: o trade-off das alternativas. */}
      <RailScene id={RENUNCIATION} ground="paper" marker={renunciation.marker}>
        <h2 id={titleOf(RENUNCIATION)} className="lx-display-l">
          <HeadlineText headline={renunciation.title} />
        </h2>
        <div className="lx-page-section">
          <p className="lx-lead">{nb(renunciation.intro)}</p>
          <p className="lx-display-m">{nb(renunciation.values)}</p>
          <p className="lx-body">{nb(renunciation.tension)}</p>
        </div>
        <ul className="lx-blocks">
          {renunciation.alternatives.map((alternative) => (
            <li className="lx-blocks__item" key={alternative.title}>
              <h3 className="lx-display-s">{alternative.title}</h3>
              <Paragraphs lines={alternative.text} />
            </li>
          ))}
        </ul>
        <div className="lx-prose">
          <Paragraphs lines={renunciation.closing} className="lx-lead" />
          <p className="lx-display-s">{nb(renunciation.closingTurn)}</p>
        </div>
      </RailScene>

      {/* PROBLEM — vilão: a renúncia tratada como regra. */}
      <StatementScene id={RULE} ground="night" marker={rule.marker}>
        <h2 id={titleOf(RULE)} className="lx-display-l">
          {rule.title}
        </h2>
        <LineList lines={rule.split} className="lx-display-s" />
        <div className="lx-prose">
          <Paragraphs lines={rule.text} className="lx-lead" />
        </div>
        <p className="lx-display-m">
          <em>{rule.question}</em>
        </p>
        <div className="lx-prose">
          <Paragraphs lines={rule.closing} className="lx-lead" />
        </div>
      </StatementScene>

      {/* PROMISE */}
      <RailScene id={POSSIBILITY} ground="wash" marker={possibility.marker}>
        <h2 id={titleOf(POSSIBILITY)} className="lx-display-xl">
          <HeadlineText headline={possibility.title} />
        </h2>
        <div className="lx-prose">
          <Paragraphs lines={possibility.imagine} className="lx-lead" />
        </div>
        <LineList lines={possibility.values} className="lx-display-s" />
        <div className="lx-page-section">
          <p className="lx-display-m">{nb(possibility.triad)}</p>
          <p className="lx-display-l">
            <em>{possibility.promise}</em>
          </p>
          <p className="lx-lead">{nb(possibility.logic)}</p>
        </div>
      </RailScene>

      {/* PROOF — a Luxtory e a arquitetura dos três valores. */}
      <StatementScene id={LUXTORY} ground="night" marker={luxtory.marker}>
        <p className="lx-lead">{nb(luxtory.intro)}</p>
        <h2 id={titleOf(LUXTORY)} className="lx-display-l">
          {luxtory.idea}
        </h2>
        <div className="lx-page-section">
          <p className="lx-display-s">{nb(luxtory.start)}</p>
          <p className="lx-display-s">
            <em>{luxtory.startTurn}</em>
          </p>
        </div>
        <p className="lx-lead">{nb(luxtory.partners)}</p>
        <div className="lx-page-section">
          <p className="lx-lead">{nb(luxtory.club)}</p>
          <p className="lx-lead">{nb(luxtory.architecture)}</p>
          <p className="lx-display-m">{nb(luxtory.triad)}</p>
        </div>
      </StatementScene>

      {/* Pertencimento: o universo da marca ganha um Frame tipográfico (sem fotografia, P-LX-02). */}
      <Scene id={BELONGING} titleId={titleOf(BELONGING)} ground="paper" variant="media-end">
        <div className="lx-col-rail lx-scene__rail">
          <Marker parts={belonging.marker} />
        </div>
        <div className="lx-col-text lx-scene__body">
          <h2 id={titleOf(BELONGING)} className="lx-display-m">
            {belonging.title}
          </h2>
          <div className="lx-prose">
            <Paragraphs lines={belonging.brands} className="lx-lead" />
          </div>
        </div>
        <div className="lx-col-media lx-scene__media">
          <div className="lx-frame lx-frame--detail lx-frame--typographic">
            <div className="lx-frame__media" data-ground="night">
              <ul className="lx-prose">
                {belonging.universe.map((word) => (
                  <li className="lx-frame__title" key={word}>
                    {word}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="lx-col-content lx-scene__body">
          <p className="lx-display-s">{nb(belonging.place)}</p>
          <div className="lx-prose">
            <Paragraphs lines={belonging.text} />
          </div>
          <div className="lx-page-section">
            <p className="lx-lead">{nb(belonging.arrival)}</p>
            <p className="lx-display-s">{nb(belonging.notOnly)}</p>
            <p className="lx-lead">{nb(belonging.but)}</p>
            <p className="lx-display-l">
              <em>{belonging.mine}</em>
            </p>
          </div>
        </div>
      </Scene>

      {/* Patrimônio: Owner e Co-Owner com o mesmo peso (REQ-103). */}
      <RailScene id={PATRIMONY} ground="wash" marker={patrimony.marker}>
        <h2 id={titleOf(PATRIMONY)} className="lx-display-l">
          <HeadlineText headline={patrimony.title} />
        </h2>
        <div className="lx-page-section">
          <p className="lx-lead">{nb(patrimony.intro)}</p>
          <Paragraphs lines={patrimony.text} />
        </div>
        <ModalityPairView pair={patrimony.pair} level={3} />
        <div className="lx-page-section">
          <h3 className="lx-display-s">{patrimony.both.title}</h3>
          <div className="lx-prose">
            <Paragraphs lines={patrimony.both.text} />
          </div>
          <p className="lx-display-l">
            <em>{patrimony.both.principle}</em>
          </p>
        </div>
      </RailScene>

      {/* Liberdade: cada mecanismo numa linha, nome à esquerda e texto à direita (a partir do md). */}
      <RailScene id={FREEDOM} ground="paper" marker={freedom.marker}>
        <h2 id={titleOf(FREEDOM)} className="lx-display-l">
          {freedom.title}
        </h2>
        <div className="lx-prose">
          <Paragraphs lines={freedom.text} className="lx-lead" />
        </div>
        <ul className="lx-blocks lx-blocks--rows">
          {freedom.mechanisms.map((mechanism) => (
            <li className="lx-blocks__item" key={mechanism.title}>
              <h3 className="lx-display-s">{mechanism.title}</h3>
              <div className="lx-prose">
                <Paragraphs lines={mechanism.text} />
              </div>
            </li>
          ))}
        </ul>
        <p className="lx-display-m">
          <HeadlineText headline={freedom.closing} />
        </p>
      </RailScene>

      {/* Gestão: Owner e Co-Owner com o mesmo peso (REQ-103). */}
      <RailScene id={MANAGEMENT} ground="wash" marker={management.marker}>
        <h2 id={titleOf(MANAGEMENT)} className="lx-display-l">
          <HeadlineText headline={management.title} />
        </h2>
        <div className="lx-page-section">
          <p className="lx-lead">{nb(management.intro)}</p>
          <p className="lx-body">{nb(management.text)}</p>
        </div>
        <ModalityPairView pair={management.pair} level={3} />
        <p className="lx-display-m">
          <HeadlineText headline={management.closing} />
        </p>
      </RailScene>

      {/* PUSH — autosseleção e o próximo passo por disponibilidade. */}
      <StatementScene id={PUSH} ground="night" marker={push.marker}>
        <h2 id={titleOf(PUSH)} className="lx-display-xl">
          <HeadlineText headline={push.title} />
        </h2>
        <p className="lx-lead">{nb(push.intro)}</p>
        <LineList lines={push.promises} className="lx-display-s" />
        <ul className="lx-prose">
          {[triad.patrimony, triad.freedom, triad.belonging].map((line) => (
            <li className="lx-display-m" key={line.lead}>
              <HeadlineText headline={line} />
            </li>
          ))}
        </ul>
        <div className="lx-page-section">
          <Paragraphs lines={push.forWhom} className="lx-lead" />
        </div>
        <p className="lx-lead">{nb(push.next)}</p>
        <CatalogActions cta={cta} next={{}} from="home" />
      </StatementScene>

      {/* Dúvidas essenciais, abertas no lugar. */}
      <RailScene id={FAQ} ground="paper" marker={faq.marker}>
        <h2 id={titleOf(FAQ)} className="lx-display-l">
          {faq.title}
        </h2>
        <div className="lx-disclosure">
          {faq.items.map((item) => (
            <details className="lx-disclosure__item" key={item.question}>
              <summary className="lx-disclosure__summary">
                <span>{item.question}</span>
                <Icon name="arrow-right" className="lx-disclosure__icon" />
              </summary>
              <div className="lx-disclosure__body">
                <Paragraphs lines={item.answer} />
              </div>
            </details>
          ))}
          <details className="lx-disclosure__item">
            <summary className="lx-disclosure__summary">
              <span>{faq.details.question}</span>
              <Icon name="arrow-right" className="lx-disclosure__icon" />
            </summary>
            <div className="lx-disclosure__body">
              <p className="lx-body">
                {faq.details.before}
                <a className="lx-link" href={discoveryPaths.howItWorks}>
                  {faq.details.link}
                </a>
                {faq.details.after}
              </p>
            </div>
          </details>
        </div>
      </RailScene>
    </DiscoverySite>
  );
}
