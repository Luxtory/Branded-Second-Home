/**
 * Elegibilidade temporal do outbox (ADR-0022): o banco exige `available_at >= occurred_at`. Um instante já passado — a
 * janela que abriu antes de o sorteio terminar, por exemplo — vira entrega imediata; ausente continua `null`.
 */
export function notBefore(availableAt: Date | undefined, occurredAt: Date): Date | null {
  if (availableAt === undefined) return null;
  return availableAt.getTime() > occurredAt.getTime() ? availableAt : occurredAt;
}
