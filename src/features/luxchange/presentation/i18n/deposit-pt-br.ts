/**
 * Textos do depósito Luxchange (W20; spec luxchange §5.4). Terminologia do `02` §1: Second Home, Direito de Uso,
 * Créditos (unidade interna, nunca dinheiro — BR-190); nenhum valor em reais (REQ-100); nenhuma promessa de retorno
 * (REQ-101). A cessão é vinculante depois da originação (BR-171).
 */
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export const depositMessages = {
  metadataTitle: 'Depositar datas no Luxchange',
  resultMetadataTitle: 'Depósito concluído',
  title: 'Depositar datas no Luxchange',
  lead: 'Ceda datas da sua Second Home ao Inventário Luxtory e receba Créditos Luxchange pela cessão.',
  backToArea: 'Área do Titular',
  steps: {
    home: 'Second Home',
    dates: 'Datas',
    summary: 'Resumo',
    review: 'Revisão',
  },
  chooser: {
    heading: 'Escolha a Second Home',
    hint: 'O depósito segue o seu vínculo com cada Second Home.',
    none: 'Você ainda não representa uma Second Home com datas que possam ser depositadas.',
    choose: (label: string) => `Depositar datas de ${label}`,
    role: 'Vínculo',
    roles: { owner: 'Owner', co_owner: 'Co-Owner' } as const,
    membership: 'Membership',
    membershipStates: {
      active: 'Vigente',
      inactive: 'Sem Membership vigente',
    },
    change: 'Trocar de Second Home',
  },
  closed: {
    title: 'O depósito no Luxchange ainda não está disponível.',
    body: 'Você pode consultar as datas, mas a confirmação será liberada pela Luxtory.',
  },
  membership: {
    title: 'O depósito exige Membership vigente.',
    body: 'O uso próprio da sua Second Home continua disponível normalmente.',
  },
  calendar: {
    headingOwner: 'Escolha as datas',
    headingCoOwner: 'Datas do seu Direito de Uso',
    hintOwner:
      'Toque nas noites que deseja ceder — consecutivas ou não. As noites com Créditos podem ser depositadas; nas demais, o toque explica o motivo.',
    hintCoOwner:
      'Toque numa reserva sua para selecioná-la. Cada reserva é cedida inteira, com todas as suas noites.',
    caption: 'Calendário do depósito',
    jumpMonth: 'Mês',
    jumpYear: 'Exercício',
    previous: 'Mês anterior',
    next: 'Próximo mês',
    weekdays: [
      ['D', 'Domingo'],
      ['S', 'Segunda-feira'],
      ['T', 'Terça-feira'],
      ['Q', 'Quarta-feira'],
      ['Q', 'Quinta-feira'],
      ['S', 'Sexta-feira'],
      ['S', 'Sábado'],
    ] as const,
    empty: 'Não há datas futuras no calendário desta Second Home.',
    legend: 'Legenda',
    legendItems: {
      selected: 'Selecionada',
      unavailable: 'Indisponível',
      super_alta: 'Super Alta (Carnaval)',
      alta: 'Alta',
      media: 'Média/Baixa',
    },
    nightCredits: (date: string, credits: string) => `${date}: ${credits} Créditos.`,
    selectedCount: (nights: number) =>
      nights === 0
        ? 'Nenhuma noite selecionada.'
        : `${nights} ${plural(nights, 'noite selecionada', 'noites selecionadas')}.`,
    clear: 'Limpar seleção',
    season: {
      super_alta: 'temporada Super Alta (Carnaval)',
      alta: 'temporada Alta',
      media: 'temporada Média/Baixa',
    } as const,
    status: {
      eligible: 'pode ser depositada',
      selected: 'selecionada',
      ceded: 'já depositada no Luxchange',
      notice: 'menos de 14 dias de antecedência',
      booked: 'reservada para seu uso — cancele a reserva antes de depositar',
      not_reserved: 'não reservada — reserve no seu calendário de uso antes de depositar',
      no_reference: 'ainda sem referência para o depósito',
      unavailable: 'indisponível',
      started: 'data passada',
    } as const,
    explain: (date: string, reason: string) => `${date}: ${reason}.`,
    booking: (from: string, to: string, nights: number) =>
      `Reserva de ${from} a ${to} (${nights} ${plural(nights, 'noite', 'noites')}).`,
  },
  credits: (value: string) => `${value} Créditos`,
  creditsShort: (value: string) => value,
  summary: {
    heading: 'Resumo',
    empty: 'Selecione as datas para ver os Créditos.',
    dates: 'Datas',
    nights: 'Noites',
    nightsValue: (nights: number) => `${nights} ${plural(nights, 'noite', 'noites')}`,
    receive: 'Créditos a receber',
    balance: 'Saldo atual',
    potential: 'Saldo potencial após o depósito',
    potentialNote:
      'Soma informativa: os novos Créditos só entram na Carteira depois da confirmação.',
    validity: 'Validade dos novos Créditos',
    validityValue: (months: number) =>
      `${months} ${plural(months, 'mês', 'meses')} a partir da confirmação`,
    validityMissing: 'Ainda não publicada',
    review: 'Revisar depósito',
    reviewing: 'Calculando…',
  },
  review: {
    heading: 'Revise antes de confirmar',
    what: 'Você vai ceder',
    nightLine: (date: string, credits: string) => `${date} · ${credits} Créditos`,
    get: 'Você vai receber',
    consequences: 'O que acontece',
    ownerEffect:
      'As datas cedidas passam ao Inventário Luxtory e deixam de estar disponíveis para o seu uso.',
    coOwnerEffect:
      'As reservas cedidas são encerradas e as datas passam ao Inventário Luxtory. Os dias continuam consumidos do seu Direito de Uso: a contraprestação são os Créditos.',
    binding:
      'Depois da confirmação, a cessão é vinculante: as datas não voltam automaticamente e os Créditos têm validade própria.',
    noFee: 'O depósito não cobra taxa.',
    accept: 'Entendo que a cessão é vinculante depois da confirmação.',
    confirm: 'Confirmar depósito',
    back: 'Voltar e alterar datas',
    stale:
      'Os Créditos de uma ou mais datas, o total ou a validade mudaram. Revise os valores atualizados abaixo antes de confirmar.',
    refresh: 'Revisar valores atualizados',
  },
  outcome: {
    ERR_PERMISSION: 'Você não representa mais esta Second Home. Atualize a página.',
    ERR_MEMBERSHIP_INELIGIBLE: 'O depósito exige Membership vigente.',
    ERR_CAPACITY_UNAVAILABLE:
      'Uma ou mais datas não estão mais disponíveis para depósito. Atualize o calendário e escolha de novo.',
    ERR_MIN_NOTICE: 'Uma ou mais datas estão a menos de 14 dias do check-in.',
    ERR_PRL_MISSING: 'Uma ou mais datas ainda não têm referência para o depósito.',
    ERR_PARAMETER_MISSING: 'O depósito ainda não está configurado pela Luxtory.',
    ERR_STATE_TRANSITION: 'Uma das reservas mudou de situação. Atualize o calendário.',
    ERR_DEPOSIT_TERMS_CHANGED:
      'Os Créditos de uma ou mais datas, o total ou a validade mudaram desde a revisão. Revise os valores atualizados antes de confirmar.',
    ERR_IDEMPOTENCY_CONFLICT:
      'Esta confirmação já foi usada para outro pedido. Revise o depósito de novo.',
    ERR_VALIDATION: 'Não foi possível ler as datas escolhidas. Escolha de novo.',
    not_activated: 'O depósito no Luxchange ainda não está disponível.',
    unavailable:
      'Não foi possível concluir agora. Nada foi depositado; tente novamente em instantes.',
    unauthenticated: 'Sua sessão terminou. Entre de novo para continuar.',
  } as const,
  result: {
    title: 'Depósito concluído',
    lead: 'As datas foram cedidas ao Inventário Luxtory e os Créditos já estão na sua Carteira.',
    home: 'Second Home',
    dates: 'Datas cedidas',
    credits: 'Créditos originados',
    validity: 'Válidos até',
    reference: 'Referência do depósito',
    wallet: 'Abrir a Carteira',
    another: 'Fazer outro depósito',
    binding: 'A cessão é vinculante: as datas não voltam automaticamente.',
  },
  area: {
    heading: 'Luxchange',
    lead: 'Deposite datas da sua Second Home e receba Créditos pela cessão.',
    link: 'Depositar datas',
  },
  notification: {
    title: 'Depósito concluído',
    what: (nights: number, credits: string, first: string, last: string) =>
      nights === 1
        ? `${credits} Créditos pela noite de ${first}.`
        : `${credits} Créditos por ${nights} noites, de ${first} a ${last}.`,
    validity: 'Válidos até',
    reference: 'Referência',
  },
} as const;

export type DepositOutcomeKey = keyof typeof depositMessages.outcome;
