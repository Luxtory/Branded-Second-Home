import type { ReactNode } from 'react';
import { Evidence, type TriadVertex } from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text, type Answer, type Headline } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { Eyebrow, ModalityComparison, ordinal, Paragraphs } from './parts';
import { Qualification } from './qualification';
import { readAvailability } from './read';
import { DiscoverySite } from './site';

const { howItWorks: page, qualification, triad } = text;
const { patrimony, freedom, belonging } = page;

/** Âncoras dos capítulos (índice da abertura). */
const CHAPTERS = {
  patrimony: 'patrimonio',
  freedom: 'liberdade',
  belonging: 'pertencimento',
} as const satisfies Record<TriadVertex, string>;

const VERTICES = Object.keys(CHAPTERS) as TriadVertex[];

const titleOf = (section: string) => `${section}-titulo`;

/**
 * Capítulo de um pilar (receita catalog §13.9): eyebrow com o número e o marker, o título da tríade e as perguntas do
 * Protagonista como Numbered Editorial List. As superfícies alternam Blue e Sand.
 */
function Chapter({
  vertex,
  numeral,
  surface,
  marker,
  title,
  children,
}: {
  readonly vertex: TriadVertex;
  readonly numeral: string;
  readonly surface: 'blue' | 'sand';
  readonly marker: readonly string[];
  readonly title: Headline;
  readonly children: ReactNode;
}) {
  const id = CHAPTERS[vertex];
  return (
    <section id={id} className="lx-section" data-surface={surface} aria-labelledby={titleOf(id)}>
      <div className="lx-container">
        <div className="lx-section-head">
          <Eyebrow>{[numeral, ...marker].join(' · ')}</Eyebrow>
          <h2 id={titleOf(id)} className="lx-headline">
            <HeadlineText headline={title} />
          </h2>
        </div>
        <ol className="lx-numbered">{children}</ol>
      </div>
    </section>
  );
}

/** Uma pergunta do Protagonista: número, a pergunta e a resposta (na terceira coluna a partir do `lg`). */
function QaItem({
  index,
  question,
  children,
}: {
  readonly index: number;
  readonly question: string;
  readonly children: ReactNode;
}) {
  return (
    <li className="lx-numbered__item">
      <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
        {ordinal(index)}
      </span>
      <h3 className="lx-display-m">{question}</h3>
      <div className="lx-numbered__text lx-stack">{children}</div>
    </li>
  );
}

function AnswerItem({ index, answer }: { readonly index: number; readonly answer: Answer }) {
  return (
    <QaItem index={index} question={answer.question}>
      <Paragraphs lines={answer.answer} />
    </QaItem>
  );
}

/**
 * As quatro configurações Co-Owner (`01` §8.1, sem a capacidade da Luxtory) como Panel Comparison: o mesmo painel para
 * cada uma, com os valores como registrados (Evidence).
 */
