import type { CatalogCta } from '../../application/public-views';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { ActionLink } from './parts';
import { discoveryPaths } from './paths';

const { actions } = text;

const collectionHref = {
  editions: `${discoveryPaths.collection}#${discoveryPaths.editionsAnchor}`,
  concepts: `${discoveryPaths.collection}#${discoveryPaths.conceptsAnchor}`,
};

/**
 * Próximo passo por disponibilidade (D-B2C-13, D-B2C-16; spec catalog §13.2). Com Edition, o CTA leva à primeira
 * oferta da Coleção; só com Concepts, aos Home Concepts; sem Concept ou com estado desconhecido, nenhum CTA de
 * catálogo — a falta de dados nunca vira "não há". `from` é a página que compõe: no Como funciona, o caminho para ele
 * não se repete.
 */
export function CatalogActions({
  cta,
  next,
  from,
}: {
  readonly cta: CatalogCta;
  /** Frase do próximo passo para cada estado; ausente = nenhuma frase. */
  readonly next: Readonly<Partial<Record<CatalogCta, string>>>;
  readonly from: 'home' | 'howItWorks';
}) {
  const sentence = next[cta];
  const catalog =
    cta === 'editions'
      ? { href: collectionHref.editions, label: actions.editions }
      : cta === 'concepts'
        ? { href: collectionHref.concepts, label: actions.concepts }
        : null;
  const howItWorks = from === 'home';
  if (sentence === undefined && catalog === null && !howItWorks) return null;
  return (
    <>
      {sentence === undefined ? null : <p className="lx-lead">{sentence}</p>}
      {catalog === null && !howItWorks ? null : (
        <div className="lx-actions-stack">
          {catalog === null ? null : (
            <ActionLink primary href={catalog.href} label={catalog.label} />
          )}
          {howItWorks ? (
            <ActionLink
              primary={catalog === null}
              href={discoveryPaths.howItWorks}
              label={actions.howItWorks}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
