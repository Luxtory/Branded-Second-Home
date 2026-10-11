import type {
  ContactMailer,
  MailerFailure,
  MailerOutcome,
} from '../application/brand-partner-contact';

/** API HTTP do Resend (TECH-057): sem SDK de e-mail. */
export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

const HTTP_CONFLICT = 409;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;
// Mesma chave com outro corpo dentro da janela; a chave em uso por outro request ainda em curso é outro código.
const IDEMPOTENT_MISMATCH = 'invalid_idempotent_request';

export interface ResendContactMailerOptions {
  readonly apiKey: string;
  /** Remetente verificado no Resend (configuração do servidor). */
  readonly from: string;
  /** Caixa corporativa (Production) ou de teste (Preview). */
  readonly to: string;
  readonly timeoutMs: number;
  readonly fetch?: typeof fetch;
}

async function errorName(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'name' in body) {
      return typeof body.name === 'string' ? body.name : null;
    }
  } catch {
    // Corpo de erro fora do formato documentado: tratado pelo status.
  }
  return null;
}

async function failureOf(response: Response): Promise<MailerOutcome> {
  if (response.status === HTTP_CONFLICT) {
    return (await errorName(response)) === IDEMPOTENT_MISMATCH
      ? { status: 'conflict' }
      : { status: 'unavailable', reason: 'provider_busy' };
  }
  const reason: MailerFailure =
    response.status === HTTP_TOO_MANY
      ? 'provider_rate_limited'
      : response.status >= HTTP_SERVER_ERROR
        ? 'provider_error'
        : 'provider_rejected';
  return { status: 'unavailable', reason };
}

async function hasEmailId(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    return (
      typeof body === 'object' &&
      body !== null &&
      'id' in body &&
      typeof body.id === 'string' &&
      body.id !== ''
    );
  } catch {
    return false;
  }
}

/**
 * Adaptador do Resend (spec catalog §14.5): `POST /emails` com `Idempotency-Key`, texto simples e `reply_to` só com o
 * e-mail validado. Aceite = 2xx com o id do e-mail; o mesmo par chave + corpo dentro da janela do provedor devolve o
 * id original sem novo envio. Timeout não é sucesso nem prova de que o provedor não aceitou. A resposta bruta do
 * provedor nunca sai daqui — só o resultado.
 */
export function createResendContactMailer({
  apiKey,
  from,
  to,
  timeoutMs,
  fetch: request = fetch,
}: ResendContactMailerOptions): ContactMailer {
  return {
    async send(email, providerKey) {
      let response: Response;
      try {
        response = await request(RESEND_EMAILS_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': providerKey,
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject: email.subject,
            text: email.text,
            reply_to: email.replyTo,
          }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        });
      } catch (error) {
        const timedOut =
          error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return { status: 'unavailable', reason: timedOut ? 'timeout' : 'network' };
      }
      if (!response.ok) return failureOf(response);
      return (await hasEmailId(response))
        ? { status: 'accepted' }
        : { status: 'unavailable', reason: 'unexpected_response' };
    },
  };
}
