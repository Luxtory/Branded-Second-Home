import { createHmac } from 'node:crypto';

/**
 * Identificador da origem de rede para as chaves do limitador (spec catalog §14.4): HMAC-SHA256 do endereço com um
 * segredo próprio. É pseudonimização, não anonimização — o valor nunca vai para logs.
 */
export function pseudonymizeNetwork(address: string, secret: string): string {
  return createHmac('sha256', secret).update(address).digest('base64url');
}
