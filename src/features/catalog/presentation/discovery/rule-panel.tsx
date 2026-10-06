'use client';

import { Fragment, useId, useState } from 'react';
import { discoveryMessages } from '../i18n/discovery-pt-br';

const text = discoveryMessages.home.rule.panel;

type Alternative = (typeof text.alternatives)[number];

/** Valor composto ("Proporcional/Parcial") quebra só na barra, nunca no meio da palavra. */
function Value({ value }: { readonly value: string }) {
  return value.split('/').map((word, index) => (
    <Fragment key={word}>
      {index > 0 ? (
        <>
          <wbr />/<wbr />
        </>
      ) : null}
      {word}
    </Fragment>
  ));
}

/**
 * Panel Switch da Regra (spec catalog §13.10): um painel, as três alternativas como opções de texto sobre hairline.
 * Radios nativos cuidam do foco e das setas; a escolha é anunciada por região viva educada. As qualificações são
 * comunicacionais do fundador — nenhum cálculo ou efeito econômico.
 */
export function RulePanel() {
  const groupId = useId();
  const [selected, setSelected] = useState<Alternative>(text.alternatives[0]);

  return (
    <div className="lx-panel-switch">
      <fieldset className="lx-panel-switch__options" aria-describedby={`${groupId}-freedom`}>
        <legend className="lx-visually-hidden">{text.label}</legend>
        {text.alternatives.map((alternative) => (
          <label className="lx-panel-switch__option" key={alternative.id}>
            <input
              type="radio"
              name={groupId}
              value={alternative.id}
              checked={selected.id === alternative.id}
              onChange={() => setSelected(alternative)}
              aria-controls={`${groupId}-result`}
            />
            <span className="lx-nowrap">{alternative.label}</span>
          </label>
        ))}
      </fieldset>
      <div id={`${groupId}-result`} aria-live="polite" aria-atomic="true">
        <p className="lx-visually-hidden">{selected.label}</p>
        <dl className="lx-panel-switch__rows">
          {text.dimensions.map((dimension, index) => (
            <div className="lx-panel-switch__row" key={dimension}>
              <dt className="lx-panel-switch__attribute">{dimension}</dt>
              <dd className="lx-panel-switch__value">
                <Value value={selected.values[index] ?? ''} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p id={`${groupId}-freedom`} className="lx-body lx-panel-switch__caption">
        {text.freedom.before}
        <strong>{text.freedom.use}</strong>
        {text.freedom.between}
        <strong>{text.freedom.destination}</strong>
        {text.freedom.after}
      </p>
    </div>
  );
}