function Configurations({ index }: { readonly index: number }) {
  const { configurations } = freedom;
  const { labels } = configurations;
  return (
    <QaItem index={index} question={configurations.title}>
      <p className="lx-body">{configurations.text}</p>
      <ul className="lx-panels" aria-label={configurations.title}>
        {configurations.rows.map((row) => (
          <li className="lx-panels__panel" key={row.title}>
            <h4 className="lx-display-m">
              <span className="lx-nowrap">{row.title}</span>
            </h4>
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
    </QaItem>
  );
}

/** Como funciona `/como-funciona` (spec catalog §13.4, receita §13.9): Product Aware → Most Aware, PROOF → PUSH. */
export async function HowItWorksPage() {
  const cta = catalogCta(await readAvailability());
  const freedomAnswers = freedom.answers.length;
  return (
    <DiscoverySite current="howItWorks">
      {/* Abertura tipográfica (Blue) e o índice dos três capítulos. */}
      <section className="lx-section" data-surface="blue" aria-labelledby="como-funciona">
        <div className="lx-container lx-columns lx-columns--7-5">
          <div className="lx-stack">
            <h1 id="como-funciona" className="lx-statement">
              {page.header.title}
            </h1>
            <p className="lx-subheadline">{page.header.text}</p>
          </div>
          <nav aria-label={page.index}>
            <ol className="lx-numbered lx-numbered--compact">
              {VERTICES.map((vertex, index) => (
                <li className="lx-numbered__item" key={vertex}>
                  <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                    {ordinal(index)}
                  </span>
                  <a className="lx-link lx-title" href={`#${CHAPTERS[vertex]}`}>
                    {/* Um só item no link (inline-flex): o espaço entre o nome e a virada não se perde. */}
                    <span>
                      <HeadlineText headline={triad[vertex]} />
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      {/* O mecanismo como uma sequência: do lifestyle ao Luxtory Club. */}
      <section
        id="mecanismo"
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf('mecanismo')}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf('mecanismo')} className="lx-headline">
              <HeadlineText headline={page.chain.title} />
            </h2>
          </div>
          <ol className="lx-numbered">
            {page.chain.steps.map((step, index) => (
              <li className="lx-numbered__item" key={step.title}>
                <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-display-m">{nb(step.title)}</h3>
                <p className="lx-body lx-numbered__text">{nb(step.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Chapter
        vertex="patrimony"
        numeral="01"
        surface="blue"
        marker={patrimony.marker}
        title={patrimony.title}
      >
        <QaItem index={0} question={patrimony.own.question}>
          <ModalityComparison pair={patrimony.own.pair} level={4} />
          <p className="lx-body">{patrimony.own.after}</p>
        </QaItem>
        {patrimony.answers.map((answer, index) => (
          <AnswerItem index={index + 1} answer={answer} key={answer.question} />
        ))}
      </Chapter>

      <Chapter
        vertex="freedom"
        numeral="02"
        surface="sand"
        marker={freedom.marker}
        title={freedom.title}
      >
        <QaItem index={0} question={freedom.use.question}>
          <ModalityComparison pair={freedom.use.pair} level={4} />
          <p className="lx-body">{freedom.use.after}</p>
        </QaItem>
        <Configurations index={1} />
        {freedom.answers.map((answer, index) => (
          <AnswerItem index={index + 2} answer={answer} key={answer.question} />
        ))}
        <QaItem index={freedomAnswers + 2} question={freedom.management.question}>
          <ModalityComparison pair={freedom.management.pair} level={4} />
        </QaItem>
        <QaItem index={freedomAnswers + 3} question={freedom.club.question}>
          <p className="lx-body">{nb(freedom.club.text)}</p>
          <ul className="lx-comparison__list">
            {freedom.club.items.map((item) => (
              <li className="lx-stack" key={item.title}>
                <h4 className="lx-label">{item.title}</h4>
                <p className="lx-body">{nb(item.text)}</p>
              </li>
            ))}
          </ul>
          <p className="lx-body">{freedom.club.after}</p>
        </QaItem>
        <AnswerItem index={freedomAnswers + 4} answer={freedom.limits} />
      </Chapter>

      <Chapter
        vertex="belonging"
        numeral="03"
        surface="blue"
        marker={belonging.marker}
        title={belonging.title}
      >
        {belonging.answers.map((answer, index) => (
          <AnswerItem index={index} answer={answer} key={answer.question} />
        ))}
      </Chapter>

      {/* O que mais saber: cada condição numa linha. */}
      <section
        id="condicoes"
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf('condicoes')}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf('condicoes')} className="lx-headline">
              <HeadlineText headline={page.conditions.title} />
            </h2>
          </div>
          <ol className="lx-numbered">
            {page.conditions.items.map((item, index) => (
              <li className="lx-numbered__item" key={item}>
                <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <p className="lx-body lx-numbered__text lx-numbered__text--wide">{nb(item)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

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
