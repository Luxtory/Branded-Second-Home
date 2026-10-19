/** Textos do slice ownership (pt-BR, único locale — CLAUDE.md → i18n). */
export const messages = {
  metadata: {
    overview: 'Interesses — Administração Luxtory',
  },
  overview: {
    title: 'Interesses',
    lead: 'Manifestações registradas, agrupadas por Concept, região e modalidade. Interesse é preferência comercial: não constitui aquisição nem cria Ação ou Direito de Uso.',
    empty: 'Nenhum interesse registrado até agora.',
    conceptUnavailable: 'Concept sem identificação disponível no catálogo',
    brandLabel: 'Marca',
    totalLabel: 'Interesses',
    regionsLabel: 'Regiões com interesse em',
    modalities: {
      owner: 'Owner',
      co_owner: 'Co-Owner',
    },
    daysNote:
      'Em Co-Owner, cada quantidade aproximada de dias aparece exatamente como foi informada, sem faixas: preferência comercial, jamais direito adquirido.',
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
