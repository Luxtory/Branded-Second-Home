import { Icon } from '@/design-system/react';
import { nb } from '../discovery/no-break';
import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { BrandPartnerContactForm } from './contact-form';
import { brandPartnersPaths, BRAND_PARTNERS_HOME_SECTIONS, titleOf } from './paths';
import { AnswerRows, Paragraphs, Rich } from './rich-text';
import { BrandPartnersSite } from './site';

const { hero, problem, promise, mechanism, demand, governance, realization, fit, conversation } =
  text.home;

const [HERO, PROBLEM, PROMISE, MECHANISM, DEMAND, GOVERNANCE, REALIZATION, FIT, CONVERSATION] =
  BRAND_PARTNERS_HOME_SECTIONS;

/**
 * Home Brand Partners `/brand-partner` (REQ-028, spec catalog §14.2; Copy + Especificação Visual FINAL do fundador):
 * PICTURE → PROBLEM → PROMISE → PROOF → PUSH sobre o Core. Sem fotografia B2B autorizada, o Hero é o fallback
 * tipográfico aprovado e nenhuma seção depende de imagem; nada aqui é prova, case ou parceria real.
 */
export function BrandPartnersHomePage() {
  return (
    <BrandPartnersSite current="home">
      {/* H1 — PICTURE: Hero tipográfico em Deep, conteúdo baixo à esquerda; o CTA desce para o PROBLEM. */}
      <section
        id={HERO}
        className="lx-hero lx-hero--typographic"
        data-surface="deep"
        aria-labelledby={titleOf(HERO)}
      >
        <div className="lx-container lx-hero__content">
          <div className="lx-hero__copy">
            <h1 id={titleOf(HERO)} className="lx-statement">
              {hero.title}
            </h1>
            <p className="lx-subheadline">{hero.lead}</p>
            <p className="lx-body">{hero.body}</p>
            <div className="lx-hero__actions">
              <a className="lx-button lx-button--primary lx-button--large" href={`#${PROBLEM}`}>
                {hero.action}
                <Icon name="arrow-right" className="lx-button__icon" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* H2 — PROBLEM: 7/5, a tensão no texto; o espaço negativo à direita é a massa da composição. */}
      <section
        id={PROBLEM}
        className="lx-section"
        data-surface="deep"
        aria-labelledby={titleOf(PROBLEM)}
      >
        <div className="lx-container lx-columns lx-columns--7-5">
          <div className="lx-stack">
            <h2 id={titleOf(PROBLEM)} className="lx-headline">
              {problem.title}
            </h2>
            <Paragraphs lines={problem.paragraphs} />
            <p className="lx-body lx-stack__pause">{problem.closing}</p>
          </div>
          <div aria-hidden="true" />
        </div>
      </section>

      {/* H3 — PROMISE: 6/6 em Sand; o Body A vira a sequência editorial (sem bullets), à direita. */}
      <section
        id={PROMISE}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(PROMISE)}
      >
        <div className="lx-container lx-columns">
          <div className="lx-stack">
            <h2 id={titleOf(PROMISE)} className="lx-headline">
              {promise.title}
            </h2>
            <p className="lx-body">{promise.paragraphs[0]}</p>
            <p className="lx-body lx-stack__pause">
              <Rich value={promise.paragraphs[1]} />
            </p>
          </div>
          <ul className="lx-editorial-list">
            {promise.sequence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* H4 — PROOF · Mecanismo: White, três partes equivalentes (Concept → Edition → Second Home). */}
      <section
        id={MECHANISM}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(MECHANISM)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf(MECHANISM)} className="lx-headline">
              {mechanism.title}
            </h2>
            <p className="lx-subheadline">{mechanism.intro}</p>
          </div>
          <ol className="lx-siblings lx-siblings--trio">
            {mechanism.steps.map((step) => (
              <li className="lx-siblings__item" key={step.title}>
                <h3 className="lx-title">{step.title}</h3>
                <p className="lx-body">
                  <Rich value={step.text} />
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* H5 — PROOF · Demanda: Blue, 5/7; os dois momentos em sequência e o limite em largura ampla, visível. */}
      <section
        id={DEMAND}
        className="lx-section"
        data-surface="blue"
        aria-labelledby={titleOf(DEMAND)}
      >
        <div className="lx-container">
          <div className="lx-columns lx-columns--5-7">
            <div className="lx-stack">
              <h2 id={titleOf(DEMAND)} className="lx-headline">
                {demand.title}
              </h2>
              <p className="lx-subheadline">{demand.intro}</p>
            </div>
            <ol className="lx-siblings">
              {demand.moments.map((moment) => (
                <li className="lx-siblings__item" key={moment.title}>
                  <h3 className="lx-title">{moment.title}</h3>
                  <p className="lx-body">{moment.text}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="lx-section-note">
            <p className="lx-body">{demand.limit}</p>
          </div>
        </div>
      </section>

      {/* H6 — PROOF · Governança e valor: Deep, pergunta | resposta, sempre abertas. */}
      <section
        id={GOVERNANCE}
        className="lx-section"
        data-surface="deep"
        aria-labelledby={titleOf(GOVERNANCE)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf(GOVERNANCE)} className="lx-headline">
              {governance.title}
            </h2>
          </div>
          <AnswerRows answers={governance.answers} />
        </div>
      </section>

      {/* H7 — PROOF · Realização: Sand, 7/5 sem fotografia; o link leva ao Como funciona. */}
      <section
        id={REALIZATION}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(REALIZATION)}
      >
        <div className="lx-container lx-columns lx-columns--7-5">
          <div className="lx-stack">
            <h2 id={titleOf(REALIZATION)} className="lx-headline">
              {realization.title}
            </h2>
            <h3 className="lx-title">{realization.blocks[0].title}</h3>
            <p className="lx-body">{nb(realization.blocks[0].text)}</p>
          </div>
          <div className="lx-stack">
            <h3 className="lx-title">{realization.blocks[1].title}</h3>
            <p className="lx-body">{realization.blocks[1].text}</p>
            <a className="lx-link lx-link--standalone" href={brandPartnersPaths.howItWorks}>
              {realization.link}
              <Icon name="arrow-right" className="lx-link__icon" />
            </a>
          </div>
        </div>
      </section>

      {/* H8 — PUSH · Fit: Blue, coluna editorial; ação primária da superfície e o limite legível. */}
      <section id={FIT} className="lx-section" data-surface="blue" aria-labelledby={titleOf(FIT)}>
        <div className="lx-container">
          <div className="lx-stack lx-stack--editorial">
            <h2 id={titleOf(FIT)} className="lx-headline">
              {fit.title}
            </h2>
            <Paragraphs lines={fit.paragraphs} />
            <div>
              <a className="lx-button lx-button--primary" href={`#${CONVERSATION}`}>
                {fit.action}
              </a>
            </div>
            <p className="lx-body">{fit.limit}</p>
          </div>
        </div>
      </section>

      {/* H9 — PUSH · Conversa: Wash, 5/7; introdução | formulário; finalidade e significado depois do formulário no
          celular e sob a introdução a partir do lg. */}
      <section
        id={CONVERSATION}
        className="lx-section"
        data-surface="wash"
        aria-labelledby={titleOf(CONVERSATION)}
      >
        <div className="lx-container lx-columns lx-columns--aside">
          <div className="lx-stack">
            <h2 id={titleOf(CONVERSATION)} className="lx-headline">
              {conversation.title}
            </h2>
            <Paragraphs lines={conversation.intro} />
          </div>
          <BrandPartnerContactForm
            text={{ form: text.form, submit: conversation.submit, success: conversation.success }}
          />
          <div className="lx-stack">
            <p className="lx-body">{conversation.purpose}</p>
            <p className="lx-body">{conversation.meaning}</p>
          </div>
        </div>
      </section>
    </BrandPartnersSite>
  );
}
