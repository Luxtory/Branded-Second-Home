import { Icon } from '@/design-system/react';
import { HeadlineText } from '../discovery/headline';
import { nb } from '../discovery/no-break';
import { ActionLink, Eyebrow, ordinal } from '../discovery/parts';
import { secondHomePartnersMessages as text } from '../i18n/second-home-partners-pt-br';
import { SecondHomePartnerContactForm } from './contact-form';
import { SECOND_HOME_PARTNERS_SECTIONS, titleOf } from './paths';
import { SecondHomePartnersSite } from './site';

const { hero, opportunity, benefits, club, process, faq, conversation } = text;

const [HERO, OPPORTUNITY, BENEFITS, CLUB, PROCESS, FAQ, CONVERSATION] =
  SECOND_HOME_PARTNERS_SECTIONS;

/** Parágrafos da copy, um `<p>` por item, com os termos compostos (Second Home…) sem quebra. */
function Paragraphs({ lines }: { readonly lines: readonly string[] }) {
  return lines.map((line) => (
    <p className="lx-body" key={line}>
      {nb(line)}
    </p>
  ));
}

/**
 * Página Second Home Partners `/second-home-partner` (REQ-105, spec catalog §20.2): PICTURE → PROBLEM → PROMISE → PROOF
 * (Luxtory Club, processo, perguntas) → PUSH sobre o Core. Três benefícios com o mesmo peso, incluindo a participação
 * nos resultados (`D-SHP-07`). Nada aqui é prova, case ou parceria real; o Luxtory Club aparece só como modelo previsto.
 */
export function SecondHomePartnersHomePage() {
  return (
    <SecondHomePartnersSite>
      {/* PICTURE — Hero tipográfico (Deep, `D-SHP-06`): valor, liberdade e a nota do programa sem rolagem. */}
      <section
        id={HERO}
        className="lx-hero lx-hero--typographic"
        data-surface="deep"
        aria-labelledby={titleOf(HERO)}
      >
        <div className="lx-container lx-hero__content">
          <div className="lx-hero__copy">
            <Eyebrow>{hero.marker}</Eyebrow>
            <h1 id={titleOf(HERO)} className="lx-headline lx-headline--home-hero">
              <HeadlineText headline={hero.title} />
            </h1>
            <p className="lx-body">{hero.body}</p>
            <div className="lx-hero__actions">
              <ActionLink href={`#${CONVERSATION}`} label={hero.action} primary large />
              <ActionLink href={`#${OPPORTUNITY}`} label={hero.secondary} icon="arrow-down" />
            </div>
            <p className="lx-compact">{hero.note}</p>
          </div>
        </div>
      </section>

      {/* PROBLEM — White: o benefício para o cliente vira argumento de venda; "acelerar" é hipótese (`H-SHP-01`). */}
      <section
        id={OPPORTUNITY}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(OPPORTUNITY)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{opportunity.marker}</Eyebrow>
            <h2 id={titleOf(OPPORTUNITY)} className="lx-headline">
              <HeadlineText headline={opportunity.title} />
            </h2>
          </div>
          <div className="lx-stack lx-stack--editorial">
            <Paragraphs lines={opportunity.paragraphs} />
          </div>
        </div>
      </section>

      {/* PROMISE — Wash: os três benefícios, com o mesmo peso, e o limite legível. */}
      <section
        id={BENEFITS}
        className="lx-section"
        data-surface="wash"
        aria-labelledby={titleOf(BENEFITS)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{benefits.marker}</Eyebrow>
            <h2 id={titleOf(BENEFITS)} className="lx-headline">
              <HeadlineText headline={benefits.title} />
            </h2>
            <p className="lx-subheadline">{benefits.intro}</p>
          </div>
          <ul className="lx-siblings lx-siblings--trio">
            {benefits.items.map((item) => (
              <li className="lx-siblings__item" key={item.title}>
                <h3 className="lx-display-s">{item.title}</h3>
                <p className="lx-body">{item.text}</p>
              </li>
            ))}
          </ul>
          <div className="lx-section-note">
            <p className="lx-body">{benefits.note}</p>
          </div>
        </div>
      </section>

      {/* PROOF — White: como o Luxtory Club deve funcionar, em linhas rótulo + texto; nada disponível hoje. */}
      <section
        id={CLUB}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(CLUB)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{club.marker}</Eyebrow>
            <h2 id={titleOf(CLUB)} className="lx-headline">
              <HeadlineText headline={club.title} />
            </h2>
            <p className="lx-subheadline">{nb(club.intro)}</p>
          </div>
          <div className="lx-answers">
            {club.items.map((item) => (
              <div className="lx-answers__row" key={item.label}>
                <h3 className="lx-answers__label lx-display-s">{item.label}</h3>
                <div className="lx-answers__content">
                  <p className="lx-body">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="lx-section-note">
            <p className="lx-body">{club.note}</p>
          </div>
        </div>
      </section>

      {/* PROOF — Blue: as quatro etapas reais, em ordem, e o CTA único. */}
      <section
        id={PROCESS}
        className="lx-section"
        data-surface="blue"
        aria-labelledby={titleOf(PROCESS)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{process.marker}</Eyebrow>
            <h2 id={titleOf(PROCESS)} className="lx-headline">
              <HeadlineText headline={process.title} />
            </h2>
          </div>
          <div className="lx-stack">
            <ol className="lx-steps lx-steps--four">
              {process.steps.map((step, index) => (
                <li className="lx-steps__item" key={step.title}>
                  <span className="lx-ordinal" aria-hidden="true">
                    {ordinal(index)}
                  </span>
                  <h3 className="lx-display-s">{step.title}</h3>
                  <p className="lx-body">{step.text}</p>
                </li>
              ))}
            </ol>
            <div>
              <ActionLink href={`#${CONVERSATION}`} label={process.action} primary large />
            </div>
          </div>
        </div>
      </section>

      {/* PROOF — Wash: objeções em disclosures nativos. */}
      <section id={FAQ} className="lx-section" data-surface="wash" aria-labelledby={titleOf(FAQ)}>
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf(FAQ)} className="lx-headline">
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
                  <p className="lx-body">{nb(item.answer)}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* PUSH · Conversa — White, 5/7: introdução | formulário; aviso e privacidade depois do formulário no celular e
          sob a introdução a partir do lg. */}
      <section
        id={CONVERSATION}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(CONVERSATION)}
      >
        <div className="lx-container lx-columns lx-columns--aside">
          <div className="lx-stack">
            <Eyebrow>{conversation.marker}</Eyebrow>
            <h2 id={titleOf(CONVERSATION)} className="lx-headline">
              {conversation.title}
            </h2>
            <p className="lx-body">{conversation.intro}</p>
          </div>
          <SecondHomePartnerContactForm
            text={{ form: text.form, submit: conversation.submit, success: conversation.success }}
          />
          <div className="lx-stack">
            <p className="lx-body">{conversation.notice}</p>
            <p className="lx-body">{conversation.privacy}</p>
          </div>
        </div>
      </section>
    </SecondHomePartnersSite>
  );
}
