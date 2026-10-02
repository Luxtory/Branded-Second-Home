import type { ReactNode } from 'react';
import {
  Evidence,
  MeasureBar,
  Scene,
  TriadDrawing,
  type Ground,
  type TriadVertex,
} from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text, type Answer, type Headline } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { ChapterHead, ModalityPairView, Paragraphs } from './parts';
import { Qualification } from './qualification';
import { readAvailability } from './read';
import { DiscoverySite } from './site';

const { howItWorks: page, qualification, triad, values } = text;
const { patrimony, freedom, belonging } = page;

/** Âncoras dos capítulos (índice da abertura). */
const CHAPTERS = {
  patrimony: 'patrimonio',
  freedom: 'liberdade',
  belonging: 'pertencimento',
} as const satisfies Record<TriadVertex, string>;

const titleOf = (section: string) => `${section}-titulo`;

/** Escala do desenho das configurações: os dias do ano. Ilustração da proporção; os valores estão no texto. */
const DAYS_IN_YEAR = 365;

/** "até 10 dias" → 10 (o número da própria copy, sem valor presumido). */
const daysIn = (value: string) => Number(/\d+/.exec(value)?.[0] ?? 0);

/** Capítulo de um pilar: cabeçalho numerado com a tríade em miniatura, o título e as perguntas do Protagonista. */
function Chapter({
  vertex,
  numeral,
  ground,
  marker,
  title,
  children,
}: {
  readonly vertex: TriadVertex;
  readonly numeral: string;
  readonly ground: Ground;
  readonly marker: readonly string[];
  readonly title: Headline;
  readonly children: ReactNode;
}) {
  const id = CHAPTERS[vertex];
  return (
    <Scene id={id} titleId={titleOf(id)} ground={ground} chapter>
      <div className="lx-place-full">
        <ChapterHead numeral={numeral} marker={marker} focus={vertex} />
      </div>
      <h2 id={titleOf(id)} className="lx-place-wide lx-display-xl">
        <HeadlineText headline={title} />
      </h2>
      {children}
    </Scene>
  );
}

/** Uma pergunta do Protagonista à esquerda e a resposta à direita (a partir do `lg`). */
function QaRow({
  question,
  children,
}: {
  readonly question: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="lx-place-full lx-qa">
      <h3 className="lx-display-m">{question}</h3>
      <div className="lx-qa__answer">{children}</div>
    </div>
  );
}

function AnswerRow({ answer }: { readonly answer: Answer }) {
  return (
    <QaRow question={answer.question}>
      <Paragraphs lines={answer.answer} className="lx-lead" />
    </QaRow>
  );
}

/**
 * As quatro configurações Co-Owner (`01` §8.1, sem a capacidade da Luxtory): cada uma com a proporção do ano desenhada
 * (Alta/Super Alta cheia, Média/Baixa vazada) e os valores em Evidence.
 */
