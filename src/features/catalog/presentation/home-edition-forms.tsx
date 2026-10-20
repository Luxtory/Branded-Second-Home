'use client';

import { useActionState } from 'react';
import { CROP_STEPS, HOME_EDITION_MEDIA_KINDS } from '../domain/collection';
import {
  approveHomeEditionMediaAction,
  correctHomeEditionEditorialAction,
  createHomeEditionAction,
  finalizeHomeEditionAction,
  publishHomeEditionAction,
  updateHomeEditionDraftAction,
  uploadHomeEditionMediaAction,
  withdrawHomeEditionAction,
  withdrawHomeEditionMediaAction,
} from './home-edition-actions';
import { ChoiceField, FileField, FormActions, FormAlert, SelectField, TextField } from './fields';
import { initialFormState, type FormState } from './form-state';
import { collectionMessages } from './i18n/collection-pt-br';
import { messages } from './i18n/pt-br';
import { paths } from './paths';

const NAME_MAX = 200;
const TYPOLOGY_MAX = 200;
const SPATIAL_MAX = 4_000;
const LONG_MAX = 20_000;
const REF_MAX = 255;
const ALT_MAX = 300;
const CREDIT_MAX = 200;
const NUMBER_MAX = 9;
/** 50 itens de até 200 caracteres, um por linha. */
const LIST_TEXT_MAX = 50 * 201;
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const CENTER = String(CROP_STEPS[2]);

const fields = messages.homeEditionFields;

/** Definição material e textos editoriais (BR-031): mesmos campos na criação e na edição da preparação. */
function HomeEditionContentFields({
  form,
  state,
}: {
  readonly form: string;
  readonly state: FormState;
}) {
  const publicTag = messages.form.publicTag;
  return (
    <>
      <TextField
        form={form}
        name="name"
        label={fields.nameLabel}
        hint={fields.nameHint}
        publicTag={publicTag}
        maxLength={NAME_MAX}
        state={state}
      />
      <TextField
        form={form}
        name="description"
        label={fields.descriptionLabel}
        hint={fields.descriptionHint}
        publicTag={publicTag}
        multiline
        maxLength={LONG_MAX}
        state={state}
      />
      <TextField
        form={form}
        name="typology"
        label={fields.typologyLabel}
        hint={fields.typologyHint}
        publicTag={publicTag}
        maxLength={TYPOLOGY_MAX}
        state={state}
      />
      <TextField
        form={form}
        name="spatial_configuration"
        label={fields.spatialLabel}
        hint={fields.spatialHint}
        publicTag={publicTag}
        multiline
        maxLength={SPATIAL_MAX}
        state={state}
      />
      <div className="lx-form__row">
        {(
          [
            ['projected_area_m2', fields.areaLabel],
            ['suites', fields.suitesLabel],
            ['guests_max', fields.guestsLabel],
          ] as const
        ).map(([name, label]) => (
          <TextField
            key={name}
            form={form}
            name={name}
            label={label}
            hint={fields.numberHint}
            publicTag={publicTag}
            inputMode="numeric"
            maxLength={NUMBER_MAX}
            state={state}
          />
        ))}
      </div>
      {(
        [
          ['rooms', fields.roomsLabel],
          ['amenities', fields.amenitiesLabel],
          ['characteristics', fields.characteristicsLabel],
        ] as const
      ).map(([name, label]) => (
        <TextField
          key={name}
          form={form}
          name={name}
          label={label}
          hint={fields.listHint}
          publicTag={publicTag}
          optional
          multiline
          maxLength={LIST_TEXT_MAX}
          state={state}
        />
      ))}
    </>
  );
}

/** Home Edition nova de um Home Concept aprovado (`create_home_edition`, BR-031): nasce em preparação. */
export function NewHomeEditionForm({
  homeConceptId,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(createHomeEditionAction, initialFormState(idempotencyKey));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_id" value={homeConceptId} />
      <HomeEditionContentFields form="home_edition" state={state} />
      <FormActions
        submit={messages.newHomeEdition.submit}
        cancelHref={paths.homeConcept(homeConceptId)}
      />
    </form>
  );
}

/** Edição da preparação (`update_home_edition_draft`), partindo dos valores atuais. */
export function EditHomeEditionForm({
  homeEditionId,
  values,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly values: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    updateHomeEditionDraftAction,
    initialFormState(idempotencyKey, values),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_id" value={homeEditionId} />
      <HomeEditionContentFields form="home_edition_draft" state={state} />
      <FormActions
        submit={messages.editHomeEdition.submit}
        cancelHref={paths.homeEdition(homeEditionId)}
      />
    </form>
  );
}

type IdAction = (state: FormState, form: FormData) => Promise<FormState>;

/** Transição só com o id (finalizar, publicar): a confirmação vem da página. */
function HomeEditionTransitionForm({
  homeEditionId,
  idempotencyKey,
  action: run,
  submit,
}: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
  readonly action: IdAction;
  readonly submit: string;
}) {
  const [state, action] = useActionState(run, initialFormState(idempotencyKey));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_id" value={homeEditionId} />
      <FormActions submit={submit} cancelHref={paths.homeEdition(homeEditionId)} />
    </form>
  );
}

