import { Icon } from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { HomeHero } from './home-hero';
import { nb } from './no-break';
import { Eyebrow, ModalityComparison, ordinal, Paragraphs } from './parts';
import { discoveryPaths, HOME_SECTIONS } from './paths';
import { readAvailability } from './read';
import { RulePanel } from './rule-panel';
import { DiscoverySite } from './site';

const { home, triad, values } = text;
const { media, hero, renunciation, rule, possibility, luxtory, belonging, patrimony } = home;
const { freedom, management, push, faq } = home;

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

/** O título nomeia a seção; a seção leva a âncora. */
const titleOf = (section: string) => `${section}-titulo`;

/** Fotografia estrutural de um Editorial Split: preenche a sua metade; recorte por classes (a CSP bloqueia `style`). */
function SplitPhoto({
  src,
  width,
  height,
  alt,
  crop,
  caption,
}: {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly crop: string;
  readonly caption?: string;
}) {
  return (
    <figure className="lx-media lx-split__media">
      {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */}
      <img className={crop} src={src} alt={alt} width={width} height={height} loading="lazy" />
      {caption === undefined ? null : (
        <figcaption className="lx-media__caption">{caption}</figcaption>
      )}
    </figure>
  );
}

/**
 * Home `/` (spec catalog §13.10 — Especificação Visual Final do fundador sobre o Core Design System): a copy do
 * fundador (D-B2C-18, D-B2C-19), Unaware → Product Aware. PICTURE = Cinematic Hero sem ação comercial; PUSH com o CTA
 * por disponibilidade (D-B2C-16) sobre a fotografia de fechamento.
 */
