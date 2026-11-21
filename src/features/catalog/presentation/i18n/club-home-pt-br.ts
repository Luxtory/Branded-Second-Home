import { discoveryMessages } from './discovery-pt-br';

const { home: original, values } = discoveryMessages;

/** Copy da Home centrada no Luxtory Club (spec catalog §21). */
export const clubHomeMessages = {
  metadata: {
    title: 'Luxtory Club | Intercâmbio de estadias de alto padrão',
    description:
      'O Luxtory Club é um clube de intercâmbio de estadias em imóveis de lazer de alto padrão. Sua casa pode ser o ponto de partida para conhecer novos destinos.',
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
    text: 'O Luxtory Club é um clube de intercâmbio de estadias. Seu imóvel de lazer pode abrir caminho para outras casas de alto padrão.',
    action: 'Conheça o Luxtory Club',
  },
  triad: {
    title: { lead: 'Seu segundo lar como chave mestra. ', turn: 'Para outros lares pelo mundo.' },
    text: [
      'Imagine passar as férias com a família no seu lugar de sempre e reunir os amigos num feriado à beira-mar.',
      'Com o intercâmbio, a casa que você já tem pode ser o começo de viagens assim.',
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
      'O Club foi pensado para quem gosta de viajar e se sentir em casa. A rede será formada por imóveis de lazer selecionados pela Luxtory.',
      'A ideia é que você possa oferecer períodos da sua casa e usar créditos para pedir uma estadia em outro destino.',
    ],
    photo: original.media.kaizen,
  },
  mechanics: {
    title: { lead: 'Como funciona ', turn: 'o Club' },
    intro: 'A Luxtory está preparando o Club para quem já tem um imóvel de lazer.',
    items: [
      {
        title: 'Membership',
        text: [
          'É a associação ao Luxtory Club. Se a Luxtory aprovar seu imóvel, você pode contratar a associação.',
          'Com a associação ativa, você pode usar o Luxchange e o Luxplus.',
        ],
      },
      {
        title: 'Luxchange',
        // A descrição de Second Home Partners serve de base, com a condição de aceite dos períodos.
        text: [
          'Os associados disponibilizam períodos de seus imóveis e podem receber créditos do Club pelas datas aceitas no intercâmbio.',
          'Com esses créditos, solicitam estadias em outros destinos da rede.',
          'Cada estadia depende das regras do Club e da disponibilidade.',
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
    title: { lead: 'Além do ', turn: 'Club' },
    items: [
      {
        title: 'Locação de temporada',
        text: [
          'O proprietário escolhe os períodos que deseja disponibilizar para locação.',
          'A proposta é que a Luxtory cuide das locações online, com apoio de equipes locais.',
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
  invite: {
    title: { lead: 'Para quem é o ', turn: 'Luxtory Club?' },
    text: 'Para quem tem um imóvel de lazer de alto padrão e quer conhecer outros destinos em família ou com amigos.',
    promise: original.freedom.closing,
    promiseDetails: 'Suas próximas histórias podem acontecer em muitos outros destinos.',
    action: 'Tire suas dúvidas',
  },
  faq: {
    title: 'Dúvidas frequentes',
    items: [
      {
        question: 'Minha casa de lazer pode entrar no Club?',
        answer:
          'A Luxtory está preparando a entrada desses imóveis no Club. Para participar, será preciso ter o imóvel aprovado e contratar a associação.',
      },
      {
        question: 'Minha casa continua sendo minha?',
        answer: 'Sim. Você oferece períodos para estadias e mantém a propriedade do imóvel.',
      },
      {
        question: 'Eu escolho as datas que ofereço?',
        answer:
          'Você escolhe quais datas guarda para usar a casa e quais oferece ao Club. Só entram no intercâmbio as datas que você tem direito de oferecer e que o Club aceita.',
      },
      {
        question: 'Como eu recebo e uso os créditos?',
        answer:
          'Os períodos aceitos para o intercâmbio podem virar créditos. Com a associação ativa e os créditos ainda válidos, você pode pedir uma estadia na rede.',
      },
      {
        question: 'Posso escolher qualquer destino ou data?',
        answer:
          'Você pode escolher entre os destinos da rede. A estadia depende da disponibilidade do imóvel na data que você quer e das regras do Club.',
      },
      {
        question: 'Preciso contratar a gestão de locação para entrar no Club?',
        answer:
          'A gestão de locação é opcional. Se quiser o apoio da Luxtory para alugar sua casa, pode contratar o serviço à parte.',
      },
    ],
  },
};
