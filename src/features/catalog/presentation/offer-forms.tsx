'use client';

import { useActionState } from 'react';
import {
  createEditionAction,
  registerAuthorizationAction,
  registerResidenceAction,
  revokeAuthorizationAction,
} from './actions';
import {
  ChoiceField,
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

const NAME_MAX = 200;
const REF_MAX = 255;
const LABEL_MAX = 120;
const LONG_MAX = 20_000;

/** Edition de um Concept aprovado (`create_edition`, BR-031, BR-032). */
export function EditionForm({
  conceptId,
  idempotencyKey,
}: {
  readonly conceptId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(createEditionAction, initialFormState(idempotencyKey));
  const text = messages.newEdition;
  const modality = messages.modality;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="concept_id" value={conceptId} />
      <TextField
        form="edition"
        name="region"
        label={text.regionLabel}
        publicTag={messages.form.publicTag}
        hint={text.regionHint}
        maxLength={NAME_MAX}
        state={state}
      />
      <ChoiceField
        form="edition"
        name="modality"
        label={text.modalityLegend}
        publicTag={messages.form.publicTag}
        hint={text.modalityHint}
        state={state}
        options={[
          { value: 'owner', label: modality.owner, description: text.ownerDesc },
          { value: 'co_owner', label: modality.co_owner, description: text.coOwnerDesc },
          {
            value: 'owner_and_co_owner',
            label: modality.owner_and_co_owner,
            description: text.bothDesc,
          },
        ]}
      />
      <TextField
        form="edition"
        name="commercial_conditions"
        label={text.conditionsLabel}
        publicTag={messages.form.publicTag}
        hint={text.conditionsHint}
        multiline
        maxLength={LONG_MAX}
        state={state}
      />
      <FormActions submit={text.submit} cancelHref={paths.concept(conceptId)} />
    </form>
  );
}

/** Autorização de Investor para o Concept (`register_investor_authorization`, BR-310). */
export function AuthorizationForm({
  conceptId,
  idempotencyKey,
}: {
  readonly conceptId: string;
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
      <input type="hidden" name="concept_id" value={conceptId} />
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
      <FormActions submit={text.submit} cancelHref={paths.concept(conceptId)} />
    </form>
  );
}

/** Revogação de uma autorização de Investor (irreversível: ação destrutiva discreta). */
export function RevocationForm({
  conceptId,
  authorizationId,
  idempotencyKey,
}: {
  readonly conceptId: string;
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
      <FormActions submit={text.submit} cancelHref={paths.concept(conceptId)} tone="destructive" />
    </form>
  );
}

/** Registro da Residence = aprovação comercial (`register_residence`, BR-025, REQ-027). */
export function ResidenceForm({
  editionId,
  idempotencyKey,
  timeZones,
  authorizations,
}: {
  readonly editionId: string;
  readonly idempotencyKey: string;
  readonly timeZones: readonly string[];
  readonly authorizations: readonly Option[];
}) {
  const [state, action] = useActionState(registerResidenceAction, initialFormState(idempotencyKey));
  const text = messages.newResidence;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="edition_id" value={editionId} />
      <TextField
        form="residence"
        name="label"
        label={text.labelLabel}
        hint={text.labelHint}
        maxLength={LABEL_MAX}
        state={state}
      />
      <SelectField
        form="residence"
        name="timezone"
        label={text.timezoneLabel}
        hint={text.timezoneHint}
        placeholder={text.timezonePlaceholder}
        options={timeZones.map((zone) => ({ value: zone, label: zone }))}
        state={state}
      />
      <SelectField
        form="residence"
        name="investor_authorization_id"
        label={text.investorLabel}
        hint={text.investorHint}
        placeholder={text.investorPlaceholder}
        options={[{ value: 'none', label: text.noInvestor }, ...authorizations]}
        state={state}
      />
      <FormActions submit={text.submit} cancelHref={paths.edition(editionId)} />
    </form>
  );
}
