/**
 * Jornada pública Brand Partners (REQ-028, spec catalog §14): copy BP1.1 do Decision & Approval Pack aprovado pelo
 * fundador em 2026-10-12 (`D-BP-15`, catalog §14.9), com os dois ajustes da mesma aprovação — valor bilateral no Hero e
 * Luxtory Club só como modelo previsto. Os textos de página são VERBATIM — não reescrever, resumir nem acrescentar
 * claim. A auditoria de concisão do gate pré-merge (catalog §14.9) só dividiu blocos em parágrafos, na fronteira das
 * frases: uma lista de strings é um bloco da copy, um `<p>` por item. `**termo**` marca o destaque tipográfico previsto na copy (renderizado como `<strong>`), não é conteúdo.
 * Headlines: `lead` + `turn` (a virada em itálico da copy). Identificadores internos (funções 5P, M1–M5) ficam só nos
 * comentários.
 */

/** Rótulos do formulário (catalog §14.3) e do e-mail interno: os mesmos cinco campos autorizados pelo REQ-028. */
const fieldLabels = {
  name: 'Nome',
  brand: 'Marca',
  email: 'E-mail',
  message: 'Mensagem',
  website: 'Site da marca',
} as const;

const CTA = 'Explore o potencial residencial da sua marca.';

