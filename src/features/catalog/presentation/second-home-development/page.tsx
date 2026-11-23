import { Icon, SiteShell } from '@/design-system/react';
import { isPublicSiteOpen, isSecondHomePartnersSiteOpen } from '@/features/platform';
import { HeroMedia } from '../brand-partners/media';
import { AnswerRows } from '../brand-partners/rich-text';
import { HeadlineText } from '../discovery/headline';
import { nb } from '../discovery/no-break';
import { ActionLink, Eyebrow, ordinal, Paragraphs, SplitPhoto } from '../discovery/parts';
import { discoveryPaths } from '../discovery/paths';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import { secondHomeDevelopmentMessages as text } from '../i18n/second-home-development-pt-br';
import { secondHomePartnersPaths } from '../second-home-partners/paths';
import { SecondHomeDevelopmentContactForm } from './contact-form';
import styles from './page.module.css';
import { secondHomeDevelopmentPaths } from './paths';

const sections = {
  opening: 'inicio',
  experience: 'brand-experience',
  partners: 'parceiros',
  living: 'para-quem-vive',
  model: 'sob-demanda',
  steps: 'como-funciona',
  roles: 'governanca',
  faq: 'perguntas',
  contact: secondHomeDevelopmentPaths.contact,
} as const;

const titleId = (section: string) => `${section}-titulo`;

function SectionHeading({
  section,
  title,
  intro,
}: {
  readonly section: string;
  readonly title: Parameters<typeof HeadlineText>[0]['headline'];
  readonly intro?: string;
}) {
  return (
    <div className="lx-section-head">
      <h2 id={titleId(section)} className="lx-headline">
        <HeadlineText headline={title} />
      </h2>
      {intro && <p className="lx-body">{nb(intro)}</p>}
    </div>
  );
}

