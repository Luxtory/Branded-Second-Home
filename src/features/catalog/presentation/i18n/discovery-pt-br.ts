// Copy do Discovery público (pt-BR). Fonte estratégica: docs/specs/catalog.md §13.4 (briefs) e
// docs/specs/communication/ (b2c.md, luxtory.md). Cada frase sustenta-se num fato citado no brief ou numa decisão
// aprovada; nada de número, preço ou prova além dos canônicos. Terminologia do `02` §1 (REQ-100, REQ-101).

/** Headline com no máximo uma virada em itálico (docs/reference/design-system.md §4). */
export interface Headline {
  readonly lead: string;
  readonly turn?: string;
  readonly tail?: string;
}

export const discoveryMessages = {
  site: {
    name: 'Luxtory',
    skipLink: 'Ir para o conteúdo',
    home: 'Luxtory — página inicial',
    nav: 'Navegação principal',
    footerNav: 'Navegação do rodapé',
    menu: 'Menu',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    collection: 'Coleção',
    howItWorks: 'Como funciona',
  },
  metadata: {
    home: {
      title: 'Luxtory — Branded Second Homes',
      description:
        'Segundas casas construídas do zero a partir do universo de marcas que você admira, para ter por inteiro, como Owner, ou em copropriedade, como Co-Owner.',
    },
    howItWorks: {
      title: 'Como funciona — Luxtory',
      description:
        'Da marca à casa: Residence Concept, Residence Edition, Owner e Co-Owner, o uso ao longo do ano e o Luxtory Club, com as condições e os limites de cada um.',
    },
    collection: {
      title: 'Coleção — Luxtory',
      description: 'Residence Concepts: casas pensadas a partir do universo de uma marca.',
    },
    conceptSuffix: ' — Luxtory',
    notFound: 'Página não encontrada — Luxtory',
  },
  actions: {
    collection: 'Conhecer a Coleção',
    howItWorks: 'Entender como funciona',
    otherConcepts: 'Conhecer outros Concepts',
  },
  // PUSH (b2c.md §7): para quem faz e para quem pode não fazer sentido.
  qualification: {
    title: { lead: 'Para quem é — ', turn: 'e para quem não é', tail: '.' } satisfies Headline,
    fitsTitle: 'Faz sentido para quem',
    notFitsTitle: 'Pode não fazer sentido para quem',
    fits: [
      'quer uma casa nova, nascida de um Concept, e aceita os elementos essenciais que o definem;',
      'como Owner, quer a casa inteira, como único adquirente;',
      'como Co-Owner, quer uso definido todos os anos, dividido com regras iguais para todos.',
    ],
    notFits: [
      'quer reformar ou adaptar um imóvel que já existe;',
      'busca rentabilidade, valorização, renda ou liquidez garantidas;',
      'como Co-Owner, precisa das mesmas datas todos os anos ou quer personalizar a casa.',
    ],
  },
  home: {
    hero: {
      title: {
        lead: 'Uma segunda casa com ',
        turn: 'a identidade',
        tail: ' de uma marca que você admira.',
      } satisfies Headline,
      lead: 'Branded Second Home é a segunda casa construída do zero a partir do universo de uma marca: a identidade, os códigos, o jeito de viver. Para ter por inteiro, como Owner, ou em copropriedade, como Co-Owner.',
    },
    problem: {
      title: { lead: 'Metragem não é ', turn: 'identidade', tail: '.' } satisfies Headline,
      paragraphs: [
        'Pensada como metragem e estoque, uma casa entrega paredes, não um jeito de viver.',
        'E fazer sozinho uma casa com identidade pede muito: escolher o lugar, projetar, construir, mobiliar — e, depois, manter tudo funcionando.',
      ],
    },
    promise: {
      title: { lead: 'A identidade vem ', turn: 'antes', tail: ' da casa.' } satisfies Headline,
      steps: [
        {
          title: 'Uma marca',
          text: 'A Brand Partner, a marca parceira, traz a identidade, o estilo de vida e a comunidade que você admira.',
        },
        {
          title: 'Um Residence Concept',
          text: 'A Luxtory traduz esse universo num Residence Concept: um projeto de casa definido para ser construído em diferentes lugares, com os elementos essenciais que o identificam.',
        },
        {
          title: 'Uma casa sua',
          text: 'Cada Residence é construída do zero a partir do Concept e preserva esses elementos. Você a tem por inteiro, como Owner, ou em copropriedade, como Co-Owner.',
        },
      ],
    },
    modalities: {
      title: { lead: 'Por inteiro ou ', turn: 'em copropriedade', tail: '.' } satisfies Headline,
      owner: [
        'Você tem 100% da Residence.',
        'Pode personalizar o que não é essencial ao Concept.',
        'A administração integral pela Luxtory é opcional.',
      ],
      coOwner: [
        'Você tem uma Ação da sociedade dona da Residence, com Direito de Uso a cada ano.',
        'A casa é padronizada, fiel ao Concept, e a administração é profissional.',
        'As despesas da casa são rateadas entre os Co-Owners.',
      ],
    },
  },
  howItWorks: {
    opening: {
      title: { lead: 'Da marca ', turn: 'à casa', tail: '.' } satisfies Headline,
      lead: 'Uma marca vira um Residence Concept. O Concept vira uma casa construída do zero. E há duas formas de tê-la: por inteiro, como Owner, ou em copropriedade, como Co-Owner.',
    },
    chain: {
      title: {
        lead: 'Do universo de uma marca ',
        turn: 'a uma casa pronta',
        tail: '.',
      } satisfies Headline,
      steps: [
        {
          title: 'Brand Partner',
          text: 'A marca parceira traz sua identidade, seu estilo de vida e sua comunidade — e continua titular da marca.',
        },
        {
          title: 'Residence Concept',
          text: 'A Luxtory traduz esse universo num projeto de casa replicável, que identifica seus elementos essenciais e as premissas para preservá-los.',
        },
        {
          title: 'Residence Edition',
          text: 'Quando decide lançar um Concept numa região, a Luxtory cria uma Residence Edition, com as condições comerciais daquele lançamento. Toda oferta passa por uma Edition.',
        },
        {
          title: 'Design & Build',
          text: 'Arquitetura, interiores, engenharia e obra podem ser coordenados integralmente pela Luxtory, sempre fiéis ao Concept.',
        },
        {
          title: 'Residence',
          text: 'A casa é construída do zero. O modelo não inclui reforma nem adaptação de imóveis que já existem.',
        },
      ],
    },
    modalities: {
      title: { lead: 'Owner e Co-Owner, ', turn: 'lado a lado', tail: '.' } satisfies Headline,
      lead: 'As duas modalidades são para quem vai viver a casa. As diferenças entre elas vêm do próprio modelo.',
      dimensions: {
        holding: 'O que você tem',
        use: 'Uso',
        administration: 'Administração',
        personalization: 'Personalização',
      },
      owner: {
        holding: '100% da Residence, como único adquirente.',
        use: 'Toda a capacidade de uso da casa, ressalvados os compromissos que você mesmo assumir.',
        administration:
          'Opcional: a administração integral pela Luxtory e a Taxa de Administração são escolhas suas.',
        personalization:
          'Elementos não essenciais do Concept. Personalizar, sim; descaracterizar, não.',
      },
      coOwner: {
        holding:
          'Uma Ação da SPE — uma S.A. fechada dona da Residence, da qual a Luxtory não é acionista. As Ações dos Co-Owners de uma mesma casa são equivalentes.',
        use: 'Direito de Uso a cada ano civil, equivalente entre os Co-Owners, conforme a configuração da casa.',
        administration:
          'Profissional e obrigatória, com Taxa de Administração. As despesas da casa são rateadas.',
        personalization: 'Nenhuma individual: a casa é padronizada e fiel ao Concept.',
      },
    },
    coOwnerUse: {
      title: { lead: 'O uso no Co-Owner, ', turn: 'ano a ano', tail: '.' } satisfies Headline,
      lead: 'Co-Owner não é compra de dias: é uma Ação da SPE com Direito de Uso. Estas regras valem para todos os Co-Owners de uma casa.',
      configurationsTitle: 'As quatro configurações',
      configurationsText:
        'Cada Residence Co-Owner adota exatamente uma delas, definida pela Luxtory conforme a composição da demanda e a viabilidade comercial.',
      configurationLabels: {
        share: 'Ação de cada Co-Owner',
        annual: 'Direito de Uso anual',
        high: 'Alta e Super Alta',
        regular: 'Média e Baixa',
      },
      // `01` §8.1 — regra estrutural (BR-076, BR-077), não parâmetro.
      configurations: [
        {
          title: '10 Co-Owners',
          share: '10%',
          annual: '35 dias',
          high: '10 dias',
          regular: '25 dias',
        },
        {
          title: '8 Co-Owners',
          share: '12,5%',
          annual: '44 dias',
          high: '12 dias',
          regular: '32 dias',
        },
        {
          title: '4 Co-Owners',
          share: '25%',
          annual: '88 dias',
          high: '24 dias',
          regular: '64 dias',
        },
        {
          title: '2 Co-Owners',
          share: '50%',
          annual: '176 dias',
          high: '48 dias',
          regular: '128 dias',
        },
      ],
      rulesTitle: 'As regras do calendário',
      rules: [
        'O ano de uso é o ano civil, e o Direito de Uso que não for usado não passa para o ano seguinte.',
        'Os limites de Alta e Super Alta e de Média e Baixa temporada são separados: o que sobra em um não compensa o outro.',
        'A ordem de abertura do calendário é definida por sorteio auditável e gira a cada ano: quem abriu primeiro passa para o fim. Num ciclo completo, cada Co-Owner ocupa todas as posições.',
        'Abrir primeiro é vantagem de tempo, não exclusividade sobre datas.',
        'Cada permanência vai até 14 dias seguidos.',
      ],
    },
    offer: {
      title: { lead: 'Onde estão ', turn: 'as condições', tail: '.' } satisfies Headline,
      paragraphs: [
        'Toda oferta de uma Branded Second Home está ligada a uma Residence Edition, com a região e as condições comerciais registradas pela Luxtory. Elas aparecem na página de cada Concept, quando há uma Edition.',
        'No Co-Owner não existe preço por dia. Valores de planos, taxas e outras condições não são fixados nesta página: valem os registrados em cada Edition.',
      ],
    },
    club: {
      title: {
        lead: 'O Luxtory Club, ',
        turn: 'com as regras à vista',
        tail: '.',
      } satisfies Headline,
      lead: 'Além da sua casa, o Luxtory Club é uma rede de Residences, serviços e estadias para quem tem Membership vigente. Cada mecanismo tem regras próprias.',
      mechanisms: [
        {
          title: 'Luxchange',
          text: 'Intercâmbio: você cede datas e recebe Créditos Luxchange para usar em outras Residences da rede.',
        },
        {
          title: 'Luxplus',
          text: 'Estadias adicionais em datas que a Luxtory disponibiliza na rede.',
        },
        {
          title: 'Locação pelo canal Luxtory',
          text: 'Datas autorizadas da sua casa oferecidas a hóspedes externos, pelos canais da Luxtory.',
        },
      ],
      conditionsTitle: 'O que o Club não muda',
      conditions: [
        'Usar a sua própria casa não depende de Membership.',
        'O Membership não muda propriedade, Ação, Direito de Uso nem a ordem de abertura do calendário entre Co-Owners.',
        'Créditos Luxchange não são moeda, investimento nem saldo em dinheiro, não garantem disponibilidade e não podem ser vendidos a terceiros.',
        'Nenhum mecanismo do Club promete rentabilidade ou renda.',
      ],
    },
    limits: {
      title: { lead: 'O que a Luxtory ', turn: 'não promete', tail: '.' } satisfies Headline,
      paragraphs: [
        'A Luxtory não promete rentabilidade, valorização, liquidez nem renda. Uma Branded Second Home é uma casa para viver.',
        'Se a parceria com a marca terminar, os direitos necessários às Residences já contratadas, vendidas ou em construção não se extinguem automaticamente; o restante segue os contratos.',
      ],
    },
  },
  collection: {
    title: 'Coleção',
    lead: 'Residence Concepts são casas pensadas a partir do universo de uma marca. Cada Concept pode ganhar lançamentos — Residence Editions — em regiões diferentes.',
    listLabel: 'Residence Concepts da Coleção',
    empty: 'Nenhum Residence Concept publicado no momento.',
    unavailable: 'A Coleção não está disponível agora. Tente de novo em alguns minutos.',
  },
  concept: {
    creditLead: 'Residence Concept com',
    specificationTitle: 'O Concept',
    fidelity: {
      title: { lead: 'Fiel ao Concept, ', turn: 'em cada casa', tail: '.' } satisfies Headline,
      text: 'Toda Residence deste Concept é construída do zero e preserva os elementos essenciais que o definem. No Owner, dá para personalizar o que não é essencial; no Co-Owner, a casa é padronizada.',
    },
    editions: {
      title: 'Residence Editions',
      lead: 'Toda oferta passa por uma Residence Edition: um lançamento deste Concept numa região, com condições comerciais registradas pela Luxtory.',
      none: 'Este Concept ainda não tem uma Residence Edition. Por isso, ainda não há oferta comercial.',
      modality: 'Modalidade',
      // Entre "Owner" e "Co-Owner", com espaços: os dois nomes com o mesmo peso (REQ-103).
      modalityJoin: ' e ',
      conditions: 'Condições comerciais',
    },
    unavailable: 'Este Concept não está disponível agora. Tente de novo em alguns minutos.',
  },
  modality: {
    owner: 'Owner',
    co_owner: 'Co-Owner',
    owner_and_co_owner: 'Owner e Co-Owner',
  },
  notFound: {
    title: { lead: 'Esta página ', turn: 'não está aqui', tail: '.' } satisfies Headline,
    text: 'O endereço pode ter mudado, ou o conteúdo não está mais publicado.',
  },
} as const;
