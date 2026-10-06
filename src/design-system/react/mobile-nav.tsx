'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import type { Ground } from './logo';

export interface MobileNavLabels {
  readonly open: string;
  readonly close: string;
  readonly menu: string;
  readonly nav: string;
}

export function MobileNav({
  ground,
  mainId,
  labels,
  buttonClassName,
  logo,
  nav,
  footer,
  trigger,
  mode = 'mobile',
  surface,
}: {
  readonly ground: Ground;
  /** Superfície do Core (`data-surface`); sem ela, o fundo legado (`data-ground`). */
  readonly surface?: 'blue' | 'deep';
  readonly mainId: string;
  readonly labels: MobileNavLabels;
  readonly buttonClassName: string;
  readonly logo: ReactNode;
  readonly nav: ReactNode;
  readonly footer?: ReactNode;
  readonly trigger?: ReactNode;
  readonly mode?: 'mobile' | 'retractable';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (mode === 'retractable') return;
    const lg = getComputedStyle(document.documentElement).getPropertyValue('--lx-breakpoint-lg');
    const query = window.matchMedia(`(min-width: ${lg.trim()})`);
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches || dialog.current?.open !== true) return;
      dialog.current.close();
      document.getElementById(mainId)?.focus();
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mainId, mode]);

  return (
    <>
      <button
        className={`lx-icon-button ${buttonClassName}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        {trigger ?? <Icon name="menu" />}
        <span className="lx-visually-hidden">{labels.open}</span>
      </button>
      <dialog
        ref={dialog}
        id={dialogId}
        className="lx-mobile-nav"
        data-ground={surface === undefined ? ground : undefined}
        data-surface={surface}
        data-mode={mode}
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
        {footer === undefined ? null : <div className="lx-mobile-nav__footer">{footer}</div>}
      </dialog>
    </>
  );
}
