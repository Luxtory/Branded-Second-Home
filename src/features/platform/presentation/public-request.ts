import { isIP } from 'node:net';
import type { Env } from '../infrastructure/env';

/**
 * Borda HTTP das escritas públicas sem conta (TECH-057, spec catalog §14.4): origem exata, tipo de conteúdo, corpo
 * limitado mesmo sem `Content-Length` e a origem de rede vinda só de metadado confiável da plataforma.
 */

/** `Origin` igual, byte a byte, a uma das origens permitidas do ambiente — nunca derivada do `Host` do request. */
export function hasAllowedOrigin(request: Request, allowed: readonly string[]): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && allowed.includes(origin);
}

const JSON_TYPE = 'application/json';
const UTF8 = 'utf-8';

/** `application/json`, com `charset` ausente ou UTF-8. */
export function isJsonRequest(request: Request): boolean {
  const [type = '', ...parameters] = (request.headers.get('content-type') ?? '').split(';');
  if (type.trim().toLowerCase() !== JSON_TYPE) return false;
  return parameters.every((parameter) => {
    const [name = '', value = ''] = parameter.split('=');
    if (name.trim().toLowerCase() !== 'charset') return true;
    return value.trim().replace(/^"|"$/g, '').toLowerCase() === UTF8;
  });
}

export const BODY_TOO_LARGE = Symbol('body-too-large');
export const BODY_NOT_TEXT = Symbol('body-not-text');

/**
 * Corpo como texto UTF-8 até `maxBytes` efetivos: conta os bytes recebidos (o `Content-Length` pode faltar ou mentir) e
 * para de ler ao passar do limite. UTF-8 inválido → `BODY_NOT_TEXT`.
 */
export async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string | typeof BODY_TOO_LARGE | typeof BODY_NOT_TEXT> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return BODY_TOO_LARGE;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return BODY_TOO_LARGE;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder(UTF8, { fatal: true }).decode(bytes);
  } catch {
    return BODY_NOT_TEXT;
  }
}

/** Fora da Vercel (local e CI) não há metadado de plataforma: todas as tentativas dividem a mesma origem de rede. */
export const LOCAL_NETWORK = 'local';
/** Na Vercel, `x-real-ip` é escrito pela própria plataforma (o valor enviado pelo cliente é sobrescrito). */
const PLATFORM_ADDRESS_HEADER = 'x-real-ip';

/** Endereço do cliente segundo a plataforma; ausente ou malformado na Vercel → `null` (a escrita é recusada). */
export function trustedClientAddress(request: Request, env: Env): string | null {
  if (env.VERCEL_ENV === undefined) return LOCAL_NETWORK;
  const address = request.headers.get(PLATFORM_ADDRESS_HEADER)?.trim() ?? '';
  return isIP(address) === 0 ? null : address;
}
