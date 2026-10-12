import { HeadlineText } from '../discovery/headline';
import { nb } from '../discovery/no-break';
import { ActionLink, Eyebrow, ordinal } from '../discovery/parts';
import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { HeroMedia } from './media';
import { brandPartnersPaths, BRAND_PARTNERS_HOW_SECTIONS, titleOf } from './paths';
import { AnswerRows, Paragraphs, Rich } from './rich-text';
import { BrandPartnersSite } from './site';

const { opening, path, decisions, governance, club, conditions, fit, next } = text.howItWorks;

const [OPENING, PATH, DECISIONS, GOVERNANCE, CLUB, CONDITIONS, FIT, NEXT] =
  BRAND_PARTNERS_HOW_SECTIONS;

/** As sete expressões do índice da copy → as âncoras reais da página. */
const INDEX = [
  [PATH, opening.index.path],
  [DECISIONS, opening.index.decisions],
  [GOVERNANCE, opening.index.governance],
  [CLUB, opening.index.club],
  [CONDITIONS, opening.index.conditions],
  [FIT, opening.index.fit],
  [NEXT, opening.index.next],
] as const;

type Step = (typeof path.phases)[number]['steps'][number];

/** Owner e Co-Owner com o mesmo peso (REQ-103): comparação aberta, Owner primeiro no celular. */
function Modalities({ step }: { readonly step: Step }) {
  if (!('modalities' in step)) return null;
  return (
    <>
      <div className="lx-comparison lx-comparison--divided" data-pair="modality">
        {[step.modalities.owner, step.modalities.coOwner].map((side) => (
          <div className="lx-comparison__item" key={side.name}>
            <h5 className="lx-title">
              <span className="lx-nowrap">{side.name}</span>
            </h5>
            <p className="lx-body">{side.text}</p>
          </div>
        ))}
      </div>
      <Paragraphs lines={step.after} />
    </>
  );
}

/** Numeração corrida das sete etapas, através das três fases (01 → 07). */
const PHASE_OFFSETS = path.phases.map((_, index) =>
  path.phases.slice(0, index).reduce((total, phase) => total + phase.steps.length, 0),
);

/**
 * Como funciona Brand Partners `/brand-partner/como-funciona` (REQ-028; BP1.1, spec catalog §14.9): Product Aware →
 * Most Aware, PROOF → PUSH sem reconstruir os três primeiros Ps da Home. Percurso → decisões e remuneração →
 * governança → Luxtory Club (modelo previsto) → condições → qualificação → próximo passo; o CTA leva ao formulário da
 * Home, sem duplicá-lo.
 */
