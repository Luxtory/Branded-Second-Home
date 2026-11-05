import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

interface AsyncApiDocument {
  channels: { outbox: { messages: Record<string, { $ref: string }> } };
  components: {
    messages: Record<string, { name: string; payload: unknown }>;
    schemas: Record<string, unknown>;
  };
}

const SCHEMA_ID = 'asyncapi';
const COMPONENT_REF = '#/components/schemas/';
const document = parse(readFileSync('docs/api/asyncapi.yaml', 'utf8')) as AsyncApiDocument;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

function rewriteRefs(node: unknown, prefix: string): unknown {
  if (Array.isArray(node)) return node.map((item) => rewriteRefs(item, prefix));
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === '$ref' && typeof value === 'string' && value.startsWith(COMPONENT_REF)
        ? `${prefix}${value.slice(COMPONENT_REF.length)}`
        : rewriteRefs(value, prefix),
    ]),
  );
}

ajv.addSchema({ $id: SCHEMA_ID, $defs: rewriteRefs(document.components.schemas, '#/$defs/') });

const validators = new Map<string, ValidateFunction>();

/**
 * Validador da mensagem do outbox de tipo `type` (envelope + payload), conforme docs/api/asyncapi.yaml. O tipo precisa
 * estar declarado no canal `outbox`: evento sem contrato falha.
 */
export function eventValidator(type: string): ValidateFunction {
  const cached = validators.get(type);
  if (cached !== undefined) return cached;
  const declared = Object.values(document.channels.outbox.messages).map((message) =>
    message.$ref.split('/').at(-1)!,
  );
  const message = declared
    .map((name) => document.components.messages[name]!)
    .find((candidate) => candidate.name === type);
  if (message === undefined) throw new Error(`AsyncAPI has no outbox message ${type}`);
  const validate = ajv.compile(rewriteRefs(message.payload, `${SCHEMA_ID}#/$defs/`) as object);
  validators.set(type, validate);
  return validate;
}
