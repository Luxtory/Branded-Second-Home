/**
 * Textos do ciclo da reserva na Área do Titular (W13 E4b; spec booking §10.15; referência visual E4a v2.1). pt-BR, único
 * locale. Terminologia obrigatória (REQ-100): "noites", "Direito de Uso" e "desta Ação" no Co-Owner; "calendário do
 * Owner" no Owner, sem prazo de 15 dias nem categorias. "Dentro/fora do prazo" para a classificação (decisão do
 * fundador). Nada aqui promete restituição, Crédito ou compensação (PD-010, REQ-101).
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const nightsText = (n: number) => plural(n, 'noite', 'noites');
/** "As 4 noites" / "A noite" (sujeito da frase). */
const theNights = (n: number) => (n === 1 ? 'A noite' : `As ${n} noites`);
const theNightsLower = (n: number) => (n === 1 ? 'a noite' : `as ${n} noites`);

export type DisplayStateKey =
  | 'confirmed'
  | 'in_use'
  | 'completed'
  | 'cancelled_timely'
  | 'cancelled_late'
  | 'cancelled'
  | 'ceded'
  | 'no_show'
  | 'operational_exception'
  | 'unauthorized_review';

export const lifecycleLabels = {
  display: {
    confirmed: 'Confirmada',
    in_use: 'Em uso',
    completed: 'Concluída',
    cancelled_timely: 'Cancelada dentro do prazo',
    cancelled_late: 'Cancelada fora do prazo',
    cancelled: 'Cancelada',
    ceded: 'Cedida ao Luxchange',
    no_show: 'No-show',
    operational_exception: 'Em exceção operacional',
    unauthorized_review: 'Em apuração',
  } satisfies Record<DisplayStateKey, string>,
  sections: {
    in_progress: 'Em andamento',
    attention: 'Em exceção ou em apuração',
    upcoming: 'Próximas',
    history: 'Histórico',
  },
  reasons: {
    emergency_maintenance: 'manutenção emergencial',
    security: 'segurança',
    casualty: 'sinistro',
    fortuitous_event: 'caso fortuito',
    force_majeure: 'força maior',
  } as Record<string, string>,
  buckets: { alta: 'Alta/Super Alta', media: 'Média/Baixa', leap: '29/02' } as Record<
    string,
    string
  >,
  local: '(horário da Second Home)',
} as const;

export const bookingListMessages = {
  type: 'Tipo',
  period: 'Período',
  state: 'Situação',
  periodValue: (range: string, nights: number) => `${range} · ${nightsText(nights)}`,
} as const;

export const bookingDetailMessages = {
  stay: 'Estadia',
  checkin: 'Entrada',
  checkout: 'Saída',
  nights: 'Noites',
  checkinValue: (date: string) => `${date}, a partir das 14h`,
  checkoutValue: (date: string) => `${date}, até 10h`,
  nightsValue: (n: number, parts: readonly string[]) => [String(n), ...parts].join(' · '),
  cancellation: 'Cancelamento',
  timelyCoOwner: (deadline: string) =>
    `Dentro do prazo até ${deadline} ${lifecycleLabels.local}: as noites voltam ao Direito de Uso desta Ação. Depois disso, ainda é possível cancelar, mas as noites não voltam ao saldo.`,
  lateCoOwner: (deadline: string) =>
    `O prazo de 15 dias terminou ${deadline} ${lifecycleLabels.local}. Ainda é possível cancelar, mas as noites que não começaram não voltam ao Direito de Uso desta Ação.`,
  owner:
    'Se a reserva for cancelada, as noites que ainda não começaram voltam ao calendário do Owner.',
  viewConditions: 'Ver condições de cancelamento',
  nextStep: 'Próximo passo',
  suspendedTitle: 'Cancelamento suspenso durante a apuração',
  suspendedBody: (deadline: string) =>
    `A Luxtory está verificando se esta reserva foi feita com autorização. Como o prazo de 15 dias desta Ação terminou ${deadline} ${lifecycleLabels.local}, o cancelamento fica suspenso até a apuração terminar.`,
  suspendedNext:
    'Você recebe um aviso em Notificações quando a apuração terminar. A reserva mostrará então o que pode ser feito.',
  viewNotifications: 'Ver notificações',
  more: 'Mais detalhes',
  type: 'Tipo',
  stake: 'Ação',
  stakeValue: 'Ação que você representa',
  confirmedAt: 'Confirmada em',
  cancelledAt: 'Cancelada em',
  classification: 'Classificação',
  classTimely: 'Dentro do prazo',
  classLate: 'Fora do prazo',
  releasedNights: 'Noites liberadas',
  cession: 'Cessão ao Luxchange',
  cededAt: 'Cedida em',
  cededNights: 'Noites cedidas',
  cededNote:
    'As noites passaram ao Inventário Luxtory pelo depósito no Luxchange e continuam consumidas do Direito de Uso desta Ação: a contraprestação são os Créditos do depósito.',
  cededLink: 'Ver o depósito',
  cancelledTitle: 'Reserva cancelada',
  cancelledTimely: (n: number) =>
    `${theNights(n)} ${n === 1 ? 'voltou' : 'voltaram'} ao Direito de Uso desta Ação. O aviso também está em Notificações.`,
  cancelledLate: (n: number) =>
    `${theNights(n)} ${n === 1 ? 'deixou' : 'deixaram'} a reserva e não ${n === 1 ? 'voltou' : 'voltaram'} ao Direito de Uso desta Ação. O aviso também está em Notificações.`,
  cancelledOwner: (n: number) =>
    `${theNights(n)} ${n === 1 ? 'voltou' : 'voltaram'} ao calendário do Owner. O aviso também está em Notificações.`,
  changedTitle: 'Nada foi cancelado',
  changedBody: 'A situação da reserva mudou enquanto você revisava. Confira abaixo.',
} as const;

