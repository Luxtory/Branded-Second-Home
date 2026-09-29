import type { ReactNode } from 'react';

export interface CollectionItem {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  /** Partes do Scene Marker do card (metadado real, ex.: regiões); vazio = sem marker. */
  readonly marker: readonly string[];
  /** Slot abaixo do Frame (ex.: `ConceptCredit`); ausente = nada. */
  readonly credit?: ReactNode;
}

/**
 * Coleção (`lx-collection`): curadoria, não grade de imóveis. Sem fotografia oficial (P-1), cada card é um Frame
 * tipográfico que leva o próprio nome — o título é o link, dentro do Frame, sem repetir o nome abaixo — com o marker
 * de metadado real. Um só link por card; alterna 7 e 4 colunas a partir do `lg`. `label` nomeia a lista.
 */
export function Collection({
  items,
  label,
  headingLevel = 3,
}: {
  readonly items: readonly CollectionItem[];
  readonly label: string;
  readonly headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <ul className="lx-collection" aria-label={label}>
      {items.map((item, index) => (
        <li key={item.id}>
          <article className="lx-collection-card">
            <div
              className={`lx-frame lx-frame--${index % 2 === 0 ? 'living' : 'detail'} lx-frame--typographic`}
            >
              <div className="lx-frame__media" data-ground="night">
                {item.marker.length === 0 ? null : (
                  <p className="lx-marker lx-frame__meta">
                    {item.marker.map((part) => (
                      <span key={part}>{part}</span>
                    ))}
                  </p>
                )}
                <Heading className="lx-frame__title">
                  <a className="lx-collection-card__link" href={item.href}>
                    {item.title}
                  </a>
                </Heading>
              </div>
            </div>
            {item.credit}
          </article>
        </li>
      ))}
    </ul>
  );
}
