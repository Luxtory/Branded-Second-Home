/**
 * Jornada pública Brand Partners (REQ-028, spec catalog §14): copy BP1.1 do Decision & Approval Pack aprovado pelo
 * fundador em 2026-10-12 (`D-BP-15`, catalog §14.9), com os dois ajustes da mesma aprovação — valor bilateral no Hero e
 * Luxtory Club só como modelo previsto — e com o refinamento comercial pós-merge do fundador de 2026-10-13 (`D-BP-20`:
 * PROBLEM, PROMISE, Para a sua marca e Luxchange). Os textos de página são VERBATIM — não reescrever, resumir nem acrescentar
 * claim. A auditoria de concisão do gate pré-merge (catalog §14.9) só dividiu blocos em parágrafos, na fronteira das
 * frases: uma lista de strings é um bloco da copy, um `<p>` por item. `**termo**` marca o destaque tipográfico previsto na copy (renderizado como `<strong>`), não é conteúdo.
 * Headlines: `lead` + `turn` (a virada em itálico da copy). Identificadores internos (funções 5P, M1–M5) ficam só nos
 * comentários. Revisão GTM aprovada em 2026-11-08 (`D-BP-31`, catalog §14.10): valor para a marca, Discovery,
 * licenciamento com incorporadoras e jornada B2B em sete etapas. Refinamento visual local autorizado em 2026-11-09
 * (`D-BP-32`): concisão, direção de produto, conceito de casa replicável e áreas abertas de interesse/aquisição e
 * realização; sete etapas, governança e direitos preservados. Sem promessa de gratuidade geral.
 */

/** Rótulos do formulário (catalog §14.3) e do e-mail interno: os mesmos cinco campos autorizados pelo REQ-028. */
const fieldLabels = {
  name: 'Nome',
  brand: 'Marca',
  email: 'E-mail',
  message: 'Mensagem',
  website: 'Site da marca',
} as const;

