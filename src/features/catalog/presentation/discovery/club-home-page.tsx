import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon, SiteShell } from '@/design-system/react';
import { isPublicSiteOpen, loadEnv } from '@/features/platform';
import { clubHomeMessages as text } from '../i18n/club-home-pt-br';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import styles from './club-home.module.css';
import { HeadlineText } from './headline';
import { HomeHero } from './home-hero';
import { nb } from './no-break';
import { ActionLink, Paragraphs, SplitPhoto } from './parts';
import { discoveryPaths } from './paths';

const { hero, triad, club, mechanics, services, invite, faq } = text;
const sections = { club: 'luxtory', mechanics: 'liberdade', faq: 'duvidas' } as const;

export function generateClubHomeMetadata(): Metadata {
  const env = loadEnv();
  if (!isPublicSiteOpen(env)) notFound();

  const { title, description, siteName } = text.metadata;
  const url = discoveryPaths.home;
  const indexable = env.VERCEL_ENV === 'production';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, siteName, locale: 'pt_BR', type: 'website' },
    twitter: { card: 'summary', title, description },
    robots: { index: indexable, follow: indexable },
  };
}

/** Home pública do Luxtory Club (spec catalog §21). */
export function ClubHomePage() {
  return (
    <div className={styles['lx-club-home']}>
      <SiteShell
        homeHref={discoveryPaths.home}
        labels={discoveryMessages.site}
        navItems={[
          { href: `#${sections.club}`, label: text.nav.club, current: false },
          { href: `#${sections.mechanics}`, label: text.nav.mechanics, current: false },
          { href: `#${sections.faq}`, label: text.nav.faq, current: false },
        ]}
        closingStyle="subtle"
        overlayHeader
        retractableMenu
      >
        <HomeHero
          id="inicio"
          titleId="inicio-titulo"
          title={hero.title}
          text={hero.text}
          action={hero.action}
          nextSectionId={sections.club}
          labels={hero.carousel}
        />

        <section
          id="possibilidade"
          className="lx-section"
          data-surface="blue"
          aria-labelledby="possibilidade-titulo"
        >
          <div className="lx-container lx-triad-comparison">
            <div className="lx-triad-comparison__top">
              <div className="lx-triad-comparison__copy">
                <h2 id="possibilidade-titulo" className="lx-headline">
                  <HeadlineText headline={triad.title} />
                </h2>
                <Paragraphs lines={triad.text} />
              </div>
              <figure className="lx-triad-comparison__diagram">
                {/* eslint-disable-next-line @next/next/no-img-element -- the original SVG is served verbatim. */}
                <img
                  src="/diagrams/core/triade-valor-desejado.svg"
                  alt={triad.diagramAlt}
                  width={723}
                  height={640}
                  loading="lazy"
                />
              </figure>
            </div>
            <ul className="lx-triad-comparison__alternatives" role="list">
              {triad.pillars.map((pillar) => (
                <li className="lx-triad-comparison__alternative" key={pillar.title}>
                  <h3 className="lx-display-m">{pillar.title}</h3>
                  <p className="lx-body">{pillar.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id={sections.club}
          data-surface="sand"
          aria-labelledby="luxtory-titulo"
          tabIndex={-1}
        >
          <div className="lx-split lx-split--media-start lx-split--wide-media">
            <div className="lx-split__text">
              <div className="lx-split__inner">
                <h2 id="luxtory-titulo" className="lx-headline">
                  <HeadlineText headline={club.title} />
                </h2>
                <Paragraphs lines={club.text} />
              </div>
            </div>
            <SplitPhoto
              src="/images/home/kaizen/kaizen-k09.jpg"
              width={1376}
              height={768}
              alt={club.photo.alt}
              caption={club.photo.caption}
              crop="lx-crop-x-35 lx-crop-y-65"
            />
          </div>
        </section>

        <section
          id={sections.mechanics}
          className="lx-section"
          data-surface="deep"
          aria-labelledby="liberdade-titulo"
          tabIndex={-1}
        >
          <div className="lx-container">
            <div className="lx-section-head">
              <h2 id="liberdade-titulo" className="lx-headline">
                <HeadlineText headline={mechanics.title} />
              </h2>
              <p className="lx-body">{mechanics.intro}</p>
            </div>
            <dl className="lx-blocks lx-blocks--rows">
              {mechanics.items.map((item) => (
                <div className="lx-blocks__item" key={item.title}>
                  <dt className="lx-display-m">{item.title}</dt>
                  <dd className="lx-stack">
                    <Paragraphs lines={item.text} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          id="gestao"
          className="lx-section"
          data-surface="sand"
          aria-labelledby="gestao-titulo"
        >
          <div className="lx-container">
            <div className="lx-section-head">
              <h2 id="gestao-titulo" className="lx-headline">
                <HeadlineText headline={services.title} />
              </h2>
            </div>
            <ul className="lx-siblings lx-siblings--trio" role="list">
              {services.items.map((item) => (
                <li className="lx-siblings__item" key={item.title}>
                  <h3 className="lx-display-m">{item.title}</h3>
                  <p className="lx-body">{nb(item.text)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="para-quem" data-surface="deep" aria-labelledby="para-quem-titulo">
          <div className="lx-section">
            <div className="lx-container lx-columns">
              <h2 id="para-quem-titulo" className="lx-headline">
                <HeadlineText headline={invite.title} />
              </h2>
              <p className="lx-body">{invite.text}</p>
            </div>
          </div>
          <div className="lx-hero lx-hero--closing" data-surface="blue">
            <div className="lx-hero__slides" aria-hidden="true">
              <div className="lx-hero__slide" data-active="">
                {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects a style blocked by the CSP. */}
                <img
                  className="lx-hero__image lx-crop-x-80 lx-crop-y-65 lx-crop-lg-x-50 lx-crop-lg-y-65"
                  src="/images/home/hero/home-solucao-firepit-family.jpg"
                  alt=""
                  width={1376}
                  height={768}
                  loading="lazy"
                />
              </div>
            </div>
            <div className="lx-container lx-hero__content">
              <div className="lx-hero__copy">
                <p className="lx-headline">{invite.promise}</p>
                <p className="lx-subheadline">{invite.promiseDetails}</p>
                <ActionLink
                  href={`#${sections.faq}`}
                  label={invite.action}
                  icon="arrow-down"
                  primary
                  large
                />
              </div>
            </div>
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
              {faq.items.map((item) => (
                <details className="lx-disclosure__item" key={item.question}>
                  <summary className="lx-disclosure__summary">
                    <span>{item.question}</span>
                    <Icon name="chevron-right" className="lx-disclosure__icon" />
                  </summary>
                  <div className="lx-disclosure__body">
                    <p className="lx-body">{item.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </SiteShell>
    </div>
  );
}
