'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import type { Ground } from './logo';

export interface AppShellMenuLabels {
  readonly open: string;
  readonly close: string;
  readonly menu: string;
  readonly nav: string;
}

/**
 * Gaveta das superfícies de produto abaixo do `lg`: `dialog` nativo com `showModal()` — foco preso, Esc fecha e o
 * foco volta ao botão. Se a janela cruzar o `lg` com a gaveta aberta, ela fecha e o foco vai ao conteúdo principal,
 * porque o botão de menu deixa de existir.
 */
export function AppShellMenu({
  ground,
  mainId,
  labels,
  logo,
  nav,
  account,
}: {
  readonly ground: Ground;
  readonly mainId: string;
  readonly labels: AppShellMenuLabels;
  readonly logo: ReactNode;
  readonly nav: ReactNode;
  readonly account: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // O corte vem do token (--lx-breakpoint-lg), não de um valor repetido aqui.
    const lg = getComputedStyle(document.documentElement).getPropertyValue('--lx-breakpoint-lg');
    const query = window.matchMedia(`(min-width: ${lg.trim()})`);
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches || dialog.current?.open !== true) return;
      dialog.current.close();
      document.getElementById(mainId)?.focus();
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mainId]);

  return (
    <>
      <button
        className="lx-icon-button lx-app__menu-button"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Icon name="menu" />
        <span className="lx-visually-hidden">{labels.open}</span>
      </button>
      <dialog
        ref={dialog}
        id={dialogId}
        className="lx-mobile-nav"
        data-ground={ground}
        aria-label={labels.menu}
        onClose={() => setOpen(false)}
      >
        <div className="lx-mobile-nav__top">
          {logo}
          <button className="lx-icon-button" type="button" onClick={() => dialog.current?.close()}>
            <Icon name="close" />
            <span className="lx-visually-hidden">{labels.close}</span>
          </button>
        </div>
        <nav className="lx-mobile-nav__body" aria-label={labels.nav}>
          {nav}
        </nav>
        <div className="lx-mobile-nav__footer">{account}</div>
      </dialog>
    </>
  );
}
