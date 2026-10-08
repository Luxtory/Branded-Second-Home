import type {
  CatalogTermKind,
  CropStep,
  MediaState,
  ReferenceValueBasis,
} from '../../domain/collection';

/**
 * Textos do Admin da Coleção (pt-BR; spec catalog §13.12): vocabulários, classificação e atributos da versão, capa,
 * curadoria e valores de referência. Terminologia do `02` §1 (Ação, Direito de Uso; nunca valor por dia — REQ-100).
 */
export const collectionMessages = {
  metadata: {
    vocabulary: 'Vocabulários da Coleção · Admin',
    term: 'Termo de vocabulário · Admin',
    cover: 'Capa do Concept · Admin',
    curation: 'Curadoria · Admin',
    referenceValue: 'Valor de referência · Admin',
  },
  vocabulary: {
    link: 'Vocabulários da Coleção',
    title: 'Vocabulários da Coleção',
    lead: 'Termos controlados de lifestyle e de estilo arquitetônico. Só eles classificam as versões dos Concepts e viram filtros na Coleção; nenhum termo é apagado.',
    kinds: {
      lifestyle: 'Lifestyle',
      architectural_style: 'Estilo arquitetônico',
    } satisfies Record<CatalogTermKind, string>,
    kindHints: {
      lifestyle: 'A forma de viver que o Concept traduz (ex.: natureza, bem-estar).',
      architectural_style:
        'A linguagem arquitetônica do Concept (ex.: contemporâneo, colonial revisitado).',
    } satisfies Record<CatalogTermKind, string>,
    empty: 'Nenhum termo neste vocabulário.',
    newTitle: 'Novo termo',
    kindLabel: 'Vocabulário',
    labelLabel: 'Rótulo',
    labelHint:
      'Como aparece no card, nos filtros e na busca da Coleção. O endereço do filtro é derivado do rótulo no registro e não muda depois.',
    submit: 'Registrar termo',
    slugLabel: 'Endereço do filtro',
    stateLabel: 'Situação',
    active: 'Ativo',
    inactive: 'Desativado',
    editTitle: (label: string) => `Termo: ${label}`,
    editLead:
      'Renomear ou desativar. Desativado, o termo sai da Coleção e não classifica versões novas; as versões que já o usam não mudam.',
    activeLabel: 'Situação do termo',
    activeOption: 'Ativo — classifica versões e aparece na Coleção',
    inactiveOption: 'Desativado — fora da Coleção e das versões novas',
    editSubmit: 'Salvar termo',
  },
  versionFields: {
    collectionLegend: 'Coleção',
    collectionHint:
      'Opcionais. Sem o dado, a linha e o filtro correspondentes não aparecem no site — nunca "sob consulta".',
    summaryLabel: 'Resumo do card',
    summaryHint: 'Até 160 caracteres, no card da Coleção.',
    guestsLabel: 'Pessoas (no máximo)',
    suitesLabel: 'Suítes',
    areaLabel: 'Área construída (m²)',
    numberHint: 'Número inteiro.',
    lifestyleLegend: 'Lifestyle',
    lifestyleHint:
      'Até 3, do vocabulário controlado. O primeiro é o principal: aparece no card e no quadro sem imagem.',
    styleLegend: 'Estilo arquitetônico',
    styleHint: 'Até 2, do vocabulário controlado. O primeiro é o principal.',
    termLabel: (position: number) => (position === 1 ? 'Principal' : `${position}º`),
    noTerm: 'Nenhum',
    noTerms: 'Nenhum termo ativo neste vocabulário. Registre em Vocabulários da Coleção.',
    attributesLabel: 'Atributos',
    attributes: (guests: number | null, suites: number | null, area: number | null) =>
      [
        guests === null ? null : `Até ${guests} pessoas`,
        suites === null ? null : `${suites} suítes`,
        area === null ? null : `${area} m²`,
      ]
        .filter((value) => value !== null)
        .join(' · ') || 'Sem atributos',
    classificationLabel: 'Classificação',
    none: 'Sem classificação',
  },
  cover: {
    sectionTitle: 'Capa',
    current: 'Capa vigente',
    noCurrent:
      'Sem capa aprovada — a Coleção mostra o quadro tipográfico e o Concept não pode ser destaque.',
    historyLabel: 'Capas enviadas',
    upload: 'Enviar capa',
    states: {
      pending: 'Pendente',
      approved: 'Aprovada',
      withdrawn: 'Retirada',
    } satisfies Record<MediaState, string>,
    stateLabel: 'Situação',
    sentLabel: 'Enviada em',
    newTitle: 'Enviar capa',
    newLead:
      'A imagem oficial do Concept na Coleção. O servidor corrige a orientação, remove os metadados (local, câmera, autoria), guarda um master de alta resolução e gera as larguras do site; o arquivo original não é guardado. O crédito fica no campo abaixo. A capa nasce pendente.',
    fileLabel: 'Arquivo da imagem',
    fileHint:
      'JPEG, PNG ou WebP · até 3 MB · pelo menos 720 × 520 px (o maior quadro da Coleção). Imagens maiores rendem mais nitidez; nada é ampliado.',
    altLabel: 'Texto alternativo',
    altHint:
      'O que a imagem mostra, para quem não a vê. Ex.: "Fachada em pedra ao entardecer, com o pátio iluminado."',
    creditLabel: 'Crédito da fotografia',
    cropXLabel: 'Foco horizontal',
    cropYLabel: 'Foco vertical',
    cropHint: 'A parte da imagem que fica visível quando o card recorta.',
    cropX: {
      20: 'Esquerda',
      35: 'Centro-esquerda',
      50: 'Centro',
      65: 'Centro-direita',
      80: 'Direita',
    } satisfies Record<CropStep, string>,
    cropY: {
      20: 'Topo',
      35: 'Acima do centro',
      50: 'Centro',
      65: 'Abaixo do centro',
      80: 'Base',
    } satisfies Record<CropStep, string>,
    submit: 'Enviar para aprovação',
    detailTitle: 'Capa do Concept',
    previewLabel: 'Pré-visualização',
    focusLabel: 'Foco',
    sizesLabel: 'Versões guardadas',
    usageLabel: 'Uso na Coleção',
    usageFeatured: 'Card e destaque editorial',
    usageCardOnly: (width: number, height: number) =>
      `Só card — o destaque editorial pede ao menos ${width} × ${height} px; nada é ampliado`,
    masterLabel: 'Master',
    displayLabel: 'Exibição',
    sizes: (versions: readonly string[]) => versions.join(' · '),
    approveTitle: 'Aprovar',
    approveNotice:
      'Aprovada, a capa aparece na Coleção na próxima requisição. Uma capa aprovada anterior é retirada na mesma operação.',
    approveSubmit: 'Aprovar capa',
    withdrawTitle: 'Retirar',
    withdrawNotice:
      'A capa sai do site na próxima requisição; sem capa, o Concept deixa de ser destaque. Não dá para desfazer — envie outra capa se precisar.',
    basisLabel: 'Motivo da retirada',
    basisHint: 'Ex.: "Direito de imagem encerrado", "Nova sessão de fotos".',
    withdrawSubmit: 'Retirar capa',
    closed: 'Esta capa já foi retirada.',
    blocked:
      'A parceria desta Brand Partner está encerrada: novas capas e aprovações ficam bloqueadas.',
  },
  curation: {
    sectionTitle: 'Curadoria',
    edit: 'Editar curadoria',
    rankLabel: 'Posição na curadoria',
    rankHint:
      'De 1 a 999; o menor aparece primeiro em "Curadoria Luxtory". Vazio = depois dos posicionados, na ordem de registro.',
    noRank: 'Sem posição',
    featuredLabel: 'Destaque editorial',
    featuredHint:
      'No máximo um Concept em destaque, e só com capa aprovada. Marcar este tira o destaque do anterior.',
    featured: 'Em destaque',
    notFeatured: 'Sem destaque',
    title: 'Curadoria',
    lead: 'A ordem padrão da Coleção e o destaque editorial que abre o seu grupo.',
    coverTooSmall: (width: number, height: number) =>
      `A capa aprovada serve aos cards, mas não sustenta o destaque editorial: ele pede uma imagem com ao menos ${width} × ${height} px. Envie uma capa maior para destacar este Concept.`,
    noCover:
      'Sem capa aprovada: o Concept pode ter posição na curadoria, mas não pode ser destaque.',
    submit: 'Salvar curadoria',
    blocked: 'A parceria desta Brand Partner está encerrada: a curadoria fica bloqueada.',
  },
  referenceValues: {
    sectionTitle: 'Valores de referência',
    lead: 'Registrados pela Luxtory, nunca calculados. Owner: a Second Home inteira. Co-Owner: uma Ação, com Direito de Uso. Nunca valor por dia.',
    empty:
      'Nenhum valor registrado: a Coleção mostra a modalidade sem valor e a Edition fica fora da faixa de valor.',
    bases: {
      owner: 'Owner · a Second Home inteira',
      acao: 'Co-Owner · uma Ação',
    } satisfies Record<ReferenceValueBasis, string>,
    basisLabel: 'Base',
    stateLabel: 'Situação',
    current: 'Vigente',
    future: 'Futuro',
    ended: 'Encerrado',
    validFromLabel: 'Início',
    validUntilLabel: 'Fim',
    noEnd: 'Em aberto',
    new: 'Registrar valor de referência',
    newTitle: 'Registrar valor de referência',
    newLead:
      'O valor vigente em aberto da mesma base é encerrado no início do novo; o histórico nunca é reescrito.',
    amountLabel: 'Valor (R$)',
    amountHint: 'Em reais: 4.800.000 ou 4.800.000,00.',
    validFromLabel2: 'Início da vigência',
    validFromHint: 'Vazio = agora. No futuro, entra em vigor nessa data.',
    submit: 'Registrar valor',
    endTitle: 'Encerrar valor de referência',
    endLead: 'Encerra agora a vigência; o valor sai da Coleção na próxima requisição.',
    endSubmit: 'Encerrar agora',
    endUnavailable:
      'Só um valor que já começou e está em aberto pode ser encerrado. Para trocar um valor futuro, registre outro.',
    blocked: 'Novos valores exigem a parceria ativa.',
  },
} as const;
