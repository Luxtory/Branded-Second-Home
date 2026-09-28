'use client';

import { useActionState } from 'react';
import {
  approveVersionAction,
  authorizeBrandExposureAction,
  createVersionAction,
  registerConceptAction,
} from './actions';
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
        hint={fields.specificationHint}
        multiline
        maxLength={LONG_MAX}
        state={state}
      />
    </>
  );
}

/** Concept novo com a versão 1 (`create_concept_version`). */
export function ConceptForm({
  brandPartnerId,
  idempotencyKey,
}: {
  readonly brandPartnerId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(registerConceptAction, initialFormState(idempotencyKey));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="brand_partner_id" value={brandPartnerId} />
      <TextField
        form="concept"
        name="title"
        label={fields.titleLabel}
        hint={fields.titleHint}
        maxLength={NAME_MAX}
        state={state}
      />
      <VersionContent form="concept" state={state} />
      <FormActions
        submit={messages.newConcept.submit}
        cancelHref={paths.brandPartner(brandPartnerId)}
      />
    </form>
  );
}

/** Versão nova, pré-preenchida com o conteúdo da versão mais recente. */
export function VersionForm({
  conceptId,
  idempotencyKey,
  initial,
}: {
  readonly conceptId: string;
  readonly idempotencyKey: string;
  readonly initial: Readonly<Record<string, string>>;
}) {
  const [state, action] = useActionState(
    createVersionAction,
    initialFormState(idempotencyKey, initial),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="concept_id" value={conceptId} />
      <VersionContent form="version" state={state} />
      <FormActions submit={messages.newVersion.submit} cancelHref={paths.concept(conceptId)} />
    </form>
  );
}

/** Aprovação de uma versão (`approve_concept_version`): as referências das aprovações registradas. */
export function ApprovalForm({
  conceptId,
  versionId,
  version,
  idempotencyKey,
}: {
  readonly conceptId: string;
  readonly versionId: string;
  readonly version: number;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(approveVersionAction, initialFormState(idempotencyKey));
  const text = messages.approval;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="concept_version_id" value={versionId} />
      <TextField
        form="approval"
        name="approval_refs"
        label={text.refsLabel}
        hint={text.refsHint}
        multiline
        maxLength={REFS_MAX}
        state={state}
      />
      <FormActions submit={text.submit(version)} cancelHref={paths.concept(conceptId)} />
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
