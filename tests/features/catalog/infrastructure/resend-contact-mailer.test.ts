import { describe, expect, it, vi } from 'vitest';
import { createFakeContactMailer } from '@/features/catalog/infrastructure/fake-contact-mailer';
import {
  createResendContactMailer,
  RESEND_EMAILS_URL,
} from '@/features/catalog/infrastructure/resend-contact-mailer';

const EMAIL = {
  subject: 'Assunto',
  text: 'Nome: Ana\n\nMensagem:\nOi',
  replyTo: 'ana@exemplo.test',
};
const PROVIDER_ATTEMPT = 'luxtory:brand-partner-contact:local:0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';

function mailerWith(fetchImpl: typeof fetch) {
  return createResendContactMailer({
    apiKey: 're_teste_123',
    from: 'Luxtory <contato@exemplo.test>',
    to: 'caixa@exemplo.test',
    timeoutMs: 50,
    fetch: fetchImpl,
  });
}

const json = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('adaptador Resend (TECH-057, catalog §14.5)', () => {
  it('[TECH-057] POST /emails com Idempotency-Key, texto simples e reply_to; 2xx com id = aceite', async () => {
    const request = json(200, { id: 'email-id' });

    await expect(mailerWith(request).send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({
      status: 'accepted',
    });
    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe(RESEND_EMAILS_URL);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(PROVIDER_ATTEMPT);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer re_teste_123');
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Luxtory <contato@exemplo.test>',
      to: ['caixa@exemplo.test'],
      subject: 'Assunto',
      text: EMAIL.text,
      reply_to: 'ana@exemplo.test',
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('html');
  });

  it('[TECH-057] 2xx sem id do e-mail não é aceite confirmado', async () => {
    await expect(mailerWith(json(200, {})).send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({
      status: 'unavailable',
      reason: 'unexpected_response',
    });
  });

  it('[TECH-057] mesma chave com outro corpo (409 invalid_idempotent_request) = conflito', async () => {
    const response = json(409, {
      name: 'invalid_idempotent_request',
      message: 'x',
      statusCode: 409,
    });

    await expect(mailerWith(response).send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({
      status: 'conflict',
    });
  });

  it('[TECH-057] chave em uso por outro request (409 concurrent) é indisponibilidade, não conflito', async () => {
    const response = json(409, { name: 'concurrent_idempotent_requests' });

    await expect(mailerWith(response).send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({
      status: 'unavailable',
      reason: 'provider_busy',
    });
  });

  it('[TECH-057] limitação do provedor, recusa e erro do provedor viram indisponibilidade', async () => {
    const cases = [
      [429, 'provider_rate_limited'],
      [422, 'provider_rejected'],
      [403, 'provider_rejected'],
      [500, 'provider_error'],
      [503, 'provider_error'],
    ] as const;
    for (const [status, reason] of cases) {
      await expect(
        mailerWith(json(status, { name: 'x' })).send(EMAIL, PROVIDER_ATTEMPT),
      ).resolves.toEqual({
        status: 'unavailable',
        reason,
      });
    }
  });

  it('[TECH-057] timeout não é sucesso nem prova de que o provedor não aceitou', async () => {
    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    await expect(mailerWith(hanging).send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({
      status: 'unavailable',
      reason: 'timeout',
    });
  });

  it('[TECH-057] falha de rede vira indisponibilidade', async () => {
    const failing = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));

    await expect(mailerWith(failing).send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({
      status: 'unavailable',
      reason: 'network',
    });
  });
});

describe('envio determinístico de local/CI (catalog §14.6)', () => {
  it('[TECH-057] reproduz a idempotência do provedor: replay aceita sem novo envio; outro conteúdo conflita', async () => {
    const mailer = createFakeContactMailer();

    await expect(mailer.send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({ status: 'accepted' });
    await expect(mailer.send(EMAIL, PROVIDER_ATTEMPT)).resolves.toEqual({ status: 'accepted' });
    await expect(mailer.send({ ...EMAIL, text: 'outro' }, PROVIDER_ATTEMPT)).resolves.toEqual({
      status: 'conflict',
    });
    expect(mailer.sent()).toBe(1);
  });
});
