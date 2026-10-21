import { describe, expect, it } from 'vitest';
import {
  formatPartyDocument,
  maskPartyDocument,
  normalizePartyDocument,
} from '@/features/identity/domain/party-document';
import { validCnpj, validCpf, wrongCheckDigit } from '../../../support/party-fixtures';

const CPF = validCpf('123456789');
const CNPJ = validCnpj('112223330001');
// Exemplo publicado pela Receita para o CNPJ alfanumérico (IN RFB 2.229/2024).
const ALPHANUMERIC_CNPJ = '12ABC34501DE35';

describe('CPF/CNPJ da party — normalização determinística (TECH-100, spec identity §13.3)', () => {
  it('[TECH-100] CPF com ou sem máscara chega à mesma forma normalizada', () => {
    const masked = `${CPF.slice(0, 3)}.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-${CPF.slice(9)}`;

    expect(normalizePartyDocument(CPF)).toEqual({ type: 'cpf', value: CPF });
    expect(normalizePartyDocument(` ${masked} `)).toEqual({ type: 'cpf', value: CPF });
  });

  it('[TECH-100] CNPJ numérico e alfanumérico (minúsculas, máscara) normalizam para maiúsculas sem pontuação', () => {
    expect(normalizePartyDocument('12.abc.345/01de-35')).toEqual({
      type: 'cnpj',
      value: ALPHANUMERIC_CNPJ,
    });
    expect(normalizePartyDocument(formatPartyDocument({ type: 'cnpj', value: CNPJ }))).toEqual({
      type: 'cnpj',
      value: CNPJ,
    });
    expect(validCnpj('12ABC34501DE')).toBe(ALPHANUMERIC_CNPJ);
  });

  it.each([
    ['dígito verificador do CPF errado', wrongCheckDigit(CPF)],
    ['dígito verificador do CNPJ errado', wrongCheckDigit(CNPJ)],
    ['CPF com dígitos repetidos', '11111111111'],
    ['CNPJ com caracteres repetidos', '00000000000000'],
    ['tamanho que não é CPF nem CNPJ', '1234567890'],
    ['letra no CPF', `${CPF.slice(0, 10)}A`],
    ['letra nos dígitos verificadores do CNPJ', `${CNPJ.slice(0, 12)}AB`],
    ['caractere fora do alfabeto do CNPJ', `${CNPJ.slice(0, 11)}*${CNPJ.slice(12)}`],
    ['vazio', ''],
  ])('[TECH-100] recusa documento inválido: %s', (_case, input) => {
    expect(normalizePartyDocument(input)).toBeNull();
  });

  it('[TECH-100] máscara de apresentação esconde o início e os verificadores; formato completo só para a leitura auditada', () => {
    expect(maskPartyDocument({ type: 'cpf', value: CPF })).toBe(
      `***.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-**`,
    );
    expect(maskPartyDocument({ type: 'cnpj', value: ALPHANUMERIC_CNPJ })).toBe(
      '**.ABC.345/01DE-**',
    );
    expect(formatPartyDocument({ type: 'cnpj', value: ALPHANUMERIC_CNPJ })).toBe(
      '12.ABC.345/01DE-35',
    );
  });
});
