import type { FractionAxis, PolicyIssue, PolicyMechanism } from '../../domain/commercial-policy';

// Textos das políticas comerciais (W18; spec pricing §5 "Políticas comerciais"; ADR-0034). Nenhum valor comercial,
// prazo ou percentual de exemplo: os valores são configuração da Luxtory (PD-009). Terminologia do 02 §1 (REQ-100).
const hoursLabel = (hours: number) => {
  const days = hours / 24;
  const plain = `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return Number.isInteger(days) && days > 0
    ? `${plain} (${days} ${days === 1 ? 'dia' : 'dias'})`
    : plain;
};

export const policiesMessages = {
  metadataTitle: 'Políticas comerciais — Admin Luxtory',
  title: 'Políticas comerciais',
  lead: 'Prazos e efeitos de cancelamento, não comparecimento e exceção de cada mecanismo do Luxtory Club. Cada mudança é uma nova versão, com vigência, autoridade e base, e o histórico nunca é apagado. Sem política vigente, nenhuma operação do mecanismo confirma. Publicar não ativa mecanismos.',
  mechanisms: {
    luxchange_request: {
      name: 'Luxchange Request',
      about: 'Request aceita: Créditos em Garantia consumidos e Luxchange Fee pago.',
    },
    luxchange_direct: {
      name: 'Luxchange Direct',
      about: 'Reserva sobre o Inventário Luxtory com Créditos e Luxchange Fee.',
    },
    luxplus: { name: 'Luxplus', about: 'Reserva paga em dinheiro sobre o Inventário Luxtory.' },
    rental_external: {
      name: 'Locação externa',
      about:
        'Locação autorizada de data do Titular, com valor pago pelo locatário e remuneração do Titular.',
    },
  } satisfies Record<PolicyMechanism, { name: string; about: string }>,
  reference: 'Referência: PD-009 · PD-010 · TECH-032 · BR-163',
  absentTitle: 'Ausente',
  absentEffect: 'Nenhuma operação deste mecanismo pode confirmar.',
  inForce: 'Vigente',
  scheduledOnly: 'Ausente agora — há versão futura',
  since: 'Vigente desde',
  until: 'Até',
  untilOpen: 'até a próxima versão',
  scheduled: 'Agendada',
  scheduledEntry: (at: string) => `a partir de ${at}`,
  history: 'Histórico',
  showHistory: (count: number) => `${count} ${count === 1 ? 'versão' : 'versões'}`,
  authority: 'Autoridade',
  authorityAdmin: 'Admin',
  basis: 'Base registrada',
  recordedAt: 'Registrada em',
  version: (id: string) => `Versão ${id.slice(0, 8)}`,
  publish: 'Publicar nova versão',
  doneTitle: 'Versão publicada',
  doneBody:
    'A nova versão vale a partir do início informado. Operações já formadas mantêm a política aceita.',
  terms: {
    cancellation: 'Cancelamento',
    noShow: 'Não comparecimento (no-show)',
    exception:
      'Exceção extraordinária (manutenção emergencial, segurança, sinistro, caso fortuito ou força maior)',
    tierFirst: (hours: number) => `Com pelo menos ${hoursLabel(hours)} de antecedência do check-in`,
    tierBetween: (hours: number, above: number) =>
      `Com pelo menos ${hoursLabel(hours)} e menos de ${hoursLabel(above)} de antecedência do check-in`,
    tierLast: (above: number | null) =>
      above === null
        ? 'A qualquer momento, inclusive após o check-in'
        : `Com menos de ${hoursLabel(above)} de antecedência do check-in, ou após o check-in`,
    capacity: 'As noites ainda não iniciadas voltam à sua origem imediatamente anterior.',
    effects: {
      credits: (percent: string) =>
        `${percent}% dos Créditos usados voltam aos lotes de origem, com a validade original.`,
      fee: (percent: string) => `${percent}% do Luxchange Fee é devolvido em dinheiro.`,
      money: (percent: string) => `${percent}% do valor pago é devolvido.`,
      remuneration: (percent: string) => `${percent}% da remuneração do Titular é mantida.`,
    } satisfies Record<FractionAxis, (percent: string) => string>,
  },
  acceptance: {
    label: (version: string, since: string) =>
      `Li e aceito a política comercial (${version} · vigência: ${since}).`,
    hint: 'A política aceita fica vinculada à operação; mudanças posteriores não a alteram.',
    preview: 'Prévia — como o Titular verá a política antes de confirmar a operação.',
    newVersion: 'nova versão',
  },
  fields: {
    tiersLegend: 'Cancelamento — faixas por antecedência',
    tiersHint:
      'Até 5 faixas, da maior para a menor antecedência. A última faixa precisa ter 0 hora e vale também após o check-in. Deixe em branco as faixas não usadas.',
    tier: (n: number) => `Faixa ${n}`,
    hours: 'Antecedência mínima (horas)',
    hoursHint: 'Número inteiro de horas antes do check-in, de 0 a 8760.',
    noShowLegend: 'Não comparecimento (no-show)',
    exceptionLegend: 'Exceção extraordinária',
    axis: {
      credits: 'Créditos revertidos (%)',
      fee: 'Luxchange Fee devolvido (%)',
      money: 'Valor pago devolvido (%)',
      remuneration: 'Remuneração do Titular mantida (%)',
    } satisfies Record<FractionAxis, string>,
    percentHint: 'De 0 a 100, até 4 casas decimais. Informe 0 quando nada for devolvido.',
    capacityFixed:
      'Capacidade: as noites não iniciadas sempre voltam à origem imediatamente anterior (BR-163) — não configurável.',
    effective_from: 'Início da vigência (UTC)',
    effectiveFromHint: 'Opcional. Em branco, vale a partir da publicação. Nunca no passado.',
    effectiveFromError: 'Informe um início válido, no presente ou no futuro.',
    effective_to: 'Término da vigência (UTC)',
    effectiveToHint: 'Opcional. Em branco, vale até a próxima versão.',
    effectiveToError: 'Informe um término válido, depois do início.',
    basis: 'Base registrada',
    basisHint: 'Referência da decisão (ata, deliberação ou documento), sem dados pessoais.',
    basisError: 'Informe a base, sem dados pessoais (até 255 caracteres).',
    fieldError: 'Valor inválido ou ausente.',
  },
  issues: {
    shape: 'O documento da política está incompleto.',
    tiers_count: 'Informe de 1 a 5 faixas de cancelamento.',
    tiers_order: 'As faixas precisam estar da maior para a menor antecedência, sem repetir horas.',
    tiers_last_not_zero:
      'A última faixa precisa ter 0 hora, para cobrir todo cancelamento até e após o check-in.',
    notice_range: 'A antecedência precisa ser um número inteiro de 0 a 8760 horas.',
    axes: 'Os efeitos precisam cobrir exatamente os eixos do mecanismo.',
    capacity_not_origin: 'A capacidade sempre volta à origem imediatamente anterior (BR-163).',
    fraction: 'Os percentuais precisam estar entre 0 e 100.',
  } satisfies Record<PolicyIssue, string>,
  review: {
    title: 'Revise antes de publicar',
    consequences: 'Ao confirmar:',
    consequenceFrom: (from: string) => `a versão vale ${from};`,
    consequenceKept: 'operações já formadas mantêm a política que aceitaram;',
    consequenceFinal: 'a versão não pode ser alterada nem apagada — uma mudança exige nova versão;',
    consequenceNoActivation: 'nenhum mecanismo é ativado por esta publicação.',
    fromNow: 'a partir da publicação',
    toOpen: 'até a próxima versão',
    current: 'Vigente agora',
    currentNone: 'Nenhuma (ausente)',
    from: 'Início',
    to: 'Término',
    basis: 'Base registrada',
    authority: 'Autoridade',
    confirm: 'Confirmar publicação',
    edit: 'Voltar e editar',
  },
  submit: 'Revisar',
  pending: 'Processando…',
  pendingStatus: 'Processando a política. Aguarde.',
  rejection: {
    invalid: 'Revise os campos indicados.',
    rules: 'A política contraria uma regra estrutural. Revise os itens indicados.',
    vigency:
      'A vigência conflita com outra versão: o início precisa ser posterior a todas as versões existentes e nunca no passado.',
    permission: 'Seu acesso não permite publicar políticas comerciais.',
    unavailable: 'Serviço indisponível no momento. Tente novamente em instantes.',
    unexpected: 'Não foi possível publicar agora.',
  } as Record<string, string>,
} as const;
