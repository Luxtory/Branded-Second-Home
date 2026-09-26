import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

interface OpenApiDocument {
  paths: Record<string, Record<string, { responses: Record<string, OpenApiResponse> }>>;
  components: { schemas: Record<string, unknown> };
}
interface OpenApiResponse {
  content?: Record<string, { schema: unknown }>;
}

const SCHEMA_ID = 'openapi';
const COMPONENT_REF = '#/components/schemas/';
const document = parse(readFileSync('docs/api/openapi.yaml', 'utf8')) as OpenApiDocument;

// OpenAPI 3.1 usa JSON Schema 2020-12; `example` é a única palavra-chave extra usada no contrato.
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addKeyword('example');
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

/** Validador do corpo JSON da resposta `status` de `method path`, conforme docs/api/openapi.yaml. */
export function responseValidator(path: string, method: string, status: number): ValidateFunction {
  const response = document.paths[path]?.[method]?.responses[String(status)];
  const schema = response?.content?.['application/json']?.schema;
  if (schema === undefined) {
    throw new Error(`OpenAPI has no JSON response ${status} for ${method.toUpperCase()} ${path}`);
  }
  return ajv.compile(rewriteRefs(schema, `${SCHEMA_ID}#/$defs/`) as object);
}

/** Validador de um schema de `components.schemas` do OpenAPI. */
export function schemaValidator(name: string): ValidateFunction {
  if (!(name in document.components.schemas)) throw new Error(`OpenAPI has no schema ${name}`);
  return ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${name}` });
}
