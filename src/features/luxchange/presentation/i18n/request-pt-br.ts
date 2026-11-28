/**
 * Textos da Request (W21; spec luxchange §13.5–§13.6; REQ-062, REQ-097, REQ-098, REQ-100). "Membro solicitante",
 * "membro solicitado", "Créditos necessários", "Saldo disponível", "Créditos em Garantia", "Taxa de intermediação",
 * "prévia". Créditos potenciais nunca aparecem como saldo; estorno solicitado nunca aparece como concluído.
 */
/**
 * Versão dos textos dos aceites da revisão, gravada no consentimento: o aceite da política comercial (`PolicyAcceptance`
 * do pricing, versão apresentada) e `review.acceptComplement`.
 */
export const REQUEST_CONSENT_TEXT_VERSION = 'request-consent.pt-br.v2';

export type RequestOutcomeKey =
  | 'ERR_PERMISSION'
  | 'ERR_MEMBERSHIP_INELIGIBLE'
  | 'ERR_CAPACITY_UNAVAILABLE'
  | 'ERR_MIN_NOTICE'
  | 'ERR_CREDITS_INSUFFICIENT'
  | 'ERR_CREDIT_HOLD_INVALID'
  | 'ERR_PAYMENT_FAILED'
  | 'ERR_POLICY_MISSING'
  | 'ERR_PRL_MISSING'
  | 'ERR_PARAMETER_MISSING'
  | 'ERR_REQUEST_TERMS_CHANGED'
  | 'ERR_STATE_TRANSITION'
  | 'ERR_IDEMPOTENCY_CONFLICT'
  | 'ERR_NOT_FOUND'
  | 'ERR_VALIDATION'
  | 'payment_pending'
  | 'rate_limited'
  | 'not_activated'
  | 'unavailable'
  | 'unauthenticated';

