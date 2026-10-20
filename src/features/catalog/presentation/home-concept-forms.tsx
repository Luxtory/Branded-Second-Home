'use client';

import { useActionState } from 'react';
import {
  approveVersionAction,
  authorizeBrandExposureAction,
  createVersionAction,
  registerHomeConceptAction,
} from './actions';
import { VersionCollectionFields, type TermOptions } from './collection-forms';
import { FormActions, FormAlert, TextField } from './fields';
import { initialFormState, type FormState } from './form-state';
import { messages } from './i18n/pt-br';
import { paths } from './paths';

const fields = messages.versionFields;
const NAME_MAX = 200;
const REF_MAX = 255;
// Campos de várias linhas: até 50 itens de 500 caracteres (listas) ou 20 referências de 255 (aprovações).
const LIST_MAX = 50 * 501;
const REFS_MAX = 20 * 256;
const LONG_MAX = 20_000;

/** Conteúdo de uma versão (BR-013, BR-014): listas uma por linha e a especificação. */
function VersionContent({ form, state }: { readonly form: string; readonly state: FormState }) {
  return (
    <>
      <TextField
        form={form}
        name="essential_elements"
        label={fields.essentialLabel}
        hint={fields.essentialHint}
        multiline
        maxLength={LIST_MAX}
        state={state}
      />
      <TextField
        form={form}
        name="preservation_premises"
        label={fields.premisesLabel}
        hint={fields.premisesHint}
        multiline
        maxLength={LIST_MAX}
        state={state}
      />
      <TextField
        form={form}
        name="specification"
        label={fields.specificationLabel}
        publicTag={messages.form.publicTag}
        hint={fields.specificationHint}
        multiline
        maxLength={LONG_MAX}
        state={state}
      />
    </>
  );
}

/** Home Concept novo com a versão 1 (`create_home_concept_version`). */
export function HomeConceptForm({
  brandPartnerId,
  idempotencyKey,
  terms,
}: {
  readonly brandPartnerId: string;
  readonly idempotencyKey: string;
  readonly terms: TermOptions;
}) {
  const [state, action] = useActionState(
    registerHomeConceptAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="brand_partner_id" value={brandPartnerId} />
      <TextField
        form="home_concept"
        name="title"
        label={fields.titleLabel}
        publicTag={messages.form.publicTag}
        hint={fields.titleHint}
        maxLength={NAME_MAX}
        state={state}
      />
      <VersionContent form="home_concept" state={state} />
      <VersionCollectionFields form="home_concept" state={state} terms={terms} />
      <FormActions
        submit={messages.newHomeConcept.submit}
        cancelHref={paths.brandPartner(brandPartnerId)}
      />
    </form>
  );
}

/** Versão nova, pré-preenchida com o conteúdo da versão mais recente. */
export function VersionForm({
  homeConceptId,
  idempotencyKey,
  initial,
  terms,
}: {
  readonly homeConceptId: string;
  readonly idempotencyKey: string;
  readonly initial: Readonly<Record<string, string>>;
  readonly terms: TermOptions;
}) {
  const [state, action] = useActionState(
    createVersionAction,
    initialFormState(idempotencyKey, initial),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_id" value={homeConceptId} />
      <VersionContent form="version" state={state} />
      <VersionCollectionFields form="version" state={state} terms={terms} />
      <FormActions
        submit={messages.newVersion.submit}
        cancelHref={paths.homeConcept(homeConceptId)}
      />
    </form>
  );
}

/** Aprovação de uma versão (`approve_home_concept_version`): as referências das aprovações registradas. */
export function ApprovalForm({
  homeConceptId,
  versionId,
  version,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly versionId: string;
  readonly version: number;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(approveVersionAction, initialFormState(idempotencyKey));
  const text = messages.approval;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_version_id" value={versionId} />
      <TextField
        form="approval"
        name="approval_refs"
        label={text.refsLabel}
        hint={text.refsHint}
        multiline
        maxLength={REFS_MAX}
        state={state}
      />
      <FormActions submit={text.submit(version)} cancelHref={paths.homeConcept(homeConceptId)} />
    </form>
  );
}

/** Autorização de exposição pública da marca (`authorize_brand_exposure`, BR-015). */
export function ExposureForm({
  brandPartnerId,
  idempotencyKey,
}: {
  readonly brandPartnerId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    authorizeBrandExposureAction,
    initialFormState(idempotencyKey),
  );
  const text = messages.exposure;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="brand_partner_id" value={brandPartnerId} />
      <TextField
        form="exposure"
        name="exposure_authorization_ref"
        label={text.refLabel}
        hint={text.refHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions submit={text.submit} cancelHref={paths.brandPartner(brandPartnerId)} />
    </form>
  );
}
