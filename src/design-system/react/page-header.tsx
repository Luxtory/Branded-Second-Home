import type { ReactNode } from 'react';

/** Cabeçalho de toda página de produto (ADR-0009): o único `h1` da página e a descrição. */
export function PageHeader({ title, lead }: { readonly title: ReactNode; readonly lead?: ReactNode }) {
  return (
    <header className="lx-page-header">
      <h1 className="lx-display-m">{title}</h1>
      {lead === undefined ? null : <p className="lx-lead lx-page-header__lead">{lead}</p>}
    </header>
  );
}
