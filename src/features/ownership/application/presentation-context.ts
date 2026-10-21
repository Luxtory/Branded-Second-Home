import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Contexto de apresentação da página da Home Edition (W6; `02` §15, item 14; spec ownership §14.6; ADR-0018 §4): prova,
 * assinada pelo servidor, de qual média projetada a página apresentou — ou de que nenhuma foi apresentada. O navegador
 * só o devolve no envio; nunca é confiado como dado do cliente. Sem PII, valor ou instante: `{ v, k, h, p }`.
 *
 * Formato `<payload base64url>.<assinatura base64url>`; HMAC-SHA-256 com segredo próprio sobre um rótulo de domínio
 * fixo + o payload; comparação em tempo constante. Sem prazo (nenhum valor canônico de validade, TECH-001).
 */
export const PRESENTATION_CONTEXT_VERSION = 1;

/** Chave em uso na W6; a rotação exigirá emitir com a nova e verificar também com a antiga. */
export const PRESENTATION_CONTEXT_KEY_ID = 'v1';

/** Rótulo de domínio da assinatura: o mesmo segredo nunca assina outro tipo de conteúdo. */
const DOMAIN = 'luxtory:interest:presentation-context';

export interface PresentationContextKey {
  readonly id: string;
  readonly secret: string;
}

export interface PresentationContext {
  readonly homeEditionId: string;
  /** A média projetada apresentada; `null` = a página não apresentou nenhuma (ausência explícita). */
  readonly presentedProjectedInvestmentId: string | null;
}

const lowerGuid = z.guid().refine((value) => value === value.toLowerCase());

const payloadSchema = z.strictObject({
  v: z.literal(PRESENTATION_CONTEXT_VERSION),
  k: z.string().min(1).max(32),
  h: lowerGuid,
  p: lowerGuid.nullable(),
});

function signature(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(`${DOMAIN}.${payload}`).digest();
}

/** Emite o contexto da página (no servidor), com a chave informada. */
export function signPresentationContext(
  context: PresentationContext,
  key: PresentationContextKey,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: PRESENTATION_CONTEXT_VERSION,
      k: key.id,
      h: context.homeEditionId.toLowerCase(),
      p: context.presentedProjectedInvestmentId?.toLowerCase() ?? null,
    }),
  ).toString('base64url');
  return `${payload}.${signature(key.secret, payload).toString('base64url')}`;
}

function decodePayload(payload: string): z.infer<typeof payloadSchema> | null {
  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    // Payload que não é JSON: contexto inválido, sem detalhe.
    return null;
  }
}

/**
 * Verifica o contexto devolvido pelo navegador: formato, versão, chave conhecida e assinatura em tempo constante.
 * Qualquer divergência → `null` (o chamador responde `presentation_context: invalid`, sem detalhe).
 */
export function verifyPresentationContext(
  token: string,
  keys: readonly PresentationContextKey[],
): PresentationContext | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload = '', signed = ''] = parts;
  const data = decodePayload(payload);
  if (data === null) return null;
  const key = keys.find((candidate) => candidate.id === data.k);
  if (key === undefined) return null;
  const expected = signature(key.secret, payload);
  const received = Buffer.from(signed, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return { homeEditionId: data.h, presentedProjectedInvestmentId: data.p };
}
