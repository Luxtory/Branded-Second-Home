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
  hours: (value: number) => `${value} horas a partir do envio`,
  list: {
    sent: 'Minhas solicitações',
    sentEmpty: 'Você ainda não enviou solicitações.',
    received: 'Recebidas',
    receivedEmpty: 'Nenhuma solicitação recebida.',
    receivedHint: 'Só leitura: o aceite e a recusa chegam numa próxima versão.',
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
    period_started: 'O período solicitado começou',
    requester_membership: 'Seu Membership deixou de estar ativo',
    holder_membership: 'O membro solicitado deixou de poder responder',
    capacity_unavailable: 'As datas solicitadas deixaram de estar disponíveis',
    complement_unavailable: 'Datas suas comprometidas deixaram de estar disponíveis',
  },
  refund: {
    none: 'Taxa de intermediação paga',
    pending: 'Devolução da Taxa solicitada — em processamento',
    succeeded: 'Taxa de intermediação devolvida',
    failed: 'Devolução da Taxa em nova tentativa',
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
      'Toque na primeira e na última noite. Reservas de outro membro entram inteiras. Datas indisponíveis não mostram o motivo.',
    status: {
      requestable: 'Solicitável',
      unavailable: 'Indisponível',
      past: 'Passada',
      selected: 'Selecionada',
    },
    selection: (first: string, last: string, nights: number) =>
      `${first} a ${last} · ${nights} ${nights === 1 ? 'noite' : 'noites'}`,
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
    balance: 'Saldo disponível na Carteira',
    committed: 'Datas a comprometer',
    potential: 'Créditos potenciais das datas',
    potentialHint:
      'Ainda não originados: não são saldo e só viram Créditos se a solicitação for aceita.',
    guarantee: 'Créditos em Garantia',
    guaranteeHint: 'Saem do saldo disponível no envio e voltam se a solicitação não for aceita.',
    covered: 'Total coberto',
    exchange: 'Saldo potencial para intercâmbio',
    exchangeHint: 'Os Créditos potenciais não podem ser usados antes do aceite.',
    exchangeBreakdown: (balance: string, potential: string) =>
      `${balance} disponíveis + ${potential} potenciais, ainda não originados.`,
    coveredBreakdown: (guarantee: string, potential: string) =>
      `${guarantee} em Garantia + ${potential} potenciais.`,
    groupNow: 'Sua Carteira agora',
    groupCoverage: 'Como os Créditos necessários são cobertos',
    groupAfter: 'Depois do envio',
    groupFee: 'Taxa e prazo',
    heldAfter: 'Em Garantia até a resposta',
    excess: 'Excedente',
    excessHint:
      'Créditos potenciais que sobram da cobertura; se a solicitação for aceita, entram na sua Carteira.',
    fee: 'Taxa de intermediação',
    feeHint: 'Paga agora e devolvida integralmente se a solicitação não for aceita.',
    deadline: 'Prazo para resposta',
    validity: (months: number) => `Validade dos Créditos originados: ${months} meses`,
    nights: 'Créditos por noite solicitada',
    policy: 'Política da solicitação',
    acceptComplement:
      'Aceito comprometer as datas acima: se a solicitação for aceita, elas são cedidas ao Inventário Luxtory pelos Créditos potenciais.',
    send: 'Pagar a Taxa e enviar',
    sending: 'Enviando…',
    refresh: 'Ver prévia atualizada',
    back: 'Voltar à seleção',
    available: 'Saldo disponível depois do envio',
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
    none: 'Nenhuma',
    fee: 'Taxa de intermediação',
    released: 'Garantia liberada para a Carteira',
    withdraw: 'Retirar solicitação',
    withdrawHint:
      'A Garantia volta para a sua Carteira, as datas comprometidas são liberadas e a Taxa é devolvida integralmente.',
    back: 'Ver todas as solicitações',
    sent: 'Solicitação enviada. O membro solicitado tem até o prazo abaixo para responder.',
    payment: 'Pagamento da Taxa',
    paymentStates: {
      pending: 'Em processamento',
      approved: 'Aprovado',
      failed: 'Não aprovado',
    } as Readonly<Record<string, string>>,
    refundLabel: 'Devolução da Taxa',
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
    sentWhat: (dates: string) =>
      `Você solicitou ${dates}. Os Créditos em Garantia e as datas comprometidas ficam reservados até a resposta.`,
    receivedWhat: (dates: string) => `Um membro solicitou ${dates} da sua Second Home.`,
    closedWhat: (dates: string, reason: string) =>
      `Sua solicitação de ${dates} foi encerrada: ${reason}.`,
    receivedClosedWhat: (dates: string) => `A solicitação de ${dates} foi encerrada.`,
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
    period: (first: string, last: string) => (first === last ? first : `${first} a ${last}`),
  },
};
