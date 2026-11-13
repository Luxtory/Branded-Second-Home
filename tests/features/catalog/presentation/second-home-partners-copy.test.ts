import { describe, expect, it } from 'vitest';
import { secondHomePartnersMessages as text } from '../../../../src/features/catalog/presentation/i18n/second-home-partners-pt-br';

// Limites da copy Second Home Partners (spec catalog §20.2; aplicação L1–L7; Framework §14). Verificam regras de negócio
// e de comunicação — participação explícita sem números, Club só como futuro, locação independente do Club, nada de
// promessa —, não frases: a copy pode ser refinada sem reescrever os testes (`D-SHP-07`–`D-SHP-10`).

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
  solutions: text.solutions,
  process: text.process,
  faq: text.faq,
  conversation: text.conversation,
});
const ALL = strings(text);
const answerTo = (question: RegExp) =>
  text.faq.items.find((item) => question.test(item.question))?.answer ?? '';

describe('copy Second Home Partners (catalog §20.2)', () => {
  it('[REQ-105] três benefícios com o mesmo peso; a participação incide sobre a receita de gestão das locações (D-SHP-07, D-SHP-08)', () => {
    const [, , participation] = text.benefits.items;

    expect(text.benefits.items.map((item) => item.title)).toEqual([
      'Diferenciação comercial',
      'Marketing e vendas',
      'Participação nos resultados',
    ]);
    expect(participation?.text).toMatch(/receita de gestão das locações/);
    // Modelo B: o Club entra só como possibilidade, sem herdar a base do modelo A.
    expect(participation?.text).toMatch(/Luxtory Club[^.]*poderá/);
    expect(answerTo(/participa dos resultados/)).toMatch(/parte da comissão da Luxtory/);
  });

  it('[REQ-105] [BR-352] sem percentual, número, fórmula, lucro, "recorrente" nem plataforma de locação nomeada', () => {
    const economic =
      /%|\d|R\$|percentual|fórmula|\blucr|líquid|brut[ao]|recorrente|mínim|airbnb|booking|\bOTA\b/i;

    expect(PAGE.filter((line) => economic.test(line))).toEqual([]);
  });

  it('[REQ-105] [BR-374] nenhuma promessa de vendas, renda, valorização, ocupação ou disponibilidade', () => {
    const promise =
      /garant(?:e|ido|ida|imos)|aumente|vend[ae] mais|valorização|rentab|\brenda\b|ocupação|imediat|gratuit|sem custo/i;
    // Frases que negam a garantia (nota de Benefícios, aviso do formulário) não prometem.
    const negation = /^(?:Os benefícios dependem[^.]*\. Não há garantia|O envio não formaliza)/;
    const hits = PAGE.filter((line) => !negation.test(line) && promise.test(line));

    expect(hits).toEqual([]);
    // Efeito nas vendas só como possibilidade (hipótese H-SHP-01).
    expect(text.opportunity.paragraphs.join(' ')).toMatch(/pode ajudar/);
    expect(answerTo(/ajudar minhas vendas/)).toMatch(/ajuda a enfrentar[^.]*poderá/);
  });

  it('[REQ-105] o Luxtory Club e o intercâmbio aparecem só como futuros ou planejados, nunca como disponíveis', () => {
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
    expect(text.hero.note).toMatch(/intercâmbio ainda não está disponível/);
    expect(text.solutions.note.join(' ')).toMatch(
      /Luxchange e Luxplus[^.]*Luxtory Club[^.]*ainda não/,
    );
  });

  it('[REQ-105] [BR-146] três soluções com o mesmo peso; Luxchange e Luxplus são do Club (associados), a locação é independente (D-SHP-09)', () => {
    const [luxchange, luxplus, rental, ...others] = text.solutions.items;

    expect(others).toEqual([]);
    expect([luxchange?.label, luxplus?.label, rental?.label]).toEqual([
      expect.stringMatching(/^Luxchange/),
      expect.stringMatching(/^Luxplus/),
      expect.stringMatching(/^Locação de temporada/),
    ]);
    // Créditos (Luxchange) e estadias pagas sem créditos (Luxplus) não se confundem (L2–L3).
    expect(luxchange?.text).toMatch(/^Os associados[^.]*créditos/);
    expect(luxplus?.text).toMatch(/^Os associados[^.]*pagando[^.]*sem usar créditos/);
    // A locação é dos proprietários, com gestão da Luxtory, sem Membership (L4).
    expect(rental?.text).toMatch(/proprietários[^.]*gestão digital da Luxtory/);
    expect(rental?.text).not.toMatch(/associad|Club|Membership/);
    expect(text.solutions.note.join(' ')).toMatch(/gestão de locações é independente/);
  });

  it('[REQ-105] a incorporadora não precisa operar e cada proprietário decide sobre a locação (O7, O8)', () => {
    expect(answerTo(/administrar as locações/)).toMatch(
      /^Não\.[^.]*Luxtory[^.]*prestadores locais/,
    );
    expect(answerTo(/proprietários precisam/)).toMatch(/^Não\.[^.]*proprietário decide/);
  });

  it('[REQ-105] qualquer fase do empreendimento, sem prioridade não decidida (D-SHP-10)', () => {
    expect(PAGE.filter((line) => /priori/i.test(line))).toEqual([]);
    expect(answerTo(/fase/)).toMatch(/^Não\.[^.]*qualquer fase/);
  });

  it('[REQ-105] [BR-053] [BR-054] imóveis parceiros nunca viram Second Homes nem Branded Second Homes', () => {
    // "Second Home" só no nome do programa; nenhuma menção a Branded na jornada.
    const secondHome = PAGE.filter((line) => /Second Homes?(?! Partners)/.test(line));

    expect(secondHome).toEqual([]);
    expect(PAGE.filter((line) => /Branded/.test(line))).toEqual([]);
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
