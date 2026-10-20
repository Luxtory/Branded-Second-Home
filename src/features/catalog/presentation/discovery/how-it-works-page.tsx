import { Fragment, type ReactNode } from 'react';
import { Icon, type TriadVertex } from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text, type ModalityPair } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { Eyebrow, ordinal, SplitPhoto } from './parts';
import { readAvailability } from './read';
import { DiscoverySite } from './site';

const { howItWorks: page, qualification, modality, home } = text;
const { hero, connection, patrimony, freedom, management, club, belonging, conditions, fit } = page;

/** Âncoras dos três capítulos (índice do Hero). */
const CHAPTERS = {
  patrimony: 'patrimonio',
  freedom: 'liberdade',
  belonging: 'pertencimento',
} as const satisfies Record<TriadVertex, string>;

const VERTICES = Object.keys(CHAPTERS) as TriadVertex[];

/** Seções na ordem da especificação do fundador (D-B2C-20); o título nomeia a seção. */
const SECTIONS = {
  hero: 'inicio',
  connection: 'conexao',
  management: 'gestao',
  club: 'clube',
  conditions: 'condicoes',
  fit: 'para-quem',
  next: 'proximo-passo',
} as const;

const titleOf = (section: string) => `${section}-titulo`;

/** Texto da copy com as quebras de linha intencionais (`\n`) e os termos compostos sem quebra. */
function Lines({ value }: { readonly value: string }) {
  return value.split('\n').map((line, index) => (
    <Fragment key={line}>
      {index > 0 ? <br /> : null}
      {nb(line)}
    </Fragment>
  ));
}

function Paragraphs({
  lines,
  className = 'lx-body',
}: {
  readonly lines: readonly string[];
  readonly className?: string;
}) {
  return lines.map((line) => (
    <p className={className} key={line}>
      <Lines value={line} />
    </p>
  ));
}

/**
 * Owner e Co-Owner com o mesmo peso e a mesma estrutura (REQ-103): Editorial Comparison aberta, o nome da modalidade
 * como rótulo e o texto num só bloco (Owner primeiro no celular). `lead`: a primeira frase de cada lado é a resposta em
 * destaque.
 */
