import type { ReactNode } from 'react';

export interface CollectionItem {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  /** Regiões reais das Editions (eyebrow do card); vazio = sem eyebrow. */
  readonly marker: readonly string[];
  /** Slot abaixo do título (ex.: `ConceptCredit` e os dados do card); ausente = nada. */
  readonly details?: ReactNode;
  /** Texto do convite ao fim do card (i18n do slice). Visual: o card inteiro já é o link do título. */
  readonly cue?: string;
}

/**
 * Coleção no Core (docs/specs/design-system.md §13.5, receita catalog §13.9): Sibling Blocks de cards tipográficos —
 * sem fotografia oficial (P-1), cada card é uma placa Deep com o número da sequência (decorativo), as regiões, o nome e
 * os dados. Um só link por card: o título, estendido ao card inteiro. `feature` (Concepts com Edition): dois por linha;
 * `compact`: tantos quantos couberem. `label` nomeia a lista.
 */
export function Collection({
  items,
  label,
  headingLevel = 3,
  variant = 'compact',
}: {
  readonly items: readonly CollectionItem[];
  readonly label: string;
  readonly headingLevel?: 2 | 3;
  readonly variant?: 'compact' | 'feature';
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <ul
      className={variant === 'feature' ? 'lx-siblings lx-siblings--pair' : 'lx-siblings'}
      aria-label={label}
    >
      {items.map((item, index) => (
        <li key={item.id}>
          <article className="lx-collection-card" data-surface="deep">
            <span className="lx-collection-card__index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            {item.marker.length === 0 ? null : (
              <p className="lx-eyebrow">{item.marker.join(' · ')}</p>
            )}
            <Heading className="lx-collection-card__title">
              <a className="lx-collection-card__link" href={item.href}>
                {item.title}
              </a>
            </Heading>
            {item.details === undefined ? null : (
              <div className="lx-collection-card__details">{item.details}</div>
            )}
            {item.cue === undefined ? null : (
              <p className="lx-collection-card__cue" aria-hidden="true">
                {item.cue}
              </p>
            )}
          </article>
        </li>
      ))}
    </ul>
  );
}
