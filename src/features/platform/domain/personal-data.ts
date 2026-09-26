/**
 * Chaves que podem carregar dado pessoal ou segredo (TECH-100): nunca vão para logs nem para a auditoria (TECH-092),
 * mesmo por engano de quem grava. Snapshots de auditoria devem identificar entidades por id, não por nome.
 */
export const PERSONAL_DATA_KEY =
  /^(cpf|cnpj|document|documento|email|e-mail|phone|telefone|name|nome|password|senha|token|secret|authorization|cookie)$/i;

export const REDACTED = '[redacted]';

/** Cópia de um valor JSON com as chaves sensíveis redigidas, em qualquer profundidade. */
export function redactPersonalData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => redactPersonalData(item)) as T;
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      PERSONAL_DATA_KEY.test(key) ? REDACTED : redactPersonalData(item),
    ]),
  ) as T;
}