function ModalityAnswer({
  pair,
  lead = false,
}: {
  readonly pair: ModalityPair;
  readonly lead?: boolean;
}) {
  const sides = [
    { key: 'owner', name: modality.owner, lines: pair.owner },
    { key: 'co-owner', name: modality.co_owner, lines: pair.coOwner },
  ];
  return (
    <div className="lx-comparison lx-comparison--divided" data-pair="modality">
      {sides.map((side) => {
        const [first = '', ...rest] = side.lines;
        return (
          <div className="lx-comparison__item" key={side.key}>
            <h4 className="lx-eyebrow">
              <span className="lx-nowrap">{side.name}</span>
            </h4>
            {lead ? <p className="lx-display-s">{nb(first)}</p> : null}
            <div className="lx-stack">
              <Paragraphs lines={lead ? rest : side.lines} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Uma linha de resposta: a pergunta do leitor (ou o rótulo do momento) à esquerda, a resposta à direita. */
function AnswerRow({
  label,
  labelClass = 'lx-subheadline',
  children,
  full,
}: {
  readonly label: string;
  readonly labelClass?: string;
  readonly children: ReactNode;
  /** Bloco na largura inteira da linha, abaixo da resposta. */
  readonly full?: ReactNode;
}) {
  return (
    <div className="lx-answers__row">
      <h3 className={`lx-answers__label ${labelClass}`}>{nb(label)}</h3>
      <div className="lx-answers__content">{children}</div>
      {full === undefined ? null : <div className="lx-answers__full">{full}</div>}
    </div>
  );
}

/** Fechamento em duas frases: cada linha num bloco próprio, equilibrado sozinho (sem palavra órfã no celular). */
function Statement({ value }: { readonly value: string }) {
  return (
    <div className="lx-section-closing">
      {value.split('\n').map((line) => (
        <p className="lx-headline" key={line}>
          {nb(line)}
        </p>
      ))}
    </div>
  );
}

/** As dúvidas respondidas com um "Não." em destaque (Warm Sand sobre Blue). */
function NoAnswer({ lines }: { readonly lines: readonly string[] }) {
  return (
    <>
      <p className="lx-statement">{patrimony.no}</p>
      <Paragraphs lines={lines} />
    </>
  );
}

/** Abertura de um capítulo (Editorial Split 6/6): eyebrow com o número, título da tríade e o texto. */
function ChapterText({
  id,
  marker,
  title,
  lines,
}: {
  readonly id: string;
  readonly marker: string;
  readonly title: ReactNode;
  readonly lines?: readonly string[];
}) {
  return (
    <div className="lx-split__text">
      <div className="lx-split__inner">
        <Eyebrow>{marker}</Eyebrow>
        <h2 id={titleOf(id)} className="lx-headline">
          {title}
        </h2>
        {lines === undefined ? null : <Paragraphs lines={lines} />}
      </div>
    </div>
  );
}

/** As quatro configurações Co-Owner (`01` §8.1, sem a capacidade da Luxtory): a mesma geometria, números em destaque. */
function Configurations() {
  const { configurations } = freedom;
  const { labels } = configurations;
  return (
    <div className="lx-stack">
      <ul className="lx-figures" aria-label={configurations.label}>
        {configurations.rows.map((row) => (
          <li className="lx-figures__item" key={row.title}>
            <h4 className="lx-eyebrow">{nb(row.title)}</h4>
            <dl className="lx-figures__data">
              <div>
                <dt>{labels.share}</dt>
                <dd className="lx-figures__value">{row.share}</dd>
              </div>
              <div>
                <dt>{labels.annual}</dt>
                <dd className="lx-figures__value lx-figures__value--primary">{row.annual}</dd>
              </div>
              <div>
                <dt>{labels.high}</dt>
                <dd>{row.high}</dd>
              </div>
              <div>
                <dt>{labels.low}</dt>
                <dd>{row.low}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <Paragraphs lines={configurations.legend} />
    </div>
  );
}

/**
 * Como funciona `/como-funciona` (Especificação Visual e Copy do fundador, 2026-10-06 — spec catalog §13.11): extensão
 * da Home, Product Aware → Most Aware, PROOF → PUSH. Os três capítulos da tríade em Editorial Splits, as dúvidas do
 * leitor em Answer Rows (pergunta | resposta), Owner e Co-Owner sempre com o mesmo peso, e o CTA por disponibilidade
 * (D-B2C-16) sobre a fotografia de fechamento.
 */
export async function HowItWorksPage() {
  const cta = catalogCta(await readAvailability());
  const hasCatalog = cta === 'homeEditions' || cta === 'homeConcepts';
  return (
    <DiscoverySite current="howItWorks">
      {/* 01 — Hero: fotografia em toda a viewport, conteúdo embaixo à esquerda e o índice dos capítulos. */}
      <section
        id={SECTIONS.hero}
        className="lx-hero lx-hero--uniform"
        data-surface="blue"
        aria-labelledby={titleOf(SECTIONS.hero)}
      >
        <div className="lx-hero__slides" aria-hidden="true">
          <div className="lx-hero__slide" data-active="">
            {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */}
            <img
              className="lx-hero__image lx-crop-x-80 lx-crop-md-x-20"
              src="/images/home/hero/hero-lifestyle.jpg"
              alt=""
              width={1344}
              height={768}
              fetchPriority="high"
            />
          </div>
        </div>
        <div className="lx-container lx-hero__content">
          <div className="lx-hero__copy">
            <h1 id={titleOf(SECTIONS.hero)} className="lx-headline">
              {hero.title}
            </h1>
            <p className="lx-subheadline">{nb(hero.text)}</p>
            <a className="lx-link lx-link--standalone" href={`#${SECTIONS.connection}`}>
              {hero.anchor}
              <Icon name="arrow-down" className="lx-link__icon" />
            </a>
            <nav className="lx-hero__chapters" aria-label={hero.chapters}>
              <ol>
                {VERTICES.map((vertex, index) => (
                  <li key={vertex}>
                    <a className="lx-hero__chapter" href={`#${CHAPTERS[vertex]}`}>
                      <span className="lx-hero__chapter-number" aria-hidden="true">
                        {ordinal(index)}
                      </span>
                      <span className="lx-hero__chapter-name">{page.chapters[vertex]}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>
      </section>

      {/* 02–03 — Como tudo se conecta (texto | imagem) e a jornada em três momentos, sobre Warm Sand. */}
      <section
        id={SECTIONS.connection}
        className="lx-section-split"
        data-surface="sand"
        aria-labelledby={titleOf(SECTIONS.connection)}
      >
        <div className="lx-split">
          <ChapterText
            id={SECTIONS.connection}
            marker={connection.marker}
            title={<HeadlineText headline={connection.title} />}
            lines={connection.text}
          />
          <SplitPhoto
            src="/images/home/kaizen/kaizen-k07.jpg"
            width={1376}
            height={768}
            alt={home.media.kaizenWellness.alt}
            crop="lx-crop-x-50 lx-crop-y-65"
          />
        </div>
        <div className="lx-container">
          <div className="lx-answers lx-answers--phases">
            {connection.journey.phases.map((phase, phaseIndex) => (
              <AnswerRow label={phase.title} labelClass="lx-eyebrow" key={phase.title}>
                <ol className="lx-numbered">
                  {phase.steps.map((step, index) => (
                    <li className="lx-numbered__item" key={step.title}>
                      <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                        {ordinal(phaseIndex * phase.steps.length + index)}
                      </span>
                      <h4 className="lx-display-s">{nb(step.title)}</h4>
                      <p className="lx-body lx-numbered__text">{nb(step.text)}</p>
                    </li>
                  ))}
                </ol>
              </AnswerRow>
            ))}
          </div>
        </div>
      </section>

      {/* 04–07 — Patrimônio (imagem | texto) sobre Moroccan Blue: o que é meu, timeshare, garantia; fechamento. */}
      <section
        id={CHAPTERS.patrimony}
        className="lx-section-split"
        data-surface="blue"
        aria-labelledby={titleOf(CHAPTERS.patrimony)}
      >
        <div className="lx-split">
          <SplitPhoto
            src="/images/home/hero/luxury-property-facade-hero.jpg"
            width={1672}
            height={941}
            alt=""
            crop="lx-crop-x-65 lx-crop-lg-x-80"
          />
          <ChapterText
            id={CHAPTERS.patrimony}
            marker={patrimony.marker}
            title={<HeadlineText headline={patrimony.title} />}
            lines={patrimony.text}
          />
        </div>
        <div className="lx-container">
          <div className="lx-answers">
            <AnswerRow label={patrimony.own.question}>
              <ModalityAnswer pair={patrimony.own.pair} lead />
            </AnswerRow>
            {patrimony.answers.map((answer) => (
              <AnswerRow label={answer.question} key={answer.question}>
                <NoAnswer lines={answer.answer} />
              </AnswerRow>
            ))}
          </div>
          <Statement value={patrimony.closing} />
        </div>
      </section>

      {/* 08–11 — Liberdade (texto | imagem) sobre Warm Sand: uso, quanto tempo (configurações) e o que não for usado. */}
      <section
        id={CHAPTERS.freedom}
        className="lx-section-split"
        data-surface="sand"
        aria-labelledby={titleOf(CHAPTERS.freedom)}
      >
        <div className="lx-split">
          <ChapterText
            id={CHAPTERS.freedom}
            marker={freedom.marker}
            title={<HeadlineText headline={freedom.title} />}
            lines={freedom.text}
          />
          <SplitPhoto
            src="/images/como-funciona/problema-imovel.jpg"
            width={1024}
            height={576}
            alt=""
            crop="lx-crop-x-80"
          />
        </div>
        <div className="lx-container">
          <div className="lx-answers">
            <AnswerRow label={freedom.use.question}>
              <ModalityAnswer pair={freedom.use.pair} />
              <p className="lx-body">{freedom.use.after}</p>
            </AnswerRow>
            <AnswerRow label={freedom.configurations.question} full={<Configurations />}>
              <Paragraphs lines={freedom.configurations.text} />
            </AnswerRow>
            <AnswerRow label={freedom.unused.question}>
              <ModalityAnswer pair={freedom.unused.pair} />
            </AnswerRow>
          </div>
        </div>
      </section>

      {/* 12 — Gestão (imagem | texto) sobre Warm Sand: quem cuida, Owner | Co-Owner; fechamento. */}
      <section
        id={SECTIONS.management}
        className="lx-section-split"
        data-surface="sand"
        aria-labelledby={titleOf(SECTIONS.management)}
      >
        <div className="lx-split">
          <SplitPhoto
            src="/images/home/kaizen/kaizen-k05.jpg"
            width={1376}
            height={768}
            alt={home.media.kaizenSuite.alt}
            crop="lx-crop-x-20"
          />
          <ChapterText
            id={SECTIONS.management}
            marker={management.marker}
            title={management.title}
          />
        </div>
        <div className="lx-container">
          <div className="lx-answers">
            <AnswerRow label={management.question}>
              <ModalityAnswer pair={management.pair} />
            </AnswerRow>
          </div>
          <div className="lx-section-closing lx-stack">
            <p className="lx-subheadline">{management.closing[0]}</p>
            <p className="lx-headline">{management.closing[1]}</p>
          </div>
        </div>
      </section>

      {/* 13 — Luxtory Club: Luxchange, Luxplus e Locação como lista editorial; nota e statement. */}
      <section
        id={SECTIONS.club}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(SECTIONS.club)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <div className="lx-section-head__mark">
              <Eyebrow>{nb(club.marker)}</Eyebrow>
              <span className="lx-section-head__rule" aria-hidden="true" />
            </div>
            <h2 id={titleOf(SECTIONS.club)} className="lx-headline">
              {nb(club.title)}
            </h2>
            <p className="lx-subheadline">{nb(club.lead)}</p>
          </div>
          <ol className="lx-numbered">
            {club.items.map((item, index) => (
              <li className="lx-numbered__item" key={item.title}>
                <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-display-m">{item.title}</h3>
                <div className="lx-numbered__text lx-stack">
                  <Paragraphs lines={item.text} />
                  {'coOwner' in item ? (
                    <div className="lx-numbered__note">
                      <p className="lx-eyebrow">
                        <span className="lx-nowrap">{modality.co_owner}</span>
                      </p>
                      <p className="lx-body">{nb(item.coOwner)}</p>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="lx-section-closing lx-stack">
            <Paragraphs lines={club.note} />
          </div>
          <Statement value={club.closing} />
        </div>
      </section>

      {/* 14–16 — Pertencimento (imagem | texto) sobre Moroccan Blue: o que torna diferente, convidados; fechamento. */}
      <section
        id={CHAPTERS.belonging}
        className="lx-section-split"
        data-surface="blue"
        aria-labelledby={titleOf(CHAPTERS.belonging)}
      >
        <div className="lx-split">
          <SplitPhoto
            src="/images/home/kaizen/kaizen-k09.jpg"
            width={1376}
            height={768}
            alt={home.media.kaizen.alt}
            crop="lx-crop-x-50 lx-crop-y-65"
          />
          <ChapterText
            id={CHAPTERS.belonging}
            marker={belonging.marker}
            title={<HeadlineText headline={belonging.title} />}
            lines={belonging.text}
          />
        </div>
        <div className="lx-container">
          <div className="lx-answers">
            <AnswerRow label={belonging.difference.question}>
              <Paragraphs lines={belonging.difference.text} />
              <ModalityAnswer pair={belonging.difference.pair} />
            </AnswerRow>
            <AnswerRow label={belonging.guests.question}>
              <Paragraphs lines={belonging.guests.answer} />
            </AnswerRow>
          </div>
          <Statement value={belonging.closing} />
        </div>
      </section>

      {/* 17 — O que preciso saber antes de decidir: White, linhas numeradas, sempre visíveis. */}
      <section
        id={SECTIONS.conditions}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(SECTIONS.conditions)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf(SECTIONS.conditions)} className="lx-headline">
              {conditions.title}
            </h2>
          </div>
          <ol className="lx-numbered">
            {conditions.items.map((item, index) => (
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

      {/* 18 — Faz sentido para a sua vida: as duas listas com o mesmo peso, sobre Warm Sand. */}
      <section
        id={SECTIONS.fit}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(SECTIONS.fit)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{fit.marker}</Eyebrow>
            <h2 id={titleOf(SECTIONS.fit)} className="lx-headline">
              <HeadlineText headline={fit.title} />
            </h2>
            <Paragraphs lines={fit.intro} className="lx-subheadline" />
          </div>
          <div className="lx-comparison lx-comparison--divided">
            {[
              { title: fit.fitsTitle, items: fit.fits },
              { title: fit.notFitsTitle, items: fit.notFits },
            ].map((side) => (
              <div className="lx-comparison__item" key={side.title}>
                <h3 className="lx-subheadline">{side.title}</h3>
                <ul className="lx-comparison__list">
                  {side.items.map((item) => (
                    <li className="lx-body" key={item}>
                      {nb(item)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 19 — CTA final sobre a fotografia de fechamento; o próximo passo depende do que está publicado (D-B2C-16). */}
      <section
        id={SECTIONS.next}
        className="lx-hero lx-hero--closing lx-hero--uniform"
        data-surface="blue"
        aria-labelledby={titleOf(SECTIONS.next)}
      >
        <div className="lx-hero__slides" aria-hidden="true">
          <div className="lx-hero__slide" data-active="">
            {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */}
            <img
              className="lx-hero__image lx-crop-x-20 lx-crop-y-65 lx-crop-lg-x-50"
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
            <h2 id={titleOf(SECTIONS.next)} className="lx-headline">
              {page.next.title}
            </h2>
            {hasCatalog ? <p className="lx-subheadline">{nb(page.next.text)}</p> : null}
            <CatalogActions
              cta={cta}
              next={{ none: qualification.nextHowItWorks.none }}
              from="howItWorks"
              cinematic
            />
          </div>
        </div>
      </section>
    </DiscoverySite>
  );
}
