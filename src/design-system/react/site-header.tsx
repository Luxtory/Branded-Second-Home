'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Depois desta rolagem o header sobre a mídia vira sólido (Moroccan Blue); antes, a fotografia aparece por trás dele.
const SOLID_AFTER_PX = 12;

/**
 * Header do site público no Core (docs/specs/design-system.md §13.5). Melhoria progressiva: ao montar, marca a raiz do
 * Core com `data-lx-js` — só então o header sobre a mídia (`--overlay`) fica fixo — e acompanha a rolagem para ficar
 * sólido (`data-scrolled`). Sem JS, o header fica no topo, transparente, e rola com a página.
 */
export function SiteHeader({
  overlay,
  retractable,
  navAtEnd = false,
  children,
}: {
  readonly overlay: boolean;
  readonly retractable: boolean;
  /** Nav junto das ações, no fim da barra (`lx-header--nav-end`). */
  readonly navAtEnd?: boolean;
  readonly children: ReactNode;
}) {
  const header = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    header.current?.closest('[data-lx="core"]')?.setAttribute('data-lx-js', '');
    if (!overlay) return;
    const sync = () => setScrolled(window.scrollY > SOLID_AFTER_PX);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    return () => window.removeEventListener('scroll', sync);
  }, [overlay]);

  return (
    <header
      ref={header}
      className={[
        'lx-header',
        overlay ? 'lx-header--overlay' : '',
        retractable ? 'lx-header--retractable' : '',
        navAtEnd ? 'lx-header--nav-end' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-surface="blue"
      data-scrolled={scrolled ? '' : undefined}
    >
      {children}
    </header>
  );
}
