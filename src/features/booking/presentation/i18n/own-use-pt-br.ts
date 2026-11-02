/**
 * Textos da reserva de uso próprio na Área do Titular (W12, spec booking; pt-BR, único locale). "Noites" e "Direito de
 * Uso", na terminologia obrigatória do `02` §1 (REQ-100). O Owner não tem Direito de Uso: para ele, "uso próprio"
 * (REQ-037). Quem usa a tela representa uma party (identity §14): "desta Ação" / "do Owner", nunca "sua".
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const BUCKET = { alta: 'Alta/Super Alta', media: 'Média/Baixa', leap: '29/02' } as const;
type Bucket = keyof typeof BUCKET;
type Role = 'owner' | 'co_owner';
const holder = (role: Role) => (role === 'owner' ? 'do Owner' : 'desta Ação');

export const ownUseMessages = {
  outcome: {
    closed: 'As reservas de uso próprio ainda não estão abertas.',
    unavailable: 'Não foi possível confirmar agora. Tente de novo em instantes.',
    permission: 'Você não representa mais esta Second Home. Fale com a Luxtory.',
    stay_length:
      'A permanência precisa ter de 1 a 14 noites seguidas, somando as reservas adjacentes de uso próprio.',
    capacity: 'Uma ou mais noites não estão disponíveis para reserva.',
    conflict: 'Uma ou mais noites já foram reservadas.',
    window: 'A janela desta Ação para estas datas ainda não abriu.',
    balance: 'O saldo do Direito de Uso desta Ação nesta categoria não cobre todas as noites.',
    invalid: 'Confira as datas de entrada e saída.',
    unexpected: 'Algo deu errado. Tente de novo.',
  },
} as const;

/** Rótulos de canal e estado persistidos (spec booking §7): só o que a W12 produz; cada canal futuro, na sua wave. */
export const bookingLabels = {
  channel: (channel: string, role: Role): string | null =>
    channel === 'own_use'
      ? role === 'owner'
        ? 'Uso próprio'
        : 'Uso próprio · Direito de Uso'
      : null,
  state: (state: string): string | null => (state === 'confirmed' ? 'Confirmada' : null),
  /** PD-002: check-in 14h, check-out 10h; a noite da data de saída não é usada. */
  checkinTime: '14h',
  checkoutTime: '10h',
  /** Valor sem rótulo nesta wave (canal ou estado futuro): traço, nunca uma classificação inventada. */
  missing: '—',
} as const;

