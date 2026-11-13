import { describe, expect, it } from 'vitest';
import { secondHomePartnersMessages as text } from '../../../../src/features/catalog/presentation/i18n/second-home-partners-pt-br';

// Limites da copy Second Home Partners (spec catalog §20.2; aplicação L1–L7; Framework §14). Modelo comercial de
// 2026-11-13 (`D-SHP-07`–`D-SHP-09`): participação explícita, sem percentual, fórmula, valor nem confusão com lucro.

/** Todos os textos de um nó do i18n. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

const PAGE = strings({
  metadata: text.metadata,
  hero: text.hero,
  opportunity: text.opportunity,
  benefits: text.benefits,
  club: text.club,
  process: text.process,
  faq: text.faq,
  conversation: text.conversation,
});
const ALL = strings(text);

describe('copy Second Home Partners (catalog §20.2)', () => {
  it('[REQ-105] três benefícios com o mesmo peso; a participação é explícita e incide sobre a receita de gestão (D-SHP-07, D-SHP-08)', () => {
    const [, , participation] = text.benefits.items;

    expect(text.benefits.items.map((item) => item.title)).toEqual([
      'Diferenciação comercial',
      'Marketing e vendas',
      'Participação nos resultados',
    ]);
    expect(participation?.text).toMatch(
      /^Sua incorporadora participa da receita de gestão das locações do empreendimento\./,
    );
    // O Club entra só como possibilidade (Modelo B), nunca com o percentual ou a base do Modelo A.
    expect(participation?.text).toMatch(/No Luxtory Club, a participação poderá vir depois\.$/);
    const answer = text.faq.items.find((item) => /participação nos resultados/.test(item.question));
    expect(answer?.answer).toMatch(
      /comissão da Luxtory pela gestão das locações, sem reduzir a parte dos proprietários/,
    );
  });

  it('[REQ-105] [BR-352] sem percentual, número, fórmula, lucro, "recorrente" nem plataforma de locação nomeada', () => {
    const economic =
      /%|\d|R\$|percentual|fórmula|\blucr|líquid|brut[ao]|recorrente|mínim|airbnb|booking|\bOTA\b/i;

    expect(PAGE.filter((line) => economic.test(line))).toEqual([]);
  });

  it('[REQ-105] [BR-374] nenhuma promessa de vendas, renda, valorização, ocupação ou disponibilidade', () => {
    const promise =
      /garant(?:e|ido|ida|imos)|aumente|vend[ae] mais|valorização|rentab|ocupação|imediat|gratuit|sem custo/i;
    const negations = [
      'Não há garantia de vendas, receitas ou estadias.',
      'O envio não formaliza uma parceria nem garante a entrada no Luxtory Club.',
    ];
    const hits = PAGE.filter((line) => !negations.includes(line) && promise.test(line));

    expect(hits).toEqual([]);
    // "Acelerar a decisão de compra" só como possibilidade (hipótese H-SHP-01).
    expect(text.opportunity.paragraphs[1]).toMatch(/^Esse diferencial pode ajudar/);
  });

  it('[REQ-105] o Luxtory Club e o intercâmbio aparecem só como futuros, nunca como disponíveis', () => {
    const future = /poderá|poderão|futur|planejad|previst|ainda não|ainda está|estruturando/i;
    const mentions = PAGE.filter((line) =>
      /Luxtory Club|intercâmbio|Luxchange|Luxplus/i.test(line),
    );
    // O aviso do formulário nega a entrada no Club; não afirma disponibilidade.
    const assertive = mentions.filter(
      (line) => !future.test(line) && line !== text.conversation.notice,
    );

    expect(mentions.length).toBeGreaterThan(0);
    // Rótulos curtos só nomeiam o mecanismo; as frases é que afirmam.
    expect(assertive.filter((line) => line.split(' ').length > 6)).toEqual([]);
    expect(text.hero.note).toContain('O intercâmbio ainda não está disponível.');
    expect(text.club.note).toContain('O Luxtory Club ainda não está disponível.');
    expect(text.club.intro).toBe(
      'O Luxtory Club é a rede planejada de Second Homes da Luxtory. A entrada de imóveis parceiros ainda está sendo estruturada.',
    );
  });

  it('[REQ-105] créditos e estadias pagas não se confundem (L2–L3); a gestão das locações fica fora do Club (L4, D-SHP-09)', () => {
    const [luxchange, luxplus, ...others] = text.club.items;

    expect(luxchange?.text).toMatch(/créditos para solicitar estadias/);
    expect(luxplus?.text).toMatch(/pagando pela hospedagem, sem usar créditos/);
    expect(others).toEqual([]);
    expect(strings(text.club).filter((line) => /loca[çc]/i.test(line))).toEqual([]);
    // A incorporadora não precisa operar: a Luxtory faz a gestão e contrata a operação local.
    const operation = text.faq.items.find((item) => /operar as locações/.test(item.question));
    expect(operation?.answer).toMatch(
      /^Não\. A Luxtory faz a gestão e contrata prestadores locais\./,
    );
  });

  it('[REQ-105] [BR-053] [BR-054] o empreendimento parceiro nunca vira Branded Second Home', () => {
    const answer = text.faq.items.find((item) => /mudar a marca/.test(item.question))?.answer;

    expect(answer).toMatch(/^Não\./);
    expect(answer).toMatch(
      /Branded Second Homes são outra proposta da Luxtory, para novos projetos/,
    );
  });

  it('[REQ-105] vocabulário: sem o enquadramento de moradia (BR-377), "lucros", "cota", "comunidade" nem "Titular" para o proprietário parceiro', () => {
    const banned = /resid[eê]nci(?:a|al)|lucros?\b|\bcotas?\b|comunidade|\bTitular/i;

    expect(ALL.filter((line) => banned.test(line))).toEqual([]);
  });

  it('[REQ-105] CTA único e privacidade com finalidade delimitada (LGPD)', () => {
    expect(text.hero.action).toBe('Conversar sobre seu empreendimento');
    expect(text.process.action).toBe(text.hero.action);
    expect(text.conversation.privacy).toMatch(
      /^Usaremos seus dados somente para responder ao contato e avaliar uma possível parceria\./,
    );
    expect(text.conversation.privacy).toMatch(
      /Não usaremos seus dados para marketing sem sua autorização\.$/,
    );
    expect(text.conversation.success).toBe(
      'Envio confirmado. Obrigado por apresentar seu empreendimento.',
    );
  });
});
