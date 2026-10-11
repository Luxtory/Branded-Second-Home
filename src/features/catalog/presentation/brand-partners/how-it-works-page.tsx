import { nb } from '../discovery/no-break';
import { ordinal } from '../discovery/parts';
import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { brandPartnersPaths, BRAND_PARTNERS_HOW_SECTIONS, titleOf } from './paths';
import { AnswerRows, Paragraphs } from './rich-text';
import { BrandPartnersSite } from './site';

const { opening, path, governance, roles, continuity, next } = text.howItWorks;

const [OPENING, PATH, GOVERNANCE, ROLES, CONTINUITY, NEXT] = BRAND_PARTNERS_HOW_SECTIONS;

/** As cinco expressões do índice da copy → as âncoras reais da página. */
const INDEX = [
  [PATH, opening.index.path],
  [GOVERNANCE, opening.index.governance],
  [ROLES, opening.index.roles],
  [CONTINUITY, opening.index.continuity],
  [NEXT, opening.index.next],
] as const;

type Step = (typeof path.steps)[number];

/** Owner e Co-Owner com o mesmo peso (REQ-103): comparação aberta, Owner primeiro no celular. */
function Modalities({ step }: { readonly step: Step }) {
  if (!('modalities' in step)) return null;
  return (
    <>
      <div className="lx-comparison lx-comparison--divided" data-pair="modality">
        {[step.modalities.owner, step.modalities.coOwner].map((side) => (
          <div className="lx-comparison__item" key={side.name}>
            <h4 className="lx-title">
              <span className="lx-nowrap">{side.name}</span>
            </h4>
            <p className="lx-body">{side.text}</p>
          </div>
        ))}
      </div>
      <Paragraphs lines={step.after} className="lx-body lx-stack__pause" />
    </>
  );
}

/**
 * Como funciona Brand Partners `/brand-partner/como-funciona` (REQ-028, spec catalog §14.2): Product Aware, PROOF →
 * PUSH sem reconstruir os três primeiros Ps da Home. Clareza → mecanismo → governança → responsabilidades → condições
 * → decisão; o CTA leva ao formulário da Home, sem duplicá-lo.
 */
export function BrandPartnersHowItWorksPage() {
  return (
    <BrandPartnersSite current="howItWorks">
      {/* C1 — Abertura: Deep, coluna editorial; o índice da copy como âncoras reais. */}
      <section
        id={OPENING}
        className="lx-section"
        data-surface="deep"
        aria-labelledby={titleOf(OPENING)}
      >
        <div className="lx-container">
          <div className="lx-stack lx-stack--editorial">
            <h1 id={titleOf(OPENING)} className="lx-headline">
              {opening.title}
            </h1>
            <p className="lx-subheadline">{opening.body}</p>
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

      {/* C2 — Percurso: White, lista numerada 01 → 06; etapa 04 com Owner | Co-Owner. */}
      <section
        id={PATH}
        className="lx-section"
        data-surface="white"
        aria-labelledby={titleOf(PATH)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf(PATH)} className="lx-headline">
              {path.title}
            </h2>
          </div>
          <ol className="lx-numbered">
            {path.steps.map((step, index) => (
              <li className="lx-numbered__item" key={step.title}>
                <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
                  {ordinal(index)}
                </span>
                <h3 className="lx-title">{step.title}</h3>
                <div className="lx-numbered__text lx-stack">
                  <Paragraphs lines={step.paragraphs} />
                  <Modalities step={step} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* C3 — Governança: Blue, pergunta | resposta, abertas (leitura comparativa). */}
      <section
        id={GOVERNANCE}
        className="lx-section"
        data-surface="blue"
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

      {/* C4 — Papéis e remuneração: Sand, Brand Partner | Luxtory com o mesmo peso; remuneração em largura total. */}
      <section
        id={ROLES}
        className="lx-section"
        data-surface="sand"
        aria-labelledby={titleOf(ROLES)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf(ROLES)} className="lx-headline">
              {roles.title}
            </h2>
          </div>
          <div className="lx-stack">
            <div className="lx-comparison lx-comparison--divided">
              {roles.sides.map((side) => (
                <div className="lx-comparison__item" key={side.title}>
                  <h3 className="lx-title">{side.title}</h3>
                  <Paragraphs lines={side.paragraphs} />
                </div>
              ))}
            </div>
            <p className="lx-body">{roles.responsibilities}</p>
            {/* Remuneração: largura total, sob a hairline da própria linha pergunta | resposta. */}
            <AnswerRows answers={[roles.remuneration]} />
          </div>
        </div>
      </section>

      {/* C5 — Expansão e continuidade: Deep, três respostas; a limitação final fica integrada à resposta. */}
      <section
        id={CONTINUITY}
        className="lx-section"
        data-surface="deep"
        aria-labelledby={titleOf(CONTINUITY)}
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id={titleOf(CONTINUITY)} className="lx-headline">
              {continuity.title}
            </h2>
          </div>
          <AnswerRows answers={continuity.answers} />
        </div>
      </section>

      {/* C6 — PUSH final: Deep, fechamento tipográfico; o CTA leva ao formulário da Home. */}
      <section id={NEXT} className="lx-section" data-surface="deep" aria-labelledby={titleOf(NEXT)}>
        <div className="lx-container">
          <div className="lx-stack lx-stack--editorial">
            <h2 id={titleOf(NEXT)} className="lx-headline">
              {next.title}
            </h2>
            <Paragraphs lines={next.paragraphs} />
            <div>
              <a className="lx-button lx-button--primary" href={brandPartnersPaths.conversation}>
                {next.action}
              </a>
            </div>
            <p className="lx-body">{nb(next.support)}</p>
          </div>
        </div>
      </section>
    </BrandPartnersSite>
  );
}
