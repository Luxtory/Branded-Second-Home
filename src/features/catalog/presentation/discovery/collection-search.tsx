import { Fragment, type ReactNode } from 'react';
import { Icon } from '@/design-system/react';
import type { CollectionFacets } from '../../application/collection-discovery';
import { COLLECTION_PARAMS, type CollectionQuery } from '../../application/collection-query';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import { formatMoney } from '../money';
import { facetSummaries, RESULTS_ANCHOR } from './collection-labels';
import { discoveryPaths } from './paths';

/**
 * Discovery da Coleção (spec catalog §13.12, §17.8): um formulário GET renderizado no servidor — funciona sem JS e gera uma
 * URL compartilhável. As facetas são `<details>` nativos; cada painel tem o seu "Aplicar". O celular usa os mesmos
 * campos num diálogo (formulário próprio, ver `collection-client.tsx`).
 */
const text = discoveryMessages.collection;
const P = COLLECTION_PARAMS;
const ACTION = `${discoveryPaths.collection}#${RESULTS_ANCHOR}`;
const CURRENCY = 'BRL';
const MINOR_PER_UNIT = 100n;
/** Mesmo limite da leitura da URL (`parseCollectionQuery`). */
const SEARCH_MAX = 100;

interface FieldsProps {
  readonly prefix: string;
  readonly query: CollectionQuery;
  readonly facets: CollectionFacets;
  /** Dentro do popover a legenda repete o rótulo da faceta: fica só para leitor de tela. */
  readonly hideLegend?: boolean;
}

function Legend({ hidden, children }: { readonly hidden: boolean; readonly children: ReactNode }) {
  return <legend className={hidden ? 'lx-visually-hidden' : undefined}>{children}</legend>;
}

function Check({
  id,
  type,
  name,
  value,
  checked,
  children,
}: {
  readonly id: string;
  readonly type: 'checkbox' | 'radio';
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly children: ReactNode;
}) {
  return (
    <label className="lx-check" htmlFor={id}>
      <input id={id} type={type} name={name} value={value} defaultChecked={checked} />
      <span>{children}</span>
    </label>
  );
}

export function LifestyleFields({ prefix, query, facets, hideLegend = false }: FieldsProps) {
  return (
    <fieldset className="lx-facet__options">
      <Legend hidden={hideLegend}>{text.facets.lifestyle}</Legend>
      {facets.lifestyles.map((term) => (
        <Check
          key={term.slug}
          id={`${prefix}-lifestyle-${term.slug}`}
          type="checkbox"
          name={P.lifestyle}
          value={term.slug}
          checked={query.lifestyles.includes(term.slug)}
        >
          {term.label}
        </Check>
      ))}
    </fieldset>
  );
}

export function StyleFields({ prefix, query, facets, hideLegend = false }: FieldsProps) {
  return (
    <fieldset className="lx-facet__options">
      <Legend hidden={hideLegend}>{text.facets.style}</Legend>
      {facets.styles.map((term) => (
        <Check
          key={term.slug}
          id={`${prefix}-style-${term.slug}`}
          type="checkbox"
          name={P.style}
          value={term.slug}
          checked={query.styles.includes(term.slug)}
        >
          {term.label}
        </Check>
      ))}
    </fieldset>
  );
}

/** Uma escolha entre opções, com "qualquer" primeiro (valor vazio = sem filtro). */
function RadioFields({
  prefix,
  legend,
  hideLegend,
  name,
  current,
  any,
  options,
}: {
  readonly prefix: string;
  readonly legend: string;
  readonly hideLegend: boolean;
  readonly name: string;
  readonly current: string;
  readonly any: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <fieldset className="lx-facet__options">
      <Legend hidden={hideLegend}>{legend}</Legend>
      {[{ value: '', label: any }, ...options].map((option, index) => (
        <Check
          key={option.value}
          id={`${prefix}-${name}-${index}`}
          type="radio"
          name={name}
          value={option.value}
          checked={current === option.value}
        >
          {option.label}
        </Check>
      ))}
    </fieldset>
  );
}

