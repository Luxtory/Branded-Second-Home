// Textos do PRL no Admin (W16; REQ-013, REQ-052; spec pricing §5). Fatos do `01` §9 e §19 e da BR-181/BR-182, sem
// valor comercial: nenhum preço, percentual ou exemplo econômico aparece aqui. Temporada = categoria canônica da noite
// (`01` §9: Alta/Super Alta · Média/Baixa), nunca editável aqui; PRL = preço da noite; disponibilidade é outro conceito.
export const prlMessages = {
  metadataTitle: 'PRL — Admin Luxtory',
  listTitle: 'PRL — Preço de Referência Luxtory',
  listLead:
    'O preço de referência de cada noite de cada Second Home. Definir ou alterar preços não cobra ninguém, não cria reserva e não ativa Luxchange, Luxplus nem locação.',
  listSectionTitle: 'Second Homes',
  listLabel: 'Second Homes e preços definidos',
  listEmpty: 'Nenhuma Second Home cadastrada.',
  editionLabel: 'Home Edition',
  sealedLabel: 'Noites no calendário',
  sealedNone: 'Calendário ainda não gerado (depende da formalização)',
  inForceLabel: 'Com preço vigente',
  publishedLabel: 'Com preço definido (vigente ou futuro)',
  periodLabel: 'Período do calendário',
  period: (from: string, to: string) => `${from} a ${to}`,
  nightsCount: (count: number) => (count === 1 ? '1 noite' : `${count} noites`),

  detailTitle: (label: string) => `PRL — ${label}`,
  detailLead:
    'Cada noite tem o próprio preço, mesmo dentro da mesma temporada. Depois de definido, só o Super Admin altera, e a alteração vale só para o futuro.',
  back: 'Todas as Second Homes',
  modes: {
    label: 'Modo',
    consult: 'Consultar',
    initial: 'Definir preços iniciais',
    change: 'Alterar preços',
  },
  previousMonth: 'Mês anterior',
  nextMonth: 'Próximo mês',
  monthEmpty: 'Nenhuma noite deste mês está no calendário.',
  noCalendar:
    'O calendário desta Second Home ainda não foi gerado. Ele é gerado por exercício depois da formalização; só então as noites recebem preço.',
  season: 'Temporada',
  seasons: { alta: 'Alta/Super Alta', media: 'Média/Baixa' },
  status: 'Situação do preço',
  statusAbsent: 'Sem preço definido',
  statusAbsentEffect:
    'A noite continua no calendário, mas fica fora dos mecanismos que usam o PRL até ter preço.',
  statusInForce: 'Preço vigente',
  statusScheduledOnly: 'Sem preço vigente — há versão futura',
  inForceValue: 'Preço vigente',
  inForceSince: (from: string) => `desde ${from}`,
  scheduledLabel: 'Versões futuras',
  scheduled: (value: string, from: string) => `${value} a partir de ${from}`,
  history: 'Histórico',
  historyCount: (count: number) =>
    count === 1 ? '1 versão registrada' : `${count} versões registradas`,
  historyNone: 'Nenhuma versão registrada.',
  historyState: { in_force: 'vigente', future: 'futura', past: 'encerrada' },
  historyLabel: (night: string) => `Histórico de preços de ${night}`,
  kind: { initial: 'Preço inicial', change: 'Alteração' } as Record<string, string>,
  validity: 'Vigência',
  validityOpen: (from: string) => `desde ${from}`,
  validityClosed: (from: string, to: string) => `de ${from} até ${to}`,
  validityFuture: (from: string) => `a partir de ${from}`,
  authority: 'Autoridade',
  authorities: { admin: 'Admin', super_admin: 'Super Admin' } as Record<string, string>,
  basis: 'Base registrada',
  recordedAt: 'Registrada em',
  monthSummaryLabel: (month: string) => `Resumo de ${month}`,
  monthSummary: {
    nights: 'No calendário',
    inForce: 'Com preço vigente',
    scheduled: 'Com versão futura',
    absent: 'Sem preço definido',
  },
  nightTitle: 'Noite em detalhe',

  calendar: {
    weekdays: [
      ['D', 'domingo'],
      ['S', 'segunda-feira'],
      ['T', 'terça-feira'],
      ['Q', 'quarta-feira'],
      ['Q', 'quinta-feira'],
      ['S', 'sexta-feira'],
      ['S', 'sábado'],
    ] as readonly (readonly [string, string])[],
    caption: 'Preços em reais.',
    legend: 'Legenda do calendário',
    legendAbsent: 'Sem preço',
    legendInForce: 'Preço vigente',
    legendScheduled: 'Versão futura',
    legendSelected: 'Selecionada',
    legendViewing: 'Em detalhe',
    legendAlta: 'Temporada Alta/Super Alta (sem traço: Média/Baixa)',
    absentShort: 'sem preço',
    scheduledShort: 'com versão futura',
    selected: 'selecionada',
    viewing: 'em detalhe',
    proposed: (value: string) => `novo preço ${value}`,
    unsealed: 'fora do calendário da Second Home',
    notInitial: 'já tem preço; só o Super Admin altera',
    notChange: 'ainda sem preço; use Definir preços iniciais',
    exercises: 'Ir para o exercício',
    exercise: (year: string) => year,
  },
  selection: {
    title: 'Seleção',
    count: (count: number) =>
      count === 0
        ? 'Nenhuma noite selecionada.'
        : count === 1
          ? '1 noite selecionada.'
          : `${count} noites selecionadas.`,
    capped: (added: number) =>
      added === 0
        ? 'Limite de 366 noites por publicação: nenhuma noite foi adicionada.'
        : `Limite de 366 noites por publicação: só ${added === 1 ? '1 noite foi adicionada' : `${added} noites foram adicionadas`}; as demais ficaram de fora.`,
    added: (count: number) =>
      count === 0
        ? 'Nenhuma noite elegível a adicionar neste mês.'
        : count === 1
          ? '1 noite adicionada.'
          : `${count} noites adicionadas.`,
    bulkLabel: (month: string) => `Selecionar em ${month}`,
    month: 'Todas',
    monthAlta: 'Alta/Super Alta',
    monthMedia: 'Média/Baixa',
    clear: 'Limpar seleção',
    common: 'Preço comum (R$)',
    commonHint:
      'Até 2 casas decimais; nada é arredondado. Noites novas na seleção recebem este preço.',
    apply: (count: number) =>
      count === 1 ? 'Aplicar à noite selecionada' : `Aplicar às ${count} noites selecionadas`,
    applied: (count: number) =>
      count === 1 ? 'Preço comum aplicado a 1 noite.' : `Preço comum aplicado a ${count} noites.`,
    empty: 'Selecione noites no calendário; o preço de cada uma aparece aqui para ajuste.',
    thisMonth: (month: string) => `Em ${month}`,
    thisMonthNone: (month: string) => `Nenhuma noite selecionada em ${month}.`,
    otherMonths: 'Também selecionadas',
    goToMonth: (month: string, count: number) =>
      `${month}: ${count === 1 ? '1 noite' : `${count} noites`}`,
    current: (value: string) => `vigente ${value}`,
    exception: 'Preço próprio',
    amountFor: (night: string) => `Preço de ${night} (R$)`,
    remove: (night: string) => `Remover ${night} da seleção`,
    nightsError: 'Selecione ao menos uma noite e informe o preço de cada uma.',
    review: 'Revisar',
  },
  review: {
    title: 'Revise antes de confirmar',
    operation: { initial: 'Preços iniciais', change: 'Alteração de preços' } as Record<
      string,
      string
    >,
    summary: (nights: string, total: string) => `${nights} · PRL total ${total}`,
    authority: 'Autoridade exercida',
    basis: 'Base registrada',
    validity: 'Vigência',
    validityNow: 'A partir da confirmação',
    total: 'PRL total',
    totalChange: 'PRL total (antes da nova vigência → novo)',
    currentNow: 'Vigente agora',
    currentNone: 'Nenhum (só versão futura)',
    scheduled: 'Versão futura',
    replaces: 'Antes da nova vigência → novo',
    compare: (current: string, proposed: string) => `${current} → ${proposed}`,
    credits: 'Prévia de Créditos',
    creditsPreview: 'Créditos (prévia)',
    creditsValue: (value: string) => `${value} Créditos`,
    creditsUnavailable: 'Indisponível: multiplicador de Créditos não configurado',
    linesLabel: 'Noites e preços desta publicação',
    value: 'Novo preço',
    notice:
      'A prévia de Créditos é informativa: usa o multiplicador vigente e não origina Créditos. Confirmar registra uma versão por noite; não cobra ninguém nem ativa mecanismos do Club.',
    confirm: { initial: 'Confirmar preços iniciais', change: 'Confirmar alteração' } as Record<
      string,
      string
    >,
    edit: 'Voltar e editar',
  },
  initialIntro:
    'Para noites ainda sem preço. Selecione no calendário, aplique um preço comum e ajuste as exceções.',
  changeIntro:
    'Exclusivo do Super Admin, para noites que já têm preço. A nova versão vale da confirmação, ou de um horário futuro, em diante.',
  changeRestricted: 'Só o Super Admin altera preços já definidos.',
  doneTitle: { initial: 'Preços iniciais registrados', change: 'Alteração registrada' } as Record<
    string,
    string
  >,
  doneBody:
    'Uma versão por noite foi registrada com a sua autoridade e a base informada. Nada foi cobrado nem ativado.',

  fields: {
    effective_from: 'Início da vigência (opcional)',
    effectiveFromHint: 'No horário da Second Home. Em branco: vale a partir da confirmação.',
    effectiveFromError: 'Informe um horário válido, futuro e existente no fuso da Second Home.',
    basis: 'Base registrada',
    basisHint: 'Referência ao registro que autoriza, sem dado pessoal (ex.: número da ata).',
    basisError: 'Informe uma referência de até 255 caracteres, sem e-mail, telefone ou documento.',
  },
  pending: 'Registrando…',
  reviewing: 'Revisando…',
  pendingStatus: 'Registrando os preços.',
  issues: {
    empty: 'Nenhuma noite selecionada',
    too_many: 'Mais de 366 noites numa publicação',
    duplicate: 'Noite repetida',
    not_sealed: 'Fora do calendário da Second Home',
    already_published: 'Já têm preço (só o Super Admin altera)',
    not_published: 'Ainda sem preço (use Definir preços iniciais)',
    invalid_amount: 'Preço inválido (positivo, em reais, até 2 casas)',
    retroactive: 'Início no passado',
    not_after_latest:
      'O início precisa ser posterior à última versão destas noites (inclusive futura)',
  } as Record<string, string>,
  rejection: {
    issues: 'Ajuste a seleção antes de continuar.',
    vigency:
      'Não foi possível registrar: os preços mudaram desde a revisão (noite com preço novo ou versão mais recente). Revise novamente.',
    permission: 'Seu papel não permite esta operação.',
    not_found: 'Second Home não encontrada.',
    invalid: 'Revise os campos destacados.',
    unavailable: 'Serviço indisponível no momento. Tente novamente em instantes.',
    unexpected: 'Não foi possível registrar agora.',
  } as Record<string, string>,
} as const;
