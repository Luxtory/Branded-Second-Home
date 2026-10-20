import { Icon } from '@/design-system/react';
import type { PublicCollectionHomeEdition, PublicCover } from '../../application/collection-views';
import type { MediaOwner } from '../../domain/collection';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import { coverSrcSet, factsLine, projectedLine } from './collection-labels';
import { toParagraphs } from './paragraphs';
import { discoveryPaths } from './paths';

/** Partes públicas da Home Edition (spec catalog §17.8): texto registrado, mídia aprovada e o card no Home Concept. */
const text = discoveryMessages;

/** Texto registrado, em parágrafos, como está (BR-013, BR-031; spec catalog §13.7). */
export function Registered({ value }: { readonly value: string }) {
  return (
    <>
      {toParagraphs(value).map((paragraph) => (
        <p className="lx-body" key={paragraph}>
          {paragraph}
        </p>
      ))}
    </>
  );
}

/**
 * Uma mídia aprovada servida pelo próprio domínio (ADR-0015), com o foco registrado; `className` dá o quadro (proporção)
 * de quem compõe. Sem `alt` decorativo: a mídia da Home Edition é conteúdo.
 */
export function MediaImage({
  media,
  owner,
  className,
  sizes,
  eager = false,
}: {
  readonly media: PublicCover;
  readonly owner: MediaOwner;
  readonly className: string;
  readonly sizes: string;
  readonly eager?: boolean;
}) {
  const { src, srcSet } = coverSrcSet(media, owner);
  const largest = media.widths[media.widths.length - 1];
  return (
    <figure className={`lx-media ${className} lx-crop-x-${media.cropX} lx-crop-y-${media.cropY}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- mídia servida pelo próprio domínio (ADR-0015); Next/Image injeta estilo inline barrado pela CSP. */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={media.alt}
        width={largest?.width}
        height={largest?.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </figure>
  );
}

const CARD_SIZES = '(min-width: 64rem) 30vw, (min-width: 48rem) 46vw, 100vw';

/**
 * Card de uma Home Edition publicada na página do Home Concept: imagem principal ou quadro tipográfico, nome, tipologia,
 * capacidade, suítes, área e a média projetada vigente com o rótulo; o card inteiro leva à Home Edition.
 */
export function HomeEditionCard({
  homeConceptId,
  homeEdition,
}: {
  readonly homeConceptId: string;
  readonly homeEdition: PublicCollectionHomeEdition;
}) {
  const projected = projectedLine(homeEdition);
  return (
    <article className="lx-home-edition-card">
      {homeEdition.cover === null ? (
        <div
          className="lx-home-edition-card__media lx-home-edition-card__media--type"
          data-surface="blue"
          aria-hidden="true"
        >
          <span className="lx-home-edition-card__word">{homeEdition.name}</span>
        </div>
      ) : (
        <MediaImage
          media={homeEdition.cover}
          owner="homeEdition"
          className="lx-home-edition-card__media"
          sizes={CARD_SIZES}
        />
      )}
      <div className="lx-home-edition-card__body">
        <p className="lx-eyebrow">{homeEdition.typology}</p>
        <h3 className="lx-display-m lx-home-edition-card__title">
          <a
            className="lx-home-edition-card__link"
            href={discoveryPaths.homeEdition(homeConceptId, homeEdition.id)}
          >
            {homeEdition.name}
          </a>
        </h3>
        <p className="lx-home-edition-card__facts">{factsLine(homeEdition)}</p>
        {projected === null ? null : <p className="lx-home-edition-card__facts">{projected}</p>}
        <span className="lx-home-edition-card__cta" aria-hidden="true">
          {text.actions.viewHomeEdition}
          <Icon name="arrow-right" className="lx-link__icon" />
        </span>
      </div>
    </article>
  );
}
