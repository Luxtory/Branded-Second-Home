/**
 * Copy de lançamento aprovada pelo fundador em 2026-11-17 (REQ-105, catalog §20.6–20.8, D-SHP-14–18).
 * Uma página para os três perfis; participação enquanto afiliado, com valores dependentes de faturamento e contrato.
 * A preparação editorial no presente não implementa serviços nem comprova prontidão operacional do Club.
 */
import type { DevelopmentStage, PartnerProfile } from '../../domain/second-home-partner-contact';

const fieldLabels = {
  profile: 'Qual é o seu perfil?',
  name: 'Nome',
  company: 'Empresa',
  email: 'E-mail',
  development: 'Empreendimento e localização',
  stage: 'Fase do empreendimento',
  region: 'Cidade ou região de atuação',
  message: 'Mensagem',
  website: 'Site ou perfil profissional',
} as const;

const profiles: Readonly<Record<PartnerProfile, string>> = {
  developer: 'Incorporadora',
  agency: 'Imobiliária',
  broker: 'Corretor(a)',
};
const stages: Readonly<Record<DevelopmentStage, string>> = {
  planning_or_launch: 'Planejamento ou lançamento',
  construction_or_sales: 'Obra ou comercialização',
  delivered_or_operating: 'Entregue ou em operação',
};
const CTA = 'Conversar sobre uma parceria';

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
    title: 'Second Home Partners | Luxtory',
    description:
      'Parcerias para incorporadoras, imobiliárias e corretores de imóveis de lazer de alto padrão, com diferenciação comercial e oportunidades de receita recorrente.',
  },
  hero: {
    marker: 'Second Home Partners',
    title: {
      lead: 'Mais valor para seu negócio. ',
      turn: 'Mais liberdade para seus clientes.',
    },
    paragraphs: [
      'Para incorporadoras, imobiliárias e corretores de imóveis de lazer de alto padrão.',
      'Diferencie sua oferta e participe das receitas dos imóveis que você afilia à Luxtory.',
    ],
    action: CTA,
    secondary: 'Conheça a parceria',
  },
  opportunity: {
    marker: 'Uma oportunidade para seu negócio',
    title: {
      lead: 'Um benefício a mais para o cliente. ',
      turn: 'Um argumento a mais para vender.',
    },
    paragraphs: [
      'Imagine seu cliente adquirindo um imóvel de lazer afiliado a um clube.',
      'Nos períodos sem uso, ele pode monetizar o imóvel com locação de temporada.',
      'E trocar estadias por outros destinos da rede, aproveitando melhor seu patrimônio.',
      'Você ganha argumentos para superar objeções à compra e ajudar a encurtar o ciclo de vendas.',
    ],
    image: {
      src: '/images/como-funciona/problema-imovel.jpg',
      alt: 'Casa de lazer à beira-mar, com piscina e palmeiras ao pôr do sol.',
      width: 1024,
      height: 576,
    },
    closing: {
      lead: 'A venda termina. ',
      turn: 'Sua participação continua.',
    },
    participation:
      'Enquanto o imóvel estiver afiliado, você participa do faturamento que ele gera.',
  },
  benefits: {
    marker: 'Para nossos parceiros',
    title: {
      lead: 'Mais valor para oferecer. ',
      turn: 'Mais\u00a0oportunidades para crescer.',
    },
    intro:
      'Diferenciação comercial, apoio às vendas e participação no faturamento por toda a afiliação.',
    items: [
      {
        title: 'Receita além da venda',
        paragraphs: [
          'Os primeiros parceiros participam do faturamento dos imóveis que afiliarem à Luxtory.',
          'A participação continua enquanto o imóvel estiver afiliado.',
        ],
      },
      {
        title: 'Diferenciação comercial',
        paragraphs: [
          'Ofereça novas possibilidades de uso do imóvel, com locação de temporada e intercâmbio de estadias.',
        ],
      },
      {
        title: 'Marketing e vendas',
        paragraphs: [
          'Estratégia, materiais e argumentos para apoiar sua atuação comercial, conforme o escopo contratado.',
        ],
      },
    ],
    note: 'A participação depende do faturamento gerado pelos imóveis afiliados e das condições contratadas.',
  },
  developments: {
    marker: 'Onde a parceria pode acontecer',
    title: {
      lead: 'Da concepção à entrega. ',
      turn: 'Imóveis e empreendimentos podem fazer parte.',
    },
    intro:
      'Avaliamos o perfil dos imóveis, a fase do projeto e as oportunidades apresentadas por cada parceiro.',
    items: [
      {
        title: 'Imóveis em condomínios',
        text: 'Casas de lazer existentes ou já em desenvolvimento.',
        image: 'second-home-condominio-sob-demanda.webp',
        alt: 'Casa contemporânea com fachada de vidro, madeira e pedra, cercada por jardins.',
      },
      {
        title: 'Empreendimentos em desenvolvimento',
        text: 'Projetos em planejamento, lançamento ou obra, em busca de novos diferenciais.',
        image: 'empreendimento-em-desenvolvimento.webp',
        alt: 'Edifício em construção com guindaste, andaimes e estrutura dos pavimentos superiores exposta.',
      },
      {
        title: 'Imóveis entregues',
        text: 'Imóveis prontos, com novas possibilidades para os períodos sem uso.',
        image: 'empreendimento-entregue.webp',
        alt: 'Edifício concluído com varandas, entrada iluminada e paisagismo cuidado.',
      },
    ],
    note: 'A participação depende da avaliação dos imóveis e das condições da parceria. Imagens ilustrativas.',
  },
  development: {
    marker: 'Além da afiliação',
    title: { lead: 'Novas Second Homes. ', turn: 'Desenvolvidas sob demanda.' },
    intro:
      'A Luxtory também conecta marcas, incorporadoras e parceiros especializados para desenvolver novas Second Homes de alto padrão.',
    action: 'Conheça Second Home Development',
  },
  solutions: {
    marker: 'Mais liberdade para seus clientes',
    title: {
      lead: 'Um imóvel para chamar de seu. ',
      turn: 'E mais formas de aproveitá-lo.',
    },
    intro: 'Três possibilidades para aproveitar melhor o imóvel, inclusive nos períodos sem uso.',
    items: [
      {
        label: 'Luxchange\u00a0— Intercâmbio de estadias',
        paragraphs: [
          'Os associados disponibilizam períodos de seus imóveis e recebem créditos.',
          'Com esses créditos, solicitam estadias em outros destinos da rede.',
        ],
      },
      {
        label: 'Luxplus\u00a0— Estadias adicionais',
        paragraphs: [
          'Os associados reservam estadias disponíveis na rede, pagando pela hospedagem, sem usar créditos.',
        ],
      },
      {
        label: 'Locação de temporada',
        paragraphs: [
          'O proprietário escolhe os períodos que deseja disponibilizar para locação.',
          'A Luxtory faz a gestão digital, com apoio de operadores locais.',
        ],
      },
    ],
    note: [
      'Cada serviço segue regras próprias.',
      'A gestão de locações é independente do Club e contratada diretamente com cada proprietário.',
    ],
  },
  intermediaries: {
    marker: 'Imobiliárias e corretores',
    title: {
      lead: 'Seu relacionamento pode gerar receita ',
      turn: 'depois da venda.',
    },
    paragraphs: [
      'Você conhece os destinos, os imóveis e as pessoas que procuram por eles.',
      'Apresente imóveis que você já comercializou e os que ainda vai comercializar.',
      'A afiliação depende da avaliação da Luxtory e da adesão de cada proprietário.',
    ],
    items: [
      {
        title: 'Para imobiliárias',
        text: 'Amplie a proposta para sua carteira e participe das receitas dos imóveis que você afilia.',
      },
      {
        title: 'Para corretores',
        text: 'Acrescente argumentos ao atendimento e abra oportunidades de receita com os imóveis que você afilia.',
      },
    ],
    closing: {
      lead: 'Novas oportunidades. ',
      turn: 'Antes e depois da venda.',
    },
    action: CTA,
  },
  process: {
    marker: 'Simples desde o primeiro contato',
    title: {
      lead: 'Uma parceria construída em conjunto. ',
      turn: 'Do primeiro contato em diante.',
    },
    steps: [
      {
        title: 'Conversa',
        paragraphs: [
          'Conte sobre sua atuação, os imóveis com que trabalha e o que busca na parceria.',
        ],
      },
      {
        title: 'Diagnóstico',
        paragraphs: [
          'Conhecemos o perfil dos imóveis, dos clientes e as possibilidades de colaboração.',
        ],
      },
      {
        title: 'Proposta',
        paragraphs: [
          'Definimos serviços e responsabilidades.',
          'Acordamos a participação nas receitas e as condições comerciais.',
        ],
      },
      {
        title: 'Parceria',
        paragraphs: ['Formalizamos o acordo e iniciamos as ações previstas na parceria.'],
      },
    ],
    closing: {
      lead: 'Uma boa parceria começa ',
      turn: 'com uma conversa.',
    },
    action: CTA,
  },
  faq: {
    title: 'O que você precisa saber.',
    items: [
      {
        question: 'Quem pode ser parceiro da Luxtory?',
        answer: [
          'Incorporadoras, imobiliárias e corretores especialistas em imóveis de lazer de alto padrão.',
          'Cada oportunidade é avaliada conforme o perfil dos imóveis e a proposta de parceria.',
        ],
      },
      {
        question: 'Como a parceria pode ajudar minhas vendas?',
        answer: [
          'Acrescenta à sua proposta possibilidades de locação, intercâmbio e estadias adicionais.',
          'Esses argumentos podem ajudar você a conversar sobre os períodos sem uso do imóvel.',
        ],
      },
      {
        question: 'Como funciona a participação no faturamento?',
        answer: [
          'Os primeiros parceiros participam do faturamento dos imóveis que afiliarem à Luxtory.',
          'O parceiro responsável pela afiliação participa enquanto o imóvel permanecer afiliado.',
          'Receitas abrangidas, atribuição, percentuais e pagamento são definidos em contrato.',
        ],
      },
      {
        question: 'Preciso representar um empreendimento inteiro?',
        answer: [
          'Você pode apresentar sua atuação e o perfil dos imóveis que comercializa ou representa.',
          'Não é necessário ter um empreendimento próprio para iniciar a conversa.',
        ],
      },
      {
        question: 'Posso afiliar imóveis que já comercializei?',
        answer: [
          'Você pode apresentar imóveis que já comercializou e os que ainda vai comercializar.',
          'A afiliação depende da avaliação da Luxtory e da adesão de cada proprietário.',
        ],
      },
      {
        question: 'Os imóveis precisam estar prontos?',
        answer: [
          'A conversa pode começar no planejamento, no lançamento ou com imóveis prontos.',
          'A participação dos imóveis depende de avaliação e das condições da parceria.',
        ],
      },
      {
        question: 'Preciso administrar as locações?',
        answer: [
          'Não é preciso assumir a operação para apresentar seu interesse.',
          'As responsabilidades por gestão e serviços locais são definidas no escopo contratado.',
        ],
      },
      {
        question: 'Os proprietários são obrigados a disponibilizar seus imóveis?',
        answer: [
          'Não. Cada proprietário decide se contrata a gestão das locações e quais períodos deseja disponibilizar.',
        ],
      },
    ],
  },
  conversation: {
    marker: 'Vamos conversar',
    title: 'Vamos conhecer sua atuação.',
    intro: 'Conte como você atua e quais oportunidades quer apresentar à Luxtory.',
    notice: 'O envio inicia uma conversa e não formaliza parceria ou afiliação de imóveis.',
    privacy: [
      'Usaremos seus dados somente para responder ao contato e avaliar uma possível parceria.',
      'As informações serão encaminhadas à equipe Luxtory e não serão armazenadas no banco da plataforma.',
      'Não usaremos seus dados para marketing sem sua autorização.',
    ],
    submit: 'Enviar mensagem',
    success: 'Envio confirmado. Obrigado pelo interesse em conversar com a Luxtory.',
  },
  form: {
    labels: fieldLabels,
    profiles,
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
      website: 'Informe o endereço completo do site ou perfil, começando com http:// ou https://.',
    },
    profileRequired: 'Selecione o seu perfil.',
    stageRequired: 'Selecione a fase do empreendimento.',
    outcomes: {
      unconfirmed:
        'Não foi possível confirmar o envio. Seus dados continuam no formulário; tente novamente.',
      rateLimited: 'Muitas tentativas em pouco tempo. Tente novamente mais tarde.',
      conflict:
        'Este envio já foi registrado com outros dados. Para enviar a mensagem atual, envie de novo.',
      refused: 'Não foi possível enviar a mensagem.',
    },
  },
  contactEmail: {
    subject: 'Second Home Partners — mensagem pelo site',
    labels: fieldLabels,
    profiles,
    stages,
  },
} as const;

export type SecondHomePartnersMessages = typeof secondHomePartnersMessages;
