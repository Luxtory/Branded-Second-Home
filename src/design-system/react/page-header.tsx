import type { ReactNode } from 'react';

export interface PageContext {
  readonly href: string;
  readonly label: string;
}

/**
 * Cabeçalho de toda página de produto (ADR-0009): o único `h1` da página e a descrição. Opcionais (W3): `context`, o
 * link para o nível de cima da hierarquia, e `actions`, as ações da página.
 */
export function PageHeader({
  title,
  lead,
  context,
  actions,
}: {
  readonly title: ReactNode;
  readonly lead?: ReactNode;
  readonly context?: PageContext;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="lx-page-header">
      {context === undefined ? null : (
        <p className="lx-page-header__context">
          <a className="lx-link" href={context.href}>
            {context.label}
          </a>
        </p>
      )}
      <h1 className="lx-display-m">{title}</h1>
      {lead === undefined ? null : <p className="lx-lead lx-page-header__lead">{lead}</p>}
      {actions === undefined ? null : <div className="lx-page-header__actions">{actions}</div>}
    </header>
  );
}
