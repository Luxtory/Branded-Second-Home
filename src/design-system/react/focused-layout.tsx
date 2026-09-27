import type { ReactNode } from 'react';
import { Logo } from './logo';

/**
 * Layout focado (ADR-0009): uma tarefa, sem navegação — login, segundo fator, acesso negado, indisponível e erro. O
 * painel ocupa a tela no celular e fica centralizado sobre o fundo wash a partir de `md`.
 */
export function FocusedLayout({
  brand,
  children,
}: {
  readonly brand: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="lx-focused" data-ground="wash" data-expression="product">
      <main className="lx-focused__panel" id="conteudo" data-ground="paper">
        <Logo ground="paper" label={brand} />
        <div className="lx-focused__body">{children}</div>
      </main>
    </div>
  );
}
