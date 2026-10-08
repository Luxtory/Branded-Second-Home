'use client';

import { useActionState } from 'react';
import { CROP_STEPS, type CatalogTermKind, type ReferenceValueBasis } from '../domain/collection';
import {
  approveConceptMediaAction,
  createCatalogTermAction,
  endReferenceValueAction,
  registerReferenceValueAction,
  setConceptCurationAction,
  updateCatalogTermAction,
  uploadConceptCoverAction,
  withdrawConceptMediaAction,
} from './collection-actions';
import {
  ChoiceField,
  DateTimeField,
  FileField,
  FormActions,
  FormAlert,
  GroupError,
  SelectField,
  TextField,
  type Option,
} from './fields';
import { initialFormState, type FormState } from './form-state';
import { collectionMessages } from './i18n/collection-pt-br';
import { messages } from './i18n/pt-br';
import { paths } from './paths';

const SUMMARY_MAX = 160;
const LABEL_MAX = 80;
const ALT_MAX = 300;
const CREDIT_MAX = 200;
const REF_MAX = 255;
const NUMBER_MAX = 9;
const AMOUNT_MAX = 24;
const RANK_DIGITS = 3;
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const YES = 'yes';
const NO = 'no';

const version = collectionMessages.versionFields;

/** Termos ativos de cada vocabulário, para as seleções da versão. */
export type TermOptions = Readonly<Record<CatalogTermKind, readonly Option[]>>;

const TERM_SLOTS: Readonly<Record<CatalogTermKind, number>> = {
  lifestyle: 3,
  architectural_style: 2,
};

function TermGroup({
  form,
  kind,
  state,
  options,
}: {
  readonly form: string;
  readonly kind: CatalogTermKind;
  readonly state: FormState;
  readonly options: readonly Option[];
}) {
  const legend = kind === 'lifestyle' ? version.lifestyleLegend : version.styleLegend;
  const hint = kind === 'lifestyle' ? version.lifestyleHint : version.styleHint;
  const errorId = `${form}-${kind}_ids`;
  return (
    <fieldset className="lx-choice-group" aria-describedby={`${errorId}-hint`}>
      <legend className="lx-label">{legend}</legend>
      <p className="lx-hint" id={`${errorId}-hint`}>
        {options.length === 0 ? version.noTerms : hint}
      </p>
      {options.length === 0 ? null : (
        <div className="lx-form__row">
          {Array.from({ length: TERM_SLOTS[kind] }, (_, index) => (
            <SelectField
              key={index}
              form={form}
              name={`${kind}_${index + 1}`}
              label={version.termLabel(index + 1)}
              optional
              placeholder={version.noTerm}
              options={options}
              state={state}
            />
          ))}
        </div>
      )}
      <GroupError id={errorId} state={state} name={`${kind}_ids`} />
    </fieldset>
  );
}

/** Classificação e atributos da Coleção na versão (spec catalog §13.12): todos opcionais. */
export function VersionCollectionFields({
  form,
  state,
  terms,
}: {
  readonly form: string;
  readonly state: FormState;
  readonly terms: TermOptions;
}) {
  const publicTag = messages.form.publicWithExposureTag;
  return (
    <div className="lx-form">
      <h2 className="lx-display-s" id={`${form}-collection`}>
        {version.collectionLegend}
      </h2>
      <p className="lx-hint">{version.collectionHint}</p>
      <TermGroup form={form} kind="lifestyle" state={state} options={terms.lifestyle} />
      <TermGroup
        form={form}
        kind="architectural_style"
        state={state}
        options={terms.architectural_style}
      />
      <TextField
        form={form}
        name="summary"
        label={version.summaryLabel}
        hint={version.summaryHint}
        publicTag={publicTag}
        optional
        maxLength={SUMMARY_MAX}
        state={state}
      />
      {(
        [
          ['guests_max', version.guestsLabel],
          ['suites', version.suitesLabel],
          ['built_area_m2', version.areaLabel],
        ] as const
      ).map(([name, label]) => (
        <TextField
          key={name}
          form={form}
          name={name}
          label={label}
          hint={version.numberHint}
          publicTag={publicTag}
          optional
          inputMode="numeric"
          maxLength={NUMBER_MAX}
          state={state}
        />
      ))}
    </div>
  );
}

