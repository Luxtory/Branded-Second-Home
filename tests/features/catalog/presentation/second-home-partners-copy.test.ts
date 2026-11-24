import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { secondHomePartnersMessages as text } from '../../../../src/features/catalog/presentation/i18n/second-home-partners-pt-br';
import { SecondHomePartnersHomePage } from '../../../../src/features/catalog/presentation/second-home-partners/home-page';

/** Limites aprovados de comunicação, REQ-105 / catalog §20.6 / D-SHP-14–16. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}
const PAGE = strings({
  hero: text.hero,
  opportunity: text.opportunity,
  benefits: text.benefits,
  developments: text.developments,
  solutions: text.solutions,
  intermediaries: text.intermediaries,
  process: text.process,
  faq: text.faq,
  conversation: text.conversation,
});
const answerTo = (question: RegExp) =>
  text.faq.items.find((item) => question.test(item.question))?.answer.join(' ') ?? '';

describe('copy Second Home Partners (catalog §20.6)', () => {
  it('[REQ-105] oportunidade convida a imaginar, esclarece carteira anterior e não promete duração vitalícia', () => {
    const html = renderToStaticMarkup(createElement(SecondHomePartnersHomePage));
    const hero = html.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? '';
    expect(hero).toMatch(
      /<span>Mais valor para seu negócio\.\s*<\/span><em>Mais liberdade para seus clientes\.<\/em>/,
    );
    const opportunity = html.match(/<section id="oportunidade"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(opportunity).toMatch(/Imagine seu cliente/);
    expect(opportunity).toContain('problema-imovel');
    expect(opportunity).toMatch(/lx-section-closing/);
    expect(opportunity).toMatch(/A venda termina\..*Sua participação continua\./);
    expect(opportunity).toMatch(/Enquanto o imóvel estiver afiliado.*faturamento/);
    expect(opportunity).not.toMatch(/\sstyle=/);
    expect(answerTo(/já comercializei/)).toMatch(/já comercializou.*ainda vai comercializar/);
    expect(answerTo(/já comercializei/)).toMatch(/avaliação.*adesão.*proprietário/);
    expect(
      PAGE.filter((line) => /vital[ií]ci|receita para sempre|você supera|você acelera/i.test(line)),
    ).toEqual([]);
  });
  it('[REQ-105] demonstração depois das soluções e antes dos intermediadores; imagens informativas preservadas', () => {
    const html = renderToStaticMarkup(createElement(SecondHomePartnersHomePage));
    expect([...html.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'inicio',
      'oportunidade',
      'beneficios',
      'empreendimentos',
      'solucoes',
      'reservas-na-pratica',
      'imobiliarias-e-corretores',
      'como-funciona',
      'perguntas',
      'conversa',
    ]);
    const section = html.match(/<section id="empreendimentos"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(section).toContain('data-surface="wash"');
    expect(section.match(/<h2\b/g)).toHaveLength(1);
    expect(section.match(/<h3\b/g)).toHaveLength(3);
    expect(section.match(/<article\b/g)).toHaveLength(3);
    expect(section).not.toMatch(/<(?:a|button)\b|tabindex=|\sstyle=/);
    expect(section).toContain('Imagens ilustrativas.');
    expect(html.match(/<details\b/g)).toHaveLength(8);
  });

  it('[REQ-105] os três perfis se reconhecem no hero, FAQ e formulário', () => {
    for (const profile of [/incorporadoras/i, /imobiliárias/i, /corretores/i]) {
      expect(text.hero.paragraphs.join(' ')).toMatch(profile);
      expect(answerTo(/Quem pode/)).toMatch(profile);
    }
    expect(text.intermediaries.items).toHaveLength(2);
    expect(answerTo(/empreendimento inteiro/)).toMatch(
      /Não é necessário ter um empreendimento próprio/,
    );
  });

  it('[REQ-105] participação continua enquanto afiliado; valores dependem do faturamento e contrato (D-SHP-18)', () => {
    expect(text.benefits.items).toHaveLength(3);
    expect(text.benefits.items[0].title).toBe('Receita além da venda');
    expect(text.benefits.items[0].paragraphs.join(' ')).toMatch(
      /primeiros parceiros.*faturamento.*afiliarem.*participação continua enquanto o imóvel estiver afiliado/,
    );
    expect(text.benefits.note).toMatch(/depende do faturamento.*condições contratadas/);
    expect(answerTo(/faturamento/)).toMatch(
      /Receitas abrangidas, atribuição, percentuais e pagamento.*contrato/,
    );
    expect(answerTo(/faturamento/)).toMatch(
      /parceiro responsável pela afiliação participa enquanto o imóvel permanecer afiliado/,
    );
    expect(
      PAGE.filter((line) =>
        /%|\d|R\$|\blucr|líquid|brut[ao]|mínim|exclusiv|últimas vagas|airbnb|booking/i.test(line),
      ),
    ).toEqual([]);
  });

  it('[REQ-105] [BR-374] nenhuma promessa de vendas, renda, valorização ou disponibilidade', () => {
    expect(
      PAGE.filter((line) =>
        /garant(?:e|ido|ida|imos)|aumente|vend[ae] mais|valorização|rentab|\brenda\b|ocupação|imediat|gratuit|sem custo/i.test(
          line,
        ),
      ),
    ).toEqual([]);
    expect(answerTo(/ajudar minhas vendas/)).toMatch(/podem ajudar/);
  });

  it('[REQ-105] copy de lançamento no presente, sem nota de indisponibilidade', () => {
    expect(
      PAGE.filter((line) =>
        /estruturando|ainda não|no futuro|poderão|serviços planejados/i.test(line),
      ),
    ).toEqual([]);
    expect(text.solutions.items[0].paragraphs.join(' ')).toMatch(
      /^Os associados disponibilizam.*recebem créditos.*solicitam estadias/,
    );
  });

  it('[REQ-105] [BR-146] créditos, estadias pagas e locação independente continuam distintos', () => {
    const [exchange, plus, rental] = text.solutions.items;
    expect(exchange.paragraphs.join(' ')).toMatch(/créditos.*solicitam estadias/);
    expect(plus.paragraphs.join(' ')).toMatch(/pagando pela hospedagem, sem usar créditos/);
    expect(rental.paragraphs.join(' ')).toMatch(
      /proprietário escolhe.*Luxtory faz a gestão digital/,
    );
    expect(rental.paragraphs.join(' ')).not.toMatch(/associad|Membership/);
    expect(text.solutions.note.join(' ')).toMatch(/independente do Club.*cada proprietário/);
    expect(answerTo(/administrar as locações/)).toMatch(/Não é preciso assumir a operação/);
    expect(answerTo(/obrigados a disponibilizar/)).toMatch(/^Não\. Cada proprietário decide/);
    expect(answerTo(/precisam estar prontos/)).toMatch(/planejamento.*lançamento.*imóveis prontos/);
  });

  it('[REQ-105] [BR-053] [BR-054] [BR-377] imóveis parceiros não viram Branded Second Homes e mantêm terminologia', () => {
    expect(
      PAGE.filter((line) =>
        /Second Homes?(?! Partners)|Branded|resid[eê]nci(?:a|al)|lucros?\b|\bcotas?\b|comunidade|\bTitular/i.test(
          line,
        ),
      ),
    ).toEqual([]);
  });

  it('[REQ-105] CTA comum, privacidade separada e sucesso apenas como confirmação de envio', () => {
    expect(text.hero.action).toBe('Conversar sobre uma parceria');
    expect(text.process.action).toBe(text.hero.action);
    expect(text.intermediaries.action).toBe(text.hero.action);
    expect(text.conversation.privacy).toHaveLength(3);
    expect(text.conversation.privacy[0]).toMatch(
      /^Usaremos seus dados somente para responder ao contato e avaliar uma possível parceria\./,
    );
    expect(text.conversation.privacy[2]).toMatch(
      /Não usaremos seus dados para marketing sem sua autorização\.$/,
    );
    expect(text.conversation.notice).toMatch(/não formaliza parceria ou afiliação/);
    expect(text.conversation.success).toMatch(/^Envio confirmado\./);
  });
});
