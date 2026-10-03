import { Icon, Scene, TriadDrawing } from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { ChapterHead, Marker, ModalityPairView, Paragraphs, ValuesLine } from './parts';
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

/** O título nomeia a seção; a seção leva a âncora (o marker fica visível ao chegar por link). */
const titleOf = (section: string) => `${section}-titulo`;

/**
 * Home `/` (spec catalog §13.4): a copy do fundador (D-B2C-18), Unaware → Product Aware. Direção visual: a tríade como
 * planta — o desenho de três pontos que cada alternativa quebra, que a renúncia afasta e que a promessa fecha. PICTURE =
 * Hero sem ação comercial; PUSH com o CTA por disponibilidade (D-B2C-16).
 */
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
      />

      {/* PROBLEM — a renúncia: texto e tríade original do Luxtory2.0 em equilíbrio. */}
      <Scene id={RENUNCIATION} titleId={titleOf(RENUNCIATION)} ground="night">
        <div className="lx-place-full lx-renunciation">
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
              {/* eslint-disable-next-line @next/next/no-img-element -- original Luxtory2.0 SVG is served verbatim; Next/Image injects an inline style blocked by the strict CSP. */}
              <img
                src="/diagrams/triade-valor-desejado.svg"
                alt={`Diagrama da tríade de valor: ${renunciation.values}`}
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
      </Scene>

      {/* PROBLEM — vilão: as três palavras afastadas no espaço. */}
      <Scene id={RULE} titleId={titleOf(RULE)} ground="night" chapter>
        <div className="lx-place-wide lx-scene__body">
          <Marker parts={rule.marker} />
          <h2 id={titleOf(RULE)} className="lx-display-xl">
            {rule.title}
          </h2>
        </div>
        <ul className="lx-place-full lx-staging">
          <li className="lx-display-l lx-staging__line--start">{rule.split[0]}</li>
          <li className="lx-display-l lx-staging__line--end">{rule.split[1]}</li>
          <li className="lx-display-m lx-staging__line--back">{rule.split[2]}</li>
        </ul>
        <div className="lx-place-half lx-prose">
          <Paragraphs lines={rule.text} className="lx-lead" />
        </div>
        <p className="lx-place-wide lx-display-xl">
          <em>{rule.question}</em>
        </p>
        <div className="lx-place-offset lx-prose">
          <Paragraphs lines={rule.closing} className="lx-lead" />
        </div>
      </Scene>

      {/* PROMISE — o desenho se fecha. */}
      <Scene id={POSSIBILITY} titleId={titleOf(POSSIBILITY)} ground="wash" chapter>
        <div className="lx-place-full lx-scene__body">
          <Marker parts={possibility.marker} />
          <h2 id={titleOf(POSSIBILITY)} className="lx-display-2xl">
            <HeadlineText headline={possibility.title} />
          </h2>
        </div>
        <div className="lx-place-offset lx-prose">
          <Paragraphs lines={possibility.imagine} className="lx-lead" />
        </div>
        <div className="lx-place-full lx-callouts">
          <div className="lx-callouts__drawing">
            <TriadDrawing labels={values} />
          </div>
          <p className="lx-callouts__note lx-callouts__note--patrimony lx-display-s">
            {possibility.values[0]}
          </p>
          <p className="lx-callouts__note lx-callouts__note--freedom lx-display-s">
            {possibility.values[1]}
          </p>
          <p className="lx-callouts__note lx-callouts__note--belonging lx-display-s">
            {possibility.values[2]}
          </p>
        </div>
        <div className="lx-place-full lx-coda lx-coda--center">
          <ValuesLine text={possibility.triad} joined />
          <p className="lx-display-2xl">
            <em>{possibility.promise}</em>
          </p>
          <p className="lx-lead">{possibility.logic}</p>
        </div>
      </Scene>

      {/* PROOF — a Luxtory: o manifesto. */}
      <Scene id={LUXTORY} titleId={titleOf(LUXTORY)} ground="night" chapter>
        <div className="lx-place-half lx-scene__body">
          <Marker parts={luxtory.marker} />
          <p className="lx-lead">{nb(luxtory.intro)}</p>
        </div>
        <h2 id={titleOf(LUXTORY)} className="lx-place-wide lx-display-xl">
          {luxtory.idea}
        </h2>
        <div className="lx-place-full lx-contrast">
          <p className="lx-display-m">{luxtory.start}</p>
          <p className="lx-display-m">
            <em>{luxtory.startTurn}</em>
          </p>
        </div>
        <p className="lx-place-offset lx-lead">{nb(luxtory.partners)}</p>
        <div className="lx-place-full lx-coda">
          <div className="lx-prose">
            <p className="lx-lead">{luxtory.club}</p>
            <p className="lx-lead">{luxtory.architecture}</p>
          </div>
          <ValuesLine text={luxtory.triad} joined />
        </div>
      </Scene>

      {/* Capítulo 01 — Pertencimento: o universo da marca num Frame tipográfico (sem fotografia, P-LX-02). */}
      <Scene id={BELONGING} titleId={titleOf(BELONGING)} ground="paper" chapter>
        <div className="lx-place-full">
          <ChapterHead numeral="01" marker={belonging.marker} focus="belonging" />
        </div>
        <div className="lx-place-right lx-scene__body">
          <h2 id={titleOf(BELONGING)} className="lx-display-xl">
            {belonging.title}
          </h2>
          <div className="lx-prose">
            <Paragraphs lines={belonging.brands} className="lx-lead" />
          </div>
        </div>
        <div className="lx-place-left lx-span-rows lx-sticky">
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
        <div className="lx-place-right lx-scene__body">
          <p className="lx-display-m">{nb(belonging.place)}</p>
          <div className="lx-prose">
            <Paragraphs lines={belonging.text} />
          </div>
        </div>
        <div className="lx-place-full lx-coda lx-coda--center">
          <p className="lx-lead">{belonging.arrival}</p>
          <p className="lx-display-m">{belonging.notOnly}</p>
          <p className="lx-lead">{belonging.but}</p>
          <p className="lx-display-2xl">
            <em>{belonging.mine}</em>
          </p>
        </div>
      </Scene>

      {/* Capítulo 02 — Patrimônio: Owner e Co-Owner como duas pranchas do mesmo jogo (REQ-103). */}
      <Scene id={PATRIMONY} titleId={titleOf(PATRIMONY)} ground="wash" chapter>
        <div className="lx-place-full">
          <ChapterHead numeral="02" marker={patrimony.marker} focus="patrimony" />
        </div>
        <h2 id={titleOf(PATRIMONY)} className="lx-place-wide lx-display-xl">
          <HeadlineText headline={patrimony.title} />
        </h2>
        <div className="lx-place-offset lx-prose">
          <p className="lx-lead">{patrimony.intro}</p>
          <Paragraphs lines={patrimony.text} />
        </div>
        <div className="lx-place-full">
          <ModalityPairView pair={patrimony.pair} level={3} deed />
        </div>
        <div className="lx-place-full lx-coda lx-coda--center">
          <h3 className="lx-display-s">{patrimony.both.title}</h3>
          <div className="lx-prose">
            <Paragraphs lines={patrimony.both.text} className="lx-lead" />
          </div>
          <p className="lx-display-2xl">
            <em>{patrimony.both.principle}</em>
          </p>
        </div>
      </Scene>

      {/* Capítulo 03 — Liberdade: cada mecanismo numa linha do dossiê. */}
      <Scene id={FREEDOM} titleId={titleOf(FREEDOM)} ground="paper" chapter>
        <div className="lx-place-full">
          <ChapterHead numeral="03" marker={freedom.marker} focus="freedom" />
        </div>
        <div className="lx-place-aside lx-sticky lx-scene__body">
          <h2 id={titleOf(FREEDOM)} className="lx-display-l">
            {freedom.title}
          </h2>
          <div className="lx-prose">
            <Paragraphs lines={freedom.text} className="lx-lead" />
          </div>
        </div>
        <ol className="lx-place-main lx-ledger">
          {freedom.mechanisms.map((mechanism) => (
            <li className="lx-ledger__item" key={mechanism.title}>
              <h3 className="lx-display-m">{mechanism.title}</h3>
              <Paragraphs lines={mechanism.text} />
            </li>
          ))}
        </ol>
        <div className="lx-place-full lx-coda">
          <p className="lx-display-l">
            <HeadlineText headline={freedom.closing} />
          </p>
        </div>
      </Scene>

      {/* Gestão: a casa sem o segundo trabalho. */}
      <Scene id={MANAGEMENT} titleId={titleOf(MANAGEMENT)} ground="wash" chapter>
        <div className="lx-place-full">
          <ChapterHead marker={management.marker} />
        </div>
        <h2 id={titleOf(MANAGEMENT)} className="lx-place-wide lx-display-2xl">
          <HeadlineText headline={management.title} />
        </h2>
        <div className="lx-place-aside lx-prose">
          <p className="lx-lead">{nb(management.intro)}</p>
          <p className="lx-body">{nb(management.text)}</p>
        </div>
        <div className="lx-place-main">
          <ModalityPairView pair={management.pair} level={3} deed />
        </div>
        <div className="lx-place-full lx-coda lx-coda--center">
          <p className="lx-display-l">
            <HeadlineText headline={management.closing} />
          </p>
        </div>
      </Scene>

      {/* PUSH — o clímax: a tríade inteira e o próximo passo por disponibilidade. */}
      <Scene id={PUSH} titleId={titleOf(PUSH)} ground="night" chapter>
        <div className="lx-place-full lx-scene__body">
          <Marker parts={push.marker} />
          <h2 id={titleOf(PUSH)} className="lx-display-2xl">
            <HeadlineText headline={push.title} />
          </h2>
        </div>
        <p className="lx-place-offset lx-lead">{nb(push.intro)}</p>
        <ul className="lx-place-full lx-blocks">
          {push.promises.map((promise) => (
            <li className="lx-blocks__item" key={promise}>
              <p className="lx-display-s">{nb(promise)}</p>
            </li>
          ))}
        </ul>
        <div className="lx-place-left lx-sticky">
          <TriadDrawing labels={values} />
        </div>
        <ul className="lx-place-right lx-lines">
          {[triad.patrimony, triad.freedom, triad.belonging].map((line) => (
            <li className="lx-display-l" key={line.lead}>
              <HeadlineText headline={line} />
            </li>
          ))}
        </ul>
        <div className="lx-place-half lx-prose">
          <Paragraphs lines={push.forWhom} className="lx-lead" />
        </div>
        <div className="lx-place-full lx-coda">
          <p className="lx-lead">{nb(push.next)}</p>
          <CatalogActions cta={cta} next={{}} from="home" />
        </div>
      </Scene>

      {/* Dúvidas essenciais: o título fica, as perguntas abrem no lugar. */}
      <Scene id={FAQ} titleId={titleOf(FAQ)} ground="paper">
        <div className="lx-place-aside lx-sticky lx-scene__body">
          <Marker parts={faq.marker} />
          <h2 id={titleOf(FAQ)} className="lx-display-xl">
            {faq.title}
          </h2>
        </div>
        <div className="lx-place-main lx-disclosure">
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
      </Scene>
    </DiscoverySite>
  );
}
