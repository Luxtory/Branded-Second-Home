import type { ReactNode } from 'react';

export interface RecordAttribute {
  readonly label: string;
  readonly value: ReactNode;
}

export interface RecordListItem {
  readonly id: string;
  readonly href: string;
  readonly title: ReactNode;
  /** Atributos do registro; valor ausente não é passado (TECH-001: nada é presumido). */
  readonly attributes?: readonly RecordAttribute[];
}

/**
 * Lista de registros das superfícies de produto (D-W3-2, ADR-0010 §9): um item por registro, o título leva ao detalhe
 * e o item inteiro é o alvo. `label` nomeia a lista para leitores de tela.
 */
export function RecordList({
  items,
  label,
}: {
  readonly items: readonly RecordListItem[];
  readonly label: string;
}) {
  return (
    <ul className="lx-record-list" aria-label={label}>
      {items.map((item) => (
        <li className="lx-record-list__item" key={item.id}>
          <h3 className="lx-record-list__title">
            <a className="lx-record-list__link" href={item.href}>
              {item.title}
            </a>
          </h3>
          {item.attributes === undefined || item.attributes.length === 0 ? null : (
            <dl className="lx-record-list__meta">
              {item.attributes.map((attribute) => (
                <div className="lx-record-list__meta-item" key={attribute.label}>
                  <dt className="lx-record-list__meta-label">{attribute.label}</dt>
                  <dd className="lx-record-list__meta-value">{attribute.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}
