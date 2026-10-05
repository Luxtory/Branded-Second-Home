import { Icon } from '@/design-system/react';
import '@/design-system/styles/b2c-foundations.css';
import '@/design-system/styles/b2c.css';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { Marker, ModalityPairView, Paragraphs } from './parts';
import { discoveryPaths, HOME_SECTIONS } from './paths';
import { readAvailability } from './read';
import { HomeHero } from './home-hero';
import { DiscoverySite } from './site';

const { home, triad, values } = text;
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
const titleOf = (section: string) => `${section}-titulo`;

/** Approved Luxtory patterns composed for Home only; D-B2C-18 copy and D-B2C-16 availability remain authoritative. */
export async function HomePage() {
  const cta = catalogCta(await readAvailability());
  return (
    <DiscoverySite current="home">
      <HomeHero
        id={HERO}
        titleId={titleOf(HERO)}
        title={hero.title}
        text={hero.text}
        action={hero.action}
        nextSectionId={RENUNCIATION}
        carouselLabels={hero.carousel}
      />

      <section
        id={RENUNCIATION}
        className="lx-b2c-section lx-b2c-problem"
        data-b2c-surface="dark-blue"
        aria-labelledby={titleOf(RENUNCIATION)}
      >
        <div className="lx-container lx-renunciation">
          <div className="lx-renunciation__opening">
            <div className="lx-renunciation__copy">
              <Marker parts={renunciation.marker} />
              <h2 id={titleOf(RENUNCIATION)} className="lx-renunciation__title">
                <span>{renunciation.title.lead.trim()}</span>
                <em>{renunciation.title.turn}</em>
              </h2>
              <div className="lx-renunciation__intro">
                <p className="lx-body">{nb(renunciation.intro)}</p>
                <p className="lx-body">{nb(renunciation.tension)}</p>
              </div>
            </div>
            <figure className="lx-renunciation__diagram">
              {/* eslint-disable-next-line @next/next/no-img-element -- approved standalone SVG preserves geometry and avoids CSP inline styles. */}
              <img
                src="/diagrams/triade-valor-desejado.svg"
                alt={renunciation.diagramAlt}
                width={723}
                height={640}
              />
            </figure>
          </div>
          <ol className="lx-renunciation__alternatives" aria-label={renunciation.alternativesLabel}>
            {renunciation.alternatives.map((alternative) => (
              <li className="lx-renunciation__alternative" key={alternative.title}>
                <h3 className="lx-display-s">{alternative.title}</h3>
                <Paragraphs lines={alternative.text} />
              </li>
            ))}
          </ol>
          <div className="lx-renunciation__closing">
            <div className="lx-renunciation__closing-copy">
              <Paragraphs lines={renunciation.closing} />
            </div>
            <p className="lx-lead lx-renunciation__closing-turn">{renunciation.closingTurn}</p>
          </div>
        </div>
      </section>

      <section
        id={RULE}
        className="lx-b2c-section lx-b2c-editorial"
        data-b2c-surface="sand"
        aria-labelledby={titleOf(RULE)}
      >
        <div className="lx-container lx-b2c-stack">
          <Marker parts={rule.marker} />
          <h2 id={titleOf(RULE)} className="lx-display-m">
            {rule.title}
          </h2>
          <ul className="lx-b2c-home__three">
            <li>{rule.split[0]}</li>
            <li>{rule.split[1]}</li>
            <li>{rule.split[2]}</li>
          </ul>
          <div>
            <Paragraphs lines={rule.text} />
          </div>
          <p className="lx-display-m">
            <em>{rule.question}</em>
          </p>
          <div>
            <Paragraphs lines={rule.closing} />
          </div>
        </div>
      </section>

      <section
        id={POSSIBILITY}
        className="lx-b2c-section"
        data-b2c-surface="dark-blue"
        aria-labelledby={titleOf(POSSIBILITY)}
      >
        <div className="lx-container">
          <div className="lx-b2c-diagram-layout">
            <div className="lx-b2c-stack">
              <Marker parts={possibility.marker} />
              <h2 id={titleOf(POSSIBILITY)} className="lx-display-m">
                <HeadlineText headline={possibility.title} />
              </h2>
              <Paragraphs lines={possibility.imagine} />
            </div>
            <figure className="lx-b2c-diagram">
              {/* eslint-disable-next-line @next/next/no-img-element -- original solution asset with approved font/contrast adaptations; no inline SVG reconstruction. */}
              <img
                src="/diagrams/diagrama-solucao-luxtory.svg"
                alt={home.media.solutionDiagram}
                width={630}
                height={707}
                loading="lazy"
              />
            </figure>
          </div>
          <div className="lx-b2c-statement lx-b2c-home__statement">
            <div className="lx-b2c-statement__values">
              {[values.patrimony, values.freedom, values.belonging].map((value, index) => (
                <div key={value}>
                  <span className="lx-b2c-meta">{String(index + 1).padStart(2, '0')}</span>
                  <strong className="lx-display-s">{value}</strong>
                  <p className="lx-body">{possibility.values[index]}</p>
                </div>
              ))}
            </div>
            <p className="lx-small">{possibility.triad}</p>
            <p className="lx-b2c-statement__title">
              <em>{possibility.promise}</em>
            </p>
            <p className="lx-b2c-closing">{possibility.logic}</p>
          </div>
        </div>
      </section>

      <section
        id={LUXTORY}
        className="lx-b2c-section lx-b2c-editorial"
        data-b2c-surface="white"
        aria-labelledby={titleOf(LUXTORY)}
      >
        <div className="lx-container lx-b2c-stack">
          <Marker parts={luxtory.marker} />
          <p className="lx-body">{nb(luxtory.intro)}</p>
          <h2 id={titleOf(LUXTORY)} className="lx-display-m">
            {luxtory.idea}
          </h2>
          <div className="lx-b2c-home__turn">
            <p className="lx-display-s">{luxtory.start}</p>
            <p className="lx-display-s">
              <em>{luxtory.startTurn}</em>
            </p>
          </div>
          <p className="lx-body">{nb(luxtory.partners)}</p>
          <p className="lx-body">{luxtory.club}</p>
          <p className="lx-body">{luxtory.architecture}</p>
          <p className="lx-display-s">{luxtory.triad}</p>
        </div>
      </section>

      <section id={BELONGING} data-b2c-surface="white" aria-labelledby={titleOf(BELONGING)}>
        <div className="lx-b2c-split">
          <div className="lx-b2c-split__text lx-b2c-stack">
            <Marker parts={belonging.marker} />
            <h2 id={titleOf(BELONGING)} className="lx-display-m">
              {belonging.title}
            </h2>
            <div>
              <Paragraphs lines={belonging.brands} />
              <ul className="lx-b2c-home__universe">
                {belonging.universe.map((word) => (
                  <li key={word}>{word}</li>
                ))}
              </ul>
            </div>
          </div>
          <figure className="lx-b2c-photo lx-b2c-photo--convivencia">
            {/* eslint-disable-next-line @next/next/no-img-element -- contextual photo already used by Home; decorative, no property or service claim. */}
            <img
              src="/images/home/hero/home-solucao-firepit-family.jpg"
              alt=""
              width={1344}
              height={768}
              loading="lazy"
            />
          </figure>
        </div>
        <div className="lx-b2c-pause" data-b2c-surface="blue">
          <div className="lx-container lx-b2c-stack">
            <p className="lx-display-m">{nb(belonging.place)}</p>
            <div>
              <Paragraphs lines={belonging.text} />
            </div>
            <p className="lx-body">{belonging.arrival}</p>
            <p className="lx-display-s">{belonging.notOnly}</p>
            <p className="lx-body">{belonging.but}</p>
            <p className="lx-b2c-statement__title">
              <em>{belonging.mine}</em>
            </p>
          </div>
        </div>
      </section>

      <section id={PATRIMONY} data-b2c-surface="white" aria-labelledby={titleOf(PATRIMONY)}>
        <div className="lx-b2c-split">
          <figure className="lx-b2c-photo lx-b2c-photo--arquitetura">
            {/* eslint-disable-next-line @next/next/no-img-element -- existing illustrative Home media; not evidence of an Edition or a specific Concept. */}
            <img
              src="/images/home/hero/luxury-property-facade-hero.jpg"
              alt=""
              width={1344}
              height={768}
              loading="lazy"
            />
          </figure>
          <div className="lx-b2c-split__text lx-b2c-stack">
            <Marker parts={patrimony.marker} />
            <h2 id={titleOf(PATRIMONY)} className="lx-display-m">
              <HeadlineText headline={patrimony.title} />
            </h2>
            <p className="lx-body">{patrimony.intro}</p>
            <div>
              <Paragraphs lines={patrimony.text} />
            </div>
          </div>
        </div>
        <div className="lx-container lx-b2c-home__comparison">
          <ModalityPairView pair={patrimony.pair} level={3} editorial />
          <div className="lx-b2c-pause lx-b2c-stack">
            <h3 className="lx-display-s">{patrimony.both.title}</h3>
            <div>
              <Paragraphs lines={patrimony.both.text} />
            </div>
            <p className="lx-display-m">
              <em>{patrimony.both.principle}</em>
            </p>
          </div>
        </div>
      </section>

      <section
        id={FREEDOM}
        className="lx-b2c-section"
        data-b2c-surface="sand"
        aria-labelledby={titleOf(FREEDOM)}
      >
        <div className="lx-container">
          <div className="lx-b2c-stack">
            <Marker parts={freedom.marker} />
            <h2 id={titleOf(FREEDOM)} className="lx-display-m">
              {freedom.title}
            </h2>
            <div>
              <Paragraphs lines={freedom.text} />
            </div>
          </div>
          <ol className="lx-b2c-numbered">
            {freedom.mechanisms.map((mechanism, index) => (
              <li className="lx-b2c-numbered__row" key={mechanism.title}>
                <span className="lx-b2c-numbered__number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="lx-display-s">{mechanism.title}</h3>
                <div className="lx-b2c-home__description">
                  <Paragraphs lines={mechanism.text} />
                </div>
                <a
                  className="lx-b2c-numbered__action"
                  href={discoveryPaths.howItWorks}
                  aria-label={`${text.actions.howItWorks}: ${mechanism.title}`}
                >
                  <Icon name="arrow-right" />
                </a>
              </li>
            ))}
          </ol>
          <p className="lx-display-m lx-b2c-home__turn">
            <HeadlineText headline={freedom.closing} />
          </p>
        </div>
      </section>

      <section
        id={MANAGEMENT}
        className="lx-b2c-section"
        data-b2c-surface="white"
        aria-labelledby={titleOf(MANAGEMENT)}
      >
        <div className="lx-container">
          <div className="lx-b2c-stack">
            <Marker parts={management.marker} />
            <h2 id={titleOf(MANAGEMENT)} className="lx-display-m">
              <HeadlineText headline={management.title} />
            </h2>
            <p className="lx-body">{nb(management.intro)}</p>
            <p className="lx-body">{nb(management.text)}</p>
          </div>
          <ModalityPairView pair={management.pair} level={3} editorial />
          <p className="lx-display-m lx-b2c-home__turn">
            <HeadlineText headline={management.closing} />
          </p>
        </div>
      </section>

      <section
        id={PUSH}
        className="lx-b2c-section lx-b2c-editorial"
        data-b2c-surface="dark-blue"
        aria-labelledby={titleOf(PUSH)}
      >
        <div className="lx-container">
          <div className="lx-b2c-stack">
            <Marker parts={push.marker} />
            <h2 id={titleOf(PUSH)} className="lx-display-m">
              <HeadlineText headline={push.title} />
            </h2>
            <p className="lx-body">{nb(push.intro)}</p>
          </div>
          <ul className="lx-b2c-siblings lx-b2c-siblings--pair">
            {push.promises.map((promise) => (
              <li className="lx-b2c-sibling" key={promise}>
                <p className="lx-display-s">{nb(promise)}</p>
              </li>
            ))}
          </ul>
          <div className="lx-b2c-home__three lx-b2c-home__turn">
            {[triad.patrimony, triad.freedom, triad.belonging].map((line) => (
              <p className="lx-display-s" key={line.lead}>
                <HeadlineText headline={line} />
              </p>
            ))}
          </div>
          <div className="lx-b2c-stack lx-b2c-home__turn">
            <div>
              <Paragraphs lines={push.forWhom} />
            </div>
            <p className="lx-body">{nb(push.next)}</p>
            <CatalogActions cta={cta} next={{}} from="home" />
          </div>
        </div>
      </section>

      <section
        id={FAQ}
        className="lx-b2c-section"
        data-b2c-surface="sand"
        aria-labelledby={titleOf(FAQ)}
      >
        <div className="lx-container">
          <div className="lx-b2c-stack">
            <Marker parts={faq.marker} />
            <h2 id={titleOf(FAQ)} className="lx-display-m">
              {faq.title}
            </h2>
          </div>
          <ol className="lx-b2c-numbered">
            {faq.items.map((item, index) => (
              <li key={item.question}>
                <details className="lx-b2c-numbered__disclosure">
                  <summary className="lx-b2c-numbered__row lx-b2c-home__question">
                    <span className="lx-b2c-numbered__number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="lx-display-s">{item.question}</h3>
                    <span className="lx-b2c-numbered__action" aria-hidden="true">
                      <Icon name="arrow-right" />
                    </span>
                  </summary>
                  <div className="lx-b2c-numbered__answer">
                    <Paragraphs lines={item.answer} />
                  </div>
                </details>
              </li>
            ))}
            <li>
              <details className="lx-b2c-numbered__disclosure">
                <summary className="lx-b2c-numbered__row lx-b2c-home__question">
                  <span className="lx-b2c-numbered__number">
                    {String(faq.items.length + 1).padStart(2, '0')}
                  </span>
                  <h3 className="lx-display-s">{faq.details.question}</h3>
                  <span className="lx-b2c-numbered__action" aria-hidden="true">
                    <Icon name="arrow-right" />
                  </span>
                </summary>
                <div className="lx-b2c-numbered__answer">
                  <p className="lx-body">
                    {faq.details.before}
                    <a className="lx-link" href={discoveryPaths.howItWorks}>
                      {faq.details.link}
                    </a>
                    {faq.details.after}
                  </p>
                </div>
              </details>
            </li>
          </ol>
        </div>
      </section>
    </DiscoverySite>
  );
}
