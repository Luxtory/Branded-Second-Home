/**
 * Textos do Admin do ciclo da reserva (W13 E4b; spec booking §10.15; referência visual E4a v2.1). Sem "party" no texto
 * visível: "o Titular" é quem representa a reserva (os identificadores técnicos ficam só no código). Nenhum texto
 * promete restituição, Crédito ou compensação (PD-010, BR-284).
 */
const nights = (n: number) => `${n} ${n === 1 ? 'noite' : 'noites'}`;

export const adminBookingMessages = {
  nav: 'Reservas',
  metadataTitle: 'Reservas',
  title: 'Reservas',
  lead: 'Reservas de uso próprio das Second Homes. Cada ação mostra a consequência antes; as que liberam noites ou mudam a custódia exigem autorização independente.',
  audit: 'Esta consulta é registrada na auditoria. Horários no fuso de cada Second Home.',
  auditOne: (timezone: string) =>
    `Esta consulta é registrada na auditoria. Horários no fuso da Second Home: ${timezone}.`,
  filterLabel: 'Second Home',
  filterAll: 'Todas',
  filterSubmit: 'Filtrar',
  filterName: 'Filtrar reservas',
  empty: 'Nenhuma reserva ativa nesta seleção.',
  sections: {
    attendance: 'A verificar comparecimento',
    exceptions: 'Em exceção e em apuração',
    recoverable: 'Capacidade futura recuperável',
    upcoming: 'Próximas',
  },
  sectionHints: {
    attendance:
      'Entre o 1º check-in e o check-out. O no-show só pode ser declarado nessa janela e exige autorização independente.',
    exceptions:
      'Prazo de referência: 1º check-in. Depois do check-out, a resolução só pode ser Concluída ou Cancelada.',
    recoverable:
      'Noites futuras com Direito de Uso perdido (cancelamento fora do prazo ou no-show). A recuperação exige autorização independente.',
    upcoming: null,
  } as Record<string, string | null>,
  modality: { owner: 'Owner', co_owner: 'Co-Owner' },
  state: {
    confirmed: 'Confirmada',
    in_use: 'Em uso',
    completed: 'Concluída',
    cancelled: 'Cancelada',
    no_show: 'No-show',
    in_exception: 'Em exceção',
  } as Record<string, string>,
  exceptionState: { operational: 'Em exceção operacional', unauthorized_booking: 'Em apuração' },
  reasons: {
    emergency_maintenance: 'manutenção emergencial',
    security: 'segurança',
    casualty: 'sinistro',
    fortuitous_event: 'caso fortuito',
    force_majeure: 'força maior',
  } as Record<string, string>,
  meta: {
    period: 'Período',
    state: 'Situação',
    deadline: 'Prazo',
    firstCheckin: '1º check-in',
    openedAt: 'Aberta em',
    noShowAuthorization: 'Autorização de no-show',
    none: 'nenhuma',
    validUntil: (at: string) => `válida até ${at}`,
    checkout: (at: string) => `até ${at} (check-out)`,
    periodValue: (range: string, n: number) => `${range} · ${nights(n)}`,
  },
  lead2: (state: string, modality: string, range: string, n: number) =>
    `${state} · ${modality} · ${range} · ${nights(n)}`,
  detail: {
    summary: 'Resumo',
    reason: 'Motivo da exceção',
    incident: 'Referência do incidente',
    nights: 'Noites',
    nightsValue: (total: number, unstarted: number) =>
      `${nights(total)}, ${unstarted === 0 ? 'nenhuma por começar' : `${unstarted} por começar`}`,
    deadline: 'Prazo de 15 dias',
    authorization: 'Autorização',
    unavailableNow: 'Indisponíveis agora',
    unavailableReason: 'Motivo',
    category: 'Categoria',
    custody: 'Custódia',
    occupancy: 'Ocupação',
    start: 'Início',
    authorizations: 'Autorizações',
    noAuthorizations: 'Nenhuma autorização para esta reserva.',
    requestedAt: 'Solicitada em',
    request: 'Solicitação',
    status: 'Situação',
    history: 'Histórico',
    when: 'Quando',
    by: 'Por',
    basis: 'Base registrada',
    confirmed: 'Reserva confirmada',
    closedTitle: 'As ações do ciclo da reserva ainda não estão abertas',
    closedBody:
      'Consultas continuam disponíveis. Cancelamento, no-show, exceção, resolução, recuperação e correção não podem ser executados agora.',
  },
  acts: {
    resolve: 'Resolver exceção',
    open_exception: 'Abrir exceção',
    no_show: 'Declarar no-show',
    invalidation: 'Invalidar a reserva',
    recovery: 'Recuperar capacidade futura',
    request: 'Solicitar autorização',
  } as Record<string, string>,
  unavailability: {
    lifecycle_closed: 'ações do ciclo da reserva fechadas',
    not_in_exception: 'a reserva não está em exceção',
    exception_open: 'a reserva está em exceção; resolva a exceção antes',
    after_checkout: 'o check-out já passou',
    state: 'a reserva não está confirmada nem em uso',
    no_show_window: 'o no-show só cabe entre o 1º check-in e o check-out',
    not_unauthorized_co_owner: 'só na apuração de reserva de Co-Owner',
    nothing_unstarted: 'não há noite por começar',
    nothing_recoverable: 'nenhuma noite futura com Direito de Uso perdido',
    nothing_to_request: 'nenhuma autorização a solicitar agora',
  } as Record<string, string>,
  custody: {
    reserved: 'Direito de Uso reservado',
    forfeited: 'Direito de Uso perdido (não reservável)',
    delinquency: 'Direito de Uso (inadimplência)',
    spe_pool: 'Capacidade coletiva da SPE',
    owner: 'Owner',
    luxtory: 'Inventário Luxtory',
    none: '—',
  } as Record<string, string>,
  occupied: 'ocupada por esta reserva',
  released: (reason: string) => `liberada (${reason})`,
  releaseReasons: {
    cancelled: 'cancelamento',
    no_show: 'no-show',
    exception: 'exceção',
    invalidation: 'invalidação',
  } as Record<string, string>,
  purposes: {
    no_show: 'No-show',
    recovery: 'Recuperação de capacidade futura',
    exception_cancellation: 'Cancelamento por exceção operacional',
    invalidation: 'Invalidação',
  } as Record<string, string>,
  authorizationStatus: {
    requested: 'solicitada · aguardando aprovação',
    live: (at: string) => `autorizada · válida até ${at} · uso único`,
    used: 'usada',
    revoked: 'revogada',
    expired: 'expirada',
  },
  roles: {
    titular: 'Titular',
    admin: 'Admin',
    super_admin: 'Super Admin',
    system: 'Sistema',
  } as Record<string, string>,
  done: {
    open_exception: 'Exceção aberta. O Titular recebe um aviso.',
    resolve: 'Exceção resolvida. O Titular recebe um aviso.',
    no_show: 'No-show registrado. O Titular recebe um aviso.',
    invalidation: 'Reserva invalidada. O Titular recebe um aviso.',
    recovery: 'Capacidade futura recuperada para o Inventário Luxtory. O Titular não recebe aviso.',
  } as Record<string, string>,
  doneTitle: 'Ato registrado',
  requestDoneTitle: 'Solicitação registrada',
  requestDoneBody: 'Envie ao aprovador somente este identificador:',
} as const;

