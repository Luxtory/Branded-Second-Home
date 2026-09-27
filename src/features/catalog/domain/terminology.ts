/**
 * Checagem lexical de terminologia (REQ-100, REQ-101; ADR-0010 §5): termos vedados do `02` §1 e expressões explícitas
 * conhecidas de promessa de retorno. É defesa complementar — não interpreta o sentido do texto; o gate editorial é a
 * aprovação humana da versão do Concept. Os dois primeiros padrões são os do teste de terminologia do Design System,
 * com fronteira de palavra que reconhece letras acentuadas.
 */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}])cot(a|as|ista|istas|izar|ização)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])di[aá]rias?(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(rentabilidade|valoriza[çc][ãa]o|renda|retorno|lucro|rendimento|liquidez)\s+(garantid|assegurad)[ao]s?(?![\p{L}\p{N}])/iu,
];

/** Código da mensagem de validação quando o texto usa um termo vedado (mapeado para o i18n na apresentação). */
export const FORBIDDEN_TERM = 'forbidden_term';

export function hasForbiddenTerm(text: string): boolean {
  const normalized = text.normalize('NFC');
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(normalized));
}
