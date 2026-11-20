// Textos do PRL no Admin (W16; REQ-013, REQ-052; spec pricing §5). Fatos do `01` §19 e da BR-181/BR-182, sem valor
// comercial: nenhum preço, percentual ou exemplo econômico aparece aqui.
export const prlMessages = {
  metadataTitle: 'PRL — Admin Luxtory',
  listTitle: 'PRL — Preço de Referência Luxtory',
  listLead:
    'Referência econômica de cada noite de cada Second Home. Publicar PRL não cobra ninguém, não cria reserva nem ativa Luxchange, Luxplus ou locação: esses mecanismos dependem de etapas próprias.',
  listSectionTitle: 'Second Homes',
  listLabel: 'Second Homes e cobertura do PRL',
  listEmpty: 'Nenhuma Second Home cadastrada.',
  editionLabel: 'Home Edition',
  sealedLabel: 'Noites seladas',
  sealedNone: 'Calendário ainda não selado',
  inForceLabel: 'Com PRL vigente',
  publishedLabel: 'Com alguma versão',
  periodLabel: 'Período selado',
  period: (from: string, to: string) => `${from} a ${to}`,
  nightsCount: (count: number) => (count === 1 ? '1 noite' : `${count} noites`),

  detailTitle: (label: string) => `PRL — ${label}`,
  detailLead:
    'Um PRL por noite; o PRL de um período é a soma das noites. Uma vez publicado, só o Super Admin altera, e a alteração vale só para o futuro: o que já foi formado preserva a versão usada.',
  back: 'Voltar ao PRL',
  monthTitle: (month: string) => `Noites de ${month}`,
  monthNav: 'Meses selados',
  previousMonth: 'Mês anterior',
  nextMonth: 'Próximo mês',
  monthEmpty: 'Nenhuma noite selada neste mês.',
  nightsLabel: (month: string) => `PRL das noites de ${month}`,
  status: 'Situação',
  statusAbsent: 'Sem PRL — noite não ofertável em mecanismo que use PRL',
  statusInForce: 'PRL vigente',
  statusScheduledOnly: 'Sem PRL vigente — versão agendada',
  inForceValue: 'Valor vigente',
  inForceSince: 'Vigente desde',
  scheduledLabel: 'Agendado',
  scheduled: (value: string, from: string) => `${value} a partir de ${from}`,
  history: 'Histórico imutável',
  showHistory: (count: number) => (count === 1 ? 'Ver a versão' : `Ver as ${count} versões`),
  versionTitle: (value: string, kind: string) => `${value} · ${kind}`,
  kind: { initial: 'PRL inicial', change: 'Alteração' } as Record<string, string>,
  validity: 'Vigência',
  validityOpen: (from: string) => `desde ${from}, sem término`,
  validityClosed: (from: string, to: string) => `de ${from} até ${to}`,
  authority: 'Autoridade',
  authorities: { admin: 'Admin', super_admin: 'Super Admin' } as Record<string, string>,
  basis: 'Base registrada',
  recordedAt: 'Registrada em',

  initialTitle: 'Publicar PRL inicial',
  initialIntro:
    'Só para noites seladas ainda sem PRL. O mesmo valor vale para cada noite do intervalo; noites com PRL já publicado recusam a publicação inteira.',
  changeTitle: 'Alterar PRL publicado',
  changeIntro:
    'Exclusivo do Super Admin. Só para noites com PRL publicado; a nova versão começa agora ou num instante futuro, depois da última versão de cada noite.',
  changeRestricted:
    'Somente o Super Admin altera PRL já publicado. Para corrigir uma noite, peça a alteração a quem tem esse papel.',
  doneTitle: { initial: 'PRL inicial publicado', change: 'PRL alterado' } as Record<string, string>,
  doneBody:
    'A versão foi registrada com a sua autoridade e a base informada. Ela não cobra ninguém nem ativa mecanismos do Club.',

  fields: {
    first_night: 'Primeira noite',
    firstNightHint: 'Noite selada do calendário da Second Home.',
    last_night: 'Última noite',
    lastNightHint: 'Incluída no intervalo. Até 366 noites por publicação.',
    nightsError:
      'Informe um intervalo válido de até 366 noites, com a última noite igual ou depois da primeira.',
    amount: 'PRL por noite (R$)',
    amountHint:
      'Valor em reais com até 2 casas, por exemplo 1.234,56. Mais casas são recusadas, nunca arredondadas.',
    amountError: 'Informe um valor positivo em reais, com até 2 casas decimais.',
    effective_from: 'Início da vigência (opcional)',
    effectiveFromHint:
      'Horário da Second Home. Vazio: vale a partir da publicação. Nunca no passado.',
    effectiveFromError: 'Informe um horário válido e existente no fuso da Second Home.',
    basis: 'Base registrada',
    basisHint:
      'Referência ao registro que autoriza a publicação, sem dado pessoal (ex.: número da ata).',
    basisError: 'Informe uma referência de até 255 caracteres, sem e-mail, telefone ou documento.',
  },
  submit: { initial: 'Publicar PRL inicial', change: 'Registrar alteração' } as Record<
    string,
    string
  >,
  pending: 'Registrando…',
  pendingStatus: 'Registrando a publicação do PRL.',
  rejection: {
    vigency:
      'Não foi possível registrar: alguma noite já tem PRL (ou ainda não tem, na alteração), não está no calendário selado, ou o início não é posterior à última versão.',
    permission: 'Seu papel não permite esta publicação.',
    not_found: 'Second Home não encontrada.',
    invalid: 'Revise os campos destacados.',
    unavailable: 'Serviço indisponível no momento. Tente novamente em instantes.',
    unexpected: 'Não foi possível registrar agora.',
  } as Record<string, string>,
} as const;