export function GuestsFields({ prefix, query, facets, hideLegend = false }: FieldsProps) {
  return (
    <RadioFields
      prefix={prefix}
      legend={text.facets.guests}
      hideLegend={hideLegend}
      name={P.guests}
      current={query.guests === null ? '' : String(query.guests)}
      any={text.facets.anyGuests}
      options={facets.guests.map((n) => ({
        value: String(n),
        label: text.facets.atLeastGuests(n),
      }))}
    />
  );
}

/**
 * Faceta "Investimento projetado" (BR-034, spec §17.8): De/Até em reais, numa etapa só, sobre a média projetada de
 * investimento vigente das Home Editions publicadas — sem modalidade nem base. Por dentro, sempre visível, o nome
 * canônico ("Média projetada de investimento (R$)"); a sugestão mostra a menor e a maior média publicadas.
 */
export function ValueFields({ prefix, query, facets }: FieldsProps) {
  const f = text.facets;
  const range = query.value;
  const reaisValue = (minor: bigint | null | undefined) =>
    minor === null || minor === undefined ? '' : (minor / MINOR_PER_UNIT).toString();
  return (
    <>
      <fieldset className="lx-facet__options">
        <Legend hidden={false}>{f.valueLegend}</Legend>
        <div className="lx-facet__range">
          <label htmlFor={`${prefix}-value-from`}>
            {f.valueFrom}
            <input
              id={`${prefix}-value-from`}
              name={P.valueMin}
              inputMode="numeric"
              autoComplete="off"
              defaultValue={reaisValue(range?.min)}
            />
          </label>
          <label htmlFor={`${prefix}-value-to`}>
            {f.valueTo}
            <input
              id={`${prefix}-value-to`}
              name={P.valueMax}
              inputMode="numeric"
              autoComplete="off"
              defaultValue={reaisValue(range?.max)}
            />
          </label>
        </div>
      </fieldset>
      {facets.value === null ? null : (
        <p className="lx-facet__note">
          {f.valueSuggestion(
            formatMoney(facets.value.min, CURRENCY),
            formatMoney(facets.value.max, CURRENCY),
          )}
        </p>
      )}
      <p className="lx-facet__note">{f.valueNote}</p>
    </>
  );
}

/** "Mais filtros": suítes, área, só com Home Edition, Brand Partner — só os que existem. */
export function MoreFields({ prefix, query, facets }: FieldsProps) {
  const f = text.facets;
  return (
    <>
      {facets.suites.length === 0 ? null : (
        <RadioFields
          prefix={prefix}
          legend={f.suites}
          hideLegend={false}
          name={P.suites}
          current={query.suites === null ? '' : String(query.suites)}
          any={f.anySuites}
          options={facets.suites.map((n) => ({ value: String(n), label: f.atLeastSuites(n) }))}
        />
      )}
      {facets.area === null ? null : (
        <fieldset className="lx-facet__options">
          <legend>{f.area}</legend>
          <div className="lx-facet__range">
            <label htmlFor={`${prefix}-area-from`}>
              {f.areaFrom}
              <input
                id={`${prefix}-area-from`}
                name={P.areaMin}
                inputMode="numeric"
                autoComplete="off"
                defaultValue={query.areaMin ?? ''}
                placeholder={String(facets.area.min)}
              />
            </label>
            <label htmlFor={`${prefix}-area-to`}>
              {f.areaTo}
              <input
                id={`${prefix}-area-to`}
                name={P.areaMax}
                inputMode="numeric"
                autoComplete="off"
                defaultValue={query.areaMax ?? ''}
                placeholder={String(facets.area.max)}
              />
            </label>
          </div>
        </fieldset>
      )}
      {facets.withHomeEdition ? (
        <Check
          id={`${prefix}-with-home-edition`}
          type="checkbox"
          name={P.withHomeEdition}
          value="1"
          checked={query.withHomeEdition}
        >
          {f.withHomeEdition}
        </Check>
      ) : null}
      {facets.brands.length === 0 ? null : (
        <RadioFields
          prefix={prefix}
          legend={f.brand}
          hideLegend={false}
          name={P.brand}
          current={query.brand ?? ''}
          any={f.anyBrand}
          options={facets.brands.map((brand) => ({ value: brand.id, label: brand.name }))}
        />
      )}
    </>
  );
}

