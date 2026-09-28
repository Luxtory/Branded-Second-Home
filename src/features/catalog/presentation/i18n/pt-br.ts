/** Textos do slice catalog (pt-BR, único locale — CLAUDE.md → i18n). Terminologia do `02` §1 (REQ-100/101). */
export const messages = {
  metadata: {
    catalog: 'Catálogo — Administração — Luxtory',
    newBrandPartner: 'Registrar Brand Partner — Luxtory',
    brandPartner: 'Brand Partner — Luxtory',
    termination: 'Registrar encerramento — Luxtory',
  },
  catalog: {
    title: 'Catálogo',
    lead: 'Brand Partners e, dentro de cada uma, seus Concepts, Editions e Residences.',
    register: 'Registrar Brand Partner',
    listTitle: 'Brand Partners',
    empty: 'Nenhuma Brand Partner registrada ainda. O catálogo começa por ela.',
  },
  brandPartner: {
    stateLabel: 'Situação',
    active: 'Ativa',
    terminationScheduled: 'Encerramento registrado',
    terminated: 'Encerrada',
    conceptsLabel: 'Concepts',
    exposureLabel: 'Exposição da marca',
    exposureAuthorized: 'Autorizada',
    exposureMissing: 'Não registrada',
    contextLink: 'Catálogo',
    registerConcept: 'Registrar Concept',
    registerExposure: 'Registrar autorização de exposição',
    registerTermination: 'Registrar encerramento',
    summaryTitle: 'Situação da parceria',
    effectiveLabel: 'Eficácia do encerramento',
    basisLabel: 'Base do encerramento',
    exposureRefLabel: 'Autorização de exposição',
    exposureAtLabel: 'Exposição registrada em',
    registeredAtLabel: 'Registrada em',
    terminatedNoticeTitle: 'Parceria encerrada',
    terminatedNoticeBody:
      'Depois da eficácia do encerramento, novos Concepts, versões, Editions, autorizações de Investor, Residences e a autorização de exposição ficam bloqueados. O que já existe não muda.',
    scheduledNoticeTitle: 'Encerramento registrado com eficácia futura',
    scheduledNoticeBody:
      'Até a eficácia, novos usos da marca continuam permitidos; depois dela, ficam bloqueados. O que já existe não muda.',
    conceptsTitle: 'Concepts',
    conceptsEmpty: 'Nenhum Concept registrado para esta Brand Partner.',
    conceptStateLabel: 'Estado',
    conceptApproved: (version: number) => `Aprovado (versão ${version})`,
    conceptNotApproved: 'Não aprovado',
    versionsLabel: 'Versões',
    editionsLabel: 'Editions',
  },
  newBrandPartner: {
    title: 'Registrar Brand Partner',
    lead: 'A marca parceira que aporta seu Brand DNA ao modelo Luxtory.',
    nameLabel: 'Nome da marca',
    nameHint: 'Como a marca é identificada nos registros da Luxtory.',
    exposureLabel: 'Autorização de exposição pública',
    exposureHint:
      'Referência do documento que autoriza a exposição pública da marca. Pode ser registrada depois.',
    submit: 'Registrar Brand Partner',
  },
  termination: {
    title: 'Registrar encerramento',
    lead: 'Registra o encerramento da parceria com esta Brand Partner.',
    warningTitle: 'Esta ação não pode ser desfeita',
    warningBody:
      'A partir da eficácia, novos usos da marca ficam bloqueados: Concepts, versões, Editions, autorizações de Investor, Residences e autorização de exposição. Registros existentes e a autorização de exposição já registrada continuam como estão.',
    limitationBody:
      'Direitos que sobrevivem ao encerramento ainda não podem ser registrados no sistema: por enquanto, nenhum novo uso é aceito depois da eficácia.',
    effectiveLabel: 'Eficácia do encerramento',
    effectiveHint:
      'Data e hora a partir das quais novos usos da marca ficam bloqueados. Pode ser passada ou futura.',
    basisLabel: 'Base do encerramento',
    basisHint:
      'Referência do instrumento que formaliza o encerramento (por exemplo, o número do aditivo).',
    submit: 'Registrar encerramento',
    alreadyTerminated: 'O encerramento desta Brand Partner já foi registrado.',
  },
  form: {
    optional: '(opcional)',
    cancel: 'Cancelar',
    timeZoneHint: (zone: string) => `Horário do seu dispositivo (${zone}).`,
    errorSummary: 'Revise os campos indicados.',
    fields: {
      required: 'Preencha este campo.',
      too_long: 'Texto longo demais para este campo.',
      invalid: 'Valor inválido.',
      forbidden_term:
        'O texto usa um termo vedado pela terminologia da Luxtory ou uma promessa de retorno. Reescreva o trecho.',
      invalid_time_zone: 'Escolha um fuso horário da lista.',
      duplicate_item: 'Há referências repetidas.',
      end_before_start: 'O fim da vigência precisa ser depois do início.',
    },
    rejections: {
      invalid: 'Revise os campos indicados.',
      state:
        'O registro não pôde ser concluído porque a situação mudou (por exemplo, encerramento, aprovação ou revogação). Recarregue a página e confira.',
      not_found: 'O registro de referência não existe mais. Volte e confira.',
      permission: 'Sua sessão não tem mais o papel Admin ativo para esta operação.',
      conflict:
        'Este envio já foi processado com outros dados. Recarregue a página e tente de novo.',
      unavailable:
        'O serviço está indisponível agora. Nada foi gravado; tente de novo em instantes.',
      unexpected: 'Não foi possível concluir. Nada foi gravado; tente de novo.',
    },
  },
  status: {
    registered: 'Registro concluído.',
    terminated: 'Encerramento registrado.',
  },
  notFound: {
    title: 'Registro não encontrado',
    body: 'Este registro não existe no catálogo.',
    back: 'Voltar ao catálogo',
  },
} as const;