const vocabulary = collectionMessages.vocabulary;

/** Termo novo (`create_catalog_term`). */
export function TermForm({ idempotencyKey }: { readonly idempotencyKey: string }) {
  const [state, action] = useActionState(createCatalogTermAction, initialFormState(idempotencyKey));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <ChoiceField
        form="term"
        name="kind"
        label={vocabulary.kindLabel}
        state={state}
        options={(['lifestyle', 'architectural_style'] as const).map((kind) => ({
          value: kind,
          label: vocabulary.kinds[kind],
          description: vocabulary.kindHints[kind],
        }))}
      />
      <TextField
        form="term"
        name="label"
        label={vocabulary.labelLabel}
        hint={vocabulary.labelHint}
        publicTag={messages.form.publicTag}
        maxLength={LABEL_MAX}
        state={state}
      />
      <FormActions submit={vocabulary.submit} cancelHref={paths.vocabulary()} />
    </form>
  );
}

/** Renomear ou desativar um termo (`update_catalog_term`). */
export function TermEditForm({
  termId,
  label,
  active,
  idempotencyKey,
}: {
  readonly termId: string;
  readonly label: string;
  readonly active: boolean;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    updateCatalogTermAction,
    initialFormState(idempotencyKey, { label, active: active ? YES : NO }),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="catalog_term_id" value={termId} />
      <TextField
        form="term-edit"
        name="label"
        label={vocabulary.labelLabel}
        publicTag={messages.form.publicTag}
        maxLength={LABEL_MAX}
        state={state}
      />
      <ChoiceField
        form="term-edit"
        name="active"
        label={vocabulary.activeLabel}
        state={state}
        options={[
          { value: YES, label: vocabulary.activeOption },
          { value: NO, label: vocabulary.inactiveOption },
        ]}
      />
      <FormActions submit={vocabulary.editSubmit} cancelHref={paths.vocabulary()} />
    </form>
  );
}

const cover = collectionMessages.cover;
const CENTER = String(CROP_STEPS[2]);

/** Envio da capa (`upload_concept_cover`): o servidor reencoda e grava pendente. */
export function CoverForm({
  conceptId,
  idempotencyKey,
}: {
  readonly conceptId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    uploadConceptCoverAction,
    initialFormState(idempotencyKey, { crop_x: CENTER, crop_y: CENTER }),
  );
  const crop = (labels: Readonly<Record<number, string>>) =>
    CROP_STEPS.map((step) => ({ value: String(step), label: labels[step] ?? String(step) }));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="concept_id" value={conceptId} />
      <FileField
        form="cover"
        name="image"
        label={cover.fileLabel}
        hint={cover.fileHint}
        accept={IMAGE_TYPES}
        state={state}
      />
      <TextField
        form="cover"
        name="alt"
        label={cover.altLabel}
        hint={cover.altHint}
        publicTag={messages.form.publicTag}
        maxLength={ALT_MAX}
        state={state}
      />
      <TextField
        form="cover"
        name="credit"
        label={cover.creditLabel}
        publicTag={messages.form.publicTag}
        optional
        maxLength={CREDIT_MAX}
        state={state}
      />
      <SelectField
        form="cover"
        name="crop_x"
        label={cover.cropXLabel}
        hint={cover.cropHint}
        placeholder={cover.cropXLabel}
        options={crop(cover.cropX)}
        state={state}
      />
      <SelectField
        form="cover"
        name="crop_y"
        label={cover.cropYLabel}
        placeholder={cover.cropYLabel}
        options={crop(cover.cropY)}
        state={state}
      />
      <FormActions submit={cover.submit} cancelHref={paths.concept(conceptId)} />
    </form>
  );
}

