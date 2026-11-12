import { describe, expect, it } from 'vitest';
import { secondHomePartnersMessages as text } from '../../../../src/features/catalog/presentation/i18n/second-home-partners-pt-br';

// Limites da copy Second Home Partners (spec catalog §18.2; aplicação L1–L7; Framework §14). Versão B (`D-SHP-04`):
// nenhuma menção a receita ou participação nos resultados até `P-SHP-01`.

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

describe('copy Second Home Partners (catalog §18.2)', () => {
  it('[REQ-105] versão B: nenhuma menção a receita, participação nos resultados, percentual ou remuneração', () => {
    const economic =
      /receita|participa(?:ção|r|m)? (?:nos|dos) resultados|remunera|percentual|%|\blucro|recorrente/i;
    const allowed = 'Não há garantia de vendas, receitas ou estadias.';
    const hits = PAGE.filter((line) => economic.test(line.replace(allowed, '')));

    expect(hits).toEqual([]);
    expect(text.benefits.items.map((item) => item.title)).toEqual([
      'Diferenciação comercial',
      'Marketing e vendas',
    ]);
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
      /Luxtory Club|intercâmbio|Luxchange|Luxplus|locação/i.test(line),
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

  it('[REQ-105] créditos, estadias pagas e locação não se confundem (L2–L4)', () => {
    const [luxchange, luxplus, rental] = text.club.items;

    expect(luxchange?.text).toMatch(/créditos para solicitar estadias/);
    expect(luxplus?.text).toMatch(/pagando pela hospedagem, sem usar créditos/);
    expect(rental?.text).toMatch(/autorização dos proprietários[^.]*locação ao público/);
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