/** Exceção e apuração vistas pelo Titular (PD-010, REQ-084): sem sugerir restituição, disponibilidade ou compensação. */
export const exceptionMessages = {
  operationalTitle: (date: string, reason: string) =>
    `Em exceção operacional desde ${date}: ${reason}`,
  operationalBody:
    'O cancelamento segue as regras normais do prazo de 15 dias; a exceção não muda o que acontece com as noites. Se você cancelar, a exceção é encerrada.',
  operationalBodyOwner:
    'O cancelamento segue as regras normais do uso próprio; a exceção não muda o que acontece com as noites. Se você cancelar, a exceção é encerrada.',
  reviewTitle: (date: string) => `Em apuração desde ${date}`,
  reviewBodyCoOwner:
    'A Luxtory está verificando se esta reserva foi feita com autorização. Dentro do prazo de 15 dias, você pode cancelar, e o cancelamento encerra a apuração. Depois do prazo, o cancelamento fica suspenso até a apuração terminar.',
  reviewBodyOwner:
    'A Luxtory está verificando se esta reserva foi feita com autorização. O Owner pode cancelar a qualquer momento; o cancelamento encerra a apuração e alcança só as noites que ainda não começaram.',
} as const;

const verdictLate = (n: number) =>
  n === 1
    ? 'A noite não volta ao Direito de Uso desta Ação'
    : `Nenhuma das ${n} noites volta ao Direito de Uso desta Ação`;

