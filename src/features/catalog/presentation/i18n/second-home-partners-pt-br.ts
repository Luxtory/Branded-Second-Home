/**
 * Jornada pública Second Home Partners (REQ-105, spec catalog §20): Master Copy do plano v3.3 aprovado pelo fundador em
 * 2026-11-12, atualizada com o modelo comercial de 2026-11-13 (`D-SHP-07`–`D-SHP-10`): três benefícios com o mesmo peso,
 * participação nas receitas de gestão das locações como parte da proposta e no Luxtory Club só como possibilidade; três
 * soluções para os proprietários (Luxchange e Luxplus planejados no Club; locação de temporada independente).
 * Sem percentual, fórmula, valor, exemplo ou plataforma nomeada. Os textos são VERBATIM — não reescrever, resumir nem
 * acrescentar claim. Headlines: `lead` + `turn` (a virada em itálico da copy). Identificadores internos (funções 5P)
 * ficam só nos comentários.
 */

import type { DevelopmentStage } from '../../domain/second-home-partner-contact';

/** Rótulos do formulário (catalog §20.3) e do e-mail interno: os campos autorizados pelo REQ-105. */
const fieldLabels = {
  name: 'Nome',
  company: 'Incorporadora',
  email: 'E-mail',
  development: 'Empreendimento e localização',
  stage: 'Fase do empreendimento',
  message: 'Mensagem',
  website: 'Site',
} as const;

const stages: Readonly<Record<DevelopmentStage, string>> = {
  planning_or_launch: 'Planejamento ou lançamento',
  construction_or_sales: 'Obra ou comercialização',
  delivered_or_operating: 'Entregue ou em operação',
};

const CTA = 'Conversar sobre seu empreendimento';

