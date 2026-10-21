import { signPresentationContext } from '../application/presentation-context';
import { interestRequestMessages as text } from './i18n/interest-request-pt-br';
import { loadPresentationContextKey } from './interest-config';
import { isInterestFormAvailable } from './interest-gate';
import { InterestRequestForm } from './interest-request-form';
import { interestPublicPaths } from './interest-public-paths';

/** Âncora da seção na página da Home Edition (spec ownership §14.3). */
export const INTEREST_REQUEST_ANCHOR = 'solicitar-conversa';

export interface InterestRequestSectionProps {
  readonly homeEditionId: string;
  /** A média projetada exatamente como a página a mostrou (id e texto); `null` = nenhuma apresentada. */
  readonly presentedProjectedInvestment: { readonly id: string; readonly label: string } | null;
  /** Para onde a falha "Home Edition indisponível" leva (a Coleção). */
  readonly collectionHref: string;
}

/**
 * Seção "Solicitar uma conversa" (spec ownership §14.3, `D-B2C-28`), encaixada pelo shell na página da Home Edition.
 * Só existe com a coleta disponível (portões da §14.9; `D-B2C-10`). Emite, no servidor, o contexto de apresentação
 * assinado com a referência que a página mostrou (`02` §15, item 14) — o navegador só o devolve.
 */
export function InterestRequestSection({
  homeEditionId,
  presentedProjectedInvestment,
  collectionHref,
}: InterestRequestSectionProps) {
  if (!isInterestFormAvailable()) return null;
  const presentationContext = signPresentationContext(
    {
      homeEditionId,
      presentedProjectedInvestmentId: presentedProjectedInvestment?.id ?? null,
    },
    loadPresentationContextKey(process.env),
  );
  const titleId = `${INTEREST_REQUEST_ANCHOR}-titulo`;
  return (
    <section
      id={INTEREST_REQUEST_ANCHOR}
      className="lx-section"
      data-surface="wash"
      aria-labelledby={titleId}
    >
      <div className="lx-container lx-columns lx-columns--aside">
        <div className="lx-stack">
          <h2 id={titleId} className="lx-headline">
            {text.section.title}
          </h2>
          <p className="lx-body">{text.section.lead}</p>
        </div>
        <InterestRequestForm
          homeEditionId={homeEditionId}
          presentedLabel={presentedProjectedInvestment?.label ?? null}
          presentationContext={presentationContext}
          privacyHref={interestPublicPaths.privacy}
          collectionHref={collectionHref}
          text={text}
        />
      </div>
    </section>
  );
}