function Configurations() {
  const { configurations } = freedom;
  const { labels } = configurations;
  return (
    <div className="lx-place-full lx-qa">
      <div className="lx-scene__body">
        <h3 className="lx-display-m">{configurations.title}</h3>
        <p className="lx-body">{configurations.text}</p>
        <ul className="lx-legend" aria-hidden="true">
          <li>
            <span className="lx-legend__swatch lx-legend__swatch--solid" />
            {labels.high}
          </li>
          <li>
            <span className="lx-legend__swatch lx-legend__swatch--outline" />
            {labels.low}
          </li>
        </ul>
      </div>
      <ul className="lx-qa__answer lx-configs">
        {configurations.rows.map((row) => (
          <li className="lx-configs__item" key={row.title}>
            <h4 className="lx-display-m">
              <span className="lx-nowrap">{row.title}</span>
            </h4>
            <MeasureBar
              total={DAYS_IN_YEAR}
              segments={[
                { value: daysIn(row.high), fill: 'solid' },
                { value: daysIn(row.low), fill: 'outline' },
              ]}
            />
            <Evidence
              inline
              items={[
                { label: labels.share, value: row.share },
                { label: labels.annual, value: row.annual },
                { label: labels.high, value: row.high },
                { label: labels.low, value: row.low },
              ]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Como funciona `/como-funciona` (spec catalog §13.4): Product Aware → Most Aware, PROOF → PUSH `[FW-B2C: §8.1]`. */
export async function HowItWorksPage() {
  const cta = catalogCta(await readAvailability());
  return (
    <DiscoverySite current="howItWorks">
      {/* Abertura: a tríade é a planta da página; o índice leva aos três capítulos. */}
      <Scene titleId="como-funciona" ground="night" chapter>
        <div className="lx-place-left lx-scene__body lx-prelude">
          <h1 id="como-funciona" className="lx-display-2xl">
            {page.header.title}
          </h1>
          <p className="lx-lead">{page.header.text}</p>
        </div>
        <div className="lx-place-right lx-prelude__drawing">
          <TriadDrawing labels={values} />
        </div>
        <nav className="lx-place-full" aria-label={page.index}>
          <ol className="lx-index">
            {(Object.keys(CHAPTERS) as TriadVertex[]).map((vertex) => (
              <li className="lx-index__item" key={vertex}>
                <a className="lx-index__link" href={`#${CHAPTERS[vertex]}`}>
                  <HeadlineText headline={triad[vertex]} />
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </Scene>

      {/* O mecanismo como um eixo: do lifestyle ao Luxtory Club. */}
      <Scene id="mecanismo" titleId={titleOf('mecanismo')} ground="wash" chapter>
        <div className="lx-place-aside lx-sticky">
          <h2 id={titleOf('mecanismo')} className="lx-display-xl">
            <HeadlineText headline={page.chain.title} />
          </h2>
        </div>
        <ol className="lx-place-main lx-axis">
          {page.chain.steps.map((step) => (
            <li className="lx-axis__item" key={step.title}>
              <h3 className="lx-display-m">{nb(step.title)}</h3>
              <p className="lx-body">{nb(step.text)}</p>
            </li>
          ))}
        </ol>
      </Scene>

      <Chapter
        vertex="patrimony"
        numeral="01"
        ground="paper"
        marker={patrimony.marker}
        title={patrimony.title}
      >
        <QaRow question={patrimony.own.question}>
          <ModalityPairView pair={patrimony.own.pair} level={4} deed />
          <p className="lx-body">{patrimony.own.after}</p>
        </QaRow>
        {patrimony.answers.map((answer) => (
          <AnswerRow answer={answer} key={answer.question} />
        ))}
      </Chapter>

      <Chapter
        vertex="freedom"
        numeral="02"
        ground="wash"
        marker={freedom.marker}
        title={freedom.title}
      >
        <QaRow question={freedom.use.question}>
          <ModalityPairView pair={freedom.use.pair} level={4} deed />
          <p className="lx-body">{freedom.use.after}</p>
        </QaRow>
        <Configurations />
        {freedom.answers.map((answer) => (
          <AnswerRow answer={answer} key={answer.question} />
        ))}
        <QaRow question={freedom.management.question}>
          <ModalityPairView pair={freedom.management.pair} level={4} deed />
        </QaRow>
        <QaRow question={freedom.club.question}>
          <p className="lx-lead">{nb(freedom.club.text)}</p>
          <ol className="lx-ledger">
            {freedom.club.items.map((item) => (
              <li className="lx-ledger__item" key={item.title}>
                <h4 className="lx-display-s">{item.title}</h4>
                <p className="lx-body">{nb(item.text)}</p>
              </li>
            ))}
          </ol>
          <p className="lx-body">{freedom.club.after}</p>
        </QaRow>
        <AnswerRow answer={freedom.limits} />
      </Chapter>

      <Chapter
        vertex="belonging"
        numeral="03"
        ground="paper"
        marker={belonging.marker}
        title={belonging.title}
      >
        {belonging.answers.map((answer) => (
          <AnswerRow answer={answer} key={answer.question} />
        ))}
      </Chapter>

      {/* O que mais saber: cada condição numa linha do dossiê. */}
      <Scene id="condicoes" titleId={titleOf('condicoes')} ground="night" chapter>
        <div className="lx-place-aside lx-sticky">
          <h2 id={titleOf('condicoes')} className="lx-display-xl">
            <HeadlineText headline={page.conditions.title} />
          </h2>
        </div>
        <ol className="lx-place-main lx-ledger">
          {page.conditions.items.map((item) => (
            <li className="lx-ledger__item" key={item}>
              <p className="lx-display-s">{nb(item)}</p>
            </li>
          ))}
        </ol>
      </Scene>

      <Qualification
        titleId="para-quem"
        extraNotFits={[qualification.existingProperty, qualification.coOwnerFit]}
      >
        <CatalogActions
          cta={cta}
          next={{
            editions: qualification.next.editions,
            concepts: qualification.next.concepts,
            none: qualification.nextHowItWorks.none,
          }}
          from="howItWorks"
        />
      </Qualification>
    </DiscoverySite>
  );
}
