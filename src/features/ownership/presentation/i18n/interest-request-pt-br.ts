import type {
  DecisionHorizon,
  DecisionUnit,
  InvestmentAnswer,
  InvestmentQuestion,
} from '../../domain/interest-qualification';

/**
 * Copy da seção "Solicitar uma conversa" na página da Home Edition (spec ownership §14.3 e §14.5; `b2c.md` `D-B2C-28`).
 * Literais do fundador e que não mudam sem nova decisão: perguntas e respostas da pré-qualificação (2026-10-20), as
 * microcopies da P-3 e a D4. Título, apoio, rótulos e mensagens de falha são proposta até o checkpoint visual final da
 * W6. Terminologia do `02` §1 (REQ-100); nenhuma promessa de retorno, prazo, aquisição ou agendamento (REQ-101).
 */
export const interestRequestMessages = {
  section: {
    title: 'Solicite uma conversa sobre esta Home Edition',
    lead: 'Conte como você imagina sua Second Home a partir desta Home Edition.',
  },
  groups: {
    secondHome: 'Sua Second Home',
    decision: 'Investimento e decisão',
    contact: 'Contato',
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
  // Decisão do fundador de 2026-10-20 (spec ownership §14.5) — literais.
  investment: {
    reference_fit: {
      legend:
        'Como a média projetada de investimento desta Home Edition se compara ao que você considera investir?',
      // "Média projetada apresentada: R$ X." — o valor é o mesmo texto do bloco da página.
      presented: 'Média projetada apresentada:',
      note: 'Referência aproximada do investimento total projetado para materializar uma Second Home desta Home Edition. Não é preço, proposta ou condição comercial.',
      answers: {
        within: 'Está dentro do que considero investir.',
        needs_understanding: 'Preciso entender melhor o investimento antes de avaliar.',
        above: 'Está acima do que considero investir hoje.',
      },
    },
    investment_definition: {
      legend: 'Em relação ao investimento, qual opção melhor descreve seu momento?',
      coOwnerNote:
        'No Co-Owner, o investimento individual depende da configuração da Second Home, definida pela Luxtory durante a estruturação. Por isso, a média projetada da Home Edition não representa o valor de uma Ação.',
      answers: {
        range_defined: 'Já defini uma faixa que considero investir.',
        idea_without_range:
          'Tenho uma ideia do que considero investir, mas ainda não defini uma faixa.',
        needs_understanding: 'Preciso entender melhor o investimento antes de definir uma faixa.',
      },
    },
  },
  decisionUnit: {
    legend: 'Quem participa dessa decisão com você?',
    answers: {
      self: 'A decisão é minha.',
      with_partner_or_family: 'Decido com meu parceiro, parceira ou família.',
      with_others: 'Outras pessoas também participam.',
    } satisfies Record<DecisionUnit, string>,
  },
  decisionHorizon: {
    legend: 'Quando você imagina avançar com essa decisão?',
    answers: {
      within_3_months: 'Nos próximos 3 meses.',
      from_3_to_6_months: 'Entre 3 e 6 meses.',
      from_6_to_12_months: 'Entre 6 e 12 meses.',
      over_12_months: 'Mais de 12 meses.',
      exploring: 'Ainda estou explorando possibilidades.',
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
    investment_answer: 'Investimento',
    decision_unit: 'Unidade de decisão',
    decision_horizon: 'Horizonte',
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

/** Pergunta e resposta da dimensão de investimento, na copy aprovada (formulário e Admin). */
export function investmentAnswerLabel(
  question: InvestmentQuestion,
  answer: InvestmentAnswer,
): string {
  const answers: Readonly<Record<string, string>> =
    interestRequestMessages.investment[question].answers;
  return answers[answer] ?? answer;
}
