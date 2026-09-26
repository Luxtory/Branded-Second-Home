import { describe, expect, it } from 'vitest';
import { CORRELATION_HEADER, withRoute } from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('withRoute', () => {
  it('reaproveita um correlation_id válido do chamador e o devolve no header', async () => {
    const { logger, entries } = captureLogger();
    const handler = withRoute((_request, { log }) => {
      log.info('handled');
      return new Response('ok');
    }, logger);
    const response = await handler(
      new Request('http://localhost/x', { headers: { [CORRELATION_HEADER]: 'req-12345678' } }),
    );

    expect(response.headers.get(CORRELATION_HEADER)).toBe('req-12345678');
    expect(entries()[0]).toMatchObject({ msg: 'handled', correlation_id: 'req-12345678' });
  });

  it('gera um UUID quando o correlation_id recebido é inválido', async () => {
    const handler = withRoute(() => new Response('ok'), captureLogger().logger);
    const response = await handler(
      new Request('http://localhost/x', { headers: { [CORRELATION_HEADER]: 'curto\n' } }),
    );

    expect(response.headers.get(CORRELATION_HEADER)).toMatch(UUID);
  });

  it('erro não tratado: log estruturado com correlation_id e resposta 500 em pt-BR', async () => {
    const { logger, entries } = captureLogger();
    const handler = withRoute(() => {
      throw new Error('detalhe interno');
    }, logger);
    const response = await handler(new Request('http://localhost/v1/algo?cpf=123'));
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: 'ERR_INTERNAL',
      correlation_id: expect.stringMatching(UUID),
    });
    expect(body.message).toMatch(/Tente novamente/);
    expect(entries()[0]).toMatchObject({
      level: 'error',
      correlation_id: body.correlation_id,
      path: '/v1/algo',
      error: { message: 'detalhe interno' },
    });
  });
});
