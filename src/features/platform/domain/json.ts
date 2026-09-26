/** Valores JSON: o que entra em `operation`, auditoria, outbox e respostas gravadas para replay. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
