/** Textos do slice admin (pt-BR, único locale — CLAUDE.md → i18n). */
export const messages = {
  shell: {
    skipLink: 'Pular para o conteúdo',
    brand: 'Luxtory · Administração',
    title: 'Administração',
    lead: 'Área da equipe Luxtory. As telas de operação chegam com cada módulo.',
    rolesLabel: 'Papéis ativos',
  },
  roles: {
    admin: 'Admin',
    super_admin: 'Super Admin',
  },
  forbidden: {
    marker: 'Acesso negado',
    title: 'Esta área é restrita à equipe administrativa da Luxtory.',
    body: 'Sua conta não tem papel administrativo ativo. Se isso for um engano, procure o responsável pela operação.',
  },
  metadata: {
    title: 'Administração — Luxtory',
  },
} as const;