export function SecondHomeDevelopmentPage() {
  const { hero, experience, partners, living, model, steps, roles, faq, contact } = text;
  const questions: readonly {
    readonly question: string;
    readonly answer: string;
    readonly link?: string;
  }[] = isSecondHomePartnersSiteOpen() ? [...faq.items, faq.affiliation] : faq.items;

  return (
    <SiteShell
      homeHref={secondHomeDevelopmentPaths.home}
      labels={discoveryMessages.site}
      navItems={[
        { href: `#${sections.steps}`, label: text.nav.steps, current: false },
        { href: `#${sections.roles}`, label: text.nav.roles, current: false },
        { href: `#${sections.faq}`, label: text.nav.questions, current: false },
        { href: `#${sections.contact}`, label: text.nav.contact, current: false, action: true },
      ]}
      navAlign="end"
      menuTrigger="mark"
      overlayHeader
      titleRole="headline"
      typeCeiling="home-hero"
    >
      <section
        id={sections.opening}
        className="lx-hero lx-hero--uniform lx-bp-opening"
        data-surface="blue"
        aria-labelledby={titleId(sections.opening)}
      >
        <HeroMedia slot="m4" priority />
        <div className="lx-container lx-hero__content">
          <div className="lx-hero__copy">
            <Eyebrow>{hero.name}</Eyebrow>
            <h1 id={titleId(sections.opening)} className="lx-headline lx-headline--home-hero">
              <HeadlineText headline={hero.title} />
            </h1>
            <Paragraphs lines={hero.paragraphs} />
            <div className="lx-hero__actions">
              <ActionLink
                href={`#${sections.contact}`}
                label={hero.action}
                primary
                icon="arrow-down"
              />
            </div>
            <p className="lx-caption">{text.illustration}</p>
          </div>
        </div>
      </section>

      <section
        id={sections.experience}
        className="lx-section"
        data-surface="wash"
        aria-labelledby={titleId(sections.experience)}
      >
        <div className="lx-split">
          <div className="lx-split__text">
            <div className="lx-split__inner lx-stack">
              <SectionHeading section={sections.experience} title={experience.title} />
              <Paragraphs lines={experience.paragraphs} />
              <div className="lx-equation" data-surface="deep">
                <p className="lx-equation__term lx-display-s">{experience.equation.first}</p>
                <p className="lx-equation__operator lx-display-s">+</p>
                <p className="lx-equation__term lx-display-s">{experience.equation.second}</p>
                <p className="lx-equation__term lx-equation__result lx-display-s">
                  {experience.equation.result}
                </p>
              </div>
            </div>
          </div>
          <SplitPhoto
            src="/images/home/hero/home-solucao-firepit-family.jpg"
            width={1376}
            height={768}
            crop="lx-crop-x-65"
            alt={experience.photoAlt}
            caption={text.illustration}
          />
        </div>
      </section>

      <section
        id={sections.partners}
        className="lx-section"
        data-surface="deep"
        aria-labelledby={titleId(sections.partners)}
      >
        <div className="lx-container">
          <SectionHeading section={sections.partners} title={partners.title} />
          <ul className={`lx-siblings lx-siblings--trio ${styles.partnerCards}`} role="list">
            {partners.items.map((partner) => (
              <li key={partner.title} className="lx-siblings__item lx-stack">
                <h3 className="lx-display-m">{partner.title}</h3>
                <Paragraphs lines={partner.paragraphs} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id={sections.living}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleId(sections.living)}
      >
        <div className="lx-container">
          <SectionHeading section={sections.living} title={living.title} />
          <ul className="lx-siblings lx-siblings--trio" role="list">
            {living.items.map((item) => (
              <li key={item.title} className="lx-siblings__item">
                <h3 className="lx-display-m">{item.title}</h3>
                <p className="lx-body">{nb(item.text)}</p>
              </li>
            ))}
          </ul>
          <div className="lx-section-group lx-stack">
            <h3 className="lx-display-s">{living.acquisitionTitle}</h3>
            <div className="lx-comparison lx-comparison--divided">
              {living.modalities.map((item) => (
                <div key={item.title} className="lx-comparison__item lx-stack">
                  <h4 className="lx-display-m">{item.title}</h4>
                  <Paragraphs lines={item.paragraphs} />
                </div>
              ))}
            </div>
            <Paragraphs lines={[living.commitments, ...living.club]} />
            {isPublicSiteOpen() && (
              <ActionLink href={discoveryPaths.howItWorks} label={living.clubLink} />
            )}
          </div>
        </div>
      </section>

      <section
        id={sections.model}
        className="lx-section"
        data-surface="blue"
        aria-labelledby={titleId(sections.model)}
      >
        <div className="lx-container">
          <SectionHeading section={sections.model} title={model.title} intro={model.intro} />
          <div className="lx-comparison lx-comparison--divided">
            {model.items.map((item) => (
              <div key={item.title} className="lx-comparison__item lx-stack">
                <h3 className="lx-display-m">{item.title}</h3>
                <Paragraphs lines={item.paragraphs} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id={sections.steps}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleId(sections.steps)}
      >
        <div className="lx-container">
          <SectionHeading section={sections.steps} title={steps.title} intro={steps.intro} />
          <ol className="lx-numbered" role="list">
            {steps.items.map((step, index) => (
              <li className="lx-numbered__item" key={step.title}>
                <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-display-s">{step.title}</h3>
                <div className="lx-numbered__text">
                  <Paragraphs lines={step.paragraphs} />
                </div>
              </li>
            ))}
          </ol>
          <div className="lx-section-group lx-stack">
            <Paragraphs lines={steps.note} />
          </div>
        </div>
      </section>

      <section
        id={sections.roles}
        className="lx-section"
        data-surface="deep"
        aria-labelledby={titleId(sections.roles)}
      >
        <div className="lx-container">
          <SectionHeading section={sections.roles} title={roles.title} />
          <AnswerRows answers={roles.items} />
          <div className="lx-section-group lx-stack">
            <Paragraphs lines={roles.contract} />
          </div>
        </div>
      </section>

      <section
        id={sections.faq}
        className="lx-section"
        data-surface="wash"
        aria-labelledby={titleId(sections.faq)}
      >
        <div className="lx-container lx-columns lx-columns--5-7">
          <SectionHeading section={sections.faq} title={faq.title} />
          <div className="lx-faq lx-faq--start lx-disclosure">
            {questions.map(({ question, answer, link }) => (
              <details className="lx-disclosure__item" key={question}>
                <summary className="lx-disclosure__summary">
                  <span>{nb(question)}</span>
                  <Icon name="chevron-right" className="lx-disclosure__icon" />
                </summary>
                <div className="lx-disclosure__body">
                  <p className="lx-body">{nb(answer)}</p>
                  {link && <ActionLink href={secondHomePartnersPaths.home} label={link} />}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        id={sections.contact}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleId(sections.contact)}
      >
        <div className="lx-container lx-columns lx-columns--5-7">
          <div className="lx-stack">
            <SectionHeading
              section={sections.contact}
              title={contact.title}
              intro={contact.intro}
            />
            <p className="lx-body">{contact.privacy}</p>
          </div>
          <SecondHomeDevelopmentContactForm />
        </div>
      </section>
    </SiteShell>
  );
}