export const calendarMessages = {
  metadataTitle: 'Reservar uso próprio',
  /** Ativação privilegiada ausente (ADR-0026): calendário e consultas seguem; confirmação não é oferecida. */
  closed: {
    title: 'Novas reservas de uso próprio ainda não estão abertas.',
    body: 'Você pode consultar o calendário, a disponibilidade e as reservas. A confirmação abre quando a Luxtory habilitar as reservas.',
  },
  title: 'Reservar uso próprio',
  backToArea: 'Área do Titular',
  context: (label: string, role: Role) =>
    role === 'owner' ? `${label} · Owner` : `${label} · Co-Owner · Ação que você representa`,
  rights: {
    coOwnerTitle: (years: readonly number[]) => `Direito de Uso desta Ação em ${years.join(' e ')}`,
    ownerTitle: 'Uso próprio',
    available: (left: number, granted: number) =>
      `${left} ${left === 1 ? 'disponível' : 'disponíveis'} de ${granted} noites`,
    windowLabel: (year: number) => `Janela de ${year}`,
    windowOpens: (date: string) => `abre em ${date}`,
    leapLabel: (year: number) => `29/02/${year}`,
    leapValue: '1 noite adicional',
    leapNote: (year: number) =>
      `O 29/02/${year} foi atribuído a esta Ação neste ano bissexto e não desconta do saldo anual de Alta/Super Alta nem de Média/Baixa.`,
    stayNote: (max: number, leap: boolean) =>
      `Até ${max} noites seguidas, contando ${leap ? 'o 29/02 e ' : ''}reservas adjacentes desta Ação.`,
    laterWindow: (year: number, date: string) => `Janela de ${year}: abre em ${date}.`,
    horizon: (date: string) => `Calendário aberto até ${date}.`,
    owner: (date: string) =>
      `O Owner pode reservar qualquer noite livre do calendário, aberto até ${date}, sem limite de noites seguidas.`,
    bucket: (bucket: Bucket) => BUCKET[bucket],
  },
  period: {
    title: 'Escolha o período',
    hint: 'Escolha a entrada e depois a saída no calendário, ou digite as datas. A noite da data de saída não é usada.',
    checkin: 'Entrada',
    checkout: 'Saída',
    noScript: 'O calendário precisa de JavaScript. Você ainda pode digitar as datas acima.',
  },
  grid: {
    previousMonth: 'Mês anterior',
    nextMonth: 'Próximo mês',
    showing: (months: string) => `Mostrando ${months}`,
    windowNote: (year: number, date: string) => `A janela de ${year} desta Ação abre em ${date}.`,
    weekdays: [
      ['dom', 'domingo'],
      ['seg', 'segunda-feira'],
      ['ter', 'terça-feira'],
      ['qua', 'quarta-feira'],
      ['qui', 'quinta-feira'],
      ['sex', 'sexta-feira'],
      ['sáb', 'sábado'],
    ] as const,
  },
  status: {
    available: 'disponível',
    unavailable: 'indisponível',
    mine: (role: Role) => `reserva ${holder(role)}`,
    started: 'já passou',
    outside: 'fora do calendário aberto',
    closed: (year: number, date: string) => `a janela de ${year} desta Ação abre em ${date}`,
    closedUnknown: (year: number) => `a janela de ${year} desta Ação ainda não abriu`,
    leapOther: (year: number) => `não atribuído a esta Ação em ${year}`,
    leapMine: 'noite adicional do Direito de Uso desta Ação',
    canBeCheckout: 'pode ser a data de saída',
    notCheckout: 'não pode ser a saída desta entrada',
    checkinSelected: 'entrada selecionada',
    checkoutSelected: 'saída selecionada',
    nightSelected: 'noite do período selecionado',
  },
  legend: {
    label: 'Legenda do calendário',
    available: 'Disponível',
    unavailable: 'Noite indisponível',
    mine: (role: Role) => `Reserva ${holder(role)}`,
    selected: 'Selecionado',
    season: 'Alta/Super Alta',
    leap: '29/02: noite adicional',
  },
  selection: {
    checkinChosen: (date: string, limit: string | null) =>
      `Entrada em ${date}. Agora escolha a saída${limit === null ? '' : `, até ${limit}`}.`,
    chosen: (checkin: string, checkout: string, nights: number) =>
      `Entrada ${checkin}, saída ${checkout}: ${plural(nights, 'noite', 'noites')}.`,
    limit: (checkin: string, limit: string, reason: string) =>
      `Com entrada em ${checkin}, a saída pode ser até ${limit}: ${reason}.`,
    reasonMax: (max: number) => `o máximo é de ${max} noites seguidas`,
    reasonMine: (date: string, role: Role) => `a noite de ${date} já é reserva ${holder(role)}`,
    reasonClosed: (year: number) => `a janela de ${year} ainda não abriu`,
    reasonLeap: (year: number) => `o 29/02 de ${year} não está atribuído a esta Ação`,
    reasonOutside: 'o calendário aberto termina aí',
    reasonUnavailable: (date: string) => `a noite de ${date} está indisponível`,
    dayStatus: (date: string, status: string) => `${date}: ${status}.`,
    leapOtherTap: (date: string, status: string) => `${date}: ${status}; pode ser a data de saída.`,
    restart: (date: string) => `Usar ${date} como entrada`,
    clear: 'Limpar datas',
    booking: (parts: readonly string[]) => `${parts.join(' · ')}.`,
    bookingHolder: (role: Role) => `Reserva ${holder(role)}`,
    bookingPeriod: (checkin: string, checkout: string, nights: number) =>
      `entrada ${checkin}, saída ${checkout} (${plural(nights, 'noite', 'noites')})`,
  },
  summary: {
    title: 'Resumo',
    idle: 'Escolha a entrada e a saída.',
    needCheckout: 'Escolha a saída para ver a prévia.',
    needCheckin: 'Escolha também a entrada.',
    checking: 'Verificando o período…',
    ok: 'Período disponível.',
    okClosed: 'Noites livres. Novas reservas ainda não estão abertas.',
    closedHint:
      'A confirmação abre quando a Luxtory habilitar as reservas de uso próprio. Você pode consultar o calendário e as reservas.',
    notOk: 'Não é possível reservar este período.',
    failed: 'Não foi possível verificar o período agora.',
    failedDetail: 'Suas datas foram mantidas. Tente de novo em instantes.',
    retry: 'Verificar de novo',
    forbidden: 'Você não representa mais esta Second Home. Fale com a Luxtory.',
    signIn: 'Sua sessão terminou. Entre de novo para continuar.',
    period: 'Período',
    periodValue: (checkin: string, checkout: string) =>
      `${checkin}, ${bookingLabels.checkinTime} → ${checkout}, ${bookingLabels.checkoutTime}`,
    nights: 'Noites',
    nightsValue: (count: number, list: string) => `${count} · ${list}`,
    usageLabel: (bucket: Bucket, year: number) =>
      bucket === 'leap' ? `29/02/${year} · noite adicional` : `${BUCKET[bucket]} ${year}`,
    usageValue: (bucket: Bucket, nights: number, after: number, granted: number | null) =>
      bucket === 'leap'
        ? 'não desconta do saldo anual'
        : `usa ${plural(nights, 'noite', 'noites')}${granted === null ? '' : ` · restarão ${after} de ${granted}`}`,
    stay: 'Noites seguidas',
    stayValue: (stay: number, max: number) =>
      `${stay} de até ${max}, somando a reserva adjacente desta Ação`,
    note: 'Nada fica reservado até você confirmar. A disponibilidade é conferida de novo nesse momento.',
    noScript: 'A prévia e a confirmação precisam de JavaScript.',
    confirm: 'Confirmar reserva',
  },
  issues: {
    order: 'A saída precisa ser depois da entrada.',
    outside: (date: string) => `O calendário está aberto até ${date}.`,
    started: (dates: string, count: number, today: string) =>
      `${dates} já ${count === 1 ? 'passou' : 'passaram'}. Escolha uma entrada a partir de ${today}.`,
    ownBooking: (dates: string, role: Role) => `Já há reserva ${holder(role)} em ${dates}.`,
    unavailable: (dates: string, count: number) =>
      `${dates} ${count === 1 ? 'está indisponível' : 'estão indisponíveis'}.`,
    window: (year: number, date: string | null) =>
      date === null
        ? `A janela de ${year} desta Ação ainda não abriu; até lá, as noites de ${year} não podem ser reservadas.`
        : `A janela de ${year} desta Ação abre em ${date}; até lá, as noites de ${year} não podem ser reservadas.`,
    leap: (year: number) =>
      `O 29/02/${year} não está atribuído a esta Ação neste ano bissexto. Ele pode ser a data de saída, mas não uma noite da reserva.`,
    balance: (bucket: Bucket, year: number, needed: number, remaining: number) =>
      `O período usa ${plural(needed, 'noite', 'noites')} de ${BUCKET[bucket]} de ${year}, e esta Ação tem ${remaining} ${remaining === 1 ? 'disponível' : 'disponíveis'}. Faltam ${plural(needed - remaining, 'noite', 'noites')} nessa categoria.`,
    stay: (stay: number, max: number, adjacent: boolean) =>
      adjacent
        ? `Somando a reserva adjacente desta Ação, seriam ${stay} noites seguidas; o máximo é ${max}.`
        : `Seriam ${stay} noites seguidas; o máximo é ${max}.`,
    suggestion: (checkin: string, limit: string) =>
      `Com entrada em ${checkin}, a saída pode ser até ${limit}.`,
    otherCheckin: 'Escolha outra data de entrada.',
  },
  dates: {
    and: (items: readonly string[]) =>
      items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`,
    range: (from: string, to: string) => `de ${from} a ${to}`,
  },
} as const;

export const bookingsMessages = {
  metadataTitle: 'Reservas',
  title: 'Reservas',
  lead: 'Reservas das Ações e Second Homes que você representa.',
  empty: 'Ainda não há reservas.',
  backToArea: 'Área do Titular',
  type: 'Tipo',
  period: 'Período',
  nights: 'Noites',
  state: 'Situação',
  confirmedAt: 'Confirmada em',
  nightsValue: (n: number) => plural(n, 'noite', 'noites'),
  periodValue: (checkin: string, checkout: string) =>
    `${checkin}, ${bookingLabels.checkinTime} → ${checkout}, ${bookingLabels.checkoutTime}`,
  detailTitle: 'Reserva',
  calendarLink: 'Ver calendário',
  bookAction: 'Reservar uso próprio',
  areaSection: 'Uso próprio',
  areaLead: 'Calendário e reservas das Second Homes que você representa.',
  bookingsLink: 'Reservas',
  notificationsLink: 'Notificações',
  linkSeparator: ' · ',
  role: 'Papel',
  roleLabel: (role: Role) => (role === 'owner' ? 'Owner' : 'Co-Owner'),
} as const;

export const notificationMessages = {
  metadataTitle: 'Notificações',
  title: 'Notificações',
  lead: 'Avisos das reservas das pessoas e empresas que você representa.',
  empty: 'Nenhuma notificação.',
  backToArea: 'Área do Titular',
  confirmed: (label: string, checkin: string, checkout: string, nights: number) =>
    `Reserva confirmada em ${label}: entrada ${checkin}, saída ${checkout} (${plural(nights, 'noite', 'noites')}).`,
  unknown: 'Aviso da Luxtory.',
  receivedAt: 'Recebida em',
  view: 'Ver reserva',
} as const;
