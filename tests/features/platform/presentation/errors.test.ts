import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ERROR_CODES, REQ_098_CAUSES } from '@/features/platform/domain/errors';
import { ERROR_STATUS, errorResponse } from '@/features/platform/presentation/errors';
import { messages } from '@/features/platform/presentation/i18n/pt-br';
import { schemaValidator } from '../../../support/openapi';

const openapi = parse(readFileSync('docs/api/openapi.yaml', 'utf8')) as {
  components: { schemas: { ErrorCode: { enum: string[] } } };
};

describe('erros na borda HTTP (TECH-056, REQ-098)', () => {
  it('[REQ-098] cada causa listada no REQ-098 tem código TECH-056 e mensagem pt-BR', () => {
    for (const codes of Object.values(REQ_098_CAUSES)) {
      for (const code of codes) {
        expect(messages.errors[code]).toMatch(/^[A-ZÉÁÍÓÚ].+\.$/);
        expect(messages.errors[code]).not.toMatch(/ERR_/);
      }
    }
  });

  it('[TECH-056] os códigos do código são exatamente o enum ErrorCode do OpenAPI', () => {
    expect([...ERROR_CODES]).toEqual(openapi.components.schemas.ErrorCode.enum);
  });

  it('[TECH-056] todo código tem mensagem pt-BR e status HTTP de erro', () => {
    for (const code of ERROR_CODES) {
      expect(messages.errors[code].length).toBeGreaterThan(10);
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('[TECH-056] a resposta de erro segue o schema Error do OpenAPI', async () => {
    const response = errorResponse('ERR_BOOKING_CONFLICT', 'corr-12345');
    const validError = schemaValidator('Error');
    const body: unknown = await response.json();

    expect(response.status).toBe(409);
    expect(validError(body), JSON.stringify(validError.errors)).toBe(true);
    expect(body).toMatchObject({ code: 'ERR_BOOKING_CONFLICT', correlation_id: 'corr-12345' });
  });
});
