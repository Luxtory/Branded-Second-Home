import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

const IPV6_HEXTETS = 8;
// Um assinante IPv6 recebe ao menos um /64: os quatro primeiros grupos identificam a origem de rede.
const PREFIX_HEXTETS = 4;
const MAPPED_IPV4_MARKER = 0xffff;
const BYTE = 0xff;
const BITS_PER_BYTE = 8;

/** Os oito grupos de 16 bits de um IPv6 já canônico (minúsculo, sem zona, IPv4 embutido convertido em hexa). */
function hextets(canonical: string): number[] {
  const [head = '', tail] = canonical.split('::');
  const groups = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  const start = groups(head);
  const end = tail === undefined ? [] : groups(tail);
  const zeros = Array<number>(IPV6_HEXTETS - start.length - end.length).fill(0);
  return [...start, ...zeros, ...end];
}

/**
 * Origem de rede canônica: IPv4 como está; IPv4 mapeado em IPv6 volta a IPv4; IPv6 normalizado e reduzido ao /64 —
 * endereços que giram dentro do mesmo /64, ou grafias diferentes do mesmo endereço, contam como a mesma origem. Valor
 * que não é IP (a origem única `local` fora da Vercel) passa como está.
 */
export function networkOf(address: string): string {
  const [withoutZone = ''] = address.split('%');
  if (isIPv4(withoutZone) || !isIPv6(withoutZone)) return withoutZone;
  const canonical = new URL(`http://[${withoutZone}]`).hostname.slice(1, -1);
  const groups = hextets(canonical);
  const [, , , , , marker = 0, high = 0, low = 0] = groups;
  if (groups.slice(0, 5).every((group) => group === 0) && marker === MAPPED_IPV4_MARKER) {
    return [high >> BITS_PER_BYTE, high & BYTE, low >> BITS_PER_BYTE, low & BYTE].join('.');
  }
  return `${groups
    .slice(0, PREFIX_HEXTETS)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}

/**
 * Identificador da origem de rede para as chaves do limitador (spec catalog §14.4): HMAC-SHA256 da origem canônica
 * com um segredo próprio. É pseudonimização, não anonimização — o valor nunca vai para logs.
 */
export function pseudonymizeNetwork(address: string, secret: string): string {
  return createHmac('sha256', secret).update(networkOf(address)).digest('base64url');
}
