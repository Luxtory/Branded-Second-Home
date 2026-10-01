/**
 * Copy do Discovery público B2C (docs/specs/catalog.md §13.4). Fonte: Framework B2C (`[FW-B2C: §…]`) → b2c.md (L1–L9,
 * objeções, `D-B2C-13`, `D-B2C-16`) → brief → este arquivo. Só fatos com âncora canônica; termos canônicos explicados na
 * primeira menção da página (`D-LX-06`); nenhum termo vedado do `02` §1, nem negado (L2), e nenhuma promessa de retorno
 * (REQ-100, REQ-101).
 */

/** Headline com no máximo uma virada em itálico (`turn`). */
export interface Headline {
  readonly lead: string;
  readonly turn?: string;
  readonly tail?: string;
}

/** Pergunta do Protagonista `[FW-B2C: §5]` respondida com fatos (b2c.md §5). */
export interface Answer {
  readonly question: string;
  readonly answer: readonly string[];
}

/** Owner e Co-Owner com a mesma estrutura (REQ-103). */
export interface ModalityPair {
  readonly owner: readonly string[];
  readonly coOwner: readonly string[];
}

/** Item curto com título (`lx-blocks`, `dl`). */
export interface Item {
  readonly title: string;
  readonly text: string;
}

const triad = {
  // [FW-B2C: §2, Tríade de Valor]. "Posse" passa pela revisão jurídica (P-LX-03); o Co-Owner é sempre explicado como
  // Ação da SPE proprietária com Direito de Uso (L1).
  patrimony: { lead: 'Patrimônio ', turn: 'para possuir.' },
  freedom: { lead: 'Liberdade ', turn: 'para viver.' },
  belonging: { lead: 'Pertencimento ', turn: 'para chamar de seu.' },
} satisfies Record<string, Headline>;

const modality = {
  owner: 'Owner',
  co_owner: 'Co-Owner',
  /** Edition aberta às duas modalidades (BR-032), com o mesmo peso. */
  join: ' ou ',
};

const actions = {
  // D-B2C-13, D-B2C-16: o CTA de catálogo depende do que está publicado.
  editions: 'Conheça as Residence Editions',
  concepts: 'Conheça os Residence Concepts',
  howItWorks: 'Entenda como funciona',
  collection: 'Ver a Coleção',
  otherConcepts: 'Conheça outros Concepts',
  viewConcept: 'Ver o Concept',
};

/** PUSH `[FW-B2C: §8 P5]`: a lista base é a mesma em todas as páginas; complementos factuais por página (b2c.md §8). */
const qualification = {
  title: { lead: 'Faz sentido ', turn: 'para a sua vida?' } satisfies Headline,
  fitsTitle: 'Faz sentido para quem',
  notFitsTitle: 'Pode não fazer sentido para quem',
  fits: [
    'Quer os três: patrimônio, liberdade e pertencimento.',
    'Procura uma second home.',
    'Valoriza patrimônio.',
    'Quer ampliar as possibilidades de experiência.',
    'Valoriza pertencimento.',
    'Se identifica com um Residence Concept.',
    'Quer viver essas experiências com família e amigos.',
    'Entende e aceita as regras da modalidade escolhida.',
  ],
  notFits: [
    'Busca apenas hospedagem pontual.',
    'Não aceita nenhuma exposição patrimonial.',
    'Exige disponibilidade absoluta.',
    'Busca exclusivamente retorno financeiro.',
    'Exige garantia de renda, valorização ou liquidez.',
    'Não vê valor em lifestyle, propriedade ou pertencimento.',
  ],
  /** BR-054. */
  existingProperty: 'Quer adaptar um imóvel que já tem: toda Residence é construída do zero.',
  /** BR-019, BR-101, BR-104. */
  coOwnerFit:
    'Quer, como Co-Owner, as mesmas datas todos os anos ou uma casa personalizada: a Residence Co-Owner é padronizada e a ordem do calendário gira.',
  /** Próximo passo por disponibilidade (D-B2C-16); `unknown` nunca diz que não há catálogo. */
  next: {
    editions:
      'O próximo passo é conhecer as Residence Editions: os lançamentos com oferta, por região e modalidade.',
    concepts:
      'Ainda não há uma Residence Edition lançada. Os Residence Concepts já podem ser conhecidos.',
    none: 'Os primeiros Residence Concepts ainda não foram publicados. Enquanto isso, veja em detalhe como tudo funciona.',
    unknown: 'Veja em detalhe como tudo funciona.',
  },
  /** No Como funciona: sem Concept, a frase não manda para a própria página; desconhecido, nenhuma frase. */
  nextHowItWorks: {
    none: 'Os primeiros Residence Concepts ainda não foram publicados.',
  },
};

