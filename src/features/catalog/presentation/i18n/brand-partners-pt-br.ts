/**
 * Jornada pública Brand Partners (BP1, REQ-028, spec catalog §14): Copy + Especificação Visual FINAL do fundador,
 * congelada para implementação (2026-10-10). Os textos de página são VERBATIM — não reescrever, resumir nem acrescentar
 * claim. `**termo**` marca o destaque tipográfico previsto na copy (renderizado como `<strong>`), não é conteúdo.
 * Identificadores internos (H1–H9, C1–C6, funções 5P) ficam só nos comentários.
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

  // Títulos a partir da navegação aprovada; descrições = trechos verbatim da copy de cada página (sem prova nem claim).
  metadata: {
    siteName: 'Luxtory',
    home: {
      title: 'Brand Partners — Luxtory',
      description: 'Imagine sua comunidade se sentindo em casa no universo da sua marca.',
    },
    howItWorks: {
      title: 'Como funciona — Brand Partners — Luxtory',
      description:
        'Saiba como sua marca participa das decisões, quem conduz cada etapa e o que precisa estar acordado para transformar essa possibilidade em uma proposta concreta.',
    },
  },

  home: {
    // H1 — PICTURE · Hero.
    hero: {
      title: 'Imagine sua comunidade se sentindo em casa no universo da sua marca.',
      lead: 'Pessoas recebendo amigos, compartilhando uma mesa e reconhecendo, nos detalhes, o jeito de viver que sua marca representa.',
      body: 'Uma nova dimensão para o universo que você construiu: mais proximidade com sua comunidade e novas possibilidades de valor, preservando o que faz a marca ser desejada.',
      action: 'Conheça essa possibilidade',
    },
    // H2 — PROBLEM.
    problem: {
      title: 'Crescer sem perder o que fez sua marca ser desejada.',
      paragraphs: [
        'As pessoas escolhem sua marca por algo que reconhecem nela. Um olhar, uma atitude, um jeito de viver.',
        'Expandir pode aprofundar essa relação e abrir novas fontes de valor. O cuidado é levar adiante aquilo que fez a marca ser escolhida.',
      ],
      // Último parágrafo, com mais respiro (sem mudar o papel tipográfico).
      closing:
        'Quando o produto nasce pronto e a marca entra depois, sua identidade precisa se adaptar. O nome pode estar presente, mas aquilo que lhe dá sentido pode ficar de fora.',
    },
    // H3 — PROMISE. Body A vira a sequência editorial (sem duplicar o texto).
    promise: {
      title: 'A próxima experiência pode nascer da sua marca.',
      sequence: [
        'Uma forma de receber.',
        'Uma relação com a natureza.',
        'Uma escolha de materiais.',
      ],
      paragraphs: [
        'Os códigos da sua marca podem orientar o que será criado, desde a primeira ideia. O universo que você construiu passa a inspirar a própria oportunidade.',
        'No residencial, essa é a proposta de **Branded Second Home**: transformar o DNA da marca em residências onde sua identidade possa ser vivida.',
      ],
    },
    // H4 — PROOF · Mecanismo.
    mechanism: {
      title: 'O que sua marca representa pode ganhar forma, endereço e vida.',
      intro:
        'A Luxtory estrutura o caminho entre a identidade da marca, uma oportunidade de lançamento e a realização da residência.',
      steps: [
        {
          title: 'Primeiro, seu universo ganha forma.',
          text: 'Os espaços, as experiências e os elementos que precisam ser preservados são definidos a partir do DNA da marca. Essa proposta residencial é o **Home Concept**.',
        },
        {
          title: 'Essa visão pode encontrar uma oportunidade.',
          text: 'Quando a Luxtory identifica uma oportunidade e decide lançar, define a região e as condições comerciais. Esse lançamento é a **Home Edition**.',
        },
        {
          title: 'A experiência passa a ter um lugar.',
          text: 'A residência física materializa o Home Concept aprovado. É a **Second Home**, onde as pessoas podem viver essa expressão da marca.',
        },
      ],
    },
    // H5 — PROOF · Demanda.
    demand: {
      title: 'Ouvir sua comunidade ajuda a entender onde vale avançar.',
      intro:
        'Você não precisa partir da suposição de que as pessoas vão querer essa experiência. É possível apresentar a proposta e conhecer o interesse antes de existir um lançamento.',
      moments: [
        {
          title: 'A marca abre a conversa.',
          text: 'Leva a possibilidade à sua audiência e comunidade, principalmente por seus próprios canais.',
        },
        {
          title: 'A Luxtory acompanha quem quer avançar.',
          text: 'Conversa com os interessados, entende o que procuram e organiza os próximos passos para uma possível aquisição.',
        },
      ],
      limit:
        'Esse interesse ajuda a avaliar a oportunidade. Não é aquisição nem determina um lançamento.',
    },
    // H6 — PROOF · Governança e valor.
    governance: {
      title: 'Expandir com voz nas decisões e valor para a marca.',
      answers: [
        {
          question: 'Como nossa marca será usada?',
          answer: [
            'Vocês participam das decisões que orientam esse uso. O plano estratégico precisa da aprovação prévia da Brand Partner; mudanças materiais exigem nova aprovação.',
          ],
        },
        {
          question: 'O que é nosso continua sendo nosso?',
          answer: [
            'A marca, seu DNA e os ativos intelectuais que sua empresa já possui continuam sendo seus. Os direitos preexistentes de ambas as partes são preservados conforme o contrato.',
          ],
        },
        {
          question: 'Como a marca participa economicamente?',
          answer: [
            'O uso autorizado da marca é remunerado. Assim, o Brand Equity que vocês construíram pode ganhar uma nova forma de monetização, com condições definidas em contrato para a parceria.',
          ],
        },
      ],
    },
    // H7 — PROOF · Realização.
    realization: {
      title: 'Apoio para transformar sua visão em uma residência.',
      blocks: [
        {
          title: 'Reunir competências para realizar.',
          text: 'Arquitetura, engenharia e obra podem estar longe do dia a dia da sua marca. A Luxtory pode coordenar o Design & Build, da concepção à entrega, conforme o escopo contratado e preservando o Home Concept.',
        },
        {
          title: 'Levar uma experiência reconhecível a novos lugares.',
          text: 'O que torna a experiência singular pode acompanhar sua expansão. A replicação depende dos direitos de uso da marca, da estratégia da parceria, da demanda e da viabilidade de cada oportunidade.',
        },
      ],
      link: 'Entenda o processo e a governança',
    },
    // H8 — PUSH · Fit.
    fit: {
      title: 'Você reconhece sua marca nessa possibilidade?',
      paragraphs: [
        'Existe um universo próprio na sua marca — e uma audiência ou comunidade que se reconhece nele.',
        'Você quer ampliar as experiências que essa relação pode inspirar e transformar a força da marca em novas fontes de valor.',
        'Se uma extensão residencial, desenvolvida com participação da marca nas decisões, faz parte dessa possibilidade, vale começarmos uma conversa.',
      ],
      action: CTA,
      limit:
        'A proposta não é uma simples exposição de logotipo. Demanda, escala e resultados financeiros não são garantidos.',
    },
    // H9 — PUSH · Conversa (formulário).
    conversation: {
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
    // C1 — PROOF · Abertura.
    opening: {
      title: 'Entenda o caminho antes de dar o próximo passo.',
      body: 'Saiba como sua marca participa das decisões, quem conduz cada etapa e o que precisa estar acordado para transformar essa possibilidade em uma proposta concreta.',
      // Nome acessível do índice (não visível).
      indexLabel: 'Índice da página',
      index: {
        path: 'Percurso',
        governance: 'Governança',
        roles: 'Papéis e remuneração',
        continuity: 'Expansão e continuidade',
        next: 'Próximo passo',
      },
    },
    // C2 — PROOF · Percurso.
    path: {
      title: 'Levar a marca adiante, preservando o que a torna reconhecível.',
      steps: [
        {
          title: 'Dar forma ao universo da marca.',
          paragraphs: [
            'O que as pessoas reconhecem na sua marca orienta a criação da experiência residencial.',
            'A Luxtory traduz esse DNA em um **Home Concept**, que define a proposta e os elementos essenciais à preservação de sua identidade.',
          ],
        },
        {
          title: 'Ouvir antes de ampliar.',
          paragraphs: [
            'Sua audiência pode ajudar a revelar o interesse pela experiência antes de um lançamento.',
            'A marca apresenta a possibilidade por seus canais. A Luxtory conversa com os interessados, entende o que procuram e estrutura os próximos passos. Manifestar interesse não é adquirir uma residência nem determinar um lançamento.',
          ],
        },
        {
          title: 'Avançar com uma proposta concreta.',
          paragraphs: [
            'Uma oportunidade precisa de região e condições comerciais definidas para ser apresentada como lançamento.',
            'Quando decide avançar, a Luxtory cria uma **Home Edition** vinculada ao Home Concept e às condições daquela oportunidade.',
          ],
        },
        {
          title: 'Deixar claro o que cada pessoa pode adquirir.',
          paragraphs: [
            'A Home Edition apresenta as formas de aquisição autorizadas para sua estrutura. Enquanto essa estrutura estiver aberta, pode contemplar Owner, Co-Owner ou ambos.',
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
            'Os respectivos direitos nascem da formalização da aquisição, respeitando as condições e os compromissos aplicáveis. Uma manifestação de interesse não os constitui.',
          ],
        },
        {
          title: 'Reunir competências para realizar.',
          paragraphs: [
            'Levar essa visão à residência exige conectar projeto, fornecedores e execução. A Luxtory pode coordenar o **Design & Build**, conforme o escopo contratado, preservando os elementos essenciais do Home Concept.',
            'No modelo atual, as Second Homes são desenvolvidas do zero a partir de um Home Concept.',
          ],
        },
        {
          title: 'Cuidar da continuidade da experiência.',
          paragraphs: [
            'Depois da entrega, a preservação do Home Concept continua orientando a relação da residência com a marca.',
            'A administração segue o escopo contratado. A integração ao Luxtory Club pode fazer parte dessa continuidade, desde que atendidas as condições aplicáveis; ela não é automática.',
          ],
        },
      ],
    },
    // C3 — PROOF · Governança.
    governance: {
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
            'O Owner pode personalizar elementos não essenciais. Nas residências Co-Owner, a padronização deve ser mantida, sem alterações individuais que descaracterizem o produto compartilhado.',
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
            'Enquanto a não conformidade persistir, podem ser suspensos o uso comercial das marcas relacionadas, a certificação de conformidade e a participação nos mecanismos da rede. Os direitos patrimoniais permanecem preservados.',
          ],
        },
      ],
    },
    // C4 — PROOF · Papéis e remuneração. "Brand Partner", "Luxtory" e "Remuneração" são marcadores internos da copy.
    roles: {
      title: 'Trabalhar juntos, sabendo o que cabe a cada um.',
      sides: [
        {
          title: 'A Brand Partner traz identidade e comunidade.',
          paragraphs: [
            'Sua marca aporta o DNA que dá origem à experiência, participa das decisões sobre seu uso e atua principalmente na geração de interesse por seus canais e sua audiência.',
          ],
        },
        {
          title: 'A Luxtory estrutura a proposta e os próximos passos.',
          paragraphs: [
            'Traduz o DNA em Home Concept, conversa com os interessados e organiza o caminho até uma possível aquisição. Pode também coordenar o desenvolvimento e a execução, conforme o escopo contratado.',
          ],
        },
      ],
      responsibilities:
        'As responsabilidades de cada parte ficam definidas nos contratos da parceria.',
      remuneration: {
        question: 'Como nossa marca participa economicamente?',
        answer: [
          'A parceria prevê remuneração pelo uso autorizado da marca, permitindo explorar uma nova fonte de valor para o que vocês construíram.',
          'Essa remuneração é definida em contrato, com regras próprias e separada das demais receitas da Luxtory.',
        ],
      },
    },
    // C5 — PROOF · Expansão e continuidade.
    continuity: {
      title: 'Expandir com critério. Dar continuidade com clareza.',
      answers: [
        {
          question: 'Como essa experiência pode chegar a outros lugares?',
          answer: [
            'O Home Concept permite levar a proposta a novas regiões, preservando aquilo que a torna reconhecível.',
            'Cada expansão depende dos direitos de uso da marca, da estratégia da parceria, da demanda e da viabilidade. Parceiros locais autorizados pela Luxtory podem participar, respeitando o Home Concept, os padrões Luxtory e os direitos da Brand Partner.',
          ],
        },
        {
          question: 'E se decidirmos encerrar a parceria?',
          answer: [
            'O contrato define como encerrar a relação e tratar a continuidade dos compromissos já assumidos.',
            'Quando o encerramento passa a valer, ficam impedidos novos Home Concepts, Home Editions e usos da marca, salvo disposição contratual diferente.',
            'Os direitos necessários para concluir ou dar continuidade a residências já contratadas, vendidas ou em construção não terminam automaticamente. A transição e os direitos que permanecem seguem o contrato.',
          ],
        },
        {
          question: 'O que precisa acontecer para uma oportunidade avançar?',
          answer: [
            'Cada oportunidade precisa encontrar interesse e condições reais para ser realizada. A estrutura ajuda a avaliar essas condições, mas não elimina as incertezas do mercado.',
            'Demanda, vendas, receita, retorno, escala e replicação não são garantidos.',
          ],
        },
      ],
    },
    // C6 — PUSH final.
    next: {
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
