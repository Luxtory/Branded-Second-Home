/** Textos do slice ownership (pt-BR, único locale — CLAUDE.md → i18n). */
export const messages = {
  metadata: {
    overview: 'Interesses — Administração Luxtory',
    homeEdition: 'Interesses da Home Edition — Administração Luxtory',
    interest: 'Interesse — Administração Luxtory',
    contact: 'Contato e pré-qualificação — Administração Luxtory',
  },
  overview: {
    title: 'Interesses',
    lead: 'Manifestações registradas, agrupadas por Home Edition, localização pretendida e modalidade. Interesse é preferência comercial: não constitui aquisição nem cria Ação ou Direito de Uso.',
    empty: 'Nenhum interesse registrado até agora.',
    homeEditionUnavailable: 'Home Edition sem identificação disponível no catálogo',
    homeConceptLabel: 'Home Concept',
    brandLabel: 'Marca',
    totalLabel: 'Interesses',
    locationsLabel: 'Localizações pretendidas com interesse em',
    modalities: {
      owner: 'Owner',
      co_owner: 'Co-Owner',
    },
    daysNote:
      'Em Co-Owner, cada quantidade aproximada de dias aparece exatamente como foi informada, sem faixas: preferência comercial, jamais direito adquirido.',
    openGroup: 'Ver as manifestações desta Home Edition',
  },
  // Drill-down da W6 (spec ownership §14.10): dado pessoal só no nível "contato e pré-qualificação", com leitura
  // registrada. Visão operacional mínima — sem busca, exportação, edição, status, score ou atribuição.
  group: {
    lead: 'Manifestações desta Home Edition, por localização pretendida e modalidade. Nenhum dado de contato ou de pré-qualificação aparece nesta lista.',
    context: 'Interesses',
    empty: 'Nenhuma manifestação registrada para esta Home Edition.',
    listLabel: 'Manifestações em',
    days: 'Dias aproximados',
    open: 'Abrir',
  },
  interest: {
    title: 'Manifestação de interesse',
    context: 'Manifestações da Home Edition',
    homeEdition: 'Home Edition',
    homeConcept: 'Home Concept',
    desiredLocation: 'Localização pretendida',
    modality: 'Modalidade desejada',
    days: 'Dias aproximados (preferência, não Direito de Uso)',
    registeredAt: 'Registrada em',
    contactNote:
      'Contato e pré-qualificação são dados pessoais, usados só para responder à solicitação de conversa e conduzir a pré-qualificação comercial. Cada abertura fica registrada.',
    openContact: 'Ver contato e pré-qualificação',
  },
  contact: {
    title: 'Contato e pré-qualificação',
    context: 'Manifestação',
    contactTitle: 'Contato',
    name: 'Nome',
    phone: 'Telefone ou WhatsApp',
    email: 'E-mail',
    contactUnavailable: 'Contato indisponível para esta manifestação.',
    qualificationTitle: 'Pré-qualificação',
    qualificationUnavailable: 'Pré-qualificação indisponível para esta manifestação.',
    investment: 'Dimensão de investimento',
    presented: 'Média projetada apresentada',
    noneLabel: 'Nenhuma média projetada apresentada',
    decisionUnit: 'Unidade de decisão',
    decisionHorizon: 'Horizonte',
    note: 'Contexto declarado pelo interessado para a conversa comercial: não é score, prioridade nem aprovação. Esta leitura foi registrada; sem exportação, cópia em lote ou envio automático.',
  },
  notFound: {
    title: 'Registro não encontrado',
    body: 'A manifestação ou a Home Edition pedida não existe.',
  },
} as const;

/** "1 interesse", "3 interesses". */
export function interestCount(count: number): string {
  return `${count} ${count === 1 ? 'interesse' : 'interesses'}`;
}

/** Rótulo de um valor exato de dias informado: "Co-Owner · 14 dias". */
export function daysLabel(modality: string, days: number): string {
  return `${modality} · ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** "14 dias" — o valor exato informado. */
export function daysValue(days: number): string {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

const INSTANT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

/** Instante registrado, sempre em UTC com o fuso explícito (formatado no servidor). */
export function instantLabel(at: Date): string {
  return INSTANT.format(at);
}