/** Filtros avançados ativos: o resumo de "Mais filtros" mostra só a contagem (vazio quando nenhum). */
function advancedCount(query: CollectionQuery): number {
  return [
    query.suites !== null,
    query.areaMin !== null || query.areaMax !== null,
    query.withHomeEdition,
    query.brand !== null,
  ].filter(Boolean).length;
}

/** Há "Mais filtros" quando algum dos filtros avançados tem opções reais. */
export const hasMoreFilters = (facets: CollectionFacets) =>
  facets.suites.length > 0 ||
  facets.area !== null ||
  facets.withHomeEdition ||
  facets.brands.length > 0;

/**
 * Uma faceta. No Hero: rótulo sobre o valor atual. Na barra fixa (`compact`): só o rótulo numa linha e, quando ativa, a
 * quantidade de escolhas — o valor fica no popover e nos chips dos resultados (sem corte nem quebra no meio da palavra).
 */
function Facet({
  label,
  value,
  count,
  compact,
  end = false,
  children,
}: {
  readonly label: string;
  readonly value: string;
  /** Escolhas ativas nesta faceta (0 = nenhuma). */
  readonly count: number;
  readonly compact: boolean;
  readonly end?: boolean;
  readonly children: ReactNode;
}) {
  const summary = compact ? (
    count === 0 ? null : (
      <span className="lx-facet__count">{text.facets.activeCount(count)}</span>
    )
  ) : value === '' ? null : (
    <span className="lx-facet__value">{value}</span>
  );
  return (
    <details
      className={end ? 'lx-facet lx-facet--end' : 'lx-facet'}
      data-active={count > 0 || undefined}
    >
      <summary className="lx-facet__summary">
        <span className="lx-facet__label">{label}</span>
        {summary}
      </summary>
      <div className="lx-facet__panel">
        {children}
        <button className="lx-button lx-button--primary" type="submit">
          {text.search.apply}
        </button>
      </div>
    </details>
  );
}

/** As facetas principais e "Mais filtros" — só os filtros com 2+ valores reais (spec §13.12). */
function Facets({
  prefix,
  query,
  facets,
  compact,
}: {
  readonly prefix: string;
  readonly query: CollectionQuery;
  readonly facets: CollectionFacets;
  readonly compact: boolean;
}) {
  const f = text.facets;
  const summary = facetSummaries(query, facets);
  const fields = { prefix, query, facets, hideLegend: true } as const;
  const one = (active: boolean) => (active ? 1 : 0);
  const items: { key: string; node: (end: boolean) => ReactNode }[] = [];
  if (facets.lifestyles.length > 0) {
    items.push({
      key: 'lifestyle',
      node: (end) => (
        <Facet
          label={f.lifestyle}
          value={summary.lifestyle}
          count={query.lifestyles.length}
          compact={compact}
          end={end}
        >
          <LifestyleFields {...fields} />
        </Facet>
      ),
    });
  }
  if (facets.styles.length > 0) {
    items.push({
      key: 'style',
      node: (end) => (
        <Facet
          label={f.style}
          value={summary.style}
          count={query.styles.length}
          compact={compact}
          end={end}
        >
          <StyleFields {...fields} />
        </Facet>
      ),
    });
  }
  if (facets.guests.length > 0) {
    items.push({
      key: 'guests',
      node: (end) => (
        <Facet
          label={f.guests}
          value={summary.guests}
          count={one(query.guests !== null)}
          compact={compact}
          end={end}
        >
          <GuestsFields {...fields} />
        </Facet>
      ),
    });
  }
  if (facets.value !== null) {
    items.push({
      key: 'value',
      node: (end) => (
        <Facet
          label={compact ? f.valueShort : f.value}
          value={summary.value}
          count={one(query.value !== null)}
          compact={compact}
          end={end}
        >
          <ValueFields {...fields} />
        </Facet>
      ),
    });
  }
  if (hasMoreFilters(facets)) {
    const advanced = advancedCount(query);
    items.push({
      key: 'more',
      node: (end) => (
        <Facet
          label={text.search.more}
          value={advanced === 0 ? '' : text.facets.moreActive(advanced)}
          count={advanced}
          compact={compact}
          end={end}
        >
          <MoreFields {...fields} />
        </Facet>
      ),
    });
  }
  if (items.length === 0) return null;
  const half = Math.ceil(items.length / 2);
  return (
    <div className="lx-discovery__facets">
      {items.map((item, index) => (
        <Fragment key={item.key}>{item.node(index >= half)}</Fragment>
      ))}
    </div>
  );
}

