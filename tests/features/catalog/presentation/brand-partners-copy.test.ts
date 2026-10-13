import { describe, expect, it } from 'vitest';
import { brandPartnersMessages as text } from '../../../../src/features/catalog/presentation/i18n/brand-partners-pt-br';

// Limites da copy BP1.1 (spec catalog §14.9; D-BP-15): o Luxtory Club é modelo previsto enquanto o R3 não opera, e o
// cross-brand e a capacidade reservada à Luxtory (BR-121) ficam fora da comunicação pública (H-BP-09, H-BP-10).

/** Todos os textos de um nó do i18n, sem a marcação de destaque (`**`). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value.replaceAll('**', '')];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/**
 * Seções enquadradas como um todo: a abertura e o fechamento da seção do Luxtory Club dizem que o Club é modelo
 * previsto, e os mecanismos não repetem a ressalva (`D-BP-20`). A seção é lida como um único bloco, em ordem.
 */
const SECTION_FRAMED: readonly unknown[] = [text.howItWorks.club];

/**
 * Os blocos de texto de um nó do i18n: uma string sozinha ou uma lista de parágrafos — o mesmo bloco da copy dividido
 * pela auditoria de concisão (catalog §14.9), lido em ordem sob o mesmo título.
 */
function blocks(value: unknown): string[][] {
  if (SECTION_FRAMED.includes(value)) return [strings(value)];
  if (typeof value === 'string') return [strings(value)];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return [strings(value)];
  if (Array.isArray(value)) return value.flatMap(blocks);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(blocks);
  return [];
}

const PAGES_NODE = { metadata: text.metadata, home: text.home, howItWorks: text.howItWorks };
const PAGES = strings(PAGES_NODE);
const CLUB = /Luxtory Club|\bClub\b|\b[Cc]lube\b|Membership|Luxchange|Luxplus/;
// Sem `\b`: em JS ele não reconhece letras acentuadas ("prevê").
const PLANNED = /prevê|prevista|previsto|quando disponíve(?:l|is)|estiverem disponíveis/i;
// Rótulos curtos (eyebrow, índice, títulos de etapa) só nomeiam; as frases é que afirmam.
const isSentence = (line: string) => line.length >= 60;

describe('copy Brand Partners BP1.1 (catalog §14.9)', () => {
  it('[REQ-028] Luxtory Club, Membership, Luxchange e Luxplus aparecem só como modelo previsto, nunca como disponibilidade atual', () => {
    // Cada frase sobre o Club traz a marca do modelo previsto, ou vem depois dela no mesmo bloco (nunca antes).
    const mentions: string[] = [];
    const unframed: string[] = [];
    for (const block of blocks(PAGES_NODE)) {
      let framed = false;
      for (const line of block) {
        framed ||= PLANNED.test(line);
        if (!CLUB.test(line) || !isSentence(line)) continue;
        mentions.push(line);
        if (!framed) unframed.push(line);
      }
    }

    expect(mentions.length).toBeGreaterThan(0);
    expect(unframed).toEqual([]);
  });

  it('[REQ-028] a seção do Luxtory Club abre como modelo previsto antes do primeiro mecanismo (D-BP-20)', () => {
    const section = strings(text.howItWorks.club);
    const firstPlanned = section.findIndex((line) => PLANNED.test(line));
    const firstMechanism = section.findIndex((line) => isSentence(line) && CLUB.test(line));

    expect(firstPlanned).toBeGreaterThanOrEqual(0);
    expect(firstPlanned).toBeLessThanOrEqual(firstMechanism);
    expect(PLANNED.test(text.howItWorks.club.limit.join(' '))).toBe(true);
  });

  it('[REQ-028] Home: o Hero e o PROBLEM criam a tensão sem nomear a solução; Branded Second Home aparece primeiro no PROMISE (D-BP-20)', () => {
    const solution = /Branded Second Home|Home Concept|Luxtory/;
    const { hero, problem, promise } = text.home;

    expect(strings({ hero, problem }).filter((line) => solution.test(line))).toEqual([]);
    expect(strings(promise).some((line) => line.includes('Branded Second Home'))).toBe(true);
    expect(strings(promise).some((line) => line.includes('Home Concept'))).toBe(true);
  });

  it('[REQ-028] Luxchange na redação determinada pelo fundador, sem ressalva própria (D-BP-21)', () => {
    const luxchange = text.howItWorks.club.mechanisms.find((item) => item.title === 'Luxchange.');

    expect(luxchange?.text).toEqual([
      'O clube permite ao membro converter dias do seu direito de uso em créditos equivalentes para se hospedar em outras residências da rede.',
      'Sua Second Home deixa de estar limitada a um único endereço e passa a fazer parte de uma rede de destinos.',
    ]);
  });

  it('[REQ-028] cross-brand e capacidade reservada à Luxtory (BR-121) ficam fora da copy pública', () => {
    const outOfScope = /cross-brand|entre marcas|outras marcas|BR-121|capacidade reservada/i;

    expect(PAGES.filter((line) => outOfScope.test(line))).toEqual([]);
  });

  it('[REQ-028] o mecanismo termina em Second Home e "Home" nunca nomeia o estágio sozinho (D-BP-16)', () => {
    const bareHomeStage = /\bHome\b(?! (?:Concepts?|Editions?))/;
    const offenders = PAGES.filter((line) =>
      line
        .replaceAll(/Second Homes?/g, '')
        .replaceAll('Branded Second Home', '')
        .match(bareHomeStage),
    );

    expect(offenders).toEqual([]);
  });
});
