/** Textos do slice admin (pt-BR, único locale — CLAUDE.md → i18n). */
export const messages = {
  brand: 'Luxtory',
  shell: {
    skipLink: 'Pular para o conteúdo',
    home: 'Luxtory — início da administração',
    nav: 'Navegação da administração',
    menu: 'Menu da administração',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    rolesLabel: 'Papéis ativos',
  },
  nav: {
    home: 'Início',
    catalog: 'Catálogo',
    interests: 'Interesses',
    parties: 'Partes',
  },
  home: {
    title: 'Administração',
    lead: 'Área da equipe Luxtory. As telas de operação chegam com cada módulo.',
    sessionTitle: 'Sua sessão',
    rolesLabel: 'Papéis ativos',
    mfaLabel: 'Segundo fator',
    mfaValue: 'Confirmado',
    modulesTitle: 'Módulos',
    modulesEmpty:
      'Ainda não há módulos de operação. Cada um aparece aqui e na navegação quando for liberado.',
    modulesLabel: 'Módulos disponíveis',
    modules: {
      catalog: {
        includesLabel: 'Inclui',
        includes: 'Brand Partners, Home Concepts, Home Editions e Second Homes',
      },
      interests: {
        includesLabel: 'Inclui',
        includes:
          'Manifestações de interesse por Home Edition, localização pretendida e modalidade',
      },
      parties: {
        includesLabel: 'Inclui',
        includes: 'CPF e CNPJ cadastrados (mascarados) e convites de representantes',
      },
    },
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