/**
 * O formulário de busca. `hero`: busca + "Explorar a Coleção" + facetas (e, no celular, o botão dos filtros);
 * `compact`: a mesma busca numa linha, para a barra fixa do desktop.
 */
export function DiscoveryForm({
  id,
  variant,
  query,
  facets,
  mobile,
  filterCount = 0,
}: {
  readonly id: string;
  readonly variant: 'hero' | 'compact';
  readonly query: CollectionQuery;
  readonly facets: CollectionFacets;
  readonly mobile?: ReactNode;
  /** Filtros ativos (sem a busca): a barra fixa indica a quantidade e leva aos chips dos resultados. */
  readonly filterCount?: number;
}) {
  const compact = variant === 'compact';
  const label = compact ? text.search.compactLabel : text.search.label;
  const submit = (
    <button className="lx-button lx-button--primary lx-discovery__submit" type="submit">
      {text.search.submit}
      <Icon name="arrow-right" className="lx-button__icon" />
    </button>
  );
  return (
    <form
      id={id}
      className={compact ? 'lx-discovery lx-discovery--compact' : 'lx-discovery'}
      data-surface="white"
      role="search"
      aria-label={label}
      action={ACTION}
      method="get"
    >
      <div className="lx-discovery__search">
        <label className="lx-visually-hidden" htmlFor={`${id}-q`}>
          {label}
        </label>
        <div className="lx-discovery__field">
          {/* Placeholder vazio + dica visível em CSS: a frase longa só onde cabe, a curta onde haveria corte (o
              placeholder nativo não muda por largura). Some quando há texto, como um placeholder. */}
          <input
            id={`${id}-q`}
            className="lx-discovery__input"
            type="search"
            name={P.text}
            defaultValue={query.text}
            placeholder=" "
            maxLength={SEARCH_MAX}
            autoComplete="off"
          />
          <span className="lx-discovery__placeholder" aria-hidden="true">
            {compact ? null : (
              <span className="lx-discovery__placeholder-long">{text.search.placeholder}</span>
            )}
            <span className="lx-discovery__placeholder-short">{text.search.placeholderShort}</span>
          </span>
        </div>
        {compact ? null : submit}
      </div>
      {compact ? (
        // Facetas, "Filtros (n)" e o envio formam um grupo: ao lado da busca quando cabe, numa segunda linha quando não.
        <div className="lx-discovery__tools">
          <Facets prefix={id} query={query} facets={facets} compact={compact} />
          {filterCount === 0 ? null : (
            <a className="lx-discovery__count lx-link" href={`#${RESULTS_ANCHOR}`}>
              {text.search.filters(filterCount)}
            </a>
          )}
          {submit}
        </div>
      ) : (
        <>
          <Facets prefix={id} query={query} facets={facets} compact={compact} />
          {mobile}
        </>
      )}
      {query.sort === 'curadoria' ? null : <input type="hidden" name={P.sort} value={query.sort} />}
    </form>
  );
}
