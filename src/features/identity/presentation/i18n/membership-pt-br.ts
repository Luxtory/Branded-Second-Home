import type { MembershipAction } from '../party-paths';

/**
 * Textos do Membership (W15, spec identity §15; pt-BR, único locale). Estados do REQ-096: Vigente · Suspenso · Encerrado.
 * Só afirmações dos canônicos: o Membership não altera propriedade, Ação, Direito de Uso, rotação nem compromissos já
 * constituídos (BR-144, BR-320, BR-321) e o uso próprio independe dele (BR-147). Sem plano, valor, cobrança ou promessa.
 */
export const membershipStates = {
  active: 'Vigente',
  suspended: 'Suspenso',
  ended: 'Encerrado',
} as const;

export const membershipAdminMessages = {
  sectionTitle: 'Membership',
  none: 'Sem Membership',
  lead: 'O Membership é condição de acesso aos mecanismos do Luxtory Club. Não altera propriedade, Ação, Direito de Uso, rotação nem reservas e compromissos já constituídos; o uso próprio independe dele.',
  stateLabel: 'Situação',
  sinceLabel: 'Desde',
  historyTitle: 'Histórico do Membership',
  historyAt: 'Registrada em',
  historyFrom: 'De',
  historyTo: 'Para',
  historyBasis: 'Base registrada',
  historyRole: 'Papel',
  historyCreation: 'Ativação',
  roles: { admin: 'Admin' } as Readonly<Record<string, string>>,
  actions: {
    activate: 'Ativar Membership',
    suspend: 'Suspender',
    reactivate: 'Reativar',
    end: 'Encerrar',
  } satisfies Record<MembershipAction, string>,
  page: {
    activate: {
      title: 'Ativar Membership',
      lead: 'O Membership passa a Vigente. Só uma pessoa ou empresa com Second Home vigente pode ter Membership ativo. Nenhum plano, valor ou cobrança é registrado aqui.',
      submit: 'Ativar Membership',
    },
    suspend: {
      title: 'Suspender Membership',
      lead: 'O Membership passa a Suspenso a partir de agora. Reservas, Direito de Uso e compromissos já constituídos continuam, e o uso próprio segue disponível.',
      submit: 'Suspender Membership',
    },
    reactivate: {
      title: 'Reativar Membership',
      lead: 'O Membership volta a Vigente. Só uma pessoa ou empresa com Second Home vigente pode ter Membership ativo.',
      submit: 'Reativar Membership',
    },
    end: {
      title: 'Encerrar Membership',
      lead: 'O Membership passa a Encerrado a partir de agora, sem desfazer reservas, Direito de Uso ou compromissos já constituídos. A não renovação pode ser a base registrada.',
      submit: 'Encerrar Membership',
    },
  } satisfies Record<MembershipAction, { title: string; lead: string; submit: string }>,
  contextLink: 'Voltar aos dados',
  summaryTitle: 'Mudança',
  currentLabel: 'Situação atual',
  nextLabel: 'Nova situação',
  basisLabel: 'Base registrada',
  basisHint:
    'Por exemplo, o contrato ou a decisão registrada. Não inclua CPF, CNPJ, e-mail, telefone nem outros dados pessoais.',
  state:
    'Não foi possível concluir: a situação do Membership mudou ou a pessoa ou empresa não tem Second Home vigente. Atualize a página.',
} as const;

export const membershipTitularMessages = {
  sectionTitle: 'Membership',
  none: 'Sem Membership',
  stateLabel: 'Situação',
  sinceLabel: 'Desde',
  note: 'A situação do Membership não altera a propriedade, o Direito de Uso nem as reservas e compromissos já constituídos. O uso próprio da Second Home não depende do Membership.',
} as const;

export const membershipNotificationMessages = {
  activated: 'Membership ativado',
  reactivated: 'Membership reativado',
  suspended: 'Membership suspenso',
  ended: 'Membership encerrado',
  what: (state: string, at: string) =>
    `A situação do Membership passou a ${state} em ${at}. Propriedade, Direito de Uso e compromissos já constituídos não mudam.`,
} as const;
