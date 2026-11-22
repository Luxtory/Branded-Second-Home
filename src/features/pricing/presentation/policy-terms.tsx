import type { PolicyConfig, PolicyEffects, PolicyMechanism } from '../domain/commercial-policy';
import { fractionAxes, fractionToPercent } from './policy-input';
import { policiesMessages as text } from './i18n/policies-pt-br';

function Effects({
  mechanism,
  effects,
}: {
  readonly mechanism: PolicyMechanism;
  readonly effects: PolicyEffects;
}) {
  return (
    <ul className="lx-pricing__history">
      <li>{text.terms.capacity}</li>
      {fractionAxes(mechanism).map((axis) => (
        <li key={axis}>{text.terms.effects[axis](fractionToPercent(effects[axis] as string))}</li>
      ))}
    </ul>
  );
}

const tierLabel = (tiers: PolicyConfig['cancellation'], index: number) => {
  const tier = tiers[index]!;
  const above = index === 0 ? null : tiers[index - 1]!.min_notice_hours;
  if (tier.min_notice_hours === 0) return text.terms.tierLast(above);
  return above === null
    ? text.terms.tierFirst(tier.min_notice_hours)
    : text.terms.tierBetween(tier.min_notice_hours, above);
};

/**
 * Apresentação de uma versão de política (PD-009; ADR-0034 §1): texto derivado só do esquema fechado — nenhum texto
 * livre —, igual no Admin e, nas W21–W25, para o Titular antes do envio ou da confirmação.
 */
export function PolicyTerms(props: {
  readonly mechanism: PolicyMechanism;
  readonly config: PolicyConfig;
  readonly headingLevel?: 3 | 4;
}) {
  const Heading = props.headingLevel === 4 ? 'h4' : 'h3';
  const tiers = props.config.cancellation;
  return (
    <div className="lx-pricing__block">
      <Heading className="lx-pricing__subhead">{text.terms.cancellation}</Heading>
      {tiers.map((tier, index) => (
        <div key={tier.min_notice_hours}>
          <p className="lx-pricing__text">{tierLabel(tiers, index)}</p>
          <Effects mechanism={props.mechanism} effects={tier.effects} />
        </div>
      ))}
      <Heading className="lx-pricing__subhead">{text.terms.noShow}</Heading>
      <Effects mechanism={props.mechanism} effects={props.config.no_show} />
      <Heading className="lx-pricing__subhead">{text.terms.exception}</Heading>
      <Effects mechanism={props.mechanism} effects={props.config.exception} />
    </div>
  );
}

/**
 * Aceite da política (PD-009): checkbox obrigatório que envia o id da versão apresentada. O command da operação (W21+)
 * resolve a versão vigente e recusa com `ERR_POLICY_MISSING` se ela não for a aceita. `preview`: só exibição no Admin.
 */
export function PolicyAcceptance(props: {
  readonly policyId: string;
  readonly since: string;
  readonly name?: string;
  /** Rótulo da versão; padrão: o início do id. */
  readonly versionLabel?: string;
  readonly preview?: boolean;
}) {
  const id = `aceite-${props.policyId}`;
  return (
    <div className="lx-field">
      <label className="lx-choice" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name={props.name ?? 'accepted_policy_id'}
          value={props.policyId}
          required
          disabled={props.preview === true || undefined}
          aria-describedby={`${id}-dica`}
        />
        <span className="lx-choice__title">
          {text.acceptance.label(props.versionLabel ?? text.version(props.policyId), props.since)}
        </span>
        <span className="lx-choice__desc" id={`${id}-dica`}>
          {props.preview === true ? text.acceptance.preview : text.acceptance.hint}
        </span>
      </label>
    </div>
  );
}
