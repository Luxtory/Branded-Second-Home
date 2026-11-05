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

// Formatos de identificador pessoal que uma referência nunca carrega (W13, spec booking §10.12 D11).
const CONTROL_CHARACTER = /\p{Cc}/u;
const EMAIL_SIGN = /@/;
const CPF_SHAPE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
const CNPJ_SHAPE = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;
const PHONE_SHAPE = /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/;

/**
 * Referência não pessoal a registro verificável (protocolo, ticket, documento interno): a base registrada e a
 * referência de incidente dos atos Admin da W13 (D11). Recusa o que tem forma de identificador pessoal — e-mail, CPF,
 * CNPJ, telefone com DDD — e caractere de controle. Não prova a ausência de dado pessoal (um nome digitado passa): o
 * contrato e a auditoria cobrem o resto, e o risco segue não ratificado.
 */
export function isNonPersonalReference(text: string): boolean {
  return ![CONTROL_CHARACTER, EMAIL_SIGN, CPF_SHAPE, CNPJ_SHAPE, PHONE_SHAPE].some((shape) =>
    shape.test(text),
  );
}
