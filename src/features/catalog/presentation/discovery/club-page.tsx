import { Icon, SiteShell } from '@/design-system/react';
import { clubMessages as text } from '../i18n/club-pt-br';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { ActionLink, ordinal, Paragraphs, SplitPhoto } from './parts';
import { discoveryPaths } from './paths';
import styles from './club-page.module.css';

const { hero, steps, exchange, services, control, faq, next } = text;
const sections = { steps: 'como-funciona', exchange: 'luxchange', faq: 'duvidas' } as const;

/** Public explanation of the Club model (catalog §22). */
export function ClubPage() {
  return (
    <SiteShell
      homeHref={discoveryPaths.home}
      labels={discoveryMessages.site}
      navItems={[
        { href: `#${sections.steps}`, label: text.nav.steps, current: false },
        { href: `#${sections.exchange}`, label: text.nav.exchange, current: false },
        { href: `#${sections.faq}`, label: text.nav.faq, current: false },
      ]}
      closingStyle="subtle"
      retractableMenu
    >
      <section id="inicio" data-surface="blue" aria-labelledby="club-titulo">
        <div className="lx-split">
          <div className="lx-split__text">
            <div className="lx-split__inner">
              <h1 id="club-titulo" className={`lx-statement ${styles['lx-club-hero-title']}`}>
                <HeadlineText headline={hero.title} />
              </h1>
              <p className="lx-lead">{hero.text}</p>
              <ActionLink
                href={`#${sections.steps}`}
                label={hero.action}
                icon="arrow-down"
                primary
                large
              />
            </div>
          </div>
          <SplitPhoto
            src="/images/como-funciona/problema-imovel.jpg"
            width={1024}
            height={576}
            crop="lx-crop-x-35"
            alt={hero.photo.alt}
            caption={hero.photo.caption}
            loading="eager"
          />
        </div>
      </section>

      <section
        id={sections.steps}
        className="lx-section"
        data-surface="sand"
        aria-labelledby="etapas-titulo"
        tabIndex={-1}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="etapas-titulo" className="lx-headline">
              <HeadlineText headline={steps.title} />
            </h2>
            <p className={`lx-body ${styles['lx-club-measure']}`}>{steps.intro}</p>
          </div>
          <ol className="lx-numbered" role="list">
            {steps.items.map((step, index) => (
              <li className="lx-numbered__item" key={step.title}>
                <span className="lx-numbered__number lx-ordinal" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-display-s">{step.title}</h3>
                <p className="lx-numbered__text lx-body">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id={sections.exchange}
        className="lx-section"
        data-surface="deep"
        aria-labelledby="luxchange-titulo"
        tabIndex={-1}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="luxchange-titulo" className="lx-headline">
              <HeadlineText headline={exchange.title} />
            </h2>
            <p className={`lx-body ${styles['lx-club-measure']}`}>{exchange.intro}</p>
          </div>
          <div className="lx-stack">
            <div className={`lx-stack ${styles['lx-club-measure']}`}>
              <h3 className="lx-display-s">{exchange.deposit.title}</h3>
              <Paragraphs lines={exchange.deposit.text} />
            </div>
            <div className="lx-stack">
              <h3 className="lx-display-s">{exchange.bookingTitle}</h3>
              <div className="lx-comparison lx-comparison--divided">
                {exchange.methods.map((method) => (
                  <div className="lx-comparison__item lx-stack" key={method.title}>
                    <h4 className="lx-display-m">{method.title}</h4>
                    <p className="lx-subheadline">{method.subtitle}</p>
                    <Paragraphs lines={method.text} />
                  </div>
                ))}
              </div>
              <div className={`lx-stack ${styles['lx-club-measure']}`}>
                <Paragraphs lines={exchange.conditions} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="outras-possibilidades" data-surface="white" aria-labelledby="servicos-titulo">
        <div className="lx-split lx-split--media-start">
          <div className="lx-split__text">
            <div className="lx-split__inner">
              <h2 id="servicos-titulo" className="lx-headline">
                <HeadlineText headline={services.title} />
              </h2>
              {services.items.map((service) => (
                <div className="lx-stack" key={service.title}>
                  <h3 className="lx-display-s">{service.title}</h3>
                  <Paragraphs lines={service.text} />
                </div>
              ))}
            </div>
          </div>
          <SplitPhoto
            src="/images/home/kaizen/kaizen-k05.jpg"
            width={1376}
            height={768}
            crop="lx-crop-x-50"
            alt={services.photo.alt}
            caption={services.photo.caption}
          />
        </div>
      </section>

      <section
        id="condicoes"
        className="lx-section"
        data-surface="sand"
        aria-labelledby="condicoes-titulo"
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="condicoes-titulo" className="lx-headline">
              <HeadlineText headline={control.title} />
            </h2>
          </div>
          <ul className="lx-siblings lx-siblings--trio" role="list">
            {control.items.map((item) => (
              <li className="lx-siblings__item" key={item.title}>
                <h3 className="lx-display-s">{item.title}</h3>
                <p className="lx-body">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id={sections.faq}
        className="lx-section"
        data-surface="white"
        aria-labelledby="duvidas-titulo"
        tabIndex={-1}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="duvidas-titulo" className="lx-headline">
              {faq.title}
            </h2>
          </div>
          <div className="lx-faq lx-faq--start lx-disclosure">
            {faq.items.map(({ question, answer }) => (
              <details className="lx-disclosure__item" key={question}>
                <summary className="lx-disclosure__summary">
                  <span>{question}</span>
                  <Icon name="chevron-right" className="lx-disclosure__icon" />
                </summary>
                <div className="lx-disclosure__body">
                  <p className="lx-body">{answer}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        id="proximo-passo"
        className="lx-section"
        data-surface="blue"
        aria-labelledby="convite-titulo"
      >
        <div className={`lx-container lx-section-closing lx-stack ${styles['lx-club-closing']}`}>
          <h2 id="convite-titulo" className="lx-headline">
            <HeadlineText headline={next.title} />
          </h2>
          <p className="lx-body">{next.text}</p>
          <ActionLink href={`#${sections.faq}`} label={next.action} primary />
        </div>
      </section>
    </SiteShell>
  );
}
