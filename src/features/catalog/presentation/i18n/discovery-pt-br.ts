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

/** As três palavras da tríade, como na copy — rótulos dos desenhos (aria-hidden) e da linha de valores. */
const values = {
  patrimony: 'Patrimônio',
  freedom: 'Liberdade',
  belonging: 'Pertencimento',
};

const modality = {
  owner: 'Owner',
  co_owner: 'Co-Owner',
  /** Edition aberta às duas modalidades (BR-032), com o mesmo peso. */
  join: ' ou ',
};

const actions = {
  // D-B2C-13, D-B2C-16: o CTA de catálogo depende do que está publicado.
  editions: 'Conheça as Home Editions',
  concepts: 'Conheça os Home Concepts',
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
    'Se identifica com um Home Concept.',
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
  existingProperty: 'Quer adaptar um imóvel que já tem: toda Second Home é construída do zero.',
  /** BR-019, BR-101, BR-104. */
  coOwnerFit:
    'Quer, como Co-Owner, as mesmas datas todos os anos ou uma casa personalizada: a Second Home Co-Owner é padronizada e a ordem do calendário gira.',
  /** Próximo passo por disponibilidade (D-B2C-16); `unknown` nunca diz que não há catálogo. */
  next: {
    editions:
      'O próximo passo é conhecer as Home Editions: os lançamentos com oferta, por região e modalidade.',
    concepts: 'Ainda não há uma Home Edition lançada. Os Home Concepts já podem ser conhecidos.',
    none: 'Os primeiros Home Concepts ainda não foram publicados. Enquanto isso, veja em detalhe como tudo funciona.',
    unknown: 'Veja em detalhe como tudo funciona.',
  },
  /** No Como funciona: sem Concept, a frase não manda para a própria página; desconhecido, nenhuma frase. */
  nextHowItWorks: {
    none: 'Os primeiros Home Concepts ainda não foram publicados.',
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
  values,

  home: {
    // Fotografias da Home (docs/specs/catalog.md §13.10): as do Kaizen são imagens conceituais identificadas — nunca
    // Edition, oferta ou prova de benefício; as demais são atmosfera, decorativas (alt vazio no componente).
    media: {
      kaizen: {
        alt: 'Imagem conceitual de pessoas junto à piscina e à fachada do Kaizen Residence.',
        caption: 'Kaizen Residence · Imagem conceitual',
      },
      kaizenWellness: {
        alt: 'Imagem conceitual de duas pessoas meditando em um pavilhão de madeira do Kaizen Residence.',
      },
      kaizenSuite: {
        alt: 'Imagem conceitual de uma suíte do Kaizen Residence preparada, com a cama arrumada e o jardim ao lado.',
      },
      solutionDiagram:
        'Diagrama original de solução: Patrimônio, Liberdade e Pertencimento integrados, com Luxtory no encontro das três dimensões.',
    },
    // Copy da Home do fundador (D-B2C-18), na versão aplicada pelo GATE-COPY-W4 (D-B2C-19, 2026-10-06): a Especificação
    // Visual Final da Home e os textos que ela referencia. Não reescrever: mudança de texto só com nova decisão do
    // fundador. Os eyebrows ficam em caixa normal aqui; o `lx-eyebrow` os mostra em caixa alta.
    hero: {
      title: {
        lead: 'Seja protagonista de histórias extraordinárias, ',
        turn: 'com quem ama,',
        tail: ' em lugares com os quais se identifica.',
      } satisfies Headline,
      text: 'Uma nova forma de viver seu lazer com mais valor.',
      action: 'Descubra uma nova forma de viver',
      carousel: {
        description: 'carrossel',
        controls: 'Controles do carrossel',
        previous: 'Imagem anterior',
        next: 'Próxima imagem',
        pause: 'Pausar carrossel',
        play: 'Reproduzir carrossel',
      },
    },
    renunciation: {
      marker: 'A cada escolha, uma renúncia',
      title: {
        lead: 'As alternativas mudam. ',
        turn: 'A\u00a0renúncia continua.',
      } satisfies Headline,
      intro:
        'No mercado de lazer, tudo gira em torno de três valores: patrimônio, liberdade e pertencimento.',
      values: 'Patrimônio. Liberdade. Pertencimento.',
      diagramAlt: 'Diagrama da tríade de valor: Patrimônio. Liberdade. Pertencimento.',
      tension:
        'Você quer os três, mas as alternativas ainda costumam fazer você abrir mão de uma parte importante para ter as outras.',
      /** Nome acessível da sequência das alternativas (não visível; distinto do título da seção). */
      alternativesLabel: 'As alternativas',
      alternatives: [
        {
          title: 'Second Home',
          text: [
            'Entrega patrimônio e pertencimento, mas limita a liberdade a um destino, e responsabilidades de gestão e manutenção do imóvel.',
          ],
        },
        {
          title: 'Hospedagem',
          text: [
            'A locação de temporada ou hoteleira oferece liberdade, mas dificilmente pertencimento e certamente não constrói patrimônio.',
          ],
        },
        {
          title: 'Copropriedade',
          text: [
            'Entrega patrimônio com eficiência, mas dificilmente liberdade e pertencimento na mesma experiência.',
          ],
        },
      ],
      closing: [
        'No fim, você acaba sendo levado a escolher qual parte importa mais.',
        'Não porque seja impossível reunir os três.',
      ],
      closingTurn: 'Mas porque as alternativas foram construídas separadamente.',
    },
    rule: {
      marker: 'Quando abrir mão vira regra',
      title: 'Abrir mão de alguma coisa passou a parecer normal.',
      text: [
        'Cada alternativa resolve uma parte da equação.',
        'E, com o tempo, passamos a tratar essa renúncia como se fosse inevitável.',
        'Patrimônio de um lado. Liberdade do outro. Pertencimento quase sempre em segundo plano.',
        'Por que abrir mão de algo que também importa para você?',
      ],
      panel: {
        label: 'As alternativas',
        dimensions: ['Patrimônio', 'Pertencimento', 'Liberdade'],
        alternatives: [
          { id: 'second-home', label: 'Second Home', values: ['Positivo', 'Talvez', 'Parcial'] },
          { id: 'hospitality', label: 'Hospedagem', values: ['Negativo', 'Talvez', 'Positivo'] },
          {
            id: 'co-ownership',
            label: 'Copropriedade',
            values: ['Proporcional', 'Talvez', 'Proporcional/Parcial'],
          },
        ],
        freedom: {
          before: 'Existem duas formas de liberdade: ',
          use: 'liberdade de uso',
          between: ' e ',
          destination: 'liberdade de destino',
          after: '.',
        },
      },
      closing: [
        'Talvez o problema não esteja no que você deseja.',
        'Talvez esteja na forma como o mercado escolheu entregar.',
      ],
    },
    possibility: {
      marker: 'Uma outra possibilidade',
      title: { lead: 'E se você ', turn: 'não precisasse escolher?' } satisfies Headline,
      imagine: [
        'Imagine ter um lugar que represente quem você é.',
        'Onde possa fazer o que ama, com quem ama.',
      ],
      values: [
        'Um patrimônio para chamar de seu.',
        'Liberdade para continuar descobrindo novos lugares, experiências e histórias.',
        'E pertencimento para sentir que cada experiência tem a ver com a vida que você deseja viver.',
      ],
      triad: 'Patrimônio. Liberdade. Pertencimento.',
      promise: 'Você pode ter os três.',
      logic: 'Essa é a nossa lógica.',
    },
    luxtory: {
      marker: 'Foi para isso que criamos a Luxtory',
      intro:
        'A Luxtory é um clube de second homes de alto padrão construídas em torno de uma ideia simples:',
      idea: 'O lugar onde você vive o lazer deve refletir a vida que você quer viver.',
      lifestyle: 'o lifestyle com o qual você se identifica.',
      partners:
        'Em parceria com marcas que representam esse lifestyle, criamos Second Homes com identidade própria para você viver seu lazer como deseja.',
      club: 'Tudo conectado ao Luxtory Club.',
      architecture: 'Uma arquitetura pensada para reunir:',
      triad: 'Patrimônio. Liberdade. Pertencimento.',
    },
    belonging: {
      marker: 'Branded Residences',
      title: 'Primeiro, encontre um lifestyle que faça parte da sua identidade.',
      brands: [
        'Existem marcas com as quais você se identifica não apenas pelo que elas vendem.',
        'Mas pelo universo que representam.',
      ],
      universe: ['Valores.', 'Estética.', 'Cultura.', 'Experiências.', 'Uma forma de viver.'],
      place: 'Na Luxtory, esse universo se transforma no seu lugar.',
      text: [
        'O Brand DNA inspira seu conceito, arquitetura, interiores, paisagismo, amenidades e experiências.',
        'E tudo isso ganha ainda mais significado quando é vivido com sua família, seus amigos e as pessoas que importam para você.',
      ],
      arrival: 'Tudo para que, quando você chegue, não pense apenas:',
      notOnly: '“Que lugar incrível.”',
      but: 'Mas:',
      mine: '“Esse lugar é a minha cara!”',
    },
    patrimony: {
      marker: 'Branded Second Home',
      title: {
        lead: 'Um lugar que representa você\u00a0— ',
        turn: 'e também é seu.',
      } satisfies Headline,
      intro: 'Na Luxtory, pertencimento não termina na experiência.',
      text: [
        'Você estabelece uma relação patrimonial real com sua Branded Second Home que representa o seu lifestyle.',
        'E pode fazer isso de duas formas.',
      ],
      pair: {
        owner: [
          'A Residence inteira é sua.',
          'Você possui integralmente o imóvel.',
          'Uma Second Home criada para fazer parte da sua vida e conectada ao ecossistema Luxtory.',
        ],
        coOwner: [
          'Você possui uma participação real que faz sentido para sua vida.',
          'Você adquire uma Ação da SPE, a empresa proprietária do imóvel, com Direito de Uso correspondente à sua participação.',
          'Você é acionista da SPE proprietária do imóvel.',
        ],
      } satisfies ModalityPair,
      both: {
        title: 'Duas formas de possuir',
        text: [
          'Owner e Co-Owner funcionam de maneiras diferentes.',
          'Mas partem do mesmo princípio:',
        ],
        principle: 'Patrimônio real.',
      },
    },
    freedom: {
      marker: 'Muito além de um único endereço',
      title: 'Ter um lugar seu não significa ficar preso a ele.',
      text: [
        'Sua Second Home pode ser o lugar onde você se sente em casa.',
        'Mas não precisa ser o único lugar onde você vive suas histórias.',
      ],
      mechanisms: [
        {
          title: 'Luxchange',
          text: [
            'Com Membership vigente, no Luxchange você escolhe períodos elegíveis da sua Second Home para converter em créditos equivalentes e diversificar estadias em outros imóveis da rede; no Co-Owner, somente datas já reservadas no seu Direito de Uso podem ser cedidas.',
            'Créditos não são moeda, investimento nem garantia de disponibilidade.',
            'Pode continuar em um universo parecido com o seu.',
            'Ou experimentar um conceito completamente diferente.',
            'Sempre de acordo com os períodos disponíveis e as regras do clube.',
          ],
        },
        {
          title: 'Luxplus',
          text: [
            'Quer mais tempo?',
            'Com Membership vigente, o Luxplus permite adquirir noites adicionais disponíveis no inventário da Luxtory.',
            'Uma forma de ampliar suas possibilidades quando os dias da sua Second Home ou seus créditos do Luxchange não forem suficientes.',
          ],
        },
        {
          title: 'Locação de temporada',
          text: [
            'E quando houver períodos que você não pretende usar, com Membership vigente poderá autorizar sua locação pelo canal Luxtory conforme a modalidade e as regras aplicáveis; no Co-Owner, somente datas já reservadas no seu Direito de Uso podem ser disponibilizadas pelos canais autorizados.',
            'Você continua no controle da decisão.',
          ],
        },
      ],
      closing: {
        lead: 'Um lugar para chamar de seu. ',
        turn: 'Mais possibilidades para viver.',
      } satisfies Headline,
    },
    management: {
      marker: 'Sua Second Home. Não um segundo trabalho.',
      title: { lead: 'Aproveite mais. ', turn: 'Administre menos.' } satisfies Headline,
      intro:
        'Ter uma casa de lazer costuma trazer junto manutenção, fornecedores, preparação, imprevistos e uma lista de coisas para resolver.',
      text: 'A Luxtory coordena os serviços de gestão e manutenção aplicáveis a cada Residence para reduzir boa parte desses atritos.',
      pair: {
        owner: [
          'A gestão pode ser estruturada conforme os serviços contratados e as necessidades da sua Second Home.',
          'A administração integral pela Luxtory é opcional, assim como a Taxa de Administração.',
          'As despesas da Second Home são suas.',
        ],
        coOwner: [
          'Como a Second Home pertence à SPE proprietária, sua administração e manutenção funcionam de forma coordenada para preservar o ativo e a experiência de todos.',
          'A administração profissional é obrigatória, com Taxa de Administração.',
          'As despesas da Second Home são rateadas entre os Co-Owners.',
        ],
      } satisfies ModalityPair,
      closing: {
        lead: 'Menos tempo administrando. ',
        turn: 'Mais tempo vivendo.',
      } satisfies Headline,
    },
    push: {
      marker: 'Patrimônio + Liberdade + Pertencimento',
      title: {
        lead: 'Uma nova forma de viver ',
        turn: 'aquilo que você conquistou.',
      } satisfies Headline,
      intro: 'Na Luxtory, seu lifestyle pode se transformar em uma Branded Second Home.',
      promises: [
        'Um lugar que representa você.',
        'Um patrimônio que é realmente seu.',
        'Mais possibilidades para viver outros lugares e experiências.',
        'E uma estrutura criada para reduzir os atritos de ter uma Second Home.',
      ],
      forWhom: [
        'A Luxtory é para quem espera mais da forma como vive seu lazer.',
        'Para quem não quer escolher entre construir patrimônio, preservar liberdade e pertencer a lugares que representem quem é.',
        'Para quem acredita que suas conquistas também devem se transformar em experiências, histórias e tempo bem vivido com as pessoas que importam.',
      ],
      next: 'Se essa combinação faz sentido para a vida que você quer viver, o próximo passo é descobrir qual Home combina com você.',
    },
    faq: {
      marker: 'O essencial antes de continuar',
      title: 'Ficou alguma dúvida?',
      items: [
        {
          question: 'O que é a Luxtory?',
          answer: [
            'A Luxtory cria Branded Second Homes inspiradas em diferentes lifestyles e conectadas ao Luxtory Club.',
            'Cada Residence é estruturada para reunir patrimônio, liberdade e pertencimento em uma mesma proposta.',
          ],
        },
        {
          question: 'O que é uma Branded Second Home?',
          answer: [
            'É uma Second Home criada a partir de um lifestyle e do universo de uma Brand Partner.',
            'Seu Brand DNA inspira o Residence Concept e ajuda a orientar arquitetura, interiores, paisagismo, amenidades e experiências.',
          ],
        },
        {
          question: 'O que é uma Brand Partner?',
          answer: [
            'É uma marca que representa um universo de lifestyle com o qual determinadas pessoas se identificam.',
            'Seus valores, sua estética, sua cultura e sua forma de viver servem como inspiração para o conceito da Residence.',
          ],
        },
        {
          question: 'O que é uma Residence Edition?',
          answer: [
            'É a forma como uma determinada Residence é estruturada e oferecida.',
            'Ela define, entre outros pontos, a modalidade de propriedade disponível e as condições aplicáveis àquela oportunidade.',
          ],
        },
        {
          question: 'Qual é a diferença entre Owner e Co-Owner?',
          answer: [
            'No Owner, você possui integralmente a Residence.',
            'Você adquire uma Ação da SPE, a empresa proprietária do imóvel, com Direito de Uso correspondente à sua participação.',
          ],
        },
        {
          question: 'A Luxtory é timeshare?',
          answer: [
            'Não.',
            'No Owner, você é proprietário do imóvel inteiro.',
            'No Co-Owner, você possui participação real na empresa proprietária do imóvel.',
            'Como Co-Owner, você adquire uma Ação da SPE proprietária do imóvel, com Direito de Uso.',
          ],
        },
        {
          question: 'Vou ficar preso à minha Residence?',
          answer: [
            'Não.',
            'Sua Second Home é o ponto de partida, mas, com Membership vigente, mecanismos como Luxchange e Luxplus podem ampliar suas possibilidades de viver outras Second Homes e períodos adicionais, sempre de acordo com disponibilidade e regras aplicáveis.',
          ],
        },
        {
          question: 'Como funciona o Luxchange?',
          answer: [
            'Com Membership vigente, você pode disponibilizar determinados períodos elegíveis da sua Second Home e, seguindo as regras do clube, transformá-los em créditos para viver experiências em outras Second Homes da rede; no Co-Owner, somente datas já reservadas no seu Direito de Uso podem ser cedidas. Créditos não são moeda, investimento nem garantia de disponibilidade.',
          ],
        },
        {
          question: 'O que é o Luxplus?',
          answer: [
            'Com Membership vigente, é uma forma de adquirir noites adicionais disponíveis no inventário da Luxtory quando você quiser viver mais do que seus dias ou créditos disponíveis permitem.',
          ],
        },
        {
          question: 'Posso alugar os períodos que não usar?',
          answer: [
            'Quando a modalidade e a Second Home permitirem, com Membership vigente e pelos canais autorizados: no Owner, as datas que você decidir disponibilizar; no Co-Owner, só datas já reservadas no seu Direito de Uso.',
            'A receita depende da procura, da ocupação, dos preços praticados, dos custos e do mercado. Não há garantia de resultado.',
          ],
        },
        {
          question: 'Quem cuida da Residence?',
          answer: [
            'A Luxtory coordena os serviços de gestão e manutenção previstos para cada Residence.',
            'O escopo varia conforme a Residence Edition, a modalidade e os serviços aplicáveis.',
            'No Owner, a administração integral pela Luxtory é opcional, assim como a Taxa de Administração. As despesas da Second Home são suas.',
            'No Co-Owner, a administração profissional é obrigatória, com Taxa de Administração. As despesas da Second Home são rateadas entre os Co-Owners.',
          ],
        },
        {
          question: 'Existe garantia de valorização ou retorno?',
          answer: [
            'Não.',
            'A propriedade possui valor econômico e está exposta ao mercado imobiliário, podendo valorizar ou desvalorizar.',
            'Não há garantia de valorização, renda, liquidez ou retorno.',
          ],
        },
      ] satisfies readonly Answer[],
      // A última resposta leva à página citada: o nome da página é o link.
      details: {
        question: 'Onde posso entender tudo com mais detalhes?',
        before: 'Na página ',
        link: 'Como Funciona',
        after:
          ', você poderá entender melhor as modalidades, a propriedade, o uso, a gestão, o Luxchange, o Luxplus e os demais mecanismos da Luxtory.',
      },
    },
  },

  howItWorks: {
    // Product Aware → Most Aware, PROOF → PUSH `[FW-B2C: §8.1]`; perguntas `[FW-B2C: §5]` respondidas pela b2c.md §5.
    header: {
      title: 'Como funciona',
      text: 'A arquitetura que reúne patrimônio, liberdade e pertencimento — e as regras que a sustentam, em detalhe.',
    },
    /** Rótulo do índice dos três capítulos (navegação na página). */
    index: 'Capítulos',
    chain: {
      // Mecanismo `[FW-B2C: §2, §8 P4]`; fatos: luxtory.md §5, BR-004, BR-031, BR-053, BR-300, BR-301 (L9).
      title: { lead: 'Do lifestyle ', turn: 'à Second Home.' } satisfies Headline,
      steps: [
        { title: 'Lifestyle', text: 'O universo com o qual você se identifica.' },
        {
          title: 'Brand Partner',
          text: 'A marca parceira que representa esse universo e autoriza o uso da sua marca no modelo.',
        },
        { title: 'Brand DNA', text: 'Identidade, estética, valores e experiências da marca.' },
        {
          title: 'Home Concept',
          text: 'A tradução desse DNA numa casa replicável: arquitetura, interiores, paisagismo, amenidades e forma de viver.',
        },
        {
          title: 'Home Edition',
          text: 'O lançamento de um Concept numa região, com condições comerciais próprias. Toda oferta passa por uma Edition.',
        },
        {
          title: 'Owner ou Co-Owner',
          text: 'As duas modalidades: a Second Home inteira, ou uma Ação da SPE proprietária com Direito de Uso.',
        },
        {
          title: 'Design & Build',
          text: 'Arquitetura, interiores, engenharia e obra, que a Luxtory pode coordenar por inteiro, sempre preservando o Concept.',
        },
        { title: 'Second Home', text: 'A casa, construída do zero e fiel ao Concept.' },
        {
          title: 'Luxtory Club',
          text: 'A rede de Second Homes, serviços e experiências da Luxtory, acessada com Membership.',
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
            'A Second Home, por inteiro: 100% do imóvel e de toda a sua capacidade de uso.',
            'A aquisição pode ser feita por um único adquirente.',
          ],
          coOwner: [
            'Uma Ação da SPE, a sociedade anônima fechada criada para ser a proprietária da Second Home, com Direito de Uso.',
            'Todos os Co-Owners da mesma Second Home têm participação e Direito de Uso equivalentes. A Luxtory não é acionista.',
          ],
        } satisfies ModalityPair,
        after: 'Nas duas modalidades, a posição nasce na formalização da aquisição.',
      },
      answers: [
        {
          question: 'Isso é timeshare?',
          answer: [
            'Não. O Co-Owner é acionista da SPE proprietária da Second Home, com Direito de Uso: uma participação societária, não a compra de tempo ou de dias.',
          ],
        },
        {
          question: 'Existe garantia de retorno, valorização ou liquidez?',
          answer: [
            'Não. A Second Home e a Ação têm valor econômico, podem ser transferidas conforme as regras aplicáveis e acompanham o mercado imobiliário, para cima ou para baixo.',
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
            'Toda a capacidade de uso da Second Home é sua.',
            'Você escolhe as datas que mantém para uso próprio.',
          ],
          coOwner: [
            'O Direito de Uso anual da configuração da Second Home, com limites por temporada que não se compensam entre si.',
            'O calendário abre numa ordem sorteada que gira a cada ano — vantagem de tempo, não exclusividade sobre datas. Cada permanência vai até 14 dias seguidos.',
          ],
        } satisfies ModalityPair,
        after: 'Nas duas modalidades, o uso próprio não depende de Membership.',
      },
      // `01` §8.1 e §9, sem a capacidade da Luxtory; detalhe secundário (aprovado em 2026-10-01).
      configurations: {
        title: 'As quatro configurações Co-Owner',
        text: 'Toda Second Home Co-Owner adota uma destas configurações, definida pela Luxtory conforme a demanda e a viabilidade de cada lançamento. Alta/Super Alta: janeiro, julho, dezembro e a janela de Carnaval. Média/Baixa: as demais datas.',
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
            'As despesas da Second Home são suas.',
          ],
          coOwner: [
            'A administração profissional é obrigatória, com Taxa de Administração.',
            'As despesas da Second Home são rateadas entre os Co-Owners.',
          ],
        } satisfies ModalityPair,
      },
      club: {
        question: 'Consigo usar outros lugares?',
        text: 'Sim, pelo Luxtory Club — a rede de Second Homes, serviços e experiências da Luxtory —, com Membership vigente, a associação ao Club por titular, e conforme regras e disponibilidade.',
        items: [
          {
            title: 'Luxchange',
            text: 'Com Membership vigente, você troca capacidade elegível por Créditos e usa Créditos para estadias em outras Second Homes da rede. No Co-Owner, só uma data já reservada pode ser cedida. Créditos não são moeda, investimento nem garantia de disponibilidade.',
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
            'Aqui a casa nasce de um lifestyle. A Luxtory traduz o universo de uma marca num Home Concept com especificação definida, e cada Second Home é construída do zero, fiel a ele — nunca um imóvel existente adaptado.',
            'O Owner pode personalizar o que não é essencial ao Concept; a Second Home Co-Owner é padronizada. A gestão reduz o trabalho de manter a casa, e o Luxtory Club amplia o uso para além dela.',
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
            'O Titular — Owner ou Co-Owner — pode receber família e amigos como convidados, conforme as regras de cada Second Home, sem consumir Direito de Uso adicional. O convidado não se torna Titular.',
            'À medida que a rede cresce, o Luxtory Club pode ampliar experiências e conexões entre pessoas com afinidades parecidas.',
          ],
        },
      ] satisfies readonly Answer[],
    },
    conditions: {
      // BR-004, BR-031, BR-054, BR-143, BR-373, BR-374; L2 em positivo. FEAR↓ · Retraimento + Diligência.
      title: { lead: 'O que mais ', turn: 'você precisa saber.' } satisfies Headline,
      items: [
        'Toda oferta comercial é feita por uma Home Edition, com as condições registradas pela Luxtory.',
        'Valores de Membership, Taxa de Administração e planos fazem parte das condições comerciais aplicáveis e não são fixados nesta página.',
        'O Co-Owner tem uma Ação com Direito de Uso: participação societária na SPE proprietária da Second Home.',
        'Toda Second Home é construída do zero; imóveis existentes, reformas e adaptações não fazem parte do modelo.',
        'Nenhuma promessa de rentabilidade, valorização, liquidez ou renda.',
      ],
    },
  },

  collection: {
    // PROOF → PUSH; Discovery de produto, não marketplace. BR-001, BR-002, BR-004, REQ-022.
    header: {
      title: 'Coleção',
      text: 'Cada Home Concept traduz o universo de uma marca numa casa. Cada Home Edition é o lançamento de um Concept numa região, com condições próprias — e é por ela que existe oferta.',
    },
    editions: {
      title: 'Home Editions',
      text: 'Concepts com lançamento: a região e a modalidade de cada Edition.',
      listLabel: 'Home Concepts com Home Edition',
    },
    concepts: {
      title: 'Home Concepts',
      text: 'Concepts ainda sem Home Edition — por enquanto, sem oferta comercial.',
      listLabel: 'Home Concepts sem Home Edition',
    },
    credit: 'A partir do universo de',
    editionsLabel: 'Home Editions deste Concept',
    empty: 'Ainda não há Home Concepts publicados.',
    unavailable: 'Não foi possível carregar a Coleção agora. Tente de novo em instantes.',
  },

  concept: {
    // Most Aware: PUSH + prova necessária. BR-004, BR-013, BR-014, BR-017, BR-019, BR-031, BR-300, BR-301, REQ-022.
    credit: 'A partir do universo de',
    residence: { title: 'O que este Concept propõe' },
    faithful: {
      title: { lead: 'Construída do zero, ', turn: 'fiel ao Concept.' } satisfies Headline,
      text: [
        'Toda Second Home nasce de um Home Concept aprovado e é construída do zero, preservando os elementos essenciais que definem a sua identidade.',
        'O Owner pode personalizar o que não é essencial; a Second Home Co-Owner é padronizada. A Luxtory pode coordenar todo o Design & Build — arquitetura, interiores, engenharia e obra —, sempre preservando o Concept.',
      ],
    },
    offer: {
      title: 'Home Editions',
      lead: 'Uma Home Edition é o lançamento deste Concept numa região, com condições comerciais próprias.',
      modality: 'Modalidade',
      conditions: 'Condições comerciais',
      // Sem Edition, sem oferta (BR-004, REQ-022).
      none: 'Este Concept ainda não tem uma Home Edition. Por isso, ainda não há oferta comercial.',
    },
    unavailable: 'Não foi possível carregar este Home Concept agora. Tente de novo em instantes.',
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
      description: 'Home Concepts e Home Editions da Luxtory.',
    },
    conceptSuffix: ' — Luxtory',
    notFound: 'Página não encontrada — Luxtory',
  },
} as const;
