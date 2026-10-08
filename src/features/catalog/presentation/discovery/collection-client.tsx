'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Melhorias de cliente da Coleção (spec catalog §13.12). Sem JS, a página continua inteira: o formulário GET funciona,
 * as facetas são `<details>` nativos em qualquer largura e a barra compacta simplesmente não aparece.
 */

/** Botão "Filtros (n)" do celular: abre o diálogo em tela cheia (renderizado fora do formulário da busca). */
export function FiltersTrigger({
  dialogId,
  label,
}: {
  readonly dialogId: string;
  readonly label: string;
}) {
  return (
    <div className="lx-discovery__mobile">
      <button
        className="lx-discovery__open"
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          const dialog = document.getElementById(dialogId);
          if (dialog instanceof HTMLDialogElement) dialog.showModal();
        }}
      >
        {label}
      </button>
    </div>
  );
}

/** Diálogo dos filtros (celular): os mesmos campos num formulário próprio; "Ver resultados" e "Limpar" fixos. */
export function FiltersDialog({
  id,
  title,
  closeLabel,
  action,
  hidden,
  children,
  footer,
}: {
  readonly id: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly action: string;
  readonly hidden: ReactNode;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={dialog}
      id={id}
      className="lx-filters"
      data-surface="white"
      aria-labelledby={`${id}-title`}
    >
      <form className="lx-filters__form" action={action} method="get">
        <div className="lx-filters__bar">
          <h2 className="lx-filters__title" id={`${id}-title`}>
            {title}
          </h2>
          <button
            className="lx-filters__close"
            type="button"
            onClick={() => dialog.current?.close()}
          >
            {closeLabel}
          </button>
        </div>
        <div className="lx-filters__body">
          {hidden}
          {children}
        </div>
        <div className="lx-filters__foot">{footer}</div>
      </form>
    </dialog>
  );
}

/**
 * Barra compacta do desktop: aparece, fixa no topo, quando a barra do Hero sai da tela por cima; some quando ela volta.
 * Sem JS, nunca aparece (o atributo `hidden` vem do servidor).
 */
export function StickyDiscovery({
  watchId,
  children,
}: {
  readonly watchId: string;
  readonly children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = document.getElementById(watchId);
    if (target === null) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined) return;
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);
  return (
    <div className="lx-discovery-sticky" hidden={!visible} data-surface="white">
      <div className="lx-container">{children}</div>
    </div>
  );
}
