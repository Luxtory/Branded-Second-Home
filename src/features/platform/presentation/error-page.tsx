'use client';

import { FocusedLayout } from '@/design-system/react';
import { messages } from './i18n/pt-br';

/**
 * Erro inesperado numa página (error boundary do App Router): estado de erro no layout focado, com nova tentativa. O
 * detalhe fica no log estruturado do servidor, nunca na tela (TECH-056).
 */
export function ErrorPage({ reset }: { readonly error: Error; readonly reset: () => void }) {
  const text = messages.pageError;
  return (
    <FocusedLayout brand={messages.site.name}>
      <p className="lx-label">{text.marker}</p>
      <h1 className="lx-display-s">{text.title}</h1>
      <p className="lx-body">{text.body}</p>
      <button className="lx-button lx-button--primary" type="button" onClick={reset}>
        {text.retry}
      </button>
    </FocusedLayout>
  );
}
