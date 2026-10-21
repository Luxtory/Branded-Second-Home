import type {
  AvailableToStartBand,
  DecisionHorizon,
  DecisionUnit,
  ReferenceFit,
} from '../../domain/interest-qualification';

/**
 * Copy da seção "Solicitar uma conversa" na página da Home Edition (spec ownership §14.3 e §14.5; `b2c.md` `D-B2C-28`).
 * Literais do fundador e que não mudam sem nova decisão: abertura, etapas, perguntas, respostas, ajudas, botões e
 * sucesso (revisão de 2026-10-21), as microcopies da P-3 e a D4. Mensagens de validação e de falha seguem o padrão da
 * BP1. Terminologia do `02` §1 (REQ-100); nenhuma promessa de retorno, prazo, aquisição ou agendamento (REQ-101); nunca
 * "entrada" (não há estrutura comercial de entrada + saldo).
 */
export const interestRequestMessages = {
  section: {
    title: 'Solicite uma conversa sobre esta Home Edition',
    lead: 'Conte como você imagina sua Second Home. Com essas informações, podemos preparar uma conversa mais objetiva sobre esta Home Edition.',
  },
  steps: {
    // "1 de 3 — Sua Second Home"
    of: 'de',
    titles: ['Sua Second Home', 'Investimento e decisão', 'Contato'],
  },
  modality: {
    legend: 'Como você imagina ter sua Second Home?',
    owner: 'Owner',
    // Descrições aprovadas na Home (`D-B2C-19`, revisão de 2026-10-06).
    ownerDesc: 'Você como proprietário do imóvel.',
    coOwner: 'Co-Owner',
    coOwnerDesc: 'Você como acionista da SPE proprietária do imóvel.',
  },
  desiredLocation: {
    label: 'Onde você imagina sua Second Home?',
    hint: 'Cidade, região ou destino, do jeito que preferir.',
  },
  approxDays: {
    label: 'Quantos dias por ano, aproximadamente?',
    // P-3 (fundador, 2026-10-19) — literal.
    hint: 'Para Co-Owner, os dias informados representam apenas uma preferência e não criam Direito de Uso.',
  },
  // Revisão do fundador de 2026-10-21 (spec ownership §14.5) — literais.
  availableToStart: {
    // Espaços inseparáveis entre "R$", o número e a unidade: a faixa nunca quebra com "R$" sozinho no fim da linha.
    legend:
      'Se decidir avançar, qual faixa de recursos você teria disponível para iniciar o investimento?',
    hint: 'Essa referência nos ajuda a preparar uma conversa mais adequada ao seu momento. Não é uma proposta nem condição comercial.',
    answers: {
      up_to_250k: 'Até R$\u00a0250\u00a0mil',
      from_250k_to_500k: 'De R$\u00a0250\u00a0mil a R$\u00a0500\u00a0mil',
      from_500k_to_1m: 'De R$\u00a0500\u00a0mil a R$\u00a01\u00a0milhão',
      from_1m_to_2_5m: 'De R$\u00a01\u00a0milhão a R$\u00a02,5\u00a0milhões',
      from_2_5m_to_5m: 'De R$\u00a02,5\u00a0milhões a R$\u00a05\u00a0milhões',
      above_5m: 'Acima de R$\u00a05\u00a0milhões',
      not_defined: 'Ainda não defini',
    } satisfies Record<AvailableToStartBand, string>,
  },
  referenceFit: {
    // "Considerando a média projetada de R$ X desta Home Edition, como ela se compara ao investimento total que você
    // considera?" — o valor é o mesmo texto do bloco da página.
    legendBefore: 'Considerando a média projetada de',
    legendAfter:
      'desta Home Edition, como ela se compara ao investimento total que você considera?',
    note: 'Referência aproximada do investimento total projetado para materializar uma Second Home desta Home Edition. Não é preço, proposta ou condição comercial.',
    answers: {
      within: 'Está dentro do que considero investir.',
      could_consider: 'Posso considerar, mas preciso entender melhor o investimento.',
      above: 'Está acima do que considero investir hoje.',
    } satisfies Record<ReferenceFit, string>,
  },
  coOwnerNote:
    'No Co-Owner, o investimento individual depende da configuração da Second Home, definida pela Luxtory durante a estruturação. A média projetada da Home Edition não representa o valor de uma Ação.',
  decisionUnit: {
    legend: 'Quem participa dessa decisão com você?',
    answers: {
      self: 'A decisão é minha.',
      with_partner_or_family: 'Decido em conjunto com meu parceiro, parceira ou família.',
      with_others: 'Outras pessoas também participam da decisão.',
    } satisfies Record<DecisionUnit, string>,
  },
  decisionHorizon: {
    legend: 'Se encontrar uma opção que faça sentido, quando você estaria pronto para avançar?',
    answers: {
      immediate: 'Imediatamente / nos próximos 30 dias',
      one_to_three_months: 'Entre 1 e 3 meses',
      three_to_six_months: 'Entre 3 e 6 meses',
      six_to_twelve_months: 'Entre 6 e 12 meses',
      over_twelve_months: 'Mais de 12 meses',
      exploring: 'Ainda estou explorando possibilidades',
    } satisfies Record<DecisionHorizon, string>,
  },
  contact: {
    name: 'Nome',
    phone: 'Telefone ou WhatsApp',
    phoneHint: 'Com DDD. Fora do Brasil, inclua o código do país.',
    email: 'E-mail',
  },
  transparency: {
    // P-3 (fundador, 2026-10-19) — literal.
    notAcquisition: 'Manifestar interesse não é uma aquisição.',
    // D4 (fundador, 2026-10-19; validação jurídica depois) — literal.
    privacy:
      'Usaremos seus dados para responder à sua solicitação de conversa e conduzir a pré-qualificação comercial relacionada a esta Home Edition.',
    privacyMore: 'Saiba mais no',
    privacyLink: 'Aviso de Privacidade',
    newTab: '(abre em nova aba)',
  },
  continue: 'Continuar',
  back: 'Voltar',
  submit: 'Solicitar uma conversa',
  sending: 'Enviando…',
  errorSummary: 'Revise os campos indicados.',
  fields: {
    required: 'Preencha este campo.',
    too_long: 'Texto longo demais para este campo.',
    invalid: 'Valor inválido.',
    not_allowed: 'Esta opção não está disponível para a escolha feita.',
  },
  choiceRequired: 'Escolha uma opção.',
  fieldInvalid: {
    email: 'Informe um e-mail válido.',
    phone: 'Informe um telefone com DDD, ou com o código do país, de 8 a 15 dígitos.',
    approx_days: 'Informe um número inteiro de dias, maior que zero.',
  },
  // Rótulos dos campos no resumo de erros.
  labels: {
    modality: 'Modalidade',
    desired_location: 'Localização pretendida',
    approx_days: 'Dias por ano',
    available_to_start_band: 'Recursos para iniciar',
    reference_fit: 'Média projetada',
    decision_unit: 'Quem decide',
    decision_horizon: 'Quando avançar',
    name: 'Nome',
    phone: 'Telefone ou WhatsApp',
    email: 'E-mail',
  },
  // Resultado do envio por código da resposta (TECH-056); 503, 500 e falha de rede: envio não confirmado.
  outcomes: {
    unconfirmed:
      'Não foi possível confirmar o envio. Seus dados continuam no formulário; tente novamente.',
    rateLimited: 'Muitas tentativas em pouco tempo. Tente novamente mais tarde.',
    conflict:
      'Esta solicitação já foi registrada com outros dados. Para registrar a atual, envie de novo.',
    refused: 'Não foi possível registrar a solicitação.',
    unavailable: 'Esta Home Edition não está mais disponível para solicitação de conversa.',
    stale: 'Esta página ficou desatualizada. Atualize a página e envie novamente.',
  },
  unavailableLink: 'Ver a Coleção',
  success: 'Recebemos sua solicitação de conversa.',
} as const;

export type InterestRequestMessages = typeof interestRequestMessages;
