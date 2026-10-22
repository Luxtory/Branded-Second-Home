/**
 * Textos da Área do Titular (W7, spec identity §13.8; pt-BR, único locale). A área mostra **representações**: pessoas e
 * empresas que a conta pode representar (`party_delegation`) — não titularidade, que é relação posterior (W8). Nunca
 * "party" nem "parte" na interface.
 */
export const titularMessages = {
  brand: 'Luxtory',
  metadata: {
    area: 'Área do Titular',
    login: 'Entrar na Área do Titular',
    activate: 'Primeiro acesso',
    representation: 'Representação',
  },
  login: {
    title: 'Área do Titular',
    lead: 'Entre com o e-mail cadastrado pela Luxtory. Enviaremos um código de uso único para ele.',
    firstAccess: 'Recebeu um convite da Luxtory? Faça o primeiro acesso',
  },
  activate: {
    title: 'Primeiro acesso',
    lead: 'Use o código de seis dígitos do e-mail de convite da Luxtory.',
    emailLabel: 'E-mail',
    emailHint: 'O mesmo e-mail que recebeu o convite.',
    codeLabel: 'Código do convite',
    codeHint: 'Seis dígitos, enviados no e-mail de convite.',
    submit: 'Continuar',
    invalidEmail: 'Informe um e-mail válido.',
    invalidCode: 'Código inválido ou expirado. Se o convite expirou, peça um novo à Luxtory.',
    loginLink: 'Já tem acesso? Entrar',
  },
  area: {
    title: 'Área do Titular',
    lead: 'Suas representações na Luxtory.',
    navHome: 'Início',
    representationsTitle: 'Pessoas e empresas que você representa',
    sinceLabel: 'Desde',
    untilLabel: 'Até',
    noEnd: 'Sem data final',
    pendingTitle: 'Convites pendentes',
    pendingItem: 'Convite para representar uma pessoa ou empresa na Luxtory',
    pendingBody: 'Ao ativar, você passa a representá-la nesta área.',
    invitedLabel: 'Convite de',
    activate: 'Ativar representação',
    activated: 'Representação ativada.',
  },
  shell: {
    skipLink: 'Pular para o conteúdo',
    home: 'Luxtory — início da Área do Titular',
    nav: 'Navegação da Área do Titular',
    menu: 'Menu da Área do Titular',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
  },
  account: 'Sua conta',
  forbidden: {
    marker: 'Acesso negado',
    title: 'Esta conta não representa nenhuma pessoa ou empresa na Luxtory.',
    body: 'Se você recebeu um convite, faça o primeiro acesso com o código do e-mail. Em caso de dúvida, fale com a Luxtory.',
    firstAccess: 'Primeiro acesso',
  },
  detail: {
    contextLink: 'Suas representações',
    lead: 'Pessoa ou empresa que você representa. Documento mascarado, como a Luxtory o registrou.',
    sectionTitle: 'Representação',
    typeLabel: 'Tipo',
    documentLabel: 'Documento',
  },
  documentType: { cpf: 'CPF', cnpj: 'CNPJ' },
  rejections: {
    state: 'Este convite não está mais pendente. Atualize a página.',
    permission: 'Este convite não pertence a esta conta.',
    unavailable: 'Serviço indisponível no momento. Tente de novo em instantes.',
    unexpected: 'Não foi possível ativar. Tente de novo.',
  },
} as const;