export async function HomePage() {
  const cta = catalogCta(await readAvailability());
  return (
    <DiscoverySite current="home">
      {/* 01 — PICTURE: lifestyle com pessoas e arquitetura; conteúdo baixo, à esquerda. */}
      <HomeHero
        id={HERO}
        titleId={titleOf(HERO)}
        title={hero.title}
        text={hero.text}
        action={hero.action}
        nextSectionId={RENUNCIATION}
        labels={hero.carousel}
      />

      {/* 02 — PROBLEM: texto + Tríade de valor em cima (7/5), as três alternativas embaixo. */}
      <section
        id={RENUNCIATION}
        className="lx-section"
        data-surface="blue"
        aria-labelledby={titleOf(RENUNCIATION)}
      >
        <div className="lx-container lx-triad-comparison">
          <div className="lx-triad-comparison__top">
            <div className="lx-triad-comparison__copy">
              <Eyebrow accent>{renunciation.marker}</Eyebrow>
              <h2 id={titleOf(RENUNCIATION)} className="lx-headline">
                {renunciation.title.lead.trim()}
                <br />
                <em>{renunciation.title.turn}</em>
              </h2>
              <p className="lx-body">{nb(renunciation.intro)}</p>
              <p className="lx-body">{nb(renunciation.tension)}</p>
            </div>
            <figure className="lx-triad-comparison__diagram">
              {/* eslint-disable-next-line @next/next/no-img-element -- the original SVG is served verbatim (geometry preserved, CSP). */}
              <img
                src="/diagrams/core/triade-valor-desejado.svg"
                alt={renunciation.diagramAlt}
                width={723}
                height={640}
              />
            </figure>
          </div>
          <ol
            className="lx-triad-comparison__alternatives"
            aria-label={renunciation.alternativesLabel}
          >
            {renunciation.alternatives.map((alternative, index) => (
              <li className="lx-triad-comparison__alternative" key={alternative.title}>
                <span className="lx-ordinal" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-display-m">{nb(alternative.title)}</h3>
                <Paragraphs lines={alternative.text} />
              </li>
            ))}
          </ol>
          <div className="lx-section-closing lx-stack">
            <Paragraphs lines={renunciation.closing} className="lx-subheadline" />
            <p className="lx-headline">{renunciation.closingTurn}</p>
          </div>
        </div>
      </section>

      {/* 03 — Quando abrir mão vira regra: copy (5) + Panel Switch (7); fechamento nas 12 colunas. */}
      <section id={RULE} className="lx-section" data-surface="deep" aria-labelledby={titleOf(RULE)}>
        <div className="lx-container">
          <div className="lx-columns lx-columns--5-7">
            <div className="lx-stack">
              <Eyebrow>{rule.marker}</Eyebrow>
              <h2 id={titleOf(RULE)} className="lx-headline">
                {rule.title}
              </h2>
              <Paragraphs lines={rule.text} />
            </div>
            <RulePanel />
          </div>
          <div className="lx-section-closing lx-stack">
            <p className="lx-subheadline">{rule.closing[0]}</p>
            <p className="lx-headline">{rule.closing[1]}</p>
          </div>
        </div>
      </section>

      {/* 04 — PROMISE: copy + Diagrama de solução (6/6); Triad Statement embaixo. */}
      <section
        id={POSSIBILITY}
        className="lx-section"
        data-surface="blue"
        aria-labelledby={titleOf(POSSIBILITY)}
      >
        <div className="lx-container">
          <div className="lx-diagram lx-diagram--even">
            <div className="lx-stack">
              <Eyebrow accent>{possibility.marker}</Eyebrow>
              <h2 id={titleOf(POSSIBILITY)} className="lx-headline">
                <HeadlineText headline={possibility.title} />
              </h2>
              <Paragraphs lines={possibility.imagine} />
              <Paragraphs lines={possibility.values} />
            </div>
            <figure className="lx-diagram__figure">
              {/* eslint-disable-next-line @next/next/no-img-element -- the original SVG is served verbatim (geometry preserved, CSP). */}
              <img
                src="/diagrams/core/diagrama-solucao-luxtory.svg"
                alt={media.solutionDiagram}
                width={667}
                height={748}
              />
            </figure>
          </div>
          <div className="lx-triad-statement">
            <ol className="lx-triad-statement__cells" aria-label={possibility.triad}>
              {[values.patrimony, values.freedom, values.belonging].map((value, index) => (
                <li className="lx-triad-statement__cell" key={value}>
                  <span className="lx-ordinal" aria-hidden="true">
                    {ordinal(index)}
                  </span>
                  <span className="lx-triad-statement__word">{value}</span>
                </li>
              ))}
            </ol>
            <p className="lx-headline lx-triad-statement__statement">
              <em>{possibility.promise}</em>
            </p>
            <p className="lx-subheadline lx-triad-statement__closing">{possibility.logic}</p>
          </div>
        </div>
      </section>

      {/* 05 — Luxtory: Kaizen K09 (7) + copy (5) sobre Warm Sand; fechamento nas 12 colunas. */}
      <section
        id={LUXTORY}
        className="lx-section-split"
        data-surface="sand"
        aria-labelledby={titleOf(LUXTORY)}
      >
        <div className="lx-split lx-split--media-start lx-split--wide-media">
          <SplitPhoto
            src="/images/home/kaizen/kaizen-k09.jpg"
            width={1376}
            height={768}
            alt={media.kaizen.alt}
            crop="lx-crop-x-35 lx-crop-y-65"
          />
          <div className="lx-split__text">
            <div className="lx-split__inner">
              <Eyebrow>{luxtory.marker}</Eyebrow>
              <h2 id={titleOf(LUXTORY)} className="lx-headline">
                {luxtory.idea}
              </h2>
              <p className="lx-body">{nb(luxtory.intro)}</p>
              <p className="lx-display-m">
                <em>{luxtory.lifestyle}</em>
              </p>
              <p className="lx-body">{nb(luxtory.partners)}</p>
              <p className="lx-body">{luxtory.club}</p>
            </div>
          </div>
        </div>
        <div className="lx-container lx-section-closing lx-stack">
          <p className="lx-subheadline">{luxtory.architecture}</p>
          <p className="lx-headline">{luxtory.triad}</p>
        </div>
      </section>

      {/* 05.1 — Pertencimento: copy (5) + fotografia identitária (7); fechamento abaixo. */}
      <section
        id={BELONGING}
        className="lx-section-split"
        data-surface="blue"
        aria-labelledby={titleOf(BELONGING)}
      >
        <div className="lx-split lx-split--wide-media">
          <div className="lx-split__text">
            <div className="lx-split__inner">
              <Eyebrow accent>{belonging.marker}</Eyebrow>
              <h2 id={titleOf(BELONGING)} className="lx-headline">
                {belonging.title}
              </h2>
              <Paragraphs lines={belonging.brands} />
              <ul className="lx-editorial-list">
                {belonging.universe.map((word) => (
                  <li key={word}>{word}</li>
                ))}
              </ul>
              <p className="lx-body">{nb(belonging.place)}</p>
              <Paragraphs lines={belonging.text} />
            </div>
          </div>
          <SplitPhoto
            src="/images/home/kaizen/kaizen-k07.jpg"
            width={1376}
            height={768}
            alt={media.kaizenWellness.alt}
            crop="lx-crop-x-50 lx-crop-y-65"
          />
        </div>
        <div className="lx-container lx-section-closing lx-stack">
          <p className="lx-subheadline">{belonging.arrival}</p>
          <p className="lx-closing">{belonging.notOnly}</p>
          <p className="lx-subheadline">{belonging.but}</p>
          <p className="lx-headline">
            <em>{belonging.mine}</em>
          </p>
        </div>
      </section>

      {/* 05.2 — Patrimônio: sem imagem (conceitual e comparativa); Owner | Co-Owner com o mesmo peso. */}
      <section
        id={PATRIMONY}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(PATRIMONY)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{patrimony.marker}</Eyebrow>
            <h2 id={titleOf(PATRIMONY)} className="lx-headline">
              <HeadlineText headline={patrimony.title} />
            </h2>
            <p className="lx-body">{patrimony.intro}</p>
            <Paragraphs lines={patrimony.text} />
          </div>
          <ModalityComparison pair={patrimony.pair} headlines />
          <div className="lx-section-closing lx-stack">
            <Eyebrow>{patrimony.both.title}</Eyebrow>
            <Paragraphs lines={patrimony.both.text} className="lx-subheadline" />
            <p className="lx-headline">{patrimony.both.principle}</p>
          </div>
        </div>
      </section>

      {/* 05.3 — Liberdade: Bloco A (imagem 5 + intro 7), Bloco B (Numbered Editorial List), fechamento. */}
      <section
        id={FREEDOM}
        className="lx-section-split"
        data-surface="deep"
        aria-labelledby={titleOf(FREEDOM)}
      >
        <div className="lx-split lx-split--media-start lx-split--wide-text">
          <div className="lx-split__text">
            <div className="lx-split__inner">
              <Eyebrow>{freedom.marker}</Eyebrow>
              <h2 id={titleOf(FREEDOM)} className="lx-headline">
                {freedom.title}
              </h2>
              <Paragraphs lines={freedom.text} />
            </div>
          </div>
          <SplitPhoto
            src="/images/home/hero/luxury-property-facade-hero.jpg"
            width={1672}
            height={941}
            alt=""
            crop="lx-crop-x-65 lx-crop-lg-x-50"
          />
        </div>
        <div className="lx-container">
          <ol className="lx-numbered">
            {freedom.mechanisms.map((mechanism, index) => (
              <li className="lx-numbered__item" key={mechanism.title}>
                <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-display-m">{mechanism.title}</h3>
                <div className="lx-numbered__text lx-stack">
                  <Paragraphs lines={mechanism.text} />
                </div>
              </li>
            ))}
          </ol>
          <p className="lx-section-closing lx-headline lx-headline--turn-fg">
            <HeadlineText headline={freedom.closing} />
          </p>
        </div>
      </section>

      {/* 05.4 — Gestão: copy (7) + hospitalidade (5) sobre Warm Sand; Owner | Co-Owner; fechamento. */}
      <section
        id={MANAGEMENT}
        className="lx-section-split"
        data-surface="sand"
        aria-labelledby={titleOf(MANAGEMENT)}
      >
        <div className="lx-split lx-split--wide-text">
          <div className="lx-split__text">
            <div className="lx-split__inner">
              <Eyebrow>{management.marker}</Eyebrow>
              <h2 id={titleOf(MANAGEMENT)} className="lx-headline">
                <HeadlineText headline={management.title} />
              </h2>
              <p className="lx-body">{nb(management.intro)}</p>
              <p className="lx-body">{nb(management.text)}</p>
            </div>
          </div>
          <SplitPhoto
            src="/images/home/kaizen/kaizen-k05.jpg"
            width={1376}
            height={768}
            alt={media.kaizenSuite.alt}
            crop="lx-crop-x-35 lx-crop-y-65"
          />
        </div>
        <div className="lx-container">
          <ModalityComparison pair={management.pair} />
          <p className="lx-section-closing lx-headline">
            <HeadlineText headline={management.closing} />
          </p>
        </div>
      </section>

      {/* 06 — PUSH: A) argumento (texto | fotografia) sobre Deep; B) o CTA cinematográfico sobre a fotografia de fechamento. */}
      <section id={PUSH} aria-labelledby={titleOf(PUSH)}>
        {/* A: texto à esquerda, fotografia à direita (6/6); depois "E para quem é a Luxtory?" e o próximo passo. */}
        <div className="lx-section-split" data-surface="deep">
          <div className="lx-split">
            <div className="lx-split__text">
              <div className="lx-split__inner">
                <Eyebrow>{push.marker}</Eyebrow>
                <h2 id={titleOf(PUSH)} className="lx-headline">
                  <HeadlineText headline={push.title} />
                </h2>
                <p className="lx-body">{nb(push.intro)}</p>
                <Paragraphs lines={push.promises} />
                <ol className="lx-numbered lx-numbered--compact">
                  {[triad.patrimony, triad.freedom, triad.belonging].map((line, index) => (
                    <li className="lx-numbered__item" key={line.lead}>
                      <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                        {ordinal(index)}
                      </span>
                      <span className="lx-display-m">
                        <HeadlineText headline={line} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <SplitPhoto
              src="/images/home/hero/hero-lifestyle.jpg"
              width={1344}
              height={768}
              alt=""
              crop="lx-crop-x-80"
            />
          </div>
          {/* Subseção: a pergunta à esquerda, a resposta em texto corpo à direita. */}
          <div className="lx-container">
            <div className="lx-columns">
              <h3 className="lx-headline">{push.forWhomTitle}</h3>
              <div className="lx-stack">
                <Paragraphs lines={push.forWhom} />
              </div>
            </div>
          </div>
          <div className="lx-container lx-section-closing">
            <p className="lx-subheadline">{nb(push.next)}</p>
          </div>
        </div>
        <div className="lx-hero lx-hero--closing" data-surface="blue">
          <div className="lx-hero__slides" aria-hidden="true">
            <div className="lx-hero__slide" data-active="">
              {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */}
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
              <CatalogActions cta={cta} next={{}} from="home" cinematic />
            </div>
          </div>
        </div>
      </section>

      {/* 07 — FAQ: White, leitura e baixa distração; disclosures nativos. */}
      <section id={FAQ} className="lx-section" data-surface="white" aria-labelledby={titleOf(FAQ)}>
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{faq.marker}</Eyebrow>
            <h2 id={titleOf(FAQ)} className="lx-headline">
              {faq.title}
            </h2>
          </div>
          <div className="lx-faq lx-faq--start lx-disclosure">
            {faq.items.map((item) => (
              <details className="lx-disclosure__item" key={item.question}>
                <summary className="lx-disclosure__summary">
                  <span>{nb(item.question)}</span>
                  <Icon name="chevron-right" className="lx-disclosure__icon" />
                </summary>
                <div className="lx-disclosure__body">
                  <Paragraphs lines={item.answer} />
                </div>
              </details>
            ))}
            <details className="lx-disclosure__item">
              <summary className="lx-disclosure__summary">
                <span>{faq.details.question}</span>
                <Icon name="chevron-right" className="lx-disclosure__icon" />
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
        </div>
      </section>
    </DiscoverySite>
  );
}
