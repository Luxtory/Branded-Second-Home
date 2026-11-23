import { createCivilCalendar, type Season } from '@/features/calendar';

/** Temporada de apresentação da precificação (W16 C2; decisão do founder de 2026-11-21). */
export type SeasonTier = 'super_alta' | 'alta' | 'media';

/**
 * Divide o grupo canônico Alta/Super Alta (`01` §9, REQ-030) só para leitura: **Super Alta** = as 10 noites da janela de
 * Carnaval do PD-003 (TECH-041), **Alta** = as demais do grupo (janeiro, julho, dezembro), **Média/Baixa** = o grupo
 * `media` inteiro (29/02 incluído). O grupo canônico vem do calendário selado e continua governando direitos e limites
 * (103/262); a janela vem do próprio calendário canônico (`carnivalDates`), sem segundo cálculo de Carnaval. Uma noite
 * `media` nunca vira Super Alta, mesmo que a data coincida com a janela.
 */
export function seasonTiers(): (stayDate: string, season: Season) => SeasonTier {
  const calendar = createCivilCalendar();
  const windows = new Map<number, ReadonlySet<string>>();
  return (stayDate, season) => {
    if (season !== 'alta') return 'media';
    const year = Number(stayDate.slice(0, 4));
    let window = windows.get(year);
    if (window === undefined) {
      window = new Set(calendar.carnivalDates(year));
      windows.set(year, window);
    }
    return window.has(stayDate) ? 'super_alta' : 'alta';
  };
}
