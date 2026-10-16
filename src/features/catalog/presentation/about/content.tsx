import { ActionLink, Eyebrow } from '../discovery/parts';
import { Paragraphs } from '../brand-partners/rich-text';
import { aboutMessages as text } from '../i18n/about-pt-br';
import { aboutContext, type AboutJourney } from './context';

const { hero, history, purpose, founder, invitation } = text.content;

/** Static institutional body shared by the two journeys (catalog §15); each route owns its shell and gate. */
export function AboutContent({ journey }: { readonly journey: AboutJourney }) {
  const { howItWorks } = aboutContext(journey);
  return (
    <div className="lx-about lx-closings-subtle">
      <section id="sobre" className="lx-section" data-surface="blue" aria-labelledby="sobre-titulo">
        <div className="lx-container">
          <div className="lx-pause lx-pause--opening">
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <h1 id="sobre-titulo" className="lx-headline">
              {hero.title}
            </h1>
            <p className="lx-subheadline">{hero.lead}</p>
            <ActionLink href={howItWorks} label={hero.action} primary />
          </div>
        </div>
      </section>

      <section
        id="historia"
        className="lx-section"
        data-surface="white"
        aria-labelledby="historia-titulo"
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{history.eyebrow}</Eyebrow>
            <h2 id="historia-titulo" className="lx-headline">
              {history.title}
            </h2>
          </div>
          <div className="lx-answers">
            {history.acts.map((act) => (
              <div className="lx-answers__row" key={act.title}>
                <h3 className="lx-answers__label lx-display-s">{act.title}</h3>
                <div className="lx-answers__content lx-stack">
                  <Paragraphs lines={act.paragraphs} />
                </div>
              </div>
            ))}
          </div>
          <div className="lx-section-closing lx-stack">
            <p className="lx-headline">{history.closing}</p>
            <div className="lx-actions-stack">
              <ActionLink href={howItWorks} label={history.action} />
            </div>
          </div>
        </div>
      </section>

      <section
        id="o-que-nos-move"
        className="lx-section"
        data-surface="sand"
        aria-labelledby="valores-titulo"
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{purpose.eyebrow}</Eyebrow>
            <h2 id="valores-titulo" className="lx-headline">
              {purpose.title}
            </h2>
          </div>
          <ul className="lx-siblings lx-siblings--trio">
            {purpose.values.map((value) => (
              <li className="lx-siblings__item" key={value.title}>
                <h3 className="lx-display-s">{value.title}</h3>
                <p className="lx-body">{value.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="fundador"
        className="lx-section"
        data-surface="deep"
        aria-labelledby="fundador-titulo"
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="fundador-titulo" className="lx-headline">
              {founder.title}
            </h2>
          </div>
          <figure className="lx-columns lx-about__founder">
            <div className="lx-about__portrait">
              {/* eslint-disable-next-line @next/next/no-img-element -- Local original with intrinsic dimensions; Next/Image inline styles are blocked by the project's CSP. */}
              <img
                src="/images/about/marcos-rodopiano.jpg"
                alt={text.photoAlt}
                width={884}
                height={990}
                loading="lazy"
              />
            </div>
            <div className="lx-stack">
              <blockquote className="lx-about__quote">
                <p>{founder.quote}</p>
              </blockquote>
              <figcaption className="lx-body">{founder.signature}</figcaption>
            </div>
          </figure>
        </div>
      </section>

      <section
        id="convite"
        className="lx-section"
        data-surface="blue"
        aria-labelledby="convite-titulo"
      >
        <div className="lx-container">
          <div className="lx-section-closing lx-stack lx-about__invitation">
            <h2 id="convite-titulo" className="lx-headline">
              {invitation.title}
            </h2>
            <p className="lx-subheadline">{invitation.lead}</p>
            <div className="lx-actions-stack">
              <ActionLink href={howItWorks} label={invitation.action} primary />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