export const cancellationMessages = {
  metadataTitle: 'Cancelar reserva',
  title: 'Cancelar reserva',
  back: 'Reserva',
  lead: (home: string, range: string, nights: number, state: string | null) =>
    [state, home, range, nightsText(nights)].filter((part) => part !== null).join(' · '),
  verdictTimely: (n: number) =>
    `${theNights(n)} ${n === 1 ? 'volta' : 'voltam'} ao Direito de Uso desta Ação`,
  verdictLate,
  verdictLateStarted: (n: number) =>
    n === 1
      ? 'A noite cancelada não volta ao Direito de Uso desta Ação'
      : `Nenhuma das ${n} noites canceladas volta ao Direito de Uso desta Ação`,
  verdictOwner: (n: number) =>
    `${theNights(n)} ${n === 1 ? 'volta' : 'voltam'} ao calendário do Owner`,
  verdictOwnerStarted: (n: number) =>
    n === 1
      ? 'A noite que ainda não começou volta ao calendário do Owner'
      : `As ${n} noites que ainda não começaram voltam ao calendário do Owner`,
  timelyReason: (deadline: string) =>
    `Você está dentro do prazo de 15 dias, que termina ${deadline} ${lifecycleLabels.local}.`,
  lateTitle: (deadline: string) => `O prazo de 15 dias terminou ${deadline}`,
  lateBody: (n: number) =>
    `Se você cancelar, ${theNightsLower(n)} ${n === 1 ? 'deixa' : 'deixam'} a reserva e o consumo do Direito de Uso desta Ação é mantido. Isso não gera Créditos nem remuneração.`,
  startedTitle: 'A estadia já começou',
  startedNights: (dates: string, n: number) =>
    `${n === 1 ? 'A primeira noite' : `As ${n} primeiras noites`} (${dates}) já ${n === 1 ? 'começou' : 'começaram'} e não ${n === 1 ? 'muda' : 'mudam'}.`,
  today: (date: string) => `A noite de hoje (${date}) começa às 14h ${lifecycleLabels.local}.`,
  startedLate: (n: number, date: string) =>
    `Se você cancelar, ${theNightsLower(n)} a partir de ${date} ${n === 1 ? 'deixa' : 'deixam'} a reserva e o consumo do Direito de Uso desta Ação é mantido.`,
  ownerReason: 'Depois do cancelamento, elas ficam livres para uma nova reserva do Owner.',
  rowsTitle: 'Noites e saldo do Direito de Uso desta Ação',
  rowsTitleOwner: 'Noites',
  rowCancelled: 'Noites canceladas',
  rowStarted: 'Já começaram',
  rowCancelledStarted: 'Canceladas',
  rowReturning: 'Voltam ao saldo',
  startedValue: (n: number, dates: string) => `${n} · ${dates} · não mudam`,
  countValue: (n: number, dates: string) => `${n} · ${dates}`,
  returningValue: (returning: number, total: number) => `${returning} de ${total}`,
  balanceLabel: (bucket: string, year: number) =>
    bucket === '29/02' ? `29/02/${year}` : `${bucket} ${year}`,
  balanceValue: (after: number, granted: number, returning: number) =>
    returning > 0
      ? `${after} de ${granted} disponíveis (+${returning})`
      : `${after} de ${granted} disponíveis (sem mudança)`,
  nightByNight: (n: number) => `Ver noite a noite (${n})`,
  nightReturns: 'volta ao Direito de Uso desta Ação',
  nightLeaves: 'deixa a reserva · não volta ao saldo',
  nightStarted: 'já começou · não muda',
  nightOwner: 'volta ao calendário do Owner',
  statementAll: 'Ao confirmar, a reserva inteira é cancelada. Não é possível desfazer.',
  statementLate:
    'Ao confirmar, a reserva inteira é cancelada e nenhuma noite volta ao saldo. Não é possível desfazer.',
  statementFrom: (date: string) =>
    `Ao confirmar, a reserva é cancelada a partir da noite de ${date}. Não é possível desfazer.`,
  statementClosesException:
    'Ao confirmar, a reserva inteira é cancelada e a exceção é encerrada. Não é possível desfazer.',
  statementClosesReview:
    'Ao confirmar, a reserva inteira é cancelada e a apuração é encerrada. Não é possível desfazer.',
  confirm: 'Confirmar cancelamento',
  keep: 'Manter reserva',
  pending: 'Cancelando…',
  pendingStatus: 'Cancelando a reserva…',
  timelyHint:
    'O prazo é conferido de novo no instante da confirmação. Se ele tiver terminado, nada é cancelado e mostramos as novas condições.',
  reviewTimelyHint:
    'O prazo é conferido de novo no instante da confirmação. Se ele tiver terminado, nada é cancelado e o cancelamento fica suspenso até a apuração terminar.',
  startedHint:
    'Se você confirmar depois das 14h, a noite de hoje já não será cancelada e mostramos as novas condições.',
  closedTitle: 'O cancelamento pelo site ainda não está aberto',
  closedBody:
    'A prévia abaixo mostra o que aconteceria agora. Nada pode ser confirmado e nada foi alterado na reserva.',
  nothingLeftTitle: 'Todas as noites desta reserva já começaram',
  nothingLeftBody: 'Não há noites a cancelar.',
  mismatchTitle: 'A confirmação não corresponde às condições atuais. Nada foi cancelado.',
  mismatchBody: 'Revise as condições atuais antes de decidir.',
  currentTerms: 'Condições atuais',
  termsDeadline: 'Prazo de 15 dias',
  deadlineEnded: (deadline: string) => `Terminou ${deadline} ${lifecycleLabels.local}`,
  deadlineEnds: (deadline: string) => `Termina ${deadline} ${lifecycleLabels.local}`,
  termsFrom: 'Cancelamento',
  fromNight: (date: string) => `A partir da noite de ${date}`,
  reviewCurrent: 'Revisar as condições atuais',
  aside: 'A reserva',
  asideHome: 'Second Home',
  asideHomeCoOwner: (home: string) => `${home} · Ação que você representa`,
  asideHomeOwner: (home: string) => `${home} · Owner`,
  asideCheckin: (date: string) => `${date}, 14h`,
  asideCheckout: (date: string) => `${date}, 10h`,
  outcome: {
    closed: 'O cancelamento pelo site ainda não está aberto. Nada foi alterado.',
    unavailableTitle: 'Não foi possível confirmar agora',
    unavailable:
      'Tente de novo em instantes. Se o cancelamento já tiver sido registrado, a reserva mostra o resultado; ele nunca é feito duas vezes.',
    permission: 'Você não representa mais esta Second Home. Fale com a Luxtory.',
    unexpected: 'Algo deu errado. Nada foi alterado. Tente de novo.',
  },
} as const;

