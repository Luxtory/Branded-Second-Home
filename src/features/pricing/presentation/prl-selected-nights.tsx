'use client';

import { Icon } from '@/design-system/react';
import { prlMessages as text } from './i18n/prl-pt-br';
import { monthName, nightName, nightShortName } from './prl-month-calendar';

/**
 * Noites selecionadas junto ao calendário (W16 C2; paridade com "Datas selecionadas" do SeasonCalendar do legado): quais
 * noites compõem o lote — o painel cuida de quanto vale cada uma. Sempre à vista: os meses com noites selecionadas
 * (atalho para o mês, com quantas têm preço próprio) e "Limpar seleção". Sob demanda: as noites em ordem cronológica,
 * agrupadas por mês, cada uma removível. Nada aparece sem seleção.
 */
export function PrlSelectedNights(props: {
  readonly id: string;
  /** Noites selecionadas, em ordem de data. */
  readonly dates: readonly string[];
  readonly month: string;
  readonly open: boolean;
  readonly isOwn: (date: string) => boolean;
  readonly onToggle: () => void;
  readonly onRemove: (date: string) => void;
  readonly onClear: () => void;
  readonly onGoTo: (month: string) => void;
}) {
  if (props.dates.length === 0) return null;
  const groups = [
    ...props.dates.reduce(
      (all, date) => all.set(date.slice(0, 7), [...(all.get(date.slice(0, 7)) ?? []), date]),
      new Map<string, string[]>(),
    ),
  ];
  const monthButton = (month: string, dates: readonly string[]) => (
    <button
      className="lx-calendar__clear lx-pricing__picked-month"
      type="button"
      aria-current={month === props.month ? 'true' : undefined}
      onClick={() => props.onGoTo(month)}
    >
      {text.selection.goToMonth(monthName(month), dates.length, dates.filter(props.isOwn).length)}
    </button>
  );
  const titleId = `${props.id}-selecionadas`;
  return (
    <section className="lx-pricing__picked" aria-labelledby={titleId}>
      <h3 className="lx-pricing__eyebrow" id={titleId}>
        {text.picked.title}
      </h3>
      {props.open ? (
        groups.map(([month, dates]) => (
          <div className="lx-pricing__picked-group" key={month}>
            {monthButton(month, dates)}
            <ul
              className="lx-pricing__badges"
              aria-label={text.picked.monthLabel(monthName(month))}
            >
              {dates.map((date) => (
                <li key={date}>
                  <button
                    className="lx-pricing__badge"
                    type="button"
                    aria-label={text.selection.remove(nightName(date))}
                    onClick={() => props.onRemove(date)}
                  >
                    {nightShortName(date)}
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul className="lx-pricing__months">
          {groups.map(([month, dates]) => (
            <li key={month}>{monthButton(month, dates)}</li>
          ))}
        </ul>
      )}
      <div className="lx-pricing__picked-actions">
        <button
          className="lx-calendar__clear"
          type="button"
          aria-expanded={props.open}
          onClick={props.onToggle}
        >
          {props.open ? text.picked.hide : text.picked.show(props.dates.length)}
        </button>
        <button className="lx-calendar__clear" type="button" onClick={props.onClear}>
          {text.selection.clear}
        </button>
      </div>
    </section>
  );
}
