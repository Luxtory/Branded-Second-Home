import { discoveryMessages } from './discovery-pt-br';

const { home: original, values } = discoveryMessages;

/** Copy da Home centrada no Luxtory Club (spec catalog §21). */
export const clubHomeMessages = {
  metadata: {
    title: 'Luxtory Club | Intercâmbio de estadias de alto padrão',
    description:
      'Conheça o Luxtory Club, a proposta de intercâmbio de estadias em imóveis de lazer de alto padrão para descobrir novos destinos.',
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
    text: 'Luxtory Club. Intercâmbio de estadias de alto padrão para descobrir outros destinos a partir do seu imóvel.',
    action: 'Conheça o Luxtory Club',
  },
  triad: {
    title: { lead: 'Um lugar para chamar de seu. ', turn: 'Mais possibilidades para viver.' },
    text: [
      'Sua Second Home guarda os rituais que você criou e as histórias que viveu com quem ama.',
      'Há também lugares que você ainda quer conhecer. Seu patrimônio pode abrir caminho para essas experiências.',
    ],
    diagramAlt: original.renunciation.diagramAlt,
    pillars: [
      {
        title: values.patrimony,
        text: 'O seu lugar, com a identidade e a privacidade que você conquistou.',
      },
      {
        title: values.freedom,
        text: 'Mais destinos para descobrir e novas experiências para viver.',
      },
      {
        title: values.belonging,
        text: 'Tempo com quem você ama, em lugares que combinam com seu jeito de viver.',
      },
    ],
  },
  club: {
    title: { lead: 'Foi para isso que criamos o ', turn: 'Luxtory Club.' },
    text: [
      'Um clube de intercâmbio de estadias em imóveis de lazer de alto padrão, pensado para reunir proprietários e imóveis selecionados.',
      'A proposta é que você escolha períodos elegíveis do seu imóvel para disponibilizar e possa solicitar estadias em outros destinos.',
    ],
    photo: original.media.kaizen,
  },
  mechanics: {
    title: { lead: 'Como funciona ', turn: 'o Club' },
    intro: 'A afiliação de imóveis existentes está em desenvolvimento.',
    items: [
      {
        title: 'Membership',
        text: [
          'A associação ao Club depende de elegibilidade e contratação.',
          'Para acessar Luxchange e Luxplus, é preciso ter Membership elegível e vigente.',
        ],
      },
      {
        title: 'Luxchange',
        text: [
          'A cessão válida de períodos elegíveis pode gerar créditos internos.',
          'Com créditos válidos, você pode solicitar estadias na rede, conforme as regras e a disponibilidade.',
        ],
      },
      {
        title: 'Luxplus',
        text: [
          'Estadias adicionais disponíveis podem ser adquiridas mediante pagamento, independentemente do saldo de créditos de intercâmbio.',
        ],
      },
    ],
  },
  services: {
    title: { lead: 'Serviços e ', turn: 'parcerias' },
    items: [
      {
        title: 'Gestão de locação de temporada',
        text: 'Serviço opcional, contratado à parte, para proprietários que desejam autorizar períodos do imóvel para locação.',
      },
      {
        title: 'Second Home Development',
        text: 'Desenvolvimento e gestão de produto de Second Homes nas modalidades Owner e Co-Owner, com ou sem identidade de marca licenciada.',
      },
      {
        title: 'Second Home Partners',
        text: 'Parceria com incorporadoras, imobiliárias e corretores especializados em imóveis de lazer.',
      },
    ],
  },
  invite: {
    title: { lead: 'Para quem é o ', turn: 'Luxtory Club?' },
    text: 'Para quem já tem um imóvel de lazer de alto padrão e quer viver novas experiências com a família e os amigos.',
    promise: 'Seu lugar continua sendo seu.',
    promiseDetails: 'Suas próximas histórias podem acontecer em muitos outros destinos.',
    action: 'Tire suas dúvidas',
  },
  faq: {
    title: 'Dúvidas frequentes',
    items: [
      {
        question: 'Posso afiliar um imóvel que já possuo?',
        answer:
          'A afiliação está em desenvolvimento. A adesão dependerá da avaliação do imóvel e das condições do Club.',
      },
      {
        question: 'O intercâmbio altera a propriedade do meu imóvel?',
        answer: 'O intercâmbio se limita a estadias. A propriedade do imóvel permanece com você.',
      },
      {
        question: 'Eu escolho os períodos que disponibilizo?',
        answer:
          'Você decide quais períodos elegíveis deseja disponibilizar e quais mantém para uso próprio, conforme os direitos sobre o imóvel.',
      },
      {
        question: 'Como recebo e uso os créditos?',
        answer:
          'A origem dos créditos depende da cessão válida de períodos elegíveis. O uso exige créditos válidos e Membership elegível e vigente.',
      },
      {
        question: 'Posso escolher qualquer destino ou data?',
        answer:
          'Cada pedido depende da disponibilidade do imóvel e do período, além das regras do Club, mesmo com créditos válidos.',
      },
      {
        question: 'Preciso contratar a gestão de locação?',
        answer: 'A gestão de locação de temporada é opcional e tem contratação própria.',
      },
    ],
  },
};
