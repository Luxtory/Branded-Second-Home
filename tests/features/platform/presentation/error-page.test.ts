import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorPage } from '@/features/platform/presentation/error-page';

describe('página de erro inesperado (ADR-0009)', () => {
  it('[TECH-056] layout focado, texto em pt-BR, nova tentativa e nenhum detalhe técnico na tela', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorPage, { error: new Error('segredo interno'), reset: () => undefined }),
    );
    expect(html).toContain('class="lx-focused"');
    expect(html).toContain('Não foi possível carregar esta página.');
    expect(html).toContain('>Tentar de novo</button>');
    expect(html).not.toContain('segredo interno');
  });
});