/** Aprovação da capa (`approve_concept_media`): só o id. */
export function MediaApprovalForm({
  conceptId,
  mediaId,
  idempotencyKey,
}: {
  readonly conceptId: string;
  readonly mediaId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    approveConceptMediaAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="concept_media_id" value={mediaId} />
      <FormActions submit={cover.approveSubmit} cancelHref={paths.concept(conceptId)} />
    </form>
  );
}

/** Retirada da capa (`withdraw_concept_media`), irreversível, com motivo. */
export function MediaWithdrawalForm({
  conceptId,
  mediaId,
  idempotencyKey,
}: {
  readonly conceptId: string;
  readonly mediaId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    withdrawConceptMediaAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="concept_media_id" value={mediaId} />
      <TextField
        form="withdrawal"
        name="withdrawal_basis"
        label={cover.basisLabel}
        hint={cover.basisHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions
        submit={cover.withdrawSubmit}
        cancelHref={paths.concept(conceptId)}
        tone="destructive"
      />
    </form>
  );
}

const curation = collectionMessages.curation;

/** Curadoria (`set_concept_curation`): posição e destaque, partindo dos valores atuais. */
export function CurationForm({
  conceptId,
  rank,
  featured,
  idempotencyKey,
}: {
  readonly conceptId: string;
  readonly rank: number | null;
  readonly featured: boolean;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    setConceptCurationAction,
    initialFormState(idempotencyKey, {
      rank: rank === null ? '' : String(rank),
      featured: featured ? YES : NO,
    }),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="concept_id" value={conceptId} />
      <TextField
        form="curation"
        name="rank"
        label={curation.rankLabel}
        hint={curation.rankHint}
        optional
        inputMode="numeric"
        maxLength={RANK_DIGITS}
        state={state}
      />
      <ChoiceField
        form="curation"
        name="featured"
        label={curation.featuredLabel}
        hint={curation.featuredHint}
        state={state}
        options={[
          { value: YES, label: curation.featured },
          { value: NO, label: curation.notFeatured },
        ]}
      />
      <FormActions submit={curation.submit} cancelHref={paths.concept(conceptId)} />
    </form>
  );
}

const values = collectionMessages.referenceValues;

/** Valor de referência (`register_edition_reference_value`): só as bases que a modalidade oferece. */
export function ReferenceValueForm({
  editionId,
  bases,
  idempotencyKey,
}: {
  readonly editionId: string;
  readonly bases: readonly ReferenceValueBasis[];
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    registerReferenceValueAction,
    initialFormState(idempotencyKey, bases.length === 1 ? { basis: bases[0] ?? '' } : {}),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="edition_id" value={editionId} />
      <ChoiceField
        form="value"
        name="basis"
        label={values.basisLabel}
        publicTag={messages.form.publicTag}
        state={state}
        options={bases.map((basis) => ({ value: basis, label: values.bases[basis] }))}
      />
      <TextField
        form="value"
        name="amount"
        label={values.amountLabel}
        hint={values.amountHint}
        publicTag={messages.form.publicTag}
        inputMode="decimal"
        maxLength={AMOUNT_MAX}
        state={state}
      />
      <DateTimeField
        form="value"
        name="valid_from"
        label={values.validFromLabel2}
        hint={values.validFromHint}
        optional
        state={state}
      />
      <FormActions submit={values.submit} cancelHref={paths.edition(editionId)} />
    </form>
  );
}

/** Encerramento do valor (`end_edition_reference_value`): agora, uma vez. */
export function EndReferenceValueForm({
  editionId,
  valueId,
  idempotencyKey,
}: {
  readonly editionId: string;
  readonly valueId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(endReferenceValueAction, initialFormState(idempotencyKey));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="edition_reference_value_id" value={valueId} />
      <FormActions
        submit={values.endSubmit}
        cancelHref={paths.edition(editionId)}
        tone="destructive"
      />
    </form>
  );
}