const CTA = 'Explore o potencial da sua marca em Second Homes.';

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
        'Licenciamento de marcas para Branded Second Homes, com participação de incorporadoras e governança sobre a identidade da sua marca.',
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
        lead: 'Uma nova expressão ',
        turn: 'do valor da sua marca.',
      },
      // Valor para a Brand Partner e explicação breve do licenciamento (D-BP-31).
      body: [
        'Criamos conceitos de casas de lazer com a identidade da sua marca e o estilo de vida do seu público.',
        'A Luxtory articula o licenciamento com incorporadoras, sem exigir que sua marca financie a construção.',
      ],
      action: 'Conheça essa possibilidade',
    },
    // PROBLEM — a lacuna nas estratégias de Brand Experience (ajuste pós-merge do fundador, `D-BP-20`): cria a tensão
    // sem nomear a solução — Branded Second Home, Home Concept e Luxtory só aparecem a partir do PROMISE.
    problem: {
      marker: 'O dilema da expansão',
      title: {
        lead: 'Brand Experience cria encontros. ',
        turn: 'O desafio é fazê-los virar memória.',
      },
      paragraphs: [
        'Eventos, ativações, collabs, varejo e hospitalidade aproximam pessoas da marca — e cada formato tem seu papel.',
        'Mas as conexões mais profundas não nascem apenas da exposição. Elas se constroem quando a marca participa de momentos que as pessoas realmente valorizam.',
        'O mercado ainda oferece poucas soluções capazes de criar conexões emocionais e memoráveis entre pessoas e marcas, transformando momentos de lazer em uma vivência significativa.',
      ],
      sides: [
        {
          label: 'O que já existe',
          title: 'Experiências que geram impacto.',
          text: [
            'Elas despertam atenção, desejo e participação.',
            'Mas, em geral, acontecem por um período limitado e terminam quando aquela experiência acaba.',
          ],
        },
        {
          label: 'O espaço em aberto',
          title: 'Experiências que criam vínculo.',
          text: [
            'Tempo, convivência, descanso, encontros e celebrações criam outro tipo de relação.',
            'Um contexto em que a marca pode deixar de ser apenas percebida e passar a fazer parte das histórias que as pessoas lembram e compartilham.',
          ],
        },
      ],
      closing: {
        lead: 'Não falta mais uma forma de a marca aparecer.',
        statement: 'Falta um lugar para ela fazer parte da vida.',
      },
    },
    // PROMISE (M3) — a resposta à tensão (`D-BP-20`): a primeira seção que nomeia Branded Second Home e Home Concept.
    promise: {
      marker: 'Uma nova lógica',
      title: { lead: 'A melhor experiência do seu público pode nascer ', turn: 'da sua marca.' },
      intro:
        'Quando a experiência nasce da identidade da marca, ela orienta o que as pessoas sentem, fazem e lembram.',
      // Equação de valor (fundador, `D-BP-21`): momento emocional + identidade compartilhada = vínculo com a marca.
      equation: {
        premises: [
          'Seu público vivendo momentos extraordinários com quem ama',
          'Um lugar que transforma a identidade da sua marca em experiência',
        ],
        plus: '+',
        result: 'Uma conexão mais profunda e duradoura com sua marca.',
      },
      body: [
        'A Luxtory estrutura o licenciamento e dirige o desenvolvimento do produto, preservando a identidade da marca.',
        'No universo dos imóveis de lazer, essa lógica ganha forma em uma **Branded Second Home**.',
        'O **Home Concept** é um conceito de casa replicável, com ambientes e experiências orientados pela identidade da marca.',
      ],
    },
    // PROMISE → PROOF · Para a sua marca (tese): escada, cadeia causal, possibilidades × mecanismos (a nota de limite
    // saiu no ajuste pós-merge do fundador, `D-BP-20`, sem substituto).
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
              'Uma nova categoria que nasce da identidade da marca e preserva seus elementos essenciais.',
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
              'O licenciamento remunera a marca, conforme contrato e de forma separada das demais receitas da Luxtory.',
            ],
          },
          {
            title: 'Discovery orientando o produto',
            text: [
              'A pesquisa com seu público orienta os Home Concepts antes de compromissos imobiliários significativos.',
            ],
          },
          {
            title: 'Expansão quando fizer sentido',
            text: [
              'Uma Home Edition pode originar várias Second Homes e ser licenciada em outros destinos, conforme os direitos contratados.',
            ],
          },
        ],
      },
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
            'Como **Owner**, a pessoa possui a Second Home integralmente; como **Co-Owner**, possui uma participação societária na SPE proprietária da Second Home, com Direito de Uso.',
          ],
        },
        {
          name: 'Liberdade',
          title: 'Mais possibilidades, menos administração.',
          // Luxtory Club = modelo previsto, nunca disponibilidade atual (ajuste de 2026-10-12; R3 não operacional).
          text: [
            'A Second Home pode contar com gestão profissional.',
            'O modelo prevê ainda o **Luxtory Club**: quando disponível, estadias em outras Second Homes da rede, conforme Membership, elegibilidade, disponibilidade e regras aplicáveis.',
          ],
        },
        {
          name: 'Pertencimento',
          title: 'Um universo para compartilhar.',
          text: [
            'O lugar combina identidade e privacidade para receber família, amigos e convidados, conforme as regras da Second Home.',
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
      title: 'Da identidade da marca à Second Home, com papéis claros.',
      intro:
        'Sua marca licencia e aprova. A Luxtory dirige o produto e acompanha sua fidelidade. A incorporadora investe e realiza.',
      steps: [
        {
          title: 'Parceria e representação.',
          text: [
            'A representação começa sem exclusividade, com direitos e responsabilidades definidos em contrato.',
          ],
        },
        {
          title: 'Discovery e Home Concepts.',
          text: [
            'A Luxtory conduz o Discovery com participantes mobilizados pela marca.',
            'Desenvolve Home Concepts e um Opportunity Brief, que reúne evidências e oportunidades.',
          ],
        },
        {
          title: 'Aprovação dos conceitos.',
          text: [
            'A marca aprova os Home Concepts, os padrões de identidade e a apresentação às incorporadoras.',
          ],
        },
        {
          title: 'Prospecção e licenciamento.',
          text: [
            'A Luxtory busca incorporadoras e articula o licenciamento, com aprovação da marca.',
            'O licenciamento é contratado antes do desenvolvimento definitivo da Home Edition.',
          ],
        },
        {
          title: 'Desenvolvimento da Home Edition.',
          text: [
            'A Luxtory dirige o desenvolvimento da **Home Edition** com a incorporadora e os especialistas contratados.',
            'Essa configuração replicável pode originar diferentes Second Homes.',
          ],
        },
        {
          title: 'Aprovação, lançamento e realização.',
          text: [
            'A marca aprova o uso de sua identidade no produto e nos materiais de lançamento.',
            'A incorporadora investe, estrutura, comercializa e constrói com seus responsáveis habilitados.',
            'A Luxtory supervisiona a fidelidade ao produto aprovado.',
          ],
        },
        {
          title: 'Operação e evolução.',
          text: [
            'Operação e manutenção cabem aos responsáveis contratados.',
            'A Luxtory acompanha a conformidade e a evolução do produto no escopo acordado.',
            'O Luxtory Club é previsto, quando disponível e atendidas as condições aplicáveis.',
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
            'Também aprova os Home Concepts, os direitos licenciados e os materiais de lançamento.',
            'Mudanças materiais exigem nova aprovação.',
          ],
        },
        {
          question: 'O que é nosso continua nosso?',
          answer: [
            'Sim. A marca, sua identidade e os ativos intelectuais que a empresa já possui continuam sendo dela.',
            'Os direitos preexistentes das duas partes são preservados conforme o contrato.',
          ],
        },
        {
          question: 'Como a identidade é preservada?',
          answer: [
            'O Home Concept identifica os elementos essenciais.',
            'Personalizar, sim; descaracterizar, não: mudanças nesses elementos passam pelas aprovações previstas.',
            'Cada Second Home fica vinculada à versão do Home Concept da sua aprovação comercial.',
          ],
        },
        {
          question: 'E se a parceria terminar?',
          answer: [
            'Ficam impedidos novos Home Concepts, Home Editions e usos da marca depois da eficácia, salvo disposição contratual diferente.',
            'Os direitos de Second Homes já contratadas, vendidas ou em construção não terminam automaticamente; a transição segue o contrato.',
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
        'Faz sentido para marcas com identidade própria e um público que se reconhece nela.',
        'O primeiro passo é uma conversa para avaliar essa possibilidade juntos.',
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
      // Propósito do REQ-028 com a informação de privacidade mínima (J-35, decisão do fundador, 2026-10-13).
      purpose:
        'Os dados enviados são utilizados exclusivamente para responder à sua solicitação e avaliar uma possível parceria com a Luxtory. O conteúdo é encaminhado à equipe responsável e não é armazenado no banco da plataforma. Não utilizamos esses dados para comunicações de marketing sem autorização.',
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
      body: ['Veja quem faz o quê, como a marca é protegida e como funciona sua remuneração.'],
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
              title: 'Parceria e representação.',
              paragraphs: [
                'A representação começa sem exclusividade, com direitos e responsabilidades definidos em contrato.',
              ],
            },
            {
              title: 'Discovery e Home Concepts.',
              paragraphs: [
                'A Luxtory conduz o Discovery com participantes mobilizados pela marca.',
                'Desenvolve Home Concepts e um Opportunity Brief, que reúne evidências e oportunidades.',
                'Pesquisa exploratória não comprova demanda de compra nem promete vendas. Não é interesse comercial ou aquisição, nem gera direitos.',
              ],
            },
            {
              title: 'Aprovação dos conceitos.',
              paragraphs: [
                'A marca aprova os Home Concepts, os padrões de identidade e a apresentação às incorporadoras.',
              ],
            },
          ],
        },
        {
          name: 'Licenciamento e Home Edition',
          steps: [
            {
              title: 'Prospecção e licenciamento.',
              paragraphs: [
                'A Luxtory busca incorporadoras e articula o licenciamento, com aprovação da marca.',
                'O licenciamento é contratado antes do desenvolvimento definitivo da Home Edition.',
              ],
            },
            {
              title: 'Desenvolvimento da Home Edition.',
              paragraphs: [
                'A Luxtory dirige o desenvolvimento da **Home Edition** com a incorporadora e os especialistas contratados.',
                'Essa configuração replicável pode originar diferentes Second Homes.',
                'Localização, modalidade, estrutura patrimonial e condições comerciais são definidas para cada Second Home.',
              ],
            },
          ],
        },
        {
          name: 'Realização e continuidade',
          steps: [
            {
              title: 'Aprovação, lançamento e realização.',
              paragraphs: [
                'A marca aprova o uso de sua identidade no produto e nos materiais de lançamento.',
              ],
              acquisition: {
                label: 'Interesse e aquisição',
                paragraphs: [
                  'Após a publicação da Home Edition, o consumidor pode manifestar interesse, indicando localização pretendida e Owner ou Co-Owner.',
                  'Interesse não é aquisição. A venda formal exige estruturação, condições comerciais definidas e autorizações aplicáveis.',
                  'Enquanto essa estrutura estiver aberta, a Second Home pode contemplar Owner, Co-Owner ou ambos.',
                ],
              },
              modalities: {
                owner: {
                  name: 'Owner',
                  text: 'Adquire a propriedade integral da Second Home.',
                },
                coOwner: {
                  name: 'Co-Owner',
                  text: 'Adquire uma participação societária na SPE proprietária da Second Home, com Direito de Uso conforme as regras aplicáveis.',
                },
              },
              after: [
                'Os respectivos direitos nascem da formalização da aquisição, respeitando as condições e os compromissos aplicáveis.',
                'Uma manifestação de interesse não os constitui.',
              ],
              realization: {
                label: 'Realização imobiliária',
                paragraphs: [
                  'A incorporadora investe, estrutura, comercializa e constrói com seus responsáveis habilitados.',
                  'A Luxtory supervisiona a fidelidade ao produto aprovado.',
                ],
              },
            },
            {
              title: 'Operação e evolução.',
              paragraphs: [
                'Operação e manutenção cabem aos responsáveis contratados.',
                'A Luxtory acompanha a conformidade e a evolução do produto no escopo acordado.',
                'O Luxtory Club é previsto, quando disponível e atendidas as condições aplicáveis.',
                'A administração profissional é obrigatória no Co-Owner e facultativa no Owner, conforme as regras aplicáveis.',
              ],
            },
          ],
        },
      ],
    },
    // PROOF · Decisões e remuneração: papéis abertos; aprovações completas em Governança e replicação em Condições.
    decisions: {
      marker: 'Decisões e remuneração',
      title: 'Quem decide, quem faz e como a marca participa.',
      parties: [
        {
          name: 'Sua marca',
          paragraphs: [
            'Mobiliza a pesquisa, autoriza o uso da marca e aprova conceitos, licenciamento e materiais.',
          ],
        },
        {
          name: 'Luxtory',
          paragraphs: [
            'Representa a marca, conduz o Discovery e desenvolve os Home Concepts.',
            'Articula o licenciamento, dirige o produto e acompanha sua conformidade.',
          ],
        },
        {
          name: 'Incorporadora',
          paragraphs: [
            'Investe, avalia a viabilidade e assume a realização imobiliária.',
            'Seus responsáveis habilitados conduzem os projetos técnicos, a construção e as vendas.',
          ],
        },
      ],
      operation: 'Operação e manutenção cabem aos responsáveis contratados.',
      responsibilities:
        'As responsabilidades de cada parte ficam definidas nos contratos da parceria.',
      answers: [
        {
          question: 'Como funciona o licenciamento?',
          answer: [
            'A marca continua sendo sua. A licença define território, prazo e direitos para Second Homes de uma Home Edition.',
            'A Luxtory articula a negociação entre marca e incorporadora.',
            'Eventual exclusividade fica no escopo contratado, sem abranger automaticamente toda a marca ou o Home Concept.',
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
            'Também aprova os Home Concepts, os direitos licenciados e os materiais de lançamento.',
            'A Luxtory pode executar esse plano dentro do escopo acordado. Mudanças materiais precisam de nova aprovação.',
          ],
        },
        {
          question: 'Precisamos abrir mão do que já é nosso?',
          answer: [
            'A marca, sua identidade e os ativos intelectuais que sua empresa já possui continuam sendo seus.',
            'O contrato preserva os direitos de propriedade intelectual preexistentes de ambas as partes.',
          ],
        },
        {
          question: 'Como preservar a identidade se alguém quiser personalizar a Second Home?',
          answer: [
            'O Home Concept define o que é essencial para a Second Home continuar reconhecível como expressão da marca.',
            'O Owner pode personalizar elementos não essenciais.',
            'Nas Second Homes Co-Owner, a padronização deve ser mantida, sem alterações individuais que descaracterizem o produto compartilhado.',
            'Mudanças em elementos essenciais dependem das aprovações previstas entre Luxtory e Brand Partner.',
          ],
        },
        {
          question: 'Se o Home Concept evoluir, as Second Homes anteriores precisam mudar?',
          answer: [
            'Uma atualização não modifica automaticamente as Second Homes anteriores.',
            'Cada Second Home permanece vinculada à versão do Home Concept vigente na data de sua aprovação comercial.',
          ],
        },
        {
          question: 'E se uma Second Home deixar de representar a marca?',
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
            'Os direitos necessários para concluir ou dar continuidade a Second Homes já contratadas, vendidas ou em construção não terminam automaticamente.',
            'A transição e os direitos que permanecem seguem o contrato.',
          ],
        },
      ],
    },
    // PROOF · Luxtory Club — modelo previsto, nunca disponibilidade atual (ajuste de 2026-10-12; R3 não operacional).
    club: {
      marker: 'Luxtory Club',
      title: 'A Second Home poderá fazer parte de uma rede.',
      intro:
        'O modelo Luxtory prevê o Luxtory Club: uma rede que, quando disponível, amplia as possibilidades de quem vive a Second Home para além dela.',
      mechanisms: [
        {
          title: 'Membership.',
          text: [
            'Prevista como a associação do Titular ao Luxtory Club.',
            'Será condição para os mecanismos do Club e não altera propriedade, Ação ou Direito de Uso.',
            'O uso da própria Second Home não depende dela.',
          ],
        },
        {
          title: 'Luxchange.',
          // Redação determinada pelo fundador (`D-BP-21`), verbatim; a abertura e o fechamento da seção já enquadram o
          // Club como modelo previsto — sem ressalva aqui.
          text: [
            'O clube permite ao membro converter dias do seu direito de uso em créditos equivalentes para se hospedar em outras Second Homes da rede.',
            'Sua Second Home deixa de estar limitada a um único endereço e passa a fazer parte de uma rede de destinos.',
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
          'Quando os mecanismos do Club estiverem disponíveis, a participação de uma Second Home neles exigirá conformidade com os padrões Luxtory e com o Home Concept.',
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
            'Uma Home Edition pode originar várias Second Homes e ser licenciada em outros destinos, conforme os direitos contratados.',
            'Cada expansão depende dos direitos de uso da marca, da estratégia da parceria, da demanda e da viabilidade.',
            'Parceiros locais autorizados pela Luxtory podem participar, respeitando o Home Concept, os padrões Luxtory e os direitos da Brand Partner.',
          ],
        },
        {
          question: 'O que precisa acontecer para uma oportunidade avançar?',
          answer: [
            'Cada oportunidade depende de direitos autorizados, viabilidade e decisão de investimento da incorporadora.',
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
        'Uma extensão da marca em Second Homes não é o caminho para todas as marcas.',
        'Estes critérios ajudam a avaliar se vale começarmos uma conversa.',
      ],
      yes: {
        title: 'Faz sentido para marcas que',
        items: [
          'têm uma identidade reconhecível: valores, estética e um jeito de viver que as pessoas identificam;',
          'têm uma audiência ou comunidade que se reconhece nesse universo;',
          'querem ampliar as experiências que oferecem e transformar o uso autorizado da marca em uma nova fonte de valor;',
          'estão abertas a avaliar uma extensão da marca em Second Homes, estruturada e com governança sobre o uso da marca.',
        ],
      },
      no: {
        title: 'Pode não fazer sentido para marcas que',
        items: [
          'buscam apenas a exposição do logotipo;',
          'não desejam estender sua atuação a uma nova categoria;',
          'não veem seu universo traduzido na experiência de uma Second Home;',
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
        'A partir daí, avaliamos juntos se transformar esse universo na experiência de uma Second Home faz sentido para a próxima fase da marca.',
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
