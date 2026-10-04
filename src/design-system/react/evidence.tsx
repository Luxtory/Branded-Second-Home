import type { ReactNode } from 'react';

export interface EvidenceItem {
  readonly label: string;
  /** Valor ausente (`undefined`, `null` ou texto vazio) não é renderizado — nada é presumido (TECH-001). */
  readonly value: ReactNode;
}

const isPresent = (value: ReactNode) => value !== undefined && value !== null && value !== '';

/**
 * Evidence (`lx-evidence`, `dl`): dados objetivos. O item sem valor some; sem nenhum valor, a lista inteira some.
 * Nunca preço por dia para Co-Owner (REQ-100) nem promessa de retorno (REQ-101) — o conteúdo vem de quem compõe.
 */
export function Evidence({
  items,
  inline = false,
}: {
  readonly items: readonly EvidenceItem[];
  readonly inline?: boolean;
}) {
  const present = items.filter((item) => isPresent(item.value));
  if (present.length === 0) return null;
  return (
    <dl className={inline ? 'lx-evidence lx-evidence--inline' : 'lx-evidence'}>
      {present.map((item) => (
        <div className="lx-evidence__item" key={item.label}>
          <dt className="lx-evidence__label">{item.label}</dt>
          <dd className="lx-evidence__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
