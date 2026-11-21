import { discoveryMessages } from './discovery-pt-br';

const { home: original, values } = discoveryMessages;

/** Copy da Home centrada no Luxtory Club (spec catalog §21). */
export const clubHomeMessages = {
  metadata: {
    title: 'Luxtory Club | Intercâmbio de estadias de alto padrão',
    description:
      'A Luxtory conecta imóveis de lazer de alto padrão para intercâmbio de estadias. Use períodos da sua casa para conhecer novos destinos.',
    siteName: 'Luxtory',
  },
  nav: {
    club: 'Luxtory Club',
    mechanics: discoveryMessages.site.howItWorks,
    faq: 'Dúvidas',
  },
  hero: {
    title: original.hero.title,
    carousel: original.hero.carousel,
    text: 'A Luxtory é um clube de intercâmbio de estadias em imóveis de lazer de alto padrão.',
    action: 'Conheça a Luxtory',
  },
  triad: {
    title: {
      lead: 'Seu segundo lar como chave mestra ',
      turn: 'para outros lares, em outros destinos',
    },
    text: [
      'Imagine fazer parte de um clube de imóveis de lazer onde você pode trocar períodos de uso da sua casa de férias por estadias em outros imóveis da rede.',
      'Com o intercâmbio, seu segundo lar abre as portas para novos destinos.',
    ],
    diagramAlt: original.renunciation.diagramAlt,
    pillars: [
      {
        title: values.patrimony,
        text: 'Um lugar seu, com privacidade e espaço para viver do seu jeito.',
      },
      {
        title: values.freedom,
        text: 'Mais opções na hora de escolher onde passar um feriado ou as férias.',
      },
      {
        title: values.belonging,
        text: 'Tempo com quem você ama, em casas que combinam com vocês.',
      },
    ],
  },
  club: {
    title: { lead: 'Foi para isso que criamos o ', turn: 'Luxtory Club.' },
    text: [
      'Um clube para quem deseja conciliar o patrimônio e o pertencimento que seu segundo lar oferece com a liberdade de viver novas experiências em outros destinos.',
      'A proposta é simples: você disponibiliza períodos de uso do seu imóvel e recebe créditos para solicitar estadias em outras casas da rede.',
      'Uma forma mais inteligente de aproveitar seu imóvel de lazer.',
    ],
    photo: original.media.kaizen,
  },
  mechanics: {
    title: { lead: 'Como funciona ', turn: 'a Luxtory' },
    items: [
      {
        title: 'Membership',
        text: [
          'É a associação à Luxtory. Se o seu imóvel for aprovado, você pode contratar a associação.',
          'Com a associação ativa, você pode usar o Luxchange e o Luxplus.',
        ],
      },
      {
        title: 'Luxchange',
        // A descrição de Second Home Partners serve de base, com a condição de aceite dos períodos.
        text: [
          'Os associados disponibilizam períodos de seus imóveis e recebem créditos pelas datas aceitas no intercâmbio.',
          'Com esses créditos, solicitam estadias em outros destinos da rede.',
          'Cada estadia depende da disponibilidade e das regras da Luxtory.',
        ],
      },
      {
        title: 'Luxplus',
        text: [
          'Os associados reservam estadias adicionais disponíveis na rede, pagando pela hospedagem, sem usar créditos.',
        ],
      },
    ],
  },
  services: {
    title: { lead: 'Além do ', turn: 'intercâmbio' },
    items: [
      {
        title: 'Locação de temporada',
        text: [
          'O proprietário escolhe os períodos que deseja disponibilizar para locação.',
          'A Luxtory cuida das locações online, com apoio de equipes locais.',
          'O serviço é opcional e contratado à parte.',
        ],
      },
      {
        title: 'Second Home Development',
        text: [
          'Desenvolvimento e gestão de produto para projetos de Second Homes nas modalidades Owner e Co-Owner.',
          'O projeto pode ter a identidade de uma marca licenciada.',
        ],
      },
      {
        title: 'Second Home Partners',
        text: [
          'Parceria com incorporadoras, imobiliárias e corretores que trabalham com imóveis de lazer.',
          'A parceria ajuda a apresentar aos clientes opções de locação e intercâmbio.',
        ],
      },
    ],
  },
  closing: {
    title: 'Viva o verdadeiro luxo de sentir-se em casa em outros destinos.',
    action: 'Tire suas dúvidas',
  },
  faq: {
    title: 'Dúvidas frequentes',
    items: [
      {
        question: 'Minha casa de lazer pode entrar na rede da Luxtory?',
        answer:
          'Para participar, você precisa ter o imóvel aprovado pela Luxtory e contratar a associação.',
      },
      {
        question: 'Minha casa continua sendo minha?',
        answer: 'Sim. Você oferece períodos para estadias e mantém a propriedade do imóvel.',
      },
      {
        question: 'Eu escolho as datas que ofereço?',
        answer:
          'Você escolhe quais datas guarda para usar a casa e quais oferece para intercâmbio. Só entram as datas que você tem direito de oferecer e que a Luxtory aceita.',
      },
      {
        question: 'Como eu recebo e uso os créditos?',
        answer:
          'Você recebe créditos pelos períodos aceitos no intercâmbio. Com a associação ativa e créditos válidos, pode solicitar uma estadia na rede.',
      },
      {
        question: 'Posso escolher qualquer destino ou data?',
        answer:
          'Você pode escolher entre os destinos da rede. A estadia depende da disponibilidade do imóvel na data que você quer e das regras da Luxtory.',
      },
      {
        question: 'Preciso contratar a gestão de locação para me associar?',
        answer:
          'A gestão de locação é opcional. Se quiser o apoio da Luxtory para alugar sua casa, pode contratar o serviço à parte.',
      },
    ],
  },
};
