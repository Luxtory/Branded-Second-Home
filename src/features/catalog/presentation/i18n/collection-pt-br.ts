import type {
  CatalogTermKind,
  CropStep,
  HomeEditionMediaKind,
  MediaState,
} from '../../domain/collection';

const CROP_X = {
  20: 'Esquerda',
  35: 'Centro-esquerda',
  50: 'Centro',
  65: 'Centro-direita',
  80: 'Direita',
} as const satisfies Record<CropStep, string>;

const CROP_Y = {
  20: 'Topo',
  35: 'Acima do centro',
  50: 'Centro',
  65: 'Abaixo do centro',
  80: 'Base',
} as const satisfies Record<CropStep, string>;

const MEDIA_STATES = {
  pending: 'Pendente',
  approved: 'Aprovada',
  withdrawn: 'Retirada',
} as const satisfies Record<MediaState, string>;

/**
 * Textos do Admin da Coleção (pt-BR; spec catalog §13.12, §17): vocabulários, classificação da versão, capa, curadoria,
 * mídia da Home Edition e média projetada de investimento. Terminologia do `02` §1 (REQ-100); a média projetada nunca é
 * preço, valor por Ação, por modalidade ou por dia (BR-034).
 */
export const collectionMessages = {
  metadata: {
    vocabulary: 'Vocabulários da Coleção · Admin',
    term: 'Termo de vocabulário · Admin',
    cover: 'Capa do Home Concept · Admin',
    curation: 'Curadoria · Admin',
    homeEditionMedia: 'Mídia da Home Edition · Admin',
    projectedInvestment: 'Média projetada de investimento · Admin',
  },
  vocabulary: {
    link: 'Vocabulários da Coleção',
    title: 'Vocabulários da Coleção',
    lead: 'Termos controlados de lifestyle e de estilo arquitetônico. Só eles classificam as versões dos Home Concepts e viram filtros na Coleção; nenhum termo é apagado.',
    kinds: {
      lifestyle: 'Lifestyle',
      architectural_style: 'Estilo arquitetônico',
    } satisfies Record<CatalogTermKind, string>,
    kindHints: {
      lifestyle: 'A forma de viver que o Home Concept traduz (ex.: natureza, bem-estar).',
      architectural_style:
        'A linguagem arquitetônica do Home Concept (ex.: contemporâneo, colonial revisitado).',
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
    lifestyleLegend: 'Lifestyle',
    lifestyleHint:
      'Até 3, do vocabulário controlado. O primeiro é o principal: aparece no card e no quadro sem imagem.',
    styleLegend: 'Estilo arquitetônico',
    styleHint: 'Até 2, do vocabulário controlado. O primeiro é o principal.',
    termLabel: (position: number) => (position === 1 ? 'Principal' : `${position}º`),
    noTerm: 'Nenhum',
    noTerms: 'Nenhum termo ativo neste vocabulário. Registre em Vocabulários da Coleção.',
    classificationLabel: 'Classificação',
    none: 'Sem classificação',
  },
  cover: {
    sectionTitle: 'Capa',
    current: 'Capa vigente',
    noCurrent:
      'Sem capa aprovada — a Coleção mostra o quadro tipográfico e o Home Concept não pode ser destaque.',
    historyLabel: 'Capas enviadas',
    upload: 'Enviar capa',
    states: MEDIA_STATES,
    stateLabel: 'Situação',
    sentLabel: 'Enviada em',
    newTitle: 'Enviar capa',
    newLead:
      'A imagem oficial do Home Concept na Coleção. O servidor corrige a orientação, remove os metadados (local, câmera, autoria), guarda um master de alta resolução e gera as larguras do site; o arquivo original não é guardado. O crédito fica no campo abaixo. A capa nasce pendente.',
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
    cropX: CROP_X,
    cropY: CROP_Y,
    submit: 'Enviar para aprovação',
    detailTitle: 'Capa do Home Concept',
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
      'A capa sai do site na próxima requisição; sem capa, o Home Concept deixa de ser destaque. Não dá para desfazer — envie outra capa se precisar.',
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
      'No máximo um Home Concept em destaque, e só com capa aprovada. Marcar este tira o destaque do anterior.',
    featured: 'Em destaque',
    notFeatured: 'Sem destaque',
    title: 'Curadoria',
    lead: 'A ordem padrão da Coleção e o destaque editorial que abre o seu grupo.',
    coverTooSmall: (width: number, height: number) =>
      `A capa aprovada serve aos cards, mas não sustenta o destaque editorial: ele pede uma imagem com ao menos ${width} × ${height} px. Envie uma capa maior para destacar este Home Concept.`,
    noCover:
      'Sem capa aprovada: o Home Concept pode ter posição na curadoria, mas não pode ser destaque.',
    submit: 'Salvar curadoria',
    blocked: 'A parceria desta Brand Partner está encerrada: a curadoria fica bloqueada.',
  },
  homeEditionMedia: {
    sectionTitle: 'Mídia',
    lead: 'Imagens, renders e plantas, em qualquer estado da definição material. Aprovadas, aparecem no site com a Home Edition publicada; várias podem estar aprovadas ao mesmo tempo.',
    empty:
      'Nenhuma mídia enviada: o site mostra o quadro tipográfico no lugar da imagem principal.',
    upload: 'Enviar mídia',
    kinds: {
      image: 'Imagem',
      render: 'Render',
      floor_plan: 'Planta',
    } satisfies Record<HomeEditionMediaKind, string>,
    kindHints: {
      image: 'Fotografia.',
      render: 'Imagem gerada a partir do projeto.',
      floor_plan: 'Desenho da distribuição dos espaços; aparece à parte, com o texto alternativo.',
    } satisfies Record<HomeEditionMediaKind, string>,
    kindLabel: 'Tipo',
    states: MEDIA_STATES,
    stateLabel: 'Situação',
    sentLabel: 'Enviada em',
    newTitle: 'Enviar mídia',
    newLead:
      'O servidor corrige a orientação, remove os metadados (local, câmera, autoria), guarda um master de alta resolução e gera as larguras do site; o arquivo original não é guardado. A mídia nasce pendente.',
    fileLabel: 'Arquivo da imagem',
    fileHint: 'JPEG, PNG ou WebP · até 3 MB · pelo menos 720 × 520 px. Nada é ampliado.',
    altLabel: 'Texto alternativo',
    altHint:
      'O que a imagem mostra, para quem não a vê. Numa planta, descreva a distribuição dos espaços.',
    creditLabel: 'Crédito',
    cropXLabel: 'Foco horizontal',
    cropYLabel: 'Foco vertical',
    cropHint: 'A parte da imagem que fica visível quando o quadro recorta.',
    cropX: CROP_X,
    cropY: CROP_Y,
    submit: 'Enviar para aprovação',
    detailTitle: (kind: string) => `${kind} da Home Edition`,
    previewLabel: 'Pré-visualização',
    focusLabel: 'Foco',
    approveTitle: 'Aprovar',
    approveNotice:
      'Aprovada, a mídia aparece no site na próxima requisição, se a Home Edition estiver publicada.',
    approveSubmit: 'Aprovar mídia',
    withdrawTitle: 'Retirar',
    withdrawNotice:
      'A mídia sai do site na próxima requisição. Não dá para desfazer — envie outra se precisar.',
    basisLabel: 'Motivo da retirada',
    basisHint: 'Ex.: "Direito de imagem encerrado", "Render desatualizado".',
    withdrawSubmit: 'Retirar mídia',
    closed: 'Esta mídia já foi retirada.',
    blocked:
      'A parceria desta Brand Partner está encerrada: novas mídias e aprovações ficam bloqueadas.',
  },
  projectedInvestment: {
    sectionTitle: 'Média projetada de investimento',
    lead: 'Registrada pela Luxtory, nunca calculada: a ordem de grandeza do investimento total projetado para materializar uma Second Home desta Home Edition. Não é preço, proposta, condição comercial nem valor individual de Owner ou Co-Owner; não se vincula a modalidade nem a Ação. Uma vigente por vez.',
    empty:
      'Nenhuma média registrada: o site mostra a Home Edition sem o bloco e ela fica fora da faixa do filtro.',
    stateLabel: 'Situação',
    current: 'Vigente',
    future: 'Futura',
    ended: 'Encerrada',
    validFromLabel: 'Início',
    validUntilLabel: 'Fim',
    noEnd: 'Em aberto',
    new: 'Registrar média projetada',
    newTitle: 'Registrar média projetada de investimento',
    newLead:
      'A média vigente em aberto é encerrada no início da nova; o histórico nunca é reescrito.',
    amountLabel: 'Média projetada (R$)',
    amountHint: 'Em reais: 4.800.000 ou 4.800.000,00.',
    validFromLabel2: 'Início da vigência',
    validFromHint: 'Vazio = agora. No futuro, entra em vigor nessa data.',
    submit: 'Registrar média projetada',
    endTitle: 'Encerrar média projetada',
    endLead: 'Encerra agora a vigência; a média sai do site na próxima requisição.',
    endSubmit: 'Encerrar agora',
    endUnavailable:
      'Só uma média que já começou e está em aberto pode ser encerrada. Para trocar uma média futura, registre outra.',
    blocked: 'Novas médias exigem a parceria ativa.',
  },
} as const;
