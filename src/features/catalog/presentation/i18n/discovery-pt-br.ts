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
};

const actions = {
  // D-B2C-13, D-B2C-16: o CTA de catálogo depende do que está publicado.
  homeEditions: 'Conheça as Home Editions',
  homeConcepts: 'Conheça os Home Concepts',
  howItWorks: 'Entenda como funciona',
  collection: 'Ver a Coleção',
  otherHomeConcepts: 'Conheça outros Home Concepts',
  viewHomeConcept: 'Ver o Home Concept',
  viewHomeEdition: 'Ver a Home Edition',
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
  /** Próximo passo por disponibilidade (D-B2C-16); `unknown` nunca diz que não há catálogo. */
  next: {
    homeEditions:
      'O próximo passo é conhecer as Home Editions: configurações de Second Home criadas a partir de cada Home Concept.',
    homeConcepts:
      'Ainda não há uma Home Edition publicada. Os Home Concepts já podem ser conhecidos.',
    none: 'Os primeiros Home Concepts ainda não foram publicados. Enquanto isso, veja em detalhe como tudo funciona.',
    unknown: 'Veja em detalhe como tudo funciona.',
  },
  /** No Como funciona: sem Home Concept, a frase não manda para a própria página; desconhecido, nenhuma frase. */
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
    // Home Edition, oferta ou prova de benefício; as demais são atmosfera, decorativas (alt vazio no componente). O
    // anteprojeto é nomeado só "Kaizen": Residence não nomeia produto Luxtory (BR-377, D-LX-11).
    media: {
      kaizen: {
        alt: 'Imagem conceitual de pessoas junto à piscina e à fachada do Kaizen.',
        caption: 'Kaizen · Imagem conceitual',
      },
      kaizenWellness: {
        alt: 'Imagem conceitual de duas pessoas meditando em um pavilhão de madeira do Kaizen.',
      },
      kaizenSuite: {
        alt: 'Imagem conceitual de uma suíte do Kaizen preparada, com a cama arrumada e o jardim ao lado.',
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
      marker: 'Branded Second Homes',
      title: 'Primeiro, encontre um lifestyle que faça parte da sua identidade.',
      brands: [
        'Existem marcas com as quais você se identifica não apenas pelo que elas vendem.',
        'Mas pelo universo que representam.',
      ],
      universe: ['Valores.', 'Estética.', 'Cultura.', 'Experiências.', 'Um estilo de vida.'],
      place: 'Na Luxtory, esse universo se transforma no seu lugar.',
      text: [
        'A identidade da marca inspira seu conceito, arquitetura, interiores, paisagismo, amenidades e experiências.',
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
          'Você como proprietário do imóvel.',
          'Você possui integralmente o imóvel.',
          'Uma Second Home criada para fazer parte da sua vida e conectada ao ecossistema Luxtory.',
        ],
        coOwner: [
          'Você como acionista da SPE proprietária do imóvel.',
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
      // Revisão do fundador (2026-10-06): na Home só o essencial; o detalhe operacional fica no Como funciona.
      mechanisms: [
        {
          title: 'Luxchange — intercâmbio da rede',
          text: [
            'No Luxchange, você escolhe períodos da sua Second Home para converter em créditos equivalentes e diversificar estadias em outros imóveis da rede.',
          ],
        },
        {
          title: 'Luxplus — reservas extras',
          text: [
            'O Luxplus dá acesso a estadias adicionais quando os dias da sua Second Home e os créditos do Luxchange não bastarem.',
          ],
        },
        {
          title: 'Locação de temporada — monetizar tempo ocioso',
          text: [
            'Quando houver períodos que você não pretende usar, você pode autorizar a locação pelo canal Luxtory, conforme a modalidade e as regras aplicáveis.',
            'No Co-Owner, apenas datas já reservadas do seu Direito de Uso podem ser disponibilizadas.',
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
      text: 'A Luxtory coordena os serviços de gestão e manutenção aplicáveis a cada Second Home para reduzir boa parte desses atritos.',
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
      forWhomTitle: 'E para quem é a Luxtory?',
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
            'Cada Second Home é estruturada para reunir patrimônio, liberdade e pertencimento em uma mesma proposta.',
          ],
        },
        {
          question: 'O que é uma Branded Second Home?',
          answer: [
            'É uma Second Home criada a partir de um lifestyle e do universo de uma Brand Partner.',
            'A identidade da marca inspira o Home Concept e ajuda a orientar arquitetura, interiores, paisagismo, amenidades e experiências.',
          ],
        },
        {
          question: 'O que é uma Brand Partner?',
          answer: [
            'É uma marca que representa um universo de lifestyle com o qual determinadas pessoas se identificam.',
            'Seus valores, sua estética, sua cultura e sua forma de viver servem como inspiração para o Home Concept.',
          ],
        },
        {
          question: 'O que é uma Home Edition?',
          answer: [
            'É uma configuração específica e replicável de Second Home, criada a partir de um Home Concept: tipologia, espaços, área, suítes, capacidade e características próprias.',
            'A localização, a modalidade e as condições pertencem a cada Second Home estruturada a partir dela.',
          ],
        },
        {
          question: 'Qual é a diferença entre Owner e Co-Owner?',
          answer: [
            'No Owner, você possui integralmente a Second Home.',
            'No Co-Owner, você adquire uma Ação da SPE proprietária da Second Home, com Direito de Uso correspondente à sua participação.',
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
          question: 'Vou ficar preso à minha Second Home?',
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
          question: 'Quem cuida da Second Home?',
          answer: [
            'A Luxtory coordena os serviços de gestão e manutenção previstos para cada Second Home.',
            'O escopo varia conforme a Second Home, a modalidade e os serviços aplicáveis.',
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
    // Especificação Visual e Copy do fundador — Como funciona (2026-10-06, `D-B2C-20`): extensão da Home, Product Aware →
    // Most Aware, PROOF → PUSH. Fatos, números e limites como o fundador escreveu (L1–L9); só os ajustes de linguagem do
    // `D-B2C-20`. Os eyebrows ficam em caixa normal aqui; o `lx-eyebrow` os mostra em caixa alta. `\n` = quebra de linha
    // intencional dentro do parágrafo.
    hero: {
      title: 'O lugar onde suas melhores histórias ainda vão acontecer.',
      text: 'Entenda como a Luxtory transforma um lifestyle em uma Second Home — e como patrimônio, liberdade e pertencimento se conectam na prática.',
      anchor: 'Entenda a jornada',
      /** Rótulo da navegação pelos três capítulos. */
      chapters: 'Capítulos',
    },
    /** Nomes dos capítulos no índice do Hero (sem o ponto final dos títulos). */
    chapters: {
      patrimony: 'Patrimônio para possuir',
      freedom: 'Liberdade para viver',
      belonging: 'Pertencimento para chamar de seu',
    },
    connection: {
      // Mecanismo `[FW-B2C: §2, §8 P4]`; fatos: luxtory.md §5, BR-004, BR-031, BR-053, BR-300, BR-301 (L9).
      marker: 'Como tudo se conecta',
      title: { lead: 'Do lifestyle ', turn: 'à Second Home.' } satisfies Headline,
      text: [
        'Na Luxtory, a casa não começa pela planta.\nComeça pelo universo com o qual você se identifica.',
        'É esse universo que orienta o conceito, a propriedade e a experiência que vem depois.',
      ],
      /** A jornada em três momentos, cada um com três etapas. */
      journey: {
        phases: [
          {
            title: 'Identidade',
            steps: [
              {
                title: 'Lifestyle',
                text: 'O universo com o qual você se identifica e que representa a forma como deseja viver seu lazer.',
              },
              {
                title: 'Brand Partner',
                text: 'A marca que representa esse universo e participa da construção da identidade do Home Concept.',
              },
              {
                title: 'Identidade da marca',
                text: 'Valores, estética, cultura e experiências que orientam o projeto.',
              },
            ],
          },
          {
            title: 'Conceito',
            steps: [
              {
                title: 'Home Concept',
                text: 'A tradução desse universo em arquitetura, interiores, paisagismo, amenidades e forma de viver.',
              },
              {
                title: 'Home Edition',
                text: 'Uma configuração específica e replicável de Second Home, criada a partir do Home Concept.',
              },
              {
                title: 'Owner ou Co-Owner',
                text: 'A forma como você estabelece sua relação patrimonial com a Second Home.',
              },
            ],
          },
          {
            title: 'Materialização',
            steps: [
              {
                title: 'Design & Build',
                text: 'Arquitetura, interiores, engenharia e obra transformam o Home Concept em uma casa real.',
              },
              {
                title: 'Second Home',
                text: 'Construída do zero e fiel aos elementos essenciais do Home Concept.',
              },
              {
                title: 'Luxtory Club',
                text: 'A rede que conecta sua Second Home a serviços e novas possibilidades.',
              },
            ],
          },
        ],
      },
    },
    patrimony: {
      // L1, L8; BR-051, BR-052, BR-065, BR-071, BR-341, BR-373, BR-374; D-B2C-15.
      marker: '01 · Patrimônio',
      title: triad.patrimony,
      text: [
        'Na Luxtory, você escolhe como deseja estabelecer sua relação patrimonial com a Second Home.',
        'Como Owner, ela é integralmente sua.\nComo Co-Owner, você possui uma Ação da SPE proprietária acompanhada de Direito de Uso.',
      ],
      /** Primeira frase de cada lado = a resposta em destaque. */
      own: {
        question: 'O que exatamente é meu?',
        pair: {
          owner: [
            'A Second Home inteira é sua.',
            'Você possui 100% do imóvel e toda a sua capacidade de uso.',
          ],
          coOwner: [
            'Você possui uma Ação da SPE proprietária.',
            'Sua Ação representa participação real na empresa proprietária da Second Home.',
            'Ela é acompanhada pelo Direito de Uso correspondente à sua participação.',
          ],
        } satisfies ModalityPair,
      },
      answers: [
        {
          question: 'Isso é timeshare?',
          answer: [
            'No Co-Owner, você não compra semanas de hospedagem.',
            'Você possui participação societária na empresa proprietária da Second Home, acompanhada de Direito de Uso.',
          ],
        },
        {
          question: 'Existe garantia de valorização ou renda?',
          answer: [
            'A Second Home e a Ação possuem valor econômico e acompanham o mercado imobiliário.',
            'Podem valorizar ou desvalorizar. Não há garantia de valorização, renda, liquidez ou retorno.',
          ],
        },
      ] satisfies readonly Answer[],
      /** O "Não." em destaque das duas dúvidas. */
      no: 'Não.',
      closing: 'Duas formas de possuir.\nO mesmo princípio: patrimônio real.',
    },
    freedom: {
      // L3, L4, L7; BR-052, BR-075, BR-076, BR-082, BR-100…104, BR-111, BR-144, BR-146…151, BR-162, BR-190.
      marker: '02 · Liberdade',
      title: triad.freedom,
      text: [
        'Ter um lugar seu não significa ficar preso a ele.',
        'A ideia é preservar seu uso e, ao mesmo tempo, ampliar suas possibilidades.',
      ],
      use: {
        question: 'Como posso usar minha Second Home?',
        pair: {
          owner: [
            'Toda a capacidade de uso da Second Home é sua.',
            'Você decide quando quer usá-la.',
          ],
          coOwner: [
            'Seu Direito de Uso anual depende da configuração da Second Home.',
            'O calendário abre em uma ordem sorteada que gira a cada ano.',
            'Cada permanência pode ter até 14 dias consecutivos.',
          ],
        } satisfies ModalityPair,
        after: 'Seu uso próprio não depende de Membership.',
      },
      // `01` §8.1 e §9, sem a capacidade da Luxtory.
      configurations: {
        question: 'No Co-Owner, quanto tempo posso usar?',
        text: [
          'Cada Second Home Co-Owner adota uma das quatro configurações abaixo.',
          'A configuração define sua participação e seu Direito de Uso anual.',
        ],
        label: 'As quatro configurações Co-Owner',
        labels: {
          share: 'Participação',
          annual: 'Uso anual',
          high: 'Alta / Super Alta',
          low: 'Média / Baixa',
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
        legend: [
          'Alta / Super Alta: janeiro, julho, dezembro e janela de Carnaval.',
          'Média / Baixa: demais datas.',
        ],
      },
      unused: {
        question: 'E quando eu não estiver usando?',
        pair: {
          owner: [
            'Você escolhe quais datas mantém para uso próprio.',
            'Quando aplicável, também escolhe quais disponibiliza para outros mecanismos da Luxtory.',
          ],
          coOwner: [
            'O Direito de Uso que você não usar não passa automaticamente para o ano seguinte.',
            'Para Luxchange ou locação, somente datas previamente reservadas dentro do seu Direito de Uso podem ser disponibilizadas.',
          ],
        } satisfies ModalityPair,
      },
    },
    management: {
      // L4; BR-072, BR-130, BR-148, BR-149.
      marker: 'Gestão',
      title: 'Aproveite mais. Administre menos.',
      question: 'Quem cuida da Second Home?',
      pair: {
        owner: ['Você pode contratar os serviços de gestão da Luxtory conforme suas necessidades.'],
        coOwner: [
          'A gestão profissional coordena a Second Home compartilhada e ajuda a preservar o ativo e a experiência de todos.',
        ],
      } satisfies ModalityPair,
      closing: [
        'A estrutura muda conforme a modalidade.',
        'O objetivo é o mesmo: reduzir atritos para você viver mais.',
      ],
    },
    club: {
      // L3, L6, L7; BR-146, BR-147, BR-151, BR-190, REQ-070…072, REQ-101. A condição de Membership vigente abre a lista.
      marker: 'Posso usar outras Second Homes?',
      title: 'Sua Second Home pode ser o ponto de partida — não o limite.',
      lead: 'Com Membership vigente, o Luxtory Club pode ampliar suas possibilidades para além da sua própria Second Home.',
      items: [
        {
          title: 'Luxchange',
          text: [
            'Você pode converter capacidade elegível em Créditos e usar esses Créditos para estadias em outras Second Homes da rede.',
            'Tudo depende das regras e da disponibilidade.',
          ],
          coOwner:
            'Somente datas previamente reservadas dentro do Direito de Uso podem ser disponibilizadas.',
        },
        {
          title: 'Luxplus',
          text: [
            'Quer ficar mais tempo?',
            'O Luxplus permite adquirir noites adicionais disponíveis no inventário da Luxtory.',
            'Isso não altera sua posição patrimonial nem, no Co-Owner, o seu Direito de Uso.',
          ],
        },
        {
          title: 'Locação',
          text: [
            'Quando a modalidade permitir, você pode autorizar datas elegíveis para locação pelos canais da Luxtory.',
            'No Co-Owner, somente datas previamente reservadas dentro do Direito de Uso podem ser disponibilizadas.',
          ],
        },
      ],
      note: [
        'Créditos não são moeda ou investimento.',
        'Locação não representa garantia de ocupação, renda ou resultado.',
      ],
      closing: 'Um lugar para chamar de seu.\nMais possibilidades para viver.',
    },
    belonging: {
      // L5, L6, L9; BR-003, BR-013, BR-017, BR-019, BR-053, BR-054, BR-300, BR-330, BR-331.
      marker: '03 · Pertencimento',
      title: triad.belonging,
      text: [
        'Um lugar não se torna seu apenas porque existe patrimônio.',
        'Ele também precisa refletir quem você é e a forma como deseja viver ali.',
      ],
      difference: {
        question: 'O que faz uma Second Home Luxtory ser diferente?',
        text: [
          'Na Luxtory, a casa começa pelo lifestyle e pela identidade da marca.',
          'Eles orientam o Home Concept: arquitetura, interiores, paisagismo, amenidades e experiências.',
          'Cada Second Home é construída do zero e preserva os elementos essenciais dessa identidade.',
        ],
        pair: {
          owner: ['Você pode personalizar aquilo que não descaracteriza o Home Concept.'],
          coOwner: [
            'A casa mantém uma identidade comum para preservar a experiência de todos os Co-Owners.',
          ],
        } satisfies ModalityPair,
      },
      guests: {
        question: 'E meus convidados?',
        answer: [
          'Você pode viver sua Second Home com família e convidados, conforme as regras aplicáveis.',
          'É assim que a casa deixa de ser apenas um imóvel e passa a fazer parte das histórias que você vive ali.',
          'À medida que a rede cresce, o Luxtory Club também pode ampliar experiências entre pessoas com afinidades semelhantes.',
        ],
      } satisfies Answer,
      closing:
        'Um lugar com a sua identidade.\nPara viver do seu jeito, com quem você quiser por perto.',
    },
    conditions: {
      // BR-004, BR-031, BR-054, BR-143, BR-373, BR-374. Sempre visíveis (sem disclosure): fazem parte da prova.
      title: 'O que preciso saber antes de decidir?',
      items: [
        'Toda oferta comercial está vinculada a uma Home Edition; localização, modalidade e condições são definidas para cada Second Home.',
        'Valores de Membership, taxas e planos dependem das condições aplicáveis e não são fixados nesta página.',
        'No Co-Owner, sua posição patrimonial é uma Ação da SPE proprietária acompanhada de Direito de Uso.',
        'Toda Second Home é construída do zero. Reforma ou adaptação de imóvel existente não faz parte do modelo atual.',
        'Não existe garantia de rentabilidade, valorização, liquidez ou renda.',
      ],
    },
    fit: {
      // PUSH `[FW-B2C: §8 P5]`: o leitor conclui por conta própria; as duas listas com o mesmo peso. BR-019, BR-054,
      // BR-101, BR-104 nos critérios do Co-Owner e do imóvel existente.
      marker: 'Agora a escolha é sua',
      title: qualification.title,
      intro: [
        'Agora você já sabe como funciona.',
        'Falta responder uma pergunta:\nessa forma de possuir e viver combina com você?',
      ],
      fitsTitle: qualification.fitsTitle,
      notFitsTitle: qualification.notFitsTitle,
      fits: [
        'quer uma Second Home;',
        'valoriza patrimônio;',
        'quer ampliar suas possibilidades sem abrir mão de ter um lugar seu;',
        'valoriza identidade e pertencimento;',
        'quer dividir essas experiências com família e convidados;',
        'entende e aceita as regras da modalidade escolhida.',
      ],
      notFits: [
        'busca somente hospedagem pontual;',
        'procura exclusivamente retorno financeiro;',
        'exige garantia de renda, valorização ou liquidez;',
        'no Co-Owner, precisa usar sempre as mesmas datas todos os anos;',
        'no Co-Owner, deseja personalização integral e individual da Second Home.',
      ],
    },
    next: {
      // PUSH final: fecha o Hero sem repeti-lo. O apoio só aparece com o CTA de catálogo (D-B2C-16): sem Home Concept
      // publicado, a frase de `qualification.nextHowItWorks`; com estado desconhecido, nenhuma (nunca um CTA falso).
      title: 'Suas próximas histórias começam pela escolha que faz sentido para você.',
      text: 'Se patrimônio, liberdade e pertencimento fazem sentido juntos para você, descubra quais Home Concepts e Home Editions já fazem parte da Coleção.',
    },
  },

  collection: {
    // Coleção curatorial (spec catalog §13.12, §17.8; D-B2C-21, D-B2C-27): PROOF → PUSH; Discovery de produto, não
    // marketplace. Um card por Home Concept (REQ-022), com as Home Editions publicadas dentro; a Home Edition não tem
    // localização, modalidade nem condições (BR-031, BR-032); a média projetada nunca é preço nem valor por modalidade,
    // por Ação ou por dia (BR-034, REQ-100).
    hero: {
      eyebrow: 'Coleção',
      title: 'As suas próximas histórias começam antes mesmo de a casa existir.',
      text: 'Explore Home Concepts criados a partir de diferentes lifestyles — e conheça as Home Editions criadas a partir deles.',
      explanation:
        'Home Concept é a ideia. Home Edition é uma configuração de Second Home criada a partir dela.',
      howItWorks: 'Entenda como funciona',
    },
    search: {
      label: 'Buscar na Coleção',
      // A barra fixa do desktop é outro landmark de busca: nome próprio (axe landmark-unique).
      compactLabel: 'Refinar a busca na Coleção',
      placeholder: 'Busque por lifestyle, Home Concept, Home Edition ou Brand Partner',
      // Onde a frase longa seria cortada (celular, tablet, barra fixa) — decisão do fundador, 2026-10-07.
      placeholderShort: 'Lifestyle, Home Concept ou marca',
      submit: 'Explorar a Coleção',
      apply: 'Aplicar',
      more: 'Mais filtros',
      filters: (count: number) => (count === 0 ? 'Filtros' : `Filtros (${count})`),
      dialogTitle: 'Filtros',
      close: 'Fechar',
      showResults: 'Ver resultados',
      clear: 'Limpar',
    },
    facets: {
      lifestyle: 'Lifestyle',
      style: 'Estilo',
      guests: 'Pessoas',
      // Rótulo do filtro aprovado no checkpoint visual da W4.2 (2026-10-20); por dentro, o nome canônico (BR-034).
      value: 'Investimento projetado',
      valueShort: 'Investimento projetado',
      suites: 'Suítes',
      area: 'Área (m²)',
      withHomeEdition: 'Só com Home Edition',
      brand: 'Brand Partner',
      all: 'Todos',
      anyGuests: 'Qualquer',
      atLeastGuests: (n: number) => `Para pelo menos ${n}`,
      anySuites: 'Qualquer',
      atLeastSuites: (n: number) => `Pelo menos ${n}`,
      areaFrom: 'De',
      areaTo: 'Até',
      anyBrand: 'Todas',
      anyValue: 'Qualquer',
      valueFrom: 'De',
      valueTo: 'Até',
      valueLegend: 'Média projetada de investimento (R$)',
      valueSuggestion: (min: string, max: string) => `Médias publicadas: de ${min} a ${max}`,
      moreActive: (n: number) => (n === 1 ? '1 ativo' : `${n} ativos`),
      /** Barra fixa: escolhas ativas ao lado do rótulo da faceta. */
      activeCount: (n: number) => `(${n})`,
      rangeBetween: (min: string, max: string) => `${min} a ${max}`,
      rangeFrom: (min: string) => `a partir de ${min}`,
      rangeUpTo: (max: string) => `até ${max}`,
      valueChip: (span: string) => `Investimento projetado: ${span}`,
      suitesChip: (n: number) => `Suítes: pelo menos ${n}`,
      areaChip: (min: string, max: string) => `Área: ${min}–${max} m²`,
      quoted: (value: string) => `“${value}”`,
      valueNote: 'Considera só Home Editions com média projetada vigente.',
    },
    results: {
      eyebrow: 'Curadoria Luxtory',
      title: 'Encontre uma Second Home que tenha a ver com você.',
      filteredTitle: 'Resultados da sua busca',
      clear: 'Limpar filtros',
      remove: (label: string) => `Remover filtro: ${label}`,
      count: (n: number) =>
        n === 0
          ? 'Nenhum Home Concept encontrado.'
          : n === 1
            ? '1 Home Concept encontrado.'
            : `${n} Home Concepts encontrados.`,
      sortLabel: 'Ordenar',
      sorts: { curadoria: 'Curadoria Luxtory', recentes: 'Mais recentes' },
      noResults: 'Nenhum Home Concept combina com todas essas escolhas.',
      noResultsText: 'Tire um filtro ou limpe a busca para ver mais Home Concepts.',
    },
    groups: {
      homeEditions: {
        title: 'Com Home Edition',
        listLabel: 'Home Concepts com Home Edition',
      },
      homeConcepts: {
        title: 'Ainda sem Home Edition',
        listLabel: 'Home Concepts sem Home Edition',
      },
    },
    card: {
      featured: 'Em destaque',
      credit: 'A partir do universo de',
      guests: (n: number) => `Até ${n} pessoas`,
      suites: (n: number) => (n === 1 ? '1 suíte' : `${n} suítes`),
      area: (n: number) => `${n.toLocaleString('pt-BR')} m²`,
      homeEditionsLabel: 'Home Editions deste Home Concept',
      projectedInvestment: (amount: string) => `Média projetada ${amount}`,
      none: 'As Home Editions deste Home Concept ainda não foram publicadas.',
      cta: 'Conheça o Home Concept',
    },
    /** A explicação obrigatória da média projetada (BR-034, spec §17.4), uma vez, abaixo dos cards que a mostram. */
    projectedNote:
      'Média projetada de investimento: referência aproximada da ordem de grandeza do investimento total projetado para materializar uma Second Home daquela Home Edition. O investimento efetivo varia conforme localização, escopo, fornecedores, momento, modalidade e configuração. Não é preço, proposta, condição comercial nem valor individual de Owner ou Co-Owner.',
    journey: {
      eyebrow: 'Do Home Concept à Second Home',
      title: 'Como um Home Concept chega à sua Second Home',
      steps: [
        { title: 'Escolha o Home Concept', text: 'O lifestyle e a casa que combinam com você.' },
        {
          title: 'Conheça as Home Editions',
          text: 'Configurações de Second Home criadas a partir do Home Concept.',
        },
        {
          title: 'Manifeste interesse numa Home Edition',
          text: 'Com a localização pretendida e a modalidade desejada. Owner: a Second Home inteira. Co-Owner: uma Ação da SPE proprietária, com Direito de Uso.',
        },
        {
          title: 'A Luxtory estrutura a Second Home',
          text: 'Com localização concreta, modalidade, estrutura e condições próprias.',
        },
        {
          title: 'O Design & Build dá forma à Second Home',
          text: 'Arquitetura, interiores, engenharia e obra. Construída do zero, fiel ao Home Concept e à configuração da Home Edition.',
        },
        { title: 'Viva sua Second Home', text: 'O lugar onde suas próximas histórias começam.' },
      ],
      more: 'Entenda como funciona',
    },
    closing: {
      title: 'Encontre o lugar onde suas próximas histórias podem começar.',
      refine: 'Refinar a busca',
      howItWorks: 'Entenda como funciona',
    },
    empty: 'Os primeiros Home Concepts ainda não foram publicados.',
    unavailable: 'A Coleção não pôde ser carregada agora.',
  },

  homeConcept: {
    // Most Aware: PUSH + prova necessária (spec §17.8). BR-013, BR-014, BR-017, BR-019, BR-031, BR-034, BR-300, BR-301,
    // REQ-022.
    credit: 'A partir do universo de',
    secondHome: { title: 'O Home Concept' },
    faithful: {
      title: { lead: 'Construída do zero, ', turn: 'fiel ao Home Concept.' } satisfies Headline,
      text: [
        'Toda Second Home nasce de um Home Concept aprovado e é construída do zero, preservando os elementos essenciais que definem a sua identidade.',
        'O Owner pode personalizar o que não é essencial; a Second Home Co-Owner é padronizada. A Luxtory pode coordenar todo o Design & Build — arquitetura, interiores, engenharia e obra —, sempre preservando o Home Concept.',
      ],
    },
    homeEditions: {
      title: 'Home Editions',
      lead: 'Configurações de Second Home criadas a partir deste Home Concept.',
      none: 'As Home Editions deste Home Concept ainda não foram publicadas.',
    },
    unavailable: 'Não foi possível carregar este Home Concept agora. Tente de novo em instantes.',
  },

  homeEdition: {
    // Página da Home Edition (spec §17.8, D-B2C-27): Most Aware, PUSH + prova necessária, sem formulário até a W6
    // (D-B2C-10). Só o registrado; sem localização, disponibilidade, prazo, preço, valor por modalidade ou por Ação,
    // número de Second Homes, configuração Co-Owner nem Investor (BR-031, BR-032, BR-034, L10).
    eyebrow: 'Home Edition',
    breadcrumb: 'Caminho',
    credit: 'A partir do Home Concept',
    brandCredit: 'do universo de',
    presentation: 'A Home Edition',
    configuration: {
      title: 'Configuração',
      typology: 'Tipologia',
      area: 'Área projetada',
      suites: 'Suítes',
      guests: 'Capacidade',
      guestsValue: (n: number) => `Até ${n} pessoas`,
      spaces: 'Configuração dos espaços',
      rooms: 'Ambientes',
      amenities: 'Amenidades',
      characteristics: 'Características',
    },
    gallery: { title: 'Galeria', plans: 'Plantas' },
    projected: {
      title: 'Média projetada de investimento',
      text: [
        'Referência aproximada da ordem de grandeza do investimento total projetado para materializar uma Second Home desta Home Edition.',
        'O investimento efetivo varia conforme localização, escopo, fornecedores, momento, modalidade e configuração. Não é preço, proposta, condição comercial nem valor individual de Owner ou Co-Owner.',
      ],
    },
    toSecondHome: {
      title: { lead: 'Da Home Edition ', turn: 'à sua Second Home.' } satisfies Headline,
      text: [
        'A Home Edition não tem localização. Cada Second Home criada a partir dela é estruturada para uma localização concreta, com modalidade, estrutura e condições próprias.',
        'Owner: a Second Home inteira. Co-Owner: uma Ação da SPE proprietária, com Direito de Uso.',
        'Construída do zero, fiel ao Home Concept e à configuração da Home Edition.',
      ],
    },
    unavailable: 'Não foi possível carregar esta Home Edition agora. Tente de novo em instantes.',
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
    homeConceptSuffix: ' — Luxtory',
    homeEdition: (homeEdition: string, homeConcept: string) =>
      `${homeEdition} · ${homeConcept} — Luxtory`,
    notFound: 'Página não encontrada — Luxtory',
  },
} as const;