export const requestMessages = {
  metadataTitle: 'Solicitações — Luxtory',
  title: 'Solicitações',
  lead: 'Peça noites de outro membro com os seus Créditos e, se quiser, com datas suas.',
  backToArea: 'Voltar para a Área do Titular',
  credits: (value: string) => `${value} Créditos`,
  /** Estadia: uma noite como "Noite de …"; várias, com entrada e saída explícitas. */
  stay: (first: string, checkout: string, nights: number) =>
    nights === 1 ? `Noite de ${first}` : `Entrada ${first} · saída ${checkout} · ${nights} noites`,
  hours: (value: number) => `${value} horas a partir do envio`,
  list: {
    sent: 'Minhas solicitações',
    sentEmpty: 'Você ainda não enviou solicitações.',
    received: 'Recebidas',
    receivedEmpty: 'Nenhuma solicitação recebida.',
    receivedHint:
      'Solicitações de outros membros para datas das suas Second Homes, com a situação de cada uma.',
    new: 'Nova solicitação',
    dates: 'Datas',
    state: 'Situação',
    deadline: 'Prazo para resposta',
    required: 'Créditos necessários',
  },
  states: {
    pending: 'Aguardando resposta',
    expired: 'Expirada',
    cancelled_pre_accept: 'Encerrada',
  },
  reasons: {
    withdrawn: 'Retirada por você',
    expired: 'Prazo de resposta encerrado',
    declined: 'Solicitação recusada',
    period_started: 'O período solicitado começou',
    requester_membership: 'Seu Membership deixou de estar ativo',
    holder_membership: 'O membro solicitado deixou de poder responder',
    capacity_unavailable: 'As datas solicitadas deixaram de estar disponíveis',
    complement_unavailable: 'Datas suas comprometidas deixaram de estar disponíveis',
  },
  refund: {
    pending: 'Solicitada — em processamento',
    succeeded: 'Concluída',
    failed: 'Em nova tentativa',
  },
  journey: {
    who: 'Quem solicita',
    whoHint: 'A pessoa ou empresa que você representa e que pagará com os próprios Créditos.',
    home: 'Second Home solicitada',
    homeHint: 'Só Second Homes de outros membros.',
    noHomes: 'Nenhuma Second Home disponível para solicitação agora.',
    choose: 'Escolher',
    month: 'Mês',
    previous: 'Mês anterior',
    next: 'Próximo mês',
    datesHeading: 'Datas que você quer',
    datesHint:
      'Toque na primeira e na última noite. As datas solicitáveis mostram os Créditos da noite; reservas de outro membro entram inteiras. Datas indisponíveis não mostram o motivo.',
    status: {
      requestable: 'Solicitável',
      unavailable: 'Indisponível',
      past: 'Passada',
      selected: 'Selecionada',
    },
    selectionInvalid: 'O período precisa ter só noites solicitáveis e contínuas.',
    clear: 'Limpar seleção',
    complementHeading: 'Datas suas para comprometer (opcional)',
    complementHint:
      'Só datas com pelo menos 14 dias de antecedência ao fim do prazo de resposta. Comprometidas, só deixam de ser suas se a solicitação for aceita; até lá não podem ser usadas, canceladas nem depositadas.',
    complementEmpty: 'Nenhuma data sua elegível neste período.',
    complementOwner: (date: string) => `Noite de ${date}`,
    complementBooking: (first: string, last: string, nights: number) =>
      `Reserva de ${first} a ${last} (${nights} ${nights === 1 ? 'noite' : 'noites'})`,
    potential: (value: string) => `${value} Créditos potenciais`,
    potentialHint: 'Ainda não originados: só viram Créditos se a solicitação for aceita.',
    preview: 'Ver prévia',
    datesCaption: 'Calendário da Second Home solicitada',
    complementCaption: (label: string) => `Datas suas em ${label}`,
    summary: 'Resumo',
    summaryEmpty: 'Escolha as datas que você quer.',
    nightsCount: (nights: number) => `${nights} ${nights === 1 ? 'noite' : 'noites'}`,
    estimated: 'Estimativa da tela: a prévia do servidor confirma os valores.',
    nightLabel: (date: string, status: string, credits: string | null) =>
      credits === null ? `${date}, ${status}` : `${date}, ${status}, ${credits} Créditos`,
    unitHint: 'Esta data faz parte de uma reserva e entra inteira.',
    unavailableHint: (date: string) => `${date}: indisponível para solicitação.`,
    pastHint: (date: string) => `${date}: data passada.`,
    closed: 'As solicitações ainda não estão disponíveis.',
    membership: 'É preciso Membership ativo para solicitar.',
    complementClosed: 'O complemento por datas ainda não está disponível.',
    changeHome: 'Escolher outra Second Home',
    fromCredits: (value: string) => `A partir de ${value} Créditos por noite`,
    partyLabel: (documentType: 'cpf' | 'cnpj', masked: string) =>
      `${documentType === 'cpf' ? 'CPF' : 'CNPJ'} ${masked}`,
    noParty:
      'Para solicitar, é preciso representar uma pessoa ou empresa com Second Home e Membership ativo.',
    previewing: 'Calculando a prévia…',
  },
  review: {
    heading: 'Prévia da solicitação',
    required: 'Créditos necessários',
    balance: 'Créditos disponíveis antes do envio',
    potential: 'Créditos potenciais das datas oferecidas',
    potentialHint: (dates: string) =>
      `Ainda não originados (${dates}): só viram Créditos se a solicitação for aceita.`,
    guarantee: 'Créditos em Garantia',
    guaranteeHint: 'Reservados até a resposta; voltam para a Carteira se não houver aceite.',
    covered: 'Total coberto',
    coveredBreakdown: (guarantee: string, potential: string) =>
      `${guarantee} em Garantia + ${potential} das datas oferecidas.`,
    coveredByGuarantee: 'Coberto pela Garantia.',
    excess: 'Excedente',
    excessHint: (months: number) =>
      `Fica disponível na sua Carteira só depois do aceite, com validade de ${months} meses.`,
    available: 'Créditos disponíveis após o envio',
    groupFee: 'Taxa e prazo',
    fee: 'Taxa de intermediação',
    feeHint: 'Paga no envio; devolvida integralmente se não houver aceite.',
    deadline: 'Prazo para resposta',
    nights: 'Créditos por noite solicitada',
    policy: 'Política da solicitação',
    policyBefore:
      'Até a resposta, sem aceite, a solicitação termina sem custo: a Taxa de intermediação é devolvida integralmente, a Garantia volta para a Carteira e as datas oferecidas são liberadas. As condições comerciais valem só depois do aceite.',
    policyAfter: 'Condições depois do aceite (estadia confirmada)',
    policyAfterHint:
      'Cancelamento, não comparecimento e exceções extraordinárias da estadia confirmada:',
    confirmation: 'Confirmação',
    acceptComplement:
      'Aceito comprometer as datas acima: se a solicitação for aceita, elas são cedidas ao Inventário Luxtory pelos Créditos potenciais.',
    send: 'Pagar a Taxa e enviar',
    sending: 'Enviando…',
    refresh: 'Ver prévia atualizada',
    back: 'Voltar à seleção',
    refunding: 'Pagamento sem solicitação enviada — devolução em processamento.',
    retry: 'Tentar enviar de novo',
  },
  detail: {
    title: 'Solicitação',
    home: 'Second Home',
    dates: 'Datas',
    state: 'Situação',
    reason: 'Motivo',
    sentAt: 'Enviada em',
    deadline: 'Prazo para resposta',
    required: 'Créditos necessários',
    guarantee: 'Créditos em Garantia',
    potential: 'Créditos potenciais das datas comprometidas',
    committed: 'Datas comprometidas',
    /** Encerrada: o compromisso terminou; valores históricos preservados. */
    potentialClosed: 'Créditos potenciais considerados no envio — não originados',
    committedClosed: 'Datas anteriormente comprometidas — liberadas',
    feeClosed: 'Taxa de intermediação paga no envio',
    none: 'Nenhuma',
    fee: 'Taxa de intermediação',
    released: 'Garantia liberada para a Carteira',
    withdraw: 'Retirar solicitação',
    withdrawHint:
      'A Garantia volta para a sua Carteira, as datas comprometidas são liberadas e a Taxa é devolvida integralmente.',
    back: 'Ver todas as solicitações',
    sent: 'Solicitação enviada. O membro solicitado tem até o prazo abaixo para responder.',
    paymentStates: {
      pending: 'pagamento em processamento',
      approved: 'paga',
      failed: 'pagamento não aprovado',
    } as Readonly<Record<string, string>>,
    refundLabel: 'Devolução integral da Taxa',
    nights: 'Créditos por noite solicitada',
    closedAt: 'Encerrada em',
    withdrawing: 'Retirando…',
  },
  outcome: {
    ERR_PERMISSION: 'Você não pode fazer esta solicitação por esta pessoa ou empresa.',
    ERR_MEMBERSHIP_INELIGIBLE: 'É preciso Membership ativo — seu ou do membro solicitado.',
    ERR_CAPACITY_UNAVAILABLE: 'Alguma data deixou de estar disponível. Revise a seleção.',
    ERR_MIN_NOTICE:
      'Alguma data sua deixou de ter 14 dias de antecedência ao fim do prazo. Revise.',
    ERR_CREDITS_INSUFFICIENT:
      'Saldo disponível insuficiente. Acrescente datas suas ou reduza o período.',
    ERR_CREDIT_HOLD_INVALID:
      'Parte dos seus Créditos vence antes do fim do prazo de resposta. Acrescente datas suas.',
    ERR_PAYMENT_FAILED: 'O pagamento da Taxa não foi concluído. Nada foi enviado.',
    ERR_POLICY_MISSING: 'A política da solicitação mudou. Veja a prévia atualizada.',
    ERR_PRL_MISSING: 'Alguma data ainda não tem referência de Créditos.',
    ERR_PARAMETER_MISSING: 'As solicitações ainda não estão disponíveis.',
    ERR_REQUEST_TERMS_CHANGED: 'Os valores mudaram desde a prévia. Veja a prévia atualizada.',
    ERR_STATE_TRANSITION: 'Esta solicitação já foi encerrada.',
    ERR_IDEMPOTENCY_CONFLICT: 'Esta tentativa já foi usada. Veja a prévia de novo.',
    ERR_NOT_FOUND: 'Solicitação não encontrada.',
    ERR_VALIDATION: 'Revise a seleção: alguma data sua não é necessária para cobrir os Créditos.',
    payment_pending: 'Pagamento em processamento. Você poderá enviar quando ele for aprovado.',
    rate_limited: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    not_activated: 'As solicitações ainda não estão disponíveis.',
    unavailable: 'Não foi possível concluir agora. Tente novamente.',
    unauthenticated: 'Sua sessão terminou. Entre de novo.',
  },
  area: {
    heading: 'Solicitações',
    lead: 'Peça noites de outros membros com Créditos e acompanhe as solicitações recebidas.',
    link: 'Ver solicitações',
  },
  commitments: {
    heading: 'Datas comprometidas com solicitação pendente',
    hint: 'Créditos potenciais, não utilizáveis: só viram Créditos se a solicitação for aceita. Retirada ou encerrada a solicitação, as datas voltam a ser suas.',
    total: 'Créditos potenciais (não utilizáveis)',
    line: (home: string, date: string, credits: string) =>
      `${home} · ${date} · ${credits} Créditos potenciais`,
    see: 'Ver solicitação',
    booking:
      'Esta reserva está comprometida com uma solicitação sua pendente. Enquanto ela estiver pendente, a reserva não pode ser cancelada nem depositada. Para liberá-la, retire a solicitação.',
    calendar: (dates: string) =>
      `Datas comprometidas com solicitação pendente: ${dates}. Elas não podem ser reservadas, canceladas nem depositadas até a solicitação ser retirada ou encerrada.`,
  },
  notification: {
    sent: 'Solicitação enviada',
    received: 'Solicitação recebida',
    closed: 'Solicitação encerrada',
    receivedClosed: 'Solicitação recebida encerrada',
    accepted: 'Solicitação aceita',
    receivedAccepted: 'Cessão confirmada',
    acceptedWhat: (stay: string) => `Reserva confirmada para ${stay}.`,
    receivedAcceptedWhat: (stay: string) => `Datas cedidas: ${stay}.`,
    guaranteeConsumed: 'Garantia consumida',
    complementConsumed: 'Créditos do complemento consumidos',
    excess: 'Créditos disponíveis do complemento',
    receivedCredits: 'Créditos recebidos',
    creditExpiry: 'Validade dos Créditos',
    sentWhat: (stay: string) =>
      `${stay}. Os Créditos em Garantia e as datas oferecidas ficam reservados até a resposta.`,
    receivedWhat: (stay: string) => `Um membro solicitou datas da sua Second Home — ${stay}.`,
    closedWhat: (stay: string, reason: string) => `${stay}: ${reason}.`,
    receivedClosedWhat: (stay: string) => `${stay}: a solicitação foi encerrada.`,
    guarantee: 'Créditos em Garantia',
    released: 'Garantia liberada',
    deadline: 'Prazo para resposta',
    refund: 'Taxa de intermediação: devolução solicitada',
    committed: 'Datas comprometidas',
    committedCount: (count: number) =>
      count === 0 ? 'Nenhuma' : `${count} ${count === 1 ? 'data' : 'datas'} até a resposta`,
    releasedDates: 'Liberadas',
    fee: 'Taxa de intermediação',
    feePaid: 'Paga',
    feeRefund: 'Devolução solicitada',
  },
};