/** Formulários dos atos: consequência antes, erro associado ao campo, base registrada sem dado pessoal (D11). */
export const adminActMessages = {
  back: 'Voltar',
  errorSummary: 'Revise o campo indicado',
  basis: 'Base registrada',
  basisHint:
    'Referência a um registro verificável — protocolo, ticket ou documento interno, como TCK-2026-0042. Não escreva nome, documento, contato ou relato pessoal.',
  basisError:
    'Use uma referência sem dados pessoais. Não são aceitos e-mail nem 10 ou mais dígitos seguidos (como CPF, CNPJ ou telefone). Registre a evidência num ticket interno e use a referência dele, como TCK-2026-0042.',
  noShowBasis: 'Registro de não comparecimento',
  noShowBasisHint:
    'Referência ao registro da administração profissional ou do Titular, como ADM-SERRA-2026-118. Sem dado pessoal.',
  type: 'Tipo',
  typeOperational: 'Exceção operacional',
  typeOperationalDesc:
    'Indisponibilidade extraordinária da Second Home. O Titular continua podendo cancelar pelas regras normais.',
  typeReview: 'Apuração de reserva não reconhecida',
  typeReviewDesc:
    'O Titular não reconhece a reserva. No Co-Owner, o cancelamento fora do prazo e o no-show ficam suspensos até a resolução.',
  reason: 'Motivo (exceção operacional)',
  reasonError: 'Escolha o motivo da exceção operacional.',
  incident: 'Referência do incidente (apuração)',
  incidentHint:
    'Letras, números e . _ : - (até 64 caracteres), sem dado pessoal, como INC-2026-0007.',
  incidentError: 'Use só letras, números e . _ : - (até 64), sem dado pessoal, como INC-2026-0007.',
  attest: 'Atestação',
  attestNoShow: 'Atesto que o registro de não comparecimento foi verificado.',
  attestRecovery:
    'Atesto que as noites estão disponíveis e que a recuperação é compatível com a situação do bloqueio.',
  attestError: 'Marque a atestação para continuar.',
  outcome: 'Resolução',
  outcomeHint: (at: string) =>
    `Instante desta prévia: ${at} (horário da Second Home). A classificação é refeita na execução.`,
  outcomeConfirmed: 'Manter a reserva — Confirmada',
  outcomeConfirmedDesc:
    'Encerra a exceção sem efeito em noites, saldo ou custódia. O Titular recebe um aviso.',
  outcomeCompleted: 'Concluída',
  outcomeCompletedDesc:
    'O período terminou: encerra a exceção sem efeito em noites, saldo ou custódia. O Titular recebe um aviso.',
  outcomeCancelled: 'Cancelar a reserva',
  outcomeCancelledTimely: (n: number) =>
    `Classificação neste instante: dentro do prazo — ${n === 1 ? 'a noite volta' : `as ${n} noites voltam`} ao Direito de Uso desta Ação. Sem Crédito, indenização ou compensação.`,
  outcomeCancelledLate: (n: number) =>
    `Classificação neste instante: fora do prazo — ${n === 1 ? 'a noite deixa' : `as ${n} noites deixam`} a reserva e o consumo é mantido. Sem Crédito, indenização ou compensação.`,
  outcomeCancelledOwner: (n: number) =>
    `${n === 1 ? 'A noite que ainda não começou volta' : `As ${n} noites que ainda não começaram voltam`} ao calendário do Owner.`,
  outcomeChoiceError: 'Escolha a resolução.',
  usesAuthorization: (purpose: string, at: string) =>
    `Usa a autorização de ${purpose.toLowerCase()} válida até ${at} (uso único).`,
  needsAuthorizationTitle: 'Cancelar exige autorização independente válida',
  needsAuthorizationBody: 'Nenhuma autorização viva para cancelar esta reserva.',
  requestLink: 'Solicitar autorização',
  reviewCoOwnerNote:
    'Na apuração de reserva de Co-Owner, a invalidação é feita em "Invalidar a reserva" (corrige o Direito de Uso numa única operação).',
  noAuthorizationTitle: 'Sem autorização válida para este ato',
  noAuthorizationBody:
    'Solicite a autorização independente. Aprovada, o ato fica disponível aqui uma única vez, dentro da validade.',
  purpose: 'Finalidade',
  purposeError: 'Escolha a finalidade.',
  submit: {
    open_exception: 'Abrir exceção',
    resolve: 'Registrar resolução',
    no_show: 'Declarar no-show',
    invalidation: 'Invalidar a reserva',
    recovery: 'Recuperar noites',
    request: 'Registrar solicitação',
  } as Record<string, string>,
  pending: 'Registrando…',
  pendingStatus: 'Registrando o ato…',
  rejection: {
    permission:
      'A autorização não está válida (pode ter expirado, sido revogada ou já usada) ou o papel não permite este ato. Nada foi alterado.',
    state: 'A reserva mudou enquanto você revisava. Nada foi alterado. Revise a situação atual.',
    capacity: 'Não há noite recuperável. Nada foi alterado.',
    closed: 'As ações do ciclo da reserva ainda não estão abertas. Nada foi alterado.',
    unavailable: 'Não foi possível concluir agora. Nada foi alterado. Tente de novo em instantes.',
    rate_limited:
      'Limite de solicitações atingido. Nada foi registrado. Tente de novo em alguns minutos.',
    parameter_missing:
      'A solicitação de autorização não está disponível neste ambiente. Nada foi registrado.',
    invalid: 'Revise os campos indicados. Nada foi alterado.',
    unexpected: 'Algo deu errado. Nada foi alterado.',
  } as Record<string, string>,
  consequence: {
    open_exception: 'Nada muda em noites, saldo ou custódia',
    openExceptionBody: (deadline: string | null) =>
      deadline === null
        ? 'O Titular recebe um aviso.'
        : `O Titular recebe um aviso. Na exceção operacional de Co-Owner, o aviso informa o prazo de 15 dias (até ${deadline}).`,
    noShowCoOwner: (n: number) =>
      n === 0
        ? 'Nenhuma noite futura muda; só a situação'
        : `${nights(n)} ${n === 1 ? 'deixa' : 'deixam'} a reserva; o consumo é mantido`,
    noShowOwner: (n: number) =>
      n === 0
        ? 'Nenhuma noite futura muda; só a situação'
        : `${nights(n)} ${n === 1 ? 'volta' : 'voltam'} ao calendário do Owner`,
    noShowWarningTitle: 'Declarar o no-show é definitivo',
    noShowWarningCoOwner: (dates: string) =>
      `As noites que ainda não começaram (${dates}) deixam a reserva e passam a Direito de Uso perdido, que não pode ser reservado. As noites que já começaram não mudam. O Titular recebe um aviso. A recuperação é um ato separado, com autorização própria.`,
    noShowWarningOwner: (dates: string) =>
      `As noites que ainda não começaram (${dates}) voltam ao calendário do Owner. As noites que já começaram não mudam. O Titular recebe um aviso.`,
    window: 'Janela',
    invalidation: (n: number) =>
      `Invalidar devolve ${n === 1 ? 'a noite que ainda não começou' : `as ${n} noites que ainda não começaram`}`,
    invalidationBody:
      'Numa única operação: cancela, libera as noites, devolve a capacidade à capacidade coletiva da SPE e corrige o consumo do Direito de Uso. Não cria Crédito nem indenização. O Titular recebe um aviso.',
    recovery: (n: number) => `${nights(n)} ${n === 1 ? 'passa' : 'passam'} ao Inventário Luxtory`,
    recoveryBody:
      'Como capacidade recuperada. Não devolve Direito de Uso, não gera Crédito nem remuneração e não envia aviso ao Titular.',
    origin: 'Origem',
    originException:
      'cancelamento fora do prazo ou resolução durante exceção operacional (exige atestação na solicitação)',
    originOther: 'cancelamento fora do prazo ou no-show',
    request: 'A solicitação não executa nada',
    requestBody:
      'O aprovador confere os fundamentos por fontes próprias. Aprovada, a ação fica disponível aqui uma única vez, dentro da validade. Para o aprovador sai só o identificador opaco — nenhuma reserva, data ou evidência.',
  },
  purposeDesc: {
    no_show: (n: number) =>
      `Na janela de comparecimento; alcança ${n === 1 ? 'a noite que ainda não começou' : `as ${n} noites que ainda não começaram`} (pode ser nenhuma). Válida até o check-out.`,
    exception_cancellation: (n: number, timely: boolean | null) =>
      `Cancelar durante a exceção operacional: ${nights(n)} por começar${timely === null ? '' : timely ? ', classificação esperada dentro do prazo' : ', classificação esperada fora do prazo'}.`,
    invalidation: (n: number) => `Invalidar após a apuração: ${nights(n)} por começar.`,
    recovery: (n: number) =>
      `Recuperar ${nights(n)} futuras com Direito de Uso perdido para o Inventário Luxtory.`,
  },
} as const;
