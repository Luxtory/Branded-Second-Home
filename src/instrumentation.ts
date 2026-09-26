import type { Instrumentation } from 'next';
// Imports diretos (não o barrel do módulo): este arquivo também é compilado para o Edge runtime.
import { rootLogger } from '@/features/platform/infrastructure/logger';
import { CORRELATION_HEADER } from '@/features/platform/presentation/correlation';

/** Erros não tratados fora de `withRoute` (páginas, layouts) viram log estruturado (CLAUDE.md → Observability). */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const header = request.headers[CORRELATION_HEADER] ?? request.headers['x-vercel-id'];
  rootLogger.error('unhandled request error', {
    correlation_id: Array.isArray(header) ? header[0] : header,
    method: request.method,
    path: request.path.split('?')[0],
    route: context.routePath,
    router: context.routerKind,
    error,
  });
};