export function BrandPartnersHowItWorksPage() {
  return (
    <BrandPartnersSite current="howItWorks">
      {/* Abertura — Cinematic Hero (M4) com o índice da página como âncoras reais. */}
      <section
        id={OPENING}
        className="lx-hero lx-hero--uniform"
        data-surface="blue"
        aria-labelledby={titleOf(OPENING)}
      >
        <HeroMedia slot="m4" priority />
        <div className="lx-container lx-hero__content">
          <div className="lx-hero__copy">
            <Eyebrow>{opening.marker}</Eyebrow>
            <h1 id={titleOf(OPENING)} className="lx-headline">
              {opening.title}
            </h1>
            <Paragraphs lines={opening.body} className="lx-subheadline" />
            <nav className="lx-anchors" aria-label={opening.indexLabel}>
              <ul>
                {INDEX.map(([anchor, label]) => (
                  <li key={anchor}>
                    <a href={`#${anchor}`}>{label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </section>

      {/* Percurso — White: três fases (rótulo | etapas numeradas 01 → 07); Owner | Co-Owner com o mesmo peso. */}
      <section
        id={PATH}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(PATH)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{path.marker}</Eyebrow>
            <h2 id={titleOf(PATH)} className="lx-headline">
              {path.title}
            </h2>
          </div>
          <div className="lx-answers lx-answers--phases">
            {path.phases.map((phase, phaseIndex) => (
              <div className="lx-answers__row" key={phase.name}>
                <h3 className="lx-answers__label lx-subheadline">{phase.name}</h3>
                <div className="lx-answers__content">
                  <ol className="lx-numbered" start={(PHASE_OFFSETS[phaseIndex] ?? 0) + 1}>
                    {phase.steps.map((step, index) => (
                      <li className="lx-numbered__item" key={step.title}>
                        <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                          {ordinal((PHASE_OFFSETS[phaseIndex] ?? 0) + index)}
                        </span>
                        <h4 className="lx-display-s">
                          <Rich value={step.title} />
                        </h4>
                        <div className="lx-numbered__text lx-stack">
                          <Paragraphs lines={step.paragraphs} />
                          <Modalities step={step} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Decisões e remuneração — Sand: decisão | quem decide; depois licenciamento e remuneração (sem valores). */}
      <section
        id={DECISIONS}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(DECISIONS)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{decisions.marker}</Eyebrow>
            <h2 id={titleOf(DECISIONS)} className="lx-headline">
              {decisions.title}
            </h2>
          </div>
          <div className="lx-stack">
            <AnswerRows
              answers={decisions.rows.map((row) => ({ question: row.decision, answer: [row.who] }))}
            />
            <p className="lx-body">{decisions.responsibilities}</p>
          </div>
          <div className="lx-section-group">
            <AnswerRows answers={decisions.answers} />
          </div>
        </div>
      </section>

      {/* Governança — Blue: as seis perguntas da marca, sempre abertas. */}
      <section
        id={GOVERNANCE}
        className="lx-section"
        data-surface="blue"
        aria-labelledby={titleOf(GOVERNANCE)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{governance.marker}</Eyebrow>
            <h2 id={titleOf(GOVERNANCE)} className="lx-headline">
              {governance.title}
            </h2>
          </div>
          <AnswerRows answers={governance.answers} />
        </div>
      </section>

      {/* Luxtory Club — Deep: modelo previsto (R3 não operacional), nunca disponibilidade atual; o limite fecha. */}
      <section id={CLUB} className="lx-section" data-surface="deep" aria-labelledby={titleOf(CLUB)}>
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{club.marker}</Eyebrow>
            <h2 id={titleOf(CLUB)} className="lx-headline">
              {club.title}
            </h2>
            <p className="lx-subheadline">{nb(club.intro)}</p>
          </div>
          <ol className="lx-numbered">
            {club.mechanisms.map((mechanism, index) => (
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
          {/* A pergunta da marca sem linhas próprias: a lista acima e o limite abaixo já trazem as hairlines. */}
          <div className="lx-section-group">
            <h3 className="lx-subheadline">{club.brand.question}</h3>
            <Paragraphs lines={club.brand.answer} />
          </div>
          <div className="lx-section-note lx-stack">
            <Paragraphs lines={club.limit} />
          </div>
        </div>
      </section>

      {/* Condições e expansão — White: três perguntas; as condições ficam integradas às respostas. */}
      <section
        id={CONDITIONS}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(CONDITIONS)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{conditions.marker}</Eyebrow>
            <h2 id={titleOf(CONDITIONS)} className="lx-headline">
              {conditions.title}
            </h2>
          </div>
          <AnswerRows answers={conditions.answers} />
        </div>
      </section>

      {/* Para quem faz sentido — Sand: faz sentido | pode não fazer sentido, com o mesmo peso. */}
      <section id={FIT} className="lx-section" data-surface="sand" aria-labelledby={titleOf(FIT)}>
        <div className="lx-container">
          <div className="lx-section-head">
            <Eyebrow>{fit.marker}</Eyebrow>
            <h2 id={titleOf(FIT)} className="lx-headline">
              <HeadlineText headline={fit.title} />
            </h2>
            <Paragraphs lines={fit.intro} className="lx-subheadline" />
          </div>
          <div className="lx-comparison lx-comparison--divided">
            {[fit.yes, fit.no].map((side) => (
              <div className="lx-comparison__item" key={side.title}>
                <h3 className="lx-display-s">{side.title}</h3>
                <ul className="lx-comparison__list">
                  {side.items.map((item) => (
                    <li className="lx-body" key={item}>
                      <Rich value={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PUSH final — Blue, pausa centrada; o CTA leva ao formulário da Home. */}
      <section id={NEXT} className="lx-section" data-surface="blue" aria-labelledby={titleOf(NEXT)}>
        <div className="lx-container">
          <div className="lx-pause">
            <Eyebrow>{next.marker}</Eyebrow>
            <h2 id={titleOf(NEXT)} className="lx-headline">
              {next.title}
            </h2>
            <Paragraphs lines={next.paragraphs} />
            <div className="lx-hero__actions">
              <ActionLink href={brandPartnersPaths.conversation} label={next.action} primary />
            </div>
            <p className="lx-body">{nb(next.support)}</p>
          </div>
        </div>
      </section>
    </BrandPartnersSite>
  );
}
