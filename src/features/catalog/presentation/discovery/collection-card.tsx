import { Icon } from '@/design-system/react';
import type { PublicCollectionEntry } from '../../application/collection-views';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import {
  cardEyebrow,
  coverSrcSet,
  factsLine,
  fallbackWord,
  projectedLine,
} from './collection-labels';
import { discoveryPaths } from './paths';

/**
 * Card da Coleção (spec catalog §13.12, §17.8): a unidade é o Home Concept, nunca duplicado; as Home Editions publicadas
 * vêm dentro, uma por bloco (nome, fatos, média projetada). O card inteiro é o alvo (link do título → Home Concept). Sem capa, o quadro tipográfico do Core com o lifestyle
 * principal (ou o título), decorativo. Destaque só explícito e com capa: Editorial Split nas 12 colunas.
 */
const text = discoveryMessages.collection.card;

/** Larguras de leitura do `srcset` por quadro: 12/12 no celular, 6/12 no md, 4/12 no lg; o destaque ≈ 7/12. */
const SIZES = '(min-width: 64rem) 30vw, (min-width: 48rem) 46vw, 100vw';
const FEATURED_SIZES = '(min-width: 64rem) 55vw, (min-width: 48rem) 92vw, 100vw';

function Media({
  entry,
  featured,
  eager,
}: {
  readonly entry: PublicCollectionEntry;
  readonly featured: boolean;
  readonly eager: boolean;
}) {
  const cover = entry.cover;
  if (cover === null) {
    return (
      <div
        className="lx-home-concept-card__media lx-home-concept-card__media--type"
        data-surface="blue"
        aria-hidden="true"
      >
        <span className="lx-home-concept-card__word">{fallbackWord(entry)}</span>
      </div>
    );
  }
  const { src, srcSet } = coverSrcSet(cover);
  const largest = cover.widths[cover.widths.length - 1];
  return (
    <figure
      className={`lx-media lx-home-concept-card__media lx-crop-x-${cover.cropX} lx-crop-y-${cover.cropY}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- capa servida pelo próprio domínio (ADR-0015); Next/Image injeta estilo inline barrado pela CSP. */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={featured ? FEATURED_SIZES : SIZES}
        alt={cover.alt}
        width={largest?.width}
        height={largest?.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </figure>
  );
}

export function HomeConceptCard({
  entry,
  featured,
  eager,
}: {
  readonly entry: PublicCollectionEntry;
  readonly featured: boolean;
  readonly eager: boolean;
}) {
  const eyebrow = cardEyebrow(entry);
  return (
    <article
      className={
        featured ? 'lx-home-concept-card lx-home-concept-card--featured' : 'lx-home-concept-card'
      }
    >
      <Media entry={entry} featured={featured} eager={eager} />
      <div className="lx-home-concept-card__body">
        {featured ? <p className="lx-eyebrow">{text.featured}</p> : null}
        {eyebrow === null ? null : <p className="lx-eyebrow">{eyebrow}</p>}
        <h3 className="lx-display-m lx-home-concept-card__title">
          <a className="lx-home-concept-card__link" href={discoveryPaths.homeConcept(entry.id)}>
            {entry.title}
          </a>
        </h3>
        <p className="lx-home-concept-card__meta">
          {text.credit} {entry.brandName}
        </p>
        {entry.homeEditions.length === 0 ? (
          <p className="lx-home-concept-card__none">{text.none}</p>
        ) : (
          <ul className="lx-home-concept-card__home-editions" aria-label={text.homeEditionsLabel}>
            {entry.homeEditions.map((homeEdition) => {
              const projected = projectedLine(homeEdition);
              return (
                <li className="lx-home-concept-card__home-edition" key={homeEdition.id}>
                  <span className="lx-home-concept-card__home-edition-name">
                    {homeEdition.name}
                  </span>
                  <span>{factsLine(homeEdition)}</span>
                  {projected === null ? null : <span>{projected}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <span className="lx-home-concept-card__cta" aria-hidden="true">
          {text.cta}
          <Icon name="arrow-right" className="lx-link__icon" />
        </span>
      </div>
    </article>
  );
}
