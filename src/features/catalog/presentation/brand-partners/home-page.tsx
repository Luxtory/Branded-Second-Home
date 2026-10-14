import { HeadlineText } from '../discovery/headline';
import { ActionLink, Eyebrow, ordinal } from '../discovery/parts';
import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { BrandPartnerContactForm } from './contact-form';
import { HeroMedia, SplitMedia } from './media';
import { brandPartnersPaths, BRAND_PARTNERS_HOME_SECTIONS, titleOf } from './paths';
import { AnswerRows, Paragraphs, Rich } from './rich-text';
import { BrandPartnersSite } from './site';

const { hero, problem, promise, brand, living, mechanism, governance, fit, conversation } =
  text.home;

const [HERO, PROBLEM, PROMISE, BRAND, LIVING, MECHANISM, GOVERNANCE, FIT, CONVERSATION] =
  BRAND_PARTNERS_HOME_SECTIONS;

/** Um grupo de benefícios da marca: o rótulo diz a natureza (possibilidade ou mecanismo), os itens têm o mesmo peso. */
function BenefitGroup({
  group,
  layout,
}: {
  readonly group: typeof brand.possibilities | typeof brand.mechanisms;
  readonly layout: 'pair' | 'trio';
}) {
  return (
    <div className="lx-section-group">
      <h3 className="lx-eyebrow">{group.label}</h3>
      <ul className={`lx-siblings lx-siblings--${layout}`}>
        {group.items.map((item) => (
          <li className="lx-siblings__item" key={item.title}>
            <h4 className="lx-display-s">{item.title}</h4>
            <Paragraphs lines={item.text} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Fórmula de valor (`D-BP-25`): card Deep com texto Warm Sand em itálico, um + entre as premissas e a régua antes
 * do resultado. As três frases mantêm a escala de heading interno (`lx-display-s`).
 */
function ValueEquation({ equation }: { readonly equation: typeof promise.equation }) {
  const [moment, place] = equation.premises;
  return (
    <div className="lx-equation" data-surface="deep">
      <p className="lx-equation__term lx-display-s">
        <span>{moment}</span>
      </p>
      <p className="lx-equation__operator lx-display-s">{equation.plus}</p>
      <p className="lx-equation__term lx-display-s">
        <span>{place}</span>
      </p>
      <p className="lx-equation__term lx-equation__result lx-display-s">
        <span>{equation.result}</span>
      </p>
    </div>
  );
}

/**
 * Home Brand Partners `/brand-partner` (REQ-028; BP1.1, spec catalog §14.9, `D-BP-15`): PICTURE → PROBLEM → PROMISE →
 * Para a sua marca → Para quem vive → mecanismo → governança → PUSH sobre o Core. Fotografia M1–M5 pelo manifesto de
 * mídia (placeholder estrutural até o ensaio aprovado); nada aqui é prova, case ou parceria real.
 */
export function BrandPartnersHomePage() {
  return (
    <BrandPartnersSite current="home">
      {/* PICTURE — Cinematic Hero (M1): o valor para quem vive e para a marca já nos primeiros segundos. */}
      <section
        id={HERO}
        className="lx-hero lx-hero--uniform"
        data-surface="blue"
        aria-labelledby={titleOf(HERO)}
      >
        <HeroMedia slot="m1" priority />
        <div className="lx-container lx-hero__content">
          <div className="lx-hero__copy">
            <Eyebrow>{hero.marker}</Eyebrow>
            <h1 id={titleOf(HERO)} className="lx-headline lx-headline--home-hero">
              <HeadlineText headline={hero.title} />
            </h1>
            <Paragraphs lines={hero.body} />
            <div className="lx-hero__actions">
              <ActionLink href={`#${PROBLEM}`} label={hero.action} primary icon="arrow-down" />
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM — Blue: a lacuna da Brand Experience em duas perspectivas; o fechamento nomeia o que falta, sem ainda
          nomear a solução (`D-BP-20`). */}
      <section
        id={PROBLEM}
        className="lx-section"
        data-surface="blue"
        aria-labelledby={titleOf(PROBLEM)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{problem.marker}</Eyebrow>
            <h2 id={titleOf(PROBLEM)} className="lx-headline">
              <HeadlineText headline={problem.title} />
            </h2>
            <Paragraphs lines={problem.paragraphs} />
          </div>
          <div className="lx-comparison lx-comparison--divided">
            {problem.sides.map((side) => (
              <div className="lx-comparison__item" key={side.title}>
                <p className="lx-eyebrow">{side.label}</p>
                <h3 className="lx-display-s">{side.title}</h3>
                <Paragraphs lines={side.text} />
              </div>
            ))}
          </div>
          <div className="lx-section-closing lx-stack">
            <p className="lx-subheadline">{problem.closing.lead}</p>
            <p className="lx-headline">{problem.closing.statement}</p>
          </div>
        </div>
      </section>

      {/* PROMISE — Sand, sem fotografia: eyebrow e Headline no topo; texto corrido à esquerda e o card da fórmula
          centrado verticalmente ao lado dele (`D-BP-25`); no celular, introdução → fórmula → texto.
          A primeira seção que nomeia Branded Second Home e Home Concept. */}
      <section
        id={PROMISE}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(PROMISE)}
      >
        <div className="lx-container lx-columns lx-columns--aside-text">
          <div className="lx-stack">
            <Eyebrow>{promise.marker}</Eyebrow>
            <h2 id={titleOf(PROMISE)} className="lx-headline">
              <HeadlineText headline={promise.title} />
            </h2>
          </div>
          <p className="lx-body">{promise.intro}</p>
          <ValueEquation equation={promise.equation} />
          <div className="lx-stack">
            <Paragraphs lines={promise.body} />
          </div>
        </div>
      </section>

      {/* Para a sua marca — Deep: escada da relação, cadeia causal, possibilidades × mecanismos. */}
      <section
        id={BRAND}
        className="lx-section"
        data-surface="deep"
        aria-labelledby={titleOf(BRAND)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{brand.marker}</Eyebrow>
            <h2 id={titleOf(BRAND)} className="lx-headline">
              <HeadlineText headline={brand.title} />
            </h2>
            <p className="lx-subheadline">{brand.intro}</p>
          </div>
          <ol className="lx-steps lx-steps--four">
            {brand.ladder.map((step, index) => (
              <li className="lx-steps__item" key={step.title}>
                <span className="lx-ordinal" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-display-s">{step.title}</h3>
                <p className="lx-body">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="lx-section-closing lx-stack">
            <p className="lx-subheadline">{brand.chain.lead}</p>
            <p className="lx-headline">{brand.chain.statement}</p>
            <p className="lx-subheadline">{brand.chain.consequence}</p>
          </div>
          <BenefitGroup group={brand.possibilities} layout="pair" />
          <BenefitGroup group={brand.mechanisms} layout="trio" />
        </div>
      </section>

      {/* Para quem vive — Blue: M2 no início; a frase de abertura dos pilares; os três pilares ao lado do diagrama de
          solução no tamanho de referência da Home B2C, com o topo no 01 (`--reference`); e o fechamento. */}
      <section
        id={LIVING}
        className="lx-section-split"
        data-surface="blue"
        aria-labelledby={titleOf(LIVING)}
      >
        <div className="lx-split lx-split--media-start lx-split--wide-media">
          <div className="lx-split__text">
            <div className="lx-split__inner">
              <Eyebrow>{living.marker}</Eyebrow>
              <h2 id={titleOf(LIVING)} className="lx-headline">
                <HeadlineText headline={living.title} />
              </h2>
              <p className="lx-body">{living.intro}</p>
            </div>
          </div>
          <SplitMedia slot="m2" />
        </div>
        <div className="lx-container">
          <div className="lx-stack">
            <p className="lx-subheadline">{living.lead}</p>
            <div className="lx-diagram lx-diagram--reference">
              <div className="lx-stack">
                {living.pillars.map((pillar, index) => (
                  <div className="lx-stack lx-diagram__item" key={pillar.name}>
                    <p className="lx-eyebrow">
                      {ordinal(index)} · {pillar.name}
                    </p>
                    <h3 className="lx-display-s">{pillar.title}</h3>
                    <Paragraphs lines={pillar.text} />
                  </div>
                ))}
              </div>
              <figure className="lx-diagram__figure">
                {/* eslint-disable-next-line @next/next/no-img-element -- the original SVG is served verbatim (geometry preserved, CSP). */}
                <img
                  src="/diagrams/core/diagrama-solucao-luxtory.svg"
                  alt={text.media.solutionDiagram}
                  width={667}
                  height={748}
                  loading="lazy"
                />
              </figure>
            </div>
          </div>
          <div className="lx-section-closing lx-stack">
            <p className="lx-subheadline">{living.closing.lead}</p>
            <p className="lx-headline">{living.closing.statement}</p>
          </div>
        </div>
      </section>

      {/* Como acontece — White: do Brand DNA à Second Home em seis passos; o link aprofunda no Como funciona. */}
      <section
        id={MECHANISM}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(MECHANISM)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{mechanism.marker}</Eyebrow>
            <h2 id={titleOf(MECHANISM)} className="lx-headline">
              <Rich value={mechanism.title} />
            </h2>
            <p className="lx-subheadline">{mechanism.intro}</p>
          </div>
          <div className="lx-stack">
            <ol className="lx-numbered">
              {mechanism.steps.map((step, index) => (
                <li className="lx-numbered__item" key={step.title}>
                  <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                    {ordinal(index)}
                  </span>
                  <h3 className="lx-display-s">
                    <Rich value={step.title} />
                  </h3>
                  <div className="lx-numbered__text lx-stack">
                    <Paragraphs lines={step.text} />
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <ActionLink
                href={`${brandPartnersPaths.howItWorks}#percurso`}
                label={mechanism.link}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Governança — Sand: pergunta | resposta, sempre abertas; o link leva à governança em detalhe. */}
      <section
        id={GOVERNANCE}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(GOVERNANCE)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{governance.marker}</Eyebrow>
            <h2 id={titleOf(GOVERNANCE)} className="lx-headline">
              <HeadlineText headline={governance.title} />
            </h2>
          </div>
          <div className="lx-stack">
            <AnswerRows answers={governance.answers} />
            <div>
              <ActionLink
                href={`${brandPartnersPaths.howItWorks}#governanca`}
                label={governance.link}
              />
            </div>
          </div>
        </div>
      </section>

      {/* PUSH — Cinematic de fechamento (M5): fit, o CTA para o formulário e o limite legível. */}
      <section
        id={FIT}
        className="lx-hero lx-hero--closing lx-hero--uniform"
        data-surface="blue"
        aria-labelledby={titleOf(FIT)}
      >
        <HeroMedia slot="m5" />
        <div className="lx-container lx-hero__content">
          <div className="lx-hero__copy">
            <Eyebrow>{fit.marker}</Eyebrow>
            <h2 id={titleOf(FIT)} className="lx-headline">
              {fit.title}
            </h2>
            <p className="lx-subheadline">{fit.paragraphs[0]}</p>
            <Paragraphs lines={fit.paragraphs.slice(1)} />
            <div className="lx-hero__actions">
              <ActionLink href={`#${CONVERSATION}`} label={fit.action} primary large />
            </div>
            <p className="lx-body">{fit.limit}</p>
          </div>
        </div>
      </section>

      {/* PUSH · Conversa — Wash, 5/7; introdução | formulário; finalidade e significado depois do formulário no
          celular e sob a introdução a partir do lg. */}
      <section
        id={CONVERSATION}
        className="lx-section"
        data-surface="wash"
        aria-labelledby={titleOf(CONVERSATION)}
      >
        <div className="lx-container lx-columns lx-columns--aside">
          <div className="lx-stack">
            <Eyebrow>{conversation.marker}</Eyebrow>
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