/** Finalização da definição material (`finalize_home_edition`, BR-036): uma vez, sem volta. */
export function FinalizeHomeEditionForm(props: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
}) {
  return (
    <HomeEditionTransitionForm
      {...props}
      action={finalizeHomeEditionAction}
      submit={messages.finalizeHomeEdition.submit}
    />
  );
}

/** Publicação (`publish_home_edition`): passa a aparecer no site. */
export function PublishHomeEditionForm(props: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
}) {
  return (
    <HomeEditionTransitionForm
      {...props}
      action={publishHomeEditionAction}
      submit={messages.publishHomeEdition.submit}
    />
  );
}

/** Retirada do público (`withdraw_home_edition`), com base; não reabre a definição material. */
export function WithdrawHomeEditionForm({
  homeEditionId,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    withdrawHomeEditionAction,
    initialFormState(idempotencyKey),
  );
  const text = messages.withdrawHomeEdition;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_id" value={homeEditionId} />
      <TextField
        form="home_edition_withdrawal"
        name="withdrawal_basis"
        label={text.basisLabel}
        hint={text.basisHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions
        submit={text.submit}
        cancelHref={paths.homeEdition(homeEditionId)}
        tone="destructive"
      />
    </form>
  );
}

/** Correção editorial (`correct_home_edition_editorial`): nome e/ou descrição, com base. */
export function EditorialCorrectionForm({
  homeEditionId,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    correctHomeEditionEditorialAction,
    initialFormState(idempotencyKey),
  );
  const text = messages.correctHomeEdition;
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_id" value={homeEditionId} />
      <TextField
        form="editorial"
        name="name"
        label={fields.nameLabel}
        hint={text.nameHint}
        publicTag={messages.form.publicTag}
        optional
        maxLength={NAME_MAX}
        state={state}
      />
      <TextField
        form="editorial"
        name="description"
        label={fields.descriptionLabel}
        hint={text.descriptionHint}
        publicTag={messages.form.publicTag}
        optional
        multiline
        maxLength={LONG_MAX}
        state={state}
      />
      <TextField
        form="editorial"
        name="correction_basis"
        label={text.basisLabel}
        hint={text.basisHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions submit={text.submit} cancelHref={paths.homeEdition(homeEditionId)} />
    </form>
  );
}

const media = collectionMessages.homeEditionMedia;

/** Envio de mídia (`upload_home_edition_media`): o servidor reencoda e grava pendente. */
export function HomeEditionMediaForm({
  homeEditionId,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    uploadHomeEditionMediaAction,
    initialFormState(idempotencyKey, { crop_x: CENTER, crop_y: CENTER }),
  );
  const crop = (labels: Readonly<Record<number, string>>) =>
    CROP_STEPS.map((step) => ({ value: String(step), label: labels[step] ?? String(step) }));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_id" value={homeEditionId} />
      <ChoiceField
        form="home_edition_media"
        name="kind"
        label={media.kindLabel}
        state={state}
        options={HOME_EDITION_MEDIA_KINDS.map((kind) => ({
          value: kind,
          label: media.kinds[kind],
          description: media.kindHints[kind],
        }))}
      />
      <FileField
        form="home_edition_media"
        name="image"
        label={media.fileLabel}
        hint={media.fileHint}
        accept={IMAGE_TYPES}
        state={state}
      />
      <TextField
        form="home_edition_media"
        name="alt"
        label={media.altLabel}
        hint={media.altHint}
        publicTag={messages.form.publicTag}
        maxLength={ALT_MAX}
        state={state}
      />
      <TextField
        form="home_edition_media"
        name="credit"
        label={media.creditLabel}
        publicTag={messages.form.publicTag}
        optional
        maxLength={CREDIT_MAX}
        state={state}
      />
      <SelectField
        form="home_edition_media"
        name="crop_x"
        label={media.cropXLabel}
        hint={media.cropHint}
        placeholder={media.cropXLabel}
        options={crop(media.cropX)}
        state={state}
      />
      <SelectField
        form="home_edition_media"
        name="crop_y"
        label={media.cropYLabel}
        placeholder={media.cropYLabel}
        options={crop(media.cropY)}
        state={state}
      />
      <FormActions submit={media.submit} cancelHref={paths.homeEdition(homeEditionId)} />
    </form>
  );
}

/** Aprovação da mídia (`approve_home_edition_media`): só o id. */
export function HomeEditionMediaApprovalForm({
  homeEditionId,
  mediaId,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly mediaId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    approveHomeEditionMediaAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_media_id" value={mediaId} />
      <FormActions submit={media.approveSubmit} cancelHref={paths.homeEdition(homeEditionId)} />
    </form>
  );
}

/** Retirada da mídia (`withdraw_home_edition_media`), irreversível, com motivo. */
export function HomeEditionMediaWithdrawalForm({
  homeEditionId,
  mediaId,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly mediaId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    withdrawHomeEditionMediaAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_media_id" value={mediaId} />
      <TextField
        form="home_edition_media_withdrawal"
        name="withdrawal_basis"
        label={media.basisLabel}
        hint={media.basisHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions
        submit={media.withdrawSubmit}
        cancelHref={paths.homeEdition(homeEditionId)}
        tone="destructive"
      />
    </form>
  );
}
