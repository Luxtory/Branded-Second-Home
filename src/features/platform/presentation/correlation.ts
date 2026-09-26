export const CORRELATION_HEADER = 'x-correlation-id';

// Aceita o id do chamador só se for curto e sem caracteres que quebrem logs.
const VALID_CORRELATION_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveCorrelationId(headers: Headers): string {
  const incoming = headers.get(CORRELATION_HEADER);
  return incoming !== null && VALID_CORRELATION_ID.test(incoming) ? incoming : crypto.randomUUID();
}