export const discoveryMessages = {
  site: {
    skipLink: 'Pular para o conteúdo',
    home: 'Luxtory — página inicial',
    nav: 'Navegação principal',
    footerNav: 'Navegação do rodapé',
    menu: 'Menu',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    collection: 'Coleção',
    howItWorks: 'Como funciona',
  },
  modality,
  actions,
  qualification,
  triad,

  home: {
    // PICTURE = Hero `[FW-B2C: §8 P1, §14 regra 25]`: desejo primeiro, sem depender de produto, categoria ou problema.
    // CARE + SEEKING · Estética + Compaixão; ritmo contemplativo.
    hero: {
      title: { lead: 'As suas conquistas, ', turn: 'vividas com quem importa.' } satisfies Headline,
      text: 'Em lugares que falam a sua língua, onde você se vê vivendo — e que, a cada volta, passam a fazer parte da sua história.',
    },
    // PROBLEM `[FW-B2C: §2 Trade-offs, §8 P2]`: categorias nomeadas, com "tende a"; nenhuma empresa (luxtory.md §6).
    // SEEKING · Intelecto + Assertividade.
    conflict: {
      title: {
        lead: 'Patrimônio, liberdade e pertencimento ',
        turn: 'raramente vêm juntos.',
      } satisfies Headline,
      text: 'As formas mais conhecidas de viver o lazer tendem a entregar uma parte e pedir que você abra mão do resto.',
      listLabel: 'Alternativas e seus trade-offs',
      givesLabel: 'Tende a entregar',
      forgoesLabel: 'Tende a abrir mão de',
      alternatives: [
        {
          title: 'Propriedade tradicional',
          gives: 'Patrimônio e um lugar para chamar de seu.',
          forgoes:
            'Liberdade. O uso se concentra num só destino, e as responsabilidades da casa ficam com você.',
        },
        {
          title: 'Hotelaria e locação',
          gives: 'Liberdade para escolher e, conforme o uso, eficiência.',
          forgoes:
            'Posse. Nenhuma relação patrimonial com o imóvel, e um vínculo menos permanente com o lugar.',
        },
        {
          title: 'Compartilhamento genérico',
          gives: 'Patrimônio e um uso mais eficiente.',
          forgoes: 'Liberdade e pertencimento, que nem sempre chegam na mesma proposta.',
        },
      ],
      closing: {
        lead: 'O conflito não é escolher qual valor importa. ',
        turn: 'Os três importam.',
      } satisfies Headline,
    },
    // PROMISE `[FW-B2C: §8 P3]`: o insight e a nova lógica; categoria explicada na primeira menção (D-LX-06; BR-003,
    // BR-053). SEEKING · Intelecto + Assertividade.
    promise: {
      title: {
        lead: 'Não comece escolhendo entre comprar ou alugar. ',
        turn: 'Comece pelo que você quer viver.',
      } satisfies Headline,
      text: 'Primeiro, os valores que você quer na sua vida de lazer. Depois, a forma de chegar lá: uma second home construída a partir do lifestyle que tem a ver com você e conectada ao que reúne os três.',
      category:
        'Essa é a Branded Second Home: uma segunda casa concebida a partir do universo de uma marca e construída do zero.',
      triadLabel: 'Patrimônio, Liberdade e Pertencimento',
    },
    // PROOF `[FW-B2C: §8 P4]`: o mecanismo costura três capítulos. SEEKING + FEAR↓ · Diligência + Ordem.
    proof: {
      title: { lead: 'Como a Luxtory ', turn: 'reúne os três.' } satisfies Headline,
      text: 'Tudo parte de um lifestyle e de uma marca que o representa: a Brand Partner. Do Brand DNA dela — identidade, estética, valores e experiências — nasce um Residence Concept, uma casa pensada para ser replicada, com arquitetura, interiores e forma de viver próprios. Cada lançamento de um Concept numa região é uma Residence Edition; cada casa construída a partir dele, uma Residence.',
      patrimony: {
        // L1, L8; BR-052, BR-071, BR-373, BR-374. Retraimento na nota de mercado.
        marker: ['Patrimônio', 'Posse'],
        title: {
          lead: 'Uma relação patrimonial real ',
          turn: 'com a sua second home.',
        } satisfies Headline,
        text: 'Em duas modalidades, com o mesmo peso.',
        pair: {
          owner: [
            'A Residence é sua, por inteiro: 100% do imóvel e de toda a sua capacidade de uso.',
          ],
          coOwner: [
            'Uma Ação da SPE — a sociedade criada para ser a proprietária da Residence —, com Direito de Uso equivalente ao dos demais Co-Owners.',
          ],
        } satisfies ModalityPair,
        note: 'Como todo patrimônio imobiliário, tem valor econômico e acompanha o mercado, para cima ou para baixo. Não há promessa de valorização, renda, liquidez ou retorno.',
      },
      freedom: {
        // L3, L4, L7; BR-072, BR-130, BR-146, BR-147, BR-151. Mecanismos como componentes do modelo, sem link.
        marker: ['Liberdade', 'Possibilidades'],
        title: { lead: 'Mais possibilidades, ', turn: 'menos amarras.' } satisfies Headline,
        text: 'A gestão cuida da casa, e o Luxtory Club — a rede de Residences, serviços e experiências da Luxtory — amplia o que você pode viver. O uso da sua própria Residence não depende do Membership, a associação ao Club.',
        items: [
          {
            title: 'Gestão',
            text: 'Administração própria de cada modalidade: obrigatória no Co-Owner, opcional no Owner, sempre com os custos de cada uma.',
          },
          {
            title: 'Luxchange',
            text: 'Com Membership vigente, viver outras Residences da rede, conforme regras e disponibilidade.',
          },
          {
            title: 'Luxplus',
            text: 'Com Membership vigente, noites adicionais do inventário da Luxtory, quando disponíveis.',
          },
          {
            title: 'Locação',
            text: 'Com Membership vigente e quando elegível, datas destinadas à locação pelo canal Luxtory, conforme a modalidade.',
          },
        ] satisfies readonly Item[],
        note: 'Liberdade é ampliar possibilidades e reduzir atritos — não ausência de regras.',
      },
      belonging: {
        // L5, L6, L9; BR-003, BR-013, BR-053, BR-330. Comunidade como aspiração (FW §14 regra 14).
        marker: ['Pertencimento', 'Identificação + Lugar + Pessoas'],
        title: { lead: 'Um lugar que ', turn: 'tem a ver com você.' } satisfies Headline,
        // [FW-B2C: §2, Pertencimento].
        text: 'Sentir que o lugar, as experiências e as relações têm a ver com quem você é e com a vida que você quer viver.',
        items: [
          {
            title: 'Identificação',
            text: 'O Residence Concept nasce do lifestyle de uma marca com a qual você se identifica: sua estética, seus valores, suas experiências.',
          },
          {
            title: 'Lugar',
            text: 'A Residence é construída do zero e fiel ao Concept — um lugar onde você se reconhece.',
          },
          {
            title: 'Pessoas',
            text: 'É a casa para receber família e amigos. E, à medida que a rede cresce, o Luxtory Club pode ampliar experiências e conexões entre pessoas com afinidades parecidas.',
          },
        ] satisfies readonly Item[],
      },
      closing: {
        title: { lead: 'Os três, ', turn: 'na mesma arquitetura.' } satisfies Headline,
        // Presença da tríade, não maximização `[FW-B2C: §2, §14 regra 10]`.
        text: 'Não se trata de levar cada valor ao máximo, sem limite. Trata-se de não precisar abrir mão de nenhum deles.',
      },
    },
  },

  howItWorks: {
    // Product Aware → Most Aware, PROOF → PUSH `[FW-B2C: §8.1]`; perguntas `[FW-B2C: §5]` respondidas pela b2c.md §5.
    header: {
      title: 'Como funciona',
      text: 'A arquitetura que reúne patrimônio, liberdade e pertencimento — e as regras que a sustentam, em detalhe.',
    },
    chain: {
      // Mecanismo `[FW-B2C: §2, §8 P4]`; fatos: luxtory.md §5, BR-004, BR-031, BR-053, BR-300, BR-301 (L9).
      title: { lead: 'Do lifestyle ', turn: 'à Residence.' } satisfies Headline,
      steps: [
        { title: 'Lifestyle', text: 'O universo com o qual você se identifica.' },
        {
          title: 'Brand Partner',
          text: 'A marca parceira que representa esse universo e autoriza o uso da sua marca no modelo.',
        },
        { title: 'Brand DNA', text: 'Identidade, estética, valores e experiências da marca.' },
        {
          title: 'Residence Concept',
          text: 'A tradução desse DNA numa casa replicável: arquitetura, interiores, paisagismo, amenidades e forma de viver.',
        },
        {
          title: 'Residence Edition',
          text: 'O lançamento de um Concept numa região, com condições comerciais próprias. Toda oferta passa por uma Edition.',
        },
        {
          title: 'Owner ou Co-Owner',
          text: 'As duas modalidades: a Residence inteira, ou uma Ação da SPE proprietária com Direito de Uso.',
        },
        {
          title: 'Design & Build',
          text: 'Arquitetura, interiores, engenharia e obra, que a Luxtory pode coordenar por inteiro, sempre preservando o Concept.',
        },
        { title: 'Residence', text: 'A casa, construída do zero e fiel ao Concept.' },
        {
          title: 'Luxtory Club',
          text: 'A rede de Residences, serviços e experiências da Luxtory, acessada com Membership.',
        },
      ] satisfies readonly Item[],
    },
    patrimony: {
      // L1, L8; BR-051, BR-052, BR-065, BR-071, BR-341, BR-373, BR-374; D-B2C-15.
      marker: ['Patrimônio', 'Posse'],
      title: triad.patrimony,
      own: {
        question: 'O que exatamente eu possuo?',
        pair: {
          owner: [
            'A Residence, por inteiro: 100% do imóvel e de toda a sua capacidade de uso.',
            'A aquisição pode ser feita por um único adquirente.',
          ],
          coOwner: [
            'Uma Ação da SPE, a sociedade anônima fechada criada para ser a proprietária da Residence, com Direito de Uso.',
            'Todos os Co-Owners da mesma Residence têm participação e Direito de Uso equivalentes. A Luxtory não é acionista.',
          ],
        } satisfies ModalityPair,
        after: 'Nas duas modalidades, a posição nasce na formalização da aquisição.',
      },
      answers: [
        {
          question: 'Isso é timeshare?',
          answer: [
            'Não. O Co-Owner é acionista da SPE proprietária da Residence, com Direito de Uso: uma participação societária, não a compra de tempo ou de dias.',
          ],
        },
        {
          question: 'Existe garantia de retorno, valorização ou liquidez?',
          answer: [
            'Não. A Residence e a Ação têm valor econômico, podem ser transferidas conforme as regras aplicáveis e acompanham o mercado imobiliário, para cima ou para baixo.',
            'Não há promessa de valorização, renda, liquidez ou retorno.',
          ],
        },
      ] satisfies readonly Answer[],
    },
    freedom: {
      // L3, L4, L7; BR-052, BR-075, BR-076, BR-082, BR-100…104, BR-111, BR-144, BR-146…151, BR-162, BR-190.
      marker: ['Liberdade', 'Possibilidades'],
      title: triad.freedom,
      use: {
        question: 'Como funciona meu uso?',
        pair: {
          owner: [
            'Toda a capacidade de uso da Residence é sua.',
            'Você escolhe as datas que mantém para uso próprio.',
          ],
          coOwner: [
            'O Direito de Uso anual da configuração da Residence, com limites por temporada que não se compensam entre si.',
            'O calendário abre numa ordem sorteada que gira a cada ano — vantagem de tempo, não exclusividade sobre datas. Cada permanência vai até 14 dias seguidos.',
          ],
        } satisfies ModalityPair,
        after: 'Nas duas modalidades, o uso próprio não depende de Membership.',
      },
      // `01` §8.1 e §9, sem a capacidade da Luxtory; detalhe secundário (aprovado em 2026-10-01).
      configurations: {
        title: 'As quatro configurações Co-Owner',
        text: 'Toda Residence Co-Owner adota uma destas configurações, definida pela Luxtory conforme a demanda e a viabilidade de cada lançamento. Alta/Super Alta: janeiro, julho, dezembro e a janela de Carnaval. Média/Baixa: as demais datas.',
        labels: {
          share: 'Participação',
          annual: 'Direito de Uso anual',
          high: 'Alta/Super Alta',
          low: 'Média/Baixa',
        },
        rows: [
          {
            title: '10 Co-Owners',
            share: '10%',
            annual: '35 dias',
            high: 'até 10 dias',
            low: 'até 25 dias',
          },
          {
            title: '8 Co-Owners',
            share: '12,5%',
            annual: '44 dias',
            high: 'até 12 dias',
            low: 'até 32 dias',
          },
          {
            title: '4 Co-Owners',
            share: '25%',
            annual: '88 dias',
            high: 'até 24 dias',
            low: 'até 64 dias',
          },
          {
            title: '2 Co-Owners',
            share: '50%',
            annual: '176 dias',
            high: 'até 48 dias',
            low: 'até 128 dias',
          },
        ],
      },
      answers: [
        {
          question: 'Vou usar o suficiente?',
          answer: [
            'Depende do seu padrão de uso — por isso existem duas modalidades e quatro configurações Co-Owner. A qualificação no fim desta página ajuda a ver se faz sentido para você.',
          ],
        },
        {
          question: 'O que acontece quando não utilizo?',
          answer: [
            'O Direito de Uso não utilizado não passa para o ano seguinte.',
            'No Co-Owner, a capacidade não reservada continua da SPE até o fim do exercício, e só uma data já reservada pode ir para o Luxchange ou para a locação. O Owner escolhe quais datas mantém para uso próprio e quais autoriza para comercialização.',
          ],
        },
      ] satisfies readonly Answer[],
      management: {
        question: 'Como funcionam gestão e manutenção?',
        pair: {
          owner: [
            'A administração integral pela Luxtory é opcional, assim como a Taxa de Administração.',
            'As despesas da Residence são suas.',
          ],
          coOwner: [
            'A administração profissional é obrigatória, com Taxa de Administração.',
            'As despesas da Residence são rateadas entre os Co-Owners.',
          ],
        } satisfies ModalityPair,
      },
      club: {
        question: 'Consigo usar outros lugares?',
        text: 'Sim, pelo Luxtory Club — a rede de Residences, serviços e experiências da Luxtory —, com Membership vigente, a associação ao Club por titular, e conforme regras e disponibilidade.',
        items: [
          {
            title: 'Luxchange',
            text: 'Com Membership vigente, você troca capacidade elegível por Créditos e usa Créditos para estadias em outras Residences da rede. No Co-Owner, só uma data já reservada pode ser cedida. Créditos não são moeda, investimento nem garantia de disponibilidade.',
          },
          {
            title: 'Luxplus',
            text: 'Com Membership vigente, você pode adquirir noites adicionais do inventário da Luxtory, quando disponíveis. Não é uma forma de obter Direito de Uso.',
          },
          {
            title: 'Locação',
            text: 'Com Membership vigente, as datas que você autorizar podem ir para locação pelo canal Luxtory, sem promessa de receita. No Co-Owner, só datas já reservadas no seu Direito de Uso, e sempre pelos canais autorizados.',
          },
        ] satisfies readonly Item[],
        after:
          'O Membership não muda propriedade, participação, Direito de Uso nem a ordem do calendário.',
      },
      limits: {
        question: 'Isso reduz minha liberdade?',
        answer: [
          'Liberdade, aqui, é ampliar possibilidades e reduzir atritos — não ausência de regras. Cada mecanismo tem regras próprias e depende de disponibilidade, como acontece também na hotelaria e na locação.',
        ],
      } satisfies Answer,
    },
    belonging: {
      // L5, L6, L9; BR-003, BR-013, BR-017, BR-019, BR-053, BR-054, BR-300, BR-330, BR-331.
      marker: ['Pertencimento', 'Identificação + Lugar + Pessoas'],
      title: triad.belonging,
      answers: [
        {
          question: 'Qual a diferença para uma second home tradicional?',
          answer: [
            'Aqui a casa nasce de um lifestyle. A Luxtory traduz o universo de uma marca num Residence Concept com especificação definida, e cada Residence é construída do zero, fiel a ele — nunca um imóvel existente adaptado.',
            'O Owner pode personalizar o que não é essencial ao Concept; a Residence Co-Owner é padronizada. A gestão reduz o trabalho de manter a casa, e o Luxtory Club amplia o uso para além dela.',
          ],
        },
        {
          question: 'Por que não continuar alugando?',
          answer: [
            'Alugar oferece liberdade de escolha e pode ser eficiente conforme o uso. Mas não cria relação patrimonial com o imóvel e tende a criar um vínculo menos permanente com o lugar. Aqui, patrimônio, liberdade e pertencimento estão na mesma proposta.',
          ],
        },
        {
          question: 'E as pessoas que importam?',
          answer: [
            'O Titular — Owner ou Co-Owner — pode receber família e amigos como convidados, conforme as regras de cada Residence, sem consumir Direito de Uso adicional. O convidado não se torna Titular.',
            'À medida que a rede cresce, o Luxtory Club pode ampliar experiências e conexões entre pessoas com afinidades parecidas.',
          ],
        },
      ] satisfies readonly Answer[],
    },
    conditions: {
      // BR-004, BR-031, BR-054, BR-143, BR-373, BR-374; L2 em positivo. FEAR↓ · Retraimento + Diligência.
      title: { lead: 'O que mais ', turn: 'você precisa saber.' } satisfies Headline,
      items: [
        'Toda oferta comercial é feita por uma Residence Edition, com as condições registradas pela Luxtory.',
        'Valores de Membership, Taxa de Administração e planos fazem parte das condições comerciais aplicáveis e não são fixados nesta página.',
        'O Co-Owner tem uma Ação com Direito de Uso: participação societária na SPE proprietária da Residence.',
        'Toda Residence é construída do zero; imóveis existentes, reformas e adaptações não fazem parte do modelo.',
        'Nenhuma promessa de rentabilidade, valorização, liquidez ou renda.',
      ],
    },
  },

  collection: {
    // PROOF → PUSH; Discovery de produto, não marketplace. BR-001, BR-002, BR-004, REQ-022.
    header: {
      title: 'Coleção',
      text: 'Cada Residence Concept traduz o universo de uma marca numa casa. Cada Residence Edition é o lançamento de um Concept numa região, com condições próprias — e é por ela que existe oferta.',
    },
    editions: {
      title: 'Residence Editions',
      text: 'Concepts com lançamento: a região e a modalidade de cada Edition.',
      listLabel: 'Residence Concepts com Residence Edition',
    },
    concepts: {
      title: 'Residence Concepts',
      text: 'Concepts ainda sem Residence Edition — por enquanto, sem oferta comercial.',
      listLabel: 'Residence Concepts sem Residence Edition',
    },
    credit: 'A partir do universo de',
    editionsLabel: 'Residence Editions deste Concept',
    empty: 'Ainda não há Residence Concepts publicados.',
    unavailable: 'Não foi possível carregar a Coleção agora. Tente de novo em instantes.',
  },

  concept: {
    // Most Aware: PUSH + prova necessária. BR-004, BR-013, BR-014, BR-017, BR-019, BR-031, BR-300, BR-301, REQ-022.
    credit: 'A partir do universo de',
    residence: { title: 'O que este Concept propõe' },
    faithful: {
      title: { lead: 'Construída do zero, ', turn: 'fiel ao Concept.' } satisfies Headline,
      text: [
        'Toda Residence nasce de um Residence Concept aprovado e é construída do zero, preservando os elementos essenciais que definem a sua identidade.',
        'O Owner pode personalizar o que não é essencial; a Residence Co-Owner é padronizada. A Luxtory pode coordenar todo o Design & Build — arquitetura, interiores, engenharia e obra —, sempre preservando o Concept.',
      ],
    },
    offer: {
      title: 'Residence Editions',
      lead: 'Uma Residence Edition é o lançamento deste Concept numa região, com condições comerciais próprias.',
      modality: 'Modalidade',
      conditions: 'Condições comerciais',
      // Sem Edition, sem oferta (BR-004, REQ-022).
      none: 'Este Concept ainda não tem uma Residence Edition. Por isso, ainda não há oferta comercial.',
    },
    unavailable:
      'Não foi possível carregar este Residence Concept agora. Tente de novo em instantes.',
  },

  notFound: {
    title: { lead: 'Esta página ', turn: 'não está aqui.' } satisfies Headline,
    text: 'O endereço pode ter mudado, ou este conteúdo não está publicado.',
  },

  metadata: {
    home: {
      title: 'Luxtory — Branded Second Home',
      description:
        'Patrimônio para possuir. Liberdade para viver. Pertencimento para chamar de seu. Second homes concebidas a partir do universo de uma marca.',
    },
    howItWorks: {
      title: 'Como funciona — Luxtory',
      description:
        'Owner e Co-Owner, Direito de Uso, gestão, Luxtory Club e as regras da Branded Second Home, em detalhe.',
    },
    collection: {
      title: 'Coleção — Luxtory',
      description: 'Residence Concepts e Residence Editions da Luxtory.',
    },
    conceptSuffix: ' — Luxtory',
    notFound: 'Página não encontrada — Luxtory',
  },
} as const;
