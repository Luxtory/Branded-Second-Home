/**
 * Jornada pública Second Home Partners (REQ-105, spec catalog §18): Master Copy do plano v3.3 aprovado pelo fundador em
 * 2026-11-12, com os dois ajustes da aprovação final (introdução do Luxtory Club; o parágrafo de receita da oportunidade
 * pertence à versão A). Versão B (`D-SHP-04`): nenhuma menção a receita ou participação nos resultados até a validação
 * jurídica e econômica (`P-SHP-01`). Os textos são VERBATIM — não reescrever, resumir nem acrescentar claim.
 * Headlines: `lead` + `turn` (a virada em itálico da copy). Identificadores internos (funções 5P) ficam só nos comentários.
 */

import type { DevelopmentStage } from '../../domain/second-home-partner-contact';

/** Rótulos do formulário (catalog §18.3) e do e-mail interno: os campos autorizados pelo REQ-105. */
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
      'Parcerias para incorporadoras de empreendimentos de lazer, com apoio comercial e novas experiências de viagem em estruturação.',
  },

  // PICTURE · Hero tipográfico (Deep).
  hero: {
    marker: 'Second Home Partners',
    title: {
      lead: 'Mais valor para seu empreendimento. ',
      turn: 'Mais liberdade para seus clientes.',
    },
    body: 'Uma parceria para diferenciar seu empreendimento, apoiar suas vendas e oferecer novas possibilidades aos seus clientes.',
    action: CTA,
    secondary: 'Conheça a parceria',
    note: 'Estamos estruturando o programa e buscando os primeiros parceiros. O intercâmbio ainda não está disponível.',
  },

  // PROBLEM · A oportunidade (White). "Acelerar a decisão de compra" é hipótese (`H-SHP-01`), nunca resultado.
  opportunity: {
    marker: 'Uma oportunidade para sua incorporadora',
    title: {
      lead: 'Um benefício a mais para o cliente. ',
      turn: 'Um argumento a mais para vender.',
    },
    paragraphs: [
      'Imagine seu cliente comprando um imóvel de lazer e tendo a possibilidade de aproveitar outros destinos.',
      'Esse diferencial pode ajudar sua equipe a superar objeções e acelerar a decisão de compra.',
    ],
  },

  // PROMISE · Benefícios (Wash). Versão B: dois benefícios; o terceiro (participação nos resultados) é da versão A.
  benefits: {
    marker: 'Para sua incorporadora',
    title: {
      lead: 'Mais valor para oferecer. ',
      turn: 'Mais oportunidades para crescer.',
    },
    intro: 'Uma parceria que combina diferenciação comercial e apoio às vendas.',
    items: [
      {
        title: 'Diferenciação comercial',
        text: 'Ofereça aos compradores a perspectiva de aproveitar outros destinos por meio do futuro intercâmbio da Luxtory.',
      },
      {
        title: 'Marketing e vendas',
        text: 'Apoiamos sua equipe com materiais de venda, treinamento e argumentos que valorizam o empreendimento.',
      },
    ],
    note: 'Os benefícios dependem das condições da parceria. Não há garantia de vendas, receitas ou estadias.',
  },

  // PROOF · Luxtory Club (White): modelo previsto, nunca disponibilidade atual. Créditos, estadias pagas e locação não
  // se confundem (aplicação L2–L4).
  club: {
    marker: 'Mais liberdade para seus clientes',
    title: {
      lead: 'Um imóvel para chamar de seu. ',
      turn: 'E outros destinos para descobrir.',
    },
    intro:
      'O Luxtory Club é a rede planejada de Second Homes da Luxtory. A entrada de imóveis parceiros ainda está sendo estruturada.',
    items: [
      {
        label: 'Luxchange — Intercâmbio de estadias',
        text: 'Os associados poderão disponibilizar períodos do seu imóvel e receber créditos para solicitar estadias em outros destinos.',
      },
      {
        label: 'Luxplus — Estadias adicionais',
        text: 'Os associados poderão reservar estadias disponíveis em outros imóveis da rede, pagando pela hospedagem, sem usar créditos.',
      },
      {
        label: 'Locação — Aproveite os períodos disponíveis',
        text: 'Com autorização dos proprietários, períodos disponíveis também poderão ser oferecidos para locação ao público.',
      },
    ],
    note: 'O Luxtory Club ainda não está disponível. A participação dos imóveis parceiros dependerá de regras próprias.',
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

  // PROOF · Perguntas (Wash): objeções O1, O2, O4, O5 e O6 da aplicação; O3 (participação) é da versão A.
  faq: {
    title: 'O que você precisa saber.',
    items: [
      {
        question: 'Como a parceria pode ajudar minhas vendas?',
        answer:
          'Ela pode agregar valor ao empreendimento e dar à sua equipe novos argumentos de venda.',
      },
      {
        question: 'O Luxtory Club já está funcionando?',
        answer:
          'Ainda não. O intercâmbio e os demais serviços do Club estão previstos, mas ainda não estão disponíveis.',
      },
      {
        question: 'Preciso mudar a marca ou o projeto do meu empreendimento?',
        answer:
          'Não. Marca, conceito e projeto continuam os mesmos. Branded Second Homes são outra proposta da Luxtory, para novos projetos.',
      },
      {
        question: 'Já tenho parceria com outra intercambiadora. Posso conversar com a Luxtory?',
        answer:
          'Claro. Vamos avaliar se as propostas podem funcionar juntas, respeitando os contratos que sua incorporadora já possui.',
      },
      {
        question: 'Meu empreendimento já está pronto. Posso participar?',
        answer:
          'Podemos conversar. A prioridade são projetos em lançamento, mas também avaliamos obras e empreendimentos entregues.',
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

  /** Formulário (catalog §18.3): rótulos do contrato e microcopy funcional de validação e estado. */
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