export const secondHomePartnersMessages = {
  site: {
    skipLink: 'Pular para o conteúdo',
    home: 'Luxtory Second Home Partners — página inicial',
    nav: 'Navegação Second Home Partners',
    footerNav: 'Navegação do rodapé',
    menu: 'Menu',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    benefits: 'Benefícios',
    howItWorks: 'Como funciona',
    questions: 'Perguntas',
    contact: 'Conversar',
  },

  metadata: {
    siteName: 'Luxtory',
    title: 'Second Home Partners — Luxtory',
    description:
      'Parcerias para incorporadoras de empreendimentos de lazer: gestão de locações para os proprietários, apoio comercial e participação nos resultados.',
  },

  // PICTURE · Hero tipográfico (Deep): o corpo nomeia os três benefícios; a liberdade dos clientes está na headline.
  hero: {
    marker: 'Second Home Partners',
    title: {
      lead: 'Mais valor para seu empreendimento. ',
      turn: 'Mais liberdade para seus clientes.',
    },
    body: 'Uma parceria para diferenciar seu empreendimento, apoiar suas vendas e criar novas oportunidades de receita.',
    action: CTA,
    secondary: 'Conheça a parceria',
    // A indisponibilidade de Luxchange e Luxplus fica na nota das soluções, sem repetição no hero.
    note: 'Estamos estruturando o programa e buscando os primeiros parceiros.',
  },

  // PROBLEM · A oportunidade (White): a objeção da ociosidade vira argumento de venda. "Acelerar a decisão de compra" é
  // hipótese (`H-SHP-01`), nunca resultado.
  opportunity: {
    marker: 'Uma oportunidade para sua incorporadora',
    title: {
      lead: 'Um benefício a mais para o cliente. ',
      turn: 'Um argumento a mais para vender.',
    },
    paragraphs: [
      'Imagine seu cliente comprando um imóvel de lazer podendo alugá-lo nos períodos sem uso e, futuramente, descobrir outros destinos.',
      'Esse diferencial pode ajudar sua equipe a superar objeções e acelerar a decisão de compra.',
    ],
  },

  // PROMISE · Benefícios (Wash): três benefícios com o mesmo peso (`D-SHP-07`). A participação é parte da comissão da
  // Luxtory pela gestão das locações (`D-SHP-08`), nunca lucro nem a parte dos proprietários; o Club só como possibilidade.
  benefits: {
    marker: 'Para sua incorporadora',
    title: {
      lead: 'Mais valor para oferecer. ',
      turn: 'Mais oportunidades para crescer.',
    },
    intro:
      'Uma parceria que combina diferenciação comercial, apoio às vendas e novas oportunidades de receita.',
    items: [
      {
        title: 'Diferenciação comercial',
        text: 'Ofereça aos compradores novas formas de aproveitar o imóvel: locação de temporada e, no futuro, intercâmbio de estadias.',
      },
      {
        title: 'Marketing e vendas',
        text: 'Apoiamos sua equipe com estratégia, materiais e argumentos de venda, conforme o escopo contratado.',
      },
      {
        title: 'Participação nos resultados',
        text: 'Sua incorporadora recebe parte da comissão da Luxtory pelas locações e poderá participar dos resultados do Luxtory Club.',
      },
    ],
    note: 'Os benefícios dependem das condições da parceria. Não há garantia de vendas, receitas ou estadias.',
  },

  // PROOF · Soluções para os proprietários (White), na lista numerada da Home B2C: equilíbrio visual sem atribuir tudo ao
  // Club (`D-SHP-09`). Luxchange e Luxplus são mecanismos planejados do Club, para associados (BR-146, L2–L3); a
  // locação de temporada é a gestão da Luxtory, independente do Club e contratada por cada proprietário (L4).
  // Espaço inseparável antes do travessão: o rótulo nunca começa uma linha com ele.
  solutions: {
    marker: 'Mais liberdade para seus clientes',
    title: {
      lead: 'Um imóvel para chamar de seu. ',
      turn: 'E mais formas de aproveitá-lo.',
    },
    intro:
      'Três possibilidades para os proprietários aproveitarem melhor o imóvel, inclusive nos períodos sem uso.',
    items: [
      {
        label: 'Luxchange\u00a0— Intercâmbio de estadias',
        text: 'Os associados poderão disponibilizar períodos de seus imóveis e receber créditos para solicitar estadias em outros destinos da rede.',
      },
      {
        label: 'Luxplus\u00a0— Estadias adicionais',
        text: 'Os associados poderão reservar estadias disponíveis em outros imóveis da rede, pagando pela hospedagem, sem usar créditos.',
      },
      {
        label: 'Locação de temporada\u00a0— Monetização de períodos ociosos',
        text: 'Nos períodos sem uso, os proprietários poderão autorizar locações, com gestão digital da Luxtory e apoio de operadores locais.',
      },
    ],
    note: [
      'Luxchange e Luxplus são serviços planejados do Luxtory Club, ainda não disponíveis, com regras próprias para imóveis parceiros.',
      'A gestão de locações é independente e contratada diretamente com cada proprietário.',
    ],
  },

  // PROOF · Como funciona a parceria (Blue): quatro etapas reais, em ordem.
  process: {
    marker: 'Simples desde o primeiro contato',
    title: {
      lead: 'Uma parceria construída em conjunto. ',
      turn: 'Do primeiro contato em diante.',
    },
    steps: [
      {
        title: 'Conversa',
        text: 'Você apresenta seu empreendimento, a fase do projeto e o que busca na parceria.',
      },
      {
        title: 'Diagnóstico',
        text: 'Conhecemos seu produto, seus compradores e as oportunidades do projeto.',
      },
      {
        title: 'Proposta',
        text: 'Se fizer sentido para os dois lados, definimos serviços, responsabilidades e condições.',
      },
      {
        title: 'Parceria',
        text: 'Começamos o trabalho combinado. A entrada no Luxtory Club poderá vir depois.',
      },
    ],
    action: CTA,
  },

  // PROOF · Perguntas (Wash): só as dúvidas de uma incorporadora interessada (`D-SHP-10`) — O1, O3, O7, O8 e O6. A
  // disponibilidade do Club fica na nota das soluções; a etapa inicial, em Como funciona.
  faq: {
    title: 'O que você precisa saber.',
    items: [
      {
        question: 'Como a parceria pode ajudar minhas vendas?',
        answer:
          'Ela ajuda a enfrentar a objeção da ociosidade: o comprador poderá alugar os períodos sem uso e, no futuro, intercambiar estadias.',
      },
      {
        question: 'Como minha incorporadora participa dos resultados?',
        answer:
          'Ela recebe parte da comissão da Luxtory pela gestão das locações e, futuramente, poderá participar dos resultados do Luxtory Club.',
      },
      {
        question: 'Minha incorporadora precisa administrar as locações?',
        answer:
          'Não. A Luxtory faz a gestão digital e coordena os prestadores locais. Sua incorporadora pode oferecer Concierge e Facilities, se quiser.',
      },
      {
        question: 'Os proprietários precisam disponibilizar seus imóveis?',
        answer:
          'Não. Cada proprietário decide se contrata a gestão das locações e quais períodos quer disponibilizar.',
      },
      {
        question: 'Meu empreendimento precisa estar em alguma fase específica?',
        answer:
          'Não. A parceria pode começar em qualquer fase, do planejamento ao empreendimento entregue e em operação.',
      },
    ],
  },

  // PUSH · Conversa (White): introdução → formulário → aviso e privacidade.
  conversation: {
    marker: 'Vamos conversar',
    title: 'Seu empreendimento pode fazer parte dessa história.',
    intro:
      'Conte um pouco sobre seu projeto e o que sua incorporadora busca. Vamos descobrir juntos se a parceria faz sentido.',
    notice: 'O envio não formaliza uma parceria nem garante a entrada no Luxtory Club.',
    // Finalidade do REQ-105 (LGPD): delimitada e sem uso para marketing sem autorização.
    privacy:
      'Usaremos seus dados somente para responder ao contato e avaliar uma possível parceria. As informações serão encaminhadas à equipe Luxtory e não serão armazenadas no banco da plataforma. Não usaremos seus dados para marketing sem sua autorização.',
    submit: 'Enviar mensagem',
    // Só no aceite confirmado pelo provedor (202).
    success: 'Envio confirmado. Obrigado por apresentar seu empreendimento.',
  },

  /** Formulário (catalog §20.3): rótulos do contrato e microcopy funcional de validação e estado. */
  form: {
    labels: fieldLabels,
    stages,
    optional: '(opcional)',
    sending: 'Enviando…',
    errorSummary: 'Revise os campos indicados.',
    fields: {
      required: 'Preencha este campo.',
      too_long: 'Texto longo demais para este campo.',
      invalid: 'Valor inválido.',
    },
    fieldInvalid: {
      email: 'Informe um e-mail válido.',
      website: 'Informe o endereço completo do site, começando com http:// ou https://.',
    },
    stageRequired: 'Selecione a fase do empreendimento.',
    // Resultado do envio por código da resposta (TECH-056); 503 e falha de rede: envio não confirmado.
    outcomes: {
      unconfirmed:
        'Não foi possível confirmar o envio. Seus dados continuam no formulário; tente novamente.',
      rateLimited: 'Muitas tentativas em pouco tempo. Tente novamente mais tarde.',
      conflict:
        'Este envio já foi registrado com outros dados. Para enviar a mensagem atual, envie de novo.',
      refused: 'Não foi possível enviar a mensagem.',
    },
  },

  /** E-mail interno à caixa corporativa da jornada: assunto fixo, rótulos dos campos e nomes das fases. */
  contactEmail: {
    subject: 'Second Home Partners — mensagem pelo site',
    labels: fieldLabels,
    stages,
  },
} as const;

export type SecondHomePartnersMessages = typeof secondHomePartnersMessages;
