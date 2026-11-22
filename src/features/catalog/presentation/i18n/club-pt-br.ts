/** Página pública de explicação do Luxtory Club (catalog §22). */
export const clubMessages = {
  metadata: {
    title: 'Luxtory Club | Como funciona o intercâmbio de estadias',
    description:
      'Conheça o Luxtory Club, do imóvel aos créditos e à estadia. Entenda o intercâmbio, o Luxplus e as condições de participação.',
    siteName: 'Luxtory',
  },
  nav: {
    steps: 'Como funciona',
    exchange: 'Luxchange',
    faq: 'Dúvidas',
  },
  hero: {
    title: { lead: 'Da sua casa ', turn: 'a novos destinos.' },
    text: 'O Luxtory Club é um clube de intercâmbio de estadias para quem tem um imóvel de lazer de alto padrão.',
    action: 'Veja como funciona',
    photo: {
      alt: 'Casa de lazer à beira-mar, com piscina ao pôr do sol.',
      caption: 'Imagem ilustrativa.',
    },
  },
  steps: {
    title: { lead: 'Como você ', turn: 'participa' },
    intro:
      'Estas são as etapas previstas para participar. As condições de avaliação e adesão de imóveis já existentes estão em definição.',
    items: [
      {
        title: 'Avaliação do imóvel',
        text: 'A Luxtory avalia se o imóvel atende aos critérios de participação.',
      },
      {
        title: 'Associação',
        text: 'O Membership é a associação à Luxtory que dá acesso ao intercâmbio e aos demais serviços do Club.',
      },
      {
        title: 'Escolha dos períodos',
        text: 'Você escolhe os períodos disponíveis que tem direito de ceder.',
      },
      {
        title: 'Créditos',
        text: 'A Luxtory gera créditos quando a cessão do período é validada e concluída.',
      },
      {
        title: 'Estadias',
        text: 'Com os créditos, você pode solicitar uma estadia em outro destino, sujeita à confirmação da reserva.',
      },
    ],
  },
  exchange: {
    title: { lead: 'Luxchange. ', turn: 'Dos períodos às estadias.' },
    intro: 'O Luxchange é o intercâmbio por créditos previsto no modelo do Club.',
    deposit: {
      title: 'Como você recebe créditos',
      text: [
        'No depósito, você oferece um período à Luxtory. Os créditos entram no saldo quando a cessão é validada e concluída.',
        'O valor de referência de cada data determina quantos créditos ela gera. Os créditos têm prazo de validade.',
      ],
    },
    bookingTitle: 'Dois caminhos para reservar',
    methods: [
      {
        title: 'Request',
        subtitle: 'Solicitação a outro membro',
        text: [
          'Você envia o pedido a quem pode ceder a data. Enquanto essa pessoa decide, a solicitação não reserva o período.',
          'Para enviar o pedido, você paga a taxa e os créditos necessários ficam reservados.',
          'Com o aceite e a validação da Luxtory, a reserva se confirma. Quem cede a data recebe os créditos.',
        ],
      },
      {
        title: 'Direct',
        subtitle: 'Reserva com a Luxtory',
        text: [
          'Você escolhe um período que já está sob controle da Luxtory. A reserva dispensa o aceite de outro titular.',
          'A confirmação depende da disponibilidade, da validação das condições e do pagamento da taxa.',
        ],
      },
    ],
    conditions: [
      'Os dois caminhos exigem associação ativa, créditos válidos e suficientes e o cumprimento das regras do Club.',
      'Quem solicita a estadia paga uma taxa de intercâmbio em dinheiro.',
      'A data exibida indica disponibilidade. Conte com a estadia após receber a confirmação.',
    ],
  },
  services: {
    title: { lead: 'Outras formas de ', turn: 'aproveitar' },
    items: [
      {
        title: 'Luxplus',
        text: [
          'O Luxplus prevê estadias adicionais para associados em datas que a Luxtory disponibiliza para compra.',
          'A hospedagem é paga em dinheiro, sem usar créditos do Luxchange.',
        ],
      },
      {
        title: 'Locação de temporada',
        text: [
          'Para imóveis parceiros, está prevista a gestão opcional de locações em plataformas de terceiros, com contratação à parte.',
          'Nas Second Homes do modelo original do Club, a locação pelo canal da Luxtory exige associação ativa e autorização das datas.',
        ],
      },
    ],
    photo: {
      alt: 'Quarto de uma casa de lazer aberto para um jardim.',
      caption: 'Imagem ilustrativa.',
    },
  },
  control: {
    title: { lead: 'Seu imóvel ', turn: 'continua sendo seu' },
    items: [
      {
        title: 'Propriedade',
        text: 'A associação preserva a propriedade e os direitos de uso do seu imóvel.',
      },
      {
        title: 'Calendário',
        text: 'Você decide quais períodos pode oferecer, respeitando seus direitos de uso e os compromissos já assumidos.',
      },
      {
        title: 'Períodos comprometidos',
        text: 'Uma vez cedida ou reservada, a data fica vinculada ao uso acordado.',
      },
    ],
  },
  faq: {
    title: 'Dúvidas frequentes',
    items: [
      {
        question: 'Posso retirar um período que ofereci?',
        answer: 'Você pode retirar a oferta enquanto a data estiver livre de compromissos.',
      },
      {
        question: 'E se minha solicitação for recusada ou expirar?',
        answer:
          'No modelo do Club, os créditos reservados são liberados conforme sua validade original e a taxa é devolvida integralmente.',
      },
      {
        question: 'Para que posso usar meus créditos?',
        answer: 'Os créditos têm uso exclusivo no intercâmbio, tanto em Request quanto em Direct.',
      },
      {
        question: 'Uma data pode gerar créditos e receita de locação?',
        answer:
          'Você recebe créditos pela cessão do período. O uso posterior pela Luxtory não gera nova receita para você.',
      },
      {
        question: 'Quais são as condições de cancelamento?',
        answer:
          'A política apresentada antes do pedido ou da reserva define o que acontece com os créditos e os valores pagos.',
      },
    ],
  },
  next: {
    title: { lead: 'Um lugar para chamar de seu. ', turn: 'Mais possibilidades para viver.' },
    text: 'A avaliação é o primeiro passo. O canal de afiliação está em desenvolvimento.',
    action: 'Tire suas dúvidas',
  },
} as const;
