'use client';

import { useActionState } from 'react';
import {
  registerAuthorizationAction,
  registerSecondHomeAction,
  revokeAuthorizationAction,
} from './actions';
import {
  DateTimeField,
  FormActions,
  FormAlert,
  SelectField,
  TextField,
  type Option,
} from './fields';
import { initialFormState } from './form-state';
import { messages } from './i18n/pt-br';
import { paths } from './paths';

const REF_MAX = 255;
const LABEL_MAX = 120;

/** Autorização de Investor para o Home Concept (`register_investor_authorization`, BR-310). */
export function AuthorizationForm({
  homeConceptId,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    registerAuthorizationAction,
    initialFormState(idempotencyKey),
  );
  const text = messages.newAuthorization;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_id" value={homeConceptId} />
      <TextField
        form="authorization"
        name="instrument_ref"
        label={text.refLabel}
        hint={text.refHint}
        maxLength={REF_MAX}
        state={state}
      />
      <DateTimeField form="authorization" name="valid_from" label={text.fromLabel} state={state} />
      <DateTimeField
        form="authorization"
        name="valid_until"
        label={text.untilLabel}
        hint={text.untilHint}
        optional
        state={state}
      />
      <FormActions submit={text.submit} cancelHref={paths.homeConcept(homeConceptId)} />
    </form>
  );
}

/** Revogação de uma autorização de Investor (irreversível: ação destrutiva discreta). */
export function RevocationForm({
  homeConceptId,
  authorizationId,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly authorizationId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    revokeAuthorizationAction,
    initialFormState(idempotencyKey),
  );
  const text = messages.revocation;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="investor_authorization_id" value={authorizationId} />
      <TextField
        form="revocation"
        name="revocation_basis"
        label={text.basisLabel}
        hint={text.basisHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions
        submit={text.submit}
        cancelHref={paths.homeConcept(homeConceptId)}
        tone="destructive"
      />
    </form>
  );
}

/** Registro da Second Home = aprovação comercial (`register_second_home`, BR-025, REQ-027). */
export function SecondHomeForm({
  homeEditionId,
  idempotencyKey,
  timeZones,
  authorizations,
}: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
  readonly timeZones: readonly string[];
  readonly authorizations: readonly Option[];
}) {
  const [state, action] = useActionState(
    registerSecondHomeAction,
    initialFormState(idempotencyKey),
  );
  const text = messages.newSecondHome;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_id" value={homeEditionId} />
      <TextField
        form="second_home"
        name="label"
        label={text.labelLabel}
        hint={text.labelHint}
        maxLength={LABEL_MAX}
        state={state}
      />
      <SelectField
        form="second_home"
        name="timezone"
        label={text.timezoneLabel}
        hint={text.timezoneHint}
        placeholder={text.timezonePlaceholder}
        options={timeZones.map((zone) => ({ value: zone, label: zone }))}
        state={state}
      />
      <SelectField
        form="second_home"
        name="investor_authorization_id"
        label={text.investorLabel}
        hint={text.investorHint}
        placeholder={text.investorPlaceholder}
        options={[{ value: 'none', label: text.noInvestor }, ...authorizations]}
        state={state}
      />
      <FormActions submit={text.submit} cancelHref={paths.homeEdition(homeEditionId)} />
    </form>
  );
}
