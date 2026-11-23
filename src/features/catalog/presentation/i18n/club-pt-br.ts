/** Página pública de explicação do Luxtory Club (catalog §22). */
export const clubMessages = {
  metadata: {
    title: 'Luxtory Club | Como funciona o intercâmbio de estadias',
    description:
      'Veja como funciona o intercâmbio de estadias do Luxtory Club e como os períodos do seu imóvel de lazer podem virar créditos para viajar.',
    siteName: 'Luxtory',
  },
  nav: {
    steps: 'Como funciona',
    exchange: 'Luxchange',
    faq: 'Dúvidas',
  },
  hero: {
    title: { lead: 'Hoje a sua casa de campo. ', turn: 'Amanhã uma casa na praia.' },
    subheadline:
      'As datas da sua casa que entram no intercâmbio geram créditos para pedir estadias em outros destinos.',
    action: 'Veja como funciona',
    photo: {
      alt: 'Casa de lazer à beira-mar, com piscina ao pôr do sol.',
      caption: 'Imagem ilustrativa.',
    },
  },
  steps: {
    title: { lead: 'Do seu imóvel ', turn: 'à próxima estadia' },
    intro:
      'A entrada de imóveis já existentes terá condições próprias de avaliação e adesão, ainda em definição.',
    items: [
      {
        title: 'Avaliação do imóvel',
        text: 'A Luxtory avalia se o imóvel pode participar.',
      },
      {
        title: 'Associação',
        text: 'Com o imóvel aprovado, você pode contratar o Membership, a associação ao Luxtory Club.',
      },
      {
        title: 'Escolha das datas',
        text: 'Você escolhe as datas disponíveis que tem direito de oferecer.',
      },
      {
        title: 'Créditos',
        text: 'Você recebe os créditos quando a Luxtory confirma que o período entrou no intercâmbio.',
      },
      {
        title: 'Próxima estadia',
        text: 'Use os créditos para pedir uma estadia em outro destino. A reserva só vale depois da confirmação.',
      },
    ],
  },
  exchange: {
    title: { lead: 'Luxchange. ', turn: 'Como usar seus créditos.' },
    intro: 'O Luxchange é a forma de pedir estadias com créditos no modelo do Club.',
    deposit: {
      title: 'De onde vêm os créditos',
      text: [
        'Você oferece datas à Luxtory. Quando o depósito é concluído e as datas entram no intercâmbio, os créditos entram no seu saldo.',
        'Você também recebe créditos ao aceitar um Luxchange Request para o seu imóvel, depois que a Luxtory valida e confirma a reserva.',
        'A quantidade de créditos depende do Preço de Referência Luxtory de cada data. Os créditos têm prazo de validade.',
      ],
    },
    dates: {
      title: 'Intercâmbio por dia',
      text: 'Você escolhe o período por dia. Pode pedir uma estadia menor que uma semana, conforme as datas disponíveis e as regras da estadia.',
    },
    bookingTitle: 'Dois caminhos para reservar',
    methods: [
      {
        title: 'Luxchange Request',
        description: 'Solicitação de reserva a outro membro.',
        text: [
          'Você pede a data a quem pode oferecê-la. Enquanto essa pessoa decide, a data segue livre para outras reservas.',
          'Para enviar o pedido, você paga a taxa. Os créditos necessários ficam separados no seu saldo.',
          'Se a pessoa aceitar e a Luxtory validar as condições, a reserva se confirma. Quem oferece a data recebe os créditos.',
        ],
      },
      {
        title: 'Luxchange Direct',
        description: 'Reserva direta com a Luxtory.',
        text: [
          'Você escolhe entre as datas que a Luxtory já pode oferecer, sem esperar o aceite de outro membro.',
          'A Luxtory confirma a reserva após conferir a disponibilidade, os créditos, as demais condições e o pagamento da taxa.',
        ],
      },
    ],
    conditions: {
      title: 'Associação, créditos e taxa',
      text: [
        'Você precisa ter associação ativa, cumprir as regras do Club e ter créditos válidos e suficientes para a estadia.',
        'Os créditos são usados na confirmação da reserva. Quem pede a estadia paga a taxa de intercâmbio.',
      ],
    },
    feeExample: {
      title: 'Taxa de intercâmbio',
      intro: 'Simulação com a taxa proposta de 12% sobre o preço de mercado da estadia.',
      values: [
        { label: 'Preço de mercado', value: 'R$ 5.000' },
        { label: 'Taxa de intercâmbio no exemplo', value: 'R$ 600' },
        { label: 'Diferença considerando só a taxa', value: '88% · R$ 4.400' },
      ],
      notes: [
        'A comparação usa o mesmo imóvel, nas mesmas datas e condições. Os 88% consideram apenas a taxa de intercâmbio.',
        'A reserva também usa créditos. O custo da associação e cobranças adicionais, como limpeza ou tributos quando aplicáveis, reduzem a economia final.',
      ],
    },
  },
  services: {
    title: { lead: 'Mais formas de ', turn: 'aproveitar' },
    items: [
      {
        title: 'Luxplus',
        text: [
          'O Luxplus prevê estadias extras para quem tem associação ativa. Você escolhe entre as datas que a Luxtory oferece.',
          'Você paga pela estadia e guarda os créditos do Luxchange para outra viagem.',
        ],
      },
      {
        title: 'Locação de temporada',
        text: [
          'A locação de temporada com gestão profissional pelo Luxtory Club é exclusiva para membros com associação ativa.',
          'Você escolhe as datas disponíveis que quer colocar para locação.',
        ],
      },
    ],
    photo: {
      alt: 'Duas pessoas em um espaço de descanso cercado por painéis de madeira.',
      caption: 'Imagem ilustrativa.',
    },
  },
  control: {
    title: { lead: 'Seu imóvel ', turn: 'continua sendo seu.' },
    text: [
      'Você mantém a propriedade do imóvel e os direitos de uso que já tem.',
      'Você escolhe quais datas disponibilizar. Quando uma data é cedida ou reservada, ela fica comprometida e indisponível para outros usos.',
    ],
  },
  faq: {
    title: 'Dúvidas frequentes',
    items: [
      {
        question: 'Posso voltar atrás depois de oferecer uma data?',
        answer: 'Pode, enquanto a data estiver livre de compromissos.',
      },
      {
        question: 'E se o meu pedido for recusado ou vencer?',
        answer:
          'Você recebe de volta o valor integral da taxa. Os créditos que ainda estiverem válidos voltam a ficar disponíveis.',
      },
      {
        question: 'Para que posso usar meus créditos?',
        answer:
          'Os créditos servem para reservar pelo Luxchange, tanto por pedido a outro membro quanto pela Luxtory. Eles não podem ser trocados por dinheiro.',
      },
      {
        question: 'Uma data pode gerar créditos e receita de locação?',
        answer:
          'Você recebe créditos pelas datas que entram no intercâmbio. A receita de locação vem de outras datas que você autoriza e que são alugadas.',
      },
      {
        question: 'Como funciona se eu precisar cancelar?',
        answer:
          'As condições aparecem antes de você pedir ou reservar a estadia. Elas explicam o que acontece com seus créditos e com o valor pago em caso de cancelamento.',
      },
    ],
  },
  next: {
    title: { lead: 'O Club faz sentido ', turn: 'para o seu imóvel?' },
    text: 'A primeira etapa é a avaliação. A forma de apresentar seu imóvel à Luxtory ainda está em definição.',
    action: 'Veja as condições',
  },
} as const;