/** Notificações do ciclo (REQ-097; 19 variações, spec booking §10.15): título curto + "O que mudou". */
export const lifecycleNotificationMessages = {
  home: 'Second Home',
  whatChanged: 'O que mudou',
  returned: 'Voltaram ao saldo',
  corrected: 'Consumo corrigido',
  confirmedTitle: 'Reserva confirmada',
  confirmed: (checkin: string, checkout: string, n: number) =>
    `Entrada em ${checkin} e saída em ${checkout}: ${nightsText(n)}.`,
  cancelledTitle: 'Reserva cancelada',
  cancelledByLuxtoryTitle: 'Reserva cancelada pela Luxtory',
  timely: 'Cancelada dentro do prazo.',
  late: 'Cancelada fora do prazo.',
  exceptionTimely: 'Cancelada por exceção operacional, dentro do prazo.',
  exceptionLate: 'Cancelada por exceção operacional, fora do prazo.',
  exceptionOwner: 'Cancelada por exceção operacional.',
  returnedToBalance: (n: number, date: string) =>
    `${theNights(n)} a partir de ${date} ${n === 1 ? 'voltou' : 'voltaram'} ao Direito de Uso desta Ação.`,
  leftReservation: (n: number, date: string) =>
    `${theNights(n)} a partir de ${date} ${n === 1 ? 'deixou' : 'deixaram'} a reserva e não ${n === 1 ? 'voltou' : 'voltaram'} ao Direito de Uso desta Ação.`,
  returnedToOwner: (n: number, date: string) =>
    `${theNights(n)} a partir de ${date} ${n === 1 ? 'voltou' : 'voltaram'} ao calendário do Owner.`,
  exceptionClosed: 'A exceção foi encerrada com o cancelamento.',
  reviewClosed: 'A apuração foi encerrada com o cancelamento.',
  noShowTitle: 'No-show registrado',
  noShowNone: 'Nenhuma noite futura foi afetada.',
  openedOperationalTitle: 'Reserva em exceção operacional',
  openedReason: (reason: string) => `Motivo: ${reason}.`,
  openedDeadline: (deadline: string) =>
    `O cancelamento dentro do prazo vai até ${deadline} ${lifecycleLabels.local}.`,
  openedReviewTitle: 'Reserva em apuração',
  openedReview:
    'A Luxtory está verificando se a reserva foi feita com autorização. Veja na reserva o que pode ser feito enquanto isso.',
  resolvedOperationalTitle: 'Exceção encerrada',
  resolvedReviewTitle: 'Apuração encerrada',
  resolvedReviewPrefix: 'Encerrada sem invalidação.',
  resolvedConfirmed: 'A reserva segue confirmada.',
  resolvedCompleted: 'A reserva consta como concluída.',
  invalidatedTitle: 'Reserva invalidada',
  invalidatedPrefix: 'Após a apuração, a reserva foi invalidada.',
  invalidatedBalance: (n: number, date: string) =>
    `${theNights(n)} a partir de ${date} ${n === 1 ? 'voltou' : 'voltaram'} ao saldo do Direito de Uso desta Ação.`,
} as const;