export const brandPartnersMessages = {
  site: {
    skipLink: 'Pular para o conteúdo',
    home: 'Luxtory Brand Partners — página inicial',
    nav: 'Navegação Brand Partners',
    footerNav: 'Navegação do rodapé',
    menu: 'Menu',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    brandPartners: 'Brand Partners',
    howItWorks: 'Como funciona',
    contact: 'Contato',
  },

  // Títulos da navegação aprovada; descrições do Approval Pack (sem prova nem claim).
  metadata: {
    siteName: 'Luxtory',
    home: {
      title: 'Brand Partners — Luxtory',
      description:
        'Uma nova forma de a sua marca fazer parte da vida das pessoas: Second Homes concebidas a partir do Brand DNA, com governança sobre o uso da marca.',
    },
    howItWorks: {
      title: 'Como funciona — Brand Partners — Luxtory',
      description:
        'Como a parceria começa, quem decide e quem faz cada etapa, como a marca é protegida e remunerada, e o que precisa acontecer para uma oportunidade avançar.',
    },
  },

  /**
   * Mídia (D5, `P-BP-03`): ensaio próprio M1–M5 em produção. Até a aprovação, cada lugar de fotografia mostra um
   * placeholder estrutural identificado (não é copy de página nem imagem) — sem aceite visual final.
   */
  media: {
    placeholders: {
      m1: 'M1 · A mesa posta — fotografia conceitual em produção',
      m2: 'M2 · Momentos — fotografia conceitual em produção',
      m3: 'M3 · Códigos — fotografia conceitual em produção',
      m4: 'M4 · Ateliê — fotografia conceitual em produção',
      m5: 'M5 · Fim de tarde — fotografia conceitual em produção',
    },
    // O mesmo alt aprovado do diagrama original no B2C (asset compartilhado do Core).
    solutionDiagram:
      'Diagrama original de solução: Patrimônio, Liberdade e Pertencimento integrados, com Luxtory no encontro das três dimensões.',
  },

  home: {
    // PICTURE · Hero (M1).
    hero: {
      marker: 'Brand Partners',
      title: {
        lead: 'Imagine sua comunidade se sentindo em casa ',
        turn: 'no universo da sua marca.',
      },
      // Valor bilateral nos primeiros segundos (ajuste de 2026-10-12): para quem vive e para a marca.
      body: [
        'Para quem se identifica com a sua marca: uma nova forma de viver o lazer com patrimônio, liberdade e pertencimento, em um lugar que expressa sua identidade e seu lifestyle.',
        'Para a sua marca: uma nova forma de transformar o que ela representa em Brand Experience e de participar dos momentos que importam na vida das pessoas.',
      ],
      action: 'Conheça essa possibilidade',
    },
    // PROBLEM.
    problem: {
      marker: 'O dilema da expansão',
      title: { lead: 'Crescer sem perder ', turn: 'o que fez sua marca ser desejada.' },
      paragraphs: [
        'As pessoas escolhem uma marca por algo que reconhecem nela: um olhar, uma atitude, um jeito de viver.',
        'Expandir pode aprofundar essa relação e abrir novas fontes de valor.',
        'O risco está na ordem das decisões.',
      ],
      sides: [
        {
          label: 'Quando o produto vem primeiro',
          title: 'A marca entra depois.',
          text: [
            'O empreendimento é concebido antes, e a marca chega como nome, selo ou decoração.',
            'O nome pode estar presente, mas aquilo que lhe dá sentido pode ficar de fora.',
          ],
        },
        {
          label: 'Quando a marca vem primeiro',
          title: 'A experiência nasce dela.',
          text: [
            'Os valores, a estética, a cultura e o lifestyle da marca — o seu Brand DNA — orientam o que será criado.',
            'A residência passa a expressar o universo que a marca construiu.',
          ],
        },
      ],
      closing: {
        lead: 'A diferença não está no logotipo aplicado.',
        statement: 'Está em onde a ideia começa.',
      },
    },
    // PROMISE (M3).
    promise: {
      marker: 'Uma nova lógica',
      title: { lead: 'A próxima experiência pode nascer ', turn: 'da sua marca.' },
      intro:
        'Os códigos que tornam sua marca reconhecível podem orientar cada escolha, desde a primeira ideia:',
      sequence: [
        'Uma forma de receber.',
        'Uma relação com a natureza.',
        'Uma escolha de materiais.',
      ],
      body: [
        'No residencial, essa é a proposta de **Branded Second Home**.',
        'A Luxtory traduz o Brand DNA em um **Home Concept** — o conceito da residência, com seus espaços, experiências e os elementos essenciais à identidade da marca.',
      ],
    },
    // PROMISE → PROOF · Para a sua marca (tese): escada, cadeia causal, possibilidades × mecanismos, limite.
    brand: {
      marker: 'Para a sua marca',
      title: { lead: 'Da marca vista ', turn: 'à marca vivida.' },
      intro:
        'Uma marca pode estar presente na vida das pessoas de muitas formas. Cada uma cria um tipo de relação.',
      ladder: [
        { title: 'Em um anúncio', text: 'A marca é vista.' },
        { title: 'Em um produto', text: 'A marca é usada.' },
        { title: 'Em uma experiência', text: 'A marca é sentida.' },
        { title: 'Em um lugar', text: 'A marca é vivida.' },
      ],
      chain: {
        lead: 'Quando o universo da marca se torna um lugar, as pessoas passam tempo nele: descansam, recebem, celebram com quem importa.',
        statement: 'A marca passa a fazer parte desses momentos.',
        consequence: 'E isso pode abrir novas formas de relacionamento, de expressão e de valor.',
      },
      // Benefícios plausíveis (inferência a partir do mecanismo; "pode").
      possibilities: {
        label: 'O que isso pode abrir para a marca',
        items: [
          {
            title: 'Um novo ponto de contato',
            text: [
              'Uma forma vivida, e não apenas vista, de a comunidade se relacionar com aquilo que a marca representa.',
            ],
          },
          {
            title: 'Território ampliado com coerência',
            text: [
              'Uma nova categoria que nasce do Brand DNA e preserva seus elementos essenciais.',
            ],
          },
        ],
      },
      // Mecanismos do modelo (BR-016, BR-350; BR-030, BR-040, BR-050; BR-002, BR-015, BR-042).
      mechanisms: {
        label: 'O que o modelo prevê',
        items: [
          {
            title: 'Remuneração pelo uso da marca',
            text: [
              'O uso autorizado da marca é remunerado, com condições definidas em contrato e separadas das demais receitas da Luxtory.',
            ],
          },
          {
            title: 'Interesse antes do lançamento',
            text: [
              'A marca apresenta a possibilidade à sua comunidade, e o interesse pode ser conhecido antes de um lançamento.',
              'Manifestar interesse não é aquisição.',
            ],
          },
          {
            title: 'Expansão quando fizer sentido',
            text: [
              'Um Home Concept pode originar lançamentos em outras regiões, quando direitos, estratégia, demanda e viabilidade permitirem.',
            ],
          },
        ],
      },
      limit: [
        'O modelo cria as condições; os resultados não são prometidos.',
        'Demanda, vendas, receita, escala e replicação dependem de cada oportunidade e não são garantidas.',
      ],
    },
    // PROOF · Para quem vive (M2 + diagrama de solução).
    living: {
      marker: 'Para quem vive',
      title: { lead: 'Um lugar que as pessoas reconhecem ', turn: 'como seu.' },
      intro:
        'Há quem escolha marcas, lugares e experiências pelo que eles expressam: valores, estética, um estilo de vida, as pessoas com quem se sente em casa.',
      lead: 'A proposta Luxtory reúne em uma mesma arquitetura três valores que as alternativas de lazer tendem a separar.',
      pillars: [
        {
          name: 'Patrimônio',
          title: 'Uma relação patrimonial real.',
          text: [
            'Como **Owner**, a pessoa possui a residência integralmente; como **Co-Owner**, possui uma Ação da SPE proprietária da residência, com Direito de Uso.',
          ],
        },
        {
          name: 'Liberdade',
          title: 'Mais possibilidades, menos administração.',
          // Luxtory Club = modelo previsto, nunca disponibilidade atual (ajuste de 2026-10-12; R3 não operacional).
          text: [
            'A residência pode contar com gestão profissional.',
            'O modelo prevê ainda o **Luxtory Club**: quando disponível, estadias em outras Second Homes da rede, conforme Membership, elegibilidade, disponibilidade e regras aplicáveis.',
          ],
        },
        {
          name: 'Pertencimento',
          title: 'Um universo para compartilhar.',
          text: [
            'Um lugar que expressa o universo com o qual a pessoa se identifica — e que ela vive com família, amigos e convidados, conforme as regras da residência.',
          ],
        },
      ],
      closing: {
        lead: 'Para quem vive, uma nova forma de aproveitar o lazer e aquilo que conquistou.',
        statement: 'Para a sua marca, uma nova forma de fazer parte dessa vida.',
      },
    },
    // PROOF · Como acontece (mecanismo e papéis).
    mechanism: {
      marker: 'Como acontece',
      title: 'Do Brand DNA à Second Home, com papéis claros.',
      intro:
        'A Luxtory estrutura o caminho. A marca participa das decisões sobre o uso do seu universo.',
      steps: [
        {
          title: 'Do Brand DNA ao Home Concept.',
          text: [
            'A Luxtory traduz o universo da marca em um Home Concept, com os elementos essenciais à sua identidade.',
          ],
        },
        {
          title: 'Ouvir a comunidade.',
          text: [
            'A marca apresenta a possibilidade principalmente por seus próprios canais.',
            'A Luxtory conversa com os interessados e organiza os próximos passos.',
            'O interesse ajuda a avaliar a oportunidade, mas não é aquisição nem determina um lançamento.',
          ],
        },
        {
          title: 'Lançar uma Home Edition.',
          text: [
            'Quando identifica a oportunidade e decide lançar, a Luxtory cria a **Home Edition**: o lançamento do Home Concept em uma região, com condições comerciais próprias.',
          ],
        },
        {
          title: 'Owner ou Co-Owner.',
          text: [
            'A Home Edition apresenta as modalidades autorizadas. Os direitos de cada pessoa nascem da formalização da aquisição.',
          ],
        },
        {
          title: 'Design & Build.',
          text: [
            'A Luxtory pode coordenar arquitetura, engenharia e obra, da concepção à entrega, conforme o escopo contratado e preservando o Home Concept.',
          ],
        },
        {
          title: 'A Second Home e o Luxtory Club.',
          text: [
            'A residência materializa o Home Concept aprovado.',
            'O modelo prevê que ela possa integrar o Luxtory Club, quando disponível e atendidas as condições aplicáveis.',
          ],
        },
      ],
      link: 'Entenda cada etapa',
    },
    // PROOF · Governança (redução de risco).
    governance: {
      marker: 'Governança',
      title: { lead: 'A marca participa das decisões. ', turn: 'O que é seu continua seu.' },
      answers: [
        {
          question: 'Quem aprova o uso da marca?',
          answer: [
            'A Brand Partner. O plano estratégico de uso da marca, inclusive sua exposição pública, precisa de aprovação prévia.',
            'Mudanças materiais exigem nova aprovação.',
          ],
        },
        {
          question: 'O que é nosso continua nosso?',
          answer: [
            'Sim. A marca, o Brand DNA e os ativos intelectuais que a empresa já possui continuam sendo dela.',
            'Os direitos preexistentes das duas partes são preservados conforme o contrato.',
          ],
        },
        {
          question: 'Como a identidade é preservada?',
          answer: [
            'O Home Concept identifica os elementos essenciais.',
            'Personalizar, sim; descaracterizar, não: mudanças nesses elementos passam pelas aprovações previstas.',
            'Cada residência fica vinculada à versão do Home Concept da sua aprovação comercial.',
          ],
        },
        {
          question: 'E se a parceria terminar?',
          answer: [
            'Ficam impedidos novos Home Concepts, Home Editions e usos da marca depois da eficácia, salvo disposição contratual diferente.',
            'Os direitos de residências já contratadas, vendidas ou em construção não terminam automaticamente; a transição segue o contrato.',
          ],
        },
      ],
      link: 'Ver a governança em detalhe',
    },
    // PUSH · Para quem faz sentido (M5).
    fit: {
      marker: 'Para quem faz sentido',
      title: 'Você reconhece sua marca nessa possibilidade?',
      paragraphs: [
        'Faz sentido para marcas com um universo próprio e uma comunidade que se reconhece nele.',
        'E com interesse em transformar essa relação em novas experiências e fontes de valor, com governança sobre o uso da marca.',
        'O primeiro passo é uma conversa para avaliar o fit entre o seu Brand DNA, a sua comunidade e uma expressão residencial.',
      ],
      action: CTA,
      limit:
        'Não se trata de exposição de logotipo. Demanda, escala e resultados financeiros não são garantidos.',
    },
    // PUSH · Conversa (formulário).
    conversation: {
      marker: 'Conversa',
      title: 'Vamos começar pela sua marca.',
      intro: [
        'Conte o que torna sua marca reconhecível e o que você imagina para sua próxima fase.',
        'Primeiro, vamos conhecer esse universo. Depois, avaliamos juntos se a proposta da Luxtory faz sentido para vocês.',
      ],
      // Propósito literal do REQ-028.
      purpose:
        'Os dados enviados são utilizados para responder à solicitação e avaliar uma possível parceria com a Luxtory.',
      meaning:
        'O envio inicia uma conversa. Não formaliza uma parceria nem gera obrigação de avançar.',
      submit: 'Enviar mensagem',
      // Só no aceite confirmado pelo provedor (202).
      success: 'Envio confirmado. Obrigado por nos apresentar sua marca.',
    },
  },

  howItWorks: {
    // Abertura (M4) + índice da página.
    opening: {
      marker: 'Como funciona',
      title: 'Entenda o caminho antes de dar o próximo passo.',
      body: [
        'Como a parceria começa, quem decide e quem faz cada etapa.',
        'Como a marca é protegida e remunerada, e o que precisa acontecer para uma oportunidade avançar.',
      ],
      // Nome acessível do índice (não visível).
      indexLabel: 'Índice da página',
      index: {
        path: 'Percurso',
        decisions: 'Decisões e remuneração',
        governance: 'Governança',
        club: 'Luxtory Club',
        conditions: 'Condições e expansão',
        fit: 'Para quem faz sentido',
        next: 'Próximo passo',
      },
    },
    // PROOF · Percurso em três fases, sete passos.
    path: {
      marker: 'Percurso',
      title: 'Levar a marca adiante, preservando o que a torna reconhecível.',
      phases: [
        {
          name: 'Início e conceito',
          steps: [
            {
              title: 'Uma conversa sobre a marca.',
              paragraphs: [
                'A relação começa por uma conversa para conhecer o universo da marca, sua comunidade e o que ela imagina para a próxima fase.',
                'Se houver fit, os termos da parceria são definidos em contrato.',
              ],
            },
            {
              title: 'Do Brand DNA ao Home Concept.',
              paragraphs: [
                'A Luxtory traduz o Brand DNA em um **Home Concept**: espaços, experiências e os elementos essenciais à preservação da identidade.',
                'O Home Concept tem especificação suficiente para ser implantado e apresentado comercialmente.',
                'O uso da marca segue um plano estratégico previamente aprovado pela Brand Partner.',
              ],
            },
          ],
        },
        {
          name: 'Interesse e lançamento',
          steps: [
            {
              title: 'Ouvir antes de lançar.',
              paragraphs: [
                'Sua audiência pode ajudar a revelar o interesse pela experiência antes de um lançamento.',
                'A marca apresenta a possibilidade por seus canais.',
                'A Luxtory conversa com os interessados, entende o que procuram e estrutura os próximos passos.',
                'Manifestar interesse não é adquirir uma residência nem determinar um lançamento.',
              ],
            },
            {
              title: 'Nasce uma Home Edition.',
              paragraphs: [
                'Quando identifica a oportunidade e decide lançar, a Luxtory cria uma **Home Edition** vinculada ao Home Concept, com região e condições comerciais definidas.',
                'Só a partir dela existe oferta comercial.',
              ],
            },
            {
              title: 'Owner e Co-Owner.',
              paragraphs: [
                'A Home Edition apresenta as formas de aquisição autorizadas para sua estrutura.',
                'Enquanto essa estrutura estiver aberta, pode contemplar Owner, Co-Owner ou ambos.',
              ],
              modalities: {
                owner: {
                  name: 'Owner',
                  text: 'Adquire a propriedade integral da residência.',
                },
                coOwner: {
                  name: 'Co-Owner',
                  text: 'Adquire uma Ação da SPE proprietária da residência, com Direito de Uso conforme as regras aplicáveis.',
                },
              },
              after: [
                'Os respectivos direitos nascem da formalização da aquisição, respeitando as condições e os compromissos aplicáveis.',
                'Uma manifestação de interesse não os constitui.',
              ],
            },
          ],
        },
        {
          name: 'Realização e continuidade',
          steps: [
            {
              title: 'Reunir competências para realizar.',
              paragraphs: [
                'Levar essa visão à residência exige conectar projeto, fornecedores e execução.',
                'A Luxtory pode coordenar o **Design & Build**, conforme o escopo contratado, preservando os elementos essenciais do Home Concept.',
                'No modelo atual, as Second Homes são desenvolvidas do zero a partir de um Home Concept.',
              ],
            },
            {
              title: 'Cuidar da continuidade da experiência.',
              paragraphs: [
                'Depois da entrega, a preservação do Home Concept continua orientando a relação da residência com a marca.',
                'A administração segue o escopo contratado: a gestão pela Luxtory é obrigatória no Co-Owner e opcional para o Owner.',
                'O modelo prevê que a integração ao Luxtory Club possa fazer parte dessa continuidade, quando disponível e desde que atendidas as condições aplicáveis.',
                'Ela não é automática.',
              ],
            },
          ],
        },
      ],
    },
    // PROOF · Decisões e remuneração: seis decisões (alteração de elementos essenciais fica em Governança e replicação
    // em Condições e expansão — ajuste do Checkpoint 1, 2026-10-12).
    decisions: {
      marker: 'Decisões e remuneração',
      title: 'Quem decide, quem faz e como a marca participa.',
      rows: [
        {
          decision: 'Aprovar o plano estratégico de uso da marca, inclusive a exposição pública',
          who: 'Brand Partner, antes do uso. Mudanças materiais exigem nova aprovação.',
        },
        {
          decision: 'Traduzir o Brand DNA em Home Concept',
          who: 'Luxtory, identificando os elementos essenciais à identidade da marca.',
        },
        {
          decision: 'Gerar interesse',
          who: 'Principalmente a Brand Partner, por seus canais e sua audiência.',
        },
        {
          decision: 'Qualificar, estruturar e converter a demanda',
          who: 'Luxtory.',
        },
        {
          decision:
            'Decidir um lançamento e criar a Home Edition, com região e condições comerciais',
          who: 'Luxtory.',
        },
        {
          decision: 'Coordenar o Design & Build',
          who: 'A Luxtory pode coordenar integralmente, conforme o escopo contratado.',
        },
      ],
      responsibilities:
        'As responsabilidades de cada parte ficam definidas nos contratos da parceria.',
      answers: [
        {
          question: 'Como funciona o licenciamento?',
          answer: [
            'A Brand Partner autoriza o uso da sua marca no modelo, dentro dos direitos acordados e do plano estratégico aprovado.',
            'A marca, o Brand DNA e os ativos que ela já possui continuam sendo dela.',
          ],
        },
        {
          question: 'Como a marca é remunerada?',
          answer: [
            'A parceria prevê remuneração pelo uso autorizado da marca, permitindo explorar uma nova fonte de valor para o que vocês construíram.',
            'Essa remuneração é definida em contrato, com regras próprias e separada das demais receitas da Luxtory.',
            'Valores e condições não são públicos.',
          ],
        },
      ],
    },
    // PROOF · Governança (proteção).
    governance: {
      marker: 'Governança',
      title: 'Sua marca continua participando das decisões sobre seu uso.',
      answers: [
        {
          question: 'Vamos aprovar como a marca será usada?',
          answer: [
            'Sim. O uso da marca parte de um plano estratégico previamente aprovado pela Brand Partner, incluindo sua exposição pública.',
            'A Luxtory pode executar esse plano dentro do escopo acordado. Mudanças materiais precisam de nova aprovação.',
          ],
        },
        {
          question: 'Precisamos abrir mão do que já é nosso?',
          answer: [
            'A marca, seu DNA e os ativos intelectuais que sua empresa já possui continuam sendo seus.',
            'O contrato preserva os direitos de propriedade intelectual preexistentes de ambas as partes.',
          ],
        },
        {
          question: 'Como preservar a identidade se alguém quiser personalizar a residência?',
          answer: [
            'O Home Concept define o que é essencial para a residência continuar reconhecível como expressão da marca.',
            'O Owner pode personalizar elementos não essenciais.',
            'Nas residências Co-Owner, a padronização deve ser mantida, sem alterações individuais que descaracterizem o produto compartilhado.',
            'Mudanças em elementos essenciais dependem das aprovações previstas entre Luxtory e Brand Partner.',
          ],
        },
        {
          question: 'Se o Home Concept evoluir, as residências anteriores precisam mudar?',
          answer: [
            'Uma atualização não modifica automaticamente as residências anteriores.',
            'Cada residência permanece vinculada à versão do Home Concept vigente na data de sua aprovação comercial.',
          ],
        },
        {
          question: 'E se uma residência deixar de representar a marca?',
          answer: [
            'Há medidas previstas para lidar com uma descaracterização material.',
            'Enquanto a não conformidade persistir, podem ser suspensos o uso comercial das marcas relacionadas, a certificação de conformidade e a participação nos mecanismos da rede.',
            'Os direitos patrimoniais permanecem preservados.',
          ],
        },
        {
          question: 'E se decidirmos encerrar a parceria?',
          answer: [
            'O contrato define como encerrar a relação e tratar a continuidade dos compromissos já assumidos.',
            'Quando o encerramento passa a valer, ficam impedidos novos Home Concepts, Home Editions e usos da marca, salvo disposição contratual diferente.',
            'Os direitos necessários para concluir ou dar continuidade a residências já contratadas, vendidas ou em construção não terminam automaticamente.',
            'A transição e os direitos que permanecem seguem o contrato.',
          ],
        },
      ],
    },
    // PROOF · Luxtory Club — modelo previsto, nunca disponibilidade atual (ajuste de 2026-10-12; R3 não operacional).
    club: {
      marker: 'Luxtory Club',
      title: 'A residência poderá fazer parte de uma rede.',
      intro:
        'O modelo Luxtory prevê o Luxtory Club: uma rede que, quando disponível, amplia as possibilidades de quem vive a Second Home além da própria residência.',
      mechanisms: [
        {
          title: 'Membership.',
          text: [
            'Prevista como a associação do Titular ao Luxtory Club.',
            'Será condição para os mecanismos do Club e não altera propriedade, Ação ou Direito de Uso.',
            'O uso da própria residência não depende dela.',
          ],
        },
        {
          title: 'Luxchange.',
          text: [
            'O modelo prevê converter capacidade elegível em Créditos e usá-los em estadias em outras Second Homes da rede.',
            'Créditos serão uma unidade interna do Club: não são moeda, investimento nem garantia de disponibilidade.',
          ],
        },
        {
          title: 'Luxplus.',
          text: [
            'O modelo prevê reservar noites adicionais, quando disponíveis no inventário da Luxtory.',
          ],
        },
      ],
      brand: {
        question: 'E para a marca?',
        answer: [
          'Quando os mecanismos do Club estiverem disponíveis, a participação de uma residência neles exigirá conformidade com os padrões Luxtory e com o Home Concept.',
          'A exposição pública da marca, inclusive nos canais do Club, segue o plano estratégico aprovado pela Brand Partner.',
        ],
      },
      limit: [
        'O Luxtory Club e seus mecanismos fazem parte do modelo previsto.',
        'Quando disponíveis, dependerão de Membership vigente, elegibilidade, disponibilidade, inventário e regras aplicáveis.',
      ],
    },
    // PROOF · Condições e expansão.
    conditions: {
      marker: 'Condições e expansão',
      title: 'Expandir com critério.',
      answers: [
        {
          question: 'Como essa experiência pode chegar a outros lugares?',
          answer: [
            'O Home Concept permite levar a proposta a novas regiões, preservando aquilo que a torna reconhecível.',
            'Cada expansão depende dos direitos de uso da marca, da estratégia da parceria, da demanda e da viabilidade.',
            'Parceiros locais autorizados pela Luxtory podem participar, respeitando o Home Concept, os padrões Luxtory e os direitos da Brand Partner.',
          ],
        },
        {
          question: 'O que precisa acontecer para uma oportunidade avançar?',
          answer: [
            'Cada oportunidade precisa encontrar interesse e condições reais para ser realizada.',
            'A estrutura ajuda a avaliar essas condições, mas não elimina as incertezas do mercado.',
            'Demanda, vendas, receita, retorno, escala e replicação não são garantidos.',
          ],
        },
        {
          question: 'Podemos partir de um imóvel que já existe?',
          answer: [
            'Não. No modelo atual, as Second Homes são desenvolvidas do zero a partir de um Home Concept.',
            'Retrofit, adaptação ou imóveis existentes não fazem parte do modelo.',
          ],
        },
      ],
    },
    // PUSH · Para quem faz sentido (qualificação).
    fit: {
      marker: 'Para quem faz sentido',
      title: { lead: 'Faz sentido ', turn: 'para a sua marca?' },
      intro: [
        'Uma extensão residencial não é o caminho para todas as marcas.',
        'Estes critérios ajudam a avaliar se vale começarmos uma conversa.',
      ],
      yes: {
        title: 'Faz sentido para marcas que',
        items: [
          'têm um Brand DNA reconhecível: valores, estética e um jeito de viver que as pessoas identificam;',
          'têm uma audiência ou comunidade que se reconhece nesse universo;',
          'querem ampliar as experiências que oferecem e transformar o uso autorizado da marca em uma nova fonte de valor;',
          'estão abertas a avaliar uma extensão residencial estruturada, com governança sobre o uso da marca.',
        ],
      },
      no: {
        title: 'Pode não fazer sentido para marcas que',
        items: [
          'buscam apenas a exposição do logotipo;',
          'não desejam estender sua atuação a uma nova categoria;',
          'não veem seu universo traduzido em uma experiência residencial;',
          'não aceitam a governança que preserva os elementos essenciais do Home Concept;',
          'esperam garantia de demanda, escala ou resultado financeiro.',
        ],
      },
    },
    // PUSH final.
    next: {
      marker: 'Próximo passo',
      title: 'O próximo passo é uma conversa sobre a sua marca.',
      paragraphs: [
        'Queremos entender o universo que sua marca construiu, onde vocês querem chegar e o que não pode se perder pelo caminho.',
        'A partir daí, avaliamos juntos se transformar esse universo em uma experiência residencial faz sentido para a próxima fase da marca.',
      ],
      action: CTA,
      support: 'Iniciar a conversa não pressupõe parceria, criação de Home Concept ou lançamento.',
    },
  },

  /**
   * Formulário (catalog §14.3–14.5): rótulos do contrato e microcopy funcional de validação/estado — o mínimo para
   * os estados acessíveis, sem claim, prazo de resposta ou afirmação de entrega.
   */
  form: {
    labels: fieldLabels,
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
      website: 'Informe o endereço completo do site, começando com http:// ou https://.',
    },
    // Resultado do envio por código da resposta (TECH-056); 503 e falha de rede: envio não confirmado (§14.5).
    outcomes: {
      unconfirmed:
        'Não foi possível confirmar o envio. Seus dados continuam no formulário; tente novamente.',
      rateLimited: 'Muitas tentativas em pouco tempo. Tente novamente mais tarde.',
      conflict:
        'Este envio já foi registrado com outros dados. Para enviar a mensagem atual, envie de novo.',
      refused: 'Não foi possível enviar a mensagem.',
    },
  },

  /** E-mail interno à caixa corporativa: assunto fixo e os rótulos dos campos (texto simples, determinístico). */
  contactEmail: {
    subject: 'Brand Partners — mensagem pelo site',
    labels: fieldLabels,
  },
} as const;

export type BrandPartnersMessages = typeof brandPartnersMessages;
