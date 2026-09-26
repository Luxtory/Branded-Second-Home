import { rootLogger, type Logger } from '../infrastructure/logger';
import { CORRELATION_HEADER, resolveCorrelationId } from './correlation';
import { messages } from './i18n/pt-br';

export interface RouteContext {
  readonly correlationId: string;
  readonly log: Logger;
}

type Handler<A extends unknown[]> = (
  request: Request,
  context: RouteContext,
  ...args: A
) => Response | Promise<Response>;

/**
 * Envolve um route handler: `correlation_id` em todo request (header de resposta e logs) e erro não tratado
 * vira log estruturado + 500 no formato `Error` do OpenAPI, sem stack trace (TECH-056).
 * O handler deve criar respostas com headers mutáveis (não usar `Response.redirect`).
 */
export function withRoute<A extends unknown[]>(handler: Handler<A>, logger: Logger = rootLogger) {
  return async (request: Request, ...args: A): Promise<Response> => {
    const correlationId = resolveCorrelationId(request.headers);
    const log = logger.child({ correlation_id: correlationId });
    let response: Response;
    try {
      response = await handler(request, { correlationId, log }, ...args);
    } catch (error) {
      log.error('unhandled route error', {
        method: request.method,
        path: new URL(request.url).pathname,
        error,
      });
      response = Response.json(
        {
          code: 'ERR_INTERNAL',
          message: messages.errors.ERR_INTERNAL,
          correlation_id: correlationId,
        },
        { status: 500 },
      );
    }
    response.headers.set(CORRELATION_HEADER, correlationId);
    return response;
  };
}
